import { clientesDuplicados, mensagemDuplicidade, temDuplicidade } from "../../shared/duplicidade";
import { somentePapel } from "../../middlewares/permissoes";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import {
  atualizarCliente,
  buscarClientes,
  criarCliente,
  historicoFinanceiroCliente,
  inativarCliente,
  obterCliente,
} from "./clientes.service";

export const clientesRouter = Router();

// Todo o módulo exige apenas autenticação — funcionário pode consultar e cadastrar
// clientes (seção 2), mas não inativar (restrito a ADMINISTRATIVO, tratado abaixo).
clientesRouter.use(autenticar);

const clienteSchema = z.object({
  tipo: z.enum(["PESSOA_FISICA", "EMPRESA", "EVENTO"]),
  nome: z.string().min(2, "Informe o nome do cliente."),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  documento: z.string().optional(),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  endereco: z.string().optional(),
  limiteCredito: z.number().nonnegative().optional(),
  prazoPadraoDias: z.number().int().nonnegative().optional(),
  formaPagamentoPadrao: z.string().optional(),
  observacoes: z.string().optional(),
});

// GET /clientes?busca=termo — busca rápida por nome, documento ou telefone
clientesRouter.get("/", async (req, res) => {
  const termo = (req.query.busca as string) || "";
  const clientes = await buscarClientes(termo);
  return res.json(clientes);
});

// Verificação de duplicados enquanto digita (CPF/CNPJ, telefone, nome)
clientesRouter.get("/duplicados", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  return res.json(await clientesDuplicados({ nome: q.nome, documento: q.documento, telefone: q.telefone, whatsapp: q.whatsapp, ignorarId: q.ignorarId }));
});

clientesRouter.get("/:id", async (req, res) => {
  const cliente = await obterCliente(req.params.id);
  if (!cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado." });
  }
  return res.json(cliente);
});

// GET /clientes/:id/historico — página de histórico financeiro do cliente
clientesRouter.get("/:id/historico", async (req, res) => {
  const historico = await historicoFinanceiroCliente(req.params.id);
  if (!historico) {
    return res.status(404).json({ erro: "Cliente não encontrado." });
  }
  return res.json(historico);
});

clientesRouter.post("/", async (req, res) => {
  const validacao = clienteSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  // Mesmo CPF/CNPJ: bloqueia. Mesmo telefone ou nome: avisa e só salva se confirmar.
  const duplicados = await clientesDuplicados(validacao.data);
  if (duplicados.bloqueio.length || (duplicados.aviso.length && req.body?.ignorarAviso !== true)) {
    return res.status(409).json({ erro: mensagemDuplicidade("um cliente", duplicados), duplicados, podeContinuar: duplicados.bloqueio.length === 0 });
  }

  const cliente = await criarCliente({
    ...validacao.data,
    criadoPorId: req.usuario!.id,
  });

  return res.status(201).json(cliente);
});

clientesRouter.put("/:id", async (req, res) => {
  const validacao = clienteSchema.partial().safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  const duplicados = await clientesDuplicados({ ...validacao.data, ignorarId: req.params.id });
  if (duplicados.bloqueio.length || (duplicados.aviso.length && req.body?.ignorarAviso !== true)) {
    return res.status(409).json({ erro: mensagemDuplicidade("outro cliente", duplicados), duplicados, podeContinuar: duplicados.bloqueio.length === 0 });
  }

  const cliente = await atualizarCliente(req.params.id, {
    ...validacao.data,
    atualizadoPorId: req.usuario!.id,
  });

  return res.json(cliente);
});

clientesRouter.patch("/:id/inativar", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  // Inativar cliente é uma ação administrativa — funcionário só cadastra/consulta
  if (req.usuario!.papel !== "ADMINISTRATIVO") {
    return res.status(403).json({ erro: "Apenas o administrativo pode inativar clientes." });
  }

  const cliente = await inativarCliente(req.params.id, req.usuario!.id);
  return res.json(cliente);
});

/**
 * Excluir cliente.
 * Sem comandas nem contas: apaga o cadastro.
 * Com histórico: tira da lista (inativa), para não perder as comandas e o financeiro dele.
 */
clientesRouter.delete("/:id", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { pedidos: true, contasReceber: true } } },
  });
  if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado." });

  const contasAbertas = await prisma.contaReceber.count({
    where: { clienteId: cliente.id, status: { in: ["PENDENTE", "PARCIAL", "VENCIDO"] } },
  });
  if (contasAbertas > 0) {
    return res.status(400).json({
      erro: `Este cliente ainda deve ${contasAbertas} conta(s) a prazo. Receba ou ajuste em Contas a Receber antes de excluir.`,
    });
  }

  const temHistorico = cliente._count.pedidos > 0 || cliente._count.contasReceber > 0;
  if (temHistorico) {
    await prisma.cliente.update({ where: { id: cliente.id }, data: { status: "INATIVO" } });
  } else {
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  await registrarLog({
    usuarioId: req.usuario!.id,
    acao: temHistorico ? "INATIVOU_CLIENTE" : "EXCLUIU_CLIENTE",
    entidade: "cliente",
    entidadeId: cliente.id,
    detalhes: temHistorico
      ? `Excluiu da lista o cliente ${cliente.nome} (mantido o histórico de ${cliente._count.pedidos} comanda(s))`
      : `Excluiu o cliente ${cliente.nome}`,
  });

  return res.json({ excluido: !temHistorico, inativado: temHistorico, comandas: cliente._count.pedidos });
});
