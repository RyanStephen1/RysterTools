"""
Thread-safe Cloud-ready & Local SQLite Database Engine (database/db.py).
Enforces schema validation, explicit primary keys, foreign key indexing, and WAL mode.
"""

import sqlite3
import os
import shutil
from typing import List, Dict, Any, Optional

# Database paths
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_WORKSPACE_PATH = os.path.join(WORKSPACE_DIR, "saudi_hr.db")
DB_TMP_PATH = "/tmp/saudi_hr.db"

def is_vercel() -> bool:
    return os.environ.get("VERCEL") == "1" or os.path.exists("/tmp")

def sync_from_workspace():
    if is_vercel() and os.path.exists(DB_WORKSPACE_PATH) and not os.path.exists(DB_TMP_PATH):
        try:
            shutil.copy2(DB_WORKSPACE_PATH, DB_TMP_PATH)
        except Exception:
            pass

def sync_to_workspace():
    if is_vercel() and os.path.exists(DB_TMP_PATH):
        try:
            shutil.copy2(DB_TMP_PATH, DB_WORKSPACE_PATH)
        except Exception:
            pass

def get_db_connection() -> sqlite3.Connection:
    """Returns thread-safe connection with Row factory and WAL mode."""
    if is_vercel():
        sync_from_workspace()
        target_path = DB_TMP_PATH
    else:
        target_path = DB_WORKSPACE_PATH

    conn = sqlite3.connect(target_path, check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    """Initializes all relational ERP database tables, constraints, and indexes."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users / RBAC
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        full_name TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # Departments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        manager_name TEXT,
        budget REAL DEFAULT 0.0
    );
    """)

    # Employees Directory
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_code TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        arabic_name TEXT,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        national_id_iqama TEXT UNIQUE NOT NULL,
        nationality TEXT NOT NULL,
        gender TEXT DEFAULT 'Male',
        is_saudi INTEGER DEFAULT 1,
        dob TEXT,
        marital_status TEXT,
        religion TEXT,
        blood_group TEXT,
        department_id INTEGER,
        designation TEXT NOT NULL,
        hire_date TEXT NOT NULL,
        contract_type TEXT DEFAULT 'Fixed',
        contract_end_date TEXT,
        probation_end_date TEXT,
        border_number TEXT,
        iqama_expiry_date TEXT,
        passport_number TEXT,
        passport_expiry_date TEXT,
        work_permit_number TEXT,
        work_permit_expiry_date TEXT,
        insurance_policy_number TEXT,
        medical_insurance_category TEXT,
        medical_insurance_expiry_date TEXT,
        driving_license_number TEXT,
        driving_license_expiry_date TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        emergency_contact_relation TEXT,
        bank_name TEXT,
        iban TEXT,
        basic_salary REAL DEFAULT 0.0,
        housing_allowance REAL DEFAULT 0.0,
        transport_allowance REAL DEFAULT 0.0,
        other_allowances REAL DEFAULT 0.0,
        worker_type TEXT DEFAULT 'Direct',
        gosi_number TEXT,
        status TEXT DEFAULT 'Active',
        created_at TEXT NOT NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    );
    """)

    # Allowance Categories
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS allowance_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        code TEXT UNIQUE NOT NULL,
        is_gosi_eligible INTEGER DEFAULT 0,
        is_recurring INTEGER DEFAULT 1,
        default_amount REAL DEFAULT 0.0,
        description TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Employee Recurring / Specific Allowances
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employee_allowances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        frequency TEXT DEFAULT 'Monthly',
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES allowance_categories(id) ON DELETE RESTRICT
    );
    """)

    # Deduction Categories
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS deduction_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT,
        code TEXT UNIQUE NOT NULL,
        is_recurring INTEGER DEFAULT 1,
        default_amount REAL DEFAULT 0.0,
        description TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Employee Specific Deductions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employee_deductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        frequency TEXT DEFAULT 'Monthly',
        effective_from TEXT NOT NULL,
        effective_to TEXT,
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES deduction_categories(id) ON DELETE RESTRICT
    );
    """)

    # Salary History & Increment Audit Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS salary_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        previous_basic REAL NOT NULL,
        new_basic REAL NOT NULL,
        change_reason TEXT,
        effective_date TEXT NOT NULL,
        created_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS salary_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)

    # Suppliers / Vendors Directory
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        cr_number TEXT,
        vat_number TEXT,
        bank_name TEXT,
        iban TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        address TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Supplier Invoices & Accounts Payable
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        invoice_number TEXT,
        invoice_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        invoice_details TEXT,
        supply_date TEXT,
        supply_start_date TEXT,
        supply_end_date TEXT,
        amount REAL NOT NULL DEFAULT 0.0,
        paid_amount REAL NOT NULL DEFAULT 0.0,
        remaining_amount REAL NOT NULL DEFAULT 0.0,
        status TEXT DEFAULT 'Pending',
        payment_date TEXT,
        remarks TEXT,
        attachment_filename TEXT,
        attachment_path TEXT,
        created_at TEXT NOT NULL
    );
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supplier_payment_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_payment_id INTEGER NOT NULL,
        payment_amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT DEFAULT 'Bank Transfer',
        reference_number TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE
    );
    """)

    # Clients / Customers Directory (Accounts Receivable)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        name_ar TEXT,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        cr_number TEXT,
        vat_number TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        address TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Client Invoices & Inflow Collections (Accounts Receivable)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS client_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        client_name TEXT NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        invoice_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        invoice_details TEXT,
        service_period_start TEXT,
        service_period_end TEXT,
        subtotal REAL DEFAULT 0.0,
        vat_rate REAL DEFAULT 15.0,
        vat_amount REAL DEFAULT 0.0,
        total_amount REAL NOT NULL DEFAULT 0.0,
        collected_amount REAL NOT NULL DEFAULT 0.0,
        remaining_amount REAL NOT NULL DEFAULT 0.0,
        status TEXT DEFAULT 'Pending',
        payment_date TEXT,
        remarks TEXT,
        attachment_filename TEXT,
        attachment_path TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    );
    """)

    # Client Inbound Collection Transaction Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS client_collection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_invoice_id INTEGER NOT NULL,
        payment_amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT DEFAULT 'Bank Transfer',
        reference_number TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (client_invoice_id) REFERENCES client_invoices(id) ON DELETE CASCADE
    );
    """)
    
    # Documents
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        upload_date TEXT NOT NULL,
        expiry_date TEXT,
        notes TEXT,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)
    
    # Leaves
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days INTEGER NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'Pending',
        applied_at TEXT NOT NULL,
        approved_by TEXT,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)
    
    # Payroll Runs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payroll_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_month INTEGER NOT NULL,
        payroll_year INTEGER NOT NULL,
        total_gross REAL DEFAULT 0.0,
        total_gosi_employee REAL DEFAULT 0.0,
        total_gosi_employer REAL DEFAULT 0.0,
        total_net REAL DEFAULT 0.0,
        total_actual_pay REAL DEFAULT 0.0,
        status TEXT DEFAULT 'Draft',
        processed_at TEXT NOT NULL,
        processed_by TEXT NOT NULL
    );
    """)
    
    # Payroll Details
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payroll_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payroll_run_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        payroll_month INTEGER,
        payroll_year INTEGER,
        cutoff_period TEXT,
        worker_type TEXT DEFAULT 'Direct',
        basic_salary REAL DEFAULT 0.0,
        housing_allowance REAL DEFAULT 0.0,
        transport_allowance REAL DEFAULT 0.0,
        other_allowances REAL DEFAULT 0.0,
        days_worked INTEGER DEFAULT 30,
        daily_rate REAL DEFAULT 0.0,
        hourly_rate REAL DEFAULT 0.0,
        working_hours REAL DEFAULT 0.0,
        regular_pay REAL DEFAULT 0.0,
        ot_hours REAL DEFAULT 0.0,
        ot_rate REAL DEFAULT 0.0,
        ot_pay REAL DEFAULT 0.0,
        subtotal_pay REAL DEFAULT 0.0,
        rest_day_hours REAL DEFAULT 0.0,
        rest_day_rate REAL DEFAULT 0.0,
        rest_day_pay REAL DEFAULT 0.0,
        holiday_hours REAL DEFAULT 0.0,
        holiday_rate REAL DEFAULT 0.0,
        holiday_pay REAL DEFAULT 0.0,
        meal_allowance_qty REAL DEFAULT 0.0,
        meal_allowance_rate REAL DEFAULT 10.0,
        meal_allowance_pay REAL DEFAULT 0.0,
        adjustment_add REAL DEFAULT 0.0,
        total_pay REAL DEFAULT 0.0,
        gross_salary REAL DEFAULT 0.0,
        gosi_employee REAL DEFAULT 0.0,
        gosi_employer REAL DEFAULT 0.0,
        water_bill REAL DEFAULT 0.0,
        wps_deduction REAL DEFAULT 0.0,
        other_deductions REAL DEFAULT 0.0,
        total_deductions REAL DEFAULT 0.0,
        net_salary REAL DEFAULT 0.0,
        cash_advance REAL DEFAULT 0.0,
        adjustment_sub REAL DEFAULT 0.0,
        actual_pay REAL DEFAULT 0.0,
        remarks TEXT,
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)

    # Worker Daily Timesheets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS worker_timesheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        day INTEGER NOT NULL,
        status TEXT DEFAULT 'P',
        duty_hours REAL DEFAULT 8.0,
        ot_hours REAL DEFAULT 0.0,
        is_rest_day INTEGER DEFAULT 0,
        is_holiday INTEGER DEFAULT 0,
        has_meal INTEGER DEFAULT 0,
        remarks TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(employee_id, year, month, day),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
    """)
    
    # System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)
    
    # Create Indexes for High Performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees(department_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emp_status ON employees(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_emp ON documents(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payroll_dtl_run ON payroll_details(payroll_run_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_payroll_dtl_emp ON payroll_details(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_timesheets_emp ON worker_timesheets(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_timesheets_period ON worker_timesheets(year, month);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sp_company ON supplier_payments(company_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sp_status ON supplier_payments(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sp_logs_sp ON supplier_payment_logs(supplier_payment_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emp_allow_emp ON employee_allowances(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emp_allow_cat ON employee_allowances(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emp_ded_emp ON employee_deductions(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emp_ded_cat ON employee_deductions(category_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sal_hist_emp ON salary_history(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sal_audit_emp ON salary_audit_logs(employee_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_client_inv_client ON client_invoices(client_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_client_inv_status ON client_invoices(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_client_inv_date ON client_invoices(invoice_date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_client_logs_inv ON client_collection_logs(client_invoice_id);")

    # Seed Default Saudi Allowance Categories
    default_categories = [
        ("Food & Meal Allowance (FOOD)", "بدل إعاشة وطعام", "FOOD", 0, 1, 0.0, "Daily/Monthly meal stipend for site and operations staff"),
        ("Site / Project Location Allowance (SITE)", "بدل موقع ومشروع", "SITE", 0, 1, 0.0, "Special project or remote site deployment allowance"),
        ("Shift & Hazard Allowance (SHIFT)", "بدل مناوبة / طبيعة عمل", "SHIFT", 0, 1, 0.0, "Night shift and operational hazard compensation"),
        ("Mobile & Data Allowance (PHONE)", "بدل اتصال وهاتف", "PHONE", 0, 1, 0.0, "Mobile communication and business data allowance"),
        ("Performance & Merit Bonus (BONUS)", "مكافأة تميز وأداء", "BONUS", 0, 0, 0.0, "Special merit or performance reward"),
        ("Overtime & Extra Duty Allowance (OT)", "بدل عمل إضافي", "OT", 0, 0, 0.0, "Extra hours and holiday duty supplement")
    ]
    for name, name_ar, code, is_gosi, is_rec, def_amt, desc in default_categories:
        cursor.execute("""
            INSERT OR IGNORE INTO allowance_categories (name, name_ar, code, is_gosi_eligible, is_recurring, default_amount, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'));
        """, (name, name_ar, code, is_gosi, is_rec, def_amt, desc))

    # Seed Default Saudi Deduction Categories
    default_deduction_categories = [
        ("WPS Banking Fee (WPS)", "رسوم نظام حماية الأجور", "WPS", 0.0, 1, "Monthly WPS bank processing and transaction fee"),
        ("Water Bill / Utilities (WATER)", "فاتورة المياه والخدمات", "WATER", 0.0, 1, "Staff accommodation water, utilities, and municipality fee deduction"),
        ("Cash Advance Repayment (ADVANCE)", "سداد سلفة نقدية", "ADVANCE", 0.0, 0, "Deduction for cash advances and short-term emergency payroll loans"),
        ("Company Loan Repayment (LOAN)", "سداد قرض الشركة", "LOAN", 0.0, 1, "Monthly installment for company personal or vehicle loans"),
        ("Disciplinary / Violation Penalty (PENALTY)", "جزاءات ومخالفات لائحة العمل", "PENALTY", 0.0, 0, "Approved labor regulation disciplinary deductions and absence penalties"),
        ("Safety Gear & Uniform (UNIFORM)", "خصم زي العمل ومعدات السلامة", "UNIFORM", 0.0, 0, "PPE equipment and company uniform replacement charge"),
        ("Other General Deduction (OTHER)", "خصومات عامة أخرى", "OTHER", 0.0, 0, "Miscellaneous approved deductions")
    ]
    for name, name_ar, code, def_amt, is_rec, desc in default_deduction_categories:
        cursor.execute("""
            INSERT OR IGNORE INTO deduction_categories (name, name_ar, code, default_amount, is_recurring, description, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'));
        """, (name, name_ar, code, def_amt, is_rec, desc))

    try:
        cursor.execute("DELETE FROM allowance_categories WHERE code IN ('HRA', 'TRA');")
    except Exception:
        pass

    conn.commit()
    conn.close()
    sync_to_workspace()

def query_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def query_one(query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def execute_cmd(query: str, params: tuple = ()) -> int:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()
        last_id = cursor.lastrowid or 0
        sync_to_workspace()
        return last_id
    finally:
        conn.close()

def execute_script(script: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.executescript(script)
        conn.commit()
        sync_to_workspace()
    finally:
        conn.close()
