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

  const cliente = await atualizarCliente(req.params.id, {
    ...validacao.data,
    atualizadoPorId: req.usuario!.id,
  });

  return res.json(cliente);
});

clientesRouter.patch("/:id/inativar", async (req, res) => {
  // Inativar cliente é uma ação administrativa — funcionário só cadastra/consulta
  if (req.usuario!.papel !== "ADMINISTRATIVO") {
    return res.status(403).json({ erro: "Apenas o administrativo pode inativar clientes." });
  }

  const cliente = await inativarCliente(req.params.id, req.usuario!.id);
  return res.json(cliente);
});
