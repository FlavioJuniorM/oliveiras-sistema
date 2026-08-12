import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

interface CriarProdutoInput {
  codigo: string;
  nome: string;
  categoriaId?: string;
  tipoVenda: "PESO" | "UNIDADE" | "PACOTE_FIXO";
  unidadeMedida?: string;
  preco: number;
  observacoes?: string;
  criadoPorId: string;
}

export async function listarProdutos(somenteAtivos = true) {
  return prisma.produto.findMany({
    where: somenteAtivos ? { status: "ATIVO" } : undefined,
    include: { categoria: true },
    orderBy: { nome: "asc" },
  });
}

export async function obterProduto(id: string) {
  return prisma.produto.findUnique({ where: { id }, include: { categoria: true } });
}

export async function criarProduto(input: CriarProdutoInput) {
  const { criadoPorId, ...dados } = input;

  const produto = await prisma.produto.create({ data: dados });

  await registrarLog({
    usuarioId: criadoPorId,
    acao: "CRIOU_PRODUTO",
    entidade: "produto",
    entidadeId: produto.id,
    detalhes: `Cadastrou o produto ${produto.nome} — preço R$ ${produto.preco}`,
  });

  return produto;
}

/**
 * Atualiza dados gerais do produto SEM alterar o preço.
 * Usado por qualquer usuário autenticado com permissão de gestão de catálogo
 * (nome, categoria, observações, status) — nunca o campo `preco`.
 */
export async function atualizarDadosProduto(
  id: string,
  dados: Partial<Omit<CriarProdutoInput, "preco" | "criadoPorId">>,
  executadoPorId: string
) {
  const produto = await prisma.produto.update({ where: { id }, data: dados });

  await registrarLog({
    usuarioId: executadoPorId,
    acao: "ATUALIZOU_PRODUTO",
    entidade: "produto",
    entidadeId: produto.id,
    detalhes: `Atualizou dados do produto ${produto.nome}`,
  });

  return produto;
}

/**
 * Altera o preço de um produto — rota que expõe esta função deve estar
 * OBRIGATORIAMENTE restrita ao papel ADMINISTRATIVO (regra 1 da especificação).
 */
export async function alterarPrecoProduto(
  id: string,
  novoPreco: number,
  executadoPorId: string
) {
  const produtoAnterior = await prisma.produto.findUniqueOrThrow({ where: { id } });

  const produto = await prisma.produto.update({
    where: { id },
    data: { preco: novoPreco },
  });

  await registrarLog({
    usuarioId: executadoPorId,
    acao: "ALTEROU_PRECO_PRODUTO",
    entidade: "produto",
    entidadeId: produto.id,
    detalhes: `Alterou o preço de ${produto.nome} de R$ ${produtoAnterior.preco} para R$ ${novoPreco}`,
  });

  return produto;
}

export async function inativarProduto(id: string, executadoPorId: string) {
  const produto = await prisma.produto.update({
    where: { id },
    data: { status: "INATIVO" },
  });

  await registrarLog({
    usuarioId: executadoPorId,
    acao: "INATIVOU_PRODUTO",
    entidade: "produto",
    entidadeId: produto.id,
    detalhes: `Inativou o produto ${produto.nome}`,
  });

  return produto;
}

export async function excluirProduto(id: string, executadoPorId: string) {
  const produto = await prisma.produto.findUnique({
    where: { id },
    include: { _count: { select: { itens: true } } },
  });

  if (!produto) throw new Error("Produto não encontrado.");

  if (produto._count.itens > 0) {
    return inativarProduto(id, executadoPorId);
  }

  await prisma.produto.delete({ where: { id } });
  await registrarLog({
    usuarioId: executadoPorId,
    acao: "EXCLUIU_PRODUTO",
    entidade: "produto",
    entidadeId: id,
    detalhes: `Excluiu o produto ${produto.nome}`,
  });
  return { id, status: "EXCLUIDO" };
}
