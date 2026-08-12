import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

interface CriarClienteInput {
  tipo: "PESSOA_FISICA" | "EMPRESA" | "EVENTO";
  nome: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  documento?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  limiteCredito?: number;
  prazoPadraoDias?: number;
  formaPagamentoPadrao?: string;
  observacoes?: string;
  criadoPorId: string;
}

type AtualizarClienteInput = Partial<Omit<CriarClienteInput, "criadoPorId">> & {
  atualizadoPorId: string;
};

/**
 * Busca rápida por nome, documento (CPF/CNPJ) ou telefone — usada no balcão
 * para localizar o cliente ao abrir um novo pedido (seção 4 da especificação).
 */
export async function buscarClientes(termo: string) {
  if (!termo || termo.trim().length === 0) {
    return prisma.cliente.findMany({
      where: { status: "ATIVO" },
      orderBy: { nome: "asc" },
      take: 50,
    });
  }

  return prisma.cliente.findMany({
    where: {
      status: "ATIVO",
      OR: [
        { nome: { contains: termo, mode: "insensitive" } },
        { nomeFantasia: { contains: termo, mode: "insensitive" } },
        { documento: { contains: termo } },
        { telefone: { contains: termo } },
        { whatsapp: { contains: termo } },
      ],
    },
    orderBy: { nome: "asc" },
    take: 50,
  });
}

export async function obterCliente(id: string) {
  return prisma.cliente.findUnique({ where: { id } });
}

export async function criarCliente(input: CriarClienteInput) {
  const { criadoPorId, ...dados } = input;

  const cliente = await prisma.cliente.create({ data: dados });

  await registrarLog({
    usuarioId: criadoPorId,
    acao: "CRIOU_CLIENTE",
    entidade: "cliente",
    entidadeId: cliente.id,
    detalhes: `Cadastrou o cliente ${cliente.nome}`,
  });

  return cliente;
}

export async function atualizarCliente(id: string, input: AtualizarClienteInput) {
  const { atualizadoPorId, ...dados } = input;

  const cliente = await prisma.cliente.update({ where: { id }, data: dados });

  await registrarLog({
    usuarioId: atualizadoPorId,
    acao: "ATUALIZOU_CLIENTE",
    entidade: "cliente",
    entidadeId: cliente.id,
    detalhes: `Atualizou os dados do cliente ${cliente.nome}`,
  });

  return cliente;
}

export async function inativarCliente(id: string, executadoPorId: string) {
  const cliente = await prisma.cliente.update({
    where: { id },
    data: { status: "INATIVO" },
  });

  await registrarLog({
    usuarioId: executadoPorId,
    acao: "INATIVOU_CLIENTE",
    entidade: "cliente",
    entidadeId: cliente.id,
    detalhes: `Inativou o cliente ${cliente.nome}`,
  });

  return cliente;
}

/**
 * Página de histórico financeiro do cliente (seção 4): total comprado, total pago,
 * total em aberto, total vencido, última compra, pedidos e pagamentos anteriores.
 */
export async function historicoFinanceiroCliente(clienteId: string) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });

  if (!cliente) {
    return null;
  }

  const pedidos = await prisma.pedido.findMany({
    where: { clienteId },
    orderBy: { criadoEm: "desc" },
    include: {
      itens: { include: { produto: true } },
      pagamentos: { include: { usuario: { select: { nome: true } } } },
      contaReceber: true,
    },
  });

  const totalComprado = pedidos.reduce((soma, p) => soma + Number(p.total), 0);

  const totalPago = pedidos.reduce(
    (soma, p) => soma + p.pagamentos.reduce((s, pag) => s + Number(pag.valor), 0),
    0
  );

  const contasReceber = await prisma.contaReceber.findMany({
    where: { clienteId },
  });

  const totalEmAberto = contasReceber
    .filter((c) => c.status === "PENDENTE" || c.status === "PARCIAL")
    .reduce((soma, c) => soma + Number(c.saldo), 0);

  const totalVencido = contasReceber
    .filter((c) => c.status === "VENCIDO")
    .reduce((soma, c) => soma + Number(c.saldo), 0);

  return {
    cliente,
    limiteCredito: cliente.limiteCredito ? Number(cliente.limiteCredito) : null,
    totalComprado,
    totalPago,
    totalEmAberto,
    totalVencido,
    ultimaCompra: pedidos[0]?.criadoEm ?? null,
    pedidos,
  };
}
