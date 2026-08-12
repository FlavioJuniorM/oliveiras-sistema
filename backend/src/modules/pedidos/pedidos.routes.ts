import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  cancelarPedido,
  criarPedido,
  ErroPedido,
  listarPedidos,
  obterPedido,
  registrarPagamento,
  atualizarStatusOperacaoPedido,
  atualizarPreparoItem,
} from "./pedidos.service";

export const pedidosRouter = Router();

pedidosRouter.use(autenticar);

const formaPagamentoImediata = z.enum([
  "DINHEIRO",
  "PIX",
  "CARTAO_DEBITO",
  "CARTAO_CREDITO",
  "TRANSFERENCIA",
  "BOLETO",
  "OUTROS",
]);

const criarPedidoSchema = z.object({
  clienteId: z.string().uuid().optional(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().uuid(),
        pesoOuQtd: z.number().positive(),
      })
    )
    .min(1, "O pedido precisa de ao menos um item."),
  desconto: z.number().nonnegative().optional(),
  pagamentos: z
    .array(z.object({ forma: formaPagamentoImediata, valor: z.number().positive() }))
    .default([]),
  valorAPrazo: z.number().nonnegative().optional(),
  vencimento: z.coerce.date().optional(),
});

// Fluxo principal do funcionário (seção 15): criar pedido já calculado e finalizado
pedidosRouter.post("/", async (req, res) => {
  const validacao = criarPedidoSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const pedido = await criarPedido({
      ...validacao.data,
      usuarioId: req.usuario!.id,
      papelUsuario: req.usuario!.papel,
    });
    return res.status(201).json(pedido);
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao criar o pedido." });
  }
});

pedidosRouter.get("/", async (req, res) => {
  const pedidos = await listarPedidos({
    status: req.query.status as string | undefined,
    clienteId: req.query.clienteId as string | undefined,
  });
  return res.json(pedidos);
});

pedidosRouter.get("/:id", async (req, res) => {
  const pedido = await obterPedido(req.params.id);
  if (!pedido) {
    return res.status(404).json({ erro: "Pedido não encontrado." });
  }
  return res.json(pedido);
});

const statusOperacaoSchema = z.enum([
  "RECEBIDO",
  "EM_PREPARO",
  "EXPEDICAO",
  "PRONTO",
  "EM_ENTREGA",
  "ENTREGUE",
]);

const preparoItemSchema = z.object({
  statusPreparo: z.enum(["PENDENTE", "EM_CORTE", "CORTADO"]),
  pesoReal: z.number().positive().optional(),
});

pedidosRouter.patch("/:id/itens/:itemId/preparo", async (req, res) => {
  const validacao = preparoItemSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const pedido = await atualizarPreparoItem(
      req.params.id,
      req.params.itemId,
      validacao.data,
      req.usuario!.id
    );
    return res.json(pedido);
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao atualizar o corte." });
  }
});

pedidosRouter.patch("/:id/status-operacao", async (req, res) => {
  const validacao = statusOperacaoSchema.safeParse(req.body.statusOperacao);
  if (!validacao.success) {
    return res.status(400).json({ erro: "Status operacional inválido." });
  }

  try {
    const pedido = await atualizarStatusOperacaoPedido(
      req.params.id,
      validacao.data,
      req.usuario!.id
    );
    return res.json(pedido);
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao atualizar o pedido." });
  }
});

const pagamentoSchema = z.object({
  forma: formaPagamentoImediata,
  valor: z.number().positive(),
});

// Quitação total ou parcial posterior de um pedido a prazo (módulo Contas a Receber)
pedidosRouter.post("/:id/pagamentos", async (req, res) => {
  const validacao = pagamentoSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const pedido = await registrarPagamento(req.params.id, validacao.data, req.usuario!.id);
    return res.json(pedido);
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao registrar pagamento." });
  }
});

// Cancelar pedido é exclusivo do administrativo (regra 2 da especificação)
pedidosRouter.patch("/:id/cancelar", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  try {
    const pedido = await cancelarPedido(req.params.id, req.usuario!.id);
    return res.json(pedido);
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao cancelar o pedido." });
  }
});
