import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  criarContaPagar,
  criarContaPagarDividida,
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
}).refine((d) => !d.segundoVencimento || d.segundoVencimento > d.vencimento, {
  message: "A segunda data do boleto precisa ser depois da primeira.",
});

contasPagarRouter.post("/", async (req, res) => {
  const validacao = criarContaPagarSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  const { segundoVencimento, ...dados } = validacao.data;
  if (segundoVencimento) {
    const contas = await criarContaPagarDividida({ ...dados, segundoVencimento, criadoPorId: req.usuario!.id });
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
