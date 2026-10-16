import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb, masterDb } from "@/db";
import { users, householdMemberships } from "@/db/schema/master";
import { desc, eq, and, or, gte, lte } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { generateCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const format = searchParams.get("format"); // 'json' | 'csv'
    const isDownload =
      searchParams.get("download") === "true" ||
      searchParams.get("download") === "1" ||
      format === "csv";
    const limitParam = searchParams.get("limit");
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : isDownload ? 5000 : 200;

    // 1. 世帯メンバーのメールアドレスマップ取得 (ID -> Email)
    const members = await masterDb
      .select({
        userId: users.id,
        email: users.email,
      })
      .from(householdMemberships)
      .innerJoin(users, eq(householdMemberships.userId, users.id))
      .where(eq(householdMemberships.householdId, session.activeHouseholdId));

    const userEmailMap = new Map<string, string>();
    for (const m of members) {
      userEmailMap.set(m.userId, m.email);
    }

    // 2. テナント監査ログのクエリ構築
    const { db, schema } = getTenantDb(session.schemaName);

    let startObj: Date | undefined = undefined;
    if (startDate) {
      const parsed = new Date(startDate.includes("T") ? startDate : `${startDate}T00:00:00.000Z`);
      if (!isNaN(parsed.getTime())) {
        startObj = parsed;
      }
    }

    let endObj: Date | undefined = undefined;
    if (endDate) {
      const parsed = new Date(endDate.includes("T") ? endDate : `${endDate}T23:59:59.999Z`);
      if (!isNaN(parsed.getTime())) {
        endObj = parsed;
      }
    }

    const whereClause = and(
      userId && userId !== "all"
        ? or(
            eq(schema.auditLogs.operatorUserId, userId),
            eq(schema.auditLogs.userId, userId)
          )
        : undefined,
      action && action !== "all"
        ? eq(schema.auditLogs.action, action.toUpperCase())
        : undefined,
      startObj ? gte(schema.auditLogs.createdAt, startObj) : undefined,
      endObj ? lte(schema.auditLogs.createdAt, endObj) : undefined
    );

    const rawLogs = await db
      .select()
      .from(schema.auditLogs)
      .where(whereClause)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(parsedLimit);

    const logs = rawLogs.map((log) => ({
      id: log.id,
      userId: log.userId,
      operatorUserId: log.operatorUserId,
      operatorEmail: userEmailMap.get(log.operatorUserId) || log.operatorUserId,
      action: log.action as "CREATE" | "UPDATE" | "DELETE" | "REVERT",
      entityType: log.entityType,
      entityId: log.entityId || undefined,
      summary: log.summary,
      beforeDataJson: log.beforeDataJson,
      afterDataJson: log.afterDataJson,
      checkpointId: log.checkpointId || undefined,
      createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    }));

    // 3. CSV 形式でのダウンロード
    if (format === "csv") {
      const headers = [
        "ログID",
        "日時",
        "操作者メール",
        "操作者ユーザーID",
        "操作種別",
        "対象種別",
        "対象ID",
        "概要",
        "チェックポイントID",
        "変更前データ",
        "変更後データ",
      ];

      const rows = logs.map((l) => [
        l.id,
        l.createdAt,
        l.operatorEmail,
        l.operatorUserId,
        l.action,
        l.entityType,
        l.entityId || "",
        l.summary,
        l.checkpointId || "",
        l.beforeDataJson ? JSON.stringify(l.beforeDataJson) : "",
        l.afterDataJson ? JSON.stringify(l.afterDataJson) : "",
      ]);

      const csvContent = generateCsv(headers, rows);
      const filename = `komame_audit_logs_${session.activeHouseholdId}_${new Date().toISOString().split("T")[0]}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // 4. JSON 形式でのダウンロード
    if (format === "json" && isDownload) {
      const filename = `komame_audit_logs_${session.activeHouseholdId}_${new Date().toISOString().split("T")[0]}.json`;
      return new NextResponse(JSON.stringify({ logs, totalCount: logs.length }, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // 5. 標準 JSON レスポンス (画面表示用)
    return NextResponse.json({ logs, totalCount: logs.length });
  } catch (error) {
    logger.error({ error }, "Error fetching or exporting audit logs");
    return NextResponse.json({ error: "操作ログの取得・出力に失敗しました。" }, { status: 500 });
  }
}
