/**
 * Aplica as migrações do banco na publicação.
 *
 * - Usa a conexão DIRETA da Neon (sem "-pooler"): o pooler às vezes não segura a
 *   trava que o Prisma usa para migrar com segurança e a publicação falhava com
 *   "Timed out trying to acquire a postgres advisory lock" (erro P1002).
 * - Se mesmo assim der tempo esgotado, tenta de novo (até 3 vezes).
 * Nenhum dado é alterado aqui além das migrações normais (a trava proteger-dados roda antes).
 */
import { spawnSync } from "node:child_process";

const original = process.env.DATABASE_URL || "";
let direta = original;
try {
  const url = new URL(original);
  if (url.hostname.includes("-pooler.")) {
    url.hostname = url.hostname.replace("-pooler.", ".");
    url.searchParams.delete("pgbouncer");
    direta = url.toString();
    console.log("🔌 Migrações pela conexão direta do banco (sem pooler).");
  }
} catch {
  // URL fora do padrão: segue com a original
}

for (let tentativa = 1; tentativa <= 3; tentativa++) {
  const resultado = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: direta },
    shell: process.platform === "win32",
  });
  if (resultado.status === 0) process.exit(0);
  if (tentativa < 3) {
    console.log(`⏳ Migração não concluiu (tentativa ${tentativa}/3). Tentando de novo em 15s...`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
}
console.error("❌ Não foi possível aplicar as migrações depois de 3 tentativas.");
process.exit(1);
