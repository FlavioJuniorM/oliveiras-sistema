import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";

interface CriarUsuarioInput {
  nome: string;
  login: string;
  senha: string;
  papel: "FUNCIONARIO" | "ADMINISTRATIVO";
  criadoPorId: string;
}

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    select: {
      id: true,
      nome: true,
      login: true,
      papel: true,
      status: true,
      criadoEm: true,
    },
    orderBy: { nome: "asc" },
  });
}

export async function criarUsuario(input: CriarUsuarioInput) {
  const senhaHash = await bcrypt.hash(input.senha, 10);

  const usuario = await prisma.usuario.create({
    data: {
      nome: input.nome,
      login: input.login,
      senhaHash,
      papel: input.papel,
    },
  });

  await registrarLog({
    usuarioId: input.criadoPorId,
    acao: "CRIOU_USUARIO",
    entidade: "usuario",
    entidadeId: usuario.id,
    detalhes: `Criou o usuário ${usuario.nome} (${usuario.papel})`,
  });

  const { senhaHash: _omitido, ...usuarioSemSenha } = usuario;
  return usuarioSemSenha;
}

export async function inativarUsuario(usuarioId: string, executadoPorId: string) {
  const usuario = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { status: "INATIVO" },
  });

  await registrarLog({
    usuarioId: executadoPorId,
    acao: "INATIVOU_USUARIO",
    entidade: "usuario",
    entidadeId: usuario.id,
    detalhes: `Inativou o usuário ${usuario.nome}`,
  });

  return usuario;
}

export class ErroUsuario extends Error {}

/** Garante que sempre sobra pelo menos um administrador ativo. */
async function garantirOutroAdministrador(usuarioId: string) {
  const outros = await prisma.usuario.count({
    where: { id: { not: usuarioId }, papel: "ADMINISTRATIVO", status: "ATIVO" },
  });
  if (outros === 0) {
    throw new ErroUsuario("Precisa ficar pelo menos um administrador ativo no sistema.");
  }
}

export async function alterarUsuario(
  usuarioId: string,
  dados: { nome: string; login: string; papel: "FUNCIONARIO" | "ADMINISTRATIVO"; status: "ATIVO" | "INATIVO" },
  executadoPorId: string
) {
  const atual = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!atual) throw new ErroUsuario("Usuário não encontrado.");

  const perdeAdmin = atual.papel === "ADMINISTRATIVO" && atual.status === "ATIVO" && (dados.papel !== "ADMINISTRATIVO" || dados.status !== "ATIVO");
  if (usuarioId === executadoPorId && (dados.status !== "ATIVO" || dados.papel !== atual.papel)) {
    throw new ErroUsuario("Você não pode desativar nem mudar o papel do seu próprio usuário.");
  }
  if (perdeAdmin) await garantirOutroAdministrador(usuarioId);

  const outroLogin = await prisma.usuario.findFirst({
    where: { id: { not: usuarioId }, login: { equals: dados.login, mode: "insensitive" } },
  });
  if (outroLogin) throw new ErroUsuario("Já existe outro usuário com esse login.");

  const usuario = await prisma.usuario.update({
    where: { id: usuarioId },
    data: dados,
    select: { id: true, nome: true, login: true, papel: true, status: true, criadoEm: true },
  });

  const mudancas = [
    atual.nome !== usuario.nome && `nome: ${atual.nome} → ${usuario.nome}`,
    atual.login !== usuario.login && `login: ${atual.login} → ${usuario.login}`,
    atual.papel !== usuario.papel && `papel: ${atual.papel} → ${usuario.papel}`,
    atual.status !== usuario.status && `status: ${atual.status} → ${usuario.status}`,
  ].filter(Boolean);

  await registrarLog({
    usuarioId: executadoPorId,
    acao: "ALTEROU_USUARIO",
    entidade: "usuario",
    entidadeId: usuario.id,
    detalhes: `Alterou o usuário ${usuario.nome}${mudancas.length ? ` (${mudancas.join("; ")})` : ""}`,
  });

  return usuario;
}

/**
 * Excluir usuário. Quem já trabalhou no sistema (comandas, pagamentos, registros)
 * é desativado — perde o acesso, mas o nome continua no histórico.
 * Usuário sem nenhum registro é apagado de vez.
 */
export async function excluirUsuario(usuarioId: string, executadoPorId: string) {
  if (usuarioId === executadoPorId) throw new ErroUsuario("Você não pode excluir o seu próprio usuário.");

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { _count: { select: { pedidos: true, pagamentos: true, itensPreparados: true, itensCortados: true, logs: true } } },
  });
  if (!usuario) throw new ErroUsuario("Usuário não encontrado.");
  if (usuario.papel === "ADMINISTRATIVO" && usuario.status === "ATIVO") await garantirOutroAdministrador(usuarioId);

  const c = usuario._count;
  const temHistorico = c.pedidos + c.pagamentos + c.itensPreparados + c.itensCortados + c.logs > 0;

  if (temHistorico) {
    await prisma.usuario.update({ where: { id: usuarioId }, data: { status: "INATIVO" } });
  } else {
    await prisma.usuario.delete({ where: { id: usuarioId } });
  }

  await registrarLog({
    usuarioId: executadoPorId,
    acao: temHistorico ? "INATIVOU_USUARIO" : "EXCLUIU_USUARIO",
    entidade: "usuario",
    entidadeId: usuarioId,
    detalhes: temHistorico
      ? `Excluiu o acesso do usuário ${usuario.nome} (${usuario.login}) — mantido no histórico`
      : `Excluiu o usuário ${usuario.nome} (${usuario.login})`,
  });

  return { excluido: !temHistorico, desativado: temHistorico };
}
