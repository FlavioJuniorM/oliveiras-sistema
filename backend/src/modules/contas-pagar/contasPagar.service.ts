import { randomUUID } from "node:crypto";
import { gerarSalariosDeSabado } from "../funcionarios/funcionarios.service";
import { dataNaLoja, formatarDataCalendario, hojeCalendario } from "../../shared/datas";
import { ajustarVencimento, motivoNaoUtil, proximoDiaUtil } from "../../shared/diasUteis";
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
  recorrente?: boolean;
  criadoPorId: string;
}

const DIA_MS = 86_400_000;

/** Dias entre o vencimento (já no dia útil) e o dia em que foi pago. 0 = pago em dia. */
export function diasDeAtraso(vencimento: Date, dataPagamento: Date | null, funcionarioId?: string | null) {
  if (!dataPagamento) return 0;
  const limite = funcionarioId ? vencimento : proximoDiaUtil(vencimento);
  const pago = new Date(`${dataNaLoja(dataPagamento)}T00:00:00Z`);
  return Math.max(Math.round((pago.getTime() - limite.getTime()) / DIA_MS), 0);
}

/**
 * Contas em aberto lançadas antes desta regra com vencimento em sábado, domingo ou feriado:
 * passam para o próximo dia útil, guardando a data do boleto. Salário de sábado fica no sábado.
 */
async function corrigirVencimentosForaDeDiaUtil() {
  const abertas = await prisma.contaPagar.findMany({
    where: { status: { in: ["PENDENTE", "PARCIAL"] }, funcionarioId: null, vencimentoOriginal: null },
    select: { id: true, vencimento: true },
  });
  for (const c of abertas) {
    if (!motivoNaoUtil(c.vencimento)) continue;
    const ajuste = ajustarVencimento(c.vencimento);
    await prisma.contaPagar.update({ where: { id: c.id }, data: ajuste });
  }
}

function somarMeses(base: Date, meses: number, dia: number) {
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimo)));
}

/**
 * Contas recorrentes (água, luz, internet, aluguel): sempre deixa lançada a conta do próximo mês.
 * Quando a última conta da série é deste mês (ou anterior), lança a(s) seguinte(s) com o mesmo valor —
 * o valor pode ser ajustado em "Alterar" quando a conta chegar.
 */
export async function gerarContasRecorrentes() {
  const contas = await prisma.contaPagar.findMany({
    where: { serieRecorrente: { not: null } },
    select: { id: true, serieRecorrente: true, recorrente: true, fornecedor: true, descricao: true, categoria: true, valor: true, vencimento: true, vencimentoOriginal: true },
  });
  const series = new Map<string, typeof contas>();
  for (const c of contas) series.set(c.serieRecorrente!, [...(series.get(c.serieRecorrente!) ?? []), c]);

  const hoje = hojeCalendario();
  const mesAtual = hoje.getUTCFullYear() * 12 + hoje.getUTCMonth();
  const criar: Parameters<typeof prisma.contaPagar.create>[0]["data"][] = [];

  for (const [serie, lista] of series) {
    const base = (c: (typeof lista)[number]) => c.vencimentoOriginal ?? c.vencimento;
    lista.sort((a, b) => base(a).getTime() - base(b).getTime());
    const ultima = lista[lista.length - 1];
    if (!ultima.recorrente) continue; // recorrência parada
    const dia = base(ultima).getUTCDate() >= 28 ? Math.max(...lista.map((c) => base(c).getUTCDate())) : base(ultima).getUTCDate();
    let ultimoMes = base(ultima).getUTCFullYear() * 12 + base(ultima).getUTCMonth();
    let passo = 1;
    // Lança até ter uma conta no próximo mês (no máximo 3 de uma vez, se ficou meses sem abrir o sistema)
    while (ultimoMes <= mesAtual && passo <= 3) {
      const digitado = somarMeses(base(ultima), passo, dia);
      criar.push({
        fornecedor: ultima.fornecedor,
        descricao: ultima.descricao,
        categoria: ultima.categoria,
        valor: ultima.valor,
        dataLancamento: hoje,
        ...ajustarVencimento(digitado),
        status: "PENDENTE",
        recorrente: true,
        serieRecorrente: serie,
        observacoes: "Lançada sozinha (conta recorrente). Confira o valor quando a conta chegar.",
      });
      ultimoMes += 1;
      passo += 1;
    }
  }
  for (const data of criar) await prisma.contaPagar.create({ data });
  return criar.length;
}

interface FiltrosContaPagar {
  status?: "PENDENTE" | "PAGO" | "VENCIDO" | "PARCIAL";
  categoria?: string;
}

export async function listarContasPagar(filtros: FiltrosContaPagar) {
  // Salários de sábado dos funcionários entram sozinhos
  await gerarSalariosDeSabado();
  await corrigirVencimentosForaDeDiaUtil();
  await gerarContasRecorrentes();
  const statusDoBanco = filtros.status && filtros.status !== "VENCIDO" ? filtros.status : undefined;
  const contas = await prisma.contaPagar.findMany({
    where: { status: statusDoBanco, categoria: filtros.categoria },
    orderBy: { vencimento: "asc" },
    include: {
      funcionario: { select: { id: true, nome: true, chavePix: true, registrado: true } },
      descontos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }], select: { id: true, tipo: true, data: true, valor: true, descricao: true } },
      anexos: { orderBy: { criadoEm: "asc" }, select: { id: true, tipo: true, nome: true, tipoMime: true, tamanho: true, criadoEm: true } },
    },
  });

  // Marca como vencida (na leitura) qualquer conta pendente/parcial cujo vencimento já passou
  const hoje = hojeCalendario();
  const comStatusAtualizado = contas.map((c) => {
    const vencida =
      (c.status === "PENDENTE" || c.status === "PARCIAL") && c.vencimento < hoje;
    const saldo = Math.max(Number(c.valor) - Number(c.valorPago), 0);
    const diasAtraso = c.valorPago && Number(c.valorPago) > 0 ? diasDeAtraso(c.vencimento, c.dataPagamento, c.funcionarioId) : 0;
    return { ...c, saldo, diasAtraso, percentualPago: Number(c.valor) > 0 ? Math.round((Number(c.valorPago) / Number(c.valor)) * 100) : 0, status: vencida ? "VENCIDO" : c.status };
  });

  return filtros.status === "VENCIDO"
    ? comStatusAtualizado.filter((conta) => conta.status === "VENCIDO")
    : comStatusAtualizado;
}

export async function criarContaPagar(input: CriarContaPagarInput) {
  const { criadoPorId, recorrente, vencimento, ...dados } = input;

  const conta = await prisma.contaPagar.create({
    data: {
      ...dados,
      ...ajustarVencimento(vencimento),
      status: "PENDENTE",
      ...(recorrente ? { recorrente: true, serieRecorrente: randomUUID() } : {}),
    },
  });

  await registrarLog({
    usuarioId: criadoPorId,
    acao: "CRIOU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: conta.id,
    detalhes: `Lançou conta a pagar de ${conta.fornecedor} — R$ ${conta.valor} (venc. ${formatarDataCalendario(conta.vencimento)}${conta.vencimentoOriginal ? `, boleto dia ${formatarDataCalendario(conta.vencimentoOriginal)}` : ""})${conta.recorrente ? " — recorrente todo mês" : ""}`,
  });

  if (conta.recorrente) await gerarContasRecorrentes();
  return conta;
}

/**
 * Boleto dividido em duas datas: lança duas contas, cada uma com metade do valor.
 * Se o valor não divide exato, o centavo que sobra vai para a primeira parcela.
 */
export async function criarContaPagarDividida(
  input: CriarContaPagarInput & { segundoVencimento: Date; codigoBarras2?: string | null }
) {
  const { criadoPorId, segundoVencimento, descricao, valor, codigoBarras, codigoBarras2, recorrente: _recorrente, vencimento, ...dados } = input;
  const totalCentavos = Math.round(valor * 100);
  const segundaCentavos = Math.floor(totalCentavos / 2);
  const parcelas = [
    { valor: (totalCentavos - segundaCentavos) / 100, vencimento, sufixo: "1/2", codigo: codigoBarras || null },
    { valor: segundaCentavos / 100, vencimento: segundoVencimento, sufixo: "2/2", codigo: codigoBarras2 || null },
  ];

  const grupoBoleto = randomUUID();
  const contas = await prisma.$transaction(
    parcelas.map((p) =>
      prisma.contaPagar.create({
        data: {
          ...dados,
          grupoBoleto,
          descricao: `${descricao} (boleto ${p.sufixo})`,
          valor: p.valor,
          ...ajustarVencimento(p.vencimento),
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
  usuarioId: string,
  dataPagamento: Date = new Date(),
  juros = 0
) {
  const conta = await prisma.contaPagar.findUniqueOrThrow({ where: { id } });
  if (juros < 0) throw new ErroContaPagar("Os juros não podem ser negativos.");

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
      dataPagamento,
      formaPagamento,
      juros: Number((Number(conta.juros) + juros).toFixed(2)),
    },
  });
  const atraso = diasDeAtraso(conta.vencimento, dataPagamento, conta.funcionarioId);

  await registrarLog({
    usuarioId,
    acao: "PAGOU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: conta.id,
      detalhes: `Registrou pagamento de R$ ${valorPago} para ${conta.fornecedor} (${formaPagamento}) em ${formatarDataCalendario(dataPagamento)}${atraso ? ` — ${atraso} dia(s) de atraso` : ""}${juros ? ` — juros/multa R$ ${juros.toFixed(2)}` : ""}`,
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

/** Corrige os juros/multa de uma conta já paga (ex.: lançou o pagamento e esqueceu os juros). */
export async function definirJuros(id: string, juros: number, usuarioId: string) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new ErroContaPagar("Conta não encontrada.");
  if (Number(conta.valorPago) <= 0) throw new ErroContaPagar("Registre o pagamento antes de lançar os juros.");
  const atualizada = await prisma.contaPagar.update({ where: { id }, data: { juros } });
  await registrarLog({
    usuarioId,
    acao: "ALTEROU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: id,
    detalhes: `Juros/multa de ${conta.fornecedor} — ${conta.descricao}: antes R$ ${Number(conta.juros).toFixed(2)}, agora R$ ${juros.toFixed(2)}`,
  });
  return atualizada;
}

/**
 * Liga ou desliga a recorrência (todo mês) da conta e das outras da mesma série.
 * Ligar numa conta comum cria a série a partir dela.
 */
export async function definirRecorrencia(id: string, ativa: boolean, usuarioId: string) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new ErroContaPagar("Conta não encontrada.");
  if (conta.funcionarioId) throw new ErroContaPagar("Salário já é lançado sozinho toda semana.");
  if (conta.grupoBoleto && ativa) throw new ErroContaPagar("Boleto dividido em 2 não pode ser recorrente.");
  const serie = conta.serieRecorrente ?? randomUUID();
  if (conta.serieRecorrente) {
    await prisma.contaPagar.updateMany({ where: { serieRecorrente: serie }, data: { recorrente: ativa } });
  } else {
    await prisma.contaPagar.update({ where: { id }, data: { recorrente: ativa, serieRecorrente: ativa ? serie : null } });
  }
  await registrarLog({
    usuarioId,
    acao: "ALTEROU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: id,
    detalhes: `${ativa ? "Ligou" : "Parou"} a recorrência mensal de ${conta.fornecedor} — ${conta.descricao}`,
  });
  if (ativa) await gerarContasRecorrentes();
  return prisma.contaPagar.findUnique({ where: { id } });
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

  // Salário de sábado fica no sábado; boleto em fim de semana/feriado vai para o próximo dia útil
  const datas = conta.funcionarioId ? { vencimento: dados.vencimento, vencimentoOriginal: null } : ajustarVencimento(dados.vencimento);
  const atualizada = await prisma.contaPagar.update({
    where: { id },
    data: { ...dados, ...datas, observacoes: dados.observacoes || null, codigoBarras: dados.codigoBarras || null, status },
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
  const descontos = await prisma.descontoFuncionario.count({ where: { contaPagarId: id } });
  if (descontos > 0) {
    throw new ErroContaPagar("Este salário tem descontos lançados (vale/adiantamento/carne). Exclua os descontos na aba Funcionários antes de excluir o sábado.");
  }

  await prisma.contaPagar.delete({ where: { id } });

  // Excluiu a conta mais nova de uma série recorrente: para de lançar (senão ela voltaria sozinha)
  let parouRecorrencia = false;
  if (conta.serieRecorrente && conta.recorrente) {
    const base = (c: { vencimento: Date; vencimentoOriginal: Date | null }) => (c.vencimentoOriginal ?? c.vencimento).getTime();
    const restantes = await prisma.contaPagar.findMany({ where: { serieRecorrente: conta.serieRecorrente }, select: { vencimento: true, vencimentoOriginal: true } });
    if (!restantes.some((c) => base(c) > base(conta))) {
      await prisma.contaPagar.updateMany({ where: { serieRecorrente: conta.serieRecorrente }, data: { recorrente: false } });
      parouRecorrencia = true;
    }
  }

  await registrarLog({
    usuarioId,
    acao: "EXCLUIU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: id,
    detalhes: `Excluiu conta de ${conta.fornecedor} — ${conta.descricao} — R$ ${conta.valor} (venc. ${formatarDataCalendario(conta.vencimento)}, pago R$ ${conta.valorPago})${parouRecorrencia ? " — recorrência parada" : ""}`,
  });
  return { parouRecorrencia };
}

// ───────────── Boleto dividido em 2: alterar as duas partes juntas ─────────────

const SUFIXO_BOLETO = / \(boleto [12]\/2\)$/;

export interface BoletoParte {
  vencimento: Date;
  valor: number;
  codigoBarras?: string | null;
}

export interface AlterarBoletosInput {
  fornecedor: string;
  descricao: string;
  categoria: string;
  dataLancamento: Date;
  observacoes?: string | null;
  boletos: BoletoParte[]; // 1 = boleto único; 2 = dividido em 2
}

/**
 * Altera a conta e decide se ela é 1 boleto ou 2 boletos (com data e valor de cada um).
 * - 1 → 2: a conta vira a parte 1/2 e é criada a parte 2/2.
 * - 2 → 1: a parte 2/2 é excluída e a conta fica com o valor informado.
 * - 2 → 2: atualiza as duas partes.
 * Só funciona enquanto nenhuma parte tiver pagamento.
 */
export async function alterarBoletos(id: string, dados: AlterarBoletosInput, usuarioId: string) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) throw new ErroContaPagar("Conta não encontrada.");
  if (conta.funcionarioId) throw new ErroContaPagar("Salário de funcionário não pode ser dividido em boletos.");
  if (dados.boletos.length < 1 || dados.boletos.length > 2) throw new ErroContaPagar("Informe 1 ou 2 boletos.");

  const partes = conta.grupoBoleto
    ? await prisma.contaPagar.findMany({ where: { grupoBoleto: conta.grupoBoleto, status: { not: "CANCELADO" } }, orderBy: [{ vencimento: "asc" }, { descricao: "asc" }] })
    : [conta];
  if (partes.some((p) => Number(p.valorPago) > 0 || p.status === "PAGO")) {
    throw new ErroContaPagar("Uma das partes deste boleto já tem pagamento. Altere só a data/valor da parte em aberto.");
  }

  const codigos = dados.boletos.map((b) => b.codigoBarras || null).filter(Boolean) as string[];
  if (new Set(codigos).size !== codigos.length) throw new ErroContaPagar("Os dois boletos estão com o mesmo código de barras.");
  if (codigos.length) {
    const outro = await prisma.contaPagar.findFirst({ where: { codigoBarras: { in: codigos }, id: { notIn: partes.map((p) => p.id) } } });
    if (outro) throw new ErroContaPagar(`Este código de barras já está lançado em outra conta (${outro.fornecedor} — ${outro.descricao}).`);
  }

  const base = dados.descricao.replace(SUFIXO_BOLETO, "").trim();
  const comuns = {
    fornecedor: dados.fornecedor,
    categoria: dados.categoria,
    dataLancamento: dados.dataLancamento,
    observacoes: dados.observacoes || null,
  };
  const dividido = dados.boletos.length === 2;
  if (dividido && conta.recorrente) throw new ErroContaPagar("Conta recorrente não pode ser dividida em 2 boletos. Desligue a recorrência antes.");
  const grupoBoleto = dividido ? conta.grupoBoleto ?? randomUUID() : null;
  const [primeira, segunda] = partes;

  const resultado = await prisma.$transaction(async (tx) => {
    // Libera os códigos antes (evita conflito de "código já usado" ao trocar entre as partes)
    await tx.contaPagar.updateMany({ where: { id: { in: partes.map((p) => p.id) } }, data: { codigoBarras: null } });
    const atualizadas = [];
    atualizadas.push(
      await tx.contaPagar.update({
        where: { id: primeira.id },
        data: {
          ...comuns,
          descricao: dividido ? `${base} (boleto 1/2)` : base,
          ...ajustarVencimento(dados.boletos[0].vencimento),
          valor: dados.boletos[0].valor,
          codigoBarras: dados.boletos[0].codigoBarras || null,
          grupoBoleto,
          status: "PENDENTE",
        },
      })
    );
    if (dividido) {
      const dadosSegunda = {
        ...comuns,
        descricao: `${base} (boleto 2/2)`,
        ...ajustarVencimento(dados.boletos[1].vencimento),
        valor: dados.boletos[1].valor,
        codigoBarras: dados.boletos[1].codigoBarras || null,
        grupoBoleto,
        status: "PENDENTE" as const,
      };
      atualizadas.push(
        segunda
          ? await tx.contaPagar.update({ where: { id: segunda.id }, data: dadosSegunda })
          : await tx.contaPagar.create({ data: dadosSegunda })
      );
    } else if (segunda) {
      await tx.contaPagar.delete({ where: { id: segunda.id } });
    }
    return atualizadas;
  });

  const resumo = resultado.map((c) => `R$ ${Number(c.valor).toFixed(2)} venc. ${formatarDataCalendario(c.vencimento)}`).join(" + ");
  await registrarLog({
    usuarioId,
    acao: "ALTEROU_CONTA_PAGAR",
    entidade: "conta_pagar",
    entidadeId: id,
    detalhes: `Alterou ${conta.fornecedor} — ${base}: antes ${partes.length} boleto(s) (${partes.map((p) => `R$ ${Number(p.valor).toFixed(2)} venc. ${formatarDataCalendario(p.vencimento)}`).join(" + ")}); agora ${resultado.length} boleto(s) (${resumo})`,
  });
  return resultado;
}
