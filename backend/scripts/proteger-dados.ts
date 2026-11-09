/**
 * TRAVA DE SEGURANÇA DOS DADOS — roda em toda publicação, ANTES de mexer no banco.
 *
 * Se existir alguma migração ainda não aplicada que APAGA dados (DELETE FROM,
 * TRUNCATE, DROP TABLE, DROP COLUMN) e o banco já tiver dados da loja, a
 * publicação é CANCELADA e o banco não é tocado.
 *
 * Isso protege, por exemplo, contra a migração de limpeza de 04/11/2026 rodar
 * de novo por engano (se a pasta dela fosse renomeada, o Prisma a trataria como nova).
 *
 * Para autorizar de propósito uma migração que apaga dados, a primeira linha do
 * arquivo precisa ser exatamente:  -- AUTORIZADO PELO DONO: APAGA DADOS
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { prisma } from "../src/config/database";

const PASTA = join(__dirname, "..", "prisma", "migrations");
const MARCA_AUTORIZACAO = "-- AUTORIZADO PELO DONO: APAGA DADOS";
const COMANDOS_PERIGOSOS = /\b(DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|DROP\s+COLUMN|DROP\s+SCHEMA|DROP\s+DATABASE)\b/i;

async function main() {
  const migracoes = readdirSync(PASTA, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PASTA, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();

  // Banco novo (sem tabela de controle do Prisma): nada a proteger
  const controle = await prisma.$queryRawUnsafe<{ existe: boolean }[]>(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS existe`
  );
  if (!controle[0]?.existe) {
    console.log("🛡️  Banco novo: nenhuma proteção necessária.");
    return;
  }

  const aplicadas = new Set(
    (await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    )).map((m) => m.migration_name)
  );
  const pendentes = migracoes.filter((m) => !aplicadas.has(m));

  // Quanto de dado real existe hoje
  const [contagem] = await prisma.$queryRawUnsafe<{ total: bigint }[]>(`
    SELECT (SELECT count(*) FROM pedidos) + (SELECT count(*) FROM clientes) +
           (SELECT count(*) FROM contas_pagar) + (SELECT count(*) FROM produtos) AS total`);
  const temDados = Number(contagem?.total ?? 0) > 0;

  console.log(`🛡️  Proteção de dados: ${aplicadas.size} migração(ões) já aplicada(s), ${pendentes.length} nova(s).`);

  const perigosas = pendentes.filter((m) => {
    const sql = readFileSync(join(PASTA, m, "migration.sql"), "utf8");
    const semComentarios = sql.replace(/--.*$/gm, "");
    return COMANDOS_PERIGOSOS.test(semComentarios) && !sql.trimStart().startsWith(MARCA_AUTORIZACAO);
  });

  if (perigosas.length && temDados) {
    console.error("\n⛔⛔⛔ PUBLICAÇÃO BLOQUEADA PARA PROTEGER OS DADOS ⛔⛔⛔");
    console.error("Estas migrações novas APAGARIAM dados de um banco que já está em uso:");
    for (const m of perigosas) console.error(`   • ${m}`);
    console.error("O banco NÃO foi alterado. Se isso for mesmo intencional, a primeira linha da migração");
    console.error(`precisa ser: ${MARCA_AUTORIZACAO}\n`);
    process.exit(1);
  }

  console.log("🛡️  Nenhuma migração nova apaga dados. Pode seguir.");
}

main()
  .catch((erro) => {
    console.error("Falha na verificação de proteção de dados:", erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
