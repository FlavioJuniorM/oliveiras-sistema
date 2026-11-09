-- E-mail do usuário para receber o resumo diário das contas a pagar.
ALTER TABLE "usuarios" ADD COLUMN "email" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "avisos_email" BOOLEAN NOT NULL DEFAULT true;
