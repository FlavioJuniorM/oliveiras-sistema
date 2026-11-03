import assert from "node:assert/strict";
import test from "node:test";
import {
  anoNaLoja,
  formatarDataCalendario,
  formatarDataHoraLoja,
  hojeCalendario,
  inicioDoDiaNaLoja,
  inicioDoMesNaLoja,
  periodoNaLoja,
} from "../src/shared/datas";

// Os testes valem com qualquer fuso do servidor (a Vercel roda em UTC).

test("nota impressa mostra o horário de Brasília, não o do servidor", () => {
  // 21:10 UTC = 18:10 em Brasília
  assert.equal(formatarDataHoraLoja(new Date("2026-11-03T21:10:00Z")), "03/11/2026 18:10");
});

test("às 22h30 de Brasília ainda é o mesmo dia (antes virava às 21h)", () => {
  const instante = new Date("2026-11-04T01:30:00Z"); // 03/11 22:30 em Brasília
  assert.equal(inicioDoDiaNaLoja(instante).toISOString(), "2026-11-03T03:00:00.000Z");
  assert.equal(hojeCalendario(instante).toISOString(), "2026-11-03T00:00:00.000Z");
});

test("vencimento escolhido como 18/11 é exibido como 18/11", () => {
  assert.equal(formatarDataCalendario("2026-11-18T00:00:00.000Z"), "18/11/2026");
});

test("relatório 'até 03/11' inclui o dia 03/11 inteiro", () => {
  const { inicio, fim } = periodoNaLoja("2026-11-01", "2026-11-03");
  assert.equal(inicio.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(fim.toISOString(), "2026-11-04T02:59:59.999Z");
});

test("início do mês e ano no horário de Brasília", () => {
  const virada = new Date("2027-01-01T02:00:00Z"); // 31/12/2026 23:00 em Brasília
  assert.equal(anoNaLoja(virada), 2026);
  assert.equal(inicioDoMesNaLoja(virada).toISOString(), "2026-12-01T03:00:00.000Z");
});
