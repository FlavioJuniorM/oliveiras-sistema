import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

interface LoginInput {
  login: string;
  senha: string;
}

export class ErroAutenticacao extends Error {}

export async function autenticarUsuario({ login, senha }: LoginInput) {
  const usuario = await prisma.usuario.findUnique({ where: { login } });

  if (!usuario || usuario.status !== "ATIVO") {
    // Mensagem genérica de propósito — não revela se o login existe ou não
    throw new ErroAutenticacao("Login ou senha inválidos.");
  }

  const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);

  if (!senhaCorreta) {
    throw new ErroAutenticacao("Login ou senha inválidos.");
  }

  const payload = {
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as jwt.SignOptions["expiresIn"],
  });

  await registrarLog({
    usuarioId: usuario.id,
    acao: "LOGIN",
    detalhes: `${usuario.nome} entrou no sistema`,
  });

  return {
    token,
    usuario: payload,
  };
}
