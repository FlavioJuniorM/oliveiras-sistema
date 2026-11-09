import { periodoNaLoja } from "../../shared/datas";
import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  relatorioClientes,
  relatorioFinanceiro,
  relatorioProdutos,
  relatorioVendasPorPeriodo,
  fechamentoDeCaixa,
} from "./relatorios.service";
import { relatorioCompleto } from "./relatorioCompleto.service";

export const relatoriosRouter = Router();

// Toda a área de relatórios é administrativa (seção 14)
relatoriosRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const dataDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodoSchema = z.object({
  inicio: dataDia,
  fim: dataDia,
});

function validarPeriodo(req: any, res: any): { inicio: Date; fim: Date } | null {
  const validacao = periodoSchema.safeParse({
    inicio: req.query.inicio,
    fim: req.query.fim,
  });

  if (!validacao.success) {
    res.status(400).json({ erro: "Informe os parâmetros 'inicio' e 'fim' no formato AAAA-MM-DD." });
    return null;
  }

  // Dias completos no horário de Brasília: "até 03/11" inclui o dia 03/11 inteiro
  return periodoNaLoja(validacao.data.inicio, validacao.data.fim);
}

// GET /relatorios/completo?inicio=2026-11-01&fim=2026-11-30 — painel gerencial completo (KPIs + gráficos + PDF)
relatoriosRouter.get("/completo", async (req, res) => {
  const validacao = periodoSchema.safeParse({ inicio: req.query.inicio, fim: req.query.fim });
  if (!validacao.success) return res.status(400).json({ erro: "Informe as datas de início e fim." });
  const { inicio, fim } = validacao.data;
  if (Number.isNaN(Date.parse(`${inicio}T00:00:00Z`)) || Number.isNaN(Date.parse(`${fim}T00:00:00Z`))) {
    return res.status(400).json({ erro: "Data inválida." });
  }
  if (inicio > fim) return res.status(400).json({ erro: "A data de início precisa ser antes da data de fim." });
  const dias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000 + 1;
  if (dias > 366) return res.status(400).json({ erro: "Escolha um período de até 1 ano." });
  return res.json(await relatorioCompleto(inicio, fim));
});

// GET /relatorios/vendas?inicio=2026-08-01&fim=2026-08-31
relatoriosRouter.get("/vendas", async (req, res) => {
  const periodo = validarPeriodo(req, res);
  if (!periodo) return;
  return res.json(await relatorioVendasPorPeriodo(periodo));
});

relatoriosRouter.get("/produtos", async (req, res) => {
  const periodo = validarPeriodo(req, res);
  if (!periodo) return;
  return res.json(await relatorioProdutos(periodo));
});

relatoriosRouter.get("/clientes", async (req, res) => {
  const periodo = validarPeriodo(req, res);
  if (!periodo) return;
  return res.json(await relatorioClientes(periodo));
});

relatoriosRouter.get("/financeiro", async (req, res) => {
  const periodo = validarPeriodo(req, res);
  if (!periodo) return;
  return res.json(await relatorioFinanceiro(periodo));
});

// GET /relatorios/caixa?data=2026-11-03 — fechamento de caixa do dia
relatoriosRouter.get("/caixa", async (req, res) => {
  const validacao = dataDia.safeParse(req.query.data);
  if (!validacao.success) return res.status(400).json({ erro: "Informe a data no formato AAAA-MM-DD." });
  return res.json(await fechamentoDeCaixa(validacao.data));
});
