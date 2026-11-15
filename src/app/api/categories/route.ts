import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getTenantDb } from "@/db";
import { and, asc, eq, ne } from "drizzle-orm";
import { logger } from "@/lib/logger";
import {
  isSystemProtectedCategory,
  validateCategoryInput,
  validateReorderIds,
} from "@/lib/category-helpers";

class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// GET: 費目一覧取得
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  if (includeArchived && session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);
    const rows = includeArchived
      ? await db
          .select()
          .from(schema.categories)
          .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.id))
      : await db
          .select()
          .from(schema.categories)
          .where(eq(schema.categories.isArchived, false))
          .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.id));

    const categories = rows.map((cat) => ({
      ...cat,
      isSystem: isSystemProtectedCategory(cat),
    }));

    return NextResponse.json({ categories });
  } catch (error) {
    logger.error({ error }, "Error fetching categories");
    return NextResponse.json({ error: "費目データの取得に失敗しました。" }, { status: 500 });
  }
}

// POST: 費目の新規追加 (家庭管理者限定)
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const validation = validateCategoryInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, icon, color } = validation.data;

    const { db, schema } = getTenantDb(session.schemaName);

    const created = await db.transaction(async (tx) => {
      const existingAll = await tx
        .select()
        .from(schema.categories)
        .orderBy(asc(schema.categories.sortOrder));

      const duplicate = existingAll.find(
        (cat) => !cat.isArchived && cat.name.trim() === name
      );
      if (duplicate) {
        throw new ApiHttpError(409, `費目「${name}」は既に登録されています。`);
      }

      const maxSortOrder = existingAll.reduce(
        (max, cat) => (cat.sortOrder > max ? cat.sortOrder : max),
        0
      );
      const nextSortOrder = maxSortOrder + 1;
      const id = `cat_${crypto.randomUUID().replace(/-/g, "")}`;

      const newCategory = {
        id,
        name,
        icon,
        color,
        parentId: null,
        sortOrder: nextSortOrder,
        isSystem: false,
        isArchived: false,
      };

      await tx.insert(schema.categories).values(newCategory);

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "CREATE",
        entityType: "category",
        entityId: id,
        summary: `費目「${name}」を追加しました`,
        afterDataJson: newCategory,
      });

      return newCategory;
    });

    return NextResponse.json({
      success: true,
      id: created.id,
      category: created,
      message: `費目「${created.name}」を追加しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error creating category");
    return NextResponse.json({ error: "費目の作成に失敗しました。" }, { status: 500 });
  }
}

// PUT: 費目情報の編集 / 並び順一括更新 / アーカイブ復元 (家庭管理者限定)
export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "update";
    const { db, schema } = getTenantDb(session.schemaName);

    // 1. 並び順一括更新 (標準12費目を含む全費目が対象)
    if (action === "reorder") {
      const idValidation = validateReorderIds(body.orderedIds);
      if (!idValidation.ok) {
        return NextResponse.json({ error: idValidation.error }, { status: 400 });
      }
      const orderedIds = idValidation.ids;

      await db.transaction(async (tx) => {
        const allCategories = await tx
          .select()
          .from(schema.categories)
          .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.id));

        const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
        for (const id of orderedIds) {
          if (!categoryMap.has(id)) {
            throw new ApiHttpError(400, `指定された費目ID (${id}) が見つかりません。`);
          }
        }

        const orderedSet = new Set(orderedIds);
        const remainingIds = allCategories
          .filter((c) => !orderedSet.has(c.id))
          .map((c) => c.id);
        const finalOrderIds = [...orderedIds, ...remainingIds];

        const beforeOrder = allCategories.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
        }));

        for (let idx = 0; idx < finalOrderIds.length; idx++) {
          const id = finalOrderIds[idx];
          const newSortOrder = idx + 1;
          const existing = categoryMap.get(id);
          if (existing && existing.sortOrder !== newSortOrder) {
            await tx
              .update(schema.categories)
              .set({ sortOrder: newSortOrder })
              .where(eq(schema.categories.id, id));
          }
        }

        const afterOrder = finalOrderIds.map((id, idx) => ({
          id,
          name: categoryMap.get(id)?.name ?? "",
          sortOrder: idx + 1,
        }));

        await tx.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "UPDATE",
          entityType: "category",
          summary: `費目の表示順を更新しました (${orderedIds.length}件)`,
          beforeDataJson: beforeOrder,
          afterDataJson: afterOrder,
        });
      });

      return NextResponse.json({
        success: true,
        message: "費目の並び順を更新しました。",
      });
    }

    // 2. アーカイブ済み費目の復元 (ユーザー追加費目のみ)
    if (action === "restore") {
      const id = typeof body?.id === "string" ? body.id.trim() : "";
      if (!id) {
        return NextResponse.json({ error: "費目IDを指定してください。" }, { status: 400 });
      }

      const restored = await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(schema.categories)
          .where(eq(schema.categories.id, id))
          .limit(1);

        if (!target) {
          throw new ApiHttpError(404, "指定された費目が見つかりません。");
        }
        if (isSystemProtectedCategory(target)) {
          throw new ApiHttpError(403, "標準12費目は保護されているため操作できません。");
        }
        if (!target.isArchived) {
          return target;
        }

        const [duplicate] = await tx
          .select()
          .from(schema.categories)
          .where(
            and(
              eq(schema.categories.name, target.name),
              eq(schema.categories.isArchived, false),
              ne(schema.categories.id, target.id)
            )
          )
          .limit(1);

        if (duplicate) {
          throw new ApiHttpError(
            409,
            `同名の有効な費目「${target.name}」が既に存在するため復元できません。`
          );
        }

        await tx
          .update(schema.categories)
          .set({ isArchived: false })
          .where(eq(schema.categories.id, target.id));

        const updated = { ...target, isArchived: false };

        await tx.insert(schema.auditLogs).values({
          id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
          userId: session.userId,
          operatorUserId: session.userId,
          action: "UPDATE",
          entityType: "category",
          entityId: target.id,
          summary: `費目「${target.name}」を復元しました`,
          beforeDataJson: target,
          afterDataJson: updated,
        });

        return updated;
      });

      return NextResponse.json({
        success: true,
        category: restored,
        message: `費目「${restored.name}」を復元しました。`,
      });
    }

    // 3. 費目情報の編集 (ユーザー追加費目のみ)
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "費目IDを指定してください。" }, { status: 400 });
    }

    const validation = validateCategoryInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { name, icon, color } = validation.data;

    const updatedCategory = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, id))
        .limit(1);

      if (!target) {
        throw new ApiHttpError(404, "指定された費目が見つかりません。");
      }
      if (isSystemProtectedCategory(target)) {
        throw new ApiHttpError(403, "標準12費目の名前・アイコン・カラーは変更できません。");
      }

      const [duplicate] = await tx
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.name, name),
            eq(schema.categories.isArchived, false),
            ne(schema.categories.id, target.id)
          )
        )
        .limit(1);

      if (duplicate) {
        throw new ApiHttpError(409, `費目「${name}」は既に登録されています。`);
      }

      await tx
        .update(schema.categories)
        .set({ name, icon, color })
        .where(eq(schema.categories.id, target.id));

      const afterData = { ...target, name, icon, color };

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "UPDATE",
        entityType: "category",
        entityId: target.id,
        summary: `費目「${target.name}」を「${name}」へ更新しました`,
        beforeDataJson: target,
        afterDataJson: afterData,
      });

      return afterData;
    });

    return NextResponse.json({
      success: true,
      category: updatedCategory,
      message: `費目「${updatedCategory.name}」を更新しました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error updating category");
    return NextResponse.json({ error: "費目の更新に失敗しました。" }, { status: 500 });
  }
}

// DELETE: 費目の論理削除 / アーカイブ (家庭管理者限定・標準12費目保護)
export async function DELETE(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  if (!id) {
    return NextResponse.json({ error: "費目IDを指定してください。" }, { status: 400 });
  }

  try {
    const { db, schema } = getTenantDb(session.schemaName);

    const archived = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, id))
        .limit(1);

      if (!target) {
        throw new ApiHttpError(404, "指定された費目が見つかりません。");
      }
      if (isSystemProtectedCategory(target)) {
        throw new ApiHttpError(403, "標準12費目はアーカイブできません。");
      }
      if (target.isArchived) {
        return target;
      }

      await tx
        .update(schema.categories)
        .set({ isArchived: true })
        .where(eq(schema.categories.id, target.id));

      const afterData = { ...target, isArchived: true };

      await tx.insert(schema.auditLogs).values({
        id: `log_${crypto.randomUUID().replace(/-/g, "")}`,
        userId: session.userId,
        operatorUserId: session.userId,
        action: "DELETE",
        entityType: "category",
        entityId: target.id,
        summary: `費目「${target.name}」をアーカイブしました`,
        beforeDataJson: target,
        afterDataJson: afterData,
      });

      return afterData;
    });

    return NextResponse.json({
      success: true,
      category: archived,
      message: `費目「${archived.name}」をアーカイブしました。`,
    });
  } catch (error) {
    if (error instanceof ApiHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ error }, "Error archiving category");
    return NextResponse.json({ error: "費目のアーカイブに失敗しました。" }, { status: 500 });
  }
}
