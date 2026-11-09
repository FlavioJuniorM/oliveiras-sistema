import { mensagemDuplicidade, produtosDuplicados, temDuplicidade } from "../../shared/duplicidade";
import { Router } from "express";
import { z } from "zod";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import {
  alterarPrecoProduto,
  atualizarDadosProduto,
  criarProduto,
  inativarProduto,
  listarProdutos,
  obterProduto,
  excluirProduto,
} from "./produtos.service";

export const produtosRouter = Router();

produtosRouter.use(autenticar);

const produtoSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(2),
  categoriaId: z.string().uuid().optional(),
  tipoVenda: z.enum(["PESO", "UNIDADE", "PACOTE_FIXO"]),
  unidadeMedida: z.string().optional(),
  preco: z.number().positive("O preço deve ser maior que zero."),
  observacoes: z.string().optional(),
});

// Consulta de produtos é liberada para funcionário e administrativo (seção 2)
produtosRouter.get("/", async (req, res) => {
  const todos = req.query.todos === "true" && req.usuario!.papel === "ADMINISTRATIVO";
  const produtos = await listarProdutos(!todos);
  return res.json(produtos);
});

// Verificação de duplicados enquanto digita (mesmo nome ou código)
produtosRouter.get("/duplicados", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  return res.json(await produtosDuplicados({ nome: q.nome, codigo: q.codigo, ignorarId: q.ignorarId }));
});

produtosRouter.get("/:id", async (req, res) => {
  const produto = await obterProduto(req.params.id);
  if (!produto) {
    return res.status(404).json({ erro: "Produto não encontrado." });
  }
  return res.json(produto);
});

// Cadastrar um produto novo (com preço inicial) é ação administrativa
produtosRouter.post("/", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const validacao = produtoSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }
  const duplicados = await produtosDuplicados({ nome: validacao.data.nome, codigo: validacao.data.codigo ?? undefined });
  if (temDuplicidade(duplicados)) {
    return res.status(409).json({ erro: mensagemDuplicidade("um corte", duplicados), duplicados, podeContinuar: false });
  }

  try {
    const produto = await criarProduto({
      ...validacao.data,
      criadoPorId: req.usuario!.id,
    });
    return res.status(201).json(produto);
  } catch (erro: any) {
    if (erro.code === "P2002") {
      return res.status(409).json({ erro: "Já existe um produto com esse código." });
    }
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao criar produto." });
  }
});

// Editar dados gerais (nome, categoria, status) — NÃO altera preço.
// Regra 1 da especificação: preço nunca é editável nesta rota, mesmo por engano.
const dadosProdutoSchema = produtoSchema.omit({ preco: true }).partial();

produtosRouter.put("/:id", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const validacao = dadosProdutoSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }
  const duplicados = await produtosDuplicados({ nome: validacao.data.nome, codigo: validacao.data.codigo ?? undefined, ignorarId: req.params.id });
  if (temDuplicidade(duplicados)) {
    return res.status(409).json({ erro: mensagemDuplicidade("outro corte", duplicados), duplicados, podeContinuar: false });
  }

  try {
    const produto = await atualizarDadosProduto(req.params.id, validacao.data, req.usuario!.id);
    return res.json(produto);
  } catch (erro: any) {
    if (erro.code === "P2002") return res.status(409).json({ erro: "Já existe outro produto com esse código." });
    if (erro.code === "P2025") return res.status(404).json({ erro: "Produto não encontrado." });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao atualizar o produto." });
  }
});

// Única rota capaz de alterar preço — sempre e só ADMINISTRATIVO (regra 1)
const precoSchema = z.object({
  preco: z.number().positive("O preço deve ser maior que zero."),
});

produtosRouter.patch("/:id/preco", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const validacao = precoSchema.safeParse(req.body);
  if (!validacao.success) {
    return res.status(400).json({ erro: validacao.error.issues[0].message });
  }

  const produto = await alterarPrecoProduto(req.params.id, validacao.data.preco, req.usuario!.id);
  return res.json(produto);
});

produtosRouter.patch("/:id/inativar", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const produto = await inativarProduto(req.params.id, req.usuario!.id);
  return res.json(produto);
});

produtosRouter.delete("/:id", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  try {
    const produto = await excluirProduto(req.params.id, req.usuario!.id);
    return res.json(produto);
  } catch (erro: any) {
    if (erro.code === "P2025") return res.status(404).json({ erro: "Produto não encontrado." });
    console.error(erro);
    return res.status(500).json({ erro: "Erro interno ao excluir produto." });
  }
});
