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
