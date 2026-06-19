/**
 * 极简迁移器：顺序执行 server/migrations/*.sql，用 schema_migrations 表去重。
 * 不依赖 drizzle-kit 也能跑，适合个人项目快速 bootstrap。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const dir = path.resolve(__dirname, "../../migrations");
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql") && !f.startsWith("._")).sort();
    } catch {
      console.warn("[migrate] migrations dir not found, skipping:", dir);
      return;
    }

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file]
      );
      if (rows.length > 0) {
        continue;
      }
      const sql = await fs.readFile(path.join(dir, file), "utf8");
      console.log(`[migrate] applying ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`[migrate] failed ${file}: ${(e as Error).message}`);
      }
    }
    console.log("[migrate] done");
  } finally {
    client.release();
  }
}

// 直接运行：tsx src/db/migrate.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
