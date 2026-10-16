import "dotenv/config";
import postgres from "postgres";
import { hashPassword } from "../lib/auth";
import { createMasterTables, createTenantTables } from "./migrate";
import { logger } from "../lib/logger";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://komame_user:komame_secure_pass_2026@localhost:5432/komame_db";

const sql = postgres(connectionString, { max: 1 });

export async function seedDatabase() {
  logger.info("🌱 Starting database seeding...");

  try {
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@komame.local";
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || "Password123!";
    const householdName = process.env.DEFAULT_HOUSEHOLD_NAME || "山田家";

    const userId = "usr-yamada-taro-001";
    const householdId = "hh-yamada-household-001";
    const schemaName = "tenant_yamada_001";

    // 1. マスタスキーマ (public) のテーブルを確実に作成
    await createMasterTables(sql);
    logger.info("✅ Master tables verified.");

    // 2. テナントスキーマとテーブルを作成
    await createTenantTables(schemaName);

    // 2. マスタユーザー作成 (パスワード: Argon2id)
    const passwordHash = await hashPassword(adminPass);

    await sql`
      INSERT INTO public.users (id, email, password_hash, theme_preference, is_super_admin, is_active)
      VALUES (${userId}, ${adminEmail}, ${passwordHash}, 'natural_komame', TRUE, TRUE)
      ON CONFLICT (email) DO UPDATE SET password_hash = ${passwordHash}
    `;

    // 3. 世帯マスター作成
    await sql`
      INSERT INTO public.households (id, name, schema_name)
      VALUES (${householdId}, ${householdName}, ${schemaName})
      ON CONFLICT (id) DO NOTHING
    `;

    // 4. 世帯所属作成
    await sql`
      INSERT INTO public.household_memberships (id, user_id, household_id, role, status, is_default)
      VALUES ('mem-yamada-001', ${userId}, ${householdId}, 'admin', 'active', TRUE)
      ON CONFLICT (id) DO NOTHING
    `;

    // 5. システム設定 (パスワード要件, 通貨, 日付フォーマット)
    const defaultPasswordPolicy = JSON.stringify({
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: false,
    });

    await sql.unsafe(`
      INSERT INTO public.system_settings (id, household_id, key, value_json)
      VALUES 
        ('sys-cur-001', '${householdId}', 'currency_symbol', '"¥"'::jsonb),
        ('sys-date-001', '${householdId}', 'date_format', '"YYYY/MM/DD"'::jsonb),
        ('sys-pwd-001', '${householdId}', 'password_policy', '${defaultPasswordPolicy}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);

    // 6. テナント内: 日本の標準費目マスターの投入
    const categories = [
      { id: "cat-food", name: "食費 (食材・自炊)", icon: "🥦", color: "#2E7D32", sort: 1 },
      { id: "cat-dining", name: "外食・カフェ", icon: "☕", color: "#D97706", sort: 2 },
      { id: "cat-daily", name: "日用品・生活雑貨", icon: "🧻", color: "#059669", sort: 3 },
      { id: "cat-house", name: "住居費 (家賃・住宅ローン)", icon: "🏠", color: "#4F46E5", sort: 4 },
      { id: "cat-util", name: "水道光熱費 (電気・ガス・水道)", icon: "⚡", color: "#0284C7", sort: 5 },
      { id: "cat-comm", name: "通信費 (スマホ・インターネット)", icon: "📱", color: "#7C3AED", sort: 6 },
      { id: "cat-trans", name: "交通費 (電車・ガソリン)", icon: "🚆", color: "#2563EB", sort: 7 },
      { id: "cat-fun", name: "教養・娯楽・趣味", icon: "🎮", color: "#DB2777", sort: 8 },
      { id: "cat-med", name: "医療・保険", icon: "💊", color: "#DC2626", sort: 9 },
      { id: "cat-cloth", name: "衣服・美容", icon: "👕", color: "#EA580C", sort: 10 },
      { id: "cat-spec", name: "特別費 (冠婚葬祭・旅行)", icon: "🎁", color: "#9333EA", sort: 11 },
      { id: "cat-invest", name: "貯蓄・投資 (NISA・定期預金)", icon: "🌱", color: "#16A34A", sort: 12 },
    ];

    for (const cat of categories) {
      await sql.unsafe(`
        INSERT INTO "${schemaName}".categories (id, name, icon, color, sort_order, is_archived)
        VALUES ('${cat.id}', '${cat.name}', '${cat.icon}', '${cat.color}', ${cat.sort}, FALSE)
        ON CONFLICT (id) DO NOTHING
      `);
    }

    // 7. テナント内: 口座・ウォレットの投入
    await sql.unsafe(`
      INSERT INTO "${schemaName}".accounts (id, name, type, balance, icon, color, sort_order, is_active)
      VALUES 
        ('acc-bank-01', '三井住友銀行 (メイン給与口座)', 'bank', 1450000, '🏛️', '#2E7D32', 1, TRUE),
        ('acc-paypay-01', 'PayPay (スマホ決済残高)', 'prepaid_wallet', 18400, '📱', '#EF4444', 2, TRUE),
        ('acc-cash-01', '手元現金 (財布)', 'cash', 25000, '💵', '#E6A15C', 3, TRUE),
        ('acc-nisa-01', 'SBI証券 (つみたてNISA)', 'nisa_investment', 980000, '📈', '#16A34A', 4, TRUE)
      ON CONFLICT (id) DO NOTHING;

      -- 口座内バーチャル貯蓄 (資金色分け)
      INSERT INTO "${schemaName}".account_reservations (id, account_id, name, amount, color, note)
      VALUES
        ('res-01', 'acc-bank-01', '車検・税金用積立 (ロック中)', 200000, '#E6A15C', '次回5月支払い用'),
        ('res-02', 'acc-bank-01', '生活防衛資金 (ロック中)', 300000, '#2563EB', '緊急時取り崩し専用')
      ON CONFLICT (id) DO NOTHING;

      -- 決済手段マスター (クレカ締め日: 月末, 引き落とし日: 27日, 翌月)
      INSERT INTO "${schemaName}".payment_methods (id, name, type, source_account_id, closing_day, withdrawal_day, withdrawal_month_offset, is_active)
      VALUES
        ('pm-rakuten-01', '楽天カード (メインクレカ)', 'credit_card', 'acc-bank-01', 99, 27, 1, TRUE),
        ('pm-paypay-01', 'PayPay残高払い', 'qr_code', 'acc-paypay-01', NULL, NULL, 0, TRUE),
        ('pm-cash-01', '現金', 'cash', 'acc-cash-01', NULL, NULL, 0, TRUE),
        ('pm-debit-01', '三井住友デビット', 'debit_card', 'acc-bank-01', NULL, NULL, 0, TRUE)
      ON CONFLICT (id) DO NOTHING;

      -- 貯蓄目標 (年間100万円貯蓄)
      INSERT INTO "${schemaName}".savings_goals (id, title, target_amount, target_date, account_ids_json, color, is_completed)
      VALUES
        ('goal-01', '年間100万円 貯蓄チャレンジ', 1000000, '2026-12-31', '["acc-bank-01", "acc-nisa-01"]'::jsonb, '#2E7D32', FALSE)
      ON CONFLICT (id) DO NOTHING;

      -- サンプル明細データの投入
      INSERT INTO "${schemaName}".transactions (id, user_id, type, date, amount, category_id, payment_method_id, from_account_id, to_account_id, shop_name, note, is_settled, scheduled_withdrawal_date)
      VALUES
        ('tx-001', '${userId}', 'expense', '2026-08-16', 3480, 'cat-food', 'pm-rakuten-01', NULL, NULL, 'スーパーマルエツ', '野菜・お肉まとめ買い', FALSE, '2026-09-27'),
        ('tx-002', '${userId}', 'expense', '2026-08-15', 12500, 'cat-util', 'pm-debit-01', NULL, NULL, '東京電力 (電気代)', '8月分電気料金', TRUE, NULL),
        ('tx-003', '${userId}', 'expense', '2026-08-14', 650, 'cat-dining', 'pm-paypay-01', NULL, NULL, 'スターバックス', 'カフェラテ', TRUE, NULL),
        ('tx-004', '${userId}', 'expense', '2026-08-13', 2800, 'cat-daily', 'pm-rakuten-01', NULL, NULL, 'マツモトキヨシ', '洗剤・ティッシュ', FALSE, '2026-09-27'),
        ('tx-005', '${userId}', 'transfer', '2026-08-10', 30000, 'cat-invest', NULL, 'acc-bank-01', 'acc-nisa-01', 'NISA定期積立', '毎月10日自動振替', TRUE, NULL)
      ON CONFLICT (id) DO NOTHING;

      -- 操作ログ
      INSERT INTO "${schemaName}".audit_logs (id, user_id, operator_user_id, action, entity_type, entity_id, summary)
      VALUES
        ('log-001', '${userId}', '${userId}', 'CREATE', 'transaction', 'tx-001', 'スーパーマルエツにて食費 ¥3,480 登録')
      ON CONFLICT (id) DO NOTHING;
    `);

    logger.info("🎉 Database seeding completed successfully!");
    logger.info(`🔑 Demo Admin Login: ${adminEmail} / ${adminPass}`);
  } catch (error) {
    logger.error({ error }, "❌ Seeding failed");
    throw error;
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
