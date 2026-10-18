import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { desc, isNull, eq, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import {
  parseCsv,
  detectColumnMapping,
  normalizeDate,
  normalizeAmount,
  normalizeType,
  generateCsv,
  ColumnMapping,
} from "@/lib/csv";
import { calculateWithdrawalDate, isValidAmount, MAX_CSV_FILE_SIZE, MAX_CSV_ROWS } from "@/lib/utils";
import { CsvImportRow, CsvPreviewResult } from "@/types";

// GET: CSVエクスポート
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

    let csvContent: string;

    if (type === "accounts") {
      const accounts = await db.select().from(schema.accounts);
      const headers = ["口座ID", "口座名", "種別", "現在残高", "有効状態", "作成日時"];
      const rows = accounts.map((a) => [
        a.id,
        a.name,
        a.type,
        a.balance,
        a.isActive,
        a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      ]);
      csvContent = generateCsv(headers, rows);
    } else {
      // transactions (支出・収入・振替明細)
      const txs = await db
        .select()
        .from(schema.transactions)
        .where(isNull(schema.transactions.deletedAt))
        .orderBy(desc(schema.transactions.date));

      const headers = [
        "明細ID",
        "日付",
        "種別",
        "金額",
        "店舗・取引先",
        "費目ID",
        "決済手段ID",
        "メモ",
        "精算済",
        "登録日時",
      ];
      const rows = txs.map((t) => [
        t.id,
        t.date,
        t.type,
        t.amount,
        t.shopName || "",
        t.categoryId || "",
        t.paymentMethodId || "",
        t.note || "",
        t.isSettled,
        t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      ]);
      csvContent = generateCsv(headers, rows);
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

// POST: CSVパース・プレビュー・重複検証・インポート登録 (管理者限定)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  // 要件 7: CSVインポートは管理者権限限定
  if (session.role !== "admin") {
    return NextResponse.json({ error: "CSVインポートには管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    let action = "preview";
    let csvText = "";
    let customMapping: ColumnMapping | null = null;
    let itemsToImport: Array<{
      date: string;
      amount: number;
      type: "expense" | "income" | "transfer";
      shopName?: string;
      categoryId?: string;
      paymentMethodId?: string;
      fromAccountId?: string;
      toAccountId?: string;
      note?: string;
    }> = [];

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      action = (formData.get("action") as string) || "preview";
      const file = formData.get("file") as File | null;
      if (file) {
        if (file.size > MAX_CSV_FILE_SIZE) {
          return NextResponse.json({ error: "CSVファイルサイズは最大5MBまでです。" }, { status: 400 });
        }
        csvText = await file.text();
      } else {
        csvText = (formData.get("csvText") as string) || "";
      }
      const mappingStr = formData.get("mapping") as string | null;
      if (mappingStr) {
        try {
          customMapping = JSON.parse(mappingStr);
        } catch {
          // ignore
        }
      }
      const itemsStr = formData.get("items") as string | null;
      if (itemsStr) {
        try {
          itemsToImport = JSON.parse(itemsStr);
        } catch {
          // ignore
        }
      }
    } else {
      const body = await req.json();
      action = body.action || "preview";
      csvText = body.csvText || "";
      customMapping = body.mapping || null;
      itemsToImport = body.items || [];
    }

    if (csvText && Buffer.byteLength(csvText, "utf-8") > MAX_CSV_FILE_SIZE) {
      return NextResponse.json({ error: "CSVデータサイズは最大5MBまでです。" }, { status: 400 });
    }

    // ==========================================
    // ACTION 1: プレビュー & 重複候補検証
    // ==========================================
    if (action === "preview") {
      if (!csvText || csvText.trim().length === 0) {
        return NextResponse.json({ error: "CSVデータが空です。" }, { status: 400 });
      }

      const { headers, rows } = parseCsv(csvText);
      if (headers.length === 0 || rows.length === 0) {
        return NextResponse.json(
          { error: "有効なCSVデータ（行データ）が見つかりませんでした。" },
          { status: 400 }
        );
      }

      if (rows.length > MAX_CSV_ROWS) {
        return NextResponse.json(
          { error: `CSV行数が多すぎます。一度にインポートできる行数は最大${MAX_CSV_ROWS.toLocaleString()}行です。` },
          { status: 400 }
        );
      }

      const mapping = customMapping || detectColumnMapping(headers);

      // 既存マスターデータの取得（名前マッピング用）
      const [categories, paymentMethods, accounts] = await Promise.all([
        db.select().from(schema.categories),
        db.select().from(schema.paymentMethods),
        db.select().from(schema.accounts),
      ]);

      // 既存明細の取得（重複候補チェック用）
      const existingTxs = await db
        .select({
          date: schema.transactions.date,
          amount: schema.transactions.amount,
          shopName: schema.transactions.shopName,
        })
        .from(schema.transactions)
        .where(isNull(schema.transactions.deletedAt));

      const existingSet = new Set<string>();
      for (const tx of existingTxs) {
        const key = `${tx.date}__${tx.amount}__${(tx.shopName || "").trim().toLowerCase()}`;
        existingSet.add(key);
      }

      const previewRows: CsvImportRow[] = [];
      let validRows = 0;
      let duplicateCount = 0;

      rows.forEach((row, index) => {
        const rowNumber = index + 1;
        const rawDate = row[mapping.dateCol] || "";
        const rawAmount = row[mapping.amountCol] || "";
        const rawShopName = mapping.shopNameCol >= 0 ? row[mapping.shopNameCol] || "" : "";
        const rawType = mapping.typeCol !== undefined && mapping.typeCol >= 0 ? row[mapping.typeCol] : undefined;
        const rawCategory = mapping.categoryCol !== undefined && mapping.categoryCol >= 0 ? row[mapping.categoryCol] : undefined;
        const rawPm = mapping.paymentMethodCol !== undefined && mapping.paymentMethodCol >= 0 ? row[mapping.paymentMethodCol] : undefined;
        const rawNote = mapping.noteCol !== undefined && mapping.noteCol >= 0 ? row[mapping.noteCol] : undefined;

        const date = normalizeDate(rawDate);
        const amount = normalizeAmount(rawAmount);
        const type = normalizeType(rawType);
        const shopName = rawShopName.trim();
        const note = rawNote?.trim() || undefined;

        // 費目の名前/IDマッピング
        let categoryId: string | undefined;
        let categoryName: string | undefined;
        if (rawCategory) {
          const trimmedCat = rawCategory.trim();
          const matchCat = categories.find(
            (c) => c.id === trimmedCat || c.name.toLowerCase() === trimmedCat.toLowerCase()
          );
          if (matchCat) {
            categoryId = matchCat.id;
            categoryName = matchCat.name;
          }
        }

        // 決済手段の名前/IDマッピング
        let paymentMethodId: string | undefined;
        let paymentMethodName: string | undefined;
        if (rawPm) {
          const trimmedPm = rawPm.trim();
          const matchPm = paymentMethods.find(
            (pm) => pm.id === trimmedPm || pm.name.toLowerCase() === trimmedPm.toLowerCase()
          );
          if (matchPm) {
            paymentMethodId = matchPm.id;
            paymentMethodName = matchPm.name;
          }
        }

        const isValid = !!date && amount !== null && isValidAmount(amount);
        let errorMessage: string | undefined;
        if (!date) {
          errorMessage = "日付の形式が不正です";
        } else if (amount === null || !isValidAmount(amount)) {
          errorMessage = "金額は1〜9,999,999,999円の整数で入力してください";
        }

        // 重複判定（同一日・店舗・金額）
        let isDuplicateCandidate = false;
        if (isValid) {
          validRows++;
          const duplicateKey = `${date}__${amount}__${shopName.toLowerCase()}`;
          if (existingSet.has(duplicateKey)) {
            isDuplicateCandidate = true;
            duplicateCount++;
          }
        }

        previewRows.push({
          rowNumber,
          date: date || rawDate,
          type,
          amount: amount || 0,
          shopName: shopName || undefined,
          categoryId,
          categoryName,
          paymentMethodId,
          paymentMethodName,
          note,
          isValid,
          errorMessage,
          isDuplicateCandidate,
        });
      });

      const result: CsvPreviewResult = {
        headers,
        totalRows: rows.length,
        validRows,
        duplicateCount,
        mapping,
        rows: previewRows,
      };

      return NextResponse.json(result);
    }

    // ==========================================
    // ACTION 2: インポート実行 & 登録
    // ==========================================
    if (action === "import") {
      if (!itemsToImport || itemsToImport.length === 0) {
        return NextResponse.json(
          { error: "インポートする明細データがありません。" },
          { status: 400 }
        );
      }

      if (itemsToImport.length > MAX_CSV_ROWS) {
        return NextResponse.json(
          { error: `一度にインポートできる明細は最大${MAX_CSV_ROWS.toLocaleString()}件までです。` },
          { status: 400 }
        );
      }

      // 境界値およびパラメータバリデーション (VULN-09)
      for (const item of itemsToImport) {
        if (!isValidAmount(item.amount)) {
          return NextResponse.json(
            { error: "不正な金額が含まれています。金額は1〜9,999,999,999円の整数である必要があります。" },
            { status: 400 }
          );
        }
        if (!item.date || !normalizeDate(item.date)) {
          return NextResponse.json(
            { error: "不正な日付形式が含まれています。" },
            { status: 400 }
          );
        }
        if (!["expense", "income", "transfer"].includes(item.type)) {
          return NextResponse.json(
            { error: "不正な取引種別が含まれています。" },
            { status: 400 }
          );
        }
      }

      // 1. 24時間チェックポイントの作成（安全なロールバック担保）
      const checkpointId = `cp_${crypto.randomUUID().replace(/-/g, "")}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const createdTxIds: string[] = [];

      // 2. トランザクション内で各明細の登録および残高・ログ連動処理をアトミックに実行
      await db.transaction(async (tx) => {
        await tx.insert(schema.checkpoints).values({
          id: checkpointId,
          userId: session.userId,
          description: `CSVインポート (${itemsToImport.length}件)`,
          expiresAt,
        });

        for (const item of itemsToImport) {
          const txId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
          createdTxIds.push(txId);

          let scheduledWithdrawalDate: string | null = null;
          let isSettled = false;

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
                  await tx
                    .update(schema.accounts)
                    .set({ balance: sql`${schema.accounts.balance} - ${item.amount}` })
                    .where(eq(schema.accounts.id, pm.sourceAccountId));
                  isSettled = true;
                } else if (pm.type === "cash") {
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

            // 貯蓄・投資等で移動先口座が指定されている場合
            if (item.toAccountId) {
              await tx
                .update(schema.accounts)
                .set({ balance: sql`${schema.accounts.balance} + ${item.amount}` })
                .where(eq(schema.accounts.id, item.toAccountId));
            }
          }

          // 明細レコード作成
          await tx.insert(schema.transactions).values({
            id: txId,
            userId: session.userId,
            type: item.type,
            date: item.date,
            amount: item.amount,
            categoryId: item.categoryId || null,
            paymentMethodId: item.paymentMethodId || null,
            fromAccountId: item.fromAccountId || null,
            toAccountId: item.toAccountId || null,
            shopName: item.shopName || null,
            note: item.note || null,
            isSettled,
            scheduledWithdrawalDate,
            checkpointId,
          });

          // 監査ログ作成
          await tx.insert(schema.auditLogs).values({
            id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
            userId: session.userId,
            operatorUserId: session.userId,
            action: "CREATE",
            entityType: "transaction",
            entityId: txId,
            summary: `CSVインポート: ${item.shopName || "明細"} (${item.amount}円)`,
            afterDataJson: item,
            checkpointId,
          });

          // 貯蓄・投資の受入明細生成
          if (item.type === "expense" && item.toAccountId) {
            const transferTxId = `tx_${crypto.randomUUID().replace(/-/g, "")}`;
            await tx.insert(schema.transactions).values({
              id: transferTxId,
              userId: session.userId,
              type: "transfer",
              date: item.date,
              amount: item.amount,
              categoryId: item.categoryId || null,
              toAccountId: item.toAccountId,
              shopName: item.shopName ? `[振替受入] ${item.shopName}` : "振替受入",
              note: item.note ? `自動振替受入: ${item.note}` : "貯蓄・投資支出に伴う自動振替受入",
              isSettled: true,
              parentTransactionId: txId,
              checkpointId,
            });
          }
        }
      });

      logger.info(
        { importedCount: itemsToImport.length, checkpointId },
        "CSV transactions imported successfully"
      );

      return NextResponse.json({
        success: true,
        importedCount: itemsToImport.length,
        checkpointId,
        message: `${itemsToImport.length}件の明細をインポートしました。`,
      });
    }

    return NextResponse.json({ error: "無効なアクションです。" }, { status: 400 });
  } catch (error) {
    logger.error({ error }, "Error processing CSV import");
    return NextResponse.json(
      { error: "CSVインポート処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
