const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

export async function imprimirPedidoTermico(pedidoId: string) {
  const janela = window.open("about:blank", "_blank");
  const token = localStorage.getItem("oliveiras_token");

  try {
    const resposta = await fetch(`${BASE_URL}/pedidos/${pedidoId}/impressao?formato=termica58`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!resposta.ok) {
      throw new Error("Não foi possível preparar a impressão.");
    }

    const html = await resposta.text();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));

    if (!janela) {
      URL.revokeObjectURL(url);
      throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    }

    janela.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    janela?.close();
    throw erro;
  }
}
