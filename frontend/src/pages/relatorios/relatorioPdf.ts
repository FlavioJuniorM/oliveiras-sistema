/**
 * Gera o PDF do relatório gerencial (A4 em pé), desenhado direto com jsPDF:
 * texto e gráficos vetoriais (nítidos em qualquer zoom e na impressão).
 * Este arquivo é carregado só quando a pessoa toca em "Baixar PDF".
 */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Relatorio } from "./tipos";
import { dataBR, diaDaSemana, diaMes, kg, moeda, numero, pct, pontosDaSerie, textoVariacao } from "./util";

type RGB = [number, number, number];
const VINHO: RGB = [139, 13, 31];
const VERMELHO: RGB = [163, 22, 46];
const VERDE: RGB = [47, 133, 90];
const AZUL: RGB = [43, 108, 176];
const DOURADO: RGB = [176, 125, 14];
const ROXO: RGB = [107, 70, 193];
const ROSA: RGB = [184, 82, 122];
const CATEGORIAS: RGB[] = [VERMELHO, AZUL, DOURADO, VERDE, ROXO, ROSA];
const TINTA: RGB = [17, 17, 17];
const CINZA: RGB = [107, 107, 107];
const LINHA: RGB = [229, 229, 229];
const FUNDO: RGB = [246, 245, 242];

const LARGURA = 210;
const ALTURA = 297;
const M = 14; // margem
const UTIL = LARGURA - M * 2;
const TOPO_CONTEUDO = 24;
const LIMITE = ALTURA - 16;

/** Helvetica do PDF não tem alguns símbolos: troca por equivalentes. */
const limpar = (t: string) => t.replace(/[−–]/g, "-").replace(/[▲]/g, "+").replace(/[▼]/g, "-").replace(/[^\x20-\x7E -ÿ—•×÷…“”‘’]/g, "");

function compacto(v: number) {
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${s}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function escala(maximo: number) {
  if (maximo <= 0) return { teto: 1, marcas: [0, 0.25, 0.5, 0.75, 1] };
  const bruto = maximo / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? bruto;
  return { teto: passo * 4, marcas: [0, passo, passo * 2, passo * 3, passo * 4] };
}

async function carregarLogo(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = "/logo-oliveiras.png";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = Math.round((220 * img.naturalHeight) / img.naturalWidth);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
}

export async function gerarPdfRelatorio(d: Relatorio) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logo = await carregarLogo();
  let y = 0;

  const periodoTexto = d.periodo.inicio === d.periodo.fim ? dataBR(d.periodo.inicio) : `${dataBR(d.periodo.inicio)} a ${dataBR(d.periodo.fim)}`;

  // ───────────── utilitários de desenho ─────────────
  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const preencher = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const tracar = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (tamanho: number, estilo: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
  };
  const texto = (t: string, x: number, yy: number, opcoes?: Parameters<typeof doc.text>[3]) => doc.text(limpar(t), x, yy, opcoes);
  const cortar = (t: string, largura: number) => {
    let s = limpar(t);
    if (doc.getTextWidth(s) <= largura) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > largura) s = s.slice(0, -1);
    return `${s}…`;
  };

  function novaPagina() {
    doc.addPage();
    y = TOPO_CONTEUDO;
  }
  function garantir(altura: number) {
    if (y + altura > LIMITE) novaPagina();
  }

  function secao(numeroSecao: number, titulo: string, subtitulo?: string) {
    garantir(40);
    if (y > TOPO_CONTEUDO + 2) y += 4;
    preencher(VINHO);
    doc.rect(M, y, 1.6, subtitulo ? 11 : 7, "F");
    cor(TINTA);
    fonte(14, "bold");
    texto(`${numeroSecao}. ${titulo}`, M + 4.5, y + 5.2);
    if (subtitulo) {
      cor(CINZA);
      fonte(8.5);
      texto(subtitulo, M + 4.5, y + 10.2);
    }
    y += subtitulo ? 16 : 12;
  }

  function subtitulo(t: string, extra?: string) {
    garantir(14);
    cor(TINTA);
    fonte(10, "bold");
    texto(t, M, y + 3.5);
    if (extra) {
      cor(CINZA);
      fonte(8);
      texto(extra, LARGURA - M, y + 3.5, { align: "right" });
    }
    y += 7;
  }

  type Kpi = { rotulo: string; valor: string; detalhe?: string; tom?: RGB; variacao?: number | null; menorEhMelhor?: boolean };
  function grade(kpis: Kpi[], colunas = 4) {
    const gap = 3;
    const w = (UTIL - gap * (colunas - 1)) / colunas;
    const h = 21;
    for (let i = 0; i < kpis.length; i += colunas) {
      garantir(h + gap);
      kpis.slice(i, i + colunas).forEach((k, j) => {
        const x = M + j * (w + gap);
        preencher(FUNDO);
        doc.roundedRect(x, y, w, h, 2, 2, "F");
        cor(CINZA);
        fonte(6.8, "bold");
        texto(cortar(k.rotulo.toUpperCase(), w - 6), x + 3, y + 5);
        cor(k.tom ?? TINTA);
        fonte(k.valor.length > 14 ? 11.5 : 13.5, "bold");
        texto(cortar(k.valor, w - 6), x + 3, y + 12.2);
        let dx = x + 3;
        if (k.variacao !== undefined) {
          const v = k.variacao;
          const bom = v != null && (k.menorEhMelhor ? v < 0 : v > 0);
          const ruim = v != null && (k.menorEhMelhor ? v > 0 : v < 0);
          const rotulo = textoVariacao(v);
          fonte(6.8, "bold");
          const lw = doc.getTextWidth(rotulo) + 3;
          const fundo: RGB = bom ? [223, 240, 231] : ruim ? [248, 222, 225] : [232, 232, 232];
          preencher(fundo);
          doc.roundedRect(dx, y + 14.4, lw, 4, 1.6, 1.6, "F");
          cor(bom ? VERDE : ruim ? VERMELHO : CINZA);
          texto(rotulo, dx + 1.5, y + 17.3);
          dx += lw + 2;
        }
        if (k.detalhe) {
          cor(CINZA);
          fonte(6.8);
          texto(cortar(k.detalhe, x + w - 3 - dx), dx, y + 17.3);
        }
      });
      y += h + gap;
    }
    y += 2;
  }

  function graficoLinhas(rotulos: string[], series: { nome: string; cor: RGB; valores: number[] }[], altura = 62) {
    garantir(altura + 12);
    // legenda
    let lx = M;
    fonte(7.5);
    for (const s of series) {
      preencher(s.cor);
      doc.rect(lx, y - 1.6, 2.6, 2.6, "F");
      cor(TINTA);
      texto(s.nome, lx + 3.8, y + 0.6);
      lx += doc.getTextWidth(s.nome) + 10;
    }
    y += 4;
    const esq = M + 17;
    const w = UTIL - 17;
    const h = altura - 8;
    const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
    const { teto, marcas } = escala(maximo);
    const n = rotulos.length;
    const px = (i: number) => esq + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
    const py = (v: number) => y + h - (v / teto) * h;
    doc.setLineWidth(0.15);
    for (const m of marcas) {
      tracar(LINHA);
      doc.line(esq, py(m), esq + w, py(m));
      cor(CINZA);
      fonte(6.5);
      texto(compacto(m), esq - 2, py(m) + 1, { align: "right" });
    }
    const passo = Math.max(1, Math.ceil(n / 14));
    fonte(6.5);
    cor(CINZA);
    rotulos.forEach((r, i) => {
      if (i % passo === 0) texto(r, px(i), y + h + 4.5, { align: "center" });
    });
    doc.setLineWidth(0.55);
    doc.setLineJoin("round");
    doc.setLineCap("round");
    for (const s of series) {
      tracar(s.cor);
      for (let i = 1; i < n; i++) doc.line(px(i - 1), py(s.valores[i - 1]), px(i), py(s.valores[i]));
      if (n <= 45) {
        preencher(s.cor);
        s.valores.forEach((v, i) => v > 0 && doc.circle(px(i), py(v), 0.55, "F"));
      }
    }
    doc.setLineWidth(0.2);
    y += h + 9;
  }

  function graficoColunas(itens: { rotulo: string; valor: number }[], formatarEixo: (v: number) => string, corBarra: RGB = VERMELHO, altura = 46, x0 = M, largura = UTIL) {
    const esq = x0 + 15;
    const w = largura - 15;
    const h = altura - 7;
    const maximo = Math.max(0, ...itens.map((i) => i.valor));
    const { teto, marcas } = escala(maximo);
    const faixa = w / Math.max(itens.length, 1);
    const bw = Math.min(Math.max(faixa - 1.4, 1), 12);
    doc.setLineWidth(0.15);
    for (const m of marcas) {
      const yy = y + h - (m / teto) * h;
      tracar(LINHA);
      doc.line(esq, yy, esq + w, yy);
      cor(CINZA);
      fonte(6.3);
      texto(formatarEixo(m), esq - 2, yy + 1, { align: "right" });
    }
    itens.forEach((item, i) => {
      const bh = (item.valor / teto) * h;
      const bx = esq + i * faixa + (faixa - bw) / 2;
      preencher(item.valor === maximo && maximo > 0 ? corBarra : ([...corBarra.map((c) => Math.round(c + (255 - c) * 0.4))] as RGB));
      if (bh > 0) doc.roundedRect(bx, y + h - bh, bw, bh, Math.min(0.9, bh / 2), Math.min(0.9, bh / 2), "F");
      cor(CINZA);
      fonte(6.3);
      texto(item.rotulo, esq + i * faixa + faixa / 2, y + h + 4, { align: "center" });
    });
    return altura;
  }

  function barras(itens: { rotulo: string; valor: number; detalhe?: string }[], formatar: (v: number) => string, corBarra: RGB = VERMELHO, x0 = M, largura = UTIL) {
    if (itens.length === 0) {
      cor(CINZA);
      fonte(8.5);
      texto("Sem dados no período.", x0, y + 4);
      y += 9;
      return;
    }
    const maximo = Math.max(0, ...itens.map((i) => i.valor));
    for (const [i, item] of itens.entries()) {
      garantir(9);
      const detalheTxt = item.detalhe ? `   ${item.detalhe}` : "";
      fonte(7.5);
      const wDetalhe = detalheTxt ? doc.getTextWidth(limpar(detalheTxt)) : 0;
      if (detalheTxt) {
        cor(CINZA);
        texto(detalheTxt, x0 + largura, y + 3, { align: "right" });
      }
      fonte(8, "bold");
      const valorTxt = formatar(item.valor);
      const wValor = doc.getTextWidth(limpar(valorTxt));
      cor(TINTA);
      texto(valorTxt, x0 + largura - wDetalhe, y + 3, { align: "right" });
      fonte(8);
      texto(cortar(`${i + 1}. ${item.rotulo}`, largura - wValor - wDetalhe - 4), x0, y + 3);
      preencher([241, 241, 241]);
      doc.roundedRect(x0, y + 4.6, largura, 1.8, 0.9, 0.9, "F");
      const bw = maximo > 0 ? Math.max((item.valor / maximo) * largura, item.valor > 0 ? 1.8 : 0) : 0;
      if (bw > 0) {
        preencher(corBarra);
        doc.roundedRect(x0, y + 4.6, bw, 1.8, 0.9, 0.9, "F");
      }
      y += 9;
    }
    y += 1;
  }

  function composicao(itens: { rotulo: string; valor: number; cor: RGB }[]) {
    garantir(20);
    const total = itens.reduce((s, i) => s + i.valor, 0);
    let x = M;
    preencher([241, 241, 241]);
    doc.roundedRect(M, y, UTIL, 4, 2, 2, "F");
    if (total > 0) {
      for (const item of itens.filter((i) => i.valor > 0)) {
        const w = (item.valor / total) * UTIL;
        preencher(item.cor);
        doc.rect(x, y, Math.max(w - 0.6, 0.3), 4, "F");
        x += w;
      }
    }
    y += 8;
    const col = UTIL / itens.length;
    itens.forEach((item, i) => {
      const cx = M + i * col;
      preencher(item.cor);
      doc.rect(cx, y - 2.2, 2.4, 2.4, "F");
      cor(CINZA);
      fonte(7.5);
      texto(item.rotulo, cx + 3.6, y);
      cor(TINTA);
      fonte(9, "bold");
      const valorTxt = moeda(item.valor);
      texto(valorTxt, cx + 3.6, y + 4.6);
      const wValor = doc.getTextWidth(limpar(valorTxt));
      cor(CINZA);
      fonte(7.5);
      if (total > 0) texto(` (${((item.valor / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`, cx + 3.6 + wValor, y + 4.6);
    });
    y += 10;
  }

  function tabela(cabecalho: string[], linhas: (string | number)[][], direita: number[] = [], larguras?: Record<number, number>) {
    if (linhas.length === 0) {
      cor(CINZA);
      fonte(8.5);
      texto("Nada no período.", M, y + 4);
      y += 9;
      return;
    }
    const estilosColunas: Record<number, { halign?: "right"; cellWidth?: number }> = {};
    direita.forEach((c) => (estilosColunas[c] = { ...(estilosColunas[c] ?? {}), halign: "right" }));
    Object.entries(larguras ?? {}).forEach(([c, w]) => (estilosColunas[Number(c)] = { ...(estilosColunas[Number(c)] ?? {}), cellWidth: w }));
    autoTable(doc, {
      startY: y,
      head: [cabecalho.map(limpar)],
      body: linhas.map((l) => l.map((c) => limpar(String(c)))),
      margin: { left: M, right: M, top: TOPO_CONTEUDO, bottom: 18 },
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 1.6, bottom: 1.6, left: 1.5, right: 1.5 }, textColor: TINTA, lineColor: LINHA, lineWidth: { bottom: 0.15 } },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: CINZA, fillColor: FUNDO, lineWidth: 0 },
      columnStyles: estilosColunas,
      didParseCell: (dado) => {
        if (dado.section === "head" && direita.includes(dado.column.index)) dado.cell.styles.halign = "right";
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  function nota(t: string) {
    fonte(7.5);
    const linhas = doc.splitTextToSize(limpar(t), UTIL);
    garantir(linhas.length * 3.4 + 3);
    cor(CINZA);
    doc.text(linhas, M, y + 2.5);
    y += linhas.length * 3.4 + 3;
  }

  // ───────────── capa / cabeçalho da 1ª página ─────────────
  if (logo) doc.addImage(logo, "JPEG", M, 10, 24, 24);
  const tx = logo ? M + 29 : M;
  cor(VINHO);
  fonte(8, "bold");
  texto("CASA DE CARNES OLIVEIRAS", tx, 16);
  cor(TINTA);
  fonte(20, "bold");
  texto("Relatório gerencial", tx, 24.5);
  cor(CINZA);
  fonte(9.5);
  texto(`Período: ${periodoTexto}  (${d.periodo.dias} ${d.periodo.dias === 1 ? "dia" : "dias"})`, tx, 30.5);
  fonte(7.5);
  texto(
    `Comparado com ${dataBR(d.periodo.anterior.inicio)} a ${dataBR(d.periodo.anterior.fim)}  ·  Gerado em ${new Date(d.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    tx,
    35
  );
  preencher(VINHO);
  doc.rect(M, 40, UTIL, 0.8, "F");
  preencher(DOURADO);
  doc.rect(M, 40.8, UTIL, 0.4, "F");
  y = 47;

  // ───────────── 1. Resumo ─────────────
  const r = d.resumo;
  secao(1, "Resumo do período", "Entradas = caixa da loja + CEASA + comandas entregues · Saídas = contas pagas + sangrias");
  grade([
    { rotulo: "Entradas", valor: moeda(r.entradas), tom: VERDE, variacao: r.variacao.entradas, detalhe: "vs. anterior" },
    { rotulo: "Saídas", valor: moeda(r.saidas), tom: VERMELHO, variacao: r.variacao.saidas, menorEhMelhor: true },
    { rotulo: "Resultado do caixa", valor: moeda(r.resultado), tom: r.resultado >= 0 ? VERDE : VERMELHO, variacao: r.variacao.resultado, detalhe: r.margem != null ? `margem ${pct(r.margem)}` : undefined },
    { rotulo: "Média por dia", valor: moeda(r.mediaDiaria), detalhe: `${r.diasComMovimento} dias com movimento` },
  ]);
  const { pontos, agrupamento } = pontosDaSerie(d.porDia);
  subtitulo("Entradas × saídas", agrupamento === "semana" ? "somadas por semana" : "dia a dia");
  graficoLinhas(
    pontos.map((p) => p.rotulo),
    [
      { nome: "Entradas", cor: VERDE, valores: pontos.map((p) => p.entradas) },
      { nome: "Saídas", cor: VERMELHO, valores: pontos.map((p) => p.saidas) },
    ]
  );
  subtitulo("De onde veio o dinheiro");
  composicao([
    { rotulo: "Caixa da loja", valor: r.composicao.caixaLoja, cor: VERMELHO },
    { rotulo: "CEASA", valor: r.composicao.ceasa, cor: AZUL },
    { rotulo: "Comandas entregues", valor: r.composicao.comandasEntregues, cor: DOURADO },
  ]);
  subtitulo("Para onde foi");
  composicao([
    { rotulo: "Contas pagas", valor: r.saidasComposicao.contasPagas, cor: ROXO },
    { rotulo: "Sangrias do caixa", valor: r.saidasComposicao.sangrias, cor: ROSA },
  ]);

  garantir(56);
  const metade = (UTIL - 8) / 2;
  const yTopo = y;
  subtitulo("Média de entradas por dia da semana");
  const temDomingo = d.entradasPorSemana[0].total > 0;
  const alturaColunas = graficoColunas(
    d.entradasPorSemana.filter((_, i) => i !== 0 || temDomingo).map((s) => ({ rotulo: s.rotulo, valor: s.media })),
    compacto,
    VERDE,
    44,
    M,
    metade
  );
  // destaques ao lado
  const dx = M + metade + 8;
  let dy = yTopo;
  cor(TINTA);
  fonte(10, "bold");
  texto("Destaques", dx, dy + 3.5);
  dy += 7;
  const destaques: [string, string, string][] = [
    ["Melhor dia", r.melhorDia ? moeda(r.melhorDia.entradas) : "—", r.melhorDia ? `${diaDaSemana(r.melhorDia.data)}, ${dataBR(r.melhorDia.data)}` : ""],
    ["Dia mais fraco", r.piorDia ? moeda(r.piorDia.entradas) : "—", r.piorDia ? `${diaDaSemana(r.piorDia.data)}, ${dataBR(r.piorDia.data)}` : ""],
    ["Corte que mais vendeu", d.carnes.produtos[0]?.nome ?? "—", d.carnes.produtos[0] ? `${moeda(d.carnes.produtos[0].faturamento)} · ${kg(d.carnes.produtos[0].kg)}` : ""],
    ["Horário de mais comandas", d.vendas.horaPico ? `${d.vendas.horaPico.hora}h às ${d.vendas.horaPico.hora + 1}h` : "—", d.vendas.horaPico ? `${d.vendas.horaPico.quantidade} comandas` : ""],
  ];
  for (const [rotulo, valor, detalhe] of destaques) {
    preencher(FUNDO);
    doc.roundedRect(dx, dy, metade, 10, 1.5, 1.5, "F");
    cor(CINZA);
    fonte(6.8);
    texto(rotulo, dx + 2.5, dy + 3.6);
    cor(TINTA);
    fonte(8.5, "bold");
    texto(cortar(valor, metade * 0.55), dx + 2.5, dy + 8);
    cor(CINZA);
    fonte(7);
    texto(cortar(detalhe, metade * 0.42), dx + metade - 2.5, dy + 8, { align: "right" });
    dy += 11.5;
  }
  y = Math.max(y + alturaColunas + 4, dy + 2);

  // ───────────── 2. Vendas ─────────────
  const v = d.vendas;
  novaPagina();
  secao(2, "Vendas e comandas", "Comandas anotadas no sistema dentro do período");
  grade([
    { rotulo: "Comandas", valor: numero(v.numeroComandas), variacao: r.variacao.numeroComandas, detalhe: v.canceladas ? `${v.canceladas} cancelada(s)` : undefined },
    { rotulo: "Vendido em comandas", valor: moeda(v.totalComandas), tom: VERDE, variacao: r.variacao.vendasComandas },
    { rotulo: "Ticket médio", valor: moeda(v.ticketMedio), detalhe: "por comanda" },
    { rotulo: "Recebido no sistema", valor: moeda(v.recebidoNoSistema) },
    { rotulo: "Delivery", valor: numero(v.delivery.quantidade), detalhe: moeda(v.delivery.total) },
    { rotulo: "Retirada no balcão", valor: numero(v.retirada.quantidade), detalhe: moeda(v.retirada.total) },
    { rotulo: "Pedidos pelo site", valor: numero(v.site.quantidade), detalhe: moeda(v.site.total) },
    { rotulo: "Encomendas", valor: numero(v.encomendas.quantidade), detalhe: moeda(v.encomendas.total) },
    { rotulo: "Vendas a prazo", valor: moeda(v.vendasAPrazo.total), tom: DOURADO, detalhe: `${v.vendasAPrazo.quantidade} comanda(s)` },
    { rotulo: "Descontos dados", valor: moeda(v.descontos) },
    { rotulo: "Taxas de entrega", valor: moeda(v.taxasEntrega) },
    { rotulo: "Caixa da loja + CEASA", valor: moeda(r.composicao.caixaLoja + r.composicao.ceasa) },
  ]);
  subtitulo("Formas de pagamento", "recebido nas comandas");
  const totalFormas = v.formasPagamento.reduce((s, f) => s + f.total, 0);
  barras(
    v.formasPagamento.map((f) => ({ rotulo: f.rotulo, valor: f.total, detalhe: totalFormas ? pct((f.total / totalFormas) * 100) : undefined })),
    moeda,
    AZUL
  );
  garantir(58);
  subtitulo("Comandas por horário");
  y += graficoColunas(v.porHora.map((h) => ({ rotulo: `${h.hora}h`, valor: h.quantidade })), (n) => numero(Math.round(n)), VERMELHO, 46) + 4;

  // ───────────── 3. Carnes ─────────────
  const c = d.carnes;
  novaPagina();
  secao(3, "Carnes e cortes", "Itens das comandas (peso real quando a carne já foi pesada)");
  grade([
    { rotulo: "Carne vendida", valor: kg(c.kgVendidos) },
    { rotulo: "Faturamento dos cortes", valor: moeda(c.faturamentoItens), tom: VERDE },
    { rotulo: "Preço médio do kg", valor: moeda(c.precoMedioKg) },
    { rotulo: "Cortes vendidos", valor: `${c.cortesDiferentes} de ${c.produtosAtivos}`, detalhe: `${c.semVenda.length} sem venda` },
  ]);
  grade(
    [
      { rotulo: "Ajustes de preço na comanda", valor: moeda(c.ajustesPreco.total), tom: c.ajustesPreco.total < 0 ? VERMELHO : TINTA, detalhe: `${c.ajustesPreco.itens} item(ns)` },
      { rotulo: "Kg por comanda", valor: kg(v.numeroComandas ? c.kgVendidos / v.numeroComandas : 0) },
    ],
    4
  );
  subtitulo("Top 10 cortes por faturamento");
  barras(
    c.produtos.slice(0, 10).map((p) => ({ rotulo: p.nome, valor: p.faturamento, detalhe: p.unidade === "kg" ? kg(p.kg) : `${numero(p.quantidade)} ${p.unidade}` })),
    moeda
  );
  if (c.porCategoria.length) {
    subtitulo("Vendas por categoria");
    const totalCat = c.porCategoria.reduce((s, x) => s + x.total, 0);
    barras(c.porCategoria.map((x) => ({ rotulo: x.categoria, valor: x.total, detalhe: totalCat ? pct((x.total / totalCat) * 100) : undefined })), moeda, DOURADO);
  }
  subtitulo("Todos os cortes vendidos", `${c.produtos.length} corte(s)`);
  tabela(
    ["Corte", "Categoria", "Quantidade", "Vezes", "Preço médio", "Faturamento"],
    c.produtos.map((p) => [p.nome, p.categoria, p.unidade === "kg" ? kg(p.kg) : `${numero(p.quantidade)} ${p.unidade}`, numero(p.vezes), moeda(p.precoMedio), moeda(p.faturamento)]),
    [2, 3, 4, 5]
  );
  if (c.semVenda.length) {
    subtitulo("Cortes sem venda no período");
    nota(c.semVenda.join(" · "));
  }

  // ───────────── 4. Funcionários ─────────────
  const f = d.funcionarios;
  novaPagina();
  secao(4, "Funcionários e equipe", "Salários lançados aos sábados e produção da equipe no sistema");
  grade([
    { rotulo: "Funcionários ativos", valor: numero(f.ativos), detalhe: `${f.registrados} registrado(s)` },
    { rotulo: "Folha semanal", valor: moeda(f.folhaSemanal), detalhe: "todo sábado" },
    { rotulo: "Folha mensal estimada", valor: moeda(f.folhaMensalEstimada) },
    { rotulo: "Peso da folha", valor: pct(f.pesoNaReceita), tom: DOURADO, detalhe: "sobre as entradas" },
    { rotulo: "Salários do período", valor: moeda(f.salariosPrevistos) },
    { rotulo: "Salários pagos", valor: moeda(f.salariosPagos), tom: VERDE },
    { rotulo: "Salários pendentes", valor: moeda(f.salariosPendentes), tom: f.salariosPendentes > 0 ? VERMELHO : TINTA },
    { rotulo: "Kg cortados pela equipe", valor: kg(f.equipe.reduce((s, e) => s + e.kgCortado, 0)) },
  ]);
  subtitulo("Salários por funcionário");
  tabela(
    ["Funcionário", "Função", "Registro", "Por sábado", "Sábados", "Pago", "Pendente"],
    f.lista.map((x) => [x.nome + (x.ativo ? "" : " (inativo)"), x.funcao ?? "—", x.registrado ? "Registrado" : "Sem registro", moeda(x.salarioSemanal), numero(x.sabados), moeda(x.pago), moeda(x.pendente)]),
    [3, 4, 5, 6]
  );
  subtitulo("Produção da equipe no sistema");
  tabela(
    ["Usuário", "Comandas", "Vendido", "Recebido", "Itens cortados", "Kg cortados"],
    f.equipe.map((e) => [e.nome, numero(e.comandas), moeda(e.vendas), moeda(e.recebido), numero(e.itensCortados), kg(e.kgCortado)]),
    [1, 2, 3, 4, 5]
  );

  // ───────────── 5. Gastos e contas ─────────────
  const g = d.gastos;
  const ct = d.contas;
  novaPagina();
  secao(5, "Gastos e contas a pagar", "Pagamentos feitos no período e situação das contas hoje");
  grade([
    { rotulo: "Total gasto", valor: moeda(g.totalPago), tom: VERMELHO, variacao: r.variacao.saidas, menorEhMelhor: true },
    { rotulo: "Contas pagas", valor: moeda(g.contasPagas) },
    { rotulo: "Sangrias do caixa", valor: moeda(g.sangrias), detalhe: `${g.sangriasDetalhe.length} dia(s)` },
    { rotulo: "Gasto médio por dia", valor: moeda(d.periodo.dias ? g.totalPago / d.periodo.dias : 0) },
    { rotulo: "Vencem no período", valor: moeda(ct.vencemNoPeriodo.total), detalhe: `${moeda(ct.vencemNoPeriodo.aberto)} em aberto` },
    { rotulo: "Contas vencidas (hoje)", valor: moeda(ct.vencidas.total), tom: ct.vencidas.quantidade ? VERMELHO : VERDE, detalhe: `${ct.vencidas.quantidade} conta(s)` },
    { rotulo: "Próximos 7 dias", valor: moeda(ct.proximos7dias.total), tom: DOURADO, detalhe: `${ct.proximos7dias.quantidade} conta(s)` },
    { rotulo: "Em aberto (hoje)", valor: moeda(ct.emAbertoHoje.total), detalhe: `${ct.emAbertoHoje.quantidade} conta(s)` },
  ]);
  subtitulo("Gastos por categoria");
  const totalGastos = g.porCategoria.reduce((s, x) => s + x.total, 0);
  barras(g.porCategoria.map((x) => ({ rotulo: x.categoria, valor: x.total, detalhe: totalGastos ? pct((x.total / totalGastos) * 100) : undefined })), moeda, ROXO);
  subtitulo("Fornecedores que mais receberam", "sem contar salários");
  barras(g.topFornecedores.map((x) => ({ rotulo: x.fornecedor, valor: x.total })), moeda, ROXO);
  subtitulo("Contas vencidas (não pagas)");
  tabela(["Vencimento", "Fornecedor", "Descrição", "Saldo"], ct.vencidas.lista.map((x) => [dataBR(x.vencimento), x.fornecedor, x.descricao, moeda(x.saldo)]), [3], { 0: 22 });
  subtitulo("A vencer nos próximos 7 dias");
  tabela(["Vencimento", "Fornecedor", "Descrição", "Saldo"], ct.proximos7dias.lista.map((x) => [dataBR(x.vencimento), x.fornecedor, x.descricao, moeda(x.saldo)]), [3], { 0: 22 });
  if (g.sangriasDetalhe.length) {
    subtitulo("Sangrias do caixa");
    tabela(["Dia", "Descrição", "Valor"], g.sangriasDetalhe.map((s) => [`${diaMes(s.data)} (${diaDaSemana(s.data).slice(0, 3)})`, s.descricao || "—", moeda(s.valor)]), [2], { 0: 24 });
  }

  // ───────────── 6. Clientes ─────────────
  const cl = d.clientes;
  const ar = ct.aReceber;
  garantir(80);
  secao(6, "Clientes e contas a receber");
  grade([
    { rotulo: "Clientes que compraram", valor: numero(cl.compraram), detalhe: `+ ${cl.consumidorFinal} sem cadastro` },
    { rotulo: "Clientes novos", valor: numero(cl.novos), tom: VERDE },
    { rotulo: "A receber (fiado)", valor: moeda(ar.total), tom: DOURADO, detalhe: `${ar.clientesDevendo} cliente(s)` },
    { rotulo: "Fiado atrasado", valor: moeda(ar.vencido), tom: ar.vencido > 0 ? VERMELHO : VERDE, detalhe: `${ar.clientesAtrasados} em atraso` },
  ]);
  subtitulo("Clientes que mais compraram");
  tabela(["Cliente", "Comandas", "Total"], cl.top.map((x) => [x.nome, numero(x.comandas), moeda(x.total)]), [1, 2]);
  subtitulo("Quem está devendo (hoje)");
  tabela(["Cliente", "Desde", "Atrasado", "Saldo"], ar.devedores.map((x) => [x.nome, dataBR(x.maisAntigo), moeda(x.vencido), moeda(x.saldo)]), [2, 3]);

  nota(
    "Como ler: o resultado do caixa é entradas menos saídas do período. Ele não desconta o custo de compra das carnes que ainda não virou conta paga. As variações comparam com o período anterior de mesmo tamanho."
  );

  // ───────────── cabeçalho e rodapé de todas as páginas ─────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) {
      cor(VINHO);
      fonte(7.5, "bold");
      texto("CASA DE CARNES OLIVEIRAS", M, 12);
      cor(CINZA);
      fonte(7.5);
      texto(`Relatório gerencial · ${periodoTexto}`, LARGURA - M, 12, { align: "right" });
      tracar(LINHA);
      doc.setLineWidth(0.2);
      doc.line(M, 15, LARGURA - M, 15);
    }
    tracar(LINHA);
    doc.setLineWidth(0.2);
    doc.line(M, ALTURA - 11, LARGURA - M, ALTURA - 11);
    cor(CINZA);
    fonte(7);
    texto("Gerado pelo sistema Oliveiras", M, ALTURA - 7);
    texto(`Página ${p} de ${total}`, LARGURA - M, ALTURA - 7, { align: "right" });
  }

  doc.save(`relatorio-oliveiras_${d.periodo.inicio}_a_${d.periodo.fim}.pdf`);
}
