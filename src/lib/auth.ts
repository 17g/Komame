import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { masterDb, assertValidSchemaName } from "@/db";
import { users, households, householdMemberships, systemSettings } from "@/db/schema/master";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

const INSECURE_SAMPLE_SECRETS = new Set([
  "komame_super_secret_jwt_key_2026_finance_app_household",
  "secret",
  "jwt_secret",
  "change_me",
  "change_this_secret_in_production",
  "your-secret-key",
  "12345678901234567890123456789012",
  "abcdefghijklmnopqrstuvwxyz123456",
]);

// 本番環境における JWT_SECRET の Fail-Fast 検証 (VULN-04)
export function assertValidJwtSecret(secret?: string, nodeEnv = process.env.NODE_ENV): void {
  const isProduction = nodeEnv === "production";
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  if (isProduction && !isBuildPhase) {
    if (!secret || secret.trim().length === 0) {
      throw new Error("【セキュリティ違反】本番環境（NODE_ENV=production）では JWT_SECRET の設定が必須です。");
    }
    if (secret.length < 32) {
      throw new Error(`【セキュリティ違反】本番環境の JWT_SECRET は最低32文字以上である必要があります。（現在: ${secret.length}文字）`);
    }
    if (INSECURE_SAMPLE_SECRETS.has(secret.trim().toLowerCase())) {
      throw new Error("【セキュリティ違反】本番環境で既知のサンプル・デフォルト JWT_SECRET を使用することは禁止されています。安全なランダムシークレットを設定してください。");
    }
  }
}

// 起動時 Fail-Fast 検証
assertValidJwtSecret(process.env.JWT_SECRET);

export function getJwtSecretKey(): Uint8Array {
  assertValidJwtSecret(process.env.JWT_SECRET);
  const effectiveSecret =
    process.env.JWT_SECRET || "komame_super_secret_jwt_key_2026_finance_app_household";
  return new TextEncoder().encode(effectiveSecret);
}

const COOKIE_NAME = "komame_session";

// 失効トークン管理 (メモリ上ブラックリスト: VULN-06)
const revokedTokens = new Set<string>();
const MAX_REVOKED_TOKENS = 10000;

export function revokeToken(token: string): void {
  try {
    if (revokedTokens.size > MAX_REVOKED_TOKENS) {
      const firstItems = Array.from(revokedTokens).slice(0, 2000);
      firstItems.forEach((t) => revokedTokens.delete(t));
    }
    const parts = token.split(".");
    if (parts.length === 3) {
      revokedTokens.add(parts[2]);
    } else {
      revokedTokens.add(token);
    }
  } catch {
    // ignore
  }
}

export function isTokenRevoked(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length === 3 && revokedTokens.has(parts[2])) {
      return true;
    }
    return revokedTokens.has(token);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: string;
  email: string;
  activeHouseholdId: string;
  schemaName: string;
  role: string; // 'admin' | 'member'
  issuedAtMs?: number;
  iat?: number;
  exp?: number;
}

// 1. パスワードハッシュ化 (Argon2id)
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

// 2. パスワード検証
export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  return await verify(hashStr, plain);
}

// 3. JWT トークン発行
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secretKey = getJwtSecretKey();
  const issuedAtMs = Date.now();
  return await new SignJWT({ ...payload, issuedAtMs })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

// 4. JWT トークン検証
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token || isTokenRevoked(token)) return null;
  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export interface InviteTokenPayload {
  householdId: string;
  role: "admin" | "member";
  type: "household_invite";
}

// 4.1 招待トークン発行 (7日間有効)
export async function createInviteToken(payload: { householdId: string; role: "admin" | "member" }): Promise<string> {
  const secretKey = getJwtSecretKey();
  return await new SignJWT({ ...payload, type: "household_invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

// 4.2 招待トークン検証
export async function verifyInviteToken(token: string): Promise<InviteTokenPayload | null> {
  try {
    const secretKey = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    if (payload.type !== "household_invite") return null;
    return payload as unknown as InviteTokenPayload;
  } catch {
    return null;
  }
}

// 5. 現在のリクエストのセッション取得 (DBリアルタイム突合・権限/無効化/失効検証)
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  // 1. JWT 署名 & 失効リスト検証
  const payload = await verifySessionToken(token);
  if (!payload || !payload.userId || !payload.activeHouseholdId) return null;

  // 2. DB リアルタイム突合検証 (VULN-04 & VULN-06)
  try {
    const [record] = await masterDb
      .select({
        userId: users.id,
        email: users.email,
        isActive: users.isActive,
        userUpdatedAt: users.updatedAt,
        householdId: households.id,
        schemaName: households.schemaName,
        role: householdMemberships.role,
        membershipStatus: householdMemberships.status,
      })
      .from(users)
      .innerJoin(householdMemberships, eq(householdMemberships.userId, users.id))
      .innerJoin(households, eq(householdMemberships.householdId, households.id))
      .where(
        and(
          eq(users.id, payload.userId),
          eq(householdMemberships.householdId, payload.activeHouseholdId)
        )
      )
      .limit(1);

    // ユーザーが存在しない、無効化されている、または世帯所属が無効
    if (
      !record ||
      !record.isActive ||
      record.membershipStatus !== "active"
    ) {
      return null;
    }

    // 3. トークン発行時刻とユーザー更新時刻（パスワードリセット・ログアウト）の突合
    if (record.userUpdatedAt) {
      const updatedAtTime = record.userUpdatedAt.getTime();
      if (typeof payload.issuedAtMs === "number") {
        if (payload.issuedAtMs < updatedAtTime) {
          return null; // パスワード変更またはログアウト後に発行されたトークンではないため失効
        }
      } else if (payload.iat) {
        // legacy トークン (秒単位、1秒のマージンを考慮)
        if (payload.iat < Math.floor(updatedAtTime / 1000) - 1) {
          return null;
        }
      }
    }

    // 4. スキーマ名ホワイトリスト検証
    assertValidSchemaName(record.schemaName);

    // 5. DBから最新の権限・世帯・スキーマ情報を反映して返却
    return {
      userId: record.userId,
      email: record.email,
      activeHouseholdId: record.householdId,
      schemaName: record.schemaName,
      role: record.role as "admin" | "member",
      issuedAtMs: payload.issuedAtMs,
    };
  } catch (error) {
    logger.error({ error }, "Error validating session against database");
    return null;
  }
}

// 6. セッションCookieの設定
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

// 7. セッションCookieの削除
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// 8. パスワードポリシー動的検証
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
  }
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`パスワードは最低${policy.minLength}文字以上である必要があります。`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("大文字を含める必要があります。");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("小文字を含める必要があります。");
  }
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push("数字を含める必要があります。");
  }
  if (policy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("特殊文字を含める必要があります。");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 9. 世帯の動的パスワードポリシー取得
export async function getHouseholdPasswordPolicy(householdId: string): Promise<PasswordPolicy> {
  try {
    const [setting] = await masterDb
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.householdId, householdId),
          eq(systemSettings.key, "password_policy")
        )
      )
      .limit(1);

    if (setting && setting.valueJson) {
      const val = setting.valueJson as Partial<PasswordPolicy>;
      return {
        minLength: typeof val.minLength === "number" ? val.minLength : 8,
        requireUppercase: typeof val.requireUppercase === "boolean" ? val.requireUppercase : true,
        requireLowercase: typeof val.requireLowercase === "boolean" ? val.requireLowercase : true,
        requireNumbers: typeof val.requireNumbers === "boolean" ? val.requireNumbers : true,
        requireSpecialChars: typeof val.requireSpecialChars === "boolean" ? val.requireSpecialChars : false,
      };
    }
  } catch {
    // DBエラー時フォールバック
  }

  return {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
  };
}

