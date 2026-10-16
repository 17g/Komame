import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { masterDb, getTenantDb } from "@/db";
import { systemSettings } from "@/db/schema/master";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { PasswordPolicyConfig, SystemSettingsConfig } from "@/types";

const DEFAULT_SETTINGS: SystemSettingsConfig = {
  currencySymbol: "¥",
  dateFormat: "YYYY/MM/DD",
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
  },
};

// 1. システム設定取得 (GET /api/admin/settings)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const records = await masterDb
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.householdId, session.activeHouseholdId));

    const settings: SystemSettingsConfig = { ...DEFAULT_SETTINGS };

    for (const record of records) {
      if (record.key === "currency_symbol" && record.valueJson) {
        const val = record.valueJson as { value?: string };
        if (typeof val.value === "string") {
          settings.currencySymbol = val.value;
        }
      } else if (record.key === "date_format" && record.valueJson) {
        const val = record.valueJson as { value?: string };
        if (typeof val.value === "string") {
          settings.dateFormat = val.value;
        }
      } else if (record.key === "password_policy" && record.valueJson) {
        const val = record.valueJson as Partial<PasswordPolicyConfig>;
        settings.passwordPolicy = {
          minLength: typeof val.minLength === "number" ? val.minLength : DEFAULT_SETTINGS.passwordPolicy.minLength,
          requireUppercase:
            typeof val.requireUppercase === "boolean"
              ? val.requireUppercase
              : DEFAULT_SETTINGS.passwordPolicy.requireUppercase,
          requireLowercase:
            typeof val.requireLowercase === "boolean"
              ? val.requireLowercase
              : DEFAULT_SETTINGS.passwordPolicy.requireLowercase,
          requireNumbers:
            typeof val.requireNumbers === "boolean"
              ? val.requireNumbers
              : DEFAULT_SETTINGS.passwordPolicy.requireNumbers,
          requireSpecialChars:
            typeof val.requireSpecialChars === "boolean"
              ? val.requireSpecialChars
              : DEFAULT_SETTINGS.passwordPolicy.requireSpecialChars,
        };
      }
    }

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error({ error }, "Error fetching system settings");
    return NextResponse.json({ error: "システム設定の取得に失敗しました。" }, { status: 500 });
  }
}

// 2. システム設定更新 (PUT /api/admin/settings)
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { currencySymbol, dateFormat, passwordPolicy } = body;

    // バリデーション
    const validCurrency = typeof currencySymbol === "string" && currencySymbol.trim().length > 0 && currencySymbol.trim().length <= 5
      ? currencySymbol.trim()
      : "¥";

    const allowedDateFormats = ["YYYY/MM/DD", "YYYY-MM-DD", "YYYY.MM.DD"];
    const validDateFormat = allowedDateFormats.includes(dateFormat) ? dateFormat : "YYYY/MM/DD";

    let validPasswordPolicy: PasswordPolicyConfig = { ...DEFAULT_SETTINGS.passwordPolicy };
    if (passwordPolicy && typeof passwordPolicy === "object") {
      const minLen = Number(passwordPolicy.minLength);
      validPasswordPolicy = {
        minLength: !isNaN(minLen) && minLen >= 4 && minLen <= 32 ? minLen : 8,
        requireUppercase: Boolean(passwordPolicy.requireUppercase),
        requireLowercase: Boolean(passwordPolicy.requireLowercase),
        requireNumbers: Boolean(passwordPolicy.requireNumbers),
        requireSpecialChars: Boolean(passwordPolicy.requireSpecialChars),
      };
    }

    // 各設定キーの保存 (UPSERT)
    const settingsToSave: { key: string; valueJson: Record<string, unknown> }[] = [
      { key: "currency_symbol", valueJson: { value: validCurrency } },
      { key: "date_format", valueJson: { value: validDateFormat } },
      { key: "password_policy", valueJson: validPasswordPolicy as unknown as Record<string, unknown> },
    ];

    for (const item of settingsToSave) {
      const [existing] = await masterDb
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.householdId, session.activeHouseholdId),
            eq(systemSettings.key, item.key)
          )
        )
        .limit(1);

      if (existing) {
        await masterDb
          .update(systemSettings)
          .set({
            valueJson: item.valueJson,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing.id));
      } else {
        await masterDb.insert(systemSettings).values({
          id: `set_${crypto.randomUUID().replace(/-/g, "")}`,
          householdId: session.activeHouseholdId,
          key: item.key,
          valueJson: item.valueJson,
        });
      }
    }

    // 監査ログ記録
    try {
      const { db, schema } = getTenantDb(session.schemaName);
      await db.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "UPDATE",
        entityType: "system_settings",
        summary: `システム設定を更新しました (通貨: ${validCurrency}, 日付形式: ${validDateFormat}, パスワード最小文字数: ${validPasswordPolicy.minLength})`,
      });
    } catch (auditErr) {
      logger.warn({ auditErr }, "Failed to record audit log for settings update");
    }

    const updatedSettings: SystemSettingsConfig = {
      currencySymbol: validCurrency,
      dateFormat: validDateFormat,
      passwordPolicy: validPasswordPolicy,
    };

    return NextResponse.json({
      success: true,
      message: "システム設定を保存しました。",
      settings: updatedSettings,
    });
  } catch (error) {
    logger.error({ error }, "Error updating system settings");
    return NextResponse.json({ error: "システム設定の保存に失敗しました。" }, { status: 500 });
  }
}
