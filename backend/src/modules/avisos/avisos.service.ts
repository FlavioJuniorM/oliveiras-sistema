import { prisma } from "../../config/database";
import { formatarDataCalendario, hojeCalendario } from "../../shared/datas";
import { gerarSalariosDeSabado } from "../funcionarios/funcionarios.service";
import { enviarEmail } from "./email";

const DIA_MS = 86_400_000;
const LINK_SISTEMA = process.env.FRONTEND_URL || "https://oliveiras-frontend.vercel.app";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

interface LinhaConta {
  fornecedor: string;
  descricao: string;
  vencimento: Date;
  saldo: number;
  codigoBarras: string | null;
}

/** Contas a pagar do dia, as vencidas sem pagar e as dos próximos 3 dias. */
export async function resumoContasDoDia() {
  await gerarSalariosDeSabado();
  const hoje = hojeCalendario();
  const amanha = new Date(hoje.getTime() + DIA_MS);
  const daqui3 = new Date(hoje.getTime() + 4 * DIA_MS);

  const contas = await prisma.contaPagar.findMany({
    where: { status: { in: ["PENDENTE", "PARCIAL"] }, vencimento: { lt: daqui3 } },
    orderBy: [{ vencimento: "asc" }, { fornecedor: "asc" }],
  });

  const linha = (c: (typeof contas)[number]): LinhaConta => ({
    fornecedor: c.fornecedor,
    descricao: c.descricao,
    vencimento: c.vencimento,
    saldo: Math.max(Number(c.valor) - Number(c.valorPago), 0),
    codigoBarras: c.codigoBarras,
  });

  const deHoje = contas.filter((c) => c.vencimento >= hoje && c.vencimento < amanha).map(linha);
  const vencidas = contas.filter((c) => c.vencimento < hoje).map(linha);
  const proximas = contas.filter((c) => c.vencimento >= amanha).map(linha);
  const soma = (l: LinhaConta[]) => l.reduce((t, c) => t + c.saldo, 0);

  return { data: hoje, deHoje, vencidas, proximas, totalHoje: soma(deHoje), totalVencidas: soma(vencidas), totalProximas: soma(proximas) };
}

function tabela(titulo: string, cor: string, linhas: LinhaConta[], total: number, mostrarData: boolean) {
  if (!linhas.length) return "";
  const tr = linhas
    .map(
      (c) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapar(c.fornecedor)}</strong><br><span style="color:#666;font-size:13px">${escapar(c.descricao)}</span>
        ${c.codigoBarras ? `<br><span style="font-family:monospace;font-size:12px;color:#444">Cód. barras: ${escapar(c.codigoBarras)}</span>` : ""}</td>
        ${mostrarData ? `<td style="padding:8px;border-bottom:1px solid #eee;white-space:nowrap">${formatarDataCalendario(c.vencimento)}</td>` : ""}
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap"><strong>${moeda(c.saldo)}</strong></td>
      </tr>`
    )
    .join("");
  return `<h3 style="margin:24px 0 8px;color:${cor}">${titulo} — ${moeda(total)}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${tr}</table>`;
}

export function montarEmail(resumo: Awaited<ReturnType<typeof resumoContasDoDia>>) {
  const dia = formatarDataCalendario(resumo.data);
  const assunto = resumo.deHoje.length
    ? `Contas a pagar hoje (${dia}): ${resumo.deHoje.length} conta(s) — ${moeda(resumo.totalHoje)}`
    : `Contas a pagar — ${dia}: nada vence hoje`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:auto;color:#1a1a1a">
    <div style="background:#5c0816;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">
      <div style="font-size:12px;letter-spacing:2px;opacity:.8">CASA DE CARNES OLIVEIRAS</div>
      <div style="font-size:22px;font-weight:bold;margin-top:4px">Contas a pagar · ${dia}</div>
    </div>
    <div style="border:1px solid #eee;border-top:0;padding:8px 22px 22px;border-radius:0 0 10px 10px">
      ${resumo.deHoje.length ? "" : `<p style="margin-top:18px">Nenhuma conta vence hoje. 👍</p>`}
      ${tabela("Vencem hoje", "#c8102e", resumo.deHoje, resumo.totalHoje, false)}
      ${tabela("⚠ Vencidas e ainda não pagas", "#9a1b1b", resumo.vencidas, resumo.totalVencidas, true)}
      ${tabela("Próximos 3 dias", "#555", resumo.proximas, resumo.totalProximas, true)}
      <p style="margin-top:26px"><a href="${LINK_SISTEMA}/financeiro/contas-a-pagar" style="background:#c8102e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir Contas a Pagar</a></p>
      <p style="color:#888;font-size:12px;margin-top:22px">Aviso automático do sistema. Depois de pagar, confirme o pagamento no sistema. Para parar de receber, peça ao administrador em Usuários.</p>
    </div></div>`;

  const lista = (l: LinhaConta[]) => l.map((c) => `- ${c.fornecedor} · ${c.descricao} · ${moeda(c.saldo)}${c.codigoBarras ? ` · cód. ${c.codigoBarras}` : ""}`).join("\n");
  const texto = [
    `Contas a pagar — ${dia}`,
    resumo.deHoje.length ? `\nVENCEM HOJE (${moeda(resumo.totalHoje)}):\n${lista(resumo.deHoje)}` : "\nNenhuma conta vence hoje.",
    resumo.vencidas.length ? `\nVENCIDAS (${moeda(resumo.totalVencidas)}):\n${lista(resumo.vencidas)}` : "",
    resumo.proximas.length ? `\nPRÓXIMOS 3 DIAS (${moeda(resumo.totalProximas)}):\n${lista(resumo.proximas)}` : "",
    `\n${LINK_SISTEMA}/financeiro/contas-a-pagar`,
  ].join("\n");

  return { assunto, html, texto };
}

/** Destinatários: administradores ativos com e-mail e aviso ligado. */
async function destinatarios() {
  const usuarios = await prisma.usuario.findMany({
    where: { status: "ATIVO", papel: "ADMINISTRATIVO", avisosEmail: true, email: { not: null } },
    select: { email: true },
  });
  return [...new Set(usuarios.map((u) => u.email!.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
}

/**
 * Envio automático do dia (chamado pelo agendador da Vercel de manhã).
 * Só envia se houver conta vencendo hoje ou vencida sem pagar.
 */
export async function enviarAvisoDiario() {
  const resumo = await resumoContasDoDia();
  if (!resumo.deHoje.length && !resumo.vencidas.length) return { enviado: false, motivo: "Nenhuma conta para hoje nem vencida." };
  const para = await destinatarios();
  if (!para.length) return { enviado: false, motivo: "Nenhum administrador com e-mail cadastrado." };

  const email = montarEmail(resumo);
  await enviarEmail(para, email.assunto, email.html, email.texto);
  console.info(`Aviso diário enviado para ${para.length} e-mail(s): ${resumo.deHoje.length} conta(s) hoje, ${resumo.vencidas.length} vencida(s)`);
  return { enviado: true, para: para.length };
}

/** Botão "Enviar teste": manda o resumo de hoje só para quem clicou. */
export async function enviarAvisoTeste(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });
  if (!usuario?.email) throw new Error("Cadastre o seu e-mail em Usuários (botão Alterar) antes de testar.");
  const email = montarEmail(await resumoContasDoDia());
  await enviarEmail([usuario.email], `[Teste] ${email.assunto}`, email.html, email.texto);
  return { enviado: true, para: usuario.email };
}
