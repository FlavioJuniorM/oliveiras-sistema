/**
 * Dias úteis para vencimento de boleto.
 * Boleto que vence em sábado, domingo ou feriado pode ser pago no próximo dia útil sem juros,
 * então o calendário de Contas a Pagar mostra a conta nesse dia (a data do boleto fica guardada).
 *
 * Feriados considerados: nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi, em que
 * os bancos não abrem), 9 de julho (estado de SP), aniversário de Osasco (19/02) e 31/12 (sem expediente bancário).
 * Datas de calendário = meia-noite UTC.
 */

function pascoa(ano: number) {
  // Algoritmo de Meeus/Jones/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(ano, mes - 1, dia);
}

const cache = new Map<number, Map<string, string>>();
const DIA = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function feriadosDoAno(ano: number) {
  const pronto = cache.get(ano);
  if (pronto) return pronto;
  const p = pascoa(ano);
  const mapa = new Map<string, string>([
    [`${ano}-01-01`, "Confraternização Universal"],
    [iso(p - 48 * DIA), "Carnaval"],
    [iso(p - 47 * DIA), "Carnaval"],
    [`${ano}-02-19`, "Aniversário de Osasco"],
    [iso(p - 2 * DIA), "Sexta-feira Santa"],
    [`${ano}-04-21`, "Tiradentes"],
    [`${ano}-05-01`, "Dia do Trabalho"],
    [iso(p + 60 * DIA), "Corpus Christi"],
    [`${ano}-07-09`, "Revolução Constitucionalista (SP)"],
    [`${ano}-09-07`, "Independência"],
    [`${ano}-10-12`, "Nossa Senhora Aparecida"],
    [`${ano}-11-02`, "Finados"],
    [`${ano}-11-15`, "Proclamação da República"],
    [`${ano}-11-20`, "Consciência Negra"],
    [`${ano}-12-25`, "Natal"],
    [`${ano}-12-31`, "Último dia do ano (sem expediente bancário)"],
  ]);
  cache.set(ano, mapa);
  return mapa;
}

/** Por que o dia não é útil ("Sábado", "Domingo", nome do feriado) — ou null se for dia útil. */
export function motivoNaoUtil(data: Date) {
  const dia = data.getUTCDay();
  if (dia === 6) return "Sábado";
  if (dia === 0) return "Domingo";
  return feriadosDoAno(data.getUTCFullYear()).get(data.toISOString().slice(0, 10)) ?? null;
}

/** O próprio dia, se for útil; senão o próximo dia útil. */
export function proximoDiaUtil(data: Date) {
  let d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  for (let i = 0; i < 15 && motivoNaoUtil(d); i++) d = new Date(d.getTime() + DIA);
  return d;
}

/**
 * Vencimento digitado → { vencimento (dia útil, vai para o calendário), vencimentoOriginal (o do boleto, se mudou) }.
 */
export function ajustarVencimento(digitado: Date) {
  const dia = new Date(Date.UTC(digitado.getUTCFullYear(), digitado.getUTCMonth(), digitado.getUTCDate()));
  const util = proximoDiaUtil(dia);
  return { vencimento: util, vencimentoOriginal: util.getTime() === dia.getTime() ? null : dia };
}
