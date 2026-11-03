-- =============================================================================
-- LIMPEZA PARA INÍCIO DA OPERAÇÃO (04/11/2026)
-- Pedido do dono: zerar todos os dados de teste antes de começar a usar o sistema.
-- Roda UMA única vez (o Prisma registra que esta migração já foi aplicada).
--
-- APAGA: pedidos e itens, histórico dos pedidos, pagamentos (fechamento de caixa),
--        contas a receber, notas fiscais, contas a pagar, clientes,
--        contador de numeração (o próximo pedido volta a ser 2026-000001)
--        e o registro de tentativas de login/pedidos.
-- MANTÉM: produtos e preços, categorias, usuários e senhas, motoboys,
--         configurações e o log de auditoria.
-- =============================================================================
DELETE FROM "pagamentos";
DELETE FROM "contas_receber";
DELETE FROM "notas_fiscais";
DELETE FROM "pedido_status_historico";
DELETE FROM "pedido_itens";
DELETE FROM "pedidos";
DELETE FROM "contadores_pedido";
DELETE FROM "contas_pagar";
DELETE FROM "clientes";
DELETE FROM "tentativas_acesso";
