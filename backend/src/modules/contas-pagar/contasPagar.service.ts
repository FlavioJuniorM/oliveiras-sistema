import { gerarSalariosDeSabado } from "../funcionarios/funcionarios.service";
import { formatarDataCalendario, hojeCalendario } from "../../shared/datas";
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
  codigoBarras?: string | null;
  criadoPorId: string;
}

interface FiltrosContaPagar {
  status?: "PENDENTE" | "PAGO" | "VENCIDO" | "PARCIAL";
  categoria?: string;
}

export async function listarContasPagar(filtros: FiltrosContaPagar) {
  // Salários de sábado dos funcionários entram sozinhos
  await gerarSalariosDeSabado();
  const statusDoBanco = filtros.status && filtros.status !== "VENCIDO" ? filtros.status : undefined;
  const contas = await prisma.contaPagar.findMany({
    where: { status: statusDoBanco, categoria: filtros.categoria },
    orderBy: { vencimento: "asc" },
    include: { funcionario: { select: { id: true, nome: true, chavePix: true, registrado: true } } },
  });

  // Marca como vencida (na leitura) qualquer conta pendente/parcial cujo vencimento já passou
  const hoje = hojeCalendario();
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
    detalhes: `Lançou conta a pagar de ${conta.fornecedor} — R$ ${conta.valor} (venc. ${formatarDataCalendario(conta.vencimento)})`,
  });

  return conta;
}

/**
 * Boleto dividido em duas datas: lança duas contas, cada uma com metade do valor.
 * Se o valor não divide exato, o centavo que sobra vai para a primeira parcela.
 */
export async function criarContaPagarDividida(
  input: CriarContaPagarInput & { segundoVencimento: Date; codigoBarras2?: string | null }
) {
  const { criadoPorId, segundoVencimento, descricao, valor, codigoBarras, codigoBarras2, ...dados } = input;
  const totalCentavos = Math.round(valor * 100);
  const segundaCentavos = Math.floor(totalCentavos / 2);
  const parcelas = [
    { valor: (totalCentavos - segundaCentavos) / 100, vencimento: dados.vencimento, sufixo: "1/2", codigo: codigoBarras || null },
    { valor: segundaCentavos / 100, vencimento: segundoVencimento, sufixo: "2/2", codigo: codigoBarras2 || null },
  ];

  const contas = await prisma.$transaction(
    parcelas.map((p) =>
      prisma.contaPagar.create({
        data: {
          ...dados,
          descricao: `${descricao} (boleto ${p.sufixo})`,
          valor: p.valor,
          vencimento: p.vencimento,
          codigoBarras: p.codigo,
          status: "PENDENTE",
        },
      })
    )
  );

  for (const conta of contas) {
    await registrarLog({
      usuarioId: criadoPorId,
      acao: "CRIOU_CONTA_PAGAR",
      entidade: "conta_pagar",
      entidadeId: conta.id,
      detalhes: `Lançou conta a pagar de ${conta.fornecedor} — R$ ${conta.valor} (venc. ${formatarDataCalendario(conta.vencimento)}) — boleto dividido em 2`,
    });
  }

  return contas;
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

interface AlterarContaPagarInput {
  codigoBarras?: string | null;
  fornecedor: string;
  descricao: string;
  categoria: string;
  valor: number;
  dataLancamento: Date;
  vencimento: Date;
  observacoes?: string | null;
}

/** Altera os dados de uma conta. O status é recalculado se o valor mudar. */
export async function alterarContaPagar(id: string, dados: AlterarContaPagarInput, usuarioId: string) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new ErroContaPagar("Conta não encontrada.");

  const valorPago = Number(conta.valorPago);
  if (dados.valor + 0.001 < valorPago) {
    throw new ErroContaPagar(
      `O valor não pode ser menor que o que já foi pago (R$ ${valorPago.toFixed(2).replace(".", ",")}).`
    );
  }

  let status = conta.status;
  if (status !== "CANCELADO") {
    status = valorPago >= dados.valor - 0.001 && valorPago > 0 ? "PAGO" : valorPago > 0 ? "PARCIAL" : "PENDENTE";
  }

  const atualizada = await prisma.contaPagar.update({
    where: { id },
    data: { ...dados, observacoes: dados.observacoes || null, codigoBarras: dados.codigoBarras || null, status },
  });

  await registrarLog({
    usuarioId,
    acao: "ALTEROU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: id,
    detalhes: `Alterou conta de ${conta.fornecedor} — antes R$ ${conta.valor} venc. ${formatarDataCalendario(conta.vencimento)} (${conta.categoria}); agora R$ ${atualizada.valor} venc. ${formatarDataCalendario(atualizada.vencimento)} (${atualizada.categoria})`,
  });

  return atualizada;
}

/** Exclui a conta de vez. O registro do que foi apagado fica no log. */
export async function excluirContaPagar(id: string, usuarioId: string) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new ErroContaPagar("Conta não encontrada.");

  await prisma.contaPagar.delete({ where: { id } });

  await registrarLog({
    usuarioId,
    acao: "EXCLUIU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: id,
    detalhes: `Excluiu conta de ${conta.fornecedor} — ${conta.descricao} — R$ ${conta.valor} (venc. ${formatarDataCalendario(conta.vencimento)}, pago R$ ${conta.valorPago})`,
  });
}
