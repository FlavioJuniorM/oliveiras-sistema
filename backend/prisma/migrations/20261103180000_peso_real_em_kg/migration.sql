-- A partir deste ponto o peso real de carnes vendidas por peso é sempre gravado em kg
-- (o valor que a balança mostra). Itens anotados em gramas tinham o peso real em gramas:
-- converte esses registros para kg. O subtotal já estava correto e não muda.
UPDATE "pedido_itens"
SET "peso_real" = "peso_real" / 1000
WHERE "unidade_pedido" = 'g' AND "peso_real" IS NOT NULL;
