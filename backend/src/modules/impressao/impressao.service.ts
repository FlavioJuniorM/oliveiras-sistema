import { obterPedido } from "../pedidos/pedidos.service";

const NOME_LOJA = "CASA DE CARNES OLIVEIRAS";

const NOMES_FORMA_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO_DEBITO: "Cartão de Débito",
  CARTAO_CREDITO: "Cartão de Crédito",
  TRANSFERENCIA: "Transferência",
  BOLETO: "Boleto",
  A_PRAZO: "A Prazo",
  OUTROS: "Outros",
};

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(data: Date) {
  return new Date(data).toLocaleString("pt-BR");
}

async function montarDadosComanda(pedidoId: string) {
  const pedido = await obterPedido(pedidoId);
  if (!pedido) return null;

  const formasResumo = [
    ...pedido.pagamentos.map((p) => `${NOMES_FORMA_PAGAMENTO[p.forma]}: ${formatarMoeda(Number(p.valor))}`),
    ...(pedido.contaReceber
      ? [`A Prazo: ${formatarMoeda(Number(pedido.contaReceber.valorOriginal))}`]
      : []),
  ];

  return { pedido, formasResumo };
}

/**
 * Gera o texto puro para impressoras térmicas (58mm ou 80mm).
 * 58mm ≈ 32 colunas | 80mm ≈ 42 colunas — usamos largura configurável.
 */
export async function gerarComandaTermica(pedidoId: string, largura: 32 | 42 = 32) {
  const dados = await montarDadosComanda(pedidoId);
  if (!dados) return null;
  const { pedido, formasResumo } = dados;

  const linha = "-".repeat(largura);
  const centralizar = (texto: string) =>
    texto.length >= largura
      ? texto.slice(0, largura)
      : " ".repeat(Math.floor((largura - texto.length) / 2)) + texto;

  const linhas: string[] = [];
  linhas.push(centralizar(NOME_LOJA));
  linhas.push(linha);
  linhas.push(`Pedido: ${pedido.numero}`);
  linhas.push(`Data: ${formatarDataHora(pedido.criadoEm)}`);
  linhas.push(`Cliente: ${pedido.cliente?.nome ?? "Consumidor final"}`);
  if (pedido.cliente?.documento) {
    linhas.push(`Doc: ${pedido.cliente.documento}`);
  }
  linhas.push(linha);

  for (const item of pedido.itens) {
    linhas.push(item.produto.nome);
    linhas.push(
      `  ${Number(item.pesoOuQtd)} x ${formatarMoeda(Number(item.precoUnitario))} = ${formatarMoeda(Number(item.subtotal))}`
    );
  }

  linhas.push(linha);
  linhas.push(`Subtotal: ${formatarMoeda(Number(pedido.subtotal))}`);
  if (Number(pedido.desconto) > 0) {
    linhas.push(`Desconto: -${formatarMoeda(Number(pedido.desconto))}`);
  }
  linhas.push(`TOTAL: ${formatarMoeda(Number(pedido.total))}`);
  linhas.push(linha);
  linhas.push("Pagamento:");
  formasResumo.forEach((f) => linhas.push(`  ${f}`));

  if (pedido.contaReceber) {
    linhas.push(linha);
    linhas.push(`SALDO A RECEBER: ${formatarMoeda(Number(pedido.contaReceber.saldo))}`);
    linhas.push(`Vencimento: ${new Date(pedido.contaReceber.vencimento).toLocaleDateString("pt-BR")}`);
  }

  linhas.push(linha);
  linhas.push(`Atendente: ${pedido.usuario.nome}`);
  linhas.push(centralizar("Obrigado pela preferência!"));

  return linhas.join("\n");
}

/**
 * Gera um HTML pronto para impressão em A4 (ou exportação para PDF pelo navegador).
 */
export async function gerarComandaA4Html(pedidoId: string) {
  const dados = await montarDadosComanda(pedidoId);
  if (!dados) return null;
  const { pedido, formasResumo } = dados;

  const linhasItens = pedido.itens
    .map(
      (item) => `
        <tr>
          <td>${item.produto.nome}</td>
          <td style="text-align:right">${Number(item.pesoOuQtd)}</td>
          <td style="text-align:right">${formatarMoeda(Number(item.precoUnitario))}</td>
          <td style="text-align:right">${formatarMoeda(Number(item.subtotal))}</td>
        </tr>`
    )
    .join("");

  const blocoSaldo = pedido.contaReceber
    ? `<p style="color:#b00020"><strong>SALDO A RECEBER: ${formatarMoeda(
        Number(pedido.contaReceber.saldo)
      )}</strong> — Vencimento: ${new Date(pedido.contaReceber.vencimento).toLocaleDateString("pt-BR")}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Comanda ${pedido.numero}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #222; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 0; }
  .subtitulo { text-align: center; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 14px; }
  th { text-align: left; background: #f4f4f4; }
  .totais { margin-top: 16px; text-align: right; font-size: 15px; }
  .totais strong { font-size: 18px; }
  .rodape { margin-top: 32px; text-align: center; color: #666; font-size: 13px; }
  @media print { .rodape { margin-top: 60px; } }
</style>
</head>
<body>
  <h1>${NOME_LOJA}</h1>
  <p class="subtitulo">Pedido nº ${pedido.numero} — ${formatarDataHora(pedido.criadoEm)}</p>

  <p><strong>Cliente:</strong> ${pedido.cliente?.nome ?? "Consumidor final"}
  ${pedido.cliente?.documento ? ` — Doc: ${pedido.cliente.documento}` : ""}</p>

  <table>
    <thead>
      <tr><th>Produto</th><th style="text-align:right">Peso/Qtd</th><th style="text-align:right">Preço</th><th style="text-align:right">Subtotal</th></tr>
    </thead>
    <tbody>${linhasItens}</tbody>
  </table>

  <div class="totais">
    <p>Subtotal: ${formatarMoeda(Number(pedido.subtotal))}</p>
    ${Number(pedido.desconto) > 0 ? `<p>Desconto: -${formatarMoeda(Number(pedido.desconto))}</p>` : ""}
    <p><strong>Total: ${formatarMoeda(Number(pedido.total))}</strong></p>
  </div>

  <p><strong>Forma de pagamento:</strong> ${formasResumo.join(" · ")}</p>
  ${blocoSaldo}

  <div class="rodape">
    <p>Atendente: ${pedido.usuario.nome}</p>
    <p>Obrigado pela preferência!</p>
  </div>
</body>
</html>`;
}
