import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { formatarDataCalendario, hojeCalendario } from "../../shared/datas";

/** Quantos dias à frente os salários de sábado já aparecem em Contas a Pagar. */
const DIAS_A_FRENTE = 35;

export class ErroFuncionario extends Error {}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Primeiro sábado a partir da data (a própria data, se já for sábado). Datas de calendário em UTC. */
export function sabadoAPartirDe(data: Date) {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  const faltam = (6 - d.getUTCDay() + 7) % 7;
  return new Date(d.getTime() + faltam * DIA_MS);
}

function descricaoSalario(sabado: Date) {
  return `Salário do sábado ${formatarDataCalendario(sabado).slice(0, 5)}`;
}

/**
 * Lança em Contas a Pagar o salário de cada sábado dos funcionários ativos,
 * até ~5 semanas à frente. Só lança sábados novos (depois de `geradoAte`),
 * então uma conta excluída à mão não volta.
 */
export async function gerarSalariosDeSabado() {
  const hoje = hojeCalendario();
  const limite = new Date(hoje.getTime() + DIAS_A_FRENTE * DIA_MS);
  const funcionarios = await prisma.funcionario.findMany({ where: { status: "ATIVO" } });

  for (const f of funcionarios) {
    let sabado = f.geradoAte ? new Date(f.geradoAte.getTime() + 7 * DIA_MS) : sabadoAPartirDe(f.inicioPagamentos);
    if (sabado > limite) continue;

    const novas: { sabado: Date }[] = [];
    while (sabado <= limite) {
      novas.push({ sabado });
      sabado = new Date(sabado.getTime() + 7 * DIA_MS);
    }
    const ultimo = novas[novas.length - 1].sabado;

    await prisma.$transaction([
      prisma.contaPagar.createMany({
        data: novas.map(({ sabado: s }) => ({
          funcionarioId: f.id,
          fornecedor: f.nome,
          descricao: descricaoSalario(s),
          categoria: "Funcionários",
          valor: f.salario,
          dataLancamento: hoje,
          vencimento: s,
          status: "PENDENTE" as const,
        })),
        skipDuplicates: true,
      }),
      prisma.funcionario.update({ where: { id: f.id }, data: { geradoAte: ultimo } }),
    ]);
  }
}

/** Contas de salário que ainda não foram pagas e vencem hoje ou depois. */
function contasFuturasEmAberto(funcionarioId: string) {
  return {
    funcionarioId,
    vencimento: { gte: hojeCalendario() },
    status: { in: ["PENDENTE" as const] },
    valorPago: 0,
  };
}

export async function listarFuncionarios() {
  await gerarSalariosDeSabado();
  const hoje = hojeCalendario();
  const funcionarios = await prisma.funcionario.findMany({
    orderBy: [{ status: "asc" }, { nome: "asc" }],
    include: {
      contas: {
        where: { status: { not: "CANCELADO" } },
        orderBy: { vencimento: "asc" },
        select: { id: true, vencimento: true, valor: true, valorPago: true, status: true },
      },
    },
  });

  return funcionarios.map(({ contas, ...f }) => {
    const emAberto = contas.filter((c) => c.status !== "PAGO");
    const atrasadas = emAberto.filter((c) => c.vencimento < hoje);
    const proximo = emAberto.find((c) => c.vencimento >= hoje) ?? null;
    const ultimoPago = [...contas].reverse().find((c) => c.status === "PAGO") ?? null;
    return {
      ...f,
      salario: Number(f.salario),
      proximoPagamento: proximo && { id: proximo.id, data: proximo.vencimento, valor: Number(proximo.valor) - Number(proximo.valorPago) },
      ultimoPagamento: ultimoPago && { data: ultimoPago.vencimento, valor: Number(ultimoPago.valor) },
      atrasados: atrasadas.length,
      valorAtrasado: atrasadas.reduce((t, c) => t + Number(c.valor) - Number(c.valorPago), 0),
    };
  });
}

export interface DadosFuncionario {
  nome: string;
  funcao?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cpf?: string | null;
  rg?: string | null;
  dataNascimento?: Date | null;
  dataAdmissao?: Date | null;
  registrado: boolean;
  salario: number;
  chavePix?: string | null;
  observacoes?: string | null;
  inicioPagamentos: Date;
}

export async function criarFuncionario(dados: DadosFuncionario, usuarioId: string) {
  const funcionario = await prisma.funcionario.create({
    data: { ...dados, inicioPagamentos: sabadoAPartirDe(dados.inicioPagamentos) },
  });
  await registrarLog({
    usuarioId,
    acao: "CADASTROU_FUNCIONARIO",
    entidade: "funcionario",
    entidadeId: funcionario.id,
    detalhes: `Cadastrou o funcionário ${funcionario.nome} — R$ ${Number(funcionario.salario).toFixed(2)} por sábado a partir de ${formatarDataCalendario(funcionario.inicioPagamentos)}`,
  });
  await gerarSalariosDeSabado();
  return funcionario;
}

export async function alterarFuncionario(
  id: string,
  dados: DadosFuncionario & { status: "ATIVO" | "INATIVO" },
  usuarioId: string
) {
  const atual = await prisma.funcionario.findUnique({ where: { id } });
  if (!atual) throw new ErroFuncionario("Funcionário não encontrado.");

  const inicio = sabadoAPartirDe(dados.inicioPagamentos);
  const mudouInicio = inicio.getTime() !== atual.inicioPagamentos.getTime();
  const reativou = atual.status === "INATIVO" && dados.status === "ATIVO";
  const desativou = atual.status === "ATIVO" && dados.status === "INATIVO";
  const mudancas: string[] = [];

  await prisma.$transaction(async (tx) => {
    const atualizacao: Record<string, unknown> = { ...dados, inicioPagamentos: inicio };

    // Reativou ou mudou o 1º sábado: lança de novo a partir do sábado certo
    if (reativou || mudouInicio) {
      const deHoje = sabadoAPartirDe(hojeCalendario());
      atualizacao.geradoAte = null;
      if (reativou && inicio < deHoje) atualizacao.inicioPagamentos = deHoje;
      // Sábados em aberto antes do novo início não valem mais
      if (mudouInicio) {
        await tx.contaPagar.deleteMany({ where: { funcionarioId: id, vencimento: { lt: inicio }, status: "PENDENTE", valorPago: 0 } });
      }
    }

    await tx.funcionario.update({ where: { id }, data: atualizacao });

    if (desativou) {
      const { count } = await tx.contaPagar.deleteMany({ where: contasFuturasEmAberto(id) });
      mudancas.push(`desativado (${count} sábado(s) futuro(s) retirado(s) de contas a pagar)`);
    }
    if (Number(atual.salario) !== dados.salario) {
      await tx.contaPagar.updateMany({ where: contasFuturasEmAberto(id), data: { valor: dados.salario } });
      mudancas.push(`salário R$ ${Number(atual.salario).toFixed(2)} → R$ ${dados.salario.toFixed(2)} (vale dos próximos sábados em aberto)`);
    }
    if (atual.nome !== dados.nome) {
      await tx.contaPagar.updateMany({ where: { funcionarioId: id }, data: { fornecedor: dados.nome } });
      mudancas.push(`nome ${atual.nome} → ${dados.nome}`);
    }
    if (reativou) mudancas.push("reativado");
  });

  await registrarLog({
    usuarioId,
    acao: "ALTEROU_FUNCIONARIO",
    entidade: "funcionario",
    entidadeId: id,
    detalhes: `Alterou o funcionário ${dados.nome}${mudancas.length ? ` — ${mudancas.join("; ")}` : ""}`,
  });

  await gerarSalariosDeSabado();
  return prisma.funcionario.findUnique({ where: { id } });
}

/**
 * Excluir funcionário: tira os sábados futuros ainda não pagos de Contas a Pagar.
 * Se já tem salário pago, fica como inativo para não perder o histórico.
 */
export async function excluirFuncionario(id: string, usuarioId: string) {
  const funcionario = await prisma.funcionario.findUnique({ where: { id } });
  if (!funcionario) throw new ErroFuncionario("Funcionário não encontrado.");

  const pagos = await prisma.contaPagar.count({ where: { funcionarioId: id, valorPago: { gt: 0 } } });

  await prisma.$transaction(async (tx) => {
    await tx.contaPagar.deleteMany({ where: contasFuturasEmAberto(id) });
    if (pagos > 0) {
      await tx.funcionario.update({ where: { id }, data: { status: "INATIVO" } });
    } else {
      // Sábados já vencidos e não pagos continuam em Contas a Pagar (sem vínculo)
      await tx.funcionario.delete({ where: { id } });
    }
  });

  await registrarLog({
    usuarioId,
    acao: pagos > 0 ? "INATIVOU_FUNCIONARIO" : "EXCLUIU_FUNCIONARIO",
    entidade: "funcionario",
    entidadeId: id,
    detalhes: pagos > 0
      ? `Desligou o funcionário ${funcionario.nome} (mantido o histórico de ${pagos} pagamento(s))`
      : `Excluiu o funcionário ${funcionario.nome}`,
  });

  return { excluido: pagos === 0, desativado: pagos > 0 };
}
