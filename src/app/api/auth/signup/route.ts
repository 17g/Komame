import { NextRequest, NextResponse } from "next/server";
import { masterDb, assertValidSchemaName } from "@/db";
import { users, households, householdMemberships } from "@/db/schema/master";
import { eq } from "drizzle-orm";
import { hashPassword, validatePasswordPolicy, isDemoAdminAllowed } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getClientIp,
  checkRateLimit,
  createRateLimitResponse,
  AUTH_RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // 0. IP 単位のレートリミット検証 (連続申請 DoS 防御)
    const clientIp = getClientIp(req);
    const ipRateLimit = checkRateLimit(`signup:ip:${clientIp}`, AUTH_RATE_LIMITS.signupByIp);
    if (!ipRateLimit.success) {
      logger.warn({ ip: clientIp }, "Signup rate limit exceeded for IP");
      return createRateLimitResponse(
        ipRateLimit,
        "短時間に多数のアカウント作成リクエストが行われました。しばらく待ってから再試行してください。"
      );
    }

    const { email, password, householdName } = await req.json();

    if (
      !email ||
      !password ||
      !householdName ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      typeof householdName !== "string"
    ) {
      return NextResponse.json(
        { error: "すべての項目（メールアドレス、パスワード、世帯名）を入力してください。" },
        { status: 400 }
      );
    }

    const trimmedHouseholdName = householdName.trim();
    if (trimmedHouseholdName.length === 0 || trimmedHouseholdName.length > 100) {
      return NextResponse.json(
        { error: "世帯名は1文字以上100文字以内で入力してください。" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください。" },
        { status: 400 }
      );
    }

    // 本番環境における初期デモ管理者メールアドレスでの登録申請禁止 (要件 1-9)
    if (!isDemoAdminAllowed(normalizedEmail)) {
      return NextResponse.json(
        { error: "このメールアドレスは使用できません。" },
        { status: 400 }
      );
    }

    // 1. パスワードポリシー検証
    const validation = validatePasswordPolicy(password);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
    }

    // 2. メール重複チェック
    const [existing] = await masterDb.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています。" },
        { status: 409 }
      );
    }

    // 3. ID 採番 & スキーマ名ホワイトリスト検証
    const userId = `usr_${crypto.randomUUID().replace(/-/g, "")}`;
    const householdId = `hh_${crypto.randomUUID().replace(/-/g, "")}`;
    const schemaName = `tenant_${householdId}`;
    assertValidSchemaName(schemaName);

    // 4. パスワードハッシュ化 (Argon2id)
    const passwordHash = await hashPassword(password);

    // 5. マスタDB (public) のみに承認待ち状態で登録 (テナントスキーマ・セッションはシステム管理者承認時に作成)
    await masterDb.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        themePreference: "natural_komame",
        isSuperAdmin: false,
        isActive: true,
      });

      await tx.insert(households).values({
        id: householdId,
        name: trimmedHouseholdName,
        schemaName,
        status: "pending",
      });

      await tx.insert(householdMemberships).values({
        id: `mem_${crypto.randomUUID().replace(/-/g, "")}`,
        userId,
        householdId,
        role: "admin", // 最初の申請者は承認後に家庭管理者となる
        status: "active",
        isDefault: true,
      });
    });

    logger.info(
      { userId, email: normalizedEmail, householdId, status: "pending" },
      "New household signup application submitted"
    );

    return NextResponse.json(
      {
        success: true,
        pendingApproval: true,
        message:
          "新規世帯登録の申請を受け付けました。システム管理者の承認後にログインできるようになります。",
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, "Signup error");
    return NextResponse.json({ error: "登録処理中にエラーが発生しました。" }, { status: 500 });
  }
}
