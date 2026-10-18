import { NextRequest, NextResponse } from "next/server";

export interface CsrfValidationResult {
  isValid: boolean;
  error?: string;
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * 状態変更リクエスト (POST / PUT / DELETE / PATCH) に対する Origin / Host 整合性検証
 */
export function validateCsrfOrigin(req: Request | NextRequest): CsrfValidationResult {
  const method = req.method.toUpperCase();

  // 読み取り専用リクエスト (GET, HEAD, OPTIONS 等) は対象外
  if (!STATE_CHANGING_METHODS.has(method)) {
    return { isValid: true };
  }

  // Sec-Fetch-Site ヘッダーが存在する場合、cross-site を拒否
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return {
      isValid: false,
      error: "クロスサイトからの状態変更リクエストは禁止されています (Sec-Fetch-Site 違反)。",
    };
  }

  // リクエストのホストを取得 (x-forwarded-host を優先、なければ host)
  const reqHost = (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    ""
  ).toLowerCase().trim();

  const originHeader = req.headers.get("origin");
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      const originHost = originUrl.host.toLowerCase().trim();

      if (reqHost && originHost !== reqHost) {
        return {
          isValid: false,
          error: `Origin ヘッダー (${originHost}) がリクエスト Host (${reqHost}) と一致しません。`,
        };
      }
      return { isValid: true };
    } catch {
      return {
        isValid: false,
        error: "無効な Origin ヘッダー形式です。",
      };
    }
  }

  // Origin ヘッダーがない場合、Referer ヘッダーを確認
  const refererHeader = req.headers.get("referer");
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      const refererHost = refererUrl.host.toLowerCase().trim();

      if (reqHost && refererHost !== reqHost) {
        return {
          isValid: false,
          error: `Referer ヘッダー (${refererHost}) がリクエスト Host (${reqHost}) と一致しません。`,
        };
      }
      return { isValid: true };
    } catch {
      return {
        isValid: false,
        error: "無効な Referer ヘッダー形式です。",
      };
    }
  }

  // Origin も Referer もない場合（Node.js のスクリプトや cURL、同一オリジン内の古いクライアント等）は許容
  return { isValid: true };
}

/**
 * CSRF 検証失敗時の 403 Forbidden レスポンスを作成する
 */
export function createCsrfErrorResponse(customMessage?: string): NextResponse {
  return NextResponse.json(
    {
      error: customMessage || "クロスサイトリクエストフォージェリ (CSRF) 検証に失敗しました。",
    },
    { status: 403 }
  );
}
