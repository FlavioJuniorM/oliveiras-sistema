import { randomUUID } from "node:crypto";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { formatarDataCalendario, hojeCalendario } from "../../shared/datas";
import { ErroFuncionario, gerarSalariosDeSabado, recalcularSalarioDoSabado, sabadoAPartirDe } from "./funcionarios.service";

export type TipoDesconto = "ADIANTAMENTO" | "VALE" | "CARNE" | "OUTRO";

export const ROTULO_DESCONTO: Record<TipoDesconto, string> = {
  ADIANTAMENTO: "Adiantamento",
  VALE: "Vale",
  CARNE: "Carne / produtos",
  OUTRO: "Outro desconto",
};

const DIA_MS = 24 * 60 * 60 * 1000;
const centavos = (n: number) => Math.round(n * 100);
const reais = (c: number) => c / 100;
const dm = (d: Date) => formatarDataCalendario(d).slice(0, 5);

/** Salário de sábado que ainda pode receber desconto: não pago e sem pagamento parcial. */
const contaAberta = { status: "PENDENTE" as const, valorPago: 0 };

export interface NovoDesconto {
  tipo: TipoDesconto;
  data: Date;
  valor: number;
  descricao?: string | null;
}

/**
 * Lança o desconto no próximo sábado que ainda não passou e não foi pago.
 * Se o valor passar do salário daquele sábado, o resto vai para o(s) sábado(s) seguinte(s).
 */
export async function lancarDesconto(funcionarioId: string, dados: NovoDesconto, usuarioId: string) {
  const funcionario = await prisma.funcionario.findUnique({ where: { id: funcionarioId } });
  if (!funcionario) throw new ErroFuncionario("Funcionário não encontrado.");
  if (funcionario.status !== "ATIVO") throw new ErroFuncionario("Este funcionário está desligado. Reative-o para lançar descontos.");

  const hoje = hojeCalendario();
  if (dados.data.getTime() > hoje.getTime() + 7 * DIA_MS) throw new ErroFuncionario("A data do desconto não pode ser tão no futuro.");

  await gerarSalariosDeSabado();

  // Sábado a partir do dia em que pegou, mas nunca um sábado que já passou
  const inicioDesconto = sabadoAPartirDe(dados.data);
  const inicioHoje = sabadoAPartirDe(hoje);
  const primeiroSabado = inicioDesconto > inicioHoje ? inicioDesconto : inicioHoje;

  const grupoId = randomUUID();
  const partes: { sabado: Date; valor: number }[] = [];

  await prisma.$transaction(async (tx) => {
    const contas = await tx.contaPagar.findMany({
      where: { funcionarioId, vencimento: { gte: primeiroSabado }, ...contaAberta },
      orderBy: { vencimento: "asc" },
    });
    let restante = centavos(dados.valor);
    for (const conta of contas) {
      if (restante <= 0) break;
      const disponivel = centavos(Number(conta.valor));
      if (disponivel <= 0) continue;
      const parte = Math.min(disponivel, restante);
      partes.push({ sabado: conta.vencimento, valor: reais(parte) });
      await tx.descontoFuncionario.create({
        data: {
          funcionarioId,
          contaPagarId: conta.id,
          grupoId,
          tipo: dados.tipo,
          data: dados.data,
          valor: reais(parte),
          descricao: dados.descricao ?? null,
          criadoPorId: usuarioId,
        },
      });
      await recalcularSalarioDoSabado(tx, conta.id);
      restante -= parte;
    }
    if (restante > 0) {
      throw new ErroFuncionario(
        partes.length === 0
          ? "Não há salário de sábado em aberto para descontar. Confira em Contas a Pagar."
          : `O desconto passa dos salários dos próximos ${partes.length} sábado(s). Lance um valor menor.`
      );
    }
  });

  await registrarLog({
    usuarioId,
    acao: "LANCOU_DESCONTO_FUNCIONARIO",
    entidade: "funcionario",
    entidadeId: funcionarioId,
    detalhes: `${ROTULO_DESCONTO[dados.tipo]} de R$ ${dados.valor.toFixed(2)} para ${funcionario.nome} (pegou em ${formatarDataCalendario(dados.data)}) — descontado em ${partes.map((p) => `sáb ${dm(p.sabado)} R$ ${p.valor.toFixed(2)}`).join(", ")}${dados.descricao ? ` — ${dados.descricao}` : ""}`,
  });

  return { grupoId, partes };
}

/** Exclui o desconto (todas as partes). Só se os sábados dele ainda não foram pagos. */
export async function excluirDesconto(descontoId: string, usuarioId: string) {
  const desconto = await prisma.descontoFuncionario.findUnique({ where: { id: descontoId }, include: { funcionario: true } });
  if (!desconto) throw new ErroFuncionario("Desconto não encontrado.");
  const partes = await prisma.descontoFuncionario.findMany({ where: { grupoId: desconto.grupoId }, include: { contaPagar: true } });
  const jaPago = partes.some((p) => p.contaPagar && (p.contaPagar.status === "PAGO" || Number(p.contaPagar.valorPago) > 0) && Number(p.contaPagar.valor) > 0);
  if (jaPago) throw new ErroFuncionario("Este desconto já entrou num sábado pago. Para corrigir, ajuste o pagamento em Contas a Pagar.");

  const contas = [...new Set(partes.map((p) => p.contaPagarId).filter((id): id is string => !!id))];
  await prisma.$transaction(async (tx) => {
    await tx.descontoFuncionario.deleteMany({ where: { grupoId: desconto.grupoId } });
    for (const id of contas) {
      // Volta a ficar "a pagar" se o desconto tinha zerado o salário
      await tx.contaPagar.updateMany({ where: { id, status: "PAGO", valorPago: 0 }, data: { status: "PENDENTE", observacoes: null } });
      await recalcularSalarioDoSabado(tx, id);
    }
  });

  const total = partes.reduce((t, p) => t + Number(p.valor), 0);
  await registrarLog({
    usuarioId,
    acao: "EXCLUIU_DESCONTO_FUNCIONARIO",
    entidade: "funcionario",
    entidadeId: desconto.funcionarioId,
    detalhes: `Excluiu ${ROTULO_DESCONTO[desconto.tipo]} de R$ ${total.toFixed(2)} de ${desconto.funcionario.nome} (pegou em ${formatarDataCalendario(desconto.data)})`,
  });
}

function formatarDesconto(d: { id: string; grupoId: string; tipo: TipoDesconto; data: Date; valor: unknown; descricao: string | null; contaPagar?: { id: string; vencimento: Date; status: string; valorPago: unknown } | null }) {
  return {
    id: d.id,
    grupoId: d.grupoId,
    tipo: d.tipo,
    rotulo: ROTULO_DESCONTO[d.tipo],
    data: d.data,
    valor: Number(d.valor),
    descricao: d.descricao,
    sabado: d.contaPagar?.vencimento ?? null,
    sabadoPago: d.contaPagar ? d.contaPagar.status === "PAGO" || Number(d.contaPagar.valorPago) > 0 : false,
  };
}

/** Descontos do funcionário (mais recentes primeiro). */
export async function listarDescontos(funcionarioId: string) {
  const descontos = await prisma.descontoFuncionario.findMany({
    where: { funcionarioId },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    take: 200,
    include: { contaPagar: { select: { id: true, vencimento: true, status: true, valorPago: true } } },
  });
  return descontos.map(formatarDesconto);
}

/**
 * Folha de pagamento de um sábado: salário cheio, descontos e valor a receber de cada funcionário.
 * Sem funcionarioId: todos que têm salário naquele sábado.
 */
export async function folhaDoSabado(sabado: Date, funcionarioId?: string) {
  if (sabado.getUTCDay() !== 6) throw new ErroFuncionario("Escolha um sábado.");
  await gerarSalariosDeSabado();
  const contas = await prisma.contaPagar.findMany({
    where: { vencimento: sabado, funcionarioId: funcionarioId ?? { not: null }, status: { not: "CANCELADO" } },
    include: {
      funcionario: true,
      descontos: { orderBy: [{ data: "asc" }, { criadoEm: "asc" }] },
    },
    orderBy: { fornecedor: "asc" },
  });
  const inicioSemana = new Date(sabado.getTime() - 6 * DIA_MS);
  return contas
    .filter((c) => c.funcionario)
    .map((c) => {
      const f = c.funcionario!;
      const bruto = Number(c.salarioBruto ?? c.valor);
      const descontos = c.descontos.map((d) => ({ ...formatarDesconto(d), sabado: c.vencimento }));
      const totalDescontos = descontos.reduce((t, d) => t + d.valor, 0);
      return {
        contaId: c.id,
        sabado: c.vencimento,
        inicioSemana,
        funcionario: {
          id: f.id,
          nome: f.nome,
          funcao: f.funcao,
          cpf: f.cpf,
          rg: f.rg,
          registrado: f.registrado,
          dataAdmissao: f.dataAdmissao,
          chavePix: f.chavePix,
        },
        salarioBruto: bruto,
        descontos,
        totalDescontos: Math.round(totalDescontos * 100) / 100,
        liquido: Number(c.valor),
        status: c.status,
        valorPago: Number(c.valorPago),
        dataPagamento: c.dataPagamento,
        formaPagamento: c.formaPagamento,
      };
    });
}
