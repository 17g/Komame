import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { masterDb } from "@/db";
import { users, households, householdMemberships } from "@/db/schema/master";
import { eq, and } from "drizzle-orm";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "komame_super_secret_jwt_key_2026_finance_app_household"
);

const COOKIE_NAME = "komame_session";

export interface SessionPayload {
  userId: string;
  email: string;
  activeHouseholdId: string;
  schemaName: string;
  role: string; // 'admin' | 'member'
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
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

// 4. JWT トークン検証
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// 5. 現在のリクエストのセッション取得
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
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
