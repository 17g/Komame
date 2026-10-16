import {
  pgSchema,
  varchar,
  text,
  bigint,
  boolean,
  date,
  timestamp,
  jsonb,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";

// 動的スキーマ用のテーブル定義ヘルパー関数
export function createTenantSchema(schemaName: string) {
  const schema = pgSchema(schemaName);

  // 1. 口座・ウォレット・現金
  const accounts = schema.table("accounts", {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 30 }).notNull(), // 'bank' | 'prepaid_wallet' | 'cash' | 'term_deposit' | 'nisa_investment'
    balance: bigint("balance", { mode: "number" }).default(0).notNull(),
    icon: varchar("icon", { length: 50 }),
    color: varchar("color", { length: 20 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(), // 論理削除 (非表示)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });

  // 2. 口座内バーチャル貯蓄 (資金色分け)
  const accountReservations = schema.table("account_reservations", {
    id: varchar("id", { length: 64 }).primaryKey(),
    accountId: varchar("account_id", { length: 64 })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    color: varchar("color", { length: 20 }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });

  // 3. 決済手段マスター
  const paymentMethods = schema.table("payment_methods", {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    type: varchar("type", { length: 30 }).notNull(), // 'cash' | 'credit_card' | 'debit_card' | 'qr_code' | 'direct_debit'
    sourceAccountId: varchar("source_account_id", { length: 64 }).references(() => accounts.id, {
      onDelete: "set null",
    }),
    closingDay: integer("closing_day"), // 1-28, 99 (月末)
    withdrawalDay: integer("withdrawal_day"), // 1-28, 99 (月末)
    withdrawalMonthOffset: integer("withdrawal_month_offset").default(1).notNull(), // 0:当月, 1:翌月, 2:翌々月
    isActive: boolean("is_active").default(true).notNull(), // 論理削除
  });

  // 4. 費目マスター
  const categories = schema.table("categories", {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    parentId: varchar("parent_id", { length: 64 }),
    icon: varchar("icon", { length: 50 }),
    color: varchar("color", { length: 20 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(), // 論理削除 (アーカイブ)
  });

  // 5. チェックポイント (24時間リバート)
  const checkpoints = schema.table("checkpoints", {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  });

  // 6. 明細データ
  const transactions = schema.table("transactions", {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'expense' | 'income' | 'transfer'
    date: date("date").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    categoryId: varchar("category_id", { length: 64 }).references(() => categories.id, {
      onDelete: "set null",
    }),
    paymentMethodId: varchar("payment_method_id", { length: 64 }).references(
      () => paymentMethods.id,
      { onDelete: "set null" }
    ),
    fromAccountId: varchar("from_account_id", { length: 64 }).references(() => accounts.id, {
      onDelete: "set null",
    }),
    toAccountId: varchar("to_account_id", { length: 64 }).references(() => accounts.id, {
      onDelete: "set null",
    }),
    shopName: varchar("shop_name", { length: 150 }),
    note: text("note"),
    isSettled: boolean("is_settled").default(false).notNull(),
    scheduledWithdrawalDate: date("scheduled_withdrawal_date"),
    checkpointId: varchar("checkpoint_id", { length: 64 }).references(() => checkpoints.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // 論理削除
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  });

  // 7. 収入詳細
  const incomes = schema.table("incomes", {
    id: varchar("id", { length: 64 }).primaryKey(),
    transactionId: varchar("transaction_id", { length: 64 })
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: "cascade" }),
    grossAmount: bigint("gross_amount", { mode: "number" }).notNull(),
    taxDeduction: bigint("tax_deduction", { mode: "number" }).default(0).notNull(),
    netAmount: bigint("net_amount", { mode: "number" }).notNull(),
    isTemporary: boolean("is_temporary").default(false).notNull(),
  });

  // 8. タグ管理
  const tags = schema.table("tags", {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    color: varchar("color", { length: 20 }),
  });

  const transactionTags = schema.table(
    "transaction_tags",
    {
      transactionId: varchar("transaction_id", { length: 64 })
        .notNull()
        .references(() => transactions.id, { onDelete: "cascade" }),
      tagId: varchar("tag_id", { length: 64 })
        .notNull()
        .references(() => tags.id, { onDelete: "cascade" }),
    },
    (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })]
  );

  // 9. 2段階一時保存
  const drafts = schema.table("drafts", {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    draftType: varchar("draft_type", { length: 20 }).notNull(), // 'manual' | 'auto'
    formType: varchar("form_type", { length: 30 }).notNull(), // 'single' | 'shop_batch' | 'category_batch'
    payloadJson: jsonb("payload_json").notNull(),
    itemCount: integer("item_count").default(1).notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  });

  // 10. 貯蓄目標
  const savingsGoals = schema.table("savings_goals", {
    id: varchar("id", { length: 64 }).primaryKey(),
    title: varchar("title", { length: 100 }).notNull(),
    targetAmount: bigint("target_amount", { mode: "number" }).notNull(),
    targetDate: date("target_date"),
    accountIdsJson: jsonb("account_ids_json"),
    color: varchar("color", { length: 20 }),
    isCompleted: boolean("is_completed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });

  // 11. アプリ内通知ボックス
  const notifications = schema.table("notifications", {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    type: varchar("type", { length: 30 }).notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    message: text("message").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });

  // 12. 操作ログ & 監査ログ
  const auditLogs = schema.table("audit_logs", {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    operatorUserId: varchar("operator_user_id", { length: 64 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(), // 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERT'
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    summary: text("summary").notNull(),
    beforeDataJson: jsonb("before_data_json"),
    afterDataJson: jsonb("after_data_json"),
    checkpointId: varchar("checkpoint_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });

  return {
    accounts,
    accountReservations,
    paymentMethods,
    categories,
    checkpoints,
    transactions,
    incomes,
    tags,
    transactionTags,
    drafts,
    savingsGoals,
    notifications,
    auditLogs,
  };
}

// デフォルト (マスタ用・型推論用)
export const defaultTenantSchema = createTenantSchema("tenant_default");
export type TenantSchemaTables = ReturnType<typeof createTenantSchema>;
