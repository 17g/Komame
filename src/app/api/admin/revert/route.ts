import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, gte, and, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { checkpointId } = await req.json();
    if (!checkpointId) {
      return NextResponse.json({ error: "チェックポイントIDが指定されていません。" }, { status: 400 });
    }

    const { db, schema, raw } = getTenantDb(session.schemaName);

    // 1. 対象チェックポイントの検証 (24時間以内か)
    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, checkpointId),
          gte(schema.checkpoints.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!checkpoint) {
      return NextResponse.json(
        { error: "指定されたチェックポイントが存在しないか、既にリバート済みまたは有効期限（24時間）が切れています。" },
        { status: 404 }
      );
    }

    // 2. チェックポイント以降に登録された明細を取得
    const affectedTxs = await db
      .select()
      .from(schema.transactions)
      .where(gte(schema.transactions.createdAt, checkpoint.createdAt));

    // 3. 残高の逆算復元
    for (const tx of affectedTxs) {
      if (tx.isSettled) {
        if (tx.paymentMethodId) {
          const [pm] = await db
            .select()
            .from(schema.paymentMethods)
            .where(eq(schema.paymentMethods.id, tx.paymentMethodId))
            .limit(1);

          if (pm && pm.sourceAccountId) {
            // 口座から引かれていた金額を戻す (+amount)
            await raw.unsafe(`
              UPDATE "${session.schemaName}".accounts 
              SET balance = balance + ${tx.amount}
              WHERE id = '${pm.sourceAccountId}'
            `);
          }
        } else if (tx.type === "transfer" && tx.fromAccountId && tx.toAccountId) {
          // 口座間移動を逆戻し
          await raw.unsafe(`
            UPDATE "${session.schemaName}".accounts 
            SET balance = balance + ${tx.amount}
            WHERE id = '${tx.fromAccountId}'
          `);
          await raw.unsafe(`
            UPDATE "${session.schemaName}".accounts 
            SET balance = balance - ${tx.amount}
            WHERE id = '${tx.toAccountId}'
          `);
        }
      }
    }

    // 4. チェックポイント以降の明細を削除
    await db
      .delete(schema.transactions)
      .where(gte(schema.transactions.createdAt, checkpoint.createdAt));

    // 5. 【決定仕様 Q2】一時保存データ（手動・自動）を全件物理削除して空に初期化
    await db.delete(schema.drafts);

    // 6. 【要件指摘2】リバート済みの対象チェックポイントおよびその後のチェックポイントを無効化 (削除)
    await db
      .delete(schema.checkpoints)
      .where(gte(schema.checkpoints.createdAt, checkpoint.createdAt));

    // 7. リバート操作ログの記録
    await db.insert(schema.auditLogs).values({
      id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: session.userId,
      operatorUserId: session.userId,
      action: "REVERT",
      entityType: "checkpoint",
      entityId: checkpointId,
      summary: `チェックポイント (${checkpoint.description || checkpointId}) 以降の操作を取り消し、${affectedTxs.length}件の明細と残高を巻き戻しました。`,
      checkpointId,
    });

    logger.info(
      {
        userId: session.userId,
        checkpointId,
        revertedCount: affectedTxs.length,
      },
      "Checkpoint revert executed successfully and checkpoints invalidated"
    );

    return NextResponse.json({
      success: true,
      revertedCount: affectedTxs.length,
      message: "チェックポイント時点へリバートしました。一時保存データを空に初期化しました。",
    });
  } catch (error) {
    logger.error({ error }, "Error executing revert");
    return NextResponse.json({ error: "リバート処理中にエラーが発生しました。" }, { status: 500 });
  }
}
