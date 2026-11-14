-- Descontos de funcionários (adiantamento, vale, carne...) abatidos do salário de sábado.
-- Só cria tabela/coluna novas; nenhum dado existente é removido.

CREATE TYPE "TipoDescontoFuncionario" AS ENUM ('ADIANTAMENTO', 'VALE', 'CARNE', 'OUTRO');

ALTER TABLE "contas_pagar" ADD COLUMN "salario_bruto" DECIMAL(12,2);
-- Salários já lançados: o salário cheio é o próprio valor (ainda não havia descontos)
UPDATE "contas_pagar" SET "salario_bruto" = "valor" WHERE "funcionario_id" IS NOT NULL;

CREATE TABLE "descontos_funcionarios" (
    "id" TEXT NOT NULL,
    "funcionario_id" TEXT NOT NULL,
    "conta_pagar_id" TEXT,
    "grupo_id" TEXT NOT NULL,
    "tipo" "TipoDescontoFuncionario" NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "descricao" TEXT,
    "criado_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "descontos_funcionarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "descontos_funcionarios_funcionario_id_data_idx" ON "descontos_funcionarios"("funcionario_id", "data");
CREATE INDEX "descontos_funcionarios_conta_pagar_id_idx" ON "descontos_funcionarios"("conta_pagar_id");

ALTER TABLE "descontos_funcionarios" ADD CONSTRAINT "descontos_funcionarios_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "descontos_funcionarios" ADD CONSTRAINT "descontos_funcionarios_conta_pagar_id_fkey" FOREIGN KEY ("conta_pagar_id") REFERENCES "contas_pagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
