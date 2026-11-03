export function formatarMoeda(valor: string | number) {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: string | Date) {
  return new Date(data).toLocaleDateString("pt-BR");
}

export function formatarDataHora(data: string | Date) {
  return new Date(data).toLocaleString("pt-BR");
}

/** "5 kg", "500 g", "15 unidades", "1 unidade" — como o pedido foi anotado. */
export function formatarQuantidadePedido(quantidade: number | string, unidade?: string) {
  const valor = Number(quantidade);
  const numero = valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (unidade === "kg" || unidade === "g") return `${numero} ${unidade}`;
  if (unidade === "peca") return `${numero} ${valor === 1 ? "peça" : "peças"}`;
  return `${numero} ${valor === 1 ? "unidade" : "unidades"}`;
}
