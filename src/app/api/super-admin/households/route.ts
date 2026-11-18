import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, SessionPayload } from "@/lib/auth";
import { masterDb, getTenantDb, assertValidSchemaName } from "@/db";
import {
  users,
  households,
  householdMemberships,
  systemSettings,
} from "@/db/schema/master";
import { createTenantTables } from "@/db/migrate";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { HouseholdStatus, ManagedHouseholdItem } from "@/types";
import {
  STANDARD_CATEGORY_TEMPLATES,
  DEFAULT_HOUSEHOLD_SETTINGS,
  isValidStatusFilter,
  isValidSuperAdminAction,
  normalizeReasonInput,
  buildHouseholdCounts,
  validateSuperAdminHouseholdTransition,
  validateSuperAdminHouseholdDeletion,
} from "@/lib/super-admin-helpers";

/**
 * 現在のセッションおよび DB 上の Super Admin 権限をリアルタイム検証する
 */
async function requireSuperAdminSession(): Promise<
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "認証が必要です。" }, { status: 401 }),
    };
  }

  const [dbUser] = await masterDb
    .select({
      id: users.id,
      isSuperAdmin: users.isSuperAdmin,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!dbUser || !dbUser.isActive || !dbUser.isSuperAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "システム管理者（Super Admin）権限が必要です。" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session };
}

/**
 * 承認された世帯向けにテナントスキーマ・テーブルおよび初期データを冪等に構築する
 */
async function seedApprovedHouseholdDefaults(
  householdId: string,
  schemaName: string
): Promise<void> {
  assertValidSchemaName(schemaName);

  // 1. テナント専用スキーマおよびテーブルの作成（IF NOT EXISTS により冪等）
  await createTenantTables(schemaName);

  // 2. マスタDB上のシステム設定（通貨・日付形式・パスワードポリシー）を冪等投入
  for (const setting of DEFAULT_HOUSEHOLD_SETTINGS) {
    const [existing] = await masterDb
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.householdId, householdId),
          eq(systemSettings.key, setting.key)
        )
      )
      .limit(1);

    if (!existing) {
      await masterDb.insert(systemSettings).values({
        id: `set_${crypto.randomUUID().replace(/-/g, "")}`,
        householdId,
        key: setting.key,
        valueJson: setting.valueJson,
      });
    }
  }

  // 3. テナント専用DBへ標準12費目マスターを冪等投入
  const { db, schema } = getTenantDb(schemaName);
  const standardCategories = STANDARD_CATEGORY_TEMPLATES.map((tpl) => ({
    id: `cat_${tpl.key}_${householdId}`,
    name: tpl.name,
    icon: tpl.icon,
    color: tpl.color,
    sortOrder: tpl.sortOrder,
    isSystem: true,
    isArchived: false,
  }));

  await db
    .insert(schema.categories)
    .values(standardCategories)
    .onConflictDoNothing({ target: schema.categories.id });

  // 4. デフォルト現金口座を冪等投入（既存口座が0件の場合のみ作成）
  const existingAccounts = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .limit(1);

  if (existingAccounts.length === 0) {
    await db
      .insert(schema.accounts)
      .values({
        id: `acc_cash_${householdId}`,
        name: "手元現金 (財布)",
        type: "cash",
        balance: 0,
        icon: "💵",
        color: "#E6A15C",
        sortOrder: 1,
        isActive: true,
      })
      .onConflictDoNothing({ target: schema.accounts.id });
  }
}

/**
 * 1. 世帯申請・登録済みアカウント一覧取得 (GET /api/super-admin/households)
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const rawStatus = req.nextUrl.searchParams.get("status");
    const statusFilter = rawStatus === null || rawStatus === "" ? "all" : rawStatus;

    if (!isValidStatusFilter(statusFilter)) {
      return NextResponse.json(
        { error: "無効なステータスフィルターが指定されました。" },
        { status: 400 }
      );
    }

    const allHouseholds = await masterDb
      .select()
      .from(households)
      .orderBy(desc(households.createdAt));

    const memberships = await masterDb
      .select({
        householdId: householdMemberships.householdId,
        userId: users.id,
        email: users.email,
        role: householdMemberships.role,
        joinedAt: householdMemberships.joinedAt,
      })
      .from(householdMemberships)
      .innerJoin(users, eq(householdMemberships.userId, users.id))
      .orderBy(asc(householdMemberships.joinedAt));

    // 各世帯の代表申請者（最古の admin、なければ最古のメンバー）を特定
    const applicantByHousehold = new Map<
      string,
      { userId: string; email: string; isAdmin: boolean }
    >();

    for (const m of memberships) {
      const existing = applicantByHousehold.get(m.householdId);
      const isAdmin = m.role === "admin";
      if (!existing || (!existing.isAdmin && isAdmin)) {
        applicantByHousehold.set(m.householdId, {
          userId: m.userId,
          email: m.email,
          isAdmin,
        });
      }
    }

    const mappedHouseholds: ManagedHouseholdItem[] = allHouseholds.map((hh) => {
      const applicant = applicantByHousehold.get(hh.id);
      return {
        id: hh.id,
        name: hh.name,
        schemaName: hh.schemaName,
        status: hh.status as HouseholdStatus,
        applicantEmail: applicant?.email ?? null,
        applicantUserId: applicant?.userId ?? null,
        createdAt: hh.createdAt.toISOString(),
        reviewedAt: hh.reviewedAt ? hh.reviewedAt.toISOString() : null,
        reviewedBy: hh.reviewedBy ?? null,
        rejectionReason: hh.rejectionReason ?? null,
      };
    });

    const counts = buildHouseholdCounts(mappedHouseholds);
    const filteredHouseholds =
      statusFilter === "all"
        ? mappedHouseholds
        : mappedHouseholds.filter((hh) => hh.status === statusFilter);

    return NextResponse.json({
      households: filteredHouseholds,
      counts,
    });
  } catch (error) {
    logger.error({ error }, "Failed to fetch households for super admin");
    return NextResponse.json(
      { error: "世帯一覧の取得に失敗しました。" },
      { status: 500 }
    );
  }
}

/**
 * 2. 世帯申請の承認・却下・停止・再開 (PUT /api/super-admin/households)
 */
export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const body = await req.json();
    const { householdId, action, reason } = body ?? {};

    if (!householdId || typeof householdId !== "string" || householdId.trim().length === 0) {
      return NextResponse.json(
        { error: "対象の世帯IDを指定してください。" },
        { status: 400 }
      );
    }

    if (!isValidSuperAdminAction(action)) {
      return NextResponse.json(
        { error: "無効な操作種別 (action) が指定されました。" },
        { status: 400 }
      );
    }

    const normalizedReason = normalizeReasonInput(reason);
    if (!normalizedReason.ok) {
      return NextResponse.json(
        { error: normalizedReason.error },
        { status: 400 }
      );
    }

    const trimmedHouseholdId = householdId.trim();
    const [targetHousehold] = await masterDb
      .select()
      .from(households)
      .where(eq(households.id, trimmedHouseholdId))
      .limit(1);

    if (!targetHousehold) {
      return NextResponse.json(
        { error: "対象の世帯が見つかりません。" },
        { status: 404 }
      );
    }

    const transition = validateSuperAdminHouseholdTransition({
      action,
      currentStatus: targetHousehold.status,
      targetHouseholdId: targetHousehold.id,
      actorHouseholdId: session.activeHouseholdId,
      reason: normalizedReason.value,
    });

    if (!transition.ok) {
      return NextResponse.json(
        { error: transition.error },
        { status: transition.statusCode }
      );
    }

    // 承認・再承認時のみテナント専用スキーマ・テーブル・初期データを生成
    if (action === "approve") {
      await seedApprovedHouseholdDefaults(
        targetHousehold.id,
        targetHousehold.schemaName
      );
    }

    const now = new Date();
    const updatePayload: {
      status: string;
      reviewedBy: string;
      reviewedAt: Date;
      rejectionReason?: string | null;
    } = {
      status: transition.nextStatus,
      reviewedBy: session.userId,
      reviewedAt: now,
    };

    if (transition.nextRejectionReason !== undefined) {
      updatePayload.rejectionReason = transition.nextRejectionReason;
    }

    const [updated] = await masterDb
      .update(households)
      .set(updatePayload)
      .where(eq(households.id, targetHousehold.id))
      .returning();

    const actionMessages: Record<typeof action, string> = {
      approve: `世帯「${targetHousehold.name}」を承認し、利用環境を初期化しました。`,
      reject: `世帯「${targetHousehold.name}」の申請を却下しました。`,
      suspend: `世帯「${targetHousehold.name}」の利用を停止しました。`,
      reactivate: `世帯「${targetHousehold.name}」の利用を再開しました。`,
    };

    logger.info(
      {
        superAdminUserId: session.userId,
        householdId: targetHousehold.id,
        action,
        previousStatus: targetHousehold.status,
        nextStatus: transition.nextStatus,
      },
      "Super admin updated household status"
    );

    return NextResponse.json({
      success: true,
      message: actionMessages[action],
      household: {
        id: updated.id,
        name: updated.name,
        schemaName: updated.schemaName,
        status: updated.status as HouseholdStatus,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
        reviewedBy: updated.reviewedBy ?? null,
        rejectionReason: updated.rejectionReason ?? null,
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to update household status");
    return NextResponse.json(
      { error: "世帯ステータスの更新に失敗しました。" },
      { status: 500 }
    );
  }
}

/**
 * 3. 却下済み・承認待ち世帯申請の物理削除（抹消） (DELETE /api/super-admin/households?householdId=...)
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  try {
    const householdId = req.nextUrl.searchParams.get("householdId")?.trim();
    if (!householdId) {
      return NextResponse.json(
        { error: "削除対象の世帯IDを指定してください。" },
        { status: 400 }
      );
    }

    const [targetHousehold] = await masterDb
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);

    if (!targetHousehold) {
      return NextResponse.json(
        { error: "対象の世帯が見つかりません。" },
        { status: 404 }
      );
    }

    const deletionCheck = validateSuperAdminHouseholdDeletion({
      currentStatus: targetHousehold.status,
      targetHouseholdId: targetHousehold.id,
      actorHouseholdId: session.activeHouseholdId,
    });

    if (!deletionCheck.ok) {
      return NextResponse.json(
        { error: deletionCheck.error },
        { status: deletionCheck.statusCode }
      );
    }

    const deletedUserIds: string[] = [];

    await masterDb.transaction(async (tx) => {
      // 1. 当該世帯に紐づくメンバーの userId を取得
      const targetMemberships = await tx
        .select({ userId: householdMemberships.userId })
        .from(householdMemberships)
        .where(eq(householdMemberships.householdId, targetHousehold.id));

      const candidateUserIds = Array.from(
        new Set(targetMemberships.map((m) => m.userId))
      );

      // 2. 世帯メンバーシップおよび世帯レコードを物理削除
      await tx
        .delete(householdMemberships)
        .where(eq(householdMemberships.householdId, targetHousehold.id));

      await tx
        .delete(households)
        .where(eq(households.id, targetHousehold.id));

      // 3. 他世帯への所属がなく、かつ Super Admin ではない申請ユーザーを物理削除（同一メール再申請を可能化）
      if (candidateUserIds.length > 0) {
        const remainingMemberships = await tx
          .select({ userId: householdMemberships.userId })
          .from(householdMemberships)
          .where(inArray(householdMemberships.userId, candidateUserIds));

        const usersWithOtherHouseholds = new Set(
          remainingMemberships.map((m) => m.userId)
        );

        const orphanCandidateIds = candidateUserIds.filter(
          (uid) => !usersWithOtherHouseholds.has(uid)
        );

        if (orphanCandidateIds.length > 0) {
          const orphanUsers = await tx
            .select({ id: users.id, isSuperAdmin: users.isSuperAdmin })
            .from(users)
            .where(inArray(users.id, orphanCandidateIds));

          const deletableUserIds = orphanUsers
            .filter((u) => !u.isSuperAdmin)
            .map((u) => u.id);

          if (deletableUserIds.length > 0) {
            await tx.delete(users).where(inArray(users.id, deletableUserIds));
            deletedUserIds.push(...deletableUserIds);
          }
        }
      }
    });

    logger.info(
      {
        superAdminUserId: session.userId,
        deletedHouseholdId: targetHousehold.id,
        householdName: targetHousehold.name,
        deletedUserIds,
      },
      "Super admin permanently deleted household application"
    );

    return NextResponse.json({
      success: true,
      deletedHouseholdId: targetHousehold.id,
      deletedUserIds,
      message: `世帯申請「${targetHousehold.name}」を削除（抹消）しました。`,
    });
  } catch (error) {
    logger.error({ error }, "Failed to delete household application");
    return NextResponse.json(
      { error: "世帯申請の削除に失敗しました。" },
      { status: 500 }
    );
  }
}
