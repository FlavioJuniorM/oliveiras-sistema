import { fornecedoresDuplicados, mensagemDuplicidade, temDuplicidade } from "../../shared/duplicidade";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { registrarLog } from "../../shared/registrarLog";

/** Fornecedores usados no dia a dia, puxados ao lançar Contas a Pagar. */
export const fornecedoresRouter = Router();
fornecedoresRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const CATEGORIAS = ["Fornecedores", "Energia", "Água", "Aluguel", "Funcionários", "Impostos", "Manutenção", "Outros"] as const;

const textoOpcional = z
  .string()
  .max(200)
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const fornecedorSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do fornecedor.").max(120),
  documento: textoOpcional,
  telefone: textoOpcional,
  contato: textoOpcional,
  categoriaPadrao: z.enum(CATEGORIAS).default("Fornecedores"),
  observacoes: z.string().max(500).nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
});

function nomeDuplicado(erro: unknown) {
  return (erro as { code?: string })?.code === "P2002";
}

// GET /fornecedores?busca=frig&todos=1
fornecedoresRouter.get("/", async (req, res) => {
  const busca = typeof req.query.busca === "string" ? req.query.busca.trim() : "";
  const todos = req.query.todos === "1";
  const fornecedores = await prisma.fornecedor.findMany({
    where: {
      ...(todos ? {} : { status: "ATIVO" }),
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: "insensitive" } },
              { documento: { contains: busca } },
              { contato: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { nome: "asc" },
    take: 500,
  });

  // Quantas contas cada um tem lançadas (pelo nome gravado na conta)
  const contagens = await prisma.contaPagar.groupBy({ by: ["fornecedor"], _count: { _all: true } });
  const porNome = new Map(contagens.map((c) => [c.fornecedor.trim().toLowerCase(), c._count._all]));

  return res.json(fornecedores.map((f) => ({ ...f, quantidadeContas: porNome.get(f.nome.toLowerCase()) ?? 0 })));
});

// Verificação de duplicados enquanto digita (nome ou CNPJ/CPF)
fornecedoresRouter.get("/duplicados", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  return res.json(await fornecedoresDuplicados({ nome: q.nome, documento: q.documento, ignorarId: q.ignorarId }));
});

fornecedoresRouter.post("/", async (req, res) => {
  const validacao = fornecedorSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });

  // Evita "Frigorífico X", "frigorifico x" ou o mesmo CNPJ como dois cadastros
  const duplicados = await fornecedoresDuplicados(validacao.data);
  if (temDuplicidade(duplicados)) {
    const existente = await prisma.fornecedor.findUnique({ where: { id: duplicados.bloqueio[0].id } });
    return res.status(409).json({ erro: mensagemDuplicidade("um fornecedor", duplicados), duplicados, podeContinuar: false, fornecedor: existente });
  }

  try {
    const fornecedor = await prisma.fornecedor.create({ data: validacao.data });
    await registrarLog({
      usuarioId: req.usuario!.id,
      acao: "CADASTROU_FORNECEDOR",
      entidade: "fornecedor",
      entidadeId: fornecedor.id,
      detalhes: `Cadastrou o fornecedor ${fornecedor.nome}`,
    });
    return res.status(201).json(fornecedor);
  } catch (erro) {
    if (nomeDuplicado(erro)) return res.status(409).json({ erro: "Já existe um fornecedor com esse nome." });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao cadastrar o fornecedor." });
  }
});

fornecedoresRouter.put("/:id", async (req, res) => {
  const validacao = fornecedorSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });

  const atual = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
  if (!atual) return res.status(404).json({ erro: "Fornecedor não encontrado." });

  const duplicados = await fornecedoresDuplicados({ ...validacao.data, ignorarId: atual.id });
  if (temDuplicidade(duplicados)) {
    return res.status(409).json({ erro: mensagemDuplicidade("outro fornecedor", duplicados), duplicados, podeContinuar: false });
  }

  try {
    const fornecedor = await prisma.$transaction(async (tx) => {
      const alterado = await tx.fornecedor.update({ where: { id: atual.id }, data: validacao.data });
      // Renomeou: as contas lançadas com o nome antigo passam a usar o novo
      if (alterado.nome !== atual.nome) {
        await tx.contaPagar.updateMany({ where: { fornecedor: atual.nome }, data: { fornecedor: alterado.nome } });
      }
      return alterado;
    });
    await registrarLog({
      usuarioId: req.usuario!.id,
      acao: "ALTEROU_FORNECEDOR",
      entidade: "fornecedor",
      entidadeId: atual.id,
      detalhes: atual.nome === fornecedor.nome ? `Alterou o fornecedor ${fornecedor.nome}` : `Renomeou o fornecedor ${atual.nome} para ${fornecedor.nome}`,
    });
    return res.json(fornecedor);
  } catch (erro) {
    if (nomeDuplicado(erro)) return res.status(409).json({ erro: "Já existe um fornecedor com esse nome." });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao alterar o fornecedor." });
  }
});

// Excluir só tira o cadastro; as contas a pagar já lançadas continuam com o nome.
fornecedoresRouter.delete("/:id", async (req, res) => {
  const atual = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
  if (!atual) return res.status(404).json({ erro: "Fornecedor não encontrado." });
  await prisma.fornecedor.delete({ where: { id: atual.id } });
  await registrarLog({
    usuarioId: req.usuario!.id,
    acao: "EXCLUIU_FORNECEDOR",
    entidade: "fornecedor",
    entidadeId: atual.id,
    detalhes: `Excluiu o cadastro do fornecedor ${atual.nome}`,
  });
  return res.status(204).end();
});
