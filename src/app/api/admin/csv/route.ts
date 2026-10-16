import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { desc, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const type = req.nextUrl.searchParams.get("type") || "full";

    // フルエクスポートは管理者のみ許可
    if (type === "full" && session.role !== "admin") {
      return NextResponse.json({ error: "フルエクスポートには管理者権限が必要です。" }, { status: 403 });
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM付き (Excel文字化け防止)

    if (type === "accounts") {
      const accounts = await db.select().from(schema.accounts);
      csvContent += "口座ID,口座名,種別,現在残高,有効状態,作成日時\n";
      for (const a of accounts) {
        csvContent += `"${a.id}","${a.name}","${a.type}",${a.balance},"${a.isActive}","${a.createdAt.toISOString()}"\n`;
      }
    } else {
      // transactions (支出・収入・振替明細)
      const txs = await db
        .select()
        .from(schema.transactions)
        .where(isNull(schema.transactions.deletedAt))
        .orderBy(desc(schema.transactions.date));

      csvContent += "明細ID,日付,種別,金額,店舗・取引先,費目ID,決済手段ID,メモ,精算済,登録日時\n";
      for (const t of txs) {
        csvContent += `"${t.id}","${t.date}","${t.type}",${t.amount},"${t.shopName || ""}","${t.categoryId || ""}","${t.paymentMethodId || ""}","${t.note || ""}","${t.isSettled}","${t.createdAt.toISOString()}"\n`;
      }
    }

    const filename = `komame_${session.activeHouseholdId}_${type}_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ error }, "Error exporting CSV");
    return NextResponse.json({ error: "CSV出力処理中にエラーが発生しました。" }, { status: 500 });
  }
}
