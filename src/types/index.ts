export type ThemeName =
  | "natural_komame"
  | "warm_latte"
  | "fintech_indigo"
  | "forest_mint"
  | "slate_dark";

export type HouseholdStatus = "pending" | "approved" | "rejected" | "suspended";

export interface UserSession {
  userId: string;
  email: string;
  activeHouseholdId: string;
  householdId?: string;
  schemaName: string;
  role: "admin" | "member";
  isSuperAdmin?: boolean;
}

export interface ManagedHouseholdItem {
  id: string;
  name: string;
  schemaName: string;
  status: HouseholdStatus;
  applicantEmail: string | null;
  applicantUserId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
}

export interface ManagedHouseholdCounts {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
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
  parentId?: string | null;
  icon?: string;
  color?: string;
  sortOrder: number;
  isSystem?: boolean;
  isArchived: boolean;
}

export interface TagItem {
  id: string;
  name: string;
  color?: string;
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
  parentTransactionId?: string;
  recurringTemplateId?: string;
  tags?: TagItem[];
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
  targetDate?: string | null;
  accountIdsJson?: string[];
  color?: string;
  isCompleted: boolean;
  isArchived?: boolean;
  createdAt?: string;
}

export interface AuditLogItem {
  id: string;
  userId: string;
  operatorUserId: string;
  operatorEmail?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "REVERT";
  entityType: string;
  entityId?: string;
  summary: string;
  beforeDataJson?: unknown;
  afterDataJson?: unknown;
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

export interface CsvImportRow {
  rowNumber: number;
  date: string;
  type: "expense" | "income" | "transfer";
  amount: number;
  shopName?: string;
  categoryId?: string;
  categoryName?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  fromAccountId?: string;
  toAccountId?: string;
  note?: string;
  isDuplicateCandidate: boolean;
  isValid: boolean;
  errorMessage?: string;
}

export interface CsvPreviewResult {
  headers: string[];
  totalRows: number;
  validRows: number;
  duplicateCount: number;
  mapping: {
    dateCol: number;
    amountCol: number;
    shopNameCol: number;
    typeCol?: number;
    categoryCol?: number;
    paymentMethodCol?: number;
    noteCol?: number;
  };
  rows: CsvImportRow[];
}

export interface SuggestionItem {
  shopName: string;
  categoryId?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
  paymentMethodId?: string;
  paymentMethodName?: string;
  count: number;
}

export interface SuggestionResult {
  candidates: string[];
  suggestion: SuggestionItem | null;
}

export interface MemberItem {
  id: string; // membership id
  userId: string;
  email: string;
  role: "admin" | "member";
  status: "active" | "inactive";
  joinedAt: string;
  isCurrentUser?: boolean;
}

export interface PasswordPolicyConfig {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export interface SystemSettingsConfig {
  currencySymbol: string;
  dateFormat: string;
  passwordPolicy: PasswordPolicyConfig;
}

export type RecurringTemplateType = "expense" | "transfer";

export interface RecurringTemplateItem {
  id: string;
  userId: string;
  type: RecurringTemplateType;
  title: string;
  amount: number;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
  paymentMethodType?: PaymentMethodItem["type"] | null;
  fromAccountId?: string | null;
  fromAccountName?: string | null;
  toAccountId?: string | null;
  toAccountName?: string | null;
  dayOfMonth: number; // 1-28 or 99 (月末)
  note?: string | null;
  isActive: boolean;
  lastGeneratedMonth?: string | null;
  createdAt: string;
  updatedAt?: string;
}

