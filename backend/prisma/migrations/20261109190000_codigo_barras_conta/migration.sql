-- Código de barras (opcional) da conta a pagar, único: o mesmo boleto não entra duas vezes.
ALTER TABLE "contas_pagar" ADD COLUMN "codigo_barras" TEXT;
CREATE UNIQUE INDEX "contas_pagar_codigo_barras_key" ON "contas_pagar"("codigo_barras");
