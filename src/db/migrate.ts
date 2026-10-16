import "dotenv/config";
import postgres from "postgres";
import { logger } from "../lib/logger";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://komame_user:komame_secure_pass_2026@localhost:5432/komame_db";

const sql = postgres(connectionString, { max: 1 });

export async function createMasterTables(sqlClient: typeof sql) {
  await sqlClient.unsafe(`
    CREATE TABLE IF NOT EXISTS public.users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      theme_preference VARCHAR(50) DEFAULT 'natural_komame',
      is_super_admin BOOLEAN DEFAULT FALSE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.households (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      schema_name VARCHAR(63) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.household_memberships (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      household_id VARCHAR(64) NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'active' NOT NULL,
      is_default BOOLEAN DEFAULT TRUE NOT NULL,
      joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.system_settings (
      id VARCHAR(64) PRIMARY KEY,
      household_id VARCHAR(64) REFERENCES public.households(id) ON DELETE CASCADE,
      key VARCHAR(50) NOT NULL,
      value_json JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);
}

export async function runMigrations() {
  logger.info("🚀 Starting database schema migrations...");

  try {
    // 1. マスタスキーマ (public) テーブル作成
    await createMasterTables(sql);
    logger.info("✅ Master schema tables verified.");

    // 2. 既存の全世帯スキーマのテーブルを作成 / 更新
    const existingHouseholds = await sql<{ schema_name: string }[]>`
      SELECT schema_name FROM public.households
    `;

    for (const { schema_name } of existingHouseholds) {
      await createTenantTables(schema_name);
    }

    logger.info("🎉 Database migration completed successfully!");
  } catch (error) {
    logger.error({ error }, "❌ Migration failed");
    throw error;
  } finally {
    await sql.end();
  }
}

// テナント専用スキーマ＆テーブル作成関数
export async function createTenantTables(schemaName: string) {
  logger.info(`🔨 Setting up tenant schema: ${schemaName}`);

  // スキーマの作成
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // テナント専用テーブル群の作成
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".accounts (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(30) NOT NULL,
      balance BIGINT DEFAULT 0 NOT NULL,
      icon VARCHAR(50),
      color VARCHAR(20),
      sort_order INT DEFAULT 0 NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".account_reservations (
      id VARCHAR(64) PRIMARY KEY,
      account_id VARCHAR(64) NOT NULL REFERENCES "${schemaName}".accounts(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      amount BIGINT NOT NULL,
      color VARCHAR(20),
      note TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".payment_methods (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      type VARCHAR(30) NOT NULL,
      source_account_id VARCHAR(64) REFERENCES "${schemaName}".accounts(id) ON DELETE SET NULL,
      closing_day INT,
      withdrawal_day INT,
      withdrawal_month_offset INT DEFAULT 1 NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".categories (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      parent_id VARCHAR(64),
      icon VARCHAR(50),
      color VARCHAR(20),
      sort_order INT DEFAULT 0 NOT NULL,
      is_archived BOOLEAN DEFAULT FALSE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".checkpoints (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".transactions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(20) NOT NULL,
      date DATE NOT NULL,
      amount BIGINT NOT NULL,
      category_id VARCHAR(64) REFERENCES "${schemaName}".categories(id) ON DELETE SET NULL,
      payment_method_id VARCHAR(64) REFERENCES "${schemaName}".payment_methods(id) ON DELETE SET NULL,
      from_account_id VARCHAR(64) REFERENCES "${schemaName}".accounts(id) ON DELETE SET NULL,
      to_account_id VARCHAR(64) REFERENCES "${schemaName}".accounts(id) ON DELETE SET NULL,
      shop_name VARCHAR(150),
      note TEXT,
      is_settled BOOLEAN DEFAULT FALSE NOT NULL,
      scheduled_withdrawal_date DATE,
      checkpoint_id VARCHAR(64) REFERENCES "${schemaName}".checkpoints(id) ON DELETE SET NULL,
      deleted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".incomes (
      id VARCHAR(64) PRIMARY KEY,
      transaction_id VARCHAR(64) NOT NULL UNIQUE REFERENCES "${schemaName}".transactions(id) ON DELETE CASCADE,
      gross_amount BIGINT NOT NULL,
      tax_deduction BIGINT DEFAULT 0 NOT NULL,
      net_amount BIGINT NOT NULL,
      is_temporary BOOLEAN DEFAULT FALSE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".tags (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      color VARCHAR(20)
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".transaction_tags (
      transaction_id VARCHAR(64) NOT NULL REFERENCES "${schemaName}".transactions(id) ON DELETE CASCADE,
      tag_id VARCHAR(64) NOT NULL REFERENCES "${schemaName}".tags(id) ON DELETE CASCADE,
      PRIMARY KEY (transaction_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".drafts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      draft_type VARCHAR(20) NOT NULL,
      form_type VARCHAR(30) NOT NULL,
      payload_json JSONB NOT NULL,
      item_count INT DEFAULT 1 NOT NULL,
      saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".savings_goals (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      target_amount BIGINT NOT NULL,
      target_date DATE,
      account_ids_json JSONB,
      color VARCHAR(20),
      is_completed BOOLEAN DEFAULT FALSE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".notifications (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(30) NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}".audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      operator_user_id VARCHAR(64) NOT NULL,
      action VARCHAR(20) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(64),
      summary TEXT NOT NULL,
      before_data_json JSONB,
      after_data_json JSONB,
      checkpoint_id VARCHAR(64),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );

    -- 既存テーブルの列拡張 (VARCHAR 36 -> 64)
    ALTER TABLE "${schemaName}".drafts ALTER COLUMN id TYPE VARCHAR(64);
    ALTER TABLE "${schemaName}".drafts ALTER COLUMN user_id TYPE VARCHAR(64);
    ALTER TABLE "${schemaName}".checkpoints ALTER COLUMN id TYPE VARCHAR(64);
    ALTER TABLE "${schemaName}".transactions ALTER COLUMN id TYPE VARCHAR(64);

    -- インデックス作成
    CREATE INDEX IF NOT EXISTS "idx_${schemaName}_tx_date" ON "${schemaName}".transactions(date);
    CREATE INDEX IF NOT EXISTS "idx_${schemaName}_tx_cat" ON "${schemaName}".transactions(category_id);
    CREATE INDEX IF NOT EXISTS "idx_${schemaName}_tx_user" ON "${schemaName}".transactions(user_id);
    CREATE INDEX IF NOT EXISTS "idx_${schemaName}_audit_time" ON "${schemaName}".audit_logs(created_at);
  `);

  logger.info(`✅ Tenant schema ${schemaName} ready.`);
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
