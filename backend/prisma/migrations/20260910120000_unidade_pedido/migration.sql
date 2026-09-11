ALTER TABLE "pedido_itens"
ADD COLUMN "unidade_pedido" TEXT NOT NULL DEFAULT 'kg';

UPDATE "pedido_itens" AS item
SET "unidade_pedido" = CASE LOWER(produto."unidade_medida")
  WHEN 'un' THEN 'peca'
  WHEN 'unidade' THEN 'unidade'
  WHEN 'g' THEN 'g'
  ELSE 'kg'
END
FROM "produtos" AS produto
WHERE produto."id" = item."produto_id";
