import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

export class ErroContaPagar extends Error {}

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
  const statusDoBanco = filtros.status && filtros.status !== "VENCIDO" ? filtros.status : undefined;
  const contas = await prisma.contaPagar.findMany({
    where: { status: statusDoBanco, categoria: filtros.categoria },
    orderBy: { vencimento: "asc" },
  });

  // Marca como vencida (na leitura) qualquer conta pendente/parcial cujo vencimento já passou
  const hoje = new Date();
  const comStatusAtualizado = contas.map((c) => {
    const vencida =
      (c.status === "PENDENTE" || c.status === "PARCIAL") && c.vencimento < hoje;
    const saldo = Math.max(Number(c.valor) - Number(c.valorPago), 0);
    return { ...c, saldo, percentualPago: Number(c.valor) > 0 ? Math.round((Number(c.valorPago) / Number(c.valor)) * 100) : 0, status: vencida ? "VENCIDO" : c.status };
  });

  return filtros.status === "VENCIDO"
    ? comStatusAtualizado.filter((conta) => conta.status === "VENCIDO")
    : comStatusAtualizado;
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

  const totalPago = Number((Number(conta.valorPago) + valorPago).toFixed(2));
  const quitado = totalPago >= Number(conta.valor);

  if (totalPago > Number(conta.valor) + 0.01) {
    throw new ErroContaPagar("O valor pago não pode ser maior que o saldo da conta.");
  }

  const contaAtualizada = await prisma.contaPagar.update({
    where: { id },
    data: {
      status: quitado ? "PAGO" : "PARCIAL",
      valorPago: totalPago,
      dataPagamento: new Date(),
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
    data: { status: "CANCELADO", observacoes: `${conta.observacoes ?? ""}\n[Lançamento cancelado]`.trim() },
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
