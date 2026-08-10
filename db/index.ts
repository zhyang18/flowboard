import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type SqlClient = ReturnType<typeof postgres>;

const globalDatabase = globalThis as typeof globalThis & {
  flowboardSql?: SqlClient;
};

/**
 * 获取复用的 PostgreSQL 数据库客户端。
 *
 * @return 已绑定业务表结构的 Drizzle 数据库实例。
 */
export function getDb() {
  const connectionString = process.env.DATABASE_URL;
  const connectTimeout = Math.min(
    60,
    Math.max(5, Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS) || 30),
  );

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client =
    globalDatabase.flowboardSql ??
    postgres(connectionString, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: connectTimeout,
    });
  globalDatabase.flowboardSql = client;

  return drizzle(client, { schema });
}
