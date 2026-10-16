import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100);

    return NextResponse.json({ logs });
  } catch (error) {
    logger.error({ error }, "Error fetching audit logs");
    return NextResponse.json({ error: "操作ログの取得に失敗しました。" }, { status: 500 });
  }
}
