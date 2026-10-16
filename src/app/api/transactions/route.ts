import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, and, isNull, desc, gte, lte, like, or } from "drizzle-orm";
import { calculateWithdrawalDate } from "@/lib/utils";
import { logger } from "@/lib/logger";

// GET: 明細一覧取得 (検索・フィルタ対応)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const searchParams = req.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const keyword = searchParams.get("keyword");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const paymentMethodId = searchParams.get("paymentMethodId");

    const query = db
      .select({
        id: schema.transactions.id,
        userId: schema.transactions.userId,
        type: schema.transactions.type,
        date: schema.transactions.date,
        amount: schema.transactions.amount,
        categoryId: schema.transactions.categoryId,
        categoryName: schema.categories.name,
        categoryIcon: schema.categories.icon,
        categoryColor: schema.categories.color,
        paymentMethodId: schema.transactions.paymentMethodId,
        paymentMethodName: schema.paymentMethods.name,
        fromAccountId: schema.transactions.fromAccountId,
        toAccountId: schema.transactions.toAccountId,
        shopName: schema.transactions.shopName,
        note: schema.transactions.note,
        isSettled: schema.transactions.isSettled,
        scheduledWithdrawalDate: schema.transactions.scheduledWithdrawalDate,
        createdAt: schema.transactions.createdAt,
      })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .leftJoin(
        schema.paymentMethods,
        eq(schema.transactions.paymentMethodId, schema.paymentMethods.id)
      )
      .where(
        and(
          isNull(schema.transactions.deletedAt), // 論理削除されていないもの
          categoryId ? eq(schema.transactions.categoryId, categoryId) : undefined,
          paymentMethodId ? eq(schema.transactions.paymentMethodId, paymentMethodId) : undefined,
          startDate ? gte(schema.transactions.date, startDate) : undefined,
          endDate ? lte(schema.transactions.date, endDate) : undefined,
          keyword
            ? or(
                like(schema.transactions.shopName, `%${keyword}%`),
                like(schema.transactions.note, `%${keyword}%`)
              )
            : undefined
        )
      )
      .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt));

    const transactions = await query;
    return NextResponse.json({ transactions });
  } catch (error) {
    logger.error({ error }, "Error fetching transactions");
    return NextResponse.json({ error: "明細データの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 明細の新規登録 (単一または一括)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema, raw } = getTenantDb(session.schemaName);
    const body = await req.json();
    const items: Array<{
      type: "expense" | "income" | "transfer";
      date: string;
      amount: number;
      categoryId?: string;
      paymentMethodId?: string;
      fromAccountId?: string;
      toAccountId?: string;
      shopName?: string;
      note?: string;
    }> = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: "登録する明細データがありません。" }, { status: 400 });
    }

    const checkpointId = `cp_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間有効

    // 1. チェックポイント作成
    await db.insert(schema.checkpoints).values({
      id: checkpointId,
      userId: session.userId,
      description: `${items.length}件の明細登録 (${items[0].shopName || items[0].date})`,
      expiresAt,
    });

    const createdTxIds: string[] = [];

    // 2. トランザクション処理 (明細登録 + 残高更新 + ログ記録)
    for (const item of items) {
      const txId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
      createdTxIds.push(txId);

      let scheduledWithdrawalDate: string | null = null;
      let isSettled = false;

      // 取引種別 (item.type) を最優先で評価し、残高変動と決済判定を実施
      if (item.type === "transfer") {
        if (item.fromAccountId) {
          await raw.unsafe(`
            UPDATE "${session.schemaName}".accounts 
            SET balance = balance - ${item.amount}
            WHERE id = '${item.fromAccountId}'
          `);
        }
        if (item.toAccountId) {
          await raw.unsafe(`
            UPDATE "${session.schemaName}".accounts 
            SET balance = balance + ${item.amount}
            WHERE id = '${item.toAccountId}'
          `);
        }
        isSettled = true;
      } else if (item.type === "income") {
        if (item.toAccountId) {
          await raw.unsafe(`
            UPDATE "${session.schemaName}".accounts 
            SET balance = balance + ${item.amount}
            WHERE id = '${item.toAccountId}'
          `);
          isSettled = true;
        }
      } else if (item.type === "expense") {
        // 決済手段に応じた残高変動と引き落とし予定日の判定
        if (item.paymentMethodId) {
          const [pm] = await db
            .select()
            .from(schema.paymentMethods)
            .where(eq(schema.paymentMethods.id, item.paymentMethodId))
            .limit(1);

          if (pm) {
            if (pm.type === "credit_card") {
              scheduledWithdrawalDate = calculateWithdrawalDate(
                item.date,
                pm.closingDay || 99,
                pm.withdrawalDay || 27,
                pm.withdrawalMonthOffset ?? 1
              );
              isSettled = false;
            } else if (pm.sourceAccountId) {
              // 引き落とし元口座が明示的に設定されている即時決済
              await raw.unsafe(`
                UPDATE "${session.schemaName}".accounts 
                SET balance = balance - ${item.amount}
                WHERE id = '${pm.sourceAccountId}'
              `);
              isSettled = true;
            } else if (pm.type === "cash") {
              // 現金決済で引き落とし元が未設定の場合、手元現金口座を自動特定して減額
              const [cashAcc] = await db
                .select()
                .from(schema.accounts)
                .where(eq(schema.accounts.type, "cash"))
                .limit(1);
              if (cashAcc) {
                await raw.unsafe(`
                  UPDATE "${session.schemaName}".accounts 
                  SET balance = balance - ${item.amount}
                  WHERE id = '${cashAcc.id}'
                `);
              }
              isSettled = true;
            } else if (pm.type === "qr_code") {
              // QR決済で引き落とし元が未設定の場合、プリペイド残高口座を自動特定して減額
              const [walletAcc] = await db
                .select()
                .from(schema.accounts)
                .where(eq(schema.accounts.type, "prepaid_wallet"))
                .limit(1);
              if (walletAcc) {
                await raw.unsafe(`
                  UPDATE "${session.schemaName}".accounts 
                  SET balance = balance - ${item.amount}
                  WHERE id = '${walletAcc.id}'
                `);
              }
              isSettled = true;
            }
          }
        }

        // 貯蓄・投資等で移動先口座（toAccountId）が指定されている場合、移動先口座へ残高加算
        if (item.toAccountId) {
          await raw.unsafe(`
            UPDATE "${session.schemaName}".accounts 
            SET balance = balance + ${item.amount}
            WHERE id = '${item.toAccountId}'
          `);
        }
      }

      // 明細レコード作成 (支出レコード)
      await db.insert(schema.transactions).values({
        id: txId,
        userId: session.userId,
        type: item.type,
        date: item.date,
        amount: item.amount,
        categoryId: item.categoryId,
        paymentMethodId: item.paymentMethodId,
        fromAccountId: item.fromAccountId,
        toAccountId: item.toAccountId,
        shopName: item.shopName,
        note: item.note,
        isSettled,
        scheduledWithdrawalDate,
        checkpointId,
      });

      // 監査ログ記録
      await db.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "CREATE",
        entityType: "transaction",
        entityId: txId,
        summary: `${item.shopName || "明細"} (${item.amount}円) の登録`,
        afterDataJson: item,
        checkpointId,
      });

      // 💰 貯蓄・投資等で移動先口座（toAccountId）が指定されている場合、移動先口座への収入明細も同時に自動登録
      if (item.type === "expense" && item.toAccountId) {
        const incomeTxId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
        createdTxIds.push(incomeTxId);

        // 移動先口座情報の取得
        const [destAcc] = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.id, item.toAccountId))
          .limit(1);

        await db.insert(schema.transactions).values({
          id: incomeTxId,
          userId: session.userId,
          type: "transfer",
          date: item.date,
          amount: item.amount,
          toAccountId: item.toAccountId,
          shopName: `${item.shopName || "積立・投資"} (受入)`,
          note: `資金移動受入: ${destAcc?.name || "貯蓄口座"} [${item.note || ""}]`,
          isSettled: true,
          checkpointId,
        });

        await db.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "CREATE",
          entityType: "transaction",
          entityId: incomeTxId,
          summary: `${destAcc?.name || "移動先口座"} への資金移動・積立受入 (${item.amount}円)`,
          afterDataJson: { type: "transfer", amount: item.amount, toAccountId: item.toAccountId },
          checkpointId,
        });
      }
    }

    logger.info({ userId: session.userId, count: items.length, checkpointId }, "Transactions created");

    return NextResponse.json({
      success: true,
      checkpointId,
      count: items.length,
      createdTxIds,
    });
  } catch (error) {
    logger.error({ error }, "Error creating transactions");
    return NextResponse.json({ error: "明細の登録処理中にエラーが発生しました。" }, { status: 500 });
  }
}

// PUT: 明細の修正・更新 (支払手段変更・金額変更時の残高完全双方向同期)
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema, raw } = getTenantDb(session.schemaName);
    const { id, date, amount, categoryId, paymentMethodId, shopName, note } = await req.json();

    if (!id || amount === undefined) {
      return NextResponse.json({ error: "更新パラメータが不足しています。" }, { status: 400 });
    }

    // 既存明細の取得
    const [existingTx] = await db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.id, id), isNull(schema.transactions.deletedAt)))
      .limit(1);

    if (!existingTx) {
      return NextResponse.json({ error: "対象の明細が見つかりません。" }, { status: 404 });
    }

    const newAmount = parseInt(amount, 10);
    const targetPmId = paymentMethodId || existingTx.paymentMethodId;

    // 1. 旧明細が即時決済（isSettled）だった場合、旧口座の残高を元に戻す (ロールバック)
    if (existingTx.isSettled && existingTx.paymentMethodId) {
      const [oldPm] = await db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, existingTx.paymentMethodId))
        .limit(1);

      let oldSourceAccId = oldPm?.sourceAccountId;
      if (!oldSourceAccId && oldPm?.type === "cash") {
        const [c] = await db.select().from(schema.accounts).where(eq(schema.accounts.type, "cash")).limit(1);
        oldSourceAccId = c?.id;
      } else if (!oldSourceAccId && oldPm?.type === "qr_code") {
        const [w] = await db.select().from(schema.accounts).where(eq(schema.accounts.type, "prepaid_wallet")).limit(1);
        oldSourceAccId = w?.id;
      }

      if (oldSourceAccId) {
        await raw.unsafe(`
          UPDATE "${session.schemaName}".accounts 
          SET balance = balance + ${existingTx.amount}
          WHERE id = '${oldSourceAccId}'
        `);
      }
    }

    // 2. 新しい支払手段に応じた残高減額と決済状態の計算
    let isSettled = false;
    let scheduledWithdrawalDate: string | null = null;

    if (targetPmId) {
      const [newPm] = await db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, targetPmId))
        .limit(1);

      if (newPm) {
        if (newPm.type === "credit_card") {
          // クレジットカード: 即時決済せず、引き落とし予定日を計算
          scheduledWithdrawalDate = calculateWithdrawalDate(
            date || existingTx.date,
            newPm.closingDay || 99,
            newPm.withdrawalDay || 27,
            newPm.withdrawalMonthOffset ?? 1
          );
          isSettled = false;
        } else {
          // 即時決済 (現金, QR, デビット等): 口座から即座に減額
          let newSourceAccId = newPm.sourceAccountId;
          if (!newSourceAccId && newPm.type === "cash") {
            const [c] = await db.select().from(schema.accounts).where(eq(schema.accounts.type, "cash")).limit(1);
            newSourceAccId = c?.id;
          } else if (!newSourceAccId && newPm.type === "qr_code") {
            const [w] = await db.select().from(schema.accounts).where(eq(schema.accounts.type, "prepaid_wallet")).limit(1);
            newSourceAccId = w?.id;
          }

          if (newSourceAccId) {
            await raw.unsafe(`
              UPDATE "${session.schemaName}".accounts 
              SET balance = balance - ${newAmount}
              WHERE id = '${newSourceAccId}'
            `);
          }
          isSettled = true;
        }
      }
    }

    // 更新実行
    await db
      .update(schema.transactions)
      .set({
        date: date || existingTx.date,
        amount: newAmount,
        categoryId: categoryId || existingTx.categoryId,
        paymentMethodId: targetPmId,
        shopName: shopName !== undefined ? shopName : existingTx.shopName,
        note: note !== undefined ? note : existingTx.note,
        isSettled,
        scheduledWithdrawalDate,
        updatedAt: new Date(),
      })
      .where(eq(schema.transactions.id, id));

    // 監査ログ記録
    await db.insert(schema.auditLogs).values({
      id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: session.userId,
      operatorUserId: session.userId,
      action: "UPDATE",
      entityType: "transaction",
      entityId: id,
      summary: `${shopName || existingTx.shopName || "明細"} の修正 (${existingTx.amount}円 → ${newAmount}円)`,
      beforeDataJson: existingTx,
      afterDataJson: { date, amount: newAmount, categoryId, paymentMethodId: targetPmId, shopName, note, isSettled },
    });

    logger.info({ userId: session.userId, txId: id }, "Transaction updated successfully with balance sync");

    return NextResponse.json({ success: true, message: "明細を更新しました。" });
  } catch (error) {
    logger.error({ error }, "Error updating transaction");
    return NextResponse.json({ error: "明細の更新処理中にエラーが発生しました。" }, { status: 500 });
  }
}

// DELETE: 明細の削除
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema, raw } = getTenantDb(session.schemaName);
    const txId = req.nextUrl.searchParams.get("id");

    if (!txId) {
      return NextResponse.json({ error: "明細IDが指定されていません。" }, { status: 400 });
    }

    const [existingTx] = await db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.id, txId), isNull(schema.transactions.deletedAt)))
      .limit(1);

    if (!existingTx) {
      return NextResponse.json({ error: "対象の明細が見つかりません。" }, { status: 404 });
    }

    // 即時決済されていた場合は残高を巻き戻し
    if (existingTx.isSettled && existingTx.paymentMethodId) {
      const [pm] = await db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, existingTx.paymentMethodId))
        .limit(1);

      let sourceAccId = pm?.sourceAccountId;
      if (!sourceAccId && pm?.type === "cash") {
        const [c] = await db.select().from(schema.accounts).where(eq(schema.accounts.type, "cash")).limit(1);
        sourceAccId = c?.id;
      } else if (!sourceAccId && pm?.type === "qr_code") {
        const [w] = await db.select().from(schema.accounts).where(eq(schema.accounts.type, "prepaid_wallet")).limit(1);
        sourceAccId = w?.id;
      }

      if (sourceAccId) {
        await raw.unsafe(`
          UPDATE "${session.schemaName}".accounts 
          SET balance = balance + ${existingTx.amount}
          WHERE id = '${sourceAccId}'
        `);
      }
    }

    // 論理削除
    await db
      .update(schema.transactions)
      .set({ deletedAt: new Date() })
      .where(eq(schema.transactions.id, txId));

    // 監査ログ記録
    await db.insert(schema.auditLogs).values({
      id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: session.userId,
      operatorUserId: session.userId,
      action: "DELETE",
      entityType: "transaction",
      entityId: txId,
      summary: `${existingTx.shopName || "明細"} (${existingTx.amount}円) の削除`,
      beforeDataJson: existingTx,
    });

    logger.info({ userId: session.userId, txId }, "Transaction deleted successfully");

    return NextResponse.json({ success: true, message: "明細を削除しました。" });
  } catch (error) {
    logger.error({ error }, "Error deleting transaction");
    return NextResponse.json({ error: "明細の削除処理中にエラーが発生しました。" }, { status: 500 });
  }
}
