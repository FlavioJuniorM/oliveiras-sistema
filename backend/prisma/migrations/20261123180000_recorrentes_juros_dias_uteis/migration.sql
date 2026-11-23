-- Fornecedor recorrente (água, luz, internet, aluguel)
ALTER TABLE "fornecedores" ADD COLUMN IF NOT EXISTS "recorrente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fornecedores" ADD COLUMN IF NOT EXISTS "dia_vencimento" INTEGER;
ALTER TABLE "fornecedores" ADD COLUMN IF NOT EXISTS "valor_recorrente" DECIMAL(12,2);

-- Conta recorrente, vencimento original (fim de semana/feriado) e juros de atraso
ALTER TABLE "contas_pagar" ADD COLUMN IF NOT EXISTS "recorrente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contas_pagar" ADD COLUMN IF NOT EXISTS "serie_recorrente" TEXT;
ALTER TABLE "contas_pagar" ADD COLUMN IF NOT EXISTS "vencimento_original" TIMESTAMP(3);
ALTER TABLE "contas_pagar" ADD COLUMN IF NOT EXISTS "juros" DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "contas_pagar_serie_recorrente_idx" ON "contas_pagar"("serie_recorrente");
