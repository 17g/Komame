import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { eq, asc } from "drizzle-orm";
import { logger } from "@/lib/logger";

const DEFAULT_TAGS = [
  { name: "固定費", color: "#4F46E5" },
  { name: "変動費", color: "#0284C7" },
  { name: "自己投資", color: "#16A34A" },
  { name: "特別費", color: "#9333EA" },
  { name: "ご褒美", color: "#EA580C" },
];

// GET: 世帯内のタグ一覧取得 (初期プリセットの遅延シード含む)
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    let tags = await db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
        color: schema.tags.color,
      })
      .from(schema.tags)
      .orderBy(asc(schema.tags.name));

    // 初回利用時、タグが未登録であればプリセットタグを自動投入
    if (tags.length === 0) {
      for (const preset of DEFAULT_TAGS) {
        const tagId = `tag_${crypto.randomUUID().replace(/-/g, "")}`;
        await db.insert(schema.tags).values({
          id: tagId,
          name: preset.name,
          color: preset.color,
        });
      }

      tags = await db
        .select({
          id: schema.tags.id,
          name: schema.tags.name,
          color: schema.tags.color,
        })
        .from(schema.tags)
        .orderBy(asc(schema.tags.name));
    }

    return NextResponse.json({ tags });
  } catch (error) {
    logger.error({ error }, "Error fetching tags");
    return NextResponse.json({ error: "タグの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 新規タグの作成
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const body = await req.json();
    const rawName = body.name?.trim() || "";
    const cleanName = rawName.replace(/^#+/, "");
    const color = body.color || "#10B981";

    if (!cleanName) {
      return NextResponse.json({ error: "タグ名を入力してください。" }, { status: 400 });
    }

    // 同名タグの存在確認
    const [existingTag] = await db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.name, cleanName))
      .limit(1);

    if (existingTag) {
      return NextResponse.json({ tag: existingTag, existed: true });
    }

    const tagId = `tag_${crypto.randomUUID().replace(/-/g, "")}`;
    const newTag = {
      id: tagId,
      name: cleanName,
      color,
    };

    await db.insert(schema.tags).values(newTag);

    return NextResponse.json({ tag: newTag, existed: false });
  } catch (error) {
    logger.error({ error }, "Error creating tag");
    return NextResponse.json({ error: "タグの作成に失敗しました。" }, { status: 500 });
  }
}
