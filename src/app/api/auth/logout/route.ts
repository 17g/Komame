import { NextResponse } from "next/server";
import { getCurrentSession, clearSessionCookie, revokeToken } from "@/lib/auth";
import { masterDb } from "@/db";
import { users } from "@/db/schema/master";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("komame_session")?.value;
    const session = await getCurrentSession();

    if (token) {
      revokeToken(token);
    }

    if (session) {
      // ユーザーの更新時刻を更新し、既存の全JWTトークンを即時失効化 (VULN-06)
      await masterDb
        .update(users)
        .set({ updatedAt: new Date() })
        .where(eq(users.id, session.userId));
      logger.info({ userId: session.userId }, "User logged out and session revoked");
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error during logout");
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  }
}
