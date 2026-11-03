export function formatarMoeda(valor: string | number) {
  const numero = typeof valor === "string" ? Number(valor) : valor;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data de um instante (ex.: última compra, data de pagamento), no horário local. */
export function formatarData(data: string | Date) {
  return new Date(data).toLocaleDateString("pt-BR");
}

/**
 * Data de calendário escolhida pelo usuário (vencimento, lançamento). O banco guarda
 * "18/11" como 18/11 00:00 UTC; exibir em UTC evita mostrar 17/11 no Brasil.
 */
export function formatarDataCalendario(data: string | Date) {
  return new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** "AAAA-MM-DD" do dia LOCAL (toISOString usaria UTC e viraria o dia às 21h). */
export function dataLocalISO(data: Date = new Date()) {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mes}-${dia}`;
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
