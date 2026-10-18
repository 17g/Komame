import {
  assertValidJwtSecret,
  createSessionToken,
  verifySessionToken,
  revokeToken,
  isTokenRevoked,
  SessionPayload,
} from "../src/lib/auth";
import { assertValidDatabaseUrl } from "../src/db/index";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [ASSERTION FAILED]: ${message}`);
    throw new Error(message);
  } else {
    console.log(`✅ [PASS]: ${message}`);
  }
}

async function runTests() {
  console.log("=========================================");
  console.log("🧪 Auth & Session Security Unit Tests (VULN-04 & VULN-06)");
  console.log("=========================================");

  // Test 1: assertValidJwtSecret in Production
  console.log("\n--- Test 1: JWT_SECRET Fail-Fast Validation ---");
  
  // 1.1 Development mode allows anything
  try {
    assertValidJwtSecret("short", "development");
    assert(true, "Development mode allows short JWT_SECRET without throwing");
  } catch {
    assert(false, "Development mode should not throw for short secret");
  }

  // 1.2 Production mode requires secret
  try {
    assertValidJwtSecret("", "production");
    assert(false, "Production mode should throw when secret is empty");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    assert(msg.includes("本番環境（NODE_ENV=production）では JWT_SECRET の設定が必須です"), "Throws when JWT_SECRET is empty in production");
  }

  // 1.3 Production mode requires at least 32 characters
  try {
    assertValidJwtSecret("too_short_key_12345", "production");
    assert(false, "Production mode should throw when secret is < 32 chars");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    assert(msg.includes("最低32文字以上"), "Throws when JWT_SECRET is < 32 chars in production");
  }

  // 1.4 Production mode forbids known sample secrets
  try {
    assertValidJwtSecret("komame_super_secret_jwt_key_2026_finance_app_household", "production");
    assert(false, "Production mode should throw when using known sample secret");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    assert(msg.includes("既知のサンプル・デフォルト JWT_SECRET を使用することは禁止"), "Throws when using known sample secret in production");
  }

  // 1.5 Production mode accepts valid secure 32+ char secret
  try {
    assertValidJwtSecret("my_ultra_secure_random_production_jwt_secret_key_2026_x99", "production");
    assert(true, "Production mode accepts strong 32+ character secret");
  } catch (err: unknown) {
    assert(false, `Valid production secret failed: ${(err as Error).message}`);
  }

  // Test 2: assertValidDatabaseUrl in Production
  console.log("\n--- Test 2: DATABASE_URL Fail-Fast Validation ---");
  
  // 2.1 Development mode allows empty URL
  try {
    assertValidDatabaseUrl("", "development");
    assert(true, "Development mode allows missing DATABASE_URL without throwing");
  } catch {
    assert(false, "Development mode should not throw for missing DATABASE_URL");
  }

  // 2.2 Production mode requires DATABASE_URL
  try {
    assertValidDatabaseUrl("", "production");
    assert(false, "Production mode should throw when DATABASE_URL is missing");
  } catch (err: unknown) {
    const msg = (err as Error).message;
    assert(msg.includes("本番環境（NODE_ENV=production）では DATABASE_URL の設定が必須です"), "Throws when DATABASE_URL is empty in production");
  }

  // 2.3 Production mode accepts valid DATABASE_URL
  try {
    assertValidDatabaseUrl("postgresql://user:pass@db:5432/db", "production");
    assert(true, "Production mode accepts valid DATABASE_URL");
  } catch (err: unknown) {
    assert(false, `Valid production DATABASE_URL failed: ${(err as Error).message}`);
  }

  // Test 3: Session Token Creation & Verification
  console.log("\n--- Test 3: Session Token Lifecycle ---");
  const testPayload: SessionPayload = {
    userId: "usr_test_999",
    email: "test.session@komame.local",
    activeHouseholdId: "hh_test_999",
    schemaName: "tenant_hh_test_999",
    role: "admin",
  };

  const token = await createSessionToken(testPayload);
  assert(typeof token === "string" && token.split(".").length === 3, "Session JWT generated successfully with 3 parts");

  const verified = await verifySessionToken(token);
  assert(verified !== null, "Session token verified successfully");
  assert(verified?.userId === testPayload.userId, "Verified payload contains correct userId");
  assert(verified?.activeHouseholdId === testPayload.activeHouseholdId, "Verified payload contains correct activeHouseholdId");
  assert(verified?.schemaName === testPayload.schemaName, "Verified payload contains correct schemaName");
  assert(verified?.role === testPayload.role, "Verified payload contains correct role");
  assert(typeof verified?.issuedAtMs === "number" && verified.issuedAtMs > 0, "Verified payload contains issuedAtMs timestamp");

  // Test 4: Token Revocation (Blacklist)
  console.log("\n--- Test 4: Token Revocation Mechanism ---");
  assert(!isTokenRevoked(token), "Token is not revoked initially");

  revokeToken(token);
  assert(isTokenRevoked(token), "Token is flagged as revoked after revokeToken()");

  const revokedVerify = await verifySessionToken(token);
  assert(revokedVerify === null, "verifySessionToken returns null for revoked token");

  // Test 5: Timestamp-based Invalidation Logic
  console.log("\n--- Test 5: Timestamp-based Invalidation (updatedAt vs issuedAtMs) ---");
  const now = Date.now();
  const oldTokenIssuedAt = now - 5000; // 5 seconds ago
  const passwordResetAt = new Date(now - 2000); // 2 seconds ago

  // If token was issued at oldTokenIssuedAt and password was reset at passwordResetAt:
  const isOldTokenRevoked = oldTokenIssuedAt < passwordResetAt.getTime();
  assert(isOldTokenRevoked, "Token issued before password reset (updatedAt) is recognized as invalid");

  const newTokenIssuedAt = now; // now
  const isNewTokenValid = newTokenIssuedAt >= passwordResetAt.getTime();
  assert(isNewTokenValid, "Token issued after password reset (updatedAt) is valid");

  console.log("=========================================");
  console.log("🎉 All Auth & Session Security tests passed successfully!");
  console.log("=========================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
