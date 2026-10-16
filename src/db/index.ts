import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as masterSchema from "./schema/master";
import { createTenantSchema, TenantSchemaTables } from "./schema/tenant";
import { logQueryPerformance, logger } from "@/lib/logger";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://komame_user:komame_secure_pass_2026@localhost:5432/komame_db";

// 単一の共通 PostgreSQL 接続プール (全テナント共有)
const client = postgres(connectionString, {
  max: 30, // 接続プール最大数
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // 不要なNOTICEログの抑制
});

// マスタDB接続インスタンス (public スキーマ)
export const masterDb = drizzle(client, {
  schema: masterSchema,
});

// テナントスキーマキャッシュ (スキーマ名 -> テーブル定義マップ)
const tenantSchemaCache = new Map<string, TenantSchemaTables>();

export function getTenantSchema(schemaName: string): TenantSchemaTables {
  if (!tenantSchemaCache.has(schemaName)) {
    tenantSchemaCache.set(schemaName, createTenantSchema(schemaName));
  }
  return tenantSchemaCache.get(schemaName)!;
}

// テナント専用 DB ヘルパー関数
export function getTenantDb(schemaName: string) {
  const schema = getTenantSchema(schemaName);
  const db = drizzle(client, {
    schema,
  });

  return {
    db,
    schema,
    client,
    raw: client,
  };
}

// データベース接続テスト用ヘルパー
export async function checkDbConnection(): Promise<boolean> {
  try {
    const startTime = Date.now();
    await client`SELECT 1`;
    const duration = Date.now() - startTime;
    logQueryPerformance("SELECT 1", [], duration, "public");
    return true;
  } catch (error) {
    logger.error({ error }, "Database connection failed");
    return false;
  }
}
