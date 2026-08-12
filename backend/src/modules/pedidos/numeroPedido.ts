import { Prisma } from "@prisma/client";

/**
 * Gera o próximo número sequencial de pedido no formato ANO-NNNNNN (ex: 2026-000123).
 * Usa o contador dentro da MESMA transação do pedido para evitar números duplicados
 * quando dois funcionários finalizam pedidos ao mesmo tempo (regra 10: número único).
 */
export async function gerarNumeroPedido(tx: Prisma.TransactionClient): Promise<string> {
  const ano = new Date().getFullYear();

  const contador = await tx.contadorPedido.upsert({
    where: { ano },
    create: { ano, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });

  const numeroFormatado = String(contador.ultimoNumero).padStart(6, "0");
  return `${ano}-${numeroFormatado}`;
}
