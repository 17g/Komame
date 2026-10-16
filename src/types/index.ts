export type ThemeName =
  | "natural_komame"
  | "warm_latte"
  | "fintech_indigo"
  | "forest_mint"
  | "slate_dark";

export interface UserSession {
  userId: string;
  email: string;
  activeHouseholdId: string;
  schemaName: string;
  role: "admin" | "member";
}

export interface AccountItem {
  id: string;
  name: string;
  type: "bank" | "prepaid_wallet" | "cash" | "term_deposit" | "nisa_investment";
  balance: number;
  icon?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  reservedAmount?: number;
  availableBalance?: number;
}

export interface AccountReservationItem {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  color?: string;
  note?: string;
}

export interface PaymentMethodItem {
  id: string;
  name: string;
  type: "cash" | "credit_card" | "debit_card" | "qr_code" | "direct_debit";
  sourceAccountId?: string;
  sourceAccountName?: string;
  closingDay?: number;
  withdrawalDay?: number;
  withdrawalMonthOffset: number;
  isActive: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  parentId?: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  isArchived: boolean;
}

export interface TransactionItem {
  id: string;
  userId: string;
  type: "expense" | "income" | "transfer";
  date: string;
  amount: number;
  categoryId?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  fromAccountId?: string;
  toAccountId?: string;
  shopName?: string;
  note?: string;
  isSettled: boolean;
  scheduledWithdrawalDate?: string;
  createdAt: string;
}

export interface DraftItem {
  id: string;
  userId: string;
  draftType: "manual" | "auto";
  formType: "single" | "shop_batch" | "category_batch";
  payloadJson: Record<string, unknown>;
  itemCount: number;
  savedAt: string;
}

export interface SavingsGoalItem {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount?: number;
  progressRate?: number;
  targetDate?: string;
  accountIdsJson?: string[];
  color?: string;
  isCompleted: boolean;
}

export interface AuditLogItem {
  id: string;
  userId: string;
  operatorUserId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "REVERT";
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt: string;
  checkpointId?: string;
}

export interface CheckpointItem {
  id: string;
  userId: string;
  description?: string;
  createdAt: string;
  expiresAt: string;
  impactSummary?: {
    txCount: number;
    affectedUsers: string[];
  };
}
