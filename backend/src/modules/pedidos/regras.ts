export type UnidadePedido = "kg" | "g" | "peca" | "unidade" | "outra";
export type PapelUsuario = "FUNCIONARIO" | "ADMINISTRATIVO";
export type StatusPagamentoCalculado = "PAGO" | "PARCIALMENTE_PAGO" | "PENDENTE";

export const TOLERANCIA_CENTAVOS = 0.01;

export function unidadePadraoProduto(unidadeMedida: string): UnidadePedido {
  const unidade = unidadeMedida.toLowerCase();

  if (unidade === "g" || unidade.includes("gram")) return "g";
  if (unidade === "un" || unidade.includes("pec")) return "peca";
  if (unidade.includes("unid")) return "unidade";
  return "kg";
}

export function quantidadeParaPreco(
  quantidade: number,
  unidade: UnidadePedido,
  unidadeProduto: string
) {
  const produtoEmQuilo =
    unidadeProduto.toLowerCase() === "kg" || unidadeProduto.toLowerCase().includes("quilo");

  return unidade === "g" && produtoEmQuilo ? quantidade / 1000 : quantidade;
}

export function calcularSubtotalItem(
  precoUnitario: number,
  quantidade: number,
  unidade: UnidadePedido,
  unidadeProduto: string
) {
  return Number(
    (
      precoUnitario * quantidadeParaPreco(quantidade, unidade, unidadeProduto)
    ).toFixed(2)
  );
}

export function calcularTotaisPedido(subtotais: number[], desconto: number) {
  const subtotal = Number(subtotais.reduce((soma, item) => soma + item, 0).toFixed(2));
  const total = Number((subtotal - desconto).toFixed(2));

  return { subtotal, total };
}

export function validarDesconto(desconto: number, papelUsuario: PapelUsuario) {
  if (desconto > 0 && papelUsuario !== "ADMINISTRATIVO") {
    throw new Error("Aplicar desconto requer autorização administrativa.");
  }
}

export function validarPagamentoPedido(input: {
  total: number;
  totalPagoImediato: number;
  valorAPrazo?: number;
  vencimento?: Date;
  clienteId?: string;
}) {
  const valorAPrazo = input.valorAPrazo || 0;
  const totalPagoImediato = Number(input.totalPagoImediato.toFixed(2));
  const saldoDevido = Number((input.total - totalPagoImediato).toFixed(2));

  if (saldoDevido > TOLERANCIA_CENTAVOS) {
    const pedidoEmAberto =
      totalPagoImediato <= TOLERANCIA_CENTAVOS && valorAPrazo <= TOLERANCIA_CENTAVOS;

    if (!pedidoEmAberto && Math.abs(saldoDevido - valorAPrazo) > TOLERANCIA_CENTAVOS) {
      throw new Error("A soma dos pagamentos informados não fecha com o valor total do pedido.");
    }
    if (!pedidoEmAberto && !input.vencimento) {
      throw new Error("Informe o vencimento para a parte do pedido a prazo.");
    }
    if (!pedidoEmAberto && !input.clienteId) {
      throw new Error("Vendas a prazo exigem um cliente cadastrado.");
    }
  } else if (totalPagoImediato - input.total > TOLERANCIA_CENTAVOS) {
    throw new Error("O total pago não pode ser maior que o valor do pedido.");
  }

  const statusPagamento: StatusPagamentoCalculado =
    saldoDevido <= TOLERANCIA_CENTAVOS
      ? "PAGO"
      : totalPagoImediato > 0
      ? "PARCIALMENTE_PAGO"
      : "PENDENTE";

  return { saldoDevido, statusPagamento };
}

/**
 * Quantidade solicitada convertida para quilos, quando comparável com a balança.
 * Pedidos em peça/unidade não têm peso conhecido antes do corte → null.
 */
export function quantidadeSolicitadaEmKg(quantidade: number, unidade: UnidadePedido): number | null {
  if (unidade === "kg") return quantidade;
  if (unidade === "g") return quantidade / 1000;
  return null;
}

/**
 * Valor do item depois da pesagem. O valor real é sempre informado na unidade
 * de venda do produto (kg para carnes por peso, unidade para itens por unidade),
 * então o cálculo é direto: preço × valor real.
 */
export function calcularSubtotalPesado(precoUnitario: number, valorReal: number) {
  return Number((precoUnitario * valorReal).toFixed(2));
}

/** Estimativa (somente para pedidos públicos) — itens em peça/unidade ficam fora. */
export function estimarValorItem(
  precoUnitario: number,
  quantidade: number,
  unidade: UnidadePedido,
  unidadeProduto: string
) {
  const produtoEmQuilo = unidadeProduto.toLowerCase() === "kg" || unidadeProduto.toLowerCase().includes("quilo");
  if (!produtoEmQuilo) return calcularSubtotalPesado(precoUnitario, quantidade);
  const kg = quantidadeSolicitadaEmKg(quantidade, unidade);
  return kg == null ? 0 : calcularSubtotalPesado(precoUnitario, kg);
}
