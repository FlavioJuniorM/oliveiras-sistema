import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularSubtotalItem,
  calcularTotaisPedido,
  quantidadeParaPreco,
  unidadePadraoProduto,
  validarDesconto,
  validarPagamentoPedido,
} from "../src/modules/pedidos/regras";

test("identifica a unidade padrão do produto", () => {
  assert.equal(unidadePadraoProduto("kg"), "kg");
  assert.equal(unidadePadraoProduto("gramas"), "g");
  assert.equal(unidadePadraoProduto("un"), "peca");
  assert.equal(unidadePadraoProduto("unidade"), "unidade");
});

test("converte gramas para quilos quando o produto é vendido por kg", () => {
  assert.equal(quantidadeParaPreco(500, "g", "kg"), 0.5);
  assert.equal(calcularSubtotalItem(40, 500, "g", "kg"), 20);
});

test("não converte unidades que não são peso", () => {
  assert.equal(quantidadeParaPreco(3, "peca", "un"), 3);
  assert.equal(calcularSubtotalItem(12.5, 3, "peca", "un"), 37.5);
});

test("calcula subtotal e total com desconto", () => {
  assert.deepEqual(calcularTotaisPedido([10.005, 20], 2), {
    subtotal: 30.01,
    total: 28.01,
  });
});

test("rejeita desconto para funcionário", () => {
  assert.throws(
    () => validarDesconto(5, "FUNCIONARIO"),
    /Aplicar desconto requer autorização administrativa/
  );
  assert.doesNotThrow(() => validarDesconto(5, "ADMINISTRATIVO"));
});

test("aceita pedido pendente sem pagamento imediato", () => {
  assert.deepEqual(
    validarPagamentoPedido({ total: 100, totalPagoImediato: 0 }),
    { saldoDevido: 100, statusPagamento: "PENDENTE" }
  );
});

test("aceita pagamento imediato integral", () => {
  assert.deepEqual(
    validarPagamentoPedido({ total: 100, totalPagoImediato: 100 }),
    { saldoDevido: 0, statusPagamento: "PAGO" }
  );
});

test("aceita divisão válida entre pagamento imediato e prazo", () => {
  assert.deepEqual(
    validarPagamentoPedido({
      total: 100,
      totalPagoImediato: 60,
      valorAPrazo: 40,
      vencimento: new Date("2026-11-01"),
      clienteId: "cliente-1",
    }),
    { saldoDevido: 40, statusPagamento: "PARCIALMENTE_PAGO" }
  );
});

test("rejeita pagamento imediato acima do total", () => {
  assert.throws(
    () => validarPagamentoPedido({ total: 100, totalPagoImediato: 100.02 }),
    /total pago não pode ser maior/
  );
});

test("exige cliente e vencimento quando há saldo a prazo", () => {
  assert.throws(
    () => validarPagamentoPedido({ total: 100, totalPagoImediato: 60, valorAPrazo: 40 }),
    /Informe o vencimento/
  );
  assert.throws(
    () =>
      validarPagamentoPedido({
        total: 100,
        totalPagoImediato: 60,
        valorAPrazo: 40,
        vencimento: new Date("2026-11-01"),
      }),
    /Vendas a prazo exigem um cliente cadastrado/
  );
});

test("rejeita divisão de pagamento que não fecha o total", () => {
  assert.throws(
    () =>
      validarPagamentoPedido({
        total: 100,
        totalPagoImediato: 60,
        valorAPrazo: 30,
        vencimento: new Date("2026-11-01"),
        clienteId: "cliente-1",
      }),
    /não fecha com o valor total/
  );
});
