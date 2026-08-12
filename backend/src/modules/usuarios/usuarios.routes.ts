import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { criarUsuario, inativarUsuario, listarUsuarios } from "./usuarios.service";

export const usuariosRouter = Router();

// Todas as rotas de usuários exigem autenticação + papel ADMINISTRATIVO
// (regra: "gerenciar usuários" está fora do escopo do funcionário — seção 2)
usuariosRouter.use(autenticar, somentePapel("ADMINISTRATIVO"));

const criarUsuarioSchema = z.object({
  nome: z.string().min(2),
  login: z.string().min(3),
  senha: z.string().min(6, "A senha deve ter no mínimo 6 caracteres."),
  papel: z.enum(["FUNCIONARIO", "ADMINISTRATIVO"]),
});

usuariosRouter.get("/", async (_req, res) => {
  const usuarios = await listarUsuarios();
  return res.json(usuarios);
});

usuariosRouter.post("/", async (req, res) => {
  const validacao = criarUsuarioSchema.safeParse(req.body);

  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  try {
    const usuario = await criarUsuario({
      ...validacao.data,
      criadoPorId: req.usuario!.id,
    });
    return res.status(201).json(usuario);
  } catch (erro: any) {
    if (erro.code === "P2002") {
      return res.status(409).json({ erro: "Já existe um usuário com esse login." });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao criar usuário." });
  }
});

usuariosRouter.patch("/:id/inativar", async (req, res) => {
  const usuario = await inativarUsuario(req.params.id, req.usuario!.id);
  return res.json(usuario);
});
