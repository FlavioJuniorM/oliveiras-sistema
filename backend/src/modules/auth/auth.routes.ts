import { Router } from "express";
import { z } from "zod";
import { autenticarUsuario, ErroAutenticacao } from "./auth.service";
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
    const resultado = await autenticarUsuario(validacao.data);
    return res.json(resultado);
  } catch (erro) {
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
