import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  relatorioClientes,
  relatorioFinanceiro,
  relatorioProdutos,
  relatorioVendasPorPeriodo,
} from "./relatorios.service";

export const relatoriosRouter = Router();

// Toda a área de relatórios é administrativa (seção 14)
relatoriosRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const periodoSchema = z.object({
  inicio: z.coerce.date(),
  fim: z.coerce.date(),
});

function validarPeriodo(req: any, res: any): { inicio: Date; fim: Date } | null {
  const validacao = periodoSchema.safeParse({
    inicio: req.query.inicio,
    fim: req.query.fim,
  });

  if (!validacao.success) {
    res.status(400).json({ erro: "Informe os parâmetros 'inicio' e 'fim' (datas válidas)." });
    return null;
  }

  return validacao.data;
}

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
