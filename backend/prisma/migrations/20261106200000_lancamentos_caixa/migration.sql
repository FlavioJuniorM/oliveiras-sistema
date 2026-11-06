-- Totais do caixa lançados à mão (dinheiro, Pix e cartões), um registro por dia.
-- Só cria a tabela nova: nenhum dado existente é alterado.
CREATE TABLE "lancamentos_caixa" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "dinheiro" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pix" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cartoes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lancamentos_caixa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lancamentos_caixa_data_key" ON "lancamentos_caixa"("data");
