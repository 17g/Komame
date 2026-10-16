import { NextRequest, NextResponse } from "next/server";
import { masterDb } from "@/db";
import { users, households, householdMemberships } from "@/db/schema/master";
import { eq, and } from "drizzle-orm";
import { verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "メールアドレスとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    // 1. ユーザー検索
    const [user] = await masterDb
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
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

    // 3. デフォルト所属世帯の取得
    const [membership] = await masterDb
      .select({
        householdId: householdMemberships.householdId,
        role: householdMemberships.role,
        schemaName: households.schemaName,
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

    // 4. セッショントークン発行 & Cookie設定
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      activeHouseholdId: membership.householdId,
      schemaName: membership.schemaName,
      role: membership.role as "admin" | "member",
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
        householdId: membership.householdId,
      },
    });
  } catch (error) {
    logger.error({ error }, "Login error");
    return NextResponse.json({ error: "ログイン処理中にエラーが発生しました。" }, { status: 500 });
  }
}
