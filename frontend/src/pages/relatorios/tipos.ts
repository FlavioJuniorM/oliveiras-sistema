// Formato do GET /relatorios/completo (ver backend/src/modules/relatorios/relatorioCompleto.service.ts)

export interface Dia {
  data: string;
  caixaLoja: number;
  ceasa: number;
  comandas: number;
  sangrias: number;
  contasPagas: number;
  entradas: number;
  saidas: number;
}

type Variacao = number | null;
interface QtdTotal {
  quantidade: number;
  total: number;
}
export interface ContaResumo {
  fornecedor: string;
  descricao: string;
  vencimento: string;
  saldo: number;
}

export interface Relatorio {
  periodo: { inicio: string; fim: string; dias: number; anterior: { inicio: string; fim: string } };
  geradoEm: string;
  resumo: {
    entradas: number;
    saidas: number;
    resultado: number;
    margem: number | null;
    mediaDiaria: number;
    diasComMovimento: number;
    composicao: { caixaLoja: number; ceasa: number; comandasEntregues: number };
    saidasComposicao: { contasPagas: number; sangrias: number };
    melhorDia: Dia | null;
    piorDia: Dia | null;
    anterior: { entradas: number; saidas: number; resultado: number; numeroComandas: number; vendasComandas: number };
    variacao: { entradas: Variacao; saidas: Variacao; resultado: Variacao; numeroComandas: Variacao; vendasComandas: Variacao };
  };
  porDia: Dia[];
  entradasPorSemana: { rotulo: string; total: number; media: number }[];
  vendas: {
    numeroComandas: number;
    totalComandas: number;
    ticketMedio: number;
    canceladas: number;
    descontos: number;
    taxasEntrega: number;
    delivery: QtdTotal;
    retirada: QtdTotal;
    site: QtdTotal;
    encomendas: QtdTotal;
    vendasAPrazo: QtdTotal;
    recebidoNoSistema: number;
    formasPagamento: { forma: string; rotulo: string; total: number }[];
    porHora: { hora: number; quantidade: number; total: number }[];
    horaPico: { hora: number; quantidade: number } | null;
  };
  carnes: {
    kgVendidos: number;
    faturamentoItens: number;
    precoMedioKg: number;
    cortesDiferentes: number;
    produtosAtivos: number;
    semVenda: string[];
    ajustesPreco: { total: number; itens: number };
    produtos: {
      produtoId: string;
      nome: string;
      categoria: string;
      unidade: string;
      quantidade: number;
      kg: number;
      faturamento: number;
      vezes: number;
      ajustePreco: number;
      precoMedio: number;
    }[];
    porCategoria: { categoria: string; total: number }[];
  };
  funcionarios: {
    ativos: number;
    registrados: number;
    naoRegistrados: number;
    folhaSemanal: number;
    folhaMensalEstimada: number;
    salariosPrevistos: number;
    salariosPagos: number;
    salariosPendentes: number;
    pesoNaReceita: number | null;
    lista: {
      id: string;
      nome: string;
      funcao: string | null;
      registrado: boolean;
      ativo: boolean;
      salarioSemanal: number;
      sabados: number;
      previsto: number;
      pago: number;
      pendente: number;
    }[];
    equipe: { nome: string; comandas: number; vendas: number; recebido: number; kgCortado: number; itensCortados: number }[];
  };
  gastos: {
    totalPago: number;
    contasPagas: number;
    sangrias: number;
    porCategoria: { categoria: string; total: number }[];
    topFornecedores: { fornecedor: string; total: number }[];
    sangriasDetalhe: { data: string; valor: number; descricao: string }[];
  };
  contas: {
    vencemNoPeriodo: { quantidade: number; total: number; pago: number; aberto: number };
    emAbertoHoje: QtdTotal;
    vencidas: QtdTotal & { lista: ContaResumo[] };
    proximos7dias: QtdTotal & { lista: ContaResumo[] };
    aReceber: {
      total: number;
      vencido: number;
      clientesDevendo: number;
      clientesAtrasados: number;
      devedores: { nome: string; saldo: number; vencido: number; maisAntigo: string }[];
    };
  };
  clientes: {
    compraram: number;
    novos: number;
    ativos: number;
    consumidorFinal: number;
    top: { nome: string; total: number; comandas: number }[];
  };
}
