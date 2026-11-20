import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { logger } from "@/lib/logger";
import { isValidIsoDateString } from "@/lib/goal-helpers";
import {
  getDaysInMonth,
  getTodayJstIsoDate,
  isDueForAutoSettlement,
  resolveEffectiveDayOfMonth,
  resolveTargetCycleAndDates,
  shouldGenerateRecurringCycle,
  validateRecurringTemplateInput,
  type PaymentMethodWithdrawalInfo,
  type ValidatedRecurringTemplateInput,
} from "@/lib/recurring-helpers";
import type { RecurringTemplateItem, RecurringTemplateType } from "@/types";

class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type TenantDb = ReturnType<typeof getTenantDb>["db"];
type TenantSchema = ReturnType<typeof getTenantDb>["schema"];
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

interface SyncExecutionResult {
  generatedCount: number;
  settledCount: number;
  generatedTransactionIds: string[];
  settledTransactionIds: string[];
}

/**
 * 支出明細の出金元口座IDを解決する
 * 優先順位: paymentMethod.sourceAccountId -> cash/qr_code 自動特定 -> tx.fromAccountId
 */
async function resolveExpenseSourceAccountId(
  tx: TenantTx | TenantDb,
  schema: TenantSchema,
  paymentMethodId: string | null,
  fromAccountId: string | null
): Promise<{ sourceAccountId: string | null; paymentMethodType: string | null }> {
  let paymentMethodType: string | null = null;
  let sourceAccountId: string | null = null;

  if (paymentMethodId) {
    const [pm] = await tx
      .select()
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, paymentMethodId))
      .limit(1);

    if (pm) {
      paymentMethodType = pm.type;
      sourceAccountId = pm.sourceAccountId ?? null;

      if (!sourceAccountId && pm.type === "cash") {
        const [cashAcc] = await tx
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.type, "cash"))
          .limit(1);
        sourceAccountId = cashAcc?.id ?? null;
      } else if (!sourceAccountId && pm.type === "qr_code") {
        const [walletAcc] = await tx
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.type, "prepaid_wallet"))
          .limit(1);
        sourceAccountId = walletAcc?.id ?? null;
      }
    }
  }

  if (!sourceAccountId && fromAccountId) {
    sourceAccountId = fromAccountId;
  }

  return { sourceAccountId, paymentMethodType };
}

/**
 * 関連マスタIDの存在検証および決済手段情報の取得
 */
async function validateAndResolveReferences(
  db: TenantDb,
  schema: TenantSchema,
  body: Record<string, unknown>
): Promise<{ paymentMethod: PaymentMethodWithdrawalInfo | null; validated: ValidatedRecurringTemplateInput }> {
  const rawPmId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
  let paymentMethodInfo: PaymentMethodWithdrawalInfo | null = null;

  if (body.type === "expense" && rawPmId.length > 0) {
    const [pm] = await db
      .select()
      .from(schema.paymentMethods)
      .where(and(eq(schema.paymentMethods.id, rawPmId), eq(schema.paymentMethods.isActive, true)))
      .limit(1);

    if (!pm) {
      throw new ApiHttpError(400, "指定された決済手段が見つからないか、無効化されています。");
    }
    paymentMethodInfo = { type: pm.type, withdrawalDay: pm.withdrawalDay };
  }

  const validation = validateRecurringTemplateInput(body, paymentMethodInfo);
  if (!validation.ok) {
    throw new ApiHttpError(400, validation.error);
  }
  const validated = validation.data;

  if (validated.categoryId) {
    const [cat] = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(and(eq(schema.categories.id, validated.categoryId), eq(schema.categories.isArchived, false)))
      .limit(1);
    if (!cat) {
      throw new ApiHttpError(400, "指定された費目が見つからないか、アーカイブ済みです。");
    }
  }

  if (validated.fromAccountId) {
    const [fromAcc] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, validated.fromAccountId), eq(schema.accounts.isActive, true)))
      .limit(1);
    if (!fromAcc) {
      throw new ApiHttpError(400, "指定された出金元口座が見つからないか、無効化されています。");
    }
  }

  if (validated.toAccountId) {
    const [toAcc] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, validated.toAccountId), eq(schema.accounts.isActive, true)))
      .limit(1);
    if (!toAcc) {
      throw new ApiHttpError(400, "指定された入金先口座が見つからないか、無効化されています。");
    }
  }

  return { paymentMethod: paymentMethodInfo, validated };
}

/**
 * テンプレートから対象サイクルの支払い予定（未精算）明細を1件生成する
 * 既に該当サイクル月の明細が存在する場合は二重生成せず lastGeneratedMonth のみ同期する
 */
async function generateRecurringCycleTransactionInTx(params: {
  tx: TenantTx;
  schema: TenantSchema;
  userId: string;
  template: {
    id: string;
    userId: string;
    type: string;
    title: string;
    amount: number;
    categoryId: string | null;
    paymentMethodId: string | null;
    fromAccountId: string | null;
    toAccountId: string | null;
    dayOfMonth: number;
    note: string | null;
    isActive: boolean;
    lastGeneratedMonth: string | null;
  };
  effectiveDayOfMonth: number;
  referenceDateStr: string;
  checkpointId?: string;
}): Promise<string | null> {
  const { tx, schema, userId, template, effectiveDayOfMonth, referenceDateStr, checkpointId } = params;

  const { targetCycleMonth, scheduledWithdrawalDate, date } = resolveTargetCycleAndDates(
    referenceDateStr,
    effectiveDayOfMonth
  );

  if (
    !shouldGenerateRecurringCycle({
      isActive: template.isActive,
      lastGeneratedMonth: template.lastGeneratedMonth,
      targetCycleMonth,
    })
  ) {
    return null;
  }

  // 同一テンプレート & 同一サイクル月の未削除明細が既に存在する場合は二重生成しない
  const [cycleYearStr, cycleMonthStr] = targetCycleMonth.split("-");
  const cycleLastDay = getDaysInMonth(Number(cycleYearStr), Number(cycleMonthStr));
  const cycleStart = `${targetCycleMonth}-01`;
  const cycleEnd = `${targetCycleMonth}-${String(cycleLastDay).padStart(2, "0")}`;

  const [existingCycleTx] = await tx
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.recurringTemplateId, template.id),
        isNull(schema.transactions.deletedAt),
        isNull(schema.transactions.parentTransactionId),
        gte(schema.transactions.scheduledWithdrawalDate, cycleStart),
        lte(schema.transactions.scheduledWithdrawalDate, cycleEnd)
      )
    )
    .limit(1);

  if (existingCycleTx) {
    await tx
      .update(schema.recurringTemplates)
      .set({ lastGeneratedMonth: targetCycleMonth, updatedAt: new Date() })
      .where(eq(schema.recurringTemplates.id, template.id));
    return null;
  }

  const newTxId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;

  await tx.insert(schema.transactions).values({
    id: newTxId,
    userId,
    type: template.type,
    date,
    amount: template.amount,
    categoryId: template.type === "expense" ? template.categoryId : null,
    paymentMethodId: template.type === "expense" ? template.paymentMethodId : null,
    fromAccountId: template.fromAccountId,
    toAccountId: template.toAccountId,
    shopName: template.title,
    note: template.note ? `[定例] ${template.note}` : "[定例支払い予定]",
    isSettled: false,
    scheduledWithdrawalDate,
    checkpointId: checkpointId ?? null,
    recurringTemplateId: template.id,
  });

  await tx
    .update(schema.recurringTemplates)
    .set({ lastGeneratedMonth: targetCycleMonth, updatedAt: new Date() })
    .where(eq(schema.recurringTemplates.id, template.id));

  await tx.insert(schema.auditLogs).values({
    id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
    userId,
    operatorUserId: userId,
    action: "CREATE",
    entityType: "transaction",
    entityId: newTxId,
    summary: `定例支払い予定「${template.title}」(${targetCycleMonth} / ${template.amount.toLocaleString("ja-JP")}円) を自動追加しました`,
    afterDataJson: {
      recurringTemplateId: template.id,
      targetCycleMonth,
      scheduledWithdrawalDate,
      amount: template.amount,
      type: template.type,
      isSettled: false,
    },
    checkpointId: checkpointId ?? null,
  });

  return newTxId;
}

/**
 * 未精算の明細を確定精算し、口座残高・積立受入明細・監査ログを連動更新する
 */
async function settleRecurringTransactionInTx(params: {
  tx: TenantTx;
  schema: TenantSchema;
  userId: string;
  txRecord: {
    id: string;
    userId: string;
    type: string;
    date: string;
    amount: number;
    paymentMethodId: string | null;
    fromAccountId: string | null;
    toAccountId: string | null;
    shopName: string | null;
    note: string | null;
    isSettled: boolean;
    scheduledWithdrawalDate: string | null;
    recurringTemplateId: string | null;
  };
  checkpointId: string;
  reasonLabel: string;
}): Promise<void> {
  const { tx, schema, userId, txRecord, checkpointId, reasonLabel } = params;

  if (txRecord.isSettled) {
    return;
  }

  if (txRecord.type === "transfer") {
    if (txRecord.fromAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} - ${txRecord.amount}` })
        .where(eq(schema.accounts.id, txRecord.fromAccountId));
    }
    if (txRecord.toAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} + ${txRecord.amount}` })
        .where(eq(schema.accounts.id, txRecord.toAccountId));
    }
  } else if (txRecord.type === "income") {
    if (txRecord.toAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} + ${txRecord.amount}` })
        .where(eq(schema.accounts.id, txRecord.toAccountId));
    }
  } else if (txRecord.type === "expense") {
    const { sourceAccountId } = await resolveExpenseSourceAccountId(
      tx,
      schema,
      txRecord.paymentMethodId,
      txRecord.fromAccountId
    );

    if (sourceAccountId) {
      await tx
        .update(schema.accounts)
        .set({ balance: sql`${schema.accounts.balance} - ${txRecord.amount}` })
        .where(eq(schema.accounts.id, sourceAccountId));
    }

    if (txRecord.toAccountId) {
      const [existingLinked] = await tx
        .select({ id: schema.transactions.id })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.parentTransactionId, txRecord.id),
            isNull(schema.transactions.deletedAt)
          )
        )
        .limit(1);

      // 既に受入明細が存在する場合（非定例クレカ積立投資等）は受入口座への二重加算を防止
      if (!existingLinked) {
        await tx
          .update(schema.accounts)
          .set({ balance: sql`${schema.accounts.balance} + ${txRecord.amount}` })
          .where(eq(schema.accounts.id, txRecord.toAccountId));

        const [destAcc] = await tx
          .select({ name: schema.accounts.name })
          .from(schema.accounts)
          .where(eq(schema.accounts.id, txRecord.toAccountId))
          .limit(1);

        const incomeTxId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
        await tx.insert(schema.transactions).values({
          id: incomeTxId,
          userId: txRecord.userId,
          type: "transfer",
          date: txRecord.date,
          amount: txRecord.amount,
          toAccountId: txRecord.toAccountId,
          shopName: `${txRecord.shopName || "積立・投資"} (受入)`,
          note: `資金移動受入: ${destAcc?.name || "貯蓄口座"} [${txRecord.note || ""}]`,
          isSettled: true,
          checkpointId,
          parentTransactionId: txRecord.id,
          recurringTemplateId: txRecord.recurringTemplateId,
        });

        await tx.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId,
          operatorUserId: userId,
          action: "CREATE",
          entityType: "transaction",
          entityId: incomeTxId,
          summary: `${destAcc?.name || "移動先口座"} への定例積立受入 (${txRecord.amount.toLocaleString("ja-JP")}円)`,
          afterDataJson: {
            type: "transfer",
            amount: txRecord.amount,
            toAccountId: txRecord.toAccountId,
            parentTransactionId: txRecord.id,
          },
          checkpointId,
        });
      }
    }
  }

  await tx
    .update(schema.transactions)
    .set({ isSettled: true, updatedAt: new Date() })
    .where(eq(schema.transactions.id, txRecord.id));

  await tx.insert(schema.auditLogs).values({
    id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
    userId,
    operatorUserId: userId,
    action: "UPDATE",
    entityType: "transaction",
    entityId: txRecord.id,
    summary: `定例支払い予定「${txRecord.shopName || "明細"}」(${txRecord.amount.toLocaleString("ja-JP")}円) を${reasonLabel}により口座残高へ精算しました`,
    beforeDataJson: { isSettled: false },
    afterDataJson: { isSettled: true },
    checkpointId,
  });
}

/**
 * 月次同期処理 (1. 未生成サイクル予定明細の自動追加, 2. 支払予定日到来済みの非クレカ明細の自動精算)
 */
async function runRecurringSyncInTx(params: {
  tx: TenantTx;
  schema: TenantSchema;
  userId: string;
  referenceDateStr: string;
}): Promise<SyncExecutionResult> {
  const { tx, schema, userId, referenceDateStr } = params;
  const generatedTransactionIds: string[] = [];
  const settledTransactionIds: string[] = [];

  const activeTemplates = await tx
    .select()
    .from(schema.recurringTemplates)
    .where(eq(schema.recurringTemplates.isActive, true))
    .orderBy(asc(schema.recurringTemplates.createdAt), asc(schema.recurringTemplates.id));

  const paymentMethods = await tx.select().from(schema.paymentMethods);
  const pmMap = new Map(paymentMethods.map((pm) => [pm.id, pm]));

  // チェックポイントを事前発行 (新規生成や精算が1件も起きない場合は挿入しない)
  const syncCheckpointId = `cp_${crypto.randomUUID().replace(/-/g, "")}`;
  let checkpointCreated = false;

  const ensureCheckpoint = async (description: string) => {
    if (checkpointCreated) return;
    await tx.insert(schema.checkpoints).values({
      id: syncCheckpointId,
      userId,
      description,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    checkpointCreated = true;
  };

  // 1. 有効テンプレートの未生成サイクル分の予定明細生成
  for (const tpl of activeTemplates) {
    const pm = tpl.paymentMethodId ? pmMap.get(tpl.paymentMethodId) ?? null : null;
    const effectiveDay =
      resolveEffectiveDayOfMonth({
        type: tpl.type as RecurringTemplateType,
        dayOfMonth: tpl.dayOfMonth,
        paymentMethod: pm ? { type: pm.type, withdrawalDay: pm.withdrawalDay } : null,
      }) ?? tpl.dayOfMonth;

    // 先に予定生成が必要か確認してチェックポイント作成を制御
    const { targetCycleMonth } = resolveTargetCycleAndDates(referenceDateStr, effectiveDay);
    if (
      shouldGenerateRecurringCycle({
        isActive: tpl.isActive,
        lastGeneratedMonth: tpl.lastGeneratedMonth,
        targetCycleMonth,
      })
    ) {
      await ensureCheckpoint(`定例支払い月次同期 (${referenceDateStr})`);
      const generatedId = await generateRecurringCycleTransactionInTx({
        tx,
        schema,
        userId,
        template: tpl,
        effectiveDayOfMonth: effectiveDay,
        referenceDateStr,
        checkpointId: syncCheckpointId,
      });
      if (generatedId) {
        generatedTransactionIds.push(generatedId);
      }
    }
  }

  // 2. 支払予定日到来済みの非クレカ未精算明細の自動残高精算
  const dueCandidates = await tx
    .select()
    .from(schema.transactions)
    .where(
      and(
        isNotNull(schema.transactions.recurringTemplateId),
        isNull(schema.transactions.parentTransactionId),
        isNull(schema.transactions.deletedAt),
        eq(schema.transactions.isSettled, false),
        lte(schema.transactions.scheduledWithdrawalDate, referenceDateStr)
      )
    )
    .orderBy(asc(schema.transactions.scheduledWithdrawalDate), asc(schema.transactions.createdAt));

  for (const candidate of dueCandidates) {
    const pm = candidate.paymentMethodId ? pmMap.get(candidate.paymentMethodId) ?? null : null;
    if (!isDueForAutoSettlement(candidate, pm?.type ?? null, referenceDateStr)) {
      continue;
    }

    await ensureCheckpoint(`定例支払い月次同期 (${referenceDateStr})`);
    await settleRecurringTransactionInTx({
      tx,
      schema,
      userId,
      txRecord: candidate,
      checkpointId: syncCheckpointId,
      reasonLabel: "支払予定日到来による自動精算",
    });
    settledTransactionIds.push(candidate.id);
  }

  return {
    generatedCount: generatedTransactionIds.length,
    settledCount: settledTransactionIds.length,
    generatedTransactionIds,
    settledTransactionIds,
  };
}

/**
 * 結合済みテンプレート一覧を取得する
 */
async function fetchEnrichedTemplates(
  db: TenantDb | TenantTx,
  schema: TenantSchema
): Promise<RecurringTemplateItem[]> {
  const rows = await db
    .select()
    .from(schema.recurringTemplates)
    .orderBy(asc(schema.recurringTemplates.createdAt), asc(schema.recurringTemplates.id));

  const [cats, pms, accs] = await Promise.all([
    db.select().from(schema.categories),
    db.select().from(schema.paymentMethods),
    db.select().from(schema.accounts),
  ]);

  const catMap = new Map(cats.map((c) => [c.id, c]));
  const pmMap = new Map(pms.map((p) => [p.id, p]));
  const accMap = new Map(accs.map((a) => [a.id, a]));

  return rows.map((row) => {
    const cat = row.categoryId ? catMap.get(row.categoryId) : undefined;
    const pm = row.paymentMethodId ? pmMap.get(row.paymentMethodId) : undefined;
    const fromAcc = row.fromAccountId ? accMap.get(row.fromAccountId) : undefined;
    const toAcc = row.toAccountId ? accMap.get(row.toAccountId) : undefined;

    return {
      id: row.id,
      userId: row.userId,
      type: row.type as RecurringTemplateType,
      title: row.title,
      amount: row.amount,
      categoryId: row.categoryId,
      categoryName: cat?.name ?? null,
      categoryIcon: cat?.icon ?? null,
      categoryColor: cat?.color ?? null,
      paymentMethodId: row.paymentMethodId,
      paymentMethodName: pm?.name ?? null,
      paymentMethodType: (pm?.type as RecurringTemplateItem["paymentMethodType"]) ?? null,
      fromAccountId: row.fromAccountId,
      fromAccountName: fromAcc?.name ?? null,
      toAccountId: row.toAccountId,
      toAccountName: toAcc?.name ?? null,
      dayOfMonth: row.dayOfMonth,
      note: row.note,
      isActive: row.isActive,
      lastGeneratedMonth: row.lastGeneratedMonth,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

// GET: 定例支払いテンプレート一覧取得 (autoSync=true 時は月次同期も冪等実行)
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const autoSync = req.nextUrl.searchParams.get("autoSync") === "true";

    let syncResult = { generatedCount: 0, settledCount: 0 };

    if (autoSync) {
      const todayStr = getTodayJstIsoDate();
      const result = await db.transaction(async (tx) => {
        return runRecurringSyncInTx({
          tx,
          schema,
          userId: session.userId,
          referenceDateStr: todayStr,
        });
      });
      syncResult = {
        generatedCount: result.generatedCount,
        settledCount: result.settledCount,
      };
    }

    const templates = await fetchEnrichedTemplates(db, schema);

    return NextResponse.json({
      templates,
      syncResult,
    });
  } catch (error) {
    logger.error({ error }, "Error fetching recurring templates");
    return NextResponse.json({ error: "定例支払いテンプレートの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 新規テンプレート登録 / 月次同期手動実行 / 支払い予定明細の手動確定精算
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

  const action = typeof body?.action === "string" ? body.action.trim() : "create";

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    // モード 2: 月次自動追加 & 支払日到来精算の手動同期実行
    if (action === "sync") {
      let referenceDateStr = getTodayJstIsoDate();
      if (body.referenceDate !== undefined && body.referenceDate !== null && body.referenceDate !== "") {
        if (typeof body.referenceDate !== "string" || !isValidIsoDateString(body.referenceDate.trim())) {
          return NextResponse.json({ error: "基準日（referenceDate）は YYYY-MM-DD 形式で指定してください。" }, { status: 400 });
        }
        referenceDateStr = body.referenceDate.trim();
      }

      const result = await db.transaction(async (tx) => {
        return runRecurringSyncInTx({
          tx,
          schema,
          userId: session.userId,
          referenceDateStr,
        });
      });

      return NextResponse.json({
        success: true,
        ...result,
        message: `月次同期を完了しました（予定追加: ${result.generatedCount}件、自動精算: ${result.settledCount}件）。`,
      });
    }

    // モード 3: 未精算支払い予定明細の手動確定精算
    if (action === "settle") {
      const transactionId = typeof body?.transactionId === "string" ? body.transactionId.trim() : "";
      if (!transactionId) {
        return NextResponse.json({ error: "精算対象の明細IDを指定してください。" }, { status: 400 });
      }

      await db.transaction(async (tx) => {
        const [targetTx] = await tx
          .select()
          .from(schema.transactions)
          .where(and(eq(schema.transactions.id, transactionId), isNull(schema.transactions.deletedAt)))
          .limit(1);

        if (!targetTx) {
          throw new ApiHttpError(404, "指定された明細が見つかりません。");
        }

        if (targetTx.isSettled) {
          throw new ApiHttpError(400, "この明細は既に精算済みです。");
        }

        const checkpointId = `cp_${crypto.randomUUID().replace(/-/g, "")}`;
        await tx.insert(schema.checkpoints).values({
          id: checkpointId,
          userId: session.userId,
          description: `定例支払い予定の手動確定精算 (${targetTx.shopName || targetTx.id})`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await settleRecurringTransactionInTx({
          tx,
          schema,
          userId: session.userId,
          txRecord: targetTx,
          checkpointId,
          reasonLabel: "手動確定精算",
        });
      });

      return NextResponse.json({
        success: true,
        transactionId,
        message: "支払い予定明細を精算し、口座残高に反映しました。",
      });
    }

    if (action !== "create") {
      return NextResponse.json({ error: "不正な操作種別です。" }, { status: 400 });
    }

    // モード 1: 新規テンプレート登録
    const { paymentMethod, validated } = await validateAndResolveReferences(db, schema, body);
    const todayStr = getTodayJstIsoDate();

    const { templateId, generatedTransactionId } = await db.transaction(async (tx) => {
      const id = `tpl_${crypto.randomUUID().replace(/-/g, "")}`;
      const now = new Date();

      await tx.insert(schema.recurringTemplates).values({
        id,
        userId: session.userId,
        type: validated.type,
        title: validated.title,
        amount: validated.amount,
        categoryId: validated.categoryId,
        paymentMethodId: validated.paymentMethodId,
        fromAccountId: validated.fromAccountId,
        toAccountId: validated.toAccountId,
        dayOfMonth: validated.dayOfMonth,
        note: validated.note,
        isActive: validated.isActive,
        lastGeneratedMonth: null,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "CREATE",
        entityType: "recurring_template",
        entityId: id,
        summary: `定例支払いテンプレート「${validated.title}」(${validated.amount.toLocaleString("ja-JP")}円) を作成しました`,
        afterDataJson: { id, ...validated },
      });

      let firstTxId: string | null = null;
      if (validated.isActive) {
        const checkpointId = `cp_${crypto.randomUUID().replace(/-/g, "")}`;
        await tx.insert(schema.checkpoints).values({
          id: checkpointId,
          userId: session.userId,
          description: `定例支払いテンプレート登録に伴う初回予定追加 (${validated.title})`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        const effectiveDay =
          resolveEffectiveDayOfMonth({
            type: validated.type,
            dayOfMonth: validated.dayOfMonth,
            paymentMethod,
          }) ?? validated.dayOfMonth;

        firstTxId = await generateRecurringCycleTransactionInTx({
          tx,
          schema,
          userId: session.userId,
          template: {
            id,
            userId: session.userId,
            type: validated.type,
            title: validated.title,
            amount: validated.amount,
            categoryId: validated.categoryId,
            paymentMethodId: validated.paymentMethodId,
            fromAccountId: validated.fromAccountId,
            toAccountId: validated.toAccountId,
            dayOfMonth: validated.dayOfMonth,
            note: validated.note,
            isActive: validated.isActive,
            lastGeneratedMonth: null,
          },
          effectiveDayOfMonth: effectiveDay,
          referenceDateStr: todayStr,
          checkpointId,
        });
      }

      return { templateId: id, generatedTransactionId: firstTxId };
    });

    const templates = await fetchEnrichedTemplates(db, schema);
    const createdTemplate = templates.find((t) => t.id === templateId) ?? null;

    return NextResponse.json({
      success: true,
      id: templateId,
      template: createdTemplate,
      generatedTransactionId,
      message: generatedTransactionId
        ? `定例支払いテンプレート「${validated.title}」を登録し、対象サイクルの支払い予定明細を追加しました。`
        : `定例支払いテンプレート「${validated.title}」を登録しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error in POST /api/recurring-templates");
    return NextResponse.json({ error: "定例支払いテンプレートの処理に失敗しました。" }, { status: 500 });
  }
}

// PUT: テンプレート編集 / 有効・一時停止切替
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

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "テンプレートIDを指定してください。" }, { status: 400 });
  }

  const action = typeof body?.action === "string" ? body.action.trim() : "update";
  if (action !== "update" && action !== "toggle") {
    return NextResponse.json({ error: "不正な操作種別です。" }, { status: 400 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    const [existing] = await db
      .select()
      .from(schema.recurringTemplates)
      .where(eq(schema.recurringTemplates.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "指定された定例支払いテンプレートが見つかりません。" }, { status: 404 });
    }

    if (action === "toggle") {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json({ error: "有効フラグ（isActive）を真偽値で指定してください。" }, { status: 400 });
      }
      const nextActive = body.isActive;

      await db.transaction(async (tx) => {
        await tx
          .update(schema.recurringTemplates)
          .set({ isActive: nextActive, updatedAt: new Date() })
          .where(eq(schema.recurringTemplates.id, id));

        await tx.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "UPDATE",
          entityType: "recurring_template",
          entityId: id,
          summary: `定例支払いテンプレート「${existing.title}」を${nextActive ? "有効化" : "一時停止"}しました`,
          beforeDataJson: { isActive: existing.isActive },
          afterDataJson: { isActive: nextActive },
        });
      });

      const templates = await fetchEnrichedTemplates(db, schema);
      const updatedTemplate = templates.find((t) => t.id === id) ?? null;

      return NextResponse.json({
        success: true,
        template: updatedTemplate,
        message: nextActive ? "定例支払いテンプレートを再開しました。" : "定例支払いテンプレートを一時停止しました。",
      });
    }

    // action === "update"
    const { validated } = await validateAndResolveReferences(db, schema, body);

    await db.transaction(async (tx) => {
      const afterValues = {
        type: validated.type,
        title: validated.title,
        amount: validated.amount,
        categoryId: validated.categoryId,
        paymentMethodId: validated.paymentMethodId,
        fromAccountId: validated.fromAccountId,
        toAccountId: validated.toAccountId,
        dayOfMonth: validated.dayOfMonth,
        note: validated.note,
        isActive: validated.isActive,
        updatedAt: new Date(),
      };

      await tx
        .update(schema.recurringTemplates)
        .set(afterValues)
        .where(eq(schema.recurringTemplates.id, id));

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "UPDATE",
        entityType: "recurring_template",
        entityId: id,
        summary: `定例支払いテンプレート「${validated.title}」を更新しました`,
        beforeDataJson: existing,
        afterDataJson: afterValues,
      });
    });

    const templates = await fetchEnrichedTemplates(db, schema);
    const updatedTemplate = templates.find((t) => t.id === id) ?? null;

    return NextResponse.json({
      success: true,
      template: updatedTemplate,
      message: `定例支払いテンプレート「${validated.title}」を更新しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error updating recurring template");
    return NextResponse.json({ error: "定例支払いテンプレートの更新に失敗しました。" }, { status: 500 });
  }
}

// DELETE: テンプレートの物理削除 (生成済み明細は保持)
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "削除対象のテンプレートIDを指定してください。" }, { status: 400 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.recurringTemplates)
        .where(eq(schema.recurringTemplates.id, id))
        .limit(1);

      if (!existing) {
        throw new ApiHttpError(404, "指定された定例支払いテンプレートが見つかりません。");
      }

      await tx.delete(schema.recurringTemplates).where(eq(schema.recurringTemplates.id, id));

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "DELETE",
        entityType: "recurring_template",
        entityId: id,
        summary: `定例支払いテンプレート「${existing.title}」を削除しました（生成済み明細は保持）`,
        beforeDataJson: existing,
      });
    });

    return NextResponse.json({
      success: true,
      id,
      message: "定例支払いテンプレートを削除しました（既に追加済みの明細はそのまま保持されます）。",
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error deleting recurring template");
    return NextResponse.json({ error: "定例支払いテンプレートの削除に失敗しました。" }, { status: 500 });
  }
}
