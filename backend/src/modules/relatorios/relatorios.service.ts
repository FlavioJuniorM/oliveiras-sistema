import { prisma } from "../../config/database";

interface PeriodoInput {
  inicio: Date;
  fim: Date;
}

/** Vendas agrupadas por dia dentro do período informado (seção 14). */
export async function relatorioVendasPorPeriodo({ inicio, fim }: PeriodoInput) {
  const pedidos = await prisma.pedido.findMany({
    where: { criadoEm: { gte: inicio, lte: fim }, statusPagamento: { not: "CANCELADO" } },
    select: { criadoEm: true, total: true },
    orderBy: { criadoEm: "asc" },
  });

  const porDia = new Map<string, number>();
  for (const pedido of pedidos) {
    const chave = pedido.criadoEm.toISOString().slice(0, 10);
    porDia.set(chave, (porDia.get(chave) || 0) + Number(pedido.total));
  }

  const totalPeriodo = pedidos.reduce((s, p) => s + Number(p.total), 0);

  return {
    totalPeriodo: Number(totalPeriodo.toFixed(2)),
    numeroPedidos: pedidos.length,
    porDia: Array.from(porDia.entries()).map(([data, total]) => ({
      data,
      total: Number(total.toFixed(2)),
    })),
  };
}

/** Produtos mais vendidos por quantidade e por faturamento no período. */
export async function relatorioProdutos({ inicio, fim }: PeriodoInput) {
  const itens = await prisma.pedidoItem.findMany({
    where: {
      pedido: { criadoEm: { gte: inicio, lte: fim }, statusPagamento: { not: "CANCELADO" } },
    },
    include: { produto: true },
  });

  const porProduto = new Map<
    string,
    { produtoId: string; nome: string; quantidadeVendida: number; faturamento: number }
  >();

  for (const item of itens) {
    const atual = porProduto.get(item.produtoId) || {
      produtoId: item.produtoId,
      nome: item.produto.nome,
      quantidadeVendida: 0,
      faturamento: 0,
    };
    atual.quantidadeVendida += Number(item.pesoOuQtd);
    atual.faturamento += Number(item.subtotal);
    porProduto.set(item.produtoId, atual);
  }

  return Array.from(porProduto.values())
    .map((p) => ({
      ...p,
      quantidadeVendida: Number(p.quantidadeVendida.toFixed(3)),
      faturamento: Number(p.faturamento.toFixed(2)),
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
}

/** Ranking de clientes por faturamento, e lista de clientes inadimplentes. */
export async function relatorioClientes({ inicio, fim }: PeriodoInput) {
  const pedidos = await prisma.pedido.findMany({
    where: {
      criadoEm: { gte: inicio, lte: fim },
      statusPagamento: { not: "CANCELADO" },
      clienteId: { not: null },
    },
    include: { cliente: true },
  });

  const porCliente = new Map<
    string,
    { clienteId: string; nome: string; totalComprado: number; numeroPedidos: number }
  >();

  for (const pedido of pedidos) {
    if (!pedido.clienteId) continue;
    const atual = porCliente.get(pedido.clienteId) || {
      clienteId: pedido.clienteId,
      nome: pedido.cliente!.nome,
      totalComprado: 0,
      numeroPedidos: 0,
    };
    atual.totalComprado += Number(pedido.total);
    atual.numeroPedidos += 1;
    porCliente.set(pedido.clienteId, atual);
  }

  const clientesQueMaisCompram = Array.from(porCliente.values())
    .map((c) => ({ ...c, totalComprado: Number(c.totalComprado.toFixed(2)) }))
    .sort((a, b) => b.totalComprado - a.totalComprado);

  const contasEmAberto = await prisma.contaReceber.findMany({
    where: { status: { in: ["PENDENTE", "PARCIAL"] } },
    include: { cliente: true },
  });

  const hoje = new Date();
  const clientesInadimplentes = contasEmAberto
    .filter((c) => c.vencimento < hoje)
    .map((c) => ({
      clienteId: c.clienteId,
      nome: c.cliente.nome,
      saldo: Number(c.saldo),
      vencimento: c.vencimento,
    }));

  const clientesComContasEmAberto = contasEmAberto.map((c) => ({
    clienteId: c.clienteId,
    nome: c.cliente.nome,
    saldo: Number(c.saldo),
    vencimento: c.vencimento,
    status: c.status,
  }));

  return { clientesQueMaisCompram, clientesInadimplentes, clientesComContasEmAberto };
}

/** Visão financeira consolidada: recebido, a receber, vencido, contas a pagar, fluxo. */
export async function relatorioFinanceiro({ inicio, fim }: PeriodoInput) {
  const [pagamentosRecebidos, contasReceber, contasPagar] = await Promise.all([
    prisma.pagamento.findMany({ where: { criadoEm: { gte: inicio, lte: fim } } }),
    prisma.contaReceber.findMany({ where: { status: { not: "CANCELADO" } } }),
    prisma.contaPagar.findMany({
      where: { dataLancamento: { gte: inicio, lte: fim } },
    }),
  ]);

  const totalRecebido = pagamentosRecebidos.reduce((s, p) => s + Number(p.valor), 0);

  const hoje = new Date();
  const totalAReceber = contasReceber
    .filter((c) => c.status === "PENDENTE" || c.status === "PARCIAL")
    .reduce((s, c) => s + Number(c.saldo), 0);
  const totalVencido = contasReceber
    .filter((c) => c.vencimento < hoje && (c.status === "PENDENTE" || c.status === "PARCIAL"))
    .reduce((s, c) => s + Number(c.saldo), 0);

  const totalContasPagar = contasPagar.reduce((s, c) => s + Number(c.valor), 0);
  const totalContasPagarPagas = contasPagar
    .filter((c) => c.status === "PAGO")
    .reduce((s, c) => s + Number(c.valor), 0);

  return {
    totalRecebido: Number(totalRecebido.toFixed(2)),
    totalAReceber: Number(totalAReceber.toFixed(2)),
    totalVencido: Number(totalVencido.toFixed(2)),
    totalContasPagar: Number(totalContasPagar.toFixed(2)),
    totalContasPagarPagas: Number(totalContasPagarPagas.toFixed(2)),
    // Fluxo de caixa simplificado do período: entradas (pagamentos recebidos) menos
    // saídas (contas a pagar já pagas dentro do período)
    fluxoCaixaPeriodo: Number((totalRecebido - totalContasPagarPagas).toFixed(2)),
  };
}
