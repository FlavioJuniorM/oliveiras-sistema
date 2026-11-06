import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/database";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { registrarLog } from "../../shared/registrarLog";
import { formatarDataCalendario, hojeCalendario } from "../../shared/datas";

/**
 * Totais do caixa lançados à mão (copiados do sistema de caixa da loja).
 * Um lançamento por dia, com dinheiro, Pix e cartões.
 */
export const caixaRouter = Router();
caixaRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const dataDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato AAAA-MM-DD.");
const valor = z.number().min(0, "Os valores não podem ser negativos.").max(10_000_000);

const lancamentoSchema = z
  .object({
    data: dataDia,
    dinheiro: valor,
    pix: valor,
    cartoes: valor,
    observacoes: z.string().max(500).nullable().optional(),
  })
  .refine((d) => d.dinheiro + d.pix + d.cartoes > 0, { message: "Informe pelo menos um valor." });

/** "2026-11-05" → data de calendário (meia-noite UTC), como fica guardada na coluna DATE. */
function paraData(dia: string) {
  return new Date(`${dia}T00:00:00Z`);
}

function formatar(l: { id: string; data: Date; dinheiro: Prisma.Decimal; pix: Prisma.Decimal; cartoes: Prisma.Decimal; observacoes: string | null; atualizadoEm: Date }) {
  const dinheiro = Number(l.dinheiro);
  const pix = Number(l.pix);
  const cartoes = Number(l.cartoes);
  return {
    id: l.id,
    data: l.data.toISOString().slice(0, 10),
    dinheiro,
    pix,
    cartoes,
    total: Number((dinheiro + pix + cartoes).toFixed(2)),
    observacoes: l.observacoes,
    atualizadoEm: l.atualizadoEm,
  };
}

function resumo(l: ReturnType<typeof formatar>) {
  return `dinheiro R$ ${l.dinheiro.toFixed(2)}, Pix R$ ${l.pix.toFixed(2)}, cartões R$ ${l.cartoes.toFixed(2)}`;
}

// GET /caixa/lancamentos?mes=2026-11
caixaRouter.get("/lancamentos", async (req, res) => {
  const mes = String(req.query.mes ?? "");
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ erro: "Informe o mês no formato AAAA-MM." });
  const [ano, numeroMes] = mes.split("-").map(Number);
  const lancamentos = await prisma.lancamentoCaixa.findMany({
    where: { data: { gte: new Date(Date.UTC(ano, numeroMes - 1, 1)), lt: new Date(Date.UTC(ano, numeroMes, 1)) } },
    orderBy: { data: "asc" },
  });
  return res.json(lancamentos.map(formatar));
});

caixaRouter.post("/lancamentos", async (req, res) => {
  const validacao = lancamentoSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  const { data, ...valores } = validacao.data;
  if (paraData(data) > hojeCalendario()) return res.status(400).json({ erro: "Não dá para lançar o caixa de um dia que ainda não chegou." });

  try {
    const criado = formatar(
      await prisma.lancamentoCaixa.create({ data: { data: paraData(data), ...valores, observacoes: valores.observacoes || null } })
    );
    await registrarLog({
      usuarioId: req.usuario!.id,
      acao: "LANCOU_CAIXA",
      entidade: "lancamento_caixa",
      entidadeId: criado.id,
      detalhes: `Lançou o caixa de ${formatarDataCalendario(paraData(data))}: ${resumo(criado)}`,
    });
    return res.status(201).json(criado);
  } catch (erro) {
    if ((erro as { code?: string })?.code === "P2002") {
      return res.status(409).json({ erro: `O dia ${formatarDataCalendario(paraData(data))} já tem lançamento. Use "Alterar" para corrigir os valores.` });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao lançar o caixa." });
  }
});

caixaRouter.put("/lancamentos/:id", async (req, res) => {
  const validacao = lancamentoSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  const { data, ...valores } = validacao.data;
  if (paraData(data) > hojeCalendario()) return res.status(400).json({ erro: "Não dá para lançar o caixa de um dia que ainda não chegou." });

  const atual = await prisma.lancamentoCaixa.findUnique({ where: { id: req.params.id } });
  if (!atual) return res.status(404).json({ erro: "Lançamento não encontrado." });

  try {
    const alterado = formatar(
      await prisma.lancamentoCaixa.update({
        where: { id: atual.id },
        data: { data: paraData(data), ...valores, observacoes: valores.observacoes || null },
      })
    );
    await registrarLog({
      usuarioId: req.usuario!.id,
      acao: "ALTEROU_CAIXA",
      entidade: "lancamento_caixa",
      entidadeId: atual.id,
      detalhes: `Alterou o caixa de ${formatarDataCalendario(atual.data)} — antes: ${resumo(formatar(atual))}; agora (${formatarDataCalendario(paraData(data))}): ${resumo(alterado)}`,
    });
    return res.json(alterado);
  } catch (erro) {
    if ((erro as { code?: string })?.code === "P2002") {
      return res.status(409).json({ erro: `O dia ${formatarDataCalendario(paraData(data))} já tem outro lançamento.` });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao alterar o caixa." });
  }
});

caixaRouter.delete("/lancamentos/:id", async (req, res) => {
  const atual = await prisma.lancamentoCaixa.findUnique({ where: { id: req.params.id } });
  if (!atual) return res.status(404).json({ erro: "Lançamento não encontrado." });
  await prisma.lancamentoCaixa.delete({ where: { id: atual.id } });
  await registrarLog({
    usuarioId: req.usuario!.id,
    acao: "EXCLUIU_CAIXA",
    entidade: "lancamento_caixa",
    entidadeId: atual.id,
    detalhes: `Excluiu o caixa de ${formatarDataCalendario(atual.data)}: ${resumo(formatar(atual))}`,
  });
  return res.status(204).end();
});
