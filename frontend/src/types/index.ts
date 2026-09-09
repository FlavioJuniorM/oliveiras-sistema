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
  status: "ATIVO" | "INATIVO";
}

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  tipoVenda: "PESO" | "UNIDADE" | "PACOTE_FIXO";
  unidadeMedida: string;
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
  | "EM_ENTREGA"
  | "ENTREGUE";

export type StatusPreparoItem = "PENDENTE" | "EM_CORTE" | "CORTADO";

export interface PedidoItem {
  id: string;
  produtoId: string;
  produto?: Produto;
  pesoOuQtd: string | number;
  pesoReal?: string | number | null;
  statusPreparo: StatusPreparoItem;
  preparadoPor?: { nome: string } | null;
  cortadoPor?: { nome: string } | null;
  precoUnitario: string | number;
  subtotal: string | number;
}

export interface Pedido {
  id: string;
  numero: string;
  clienteId?: string | null;
  cliente?: Cliente | null;
  usuario?: { nome: string };
  subtotal: string | number;
  desconto: string | number;
  total: string | number;
  statusPagamento: StatusPagamentoPedido;
  statusOperacao: StatusOperacaoPedido;
  vencimento?: string | null;
  criadoEm: string;
  itens: PedidoItem[];
  pagamentos?: { id: string; forma: string; valor: string | number; criadoEm: string }[];
  contaReceber?: { valorOriginal: string | number; saldo: string | number; vencimento: string; status: string } | null;
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
