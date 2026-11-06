import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { gerarNumeroPedido } from "./numeroPedido";
import { dataNaLoja, periodoNaLoja } from "../../shared/datas";
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
  /** Como o cliente quer o corte: "bife fino", "moer 2x", "cubos" */
  observacao?: string;
}

function limparObservacao(observacao?: string | null) {
  const texto = observacao?.trim();
  return texto ? texto.slice(0, 200) : null;
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
  /** "AAAA-MM-DD" — pedido para um dia futuro */
  dataAgendada?: string;
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
    dataAgendada,
  } = input;

  if (itens.length === 0) {
    throw new ErroPedido("O pedido precisa ter ao menos um item.");
  }

  // Pedido para outro dia: só datas futuras (hoje é o padrão, sem data)
  let dataAgendadaCalendario: Date | null = null;
  if (dataAgendada) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataAgendada)) throw new ErroPedido("Data do pedido inválida.");
    if (dataAgendada <= dataNaLoja()) throw new ErroPedido("Para data futura, escolha um dia a partir de amanhã. Para hoje, marque “Pedido para hoje”.");
    dataAgendadaCalendario = new Date(`${dataAgendada}T00:00:00Z`);
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
      observacao: limparObservacao(item.observacao),
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
        dataAgendada: dataAgendadaCalendario,
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
            observacao: i.observacao,
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
        detalhes: `Adicionou ${item.nome} — ${item.pesoOuQtd} ${item.unidadePedido}${item.observacao ? ` (${item.observacao})` : ""}`,
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

const INCLUDE_LISTA_PEDIDOS = {
  cliente: true,
  usuario: { select: { nome: true } },
  itens: {
    include: {
      produto: true,
      preparadoPor: { select: { id: true, nome: true } },
      cortadoPor: { select: { id: true, nome: true } },
    },
  },
  pagamentos: true,
  contaReceber: true,
} satisfies Prisma.PedidoInclude;

export async function listarPedidos(filtros: { status?: string; clienteId?: string }) {
  return prisma.pedido.findMany({
    where: {
      statusPagamento: filtros.status as any,
      clienteId: filtros.clienteId,
    },
    include: INCLUDE_LISTA_PEDIDOS,
    orderBy: { criadoEm: "desc" },
    take: 100,
  });
}

/**
 * Painel "Pedidos do Dia".
 * - Dia de hoje: comandas anotadas hoje + comandas de dias anteriores que ainda
 *   não foram entregues (nada em aberto some do painel) + as entregues hoje.
 * - Dia passado: tudo o que foi anotado naquele dia (consulta de histórico).
 * Canceladas nunca aparecem.
 */
export async function listarPainelDoDia(data?: string) {
  const hoje = dataNaLoja();
  const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hoje;
  const { inicio, fim } = periodoNaLoja(dia, dia);
  const diaCalendario = new Date(`${dia}T00:00:00Z`);

  const where: Prisma.PedidoWhereInput =
    dia === hoje
      ? {
          statusPagamento: { not: "CANCELADO" },
          // Encomendas para dias futuros só aparecem no dia delas
          AND: [{ OR: [{ dataAgendada: null }, { dataAgendada: { lte: diaCalendario } }] }],
          OR: [
            { criadoEm: { gte: inicio }, dataAgendada: null },
            { dataAgendada: diaCalendario },
            { statusOperacao: { not: "ENTREGUE" } },
            { statusHistorico: { some: { status: "ENTREGUE", criadoEm: { gte: inicio } } } },
          ],
        }
      : {
          statusPagamento: { not: "CANCELADO" },
          OR: [{ dataAgendada: diaCalendario }, { dataAgendada: null, criadoEm: { gte: inicio, lte: fim } }],
        };

  return prisma.pedido.findMany({ where, include: INCLUDE_LISTA_PEDIDOS, orderBy: { criadoEm: "desc" }, take: 500 });
}

/** Encomendas dos próximos dias: quantas comandas por data. */
export async function listarAgendados() {
  const amanha = new Date(`${dataNaLoja()}T00:00:00Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const grupos = await prisma.pedido.groupBy({
    by: ["dataAgendada"],
    where: { statusPagamento: { not: "CANCELADO" }, dataAgendada: { gte: amanha } },
    _count: { _all: true },
    orderBy: { dataAgendada: "asc" },
  });
  return grupos.map((g) => ({ data: g.dataAgendada!.toISOString().slice(0, 10), quantidade: g._count._all }));
}

/** Contas a receber de verdade: vendas a prazo com saldo em aberto (de qualquer data). */
export async function listarAReceber() {
  return prisma.pedido.findMany({
    where: {
      statusPagamento: { not: "CANCELADO" },
      contaReceber: { status: { in: ["PENDENTE", "PARCIAL", "VENCIDO"] }, saldo: { gt: 0 } },
    },
    include: INCLUDE_LISTA_PEDIDOS,
    orderBy: { contaReceber: { vencimento: "asc" } },
  });
}

const STATUS_OPERACAO = [
  "RECEBIDO",
  "EM_PREPARO",
  "EXPEDICAO",
  "PRONTO",
  "AGUARDANDO_RETIRADA",
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

const FORMAS_RECEBIMENTO = ["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO"] as const;
export type FormaRecebimento = (typeof FORMAS_RECEBIMENTO)[number];

/**
 * Saída da comanda depois de fechada:
 *   PRONTO → AGUARDANDO_RETIRADA (cliente vem buscar) → ENTREGUE
 *   PRONTO → EM_ENTREGA (motoboy em rota)             → ENTREGUE
 * Ao concluir, se ainda houver valor a receber (e não for venda a prazo),
 * a forma recebida (dinheiro, pix, cartão) é obrigatória e vira pagamento.
 */
export async function atualizarStatusOperacaoPedido(
  pedidoId: string,
  statusOperacao: StatusOperacaoPedido,
  usuarioId: string,
  opcoes: { enderecoEntrega?: string; formaRecebida?: FormaRecebimento } = {}
) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { cliente: true, pagamentos: true, contaReceber: true },
  });

  if (!pedido) {
    throw new ErroPedido("Pedido não encontrado.");
  }
  if (pedido.statusPagamento === "CANCELADO") {
    throw new ErroPedido("Não é possível movimentar um pedido cancelado.");
  }

  // EXPEDICAO é legado e equivale a PRONTO
  const atual = pedido.statusOperacao === "EXPEDICAO" ? "PRONTO" : pedido.statusOperacao;
  const transicoes: Record<string, StatusOperacaoPedido[]> = {
    PRONTO: ["AGUARDANDO_RETIRADA", "EM_ENTREGA"],
    AGUARDANDO_RETIRADA: ["ENTREGUE", "PRONTO"],
    EM_ENTREGA: ["ENTREGUE", "PRONTO"],
  };

  if (atual === "RECEBIDO" || atual === "EM_PREPARO") {
    throw new ErroPedido("Pese todos os itens e feche a comanda antes de dar saída.");
  }
  if (!transicoes[atual]?.includes(statusOperacao)) {
    throw new ErroPedido("Movimentação não permitida para esta comanda.");
  }

  const total = Number(pedido.total);
  const totalPago = pedido.pagamentos.reduce((soma, pagamento) => soma + Number(pagamento.valor), 0);
  const saldo = Number(Math.max(total - totalPago, 0).toFixed(2));
  const cobrarNoRecebimento = saldo > TOLERANCIA_CENTAVOS && !pedido.contaReceber;

  const dados: Prisma.PedidoUpdateInput = { statusOperacao };

  if (statusOperacao === "AGUARDANDO_RETIRADA") {
    dados.tipoEntrega = "RETIRADA";
    if (cobrarNoRecebimento) dados.momentoPagamento = "NA_RETIRADA";
  }

  if (statusOperacao === "EM_ENTREGA") {
    const endereco = opcoes.enderecoEntrega?.trim() || pedido.enderecoEntrega || pedido.cliente?.endereco;
    if (!endereco) {
      throw new ErroPedido("Informe o endereço de entrega para mandar o pedido para a rota.");
    }
    dados.tipoEntrega = "DELIVERY";
    dados.enderecoEntrega = endereco;
    if (cobrarNoRecebimento) dados.momentoPagamento = "NA_ENTREGA";
  }

  if (statusOperacao === "ENTREGUE" && cobrarNoRecebimento) {
    if (!opcoes.formaRecebida) {
      throw new ErroPedido(`Informe como o cliente pagou os ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
    }
    dados.statusPagamento = "PAGO";
  }

  await prisma.$transaction(async (tx) => {
    if (statusOperacao === "ENTREGUE" && cobrarNoRecebimento) {
      await tx.pagamento.create({
        data: { pedidoId, forma: opcoes.formaRecebida!, valor: saldo, usuarioId },
      });
    }

    await tx.pedido.update({ where: { id: pedidoId }, data: dados });

    const observacoes: Record<string, string> = {
      AGUARDANDO_RETIRADA: "Aguardando o cliente retirar",
      EM_ENTREGA: "Saiu para entrega com o motoboy",
      ENTREGUE: atual === "EM_ENTREGA" ? "Entregue ao cliente" : "Retirado pelo cliente",
      PRONTO: "Voltou para prontos",
    };
    await registrarHistoricoStatus(tx, pedidoId, statusOperacao, observacoes[statusOperacao]);
  });

  await registrarLog({
    usuarioId,
    acao: "ALTEROU_STATUS_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Alterou o pedido ${pedido.numero} para ${statusOperacao}${
      statusOperacao === "ENTREGUE" && cobrarNoRecebimento ? ` — recebeu R$ ${saldo} em ${opcoes.formaRecebida}` : ""
    }`,
  });

  return obterPedido(pedidoId);
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
  | "NA_ENTREGA"
  | "NO_RECEBIMENTO";

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

  // "NO_RECEBIMENTO": cobrar quando o cliente retirar ou quando o motoboy entregar (maquininha)
  const pagamentoNaEntrega =
    input.formaPagamento === "NA_RETIRADA" || input.formaPagamento === "NA_ENTREGA" || input.formaPagamento === "NO_RECEBIMENTO";
  if (pagamentoNaEntrega && input.formaPagamento !== "NO_RECEBIMENTO" && pedido.canal === "PUBLICO") {
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
          forma: input.formaPagamento as Exclude<FormaPagamentoFinal, "A_PRAZO" | "NA_RETIRADA" | "NA_ENTREGA" | "NO_RECEBIMENTO">,
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
        statusOperacao: "PRONTO",
        statusPagamento: input.formaPagamento === "A_PRAZO" || pagamentoNaEntrega ? "PENDENTE" : "PAGO",
        vencimento: input.formaPagamento === "A_PRAZO" ? input.vencimento : null,
      },
    });

    if (pedido.statusOperacao !== "PRONTO") {
      await registrarHistoricoStatus(tx, pedidoId, "PRONTO", "Comanda fechada — pronta para retirada ou entrega");
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
export async function cancelarPedido(pedidoId: string, usuarioId: string, motivo?: string) {
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

    const atualizado = await tx.pedido.update({
      where: { id: pedidoId },
      data: { statusPagamento: "CANCELADO" },
    });
    await registrarHistoricoStatus(tx, pedidoId, pedido.statusOperacao as StatusOperacaoPedido, `Comanda cancelada${motivo ? `: ${motivo}` : ""}`);
    return atualizado;
  });

  await registrarLog({
    usuarioId,
    acao: "CANCELOU_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Cancelou o pedido ${pedido.numero}${motivo ? ` — motivo: ${motivo}` : ""}`,
  });

  void pedidoCancelado;
  return obterPedido(pedidoId);
}


// ---------------------------------------------------------------------------
// Edição da comanda depois de salva (cliente ligou de volta e pediu mais algo)
// Permitida enquanto a comanda não foi fechada (Recebidos / Em preparo).
// ---------------------------------------------------------------------------

async function carregarComandaEditavel(pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { itens: true } });
  if (!pedido) throw new ErroPedido("Pedido não encontrado.");
  if (pedido.statusPagamento === "CANCELADO") throw new ErroPedido("Esta comanda está cancelada.");
  if (pedido.statusOperacao !== "RECEBIDO" && pedido.statusOperacao !== "EM_PREPARO") {
    throw new ErroPedido("A comanda já foi fechada. Não é possível alterar os itens.");
  }
  return pedido;
}

/** Total da comanda = soma dos itens já pesados. */
async function recalcularTotalComanda(tx: Prisma.TransactionClient, pedidoId: string) {
  const itens = await tx.pedidoItem.findMany({ where: { pedidoId } });
  const total = Number(
    itens.reduce((soma, item) => soma + (item.statusPreparo === "CORTADO" ? Number(item.subtotal) : 0), 0).toFixed(2)
  );
  await tx.pedido.update({ where: { id: pedidoId }, data: { subtotal: total, desconto: 0, total } });
}

export async function adicionarItemPedido(pedidoId: string, input: ItemPedidoInput, usuarioId: string) {
  const pedido = await carregarComandaEditavel(pedidoId);
  const produto = await prisma.produto.findUnique({ where: { id: input.produtoId } });
  if (!produto) throw new ErroPedido("Produto não encontrado.");
  if (produto.status !== "ATIVO") throw new ErroPedido(`O produto "${produto.nome}" está inativo.`);
  if (input.pesoOuQtd <= 0) throw new ErroPedido("Informe a quantidade.");

  const unidadePedido = input.unidadePedido ?? unidadePadraoProduto(produto.unidadeMedida);
  await prisma.pedidoItem.create({
    data: {
      pedidoId,
      produtoId: produto.id,
      pesoOuQtd: input.pesoOuQtd,
      unidadePedido,
      observacao: limparObservacao(input.observacao),
      precoUnitario: Number(produto.preco),
      subtotal: 0,
    },
  });

  await registrarLog({
    usuarioId,
    acao: "ADICIONOU_ITEM_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Incluiu na comanda ${pedido.numero}: ${produto.nome} — ${input.pesoOuQtd} ${unidadePedido}`,
  });

  return obterPedido(pedidoId);
}

export async function alterarItemPedido(
  pedidoId: string,
  itemId: string,
  input: { pesoOuQtd?: number; unidadePedido?: UnidadePedido; observacao?: string | null },
  usuarioId: string
) {
  const pedido = await carregarComandaEditavel(pedidoId);
  const item = pedido.itens.find((atual) => atual.id === itemId);
  if (!item) throw new ErroPedido("Item não encontrado nesta comanda.");

  const mudaQuantidade = input.pesoOuQtd !== undefined || input.unidadePedido !== undefined;
  if (mudaQuantidade && item.statusPreparo === "CORTADO") {
    throw new ErroPedido("Este item já foi pesado. Use “Corrigir peso” antes de mudar a quantidade pedida.");
  }
  if (input.pesoOuQtd !== undefined && input.pesoOuQtd <= 0) throw new ErroPedido("Informe a quantidade.");

  await prisma.pedidoItem.update({
    where: { id: itemId },
    data: {
      pesoOuQtd: input.pesoOuQtd,
      unidadePedido: input.unidadePedido,
      observacao: input.observacao === undefined ? undefined : limparObservacao(input.observacao),
    },
  });

  await registrarLog({
    usuarioId,
    acao: "ALTEROU_ITEM_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Alterou item da comanda ${pedido.numero}: ${input.pesoOuQtd ?? item.pesoOuQtd} ${input.unidadePedido ?? item.unidadePedido}${input.observacao ? ` (${input.observacao})` : ""}`,
  });

  return obterPedido(pedidoId);
}

export async function removerItemPedido(pedidoId: string, itemId: string, usuarioId: string) {
  const pedido = await carregarComandaEditavel(pedidoId);
  const item = pedido.itens.find((atual) => atual.id === itemId);
  if (!item) throw new ErroPedido("Item não encontrado nesta comanda.");
  if (pedido.itens.length === 1) {
    throw new ErroPedido("Este é o único item da comanda. Para tirar tudo, cancele a comanda.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.pedidoItem.delete({ where: { id: itemId } });
    await recalcularTotalComanda(tx, pedidoId);
  });

  await registrarLog({
    usuarioId,
    acao: "REMOVEU_ITEM_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Removeu item da comanda ${pedido.numero}: ${item.pesoOuQtd} ${item.unidadePedido}`,
  });

  return obterPedido(pedidoId);
}

/**
 * Preço especial só desta comanda (desconto para um cliente).
 * Muda apenas o preço gravado no item; o preço padrão em Carnes e Cortes não é tocado.
 */
export async function alterarPrecoItemPedido(
  pedidoId: string,
  itemId: string,
  precoUnitario: number,
  usuarioId: string
) {
  const pedido = await carregarComandaEditavel(pedidoId);
  const item = pedido.itens.find((atual) => atual.id === itemId);
  if (!item) throw new ErroPedido("Item não encontrado nesta comanda.");
  if (!(precoUnitario > 0)) throw new ErroPedido("Informe um preço maior que zero.");

  const produto = await prisma.produto.findUnique({ where: { id: item.produtoId } });
  const precoAnterior = Number(item.precoUnitario);
  const pesado = item.statusPreparo === "CORTADO" && item.pesoReal != null;

  await prisma.$transaction(async (tx) => {
    await tx.pedidoItem.update({
      where: { id: itemId },
      data: {
        precoUnitario,
        subtotal: pesado ? calcularSubtotalPesado(precoUnitario, Number(item.pesoReal)) : 0,
      },
    });
    await recalcularTotalComanda(tx, pedidoId);
  });

  await registrarLog({
    usuarioId,
    acao: "ALTEROU_PRECO_ITEM_PEDIDO",
    entidade: "pedido",
    entidadeId: pedidoId,
    detalhes: `Comanda ${pedido.numero}: preço de ${produto?.nome ?? "item"} de R$ ${precoAnterior.toFixed(2)} para R$ ${precoUnitario.toFixed(2)} (padrão R$ ${Number(produto?.preco ?? 0).toFixed(2)}) — só nesta comanda`,
  });

  return obterPedido(pedidoId);
}
