-- Tentativas de acesso (limite de login e de pedidos pelo site)
CREATE TABLE "tentativas_acesso" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tentativas_acesso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tentativas_acesso_tipo_chave_criado_em_idx" ON "tentativas_acesso"("tipo", "chave", "criado_em");

-- Motoboys cadastrados
CREATE TABLE "motoboys" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "motoboys_pkey" PRIMARY KEY ("id")
);
