-- Preços conferidos com o sistema do caixa em 12/11/2026 (o caixa é o correto).
-- Só atualiza preço/código/unidade de produtos existentes e cadastra 3 cortes que faltavam.

UPDATE "produtos" SET "preco" = 44.98 WHERE "codigo" = '000000000020'; -- ACEM (era 41,98)
UPDATE "produtos" SET "preco" = 29.98 WHERE "codigo" = '000000000021'; -- ACEM COM OSSO (era 28,98)
UPDATE "produtos" SET "preco" = 39.99 WHERE "codigo" = '000000000031'; -- BIFE ESPECIAL (era 43,99)
UPDATE "produtos" SET "preco" = 34.98 WHERE "codigo" = '000000000033'; -- COSTELA GAUCHA (era 34,99)
UPDATE "produtos" SET "preco" = 29.98 WHERE "codigo" = '000000000032'; -- COSTELA PONTA DE AGULHA (era 29,99)
UPDATE "produtos" SET "preco" = 54.98 WHERE "codigo" = '000000000041'; -- COXAO DURO (era 49,98)
UPDATE "produtos" SET "preco" = 54.98 WHERE "codigo" = '000000000040'; -- COXAO MOLE (era 49,98)
UPDATE "produtos" SET "preco" = 54.98 WHERE "codigo" = '000000000042'; -- LAGARTO (era 54,99)
UPDATE "produtos" SET "preco" = 38.98 WHERE "codigo" = '000000000034'; -- MOIDA 2 (era 35,98)
UPDATE "produtos" SET "preco" = 42.98 WHERE "codigo" = '000000000027'; -- MUSCULO (era 42,99)
UPDATE "produtos" SET "preco" = 45.98 WHERE "codigo" = '000000000023'; -- PALETA (era 42,98)
UPDATE "produtos" SET "preco" = 46.98 WHERE "codigo" = '000000000043'; -- PATINHO (era 46,99)
UPDATE "produtos" SET "preco" = 47.98 WHERE "codigo" = '000000000025'; -- PEIXINHO (era 47,99)
UPDATE "produtos" SET "preco" = 17.98 WHERE "codigo" = '000000000050'; -- PERNIL (era 17,99)
UPDATE "produtos" SET "preco" = 39.98 WHERE "codigo" = '000000000024'; -- PICADAO (era 39,99)
UPDATE "produtos" SET "preco" = 19.98 WHERE "codigo" = '000000000074'; -- SALSICHA SADIA (era 19,99)

-- LINGUIÇA APIMENTADA: no caixa é vendida por kg
UPDATE "produtos" SET "tipo_venda" = 'PESO', "unidade_medida" = 'kg' WHERE "codigo" = '000000000067';

-- MOCOTÓ: no caixa o código é 000000000075 e o preço 16,99 (era código 015 e 14,98)
UPDATE "produtos" SET "codigo" = '000000000075', "preco" = 16.99
WHERE "codigo" = '000000000015'
  AND NOT EXISTS (SELECT 1 FROM "produtos" WHERE "codigo" = '000000000075');

-- Cortes que estão no caixa e faltavam no sistema
INSERT INTO "produtos" ("id", "codigo", "nome", "categoria_id", "tipo_venda", "unidade_medida", "preco", "status")
SELECT gen_random_uuid()::text, v.codigo, v.nome, (SELECT "id" FROM "categorias_produtos" WHERE "nome" = 'Carnes suínas' LIMIT 1), 'PESO', 'kg', v.preco, 'ATIVO'
FROM (VALUES
  ('000000000081', 'PE SALGADO', 14.98),
  ('000000000082', 'COSTELA SALGADA', 29.98),
  ('000000000083', 'ORELHA SALGADA', 13.98)
) AS v(codigo, nome, preco)
ON CONFLICT ("codigo") DO NOTHING;
