import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  alterarFuncionario,
  criarFuncionario,
  ErroFuncionario,
  excluirFuncionario,
  listarFuncionarios,
} from "./funcionarios.service";
import { excluirDesconto, folhaDoSabado, historicoDoFuncionario, lancarDesconto, listarDescontos } from "./descontos.service";

export const funcionariosRouter = Router();
funcionariosRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const texto = z.string().max(300).nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

const funcionarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do funcionário."),
  funcao: texto,
  telefone: texto,
  endereco: texto,
  cpf: texto,
  rg: texto,
  dataNascimento: data,
  dataAdmissao: data,
  registrado: z.boolean(),
  salario: z.number().positive("Informe o valor pago no sábado."),
  chavePix: texto,
  observacoes: z.string().max(1000).nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  inicioPagamentos: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o primeiro sábado de pagamento.")
    .transform((v) => new Date(`${v}T00:00:00Z`)),
});

funcionariosRouter.get("/", async (_req, res) => {
  try {
    return res.json(await listarFuncionarios());
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao listar funcionários." });
  }
});

funcionariosRouter.post("/", async (req, res) => {
  const validacao = funcionarioSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.status(201).json(await criarFuncionario(validacao.data, req.usuario!.id));
  } catch (erro) {
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao cadastrar o funcionário." });
  }
});

funcionariosRouter.put("/:id", async (req, res) => {
  const validacao = funcionarioSchema.extend({ status: z.enum(["ATIVO", "INATIVO"]) }).safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.json(await alterarFuncionario(req.params.id, validacao.data, req.usuario!.id));
  } catch (erro) {
    if (erro instanceof ErroFuncionario) return res.status(404).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao salvar o funcionário." });
  }
});

funcionariosRouter.delete("/:id", async (req, res) => {
  try {
    return res.json(await excluirFuncionario(req.params.id, req.usuario!.id));
  } catch (erro) {
    if (erro instanceof ErroFuncionario) return res.status(404).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao salvar o funcionário." });
  }
});

// ───────────── Descontos (adiantamento, vale, carne...) e folha de pagamento ─────────────

const descontoSchema = z.object({
  tipo: z.enum(["ADIANTAMENTO", "VALE", "CARNE", "OUTRO"]),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o dia em que pegou.").transform((v) => new Date(`${v}T00:00:00Z`)),
  valor: z.number().positive("Informe o valor do desconto.").max(100000),
  descricao: z.string().max(300).nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
});

function tratarErro(res: import("express").Response, erro: unknown, mensagem: string) {
  if (erro instanceof ErroFuncionario) return res.status(400).json({ erro: erro.message });
  console.error(erro);
  return res.status(500).json({ erro: mensagem });
}

// GET /funcionarios/folha?sabado=2026-11-21[&funcionarioId=...]
funcionariosRouter.get("/folha", async (req, res) => {
  const sabado = String(req.query.sabado ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sabado)) return res.status(400).json({ erro: "Informe o sábado." });
  try {
    const funcionarioId = typeof req.query.funcionarioId === "string" && req.query.funcionarioId ? req.query.funcionarioId : undefined;
    return res.json(await folhaDoSabado(new Date(`${sabado}T00:00:00Z`), funcionarioId));
  } catch (erro) {
    return tratarErro(res, erro, "Erro interno ao montar a folha de pagamento.");
  }
});

funcionariosRouter.get("/:id/descontos", async (req, res) => {
  try {
    return res.json(await listarDescontos(req.params.id));
  } catch (erro) {
    return tratarErro(res, erro, "Erro interno ao listar os descontos.");
  }
});

funcionariosRouter.post("/:id/descontos", async (req, res) => {
  const validacao = descontoSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.status(201).json(await lancarDesconto(req.params.id, validacao.data, req.usuario!.id));
  } catch (erro) {
    return tratarErro(res, erro, "Erro interno ao lançar o desconto.");
  }
});

funcionariosRouter.delete("/descontos/:descontoId", async (req, res) => {
  try {
    await excluirDesconto(req.params.descontoId, req.usuario!.id);
    return res.status(204).end();
  } catch (erro) {
    return tratarErro(res, erro, "Erro interno ao excluir o desconto.");
  }
});

funcionariosRouter.get("/:id/historico", async (req, res) => {
  try {
    return res.json(await historicoDoFuncionario(req.params.id));
  } catch (erro) {
    return tratarErro(res, erro, "Erro interno ao carregar o histórico.");
  }
});
