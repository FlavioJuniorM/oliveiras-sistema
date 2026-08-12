import { NextFunction, Request, Response } from "express";
import { UsuarioAutenticado } from "./autenticacao";

type Papel = UsuarioAutenticado["papel"];

/**
 * Middleware que restringe uma rota a um ou mais papéis específicos.
 * Uso: router.delete("/pedidos/:id", autenticar, somentePapel("ADMINISTRATIVO"), handler)
 *
 * Implementa as regras 1 e 2 da especificação:
 * - Funcionário não pode alterar preços
 * - Funcionário não pode excluir pedidos
 * (e qualquer outra restrição equivalente nos demais módulos)
 */
export function somentePapel(...papeisPermitidos: Papel[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: "Usuário não autenticado." });
    }

    if (!papeisPermitidos.includes(req.usuario.papel)) {
      return res.status(403).json({
        erro: "Você não tem permissão para realizar esta ação.",
      });
    }

    return next();
  };
}
