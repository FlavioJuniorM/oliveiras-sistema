import { prisma } from "../../config/database";

export async function listarCategorias() {
  return prisma.categoriaProduto.findMany({ orderBy: { nome: "asc" } });
}

export async function criarCategoria(nome: string) {
  return prisma.categoriaProduto.create({ data: { nome } });
}
