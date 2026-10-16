import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// GET: 貯蓄目標一覧 & 現在の進捗額集計
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    const goals = await db.select().from(schema.savingsGoals);
    const accounts = await db.select().from(schema.accounts);

    const goalsWithProgress = goals.map((goal) => {
      const targetAccountIds = (goal.accountIdsJson as string[]) || [];
      const currentAmount = accounts
        .filter((acc) => targetAccountIds.includes(acc.id))
        .reduce((sum, acc) => sum + acc.balance, 0);

      const progressRate = Math.min(
        100,
        Math.round((currentAmount / (goal.targetAmount || 1)) * 100)
      );

      return {
        ...goal,
        currentAmount,
        progressRate,
      };
    });

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

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const { title, targetAmount, targetDate, accountIds, color } = await req.json();

    if (!title || !targetAmount) {
      return NextResponse.json({ error: "タイトルと目標金額を入力してください。" }, { status: 400 });
    }

    const id = `goal_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.insert(schema.savingsGoals).values({
      id,
      title,
      targetAmount,
      targetDate,
      accountIdsJson: accountIds || [],
      color: color || "#2E7D32",
      isCompleted: false,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    logger.error({ error }, "Error creating goal");
    return NextResponse.json({ error: "目標の作成に失敗しました。" }, { status: 500 });
  }
}
