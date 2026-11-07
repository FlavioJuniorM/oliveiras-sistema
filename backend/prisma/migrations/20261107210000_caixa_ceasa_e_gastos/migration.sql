-- Só acrescenta colunas novas (com zero nos lançamentos que já existem).
ALTER TABLE "lancamentos_caixa" ADD COLUMN "ceasa" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "lancamentos_caixa" ADD COLUMN "gastos" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "lancamentos_caixa" ADD COLUMN "gastos_descricao" TEXT;
