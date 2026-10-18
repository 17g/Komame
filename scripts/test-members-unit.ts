import {
  createInviteToken,
  verifyInviteToken,
  validatePasswordPolicy,
  hashPassword,
  verifyPassword,
} from "../src/lib/auth";

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
  console.log("🧪 Family Member Management Unit Tests");
  console.log("=========================================");

  // Test 1: Invite Token Generation and Verification
  const householdId = "hh_test_123456";
  const token = await createInviteToken({ householdId, role: "member" });
  assert(typeof token === "string" && token.length > 20, "Invite token created successfully");

  const verified = await verifyInviteToken(token);
  assert(verified !== null, "Token verified successfully");
  assert(verified?.householdId === householdId, "Household ID matches");
  assert(verified?.role === "member", "Role is member");
  assert(verified?.type === "household_invite", "Type is household_invite");

  // Test 2: Admin Invite Token
  const adminToken = await createInviteToken({ householdId, role: "admin" });
  const verifiedAdmin = await verifyInviteToken(adminToken);
  assert(verifiedAdmin?.role === "admin", "Admin role matches in token");

  // Test 3: Invalid token verification
  const invalidVerified = await verifyInviteToken("invalid.jwt.token");
  assert(invalidVerified === null, "Invalid token returns null");

  // Test 4: Password Policy Validation
  const validPwd = validatePasswordPolicy("KomameSecure2026!");
  assert(validPwd.isValid, "Valid complex password passes policy");

  const shortPwd = validatePasswordPolicy("Short1!");
  assert(!shortPwd.isValid, "Too short password fails policy");

  const noNumberPwd = validatePasswordPolicy("NoNumbersHere!");
  assert(!noNumberPwd.isValid, "Password without numbers fails policy");

  // Test 5: Custom Household Password Policy Validation
  const strictPolicy = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  };
  const failsLength = validatePasswordPolicy("Short1!Aa", strictPolicy);
  assert(!failsLength.isValid, "Password below custom minLength (12) fails");

  const failsSpecial = validatePasswordPolicy("NoSpecialChars123A", strictPolicy);
  assert(!failsSpecial.isValid, "Password missing special chars fails when required");

  const passesStrict = validatePasswordPolicy("ValidStrictPass2026!", strictPolicy);
  assert(passesStrict.isValid, "Valid password meeting all strict requirements passes");

  // Test 6: Email Normalization
  const rawEmail = "  User.Name+Test@Example.COM  ";
  const normalized = rawEmail.trim().toLowerCase();
  assert(normalized === "user.name+test@example.com", "Email is trimmed and lowercased");

  // Test 7: Hash & Verify
  const hash = await hashPassword("KomameFamily2026!");
  const match = await verifyPassword(hash, "KomameFamily2026!");
  assert(match === true, "Argon2id password verification succeeds");

  const mismatch = await verifyPassword(hash, "WrongPassword");
  assert(mismatch === false, "Argon2id password mismatch returns false");

  console.log("=========================================");
  console.log("🎉 All Member Management unit tests passed!");
  console.log("=========================================");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
