import { drawReportSignatures, ReportSignatures, SignerEditor, signatureImageHtml, useSigners } from './reportSigners';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, FormEvent, useRef } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  LogOut,
  LogIn,
  TrendingUp,
  TrendingDown,
  Wallet,
  Banknote,
  Edit2,
  Edit,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
  Image as ImageIcon,
  Users,
  ShieldCheck,
  Upload,
  HardDrive,
  FolderOpen,
  File,
  Eye,
  Folder,
  Receipt,
  DollarSign,
  Search,
  Camera,
  PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as htmlToImage from 'html-to-image';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { supabase } from './lib/supabase';
import { cn } from './lib/utils';
import {
  Expense,
  CashSummary,
  ExpenseStatus,
  OperationType,
  DatabaseErrorInfo,
  DailyReviewRecord,
  AppUser,
  UserRole,
  BankTransaction,
  BankTransactionType,
  BankTransactionStatus
} from './types';
import { User } from '@supabase/supabase-js';

// Error Handler
const handleDatabaseError = (error: any, operationType: OperationType, path: string | null) => {
  const errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error));
  const errInfo: DatabaseErrorInfo = {
    error: errorMessage,
    authInfo: null, // Removed for simplicity
    operationType,
    path
  };
  console.error('Database Error: ', JSON.stringify(errInfo));
  alert(`Database Error during ${operationType} on ${path}:\n\n${errorMessage}`);
  throw new Error(JSON.stringify(errInfo));
};

const isMissingTableError = (error: any, tableName: string) => {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const table = tableName.toLowerCase();

  return message.includes(table) && (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
};

const missingBankTableMessage =
  'Bank Transactions is not set up in Supabase yet. Create the bank_transactions table using SUPABASE_BANK_SETUP.md, then refresh the app.';

type AppTab = 'REGISTRY' | 'BANK' | 'REVIEW' | 'DRIVE' | 'ADMIN';

const appTabs: AppTab[] = ['REGISTRY', 'BANK', 'REVIEW', 'DRIVE', 'ADMIN'];
const storedActiveTabKey = 'adk-active-tab';

const getStoredActiveTab = (): AppTab => {
  if (typeof window === 'undefined') return 'REGISTRY';
  const storedTab = window.localStorage.getItem(storedActiveTabKey);
  return appTabs.includes(storedTab as AppTab) ? storedTab as AppTab : 'REGISTRY';
};

const formatBankTransactionType = (type: BankTransactionType) => {
  if (type === 'DEPOSIT_FROM_KOREA') return 'DEPOSIT FROM KOREA';
  if (type === 'FUND_TRANSFER') return 'FUND TRANSFER';
  if (type === 'PAYMENT_TO_BE_MADE') return 'PAYMENT TO BE MADE';
  if (type === 'KOREA_PAYMENT') return 'KOREA PAYMENT';
  return type;
};

const isIncomingBankTransaction = (type: BankTransactionType) =>
  type === 'DEPOSIT' || type === 'FUND_TRANSFER' || type === 'DEPOSIT_FROM_KOREA';

const isOutgoingBankTransaction = (type: BankTransactionType) =>
  type === 'PAYMENT_TO_BE_MADE' || type === 'WITHDRAWAL' || type === 'KOREA_PAYMENT';

const isPaymentToBeMadeType = (type: BankTransactionType) =>
  type === 'PAYMENT_TO_BE_MADE' || type === 'KOREA_PAYMENT';


export default function App() {
  const signerSettings = useSigners();
  const { signers } = signerSettings;
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [voucherStatus, setVoucherStatus] = useState<ExpenseStatus | 'ALL'>('ALL');
  const [voucherSearch, setVoucherSearch] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [summary, setSummary] = useState<CashSummary>({
    withdrawalAmount: 0,
    withdrawalDate: '',
    bankBalance: 0,
    cashOnHand: 0,
    updatedAt: null as any
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>(getStoredActiveTab);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isBankDeleteModalOpen, setIsBankDeleteModalOpen] = useState(false);
  const [bankTransactionToDelete, setBankTransactionToDelete] = useState<string | null>(null);
  const [editingBankTransaction, setEditingBankTransaction] = useState<BankTransaction | null>(null);

  // Bank filters
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [bankTypeFilter, setBankTypeFilter] = useState<'ALL' | BankTransactionType>('ALL');
  const [bankStatusFilter, setBankStatusFilter] = useState<'ALL' | 'CLEARED' | 'PENDING' | 'BOUNCED'>('ALL');
  const [bankSearchTerm, setBankSearchTerm] = useState<string>('');
  const [bankDateStart, setBankDateStart] = useState<string>('');
  const [bankDateEnd, setBankDateEnd] = useState<string>('');

  const isAdmin = useMemo(() => {
    return userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com';
  }, [userProfile, user]);
  const [reviewRecords, setReviewRecords] = useState<DailyReviewRecord[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<DailyReviewRecord | null>(null);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);
  const [isDeleteReviewModalOpen, setIsDeleteReviewModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);

  // Declared database fetchers as reusable useCallback hooks
  const fetchExpenses = useCallback(async () => {
    if (!user) return;
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('createdAt', startOfDay.toISOString())
      .lte('createdAt', endOfDay.toISOString())
      .order('createdAt', { ascending: true });

    if (error) {
      handleDatabaseError(error, OperationType.LIST, 'expenses');
    } else if (data) {
      setExpenses(data as Expense[]);
    }
  }, [user, selectedDate]);

  const fetchSummary = useCallback(async () => {
    if (!user) return;
    const dateStr = selectedDate.toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('summaries')
      .select('*')
      .eq('id', dateStr)
      .maybeSingle();

    if (data) {
      setSummary(data as CashSummary);
    } else {
      // Fetch the most recent summary before this date to carry over balances
      const { data: recentData } = await supabase
        .from('summaries')
        .select('*')
        .lt('id', dateStr)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentData) {
        setSummary({
          id: dateStr,
          bankBalance: recentData.bankBalance,
          cashOnHand: recentData.cashOnHand,
          withdrawalAmount: 0,
          withdrawalDate: '',
          updatedAt: new Date().toISOString()
        });
      } else {
        // Complete fallback default
        setSummary({
          id: dateStr,
          bankBalance: 0,
          cashOnHand: 0,
          withdrawalAmount: 0,
          withdrawalDate: '',
          updatedAt: new Date().toISOString()
        });
      }
    }
  }, [user, selectedDate]);

  const fetchAllExpenses = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) {
      handleDatabaseError(error, OperationType.LIST, 'expenses');
    } else if (data) {
      setAllExpenses(data as Expense[]);
    }
  }, [user]);

  const fetchReviews = useCallback(async () => {
    if (!user || !userProfile) return;
    const isSuperAdmin = user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com';
    const canViewReviews = isSuperAdmin || userProfile.role === 'ADMIN' || userProfile.role === 'REVIEWER' || userProfile.role === 'EDITOR';
    if (!canViewReviews) {
      setReviewRecords([]);
      return;
    }

    const dateStr = selectedDate.toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('dateStr', dateStr)
      .order('createdAt', { ascending: true });

    if (error) {
      handleDatabaseError(error, OperationType.LIST, 'reviews');
    } else if (data) {
      setReviewRecords(data as DailyReviewRecord[]);
    }
  }, [user, userProfile, selectedDate]);

  const fetchReports = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reports')
      .select('*, uploader:users!uploaded_by(displayName)')
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.warn("Reports join failed, using flat select fallback:", error.message);
      const { data: flatData, error: flatError } = await supabase
        .from('reports')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (flatError) {
        console.error("Failed to fetch reports:", flatError);
      } else if (flatData) {
        setReports(flatData);
      }
    } else if (data) {
      setReports(data);
    }
  }, [user]);

  const fetchVouchers = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('vouchers')
      .select('*, uploader:users!uploaded_by(displayName)')
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.warn("Vouchers join failed, using flat select fallback:", error.message);
      const { data: flatData, error: flatError } = await supabase
        .from('vouchers')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (flatError) {
        console.error("Failed to fetch vouchers:", flatError);
      } else if (flatData) {
        setVouchers(flatData);
      }
    } else if (data) {
      setVouchers(data);
    }
  }, [user]);
  const fetchBankTransactions = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('createdAt', { ascending: false });

      if (error) {
        console.warn("Table bank_transactions error:", error.message);
        if (isMissingTableError(error, 'bank_transactions')) {
          setBankTransactions([]);
        } else {
          handleDatabaseError(error, OperationType.LIST, 'bank_transactions');
        }
      } else if (data) {
        setBankTransactions(data as BankTransaction[]);
      }
    } catch (e: any) {
      console.error("Error fetching bank transactions", e);
    }
  }, [user]);

  // Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // User Profile Listener
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase.from('users').select('*').eq('uid', user.id).single();
      if (error && error.code === 'PGRST116') { // not found
        const initialProfile: AppUser = {
          uid: user.id,
          email: user.email || '',
          displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
          role: user.email?.trim().toLowerCase() === 'rcascalla1@gmail.com' ? 'ADMIN' : 'PENDING',
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        };
        try {
          await supabase.from('users').insert([initialProfile]);
          setUserProfile(initialProfile);
        } catch (e) {
          console.error("Failed to create user profile", e);
        }
      } else if (data) {
        setUserProfile(data as AppUser);
        await supabase.from('users').update({ lastLogin: new Date().toISOString() }).eq('uid', user.id);
      }
    };

    fetchProfile();
    const sub = supabase.channel('user-profile')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `uid=eq.${user.id}` }, fetchProfile)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user]);

  // All Users Listener (Admin Only)
  useEffect(() => {
    const isSuperAdmin = user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com';
    const isAdmin = userProfile?.role === 'ADMIN';

    if (!isSuperAdmin && !isAdmin) {
      setAllUsers([]);
      return;
    }

    const fetchUsers = async () => {
      const { data } = await supabase.from('users').select('*');
      if (data) setAllUsers(data as AppUser[]);
    };
    fetchUsers();

    const sub = supabase.channel('all-users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchUsers)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user, userProfile]);

  useEffect(() => {
    window.localStorage.setItem(storedActiveTabKey, activeTab);
  }, [activeTab]);

  // Enforce tab permissions when user profile loads
  useEffect(() => {
    if (userProfile) {
      const isAdmin = userProfile.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com';
      const isReviewer = userProfile.role === 'REVIEWER';

      if (isAdmin) {
        if (!['REGISTRY', 'BANK', 'REVIEW', 'DRIVE', 'ADMIN'].includes(activeTab)) {
          setActiveTab('REGISTRY');
        }
      } else if (isReviewer) {
        if (activeTab !== 'BANK' && activeTab !== 'REVIEW' && activeTab !== 'DRIVE') {
          setActiveTab('REVIEW');
        }
      } else {
        if (activeTab !== 'DRIVE') {
          setActiveTab('DRIVE');
        }
      }
    }
  }, [userProfile, user, activeTab]);

  // Sync Check
  useEffect(() => {
    if (user) {
      const testConnection = async () => {
        try {
          await supabase.from('test').select('*').limit(1);
        } catch (error) {
          console.log("Connection test response received.");
        }
      };
      testConnection();
    }
  }, [user]);

  // Helpers to close modals and trigger immediate local refetch of fresh data
  const closeExpenseModal = useCallback(() => {
    fetchExpenses();
    fetchAllExpenses();
    setIsModalOpen(false);
    setEditingExpense(null);
  }, [fetchExpenses, fetchAllExpenses]);

  const closeSummaryModal = useCallback(() => {
    fetchSummary();
    setIsSummaryModalOpen(false);
  }, [fetchSummary]);

  const closeReviewModal = useCallback(() => {
    fetchReviews();
    setIsReviewModalOpen(false);
    setEditingReview(null);
  }, [fetchReviews]);

  const closeBankModal = useCallback(() => {
    fetchBankTransactions();
    setIsBankModalOpen(false);
    setEditingBankTransaction(null);
  }, [fetchBankTransactions]);

  // Database Listeners
  useEffect(() => {
    if (!user) return;

    fetchExpenses();
    fetchSummary();

    const subExpenses = supabase.channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchExpenses)
      .subscribe();

    const subSummary = supabase.channel('summary-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'summaries' }, fetchSummary)
      .subscribe();

    return () => {
      supabase.removeChannel(subExpenses);
      supabase.removeChannel(subSummary);
    };
  }, [user, fetchExpenses, fetchSummary]);

  // All Expenses for Dashboard
  useEffect(() => {
    if (!user) return;

    fetchAllExpenses();

    const sub = supabase.channel('all-expenses-dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchAllExpenses)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user, fetchAllExpenses]);

  // Review Records Listener
  useEffect(() => {
    if (!user || !userProfile) return;

    fetchReviews();

    const sub = supabase.channel('reviews-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, fetchReviews)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user, userProfile, fetchReviews]);

  // Reports Listener
  useEffect(() => {
    if (!user) return;

    fetchReports();

    const sub = supabase.channel('reports-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user, fetchReports]);

  // Vouchers Listener
  useEffect(() => {
    if (!user) return;

    fetchVouchers();

    const sub = supabase.channel('vouchers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vouchers' }, fetchVouchers)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user, fetchVouchers]);

  // Bank Transactions Listener
  useEffect(() => {
    if (!user) return;

    fetchBankTransactions();

    const sub = supabase.channel('bank-transactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transactions' }, fetchBankTransactions)
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [user, fetchBankTransactions]);

  // Reset selected expenses/bank logs on active date or tab change to prevent accidental deletes
  useEffect(() => {
    setSelectedExpenseIds([]);
    setSelectedBankIds([]);
  }, [selectedDate.toDateString(), activeTab, bankFilter, bankTypeFilter, bankStatusFilter, bankSearchTerm]);



  const login = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = () => supabase.auth.signOut();

  const voucherQuery = voucherSearch.trim().toLowerCase();
  const visibleVouchers = expenses.filter(expense =>
    (voucherStatus === 'ALL' || expense.status === voucherStatus) &&
    [expense.cvNo, expense.payee, expense.particulars].some(value =>
      (value ?? '').toLowerCase().includes(voucherQuery)
    )
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const adjustDate = (days: number) => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(selectedDate.getDate() + days);
    setSelectedDate(nextDate);
  };

  // Calculations
  const totalPayables = useMemo(() =>
    expenses.reduce((sum, exp) => sum + (exp.status === 'CANCELLED' ? 0 : exp.amount), 0),
    [expenses]);

  const filteredBankTransactions = useMemo(() => {
    return bankTransactions.filter(tx => {
      if (bankFilter !== 'ALL' && tx.bankName !== bankFilter) return false;
      if (bankTypeFilter !== 'ALL' && tx.type !== bankTypeFilter) return false;
      if (bankStatusFilter !== 'ALL' && tx.status !== bankStatusFilter) return false;
      if (bankDateStart && tx.date < bankDateStart) return false;
      if (bankDateEnd && tx.date > bankDateEnd) return false;
      if (bankSearchTerm.trim()) {
        const query = bankSearchTerm.toLowerCase();
        const particularsMatch = tx.particulars?.toLowerCase().includes(query);
        const refNoMatch = tx.refNo?.toLowerCase().includes(query);
        const remarksMatch = tx.remarks?.toLowerCase().includes(query);
        const amountMatch = String(tx.amount).includes(query);
        if (!particularsMatch && !refNoMatch && !remarksMatch && !amountMatch) return false;
      }
      return true;
    });
  }, [bankTransactions, bankFilter, bankTypeFilter, bankStatusFilter, bankSearchTerm, bankDateStart, bankDateEnd]);

  const extraCash = summary.withdrawalAmount - totalPayables;
  const bankBalanceAfterWithdrawal = summary.bankBalance - summary.withdrawalAmount;
  const finalBalanceAfterExpenses = summary.cashOnHand + extraCash;

  const handleUpdateBankBalance = async (nextBalance: number) => {
    if (!isAdmin) {
      alert("Unauthorized: Only admins can update bank balance.");
      return;
    }

    const summaryId = summary.id || selectedDate.toISOString().split('T')[0];
    const nextSummary = {
      ...summary,
      id: summaryId,
      bankBalance: nextBalance,
      updatedAt: new Date().toISOString()
    };

    try {
      const { error } = await supabase.from('summaries').upsert([{
        id: summaryId,
        withdrawalAmount: summary.withdrawalAmount || 0,
        withdrawalDate: summary.withdrawalDate,
        bankBalance: nextBalance,
        cashOnHand: summary.cashOnHand || 0,
        updatedAt: nextSummary.updatedAt,
      }]);

      if (error) throw error;
      setSummary(nextSummary);
    } catch (error) {
      handleDatabaseError(error, OperationType.WRITE, `summaries/${summaryId}`);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    const dateStr = selectedDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Elegant Corporate A4 Header (Soft slate background, thin dark slate top line)
    doc.setFillColor(248, 250, 252); // slate-50 background
    doc.rect(0, 0, 210, 42, 'F');

    doc.setFillColor(30, 41, 59); // slate-800 dark navy top border stripe
    doc.rect(0, 0, 210, 3, 'F');

    doc.setDrawColor(226, 232, 240); // slate-200 bottom line
    doc.setLineWidth(0.35);
    doc.line(0, 42, 210, 42);

    doc.setTextColor(15, 23, 42); // slate-900 text
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('ADK CO., LTD', 14, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105); // slate-600 muted
    doc.text('REGISTRY OF WITHDRAWALS AND EXPENDITURES', 14, 28);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`STATEMENT FOR: ${dateStr.toUpperCase()}`, 14, 35);

    // ----------------------------------------------------
    // STANDALONE KPI CARDS (MASSIVE HIGHLIGHTS FOR THE BOSS)
    // ----------------------------------------------------

    // Left KPI Card: TODAY'S CASH WITHDRAWAL
    doc.setFillColor(255, 251, 235); // amber/gold light fill (#fffbeb)
    doc.rect(14, 46, 56, 20, 'F');
    doc.setDrawColor(253, 230, 138); // amber-200 border
    doc.setLineWidth(0.4);
    doc.rect(14, 46, 56, 20);

    doc.setTextColor(180, 83, 9); // amber-700
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const withdrawalLabel = summary.withdrawalDate
      ? `WITHDRAWAL: ${summary.withdrawalDate}`
      : 'TODAY\'S CASH WITHDRAWAL';
    doc.text(withdrawalLabel, 17, 51.5);

    doc.setTextColor(120, 53, 4); // amber-900
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(summary.withdrawalAmount), 17, 60.5);

    // Middle KPI Card: NET BANK BALANCE
    doc.setFillColor(239, 246, 255); // slate/blue light fill (#eff6ff)
    doc.rect(77, 46, 56, 20, 'F');
    doc.setDrawColor(191, 219, 254); // blue-200 border
    doc.setLineWidth(0.4);
    doc.rect(77, 46, 56, 20);

    doc.setTextColor(29, 78, 216); // blue-700
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('NET BANK BALANCE (BOOK)', 80, 51.5);

    doc.setTextColor(30, 58, 138); // blue-900
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(bankBalanceAfterWithdrawal), 80, 60.5);

    // Right KPI Card: FINAL PETTY / VAULT CASH
    doc.setFillColor(240, 253, 250); // emerald light fill (#f0fdfa)
    doc.rect(140, 46, 56, 20, 'F');
    doc.setDrawColor(167, 243, 208); // emerald-200 border
    doc.setLineWidth(0.4);
    doc.rect(140, 46, 56, 20);

    doc.setTextColor(4, 120, 87); // emerald-700
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('FINAL PETTY/VAULT CASH', 143, 51.5);

    doc.setTextColor(6, 78, 59); // emerald-900
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(summary.cashOnHand + extraCash), 143, 60.5);

    // ----------------------------------------------------
    // DETAILED RECONCILIATIONS
    // ----------------------------------------------------
    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text('DETAILED AUDIT RECONCILIATION', 14, 75);

    // Left detailed Box (Bank reconciliation math)
    doc.setDrawColor(226, 232, 240); // slate-200 soft border
    doc.setLineWidth(0.35);
    doc.rect(14, 79, 88, 44);

    doc.setFillColor(37, 99, 235); // blue header
    doc.rect(14, 79, 88, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('BANK BOOK FLOW', 18, 83.8);

    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('STARTING BANK BALANCE:', 18, 93);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(summary.bankBalance), 98, 93, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('LESS: CASH WITHDRAWAL:', 18, 100);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`-${formatCurrency(summary.withdrawalAmount)}`, 98, 100, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.line(18, 104, 98, 104);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text('NET BANK BALANCE:', 18, 112);
    doc.text(formatCurrency(bankBalanceAfterWithdrawal), 98, 112, { align: 'right' });


    // Right detailed Box (Cash reconciliation math)
    doc.setTextColor(15, 23, 42);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.rect(108, 79, 88, 44);

    doc.setFillColor(16, 185, 129); // emerald header
    doc.rect(108, 79, 88, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CASH & VAULT AUDIT TRAIL', 112, 83.8);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('A. STARTING CASH ON HAND:', 112, 92);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(summary.cashOnHand), 192, 92, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('B. ADD: CASH WITHDRAWAL:', 112, 97);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(`+${formatCurrency(summary.withdrawalAmount)}`, 192, 97, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text('C. LESS: TOTAL EXPENSES:', 112, 102);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`-${formatCurrency(totalPayables)}`, 192, 102, { align: 'right' });

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text('D. CASH VARIANCE (UNRECORDED):', 112, 107);
    const varColor = extraCash >= 0 ? [16, 185, 129] : [220, 38, 38];
    doc.setTextColor(varColor[0], varColor[1], varColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(formatCurrency(extraCash), 192, 107, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.1);
    doc.line(112, 111, 192, 111);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text('A+D = FINAL PETTY/VAULT CASH:', 112, 118);
    doc.text(formatCurrency(summary.cashOnHand + extraCash), 192, 118, { align: 'right' });

    doc.setTextColor(15, 23, 42);

    // Table
    const tableData = expenses.map((exp, index) => [
      index + 1,
      exp.payee,
      `${exp.cvNo}\n${exp.particulars}`,
      formatCurrency(exp.amount),
      exp.remarks || '-',
      exp.status
    ]);

    autoTable(doc, {
      startY: 132,
      head: [['NO.', 'PAYEE', 'PARTICULARS (CV NO.)', 'AMOUNT', 'REMARKS', 'STATUS']],
      body: tableData,
      foot: [['', '', 'TOTAL EXPENSES:', formatCurrency(totalPayables), '', '']],
      theme: 'grid',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, cellPadding: 4, textColor: [15, 23, 42] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 35 },
        2: { cellWidth: 45 },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 34 },
        5: { cellWidth: 30, halign: 'center' }
      }
    });

    const pageHeight = doc.internal.pageSize.height;
    drawReportSignatures(doc, signers, (doc as any).lastAutoTable.finalY + 20);

    const signaturePage = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`System Generated on ${new Date().toLocaleString()}`, 14, 285);
    doc.text(`Page ${signaturePage} of ${signaturePage}`, 180, 285);

    doc.save(`ADK-Registry-${selectedDate.toISOString().split('T')[0]}.pdf`);
  };

  const handleExportPNG = async () => {
    const dateStr = selectedDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Build expense table rows
    const tableRows = expenses.map((exp, index) => `
      <tr style="background:${index % 2 === 0 ? '#ffffff' : '#fafafa'};">
        <td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:center;font-size:14px;color:#0f172a;">${index + 1}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 6px;font-size:14px;color:#0f172a;">${exp.payee}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 6px;font-size:14px;color:#0f172a;">${exp.cvNo}<br/>${exp.particulars}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-size:14px;color:#0f172a;">${formatCurrency(exp.amount)}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 6px;font-size:14px;color:#0f172a;">${exp.remarks || '-'}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:center;font-size:14px;color:#0f172a;">${exp.status}</td>
      </tr>
    `).join('');

    const varColor = extraCash >= 0 ? '#10b981' : '#dc2626';

    // Build the full A4 report layout as HTML — mirrors the PDF exactly
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:99999;';
    container.innerHTML = `
      <div id="png-report-render" style="width:794px;background:#ffffff;font-family:Helvetica,Arial,sans-serif;padding:0;margin:0;">
        <!-- HEADER -->
        <div style="background:#f8fafc;padding:0;margin:0;">
          <div style="height:11px;background:#1e293b;"></div>
          <div style="padding:20px 32px 16px 32px;">
            <div style="font-size:42px;font-weight:bold;color:#0f172a;margin:0;line-height:1.1;">ADK CO., LTD</div>
            <div style="font-size:16px;color:#475569;margin-top:6px;">REGISTRY OF WITHDRAWALS AND EXPENDITURES</div>
            <div style="font-size:16px;font-weight:bold;color:#1e293b;margin-top:6px;">STATEMENT FOR: ${dateStr.toUpperCase()}</div>
          </div>
          <div style="height:1px;background:#e2e8f0;"></div>
        </div>

        <!-- KPI CARDS -->
        <div style="display:flex;gap:16px;padding:20px 32px 0 32px;">
          <!-- Left: CASH WITHDRAWAL -->
          <div style="flex:1;background:#fffbeb;border:1.5px solid #fde68a;border-radius:0;padding:14px 16px;">
            <div style="font-size:12px;font-weight:bold;color:#b45309;letter-spacing:0.5px;">TODAY'S CASH WITHDRAWAL</div>
            <div style="font-size:24px;font-weight:bold;color:#78350f;margin-top:8px;">${formatCurrency(summary.withdrawalAmount)}</div>
          </div>
          <!-- Middle: NET BANK BALANCE -->
          <div style="flex:1;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:0;padding:14px 16px;">
            <div style="font-size:12px;font-weight:bold;color:#1d4ed8;letter-spacing:0.5px;">NET BANK BALANCE (BOOK)</div>
            <div style="font-size:24px;font-weight:bold;color:#1e3a8a;margin-top:8px;">${formatCurrency(bankBalanceAfterWithdrawal)}</div>
          </div>
          <!-- Right: FINAL PETTY/VAULT CASH -->
          <div style="flex:1;background:#f0fdfa;border:1.5px solid #a7f3d0;border-radius:0;padding:14px 16px;">
            <div style="font-size:12px;font-weight:bold;color:#047857;letter-spacing:0.5px;">FINAL PETTY/VAULT CASH</div>
            <div style="font-size:24px;font-weight:bold;color:#064e3b;margin-top:8px;">${formatCurrency(summary.cashOnHand + extraCash)}</div>
          </div>
        </div>

        <!-- DETAILED AUDIT RECONCILIATION LABEL -->
        <div style="padding:22px 32px 8px 32px;font-size:17px;font-weight:bold;color:#475569;">DETAILED AUDIT RECONCILIATION</div>

        <!-- RECONCILIATION BOXES -->
        <div style="display:flex;gap:16px;padding:0 32px;">
          <!-- Left: BANK BOOK FLOW -->
          <div style="flex:1;border:1px solid #e2e8f0;">
            <div style="background:#2563eb;padding:8px 14px;">
              <span style="color:#ffffff;font-size:13px;font-weight:bold;">BANK BOOK FLOW</span>
            </div>
            <div style="padding:14px;">
              <div style="display:flex;justify-content:space-between;font-size:14px;color:#0f172a;margin-bottom:8px;">
                <span>STARTING BANK BALANCE:</span>
                <span style="font-weight:bold;">${formatCurrency(summary.bankBalance)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:14px;color:#0f172a;margin-bottom:8px;">
                <span>LESS: CASH WITHDRAWAL:</span>
                <span style="font-weight:bold;color:#dc2626;">-${formatCurrency(summary.withdrawalAmount)}</span>
              </div>
              <div style="height:1px;background:#e2e8f0;margin:10px 0;"></div>
              <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;color:#2563eb;">
                <span>NET BANK BALANCE:</span>
                <span>${formatCurrency(bankBalanceAfterWithdrawal)}</span>
              </div>
            </div>
          </div>
          <!-- Right: CASH & VAULT AUDIT TRAIL -->
          <div style="flex:1;border:1px solid #e2e8f0;">
            <div style="background:#10b981;padding:8px 14px;">
              <span style="color:#ffffff;font-size:13px;font-weight:bold;">CASH & VAULT AUDIT TRAIL</span>
            </div>
            <div style="padding:14px;">
              <div style="display:flex;justify-content:space-between;font-size:14px;color:#0f172a;margin-bottom:6px;">
                <span>A. STARTING CASH ON HAND:</span>
                <span style="font-weight:bold;">${formatCurrency(summary.cashOnHand)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:14px;color:#0f172a;margin-bottom:6px;">
                <span>B. ADD: CASH WITHDRAWAL:</span>
                <span style="font-weight:bold;color:#10b981;">+${formatCurrency(summary.withdrawalAmount)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:14px;color:#0f172a;margin-bottom:6px;">
                <span>C. LESS: TOTAL EXPENSES:</span>
                <span style="font-weight:bold;color:#dc2626;">-${formatCurrency(totalPayables)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:14px;color:#0f172a;margin-bottom:6px;">
                <span>D. CASH VARIANCE (UNRECORDED):</span>
                <span style="font-weight:bold;color:${varColor};">${formatCurrency(extraCash)}</span>
              </div>
              <div style="height:1px;background:#e2e8f0;margin:10px 0;"></div>
              <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;color:#10b981;">
                <span>A+D = FINAL PETTY/VAULT CASH:</span>
                <span>${formatCurrency(summary.cashOnHand + extraCash)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- EXPENSE TABLE -->
        <div style="padding:20px 32px 0 32px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#1e293b;">
                <th style="border:1px solid #1e293b;padding:8px 6px;color:#ffffff;font-size:14px;font-weight:bold;text-align:center;width:50px;">NO.</th>
                <th style="border:1px solid #1e293b;padding:8px 6px;color:#ffffff;font-size:14px;font-weight:bold;text-align:left;">PAYEE</th>
                <th style="border:1px solid #1e293b;padding:8px 6px;color:#ffffff;font-size:14px;font-weight:bold;text-align:left;">PARTICULARS (CV NO.)</th>
                <th style="border:1px solid #1e293b;padding:8px 6px;color:#ffffff;font-size:14px;font-weight:bold;text-align:right;">AMOUNT</th>
                <th style="border:1px solid #1e293b;padding:8px 6px;color:#ffffff;font-size:14px;font-weight:bold;text-align:left;">REMARKS</th>
                <th style="border:1px solid #1e293b;padding:8px 6px;color:#ffffff;font-size:14px;font-weight:bold;text-align:center;">STATUS</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            <tfoot>
              <tr style="background:#f1f5f9;">
                <td style="border:1px solid #e2e8f0;padding:8px 6px;"></td>
                <td style="border:1px solid #e2e8f0;padding:8px 6px;"></td>
                <td style="border:1px solid #e2e8f0;padding:8px 6px;font-size:14px;font-weight:bold;color:#0f172a;">TOTAL EXPENSES:</td>
                <td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-size:14px;font-weight:bold;color:#0f172a;">${formatCurrency(totalPayables)}</td>
                <td style="border:1px solid #e2e8f0;padding:8px 6px;"></td>
                <td style="border:1px solid #e2e8f0;padding:8px 6px;"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${signatureImageHtml(signers)}

        <!-- FOOTER -->
        <div style="display:flex;justify-content:space-between;padding:30px 32px 20px 32px;font-size:14px;color:#0f172a;">
          <span>System Generated on ${new Date().toLocaleString()}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      // Give browser time to paint the off-screen element
      await new Promise(resolve => setTimeout(resolve, 500));

      const renderEl = document.getElementById('png-report-render');
      if (!renderEl) {
        throw new Error('Failed to create report render element');
      }

      const dataUrl = await htmlToImage.toPng(renderEl, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
      });

      const link = document.createElement('a');
      link.download = `ADK-Registry-${selectedDate.toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('PNG Export failed', error);
      alert('PNG Export failed. Please try PDF export instead.');
    } finally {
      document.body.removeChild(container);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2563EB]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#F8F9FA]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-6 md:p-12 bg-white border-2 border-black brutalist-shadow text-center"
        >
          <div className="mb-6 inline-flex items-center justify-center w-20 h-20 bg-black rounded-none">
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-2 block">Enterprise System</span>
          <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-8">ADK Registry</h1>
          <p className="text-[#6B7280] mb-8 text-sm font-bold uppercase tracking-widest opacity-60">Authorize and track withdrawals with precision.</p>
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-black text-white hover:bg-[#27272A] transition-all font-black uppercase tracking-widest text-xs"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 brightness-0 invert" />
            Establish Session
          </button>
        </motion.div>
      </div>
    );
  }

  async function handleDelete() {
    if (!expenseToDelete) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseToDelete);
      if (error) throw error;
      setIsDeleteModalOpen(false);
      setExpenseToDelete(null);
    } catch (error) {
      handleDatabaseError(error, OperationType.DELETE, `expenses/${expenseToDelete}`);
    }
  }

  async function handleDeleteReview() {
    if (!reviewToDelete) return;
    try {
      const { error } = await supabase.from('reviews').delete().eq('id', reviewToDelete);
      if (error) throw error;
      setIsDeleteReviewModalOpen(false);
      setReviewToDelete(null);
    } catch (error) {
      handleDatabaseError(error, OperationType.DELETE, `reviews/${reviewToDelete}`);
    }
  }

  async function handleDeleteBankTransaction() {
    if (!bankTransactionToDelete) return;
    try {
      const { error } = await supabase.from('bank_transactions').delete().eq('id', bankTransactionToDelete);
      if (error) throw error;
      setIsBankDeleteModalOpen(false);
      setBankTransactionToDelete(null);
    } catch (error) {
      if (isMissingTableError(error, 'bank_transactions')) {
        alert(missingBankTableMessage);
        return;
      }
      handleDatabaseError(error, OperationType.DELETE, `bank_transactions/${bankTransactionToDelete}`);
    }
  }

  async function handleConfirmAndRollForward() {
    try {
      const netBank = bankBalanceAfterWithdrawal;
      const netCash = summary.cashOnHand + extraCash;

      let finalNetCash = netCash;
      const tomorrow = new Date(selectedDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

      // Check if no withdrawal is made, and expenses exist today
      const withdrawalNum = Number(summary.withdrawalAmount || 0);
      if (withdrawalNum === 0 && expenses.length > 0) {
        const shouldMoveExpenses = confirm(
          "Notice: No withdrawal was made today, but you have registered expenses.\n\n" +
          "Would you like to carry forward today's expenses to tomorrow's statement?"
        );

        if (shouldMoveExpenses) {
          // Shift all today's expenses to tomorrow
          const updatedExpensesPayload = expenses.map(exp => {
            const currentExpTime = new Date(exp.createdAt);
            const tomorrowExpDate = new Date(tomorrow);
            tomorrowExpDate.setHours(
              currentExpTime.getHours(),
              currentExpTime.getMinutes(),
              currentExpTime.getSeconds(),
              currentExpTime.getMilliseconds()
            );

            return {
              ...exp,
              createdAt: tomorrowExpDate.toISOString()
            };
          });

          const { error: expError } = await supabase
            .from('expenses')
            .upsert(updatedExpensesPayload);

          if (expError) throw expError;

          // Since today's expenses are moved, today's closing cash remains the full initial cash on hand!
          finalNetCash = summary.cashOnHand;
        }
      }

      // Retrieve tomorrow's record to preserve its existing withdrawalAmount if any
      const { data: tomorrowData } = await supabase
        .from('summaries')
        .select('*')
        .eq('id', tomorrowDateStr)
        .maybeSingle();

      const { error } = await supabase
        .from('summaries')
        .upsert([{
          id: tomorrowDateStr,
          bankBalance: netBank,
          cashOnHand: finalNetCash,
          withdrawalAmount: tomorrowData ? tomorrowData.withdrawalAmount : 0,
          withdrawalDate: tomorrowData ? tomorrowData.withdrawalDate : '',
          updatedAt: new Date().toISOString()
        }]);

      if (error) throw error;

      alert(`Success! Today's financial closing is complete.\nBalances carried forward to tomorrow (${tomorrowDateStr}):\n\n• Starting Bank Balance: ${formatCurrency(netBank)}\n• Starting Cash on Hand: ${formatCurrency(finalNetCash)}`);

      setSelectedDate(tomorrow);
    } catch (error) {
      console.error("Failed to carry forward daily balances:", error);
      alert("Failed to confirm withdrawal and carry forward balances. Please check your network connection.");
    }
  }

  async function handleCarryForwardExpensesOnly() {
    if (expenses.length === 0) {
      alert("No expenses registered for today to carry forward.");
      return;
    }

    const tomorrow = new Date(selectedDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

    const confirmed = confirm(
      `Are you sure you want to carry forward today's ${expenses.length} expense(s) to tomorrow (${tomorrowDateStr})?\n\nThis will shift their dates to tomorrow without updating any daily balance summaries.`
    );

    if (!confirmed) return;

    try {
      // Shift all today's expenses to tomorrow
      const updatedExpensesPayload = expenses.map(exp => {
        const currentExpTime = new Date(exp.createdAt);
        const tomorrowExpDate = new Date(tomorrow);
        tomorrowExpDate.setHours(
          currentExpTime.getHours(),
          currentExpTime.getMinutes(),
          currentExpTime.getSeconds(),
          currentExpTime.getMilliseconds()
        );

        return {
          ...exp,
          createdAt: tomorrowExpDate.toISOString()
        };
      });

      const { error: expError } = await supabase
        .from('expenses')
        .upsert(updatedExpensesPayload);

      if (expError) throw expError;

      alert(`Successfully carried forward ${expenses.length} expense(s) to tomorrow (${tomorrowDateStr})!`);
      setSelectedDate(tomorrow);
    } catch (error) {
      console.error("Failed to carry forward expenses:", error);
      alert("Failed to carry forward expenses. Please check your network connection.");
    }
  }

  const isAllSelected = expenses.length > 0 && selectedExpenseIds.length === expenses.length;

  function toggleSelectExpense(id: string) {
    setSelectedExpenseIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllExpenses() {
    if (isAllSelected) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(visibleVouchers.map(x => x.id));
    }
  }

  async function handleBulkDeleteExpenses() {
    if (selectedExpenseIds.length === 0) return;

    // Safety Guard: Filter selection to ONLY include IDs that are physically visible on today's list!
    const visibleIds = visibleVouchers.map(e => e.id);
    const validSelectionIds = selectedExpenseIds.filter(id => visibleIds.includes(id));

    if (validSelectionIds.length === 0) {
      setSelectedExpenseIds([]); // Clear stale selection from off-screen dates
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete the ${validSelectionIds.length} selected expense(s)?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .in('id', validSelectionIds);

      if (error) throw error;

      setSelectedExpenseIds([]);
      alert("Successfully deleted selected expense(s)!");
    } catch (error) {
      console.error("Failed to delete selected expenses:", error);
      alert("Failed to delete selected expenses. Please check your network connection.");
    }
  }

  async function handleBulkDeleteBankTransactions() {
    if (selectedBankIds.length === 0) return;

    if (!isAdmin) {
      alert("Unauthorized: Only admins can delete records.");
      return;
    }

    const confirmed = confirm(
      `Are you sure you want to delete the ${selectedBankIds.length} selected bank transaction(s)?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .in('id', selectedBankIds);

      if (error) throw error;

      setSelectedBankIds([]);
      alert("Successfully deleted selected bank transaction(s)!");
    } catch (error: any) {
      if (isMissingTableError(error, 'bank_transactions')) {
        alert(missingBankTableMessage);
        return;
      }
      console.error("Failed to delete selected bank transactions:", error);
      alert("Failed to delete selected bank transactions. Please check your network connection.");
    }
  }

  const handleExportBankPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    // Elegant Corporate A4 Header
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, 210, 42, 'F');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 3, 'F');

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.line(0, 42, 210, 42);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ADK CO., LTD', 14, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('BANK TRANSACTIONS REGISTRY & AUDIT STATEMENT', 14, 25);

    let filterDescription = `BANK: ${bankFilter}`;
    if (bankDateStart || bankDateEnd) {
      filterDescription += ` | RANGE: ${bankDateStart || 'EARLIEST'} to ${bankDateEnd || 'LATEST'}`;
    } else {
      filterDescription += ` | ALL-TIME`;
    }
    if (bankTypeFilter !== 'ALL') filterDescription += ` | TYPE: ${formatBankTransactionType(bankTypeFilter)}`;
    if (bankStatusFilter !== 'ALL') filterDescription += ` | STATUS: ${bankStatusFilter}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(filterDescription.toUpperCase(), 14, 32);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`GENERATED ON: ${dateStr.toUpperCase()} at ${new Date().toLocaleTimeString()}`, 14, 37);

    const totalIncoming = filteredBankTransactions
      .filter(tx => isIncomingBankTransaction(tx.type))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const totalPaymentsToBeMade = filteredBankTransactions
      .filter(tx => isPaymentToBeMadeType(tx.type))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const totalWithdrawals = filteredBankTransactions
      .filter(tx => tx.type === 'WITHDRAWAL')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const netBankFlow = totalIncoming - totalPaymentsToBeMade - totalWithdrawals;
    const currentBookBalance = summary.bankBalance + netBankFlow;

    const pendingClearance = filteredBankTransactions
      .filter(tx => tx.status === 'PENDING')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    // KPI CARDS
    doc.setFillColor(255, 251, 235);
    doc.rect(14, 46, 42, 20, 'F');
    doc.setDrawColor(253, 230, 138);
    doc.setLineWidth(0.35);
    doc.rect(14, 46, 42, 20);
    doc.setTextColor(180, 83, 9);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYMENTS TO MAKE', 17, 51.5);
    doc.setTextColor(120, 53, 4);
    doc.setFontSize(11);
    doc.text(formatCurrency(totalPaymentsToBeMade), 17, 60.5);

    doc.setFillColor(254, 242, 242);
    doc.rect(60, 46, 42, 20, 'F');
    doc.setDrawColor(254, 202, 202);
    doc.rect(60, 46, 42, 20);
    doc.setTextColor(185, 28, 28);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('WITHDRAWALS', 63, 51.5);
    doc.setTextColor(153, 27, 27);
    doc.setFontSize(11);
    doc.text(formatCurrency(totalWithdrawals), 63, 60.5);

    doc.setFillColor(239, 246, 255);
    doc.rect(106, 46, 42, 20, 'F');
    doc.setDrawColor(191, 219, 254);
    doc.rect(106, 46, 42, 20);
    doc.setTextColor(29, 78, 216);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('CURRENT BALANCE', 109, 51.5);
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(11);
    doc.text(formatCurrency(currentBookBalance), 109, 60.5);

    doc.setFillColor(255, 251, 235);
    doc.rect(152, 46, 44, 20, 'F');
    doc.setDrawColor(253, 230, 138);
    doc.rect(152, 46, 44, 20);
    doc.setTextColor(180, 83, 9);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('PENDING CLEARANCE', 155, 51.5);
    doc.setTextColor(120, 53, 4);
    doc.setFontSize(11);
    doc.text(formatCurrency(pendingClearance), 155, 60.5);

    const tableHeaders = [['NO.', 'DATE', 'BANK', 'TYPE', 'PARTICULARS (REF NO.)', 'AMOUNT', 'STATUS', 'REMARKS']];
    const tableBody = filteredBankTransactions.map((tx, index) => [
      index + 1,
      tx.date,
      tx.bankName,
      formatBankTransactionType(tx.type),
      `${tx.refNo || '-'}\n${tx.particulars}`,
      formatCurrency(tx.amount),
      tx.status,
      tx.remarks || '-'
    ]);

    autoTable(doc, {
      startY: 72,
      head: tableHeaders,
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, fontStyle: 'bold' },
      columnStyles: {
        3: { fontStyle: 'bold' },
        5: { fontStyle: 'bold', halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw);
          if (val === 'DEPOSIT' || val === 'FUND TRANSFER' || val === 'DEPOSIT FROM KOREA') {
            data.cell.styles.textColor = [16, 185, 129];
          } else if (val === 'PAYMENT TO BE MADE' || val === 'WITHDRAWAL' || val === 'KOREA PAYMENT') {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
        if (data.section === 'body' && data.column.index === 6) {
          const val = String(data.cell.raw);
          if (val === 'CLEARED') {
            data.cell.styles.textColor = [16, 185, 129];
          } else if (val === 'PENDING') {
            data.cell.styles.textColor = [245, 158, 11];
          } else if (val === 'BOUNCED') {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      }
    });

    const pageHeight = doc.internal.pageSize.height;
    drawReportSignatures(doc, signers, ((doc as any).lastAutoTable.finalY || 80) + 20);

    const signaturePage = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`System Generated on ${new Date().toLocaleString()}`, 14, pageHeight - 8);
    doc.text(`Page ${signaturePage} of ${signaturePage}`, 180, pageHeight - 8);

    doc.save(`ADK-BankRegistry-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportBankPNG = async () => {
    const element = document.getElementById('bank-registry-report-view');
    if (!element) return;

    const originalStyle = element.style.cssText;

    try {
      element.style.position = 'fixed';
      element.style.left = '0';
      element.style.top = '0';
      element.style.zIndex = '99999';
      element.style.visibility = 'visible';
      element.style.display = 'block';
      element.style.opacity = '1';

      await new Promise(resolve => setTimeout(resolve, 800));

      const dataUrl = await htmlToImage.toPng(element, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#FFFFFF',
      });

      const link = document.createElement('a');
      link.download = `ADK-BankRegistry-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('PNG Export failed', error);
      alert('PNG Export failed. Please try PDF export instead.');
    } finally {
      element.style.cssText = originalStyle;
    }
  };

  if (user && !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F9FAFB]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (userProfile?.role === 'PENDING') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#F8F9FA]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-6 md:p-12 bg-white border-2 border-black brutalist-shadow text-center"
        >
          <div className="mb-6 inline-flex items-center justify-center w-20 h-20 bg-black rounded-none">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-2 block">Access Restricted</span>
          <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-8">Pending Approval</h1>
          <p className="text-[#6B7280] mb-8 text-sm font-bold uppercase tracking-widest opacity-60">Your account requires administrator approval before you can access the system. Please contact rcascalla1@gmail.com for approval.</p>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-black text-white hover:bg-[#27272A] transition-all font-black uppercase tracking-widest text-xs"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <header className="min-h-[6rem] md:h-24 px-4 md:px-10 flex flex-col md:flex-row md:items-end justify-between py-4 md:pb-4 border-b-8 border-black bg-white sticky top-0 z-40 gap-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-2 md:mb-1">Financial Control System</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none shrink-0">Management</h1>
            <nav className="flex items-center gap-1 bg-[#F1F5F9] p-1 border-2 border-black overflow-x-auto no-scrollbar">
              {/* Registry Tab - ADMIN Only */}
              {(userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') && (
                <button
                  onClick={() => setActiveTab('REGISTRY')}
                  className={cn(
                    "px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap",
                    activeTab === 'REGISTRY' ? "bg-black text-white" : "text-black hover:bg-white"
                  )}
                >
                  Registry
                </button>
              )}

              {/* Bank Registry Tab - ADMIN or REVIEWER Only */}
              {(userProfile?.role === 'ADMIN' || userProfile?.role === 'REVIEWER' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') && (
                <button
                  onClick={() => setActiveTab('BANK')}
                  className={cn(
                    "px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1",
                    activeTab === 'BANK' ? "bg-black text-white" : "text-black hover:bg-white"
                  )}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  Bank Registry
                </button>
              )}

              {/* Review Tab - ADMIN or REVIEWER Only */}
              {(userProfile?.role === 'ADMIN' || userProfile?.role === 'REVIEWER' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') && (
                <button
                  onClick={() => setActiveTab('REVIEW')}
                  className={cn(
                    "px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap",
                    activeTab === 'REVIEW' ? "bg-black text-white" : "text-black hover:bg-white"
                  )}
                >
                  Review
                </button>
              )}

              {/* Drive Tab - Visible to all roles */}
              <button
                onClick={() => setActiveTab('DRIVE')}
                className={cn(
                  "px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1",
                  activeTab === 'DRIVE' ? "bg-black text-white" : "text-black hover:bg-white"
                )}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Drive
              </button>

              {/* Admin Tab - ADMIN Only */}
              {(userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') && (
                <button
                  onClick={() => setActiveTab('ADMIN')}
                  className={cn(
                    "px-3 md:px-4 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1",
                    activeTab === 'ADMIN' ? "bg-black text-white" : "text-black hover:bg-white"
                  )}
                >
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </button>
              )}
            </nav>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 w-full md:w-auto">
          <button
            onClick={() => setIsDashboardOpen(!isDashboardOpen)}
            className={cn(
              "flex items-center gap-2 px-3 md:px-4 py-2 border-2 border-black font-black uppercase tracking-widest text-[9px] md:text-[10px] transition-all",
              isDashboardOpen ? "bg-black text-white" : "bg-white text-black hover:bg-[#F8FAFC]"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">{isDashboardOpen ? "Close Analytics" : "Open Analytics"}</span>
            <span className="sm:hidden">Stats</span>
          </button>

          <div className="flex items-center gap-4">
            {user?.user_metadata?.avatar_url || user?.user_metadata?.picture ? (
              <img
                src={user.user_metadata.avatar_url || user.user_metadata.picture}
                alt="User avatar"
                className="w-10 h-10 rounded-full border-2 border-black object-cover brutalist-shadow shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-full border-2 border-black bg-black text-white flex items-center justify-center text-sm font-black uppercase brutalist-shadow shrink-0">
                {(userProfile?.displayName || user?.user_metadata?.full_name || user?.email || 'U').charAt(0)}
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">User</span>
              <div className="text-xs md:text-lg font-bold leading-none">
                {(userProfile?.displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous').split(' ')[0]}
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-black hover:opacity-50 transition-all border-2 border-transparent hover:border-black rounded-none"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12" id="printable-registry">
        {activeTab === 'REGISTRY' && (userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') ? (
          <>
            <AnimatePresence>
              {isDashboardOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-12 overflow-hidden"
                >
                  <Dashboard expenses={allExpenses.filter(expense => expense.status !== 'CANCELLED')} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Date Navigator */}
            <div className="mb-12 flex flex-col gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Statement Date</span>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => adjustDate(-1)}
                      className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all font-bold"
                    >
                      &larr;
                    </button>
                    <div className="px-6 py-2 bg-white border-2 border-black font-black uppercase tracking-tighter text-2xl brutalist-shadow">
                      {selectedDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </div>
                    <button
                      onClick={() => adjustDate(1)}
                      className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all font-bold"
                    >
                      &rarr;
                    </button>
                  </div>

                  {/* Dynamic Confirm/Carry Forward Button */}
                  <button
                    onClick={handleConfirmAndRollForward}
                    className="h-10 px-4 bg-[#059669] hover:bg-[#047857] text-white font-black uppercase tracking-widest text-[9px] md:text-[10px] border-2 border-black brutalist-shadow flex items-center gap-2 transition-all whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
                    {Number(summary.withdrawalAmount || 0) > 0 ? "Confirm & Carry Forward" : "Carry Forward Balances"}
                  </button>
                </div>
                <div className="flex gap-4 mt-2">
                  <button onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() - 1)))} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100">Yesterday</button>
                  <button onClick={() => setSelectedDate(new Date())} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100">Today</button>
                  <button onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() + 1)))} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100">Tomorrow</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-7 gap-4 md:gap-6">
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] bg-white border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none">Total Expenses</span>
                  <span className="text-lg md:text-xl lg:text-2xl xl:text-lg 2xl:text-2xl font-mono font-bold tracking-tighter leading-none whitespace-nowrap">{formatCurrency(totalPayables).replace('SAR', '').replace(/\s+/g, '')}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-20 leading-none">Saudi Riyal</span>
                </div>
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] bg-white border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none">Initial Bank</span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-lg md:text-xl lg:text-2xl xl:text-lg 2xl:text-2xl font-mono font-bold tracking-tighter leading-none whitespace-nowrap">{formatCurrency(summary.bankBalance).replace('SAR', '').replace(/\s+/g, '')}</span>
                    <button onClick={() => setIsSummaryModalOpen(true)} className="w-fit text-[9px] font-black uppercase px-2 py-0.5 bg-black text-white hover:bg-[#27272A] transition-colors no-export leading-none">Adjust</button>
                  </div>
                </div>
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] bg-[#059669] border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow text-white min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">Withdrawal</span>
                  <span className="text-lg md:text-xl lg:text-2xl xl:text-lg 2xl:text-2xl font-mono font-bold tracking-tighter leading-none whitespace-nowrap">{formatCurrency(summary.withdrawalAmount).replace('SAR', '').replace(/\s+/g, '')}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">Target Amount</span>
                </div>
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] bg-[#2563EB] border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow text-white min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">After Withdrawal</span>
                  <span className="text-lg md:text-xl lg:text-2xl xl:text-lg 2xl:text-2xl font-mono font-bold tracking-tighter leading-none whitespace-nowrap">{formatCurrency(bankBalanceAfterWithdrawal).replace('SAR', '').replace(/\s+/g, '')}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">Remaining Bank</span>
                </div>
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow bg-[#F4F4F5] min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none">Cash Variance</span>
                  <span className={cn("text-base md:text-lg lg:text-xl xl:text-base 2xl:text-lg font-mono font-bold tracking-tighter leading-none whitespace-nowrap", extraCash >= 0 ? "text-[#047857]" : "text-[#DC2626]")}>
                    {formatCurrency(extraCash).replace('SAR', '').replace(/\s+/g, '')}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none">Difference</span>
                </div>
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow bg-[#0F172A] text-white min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">Cash On Hand</span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-lg md:text-xl lg:text-2xl xl:text-lg 2xl:text-2xl font-mono font-bold tracking-tighter leading-none whitespace-nowrap">{formatCurrency(summary.cashOnHand).replace('SAR', '').replace(/\s+/g, '')}</span>
                    <button onClick={() => setIsSummaryModalOpen(true)} className="w-fit text-[9px] font-black uppercase px-2 py-0.5 bg-white text-black hover:bg-[#E2E8F0] transition-colors no-export leading-none">Update</button>
                  </div>
                </div>
                <div className="flex flex-col justify-between h-[110px] md:h-[130px] xl:h-[110px] 2xl:h-[125px] border-4 border-black p-3 md:p-4 lg:p-4 xl:p-3 2xl:p-4 brutalist-shadow bg-black text-white sm:col-span-2 lg:col-span-1 min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 leading-none">Petty/Vault Cash</span>
                  <span className="text-lg md:text-xl lg:text-2xl xl:text-lg 2xl:text-2xl font-mono font-bold tracking-tighter leading-none text-[#34D399] whitespace-nowrap">{formatCurrency(summary.cashOnHand + extraCash).replace('SAR', '').replace(/\s+/g, '')}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none">Total Available</span>
                </div>
              </div>
            </div>

            {/* Expenses List */}
            <div className="bg-white border-2 border-black rounded-none brutalist-shadow overflow-hidden">
              <div className="p-4 md:p-6 border-b-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-xs font-black uppercase tracking-widest flex items-center">
                  <span className="w-2 h-2 bg-black mr-2"></span>
                  Expense Breakdown
                </h2>
                <div className="flex flex-wrap gap-2 md:gap-4 overflow-x-auto no-scrollbar pb-2 sm:pb-0">
                  {selectedExpenseIds.length > 0 && (
                    <button
                      onClick={handleBulkDeleteExpenses}
                      className="bg-[#DC2626] hover:bg-[#B91C1C] text-white px-3 md:px-4 py-2 font-black uppercase tracking-widest text-[9px] md:text-[10px] border-2 border-black brutalist-shadow flex items-center gap-2 no-export whitespace-nowrap transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected ({selectedExpenseIds.length})
                    </button>
                  )}
                  {expenses.length > 0 && (
                    <button
                      onClick={handleCarryForwardExpensesOnly}
                      className="bg-[#D97706] hover:bg-[#B45309] text-white px-3 md:px-4 py-2 font-black uppercase tracking-widest text-[9px] md:text-[10px] border-2 border-black brutalist-shadow flex items-center gap-2 no-export whitespace-nowrap transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      Carry Expenses
                    </button>
                  )}
                  <button
                    onClick={handleExportPNG}
                    className="bg-white border-2 border-black text-black px-3 md:px-4 py-2 font-black uppercase tracking-widest text-[9px] md:text-[10px] hover:bg-[#F8FAFC] transition-colors flex items-center gap-2 no-export whitespace-nowrap"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    PNG
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="bg-white border-2 border-black text-black px-3 md:px-4 py-2 font-black uppercase tracking-widest text-[9px] md:text-[10px] hover:bg-[#F8FAFC] transition-colors flex items-center gap-2 no-export whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </button>
                  <button
                    onClick={() => {
                      setEditingExpense(null);
                      setIsModalOpen(true);
                    }}
                    className="bg-black text-white px-4 md:px-6 py-2 font-black uppercase tracking-widest text-[9px] md:text-[10px] hover:bg-[#27272A] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] no-export whitespace-nowrap"
                  >
                    Add Entry
                  </button>
                </div>
              </div>

              <section className="no-export border-y border-slate-200 bg-slate-50 px-4 py-4 md:px-6" aria-label="Cash voucher tracking">
                <h3 className="text-sm font-black uppercase tracking-wide">Cash voucher tracking</h3>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs font-bold">
                    Search vouchers
                    <input className="border border-black bg-white p-2" value={voucherSearch}
                      placeholder="Voucher no., payee, or particulars"
                      onChange={event => setVoucherSearch(event.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-bold">
                    Status
                    <select className="border border-black bg-white p-2" value={voucherStatus}
                      onChange={event => setVoucherStatus(event.target.value as ExpenseStatus | 'ALL')}>
                      <option value="ALL">All statuses ({expenses.length})</option>
                      {Object.entries(expenseStatusConfig).map(([status, config]) => (
                        <option key={status} value={status}>
                          {config.label} ({expenses.filter(expense => expense.status === status).length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <span role="status" className="text-xs text-slate-600">
                    Showing {visibleVouchers.length} of {expenses.length} vouchers for the selected date
                  </span>
                </div>
              </section>
              <SignerEditor {...signerSettings} />

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-black text-white text-[10px] font-black uppercase tracking-widest hidden md:table-header-group">
                    <tr className="h-12">
                      <th className="px-6 w-12 no-export">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAllExpenses}
                          className="w-4 h-4 rounded-none border-2 border-white bg-black focus:ring-0 cursor-pointer text-white accent-black"
                        />
                      </th>
                      <th className="px-6">NO.</th>
                      <th className="px-6">Payee</th>
                      <th className="px-6">Particulars (CV No.)</th>
                      <th className="px-6">Amount (SAR)</th>
                      <th className="px-6">Remarks</th>
                      <th className="px-6 text-center">Status</th>
                      <th className="px-6 text-right no-export">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-bold divide-y divide-[#F3F4F6] hidden md:table-row-group">
                    <AnimatePresence mode="popLayout">
                      {visibleVouchers.map((expense, index) => (
                        <motion.tr
                          key={expense.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="h-16 hover:bg-[#F8FAFC] transition-colors"
                        >
                          <td className="px-6 w-12 no-export">
                            <input
                              type="checkbox"
                              checked={selectedExpenseIds.includes(expense.id)}
                              onChange={() => toggleSelectExpense(expense.id)}
                              className="w-4 h-4 rounded-none border-2 border-black focus:ring-0 cursor-pointer accent-black"
                            />
                          </td>
                          <td className="px-6 font-mono opacity-30">{index + 1}</td>
                          <td className="px-6">{expense.payee}</td>
                          <td className="px-6">
                            <div className="font-mono text-[11px] opacity-60 mb-0.5">{expense.cvNo}</div>
                            <div className="text-xs font-normal text-[#94A3B8] line-clamp-1">{expense.particulars}</div>
                          </td>
                          <td className="px-6 font-mono font-bold text-base whitespace-nowrap">
                            {formatCurrency(expense.amount).replace('SAR', '')}
                            <span className="text-[9px] ml-1 opacity-40">SAR</span>
                          </td>
                          <td className="px-6">
                            <div className="text-[11px] font-normal text-[#64748B] line-clamp-2 max-w-[150px] leading-relaxed italic">
                              {expense.remarks || "—"}
                            </div>
                          </td>
                          <td className="px-6">
                            <div className="flex justify-center">
                              <StatusBadge status={expense.status} />
                            </div>
                          </td>
                          <td className="px-6 no-export">
                            <div className="flex items-center justify-end gap-3 text-black">
                              <button
                                onClick={() => {
                                  setEditingExpense(expense);
                                  setIsModalOpen(true);
                                }}
                                className="hover:opacity-50"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setExpenseToDelete(expense.id);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="hover:text-[#DC2626]"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                  <tfoot className="bg-[#F8FAFC] border-t-2 border-black hidden md:table-footer-group">
                    <tr className="h-16">
                      <td colSpan={4} className="px-6 text-right font-black uppercase tracking-widest text-[10px] opacity-50">
                        Grand Total (Selected Date):
                      </td>
                      <td className="px-6 font-mono font-black text-xl whitespace-nowrap">
                        {formatCurrency(totalPayables).replace('SAR', '')}
                        <span className="text-[10px] ml-1 opacity-40 font-bold">SAR</span>
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Cards View for Expenses */}
              <div className="md:hidden flex flex-col divide-y divide-[#F3F4F6]">
                <AnimatePresence mode="popLayout">
                  {visibleVouchers.map((expense, index) => (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-4 flex flex-col gap-4 bg-white"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex gap-3 items-start flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedExpenseIds.includes(expense.id)}
                            onChange={() => toggleSelectExpense(expense.id)}
                            className="w-4 h-4 rounded-none border-2 border-black focus:ring-0 cursor-pointer accent-black mt-1 no-export shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[10px] opacity-40 mb-1 flex items-center gap-2">
                              <span>#{index + 1}</span>
                              <span className="w-1 h-1 bg-black rounded-full"></span>
                              <span>{expense.cvNo}</span>
                            </div>
                            <div className="font-black text-sm uppercase truncate">{expense.payee}</div>
                            <div className="text-xs text-[#64748B] mt-1 line-clamp-2 leading-relaxed">{expense.particulars}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="font-mono font-black text-lg">
                            {formatCurrency(expense.amount).replace('SAR', '')}
                          </div>
                          <StatusBadge status={expense.status} />
                        </div>
                      </div>

                      <div className="flex justify-between items-end border-t border-[#F3F4F6] pt-3">
                        <div className="text-[10px] font-normal text-[#64748B] italic line-clamp-2 flex-1 mr-4">
                          {expense.remarks ? `"${expense.remarks}"` : "—"}
                        </div>
                        <div className="flex items-center gap-4 text-black shrink-0">
                          <button
                            onClick={() => {
                              setEditingExpense(expense);
                              setIsModalOpen(true);
                            }}
                            className="p-2 bg-[#F1F5F9] rounded-full hover:bg-black hover:text-white transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setExpenseToDelete(expense.id);
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-2 bg-[#FEF2F2] text-[#DC2626] rounded-full hover:bg-[#DC2626] hover:text-white transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <div className="p-4 bg-[#F8FAFC] border-t-2 border-black flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Total</span>
                  <div className="font-mono font-black text-xl">
                    {formatCurrency(totalPayables)}
                  </div>
                </div>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center">
                  <span className="w-4 h-1 bg-black mr-2"></span>
                  Fund Allocation Summary
                </h3>
                <div className="bg-white border-2 border-black p-8 space-y-4 brutalist-shadow">
                  <SummaryRow label="Withdrawal Amount" value={summary.withdrawalAmount} />
                  <SummaryRow label="Total Payables" value={totalPayables} isNegative />
                  <div className="border-t border-[#0000001A] pt-4">
                    <SummaryRow label="Extra Cash Flow" value={extraCash} isBold large />
                  </div>
                  <SummaryRow label="Existing Cash on Hand" value={summary.cashOnHand} />
                  <div className="bg-black text-white p-6 mt-4">
                    <SummaryRow label="Petty/Vault Cash" value={finalBalanceAfterExpenses} isBold large className="text-white" />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center">
                  <span className="w-4 h-1 bg-[#2563EB] mr-2"></span>
                  Bank Reconciliation
                </h3>
                <div className="bg-white border-2 border-black p-8 space-y-4 brutalist-shadow">
                  <SummaryRow label="Initial Book Balance" value={summary.bankBalance} />
                  <SummaryRow label="Withdrawal Processing" value={summary.withdrawalAmount} isNegative />
                  <div className="border-t-2 border-[#0000000D] pt-4">
                    <SummaryRow
                      label="Net Book Balance"
                      value={bankBalanceAfterWithdrawal}
                      isBold
                      large
                      className="text-[#2563EB]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'BANK' && (userProfile?.role === 'ADMIN' || userProfile?.role === 'REVIEWER' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') ? (
          <BankRegistryPage
            signerSettings={signerSettings}
            transactions={bankTransactions}
            userProfile={userProfile}
            isAdmin={isAdmin}
            bankBalance={summary.bankBalance}
            bankBalanceDate={summary.id || selectedDate.toISOString().split('T')[0]}
            onUpdateBankBalance={handleUpdateBankBalance}
            onAdd={() => {
              if (!isAdmin) {
                alert("Unauthorized: Only admins can manage bank transactions.");
                return;
              }
              setEditingBankTransaction(null);
              setIsBankModalOpen(true);
            }}
            onEdit={(tx: BankTransaction) => {
              if (!isAdmin) {
                alert("Unauthorized: Only admins can manage bank transactions.");
                return;
              }
              setEditingBankTransaction(tx);
              setIsBankModalOpen(true);
            }}
            onDelete={(tx: BankTransaction) => {
              if (!isAdmin) {
                alert("Unauthorized: Only admins can manage bank transactions.");
                return;
              }
              setBankTransactionToDelete(tx.id);
              setIsBankDeleteModalOpen(true);
            }}
            formatCurrency={formatCurrency}
            bankFilter={bankFilter}
            setBankFilter={setBankFilter}
            bankTypeFilter={bankTypeFilter}
            setBankTypeFilter={setBankTypeFilter}
            bankStatusFilter={bankStatusFilter}
            setBankStatusFilter={setBankStatusFilter}
            bankSearchTerm={bankSearchTerm}
            setBankSearchTerm={setBankSearchTerm}
            bankDateStart={bankDateStart}
            setBankDateStart={setBankDateStart}
            bankDateEnd={bankDateEnd}
            setBankDateEnd={setBankDateEnd}
            selectedBankIds={selectedBankIds}
            setSelectedBankIds={setSelectedBankIds}
            onBulkDelete={handleBulkDeleteBankTransactions}
            onExportPDF={handleExportBankPDF}
            onExportPNG={handleExportBankPNG}
          />
        ) : activeTab === 'DRIVE' ? (
          <DailyDrivePage
            reports={reports}
            vouchers={vouchers}
            user={user}
            userProfile={userProfile}
            onRefreshReports={fetchReports}
            onRefreshVouchers={fetchVouchers}
          />
        ) : activeTab === 'REVIEW' && (userProfile?.role === 'ADMIN' || userProfile?.role === 'REVIEWER' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') ? (
          <DailyReviewPage
            records={reviewRecords}
            selectedDate={selectedDate}
            adjustDate={adjustDate}
            setSelectedDate={setSelectedDate}
            onAdd={() => {
              if (userProfile?.role === 'USER') {
                alert("Unauthorized: You don't have permission to add reviews.");
                return;
              }
              setEditingReview(null);
              setIsReviewModalOpen(true);
            }}
            onEdit={(rec: any) => {
              if (userProfile?.role === 'USER') {
                alert("Unauthorized: You don't have permission to edit reviews.");
                return;
              }
              setEditingReview(rec);
              setIsReviewModalOpen(true);
            }}
            onDelete={(id: string) => {
              if (userProfile?.role !== 'ADMIN') {
                alert("Unauthorized: Only admins can delete reviews.");
                return;
              }
              setReviewToDelete(id);
              setIsDeleteReviewModalOpen(true);
            }}
            formatCurrency={formatCurrency}
            userProfile={userProfile}
          />
        ) : activeTab === 'ADMIN' && (userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') ? (
          <UserManagementPage users={allUsers} />
        ) : (
          /* Safe fallback for unauthorized attempts or empty states */
          <div className="flex flex-col items-center justify-center p-12 bg-white border-2 border-black brutalist-shadow text-center">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Access Status</span>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-4">Unauthorized View</h2>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">
              You do not have permission to access this section, or your profile is not configured.
            </p>
            <button
              onClick={() => {
                if (userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') {
                  setActiveTab('REGISTRY');
                } else if (userProfile?.role === 'REVIEWER') {
                  setActiveTab('REVIEW');
                } else {
                  setActiveTab('DRIVE');
                }
              }}
              className="px-6 py-2 bg-black text-white hover:bg-[#27272A] font-black uppercase tracking-widest text-[10px]"
            >
              Go to Allowed Hub
            </button>
          </div>
        )}
      </main>

      {/* Off-screen Report Container for PNG Export - A4 Dimensions */}
      <div
        id="registry-report-view"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '210mm',
          minHeight: '297mm',
          backgroundColor: 'white',
          padding: '15mm',
          opacity: 0,
          pointerEvents: 'none',
          color: 'black'
        }}
        className="font-sans"
      >
        {/* Header - Matches PDF */}
        <div className="bg-slate-50 border-t-4 border-t-slate-800 border-b border-slate-200 text-slate-900 p-8 mb-8">
          <h1 className="text-4xl font-black mb-1 text-slate-900">ADK CO., LTD</h1>
          <p className="text-xs font-bold tracking-[0.2em] text-slate-500 uppercase mb-4">Registry of Withdrawals and Expenditures</p>
          <div className="text-sm font-black border-t border-slate-200 pt-4 uppercase tracking-widest leading-none text-slate-700">
            Statement for: {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
        </div>

        {/* KPI Dashboard Cards - Massive takeaways for the Boss */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* KPI 1: Cash Withdrawal */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-600 mb-1.5">
              {summary.withdrawalDate ? `Withdrawal: ${summary.withdrawalDate}` : 'For Cash Withdrawal'}
            </div>
            <div className="text-2xl font-mono font-black text-amber-900 leading-none">{formatCurrency(summary.withdrawalAmount)}</div>
          </div>
          {/* KPI 2: Net Bank Balance */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600 mb-1.5">Net Bank Balance</div>
            <div className="text-2xl font-mono font-black text-blue-900 leading-none">{formatCurrency(bankBalanceAfterWithdrawal)}</div>
          </div>
          {/* KPI 3: Final Petty / Vault Cash */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-600 mb-1.5">Final Petty/Vault Cash</div>
            <div className="text-2xl font-mono font-black text-emerald-900 leading-none">{formatCurrency(summary.cashOnHand + extraCash)}</div>
          </div>
        </div>

        {/* Detailed Audit Section */}
        <h2 className="text-sm font-black uppercase tracking-[0.2em] mb-4 border-l-4 border-slate-800 text-slate-800 pl-4">Detailed Audit Reconciliation</h2>

        {/* Summary Boxes */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Bank Summary */}
          <div className="border border-slate-200 shadow-sm flex flex-col justify-between rounded-lg overflow-hidden">
            <div className="bg-[#2563EB] text-white p-2.5 text-[10px] font-black uppercase text-center">Bank Book Flow</div>
            <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold uppercase opacity-50">Starting Bank Balance:</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(summary.bankBalance)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold uppercase opacity-50">Less: Cash Withdrawal:</span>
                <span className="font-mono font-bold text-red-600">-{formatCurrency(summary.withdrawalAmount)}</span>
              </div>
              <div className="border-t border-slate-100 my-1"></div>
              <div className="flex justify-between items-center text-blue-700 font-bold text-[10px]">
                <span className="uppercase">Net Bank Balance:</span>
                <span className="font-mono">{formatCurrency(bankBalanceAfterWithdrawal)}</span>
              </div>
            </div>
          </div>

          {/* Cash Summary */}
          <div className="border border-slate-200 shadow-sm flex flex-col justify-between rounded-lg overflow-hidden">
            <div className="bg-[#10B981] text-white p-2.5 text-[10px] font-black uppercase text-center">Cash & Vault Audit Trail</div>
            <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold uppercase opacity-50">A. Starting Cash on Hand:</span>
                <span className="font-mono font-bold text-slate-900">{formatCurrency(summary.cashOnHand)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold uppercase opacity-50">B. Add: Cash Withdrawal:</span>
                <span className="font-mono font-bold text-[#10B981]">+{formatCurrency(summary.withdrawalAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold uppercase opacity-50">C. Less: Total Expenses:</span>
                <span className="font-mono font-bold text-red-600">-{formatCurrency(totalPayables)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="font-bold uppercase opacity-50">D. Cash Variance (Unrecorded):</span>
                <span className={cn("font-mono font-bold", extraCash >= 0 ? "text-[#10B981]" : "text-[#EF4444]")}>
                  {formatCurrency(extraCash)}
                </span>
              </div>
              <div className="border-t border-slate-100 my-1"></div>
              <div className="flex justify-between items-center text-emerald-700 font-bold text-[10px]">
                <span className="uppercase">(A+D)=Final Petty / Vault Cash:</span>
                <span className="font-mono">{formatCurrency(summary.cashOnHand + extraCash)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses Table */}
        <table className="w-full border border-slate-200 mb-12">
          <thead className="bg-slate-800 text-white text-[10px] font-black uppercase">
            <tr>
              <th className="p-3 text-left border-r border-slate-700/50">NO.</th>
              <th className="p-3 text-left border-r border-slate-700/50">Payee</th>
              <th className="p-3 text-left border-r border-slate-700/50">Particulars (CV No.)</th>
              <th className="p-3 text-right border-r border-slate-700/50">Amount</th>
              <th className="p-3 text-left border-r border-slate-700/50">Remarks</th>
              <th className="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="text-[10px] font-bold text-slate-800">
            {expenses.map((exp, index) => (
              <tr key={exp.id} className="border-b border-slate-100 h-10 hover:bg-slate-50">
                <td className="p-3 border-r border-slate-100 text-center text-slate-400 font-mono">{index + 1}</td>
                <td className="p-3 border-r border-slate-100 uppercase">{exp.payee}</td>
                <td className="p-3 border-r border-slate-100">
                  <div className="opacity-40 text-[8px] mb-0.5">{exp.cvNo}</div>
                  <div>{exp.particulars}</div>
                </td>
                <td className="p-3 border-r border-slate-100 text-right font-mono">{formatCurrency(exp.amount)}</td>
                <td className="p-3 border-r border-slate-100 font-normal italic opacity-60">{exp.remarks || "-"}</td>
                <td className="p-3 text-center uppercase tracking-tighter text-[8px]">{exp.status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-900 font-bold">
            <tr className="h-10">
              <td colSpan={3} className="p-3 border-r border-slate-100 text-right text-[9px] font-black uppercase text-slate-500">Total Expenses:</td>
              <td className="p-3 border-r border-slate-100 text-right font-mono text-[10px] font-black text-slate-900">{formatCurrency(totalPayables)}</td>
              <td colSpan={2} className="p-3"></td>
            </tr>
          </tfoot>
        </table>

        <ReportSignatures signers={signers} />

        <div className="mt-20 pt-4 border-t border-slate-200 text-[8px] font-bold uppercase text-slate-400 flex justify-between">
          <span>System Generated on {new Date().toLocaleString()}</span>
          <span>Page 1 of 1</span>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-[#00000066] backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white border-4 border-black brutalist-shadow overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between bg-black text-white">
                <h3 className="text-xs font-black uppercase tracking-widest">{editingExpense ? "Modify Entry" : "Establish New Entry"}</h3>
                <button onClick={closeExpenseModal} className="hover:opacity-50">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <ExpenseForm
                initialData={editingExpense}
                onClose={closeExpenseModal}
                userId={user.id}
              />
            </motion.div>
          </div>
        )}

        {isSummaryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSummaryModalOpen(false)}
              className="absolute inset-0 bg-[#00000066] backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white border-4 border-black brutalist-shadow overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between bg-black text-white">
                <h3 className="text-xs font-black uppercase tracking-widest">Update Financials</h3>
                <button onClick={closeSummaryModal} className="hover:opacity-50">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <SummaryForm
                data={summary}
                onClose={closeSummaryModal}
              />
            </motion.div>
          </div>
        )}

        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-[#00000099] backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white border-8 border-black p-8 text-center brutalist-shadow"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-20 h-20 bg-[#FEE2E2] text-[#DC2626] rounded-none flex items-center justify-center mx-auto mb-6 border-4 border-[#DC2626]">
                <Trash2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Confirm Removal</h2>
              <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest mb-8">This action will permanently purge the record from the registry.</p>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-4 border-4 border-black font-black uppercase tracking-widest text-[10px] hover:bg-[#F8FAFC] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 bg-[#DC2626] text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#B91C1C] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isReviewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsReviewModalOpen(false)}
              className="absolute inset-0 bg-[#00000066] backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white border-4 border-black brutalist-shadow overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between bg-black text-white">
                <h3 className="text-xs font-black uppercase tracking-widest">{editingReview ? "Update Review Entry" : "New Review Record"}</h3>
                <button onClick={closeReviewModal} className="hover:opacity-50">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <ReviewForm
                initialData={editingReview}
                onClose={closeReviewModal}
                userId={user.id}
                dateStr={selectedDate.toISOString().split('T')[0]}
              />
            </motion.div>
          </div>
        )}

        {isDeleteReviewModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteReviewModalOpen(false)}
              className="absolute inset-0 bg-[#00000099] backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white border-8 border-black p-8 text-center brutalist-shadow"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-20 h-20 bg-[#FEE2E2] text-[#DC2626] rounded-none flex items-center justify-center mx-auto mb-6 border-4 border-[#DC2626]">
                <Trash2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Purge Review</h2>
              <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest mb-8">This action will remove the review record permanently.</p>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteReviewModalOpen(false)}
                  className="flex-1 py-4 border-4 border-black font-black uppercase tracking-widest text-[10px] hover:bg-[#F8FAFC] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteReview}
                  className="flex-1 bg-[#DC2626] text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#B91C1C] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isBankModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBankModalOpen(false)}
              className="absolute inset-0 bg-[#00000066] backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white border-4 border-black brutalist-shadow overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b-4 border-black flex items-center justify-between bg-black text-white">
                <h3 className="text-xs font-black uppercase tracking-widest">{editingBankTransaction ? "Update Bank Transaction" : "New Bank Transaction"}</h3>
                <button onClick={closeBankModal} className="hover:opacity-50">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <BankTransactionForm
                initialData={editingBankTransaction}
                onClose={closeBankModal}
                userId={user.id}
              />
            </motion.div>
          </div>
        )}

        {isBankDeleteModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBankDeleteModalOpen(false)}
              className="absolute inset-0 bg-[#00000099] backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white border-8 border-black p-8 text-center brutalist-shadow"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-20 h-20 bg-[#FEE2E2] text-[#DC2626] rounded-none flex items-center justify-center mx-auto mb-6 border-4 border-[#DC2626]">
                <Trash2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Purge Transaction</h2>
              <p className="text-sm font-bold text-[#64748B] uppercase tracking-widest mb-8">This action will remove the transaction record permanently.</p>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsBankDeleteModalOpen(false)}
                  className="flex-1 py-4 border-4 border-black font-black uppercase tracking-widest text-[10px] hover:bg-[#F8FAFC] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteBankTransaction}
                  className="flex-1 bg-[#DC2626] text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#B91C1C] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Components
function SummaryRow({ label, value, isNegative, isBold, highlight, large, className }: any) {
  const formatValue = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0 group cursor-default", className)}>
      <span className={cn("text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity", isBold && "opacity-100 uppercase tracking-[0.2em]")}>{label}</span>
      <span className={cn(
        "font-mono font-bold sm:text-right",
        isNegative && "text-[#DC2626]",
        large ? "text-2xl" : "text-lg"
      )}>
        {formatValue(isNegative ? -Math.abs(value) : value)}
      </span>
    </div>
  );
}

const expenseStatusConfig = {
  APPROVED: { class: 'bg-emerald-100 text-emerald-800', label: 'Approved' },
  PENDING: { class: 'bg-amber-100 text-amber-800', label: 'Pending' },
  REJECTED: { class: 'bg-rose-100 text-rose-800', label: 'Declined' },
  CANCELLED: { class: 'bg-slate-200 text-slate-700', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: ExpenseStatus }) {
  const config = expenseStatusConfig[status];
  return (
    <span className={cn('px-3 py-1 text-[9px] font-black uppercase rounded-full tracking-wider', config?.class)}>
      {config?.label ?? status}
    </span>
  );
}

function Dashboard({ expenses }: { expenses: Expense[] }) {
  const trendData = useMemo(() => {
    const last15Days = [...Array(15)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (14 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    return last15Days.map(date => {
      const dayTotal = expenses
        .filter(e => {
          if (!e.createdAt) return false;
          const eDate = new Date(e.createdAt);
          return eDate.toDateString() === date.toDateString();
        })
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: dayTotal
      };
    });
  }, [expenses]);

  const payeeData = useMemo(() => {
    const groups: Record<string, number> = {};
    expenses.forEach(e => {
      groups[e.payee] = (groups[e.payee] || 0) + e.amount;
    });

    return Object.entries(groups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [expenses]);

  const totalAllTime = useMemo(() =>
    expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]);

  const COLORS = ['#000000', '#2563eb', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-white border-4 border-black p-4 md:p-8 brutalist-shadow">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-6 md:mb-8 flex items-center">
          <TrendingUp className="w-4 h-4 mr-2" />
          15-Day Spending Trend
        </h3>
        <div className="h-[250px] md:h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis
                dataKey="date"
                axisLine={{ stroke: '#000', strokeWidth: 2 }}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 'bold' }}
              />
              <YAxis
                axisLine={{ stroke: '#000', strokeWidth: 2 }}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 'bold' }}
                tickFormatter={(val) => `SR ${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#000',
                  border: 'none',
                  borderRadius: '0',
                  color: '#fff'
                }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: '900' }}
                labelStyle={{ display: 'none' }}
              />
              <Line
                type="stepAfter"
                dataKey="amount"
                stroke="#000"
                strokeWidth={4}
                dot={{ r: 4, fill: '#000', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#000' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border-4 border-black p-4 md:p-8 brutalist-shadow flex flex-col">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-6 md:mb-8 flex items-center">
          <PieChartIcon className="w-4 h-4 mr-2" />
          Top Payees (All-Time)
        </h3>
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={payeeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {payeeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full mt-6 space-y-2">
            {payeeData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-3 h-3 mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                  <span className="text-[10px] font-bold uppercase truncate max-w-[120px]">{item.name}</span>
                </div>
                <span className="text-[10px] font-mono font-bold">SR {item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 pt-6 border-t-2 border-[#0000000D] flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Total Records</span>
            <span className="text-2xl font-black">{expenses.length}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Cumulative</span>
            <span className="text-2xl font-black">SR {totalAllTime.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpenseForm({ initialData, onClose, userId }: { initialData?: Expense | null, onClose: () => void, userId: string }) {
  const [formData, setFormData] = useState({
    payee: initialData?.payee || '',
    cvNo: initialData?.cvNo || '',
    particulars: initialData?.particulars || '',
    amount: initialData?.amount?.toString() || '',
    remarks: initialData?.remarks || '',
    status: initialData?.status || 'APPROVED' as ExpenseStatus,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      createdAt: initialData?.createdAt || new Date().toISOString(),
      createdBy: userId,
    };

    try {
      if (initialData) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert([payload]);
        if (error) throw error;
      }
      onClose();
    } catch (error) {
      handleDatabaseError(error, initialData ? OperationType.UPDATE : OperationType.CREATE, 'expenses');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Vendor Name</label>
          <input
            required
            value={formData.payee}
            onChange={e => setFormData({ ...formData, payee: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-bold focus:ring-2 ring-black outline-none"
            placeholder="e.g. FASTEP ARABIA"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">CV Number</label>
          <input
            required
            value={formData.cvNo}
            onChange={e => setFormData({ ...formData, cvNo: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-mono font-bold focus:ring-2 ring-black outline-none"
            placeholder="CV-00000"
          />
        </div>
      </div>

      <div className="flex flex-col">
        <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Particulars</label>
        <textarea
          rows={2}
          value={formData.particulars}
          onChange={e => setFormData({ ...formData, particulars: e.target.value })}
          className="bg-[#F1F5F9] border-none p-3 text-sm font-bold focus:ring-2 ring-black outline-none resize-none"
          placeholder="Details of withdrawal..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Amount (SAR)</label>
          <input
            required
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={e => setFormData({ ...formData, amount: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-mono font-bold focus:ring-2 ring-black outline-none"
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Authorization Status</label>
          <select
            value={formData.status}
            onChange={e => setFormData({ ...formData, status: e.target.value as ExpenseStatus })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-bold appearance-none cursor-pointer focus:ring-2 ring-black outline-none"
          >
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending Review</option>
            <option value="REJECTED">Declined</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col">
        <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Remarks</label>
        <input
          value={formData.remarks}
          onChange={e => setFormData({ ...formData, remarks: e.target.value })}
          className="bg-[#F1F5F9] border-none p-3 text-sm font-bold focus:ring-2 ring-black outline-none"
          placeholder="Internal notes..."
        />
      </div>

      <div className="pt-4 flex gap-4">
        <button
          onClick={handleSubmit}
          className="flex-1 bg-black text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#27272A] transition-colors"
        >
          Commit Entry
        </button>
      </div>
    </form>
  );
}

function SummaryForm({ data, onClose }: { data: CashSummary, onClose: () => void }) {
  const [formData, setFormData] = useState({
    withdrawalAmount: data.withdrawalAmount.toString(),
    withdrawalDate: data.withdrawalDate || '',
    bankBalance: data.bankBalance.toString(),
    cashOnHand: data.cashOnHand.toString(),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('summaries').upsert([{
        id: data.id,
        withdrawalAmount: parseFloat(formData.withdrawalAmount) || 0,
        withdrawalDate: formData.withdrawalDate || null,
        bankBalance: parseFloat(formData.bankBalance) || 0,
        cashOnHand: parseFloat(formData.cashOnHand) || 0,
        updatedAt: new Date().toISOString(),
      }]);
      if (error) throw error;
      onClose();
    } catch (error) {
      handleDatabaseError(error, OperationType.WRITE, `summaries/${data.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col">
        <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Bank Book Balance</label>
        <input
          type="number" step="0.01" required
          value={formData.bankBalance}
          onChange={e => setFormData({ ...formData, bankBalance: e.target.value })}
          className="bg-[#F1F5F9] border-none p-4 text-xl font-mono font-bold focus:ring-2 ring-black outline-none"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Allocated Withdrawal</label>
        <input
          type="number" step="0.01" required
          value={formData.withdrawalAmount}
          onChange={e => setFormData({ ...formData, withdrawalAmount: e.target.value })}
          className="bg-[#F1F5F9] border-none p-4 text-xl font-mono font-bold focus:ring-2 ring-black outline-none"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Withdrawal Date</label>
        <input
          type="date"
          value={formData.withdrawalDate}
          onChange={e => setFormData({ ...formData, withdrawalDate: e.target.value })}
          className="bg-[#F1F5F9] border-none p-4 text-xl font-mono font-bold focus:ring-2 ring-black outline-none"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Cash On Hand Registry</label>
        <input
          type="number" step="0.01" required
          value={formData.cashOnHand}
          onChange={e => setFormData({ ...formData, cashOnHand: e.target.value })}
          className="bg-[#F1F5F9] border-none p-4 text-xl font-mono font-bold focus:ring-2 ring-black outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full bg-black text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#27272A] transition-colors shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]"
      >
        Update Summary Registry
      </button>
    </form>
  );
}

function DailyReviewPage({
  records,
  selectedDate,
  adjustDate,
  setSelectedDate,
  onAdd,
  onEdit,
  onDelete,
  formatCurrency,
  userProfile
}: any) {
  return (
    <div className="space-y-6 md:space-y-8">
      {/* Date Navigator */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Review Date</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => adjustDate(-1)}
              className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all font-bold"
            >
              &larr;
            </button>
            <div className="px-4 md:px-6 py-2 bg-white border-2 border-black font-black uppercase tracking-tighter text-xl md:text-2xl brutalist-shadow">
              {selectedDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
            </div>
            <button
              onClick={() => adjustDate(1)}
              className="w-10 h-10 border-2 border-black flex items-center justify-center hover:bg-black hover:text-white transition-all font-bold"
            >
              &rarr;
            </button>
          </div>
          <div className="flex gap-4 mt-2">
            <button onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() - 1)))} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100">Yesterday</button>
            <button onClick={() => setSelectedDate(new Date())} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100">Today</button>
            <button onClick={() => setSelectedDate(new Date(new Date().setDate(new Date().getDate() + 1)))} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100">Tomorrow</button>
          </div>
        </div>
        {userProfile?.role !== 'USER' && (
          <button
            onClick={onAdd}
            className="bg-black text-white px-6 md:px-8 py-3 md:py-4 font-black uppercase tracking-widest text-[11px] md:text-xs hover:bg-[#27272A] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full md:w-auto"
          >
            Add Review Item
          </button>
        )}
      </div>

      <div className="bg-white border-2 border-black rounded-none brutalist-shadow overflow-hidden">
        <div className="p-4 md:p-6 border-b-2 border-black bg-[#F8FAFC]">
          <h2 className="text-xs md:text-sm font-black uppercase tracking-[0.2em] flex items-center italic">
            Daily Cash Report Review
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#F1F5F9] text-[10px] font-black uppercase tracking-widest border-b-2 border-black hidden md:table-header-group">
              <tr>
                <th className="px-4 py-4 border-r border-black/10">CV (NO.)</th>
                <th className="px-4 py-4 border-r border-black/10">CV Particulars</th>
                <th className="px-4 py-4 border-r border-black/10 text-right">CV Amount</th>
                <th className="px-4 py-4 border-r border-black/10 text-right">Sienna Checked</th>
                <th className="px-4 py-4 border-r border-black/10 text-right text-blue-600">Sienna Diff</th>
                <th className="px-4 py-4 border-r border-black/10 text-right">Ryster Checked</th>
                <th className="px-4 py-4 border-r border-black/10 text-right text-emerald-600">To Be Declared</th>
                {userProfile?.role !== 'USER' && <th className="px-4 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 text-sm font-bold hidden md:table-row-group">
              {records.map((rec: any) => {
                const siennaDiff = rec.cvAmount - rec.siennaChecked;
                const rysterDiff = rec.cvAmount - rec.rysterCrossChecked;

                return (
                  <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 border-r border-black/5 font-mono text-xs">{rec.cvNo}</td>
                    <td className="px-4 py-4 border-r border-black/5 text-xs">{rec.particulars}</td>
                    <td className="px-4 py-4 border-r border-black/5 text-right font-mono">{formatCurrency(rec.cvAmount).replace('SAR', '')}</td>
                    <td className="px-4 py-4 border-r border-black/5 text-right font-mono">{formatCurrency(rec.siennaChecked).replace('SAR', '')}</td>
                    <td className="px-4 py-4 border-r border-black/5 text-right font-mono text-blue-600">
                      {formatCurrency(siennaDiff).replace('SAR', '')}
                    </td>
                    <td className="px-4 py-4 border-r border-black/5 text-right font-mono">{formatCurrency(rec.rysterCrossChecked).replace('SAR', '')}</td>
                    <td className="px-4 py-4 border-r border-black/5 text-right font-mono text-emerald-600">
                      {formatCurrency(rysterDiff).replace('SAR', '')}
                    </td>
                    {userProfile?.role !== 'USER' && (
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => onEdit(rec)} className="p-1 hover:bg-gray-100 transition-colors"><Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" /></button>
                          {userProfile?.role === 'ADMIN' && (
                            <button onClick={() => onDelete(rec.id)} className="p-1 hover:bg-red-50 text-red-600 transition-colors"><Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center text-xs font-black uppercase opacity-20 tracking-widest">
                    No Review Records Found For This Date
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Cards for Review Records */}
          <div className="md:hidden flex flex-col divide-y divide-[#F3F4F6]">
            {records.map((rec: any) => {
              const siennaDiff = rec.cvAmount - rec.siennaChecked;
              const rysterDiff = rec.cvAmount - rec.rysterCrossChecked;
              return (
                <div key={rec.id} className="p-4 flex flex-col gap-3 bg-white">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="font-mono text-xs opacity-60 mb-1">{rec.cvNo}</div>
                      <div className="text-sm font-bold line-clamp-2">{rec.particulars}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-black uppercase opacity-40">CV Amount</div>
                      <div className="font-mono font-black text-base">{formatCurrency(rec.cvAmount).replace('SAR', '')}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 bg-[#F8FAFC] p-3 rounded-none border border-black/5">
                    <div>
                      <div className="text-[9px] font-black uppercase opacity-50">Sienna Checked</div>
                      <div className="font-mono font-bold text-sm">{formatCurrency(rec.siennaChecked).replace('SAR', '')}</div>
                      <div className="font-mono text-[10px] text-blue-600 mt-0.5">Diff: {formatCurrency(siennaDiff).replace('SAR', '')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-black uppercase opacity-50">Ryster Checked</div>
                      <div className="font-mono font-bold text-sm">{formatCurrency(rec.rysterCrossChecked).replace('SAR', '')}</div>
                      <div className="font-mono text-[10px] text-emerald-600 mt-0.5">Diff: {formatCurrency(rysterDiff).replace('SAR', '')}</div>
                    </div>
                  </div>

                  {userProfile?.role !== 'USER' && (
                    <div className="flex justify-end gap-4 mt-2">
                      <button onClick={() => onEdit(rec)} className="p-2 bg-[#F1F5F9] rounded-full hover:bg-black hover:text-white transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {userProfile?.role === 'ADMIN' && (
                        <button onClick={() => onDelete(rec.id)} className="p-2 bg-[#FEF2F2] text-[#DC2626] rounded-full hover:bg-[#DC2626] hover:text-white transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {records.length === 0 && (
              <div className="p-10 text-center text-[10px] font-black uppercase opacity-20 tracking-widest">
                No Records Found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({ initialData, onClose, userId, dateStr }: { initialData?: DailyReviewRecord | null, onClose: () => void, userId: string, dateStr: string }) {
  const [formData, setFormData] = useState({
    cvNo: initialData?.cvNo || '',
    particulars: initialData?.particulars || '',
    cvAmount: initialData?.cvAmount?.toString() || '',
    siennaChecked: initialData?.siennaChecked?.toString() || '',
    rysterCrossChecked: initialData?.rysterCrossChecked?.toString() || '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      cvAmount: parseFloat(formData.cvAmount) || 0,
      siennaChecked: parseFloat(formData.siennaChecked) || 0,
      rysterCrossChecked: parseFloat(formData.rysterCrossChecked) || 0,
      createdAt: initialData?.createdAt || new Date().toISOString(),
      createdBy: userId,
      dateStr: initialData?.dateStr || dateStr,
    };

    try {
      if (initialData) {
        const { error } = await supabase.from('reviews').update(payload).eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reviews').insert([payload]);
        if (error) throw error;
      }
      onClose();
    } catch (error) {
      handleDatabaseError(error, initialData ? OperationType.UPDATE : OperationType.CREATE, 'reviews');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">CV Number</label>
          <input
            required
            value={formData.cvNo}
            onChange={e => setFormData({ ...formData, cvNo: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-bold focus:ring-2 ring-black outline-none"
            placeholder="NO.26-A..."
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">CV Description / Particulars</label>
          <input
            required
            value={formData.particulars}
            onChange={e => setFormData({ ...formData, particulars: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-bold focus:ring-2 ring-black outline-none"
            placeholder="Missing Invoice, error etc."
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Original CV Amount</label>
          <input
            required
            type="number"
            step="0.01"
            value={formData.cvAmount}
            onChange={e => setFormData({ ...formData, cvAmount: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-mono font-bold focus:ring-2 ring-black outline-none"
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Sienna Checked</label>
          <input
            required
            type="number"
            step="0.01"
            value={formData.siennaChecked}
            onChange={e => setFormData({ ...formData, siennaChecked: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-mono font-bold focus:ring-2 ring-black outline-none"
            placeholder="0.00"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Ryster Cross Checked</label>
          <input
            required
            type="number"
            step="0.01"
            value={formData.rysterCrossChecked}
            onChange={e => setFormData({ ...formData, rysterCrossChecked: e.target.value })}
            className="bg-[#F1F5F9] border-none p-3 text-sm font-mono font-bold focus:ring-2 ring-black outline-none"
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="pt-4 flex gap-4">
        <button
          type="submit"
          className="flex-1 bg-black text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#27272A] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          {initialData ? "Update Record" : "Save Review Item"}
        </button>
      </div>
    </form>
  );
}

function UserManagementPage({ users }: { users: AppUser[] }) {
  const roles: UserRole[] = ['ADMIN', 'REVIEWER', 'EDITOR', 'USER', 'PENDING'];

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('uid', userId)
        .select();

      if (error) {
        console.error("Failed to update role in DB:", error);
        alert(`Failed to update role: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        alert("Failed to update role: Row-Level Security (RLS) policies on your Supabase dashboard blocked this change, or the user was not found.");
        return;
      }

      alert(`Success: Role successfully updated to ${newRole}!`);
    } catch (e: any) {
      console.error("Failed to update role", e);
      alert(`Failed to update role: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Access Control</span>
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">User Permissions</h2>
      </div>

      <div className="bg-white border-2 border-black rounded-none brutalist-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-[#F1F5F9] text-[10px] font-black uppercase tracking-widest border-b-2 border-black hidden md:table-header-group">
              <tr>
                <th className="px-4 md:px-6 py-4 border-r border-black/10">User</th>
                <th className="px-4 md:px-6 py-4 border-r border-black/10">Email</th>
                <th className="px-4 md:px-6 py-4 border-r border-black/10">Last Login</th>
                <th className="px-4 md:px-6 py-4">Role / Permission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 text-sm font-bold hidden md:table-row-group">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 md:px-6 py-4 border-r border-black/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black shrink-0">
                        {u.displayName?.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="truncate max-w-[120px] md:max-w-none">{u.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 border-r border-black/5 opacity-60 font-mono text-[11px] md:text-xs truncate max-w-[150px] md:max-w-none">{u.email}</td>
                  <td className="px-4 md:px-6 py-4 border-r border-black/5 opacity-60 font-mono text-[11px] md:text-xs">
                    <span className="whitespace-nowrap">{new Date(u.lastLogin || '').toLocaleDateString()}</span>
                    <span className="hidden md:inline ml-1 opacity-50">{new Date(u.lastLogin || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td className="px-4 md:px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {roles.map(r => (
                        <button
                          key={r}
                          onClick={() => updateUserRole(u.uid, r)}
                          disabled={u.email === 'RCascalla1@gmail.com' && r !== 'ADMIN'}
                          className={cn(
                            "px-2 md:px-3 py-1 text-[8px] md:text-[9px] font-black uppercase tracking-wider border-2 border-black transition-all",
                            u.role === r
                              ? "bg-black text-white"
                              : "text-black hover:bg-black hover:text-white opacity-40 hover:opacity-100"
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-xs font-black uppercase opacity-20 tracking-widest">
                    Loading User Database...
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Cards for User Management */}
          <div className="md:hidden flex flex-col divide-y divide-[#F3F4F6]">
            {users.map((u) => (
              <div key={u.uid} className="p-4 flex flex-col gap-3 bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black shrink-0">
                    {u.displayName?.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{u.displayName}</div>
                    <div className="font-mono text-[10px] opacity-60 truncate">{u.email}</div>
                  </div>
                </div>

                <div className="text-[10px] opacity-50 font-mono">
                  Last Login: {new Date(u.lastLogin || '').toLocaleString()}
                </div>

                <div className="flex flex-wrap gap-2 mt-2 pt-3 border-t border-[#F3F4F6]">
                  {roles.map(r => (
                    <button
                      key={r}
                      onClick={() => updateUserRole(u.uid, r)}
                      disabled={u.email === 'RCascalla1@gmail.com' && r !== 'ADMIN'}
                      className={cn(
                        "px-2 py-1 text-[8px] font-black uppercase tracking-wider border-2 border-black transition-all",
                        u.role === r
                          ? "bg-black text-white"
                          : "text-black hover:bg-black hover:text-white opacity-40 hover:opacity-100"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="p-10 text-center text-[10px] font-black uppercase opacity-20 tracking-widest">
                Loading User Database...
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#F1F5F9] border-2 border-black p-4 md:p-6">
        <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Permission Matrix Guide
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-black/10">
            <span className="text-[9px] font-black uppercase text-[#2563EB]">ADMIN</span>
            <p className="text-[10px] opacity-60 mt-1">Full system access, role management, and deletions.</p>
          </div>
          <div className="p-4 bg-white border border-black/10">
            <span className="text-[9px] font-black uppercase text-[#059669]">REVIEWER</span>
            <p className="text-[10px] opacity-60 mt-1">Can create, edit, and view Daily Cash Reports.</p>
          </div>
          <div className="p-4 bg-white border border-black/10">
            <span className="text-[9px] font-black uppercase text-[#D97706]">EDITOR</span>
            <p className="text-[10px] opacity-60 mt-1">Can manage registry but requires Reviewer role for reports.</p>
          </div>
          <div className="p-4 bg-white border border-black/10">
            <span className="text-[9px] font-black uppercase opacity-40">USER</span>
            <p className="text-[10px] opacity-60 mt-1">View-only access to standard dashboards.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ==========================================
// DAILY DRIVE PAGE COMPONENT (SUPABASE STORAGE)
// ==========================================

interface DailyDrivePageProps {
  reports: any[];
  vouchers: any[];
  user: any;
  userProfile: any;
  onRefreshReports: () => void;
  onRefreshVouchers: () => void;
}

function DailyDrivePage({
  reports,
  vouchers,
  user,
  userProfile,
  onRefreshReports,
  onRefreshVouchers
}: DailyDrivePageProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string; filePath: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [driveTab, setDriveTab] = useState<'REPORTS' | 'VOUCHERS'>('REPORTS');

  const [sortField, setSortField] = useState<'name' | 'file_size' | 'uploaded_at' | 'uploaded_by'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const currentBucket = driveTab === 'REPORTS' ? 'cash-reports' : 'cash-vouchers';
  const currentTable = driveTab === 'REPORTS' ? 'reports' : 'vouchers';
  const currentFiles = driveTab === 'REPORTS' ? reports : vouchers;
  const currentRefresh = driveTab === 'REPORTS' ? onRefreshReports : onRefreshVouchers;

  const sortedFiles = useMemo(() => {
    return [...currentFiles].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'uploaded_by') {
        valA = a.uploader?.displayName || '';
        valB = b.uploader?.displayName || '';
      }

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      }
    });
  }, [currentFiles, sortField, sortOrder]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      if (field === 'uploaded_at' || field === 'file_size') {
        setSortOrder('desc');
      } else {
        setSortOrder('asc');
      }
    }
  };

  const isAdmin = useMemo(() => {
    return userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com';
  }, [userProfile, user]);

  // Calculate storage usage (limit = 1 GB = 1,073,741,824 bytes)
  const totalSize = useMemo(() => {
    return currentFiles.reduce((sum, r) => sum + Number(r.file_size || 0), 0);
  }, [currentFiles]);

  const storagePercentage = useMemo(() => {
    const limit = 1073741824; // 1 GB in bytes
    return Math.min((totalSize / limit) * 100, 100);
  }, [totalSize]);

  const formatSize = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from<File>(e.dataTransfer.files);
      await handleMultipleUpload(files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from<File>(e.target.files);
      await handleMultipleUpload(files);
    }
    e.target.value = '';
  };

  const uploadSingleFile = async (file: File): Promise<string | null> => {
    if (file.size > 52428800) {
      alert(`"${file.name}" exceeds the 50 MB limit. Skipping.`);
      return null;
    }

    const fileExt = file.name.split('.').pop();
    const prefix = driveTab === 'REPORTS' ? 'report' : 'voucher';
    const filePath = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

    try {
      const { error: storageError } = await supabase.storage
        .from(currentBucket)
        .upload(filePath, file);

      if (storageError) throw new Error(`Storage error: ${storageError.message}`);

      const { error: dbError } = await supabase
        .from(currentTable)
        .insert([{
          name: file.name,
          file_path: filePath,
          file_size: file.size,
          uploaded_by: user.id
        }]);

      if (dbError) {
        await supabase.storage.from(currentBucket).remove([filePath]);
        throw new Error(`Database error: ${dbError.message}`);
      }

      return filePath;
    } catch (err: any) {
      console.error(`Upload failed for "${file.name}"`, err);
      const setupFile = driveTab === 'REPORTS' ? 'SUPABASE_DRIVE_SETUP.md' : 'SUPABASE_VOUCHERS_SETUP.md';
      alert(`Failed to upload "${file.name}": ${err.message}. Make sure you executed the SQL code from ${setupFile} in your dashboard.`);
      return null;
    }
  };

  const handleMultipleUpload = async (files: File[]) => {
    if (userProfile?.role !== 'ADMIN' && user?.email?.trim().toLowerCase() !== 'rcascalla1@gmail.com') {
      alert("Unauthorized: Only administrators are permitted to upload reports or vouchers.");
      return;
    }

    const validFiles = files.filter(f => f.size <= 52428800);
    const skippedFiles = files.filter(f => f.size > 52428800);
    skippedFiles.forEach(f => alert(`"${f.name}" exceeds the 50 MB limit. Skipping.`));

    if (validFiles.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: validFiles.length });

    let successCount = 0;
    for (let i = 0; i < validFiles.length; i++) {
      setUploadProgress({ current: i + 1, total: validFiles.length });
      const result = await uploadSingleFile(validFiles[i]);
      if (result) successCount++;
    }

    setUploadProgress(null);
    setUploading(false);

    if (successCount > 0) {
      currentRefresh();
    }
  };

  const handleFileUpload = async (file: File) => {
    await handleMultipleUpload([file]);
  };

  const triggerPreview = async (filePath: string, name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif'].includes(ext);
    const isPdf = ext === 'pdf';

    if (!isImage && !isPdf) {
      await downloadFile(filePath, name);
      return;
    }

    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from(currentBucket)
        .createSignedUrl(filePath, 300);

      if (error) throw error;
      setPreviewFile({
        url: data.signedUrl,
        name: name,
        type: isPdf ? 'pdf' : 'image',
        filePath: filePath
      });
    } catch (err: any) {
      console.error("Preview signature failed", err);
      alert(`Could not open file preview: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = async (filePath: string, name: string) => {
    // Detect mobile browser to preemptively bypass popup blocker policies
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    let newWindow: Window | null = null;

    if (isMobile) {
      newWindow = window.open('about:blank', '_blank');
    }

    try {
      const { data, error } = await supabase.storage
        .from(currentBucket)
        .createSignedUrl(filePath, 60, { download: name });

      if (error) {
        throw error;
      }

      if (isMobile && newWindow) {
        // Redirect the synchronously opened window to the signed secure URL
        newWindow.location.href = data.signedUrl;
      } else {
        const link = document.createElement('a');
        link.href = data.signedUrl;
        link.download = name;
        link.target = '_blank';
        link.click();
      }
    } catch (err: any) {
      console.error("Download failed", err);
      if (newWindow) newWindow.close();
      alert(`Download failed: ${err.message}`);
    }
  };

  const deleteFile = async (id: string, filePath: string) => {
    if (userProfile?.role !== 'ADMIN' && user?.email?.trim().toLowerCase() !== 'rcascalla1@gmail.com') {
      alert("Unauthorized: Only administrators are permitted to delete items from this drive.");
      return;
    }

    const typeStr = driveTab === 'REPORTS' ? 'report' : 'voucher';
    if (!confirm(`Are you sure you want to permanently delete this ${typeStr}?`)) {
      return;
    }

    try {
      // 1. Delete from Supabase Storage
      const { error: storageError } = await supabase.storage
        .from(currentBucket)
        .remove([filePath]);

      if (storageError) {
        console.warn("Storage deletion warning", storageError);
      }

      // 2. Delete from database table
      const { error: dbError } = await supabase
        .from(currentTable)
        .delete()
        .eq('id', id);

      if (dbError) {
        throw dbError;
      }

      currentRefresh();
    } catch (err: any) {
      console.error("Deletion failed", err);
      alert(`Failed to delete document: ${err.message}`);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext || '')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) return <Banknote className="w-5 h-5 text-emerald-500" />;
    return <File className="w-5 h-5 text-slate-500" />;
  };

  return (
    <div className="space-y-8">
      {/* Brutalist Sub-Tab Switcher */}
      <div className="flex gap-2 border-b-4 border-black pb-4">
        <button
          onClick={() => setDriveTab('REPORTS')}
          className={cn(
            "px-4 py-2 text-[10px] font-black uppercase tracking-wider border-2 border-black brutalist-shadow transition-all flex items-center gap-2",
            driveTab === 'REPORTS' ? "bg-black text-white" : "bg-white text-black hover:bg-slate-50"
          )}
        >
          <Folder className="w-3.5 h-3.5" />
          Cash Reports Folder
        </button>
        <button
          onClick={() => setDriveTab('VOUCHERS')}
          className={cn(
            "px-4 py-2 text-[10px] font-black uppercase tracking-wider border-2 border-black brutalist-shadow transition-all flex items-center gap-2",
            driveTab === 'VOUCHERS' ? "bg-black text-white" : "bg-white text-black hover:bg-slate-50"
          )}
        >
          <Receipt className="w-3.5 h-3.5" />
          Cash Vouchers Folder
        </button>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Vault Storage</span>
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">
            {driveTab === 'REPORTS' ? 'Reports Drive' : 'Vouchers Drive'}
          </h2>
        </div>

        {/* Storage Bar (wow factor) */}
        <div className="bg-white border-2 border-black p-4 brutalist-shadow w-full md:max-w-xs shrink-0">
          <div className="flex justify-between items-center text-[10px] font-black uppercase mb-1.5">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5" />
              {driveTab === 'REPORTS' ? 'Reports' : 'Vouchers'} Capacity
            </span>
            <span>{formatSize(totalSize)} / 1 GB</span>
          </div>
          <div className="w-full h-4 bg-gray-200 border border-black overflow-hidden relative">
            <div
              className="h-full bg-black transition-all duration-500"
              style={{ width: `${storagePercentage}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black font-mono leading-none select-none text-white mix-blend-difference">
              {storagePercentage.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Upload Box Dropzone (Admins Only) */}
      {isAdmin ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-4 border-dashed p-8 md:p-12 text-center cursor-pointer transition-all brutalist-shadow flex flex-col items-center justify-center gap-3 bg-white",
            dragActive ? "border-[#2563EB] bg-[#eff6ff]" : "border-black hover:bg-slate-50"
          )}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt"
            multiple
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-black"></div>
              <span className="text-xs font-black uppercase tracking-widest">
                {uploadProgress
                  ? `Uploading ${uploadProgress.current} of ${uploadProgress.total} ${driveTab === 'REPORTS' ? 'Reports' : 'Vouchers'}...`
                  : `Uploading ${driveTab === 'REPORTS' ? 'Report' : 'Voucher'} to Supabase Storage...`}
              </span>
              {uploadProgress && uploadProgress.total > 1 && (
                <div className="w-48 h-2 bg-gray-200 border border-black overflow-hidden">
                  <div
                    className="h-full bg-black transition-all duration-300"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="p-4 bg-black text-white rounded-none brutalist-shadow flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest">
                  Drag and drop {driveTab === 'REPORTS' ? 'reports' : 'vouchers'} here
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                  or click to browse files (max 50 MB each)
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Read-only notification banner */
        <div className="bg-[#EFF6FF] border-2 border-black p-6 brutalist-shadow flex items-start gap-4">
          <div className="p-3 bg-black text-white shrink-0">
            <ShieldCheck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#2563EB] font-mono">Vault Storage Access</span>
            <h4 className="text-sm font-black uppercase mt-1">Read-Only Document Drive</h4>
            <p className="text-xs opacity-60 mt-1 uppercase font-bold tracking-wider leading-relaxed">
              You have secure read access to all uploaded {driveTab === 'REPORTS' ? 'cash reports' : 'cash vouchers'}. Only system administrators have permission to upload files or delete items from this folder.
            </p>
          </div>
        </div>
      )}

      {/* Reports Grid/Table */}
      <div className="bg-white border-2 border-black brutalist-shadow overflow-hidden">
        <div className="p-4 md:p-6 border-b-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xs font-black uppercase tracking-widest flex items-center">
            <span className="w-2 h-2 bg-black mr-2"></span>
            Uploaded {driveTab === 'REPORTS' ? 'Reports' : 'Vouchers'} ({currentFiles.length})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider opacity-40">Sort By:</span>
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortField(field as any);
                setSortOrder(order as any);
              }}
              className="bg-[#F1F5F9] border-2 border-black px-3 py-1.5 text-[10px] font-black uppercase tracking-wider focus:ring-2 focus:ring-black outline-none cursor-pointer"
            >
              <option value="uploaded_at-desc">Upload Date (Newest)</option>
              <option value="uploaded_at-asc">Upload Date (Oldest)</option>
              <option value="name-asc">File Name (A-Z)</option>
              <option value="name-desc">File Name (Z-A)</option>
              <option value="file_size-desc">File Size (Largest)</option>
              <option value="file_size-asc">File Size (Smallest)</option>
              <option value="uploaded_by-asc">Uploaded By (A-Z)</option>
              <option value="uploaded_by-desc">Uploaded By (Z-A)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F1F5F9] text-[10px] font-black uppercase tracking-widest border-b-2 border-black hidden md:table-header-group">
              <tr>
                <th
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    File Name
                    {sortField === 'name' && (
                      sortOrder === 'asc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('file_size')}
                >
                  <div className="flex items-center gap-1">
                    Size
                    {sortField === 'file_size' && (
                      sortOrder === 'asc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('uploaded_at')}
                >
                  <div className="flex items-center gap-1">
                    Upload Date
                    {sortField === 'uploaded_at' && (
                      sortOrder === 'asc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
                <th
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('uploaded_by')}
                >
                  <div className="flex items-center gap-1">
                    Uploaded By
                    {sortField === 'uploaded_by' && (
                      sortOrder === 'asc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6] text-sm font-bold">
              {sortedFiles.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  {/* File Name */}
                  <td className="px-6 py-4">
                    <button
                      onClick={() => triggerPreview(doc.file_path, doc.name)}
                      className="flex items-center gap-3 text-left hover:text-[#2563EB] transition-colors focus:outline-none group"
                    >
                      {getFileIcon(doc.name)}
                      <span className="truncate max-w-[200px] sm:max-w-[350px] group-hover:underline decoration-dashed decoration-1" title={doc.name}>
                        {doc.name}
                      </span>
                    </button>
                  </td>
                  {/* Size */}
                  <td className="px-6 py-4 font-mono text-xs opacity-60">
                    {formatSize(doc.file_size)}
                  </td>
                  {/* Date */}
                  <td className="px-6 py-4 font-mono text-xs opacity-60">
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                    <span className="hidden md:inline ml-1 opacity-50">
                      {new Date(doc.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  {/* Uploaded By */}
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[10px] font-black uppercase border border-black/10">
                      {doc.uploader?.displayName || 'System'}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {['pdf', 'png', 'jpg', 'jpeg', 'gif'].includes(doc.name.split('.').pop()?.toLowerCase() || '') && (
                        <button
                          onClick={() => triggerPreview(doc.file_path, doc.name)}
                          className="p-1.5 bg-[#EFF6FF] border border-[#BFDBFE] hover:border-[#2563EB] text-[#2563EB] transition-all hover:bg-[#2563EB] hover:text-white"
                          title="View inline"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => downloadFile(doc.file_path, doc.name)}
                        className="p-1.5 bg-[#F1F5F9] border border-black/10 hover:border-black text-black transition-all hover:bg-black hover:text-white"
                        title="Download file"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {(userProfile?.role === 'ADMIN' || user?.email?.trim().toLowerCase() === 'rcascalla1@gmail.com') && (
                        <button
                          onClick={() => deleteFile(doc.id, doc.file_path)}
                          className="p-1.5 bg-[#FEF2F2] border border-[#FECACA] hover:border-[#DC2626] text-[#DC2626] transition-all hover:bg-[#DC2626] hover:text-white"
                          title="Purge Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {sortedFiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-xs font-black uppercase opacity-20 tracking-widest">
                    No documents uploaded to this folder. Drop a file above to begin!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Preview Loading Backdrop */}
      {previewLoading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white border-4 border-black p-6 brutalist-shadow flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-black"></div>
            <span className="text-[10px] font-black uppercase tracking-widest font-mono">Generating Secure Preview...</span>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-4 border-black w-full max-w-5xl h-[85vh] flex flex-col brutalist-shadow"
            >
              {/* Header */}
              <div className="p-4 border-b-4 border-black bg-[#F1F5F9] flex items-center justify-between">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-40">Document Preview</span>
                  <h3 className="text-xs sm:text-sm font-black truncate pr-4 text-black" title={previewFile.name}>
                    {previewFile.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => downloadFile(previewFile.filePath, previewFile.name)}
                    className="px-2.5 py-1.5 bg-black text-white hover:bg-zinc-800 transition-all font-black uppercase tracking-wider text-[9px] sm:text-[10px] flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>

                  <button
                    onClick={() => setPreviewFile(null)}
                    className="p-1.5 bg-white border-2 border-black hover:bg-black hover:text-white transition-all text-black font-black"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body Content */}
              <div className="flex-1 bg-zinc-100 p-4 md:p-6 overflow-auto flex items-center justify-center relative">
                {previewFile.type === 'pdf' ? (
                  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center bg-white border-2 border-black brutalist-shadow max-w-sm">
                      <div className="p-4 bg-[#EFF6FF] text-[#2563EB] mb-4 border-2 border-black">
                        <FileText className="w-12 h-12" />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Mobile PDF Support</span>
                      <h4 className="text-sm font-black uppercase mt-1">Mobile PDF Viewer</h4>
                      <p className="text-xs opacity-60 mt-2 uppercase font-bold tracking-wider leading-relaxed">
                        Mobile browsers do not support embedded PDF previews. Click the button below to safely open and view your secure report.
                      </p>
                      <button
                        onClick={() => window.open(previewFile.url, '_blank')}
                        className="mt-6 w-full py-3 bg-black text-white hover:bg-zinc-800 transition-all font-black uppercase tracking-widest text-[9px] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                      >
                        Open PDF in New Tab
                      </button>
                    </div>
                  ) : (
                    <iframe
                      src={`${previewFile.url}#toolbar=0&navpanes=0`}
                      className="w-full h-full border-none bg-white"
                      title="PDF Preview"
                    />
                  )
                ) : (
                  <img
                    src={previewFile.url}
                    alt={previewFile.name}
                    className="max-w-full max-h-full object-contain border border-black/10 bg-white shadow-md"
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// BANK REGISTRY COMPONENTS
// ============================================================================

interface BankTransactionFormProps {
  initialData: BankTransaction | null;
  onClose: () => void;
  userId: string;
}

function BankTransactionForm({ initialData, onClose, userId }: BankTransactionFormProps) {
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<BankTransactionType>(initialData?.type || 'PAYMENT_TO_BE_MADE');
  const [particulars, setParticulars] = useState(initialData?.particulars || '');
  const [refNo, setRefNo] = useState(initialData?.refNo || '');
  const [bankName, setBankName] = useState(initialData?.bankName || 'Al Rajhi Bank');
  const [amount, setAmount] = useState(initialData?.amount ? String(initialData.amount) : '');
  const [status, setStatus] = useState<BankTransactionStatus>(initialData?.status || 'CLEARED');
  const [remarks, setRemarks] = useState(initialData?.remarks || '');
  const [submitting, setSubmitting] = useState(false);

  const bankOptions = ['Al Rajhi Bank', 'SNB (AlAhli)', 'Riyad Bank', 'SABB', 'Other'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!particulars || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert("Please fill all required fields correctly. Amount must be a positive number.");
      return;
    }

    setSubmitting(true);

    const payload = {
      date,
      type,
      particulars,
      refNo: refNo || null,
      bankName,
      amount: Number(amount),
      status,
      remarks: remarks || null,
      createdBy: userId
    };

    try {
      if (initialData) {
        const { error } = await supabase
          .from('bank_transactions')
          .update(payload)
          .eq('id', initialData.id);
        if (error) throw error;
        alert("Transaction updated successfully!");
      } else {
        const { error } = await supabase
          .from('bank_transactions')
          .insert([payload]);
        if (error) throw error;
        alert("Transaction added successfully!");
      }
      onClose();
    } catch (error: any) {
      console.error("Failed to save bank transaction:", error);
      if (isMissingTableError(error, 'bank_transactions')) {
        alert(missingBankTableMessage);
        return;
      }
      alert(`Database operation failed: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4 font-bold text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Date *</label>
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full p-3 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Type *</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as BankTransactionType)}
            className="w-full p-3 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50"
          >
            <option value="DEPOSIT">DEPOSIT (+)</option>
            <option value="FUND_TRANSFER">FUND TRANSFER (+)</option>
            <option value="DEPOSIT_FROM_KOREA">DEPOSIT FROM KOREA (+)</option>
            <option value="PAYMENT_TO_BE_MADE">PAYMENT TO BE MADE (-)</option>
            <option value="WITHDRAWAL">WITHDRAWAL (-)</option>
            <option value="KOREA_PAYMENT">KOREA PAYMENT (-)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Source / Account *</label>
          <select
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            className="w-full p-3 border-2 border-black rounded-none focus:outline-none"
          >
            {bankOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Reference No.</label>
          <input
            type="text"
            placeholder="e.g. invoice, transfer, voucher reference"
            value={refNo}
            onChange={e => setRefNo(e.target.value)}
            className="w-full p-3 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Particulars *</label>
        <input
          type="text"
          required
          placeholder="e.g. Cash replenishment for petty cash, Supplier payment"
          value={particulars}
          onChange={e => setParticulars(e.target.value)}
          className="w-full p-3 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Amount (SAR) *</label>
          <input
            type="number"
            step="0.01"
            required
            min="0.01"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full p-3 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50 font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Reconciliation Status *</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as BankTransactionStatus)}
            className="w-full p-3 border-2 border-black rounded-none focus:outline-none"
          >
            <option value="CLEARED">CLEARED</option>
            <option value="PENDING">PENDING</option>
            <option value="BOUNCED">BOUNCED</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black uppercase tracking-widest opacity-50 mb-1">Remarks / Internal Note</label>
        <textarea
          placeholder="Optional remarks..."
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          className="w-full p-3 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50 min-h-[60px]"
        />
      </div>

      <div className="flex gap-4 pt-4 border-t-2 border-black/10">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 border-2 border-black text-black font-black uppercase tracking-widest text-xs hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3 bg-black text-white font-black uppercase tracking-widest text-xs hover:bg-zinc-800 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        >
          {submitting ? "Processing..." : initialData ? "Update Record" : "Add Record"}
        </button>
      </div>
    </form>
  );
}

interface BankRegistryPageProps {
  signerSettings: ReturnType<typeof useSigners>;
  transactions: BankTransaction[];
  userProfile: AppUser | null;
  isAdmin: boolean;
  bankBalance: number;
  bankBalanceDate: string;
  onUpdateBankBalance: (value: number) => Promise<void>;
  onAdd: () => void;
  onEdit: (tx: BankTransaction) => void;
  onDelete: (tx: BankTransaction) => void;
  formatCurrency: (value: number) => string;
  bankFilter: string;
  setBankFilter: (val: string) => void;
  bankTypeFilter: 'ALL' | BankTransactionType;
  setBankTypeFilter: (val: 'ALL' | BankTransactionType) => void;
  bankStatusFilter: 'ALL' | 'CLEARED' | 'PENDING' | 'BOUNCED';
  setBankStatusFilter: (val: 'ALL' | 'CLEARED' | 'PENDING' | 'BOUNCED') => void;
  bankSearchTerm: string;
  setBankSearchTerm: (val: string) => void;
  bankDateStart: string;
  setBankDateStart: (val: string) => void;
  bankDateEnd: string;
  setBankDateEnd: (val: string) => void;
  selectedBankIds: string[];
  setSelectedBankIds: React.Dispatch<React.SetStateAction<string[]>>;
  onBulkDelete: () => void;
  onExportPDF: () => void;
  onExportPNG: () => void;
}

function BankRegistryPage({
  signerSettings,
  transactions,
  userProfile,
  isAdmin,
  bankBalance,
  bankBalanceDate,
  onUpdateBankBalance,
  onAdd,
  onEdit,
  onDelete,
  formatCurrency,
  bankFilter,
  setBankFilter,
  bankTypeFilter,
  setBankTypeFilter,
  bankStatusFilter,
  setBankStatusFilter,
  bankSearchTerm,
  setBankSearchTerm,
  bankDateStart,
  setBankDateStart,
  bankDateEnd,
  setBankDateEnd,
  selectedBankIds,
  setSelectedBankIds,
  onBulkDelete,
  onExportPDF,
  onExportPNG
}: BankRegistryPageProps) {
  const [isEditingBankBalance, setIsEditingBankBalance] = useState(false);
  const [bankBalanceDraft, setBankBalanceDraft] = useState(String(bankBalance));
  const [isSavingBankBalance, setIsSavingBankBalance] = useState(false);

  useEffect(() => {
    if (!isEditingBankBalance) {
      setBankBalanceDraft(String(bankBalance));
    }
  }, [bankBalance, isEditingBankBalance]);

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (bankFilter !== 'ALL' && tx.bankName !== bankFilter) return false;
      if (bankTypeFilter !== 'ALL' && tx.type !== bankTypeFilter) return false;
      if (bankStatusFilter !== 'ALL' && tx.status !== bankStatusFilter) return false;
      if (bankDateStart && tx.date < bankDateStart) return false;
      if (bankDateEnd && tx.date > bankDateEnd) return false;
      if (bankSearchTerm.trim()) {
        const query = bankSearchTerm.toLowerCase();
        const particularsMatch = tx.particulars?.toLowerCase().includes(query);
        const refNoMatch = tx.refNo?.toLowerCase().includes(query);
        const remarksMatch = tx.remarks?.toLowerCase().includes(query);
        const amountMatch = String(tx.amount).includes(query);
        if (!particularsMatch && !refNoMatch && !remarksMatch && !amountMatch) return false;
      }
      return true;
    });
  }, [transactions, bankFilter, bankTypeFilter, bankStatusFilter, bankSearchTerm, bankDateStart, bankDateEnd]);

  const totalIncoming = useMemo(() => {
    return filtered
      .filter(tx => isIncomingBankTransaction(tx.type))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [filtered]);

  const totalPaymentsToBeMade = useMemo(() => {
    return filtered
      .filter(tx => isPaymentToBeMadeType(tx.type))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [filtered]);

  const totalWithdrawals = useMemo(() => {
    return filtered
      .filter(tx => tx.type === 'WITHDRAWAL')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [filtered]);

  const netFlow = totalIncoming - totalPaymentsToBeMade - totalWithdrawals;

  const pendingAmount = useMemo(() => {
    return filtered
      .filter(tx => tx.status === 'PENDING')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }, [filtered]);

  const isAllSelected = filtered.length > 0 && selectedBankIds.length === filtered.length;

  const toggleSelectRow = (id: string) => {
    setSelectedBankIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedBankIds([]);
    } else {
      setSelectedBankIds(filtered.map(tx => tx.id));
    }
  };

  const bankOptions = ['Al Rajhi Bank', 'SNB (AlAhli)', 'Riyad Bank', 'SABB', 'Other'];

  const currentBookBalance = bankBalance + netFlow;

  const handleSaveBankBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextBalance = Number(bankBalanceDraft);

    if (!Number.isFinite(nextBalance)) {
      alert("Please enter a valid bank balance.");
      return;
    }

    setIsSavingBankBalance(true);
    try {
      await onUpdateBankBalance(nextBalance);
      setIsEditingBankBalance(false);
    } catch (error) {
      console.error("Failed to update bank balance:", error);
    } finally {
      setIsSavingBankBalance(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        <div className="bg-white border-2 border-black p-6 brutalist-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <Wallet className="w-12 h-12 text-[#2563EB]" />
          </div>
          <div className="relative z-10">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Bank Book Balance</span>
            {isEditingBankBalance ? (
              <form onSubmit={handleSaveBankBalance} className="mt-2 space-y-3">
                <input
                  type="number"
                  step="0.01"
                  required
                  value={bankBalanceDraft}
                  onChange={e => setBankBalanceDraft(e.target.value)}
                  className="w-full border-2 border-black bg-[#F8FAFC] px-3 py-2 text-2xl font-black font-mono focus:outline-none focus:bg-amber-50"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSavingBankBalance}
                    className="flex-1 bg-black text-white px-3 py-2 text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSavingBankBalance ? "Saving" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBankBalanceDraft(String(bankBalance));
                      setIsEditingBankBalance(false);
                    }}
                    className="px-3 py-2 border-2 border-black text-[9px] font-black uppercase tracking-widest hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="text-3xl font-black uppercase tracking-tighter mt-2 text-[#2563EB] font-mono">
                  {formatCurrency(bankBalance)}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{bankBalanceDate}</span>
                  {isAdmin && (
                    <button
                      onClick={() => setIsEditingBankBalance(true)}
                      className="px-2.5 py-1 bg-black text-white hover:bg-[#27272A] text-[9px] font-black uppercase tracking-widest"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="h-1 bg-[#2563EB] w-full mt-4"></div>
        </div>

        <div className="bg-white border-2 border-black p-6 brutalist-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <Receipt className="w-12 h-12 text-[#F59E0B]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Payments to Be Made</span>
          <div className="text-3xl font-black uppercase tracking-tighter mt-2 text-[#F59E0B] font-mono">
            {formatCurrency(totalPaymentsToBeMade)}
          </div>
          <div className="h-1 bg-[#F59E0B] w-full mt-4"></div>
        </div>

        <div className="bg-white border-2 border-black p-6 brutalist-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <TrendingDown className="w-12 h-12 text-[#EF4444]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Withdrawals</span>
          <div className="text-3xl font-black uppercase tracking-tighter mt-2 text-[#EF4444] font-mono">
            {formatCurrency(totalWithdrawals)}
          </div>
          <div className="h-1 bg-[#EF4444] w-full mt-4"></div>
        </div>

        <div className="bg-white border-2 border-black p-6 brutalist-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <DollarSign className="w-12 h-12 text-[#3B82F6]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Current Book Balance</span>
          <div className={cn(
            "text-3xl font-black uppercase tracking-tighter mt-2 font-mono",
            currentBookBalance >= 0 ? "text-[#3B82F6]" : "text-[#EF4444]"
          )}>
            {formatCurrency(currentBookBalance)}
          </div>
          <div className={cn("h-1 w-full mt-4", currentBookBalance >= 0 ? "bg-[#3B82F6]" : "bg-[#EF4444]")}></div>
        </div>

        <div className="bg-white border-2 border-black p-6 brutalist-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <Clock className="w-12 h-12 text-[#F59E0B]" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Pending Clearance</span>
          <div className="text-3xl font-black uppercase tracking-tighter mt-2 text-[#F59E0B] font-mono">
            {formatCurrency(pendingAmount)}
          </div>
          <div className="h-1 bg-[#F59E0B] w-full mt-4"></div>
        </div>
      </div>

      <div className="bg-white border-2 border-black p-6 brutalist-shadow space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-2.5 py-1">Filters</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Configure bank views</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onExportPDF}
              className="flex items-center gap-2 px-4 py-2 border-2 border-black bg-white text-black hover:bg-slate-100 font-black uppercase tracking-widest text-[10px] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF Statement
            </button>
            <button
              onClick={onExportPNG}
              className="flex items-center gap-2 px-4 py-2 border-2 border-black bg-black text-white hover:bg-zinc-800 font-black uppercase tracking-widest text-[10px] transition-colors shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            >
              <Camera className="w-3.5 h-3.5" />
              Capture PNG
            </button>
            {isAdmin && (
              <button
                onClick={onAdd}
                className="flex items-center gap-2 px-4 py-2 bg-[#10B981] border-2 border-black text-white hover:bg-[#059669] font-black uppercase tracking-widest text-[10px] transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Add Record
              </button>
            )}
          </div>
        </div>

        <SignerEditor {...signerSettings} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 pt-4 border-t border-slate-100">
          <div className="col-span-1 sm:col-span-2">
            <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Search particulars/ref</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={bankSearchTerm}
                onChange={e => setBankSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border-2 border-black rounded-none focus:outline-none focus:bg-amber-50 font-bold"
              />
              <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-40" />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Source / Account</label>
            <select
              value={bankFilter}
              onChange={e => setBankFilter(e.target.value)}
              className="w-full p-2 border-2 border-black rounded-none focus:outline-none font-bold text-xs"
            >
              <option value="ALL">All Sources</option>
              {bankOptions.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Transaction Type</label>
            <select
              value={bankTypeFilter}
              onChange={e => setBankTypeFilter(e.target.value as any)}
              className="w-full p-2 border-2 border-black rounded-none focus:outline-none font-bold text-xs"
            >
              <option value="ALL">All Types</option>
              <option value="DEPOSIT">DEPOSITS (+)</option>
              <option value="FUND_TRANSFER">FUND TRANSFER (+)</option>
              <option value="DEPOSIT_FROM_KOREA">DEPOSIT FROM KOREA (+)</option>
              <option value="PAYMENT_TO_BE_MADE">PAYMENTS TO BE MADE (-)</option>
              <option value="WITHDRAWAL">WITHDRAWALS (-)</option>
              <option value="KOREA_PAYMENT">KOREA PAYMENT (-)</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Clearance Status</label>
            <select
              value={bankStatusFilter}
              onChange={e => setBankStatusFilter(e.target.value as any)}
              className="w-full p-2 border-2 border-black rounded-none focus:outline-none font-bold text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="CLEARED">CLEARED</option>
              <option value="PENDING">PENDING</option>
              <option value="BOUNCED">BOUNCED</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setBankFilter('ALL');
                setBankTypeFilter('ALL');
                setBankStatusFilter('ALL');
                setBankSearchTerm('');
                setBankDateStart('');
                setBankDateEnd('');
              }}
              className="w-full py-2 border-2 border-black text-black hover:bg-slate-100 transition-colors text-[9px] font-black uppercase tracking-widest"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Start Date</label>
            <input
              type="date"
              value={bankDateStart}
              onChange={e => setBankDateStart(e.target.value)}
              className="w-full p-2 border-2 border-black rounded-none focus:outline-none text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">End Date</label>
            <input
              type="date"
              value={bankDateEnd}
              onChange={e => setBankDateEnd(e.target.value)}
              className="w-full p-2 border-2 border-black rounded-none focus:outline-none text-xs font-bold"
            />
          </div>
        </div>
      </div>

      {selectedBankIds.length > 0 && isAdmin && (
        <div className="bg-[#FEF2F2] border-4 border-black p-4 flex items-center justify-between brutalist-shadow">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-[#DC2626]" />
            <span className="text-xs font-black uppercase tracking-widest text-black">
              {selectedBankIds.length} Selected Transaction(s)
            </span>
          </div>
          <button
            onClick={onBulkDelete}
            className="px-4 py-2 bg-[#DC2626] border-2 border-black text-white hover:bg-[#B91C1C] text-[10px] font-black uppercase tracking-widest transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            Purge Selected
          </button>
        </div>
      )}

      <div className="bg-white border-2 border-black brutalist-shadow overflow-hidden">
        <div className="p-4 border-b-2 border-black flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest flex items-center">
            <span className="w-2.5 h-2.5 bg-black mr-2"></span>
            Transactions Ledger ({filtered.length})
          </span>
        </div>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F1F5F9] text-[10px] font-black uppercase tracking-widest border-b-2 border-black">
              <tr>
                {isAdmin && (
                  <th className="px-6 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 border-2 border-black rounded-none cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Source / Account</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Particulars / Ref No</th>
                <th className="px-6 py-4 text-right">Amount (SAR)</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Remarks</th>
                {isAdmin && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-bold">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                  {isAdmin && (
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedBankIds.includes(tx.id)}
                        onChange={() => toggleSelectRow(tx.id)}
                        className="w-4 h-4 border-2 border-black rounded-none cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">{tx.date}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[10px] font-black uppercase border border-black/10">
                      {tx.bankName}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-0.5 text-[10px] font-black border uppercase tracking-wider",
                      isIncomingBankTransaction(tx.type)
                        ? "bg-[#E6F4EA] text-[#137333] border-[#137333]/20"
                        : "bg-[#FCE8E6] text-[#C5221F] border-[#C5221F]/20"
                    )}>
                      {formatBankTransactionType(tx.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[13px] text-slate-900 font-bold">{tx.particulars}</span>
                      {tx.refNo && (
                        <span className="text-[10px] font-mono text-slate-400 mt-0.5">REF: {tx.refNo}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-base font-black">
                    <span className={isIncomingBankTransaction(tx.type) ? "text-[#10B981]" : "text-[#EF4444]"}>
                      {(isIncomingBankTransaction(tx.type) ? '+' : '-') + formatCurrency(tx.amount)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2.5 py-0.5 text-[9px] font-black border uppercase tracking-widest",
                      tx.status === 'CLEARED' && "bg-[#E6F4EA] text-[#137333] border-[#137333]/20",
                      tx.status === 'PENDING' && "bg-[#FEF7E0] text-[#B06000] border-[#B06000]/20",
                      tx.status === 'BOUNCED' && "bg-[#FCE8E6] text-[#C5221F] border-[#C5221F]/20"
                    )}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-normal text-slate-500 italic max-w-xs truncate" title={tx.remarks}>
                    {tx.remarks || '-'}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEdit(tx)}
                          className="p-1.5 bg-[#EFF6FF] border border-[#BFDBFE] hover:border-[#2563EB] text-[#2563EB] transition-colors"
                          title="Edit transaction"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(tx)}
                          className="p-1.5 bg-[#FEF2F2] border border-[#FECACA] hover:border-[#DC2626] text-[#DC2626] transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 7} className="px-6 py-16 text-center text-xs font-black uppercase opacity-20 tracking-widest">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-slate-100">
          {filtered.map(tx => (
            <div key={tx.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs opacity-50">{tx.date}</span>
                <span className={cn(
                  "px-2 py-0.5 text-[9px] font-black border uppercase tracking-wider",
                  isIncomingBankTransaction(tx.type)
                    ? "bg-[#E6F4EA] text-[#137333] border-[#137333]/20"
                    : "bg-[#FCE8E6] text-[#C5221F] border-[#C5221F]/20"
                )}>
                  {formatBankTransactionType(tx.type)}
                </span>
              </div>

              <div>
                <span className="text-xs font-black uppercase opacity-40">{tx.bankName}</span>
                <h4 className="text-sm font-black text-slate-800 leading-tight mt-0.5">{tx.particulars}</h4>
                {tx.refNo && <p className="text-[10px] font-mono text-slate-400 mt-0.5">REF: {tx.refNo}</p>}
              </div>

              <div className="flex items-end justify-between pt-2">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 block">Amount</span>
                  <span className={cn(
                    "font-mono text-lg font-black",
                    isIncomingBankTransaction(tx.type) ? "text-[#10B981]" : "text-[#EF4444]"
                  )}>
                    {(isIncomingBankTransaction(tx.type) ? '+' : '-') + formatCurrency(tx.amount)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className={cn(
                    "px-2 py-0.5 text-[9px] font-black border uppercase tracking-widest",
                    tx.status === 'CLEARED' && "bg-[#E6F4EA] text-[#137333] border-[#137333]/20",
                    tx.status === 'PENDING' && "bg-[#FEF7E0] text-[#B06000] border-[#B06000]/20",
                    tx.status === 'BOUNCED' && "bg-[#FCE8E6] text-[#C5221F] border-[#C5221F]/20"
                  )}>
                    {tx.status}
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit(tx)}
                        className="p-1 bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB]"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(tx)}
                        className="p-1 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-6 py-16 text-center text-xs font-black uppercase opacity-20 tracking-widest">
              No transactions found.
            </div>
          )}
        </div>
      </div>

      <div
        id="bank-registry-report-view"
        className="fixed -left-[9999px] top-0 w-[1000px] p-10 bg-white border-[10px] border-black space-y-8"
        style={{ position: 'fixed', visibility: 'hidden' }}
      >
        <div className="border-b-4 border-black pb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Financial Control System</span>
          <h2 className="text-4xl font-black uppercase tracking-tighter">ADK CO., LTD</h2>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Bank Transactions Registry Statement</p>
        </div>

        <div className="bg-[#F8FAFC] border-2 border-black p-4 flex justify-between text-[11px] font-bold uppercase tracking-wider">
          <div>Bank: {bankFilter}</div>
          <div>Type: {bankTypeFilter === 'ALL' ? 'ALL' : formatBankTransactionType(bankTypeFilter)}</div>
          <div>Status: {bankStatusFilter}</div>
          <div>Date: {bankDateStart || 'Earliest'} to {bankDateEnd || 'Latest'}</div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="border-2 border-black p-4 bg-[#EFF6FF]">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Bank Book Balance</span>
            <div className="text-xl font-black mt-1 text-[#2563EB] font-mono">{formatCurrency(bankBalance)}</div>
          </div>
          <div className="border-2 border-black p-4 bg-[#F0FDF4]">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Payments to Make</span>
            <div className="text-xl font-black mt-1 text-[#10B981] font-mono">{formatCurrency(totalPaymentsToBeMade)}</div>
          </div>
          <div className="border-2 border-black p-4 bg-[#FEF2F2]">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Withdrawals</span>
            <div className="text-xl font-black mt-1 text-[#EF4444] font-mono">{formatCurrency(totalWithdrawals)}</div>
          </div>
          <div className="border-2 border-black p-4 bg-[#EFF6FF]">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Current Balance</span>
            <div className={cn("text-xl font-black mt-1 font-mono", currentBookBalance >= 0 ? "text-[#3B82F6]" : "text-[#EF4444]")}>
              {formatCurrency(currentBookBalance)}
            </div>
          </div>
          <div className="border-2 border-black p-4 bg-[#FFFBEB]">
            <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Pending</span>
            <div className="text-xl font-black mt-1 text-[#F59E0B] font-mono">{formatCurrency(pendingAmount)}</div>
          </div>
        </div>

        <table className="w-full text-left border-collapse border-2 border-black">
          <thead>
            <tr className="bg-black text-white text-[9px] font-black uppercase tracking-widest">
              <th className="p-3 border border-black">No.</th>
              <th className="p-3 border border-black">Date</th>
              <th className="p-3 border border-black">Source / Account</th>
              <th className="p-3 border border-black">Type</th>
              <th className="p-3 border border-black">Particulars / Ref</th>
              <th className="p-3 border border-black text-right">Amount (SAR)</th>
              <th className="p-3 border border-black">Status</th>
            </tr>
          </thead>
          <tbody className="text-[11px] font-bold">
            {filtered.map((tx, idx) => (
              <tr key={tx.id} className="border-b border-black">
                <td className="p-3 border border-black font-mono">{idx + 1}</td>
                <td className="p-3 border border-black font-mono">{tx.date}</td>
                <td className="p-3 border border-black">{tx.bankName}</td>
                <td className="p-3 border border-black">
                  <span className={isIncomingBankTransaction(tx.type) ? "text-[#10B981]" : "text-[#EF4444]"}>{formatBankTransactionType(tx.type)}</span>
                </td>
                <td className="p-3 border border-black">
                  <div>{tx.particulars}</div>
                  {tx.refNo && <div className="text-[9px] font-mono text-slate-400">REF: {tx.refNo}</div>}
                </td>
                <td className="p-3 border border-black text-right font-mono font-black">
                  <span className={isIncomingBankTransaction(tx.type) ? "text-[#10B981]" : "text-[#EF4444]"}>
                    {(isIncomingBankTransaction(tx.type) ? '+' : '-') + formatCurrency(tx.amount)}
                  </span>
                </td>
                <td className="p-3 border border-black">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest",
                    tx.status === 'CLEARED' && "text-[#10B981]",
                    tx.status === 'PENDING' && "text-[#F59E0B]",
                    tx.status === 'BOUNCED' && "text-[#EF4444]"
                  )}>
                    {tx.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ReportSignatures signers={signerSettings.signers} />
      </div>
    </div>
  );
}
