import { NextRequest, NextResponse } from "next/server";
import { masterDb } from "@/db";
import { users, households, householdMemberships } from "@/db/schema/master";
import { eq, and } from "drizzle-orm";
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
  getHouseholdAccessError,
  isDemoAdminAllowed,
} from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getClientIp,
  checkRateLimit,
  createRateLimitResponse,
  AUTH_RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // 0. IP 単位のレートリミット検証
    const clientIp = getClientIp(req);
    const ipRateLimit = checkRateLimit(`login:ip:${clientIp}`, AUTH_RATE_LIMITS.loginByIp);
    if (!ipRateLimit.success) {
      logger.warn({ ip: clientIp }, "Login rate limit exceeded for IP");
      return createRateLimitResponse(
        ipRateLimit,
        "短時間に多数のログイン試行が行われました。しばらく待ってから再試行してください。"
      );
    }

    const { email, password } = await req.json();

    if (!email || !password || typeof email !== "string") {
      return NextResponse.json(
        { error: "メールアドレスとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 0.1 アカウント（メールアドレス）単位のレートリミット検証 (ブルートフォース防御)
    const accountRateLimit = checkRateLimit(
      `login:acc:${normalizedEmail}`,
      AUTH_RATE_LIMITS.loginByAccount
    );
    if (!accountRateLimit.success) {
      logger.warn({ ip: clientIp, email: normalizedEmail }, "Login rate limit exceeded for account");
      return createRateLimitResponse(
        accountRateLimit,
        "このアカウントに対するログイン試行回数が上限に達しました。しばらく待ってから再試行してください。"
      );
    }

    // 0.2 本番環境における初期デモ管理者アカウント（メールアドレス）のログイン無条件拒否 (要件 1-9)
    if (!isDemoAdminAllowed(normalizedEmail)) {
      logger.warn({ ip: clientIp, email: normalizedEmail }, "Blocked demo admin login attempt in production");
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません。" },
        { status: 401 }
      );
    }

    // 1. ユーザー検索
    const [user] = await masterDb
      .select()
      .from(users)
      .where(and(eq(users.email, normalizedEmail), eq(users.isActive, true)))
      .limit(1);

    if (!user || !isDemoAdminAllowed(user.id) || !isDemoAdminAllowed(user.email)) {
      if (user) {
        logger.warn({ ip: clientIp, userId: user.id }, "Blocked demo admin login attempt by user ID in production");
      }
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません。" },
        { status: 401 }
      );
    }

    // 2. パスワード検証 (Argon2id)
    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません。" },
        { status: 401 }
      );
    }

    // 3. デフォルト所属世帯の取得および承認ステータス検証
    const [membership] = await masterDb
      .select({
        householdId: householdMemberships.householdId,
        role: householdMemberships.role,
        schemaName: households.schemaName,
        householdStatus: households.status,
      })
      .from(householdMemberships)
      .innerJoin(households, eq(householdMemberships.householdId, households.id))
      .where(
        and(
          eq(householdMemberships.userId, user.id),
          eq(householdMemberships.status, "active"),
          eq(householdMemberships.isDefault, true)
        )
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: "所属している有効な世帯が見つかりません。" },
        { status: 403 }
      );
    }

    const accessError = getHouseholdAccessError(membership.householdStatus);
    if (accessError) {
      return NextResponse.json({ error: accessError }, { status: 403 });
    }

    // 4. セッショントークン発行 & Cookie設定
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      activeHouseholdId: membership.householdId,
      schemaName: membership.schemaName,
      role: membership.role as "admin" | "member",
      isSuperAdmin: Boolean(user.isSuperAdmin),
    });

    await setSessionCookie(token);

    logger.info({ userId: user.id, email: user.email }, "User logged in successfully");

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        themePreference: user.themePreference,
        role: membership.role,
        isSuperAdmin: Boolean(user.isSuperAdmin),
        householdId: membership.householdId,
      },
    });
  } catch (error) {
    logger.error({ error }, "Login error");
    return NextResponse.json({ error: "ログイン処理中にエラーが発生しました。" }, { status: 500 });
  }
}
