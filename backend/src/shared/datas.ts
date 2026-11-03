/**
 * Datas no fuso da loja.
 *
 * O servidor (Vercel) roda em UTC, 3 horas à frente de Brasília. Sem tratar o fuso:
 * - a nota impressa saía com o horário adiantado em 3h;
 * - o "dia" do dashboard virava às 21h;
 * - relatórios "até hoje" deixavam de fora o último dia.
 *
 * Dois tipos de data existem no sistema:
 * 1. INSTANTES (criadoEm, pagamentos): um momento exato → exibir/comparar no fuso da loja.
 * 2. DATAS DE CALENDÁRIO (vencimento, lançamento): o usuário escolhe "18/11/2026" e o
 *    banco guarda 18/11 00:00 UTC → exibir/comparar em UTC, senão vira 17/11.
 *
 * Brasília não tem horário de verão desde 2019, então o deslocamento é fixo em -03:00.
 */
export const FUSO_LOJA = "America/Sao_Paulo";
const DESLOCAMENTO_LOJA = "-03:00";

/** "2026-11-03" — data de calendário de um instante, no fuso da loja. */
export function dataNaLoja(instante: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_LOJA, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

/** Instante da meia-noite (horário de Brasília) do dia informado. */
export function inicioDoDiaNaLoja(instante: Date = new Date()) {
  return new Date(`${dataNaLoja(instante)}T00:00:00${DESLOCAMENTO_LOJA}`);
}

/** Instante da meia-noite do dia 1º do mês corrente (horário de Brasília). */
export function inicioDoMesNaLoja(instante: Date = new Date()) {
  return new Date(`${dataNaLoja(instante).slice(0, 8)}01T00:00:00${DESLOCAMENTO_LOJA}`);
}

export function anoNaLoja(instante: Date = new Date()) {
  return Number(dataNaLoja(instante).slice(0, 4));
}

/** "Hoje" como data de calendário (meia-noite UTC), para comparar com vencimentos. */
export function hojeCalendario(instante: Date = new Date()) {
  return new Date(`${dataNaLoja(instante)}T00:00:00Z`);
}

/** Converte um período "AAAA-MM-DD" a "AAAA-MM-DD" no intervalo completo de dias da loja. */
export function periodoNaLoja(inicio: string, fim: string) {
  const inicioInstante = new Date(`${inicio}T00:00:00${DESLOCAMENTO_LOJA}`);
  const fimInstante = new Date(new Date(`${fim}T00:00:00${DESLOCAMENTO_LOJA}`).getTime() + 24 * 60 * 60 * 1000 - 1);
  return { inicio: inicioInstante, fim: fimInstante };
}

/** "03/11/2026 18:10" — instante no horário de Brasília. */
export function formatarDataHoraLoja(instante: Date | string) {
  return new Date(instante)
    .toLocaleString("pt-BR", { timeZone: FUSO_LOJA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(",", "");
}

/** "18/11/2026" — data de calendário (vencimento), sem deslocar o dia. */
export function formatarDataCalendario(data: Date | string) {
  return new Date(data).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
