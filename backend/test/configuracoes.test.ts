import assert from "node:assert/strict";
import test from "node:test";
import { excedeToleranciaPesagem, pesoMuitoAbaixoDoSolicitado } from "../src/modules/configuracoes/configuracoes.service";

test("aceita peso dentro da tolerância configurada", () => {
  assert.equal(excedeToleranciaPesagem(1, 1.1, 10), false);
});

test("bloqueia peso acima da tolerância configurada", () => {
  assert.equal(excedeToleranciaPesagem(1, 1.11, 10), true);
});

test("não aplica tolerância quando o peso real é menor ou igual ao solicitado", () => {
  assert.equal(excedeToleranciaPesagem(1, 0.9, 0), false);
  assert.equal(excedeToleranciaPesagem(1, 1, 0), false);
});

test("bloqueia peso real muito abaixo do solicitado (erro de unidade g/kg)", () => {
  // pedido de 5000 g, açougueiro digitou 5,2 achando que era kg
  assert.equal(pesoMuitoAbaixoDoSolicitado(5000, 5.2), true);
  assert.equal(pesoMuitoAbaixoDoSolicitado(5000, 5200), false);
  assert.equal(pesoMuitoAbaixoDoSolicitado(2, 1.5), false);
});
