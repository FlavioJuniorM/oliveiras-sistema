-- CreateEnum
CREATE TYPE "CanalPedido" AS ENUM ('INTERNO', 'PUBLICO');

-- CreateEnum
CREATE TYPE "TipoEntrega" AS ENUM ('RETIRADA', 'DELIVERY');

-- CreateEnum
CREATE TYPE "MomentoPagamentoPedido" AS ENUM ('NA_RETIRADA', 'NA_ENTREGA');

-- AlterTable
ALTER TABLE "pedidos" DROP CONSTRAINT "pedidos_usuario_id_fkey";
ALTER TABLE "pedidos" ALTER COLUMN "usuario_id" DROP NOT NULL;
ALTER TABLE "pedidos" ADD COLUMN "canal" "CanalPedido" NOT NULL DEFAULT 'INTERNO',
ADD COLUMN "tipo_entrega" "TipoEntrega" NOT NULL DEFAULT 'RETIRADA',
ADD COLUMN "momento_pagamento" "MomentoPagamentoPedido",
ADD COLUMN "taxa_entrega" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "nome_cliente" TEXT,
ADD COLUMN "telefone_cliente" TEXT,
ADD COLUMN "email_cliente" TEXT,
ADD COLUMN "endereco_entrega" TEXT,
ADD COLUMN "observacoes_cliente" TEXT,
ADD COLUMN "token_acompanhamento" TEXT;

-- CreateTable
CREATE TABLE "pedido_status_historico" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "status" "StatusOperacaoPedido" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,

    CONSTRAINT "pedido_status_historico_pkey" PRIMARY KEY ("id")
);

-- Preserva uma entrada inicial para pedidos existentes antes desta migration.
INSERT INTO "pedido_status_historico" ("id", "pedido_id", "status", "criado_em", "observacao")
SELECT md5("pedidos"."id" || clock_timestamp()::text || random()::text),
       "pedidos"."id",
       "pedidos"."status_operacao",
       "pedidos"."criado_em",
       'Histórico inicial migrado'
FROM "pedidos";

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_token_acompanhamento_key" ON "pedidos"("token_acompanhamento");
CREATE INDEX "pedido_status_historico_pedido_id_criado_em_idx" ON "pedido_status_historico"("pedido_id", "criado_em");

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pedido_status_historico" ADD CONSTRAINT "pedido_status_historico_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
