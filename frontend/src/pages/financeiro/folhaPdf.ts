/**
 * Recibo de pagamento semanal (folha do sábado) para o funcionário conferir e assinar.
 * Cada funcionário sai com 2 vias na mesma folha A4 (empresa e funcionário).
 * Carregado só quando a pessoa toca em "Baixar PDF".
 */
import { jsPDF } from "jspdf";

export interface DescontoFolha {
  id: string;
  tipo: string;
  rotulo: string;
  data: string;
  valor: number;
  descricao: string | null;
}

export interface FolhaFuncionario {
  contaId: string;
  sabado: string;
  inicioSemana: string;
  funcionario: {
    id: string;
    nome: string;
    funcao: string | null;
    cpf: string | null;
    rg: string | null;
    registrado: boolean;
    dataAdmissao: string | null;
    chavePix: string | null;
  };
  salarioBruto: number;
  descontos: DescontoFolha[];
  totalDescontos: number;
  liquido: number;
  status: string;
  valorPago: number;
  dataPagamento: string | null;
  formaPagamento: string | null;
}

type RGB = [number, number, number];
const VINHO: RGB = [139, 13, 31];
const TINTA: RGB = [17, 17, 17];
const CINZA: RGB = [100, 100, 100];
const LINHA: RGB = [210, 210, 210];
const FUNDO: RGB = [246, 245, 242];
const VERDE: RGB = [36, 110, 70];
const VERMELHO: RGB = [163, 22, 46];

const L = 210;
const M = 14;
const U = L - M * 2;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const limpar = (t: string) => t.replace(/[−–]/g, "-").replace(/[^\x20-\x7E -ÿ—•×…“”‘’]/g, "");

// ───────────── valor por extenso ─────────────
const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milhoes) partes.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) partes.push(ate999(resto));
  if (partes.length <= 1) return partes[0] ?? "";
  // "mil e cem", "dois mil e trinta", "mil duzentos e dez"
  const ultimo = partes[partes.length - 1];
  const usaE = resto > 0 && (resto < 100 || resto % 100 === 0);
  return partes.slice(0, -1).join(", ") + (usaE ? " e " : " ") + ultimo;
}

export function porExtenso(valor: number) {
  const centavosTotais = Math.round(valor * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais > 0 || centavos === 0) {
    const sufixoDe = reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${inteiroPorExtenso(reais)}${sufixoDe} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}

async function carregarLogo(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = "/logo-oliveiras.png";
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = Math.round((200 * img.naturalHeight) / img.naturalWidth);
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

export async function gerarPdfFolha(folhas: FolhaFuncionario[]) {
  if (folhas.length === 0) return;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const logo = await carregarLogo();

  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const preencher = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const tracar = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const fonte = (t: number, e: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", e);
    doc.setFontSize(t);
  };
  const texto = (t: string, x: number, y: number, o?: Parameters<typeof doc.text>[3]) => doc.text(limpar(t), x, y, o);
  const cortar = (t: string, w: number) => {
    let s = limpar(t);
    if (doc.getTextWidth(s) <= w) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > w) s = s.slice(0, -1);
    return `${s}…`;
  };

  /** Desenha uma via do recibo a partir de y0 e devolve onde terminou. */
  function via(f: FolhaFuncionario, y0: number, rotuloVia: string) {
    let y = y0;
    // Cabeçalho
    if (logo) doc.addImage(logo, "JPEG", M, y, 17, 17);
    const tx = logo ? M + 21 : M;
    cor(VINHO);
    fonte(7.5, "bold");
    texto("CASA DE CARNES OLIVEIRAS", tx, y + 5);
    cor(TINTA);
    fonte(13.5, "bold");
    texto("Recibo de pagamento semanal", tx, y + 11.5);
    cor(CINZA);
    fonte(8);
    texto(`Semana de ${dataBR(f.inicioSemana)} a ${dataBR(f.sabado)}  ·  Pagamento no sábado ${dataBR(f.sabado)}`, tx, y + 16.3);
    fonte(7, "bold");
    preencher(FUNDO);
    const wVia = doc.getTextWidth(rotuloVia) + 6;
    doc.roundedRect(L - M - wVia, y + 1, wVia, 5.5, 1.5, 1.5, "F");
    cor(VINHO);
    texto(rotuloVia, L - M - wVia / 2, y + 4.8, { align: "center" });
    y += 21;
    preencher(VINHO);
    doc.rect(M, y, U, 0.6, "F");
    y += 4;

    // Dados do funcionário
    preencher(FUNDO);
    doc.roundedRect(M, y, U, 17, 1.8, 1.8, "F");
    const campos: [string, string][] = [
      ["Funcionário", f.funcionario.nome],
      ["Função", f.funcionario.funcao || "—"],
      ["CPF", f.funcionario.cpf || "—"],
      ["Admissão", f.funcionario.dataAdmissao ? dataBR(f.funcionario.dataAdmissao) : "—"],
      ["Vínculo", f.funcionario.registrado ? "Carteira assinada" : "Sem registro"],
      ["Forma de pagamento", f.formaPagamento || (f.funcionario.chavePix ? `Pix: ${f.funcionario.chavePix}` : "—")],
    ];
    const colW = U / 3;
    campos.forEach(([rotulo, valor], i) => {
      const cx = M + 3 + (i % 3) * colW;
      const cy = y + 5.5 + Math.floor(i / 3) * 8;
      cor(CINZA);
      fonte(6.5);
      texto(rotulo.toUpperCase(), cx, cy);
      cor(TINTA);
      fonte(8.5, i === 0 ? "bold" : "normal");
      texto(cortar(valor, colW - 5), cx, cy + 3.8);
    });
    y += 21;

    // Tabela: descrição | data | proventos | descontos
    const cData = M + U * 0.55;
    const cProv = M + U * 0.8;
    const cDesc = M + U;
    preencher(VINHO);
    doc.rect(M, y, U, 6, "F");
    doc.setTextColor(255, 255, 255);
    fonte(7.5, "bold");
    texto("DESCRIÇÃO", M + 2, y + 4.1);
    texto("DATA", cData, y + 4.1);
    texto("PROVENTOS", cProv - 2, y + 4.1, { align: "right" });
    texto("DESCONTOS", cDesc - 2, y + 4.1, { align: "right" });
    y += 6;
    const linha = (descricao: string, data: string, prov: string, desc: string, zebra: boolean) => {
      if (zebra) {
        preencher([250, 249, 247]);
        doc.rect(M, y, U, 5.6, "F");
      }
      cor(TINTA);
      fonte(8);
      texto(cortar(descricao, cData - M - 6), M + 2, y + 3.9);
      cor(CINZA);
      texto(data, cData, y + 3.9);
      cor(VERDE);
      texto(prov, cProv - 2, y + 3.9, { align: "right" });
      cor(VERMELHO);
      texto(desc, cDesc - 2, y + 3.9, { align: "right" });
      tracar(LINHA);
      doc.setLineWidth(0.15);
      doc.line(M, y + 5.6, M + U, y + 5.6);
      y += 5.6;
    };
    linha("Salário semanal", dataBR(f.sabado), moeda(f.salarioBruto), "", false);
    if (f.descontos.length === 0) {
      linha("Nenhum desconto nesta semana", "", "", "", true);
    }
    f.descontos.forEach((d, i) => {
      linha(`${d.rotulo}${d.descricao ? ` — ${d.descricao}` : ""}`, dataBR(d.data), "", `- ${moeda(d.valor)}`, i % 2 === 0);
    });

    // Totais
    y += 3;
    const wTot = 78;
    const xTot = M + U - wTot;
    const totLinha = (rotulo: string, valor: string, c: RGB) => {
      cor(CINZA);
      fonte(8);
      texto(rotulo, xTot, y + 3.5);
      cor(c);
      fonte(8.5, "bold");
      texto(valor, M + U - 2, y + 3.5, { align: "right" });
      y += 5;
    };
    const yTotais = y;
    totLinha("Total de proventos", moeda(f.salarioBruto), TINTA);
    totLinha("Total de descontos", f.totalDescontos > 0 ? `- ${moeda(f.totalDescontos)}` : moeda(0), VERMELHO);
    preencher(VINHO);
    doc.roundedRect(xTot - 2, y + 0.5, wTot + 2, 8, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    fonte(8.5, "bold");
    texto("VALOR LÍQUIDO A RECEBER", xTot + 1, y + 5.6);
    fonte(11, "bold");
    texto(moeda(f.liquido), M + U - 2, y + 5.9, { align: "right" });
    y += 11;

    // Por extenso e situação (à esquerda dos totais)
    cor(CINZA);
    fonte(6.8, "bold");
    texto("VALOR LÍQUIDO POR EXTENSO", M, yTotais + 3.5);
    cor(TINTA);
    fonte(8);
    const extenso = doc.splitTextToSize(limpar(`(${porExtenso(f.liquido)})`), U - wTot - 8);
    doc.text(extenso, M, yTotais + 7.6);
    if (f.status === "PAGO" && f.valorPago > 0 && f.dataPagamento) {
      cor(VERDE);
      fonte(7.5, "bold");
      texto(`Pago em ${dataBR(f.dataPagamento.slice(0, 10))}${f.formaPagamento ? ` (${f.formaPagamento})` : ""}`, M, yTotais + 8 + extenso.length * 3.6);
    }

    // Declaração
    y += 1;
    const declaracao =
      `Declaro que recebi da CASA DE CARNES OLIVEIRAS a importância líquida de ${moeda(f.liquido)} (${porExtenso(f.liquido)}), ` +
      `referente ao meu salário da semana de ${dataBR(f.inicioSemana)} a ${dataBR(f.sabado)}` +
      (f.descontos.length
        ? `, já descontados os adiantamentos, vales e mercadorias que retirei, listados acima, os quais conferi e com os quais estou de acordo.`
        : `, sem nenhum desconto.`) +
      ` Dou plena quitação dos valores desta semana.`;
    cor(TINTA);
    fonte(7.8);
    const linhasDecl = doc.splitTextToSize(limpar(declaracao), U);
    doc.text(linhasDecl, M, y + 3);
    y += linhasDecl.length * 3.4 + 12;

    // Assinaturas
    tracar(TINTA);
    doc.setLineWidth(0.3);
    const wAss = (U - 10) / 2;
    doc.line(M, y, M + wAss, y);
    doc.line(M + wAss + 10, y, M + U, y);
    cor(TINTA);
    fonte(8, "bold");
    texto(f.funcionario.nome, M + wAss / 2, y + 4, { align: "center" });
    texto("Casa de Carnes Oliveiras", M + wAss + 10 + wAss / 2, y + 4, { align: "center" });
    cor(CINZA);
    fonte(7);
    texto("Assinatura do funcionário", M + wAss / 2, y + 7.5, { align: "center" });
    texto("Responsável pelo pagamento", M + wAss + 10 + wAss / 2, y + 7.5, { align: "center" });
    y += 12;
    fonte(7.5);
    cor(TINTA);
    texto("Data: ____/____/________", M, y + 2);
    cor(CINZA);
    fonte(6.5);
    texto(
      f.funcionario.registrado ? "Os descontos legais (INSS/FGTS) seguem no holerite oficial do contador." : "Recibo de controle interno de pagamento semanal.",
      M + U,
      y + 2,
      { align: "right" }
    );
    return y + 4;
  }

  folhas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    const fim = via(f, 10, "1ª VIA — EMPRESA");
    const altura = fim - 10;
    const corte = Math.max(fim + 6, 148.5);
    if (corte + 6 + altura <= 297 - 6) {
      // linha de corte entre as duas vias
      tracar([170, 170, 170]);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(6, corte, L - 6, corte);
      doc.setLineDashPattern([], 0);
      cor([150, 150, 150]);
      fonte(6);
      texto("- - -  recorte aqui  - - -", L / 2, corte - 1.2, { align: "center" });
      via(f, corte + 6, "2ª VIA — FUNCIONÁRIO");
    } else {
      doc.addPage();
      via(f, 10, "2ª VIA — FUNCIONÁRIO");
    }
  });

  const sabado = folhas[0].sabado;
  const nome = folhas.length === 1 ? folhas[0].funcionario.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") : "equipe";
  doc.save(`folha-${nome}-${sabado}.pdf`);
}
