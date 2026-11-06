import { formatarDataCalendario, formatarDataHoraLoja } from "../../shared/datas";
import { obterPedido } from "../pedidos/pedidos.service";
import { LOGO_TERMICA_DATA_URI } from "./logoTermica";

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
  return formatarDataHoraLoja(data);
}

function formatarQuantidade(valor: number | null | undefined, unidade: string) {
  if (valor == null) return "aguardando";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`;
}

/** Unidade em que o peso/quantidade real é registrado: kg para carnes por peso. */
function unidadeVenda(produto: { tipoVenda: string; unidadeMedida: string }) {
  return produto.tipoVenda === "PESO" ? "kg" : produto.unidadeMedida;
}

function unidadePedidoCurta(unidade: string) {
  return unidade === "kg" || unidade === "g" ? unidade : "un";
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
  const nomeResponsavel = pedido.usuario?.nome ?? "Pedido online";

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
    if (item.observacao) linhas.push(`  >> ${item.observacao}`);
    linhas.push(
      `  Sol.: ${formatarQuantidade(Number(item.pesoOuQtd), unidadePedidoCurta(item.unidadePedido))}`
    );
    linhas.push(
      `  Real: ${formatarQuantidade(item.statusPreparo === "CORTADO" && item.pesoReal != null ? Number(item.pesoReal) : null, unidadeVenda(item.produto))}`
    );
    linhas.push(
      `  ${formatarMoeda(Number(item.precoUnitario))}/${item.produto.unidadeMedida} = ${item.statusPreparo === "CORTADO" ? formatarMoeda(Number(item.subtotal)) : "a pesar"}`
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
    linhas.push(`Vencimento: ${formatarDataCalendario(pedido.contaReceber.vencimento)}`);
  }

  linhas.push(linha);
  linhas.push(`Atendente: ${nomeResponsavel}`);
  linhas.push(centralizar("Obrigado pela preferência!"));

  return linhas.join("\n");
}

export type TipoImpressaoTermica = "corte" | "cliente";

export class ErroImpressao extends Error {}

const ESTILO_TERMICA_58 = `
    @page { size: 58mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: 58mm; font-family: "Courier New", monospace; font-size: 11px; }
    .nota { width: 54mm; margin: 0 auto; padding: 3mm 0 6mm; }
    .centro { text-align: center; }
    .logo { display: block; width: 40mm; height: auto; margin: 0 auto 2mm; image-rendering: pixelated; }
    .loja { font-size: 14px; font-weight: 700; line-height: 1.15; }
    .endereco { margin-top: 2px; font-size: 10px; }
    .tipo { margin-top: 4px; font-weight: 700; font-size: 13px; letter-spacing: 1px; }
    .numero { font-size: 22px; font-weight: 700; margin-top: 2px; }
    .agendado { margin-top: 3px; padding: 2px 0; border: 2px solid #000; text-align: center; font-weight: 700; font-size: 13px; }
    .linha { display: flex; justify-content: space-between; gap: 8px; line-height: 1.35; }
    .linha > :last-child { text-align: right; }
    .separador { border-top: 1px dashed #000; margin: 7px 0; }
    .dados { line-height: 1.4; }
    .item { padding: 5px 0; border-bottom: 1px dashed #777; }
    .item:last-of-type { border-bottom: none; }
    .produto { font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
    .item-corte .produto { font-size: 14px; }
    .pedido-corte { font-size: 14px; font-weight: 700; }
    .peso-manual { margin-top: 6px; font-size: 12px; }
    .obs-corte { margin-top: 3px; padding: 2px 4px; border: 2px solid #000; font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .obs-nota { font-size: 10px; font-style: italic; }
    .total { font-size: 16px; font-weight: 700; }
    .rodape { margin-top: 10px; text-align: center; font-size: 10px; }
    @media print { body { width: 58mm; } .nota { padding-bottom: 8mm; } }`;

function paginaTermica(titulo: string, corpo: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escaparHtml(titulo)}</title>
  <style>${ESTILO_TERMICA_58}
  </style>
</head>
<body onload="setTimeout(function(){ window.print(); }, 350)">
  <main class="nota">
${corpo}
  </main>
</body>
</html>`;
}

function nomeClienteImpressao(pedido: NonNullable<Awaited<ReturnType<typeof obterPedido>>>) {
  return pedido.cliente?.nomeFantasia || pedido.cliente?.razaoSocial || pedido.cliente?.nome || pedido.nomeCliente || "Consumidor final";
}

function quantidadePedidaPorExtenso(quantidade: number, unidade: string) {
  const numero = quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (unidade === "kg" || unidade === "g") return `${numero} ${unidade}`;
  return `${numero} ${quantidade === 1 ? "unidade" : "unidades"}`;
}

/**
 * Gera a página de impressão térmica (58 mm).
 * - "corte": vai para o balcão dos açougueiros logo após a anotação — sem valores,
 *   com espaço para anotar o peso de cada carne.
 * - "cliente": nota final com a logo, pesos reais e valor total — só depois que
 *   todos os itens foram pesados.
 */
export async function gerarComandaTermicaHtml(pedidoId: string, tipo: TipoImpressaoTermica = "cliente") {
  const dados = await montarDadosComanda(pedidoId);
  if (!dados) return null;
  const { pedido, formasResumo } = dados;
  const cliente = nomeClienteImpressao(pedido);
  const telefone = pedido.cliente?.telefone || pedido.cliente?.whatsapp || pedido.telefoneCliente;
  const endereco = pedido.enderecoEntrega || pedido.cliente?.endereco;
  const itensOrdenados = [...pedido.itens].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, "pt-BR"));

  if (tipo === "corte") {
    const itens = itensOrdenados.map((item) => `<section class="item item-corte">
      <div class="produto">${escaparHtml(item.produto.nome)}</div>
      <div class="pedido-corte">Pediu: ${escaparHtml(quantidadePedidaPorExtenso(Number(item.pesoOuQtd), item.unidadePedido))}</div>
      ${item.observacao ? `<div class="obs-corte">» ${escaparHtml(item.observacao)}</div>` : ""}
      <div class="peso-manual">Peso: ____________ ${item.produto.tipoVenda === "PESO" ? "kg" : "un"}</div>
    </section>`).join("");

    return paginaTermica(`Corte ${pedido.numero}`, `
    <header class="centro">
      <div class="loja">${escaparHtml(NOME_LOJA)}</div>
      <div class="tipo">PEDIDO PARA CORTE</div>
      <div class="numero">${escaparHtml(pedido.numero)}</div>
    </header>
    <div class="separador"></div>
    <div class="dados">
      <div>Cliente: <strong>${escaparHtml(cliente)}</strong></div>
      ${telefone ? `<div>Tel: ${escaparHtml(telefone)}</div>` : ""}
      ${endereco ? `<div>Entrega: ${escaparHtml(endereco)}</div>` : ""}
      <div>Anotado: ${escaparHtml(formatarDataHora(pedido.criadoEm))}</div>
      ${pedido.dataAgendada ? `<div class="agendado">PEDIDO PARA ${escaparHtml(formatarDataCalendario(pedido.dataAgendada))}</div>` : ""}
      ${pedido.observacoesCliente ? `<div>Obs.: ${escaparHtml(pedido.observacoesCliente)}</div>` : ""}
    </div>
    <div class="separador"></div>
    ${itens}
    <div class="separador"></div>
    <div class="linha"><span>Total de itens</span><strong>${pedido.itens.length}</strong></div>
    <div class="rodape">Pesar cada carne e lançar o peso<br />no sistema (Pedidos do Dia).</div>`);
  }

  if (pedido.itens.some((item) => item.statusPreparo !== "CORTADO")) {
    throw new ErroImpressao("A nota do cliente só pode ser impressa depois que todos os itens forem pesados.");
  }

  const itens = itensOrdenados.map((item) => {
    const unidade = unidadeVenda(item.produto);
    const peso = Number(item.pesoReal).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    return `<section class="item">
      <div class="produto">${escaparHtml(item.produto.nome)}</div>
      ${item.observacao ? `<div class="obs-nota">${escaparHtml(item.observacao)}</div>` : ""}
      <div class="linha"><span>${peso} ${escaparHtml(unidade)} x ${formatarMoeda(Number(item.precoUnitario))}</span><strong>${formatarMoeda(Number(item.subtotal))}</strong></div>
    </section>`;
  }).join("");
  const pesoTotal = itensOrdenados
    .filter((item) => item.produto.tipoVenda === "PESO")
    .reduce((soma, item) => soma + Number(item.pesoReal), 0);
  const pagamento = formasResumo.length
    ? formasResumo.map(escaparHtml).join("<br />")
    : pedido.momentoPagamento === "NA_ENTREGA"
    ? "Na entrega"
    : pedido.momentoPagamento === "NA_RETIRADA"
    ? "Na retirada"
    : "A definir";
  const vencimento = pedido.contaReceber
    ? `<div class="linha"><span>Vencimento</span><span>${formatarDataCalendario(pedido.contaReceber.vencimento)}</span></div>`
    : "";

  return paginaTermica(`Nota ${pedido.numero}`, `
    <header class="centro">
      <img class="logo" src="${LOGO_TERMICA_DATA_URI}" alt="${escaparHtml(NOME_LOJA)}" />
      <div class="endereco">${escaparHtml(ENDERECO_LOJA)}</div>
      <div class="tipo">NOTA DO PEDIDO</div>
    </header>
    <div class="separador"></div>
    <div class="dados">
      <div class="linha"><span>Pedido</span><strong>${escaparHtml(pedido.numero)}</strong></div>
      <div class="linha"><span>Data</span><span>${escaparHtml(formatarDataHora(pedido.criadoEm))}</span></div>
      <div>Cliente: <strong>${escaparHtml(cliente)}</strong></div>
      ${telefone ? `<div>Tel: ${escaparHtml(telefone)}</div>` : ""}
      ${pedido.cliente?.documento ? `<div>Documento: ${escaparHtml(pedido.cliente.documento)}</div>` : ""}
      ${endereco ? `<div>Entrega: ${escaparHtml(endereco)}</div>` : ""}
    </div>
    <div class="separador"></div>
    ${itens}
    <div class="separador"></div>
    ${pesoTotal > 0 ? `<div class="linha"><span>Peso total</span><span>${pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg</span></div>` : ""}
    ${Number(pedido.taxaEntrega) > 0 ? `<div class="linha"><span>Taxa de entrega</span><span>${formatarMoeda(Number(pedido.taxaEntrega))}</span></div>` : ""}
    <div class="linha total"><span>TOTAL</span><span>${formatarMoeda(Number(pedido.total))}</span></div>
    <div class="separador"></div>
    <div>Pagamento:</div>
    <div>${pagamento}</div>
    ${vencimento}
    <div class="rodape">Obrigado pela preferência!</div>`);
}

/**
 * Gera um HTML pronto para impressão em A4 (ou exportação para PDF pelo navegador).
 */
export async function gerarComandaA4Html(pedidoId: string) {
  const dados = await montarDadosComanda(pedidoId);
  if (!dados) return null;
  const { pedido, formasResumo } = dados;
  const nomeResponsavel = pedido.usuario?.nome ?? "Pedido online";

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
      )}</strong> — Vencimento: ${formatarDataCalendario(pedido.contaReceber.vencimento)}</p>`
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
    <p>Atendente: ${nomeResponsavel}</p>
    <p>Obrigado pela preferência!</p>
  </div>
</body>
</html>`;
}
