import { timingSafeEqual } from "crypto";
import { Router } from "express";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { emailConfigurado } from "./email";
import { enviarAvisoDiario, enviarAvisoTeste, montarEmail, resumoContasDoDia } from "./avisos.service";

export const avisosRouter = Router();

function segredoConfere(recebido: string | undefined, esperado: string) {
  const a = Buffer.from(recebido ?? "");
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Chamado pelo agendador da Vercel todo dia de manhã (ver vercel.json → crons).
 * Protegido pelo CRON_SECRET: sem ele configurado, ninguém consegue disparar.
 */
avisosRouter.get("/contas-do-dia", async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || !segredoConfere(req.headers.authorization, segredo)) {
    return res.status(401).json({ erro: "Não autorizado." });
  }
  try {
    return res.json(await enviarAvisoDiario());
  } catch (erro) {
    console.error("Falha no aviso diário de contas:", erro);
    return res.status(500).json({ erro: "Falha ao enviar o aviso." });
  }
});

// Situação do envio (para a tela de Usuários)
avisosRouter.get("/status", autenticar, somentePapel("ADMINISTRATIVO"), (_req, res) => {
  return res.json({ emailConfigurado: emailConfigurado(), agendado: Boolean(process.env.CRON_SECRET) });
});

// Prévia do e-mail de hoje (sem enviar)
avisosRouter.get("/previa", autenticar, somentePapel("ADMINISTRATIVO"), async (_req, res) => {
  const email = montarEmail(await resumoContasDoDia());
  return res.json(email);
});

// Envia o resumo de hoje só para o e-mail de quem clicou
avisosRouter.post("/teste", autenticar, somentePapel("ADMINISTRATIVO"), async (req, res) => {
  try {
    return res.json(await enviarAvisoTeste(req.usuario!.id));
  } catch (erro) {
    return res.status(400).json({ erro: erro instanceof Error ? erro.message : "Não foi possível enviar." });
  }
});
