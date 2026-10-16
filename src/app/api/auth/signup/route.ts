import { NextRequest, NextResponse } from "next/server";
import { masterDb, getTenantDb } from "@/db";
import { users, households, householdMemberships, systemSettings } from "@/db/schema/master";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  validatePasswordPolicy,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { createTenantTables } from "@/db/migrate";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { email, password, householdName } = await req.json();

    if (!email || !password || !householdName) {
      return NextResponse.json(
        { error: "すべての項目（メールアドレス、パスワード、世帯名）を入力してください。" },
        { status: 400 }
      );
    }

    // 1. パスワードポリシー検証
    const validation = validatePasswordPolicy(password);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
    }

    // 2. メール重複チェック
    const [existing] = await masterDb.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています。" },
        { status: 409 }
      );
    }

    // 3. ID 採番
    const userId = `usr_${crypto.randomUUID().replace(/-/g, "")}`;
    const householdId = `hh_${crypto.randomUUID().replace(/-/g, "")}`;
    const schemaName = `tenant_${householdId}`;

    // 4. パスワードハッシュ化 (Argon2id)
    const passwordHash = await hashPassword(password);

    // 5. テナント専用スキーマとテーブルを動的自動作成
    await createTenantTables(schemaName);

    // 6. マスタDBレコード作成
    await masterDb.insert(users).values({
      id: userId,
      email,
      passwordHash,
      themePreference: "natural_komame",
      isSuperAdmin: false,
      isActive: true,
    });

    await masterDb.insert(households).values({
      id: householdId,
      name: householdName,
      schemaName,
    });

    await masterDb.insert(householdMemberships).values({
      id: `mem_${crypto.randomUUID().replace(/-/g, "")}`,
      userId,
      householdId,
      role: "admin", // 最初の作成者は家庭管理者
      status: "active",
      isDefault: true,
    });

    // 7. システム設定初期化
    await masterDb.insert(systemSettings).values([
      {
        id: `sys_cur_${crypto.randomUUID().replace(/-/g, "")}`,
        householdId,
        key: "currency_symbol",
        valueJson: '"¥"',
      },
      {
        id: `sys_date_${crypto.randomUUID().replace(/-/g, "")}`,
        householdId,
        key: "date_format",
        valueJson: '"YYYY/MM/DD"',
      },
      {
        id: `sys_pwd_${crypto.randomUUID().replace(/-/g, "")}`,
        householdId,
        key: "password_policy",
        valueJson: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
        },
      },
    ]);

    // 8. テナント専用DBへ日本の標準費目マスターを初期シード
    const { db, schema } = getTenantDb(schemaName);
    const standardCategories = [
      { id: `cat_food_${householdId}`, name: "食費 (食材・自炊)", icon: "🥦", color: "#2E7D32", sortOrder: 1 },
      { id: `cat_dining_${householdId}`, name: "外食・カフェ", icon: "☕", color: "#D97706", sortOrder: 2 },
      { id: `cat_daily_${householdId}`, name: "日用品・生活雑貨", icon: "🧻", color: "#059669", sortOrder: 3 },
      { id: `cat_house_${householdId}`, name: "住居費 (家賃・住宅ローン)", icon: "🏠", color: "#4F46E5", sortOrder: 4 },
      { id: `cat_util_${householdId}`, name: "水道光熱費", icon: "⚡", color: "#0284C7", sortOrder: 5 },
      { id: `cat_comm_${householdId}`, name: "通信費 (スマホ・ネット)", icon: "📱", color: "#7C3AED", sortOrder: 6 },
      { id: `cat_trans_${householdId}`, name: "交通費 (電車・ガソリン)", icon: "🚆", color: "#2563EB", sortOrder: 7 },
      { id: `cat_fun_${householdId}`, name: "教養・娯楽・趣味", icon: "🎮", color: "#DB2777", sortOrder: 8 },
      { id: `cat_med_${householdId}`, name: "医療・保険", icon: "💊", color: "#DC2626", sortOrder: 9 },
      { id: `cat_cloth_${householdId}`, name: "衣服・美容", icon: "👕", color: "#EA580C", sortOrder: 10 },
      { id: `cat_spec_${householdId}`, name: "特別費 (旅行・冠婚葬祭)", icon: "🎁", color: "#9333EA", sortOrder: 11 },
      { id: `cat_invest_${householdId}`, name: "貯蓄・投資 (NISA等)", icon: "🌱", color: "#16A34A", sortOrder: 12 },
    ];

    await db.insert(schema.categories).values(standardCategories);

    // 9. デフォルト現金口座を作成
    await db.insert(schema.accounts).values({
      id: `acc_cash_${householdId}`,
      name: "手元現金 (財布)",
      type: "cash",
      balance: 0,
      icon: "💵",
      color: "#E6A15C",
      sortOrder: 1,
      isActive: true,
    });

    // 10. セッショントークン発行 & Cookie設定
    const token = await createSessionToken({
      userId,
      email,
      activeHouseholdId: householdId,
      schemaName,
      role: "admin",
    });

    await setSessionCookie(token);

    logger.info({ userId, email, householdId, schemaName }, "New household signup completed");

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        themePreference: "natural_komame",
        role: "admin",
        householdId,
      },
    });
  } catch (error) {
    logger.error({ error }, "Signup error");
    return NextResponse.json({ error: "登録処理中にエラーが発生しました。" }, { status: 500 });
  }
}
