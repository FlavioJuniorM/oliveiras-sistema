import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { autenticar } from "../../middlewares/autenticacao";
import { somentePapel } from "../../middlewares/permissoes";
import { registrarLog } from "../../shared/registrarLog";

/** Motoboys de confiança: o "Abrir no WhatsApp" da rota vai direto para a conversa deles. */
export const motoboysRouter = Router();
motoboysRouter.use(autenticar);

const motoboySchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do motoboy."),
  telefone: z
    .string()
    .transform((valor) => valor.replace(/\D/g, ""))
    .refine((valor) => valor.length >= 10 && valor.length <= 13, "Informe o WhatsApp com DDD (ex.: 11 98888-1234)."),
});

// Lista os ativos (qualquer usuário pode enviar a rota)
motoboysRouter.get("/", async (_req, res) => {
  return res.json(await prisma.motoboy.findMany({ where: { status: "ATIVO" }, orderBy: { nome: "asc" } }));
});

motoboysRouter.post("/", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  const validacao = motoboySchema.safeParse(req.body);
  if (!validacao.success) return res.status(400).json({ erro: validacao.error.issues[0].message });
  const motoboy = await prisma.motoboy.create({ data: validacao.data });
  await registrarLog({ usuarioId: req.usuario!.id, acao: "CADASTROU_MOTOBOY", entidade: "motoboy", entidadeId: motoboy.id, detalhes: `Cadastrou o motoboy ${motoboy.nome}` });
  return res.status(201).json(motoboy);
});

motoboysRouter.patch("/:id/inativar", somentePapel("ADMINISTRATIVO"), async (req, res) => {
  try {
    const motoboy = await prisma.motoboy.update({ where: { id: req.params.id }, data: { status: "INATIVO" } });
    await registrarLog({ usuarioId: req.usuario!.id, acao: "REMOVEU_MOTOBOY", entidade: "motoboy", entidadeId: motoboy.id, detalhes: `Removeu o motoboy ${motoboy.nome}` });
    return res.json(motoboy);
  } catch {
    return res.status(404).json({ erro: "Motoboy não encontrado." });
  }
});
