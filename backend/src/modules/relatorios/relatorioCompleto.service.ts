import { prisma } from "../../config/database";
import { dataNaLoja, FUSO_LOJA, hojeCalendario, periodoNaLoja } from "../../shared/datas";

/**
 * Relatório gerencial completo de um período (datas "AAAA-MM-DD", dias inteiros no horário de Brasília).
 *
 * Entradas  = caixa da loja lançado à mão (dinheiro + Pix + cartões) + CEASA + comandas do sistema entregues.
 *             (mesma regra do Fechamento de Caixa, para os números baterem)
 * Saídas    = contas a pagar pagas no período + gastos/sangrias tirados do caixa.
 * Resultado = entradas − saídas. Não considera o custo de compra de cada carne (o sistema não guarda),
 *             por isso é o "resultado de caixa" do período.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function diasEntre(inicio: string, fim: string) {
  const dias: string[] = [];
  for (let t = Date.parse(`${inicio}T00:00:00Z`); t <= Date.parse(`${fim}T00:00:00Z`); t += DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

function deslocarDia(dia: string, dias: number) {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

const formatoHora = new Intl.DateTimeFormat("en-US", { timeZone: FUSO_LOJA, hour: "numeric", hourCycle: "h23" });
const horaNaLoja = (instante: Date) => Number(formatoHora.format(instante)) % 24;
const diaSemanaCalendario = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();
/** Data de calendário (@db.Date / vencimentos) como "AAAA-MM-DD" sem deslocar o dia. */
const diaCalendario = (data: Date) => data.toISOString().slice(0, 10);

function variacao(atual: number, anterior: number) {
  if (anterior === 0) return atual === 0 ? 0 : null; // null = sem base para comparar
  return r2(((atual - anterior) / Math.abs(anterior)) * 100);
}

/** Números-base de um período: usados no período escolhido e no anterior (comparação). */
async function numerosBase(inicio: string, fim: string) {
  const instantes = periodoNaLoja(inicio, fim);
  const calendario = { gte: new Date(`${inicio}T00:00:00Z`), lte: new Date(`${fim}T00:00:00Z`) };

  const [lancamentos, entregas, contasPagas, comandas] = await Promise.all([
    prisma.lancamentoCaixa.findMany({ where: { data: calendario }, orderBy: { data: "asc" } }),
    prisma.pedidoStatusHistorico.findMany({
      where: {
        status: "ENTREGUE",
        criadoEm: { gte: instantes.inicio, lte: instantes.fim },
        pedido: { statusOperacao: "ENTREGUE", statusPagamento: { not: "CANCELADO" } },
      },
      select: { pedidoId: true, criadoEm: true, pedido: { select: { total: true } } },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.contaPagar.findMany({
      where: { dataPagamento: { gte: instantes.inicio, lte: instantes.fim }, status: { in: ["PAGO", "PARCIAL"] } },
      select: { valorPago: true, dataPagamento: true, categoria: true, fornecedor: true, funcionarioId: true },
    }),
    prisma.pedido.findMany({
      where: { criadoEm: { gte: instantes.inicio, lte: instantes.fim }, statusPagamento: { not: "CANCELADO" } },
      select: { total: true },
    }),
  ]);

  // Comanda marcada como entregue mais de uma vez: vale a última
  const ultimaEntrega = new Map<string, (typeof entregas)[number]>();
  for (const e of entregas) ultimaEntrega.set(e.pedidoId, e);

  const caixaLoja = lancamentos.reduce((s, l) => s + Number(l.dinheiro) + Number(l.pix) + Number(l.cartoes), 0);
  const ceasa = lancamentos.reduce((s, l) => s + Number(l.ceasa), 0);
  const sangrias = lancamentos.reduce((s, l) => s + Number(l.gastos), 0);
  const comandasEntregues = Array.from(ultimaEntrega.values()).reduce((s, e) => s + Number(e.pedido.total), 0);
  const contasPagasTotal = contasPagas.reduce((s, c) => s + Number(c.valorPago), 0);
  const entradas = caixaLoja + ceasa + comandasEntregues;
  const saidas = contasPagasTotal + sangrias;

  return {
    lancamentos,
    ultimaEntrega,
    contasPagas,
    entradas: r2(entradas),
    saidas: r2(saidas),
    resultado: r2(entradas - saidas),
    caixaLoja: r2(caixaLoja),
    ceasa: r2(ceasa),
    sangrias: r2(sangrias),
    comandasEntregues: r2(comandasEntregues),
    contasPagasTotal: r2(contasPagasTotal),
    numeroComandas: comandas.length,
    vendasComandas: r2(comandas.reduce((s, p) => s + Number(p.total), 0)),
  };
}

export async function relatorioCompleto(inicio: string, fim: string) {
  const dias = diasEntre(inicio, fim);
  const instantes = periodoNaLoja(inicio, fim);
  const fimAnterior = deslocarDia(inicio, -1);
  const inicioAnterior = deslocarDia(inicio, -dias.length);
  const hoje = hojeCalendario();
  const hojeTexto = diaCalendario(hoje);
  const calendario = { gte: new Date(`${inicio}T00:00:00Z`), lte: new Date(`${fim}T00:00:00Z`) };

  const [
    atual,
    anterior,
    pedidos,
    pagamentos,
    contasVencendo,
    contasAbertasTodas,
    contasReceberAbertas,
    vendasAPrazo,
    funcionarios,
    produtosAtivos,
    usuarios,
    novosClientes,
    totalClientesAtivos,
  ] = await Promise.all([
    numerosBase(inicio, fim),
    numerosBase(inicioAnterior, fimAnterior),
    prisma.pedido.findMany({
      where: { criadoEm: { gte: instantes.inicio, lte: instantes.fim } },
      select: {
        id: true,
        total: true,
        desconto: true,
        taxaEntrega: true,
        criadoEm: true,
        canal: true,
        tipoEntrega: true,
        statusPagamento: true,
        dataAgendada: true,
        usuarioId: true,
        clienteId: true,
        cliente: { select: { nome: true, nomeFantasia: true } },
        itens: {
          select: {
            produtoId: true,
            pesoOuQtd: true,
            pesoReal: true,
            statusPreparo: true,
            precoUnitario: true,
            subtotal: true,
            cortadoPorId: true,
            produto: { select: { nome: true, preco: true, tipoVenda: true, unidadeMedida: true, categoria: { select: { nome: true } } } },
          },
        },
      },
    }),
    prisma.pagamento.findMany({
      where: { criadoEm: { gte: instantes.inicio, lte: instantes.fim }, pedido: { statusPagamento: { not: "CANCELADO" } } },
      select: { forma: true, valor: true, usuarioId: true },
    }),
    prisma.contaPagar.findMany({
      where: { vencimento: calendario, status: { not: "CANCELADO" } },
      select: { valor: true, valorPago: true, status: true, vencimento: true, categoria: true, fornecedor: true, descricao: true },
    }),
    prisma.contaPagar.findMany({
      where: { status: { in: ["PENDENTE", "PARCIAL", "VENCIDO"] } },
      select: { valor: true, valorPago: true, vencimento: true, fornecedor: true, descricao: true },
      orderBy: { vencimento: "asc" },
    }),
    prisma.contaReceber.findMany({
      where: { status: { in: ["PENDENTE", "PARCIAL", "VENCIDO"] } },
      select: { saldo: true, vencimento: true, clienteId: true, cliente: { select: { nome: true, nomeFantasia: true } } },
    }),
    prisma.contaReceber.findMany({
      where: { status: { not: "CANCELADO" }, pedido: { criadoEm: { gte: instantes.inicio, lte: instantes.fim } } },
      select: { valorOriginal: true },
    }),
    prisma.funcionario.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        funcao: true,
        registrado: true,
        salario: true,
        status: true,
        dataAdmissao: true,
        contas: { where: { vencimento: calendario }, select: { valor: true, valorPago: true, status: true } },
      },
    }),
    prisma.produto.findMany({ where: { status: "ATIVO" }, select: { id: true, nome: true, preco: true } }),
    prisma.usuario.findMany({ select: { id: true, nome: true } }),
    prisma.cliente.count({ where: { criadoEm: { gte: instantes.inicio, lte: instantes.fim } } }),
    prisma.cliente.count({ where: { status: "ATIVO" } }),
  ]);

  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.nome]));

  // ───────────── Resumo e série diária ─────────────
  const serie = new Map(dias.map((d) => [d, { data: d, entradas: 0, saidas: 0, caixaLoja: 0, ceasa: 0, comandas: 0, sangrias: 0, contasPagas: 0 }]));
  for (const l of atual.lancamentos) {
    const linha = serie.get(diaCalendario(l.data));
    if (!linha) continue;
    linha.caixaLoja += Number(l.dinheiro) + Number(l.pix) + Number(l.cartoes);
    linha.ceasa += Number(l.ceasa);
    linha.sangrias += Number(l.gastos);
  }
  for (const e of atual.ultimaEntrega.values()) {
    const linha = serie.get(dataNaLoja(e.criadoEm));
    if (linha) linha.comandas += Number(e.pedido.total);
  }
  for (const c of atual.contasPagas) {
    const linha = c.dataPagamento ? serie.get(dataNaLoja(c.dataPagamento)) : undefined;
    if (linha) linha.contasPagas += Number(c.valorPago);
  }
  const porDia = Array.from(serie.values()).map((l) => ({
    data: l.data,
    caixaLoja: r2(l.caixaLoja),
    ceasa: r2(l.ceasa),
    comandas: r2(l.comandas),
    sangrias: r2(l.sangrias),
    contasPagas: r2(l.contasPagas),
    entradas: r2(l.caixaLoja + l.ceasa + l.comandas),
    saidas: r2(l.sangrias + l.contasPagas),
  }));
  const diasComEntrada = porDia.filter((d) => d.entradas > 0);
  const melhorDia = diasComEntrada.reduce<(typeof porDia)[number] | null>((m, d) => (!m || d.entradas > m.entradas ? d : m), null);
  const piorDia = diasComEntrada.reduce<(typeof porDia)[number] | null>((m, d) => (!m || d.entradas < m.entradas ? d : m), null);

  const entradasPorSemana = DIAS_SEMANA.map((rotulo, i) => {
    const doDia = porDia.filter((d) => diaSemanaCalendario(d.data) === i && d.entradas > 0);
    const total = doDia.reduce((s, d) => s + d.entradas, 0);
    return { rotulo, total: r2(total), media: doDia.length ? r2(total / doDia.length) : 0 };
  });

  // ───────────── Comandas (vendas do sistema) ─────────────
  const validas = pedidos.filter((p) => p.statusPagamento !== "CANCELADO");
  const canceladas = pedidos.length - validas.length;
  const somaPedidos = (lista: typeof validas) => r2(lista.reduce((s, p) => s + Number(p.total), 0));
  const delivery = validas.filter((p) => p.tipoEntrega === "DELIVERY");
  const doSite = validas.filter((p) => p.canal === "PUBLICO");
  const encomendas = validas.filter((p) => p.dataAgendada && p.dataAgendada.toISOString().slice(0, 10) !== dataNaLoja(p.criadoEm));

  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, quantidade: 0, total: 0 }));
  for (const p of validas) {
    const linha = porHora[horaNaLoja(p.criadoEm)];
    linha.quantidade += 1;
    linha.total += Number(p.total);
  }
  const horasComMovimento = porHora.filter((h) => h.quantidade > 0);
  const primeiraHora = horasComMovimento[0]?.hora ?? 7;
  const ultimaHora = horasComMovimento[horasComMovimento.length - 1]?.hora ?? 19;
  const comandasPorHora = porHora
    .filter((h) => h.hora >= Math.min(primeiraHora, 7) && h.hora <= Math.max(ultimaHora, 19))
    .map((h) => ({ ...h, total: r2(h.total) }));
  const horaPico = horasComMovimento.reduce<(typeof porHora)[number] | null>((m, h) => (!m || h.quantidade > m.quantidade ? h : m), null);

  const ROTULO_FORMA: Record<string, string> = {
    DINHEIRO: "Dinheiro",
    PIX: "Pix",
    CARTAO_DEBITO: "Cartão de débito",
    CARTAO_CREDITO: "Cartão de crédito",
    TRANSFERENCIA: "Transferência",
    BOLETO: "Boleto",
    A_PRAZO: "A prazo",
    OUTROS: "Outros",
  };
  const porForma = new Map<string, number>();
  for (const pg of pagamentos) porForma.set(pg.forma, (porForma.get(pg.forma) ?? 0) + Number(pg.valor));
  const formasPagamento = Array.from(porForma.entries())
    .map(([forma, total]) => ({ forma, rotulo: ROTULO_FORMA[forma] ?? forma, total: r2(total) }))
    .sort((a, b) => b.total - a.total);

  // ───────────── Carnes e cortes ─────────────
  type LinhaProduto = { produtoId: string; nome: string; categoria: string; unidade: string; quantidade: number; kg: number; faturamento: number; vezes: number; ajustePreco: number };
  const porProduto = new Map<string, LinhaProduto>();
  const porCategoria = new Map<string, number>();
  const cortesPorUsuario = new Map<string, { kg: number; itens: number }>();
  let kgTotal = 0;
  let ajustesPreco = 0;
  let itensComAjuste = 0;
  for (const p of validas) {
    for (const item of p.itens) {
      const porPeso = item.produto.tipoVenda === "PESO";
      const quantidade = item.pesoReal != null ? Number(item.pesoReal) : Number(item.pesoOuQtd);
      const linha = porProduto.get(item.produtoId) ?? {
        produtoId: item.produtoId,
        nome: item.produto.nome,
        categoria: item.produto.categoria?.nome ?? "Sem categoria",
        unidade: porPeso ? "kg" : item.produto.unidadeMedida || "un",
        quantidade: 0,
        kg: 0,
        faturamento: 0,
        vezes: 0,
        ajustePreco: 0,
      };
      linha.quantidade += quantidade;
      if (porPeso) {
        linha.kg += quantidade;
        kgTotal += quantidade;
      }
      linha.faturamento += Number(item.subtotal);
      linha.vezes += 1;
      // "Alterar preço" na comanda: diferença para o preço de tabela atual
      const diferenca = (Number(item.precoUnitario) - Number(item.produto.preco)) * quantidade;
      if (Math.abs(Number(item.precoUnitario) - Number(item.produto.preco)) > 0.009) {
        linha.ajustePreco += diferenca;
        ajustesPreco += diferenca;
        itensComAjuste += 1;
      }
      porProduto.set(item.produtoId, linha);
      porCategoria.set(linha.categoria, (porCategoria.get(linha.categoria) ?? 0) + Number(item.subtotal));
      if (item.cortadoPorId && item.statusPreparo === "CORTADO") {
        const c = cortesPorUsuario.get(item.cortadoPorId) ?? { kg: 0, itens: 0 };
        c.itens += 1;
        if (porPeso) c.kg += quantidade;
        cortesPorUsuario.set(item.cortadoPorId, c);
      }
    }
  }
  const produtos = Array.from(porProduto.values())
    .map((p) => ({
      ...p,
      quantidade: r3(p.quantidade),
      kg: r3(p.kg),
      faturamento: r2(p.faturamento),
      ajustePreco: r2(p.ajustePreco),
      precoMedio: p.quantidade > 0 ? r2(p.faturamento / p.quantidade) : 0,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
  const faturamentoItens = produtos.reduce((s, p) => s + p.faturamento, 0);
  const vendidos = new Set(produtos.map((p) => p.produtoId));
  const semVenda = produtosAtivos.filter((p) => !vendidos.has(p.id)).map((p) => p.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));

  // ───────────── Funcionários e equipe ─────────────
  const ativos = funcionarios.filter((f) => f.status === "ATIVO");
  const folhaSemanal = ativos.reduce((s, f) => s + Number(f.salario), 0);
  const listaFuncionarios = funcionarios
    .filter((f) => f.status === "ATIVO" || f.contas.length > 0)
    .map((f) => {
      const previsto = f.contas.reduce((s, c) => s + Number(c.valor), 0);
      const pago = f.contas.reduce((s, c) => s + Number(c.valorPago), 0);
      return {
        id: f.id,
        nome: f.nome,
        funcao: f.funcao,
        registrado: f.registrado,
        ativo: f.status === "ATIVO",
        salarioSemanal: r2(Number(f.salario)),
        sabados: f.contas.length,
        previsto: r2(previsto),
        pago: r2(pago),
        pendente: r2(Math.max(previsto - pago, 0)),
      };
    });
  const salariosPrevistos = listaFuncionarios.reduce((s, f) => s + f.previsto, 0);
  const salariosPagos = listaFuncionarios.reduce((s, f) => s + f.pago, 0);

  const atendimento = new Map<string, { comandas: number; vendas: number; recebido: number; kgCortado: number; itensCortados: number }>();
  const pegar = (id: string) => {
    const atual = atendimento.get(id) ?? { comandas: 0, vendas: 0, recebido: 0, kgCortado: 0, itensCortados: 0 };
    atendimento.set(id, atual);
    return atual;
  };
  for (const p of validas) if (p.usuarioId) {
    const a = pegar(p.usuarioId);
    a.comandas += 1;
    a.vendas += Number(p.total);
  }
  for (const pg of pagamentos) pegar(pg.usuarioId).recebido += Number(pg.valor);
  for (const [id, c] of cortesPorUsuario) {
    const a = pegar(id);
    a.kgCortado += c.kg;
    a.itensCortados += c.itens;
  }
  const equipe = Array.from(atendimento.entries())
    .map(([id, a]) => ({
      nome: nomeUsuario.get(id) ?? "—",
      comandas: a.comandas,
      vendas: r2(a.vendas),
      recebido: r2(a.recebido),
      kgCortado: r3(a.kgCortado),
      itensCortados: a.itensCortados,
    }))
    .sort((a, b) => b.vendas + b.kgCortado - (a.vendas + a.kgCortado));

  // ───────────── Gastos e contas a pagar ─────────────
  const saldoConta = (c: { valor: unknown; valorPago: unknown }) => Math.max(Number(c.valor) - Number(c.valorPago), 0);
  const gastosPorCategoria = new Map<string, number>();
  for (const c of atual.contasPagas) gastosPorCategoria.set(c.categoria, (gastosPorCategoria.get(c.categoria) ?? 0) + Number(c.valorPago));
  if (atual.sangrias > 0) gastosPorCategoria.set("Sangrias do caixa", (gastosPorCategoria.get("Sangrias do caixa") ?? 0) + atual.sangrias);
  const porFornecedor = new Map<string, number>();
  for (const c of atual.contasPagas) if (!c.funcionarioId) porFornecedor.set(c.fornecedor, (porFornecedor.get(c.fornecedor) ?? 0) + Number(c.valorPago));

  const venceNoPeriodo = contasVencendo.reduce((s, c) => s + Number(c.valor), 0);
  const pagoDoQueVence = contasVencendo.reduce((s, c) => s + Number(c.valorPago), 0);
  const vencidasAgora = contasAbertasTodas.filter((c) => diaCalendario(c.vencimento) < hojeTexto);
  const em7dias = deslocarDia(hojeTexto, 7);
  const proximas = contasAbertasTodas.filter((c) => {
    const d = diaCalendario(c.vencimento);
    return d >= hojeTexto && d <= em7dias;
  });

  const sangriasDetalhe = atual.lancamentos
    .filter((l) => Number(l.gastos) > 0)
    .map((l) => ({ data: diaCalendario(l.data), valor: r2(Number(l.gastos)), descricao: l.gastosDescricao || "" }));

  // ───────────── Clientes e contas a receber ─────────────
  const porCliente = new Map<string, { nome: string; total: number; comandas: number }>();
  for (const p of validas) if (p.clienteId && p.cliente) {
    const c = porCliente.get(p.clienteId) ?? { nome: p.cliente.nomeFantasia || p.cliente.nome, total: 0, comandas: 0 };
    c.total += Number(p.total);
    c.comandas += 1;
    porCliente.set(p.clienteId, c);
  }
  const topClientes = Array.from(porCliente.values())
    .map((c) => ({ ...c, total: r2(c.total) }))
    .sort((a, b) => b.total - a.total);
  const vencidoReceber = contasReceberAbertas.filter((c) => c.vencimento < hoje);
  const devedores = new Map<string, { nome: string; saldo: number; vencido: number; maisAntigo: string }>();
  for (const c of contasReceberAbertas) {
    const d = devedores.get(c.clienteId) ?? { nome: c.cliente.nomeFantasia || c.cliente.nome, saldo: 0, vencido: 0, maisAntigo: diaCalendario(c.vencimento) };
    d.saldo += Number(c.saldo);
    if (c.vencimento < hoje) d.vencido += Number(c.saldo);
    if (diaCalendario(c.vencimento) < d.maisAntigo) d.maisAntigo = diaCalendario(c.vencimento);
    devedores.set(c.clienteId, d);
  }

  const ticketMedio = validas.length ? r2(somaPedidos(validas) / validas.length) : 0;
  const numeroDiasComEntrada = diasComEntrada.length;

  return {
    periodo: { inicio, fim, dias: dias.length, anterior: { inicio: inicioAnterior, fim: fimAnterior } },
    geradoEm: new Date().toISOString(),
    resumo: {
      entradas: atual.entradas,
      saidas: atual.saidas,
      resultado: atual.resultado,
      margem: atual.entradas > 0 ? r2((atual.resultado / atual.entradas) * 100) : null,
      mediaDiaria: numeroDiasComEntrada ? r2(atual.entradas / numeroDiasComEntrada) : 0,
      diasComMovimento: numeroDiasComEntrada,
      composicao: { caixaLoja: atual.caixaLoja, ceasa: atual.ceasa, comandasEntregues: atual.comandasEntregues },
      saidasComposicao: { contasPagas: atual.contasPagasTotal, sangrias: atual.sangrias },
      melhorDia,
      piorDia,
      anterior: { entradas: anterior.entradas, saidas: anterior.saidas, resultado: anterior.resultado, numeroComandas: anterior.numeroComandas, vendasComandas: anterior.vendasComandas },
      variacao: {
        entradas: variacao(atual.entradas, anterior.entradas),
        saidas: variacao(atual.saidas, anterior.saidas),
        resultado: variacao(atual.resultado, anterior.resultado),
        numeroComandas: variacao(atual.numeroComandas, anterior.numeroComandas),
        vendasComandas: variacao(atual.vendasComandas, anterior.vendasComandas),
      },
    },
    porDia,
    entradasPorSemana,
    vendas: {
      numeroComandas: validas.length,
      totalComandas: somaPedidos(validas),
      ticketMedio,
      canceladas,
      descontos: r2(validas.reduce((s, p) => s + Number(p.desconto), 0)),
      taxasEntrega: r2(validas.reduce((s, p) => s + Number(p.taxaEntrega), 0)),
      delivery: { quantidade: delivery.length, total: somaPedidos(delivery) },
      retirada: { quantidade: validas.length - delivery.length, total: r2(somaPedidos(validas) - somaPedidos(delivery)) },
      site: { quantidade: doSite.length, total: somaPedidos(doSite) },
      encomendas: { quantidade: encomendas.length, total: somaPedidos(encomendas) },
      vendasAPrazo: { quantidade: vendasAPrazo.length, total: r2(vendasAPrazo.reduce((s, c) => s + Number(c.valorOriginal), 0)) },
      recebidoNoSistema: r2(pagamentos.reduce((s, pg) => s + Number(pg.valor), 0)),
      formasPagamento,
      porHora: comandasPorHora,
      horaPico: horaPico ? { hora: horaPico.hora, quantidade: horaPico.quantidade } : null,
    },
    carnes: {
      kgVendidos: r3(kgTotal),
      faturamentoItens: r2(faturamentoItens),
      precoMedioKg: kgTotal > 0 ? r2(produtos.filter((p) => p.unidade === "kg").reduce((s, p) => s + p.faturamento, 0) / kgTotal) : 0,
      cortesDiferentes: produtos.length,
      produtosAtivos: produtosAtivos.length,
      semVenda,
      ajustesPreco: { total: r2(ajustesPreco), itens: itensComAjuste },
      produtos,
      porCategoria: Array.from(porCategoria.entries())
        .map(([categoria, total]) => ({ categoria, total: r2(total) }))
        .sort((a, b) => b.total - a.total),
    },
    funcionarios: {
      ativos: ativos.length,
      registrados: ativos.filter((f) => f.registrado).length,
      naoRegistrados: ativos.filter((f) => !f.registrado).length,
      folhaSemanal: r2(folhaSemanal),
      folhaMensalEstimada: r2((folhaSemanal * 52) / 12),
      salariosPrevistos: r2(salariosPrevistos),
      salariosPagos: r2(salariosPagos),
      salariosPendentes: r2(Math.max(salariosPrevistos - salariosPagos, 0)),
      pesoNaReceita: atual.entradas > 0 ? r2((salariosPrevistos / atual.entradas) * 100) : null,
      lista: listaFuncionarios,
      equipe,
    },
    gastos: {
      totalPago: atual.saidas,
      contasPagas: atual.contasPagasTotal,
      sangrias: atual.sangrias,
      porCategoria: Array.from(gastosPorCategoria.entries())
        .map(([categoria, total]) => ({ categoria, total: r2(total) }))
        .sort((a, b) => b.total - a.total),
      topFornecedores: Array.from(porFornecedor.entries())
        .map(([fornecedor, total]) => ({ fornecedor, total: r2(total) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      sangriasDetalhe,
    },
    contas: {
      vencemNoPeriodo: { quantidade: contasVencendo.length, total: r2(venceNoPeriodo), pago: r2(pagoDoQueVence), aberto: r2(Math.max(venceNoPeriodo - pagoDoQueVence, 0)) },
      emAbertoHoje: { quantidade: contasAbertasTodas.length, total: r2(contasAbertasTodas.reduce((s, c) => s + saldoConta(c), 0)) },
      vencidas: {
        quantidade: vencidasAgora.length,
        total: r2(vencidasAgora.reduce((s, c) => s + saldoConta(c), 0)),
        lista: vencidasAgora.slice(0, 15).map((c) => ({ fornecedor: c.fornecedor, descricao: c.descricao, vencimento: diaCalendario(c.vencimento), saldo: r2(saldoConta(c)) })),
      },
      proximos7dias: {
        quantidade: proximas.length,
        total: r2(proximas.reduce((s, c) => s + saldoConta(c), 0)),
        lista: proximas.slice(0, 15).map((c) => ({ fornecedor: c.fornecedor, descricao: c.descricao, vencimento: diaCalendario(c.vencimento), saldo: r2(saldoConta(c)) })),
      },
      aReceber: {
        total: r2(contasReceberAbertas.reduce((s, c) => s + Number(c.saldo), 0)),
        vencido: r2(vencidoReceber.reduce((s, c) => s + Number(c.saldo), 0)),
        clientesDevendo: devedores.size,
        clientesAtrasados: Array.from(devedores.values()).filter((d) => d.vencido > 0).length,
        devedores: Array.from(devedores.values())
          .map((d) => ({ ...d, saldo: r2(d.saldo), vencido: r2(d.vencido) }))
          .sort((a, b) => b.saldo - a.saldo)
          .slice(0, 15),
      },
    },
    clientes: {
      compraram: topClientes.length,
      novos: novosClientes,
      ativos: totalClientesAtivos,
      consumidorFinal: validas.filter((p) => !p.clienteId).length,
      top: topClientes.slice(0, 10),
    },
  };
}

export type RelatorioCompleto = Awaited<ReturnType<typeof relatorioCompleto>>;
