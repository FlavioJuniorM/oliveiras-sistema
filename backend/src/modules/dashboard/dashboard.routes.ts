import { Router } from "express";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { obterDashboard } from "./dashboard.service";

export const dashboardRouter = Router();

// Dashboard é uma visão administrativa completa (seção 3) — restrito a ADMINISTRATIVO
dashboardRouter.get("/", autenticar, somentePapel("ADMINISTRATIVO"), async (_req, res) => {
  const dados = await obterDashboard();
  return res.json(dados);
});
