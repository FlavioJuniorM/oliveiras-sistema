import { Router } from "express";
import { z } from "zod";
import { autenticarUsuario, ErroAutenticacao, ErroMuitasTentativas, trocarPropriaSenha } from "./auth.service";
import { ipDaRequisicao } from "../../shared/limites";
import { autenticar } from "../../middlewares/autenticacao";

export const authRouter = Router();

const loginSchema = z.object({
  login: z.string().min(1, "Informe o login."),
  senha: z.string().min(1, "Informe a senha."),
});

authRouter.post("/login", async (req, res) => {
  const validacao = loginSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const resultado = await autenticarUsuario({ ...validacao.data, ip: ipDaRequisicao(req) });
    return res.json(resultado);
  } catch (erro) {
    if (erro instanceof ErroMuitasTentativas) {
      return res.status(429).json({ erro: erro.message });
    }
    if (erro instanceof ErroAutenticacao) {
      return res.status(401).json({ erro: erro.message });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao autenticar." });
  }
});

// Endpoint para o frontend validar/recuperar os dados do usuário logado a partir do token
authRouter.get("/me", autenticar, (req, res) => {
  return res.json({ usuario: req.usuario });
});

// Troca da própria senha (qualquer usuário logado)
authRouter.post("/senha", autenticar, async (req, res) => {
  const validacao = z
    .object({ senhaAtual: z.string().min(1, "Informe a senha atual."), novaSenha: z.string().min(1, "Informe a nova senha.") })
    .safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });

  try {
    await trocarPropriaSenha(req.usuario!.id, validacao.data.senhaAtual, validacao.data.novaSenha);
    return res.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroAutenticacao) return res.status(400).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao trocar a senha." });
  }
});
