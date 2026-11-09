import type { Dia } from "./tipos";

export const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 1 })} kg`;
export const numero = (v: number) => v.toLocaleString("pt-BR");
export const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/** "2026-11-03" → "03/11" */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2026-11-03" → "03/11/2026" */
export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const diaDaSemana = (iso: string) => SEMANA[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Variação já em texto: "+12,5%" / "-3%" / "novo" */
export function textoVariacao(v: number | null) {
  if (v == null) return "sem base";
  const s = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${s}%`;
}

export interface Ponto {
  rotulo: string;
  rotuloLongo: string;
  entradas: number;
  saidas: number;
}

/**
 * Pontos do gráfico de entradas × saídas. Até 62 dias: um ponto por dia.
 * Períodos maiores: agrupa por semana (segunda a domingo) para o gráfico continuar legível.
 */
export function pontosDaSerie(dias: Dia[]): { pontos: Ponto[]; agrupamento: "dia" | "semana" } {
  if (dias.length <= 62) {
    return {
      agrupamento: "dia",
      pontos: dias.map((d) => ({ rotulo: diaMes(d.data), rotuloLongo: `${diaDaSemana(d.data)}, ${dataBR(d.data)}`, entradas: d.entradas, saidas: d.saidas })),
    };
  }
  const semanas: Ponto[] = [];
  let atual: (Ponto & { ultimo: string }) | null = null;
  for (const d of dias) {
    const segunda = new Date(`${d.data}T00:00:00Z`).getUTCDay() === 1;
    if (!atual || segunda) {
      if (atual) semanas.push({ ...atual, rotuloLongo: `Semana de ${dataBR(atual.rotuloLongo)} a ${dataBR(atual.ultimo)}` });
      atual = { rotulo: diaMes(d.data), rotuloLongo: d.data, entradas: 0, saidas: 0, ultimo: d.data };
    }
    atual.entradas += d.entradas;
    atual.saidas += d.saidas;
    atual.ultimo = d.data;
  }
  if (atual) semanas.push({ ...atual, rotuloLongo: `Semana de ${dataBR(atual.rotuloLongo)} a ${dataBR(atual.ultimo)}` });
  return { agrupamento: "semana", pontos: semanas.map((s) => ({ ...s, entradas: Math.round(s.entradas * 100) / 100, saidas: Math.round(s.saidas * 100) / 100 })) };
}
