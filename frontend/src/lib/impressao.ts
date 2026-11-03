const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

/**
 * Tipos de impressão térmica (58 mm):
 * - "corte": pedido para o balcão dos açougueiros, sem valores
 * - "cliente": nota final com logo, pesos e total (após a pesagem)
 */
export type TipoImpressao = "corte" | "cliente";

/**
 * Abre a janela de impressão imediatamente (no clique), para o navegador não
 * bloquear o pop-up mesmo que o conteúdo só chegue depois de salvar o pedido.
 */
export function abrirJanelaImpressao() {
  const janela = window.open("about:blank", "_blank");
  if (janela) {
    janela.document.write('<p style="font-family:sans-serif;padding:16px">Preparando impressão...</p>');
  }
  return janela;
}

export async function imprimirNaJanela(janela: Window | null, pedidoId: string, tipo: TipoImpressao) {
  const token = localStorage.getItem("oliveiras_token");

  try {
    if (!janela) {
      throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    }

    const resposta = await fetch(`${BASE_URL}/pedidos/${pedidoId}/impressao?formato=termica58&tipo=${tipo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      throw new Error(corpo?.erro || "Não foi possível preparar a impressão.");
    }

    const html = await resposta.text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    janela.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    janela?.close();
    throw erro;
  }
}

export async function imprimirPedidoTermico(pedidoId: string, tipo: TipoImpressao = "cliente") {
  return imprimirNaJanela(abrirJanelaImpressao(), pedidoId, tipo);
}
