import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, hashPassword, validatePasswordPolicy, getHouseholdPasswordPolicy, createInviteToken, isDemoAdminAllowed } from "@/lib/auth";
import { masterDb, getTenantDb } from "@/db";
import { users, householdMemberships } from "@/db/schema/master";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

// 1. 家族メンバー一覧取得 (GET /api/admin/members)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const rawMembers = await masterDb
      .select({
        id: householdMemberships.id,
        userId: users.id,
        email: users.email,
        role: householdMemberships.role,
        status: householdMemberships.status,
        joinedAt: householdMemberships.joinedAt,
      })
      .from(householdMemberships)
      .innerJoin(users, eq(householdMemberships.userId, users.id))
      .where(eq(householdMemberships.householdId, session.activeHouseholdId));

    const members = rawMembers.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.email,
      role: m.role as "admin" | "member",
      status: m.status as "active" | "inactive",
      joinedAt: m.joinedAt.toISOString(),
      isCurrentUser: m.userId === session.userId,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    logger.error({ error }, "Error fetching members");
    return NextResponse.json({ error: "メンバー一覧の取得に失敗しました。" }, { status: 500 });
  }
}

// 2. メンバー招待・直接登録・招待リンク発行・パスワードリセット (POST /api/admin/members)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // A. 招待リンク単体発行
    if (action === "create_invite_link") {
      const inviteRole = body.role === "admin" ? "admin" : "member";
      const token = await createInviteToken({
        householdId: session.activeHouseholdId,
        role: inviteRole,
      });

      return NextResponse.json({
        success: true,
        token,
        inviteLink: `/invite?token=${token}`,
      });
    }

    // B. パスワードリセット
    if (action === "reset_password") {
      const { membershipId, newPassword } = body;
      if (!membershipId || !newPassword) {
        return NextResponse.json(
          { error: "メンバーIDと新しいパスワードを入力してください。" },
          { status: 400 }
        );
      }

      const policy = await getHouseholdPasswordPolicy(session.activeHouseholdId);
      const pwdValidation = validatePasswordPolicy(newPassword, policy);
      if (!pwdValidation.isValid) {
        return NextResponse.json({ error: pwdValidation.errors.join(" ") }, { status: 400 });
      }

      const [targetMem] = await masterDb
        .select({
          id: householdMemberships.id,
          userId: householdMemberships.userId,
          email: users.email,
        })
        .from(householdMemberships)
        .innerJoin(users, eq(householdMemberships.userId, users.id))
        .where(
          and(
            eq(householdMemberships.id, membershipId),
            eq(householdMemberships.householdId, session.activeHouseholdId)
          )
        )
        .limit(1);

      if (!targetMem) {
        return NextResponse.json({ error: "対象のメンバーが見つかりません。" }, { status: 404 });
      }

      // 他世帯にも所属しているかの検証（クロス世帯乗っ取り防止: VULN-02）
      const otherMemberships = await masterDb
        .select({ count: sql<number>`count(*)` })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.userId, targetMem.userId),
            sql`${householdMemberships.householdId} != ${session.activeHouseholdId}`
          )
        );

      const otherCount = Number(otherMemberships[0]?.count || 0);
      if (otherCount > 0) {
        return NextResponse.json(
          {
            error:
              "対象のユーザーは複数の世帯に所属しているため、管理者によるパスワードの直接上書きはできません。ユーザー本人にパスワード変更を依頼してください。",
          },
          { status: 403 }
        );
      }

      const newHash = await hashPassword(newPassword);
      await masterDb
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, targetMem.userId));

      // 監査ログ記録
      const { db, schema } = getTenantDb(session.schemaName);
      await db.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "UPDATE",
        entityType: "household_member",
        entityId: membershipId,
        summary: `メンバーのパスワードをリセットしました (${targetMem.email})`,
      });

      return NextResponse.json({
        success: true,
        message: `${targetMem.email} のパスワードをリセットしました。`,
      });
    }

    // C. 家族メンバーの招待・追加 (直接登録 / メール指定)
    const { email, password, role } = body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "有効なメールアドレスを入力してください。" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isDemoAdminAllowed(normalizedEmail)) {
      return NextResponse.json(
        { error: "このメールアドレスは使用できません。" },
        { status: 400 }
      );
    }
    const targetRole: "admin" | "member" = role === "admin" ? "admin" : "member";

    // 既存ユーザーの検索
    const [existingUser] = await masterDb
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const { db, schema } = getTenantDb(session.schemaName);

    if (existingUser) {
      // 世帯所属の確認
      const [existingMem] = await masterDb
        .select()
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.userId, existingUser.id),
            eq(householdMemberships.householdId, session.activeHouseholdId)
          )
        )
        .limit(1);

      if (existingMem) {
        if (existingMem.status === "active") {
          return NextResponse.json(
            { error: "このメールアドレスのユーザーは既にこの世帯のアクティブなメンバーです。" },
            { status: 400 }
          );
        }

        // 非アクティブメンバーの再有効化
        await masterDb
          .update(householdMemberships)
          .set({
            status: "active",
            role: targetRole,
          })
          .where(eq(householdMemberships.id, existingMem.id));

        await db.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "UPDATE",
          entityType: "household_member",
          entityId: existingMem.id,
          summary: `メンバーを再有効化しました (${normalizedEmail}, 権限: ${targetRole})`,
        });

        return NextResponse.json({
          success: true,
          message: `${normalizedEmail} を世帯メンバーとして再有効化しました。`,
        });
      }

      // 別世帯等の既存ユーザーの場合：直接追加せず、本人の認証・同意を求めるため招待リンクを発行 (VULN-02 & VULN-10)
      const inviteToken = await createInviteToken({
        householdId: session.activeHouseholdId,
        role: targetRole,
      });

      await db.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "CREATE",
        entityType: "household_member",
        entityId: existingUser.id,
        summary: `既存アカウントに対する世帯招待リンクを発行しました (${normalizedEmail}, 権限: ${targetRole})`,
      });

      return NextResponse.json({
        success: true,
        message: `${normalizedEmail} は既にKomameアカウントをお持ちです。世帯参加には本人の承認が必要です。招待リンクを共有してください。`,
        inviteLink: `/invite?token=${inviteToken}`,
        isExistingAccount: true,
      });
    }

    // 新規ユーザーとしての登録
    const policy = await getHouseholdPasswordPolicy(session.activeHouseholdId);
    const generatedLength = Math.max(12, policy.minLength);
    const initialPassword = password || `Km1!${crypto.randomUUID().replace(/-/g, "").slice(0, generatedLength - 4)}`;
    const pwdValidation = validatePasswordPolicy(initialPassword, policy);
    if (!pwdValidation.isValid) {
      return NextResponse.json({ error: pwdValidation.errors.join(" ") }, { status: 400 });
    }

    const passwordHash = await hashPassword(initialPassword);
    const newUserId = `usr_${crypto.randomUUID().replace(/-/g, "")}`;
    const newMembershipId = `mem_${crypto.randomUUID().replace(/-/g, "")}`;

    await masterDb.insert(users).values({
      id: newUserId,
      email: normalizedEmail,
      passwordHash,
      themePreference: "natural_komame",
      isSuperAdmin: false,
      isActive: true,
    });

    await masterDb.insert(householdMemberships).values({
      id: newMembershipId,
      userId: newUserId,
      householdId: session.activeHouseholdId,
      role: targetRole,
      status: "active",
      isDefault: true,
    });

    const inviteToken = await createInviteToken({
      householdId: session.activeHouseholdId,
      role: targetRole,
    });

    await db.insert(schema.auditLogs).values({
      id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: session.userId,
      operatorUserId: session.userId,
      action: "CREATE",
      entityType: "household_member",
      entityId: newMembershipId,
      summary: `家族メンバーを新規登録・招待しました (${normalizedEmail}, 権限: ${targetRole})`,
    });

    return NextResponse.json({
      success: true,
      message: `${normalizedEmail} を家族メンバーとして追加しました。`,
      initialPassword,
      inviteLink: `/invite?token=${inviteToken}`,
    });
  } catch (error) {
    logger.error({ error }, "Error creating/inviting member");
    return NextResponse.json({ error: "メンバー招待処理中にエラーが発生しました。" }, { status: 500 });
  }
}

// 3. メンバー情報・権限・状態更新 (PUT /api/admin/members)
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { membershipId, role, status } = await req.json();
    if (!membershipId) {
      return NextResponse.json({ error: "メンバーIDが指定されていません。" }, { status: 400 });
    }

    const [targetMem] = await masterDb
      .select({
        id: householdMemberships.id,
        userId: householdMemberships.userId,
        role: householdMemberships.role,
        status: householdMemberships.status,
        email: users.email,
      })
      .from(householdMemberships)
      .innerJoin(users, eq(householdMemberships.userId, users.id))
      .where(
        and(
          eq(householdMemberships.id, membershipId),
          eq(householdMemberships.householdId, session.activeHouseholdId)
        )
      )
      .limit(1);

    if (!targetMem) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません。" }, { status: 404 });
    }

    // ガードレール: 唯一の管理者をメンバーに降格、または非アクティブ化することは禁止
    if (
      (role === "member" || status === "inactive") &&
      targetMem.role === "admin" &&
      targetMem.status === "active"
    ) {
      const activeAdmins = await masterDb
        .select({ count: sql<number>`count(*)` })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.householdId, session.activeHouseholdId),
            eq(householdMemberships.role, "admin"),
            eq(householdMemberships.status, "active")
          )
        );

      const count = Number(activeAdmins[0]?.count || 0);
      if (count <= 1) {
        return NextResponse.json(
          { error: "世帯に最低1人の有効な管理者が存在する必要があります。降格または無効化できません。" },
          { status: 400 }
        );
      }
    }

    const updateFields: { role?: string; status?: string } = {};
    if (role && (role === "admin" || role === "member")) {
      updateFields.role = role;
    }
    if (status && (status === "active" || status === "inactive")) {
      updateFields.status = status;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "更新項目が指定されていません。" }, { status: 400 });
    }

    await masterDb
      .update(householdMemberships)
      .set(updateFields)
      .where(eq(householdMemberships.id, membershipId));

    // 監査ログ記録
    const { db, schema } = getTenantDb(session.schemaName);
    await db.insert(schema.auditLogs).values({
      id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: session.userId,
      operatorUserId: session.userId,
      action: "UPDATE",
      entityType: "household_member",
      entityId: membershipId,
      summary: `メンバー情報を更新しました (${targetMem.email}: 権限=${updateFields.role || targetMem.role}, 状態=${updateFields.status || targetMem.status})`,
    });

    return NextResponse.json({
      success: true,
      message: `${targetMem.email} のメンバー情報を更新しました。`,
    });
  } catch (error) {
    logger.error({ error }, "Error updating member");
    return NextResponse.json({ error: "メンバー情報の更新中にエラーが発生しました。" }, { status: 500 });
  }
}

// 4. メンバー無効化 (論理削除) (DELETE /api/admin/members?membershipId=...)
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const membershipId = searchParams.get("membershipId");
    if (!membershipId) {
      return NextResponse.json({ error: "メンバーIDが指定されていません。" }, { status: 400 });
    }

    const [targetMem] = await masterDb
      .select({
        id: householdMemberships.id,
        userId: householdMemberships.userId,
        role: householdMemberships.role,
        status: householdMemberships.status,
        email: users.email,
      })
      .from(householdMemberships)
      .innerJoin(users, eq(householdMemberships.userId, users.id))
      .where(
        and(
          eq(householdMemberships.id, membershipId),
          eq(householdMemberships.householdId, session.activeHouseholdId)
        )
      )
      .limit(1);

    if (!targetMem) {
      return NextResponse.json({ error: "対象のメンバーが見つかりません。" }, { status: 404 });
    }

    // ガードレール: ログイン中の自身を無効化することは禁止
    if (targetMem.userId === session.userId) {
      return NextResponse.json(
        { error: "ログイン中の自身のアカウントを無効化することはできません。" },
        { status: 400 }
      );
    }

    // ガードレール: 最後の有効な管理者の無効化禁止
    if (targetMem.role === "admin" && targetMem.status === "active") {
      const activeAdmins = await masterDb
        .select({ count: sql<number>`count(*)` })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.householdId, session.activeHouseholdId),
            eq(householdMemberships.role, "admin"),
            eq(householdMemberships.status, "active")
          )
        );

      const count = Number(activeAdmins[0]?.count || 0);
      if (count <= 1) {
        return NextResponse.json(
          { error: "世帯に最低1人の有効な管理者が存在する必要があります。無効化できません。" },
          { status: 400 }
        );
      }
    }

    // 論理削除（status を inactive に設定）
    await masterDb
      .update(householdMemberships)
      .set({ status: "inactive" })
      .where(eq(householdMemberships.id, membershipId));

    // 監査ログ記録
    const { db, schema } = getTenantDb(session.schemaName);
    await db.insert(schema.auditLogs).values({
      id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: session.userId,
      operatorUserId: session.userId,
      action: "DELETE",
      entityType: "household_member",
      entityId: membershipId,
      summary: `家族メンバーを無効化（論理削除）しました (${targetMem.email})`,
    });

    return NextResponse.json({
      success: true,
      message: `${targetMem.email} を無効化しました。`,
    });
  } catch (error) {
    logger.error({ error }, "Error deactivating member");
    return NextResponse.json({ error: "メンバー無効化処理中にエラーが発生しました。" }, { status: 500 });
  }
}
