import { NextRequest, NextResponse } from "next/server";
import { masterDb } from "@/db";
import { users, households, householdMemberships } from "@/db/schema/master";
import { eq, and } from "drizzle-orm";
import {
  verifyInviteToken,
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  getHouseholdPasswordPolicy,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { logger } from "@/lib/logger";

// 招待トークンの検証 (GET /api/auth/invite?token=...)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "招待トークンが指定されていません。" }, { status: 400 });
    }

    const payload = await verifyInviteToken(token);
    if (!payload || !payload.householdId) {
      return NextResponse.json(
        { error: "招待リンクが無効であるか、有効期限が切れています。" },
        { status: 400 }
      );
    }

    const [household] = await masterDb
      .select()
      .from(households)
      .where(eq(households.id, payload.householdId))
      .limit(1);

    if (!household) {
      return NextResponse.json({ error: "招待元の世帯が見つかりません。" }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      householdId: household.id,
      householdName: household.name,
      role: payload.role,
    });
  } catch (error) {
    logger.error({ error }, "Error validating invite token");
    return NextResponse.json({ error: "招待情報の確認中にエラーが発生しました。" }, { status: 500 });
  }
}

// 招待による参加・登録 (POST /api/auth/invite)
export async function POST(req: NextRequest) {
  try {
    const { token, email, password } = await req.json();

    if (!token || !email || !password) {
      return NextResponse.json(
        { error: "すべての項目（招待トークン、メールアドレス、パスワード）を入力してください。" },
        { status: 400 }
      );
    }

    const payload = await verifyInviteToken(token);
    if (!payload || !payload.householdId) {
      return NextResponse.json(
        { error: "招待リンクが無効であるか、有効期限が切れています。" },
        { status: 400 }
      );
    }

    const [household] = await masterDb
      .select()
      .from(households)
      .where(eq(households.id, payload.householdId))
      .limit(1);

    if (!household) {
      return NextResponse.json({ error: "招待元の世帯が見つかりません。" }, { status: 404 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 既存ユーザーの検索
    const [existingUser] = await masterDb
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let userId: string;

    if (existingUser) {
      // 既存ユーザーの場合はパスワード突合
      const isValid = await verifyPassword(existingUser.passwordHash, password);
      if (!isValid) {
        return NextResponse.json(
          { error: "既存アカウントのパスワードと一致しません。" },
          { status: 401 }
        );
      }
      userId = existingUser.id;

      // 世帯所属の確認
      const [existingMem] = await masterDb
        .select()
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.userId, userId),
            eq(householdMemberships.householdId, household.id)
          )
        )
        .limit(1);

      if (existingMem) {
        if (existingMem.status === "active") {
          return NextResponse.json(
            { error: "既にこの世帯に参加しています。" },
            { status: 400 }
          );
        }
        // 再有効化
        await masterDb
          .update(householdMemberships)
          .set({ status: "active", role: payload.role })
          .where(eq(householdMemberships.id, existingMem.id));
      } else {
        // 新規メンバーシップ追加
        await masterDb.insert(householdMemberships).values({
          id: `mem_${crypto.randomUUID().replace(/-/g, "")}`,
          userId,
          householdId: household.id,
          role: payload.role,
          status: "active",
          isDefault: false,
        });
      }
    } else {
      // 新規ユーザー登録 (招待元世帯のカスタムパスワードポリシーを強制適用: VULN-10)
      const policy = await getHouseholdPasswordPolicy(household.id);
      const pwdValidation = validatePasswordPolicy(password, policy);
      if (!pwdValidation.isValid) {
        return NextResponse.json({ error: pwdValidation.errors.join(" ") }, { status: 400 });
      }

      const passwordHash = await hashPassword(password);
      userId = `usr_${crypto.randomUUID().replace(/-/g, "")}`;

      await masterDb.insert(users).values({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        themePreference: "natural_komame",
        isSuperAdmin: false,
        isActive: true,
      });

      await masterDb.insert(householdMemberships).values({
        id: `mem_${crypto.randomUUID().replace(/-/g, "")}`,
        userId,
        householdId: household.id,
        role: payload.role,
        status: "active",
        isDefault: true,
      });
    }

    // セッショントークン発行
    const sessionToken = await createSessionToken({
      userId,
      email: normalizedEmail,
      activeHouseholdId: household.id,
      schemaName: household.schemaName,
      role: payload.role,
    });

    await setSessionCookie(sessionToken);

    return NextResponse.json({
      success: true,
      message: `${household.name} に参加しました！`,
      user: {
        id: userId,
        email: normalizedEmail,
        householdId: household.id,
        householdName: household.name,
        role: payload.role,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error accepting invite");
    return NextResponse.json({ error: "招待参加処理中にエラーが発生しました。" }, { status: 500 });
  }
}
