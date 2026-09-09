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

  const [pedidosHoje, pedidosMes, contasReceber, contasPagar, clientesAtivos, produtosAtivos] = await Promise.all([
    prisma.pedido.findMany({
      where: { criadoEm: { gte: hoje }, statusPagamento: { not: "CANCELADO" } },
      include: { pagamentos: true, itens: true },
    }),
    prisma.pedido.findMany({
      where: { criadoEm: { gte: inicioMes }, statusPagamento: { not: "CANCELADO" } },
      include: { pagamentos: true, cliente: true },
    }),
    prisma.contaReceber.findMany({ where: { status: { not: "CANCELADO" } } }),
    prisma.contaPagar.findMany({ where: { status: { not: "PAGO" } } }),
    prisma.cliente.findMany({ where: { status: "ATIVO" }, orderBy: { nome: "asc" } }),
    prisma.produto.findMany({ where: { status: "ATIVO" }, orderBy: { nome: "asc" } }),
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
    atual.quantidade += Number(item.pesoReal ?? item.pesoOuQtd);
    atual.faturamento += Number(item.subtotal);
    porProduto.set(item.produtoId, atual);
  }

  const produtosComVendas = produtosAtivos.map((produto) => ({
    nome: produto.nome,
    quantidade: porProduto.get(produto.id)?.quantidade ?? 0,
    faturamento: porProduto.get(produto.id)?.faturamento ?? 0,
  }));

  const produtosMaisVendidos = produtosComVendas
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 5);

  const produtosMenosVendidos = [...produtosComVendas]
    .sort((a, b) => a.faturamento - b.faturamento)
    .slice(0, 5);

  const porCliente = new Map<string, { id: string; nome: string; pedidos: number; valorComprado: number }>();
  for (const cliente of clientesAtivos) {
    porCliente.set(cliente.id, { id: cliente.id, nome: cliente.nomeFantasia || cliente.razaoSocial || cliente.nome, pedidos: 0, valorComprado: 0 });
  }
  for (const pedido of pedidosMes) {
    if (!pedido.clienteId || !pedido.cliente) continue;
    const atual = porCliente.get(pedido.clienteId) || { id: pedido.clienteId, nome: pedido.cliente.nomeFantasia || pedido.cliente.razaoSocial || pedido.cliente.nome, pedidos: 0, valorComprado: 0 };
    atual.pedidos += 1;
    atual.valorComprado += Number(pedido.total);
    porCliente.set(pedido.clienteId, atual);
  }

  const clientesMaisCompraram = Array.from(porCliente.values())
    .sort((a, b) => b.valorComprado - a.valorComprado)
    .slice(0, 5);
  const clientesMenosCompraram = [...porCliente.values()]
    .sort((a, b) => a.valorComprado - b.valorComprado)
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
    produtosMenosVendidos,
    clientesMaisCompraram,
    clientesMenosCompraram,
    pedidosEmPreparo: pedidosHoje.filter((p) => p.statusOperacao === "EM_PREPARO").length,
    pedidosEmEntrega: pedidosHoje.filter((p) => p.statusOperacao === "EM_ENTREGA").length,
    contasReceberProximasVencimento,
    contasReceberVencidas,
    contasPagarProximasVencimento,
  };
}
