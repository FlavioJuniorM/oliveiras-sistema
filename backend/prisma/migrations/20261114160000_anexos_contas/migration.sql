-- Comprovantes de pagamento e recibos assinados (fotos/PDF) guardados junto das contas a pagar.
-- Só cria tabela nova; nenhum dado existente é alterado.

CREATE TYPE "TipoAnexo" AS ENUM ('COMPROVANTE', 'RECIBO_ASSINADO');

CREATE TABLE "anexos_contas" (
    "id" TEXT NOT NULL,
    "conta_pagar_id" TEXT NOT NULL,
    "tipo" "TipoAnexo" NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo_mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "criado_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "anexos_contas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "anexos_contas_conta_pagar_id_idx" ON "anexos_contas"("conta_pagar_id");

ALTER TABLE "anexos_contas" ADD CONSTRAINT "anexos_contas_conta_pagar_id_fkey" FOREIGN KEY ("conta_pagar_id") REFERENCES "contas_pagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
