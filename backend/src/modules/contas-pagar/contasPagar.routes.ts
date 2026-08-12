import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  criarContaPagar,
  excluirLancamentoContaPagar,
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
  observacoes: z.string().optional(),
});

contasPagarRouter.post("/", async (req, res) => {
  const validacao = criarContaPagarSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  const conta = await criarContaPagar({
    ...validacao.data,
    criadoPorId: req.usuario!.id,
  });
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

  const conta = await pagarContaPagar(
    req.params.id,
    validacao.data.valorPago,
    validacao.data.formaPagamento,
    req.usuario!.id
  );
  return res.json(conta);
});

contasPagarRouter.patch("/:id/cancelar", async (req, res) => {
  const conta = await excluirLancamentoContaPagar(req.params.id, req.usuario!.id);
  return res.json(conta);
});
