-- Recebimento por fora do caixa da loja
ALTER TABLE "pagamentos" ADD COLUMN IF NOT EXISTS "fora_do_caixa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pagamentos" ADD COLUMN IF NOT EXISTS "observacao" TEXT;

-- Alterar / cancelar conta a receber
ALTER TABLE "contas_receber" ADD COLUMN IF NOT EXISTS "motivo_cancelamento" TEXT;
ALTER TABLE "contas_receber" ADD COLUMN IF NOT EXISTS "cancelado_em" TIMESTAMP(3);
ALTER TABLE "contas_receber" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;
