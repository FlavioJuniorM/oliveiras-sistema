-- Liga as duas partes de um boleto dividido em 2 (para poder alterar as duas juntas).
-- Só adiciona uma coluna e preenche nos pares que já existem; nada é apagado.

ALTER TABLE "contas_pagar" ADD COLUMN "grupo_boleto" TEXT;
CREATE INDEX "contas_pagar_grupo_boleto_idx" ON "contas_pagar"("grupo_boleto");

-- Pares já lançados: "(boleto 1/2)" e "(boleto 2/2)" do mesmo fornecedor, mesma descrição e mesmo lançamento
UPDATE "contas_pagar" c
SET "grupo_boleto" = p1."id"
FROM "contas_pagar" p1
WHERE p1."descricao" LIKE '% (boleto 1/2)'
  AND c."fornecedor" = p1."fornecedor"
  AND c."data_lancamento" = p1."data_lancamento"
  AND (
    c."id" = p1."id"
    OR (
      c."descricao" LIKE '% (boleto 2/2)'
      AND left(c."descricao", length(c."descricao") - length(' (boleto 2/2)')) = left(p1."descricao", length(p1."descricao") - length(' (boleto 1/2)'))
    )
  );
