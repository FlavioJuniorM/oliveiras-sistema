import { prisma } from "../config/database";

/**
 * Verificação de cadastros duplicados.
 * - "bloqueio": é certamente o mesmo registro (mesmo código, CPF/CNPJ, código de barras...) → não deixa salvar.
 * - "aviso": parece o mesmo (mesmo nome, mesmo telefone, mesma conta/valor/data) → avisa e pede confirmação.
 */

export interface Duplicado {
  id: string;
  descricao: string;
  motivo: string;
}

export interface ResultadoDuplicidade {
  bloqueio: Duplicado[];
  aviso: Duplicado[];
}

/** "Frigorífico  Boi-Bom " → "frigorifico boi bom" (sem acento, maiúscula, pontuação ou espaço extra). */
export function normalizar(texto?: string | null) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function digitos(texto?: string | null) {
  return (texto ?? "").replace(/\D/g, "");
}

/** Telefone sem DDI 55 e sem o 9 extra não importa: compara os últimos 8 dígitos + DDD quando houver. */
function mesmoTelefone(a: string, b: string) {
  const x = digitos(a).replace(/^55(?=\d{10,11}$)/, "");
  const y = digitos(b).replace(/^55(?=\d{10,11}$)/, "");
  if (x.length < 8 || y.length < 8) return false;
  return x === y || (x.slice(-8) === y.slice(-8) && (x.length < 10 || y.length < 10 || x.slice(0, 2) === y.slice(0, 2)));
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

export function temDuplicidade(r: ResultadoDuplicidade) {
  return r.bloqueio.length > 0 || r.aviso.length > 0;
}

// ---------------------------------------------------------------- Carnes e cortes
export async function produtosDuplicados(dados: { nome?: string; codigo?: string; ignorarId?: string }): Promise<ResultadoDuplicidade> {
  const nome = normalizar(dados.nome);
  const codigo = normalizar(dados.codigo);
  const resultado: ResultadoDuplicidade = { bloqueio: [], aviso: [] };
  if (!nome && !codigo) return resultado;

  const produtos = await prisma.produto.findMany({ select: { id: true, nome: true, codigo: true } });
  for (const p of produtos) {
    if (p.id === dados.ignorarId) continue;
    const descricao = `${p.nome}${p.codigo ? ` (código ${p.codigo})` : ""}`;
    if (codigo && normalizar(p.codigo) === codigo) resultado.bloqueio.push({ id: p.id, descricao, motivo: "mesmo código" });
    else if (nome && normalizar(p.nome) === nome) resultado.bloqueio.push({ id: p.id, descricao, motivo: "mesmo nome" });
  }
  return resultado;
}

// ---------------------------------------------------------------- Clientes
export async function clientesDuplicados(dados: {
  nome?: string;
  documento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  ignorarId?: string;
}): Promise<ResultadoDuplicidade> {
  const nome = normalizar(dados.nome);
  const documento = digitos(dados.documento);
  const telefones = [dados.telefone, dados.whatsapp].filter((t): t is string => digitos(t).length >= 8);
  const resultado: ResultadoDuplicidade = { bloqueio: [], aviso: [] };
  if (!nome && documento.length < 11 && telefones.length === 0) return resultado;

  const clientes = await prisma.cliente.findMany({
    where: { status: "ATIVO" },
    select: { id: true, nome: true, nomeFantasia: true, documento: true, telefone: true, whatsapp: true },
  });
  for (const c of clientes) {
    if (c.id === dados.ignorarId) continue;
    const nomeExibido = c.nomeFantasia || c.nome;
    if (documento.length >= 11 && digitos(c.documento) === documento) {
      resultado.bloqueio.push({ id: c.id, descricao: nomeExibido, motivo: "mesmo CPF/CNPJ" });
      continue;
    }
    const telIgual = telefones.some((t) => [c.telefone, c.whatsapp].some((x) => x && mesmoTelefone(t, x)));
    if (telIgual) resultado.aviso.push({ id: c.id, descricao: `${nomeExibido} · ${c.telefone || c.whatsapp}`, motivo: "mesmo telefone" });
    else if (nome && (normalizar(c.nome) === nome || normalizar(c.nomeFantasia) === nome)) {
      resultado.aviso.push({ id: c.id, descricao: `${nomeExibido}${c.telefone ? ` · ${c.telefone}` : ""}`, motivo: "mesmo nome" });
    }
  }
  return resultado;
}

// ---------------------------------------------------------------- Fornecedores
export async function fornecedoresDuplicados(dados: { nome?: string; documento?: string | null; ignorarId?: string }): Promise<ResultadoDuplicidade> {
  const nome = normalizar(dados.nome);
  const documento = digitos(dados.documento);
  const resultado: ResultadoDuplicidade = { bloqueio: [], aviso: [] };
  if (!nome && documento.length < 11) return resultado;

  const fornecedores = await prisma.fornecedor.findMany({ select: { id: true, nome: true, documento: true } });
  for (const f of fornecedores) {
    if (f.id === dados.ignorarId) continue;
    if (nome && normalizar(f.nome) === nome) resultado.bloqueio.push({ id: f.id, descricao: f.nome, motivo: "mesmo nome" });
    else if (documento.length >= 11 && digitos(f.documento) === documento) {
      resultado.bloqueio.push({ id: f.id, descricao: `${f.nome} (${f.documento})`, motivo: "mesmo CNPJ/CPF" });
    }
  }
  return resultado;
}

// ---------------------------------------------------------------- Contas a pagar
export async function contasDuplicadas(dados: {
  codigosBarras?: (string | null | undefined)[];
  fornecedor?: string;
  valor?: number;
  vencimento?: Date;
  ignorarId?: string;
}): Promise<ResultadoDuplicidade> {
  const resultado: ResultadoDuplicidade = { bloqueio: [], aviso: [] };
  const codigos = (dados.codigosBarras ?? []).map(digitos).filter((c) => c.length >= 10);

  if (codigos.length) {
    const iguais = await prisma.contaPagar.findMany({
      where: { codigoBarras: { in: codigos }, ...(dados.ignorarId ? { id: { not: dados.ignorarId } } : {}) },
      select: { id: true, fornecedor: true, descricao: true, valor: true, vencimento: true },
    });
    for (const c of iguais) {
      resultado.bloqueio.push({
        id: c.id,
        descricao: `${c.fornecedor} · ${c.descricao} · ${moeda(Number(c.valor))} · vence ${dataBR(c.vencimento)}`,
        motivo: "mesmo código de barras",
      });
    }
  }

  const fornecedor = normalizar(dados.fornecedor);
  if (fornecedor && dados.valor && dados.vencimento && !Number.isNaN(dados.vencimento.getTime())) {
    const dia = dados.vencimento.toISOString().slice(0, 10);
    const candidatas = await prisma.contaPagar.findMany({
      where: {
        valor: dados.valor,
        vencimento: { gte: new Date(`${dia}T00:00:00Z`), lt: new Date(new Date(`${dia}T00:00:00Z`).getTime() + 86_400_000) },
        status: { not: "CANCELADO" },
        ...(dados.ignorarId ? { id: { not: dados.ignorarId } } : {}),
      },
      select: { id: true, fornecedor: true, descricao: true, valor: true, vencimento: true },
    });
    for (const c of candidatas) {
      if (normalizar(c.fornecedor) !== fornecedor || resultado.bloqueio.some((b) => b.id === c.id)) continue;
      resultado.aviso.push({
        id: c.id,
        descricao: `${c.fornecedor} · ${c.descricao} · ${moeda(Number(c.valor))} · vence ${dataBR(c.vencimento)}`,
        motivo: "mesmo fornecedor, valor e vencimento",
      });
    }
  }
  return resultado;
}

/** Mensagem curta em português para o erro 409. */
export function mensagemDuplicidade(tipo: string, r: ResultadoDuplicidade) {
  if (r.bloqueio.length) {
    const d = r.bloqueio[0];
    return `Já existe ${tipo} com ${d.motivo}: ${d.descricao}.`;
  }
  const d = r.aviso[0];
  return `Parece duplicado (${d.motivo}): ${d.descricao}. Confira antes de salvar.`;
}
