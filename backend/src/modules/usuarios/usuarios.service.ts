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
