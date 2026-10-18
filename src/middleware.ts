import { NextRequest, NextResponse } from "next/server";
import { validateCsrfOrigin, createCsrfErrorResponse } from "@/lib/csrf";

export function middleware(req: NextRequest) {
  // 1. API への状態変更リクエストに対する CSRF Origin / Host 検証
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const csrfCheck = validateCsrfOrigin(req);
    if (!csrfCheck.isValid) {
      return createCsrfErrorResponse(csrfCheck.error);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
