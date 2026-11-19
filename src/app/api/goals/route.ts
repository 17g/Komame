import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { asc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import {
  calculateGoalCurrentAmount,
  calculateGoalProgressRate,
  canArchiveGoal,
  canDeleteGoal,
  canRestoreGoal,
  isGoalAchieved,
  validateGoalInput,
} from "@/lib/goal-helpers";

class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function extractAccountIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function enrichGoal<
  T extends {
    id: string;
    title: string;
    targetAmount: number;
    targetDate: string | null;
    accountIdsJson: unknown;
    color: string | null;
    isCompleted: boolean;
    isArchived: boolean;
    createdAt?: Date | string;
  },
>(goal: T, accounts: ReadonlyArray<{ id: string; balance: number }>) {
  const accountIdsJson = extractAccountIds(goal.accountIdsJson);
  const currentAmount = calculateGoalCurrentAmount(accountIdsJson, accounts);
  const progressRate = calculateGoalProgressRate(currentAmount, goal.targetAmount);
  const isArchived = Boolean(goal.isArchived);
  const isAchieved = isGoalAchieved(currentAmount, goal.targetAmount, goal.isCompleted);

  return {
    ...goal,
    accountIdsJson,
    isArchived,
    currentAmount,
    progressRate,
    isAchieved,
  };
}

// GET: 貯蓄目標一覧 & 現在の進捗額集計 (進行中・アーカイブ済み全件)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    const goals = await db
      .select()
      .from(schema.savingsGoals)
      .orderBy(asc(schema.savingsGoals.createdAt), asc(schema.savingsGoals.id));
    const accounts = await db.select().from(schema.accounts);

    const goalsWithProgress = goals.map((goal) => enrichGoal(goal, accounts));

    return NextResponse.json({ goals: goalsWithProgress });
  } catch (error) {
    logger.error({ error }, "Error fetching goals");
    return NextResponse.json({ error: "目標データの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 新規貯蓄目標の作成
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const validation = validateGoalInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { title, targetAmount, targetDate, accountIds, color } = validation.data;

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    const createdGoal = await db.transaction(async (tx) => {
      const id = `goal_${crypto.randomUUID().replace(/-/g, "")}`;
      const newGoalValues = {
        id,
        title,
        targetAmount,
        targetDate,
        accountIdsJson: accountIds,
        color,
        isCompleted: false,
        isArchived: false,
      };

      const [inserted] = await tx
        .insert(schema.savingsGoals)
        .values(newGoalValues)
        .returning();

      const record = inserted ?? { ...newGoalValues, createdAt: new Date() };

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "CREATE",
        entityType: "savings_goal",
        entityId: id,
        summary: `貯蓄目標「${title}」（目標額: ${targetAmount.toLocaleString("ja-JP")}円）を作成しました`,
        afterDataJson: record,
      });

      const accounts = await tx.select().from(schema.accounts);
      return enrichGoal(record, accounts);
    });

    return NextResponse.json({
      success: true,
      id: createdGoal.id,
      goal: createdGoal,
      message: `貯蓄目標「${createdGoal.title}」を作成しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error creating goal");
    return NextResponse.json({ error: "目標の作成に失敗しました。" }, { status: 500 });
  }
}

// PUT: 貯蓄目標の編集 / 達成済み目標のアーカイブ / アーカイブ済み目標の復元
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const action = typeof body?.action === "string" ? body.action.trim() : "update";
  const id = typeof body?.id === "string" ? body.id.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "目標IDを指定してください。" }, { status: 400 });
  }

  if (action !== "update" && action !== "archive" && action !== "restore") {
    return NextResponse.json({ error: "不正な操作種別です。" }, { status: 400 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    // 1. 達成済み目標のアーカイブ
    if (action === "archive") {
      const archivedGoal = await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(schema.savingsGoals)
          .where(eq(schema.savingsGoals.id, id))
          .limit(1);

        if (!target) {
          throw new ApiHttpError(404, "指定された貯蓄目標が見つかりません。");
        }

        const accounts = await tx.select().from(schema.accounts);
        const currentAmount = calculateGoalCurrentAmount(
          extractAccountIds(target.accountIdsJson),
          accounts
        );

        const archiveCheck = canArchiveGoal({
          currentAmount,
          targetAmount: target.targetAmount,
          isCompleted: target.isCompleted,
          isArchived: target.isArchived,
        });

        if (!archiveCheck.allowed) {
          throw new ApiHttpError(
            400,
            archiveCheck.reason || "達成済みの目標のみアーカイブできます。"
          );
        }

        const [updated] = await tx
          .update(schema.savingsGoals)
          .set({ isArchived: true, isCompleted: true })
          .where(eq(schema.savingsGoals.id, target.id))
          .returning();

        const afterData = updated ?? { ...target, isArchived: true, isCompleted: true };

        await tx.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "UPDATE",
          entityType: "savings_goal",
          entityId: target.id,
          summary: `達成済みの貯蓄目標「${target.title}」をアーカイブしました`,
          beforeDataJson: target,
          afterDataJson: afterData,
        });

        return enrichGoal(afterData, accounts);
      });

      return NextResponse.json({
        success: true,
        goal: archivedGoal,
        message: `貯蓄目標「${archivedGoal.title}」をアーカイブしました。`,
      });
    }

    // 2. アーカイブ済み目標の進行中一覧への復元
    if (action === "restore") {
      const restoredGoal = await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(schema.savingsGoals)
          .where(eq(schema.savingsGoals.id, id))
          .limit(1);

        if (!target) {
          throw new ApiHttpError(404, "指定された貯蓄目標が見つかりません。");
        }

        const restoreCheck = canRestoreGoal({ isArchived: target.isArchived });
        if (!restoreCheck.allowed) {
          throw new ApiHttpError(
            400,
            restoreCheck.reason || "この目標はアーカイブされていません。"
          );
        }

        const [updated] = await tx
          .update(schema.savingsGoals)
          .set({ isArchived: false })
          .where(eq(schema.savingsGoals.id, target.id))
          .returning();

        const afterData = updated ?? { ...target, isArchived: false };

        await tx.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "UPDATE",
          entityType: "savings_goal",
          entityId: target.id,
          summary: `貯蓄目標「${target.title}」をアーカイブから復元しました`,
          beforeDataJson: target,
          afterDataJson: afterData,
        });

        const accounts = await tx.select().from(schema.accounts);
        return enrichGoal(afterData, accounts);
      });

      return NextResponse.json({
        success: true,
        goal: restoredGoal,
        message: `貯蓄目標「${restoredGoal.title}」を進行中一覧へ復元しました。`,
      });
    }

    // 3. 目標情報の編集 (action === "update")
    const validation = validateGoalInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { title, targetAmount, targetDate, accountIds, color } = validation.data;

    const updatedGoal = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(schema.savingsGoals)
        .where(eq(schema.savingsGoals.id, id))
        .limit(1);

      if (!target) {
        throw new ApiHttpError(404, "指定された貯蓄目標が見つかりません。");
      }

      const [updated] = await tx
        .update(schema.savingsGoals)
        .set({
          title,
          targetAmount,
          targetDate,
          accountIdsJson: accountIds,
          color,
        })
        .where(eq(schema.savingsGoals.id, target.id))
        .returning();

      const afterData = updated ?? {
        ...target,
        title,
        targetAmount,
        targetDate,
        accountIdsJson: accountIds,
        color,
      };

      const summary =
        target.title !== title
          ? `貯蓄目標「${target.title}」を「${title}」へ更新しました`
          : `貯蓄目標「${title}」を更新しました`;

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "UPDATE",
        entityType: "savings_goal",
        entityId: target.id,
        summary,
        beforeDataJson: target,
        afterDataJson: afterData,
      });

      const accounts = await tx.select().from(schema.accounts);
      return enrichGoal(afterData, accounts);
    });

    return NextResponse.json({
      success: true,
      goal: updatedGoal,
      message: `貯蓄目標「${updatedGoal.title}」を更新しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error updating goal");
    return NextResponse.json({ error: "目標の更新に失敗しました。" }, { status: 500 });
  }
}

// DELETE: 未達成の貯蓄目標の物理削除 (達成済み・アーカイブ済み目標は削除保護)
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!id) {
    return NextResponse.json({ error: "目標IDを指定してください。" }, { status: 400 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    const deletedGoal = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(schema.savingsGoals)
        .where(eq(schema.savingsGoals.id, id))
        .limit(1);

      if (!target) {
        throw new ApiHttpError(404, "指定された貯蓄目標が見つかりません。");
      }

      const accounts = await tx.select().from(schema.accounts);
      const currentAmount = calculateGoalCurrentAmount(
        extractAccountIds(target.accountIdsJson),
        accounts
      );

      const deleteCheck = canDeleteGoal({
        currentAmount,
        targetAmount: target.targetAmount,
        isCompleted: target.isCompleted,
        isArchived: target.isArchived,
      });

      if (!deleteCheck.allowed) {
        throw new ApiHttpError(
          400,
          deleteCheck.reason ||
            "達成済みまたはアーカイブ済みの目標は削除できません。アーカイブ機能をご利用ください。"
        );
      }

      await tx.delete(schema.savingsGoals).where(eq(schema.savingsGoals.id, target.id));

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "DELETE",
        entityType: "savings_goal",
        entityId: target.id,
        summary: `未達成の貯蓄目標「${target.title}」を削除しました`,
        beforeDataJson: target,
        afterDataJson: null,
      });

      return target;
    });

    return NextResponse.json({
      success: true,
      id: deletedGoal.id,
      message: `貯蓄目標「${deletedGoal.title}」を削除しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error deleting goal");
    return NextResponse.json({ error: "目標の削除に失敗しました。" }, { status: 500 });
  }
}
