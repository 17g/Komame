import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, gte, and, desc, isNull, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

type TenantTx = Parameters<Parameters<ReturnType<typeof getTenantDb>["db"]["transaction"]>[0]>[0];
type TenantSchema = ReturnType<typeof getTenantDb>["schema"];

/**
 * 精算済み明細 (isSettled === true) 1件分の口座残高変動を逆算復元するヘルパー
 */
async function rollbackSettledTransactionBalance(
  tx: TenantTx,
  schema: TenantSchema,
  t: {
    type: string;
    amount: number;
    paymentMethodId: string | null;
    fromAccountId: string | null;
    toAccountId: string | null;
  },
  options?: { skipExpenseToAccountRollback?: boolean }
) {
  if (t.type === "transfer") {
    // 通常の口座間振替の逆戻し (出金元へ戻し、受入先から引く)
    if (t.fromAccountId && t.toAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} + ${t.amount}` })
        .where(eq(schema.accounts.id, t.fromAccountId));
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} - ${t.amount}` })
        .where(eq(schema.accounts.id, t.toAccountId));
    }
  } else if (t.type === "income") {
    // 収入の逆戻し (受入口座から引く)
    if (t.toAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} - ${t.amount}` })
        .where(eq(schema.accounts.id, t.toAccountId));
    }
  } else if (t.type === "expense") {
    // 1. 決済手段・出金元口座に応じた支払元口座への返戻 (+t.amount)
    let sourceAccountId: string | null = null;
    if (t.paymentMethodId) {
      const [pm] = await tx
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, t.paymentMethodId))
        .limit(1);

      if (pm) {
        sourceAccountId = pm.sourceAccountId ?? null;

        // 現金決済で引き落とし元が未設定の場合、手元現金口座を自動特定して返戻
        if (!sourceAccountId && pm.type === "cash") {
          const [cashAcc] = await tx
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.type, "cash"))
            .limit(1);
          sourceAccountId = cashAcc?.id ?? null;
        } else if (!sourceAccountId && pm.type === "qr_code") {
          // QR決済で引き落とし元が未設定の場合、プリペイド残高口座を自動特定して返戻
          const [walletAcc] = await tx
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.type, "prepaid_wallet"))
            .limit(1);
          sourceAccountId = walletAcc?.id ?? null;
        }
      }
    }

    if (!sourceAccountId && t.fromAccountId) {
      sourceAccountId = t.fromAccountId;
    }

    if (sourceAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} + ${t.amount}` })
        .where(eq(schema.accounts.id, sourceAccountId));
    }

    // 2. 貯蓄・投資等で移動先口座（toAccountId）が指定されていた場合、移動先口座から逆算減額 (-t.amount)
    if (t.toAccountId && !options?.skipExpenseToAccountRollback) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} - ${t.amount}` })
        .where(eq(schema.accounts.id, t.toAccountId));
    }
  }
}

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

    const { db, schema } = getTenantDb(session.schemaName);

    let notFound = false;
    let revertedCount = 0;

    await db.transaction(async (tx) => {
      // 1. 対象チェックポイントの検証 (24時間以内か)
      const [checkpoint] = await tx
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
        notFound = true;
        return;
      }

      // 2. チェックポイント以降に登録された明細を取得
      const affectedTxs = await tx
        .select()
        .from(schema.transactions)
        .where(gte(schema.transactions.createdAt, checkpoint.createdAt));

      const affectedTxIds = new Set(affectedTxs.map((t) => t.id));
      const affectedRecurringTemplateIds = new Set<string>();

      // 3. 新規登録明細の残高逆算復元
      for (const t of affectedTxs) {
        if (t.recurringTemplateId && !t.parentTransactionId) {
          affectedRecurringTemplateIds.add(t.recurringTemplateId);
        }

        // すでに論理削除済みの明細は削除時に残高ロールバック済みのため二重返戻を防止
        if (t.deletedAt != null) {
          continue;
        }

        if (!t.isSettled) {
          // 未精算明細（定例支払い予定・クレカ決済等）は出金元口座残高に影響していないため逆算不要
          // 非定例のクレカ積立投資（toAccountId あり）のみ受入口座を逆算減額する
          if (!t.recurringTemplateId && t.type === "expense" && t.toAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} - ${t.amount}` })
              .where(eq(schema.accounts.id, t.toAccountId));
          }
          continue;
        }

        await rollbackSettledTransactionBalance(tx, schema, t);
      }

      // 3.5 チェックポイント作成前に存在し、チェックポイント以降に精算 (isSettled: false -> true) された既存明細の残高復元
      const recentTxUpdateLogs = await tx
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            gte(schema.auditLogs.createdAt, checkpoint.createdAt),
            eq(schema.auditLogs.action, "UPDATE"),
            eq(schema.auditLogs.entityType, "transaction")
          )
        );

      const settledExistingTxIds = new Set<string>();
      for (const log of recentTxUpdateLogs) {
        const before = log.beforeDataJson as { isSettled?: unknown } | null;
        const after = log.afterDataJson as { isSettled?: unknown } | null;
        if (
          log.entityId &&
          !affectedTxIds.has(log.entityId) &&
          before?.isSettled === false &&
          after?.isSettled === true
        ) {
          settledExistingTxIds.add(log.entityId);
        }
      }

      let revertedSettlementCount = 0;
      for (const settledTxId of settledExistingTxIds) {
        const [existingTx] = await tx
          .select()
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.id, settledTxId),
              isNull(schema.transactions.deletedAt),
              eq(schema.transactions.isSettled, true)
            )
          )
          .limit(1);

        if (!existingTx) continue;

        const hasLinkedChildInAffected = affectedTxs.some(
          (child) => child.parentTransactionId === existingTx.id && child.deletedAt == null
        );
        await rollbackSettledTransactionBalance(tx, schema, existingTx, {
          skipExpenseToAccountRollback:
            existingTx.type === "expense" && Boolean(existingTx.toAccountId) && !hasLinkedChildInAffected,
        });
        await tx
          .update(schema.transactions)
          .set({ isSettled: false, updatedAt: new Date() })
          .where(eq(schema.transactions.id, existingTx.id));
        revertedSettlementCount += 1;
      }

      // 4. チェックポイント以降の明細を削除
      await tx
        .delete(schema.transactions)
        .where(gte(schema.transactions.createdAt, checkpoint.createdAt));

      // 4.5 リバートで削除された定例支払い予定明細に紐づくテンプレートの last_generated_month を残存明細に合わせて再同期
      for (const templateId of affectedRecurringTemplateIds) {
        const [latestRemaining] = await tx
          .select({
            scheduledWithdrawalDate: schema.transactions.scheduledWithdrawalDate,
            date: schema.transactions.date,
          })
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.recurringTemplateId, templateId),
              isNull(schema.transactions.deletedAt),
              isNull(schema.transactions.parentTransactionId)
            )
          )
          .orderBy(desc(schema.transactions.scheduledWithdrawalDate), desc(schema.transactions.date))
          .limit(1);

        const nextLastMonth =
          latestRemaining?.scheduledWithdrawalDate?.slice(0, 7) ??
          latestRemaining?.date?.slice(0, 7) ??
          null;

        await tx
          .update(schema.recurringTemplates)
          .set({ lastGeneratedMonth: nextLastMonth, updatedAt: new Date() })
          .where(eq(schema.recurringTemplates.id, templateId));
      }

      // 5. 【決定仕様 Q2】一時保存データ（手動・自動）を全件物理削除して空に初期化
      await tx.delete(schema.drafts);

      // 6. 【要件指摘2】リバート済みの対象チェックポイントおよびその後のチェックポイントを無効化 (削除)
      await tx
        .delete(schema.checkpoints)
        .where(gte(schema.checkpoints.createdAt, checkpoint.createdAt));

      const totalRevertedCount = affectedTxs.length + revertedSettlementCount;

      // 7. リバート操作ログの記録
      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "REVERT",
        entityType: "checkpoint",
        entityId: checkpointId,
        summary: `チェックポイント (${checkpoint.description || checkpointId}) 以降の操作を取り消し、${totalRevertedCount}件の明細・精算と残高を巻き戻しました。`,
        checkpointId,
      });

      revertedCount = totalRevertedCount;
    });

    if (notFound) {
      return NextResponse.json(
        { error: "指定されたチェックポイントが存在しないか、既にリバート済みまたは有効期限（24時間）が切れています。" },
        { status: 404 }
      );
    }

    logger.info(
      {
        userId: session.userId,
        checkpointId,
        revertedCount,
      },
      "Checkpoint revert executed successfully and checkpoints invalidated"
    );

    return NextResponse.json({
      success: true,
      revertedCount,
      message: "チェックポイント時点へリバートしました。一時保存データを空に初期化しました。",
    });
  } catch (error) {
    logger.error({ error }, "Error executing revert");
    return NextResponse.json({ error: "リバート処理中にエラーが発生しました。" }, { status: 500 });
  }
}
