import type { Request } from "express";
import { prisma } from "../config/database";

/**
 * Limites contra abuso (tentativas de senha e spam de pedidos pelo site).
 * Os registros ficam no banco porque na Vercel cada requisição pode cair em
 * um servidor diferente — contador em memória não funcionaria.
 */
export type TipoTentativa =
  | "LOGIN_FALHA_USUARIO"
  | "LOGIN_FALHA_IP"
  | "PEDIDO_PUBLICO_IP"
  | "PEDIDO_PUBLICO_TELEFONE";

export async function contarTentativas(tipo: TipoTentativa, chave: string, janelaMinutos: number) {
  const desde = new Date(Date.now() - janelaMinutos * 60 * 1000);
  return prisma.tentativaAcesso.count({ where: { tipo, chave, criadoEm: { gte: desde } } });
}

export async function registrarTentativa(tipo: TipoTentativa, chave: string) {
  await prisma.tentativaAcesso.create({ data: { tipo, chave } });
  // Limpeza ocasional: registros com mais de 2 dias não servem para nada
  if (Math.random() < 0.05) {
    await prisma.tentativaAcesso.deleteMany({ where: { criadoEm: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } } });
  }
}

export async function limparTentativas(tipo: TipoTentativa, chave: string) {
  await prisma.tentativaAcesso.deleteMany({ where: { tipo, chave } });
}

/** IP real do cliente (atrás do proxy da Vercel). */
export function ipDaRequisicao(req: Request) {
  const encaminhado = req.headers["x-forwarded-for"];
  const primeiro = (Array.isArray(encaminhado) ? encaminhado[0] : encaminhado)?.split(",")[0]?.trim();
  return primeiro || req.ip || "desconhecido";
}

/** Só os dígitos do telefone, para "11 98888-1234" e "(11)988881234" contarem igual. */
export function normalizarTelefone(telefone: string) {
  return telefone.replace(/\D/g, "").slice(-11);
}
