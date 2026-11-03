import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/database";
import { registrarLog } from "../../shared/registrarLog";
import { contarTentativas, limparTentativas, registrarTentativa } from "../../shared/limites";

interface LoginInput {
  login: string;
  senha: string;
  ip?: string;
}

export class ErroAutenticacao extends Error {}
export class ErroMuitasTentativas extends Error {}

// Depois de 5 senhas erradas no mesmo login (ou 20 no mesmo IP) em 15 minutos,
// o acesso fica bloqueado por 15 minutos.
const JANELA_LOGIN_MINUTOS = 15;
const MAX_FALHAS_POR_USUARIO = 5;
const MAX_FALHAS_POR_IP = 20;

// Senhas fracas conhecidas: entram, mas o sistema pede para trocar
const SENHAS_FRACAS = ["admin123", "123456", "12345678", "senha123", "oliveiras"];

export function senhaPrecisaTrocar(senha: string, login: string) {
  return SENHAS_FRACAS.includes(senha.toLowerCase()) || senha.toLowerCase() === login.toLowerCase() || senha.length < 8;
}

export function validarNovaSenha(senha: string, login: string) {
  if (senha.length < 8) return "A nova senha deve ter pelo menos 8 caracteres.";
  if (SENHAS_FRACAS.includes(senha.toLowerCase())) return "Essa senha é muito comum. Escolha outra.";
  if (senha.toLowerCase() === login.toLowerCase()) return "A senha não pode ser igual ao login.";
  return null;
}

export async function autenticarUsuario({ login, senha, ip = "desconhecido" }: LoginInput) {
  const chaveLogin = login.trim().toLowerCase();
  const [falhasUsuario, falhasIp] = await Promise.all([
    contarTentativas("LOGIN_FALHA_USUARIO", chaveLogin, JANELA_LOGIN_MINUTOS),
    contarTentativas("LOGIN_FALHA_IP", ip, JANELA_LOGIN_MINUTOS),
  ]);
  if (falhasUsuario >= MAX_FALHAS_POR_USUARIO || falhasIp >= MAX_FALHAS_POR_IP) {
    throw new ErroMuitasTentativas(`Muitas tentativas de senha. Aguarde ${JANELA_LOGIN_MINUTOS} minutos e tente de novo.`);
  }

  const usuario = await prisma.usuario.findUnique({ where: { login } });
  const senhaCorreta = usuario && usuario.status === "ATIVO" ? await bcrypt.compare(senha, usuario.senhaHash) : false;

  if (!usuario || usuario.status !== "ATIVO" || !senhaCorreta) {
    await Promise.all([
      registrarTentativa("LOGIN_FALHA_USUARIO", chaveLogin),
      registrarTentativa("LOGIN_FALHA_IP", ip),
    ]);
    // Mensagem genérica de propósito — não revela se o login existe ou não
    throw new ErroAutenticacao("Login ou senha inválidos.");
  }

  await limparTentativas("LOGIN_FALHA_USUARIO", chaveLogin);

  const payload = {
    id: usuario.id,
    nome: usuario.nome,
    papel: usuario.papel,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "8h") as jwt.SignOptions["expiresIn"],
  });

  await registrarLog({
    usuarioId: usuario.id,
    acao: "LOGIN",
    detalhes: `${usuario.nome} entrou no sistema`,
  });

  return {
    token,
    usuario: payload,
    // Senha padrão/fraca: a tela pede para trocar antes de continuar
    trocarSenha: senhaPrecisaTrocar(senha, usuario.login),
  };
}

export async function trocarPropriaSenha(usuarioId: string, senhaAtual: string, novaSenha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new ErroAutenticacao("Usuário não encontrado.");
  if (!(await bcrypt.compare(senhaAtual, usuario.senhaHash))) {
    throw new ErroAutenticacao("A senha atual não confere.");
  }
  const problema = validarNovaSenha(novaSenha, usuario.login);
  if (problema) throw new ErroAutenticacao(problema);
  if (await bcrypt.compare(novaSenha, usuario.senhaHash)) {
    throw new ErroAutenticacao("A nova senha precisa ser diferente da atual.");
  }

  await prisma.usuario.update({ where: { id: usuarioId }, data: { senhaHash: await bcrypt.hash(novaSenha, 10) } });
  await registrarLog({ usuarioId, acao: "TROCOU_SENHA", entidade: "usuario", entidadeId: usuarioId, detalhes: `${usuario.nome} trocou a própria senha` });
}

/** Administrador define uma nova senha para outro usuário (ex.: funcionário esqueceu). */
export async function redefinirSenhaUsuario(usuarioId: string, novaSenha: string, executadoPorId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new ErroAutenticacao("Usuário não encontrado.");
  const problema = validarNovaSenha(novaSenha, usuario.login);
  if (problema) throw new ErroAutenticacao(problema);

  await prisma.usuario.update({ where: { id: usuarioId }, data: { senhaHash: await bcrypt.hash(novaSenha, 10) } });
  await limparTentativas("LOGIN_FALHA_USUARIO", usuario.login.toLowerCase());
  await registrarLog({ usuarioId: executadoPorId, acao: "REDEFINIU_SENHA", entidade: "usuario", entidadeId: usuarioId, detalhes: `Redefiniu a senha de ${usuario.nome}` });
}
