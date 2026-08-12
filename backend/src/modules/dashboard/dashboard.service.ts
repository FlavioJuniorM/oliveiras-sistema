import { prisma } from "../../config/database";

function inicioDoDia(data = new Date()) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inicioDoMes(data = new Date()) {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

/**
 * Monta os dados do dashboard administrativo (seção 3 da especificação):
 * vendas do dia/mês, total recebido, a receber, vencido, número de pedidos,
 * clientes atendidos, produtos mais vendidos e contas próximas do vencimento.
 */
export async function obterDashboard() {
  const hoje = inicioDoDia();
  const inicioMes = inicioDoMes();
  const daquiA7Dias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [pedidosHoje, pedidosMes, contasReceber, contasPagar] = await Promise.all([
    prisma.pedido.findMany({
      where: { criadoEm: { gte: hoje }, statusPagamento: { not: "CANCELADO" } },
      include: { pagamentos: true, itens: true },
    }),
    prisma.pedido.findMany({
      where: { criadoEm: { gte: inicioMes }, statusPagamento: { not: "CANCELADO" } },
      include: { pagamentos: true },
    }),
    prisma.contaReceber.findMany({ where: { status: { not: "CANCELADO" } } }),
    prisma.contaPagar.findMany({ where: { status: { not: "PAGO" } } }),
  ]);

  const vendasHoje = pedidosHoje.reduce((s, p) => s + Number(p.total), 0);
  const recebidoHoje = pedidosHoje.reduce(
    (s, p) => s + p.pagamentos.reduce((sp, pag) => sp + Number(pag.valor), 0),
    0
  );
  const vendasMes = pedidosMes.reduce((s, p) => s + Number(p.total), 0);

  const totalAReceber = contasReceber
    .filter((c) => c.status === "PENDENTE" || c.status === "PARCIAL")
    .reduce((s, c) => s + Number(c.saldo), 0);

  const totalVencido = contasReceber
    .filter((c) => c.vencimento < hoje && (c.status === "PENDENTE" || c.status === "PARCIAL"))
    .reduce((s, c) => s + Number(c.saldo), 0);

  const clientesAtendidosHoje = new Set(
    pedidosHoje.map((p) => p.clienteId).filter(Boolean)
  ).size;

  // Produtos mais vendidos no mês (por valor faturado e por quantidade)
  const itensDoMes = await prisma.pedidoItem.findMany({
    where: { pedido: { criadoEm: { gte: inicioMes }, statusPagamento: { not: "CANCELADO" } } },
    include: { produto: true },
  });

  const porProduto = new Map<string, { nome: string; quantidade: number; faturamento: number }>();
  for (const item of itensDoMes) {
    const atual = porProduto.get(item.produtoId) || {
      nome: item.produto.nome,
      quantidade: 0,
      faturamento: 0,
    };
    atual.quantidade += Number(item.pesoOuQtd);
    atual.faturamento += Number(item.subtotal);
    porProduto.set(item.produtoId, atual);
  }

  const produtosMaisVendidos = Array.from(porProduto.values())
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 5);

  const contasReceberProximasVencimento = contasReceber
    .filter(
      (c) =>
        (c.status === "PENDENTE" || c.status === "PARCIAL") &&
        c.vencimento >= hoje &&
        c.vencimento <= daquiA7Dias
    )
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());

  const contasReceberVencidas = contasReceber.filter(
    (c) => c.vencimento < hoje && (c.status === "PENDENTE" || c.status === "PARCIAL")
  );

  const contasPagarProximasVencimento = contasPagar
    .filter((c) => c.vencimento >= hoje && c.vencimento <= daquiA7Dias)
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());

  return {
    vendasHoje: Number(vendasHoje.toFixed(2)),
    recebidoHoje: Number(recebidoHoje.toFixed(2)),
    aReceberHoje: Number((vendasHoje - recebidoHoje).toFixed(2)),
    vendasMes: Number(vendasMes.toFixed(2)),
    totalAReceber: Number(totalAReceber.toFixed(2)),
    totalVencido: Number(totalVencido.toFixed(2)),
    numeroPedidosHoje: pedidosHoje.length,
    clientesAtendidosHoje,
    produtosMaisVendidos,
    contasReceberProximasVencimento,
    contasReceberVencidas,
    contasPagarProximasVencimento,
  };
}
