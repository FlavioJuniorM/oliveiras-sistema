-- CreateEnum
CREATE TYPE "StatusOperacaoPedido" AS ENUM ('RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ENTREGA', 'ENTREGUE');

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "status_operacao" "StatusOperacaoPedido" NOT NULL DEFAULT 'RECEBIDO';
