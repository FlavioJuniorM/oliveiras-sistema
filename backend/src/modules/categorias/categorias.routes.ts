import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { criarCategoria, listarCategorias } from "./categorias.service";

export const categoriasRouter = Router();

categoriasRouter.use(autenticar);

categoriasRouter.get("/", async (_req, res) => {
  const categorias = await listarCategorias();
  return res.json(categorias);
});

const categoriaSchema = z.object({ nome: z.string().min(2) });

// Criar categoria é uma ação administrativa (organização do catálogo)
categoriasRouter.post("/", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const validacao = categoriaSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }
  const categoria = await criarCategoria(validacao.data.nome);
  return res.status(201).json(categoria);
});
