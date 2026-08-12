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
export function autenticar(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ erro: "Token de autenticação não informado." });
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    return res.status(401).json({ erro: "Token de autenticação mal formatado." });
  }

  try {
    const segredo = process.env.JWT_SECRET as string;
    const payload = jwt.verify(token, segredo) as UsuarioAutenticado;

    req.usuario = {
      id: payload.id,
      nome: payload.nome,
      papel: payload.papel,
    };

    return next();
  } catch (erro) {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}
