import { logger } from "../src/lib/logger";

const BASE_URL = "http://localhost:3000";

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

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (ctx.cookieHeader) {
    headers.set("Cookie", ctx.cookieHeader);
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
    ctx.cookieHeader = setCookie.split(";")[0];
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // text
  }

  return { status: res.status, ok: res.ok, json, text };
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

  console.log("\n==========================================================");
  console.log("🎉 すべてのテスト（全10カテゴリ・CRUD・ビジネスロジック）に完全合格しました！");
  console.log("==========================================================");
}

runComprehensiveTest().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
