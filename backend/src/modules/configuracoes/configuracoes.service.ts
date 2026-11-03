import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

export const TOLERANCIA_PESAGEM_PADRAO = 10;

export async function obterConfiguracaoPesagem() {
  const configuracao = await prisma.configuracaoSistema.findUnique({
    where: { id: "principal" },
  });

  return {
    toleranciaPesagemPercentual: Number(
      configuracao?.toleranciaPesagemPercentual ?? TOLERANCIA_PESAGEM_PADRAO
    ),
  };
}

export async function atualizarConfiguracaoPesagem(
  toleranciaPesagemPercentual: number,
  usuarioId: string
) {
  const configuracao = await prisma.configuracaoSistema.upsert({
    where: { id: "principal" },
    create: { id: "principal", toleranciaPesagemPercentual },
    update: { toleranciaPesagemPercentual },
  });

  await registrarLog({
    usuarioId,
    acao: "ATUALIZOU_CONFIGURACAO",
    entidade: "configuracao_sistema",
    entidadeId: configuracao.id,
    detalhes: `Atualizou a tolerância de pesagem para ${toleranciaPesagemPercentual}%`,
  });

  return {
    toleranciaPesagemPercentual: Number(configuracao.toleranciaPesagemPercentual),
  };
}

export function excedeToleranciaPesagem(
  solicitado: number,
  pesoReal: number,
  toleranciaPesagemPercentual: number
) {
  if (solicitado <= 0 || pesoReal <= solicitado) return false;
  const limite = solicitado * (1 + toleranciaPesagemPercentual / 100);
  return pesoReal > limite + 0.0005;
}
