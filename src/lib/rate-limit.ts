import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfterSeconds: number;
}

// キーごとのタイムスタンプ（ミリ秒）配列を保持するストア
const rateLimitStore = new Map<string, number[]>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1分ごとに古いキーをGC

/**
 * 古いエントリをストアから定期的にクリーンアップする
 */
function cleanupExpiredEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, timestamps] of rateLimitStore.entries()) {
    // 1時間以上アクセスのないキーは完全削除
    const validTimestamps = timestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (validTimestamps.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validTimestamps);
    }
  }
}

/**
 * リクエストからクライアント IP アドレスを取得する
 */
export function getClientIp(req: Request | NextRequest): string {
  const headers = req.headers;
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  return "127.0.0.1";
}

/**
 * スライディングウィンドウ方式でレートリミットを検査する
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const windowStart = now - config.windowMs;
  const existingTimestamps = rateLimitStore.get(key) || [];

  // 現在のウィンドウ内にあるタイムスタンプのみを保持
  const activeTimestamps = existingTimestamps.filter((t) => t > windowStart);

  if (activeTimestamps.length >= config.limit) {
    // 制限超過: 一番古い有効なリクエストが期限切れになるまでの秒数を計算
    const oldestTimestamp = activeTimestamps[0];
    const resetTime = oldestTimestamp + config.windowMs;
    const retryAfterMs = Math.max(0, resetTime - now);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return {
      success: false,
      limit: config.limit,
      remaining: 0,
      resetTime,
      retryAfterSeconds,
    };
  }

  // 許容内: 現在のタイムスタンプを追加
  activeTimestamps.push(now);
  rateLimitStore.set(key, activeTimestamps);

  const oldestTimestamp = activeTimestamps[0];
  const resetTime = oldestTimestamp + config.windowMs;

  return {
    success: true,
    limit: config.limit,
    remaining: config.limit - activeTimestamps.length,
    resetTime,
    retryAfterSeconds: 0,
  };
}

/**
 * レートリミット制限超過用の 429 Too Many Requests レスポンスを作成する
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  customMessage?: string
): NextResponse {
  const message =
    customMessage ||
    `リクエスト数が上限（${result.limit}回）に達しました。${result.retryAfterSeconds}秒後に再試行してください。`;

  return NextResponse.json(
    {
      error: message,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": result.retryAfterSeconds.toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": Math.ceil(result.resetTime / 1000).toString(),
      },
    }
  );
}

/**
 * テスト・検証用: ストアの初期化
 */
export function resetRateLimitStore(keyPrefix?: string): void {
  if (keyPrefix) {
    for (const key of rateLimitStore.keys()) {
      if (key.startsWith(keyPrefix)) {
        rateLimitStore.delete(key);
      }
    }
  } else {
    rateLimitStore.clear();
  }
}

// プリセット設定
export const AUTH_RATE_LIMITS = {
  // ログイン: IPごと 1分間に 10回
  loginByIp: { limit: 10, windowMs: 60 * 1000 },
  // ログイン: メールアドレスごと 1分間に 5回 (ブルートフォース防御)
  loginByAccount: { limit: 5, windowMs: 60 * 1000 },
  // サインアップ: IPごと 1分間に 5回 (動的テナントスキーマ生成 DoS 防御)
  signupByIp: { limit: 5, windowMs: 60 * 1000 },
  // 招待参加: IPごと 1分間に 10回
  inviteByIp: { limit: 10, windowMs: 60 * 1000 },
};
