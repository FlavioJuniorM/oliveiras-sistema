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
  finalizarConferenciaPedido,
  adicionarItemPedido,
  alterarItemPedido,
  alterarPrecoItemPedido,
  alterarPagamentoEEntrega,
  removerItemPedido,
  listarPainelDoDia,
  listarAgendados,
  listarAReceber,
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
        unidadePedido: z.enum(["kg", "g", "peca", "unidade", "outra"]).optional(),
        observacao: z.string().max(200).optional(),
      })
    )
    .min(1, "O pedido precisa de ao menos um item."),
  desconto: z.number().nonnegative().optional(),
  pagamentos: z
    .array(z.object({ forma: formaPagamentoImediata, valor: z.number().positive() }))
    .default([]),
  valorAPrazo: z.number().nonnegative().optional(),
  vencimento: z.coerce.date().optional(),
  dataAgendada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pedido inválida.").optional(),
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

// Painel "Pedidos do Dia" (hoje = do dia + em aberto de dias anteriores)
pedidosRouter.get("/painel", async (req, res) => {
  return res.json(await listarPainelDoDia(typeof req.query.data === "string" ? req.query.data : undefined));
});

// Encomendas para os próximos dias (quantas por data)
pedidosRouter.get("/agendados", async (_req, res) => {
  return res.json(await listarAgendados());
});

// Contas a receber: só vendas a prazo com saldo em aberto
pedidosRouter.get("/a-receber", somentePapel("ADMINISTRATIVO"), async (_req, res) => {
  return res.json(await listarAReceber());
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
  "AGUARDANDO_RETIRADA",
  "EM_ENTREGA",
  "ENTREGUE",
]);

const saidaPedidoSchema = z.object({
  enderecoEntrega: z.string().max(300).optional(),
  formaRecebida: z.enum(["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO"]).optional(),
});

const preparoItemSchema = z.object({
  statusPreparo: z.enum(["PENDENTE", "EM_CORTE", "CORTADO"]),
  pesoReal: z.number().positive().optional(),
});

const finalizacaoConferenciaSchema = z.object({
  formaPagamento: z.enum([
    "DINHEIRO",
    "PIX",
    "CARTAO_DEBITO",
    "CARTAO_CREDITO",
    "TRANSFERENCIA",
    "A_PRAZO",
    "NA_RETIRADA",
    "NA_ENTREGA",
    "NO_RECEBIMENTO",
  ]),
  vencimento: z.coerce.date().optional(),
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

// Corrigir comanda fechada: forma de pagamento (inclusive a prazo), cliente, retirada/entrega
const alterarComandaSchema = z.object({
  pagamento: z
    .discriminatedUnion("modo", [
      z.object({ modo: z.literal("PAGO"), forma: z.enum(["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO", "TRANSFERENCIA", "OUTROS"]) }),
      z.object({ modo: z.literal("A_PRAZO"), vencimento: z.coerce.date() }),
      z.object({ modo: z.literal("NO_RECEBIMENTO") }),
    ])
    .optional(),
  tipoEntrega: z.enum(["RETIRADA", "DELIVERY"]).optional(),
  enderecoEntrega: z.string().max(300).optional(),
  clienteId: z.string().uuid().optional(),
});

pedidosRouter.patch("/:id/alterar", async (req, res) => {
  const validacao = alterarComandaSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.json(await alterarPagamentoEEntrega(req.params.id, validacao.data, req.usuario!.id));
  } catch (erro) {
    if (erro instanceof ErroPedido) return res.status(400).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao alterar a comanda." });
  }
});

pedidosRouter.patch("/:id/status-operacao", async (req, res) => {
  const validacao = statusOperacaoSchema.safeParse(req.body.statusOperacao);
  if (!validacao.success) {
    return res.status(400).json({ erro: "Status operacional inválido." });
  }

  try {
    const opcoes = saidaPedidoSchema.safeParse(req.body);
    if (!opcoes.success) {
      return res.status(400).json({ erro: opcoes.error.issues[0].message });
    }
    const pedido = await atualizarStatusOperacaoPedido(
      req.params.id,
      validacao.data,
      req.usuario!.id,
      opcoes.data
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

pedidosRouter.post("/:id/finalizar-conferencia", async (req, res) => {
  const validacao = finalizacaoConferenciaSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const pedido = await finalizarConferenciaPedido(
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
    return res.status(500).json({ erro: "Erro interno ao finalizar a conferência." });
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
    const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim().slice(0, 200) : undefined;
    const pedido = await cancelarPedido(req.params.id, req.usuario!.id, motivo || undefined);
    return res.json(pedido);
  } catch (erro) {
    if (erro instanceof ErroPedido) {
      return res.status(400).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao cancelar o pedido." });
  }
});


// ---------------------------------------------------------------------------
// Edição da comanda antes do fechamento
// ---------------------------------------------------------------------------
const itemComandaSchema = z.object({
  produtoId: z.string().uuid(),
  pesoOuQtd: z.number().positive("Informe a quantidade."),
  unidadePedido: z.enum(["kg", "g", "peca", "unidade", "outra"]).optional(),
  observacao: z.string().max(200).optional(),
});

const alteracaoItemSchema = z.object({
  pesoOuQtd: z.number().positive("Informe a quantidade.").optional(),
  unidadePedido: z.enum(["kg", "g", "peca", "unidade", "outra"]).optional(),
  observacao: z.string().max(200).nullable().optional(),
});

function responderErroComanda(res: import("express").Response, erro: unknown) {
  if (erro instanceof ErroPedido) return res.status(400).json({ erro: erro.message });
  console.error(erro);
  return res.status(500).json({ erro: "Erro interno ao alterar a comanda." });
}

pedidosRouter.post("/:id/itens", async (req, res) => {
  const validacao = itemComandaSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.status(201).json(await adicionarItemPedido(req.params.id, validacao.data, req.usuario!.id));
  } catch (erro) {
    return responderErroComanda(res, erro);
  }
});

pedidosRouter.patch("/:id/itens/:itemId", async (req, res) => {
  const validacao = alteracaoItemSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.json(await alterarItemPedido(req.params.id, req.params.itemId, validacao.data, req.usuario!.id));
  } catch (erro) {
    return responderErroComanda(res, erro);
  }
});

// Preço especial só nesta comanda (não muda o preço de Carnes e Cortes)
const precoItemSchema = z.object({ precoUnitario: z.number().positive("Informe um preço maior que zero.").max(100000) });

pedidosRouter.patch("/:id/itens/:itemId/preco", async (req, res) => {
  const validacao = precoItemSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.json(await alterarPrecoItemPedido(req.params.id, req.params.itemId, validacao.data.precoUnitario, req.usuario!.id));
  } catch (erro) {
    return responderErroComanda(res, erro);
  }
});

pedidosRouter.delete("/:id/itens/:itemId", async (req, res) => {
  try {
    return res.json(await removerItemPedido(req.params.id, req.params.itemId, req.usuario!.id));
  } catch (erro) {
    return responderErroComanda(res, erro);
  }
});
