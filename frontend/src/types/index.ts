export type Papel = "FUNCIONARIO" | "ADMINISTRATIVO";

export interface Usuario {
  id: string;
  nome: string;
  papel: Papel;
}

export interface Cliente {
  id: string;
  tipo: "PESSOA_FISICA" | "EMPRESA" | "EVENTO";
  nome: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  documento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  limiteCredito?: string | number | null;
  prazoPadraoDias?: number | null;
  status: "ATIVO" | "INATIVO";
}

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  tipoVenda: "PESO" | "UNIDADE" | "PACOTE_FIXO";
  unidadeMedida: string;
  /** Unidade em que o preço é cobrado (ex.: kg), preservada para exibição */
  unidadePreco?: string;
  preco: string | number;
  status: "ATIVO" | "INATIVO";
  categoria?: { id: string; nome: string } | null;
}

export type StatusPagamentoPedido =
  | "PENDENTE"
  | "PARCIALMENTE_PAGO"
  | "PAGO"
  | "VENCIDO"
  | "CANCELADO";

export type StatusOperacaoPedido =
  | "RECEBIDO"
  | "EM_PREPARO"
  | "EXPEDICAO"
  | "PRONTO"
  | "AGUARDANDO_RETIRADA"
  | "EM_ENTREGA"
  | "ENTREGUE";

export type StatusPreparoItem = "PENDENTE" | "EM_CORTE" | "CORTADO";
export type UnidadePedido = "kg" | "g" | "peca" | "unidade" | "outra";
export type CanalPedido = "INTERNO" | "PUBLICO";
export type TipoEntrega = "RETIRADA" | "DELIVERY";
export type MomentoPagamentoPedido = "NA_RETIRADA" | "NA_ENTREGA";

export interface PedidoItem {
  id: string;
  produtoId: string;
  produto?: Produto;
  pesoOuQtd: string | number;
  unidadePedido: UnidadePedido;
  observacao?: string | null;
  pesoReal?: string | number | null;
  statusPreparo: StatusPreparoItem;
  preparadoPor?: { id?: string; nome: string } | null;
  cortadoPor?: { id?: string; nome: string } | null;
  precoUnitario: string | number;
  subtotal: string | number;
}

export interface Pedido {
  id: string;
  numero: string;
  clienteId?: string | null;
  cliente?: Cliente | null;
  usuario?: { nome: string };
  canal?: CanalPedido;
  tipoEntrega?: TipoEntrega;
  momentoPagamento?: MomentoPagamentoPedido | null;
  taxaEntrega?: string | number;
  nomeCliente?: string | null;
  telefoneCliente?: string | null;
  emailCliente?: string | null;
  enderecoEntrega?: string | null;
  observacoesCliente?: string | null;
  tokenAcompanhamento?: string | null;
  subtotal: string | number;
  desconto: string | number;
  total: string | number;
  statusPagamento: StatusPagamentoPedido;
  statusOperacao: StatusOperacaoPedido;
  vencimento?: string | null;
  /** Encomenda para outro dia (AAAA-MM-DD...). Vazio = pedido do dia em que foi anotado. */
  dataAgendada?: string | null;
  criadoEm: string;
  itens: PedidoItem[];
  pagamentos?: { id: string; forma: string; valor: string | number; criadoEm: string }[];
  contaReceber?: { valorOriginal: string | number; saldo: string | number; vencimento: string; status: string } | null;
  statusHistorico?: { id: string; status: StatusOperacaoPedido; criadoEm: string; observacao?: string | null }[];
}

export interface HistoricoCliente {
  cliente: Cliente;
  limiteCredito: number | null;
  totalComprado: number;
  totalPago: number;
  totalEmAberto: number;
  totalVencido: number;
  ultimaCompra: string | null;
  pedidos: Pedido[];
}

export interface DashboardData {
  vendasHoje: number;
  recebidoHoje: number;
  aReceberHoje: number;
  vendasMes: number;
  totalAReceber: number;
  totalVencido: number;
  numeroPedidosHoje: number;
  clientesAtendidosHoje: number;
  produtosMaisVendidos: { nome: string; quantidade: number; faturamento: number }[];
  produtosMenosVendidos: { nome: string; quantidade: number; faturamento: number }[];
  clientesMaisCompraram: { id: string; nome: string; pedidos: number; valorComprado: number }[];
  clientesMenosCompraram: { id: string; nome: string; pedidos: number; valorComprado: number }[];
  pedidosEmPreparo: number;
  pedidosEmEntrega: number;
  contasReceberProximasVencimento: any[];
  contasReceberVencidas: any[];
  contasPagarProximasVencimento: any[];
}
