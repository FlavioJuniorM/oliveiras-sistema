import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { gerarNumeroPedido } from "./numeroPedido";

interface ItemPedidoInput {
  produtoId: string;
  pesoOuQtd: number;
}

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
  usuarioId: string;
  papelUsuario: "FUNCIONARIO" | "ADMINISTRATIVO";
}

export class ErroPedido extends Error {}

const TOLERANCIA_CENTAVOS = 0.01;

export async function criarPedido(input: CriarPedidoInput) {
  const {
    clienteId,
    itens,
    desconto = 0,
    pagamentos,
    valorAPrazo = 0,
    vencimento,
    usuarioId,
    papelUsuario,
  } = input;

  if (itens.length === 0) {
    throw new ErroPedido("O pedido precisa ter ao menos um item.");
  }

  // Regra 1 da especificação: desconto só é permitido para o papel administrativo
  if (desconto > 0 && papelUsuario !== "ADMINISTRATIVO") {
    throw new ErroPedido("Aplicar desconto requer autorização administrativa.");
  }

  // Busca os produtos e usa o PREÇO ATUAL do cadastro — o funcionário nunca informa preço
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

    const precoUnitario = Number(produto.preco);
    const subtotalItem = Number((precoUnitario * item.pesoOuQtd).toFixed(2));

    return {
      produtoId: produto.id,
      nome: produto.nome,
      pesoOuQtd: item.pesoOuQtd,
      precoUnitario,
      subtotal: subtotalItem,
    };
  });

  const subtotal = Number(
    itensCalculados.reduce((soma, i) => soma + i.subtotal, 0).toFixed(2)
  );
  const total = Number((subtotal - desconto).toFixed(2));

  if (total <= 0) {
    throw new ErroPedido("O valor total do pedido deve ser maior que zero.");
  }

  const totalPagoImediato = Number(
    pagamentos.reduce((soma, p) => soma + p.valor, 0).toFixed(2)
  );
  const saldoDevido = Number((total - totalPagoImediato).toFixed(2));

  // Validações do split de pagamento (seção 7 — pagamento dividido)
  if (saldoDevido > TOLERANCIA_CENTAVOS) {
    const pedidoEmAberto = totalPagoImediato <= TOLERANCIA_CENTAVOS && (!valorAPrazo || valorAPrazo <= TOLERANCIA_CENTAVOS);
    if (!pedidoEmAberto && Math.abs(saldoDevido - (valorAPrazo || 0)) > TOLERANCIA_CENTAVOS) {
      throw new ErroPedido(
        "A soma dos pagamentos informados não fecha com o valor total do pedido."
      );
    }
    if (!pedidoEmAberto && !vencimento) {
      throw new ErroPedido("Informe o vencimento para a parte do pedido a prazo.");
    }
    if (!pedidoEmAberto && !clienteId) {
      throw new ErroPedido("Vendas a prazo exigem um cliente cadastrado.");
    }
  } else if (totalPagoImediato - total > TOLERANCIA_CENTAVOS) {
    throw new ErroPedido("O total pago não pode ser maior que o valor do pedido.");
  }

  const statusPagamento =
    saldoDevido <= TOLERANCIA_CENTAVOS
      ? "PAGO"
      : totalPagoImediato > 0
      ? "PARCIALMENTE_PAGO"
      : "PENDENTE";

  const pedido = await prisma.$transaction(async (tx) => {
    const numero = await gerarNumeroPedido(tx);

    const pedidoCriado = await tx.pedido.create({
      data: {
        numero,
        clienteId,
        usuarioId,
        subtotal,
        desconto,
        total,
        statusPagamento,
        vencimento: saldoDevido > TOLERANCIA_CENTAVOS ? vencimento : undefined,
        itens: {
          create: itensCalculados.map((i) => ({
            produtoId: i.produtoId,
            pesoOuQtd: i.pesoOuQtd,
            precoUnitario: i.precoUnitario,
            subtotal: i.subtotal,
          })),
        },
        pagamentos:
          pagamentos.length > 0
            ? {
                create: pagamentos.map((p) => ({
                  forma: p.forma,
                  valor: p.valor,
                  usuarioId,
                })),
              }
            : undefined,
      },
      include: { itens: true, pagamentos: true },
    });

    if (saldoDevido > TOLERANCIA_CENTAVOS && clienteId && valorAPrazo && valorAPrazo > TOLERANCIA_CENTAVOS) {
      await tx.contaReceber.create({
        data: {
          pedidoId: pedidoCriado.id,
          clienteId,
          valorOriginal: saldoDevido,
          saldo: saldoDevido,
          vencimento: vencimento!,
          status: "PENDENTE",
        },
      });
    }

    return pedidoCriado;
  });

  await registrarLog({
    usuarioId,
    acao: "CRIOU_PEDIDO",
    entidade: "pedido",
    entidadeId: pedido.id,
    detalhes: `Criou o pedido ${pedido.numero} — total R$ ${total}`,
  });

  for (const item of itensCalculados) {
    await registrarLog({
      usuarioId,
      acao: "ADICIONOU_ITEM_PEDIDO",
      entidade: "pedido",
      entidadeId: pedido.id,
      detalhes: `Adicionou ${item.nome} — ${item.pesoOuQtd} (R$ ${item.subtotal})`,
    });
  }

  if (statusPagamento === "PAGO") {
    await registrarLog({
      usuarioId,
      acao: "FINALIZOU_PEDIDO",
      entidade: "pedido",
      entidadeId: pedido.id,
      detalhes: `Finalizou o pedido ${pedido.numero} — pago integralmente`,
    });
  }

  return pedido;
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
      itens: { include: { produto: true } },
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
  if (input.statusPreparo === "CORTADO" && (!input.pesoReal || input.pesoReal <= 0)) {
    throw new ErroPedido("Informe o peso real para confirmar o corte.");
  }

  const pesoReal = input.pesoReal ?? (input.statusPreparo === "PENDENTE" ? null : Number(item.pesoReal ?? item.pesoOuQtd));
  const subtotal = Number((Number(item.precoUnitario) * Number(pesoReal ?? item.pesoOuQtd)).toFixed(2));

  await prisma.$transaction(async (tx) => {
    await tx.pedidoItem.update({
      where: { id: itemId },
      data: { statusPreparo: input.statusPreparo, pesoReal, subtotal },
    });

    const itens = await tx.pedidoItem.findMany({ where: { pedidoId } });
    const subtotalPedido = Number(itens.reduce((total, atual) => total + Number(atual.subtotal), 0).toFixed(2));
    const totalPedido = Number((subtotalPedido - Number(item.pedido.desconto)).toFixed(2));
    const pagamentos = await tx.pagamento.findMany({ where: { pedidoId } });
    const totalPago = pagamentos.reduce((total, pagamento) => total + Number(pagamento.valor), 0);
    const statusPagamento = totalPago >= totalPedido ? "PAGO" : totalPago > 0 ? "PARCIALMENTE_PAGO" : "PENDENTE";

    await tx.pedido.update({
      where: { id: pedidoId },
      data: { subtotal: subtotalPedido, total: totalPedido, statusPagamento },
    });

    if (item.pedido.contaReceber) {
      const saldo = Math.max(Number((totalPedido - totalPago).toFixed(2)), 0);
      await tx.contaReceber.update({
        where: { pedidoId },
        data: { valorOriginal: totalPedido, saldo, status: saldo === 0 ? "PAGO" : totalPago > 0 ? "PARCIAL" : "PENDENTE" },
      });
    }
  });

  await registrarLog({
    usuarioId,
    acao: "ATUALIZOU_CORTE_PEDIDO",
    entidade: "pedido_item",
    entidadeId: itemId,
    detalhes: `Atualizou o corte ${item.produto.nome} para ${input.statusPreparo}${pesoReal ? ` com ${pesoReal}` : ""}`,
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

  const atualizado = await prisma.pedido.update({
    where: { id: pedidoId },
    data: { statusOperacao },
    include: {
      cliente: true,
      usuario: { select: { nome: true } },
      itens: { include: { produto: true } },
      contaReceber: true,
    },
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
      itens: { include: { produto: true } },
      pagamentos: { include: { usuario: { select: { nome: true } } } },
      contaReceber: true,
      notaFiscal: true,
    },
  });
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

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.pagamento.create({
      data: { pedidoId, forma: input.forma, valor: input.valor, usuarioId },
    });

    let novoStatusPedido: "PARCIALMENTE_PAGO" | "PAGO" = "PARCIALMENTE_PAGO";

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
