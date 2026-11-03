CREATE TABLE "configuracoes_sistema" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "tolerancia_pesagem_percentual" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_sistema_pkey" PRIMARY KEY ("id")
);

INSERT INTO "configuracoes_sistema" ("id", "tolerancia_pesagem_percentual", "atualizado_em")
VALUES ('principal', 10, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
