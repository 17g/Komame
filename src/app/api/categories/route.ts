import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

// GET: 費目一覧取得
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const categories = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.isArchived, false))
      .orderBy(schema.categories.sortOrder);

    return NextResponse.json({ categories });
  } catch (error) {
    logger.error({ error }, "Error fetching categories");
    return NextResponse.json({ error: "費目データの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 費目の追加
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const { name, icon, color, parentId } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "費目名を入力してください。" }, { status: 400 });
    }

    const id = `cat_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.insert(schema.categories).values({
      id,
      name,
      icon: icon || "📁",
      color: color || "#2E7D32",
      parentId,
      sortOrder: 99,
      isArchived: false,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    logger.error({ error }, "Error creating category");
    return NextResponse.json({ error: "費目の作成に失敗しました。" }, { status: 500 });
  }
}
