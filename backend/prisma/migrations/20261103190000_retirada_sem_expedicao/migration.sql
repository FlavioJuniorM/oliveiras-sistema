-- Novo fluxo de saída: PRONTO → AGUARDANDO_RETIRADA (retirada) ou EM_ENTREGA (rota) → ENTREGUE.
-- A etapa EXPEDICAO deixa de existir: o valor fica no enum só para o histórico antigo.
ALTER TYPE "StatusOperacaoPedido" ADD VALUE IF NOT EXISTS 'AGUARDANDO_RETIRADA' AFTER 'PRONTO';

-- Comandas que estavam em expedição passam para "Prontos"
UPDATE "pedidos" SET "status_operacao" = 'PRONTO' WHERE "status_operacao" = 'EXPEDICAO';
