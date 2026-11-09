import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Segurança: o usuário inicial só é criado num banco vazio (primeira instalação).
  // Assim, renomear ou excluir o "admin" não faz ele voltar com a senha padrão
  // a cada publicação do sistema.
  const usuarios = await prisma.usuario.count();
  if (usuarios > 0) {
    console.log(`Já existem ${usuarios} usuário(s): nenhum usuário inicial criado.`);
    return;
  }

  const senhaHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.usuario.create({
    data: {
      nome: "Administrador",
      login: "admin",
      senhaHash,
      papel: "ADMINISTRATIVO",
    },
  });

  console.log("Usuário administrativo inicial criado:", admin.login);
  console.log("Login: admin | Senha: admin123 (o sistema obriga a trocar no primeiro acesso)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
