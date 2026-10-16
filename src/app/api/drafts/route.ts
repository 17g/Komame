import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

// GET: ユーザーの一時保存データ一覧 (手動 & 自動)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const drafts = await db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.userId, session.userId));

    const manualDraft = drafts.find((d) => d.draftType === "manual") || null;
    const autoDraft = drafts.find((d) => d.draftType === "auto") || null;

    return NextResponse.json({ manualDraft, autoDraft });
  } catch (error) {
    logger.error({ error }, "Error fetching drafts");
    return NextResponse.json({ error: "一時保存データの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 一時保存データの保存・更新 (手動 / 自動)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const { draftType, formType, payloadJson, itemCount } = await req.json();

    if (!draftType || !formType || !payloadJson) {
      return NextResponse.json({ error: "一時保存パラメータが不正です。" }, { status: 400 });
    }

    // 既存の同一種別ドラフトを削除 (1スロット制約)
    await db
      .delete(schema.drafts)
      .where(
        and(
          eq(schema.drafts.userId, session.userId),
          eq(schema.drafts.draftType, draftType)
        )
      );

    // 新規ドラフト保存
    const id = `draft_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.insert(schema.drafts).values({
      id,
      userId: session.userId,
      draftType,
      formType,
      payloadJson,
      itemCount: itemCount || 1,
    });

    return NextResponse.json({ success: true, id, savedAt: new Date().toISOString() });
  } catch (error) {
    logger.error({ error }, "Error saving draft");
    return NextResponse.json({ error: "一時保存処理に失敗しました。" }, { status: 500 });
  }
}

// DELETE: 一時保存データの破棄
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const draftType = req.nextUrl.searchParams.get("draftType");

    if (draftType) {
      await db
        .delete(schema.drafts)
        .where(
          and(
            eq(schema.drafts.userId, session.userId),
            eq(schema.drafts.draftType, draftType)
          )
        );
    } else {
      await db.delete(schema.drafts).where(eq(schema.drafts.userId, session.userId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Error deleting draft");
    return NextResponse.json({ error: "一時保存データの削除に失敗しました。" }, { status: 500 });
  }
}
