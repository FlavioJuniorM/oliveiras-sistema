import { contasDuplicadas, digitos, mensagemDuplicidade } from "../../shared/duplicidade";
import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  criarContaPagar,
  criarContaPagarDividida,
  alterarContaPagar,
  excluirContaPagar,
  excluirLancamentoContaPagar,
  ErroContaPagar,
  listarContasPagar,
  pagarContaPagar,
} from "./contasPagar.service";

export const contasPagarRouter = Router();

// Contas a pagar é módulo 100% administrativo (seção 2 e 10)
contasPagarRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

contasPagarRouter.get("/", async (req, res) => {
  const contas = await listarContasPagar({
    status: req.query.status as any,
    categoria: req.query.categoria as string | undefined,
  });
  return res.json(contas);
});

const CATEGORIAS_CONTA = [
  "Fornecedores",
  "Energia",
  "Água",
  "Aluguel",
  "Funcionários",
  "Impostos",
  "Manutenção",
  "Outros",
] as const;

const codigoBarrasSchema = z
  .string()
  .max(80)
  .nullable()
  .optional()
  .transform((v) => digitos(v) || null)
  .refine((v) => !v || (v.length >= 10 && v.length <= 60), { message: "Código de barras inválido: confira os números do boleto." });

const criarContaPagarSchema = z.object({
  fornecedor: z.string().min(2),
  descricao: z.string().min(2),
  categoria: z.enum([
    "Fornecedores",
    "Energia",
    "Água",
    "Aluguel",
    "Funcionários",
    "Impostos",
    "Manutenção",
    "Outros",
  ]),
  valor: z.number().positive(),
  dataLancamento: z.coerce.date(),
  vencimento: z.coerce.date(),
  // Boleto dividido em dois: o valor é repartido ao meio entre as duas datas
  segundoVencimento: z.coerce.date().optional(),
  observacoes: z.string().optional(),
  // Código de barras / linha digitável (opcional) — só os números são guardados
  codigoBarras: codigoBarrasSchema,
  codigoBarras2: codigoBarrasSchema,
}).refine((d) => !d.segundoVencimento || d.segundoVencimento > d.vencimento, {
  message: "A segunda data do boleto precisa ser depois da primeira.",
});

// Verificação de duplicados enquanto digita
contasPagarRouter.get("/duplicadas", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const vencimento = q.vencimento ? new Date(`${q.vencimento}T00:00:00Z`) : undefined;
  return res.json(
    await contasDuplicadas({
      codigosBarras: [q.codigoBarras, q.codigoBarras2],
      fornecedor: q.fornecedor,
      valor: q.valor ? Number(q.valor) : undefined,
      vencimento,
      ignorarId: q.ignorarId,
    })
  );
});

contasPagarRouter.post("/", async (req, res) => {
  const validacao = criarContaPagarSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  const { segundoVencimento, codigoBarras2, ...dados } = validacao.data;

  // Mesmo código de barras: bloqueia. Mesmo fornecedor + valor + vencimento: avisa e pede confirmação.
  const codigos = [dados.codigoBarras, segundoVencimento ? codigoBarras2 : null];
  if (codigos[0] && codigos[0] === codigos[1]) {
    return res.status(400).json({ erro: "Os dois boletos estão com o mesmo código de barras." });
  }
  const duplicados = await contasDuplicadas({
    codigosBarras: codigos,
    ...(segundoVencimento ? {} : { fornecedor: dados.fornecedor, valor: dados.valor, vencimento: dados.vencimento }),
  });
  if (duplicados.bloqueio.length || (duplicados.aviso.length && req.body?.ignorarAviso !== true)) {
    return res.status(409).json({ erro: mensagemDuplicidade("uma conta", duplicados), duplicados, podeContinuar: duplicados.bloqueio.length === 0 });
  }

  if (segundoVencimento) {
    const contas = await criarContaPagarDividida({ ...dados, segundoVencimento, codigoBarras2, criadoPorId: req.usuario!.id });
    return res.status(201).json(contas);
  }

  const conta = await criarContaPagar({ ...dados, criadoPorId: req.usuario!.id });
  return res.status(201).json(conta);
});

const pagarSchema = z.object({
  valorPago: z.number().positive(),
  formaPagamento: z.string().min(1),
});

contasPagarRouter.patch("/:id/pagar", async (req, res) => {
  const validacao = pagarSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const conta = await pagarContaPagar(
      req.params.id,
      validacao.data.valorPago,
      validacao.data.formaPagamento,
      req.usuario!.id
    );
    return res.json(conta);
  } catch (erro) {
    if (erro instanceof ErroContaPagar) return res.status(400).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao registrar pagamento." });
  }
});

contasPagarRouter.patch("/:id/cancelar", async (req, res) => {
  const conta = await excluirLancamentoContaPagar(req.params.id, req.usuario!.id);
  return res.json(conta);
});

const alterarContaPagarSchema = z.object({
  fornecedor: z.string().min(2),
  descricao: z.string().min(2),
  categoria: z.enum(CATEGORIAS_CONTA),
  valor: z.number().positive(),
  dataLancamento: z.coerce.date(),
  vencimento: z.coerce.date(),
  observacoes: z.string().nullable().optional(),
  codigoBarras: codigoBarrasSchema,
});

contasPagarRouter.put("/:id", async (req, res) => {
  const validacao = alterarContaPagarSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }
  const duplicados = await contasDuplicadas({
    codigosBarras: [validacao.data.codigoBarras],
    fornecedor: validacao.data.fornecedor,
    valor: validacao.data.valor,
    vencimento: validacao.data.vencimento,
    ignorarId: req.params.id,
  });
  if (duplicados.bloqueio.length || (duplicados.aviso.length && req.body?.ignorarAviso !== true)) {
    return res.status(409).json({ erro: mensagemDuplicidade("outra conta", duplicados), duplicados, podeContinuar: duplicados.bloqueio.length === 0 });
  }

  try {
    const conta = await alterarContaPagar(req.params.id, validacao.data, req.usuario!.id);
    return res.json(conta);
  } catch (erro) {
    if (erro instanceof ErroContaPagar) return res.status(400).json({ erro: erro.message });
    if ((erro as { code?: string })?.code === "P2002") {
      return res.status(409).json({ erro: "Este funcionário já tem um salário lançado nessa data." });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao alterar a conta." });
  }
});

contasPagarRouter.delete("/:id", async (req, res) => {
  try {
    await excluirContaPagar(req.params.id, req.usuario!.id);
    return res.status(204).end();
  } catch (erro) {
    if (erro instanceof ErroContaPagar) return res.status(400).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao excluir a conta." });
  }
});
