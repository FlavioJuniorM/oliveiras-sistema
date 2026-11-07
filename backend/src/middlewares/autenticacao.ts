import { prisma } from "../config/database";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  papel: "FUNCIONARIO" | "ADMINISTRATIVO";
}

// Estende o tipo Request do Express para carregar o usuário autenticado
declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

/**
 * Middleware que valida o token JWT enviado no header Authorization.
 * Toda rota protegida deve passar por aqui antes de qualquer lógica de negócio
 * (regra 14 da especificação: validação de permissões no frontend E backend).
 */
export async function autenticar(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: "Token de autenticação não informado." });
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    return res.status(401).json({ erro: "Token de autenticação mal formatado." });
  }

  let payload: UsuarioAutenticado;
  try {
    const segredo = process.env.JWT_SECRET as string;
    payload = jwt.verify(token, segredo) as UsuarioAutenticado;
  } catch (erro) {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }

  try {
    // Confere no banco: usuário excluído/desativado perde o acesso na hora,
    // e mudança de papel (funcionário ↔ administrativo) vale no próximo clique.
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, nome: true, papel: true, status: true },
    });
    if (!usuario || usuario.status !== "ATIVO") {
      return res.status(401).json({ erro: "Seu acesso foi desativado. Fale com o administrador." });
    }

    req.usuario = { id: usuario.id, nome: usuario.nome, papel: usuario.papel };
    return next();
  } catch (erro) {
    return next(erro);
  }
}
