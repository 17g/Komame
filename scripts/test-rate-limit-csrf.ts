import { checkRateLimit, resetRateLimitStore, getClientIp, createRateLimitResponse } from "../src/lib/rate-limit";
import { validateCsrfOrigin } from "../src/lib/csrf";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

async function runTests() {
  console.log("==========================================================");
  console.log("🛡️ レートリミッター & CSRF Origin 検証 単体テスト開始");
  console.log("==========================================================");

  // 1. スライディングウィンドウ レートリミッターのテスト
  console.log("\n--- 1. レートリミッター動作検証 ---");
  resetRateLimitStore();

  const testConfig = { limit: 3, windowMs: 1000 }; // 1秒間に3回まで
  const testKey = "test-user-ip-1";

  const res1 = checkRateLimit(testKey, testConfig);
  assert(res1.success && res1.remaining === 2, "1回目のリクエスト: 許可 (残り2)");

  const res2 = checkRateLimit(testKey, testConfig);
  assert(res2.success && res2.remaining === 1, "2回目のリクエスト: 許可 (残り1)");

  const res3 = checkRateLimit(testKey, testConfig);
  assert(res3.success && res3.remaining === 0, "3回目のリクエスト: 許可 (残り0)");

  const res4 = checkRateLimit(testKey, testConfig);
  assert(!res4.success && res4.remaining === 0 && res4.retryAfterSeconds >= 1, "4回目のリクエスト: 制限超過 (拒否・Retry-After >= 1)");

  // 429 レスポンス生成テスト
  const response429 = createRateLimitResponse(res4);
  assert(response429.status === 429, "HTTP ステータス 429 返却確認");
  assert(response429.headers.get("Retry-After") !== null, "Retry-After ヘッダー存在確認");
  assert(response429.headers.get("X-RateLimit-Limit") === "3", "X-RateLimit-Limit ヘッダー整合性確認");

  // 別キーの独立性検証
  const testKey2 = "test-user-ip-2";
  const resKey2 = checkRateLimit(testKey2, testConfig);
  assert(resKey2.success && resKey2.remaining === 2, "別キーのリクエスト: 影響を受けず許可");

  // 2. CSRF Origin / Host 検証のテスト
  console.log("\n--- 2. CSRF Origin / Host 整合性検証 ---");

  // 2.1 GET リクエストは常に許可
  const getReq = new Request("http://localhost:3080/api/accounts", {
    method: "GET",
    headers: { host: "localhost:3080" },
  });
  const getResult = validateCsrfOrigin(getReq);
  assert(getResult.isValid, "GET リクエストは無条件許可");

  // 2.2 POST で Origin と Host が一致する場合は許可
  const validPostReq = new Request("http://localhost:3080/api/transactions", {
    method: "POST",
    headers: {
      host: "localhost:3080",
      origin: "http://localhost:3080",
    },
  });
  const validResult = validateCsrfOrigin(validPostReq);
  assert(validResult.isValid, "同一 Origin の POST リクエストは許可");

  // 2.3 POST で Origin と Host が不一致の場合はブロック (攻撃検知)
  const attackerPostReq = new Request("http://localhost:3080/api/transactions", {
    method: "POST",
    headers: {
      host: "localhost:3080",
      origin: "http://evil-attacker.com",
    },
  });
  const attackerResult = validateCsrfOrigin(attackerPostReq);
  assert(!attackerResult.isValid, "悪意あるクロス Origin からの POST はブロック");

  // 2.4 Sec-Fetch-Site: cross-site の場合はブロック
  const crossSiteReq = new Request("http://localhost:3080/api/transactions", {
    method: "POST",
    headers: {
      host: "localhost:3080",
      "sec-fetch-site": "cross-site",
    },
  });
  const crossSiteResult = validateCsrfOrigin(crossSiteReq);
  assert(!crossSiteResult.isValid, "Sec-Fetch-Site: cross-site はブロック");

  // 2.5 Referer のみ存在し不一致の場合はブロック
  const attackerRefererReq = new Request("http://localhost:3080/api/transactions", {
    method: "POST",
    headers: {
      host: "localhost:3080",
      referer: "http://malicious-site.org/phishing",
    },
  });
  const attackerRefererResult = validateCsrfOrigin(attackerRefererReq);
  assert(!attackerRefererResult.isValid, "悪意ある Referer からの POST はブロック");

  // 2.6 Origin / Referer がない場合 (API クライアント・Node.js テスト互換) は許可
  const cliPostReq = new Request("http://localhost:3080/api/transactions", {
    method: "POST",
    headers: {
      host: "localhost:3080",
    },
  });
  const cliResult = validateCsrfOrigin(cliPostReq);
  assert(cliResult.isValid, "Origin/Referer なしの CLI / テストスクリプトは許可");

  console.log("\n==========================================================");
  console.log("🎉 レートリミッター & CSRF Origin 検証の全テストに合格しました！");
  console.log("==========================================================");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
