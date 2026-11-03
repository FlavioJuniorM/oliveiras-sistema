import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { gerarNumeroPedido } from "./numeroPedido";
import {
  excedeToleranciaPesagem,
  obterConfiguracaoPesagem,
  pesoMuitoAbaixoDoSolicitado,
} from "../configuracoes/configuracoes.service";
import {
  calcularSubtotalPesado,
  estimarValorItem,
  quantidadeSolicitadaEmKg,
  TOLERANCIA_CENTAVOS,
  unidadePadraoProduto,
  validarDesconto,
  validarPagamentoPedido,
} from "./regras";

interface ItemPedidoInput {
  produtoId: string;
  pesoOuQtd: number;
  unidadePedido?: UnidadePedido;
}

export type UnidadePedido = "kg" | "g" | "peca" | "unidade" | "outra";

interface PagamentoImediatoInput {
  forma:
    | "DINHEIRO"
    | "PIX"
    | "CARTAO_DEBITO"
    | "CARTAO_CREDITO"
    | "TRANSFERENCIA"
    | "BOLETO"
    | "OUTROS";
  valor: number;
}

interface CriarPedidoInput {
  clienteId?: string;
  itens: ItemPedidoInput[];
  desconto?: number;
  pagamentos: PagamentoImediatoInput[]; // formas de pagamento recebidas AGORA
  valorAPrazo?: number; // parte do total que fica como conta a receber
  vencimento?: Date; // obrigatório se valorAPrazo > 0
  usuarioId?: string;
  papelUsuario?: "FUNCIONARIO" | "ADMINISTRATIVO";
  canal?: "INTERNO" | "PUBLICO";
  tipoEntrega?: "RETIRADA" | "DELIVERY";
  momentoPagamento?: "NA_RETIRADA" | "NA_ENTREGA";
  taxaEntrega?: number;
  nomeCliente?: string;
  telefoneCliente?: string;
  emailCliente?: string;
  enderecoEntrega?: string;
  observacoesCliente?: string;
}

export class ErroPedido extends Error {}

async function registrarHistoricoStatus(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  status: StatusOperacaoPedido,
  observacao?: string
) {
  await tx.pedidoStatusHistorico.create({
    data: { pedidoId, status, observacao },
  });
}

export async function criarPedido(input: CriarPedidoInput) {
  const {
    clienteId,
    itens,
    desconto = 0,
    pagamentos,
    valorAPrazo = 0,
    vencimento,
    usuarioId,
    papelUsuario = "FUNCIONARIO",
    canal = "INTERNO",
    tipoEntrega = "RETIRADA",
    momentoPagamento,
    taxaEntrega = 0,
    nomeCliente,
    telefoneCliente,
    emailCliente,
    enderecoEntrega,
    observacoesCliente,
  } = input;

  if (itens.length === 0) {
    throw new ErroPedido("O pedido precisa ter ao menos um item.");
  }

  // Fluxo da comanda: ANOTAR → CORTAR/PESAR → FECHAR.
  // Na anotação não existe valor, desconto nem pagamento: tudo isso só é
  // definido depois que o peso real de cada corte é registrado.
  if (desconto > 0) {
    throw new ErroPedido("Desconto não é aplicado na anotação do pedido.");
  }
  if (pagamentos.length > 0 || valorAPrazo > 0) {
    throw new ErroPedido("O pagamento é definido no fechamento da comanda, depois da pesagem.");
  }

  // Busca os produtos e congela o PREÇO ATUAL do cadastro — o funcionário nunca informa preço
  const produtoIds = itens.map((i) => i.produtoId);
  const produtos = await prisma.produto.findMany({ where: { id: { in: produtoIds } } });

  if (produtos.length !== new Set(produtoIds).size) {
    throw new ErroPedido("Um ou mais produtos do pedido não foram encontrados.");
  }

  const itensCalculados = itens.map((item) => {
    const produto = produtos.find((p) => p.id === item.produtoId)!;

    if (produto.status !== "ATIVO") {
      throw new ErroPedido(`O produto "${produto.nome}" está inativo.`);
    }
    if (item.pesoOuQtd <= 0) {
      throw new ErroPedido(`Peso/quantidade inválido para "${produto.nome}".`);
    }

    const unidadePedido = item.unidadePedido ?? unidadePadraoProduto(produto.unidadeMedida);
    const precoUnitario = Number(produto.preco);

    return {
      produtoId: produto.id,
      nome: produto.nome,
      pesoOuQtd: item.pesoOuQtd,
      unidadePedido,
      precoUnitario,
      // Valor real só existe depois da pesagem
      subtotal: 0,
      estimativa: estimarValorItem(precoUnitario, item.pesoOuQtd, unidadePedido, produto.unidadeMedida),
    };
  });

  const estimativaTotal = Number(itensCalculados.reduce((soma, item) => soma + item.estimativa, 0).toFixed(2));

  const pedido = await prisma.$transaction(async (tx) => {
    const numero = await gerarNumeroPedido(tx);
    const tokenAcompanhamento = randomBytes(16).toString("hex");

    const pedidoCriado = await tx.pedido.create({
      data: {
        numero,
        tokenAcompanhamento,
        clienteId,
        usuarioId,
        canal,
        tipoEntrega,
        momentoPagamento,
        taxaEntrega,
        nomeCliente,
        telefoneCliente,
        emailCliente,
        enderecoEntrega,
        observacoesCliente,
        subtotal: 0,
        desconto: 0,
        total: 0,
        statusPagamento: "PENDENTE",
        itens: {
          create: itensCalculados.map((i) => ({
            produtoId: i.produtoId,
            pesoOuQtd: i.pesoOuQtd,
            unidadePedido: i.unidadePedido,
            precoUnitario: i.precoUnitario,
            subtotal: i.subtotal,
          })),
        },
      },
      include: { itens: true, pagamentos: true },
    });

    await registrarHistoricoStatus(tx, pedidoCriado.id, "RECEBIDO", "Pedido criado");

    return pedidoCriado;
  });

  if (usuarioId) {
    await registrarLog({
      usuarioId,
      acao: "CRIOU_PEDIDO",
      entidade: "pedido",
      entidadeId: pedido.id,
      detalhes: `Anotou o pedido ${pedido.numero} com ${itensCalculados.length} item(ns) — valor definido após a pesagem`,
    });

    for (const item of itensCalculados) {
      await registrarLog({
        usuarioId,
        acao: "ADICIONOU_ITEM_PEDIDO",
        entidade: "pedido",
        entidadeId: pedido.id,
        detalhes: `Adicionou ${item.nome} — ${item.pesoOuQtd} ${item.unidadePedido}`,
      });
    }

  }

  return { ...pedido, estimativaTotal };
}

export async function criarPedidoPublico(input: {
  nomeCliente: string;
  telefoneCliente: string;
  emailCliente?: string;
  tipoEntrega: "RETIRADA" | "DELIVERY";
  momentoPagamento: "NA_RETIRADA" | "NA_ENTREGA";
  enderecoEntrega?: string;
  observacoesCliente?: string;
  itens: ItemPedidoInput[];
}) {
  return criarPedido({
    ...input,
    canal: "PUBLICO",
    desconto: 0,
    pagamentos: [],
    valorAPrazo: 0,
    papelUsuario: "FUNCIONARIO",
  });
}

export async function listarPedidos(filtros: { status?: string; clienteId?: string }) {
  return prisma.pedido.findMany({
    where: {
      statusPagamento: filtros.status as any,
      clienteId: filtros.clienteId,
    },
    include: {
      cliente: true,
      usuario: { select: { nome: true } },
      itens: {
        include: {
          produto: true,
          preparadoPor: { select: { id: true, nome: true } },
          cortadoPor: { select: { id: true, nome: true } },
        },
      },
      contaReceber: true,
    },
    orderBy: { criadoEm: "desc" },
    take: 100,
  });
}

const STATUS_OPERACAO = [
  "RECEBIDO",
  "EM_PREPARO",
  "EXPEDICAO",
  "PRONTO",
  "EM_ENTREGA",
  "ENTREGUE",
] as const;

const STATUS_PREPARO = ["PENDENTE", "EM_CORTE", "CORTADO"] as const;

export type StatusPreparoItem = (typeof STATUS_PREPARO)[number];

export type StatusOperacaoPedido = (typeof STATUS_OPERACAO)[number];

export async function atualizarPreparoItem(
  pedidoId: string,
  itemId: string,
  input: { statusPreparo: StatusPreparoItem; pesoReal?: number },
  usuarioId: string
) {
  const item = await prisma.pedidoItem.findFirst({
    where: { id: itemId, pedidoId },
    include: { pedido: { include: { contaReceber: true } }, produto: true },
  });

  if (!item) throw new ErroPedido("Corte não encontrado nesta comanda.");
  if (item.pedido.statusPagamento === "CANCELADO") {
    throw new ErroPedido("Não é possível alterar uma comanda cancelada.");
  }
  if (item.pedido.statusOperacao !== "RECEBIDO" && item.pedido.statusOperacao !== "EM_PREPARO") {
    throw new ErroPedido("Esta comanda já foi fechada. Não é possível alterar os pesos.");
  }

  // Fluxo simplificado: o item está PENDENTE (aguardando pesagem) ou CORTADO (pesado).
  // EM_CORTE continua aceito apenas por compatibilidade e é tratado como pendente.
  const pesado = input.statusPreparo === "CORTADO";
  const vendidoPorPeso = item.produto.tipoVenda === "PESO";

  if (pesado && (!input.pesoReal || input.pesoReal <= 0)) {
    throw new ErroPedido(
      vendidoPorPeso
        ? "Informe o peso da balança (em kg) para confirmar o corte."
        : "Informe a quantidade separada para confirmar o item."
    );
  }

  // Para carnes por peso, o valor real é SEMPRE em kg (o que a balança mostra).
  // Só dá para comparar com o pedido quando ele foi anotado em kg ou g.
  const solicitadoEmKg = quantidadeSolicitadaEmKg(Number(item.pesoOuQtd), item.unidadePedido as UnidadePedido);
  // Peso acima da tolerância NÃO bloqueia: a tela avisa e o balcão decide.
  // Fica registrado no histórico (log) para conferência posterior.
  let acimaDaTolerancia = false;
  if (pesado && vendidoPorPeso && solicitadoEmKg != null) {
    const configuracao = await obterConfiguracaoPesagem();
    acimaDaTolerancia = excedeToleranciaPesagem(solicitadoEmKg, input.pesoReal!, configuracao.toleranciaPesagemPercentual);
    // Peso absurdamente baixo continua bloqueado: quase sempre é erro de unidade (g digitado como kg)
    if (pesoMuitoAbaixoDoSolicitado(solicitadoEmKg, input.pesoReal!)) {
      throw new ErroPedido(
        `O peso está muito abaixo do pedido (${solicitadoEmKg.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg). Informe o peso da balança em kg.`
      );
    }
  }

  const pesoReal = pesado ? input.pesoReal! : null;
  const subtotal = pesado ? calcularSubtotalPesado(Number(item.precoUnitario), pesoReal!) : 0;

  await prisma.$transaction(async (tx) => {
    await tx.pedidoItem.update({
      where: { id: itemId },
      data: {
        statusPreparo: pesado ? "CORTADO" : "PENDENTE",
        pesoReal,
        subtotal,
        preparadoPorId: null,
        // Mantido apenas para auditoria interna (não aparece nas telas)
        cortadoPorId: pesado ? usuarioId : null,
      },
    });

    // Total da comanda = soma apenas dos itens já pesados
    const itens = await tx.pedidoItem.findMany({ where: { pedidoId } });
    const totalPedido = Number(
      itens.reduce((total, atual) => total + (atual.statusPreparo === "CORTADO" ? Number(atual.subtotal) : 0), 0).toFixed(2)
    );
    const novoStatusOperacao: StatusOperacaoPedido =
      item.pedido.statusOperacao === "RECEBIDO" && pesado ? "EM_PREPARO" : item.pedido.statusOperacao;

    await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        subtotal: totalPedido,
        desconto: 0,
        total: totalPedido,
        statusOperacao: novoStatusOperacao,
      },
    });

    if (novoStatusOperacao !== item.pedido.statusOperacao) {
      await registrarHistoricoStatus(tx, pedidoId, novoStatusOperacao, "Primeiro corte pesado");
    }
  });

  await registrarLog({
    usuarioId,
    acao: "ATUALIZOU_CORTE_PEDIDO",
    entidade: "pedido_item",
    entidadeId: itemId,
    detalhes: pesado
      ? `Pesou ${item.produto.nome}: ${pesoReal} ${vendidoPorPeso ? "kg" : "un"} = R$ ${subtotal}${acimaDaTolerancia ? ` (acima da tolerância; pedido ${solicitadoEmKg} kg)` : ""}`
      : `Reabriu a pesagem de ${item.produto.nome}`,
  });

  return obterPedido(pedidoId);
}

export async function atualizarStatusOperacaoPedido(
  pedidoId: string,
  statusOperacao: StatusOperacaoPedido,
  usuarioId: string
) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });

  if (!pedido) {
    throw new ErroPedido("Pedido não encontrado.");
  }
  if (pedido.statusPagamento === "CANCELADO") {
    throw new ErroPedido("Não é possível movimentar um pedido cancelado.");
  }

  if (statusOperacao === "EXPEDICAO") {
    const cortesPendentes = await prisma.pedidoItem.count({
      where: { pedidoId, statusPreparo: { not: "CORTADO" } },
    });
    if (cortesPendentes > 0) {
      throw new ErroPedido("Confirme todos os cortes antes de enviar para expedição.");
    }
  }

  const atualizado = await prisma.$transaction(async (tx) => {
    const pedidoAtualizado = await tx.pedido.update({
      where: { id: pedidoId },
      data: { statusOperacao },
      include: {
        cliente: true,
        usuario: { select: { nome: true } },
        itens: {
          include: {
            produto: true,
            preparadoPor: { select: { id: true, nome: true } },
            cortadoPor: { select: { id: true, nome: true } },
          },
        },
        contaReceber: true,
      },
    });

    if (pedido.statusOperacao !== statusOperacao) {
      await registrarHistoricoStatus(tx, pedidoId, statusOperacao, "Status operacional atualizado");
    }

    return pedidoAtualizado;
  });

  await registrarLog({
    usuarioId,
    acao: "ALTEROU_STATUS_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Alterou o pedido ${pedido.numero} para ${statusOperacao}`,
  });

  return atualizado;
}

export async function obterPedido(id: string) {
  return prisma.pedido.findUnique({
    where: { id },
    include: {
      cliente: true,
      usuario: { select: { nome: true } },
      itens: {
        include: {
          produto: true,
          preparadoPor: { select: { id: true, nome: true } },
          cortadoPor: { select: { id: true, nome: true } },
        },
      },
      pagamentos: { include: { usuario: { select: { nome: true } } } },
      contaReceber: true,
      notaFiscal: true,
      statusHistorico: { orderBy: { criadoEm: "asc" } },
    },
  });
}

export async function obterAcompanhamentoPublico(token: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { tokenAcompanhamento: token },
    include: {
      itens: { include: { produto: true } },
      statusHistorico: { orderBy: { criadoEm: "asc" } },
    },
  });

  if (!pedido) return null;

  return {
    numero: pedido.numero,
    tokenAcompanhamento: pedido.tokenAcompanhamento,
    canal: pedido.canal,
    tipoEntrega: pedido.tipoEntrega,
    momentoPagamento: pedido.momentoPagamento,
    nomeCliente: pedido.nomeCliente,
    criadoEm: pedido.criadoEm,
    subtotal: pedido.subtotal,
    taxaEntrega: pedido.taxaEntrega,
    total: pedido.total,
    // O valor só é definitivo quando todos os itens foram pesados
    valorConfirmado: pedido.itens.length > 0 && pedido.itens.every((item) => item.statusPreparo === "CORTADO"),
    statusPagamento: pedido.statusPagamento,
    statusOperacao: pedido.statusOperacao,
    enderecoEntrega: pedido.enderecoEntrega,
    itens: pedido.itens.map((item) => ({
      id: item.id,
      nome: item.produto.nome,
      pesoOuQtd: item.pesoOuQtd,
      unidadePedido: item.unidadePedido,
      pesoReal: item.pesoReal,
      unidadeReal: item.produto.tipoVenda === "PESO" ? "kg" : item.produto.unidadeMedida,
      subtotal: item.subtotal,
      statusPreparo: item.statusPreparo,
    })),
    statusHistorico: pedido.statusHistorico,
  };
}

export type FormaPagamentoFinal =
  | "DINHEIRO"
  | "PIX"
  | "CARTAO_DEBITO"
  | "CARTAO_CREDITO"
  | "TRANSFERENCIA"
  | "A_PRAZO"
  | "NA_RETIRADA"
  | "NA_ENTREGA";

/**
 * Fecha a conferência dos cortes e registra a condição de pagamento somente
 * depois que todos os pesos reais foram confirmados.
 */
export async function finalizarConferenciaPedido(
  pedidoId: string,
  input: { formaPagamento: FormaPagamentoFinal; vencimento?: Date },
  usuarioId: string
) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { cliente: true, itens: true, pagamentos: true, contaReceber: true },
  });

  if (!pedido) throw new ErroPedido("Pedido não encontrado.");
  if (pedido.statusPagamento === "CANCELADO") {
    throw new ErroPedido("Não é possível finalizar uma comanda cancelada.");
  }
  if (pedido.itens.some((item) => item.statusPreparo !== "CORTADO")) {
    throw new ErroPedido("Confirme todos os cortes e pesos reais antes de finalizar.");
  }

  const total = Number(pedido.total);
  const totalPago = pedido.pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.valor), 0);
  const saldo = Number(Math.max(total - totalPago, 0).toFixed(2));

  if (input.formaPagamento === "A_PRAZO") {
    if (!pedido.clienteId) throw new ErroPedido("Pagamento posterior exige um cliente cadastrado.");
    if (!input.vencimento) throw new ErroPedido("Informe a data de vencimento do pagamento posterior.");
  }

  const pagamentoNaEntrega = input.formaPagamento === "NA_RETIRADA" || input.formaPagamento === "NA_ENTREGA";
  if (pagamentoNaEntrega) {
    if (pedido.canal !== "PUBLICO") {
      throw new ErroPedido("Pagamento na retirada ou entrega só pode ser usado em pedidos públicos.");
    }
    const formaEsperada = pedido.tipoEntrega === "DELIVERY" ? "NA_ENTREGA" : "NA_RETIRADA";
    if (input.formaPagamento !== formaEsperada) {
      throw new ErroPedido(`Este pedido deve ser pago ${pedido.tipoEntrega === "DELIVERY" ? "na entrega" : "na retirada"}.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (input.formaPagamento === "A_PRAZO") {
      if (pedido.contaReceber) {
        await tx.contaReceber.update({
          where: { pedidoId },
          data: {
            valorOriginal: saldo,
            saldo,
            vencimento: input.vencimento!,
            status: "PENDENTE",
          },
        });
      } else {
        await tx.contaReceber.create({
          data: {
            pedidoId,
            clienteId: pedido.clienteId!,
            valorOriginal: saldo,
            saldo,
            vencimento: input.vencimento!,
            status: "PENDENTE",
          },
        });
      }
    } else if (!pagamentoNaEntrega && saldo > TOLERANCIA_CENTAVOS) {
      await tx.pagamento.create({
        data: {
          pedidoId,
          forma: input.formaPagamento as Exclude<FormaPagamentoFinal, "A_PRAZO" | "NA_RETIRADA" | "NA_ENTREGA">,
          valor: saldo,
          usuarioId,
        },
      });

      if (pedido.contaReceber) {
        await tx.contaReceber.update({
          where: { pedidoId },
          data: { saldo: 0, status: "PAGO" },
        });
      }
    }

    await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        statusOperacao: "EXPEDICAO",
        statusPagamento: input.formaPagamento === "A_PRAZO" || pagamentoNaEntrega ? "PENDENTE" : "PAGO",
        vencimento: input.formaPagamento === "A_PRAZO" ? input.vencimento : null,
      },
    });

    if (pedido.statusOperacao !== "EXPEDICAO") {
      await registrarHistoricoStatus(tx, pedidoId, "EXPEDICAO", "Conferência finalizada");
    }
  });

  await registrarLog({
    usuarioId,
    acao: "FINALIZOU_CONFERENCIA_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Finalizou a conferência do pedido ${pedido.numero} — pagamento ${input.formaPagamento}`,
  });

  return obterPedido(pedidoId);
}

/**
 * Registra um novo pagamento sobre um pedido já existente (ex: quitação total ou
 * parcial de uma conta a prazo). Atualiza automaticamente o saldo da conta a receber
 * e o status do pedido (regra 7: saldo do cliente atualizado automaticamente).
 */
export async function registrarPagamento(
  pedidoId: string,
  input: PagamentoImediatoInput,
  usuarioId: string
) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { contaReceber: true },
  });

  if (!pedido) {
    throw new ErroPedido("Pedido não encontrado.");
  }
  if (pedido.statusPagamento === "CANCELADO") {
    throw new ErroPedido("Não é possível registrar pagamento em um pedido cancelado.");
  }
  if (pedido.statusPagamento === "PAGO") {
    throw new ErroPedido("Este pedido já está totalmente pago.");
  }
  if (pedido.statusOperacao === "RECEBIDO" || pedido.statusOperacao === "EM_PREPARO") {
    throw new ErroPedido("Finalize a conferência dos cortes antes de registrar pagamento.");
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.pagamento.create({
      data: { pedidoId, forma: input.forma, valor: input.valor, usuarioId },
    });

    let novoStatusPedido: "PENDENTE" | "PARCIALMENTE_PAGO" | "PAGO" = "PARCIALMENTE_PAGO";

    if (pedido.contaReceber) {
      const novoSaldo = Number((Number(pedido.contaReceber.saldo) - input.valor).toFixed(2));

      if (novoSaldo < -TOLERANCIA_CENTAVOS) {
        throw new ErroPedido("O valor pago é maior que o saldo devido.");
      }

      const quitado = novoSaldo <= TOLERANCIA_CENTAVOS;

      await tx.contaReceber.update({
        where: { pedidoId },
        data: {
          saldo: Math.max(novoSaldo, 0),
          status: quitado ? "PAGO" : "PARCIAL",
        },
      });

      novoStatusPedido = quitado ? "PAGO" : "PARCIALMENTE_PAGO";
    } else {
      const totalPago = await tx.pagamento.aggregate({
        where: { pedidoId },
        _sum: { valor: true },
      });
      const totalPagoAtualizado = Number(totalPago._sum.valor || 0);
      novoStatusPedido = totalPagoAtualizado >= Number(pedido.total) - TOLERANCIA_CENTAVOS ? "PAGO" : "PARCIALMENTE_PAGO";
    }

    const pedidoAtualizado = await tx.pedido.update({
      where: { id: pedidoId },
      data: { statusPagamento: novoStatusPedido },
      include: { pagamentos: true, contaReceber: true },
    });

    return pedidoAtualizado;
  });

  await registrarLog({
    usuarioId,
    acao: "REGISTROU_PAGAMENTO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Registrou pagamento de R$ ${input.valor} (${input.forma}) no pedido ${pedido.numero}`,
  });

  if (resultado.statusPagamento === "PAGO") {
    await registrarLog({
      usuarioId,
      acao: "ALTEROU_STATUS_PEDIDO",
      entidade: "pedido",
      entidadeId: pedidoId,
      detalhes: `Pedido ${pedido.numero} alterado automaticamente para PAGO`,
    });
  }

  return resultado;
}

/**
 * Cancela um pedido. Restrito ao papel ADMINISTRATIVO (regra 2).
 * Se havia conta a receber em aberto, ela também é cancelada — o pedido
 * NUNCA é apagado do banco, apenas marcado (regra 3 e 18).
 */
export async function cancelarPedido(pedidoId: string, usuarioId: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { contaReceber: true },
  });

  if (!pedido) {
    throw new ErroPedido("Pedido não encontrado.");
  }
  if (pedido.statusPagamento === "CANCELADO") {
    throw new ErroPedido("Este pedido já está cancelado.");
  }

  const pedidoCancelado = await prisma.$transaction(async (tx) => {
    if (pedido.contaReceber) {
      await tx.contaReceber.update({
        where: { pedidoId },
        data: { status: "CANCELADO" },
      });
    }

    return tx.pedido.update({
      where: { id: pedidoId },
      data: { statusPagamento: "CANCELADO" },
    });
  });

  await registrarLog({
    usuarioId,
    acao: "CANCELOU_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Cancelou o pedido ${pedido.numero}`,
  });

  return pedidoCancelado;
}
