import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, and, isNull, desc, gte, lte, like, or, inArray, sql } from "drizzle-orm";
import { calculateWithdrawalDate, isValidAmount, parseValidAmount, MAX_BATCH_TRANSACTIONS } from "@/lib/utils";
import { normalizeDate } from "@/lib/csv";
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
    const tagId = searchParams.get("tagId");

    let tagFilteredTxIds: string[] | null = null;
    if (tagId) {
      const matched = await db
        .select({ transactionId: schema.transactionTags.transactionId })
        .from(schema.transactionTags)
        .where(eq(schema.transactionTags.tagId, tagId));
      tagFilteredTxIds = matched.map((m) => m.transactionId);
      if (tagFilteredTxIds.length === 0) {
        return NextResponse.json({ transactions: [] });
      }
    }

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
        parentTransactionId: schema.transactions.parentTransactionId,
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
          tagFilteredTxIds ? inArray(schema.transactions.id, tagFilteredTxIds) : undefined,
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

    // 明細に紐づくタグ情報を一括取得
    const txIds = transactions.map((t) => t.id);
    const tagsMap: Record<string, { id: string; name: string; color?: string }[]> = {};

    if (txIds.length > 0) {
      const txTags = await db
        .select({
          transactionId: schema.transactionTags.transactionId,
          id: schema.tags.id,
          name: schema.tags.name,
          color: schema.tags.color,
        })
        .from(schema.transactionTags)
        .innerJoin(schema.tags, eq(schema.transactionTags.tagId, schema.tags.id))
        .where(inArray(schema.transactionTags.transactionId, txIds));

      for (const tt of txTags) {
        if (!tagsMap[tt.transactionId]) {
          tagsMap[tt.transactionId] = [];
        }
        tagsMap[tt.transactionId].push({
          id: tt.id,
          name: tt.name,
          color: tt.color ?? undefined,
        });
      }
    }

    const transactionsWithTags = transactions.map((t) => ({
      ...t,
      tags: tagsMap[t.id] || [],
    }));

    return NextResponse.json({ transactions: transactionsWithTags });
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
    const { db, schema } = getTenantDb(session.schemaName);
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
      tagIds?: string[];
      tags?: string[];
    }> = Array.isArray(body) ? body : [body];

    if (items.length === 0) {
      return NextResponse.json({ error: "登録する明細データがありません。" }, { status: 400 });
    }

    if (items.length > MAX_BATCH_TRANSACTIONS) {
      return NextResponse.json(
        { error: `一度に登録できる明細は最大${MAX_BATCH_TRANSACTIONS}件までです。` },
        { status: 400 }
      );
    }

    // 境界値およびパラメータバリデーション (VULN-09)
    for (const item of items) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "不正な明細データです。" }, { status: 400 });
      }
      if (!isValidAmount(item.amount)) {
        return NextResponse.json({ error: "金額は1〜9,999,999,999円の整数で入力してください。" }, { status: 400 });
      }
      if (!["expense", "income", "transfer"].includes(item.type)) {
        return NextResponse.json({ error: "無効な取引種別です。" }, { status: 400 });
      }
      if (!item.date || typeof item.date !== "string" || !normalizeDate(item.date)) {
        return NextResponse.json({ error: "日付の形式が不正です。" }, { status: 400 });
      }
    }

    const checkpointId = `cp_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間有効
    const createdTxIds: string[] = [];

    // トランザクション処理 (チェックポイント作成 + 明細登録 + 残高更新 + ログ記録 + タグ紐付け)
    await db.transaction(async (tx) => {
      // 1. チェックポイント作成
      await tx.insert(schema.checkpoints).values({
        id: checkpointId,
        userId: session.userId,
        description: `${items.length}件の明細登録 (${items[0].shopName || items[0].date})`,
        expiresAt,
      });

      // 2. トランザクション処理
      for (const item of items) {
        const txId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
        createdTxIds.push(txId);

        let scheduledWithdrawalDate: string | null = null;
        let isSettled = false;

        // 取引種別 (item.type) を最優先で評価し、残高変動と決済判定を実施
        if (item.type === "transfer") {
          if (item.fromAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} - ${item.amount}` })
              .where(eq(schema.accounts.id, item.fromAccountId));
          }
          if (item.toAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} + ${item.amount}` })
              .where(eq(schema.accounts.id, item.toAccountId));
          }
          isSettled = true;
        } else if (item.type === "income") {
          if (item.toAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} + ${item.amount}` })
              .where(eq(schema.accounts.id, item.toAccountId));
            isSettled = true;
          }
        } else if (item.type === "expense") {
          // 決済手段に応じた残高変動と引き落とし予定日の判定
          if (item.paymentMethodId) {
            const [pm] = await tx
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
                await tx
                  .update(schema.accounts)
                  .set({ balance: sql`${schema.accounts.balance} - ${item.amount}` })
                  .where(eq(schema.accounts.id, pm.sourceAccountId));
                isSettled = true;
              } else if (pm.type === "cash") {
                // 現金決済で引き落とし元が未設定の場合、手元現金口座を自動特定して減額
                const [cashAcc] = await tx
                  .select()
                  .from(schema.accounts)
                  .where(eq(schema.accounts.type, "cash"))
                  .limit(1);
                if (cashAcc) {
                  await tx
                    .update(schema.accounts)
                    .set({ balance: sql`${schema.accounts.balance} - ${item.amount}` })
                    .where(eq(schema.accounts.id, cashAcc.id));
                }
                isSettled = true;
              } else if (pm.type === "qr_code") {
                // QR決済で引き落とし元が未設定の場合、プリペイド残高口座を自動特定して減額
                const [walletAcc] = await tx
                  .select()
                  .from(schema.accounts)
                  .where(eq(schema.accounts.type, "prepaid_wallet"))
                  .limit(1);
                if (walletAcc) {
                  await tx
                    .update(schema.accounts)
                    .set({ balance: sql`${schema.accounts.balance} - ${item.amount}` })
                    .where(eq(schema.accounts.id, walletAcc.id));
                }
                isSettled = true;
              }
            }
          }

          // 貯蓄・投資等で移動先口座（toAccountId）が指定されている場合、移動先口座へ残高加算
          if (item.toAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} + ${item.amount}` })
              .where(eq(schema.accounts.id, item.toAccountId));
          }
        }

        // 明細レコード作成 (支出レコード)
        await tx.insert(schema.transactions).values({
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

        // タグの紐付け処理
        const targetTagIds = new Set<string>();
        if (item.tagIds && Array.isArray(item.tagIds)) {
          item.tagIds.forEach((id) => {
            if (id) targetTagIds.add(id);
          });
        }
        if (item.tags && Array.isArray(item.tags)) {
          for (const tagName of item.tags) {
            const clean = tagName.trim().replace(/^#+/, "");
            if (!clean) continue;
            const [existing] = await tx
              .select()
              .from(schema.tags)
              .where(eq(schema.tags.name, clean))
              .limit(1);
            if (existing) {
              targetTagIds.add(existing.id);
            } else {
              const newTagId = `tag_${crypto.randomUUID().replace(/-/g, "")}`;
              await tx.insert(schema.tags).values({
                id: newTagId,
                name: clean,
                color: "#10B981",
              });
              targetTagIds.add(newTagId);
            }
          }
        }

        for (const tId of targetTagIds) {
          await tx.insert(schema.transactionTags).values({
            transactionId: txId,
            tagId: tId,
          });
        }

        // 監査ログ記録
        await tx.insert(schema.auditLogs).values({
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
          const [destAcc] = await tx
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.id, item.toAccountId))
            .limit(1);

          await tx.insert(schema.transactions).values({
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
            parentTransactionId: txId,
          });

          await tx.insert(schema.auditLogs).values({
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
    });

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
    const { db, schema } = getTenantDb(session.schemaName);
    const {
      id,
      date,
      amount,
      categoryId,
      paymentMethodId,
      fromAccountId,
      toAccountId,
      shopName,
      note,
      tagIds,
    } = await req.json();

    if (!id || amount === undefined || amount === null) {
      return NextResponse.json({ error: "更新パラメータが不足しています。" }, { status: 400 });
    }

    if (!isValidAmount(amount)) {
      return NextResponse.json({ error: "金額は1〜9,999,999,999円の整数で入力してください。" }, { status: 400 });
    }

    if (date !== undefined && (typeof date !== "string" || !normalizeDate(date))) {
      return NextResponse.json({ error: "日付の形式が不正です。" }, { status: 400 });
    }

    const newAmount = parseValidAmount(amount)!;

    await db.transaction(async (tx) => {
      // 既存明細の取得
      const [existingTx] = await tx
        .select()
        .from(schema.transactions)
        .where(and(eq(schema.transactions.id, id), isNull(schema.transactions.deletedAt)))
        .limit(1);

      if (!existingTx) {
        throw new Error("NOT_FOUND");
      }

      const targetPmId =
        existingTx.type === "expense"
          ? paymentMethodId !== undefined
            ? paymentMethodId
            : existingTx.paymentMethodId
          : existingTx.paymentMethodId;
      const targetDate = date || existingTx.date;
      const targetShopName = shopName !== undefined ? shopName : existingTx.shopName;
      const targetNote = note !== undefined ? note : existingTx.note;
      const targetFromAccountId =
        fromAccountId !== undefined ? fromAccountId : existingTx.fromAccountId;
      const targetToAccountId = toAccountId !== undefined ? toAccountId : existingTx.toAccountId;
      const targetCategoryId =
        categoryId !== undefined ? categoryId || null : existingTx.categoryId;

      let isSettled = false;
      let scheduledWithdrawalDate: string | null = null;

      if (existingTx.type === "transfer") {
        // 振替明細: 旧残高ロールバックと新残高反映
        if (existingTx.isSettled) {
          if (existingTx.fromAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} + ${existingTx.amount}` })
              .where(eq(schema.accounts.id, existingTx.fromAccountId));
          }
          if (!existingTx.parentTransactionId && existingTx.toAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
              .where(eq(schema.accounts.id, existingTx.toAccountId));
          }
        }

        if (targetFromAccountId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} - ${newAmount}` })
            .where(eq(schema.accounts.id, targetFromAccountId));
        }
        if (!existingTx.parentTransactionId && targetToAccountId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} + ${newAmount}` })
            .where(eq(schema.accounts.id, targetToAccountId));
        }
        isSettled = true;
      } else if (existingTx.type === "income") {
        // 収入明細: 旧受入口座残高ロールバックと新金額加算
        if (existingTx.isSettled && existingTx.toAccountId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
            .where(eq(schema.accounts.id, existingTx.toAccountId));
        }
        if (targetToAccountId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} + ${newAmount}` })
            .where(eq(schema.accounts.id, targetToAccountId));
          isSettled = true;
        }
      } else {
        // 1. 旧明細が即時決済（isSettled）だった場合、旧出金元口座の残高を元に戻す (ロールバック)
        if (existingTx.isSettled && existingTx.paymentMethodId) {
          const [oldPm] = await tx
            .select()
            .from(schema.paymentMethods)
            .where(eq(schema.paymentMethods.id, existingTx.paymentMethodId))
            .limit(1);

          let oldSourceAccId = oldPm?.sourceAccountId;
          if (!oldSourceAccId && oldPm?.type === "cash") {
            const [c] = await tx.select().from(schema.accounts).where(eq(schema.accounts.type, "cash")).limit(1);
            oldSourceAccId = c?.id;
          } else if (!oldSourceAccId && oldPm?.type === "qr_code") {
            const [w] = await tx.select().from(schema.accounts).where(eq(schema.accounts.type, "prepaid_wallet")).limit(1);
            oldSourceAccId = w?.id;
          }

          if (oldSourceAccId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} + ${existingTx.amount}` })
              .where(eq(schema.accounts.id, oldSourceAccId));
          }
        }

        // 2. 旧明細が投資・積立支出（type === "expense" かつ toAccountId）だった場合、旧受入先口座の残高を戻す (減額ロールバック)
        if (existingTx.type === "expense" && existingTx.toAccountId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
            .where(eq(schema.accounts.id, existingTx.toAccountId));
        }

        // 3. 新しい支払手段に応じた残高減額と決済状態の計算
        if (targetPmId) {
          const [newPm] = await tx
            .select()
            .from(schema.paymentMethods)
            .where(eq(schema.paymentMethods.id, targetPmId))
            .limit(1);

          if (newPm) {
            if (newPm.type === "credit_card") {
              // クレジットカード: 即時決済せず、引き落とし予定日を計算
              scheduledWithdrawalDate = calculateWithdrawalDate(
                targetDate,
                newPm.closingDay || 99,
                newPm.withdrawalDay || 27,
                newPm.withdrawalMonthOffset ?? 1
              );
              isSettled = false;
            } else {
              // 即時決済 (現金, QR, デビット等): 口座から即座に減額
              let newSourceAccId = newPm.sourceAccountId;
              if (!newSourceAccId && newPm.type === "cash") {
                const [c] = await tx.select().from(schema.accounts).where(eq(schema.accounts.type, "cash")).limit(1);
                newSourceAccId = c?.id;
              } else if (!newSourceAccId && newPm.type === "qr_code") {
                const [w] = await tx.select().from(schema.accounts).where(eq(schema.accounts.type, "prepaid_wallet")).limit(1);
                newSourceAccId = w?.id;
              }

              if (newSourceAccId) {
                await tx
                  .update(schema.accounts)
                  .set({ balance: sql`${schema.accounts.balance} - ${newAmount}` })
                  .where(eq(schema.accounts.id, newSourceAccId));
              }
              isSettled = true;
            }
          }
        }
      }

      // 4. 投資・積立支出の移動先口座残高加算 & 連動受入明細の更新/作成/削除
      if (existingTx.type === "expense") {
        // ペア受入明細の特定 (1. parentTransactionId 検索、2. クエリ特定フォールバック)
        let [linkedTx] = await tx
          .select()
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.parentTransactionId, existingTx.id),
              isNull(schema.transactions.deletedAt)
            )
          )
          .limit(1);

        if (!linkedTx && existingTx.toAccountId) {
          const candidates = await tx
            .select()
            .from(schema.transactions)
            .where(
              and(
                eq(schema.transactions.type, "transfer"),
                eq(schema.transactions.toAccountId, existingTx.toAccountId),
                eq(schema.transactions.date, existingTx.date),
                eq(schema.transactions.amount, existingTx.amount),
                isNull(schema.transactions.deletedAt)
              )
            )
            .limit(1);
          linkedTx = candidates[0];
        }

        if (targetToAccountId) {
          // 新移動先口座へ残高加算
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} + ${newAmount}` })
            .where(eq(schema.accounts.id, targetToAccountId));

          if (linkedTx) {
            // 既存受入明細の更新
            await tx
              .update(schema.transactions)
              .set({
                amount: newAmount,
                date: targetDate,
                toAccountId: targetToAccountId,
                shopName: `${targetShopName || "積立・投資"} (受入)`,
                note: `資金移動受入: [${targetNote || ""}]`,
                parentTransactionId: existingTx.id,
                updatedAt: new Date(),
              })
              .where(eq(schema.transactions.id, linkedTx.id));

            await tx.insert(schema.auditLogs).values({
              id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
              userId: session.userId,
              operatorUserId: session.userId,
              action: "UPDATE",
              entityType: "transaction",
              entityId: linkedTx.id,
              summary: `受入振替明細の連動更新 (${existingTx.amount}円 → ${newAmount}円)`,
              beforeDataJson: linkedTx,
              afterDataJson: {
                amount: newAmount,
                date: targetDate,
                toAccountId: targetToAccountId,
                parentTransactionId: existingTx.id,
              },
            });
          } else {
            // 受入明細がまだ存在しない場合、新規作成
            const newIncomeTxId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
            const [destAcc] = await tx
              .select()
              .from(schema.accounts)
              .where(eq(schema.accounts.id, targetToAccountId))
              .limit(1);

            await tx.insert(schema.transactions).values({
              id: newIncomeTxId,
              userId: session.userId,
              type: "transfer",
              date: targetDate,
              amount: newAmount,
              toAccountId: targetToAccountId,
              shopName: `${targetShopName || "積立・投資"} (受入)`,
              note: `資金移動受入: ${destAcc?.name || "貯蓄口座"} [${targetNote || ""}]`,
              isSettled: true,
              parentTransactionId: existingTx.id,
              checkpointId: existingTx.checkpointId,
            });

            await tx.insert(schema.auditLogs).values({
              id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
              userId: session.userId,
              operatorUserId: session.userId,
              action: "CREATE",
              entityType: "transaction",
              entityId: newIncomeTxId,
              summary: `${destAcc?.name || "移動先口座"} への資金移動・積立受入連動作成 (${newAmount}円)`,
              afterDataJson: {
                type: "transfer",
                amount: newAmount,
                toAccountId: targetToAccountId,
                parentTransactionId: existingTx.id,
              },
              checkpointId: existingTx.checkpointId,
            });
          }
        } else if (linkedTx) {
          // targetToAccountId が解除された場合、受入明細を論理削除
          await tx
            .update(schema.transactions)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.transactions.id, linkedTx.id));

          await tx.insert(schema.auditLogs).values({
            id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
            userId: session.userId,
            operatorUserId: session.userId,
            action: "DELETE",
            entityType: "transaction",
            entityId: linkedTx.id,
            summary: `投資・積立先解除に伴う受入明細の連動削除 (${linkedTx.amount}円)`,
            beforeDataJson: linkedTx,
          });
        }
      }

      // 5. 親明細の更新実行
      await tx
        .update(schema.transactions)
        .set({
          date: targetDate,
          amount: newAmount,
          categoryId: targetCategoryId,
          paymentMethodId: targetPmId,
          fromAccountId: targetFromAccountId || null,
          toAccountId: targetToAccountId || null,
          shopName: targetShopName,
          note: targetNote,
          isSettled,
          scheduledWithdrawalDate,
          updatedAt: new Date(),
        })
        .where(eq(schema.transactions.id, id));

      // タグの紐付け更新
      if (tagIds !== undefined && Array.isArray(tagIds)) {
        await tx
          .delete(schema.transactionTags)
          .where(eq(schema.transactionTags.transactionId, id));

        for (const tId of tagIds) {
          if (tId) {
            await tx.insert(schema.transactionTags).values({
              transactionId: id,
              tagId: tId,
            });
          }
        }
      }

      // 監査ログ記録
      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "UPDATE",
        entityType: "transaction",
        entityId: id,
        summary: `${targetShopName || "明細"} の修正 (${existingTx.amount}円 → ${newAmount}円)`,
        beforeDataJson: existingTx,
        afterDataJson: {
          date: targetDate,
          amount: newAmount,
          categoryId,
          paymentMethodId: targetPmId,
          toAccountId: targetToAccountId,
          shopName: targetShopName,
          note: targetNote,
          isSettled,
        },
      });
    });

    logger.info({ userId: session.userId, txId: id }, "Transaction updated successfully with balance sync");

    return NextResponse.json({ success: true, message: "明細を更新しました。" });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "対象の明細が見つかりません。" }, { status: 404 });
    }
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
    const { db, schema } = getTenantDb(session.schemaName);
    const txId = req.nextUrl.searchParams.get("id");

    if (!txId) {
      return NextResponse.json({ error: "明細IDが指定されていません。" }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      const [existingTx] = await tx
        .select()
        .from(schema.transactions)
        .where(and(eq(schema.transactions.id, txId), isNull(schema.transactions.deletedAt)))
        .limit(1);

      if (!existingTx) {
        throw new Error("NOT_FOUND");
      }

      // 1. 出金元・受入先口座の残高ロールバック (即時決済されていた場合)
      if (existingTx.type === "transfer" && !existingTx.parentTransactionId) {
        if (existingTx.isSettled) {
          if (existingTx.fromAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} + ${existingTx.amount}` })
              .where(eq(schema.accounts.id, existingTx.fromAccountId));
          }
          if (existingTx.toAccountId) {
            await tx
              .update(schema.accounts)
              .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
              .where(eq(schema.accounts.id, existingTx.toAccountId));
          }
        }
      } else if (existingTx.type === "income") {
        if (existingTx.isSettled && existingTx.toAccountId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
            .where(eq(schema.accounts.id, existingTx.toAccountId));
        }
      } else if (existingTx.isSettled && existingTx.paymentMethodId) {
        const [pm] = await tx
          .select()
          .from(schema.paymentMethods)
          .where(eq(schema.paymentMethods.id, existingTx.paymentMethodId))
          .limit(1);

        let sourceAccId = pm?.sourceAccountId;
        if (!sourceAccId && pm?.type === "cash") {
          const [c] = await tx.select().from(schema.accounts).where(eq(schema.accounts.type, "cash")).limit(1);
          sourceAccId = c?.id;
        } else if (!sourceAccId && pm?.type === "qr_code") {
          const [w] = await tx.select().from(schema.accounts).where(eq(schema.accounts.type, "prepaid_wallet")).limit(1);
          sourceAccId = w?.id;
        }

        if (sourceAccId) {
          await tx
            .update(schema.accounts)
            .set({ balance: sql`${schema.accounts.balance} + ${existingTx.amount}` })
            .where(eq(schema.accounts.id, sourceAccId));
        }
      }

      // 2. 投資・積立支出だった場合、受入先口座の残高ロールバック & 連動受入明細の論理削除
      if (existingTx.type === "expense" && existingTx.toAccountId) {
        // 受入先口座から加算されていた分を減額してロールバック
        await tx
          .update(schema.accounts)
          .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
          .where(eq(schema.accounts.id, existingTx.toAccountId));

        // ペア受入明細の特定 (1. parentTransactionId 検索、2. クエリ特定フォールバック)
        let [linkedTx] = await tx
          .select()
          .from(schema.transactions)
          .where(
            and(
              eq(schema.transactions.parentTransactionId, existingTx.id),
              isNull(schema.transactions.deletedAt)
            )
          )
          .limit(1);

        if (!linkedTx) {
          const candidates = await tx
            .select()
            .from(schema.transactions)
            .where(
              and(
                eq(schema.transactions.type, "transfer"),
                eq(schema.transactions.toAccountId, existingTx.toAccountId),
                eq(schema.transactions.date, existingTx.date),
                eq(schema.transactions.amount, existingTx.amount),
                isNull(schema.transactions.deletedAt)
              )
            )
            .limit(1);
          linkedTx = candidates[0];
        }

        if (linkedTx) {
          await tx
            .update(schema.transactions)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.transactions.id, linkedTx.id));

          await tx.insert(schema.auditLogs).values({
            id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
            userId: session.userId,
            operatorUserId: session.userId,
            action: "DELETE",
            entityType: "transaction",
            entityId: linkedTx.id,
            summary: `親支出明細の削除に伴う受入振替明細の連動削除 (${linkedTx.amount}円)`,
            beforeDataJson: linkedTx,
          });
        }
      }

      // 3. 受入振替明細が直接削除された場合の安全処理 (親明細の toAccountId 解除 & 受入先残高減額)
      if (existingTx.type === "transfer" && existingTx.parentTransactionId && existingTx.toAccountId) {
        await tx
          .update(schema.accounts)
          .set({ balance: sql`${schema.accounts.balance} - ${existingTx.amount}` })
          .where(eq(schema.accounts.id, existingTx.toAccountId));

        await tx
          .update(schema.transactions)
          .set({ toAccountId: null, updatedAt: new Date() })
          .where(eq(schema.transactions.id, existingTx.parentTransactionId));
      }

      // 4. 対象明細の論理削除
      await tx
        .update(schema.transactions)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.transactions.id, txId));

      // 5. 監査ログ記録
      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "DELETE",
        entityType: "transaction",
        entityId: txId,
        summary: `${existingTx.shopName || "明細"} (${existingTx.amount}円) の削除`,
        beforeDataJson: existingTx,
      });
    });

    logger.info({ userId: session.userId, txId }, "Transaction deleted successfully");

    return NextResponse.json({ success: true, message: "明細を削除しました。" });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "対象の明細が見つかりません。" }, { status: 404 });
    }
    logger.error({ error }, "Error deleting transaction");
    return NextResponse.json({ error: "明細の削除処理中にエラーが発生しました。" }, { status: 500 });
  }
}
