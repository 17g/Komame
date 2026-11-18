import { logger } from "../src/lib/logger";

const BASE_URL = "http://localhost:3080";

interface TestContext {
  cookieHeader: string;
  user: any;
  accounts: any[];
  paymentMethods: any[];
  categories: any[];
}

const ctx: TestContext = {
  cookieHeader: "",
  user: null,
  accounts: [],
  paymentMethods: [],
  categories: [],
};

async function sessionFetch(
  path: string,
  options: RequestInit = {},
  sessionState: { cookieHeader: string } = ctx
) {
  const headers = new Headers(options.headers || {});
  if (sessionState.cookieHeader) {
    headers.set("Cookie", sessionState.cookieHeader);
  }
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    sessionState.cookieHeader = setCookie.split(";")[0];
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf-8");
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // text
  }

  return { status: res.status, ok: res.ok, json, text, hasSetCookie: Boolean(setCookie) };
}

async function apiFetch(path: string, options: RequestInit = {}) {
  return sessionFetch(path, options, ctx);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

async function runComprehensiveTest() {
  console.log("==========================================================");
  console.log("🚀 Komame 家計簿 全機能・ビジネスロジック自動検証テスト開始");
  console.log("==========================================================");

  // 1. 認証テスト
  console.log("\n--- 1. 認証 & セッション検証 ---");
  const loginRes = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "admin@komame.local",
      password: "Password123!",
    }),
  });
  assert(loginRes.ok, "管理者ログイン成功 (200 OK)");
  assert(loginRes.json?.user?.email === "admin@komame.local", "ユーザー情報取得成功");
  assert(loginRes.json?.user?.isSuperAdmin === true, "デモ管理者が Super Admin 権限を持つことを確認");
  ctx.user = loginRes.json.user;

  const meRes = await apiFetch("/api/auth/me");
  assert(meRes.ok && meRes.json?.user?.id === ctx.user.id, "セッション検証 (/api/auth/me)");

  // 2. 口座一覧・カテゴリ・決済手段の取得
  console.log("\n--- 2. マスターデータ取得 ---");
  const accRes = await apiFetch("/api/accounts");
  assert(accRes.ok, "口座一覧取得成功");
  ctx.accounts = accRes.json.accounts;
  ctx.paymentMethods = accRes.json.paymentMethods;

  const catRes = await apiFetch("/api/categories");
  assert(catRes.ok, "カテゴリ一覧取得成功");
  ctx.categories = catRes.json.categories;
  console.log(`口座数: ${ctx.accounts.length}, 決済手段数: ${ctx.paymentMethods.length}, 費目数: ${ctx.categories.length}`);

  // 3. 口座・ウォレット CRUD テスト
  console.log("\n--- 3. 口座・ウォレット CRUD テスト ---");
  const newAccRes = await apiFetch("/api/accounts", {
    method: "POST",
    body: JSON.stringify({
      actionType: "account",
      name: "テスト用サブ口座",
      type: "bank",
      balance: 100000,
      icon: "🏦",
    }),
  });
  assert(newAccRes.ok, "新規口座作成成功 (POST)");
  const createdAccId = newAccRes.json.id;

  const updateAccRes = await apiFetch("/api/accounts", {
    method: "PUT",
    body: JSON.stringify({
      actionType: "account",
      id: createdAccId,
      name: "テスト用サブ口座（更新後）",
      balance: 120000,
    }),
  });
  assert(updateAccRes.ok, "口座更新成功 (PUT)");

  const delAccRes = await apiFetch(`/api/accounts?id=${createdAccId}&actionType=account`, {
    method: "DELETE",
  });
  assert(delAccRes.ok, "口座削除成功 (DELETE)");

  // 4. バーチャル貯蓄（資金色分け）CRUD & 残高ロック計算テスト
  console.log("\n--- 4. バーチャル貯蓄（資金色分け）CRUD & ロック残高計算 ---");
  const mainBank = ctx.accounts.find((a: any) => a.type === "bank");
  assert(!!mainBank, "メイン銀行口座の存在確認");

  const addResRes = await apiFetch("/api/accounts", {
    method: "POST",
    body: JSON.stringify({
      actionType: "reservation",
      accountId: mainBank.id,
      name: "自動テスト用積立",
      amount: 50000,
      color: "#3B82F6",
      note: "自動テスト",
    }),
  });
  assert(addResRes.ok, "資金色分け作成成功 (POST)");
  const resId = addResRes.json.id;

  const accAfterRes = await apiFetch("/api/accounts");
  const updatedBank = accAfterRes.json.accounts.find((a: any) => a.id === mainBank.id);
  assert(updatedBank.reservedAmount >= 50000, "ロック金額 (reservedAmount) の正確な集計");
  assert(updatedBank.availableBalance === updatedBank.balance - updatedBank.reservedAmount, "実質利用可能残高 (availableBalance) の正確な計算");

  const delResRes = await apiFetch(`/api/accounts?id=${resId}&actionType=reservation`, {
    method: "DELETE",
  });
  assert(delResRes.ok, "資金色分け削除（ロック解除）成功 (DELETE)");

  // 5. 決済手段 CRUD テスト
  console.log("\n--- 5. 決済手段 CRUD テスト ---");
  const newPmRes = await apiFetch("/api/accounts", {
    method: "POST",
    body: JSON.stringify({
      actionType: "payment_method",
      name: "テスト用デビットカード",
      type: "debit_card",
      sourceAccountId: mainBank.id,
    }),
  });
  assert(newPmRes.ok, "決済手段登録成功 (POST)");
  const pmId = newPmRes.json.id;

  const delPmRes = await apiFetch(`/api/accounts?id=${pmId}&actionType=payment_method`, {
    method: "DELETE",
  });
  assert(delPmRes.ok, "決済手段削除成功 (DELETE)");

  // 6. 支出登録 & 即時口座残高連動テスト (現金・デビット・QR・クレカ)
  console.log("\n--- 6. 支出登録 & 口座残高連動テスト ---");
  const cashPm = ctx.paymentMethods.find((p: any) => p.type === "cash");
  const cashAcc = ctx.accounts.find((a: any) => a.type === "cash");
  const initialCashBalance = cashAcc ? cashAcc.balance : 0;
  const foodCat = ctx.categories[0];

  const expenseAmount = 3000;
  const createTxRes = await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      amount: expenseAmount,
      categoryId: foodCat.id,
      paymentMethodId: cashPm?.id,
      shopName: "セブンイレブン（テスト）",
      note: "お弁当",
    }),
  });
  assert(createTxRes.ok, "現金支出明細登録成功 (POST)");
  const createdTxId = createTxRes.json.createdTxIds[0];

  const accAfterExpense = await apiFetch("/api/accounts");
  const updatedCashAcc = accAfterExpense.json.accounts.find((a: any) => a.id === cashAcc?.id);
  assert(updatedCashAcc.balance === initialCashBalance - expenseAmount, `現金残高が即座に減額されたことを確認 (${initialCashBalance}円 -> ${updatedCashAcc.balance}円)`);

  // 7. 明細更新時の支払手段切り替え 残高完全双方向同期テスト
  console.log("\n--- 7. 明細更新 & 支払手段変更時の残高完全双方向同期 ---");
  const creditPm = ctx.paymentMethods.find((p: any) => p.type === "credit_card");

  // 現金 -> クレジットカードに変更 (現金残高が回復すること)
  const updateToCreditRes = await apiFetch("/api/transactions", {
    method: "PUT",
    body: JSON.stringify({
      id: createdTxId,
      amount: expenseAmount,
      paymentMethodId: creditPm?.id,
      shopName: "セブンイレブン（クレカ払いに変更）",
    }),
  });
  assert(updateToCreditRes.ok, "明細をクレジットカードに変更 (PUT)");

  const accAfterSwitchToCredit = await apiFetch("/api/accounts");
  const restoredCashAcc = accAfterSwitchToCredit.json.accounts.find((a: any) => a.id === cashAcc?.id);
  assert(restoredCashAcc.balance === initialCashBalance, `現金残高が元通り回復したことを確認 (${restoredCashAcc.balance}円 == ${initialCashBalance}円)`);

  // クレジットカード -> 再び現金に変更 (現金残高が再減額されること)
  const updateBackToCashRes = await apiFetch("/api/transactions", {
    method: "PUT",
    body: JSON.stringify({
      id: createdTxId,
      amount: expenseAmount,
      paymentMethodId: cashPm?.id,
      shopName: "セブンイレブン（現金払いに再変更）",
    }),
  });
  assert(updateBackToCashRes.ok, "明細を現金払いに再変更 (PUT)");

  const accAfterBackToCash = await apiFetch("/api/accounts");
  const redeductedCashAcc = accAfterBackToCash.json.accounts.find((a: any) => a.id === cashAcc?.id);
  assert(redeductedCashAcc.balance === initialCashBalance - expenseAmount, `現金残高が再び減額されたことを確認 (${redeductedCashAcc.balance}円)`);

  // 明細削除 (現金残高が回復すること)
  const deleteTxRes = await apiFetch(`/api/transactions?id=${createdTxId}`, {
    method: "DELETE",
  });
  assert(deleteTxRes.ok, "明細削除成功 (DELETE)");

  const accAfterDeleteTx = await apiFetch("/api/accounts");
  const finalCashAcc = accAfterDeleteTx.json.accounts.find((a: any) => a.id === cashAcc?.id);
  assert(finalCashAcc.balance === initialCashBalance, `明細削除後に現金残高が完全回復したことを確認 (${finalCashAcc.balance}円 == ${initialCashBalance}円)`);

  // 8. 貯蓄・投資 (NISA) 登録時の資金移動 & 受入明細自動生成テスト
  console.log("\n--- 8. 貯蓄・投資 (NISA) 登録時の資金移動連動テスト ---");
  const nisaAcc = ctx.accounts.find((a: any) => a.type === "nisa_investment");
  const investCat = ctx.categories.find((c: any) => c.name.includes("貯蓄") || c.name.includes("投資")) || ctx.categories[0];
  const debitPm = ctx.paymentMethods.find((p: any) => p.type === "debit_card") || ctx.paymentMethods[0];

  const currentAccRes = await apiFetch("/api/accounts");
  const currentBankAcc = currentAccRes.json.accounts.find((a: any) => a.id === mainBank.id);
  const initialBankBalance = currentBankAcc.balance;
  const initialNisaBalance = nisaAcc ? nisaAcc.balance : 0;
  const investAmount = 20000;

  const investTxRes = await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      amount: investAmount,
      categoryId: investCat.id,
      paymentMethodId: debitPm.id,
      toAccountId: nisaAcc?.id,
      shopName: "SBI証券（つみたてNISA）",
      note: "定期積立",
    }),
  });
  assert(investTxRes.ok, "NISA積立支出明細登録成功 (POST)");
  assert(investTxRes.json.createdTxIds?.length === 2, "支出明細と受入明細の2件が同時自動生成されたことを確認");

  const accAfterInvest = await apiFetch("/api/accounts");
  const finalBankAcc = accAfterInvest.json.accounts.find((a: any) => a.id === mainBank.id);
  const finalNisaAcc = accAfterInvest.json.accounts.find((a: any) => a.id === nisaAcc?.id);

  assert(finalBankAcc.balance === initialBankBalance - investAmount, `出金元銀行口座から減額 (${initialBankBalance}円 -> ${finalBankAcc.balance}円)`);
  assert(finalNisaAcc.balance === initialNisaBalance + investAmount, `移動先NISA口座に残高加算 (${initialNisaBalance}円 -> ${finalNisaAcc.balance}円)`);

  // 8.1 投資明細の金額変更 (PUT) 時の双方向残高同期 & 受入明細連動更新テスト
  console.log("\n--- 8.1 投資支出明細の修正 & 連動受入明細更新テスト ---");
  const parentInvestTxId = investTxRes.json.createdTxIds[0];
  const linkedIncomeTxId = investTxRes.json.createdTxIds[1];
  const updatedInvestAmount = 25000;

  const updateInvestRes = await apiFetch("/api/transactions", {
    method: "PUT",
    body: JSON.stringify({
      id: parentInvestTxId,
      amount: updatedInvestAmount,
      categoryId: investCat.id,
      paymentMethodId: debitPm.id,
      toAccountId: nisaAcc?.id,
      shopName: "SBI証券（積立増額）",
      note: "増額設定",
    }),
  });
  assert(updateInvestRes.ok, "投資支出明細の更新成功 (PUT)");

  const accAfterUpdateInvest = await apiFetch("/api/accounts");
  const bankAfterUpdate = accAfterUpdateInvest.json.accounts.find((a: any) => a.id === mainBank.id);
  const nisaAfterUpdate = accAfterUpdateInvest.json.accounts.find((a: any) => a.id === nisaAcc?.id);

  assert(bankAfterUpdate.balance === initialBankBalance - updatedInvestAmount, `出金元銀行口座が新金額 (${updatedInvestAmount}円) で正しく減額同期 (${bankAfterUpdate.balance}円)`);
  assert(nisaAfterUpdate.balance === initialNisaBalance + updatedInvestAmount, `移動先NISA口座が新金額 (${updatedInvestAmount}円) で正しく増額同期 (${nisaAfterUpdate.balance}円)`);

  const txListRes = await apiFetch("/api/transactions");
  const linkedTxInDb = txListRes.json.transactions.find((t: any) => t.id === linkedIncomeTxId || t.parentTransactionId === parentInvestTxId);
  assert(!!linkedTxInDb, "連動受入明細が存在することを確認");
  assert(linkedTxInDb.amount === updatedInvestAmount, `連動受入明細の金額も自動的に更新されていることを確認 (${linkedTxInDb.amount}円 == ${updatedInvestAmount}円)`);

  // 8.2 投資明細の削除 (DELETE) 時の残高完全復元 & 連動受入明細の自動削除テスト
  console.log("\n--- 8.2 投資支出明細の削除 & 連動受入明細削除テスト ---");
  const deleteInvestRes = await apiFetch(`/api/transactions?id=${parentInvestTxId}`, {
    method: "DELETE",
  });
  assert(deleteInvestRes.ok, "投資親明細の削除成功 (DELETE)");

  const accAfterDeleteInvest = await apiFetch("/api/accounts");
  const bankAfterDel = accAfterDeleteInvest.json.accounts.find((a: any) => a.id === mainBank.id);
  const nisaAfterDel = accAfterDeleteInvest.json.accounts.find((a: any) => a.id === nisaAcc?.id);

  assert(bankAfterDel.balance === initialBankBalance, `出金元銀行口座の残高が初期値に完全回復 (${bankAfterDel.balance}円 == ${initialBankBalance}円)`);
  assert(nisaAfterDel.balance === initialNisaBalance, `移動先NISA口座の残高も初期値に完全回復 (${nisaAfterDel.balance}円 == ${initialNisaBalance}円)`);

  const txListAfterDelRes = await apiFetch("/api/transactions");
  const parentInList = txListAfterDelRes.json.transactions.find((t: any) => t.id === parentInvestTxId);
  const linkedInList = txListAfterDelRes.json.transactions.find((t: any) => t.id === linkedIncomeTxId || t.parentTransactionId === parentInvestTxId);

  assert(!parentInList, "親支出明細が一覧から削除されていることを確認");
  assert(!linkedInList, "連動受入明細も同時に論理削除されていることを確認");

  // 9. 一時保存 (手動・自動) & 復元 & 破棄テスト
  console.log("\n--- 9. 一時保存 (ドラフト) 機能テスト ---");
  const saveDraftRes = await apiFetch("/api/drafts", {
    method: "POST",
    body: JSON.stringify({
      draftType: "manual",
      formType: "single",
      payloadJson: {
        shopName: "ドラフト保存テスト店舗",
        amount: "15000",
        note: "一時保存データ",
      },
    }),
  });
  assert(saveDraftRes.ok, "手動一時保存ドラフト保存成功 (POST)");

  const getDraftsRes = await apiFetch("/api/drafts");
  assert(getDraftsRes.ok && getDraftsRes.json.manualDraft !== null, "一時保存データ取得成功 (GET)");
  assert(getDraftsRes.json.manualDraft.payloadJson.shopName === "ドラフト保存テスト店舗", "ドラフト内容の整合性確認");

  const deleteDraftRes = await apiFetch("/api/drafts", { method: "DELETE" });
  assert(deleteDraftRes.ok, "ドラフト全破棄成功 (DELETE)");

  // 10. 24時間リバート（チェックポイント & 監査ログ）テスト
  console.log("\n--- 10. 24時間リバート機能テスト ---");
  const cpRes = await apiFetch("/api/admin/checkpoints");
  assert(cpRes.ok, "チェックポイント一覧取得成功");
  assert(Array.isArray(cpRes.json.checkpoints) && cpRes.json.checkpoints.length > 0, "チェックポイントが存在することを確認");

  const logsRes = await apiFetch("/api/admin/logs");
  assert(logsRes.ok, "監査ログ一覧取得成功");
  assert(Array.isArray(logsRes.json.logs) && logsRes.json.logs.length > 0, "監査ログに操作履歴が記録されていることを確認");

  // 11. CSVエクスポート & インポート (プレビュー・重複候補検知・インポート・リバート) テスト
  console.log("\n--- 11. CSV エクスポート & インポート機能テスト ---");

  // 11.1 エクスポート検証
  const exportFullRes = await apiFetch("/api/admin/csv?type=full");
  assert(exportFullRes.ok, "全明細CSVエクスポート成功 (GET /api/admin/csv?type=full)");
  assert(exportFullRes.text.startsWith("\uFEFF"), "エクスポートCSVがUTF-8 BOM付きであることを確認");
  assert(exportFullRes.text.includes('"明細ID","日付","種別","金額"'), "CSVヘッダーの整合性確認");

  const exportAccRes = await apiFetch("/api/admin/csv?type=accounts");
  assert(exportAccRes.ok, "口座一覧CSVエクスポート成功 (GET /api/admin/csv?type=accounts)");
  assert(exportAccRes.text.includes('"口座ID","口座名","種別","現在残高"'), "口座CSVヘッダーの整合性確認");

  // 11.2 重複候補の事前明細登録
  const dupCheckDate = "2026-10-15";
  const dupCheckAmount = 2980;
  const dupCheckShop = "CSV重複検知スーパー";
  await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      date: dupCheckDate,
      amount: dupCheckAmount,
      shopName: dupCheckShop,
    }),
  });

  // 11.3 CSVパース・プレビュー・重複候補検知
  const testCsvContent = `日付,店舗・取引先,金額,費目,支払手段,メモ
${dupCheckDate},${dupCheckShop},${dupCheckAmount},食費,,重複検証用
2026-10-16,新規CSVインポート店舗,5400,日用品,,新規明細
不正な日付,テスト店,1000,,,エラー行
`;

  const previewRes = await apiFetch("/api/admin/csv", {
    method: "POST",
    body: JSON.stringify({
      action: "preview",
      csvText: testCsvContent,
    }),
  });

  assert(previewRes.ok, "CSVプレビュー解析成功 (POST action=preview)");
  assert(previewRes.json.totalRows === 3, `総行数が3件であることを確認 (${previewRes.json.totalRows})`);
  assert(previewRes.json.validRows === 2, `有効行数が2件であることを確認 (${previewRes.json.validRows})`);
  assert(previewRes.json.duplicateCount === 1, `重複候補が1件検出されたことを確認 (${previewRes.json.duplicateCount})`);

  const previewRowDup = previewRes.json.rows.find((r: any) => r.shopName === dupCheckShop);
  assert(previewRowDup?.isDuplicateCandidate === true, "既存明細と一致する行に重複候補フラグが付与されていることを確認");

  const previewRowNew = previewRes.json.rows.find((r: any) => r.shopName === "新規CSVインポート店舗");
  assert(previewRowNew?.isDuplicateCandidate === false && previewRowNew?.isValid === true, "新規明細行が有効かつ非重複であることを確認");

  const previewRowInvalid = previewRes.json.rows.find((r: any) => r.rowNumber === 3);
  assert(previewRowInvalid?.isValid === false, "不正日付行が無効判定されていることを確認");

  // 11.4 CSVインポート実行 (チェックポイント生成 & 明細登録)
  const importRes = await apiFetch("/api/admin/csv", {
    method: "POST",
    body: JSON.stringify({
      action: "import",
      items: [
        {
          date: "2026-10-16",
          amount: 5400,
          type: "expense",
          shopName: "新規CSVインポート店舗",
          note: "CSVインポートテスト明細",
        },
      ],
    }),
  });

  assert(importRes.ok, "CSVインポート実行成功 (POST action=import)");
  assert(importRes.json.importedCount === 1, "インポート件数が1件であることを確認");
  assert(!!importRes.json.checkpointId, "インポート時にチェックポイントIDが発行されたことを確認");

  const csvCheckpointId = importRes.json.checkpointId;

  // インポート明細の確認
  const txListAfterImport = await apiFetch("/api/transactions");
  const importedTx = txListAfterImport.json.transactions.find((t: any) => t.shopName === "新規CSVインポート店舗");
  assert(!!importedTx && importedTx.amount === 5400, "インポートされた明細がDBに正しく存在することを確認");

  // 11.5 インポートしたチェックポイントのロールバック (24hリバート連携)
  const revertImportRes = await apiFetch("/api/admin/revert", {
    method: "POST",
    body: JSON.stringify({ checkpointId: csvCheckpointId }),
  });
  assert(revertImportRes.ok, "CSVインポートのチェックポイント巻き戻し成功 (POST /api/admin/revert)");

  const txListAfterRevert = await apiFetch("/api/transactions");
  const importedTxAfterRevert = txListAfterRevert.json.transactions.find((t: any) => t.shopName === "新規CSVインポート店舗");
  assert(!importedTxAfterRevert, "リバート後にインポート明細が安全に取り消されていることを確認");

  // 12. 同費目一括登録 (category_batch) の一括登録 & 残高・チェックポイント連携テスト
  console.log("\n--- 12. 同費目一括登録 (category_batch) の一括登録 & 残高連動テスト ---");
  const targetCategory = ctx.categories.find((c: any) => c.name.includes("食費")) || ctx.categories[0];
  const cashPmItem = ctx.paymentMethods.find((p: any) => p.type === "cash") || ctx.paymentMethods[0];
  const preBatchAccRes = await apiFetch("/api/accounts");
  const preBatchCashAcc = preBatchAccRes.json.accounts.find((a: any) => a.type === "cash");
  const initialCashBalForBatch = preBatchCashAcc.balance;

  const batchPayload = [
    {
      type: "expense",
      date: "2026-10-14",
      amount: 1500,
      categoryId: targetCategory.id,
      paymentMethodId: cashPmItem.id,
      shopName: "スーパーライフ（同費目一括テスト1）",
      note: "野菜・肉",
    },
    {
      type: "expense",
      date: "2026-10-15",
      amount: 450,
      categoryId: targetCategory.id,
      paymentMethodId: cashPmItem.id,
      shopName: "セブンイレブン（同費目一括テスト2）",
      note: "サンドイッチ",
    },
    {
      type: "expense",
      date: "2026-10-16",
      amount: 680,
      categoryId: targetCategory.id,
      paymentMethodId: cashPmItem.id,
      shopName: "吉野家（同費目一括テスト3）",
      note: "牛丼ランチ",
    },
  ];

  const batchSubmitRes = await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify(batchPayload),
  });
  assert(batchSubmitRes.ok, "同費目一括登録API送信成功 (POST /api/transactions)");
  assert(batchSubmitRes.json.createdTxIds?.length === 3, "3件の明細IDが返却されたことを確認");
  const batchCheckpointId = batchSubmitRes.json.checkpointId;
  assert(!!batchCheckpointId, "単一チェックポイントIDが付与されたことを確認");

  // 現金残高の減額確認 (1500 + 450 + 680 = 2630円)
  const totalBatchAmt = 1500 + 450 + 680;
  const postBatchAccRes = await apiFetch("/api/accounts");
  const postBatchCashAcc = postBatchAccRes.json.accounts.find((a: any) => a.id === preBatchCashAcc.id);
  assert(
    postBatchCashAcc.balance === initialCashBalForBatch - totalBatchAmt,
    `現金残高が一括登録合計額 (${totalBatchAmt}円) 分減額されたことを確認 (${postBatchCashAcc.balance}円 == ${initialCashBalForBatch - totalBatchAmt}円)`
  );

  // 明細一覧での取得確認
  const txListAfterBatch = await apiFetch("/api/transactions");
  const batchTx1 = txListAfterBatch.json.transactions.find((t: any) => t.shopName === "スーパーライフ（同費目一括テスト1）");
  const batchTx2 = txListAfterBatch.json.transactions.find((t: any) => t.shopName === "セブンイレブン（同費目一括テスト2）");
  const batchTx3 = txListAfterBatch.json.transactions.find((t: any) => t.shopName === "吉野家（同費目一括テスト3）");
  assert(!!batchTx1 && batchTx1.amount === 1500 && batchTx1.categoryId === targetCategory.id, "一括明細1の費目・金額一致確認");
  assert(!!batchTx2 && batchTx2.amount === 450 && batchTx2.categoryId === targetCategory.id, "一括明細2の費目・金額一致確認");
  assert(!!batchTx3 && batchTx3.amount === 680 && batchTx3.categoryId === targetCategory.id, "一括明細3の費目・金額一致確認");

  // 一括登録のチェックポイントロールバック確認
  const revertBatchRes = await apiFetch("/api/admin/revert", {
    method: "POST",
    body: JSON.stringify({ checkpointId: batchCheckpointId }),
  });
  assert(revertBatchRes.ok, "一括登録チェックポイントのロールバック成功 (POST /api/admin/revert)");

  const postRevertAccRes = await apiFetch("/api/accounts");
  const postRevertCashAcc = postRevertAccRes.json.accounts.find((a: any) => a.id === preBatchCashAcc.id);
  assert(
    postRevertCashAcc.balance === initialCashBalForBatch,
    `リバート後に現金残高が元通り回復したことを確認 (${postRevertCashAcc.balance}円 == ${initialCashBalForBatch}円)`
  );

  // 13. 口座間資金移動 (transfer) の残高連動・更新・リバート巻き戻しテスト
  console.log("\n--- 13. 口座間資金移動 (transfer) & リバート巻き戻しテスト ---");
  const preTransferAccRes = await apiFetch("/api/accounts");
  const preTransferBank = preTransferAccRes.json.accounts.find((a: any) => a.id === mainBank.id);
  const preTransferCash = preTransferAccRes.json.accounts.find((a: any) => a.id === cashAcc?.id);
  const bankBalBeforeTransfer = preTransferBank.balance;
  const cashBalBeforeTransfer = preTransferCash.balance;
  const transferAmount = 7000;

  const transferTxRes = await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      type: "transfer",
      date: "2026-10-16",
      amount: transferAmount,
      fromAccountId: mainBank.id,
      toAccountId: cashAcc?.id,
      shopName: "ATM現金引き出し（資金移動テスト）",
      note: "口座間資金移動テスト",
    }),
  });
  assert(transferTxRes.ok, "資金移動明細登録成功 (POST /api/transactions)");
  const transferTxId = transferTxRes.json.createdTxIds[0];
  const transferCheckpointId = transferTxRes.json.checkpointId;
  assert(!!transferTxId && !!transferCheckpointId, "資金移動明細IDとチェックポイントIDの発行確認");

  const accAfterTransfer = await apiFetch("/api/accounts");
  const bankAfterTransfer = accAfterTransfer.json.accounts.find((a: any) => a.id === mainBank.id);
  const cashAfterTransfer = accAfterTransfer.json.accounts.find((a: any) => a.id === cashAcc?.id);

  assert(
    bankAfterTransfer.balance === bankBalBeforeTransfer - transferAmount,
    `移動元銀行口座が減額されたことを確認 (${bankBalBeforeTransfer}円 -> ${bankAfterTransfer.balance}円)`
  );
  assert(
    cashAfterTransfer.balance === cashBalBeforeTransfer + transferAmount,
    `移動先現金口座が増額されたことを確認 (${cashBalBeforeTransfer}円 -> ${cashAfterTransfer.balance}円)`
  );

  // 13.1 資金移動の金額変更 (PUT)
  const updatedTransferAmount = 10000;
  const updateTransferRes = await apiFetch("/api/transactions", {
    method: "PUT",
    body: JSON.stringify({
      id: transferTxId,
      amount: updatedTransferAmount,
      fromAccountId: mainBank.id,
      toAccountId: cashAcc?.id,
      shopName: "ATM現金引き出し（増額変更）",
    }),
  });
  assert(updateTransferRes.ok, "資金移動明細の更新成功 (PUT)");

  const accAfterUpdateTransfer = await apiFetch("/api/accounts");
  const bankAfterUpdateTransfer = accAfterUpdateTransfer.json.accounts.find((a: any) => a.id === mainBank.id);
  const cashAfterUpdateTransfer = accAfterUpdateTransfer.json.accounts.find((a: any) => a.id === cashAcc?.id);

  assert(
    bankAfterUpdateTransfer.balance === bankBalBeforeTransfer - updatedTransferAmount,
    `更新後: 移動元銀行口座が新金額 (${updatedTransferAmount}円) で正しく減額同期 (${bankAfterUpdateTransfer.balance}円)`
  );
  assert(
    cashAfterUpdateTransfer.balance === cashBalBeforeTransfer + updatedTransferAmount,
    `更新後: 移動先現金口座が新金額 (${updatedTransferAmount}円) で正しく増額同期 (${cashAfterUpdateTransfer.balance}円)`
  );

  // 13.2 資金移動のチェックポイントリバート (巻き戻し)
  const revertTransferRes = await apiFetch("/api/admin/revert", {
    method: "POST",
    body: JSON.stringify({ checkpointId: transferCheckpointId }),
  });
  assert(revertTransferRes.ok, "資金移動チェックポイントのリバート成功 (POST /api/admin/revert)");

  const accAfterRevertTransfer = await apiFetch("/api/accounts");
  const bankAfterRevertTransfer = accAfterRevertTransfer.json.accounts.find((a: any) => a.id === mainBank.id);
  const cashAfterRevertTransfer = accAfterRevertTransfer.json.accounts.find((a: any) => a.id === cashAcc?.id);

  assert(
    bankAfterRevertTransfer.balance === bankBalBeforeTransfer,
    `リバート後: 移動元銀行口座の残高が初期値に完全回復 (${bankAfterRevertTransfer.balance}円 == ${bankBalBeforeTransfer}円)`
  );
  assert(
    cashAfterRevertTransfer.balance === cashBalBeforeTransfer,
    `リバート後: 移動先現金口座の残高が初期値に完全回復 (${cashAfterRevertTransfer.balance}円 == ${cashBalBeforeTransfer}円)`
  );

  const txListAfterRevertTransfer = await apiFetch("/api/transactions");
  const transferTxInList = txListAfterRevertTransfer.json.transactions.find((t: any) => t.id === transferTxId);
  assert(!transferTxInList, "リバート後に資金移動明細が安全に削除されたことを確認");

  // 14. QRコード決済支出登録 & リバート時の残高逆算復元テスト
  console.log("\n--- 14. QRコード決済支出登録 & リバート時の残高逆算復元テスト ---");
  let qrPm = ctx.paymentMethods.find((p: any) => p.type === "qr_code");
  let createdQrPmId: string | null = null;
  if (!qrPm) {
    const createQrPmRes = await apiFetch("/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        actionType: "payment_method",
        name: "PayPay（テスト用）",
        type: "qr_code",
        sourceAccountId: mainBank.id,
      }),
    });
    assert(createQrPmRes.ok, "テスト用QR決済手段の作成成功 (POST)");
    createdQrPmId = createQrPmRes.json.id;
    qrPm = { id: createdQrPmId, type: "qr_code", sourceAccountId: mainBank.id };
  }

  const preQrAccRes = await apiFetch("/api/accounts");
  const targetAccForQr = preQrAccRes.json.accounts.find((a: any) => a.id === (qrPm.sourceAccountId || mainBank.id));
  const balBeforeQr = targetAccForQr.balance;
  const qrExpenseAmount = 1800;

  const qrTxRes = await apiFetch("/api/transactions", {
    method: "POST",
    body: JSON.stringify({
      type: "expense",
      date: "2026-10-16",
      amount: qrExpenseAmount,
      paymentMethodId: qrPm.id,
      shopName: "コンビニ（QR決済テスト）",
      note: "QRコード決済残高連動テスト",
    }),
  });
  assert(qrTxRes.ok, "QR決済支出明細登録成功 (POST)");
  const qrTxId = qrTxRes.json.createdTxIds[0];
  const qrCheckpointId = qrTxRes.json.checkpointId;

  const accAfterQr = await apiFetch("/api/accounts");
  const accAfterQrTarget = accAfterQr.json.accounts.find((a: any) => a.id === targetAccForQr.id);
  assert(
    accAfterQrTarget.balance === balBeforeQr - qrExpenseAmount,
    `QR決済支出により紐づく口座残高が減額されたことを確認 (${balBeforeQr}円 -> ${accAfterQrTarget.balance}円)`
  );

  // QR支出のリバート (残高逆算復元の確認)
  const revertQrRes = await apiFetch("/api/admin/revert", {
    method: "POST",
    body: JSON.stringify({ checkpointId: qrCheckpointId }),
  });
  assert(revertQrRes.ok, "QR決済チェックポイントのリバート成功 (POST /api/admin/revert)");

  const accAfterRevertQr = await apiFetch("/api/accounts");
  const accAfterRevertQrTarget = accAfterRevertQr.json.accounts.find((a: any) => a.id === targetAccForQr.id);
  assert(
    accAfterRevertQrTarget.balance === balBeforeQr,
    `リバート後: QR決済元の残高が元通り回復したことを確認 (${accAfterRevertQrTarget.balance}円 == ${balBeforeQr}円)`
  );

  if (createdQrPmId) {
    await apiFetch(`/api/accounts?id=${createdQrPmId}&actionType=payment_method`, {
      method: "DELETE",
    });
  }

  // 15. 家族メンバー管理 & パスワードポリシー設定 & 監査ログエクスポート API テスト
  console.log("\n--- 15. 家族メンバー管理 & パスワードポリシー & 監査ログエクスポート テスト ---");
  const membersRes = await apiFetch("/api/admin/members");
  assert(membersRes.ok, "家族メンバー一覧取得成功 (GET /api/admin/members)");
  assert(Array.isArray(membersRes.json.members), "メンバー一覧が配列形式であることを確認");

  const settingsRes = await apiFetch("/api/admin/settings");
  assert(settingsRes.ok, "システム設定取得成功 (GET /api/admin/settings)");
  assert(!!settingsRes.json.settings, "システム設定オブジェクトの存在確認");

  const updateSettingsRes = await apiFetch("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({
      currencySymbol: "¥",
      dateFormat: "YYYY/MM/DD",
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: false,
      },
    }),
  });
  assert(updateSettingsRes.ok, "システム設定更新成功 (PUT /api/admin/settings)");

  const logExportRes = await apiFetch("/api/admin/logs?format=csv");
  assert(logExportRes.ok, "監査ログCSVエクスポート成功 (GET /api/admin/logs?format=csv)");
  assert(logExportRes.text.includes('"ログID","日時","操作者メール","操作者ユーザーID","操作種別","対象種別"'), "監査ログCSVヘッダーの整合性確認");

  // 16. 新規世帯登録申請・許可制 & Super Admin 世帯管理フロー検証
  console.log("\n--- 16. 新規世帯登録申請・許可制 & Super Admin 世帯管理フローテスト ---");
  const testRunSuffix = Date.now();
  const applicantEmail1 = `applicant_${testRunSuffix}@example.com`;
  const applicantPass = "ApplicantPass123!";
  const applicantHouseholdName1 = `自動テスト申請世帯_${testRunSuffix}`;

  // 16.1 新規世帯登録申請 (pending 作成・Cookie 未発行)
  const applicant1Session = { cookieHeader: "" };
  const signupRes1 = await sessionFetch(
    "/api/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail1,
        password: applicantPass,
        householdName: applicantHouseholdName1,
      }),
    },
    applicant1Session
  );
  assert(signupRes1.status === 201 && signupRes1.ok, "新規世帯登録申請受付成功 (201 Created)");
  assert(signupRes1.json?.pendingApproval === true, "承認待ちフラグ (pendingApproval: true) が返却されることを確認");
  assert(!signupRes1.hasSetCookie, "申請時点ではセッション Cookie が発行されないことを確認");

  // 16.2 未承認状態でのログイン拒否 (403 Forbidden)
  const pendingLoginRes = await sessionFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail1,
        password: applicantPass,
      }),
    },
    applicant1Session
  );
  assert(pendingLoginRes.status === 403, `承認待ち状態でのログイン試行が 403 で拒否されることを確認 (actual: ${pendingLoginRes.status})`);
  assert(
    typeof pendingLoginRes.json?.error === "string" && pendingLoginRes.json.error.includes("承認待ち"),
    "承認待ちの案内メッセージが返却されることを確認"
  );

  // 16.3 Super Admin による承認待ち世帯一覧取得 & 自世帯停止ガード確認
  const pendingListRes = await apiFetch("/api/super-admin/households?status=pending");
  assert(pendingListRes.ok, "Super Admin 承認待ち世帯一覧取得成功 (GET /api/super-admin/households?status=pending)");
  const targetHousehold1 = pendingListRes.json?.households?.find(
    (h: any) => h.applicantEmail === applicantEmail1 && h.name === applicantHouseholdName1
  );
  assert(!!targetHousehold1 && targetHousehold1.status === "pending", "申請した世帯が承認待ち一覧に存在することを確認");

  const selfSuspendRes = await apiFetch("/api/super-admin/households", {
    method: "PUT",
    body: JSON.stringify({
      householdId: ctx.user.householdId,
      action: "suspend",
    }),
  });
  assert(selfSuspendRes.status === 400, "Super Admin 自身の所属世帯停止が 400 で拒否されることを確認");

  // 16.4 Super Admin による申請承認 (approve)
  const approveRes = await apiFetch("/api/super-admin/households", {
    method: "PUT",
    body: JSON.stringify({
      householdId: targetHousehold1.id,
      action: "approve",
    }),
  });
  assert(approveRes.ok && approveRes.json?.household?.status === "approved", "Super Admin による世帯申請承認成功 (approved)");

  // 16.5 承認後のログイン成功 & 初期シード（標準12費目・現金口座）確認
  const approvedLoginRes = await sessionFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail1,
        password: applicantPass,
      }),
    },
    applicant1Session
  );
  assert(approvedLoginRes.ok && approvedLoginRes.status === 200, "承認後の新規世帯ユーザーログイン成功 (200 OK)");
  assert(approvedLoginRes.json?.user?.isSuperAdmin === false, "新規世帯ユーザーは Super Admin ではないことを確認");

  const applicantMeRes = await sessionFetch("/api/auth/me", {}, applicant1Session);
  assert(
    applicantMeRes.ok && applicantMeRes.json?.user?.householdId === targetHousehold1.id,
    "承認後世帯のセッション検証 (/api/auth/me) 成功"
  );

  const applicantCatsRes = await sessionFetch("/api/categories", {}, applicant1Session);
  assert(
    applicantCatsRes.ok && applicantCatsRes.json?.categories?.length === 12,
    `承認時に標準12費目が初期シードされていることを確認 (${applicantCatsRes.json?.categories?.length}件)`
  );

  const applicantAccsRes = await sessionFetch("/api/accounts", {}, applicant1Session);
  assert(
    applicantAccsRes.ok && applicantAccsRes.json?.accounts?.some((a: any) => a.type === "cash"),
    "承認時にデフォルト現金口座が初期シードされていることを確認"
  );

  // 非 Super Admin による Super Admin API アクセス拒否 (403 Forbidden)
  const forbiddenSuperAdminRes = await sessionFetch(
    "/api/super-admin/households",
    {},
    applicant1Session
  );
  assert(forbiddenSuperAdminRes.status === 403, "一般家庭管理者の Super Admin API アクセスが 403 で拒否されることを確認");

  // 16.6 世帯の利用停止 (suspend) & セッション即時遮断 & 利用再開 (reactivate)
  const suspendRes = await apiFetch("/api/super-admin/households", {
    method: "PUT",
    body: JSON.stringify({
      householdId: targetHousehold1.id,
      action: "suspend",
      reason: "自動テストによる一時停止検証",
    }),
  });
  assert(suspendRes.ok && suspendRes.json?.household?.status === "suspended", "Super Admin による世帯利用停止成功 (suspended)");

  const suspendedMeRes = await sessionFetch("/api/auth/me", {}, applicant1Session);
  assert(suspendedMeRes.ok && suspendedMeRes.json?.user === null, "停止世帯の既存セッションが即座に遮断されることを確認");

  const suspendedLoginRes = await sessionFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail1,
        password: applicantPass,
      }),
    },
    { cookieHeader: "" }
  );
  assert(suspendedLoginRes.status === 403, "停止世帯でのログイン試行が 403 で拒否されることを確認");

  const reactivateRes = await apiFetch("/api/super-admin/households", {
    method: "PUT",
    body: JSON.stringify({
      householdId: targetHousehold1.id,
      action: "reactivate",
    }),
  });
  assert(reactivateRes.ok && reactivateRes.json?.household?.status === "approved", "Super Admin による世帯利用再開成功 (approved)");

  const reactivatedLoginRes = await sessionFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail1,
        password: applicantPass,
      }),
    },
    { cookieHeader: "" }
  );
  assert(reactivatedLoginRes.ok, "利用再開後の再ログイン成功 (200 OK)");

  // 16.7 却下 (reject) -> 物理削除 (DELETE) -> 同一メール再申請テスト
  const applicantEmail2 = `reject_test_${testRunSuffix}@example.com`;
  const signupRes2 = await sessionFetch(
    "/api/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail2,
        password: applicantPass,
        householdName: `却下テスト世帯_${testRunSuffix}`,
      }),
    },
    { cookieHeader: "" }
  );
  assert(signupRes2.status === 201, "2件目の世帯申請受付成功 (201 Created)");

  const pendingListRes2 = await apiFetch("/api/super-admin/households?status=pending");
  const targetHousehold2 = pendingListRes2.json?.households?.find(
    (h: any) => h.applicantEmail === applicantEmail2
  );
  assert(!!targetHousehold2, "2件目の申請が承認待ち一覧に存在することを確認");

  const rejectRes = await apiFetch("/api/super-admin/households", {
    method: "PUT",
    body: JSON.stringify({
      householdId: targetHousehold2.id,
      action: "reject",
      reason: "申請内容確認のため却下",
    }),
  });
  assert(rejectRes.ok && rejectRes.json?.household?.status === "rejected", "Super Admin による申請却下成功 (rejected)");

  const rejectedLoginRes = await sessionFetch(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail2,
        password: applicantPass,
      }),
    },
    { cookieHeader: "" }
  );
  assert(rejectedLoginRes.status === 403, "却下済み世帯のログイン試行が 403 で拒否されることを確認");

  const deleteRejectedRes = await apiFetch(
    `/api/super-admin/households?householdId=${encodeURIComponent(targetHousehold2.id)}`,
    { method: "DELETE" }
  );
  assert(deleteRejectedRes.ok, "却下済み世帯申請の物理削除（抹消）成功 (DELETE)");

  const reapplyRes = await sessionFetch(
    "/api/auth/signup",
    {
      method: "POST",
      body: JSON.stringify({
        email: applicantEmail2,
        password: applicantPass,
        householdName: `再申請世帯_${testRunSuffix}`,
      }),
    },
    { cookieHeader: "" }
  );
  assert(reapplyRes.status === 201, "抹消後に同一メールアドレスでの再申請が可能になることを確認");

  // 再申請した一時テストレコードをクリーンアップ
  const pendingAfterReapply = await apiFetch("/api/super-admin/households?status=pending");
  const reappliedHousehold = pendingAfterReapply.json?.households?.find(
    (h: any) => h.applicantEmail === applicantEmail2
  );
  if (reappliedHousehold) {
    await apiFetch(
      `/api/super-admin/households?householdId=${encodeURIComponent(reappliedHousehold.id)}`,
      { method: "DELETE" }
    );
  }

  console.log("\n==========================================================");
  console.log("🎉 すべてのテスト（全16カテゴリ・新規世帯申請/承認制・資金移動・QR逆算・CSV・CRUD・一括登録・残高整合性・管理機能）に完全合格しました！");
  console.log("==========================================================");
}

runComprehensiveTest().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
