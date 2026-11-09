-- Cadastro de funcionários; o salário de cada sábado vira uma conta a pagar.
-- Só acrescenta: nenhum dado existente é apagado ou alterado.
CREATE TABLE "funcionarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "funcao" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "data_nascimento" DATE,
    "data_admissao" DATE,
    "registrado" BOOLEAN NOT NULL DEFAULT false,
    "salario" DECIMAL(12,2) NOT NULL,
    "chave_pix" TEXT,
    "observacoes" TEXT,
    "status" "StatusRegistro" NOT NULL DEFAULT 'ATIVO',
    "inicio_pagamentos" DATE NOT NULL,
    "gerado_ate" DATE,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "contas_pagar" ADD COLUMN "funcionario_id" TEXT;
CREATE UNIQUE INDEX "contas_pagar_funcionario_id_vencimento_key" ON "contas_pagar"("funcionario_id", "vencimento");
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
