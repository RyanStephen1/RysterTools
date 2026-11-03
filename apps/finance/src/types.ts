export type ExpenseStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export interface Expense {
  id: string;
  payee: string;
  cvNo: string;
  particulars: string;
  amount: number;
  remarks: string;
  status: ExpenseStatus;
  createdAt: string;
  createdBy: string;
}

export interface DailyReviewRecord {
  id: string;
  cvNo: string;
  particulars: string;
  cvAmount: number;
  siennaChecked: number;
  rysterCrossChecked: number;
  createdAt: string;
  createdBy: string;
  dateStr: string;
}

export interface CashSummary {
  id?: string;
  withdrawalAmount: number;
  withdrawalDate?: string;
  bankBalance: number;
  cashOnHand: number;
  updatedAt: string;
}

export type UserRole = 'ADMIN' | 'REVIEWER' | 'EDITOR' | 'USER' | 'PENDING';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface DatabaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export type BankTransactionType =
  | 'DEPOSIT'
  | 'FUND_TRANSFER'
  | 'DEPOSIT_FROM_KOREA'
  | 'PAYMENT_TO_BE_MADE'
  | 'WITHDRAWAL'
  | 'KOREA_PAYMENT';
export type BankTransactionStatus = 'CLEARED' | 'PENDING' | 'BOUNCED';

export interface BankTransaction {
  id: string;
  date: string;
  type: BankTransactionType;
  particulars: string;
  refNo: string;
  bankName: string;
  amount: number;
  status: BankTransactionStatus;
  remarks: string;
  createdAt: string;
  createdBy: string;
}
