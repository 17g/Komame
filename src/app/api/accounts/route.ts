import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";

// GET: 口座一覧 & 決済手段 & 資金色分け取得
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    // 1. 口座一覧 (論理削除されていないもの)
    const rawAccounts = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.isActive, true))
      .orderBy(schema.accounts.sortOrder);

    // 2. 色分け貯蓄（バーチャルロック）一覧
    const reservations = await db.select().from(schema.accountReservations);

    // 3. 口座ごとの実質利用可能残高の計算
    const accounts = rawAccounts.map((acc) => {
      const reserved = reservations
        .filter((r) => r.accountId === acc.id)
        .reduce((sum, r) => sum + r.amount, 0);

      return {
        ...acc,
        reservedAmount: reserved,
        availableBalance: acc.balance - reserved,
      };
    });

    // 4. 決済手段一覧 (論理削除されていないもの)
    const rawPaymentMethods = await db
      .select({
        id: schema.paymentMethods.id,
        name: schema.paymentMethods.name,
        type: schema.paymentMethods.type,
        sourceAccountId: schema.paymentMethods.sourceAccountId,
        sourceAccountName: schema.accounts.name,
        closingDay: schema.paymentMethods.closingDay,
        withdrawalDay: schema.paymentMethods.withdrawalDay,
        withdrawalMonthOffset: schema.paymentMethods.withdrawalMonthOffset,
        isActive: schema.paymentMethods.isActive,
      })
      .from(schema.paymentMethods)
      .leftJoin(schema.accounts, eq(schema.paymentMethods.sourceAccountId, schema.accounts.id))
      .where(eq(schema.paymentMethods.isActive, true));

    return NextResponse.json({ accounts, reservations, paymentMethods: rawPaymentMethods });
  } catch (error) {
    logger.error({ error }, "Error fetching accounts");
    return NextResponse.json({ error: "口座情報の取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 口座の新規追加 / 決済手段の追加 / 資金色分けの追加
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const body = await req.json();
    const actionType = body.actionType || "reservation"; // 'account' | 'payment_method' | 'reservation'

    if (actionType === "account") {
      // 1. 口座の新規登録
      const { name, type, balance, icon, color } = body;
      if (!name || !type) {
        return NextResponse.json({ error: "口座名と種別を入力してください。" }, { status: 400 });
      }

      const id = `acc_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(schema.accounts).values({
        id,
        name,
        type,
        balance: typeof balance === "number" ? balance : parseInt(balance || "0", 10),
        icon: icon || (type === "bank" ? "🏛️" : type === "prepaid_wallet" ? "📱" : type === "cash" ? "💵" : "📈"),
        color: color || "#2E7D32",
        sortOrder: 10,
        isActive: true,
      });

      return NextResponse.json({ success: true, id, message: "口座を登録しました。" });
    } else if (actionType === "payment_method") {
      // 2. 決済手段の新規登録
      const { name, type, sourceAccountId, closingDay, withdrawalDay, withdrawalMonthOffset } = body;
      if (!name || !type) {
        return NextResponse.json({ error: "決済手段名と種別を入力してください。" }, { status: 400 });
      }

      const id = `pm_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(schema.paymentMethods).values({
        id,
        name,
        type,
        sourceAccountId: sourceAccountId || null,
        closingDay: closingDay !== undefined ? closingDay : null,
        withdrawalDay: withdrawalDay !== undefined ? withdrawalDay : null,
        withdrawalMonthOffset: withdrawalMonthOffset || 0,
        isActive: true,
      });

      return NextResponse.json({ success: true, id, message: "決済手段を登録しました。" });
    } else {
      // 3. 資金色分け (バーチャル貯蓄) の新規追加
      const { accountId, name, amount, color, note } = body;
      if (!accountId || !name || !amount) {
        return NextResponse.json({ error: "口座、目的名、金額は必須です。" }, { status: 400 });
      }

      const id = `res_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(schema.accountReservations).values({
        id,
        accountId,
        name,
        amount: parseInt(amount, 10),
        color: color || "#E6A15C",
        note,
      });

      return NextResponse.json({ success: true, id, message: "資金色分けを設定しました。" });
    }
  } catch (error) {
    logger.error({ error }, "Error saving account data");
    return NextResponse.json({ error: "口座データの登録に失敗しました。" }, { status: 500 });
  }
}

// PUT: 口座・資金色分け・決済手段の更新
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const body = await req.json();
    const { id, actionType } = body;

    if (!id || !actionType) {
      return NextResponse.json({ error: "更新パラメータが不足しています。" }, { status: 400 });
    }

    if (actionType === "account") {
      const { name, type, balance, icon, color } = body;
      await db
        .update(schema.accounts)
        .set({
          name: name !== undefined ? name : undefined,
          type: type !== undefined ? type : undefined,
          balance: balance !== undefined ? (typeof balance === "number" ? balance : parseInt(balance, 10)) : undefined,
          icon: icon !== undefined ? icon : undefined,
          color: color !== undefined ? color : undefined,
        })
        .where(eq(schema.accounts.id, id));

      return NextResponse.json({ success: true, message: "口座情報を更新しました。" });
    } else if (actionType === "reservation") {
      const { name, amount, color, note, accountId } = body;
      await db
        .update(schema.accountReservations)
        .set({
          name: name !== undefined ? name : undefined,
          amount: amount !== undefined ? parseInt(amount, 10) : undefined,
          color: color !== undefined ? color : undefined,
          note: note !== undefined ? note : undefined,
          accountId: accountId !== undefined ? accountId : undefined,
        })
        .where(eq(schema.accountReservations.id, id));

      return NextResponse.json({ success: true, message: "資金色分け設定を更新しました。" });
    } else if (actionType === "payment_method") {
      const { name, type, sourceAccountId, closingDay, withdrawalDay, withdrawalMonthOffset } = body;
      await db
        .update(schema.paymentMethods)
        .set({
          name: name !== undefined ? name : undefined,
          type: type !== undefined ? type : undefined,
          sourceAccountId: sourceAccountId !== undefined ? sourceAccountId : undefined,
          closingDay: closingDay !== undefined ? closingDay : undefined,
          withdrawalDay: withdrawalDay !== undefined ? withdrawalDay : undefined,
          withdrawalMonthOffset: withdrawalMonthOffset !== undefined ? withdrawalMonthOffset : undefined,
        })
        .where(eq(schema.paymentMethods.id, id));

      return NextResponse.json({ success: true, message: "決済手段を更新しました。" });
    }

    return NextResponse.json({ error: "無効な更新種別です。" }, { status: 400 });
  } catch (error) {
    logger.error({ error }, "Error updating account data");
    return NextResponse.json({ error: "口座データの更新に失敗しました。" }, { status: 500 });
  }
}

// DELETE: 口座・資金色分け・決済手段の削除
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get("id");
    const actionType = searchParams.get("actionType"); // 'account' | 'payment_method' | 'reservation'

    if (!id || !actionType) {
      return NextResponse.json({ error: "削除パラメータが不足しています。" }, { status: 400 });
    }

    if (actionType === "account") {
      // 口座を非アクティブ化 (論理削除)
      await db
        .update(schema.accounts)
        .set({ isActive: false })
        .where(eq(schema.accounts.id, id));

      return NextResponse.json({ success: true, message: "口座を削除しました。" });
    } else if (actionType === "reservation") {
      // 資金色分け設定を物理削除（確保解除）
      await db.delete(schema.accountReservations).where(eq(schema.accountReservations.id, id));

      return NextResponse.json({ success: true, message: "資金色分け設定を削除（確保解除）しました。" });
    } else if (actionType === "payment_method") {
      // 決済手段を非アクティブ化 (論理削除)
      await db
        .update(schema.paymentMethods)
        .set({ isActive: false })
        .where(eq(schema.paymentMethods.id, id));

      return NextResponse.json({ success: true, message: "決済手段を削除しました。" });
    }

    return NextResponse.json({ error: "無効な削除種別です。" }, { status: 400 });
  } catch (error) {
    logger.error({ error }, "Error deleting account data");
    return NextResponse.json({ error: "口座データの削除に失敗しました。" }, { status: 500 });
  }
}
