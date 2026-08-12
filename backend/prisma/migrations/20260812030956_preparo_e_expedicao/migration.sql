-- CreateEnum
CREATE TYPE "StatusPreparoItem" AS ENUM ('PENDENTE', 'EM_CORTE', 'CORTADO');

-- AlterEnum
ALTER TYPE "StatusOperacaoPedido" ADD VALUE 'EXPEDICAO';

-- AlterTable
ALTER TABLE "pedido_itens" ADD COLUMN     "peso_real" DECIMAL(12,3),
ADD COLUMN     "status_preparo" "StatusPreparoItem" NOT NULL DEFAULT 'PENDENTE';
