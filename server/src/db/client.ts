import pg from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { config } from "../config/index.js";

// 单例 pool。整个进程共享一个连接池。
let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
  }
  return _pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

// 直接连对象（rag 检索需要原生 SQL + 参数化），优先使用此方法跑向量查询。
export function getPoolClient(): Promise<pg.PoolClient> {
  return getPool().connect();
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export { schema };
