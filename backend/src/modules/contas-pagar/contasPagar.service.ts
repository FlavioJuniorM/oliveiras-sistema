import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

interface CriarContaPagarInput {
  fornecedor: string;
  descricao: string;
  categoria: string;
  valor: number;
  dataLancamento: Date;
  vencimento: Date;
  observacoes?: string;
  criadoPorId: string;
}

interface FiltrosContaPagar {
  status?: "PENDENTE" | "PAGO" | "VENCIDO" | "PARCIAL";
  categoria?: string;
}

export async function listarContasPagar(filtros: FiltrosContaPagar) {
  const contas = await prisma.contaPagar.findMany({
    where: { status: filtros.status, categoria: filtros.categoria },
    orderBy: { vencimento: "asc" },
  });

  // Marca como vencida (na leitura) qualquer conta pendente/parcial cujo vencimento já passou
  const hoje = new Date();
  return contas.map((c) => {
    const vencida =
      (c.status === "PENDENTE" || c.status === "PARCIAL") && c.vencimento < hoje;
    return { ...c, status: vencida ? "VENCIDO" : c.status };
  });
}

export async function criarContaPagar(input: CriarContaPagarInput) {
  const { criadoPorId, ...dados } = input;

  const conta = await prisma.contaPagar.create({ data: { ...dados, status: "PENDENTE" } });

  await registrarLog({
    usuarioId: criadoPorId,
    acao: "CRIOU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: conta.id,
    detalhes: `Lançou conta a pagar de ${conta.fornecedor} — R$ ${conta.valor} (venc. ${conta.vencimento.toLocaleDateString("pt-BR")})`,
  });

  return conta;
}

/**
 * Registra a baixa (pagamento) de uma conta a pagar — total ou parcial.
 * Igual ao módulo de contas a receber, mantém o histórico em vez de apagar.
 */
export async function pagarContaPagar(
  id: string,
  valorPago: number,
  formaPagamento: string,
  usuarioId: string
) {
  const conta = await prisma.contaPagar.findUniqueOrThrow({ where: { id } });

  const quitado = valorPago >= Number(conta.valor);

  const contaAtualizada = await prisma.contaPagar.update({
    where: { id },
    data: {
      status: quitado ? "PAGO" : "PARCIAL",
      dataPagamento: quitado ? new Date() : conta.dataPagamento,
      formaPagamento,
    },
  });

  await registrarLog({
    usuarioId,
    acao: "PAGOU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: conta.id,
    detalhes: `Registrou pagamento de R$ ${valorPago} para ${conta.fornecedor} (${formaPagamento})`,
  });

  return contaAtualizada;
}

export async function excluirLancamentoContaPagar(id: string, usuarioId: string) {
  const conta = await prisma.contaPagar.findUniqueOrThrow({ where: { id } });

  // Não apaga do banco — apenas marca como cancelada, mantendo o histórico (regra 18)
  const contaCancelada = await prisma.contaPagar.update({
    where: { id },
    data: { observacoes: `${conta.observacoes ?? ""}\n[Lançamento cancelado]`.trim() },
  });

  await registrarLog({
    usuarioId,
    acao: "CANCELOU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: conta.id,
    detalhes: `Cancelou o lançamento de ${conta.fornecedor} — R$ ${conta.valor}`,
  });

  return contaCancelada;
}
