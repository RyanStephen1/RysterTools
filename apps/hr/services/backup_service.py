import os
import json
import zipfile
import io
import shutil
from datetime import datetime
from typing import Dict, Any, Optional

import database_cloud as db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(BASE_DIR, "uploads", "backups")

def generate_full_backup_archive() -> str:
    """
    Creates a full backup archive containing:
    1. Complete database JSON dump (all tables)
    2. SQLite database binary file
    3. Document & photo upload files
    Returns absolute file path to the generated backup zip archive.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"saudi_hr_backup_{timestamp}.zip"
    backup_dir = os.path.join(BASE_DIR, "uploads", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    
    zip_path = os.path.join(backup_dir, backup_filename)
    
    # 1. Export all Database Tables to JSON
    db_dump = {
        "version": "3.4.0",
        "export_date": datetime.now().isoformat(),
        "departments": db.query_all("SELECT * FROM departments"),
        "employees": db.query_all("SELECT * FROM employees"),
        "documents": db.query_all("SELECT * FROM documents"),
        "leaves": db.query_all("SELECT * FROM leaves"),
        "payroll_runs": db.query_all("SELECT * FROM payroll_runs"),
        "payroll_details": db.query_all("SELECT * FROM payroll_details"),
        "supplier_payments": db.query_all("SELECT * FROM supplier_payments"),
        "supplier_payment_logs": db.query_all("SELECT * FROM supplier_payment_logs"),
        "settings": db.query_all("SELECT * FROM settings"),
        "users": db.query_all("SELECT * FROM users")
    }
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add database dump JSON
        zf.writestr("database_dump.json", json.dumps(db_dump, indent=2, ensure_ascii=False))
        
        # Add SQLite db binary if present
        if os.path.exists(db.DB_WORKSPACE_PATH):
            zf.write(db.DB_WORKSPACE_PATH, arcname="saudi_hr.db")
            
        # Add uploaded photos and documents
        uploads_dir = os.path.join(BASE_DIR, "uploads")
        if os.path.exists(uploads_dir):
            for root, dirs, files in os.walk(uploads_dir):
                if "backups" in root:
                    continue # Skip backup folder itself
                for file in files:
                    full_file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_file_path, BASE_DIR)
                    zf.write(full_file_path, arcname=rel_path)
                    
    return zip_path

def restore_from_backup_dict(dump: Dict[str, Any]) -> Dict[str, Any]:
    """
    Restores the complete database state from a backup JSON dictionary.
    Uses atomic transactions to ensure data consistency.
    """
    conn = db.get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("PRAGMA foreign_keys = OFF;")
        
        # Clean existing records
        tables = [
            "supplier_payment_logs", "supplier_payments", "payroll_details",
            "payroll_runs", "leaves", "documents", "employees", "departments",
            "settings", "users"
        ]
        for t in tables:
            cursor.execute(f"DELETE FROM {t};")
            
        # Restore Departments
        for d in dump.get("departments", []):
            cursor.execute("""
                INSERT INTO departments (id, name, code, manager_name, budget)
                VALUES (?, ?, ?, ?, ?)
            """, (d.get("id"), d["name"], d["code"], d.get("manager_name"), d.get("budget", 0.0)))
            
        # Restore Employees
        for e in dump.get("employees", []):
            cursor.execute("""
                INSERT INTO employees (
                    id, emp_code, first_name, middle_name, last_name, arabic_name, email, phone,
                    national_id_iqama, nationality, gender, is_saudi, dob, marital_status, religion, blood_group,
                    department_id, designation, worker_type, hire_date, contract_type, contract_end_date,
                    probation_end_date, border_number, iqama_expiry_date, passport_number, passport_expiry_date,
                    work_permit_number, work_permit_expiry_date, insurance_policy_number, medical_insurance_category,
                    medical_insurance_expiry_date, driving_license_number, driving_license_expiry_date,
                    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
                    bank_name, iban, basic_salary, housing_allowance, transport_allowance, other_allowances,
                    gosi_number, photo_filename, status
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?
                )
            """, (
                e.get("id"), e["emp_code"], e["first_name"], e.get("middle_name"), e["last_name"], e.get("arabic_name"), e["email"], e.get("phone"),
                e["national_id_iqama"], e["nationality"], e.get("gender", "Male"), e.get("is_saudi", 1), e.get("dob"), e.get("marital_status"), e.get("religion"), e.get("blood_group"),
                e.get("department_id"), e["designation"], e.get("worker_type", "Direct"), e["hire_date"], e.get("contract_type", "Fixed"), e.get("contract_end_date"),
                e.get("probation_end_date"), e.get("border_number"), e.get("iqama_expiry_date"), e.get("passport_number"), e.get("passport_expiry_date"),
                e.get("work_permit_number"), e.get("work_permit_expiry_date"), e.get("insurance_policy_number"), e.get("medical_insurance_category"),
                e.get("medical_insurance_expiry_date"), e.get("driving_license_number"), e.get("driving_license_expiry_date"),
                e.get("emergency_contact_name"), e.get("emergency_contact_phone"), e.get("emergency_contact_relation"),
                e.get("bank_name"), e.get("iban"), e.get("basic_salary", 0.0), e.get("housing_allowance", 0.0), e.get("transport_allowance", 0.0), e.get("other_allowances", 0.0),
                e.get("gosi_number"), e.get("photo_filename"), e.get("status", "Active")
            ))
            
        # Restore Users
        for u in dump.get("users", []):
            cursor.execute("""
                INSERT INTO users (id, email, hashed_password, full_name, role, employee_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                u.get("id"), u["email"], u["hashed_password"], u["full_name"],
                u.get("role", "hr_manager"), u.get("employee_id"), u.get("created_at")
            ))
            
        # Restore Supplier Payments
        for sp in dump.get("supplier_payments", []):
            cursor.execute("""
                INSERT INTO supplier_payments (
                    id, company_name, invoice_number, invoice_date, due_date,
                    invoice_details, supply_date, supply_start_date, supply_end_date, amount, paid_amount, remaining_amount,
                    status, payment_date, remarks, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                sp.get("id"), sp["company_name"], sp.get("invoice_number"), sp["invoice_date"], sp["due_date"],
                sp.get("invoice_details"), sp.get("supply_date"), sp.get("supply_start_date") or sp.get("supply_date"),
                sp.get("supply_end_date") or sp.get("supply_date"), sp["amount"], sp.get("paid_amount", 0.0),
                sp.get("remaining_amount", sp["amount"]), sp.get("status", "Pending"),
                sp.get("payment_date"), sp.get("remarks"), sp.get("created_at")
            ))
            
        # Restore Supplier Payment Logs
        for spl in dump.get("supplier_payment_logs", []):
            cursor.execute("""
                INSERT INTO supplier_payment_logs (
                    id, supplier_payment_id, payment_amount, payment_date, payment_method, reference_number, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                spl.get("id"), spl["supplier_payment_id"], spl["payment_amount"], spl["payment_date"],
                spl.get("payment_method", "Bank Transfer"), spl.get("reference_number"), spl.get("notes"), spl.get("created_at")
            ))
            
        # Restore Documents
        for doc in dump.get("documents", []):
            cursor.execute("""
                INSERT INTO documents (id, employee_id, doc_type, file_name, file_path, upload_date, expiry_date, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                doc.get("id"), doc["employee_id"], doc["doc_type"], doc["file_name"],
                doc["file_path"], doc["upload_date"], doc.get("expiry_date"), doc.get("notes")
            ))
            
        # Restore Leaves
        for l in dump.get("leaves", []):
            cursor.execute("""
                INSERT INTO leaves (id, employee_id, leave_type, start_date, end_date, days, reason, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                l.get("id"), l["employee_id"], l["leave_type"], l["start_date"], l["end_date"],
                l["days"], l.get("reason"), l.get("status", "Pending"), l.get("created_at")
            ))
            
        # Restore Payroll Runs
        for pr in dump.get("payroll_runs", []):
            cursor.execute("""
                INSERT INTO payroll_runs (id, payroll_month, payroll_year, total_basic, total_allowances, total_deductions, total_net_pay, status, processed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pr.get("id"), pr["payroll_month"], pr["payroll_year"], pr.get("total_basic", 0.0),
                pr.get("total_allowances", 0.0), pr.get("total_deductions", 0.0), pr.get("total_net_pay", 0.0),
                pr.get("status", "Approved"), pr.get("processed_at")
            ))
            
        # Restore Payroll Details
        for pd in dump.get("payroll_details", []):
            cursor.execute("""
                INSERT INTO payroll_details (
                    id, payroll_run_id, employee_id, basic_salary, housing_allowance,
                    transport_allowance, other_allowances, gross_salary, gosi_employee,
                    gosi_employer, other_deductions, net_salary
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pd.get("id"), pd["payroll_run_id"], pd["employee_id"], pd.get("basic_salary", 0.0),
                pd.get("housing_allowance", 0.0), pd.get("transport_allowance", 0.0), pd.get("other_allowances", 0.0),
                pd.get("gross_salary", 0.0), pd.get("gosi_employee", 0.0), pd.get("gosi_employer", 0.0),
                pd.get("other_deductions", 0.0), pd.get("net_salary", 0.0)
            ))
            
        # Restore Settings
        for s in dump.get("settings", []):
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);", (s["key"], s["value"]))
            
        cursor.execute("PRAGMA foreign_keys = ON;")
        conn.commit()
        conn.close()
        db.sync_to_workspace()
        
        return {
            "status": "SUCCESS",
            "message": "Database restored successfully from backup archive.",
            "restored_tables": {
                "departments": len(dump.get("departments", [])),
                "employees": len(dump.get("employees", [])),
                "documents": len(dump.get("documents", [])),
                "leaves": len(dump.get("leaves", [])),
                "payroll_runs": len(dump.get("payroll_runs", [])),
                "supplier_payments": len(dump.get("supplier_payments", [])),
                "users": len(dump.get("users", []))
            }
        }
    except Exception as e:
        conn.rollback()
        conn.close()
        raise RuntimeError(f"Database restoration failed: {str(e)}")
