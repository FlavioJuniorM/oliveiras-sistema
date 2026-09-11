import { obterPedido } from "../pedidos/pedidos.service";

const NOME_LOJA = "CASA DE CARNES OLIVEIRAS";
const ENDERECO_LOJA = "RUA AMETISTA, 22 - JD MUTINGA";

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

function formatarQuantidade(valor: number | null | undefined, unidade: string) {
  if (valor == null) return "aguardando";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`;
}

function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  linhas.push(centralizar(ENDERECO_LOJA));
  linhas.push(centralizar("COMANDA DE VENDA"));
  linhas.push(linha);
  linhas.push(`Pedido: ${pedido.numero}`);
  linhas.push(`Data: ${formatarDataHora(pedido.criadoEm)}`);
  linhas.push(`Cliente: ${pedido.cliente?.nome ?? "Consumidor final"}`);
  if (pedido.cliente?.endereco) {
    linhas.push(`Entrega: ${pedido.cliente.endereco}`);
  }
  if (pedido.cliente?.documento) {
    linhas.push(`Doc: ${pedido.cliente.documento}`);
  }
  linhas.push(linha);

  for (const item of pedido.itens) {
    linhas.push(item.produto.nome);
    linhas.push(
      `  Sol.: ${formatarQuantidade(Number(item.pesoOuQtd), item.unidadePedido)}`
    );
    linhas.push(
      `  Real: ${formatarQuantidade(item.pesoReal == null ? null : Number(item.pesoReal), item.unidadePedido)}`
    );
    linhas.push(
      `  ${formatarMoeda(Number(item.precoUnitario))}/${item.unidadePedido} = ${formatarMoeda(Number(item.subtotal))}`
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

/** Gera uma página estreita, pronta para Ctrl+P/impressão em térmica de 58 mm. */
export async function gerarComandaTermicaHtml(pedidoId: string) {
  const dados = await montarDadosComanda(pedidoId);
  if (!dados) return null;
  const { pedido, formasResumo } = dados;
  const cliente = pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || pedido.cliente?.nome || "Consumidor final";
  const itens = pedido.itens.map((item) => {
    const unidade = item.unidadePedido || item.produto.unidadeMedida || "un";
    const solicitado = formatarQuantidade(Number(item.pesoOuQtd), unidade);
    const real = formatarQuantidade(item.pesoReal == null ? null : Number(item.pesoReal), unidade);
    return `<section class="item">
      <div class="produto">${escaparHtml(item.produto.nome)}</div>
      <div class="linha"><span>Solicitado: ${solicitado}</span><span>Real: ${real}</span></div>
      <div class="linha"><span>${formatarMoeda(Number(item.precoUnitario))}/${escaparHtml(unidade)}</span><strong>${formatarMoeda(Number(item.subtotal))}</strong></div>
    </section>`;
  }).join("");
  const pagamento = formasResumo.length ? formasResumo.map(escaparHtml).join("<br />") : "A definir";
  const vencimento = pedido.contaReceber
    ? `<div class="linha"><span>Vencimento</span><span>${new Date(pedido.contaReceber.vencimento).toLocaleDateString("pt-BR")}</span></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Comanda ${escaparHtml(pedido.numero)}</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 58mm; font-family: "Courier New", monospace; font-size: 11px; }
    .nota { width: 54mm; margin: 0 auto; padding: 3mm 0 5mm; }
    .centro { text-align: center; }
    .loja { font-size: 14px; font-weight: 700; line-height: 1.15; }
    .endereco { margin-top: 2px; font-size: 10px; }
    .tipo { margin-top: 4px; font-weight: 700; }
    .linha { display: flex; justify-content: space-between; gap: 8px; line-height: 1.35; }
    .linha > :last-child { text-align: right; }
    .separador { border-top: 1px dashed #000; margin: 7px 0; }
    .dados { line-height: 1.4; }
    .item { padding: 5px 0; border-bottom: 1px dashed #777; }
    .produto { font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
    .total { font-size: 16px; font-weight: 700; }
    .rodape { margin-top: 10px; text-align: center; font-size: 10px; }
    @media print { body { width: 58mm; } .nota { padding-bottom: 8mm; } }
  </style>
</head>
<body onload="setTimeout(function(){ window.print(); }, 250)">
  <main class="nota">
    <header class="centro">
      <div class="loja">${escaparHtml(NOME_LOJA)}</div>
      <div class="endereco">${escaparHtml(ENDERECO_LOJA)}</div>
      <div class="tipo">COMANDA DE VENDA</div>
    </header>
    <div class="separador"></div>
    <div class="dados">
      <div class="linha"><span>Pedido</span><strong>${escaparHtml(pedido.numero)}</strong></div>
      <div class="linha"><span>Data</span><span>${escaparHtml(formatarDataHora(pedido.criadoEm))}</span></div>
      <div>Cliente: <strong>${escaparHtml(cliente)}</strong></div>
      ${pedido.cliente?.documento ? `<div>Documento: ${escaparHtml(pedido.cliente.documento)}</div>` : ""}
      ${pedido.cliente?.endereco ? `<div>Entrega: ${escaparHtml(pedido.cliente.endereco)}</div>` : ""}
    </div>
    <div class="separador"></div>
    ${itens}
    <div class="separador"></div>
    <div class="linha"><span>Subtotal</span><span>${formatarMoeda(Number(pedido.subtotal))}</span></div>
    ${Number(pedido.desconto) > 0 ? `<div class="linha"><span>Desconto</span><span>- ${formatarMoeda(Number(pedido.desconto))}</span></div>` : ""}
    <div class="linha total"><span>TOTAL</span><span>${formatarMoeda(Number(pedido.total))}</span></div>
    <div class="separador"></div>
    <div>Pagamento:</div>
    <div>${pagamento}</div>
    ${vencimento}
    <div class="rodape">Obrigado pela preferência!<br />Atendente: ${escaparHtml(pedido.usuario.nome)}</div>
  </main>
</body>
</html>`;
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
