-- Saudi HR & Finance ERP System - Complete Supabase / PostgreSQL Migration Schema (v3.3)

-- 1. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    manager_name VARCHAR(255),
    budget NUMERIC(15,2) DEFAULT 0.0
);

-- 2. Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    emp_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    arabic_name VARCHAR(200),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    national_id_iqama VARCHAR(50) UNIQUE NOT NULL,
    nationality VARCHAR(100) NOT NULL,
    gender VARCHAR(20) DEFAULT 'Male',
    is_saudi INT DEFAULT 1,
    dob DATE,
    marital_status VARCHAR(50),
    religion VARCHAR(50),
    blood_group VARCHAR(10),
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    designation VARCHAR(150) NOT NULL,
    worker_type VARCHAR(50) DEFAULT 'Direct',
    hire_date DATE NOT NULL,
    contract_type VARCHAR(50) DEFAULT 'Fixed',
    contract_end_date DATE,
    probation_end_date DATE,
    border_number VARCHAR(50),
    iqama_expiry_date DATE,
    passport_number VARCHAR(50),
    passport_expiry_date DATE,
    work_permit_number VARCHAR(50),
    work_permit_expiry_date DATE,
    insurance_policy_number VARCHAR(100),
    medical_insurance_category VARCHAR(50),
    medical_insurance_expiry_date DATE,
    driving_license_number VARCHAR(50),
    driving_license_expiry_date DATE,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(50),
    emergency_contact_relation VARCHAR(50),
    bank_name VARCHAR(100),
    iban VARCHAR(50),
    basic_salary NUMERIC(12,2) DEFAULT 0.0,
    housing_allowance NUMERIC(12,2) DEFAULT 0.0,
    transport_allowance NUMERIC(12,2) DEFAULT 0.0,
    other_allowances NUMERIC(12,2) DEFAULT 0.0,
    gosi_number VARCHAR(50),
    photo_filename TEXT,
    status VARCHAR(50) DEFAULT 'Active'
);

-- 3. Users & Auth Roles Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'hr_manager', -- 'admin', 'hr_manager', 'viewer'
    employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Supplier Payment & Auto-Adjusting Balances Table
CREATE TABLE IF NOT EXISTS supplier_payments (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    invoice_details TEXT,
    supply_date DATE,
    supply_start_date DATE,
    supply_end_date DATE,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0.0,
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.0,
    remaining_amount NUMERIC(15,2) NOT NULL DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Partially Paid', 'Approved', 'Paid'
    payment_date DATE,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Supplier Payment Transaction Logs Table (Partial Payment History)
CREATE TABLE IF NOT EXISTS supplier_payment_logs (
    id SERIAL PRIMARY KEY,
    supplier_payment_id INT NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
    payment_amount NUMERIC(15,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(100) DEFAULT 'Bank Transfer',
    reference_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Documents Table
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    doc_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    upload_date DATE NOT NULL,
    expiry_date DATE,
    notes TEXT
);

-- 7. Leaves Table
CREATE TABLE IF NOT EXISTS leaves (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days INT NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Payroll Runs Table
CREATE TABLE IF NOT EXISTS payroll_runs (
    id SERIAL PRIMARY KEY,
    payroll_month INT NOT NULL,
    payroll_year INT NOT NULL,
    total_basic NUMERIC(15,2) DEFAULT 0.0,
    total_allowances NUMERIC(15,2) DEFAULT 0.0,
    total_deductions NUMERIC(15,2) DEFAULT 0.0,
    total_net_pay NUMERIC(15,2) DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'Approved',
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Payroll Details Table
CREATE TABLE IF NOT EXISTS payroll_details (
    id SERIAL PRIMARY KEY,
    payroll_run_id INT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    basic_salary NUMERIC(12,2) DEFAULT 0.0,
    housing_allowance NUMERIC(12,2) DEFAULT 0.0,
    transport_allowance NUMERIC(12,2) DEFAULT 0.0,
    other_allowances NUMERIC(12,2) DEFAULT 0.0,
    gross_salary NUMERIC(12,2) DEFAULT 0.0,
    gosi_employee NUMERIC(12,2) DEFAULT 0.0,
    gosi_employer NUMERIC(12,2) DEFAULT 0.0,
    other_deductions NUMERIC(12,2) DEFAULT 0.0,
    net_salary NUMERIC(12,2) DEFAULT 0.0
);

-- 10. System Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL
);

-- Seed Default Corporate Settings
INSERT INTO settings (key, value) VALUES
('company_name', 'Al-Amal Enterprise Solutions KSA'),
('company_arabic_name', 'شركة الأمل لترشيد الحلول المتكاملة'),
('cr_number', '1010894512'),
('mol_establishment_id', '7-889412'),
('gosi_reg_number', '309481920'),
('wps_bank_code', 'RIBL'),
('wps_bank_name', 'Riyad Bank'),
('hr_email', 'hr@alamal-ksa.com'),
('address', 'King Fahd Road, Olaya District, Riyadh, Saudi Arabia')
ON CONFLICT (key) DO NOTHING;

-- Seed Default Admin User Account (Email: admin@alamal-ksa.com | Password: AdminSecret123!)
INSERT INTO users (email, hashed_password, full_name, role)
VALUES ('admin@alamal-ksa.com', '00773929baac4cbc:6b1a1b85387d469e09aa9d3e41994d8f042ab0ae5e6473c78cbe8667f4161582', 'System Administrator', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Disable Row Level Security (RLS) so FastAPI server access is never blocked
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payment_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE leaves DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_details DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
