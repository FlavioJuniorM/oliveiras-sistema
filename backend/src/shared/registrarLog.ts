import { prisma } from "../config/database";

interface RegistrarLogParams {
  usuarioId: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: string;
}

/**
 * Registra uma entrada no histórico de auditoria.
 * Logs nunca são editados ou apagados por rotas normais da aplicação
 * (ver seção 13 da especificação — histórico não pode ser apagado por usuários comuns).
 */
export async function registrarLog(params: RegistrarLogParams) {
  await prisma.log.create({
    data: {
      usuarioId: params.usuarioId,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId,
      detalhes: params.detalhes,
    },
  });
}
