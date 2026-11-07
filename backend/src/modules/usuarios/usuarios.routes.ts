import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { alterarUsuario, criarUsuario, ErroUsuario, excluirUsuario, inativarUsuario, listarUsuarios } from "./usuarios.service";
import { ErroAutenticacao, redefinirSenhaUsuario, validarNovaSenha } from "../auth/auth.service";

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
  const problemaSenha = validarNovaSenha(validacao.data.senha, validacao.data.login);
  if (problemaSenha) return res.status(400).json({ erro: problemaSenha });

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

// Administrador redefine a senha de um usuário (ex.: funcionário esqueceu)
usuariosRouter.patch("/:id/senha", async (req, res) => {
  const validacao = z.object({ novaSenha: z.string().min(1, "Informe a nova senha.") }).safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    await redefinirSenhaUsuario(req.params.id, validacao.data.novaSenha, req.usuario!.id);
    return res.json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroAutenticacao) return res.status(400).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao redefinir a senha." });
  }
});

const alterarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  login: z.string().trim().min(3, "O login precisa ter pelo menos 3 letras.").regex(/^\S+$/, "O login não pode ter espaços."),
  papel: z.enum(["FUNCIONARIO", "ADMINISTRATIVO"]),
  status: z.enum(["ATIVO", "INATIVO"]),
});

usuariosRouter.put("/:id", async (req, res) => {
  const validacao = alterarUsuarioSchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  try {
    return res.json(await alterarUsuario(req.params.id, validacao.data, req.usuario!.id));
  } catch (erro: any) {
    if (erro instanceof ErroUsuario) return res.status(400).json({ erro: erro.message });
    if (erro?.code === "P2002") return res.status(409).json({ erro: "Já existe outro usuário com esse login." });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao alterar o usuário." });
  }
});

usuariosRouter.delete("/:id", async (req, res) => {
  try {
    return res.json(await excluirUsuario(req.params.id, req.usuario!.id));
  } catch (erro) {
    if (erro instanceof ErroUsuario) return res.status(400).json({ erro: erro.message });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao excluir o usuário." });
  }
});
