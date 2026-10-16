import {
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// 1. グローバル認証ユーザー
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  themePreference: varchar("theme_preference", { length: 50 }).default("natural_komame"),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. システムアカウント (世帯マスター)
export const households = pgTable("households", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  schemaName: varchar("schema_name", { length: 63 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 3. 世帯所属 (先行N:M互換設計)
export const householdMemberships = pgTable("household_memberships", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  householdId: varchar("household_id", { length: 36 })
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // 'admin' | 'member'
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'inactive'
  isDefault: boolean("is_default").default(true).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});

// 4. システム / 世帯全体設定
export const systemSettings = pgTable("system_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  householdId: varchar("household_id", { length: 36 }).references(() => households.id, {
    onDelete: "cascade",
  }),
  key: varchar("key", { length: 50 }).notNull(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
