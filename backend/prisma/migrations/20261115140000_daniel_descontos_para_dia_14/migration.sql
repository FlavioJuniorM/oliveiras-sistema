-- Acerto pedido pelo dono em 15/11/2026: os descontos do funcionário DANIEL lançados
-- depois da virada da semana caíram no sábado 21/11. Eles são da semana que fechou
-- no sábado 14/11 — movemos para o dia 14 (só se o dia 14 ainda não tiver sido pago)
-- e recalculamos o valor dos dois sábados (salário cheio − descontos).
-- Não apaga nada; só muda o sábado em que o desconto é abatido.

WITH alvo AS (
  SELECT c21."id" AS de, c14."id" AS para
  FROM "funcionarios" f
  JOIN "contas_pagar" c21 ON c21."funcionario_id" = f."id" AND c21."vencimento" = DATE '2026-11-21'
  JOIN "contas_pagar" c14 ON c14."funcionario_id" = f."id" AND c14."vencimento" = DATE '2026-11-14'
  WHERE f."nome" ILIKE 'daniel%'
    AND c14."valor_pago" = 0
    AND c14."status" IN ('PENDENTE', 'VENCIDO')
)
UPDATE "descontos_funcionarios" d
SET "conta_pagar_id" = alvo.para
FROM alvo
WHERE d."conta_pagar_id" = alvo.de;

-- Recalcula os sábados 14 e 21 do Daniel (que ainda não foram pagos)
WITH semanas AS (
  SELECT c."id",
         COALESCE(c."salario_bruto", c."valor") AS bruto,
         COALESCE((SELECT SUM(d."valor") FROM "descontos_funcionarios" d WHERE d."conta_pagar_id" = c."id"), 0) AS total
  FROM "contas_pagar" c
  JOIN "funcionarios" f ON f."id" = c."funcionario_id"
  WHERE f."nome" ILIKE 'daniel%'
    AND c."vencimento" IN (DATE '2026-11-14', DATE '2026-11-21')
    AND c."valor_pago" = 0
    AND c."status" IN ('PENDENTE', 'VENCIDO')
)
UPDATE "contas_pagar" c
SET "valor" = GREATEST(s.bruto - s.total, 0),
    "salario_bruto" = s.bruto,
    "descricao" = CASE
      WHEN s.total > 0 THEN
        'Salário do sábado ' || to_char(c."vencimento", 'DD/MM') ||
        ' — salário R$ ' || replace(to_char(s.bruto, 'FM999999990.00'), '.', ',') ||
        ' − descontos R$ ' || replace(to_char(s.total, 'FM999999990.00'), '.', ',')
      ELSE 'Salário do sábado ' || to_char(c."vencimento", 'DD/MM')
    END
FROM semanas s
WHERE c."id" = s."id";
