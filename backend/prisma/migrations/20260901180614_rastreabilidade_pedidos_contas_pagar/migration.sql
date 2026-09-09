-- AlterTable
ALTER TABLE "contas_pagar" ADD COLUMN     "valor_pago" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pedido_itens" ADD COLUMN     "cortado_por_id" TEXT,
ADD COLUMN     "preparado_por_id" TEXT;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_preparado_por_id_fkey" FOREIGN KEY ("preparado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_cortado_por_id_fkey" FOREIGN KEY ("cortado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
