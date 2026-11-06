-- Só acrescenta coisas novas: nenhum dado existente é apagado ou alterado.

-- Pedido para um dia futuro (encomenda). Vazio = pedido para o dia em que foi anotado.
ALTER TABLE "pedidos" ADD COLUMN "data_agendada" DATE;
CREATE INDEX "pedidos_data_agendada_idx" ON "pedidos"("data_agendada");

-- Cadastro de fornecedores
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "telefone" TEXT,
    "contato" TEXT,
    "categoria_padrao" TEXT NOT NULL DEFAULT 'Fornecedores',
    "observacoes" TEXT,
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fornecedores_nome_key" ON "fornecedores"("nome");

-- Já cadastra os fornecedores que aparecem nas contas a pagar lançadas,
-- com a categoria usada na conta mais recente de cada um.
INSERT INTO "fornecedores" ("id", "nome", "categoria_padrao")
SELECT gen_random_uuid()::text, nome, categoria
FROM (
    SELECT DISTINCT ON (lower(trim("fornecedor"))) trim("fornecedor") AS nome, "categoria"
    FROM "contas_pagar"
    WHERE trim("fornecedor") <> ''
    ORDER BY lower(trim("fornecedor")), "data_lancamento" DESC
) AS existentes
ON CONFLICT ("nome") DO NOTHING;
