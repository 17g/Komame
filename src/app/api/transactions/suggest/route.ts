import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, and, isNull, isNotNull, desc, ilike } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { SuggestionItem, SuggestionResult } from "@/types";

// GET: 過去の明細履歴に基づく店舗名補完 ＆ 費目・決済手段の動的サジェスト
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const searchParams = req.nextUrl.searchParams;
    const q = (searchParams.get("q") || "").trim();

    // 過去の論理削除されていない明細から、店舗名が存在するレコードを抽出
    const whereClause = q
      ? and(
          isNull(schema.transactions.deletedAt),
          isNotNull(schema.transactions.shopName),
          ilike(schema.transactions.shopName, `%${q}%`)
        )
      : and(
          isNull(schema.transactions.deletedAt),
          isNotNull(schema.transactions.shopName)
        );

    const matchingTxs = await db
      .select({
        shopName: schema.transactions.shopName,
        categoryId: schema.transactions.categoryId,
        categoryName: schema.categories.name,
        categoryIcon: schema.categories.icon,
        categoryColor: schema.categories.color,
        paymentMethodId: schema.transactions.paymentMethodId,
        paymentMethodName: schema.paymentMethods.name,
        date: schema.transactions.date,
        createdAt: schema.transactions.createdAt,
      })
      .from(schema.transactions)
      .leftJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
      .leftJoin(
        schema.paymentMethods,
        eq(schema.transactions.paymentMethodId, schema.paymentMethods.id)
      )
      .where(whereClause)
      .orderBy(desc(schema.transactions.date), desc(schema.transactions.createdAt))
      .limit(100);

    // 店舗名ごとの利用回数と最新利用順を集計
    const shopStats = new Map<string, { count: number; lastUsed: Date }>();
    for (const tx of matchingTxs) {
      if (!tx.shopName || !tx.shopName.trim()) continue;
      const name = tx.shopName.trim();
      const existing = shopStats.get(name);
      if (existing) {
        existing.count += 1;
      } else {
        shopStats.set(name, {
          count: 1,
          lastUsed: tx.createdAt ? new Date(tx.createdAt) : new Date(0),
        });
      }
    }

    // 候補店舗名をソート (完全一致 > 前方一致 > 利用頻度 > 新しさ)
    const lowerQ = q.toLowerCase();
    const candidates = Array.from(shopStats.entries())
      .sort(([aName, aStat], [bName, bStat]) => {
        if (q) {
          const aLower = aName.toLowerCase();
          const bLower = bName.toLowerCase();
          const aExact = aLower === lowerQ ? 1 : 0;
          const bExact = bLower === lowerQ ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;

          const aPrefix = aLower.startsWith(lowerQ) ? 1 : 0;
          const bPrefix = bLower.startsWith(lowerQ) ? 1 : 0;
          if (aPrefix !== bPrefix) return bPrefix - aPrefix;
        }

        if (bStat.count !== aStat.count) {
          return bStat.count - aStat.count;
        }
        return bStat.lastUsed.getTime() - aStat.lastUsed.getTime();
      })
      .map(([name]) => name)
      .slice(0, 5);

    // 最多使用の「費目」と「決済手段」のサジェストを算出
    let suggestion: SuggestionItem | null = null;

    if (candidates.length > 0 || q) {
      // 対象店舗を特定 (完全一致があれば完全一致、なければ最上位候補、候補がなければ入力文字列)
      const targetShop =
        candidates.find((c) => c.toLowerCase() === lowerQ) ||
        candidates[0] ||
        q;

      // 対象店舗に合致する過去明細を絞り込み
      const relevantTxs = matchingTxs.filter((tx) =>
        tx.shopName && targetShop
          ? tx.shopName.trim().toLowerCase() === targetShop.toLowerCase()
          : true
      );

      const txPool = relevantTxs.length > 0 ? relevantTxs : matchingTxs;

      if (txPool.length > 0) {
        // 費目の出現回数集計
        const catMap = new Map<
          string,
          { count: number; name?: string; icon?: string; color?: string }
        >();
        // 決済手段の出現回数集計
        const pmMap = new Map<string, { count: number; name?: string }>();

        for (const tx of txPool) {
          if (tx.categoryId) {
            const current = catMap.get(tx.categoryId) || {
              count: 0,
              name: tx.categoryName || undefined,
              icon: tx.categoryIcon || undefined,
              color: tx.categoryColor || undefined,
            };
            current.count += 1;
            catMap.set(tx.categoryId, current);
          }

          if (tx.paymentMethodId) {
            const current = pmMap.get(tx.paymentMethodId) || {
              count: 0,
              name: tx.paymentMethodName || undefined,
            };
            current.count += 1;
            pmMap.set(tx.paymentMethodId, current);
          }
        }

        // 最多使用の費目 (Mode)
        let topCat: { id: string; name?: string; icon?: string; color?: string; count: number } | null = null;
        for (const [id, stat] of catMap.entries()) {
          if (!topCat || stat.count > topCat.count) {
            topCat = { id, ...stat };
          }
        }

        // 最多使用の決済手段 (Mode)
        let topPm: { id: string; name?: string; count: number } | null = null;
        for (const [id, stat] of pmMap.entries()) {
          if (!topPm || stat.count > topPm.count) {
            topPm = { id, ...stat };
          }
        }

        if (topCat || topPm) {
          suggestion = {
            shopName: targetShop,
            categoryId: topCat?.id,
            categoryName: topCat?.name,
            categoryIcon: topCat?.icon,
            categoryColor: topCat?.color,
            paymentMethodId: topPm?.id,
            paymentMethodName: topPm?.name,
            count: txPool.length,
          };
        }
      }
    }

    const result: SuggestionResult = {
      candidates,
      suggestion,
    };

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, "Error fetching transaction suggestions");
    return NextResponse.json(
      { error: "サジェストデータの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
