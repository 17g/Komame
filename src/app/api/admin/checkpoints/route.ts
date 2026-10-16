import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb, masterDb } from "@/db";
import { users } from "@/db/schema/master";
import { gte, desc, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const now = new Date();

    // 24時間以内で有効なチェックポイントを取得
    const rawCheckpoints = await db
      .select()
      .from(schema.checkpoints)
      .where(gte(schema.checkpoints.expiresAt, now))
      .orderBy(desc(schema.checkpoints.createdAt));

    // 各チェックポイント以降の操作明細件数と影響ユーザーを集計
    const checkpoints = await Promise.all(
      rawCheckpoints.map(async (cp) => {
        const affectedTxs = await db
          .select({ userId: schema.transactions.userId })
          .from(schema.transactions)
          .where(gte(schema.transactions.createdAt, cp.createdAt));

        const userIds = [...new Set(affectedTxs.map((t) => t.userId))];
        let affectedUserEmails: string[] = [];

        if (userIds.length > 0) {
          const userRecords = await masterDb
            .select({ email: users.email })
            .from(users)
            .where(inArray(users.id, userIds));
          affectedUserEmails = userRecords.map((u) => u.email);
        }

        return {
          ...cp,
          impactSummary: {
            txCount: affectedTxs.length,
            affectedUsers: affectedUserEmails,
          },
        };
      })
    );

    return NextResponse.json({ checkpoints });
  } catch (error) {
    logger.error({ error }, "Error fetching checkpoints");
    return NextResponse.json({ error: "チェックポイント一覧の取得に失敗しました。" }, { status: 500 });
  }
}
