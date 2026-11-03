import assert from "node:assert/strict";
import test from "node:test";
import { excedeToleranciaPesagem } from "../src/modules/configuracoes/configuracoes.service";

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
