import os
import io
import csv
import uuid
import json
import zipfile
import shutil
import tempfile
import calendar
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any

import openpyxl
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.responses import FileResponse, Response, StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

from core.config import get_company_settings, DEFAULT_COMPANY_NAME, DEFAULT_CR_NUMBER, DEFAULT_VAT_NUMBER
from core.security import SecuritySanitizer
from core import auth
from database import db
from services.backup_service import generate_full_backup_archive, restore_from_backup_dict
from models import (
    DepartmentCreate, DepartmentUpdate, EmployeeCreate, EmployeeUpdate,
    LeaveCreate, LeaveStatusUpdate, EOSBRequest, GOSIRequest, PayrollRunRequest,
    WorkerMonthlyPayRequest, SupplierCreate, SupplierUpdate, SupplierPaymentCreate,
    SupplierPaymentStatusUpdate, SupplierDisburseRequest, BackupRestoreRequest,
    DailyTimesheetEntry, BulkTimesheetSaveRequest,
    AllowanceCategoryCreate, AllowanceCategoryUpdate, EmployeeAllowanceCreate,
    EmployeeAllowanceUpdate, SalaryAdjustmentCreate, DirectSalaryUpdate,
    DeductionCategoryCreate, DeductionCategoryUpdate, EmployeeDeductionCreate,
    EmployeeDeductionUpdate,
    ClientCreate, ClientUpdate, ClientInvoiceCreate, ClientInvoiceUpdate, ClientCollectionLogCreate
)
from services.hr_engine import SaudiHREngine, CompensationEngine
from services.collections_engine import ClientCollectionEngine
from services.pdf_service import (
    generate_payslip_pdf, generate_supplier_statement_pdf,
    generate_supplier_summary_report_pdf, generate_monthly_payroll_schedule_pdf,
    DocumentService
)

# Initialize DB schema & indexes
db.init_db()

app = FastAPI(
    title="Saudi HR & SME Finance ERP System",
    description="Production-grade Saudi HR, Payroll & Finance ERP System with Accounts Payable, Vendor Ledgers, and SAMA WPS Engine",
    version="3.5.0"
)

# Enable CORS for web portal
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OWASP Security Headers Middleware (erp-security)
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

BASE_DIR = os.path.dirname(__file__)

if db.is_vercel():
    UPLOADS_PHOTOS_DIR = os.path.join(tempfile.gettempdir(), "photos")
    UPLOADS_DOCS_DIR = os.path.join(tempfile.gettempdir(), "documents")
    UPLOADS_BACKUPS_DIR = os.path.join(tempfile.gettempdir(), "backups")
    UPLOADS_INVOICES_DIR = os.path.join(tempfile.gettempdir(), "supplier_invoices")
else:
    UPLOADS_PHOTOS_DIR = os.path.join(BASE_DIR, "uploads", "photos")
    UPLOADS_DOCS_DIR = os.path.join(BASE_DIR, "uploads", "documents")
    UPLOADS_BACKUPS_DIR = os.path.join(BASE_DIR, "uploads", "backups")
    UPLOADS_INVOICES_DIR = os.path.join(BASE_DIR, "uploads", "supplier_invoices")

os.makedirs(UPLOADS_PHOTOS_DIR, exist_ok=True)
os.makedirs(UPLOADS_DOCS_DIR, exist_ok=True)
os.makedirs(UPLOADS_BACKUPS_DIR, exist_ok=True)
os.makedirs(UPLOADS_INVOICES_DIR, exist_ok=True)

# Mount static and uploads
static_dir = os.path.join(BASE_DIR, "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

uploads_dir = os.path.join(BASE_DIR, "uploads")
if os.path.exists(uploads_dir):
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/favicon.ico")
def get_favicon():
    ico_path = os.path.join(BASE_DIR, "static", "favicon.ico")
    if os.path.exists(ico_path):
        return FileResponse(ico_path, media_type="image/x-icon")
    svg_path = os.path.join(BASE_DIR, "static", "favicon.svg")
    if os.path.exists(svg_path):
        return FileResponse(svg_path, media_type="image/svg+xml")
    return Response(status_code=204)

@app.get("/logo.svg")
def get_logo():
    logo_path = os.path.join(BASE_DIR, "static", "logo.svg")
    if os.path.exists(logo_path):
        return FileResponse(logo_path, media_type="image/svg+xml")
    return Response(status_code=404)

class LoginRequest(BaseModel):
    email: str
    password: str

class UserCreateRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "viewer"

class UserUpdateRequest(BaseModel):
    email: str
    full_name: str
    role: str
    password: Optional[str] = None

# Dependency for Authenticated Requests (Supports both Bearer Header and Query Token for PDF/File downloads)
def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ")[1]
    elif token and token.strip():
        raw_token = token.strip()
        
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication required. Please log in first.")
        
    payload = auth.verify_jwt_token(raw_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired JWT session. Please log in again.")
    return payload

# Role Checker Dependency
def require_roles(allowed_roles: List[str]):
    def role_checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=403, detail="Permission denied. Your role does not have access to this feature.")
        return user
    return role_checker

# --- UI Root Route ---
@app.get("/", response_class=HTMLResponse)
def read_root():
    index_path = os.path.join(BASE_DIR, "static", "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Saudi HR ERP System Running</h1>"

@app.post("/api/auth/login")
def login(req: LoginRequest):
    input_email = req.email.strip()
    if input_email.lower() in ["admin", "administrator"]:
        user = db.query_one("SELECT * FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
    else:
        user = db.query_one("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (input_email,))
        
    if not user or not auth.verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    token = auth.create_jwt_token({
        "user_id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"]
    })
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

@app.get("/api/auth/me")
def get_me(user: dict = Depends(get_current_user)):
    return user

@app.get("/api/users")
def list_users(user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    return db.query_all("SELECT id, email, full_name, role, created_at FROM users ORDER BY id DESC")

@app.post("/api/users")
def create_user_account(req: UserCreateRequest, user: dict = Depends(require_roles(["admin"]))):
    existing = db.query_one("SELECT id FROM users WHERE email = ?", (req.email,))
    if existing:
        raise HTTPException(status_code=400, detail="User account with this email already exists.")
        
    hashed_pwd = auth.hash_password(req.password)
    u_id = db.execute_cmd("""
        INSERT INTO users (email, hashed_password, full_name, role, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (req.email, hashed_pwd, req.full_name, req.role, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    
    return {"message": f"User account for {req.full_name} ({req.role}) created successfully", "id": u_id}

@app.put("/api/users/{user_id}")
def update_user_account(user_id: int, req: UserUpdateRequest, user: dict = Depends(require_roles(["admin"]))):
    existing = db.query_one("SELECT id FROM users WHERE id = ?", (user_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="User account not found.")
        
    # Check duplicate email
    dup = db.query_one("SELECT id FROM users WHERE email = ? AND id != ?", (req.email, user_id))
    if dup:
        raise HTTPException(status_code=400, detail="Email address is already in use by another user.")
        
    if req.password and req.password.strip():
        hashed_pwd = auth.hash_password(req.password.strip())
        db.execute_cmd("""
            UPDATE users SET email = ?, full_name = ?, role = ?, hashed_password = ? WHERE id = ?
        """, (req.email, req.full_name, req.role, hashed_pwd, user_id))
    else:
        db.execute_cmd("""
            UPDATE users SET email = ?, full_name = ?, role = ? WHERE id = ?
        """, (req.email, req.full_name, req.role, user_id))
        
    return {"message": f"User credentials for {req.full_name} updated successfully"}

@app.delete("/api/users/{user_id}")
def delete_user_account(user_id: int, user: dict = Depends(require_roles(["admin"]))):
    if user["user_id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own active administrator account.")
        
    db.execute_cmd("DELETE FROM users WHERE id = ?", (user_id,))
    return {"message": "User account deleted successfully"}

# --- Dashboard Overview Endpoint ---
@app.get("/api/dashboard/stats")
def get_dashboard_stats(user: dict = Depends(get_current_user)):
    employees = db.query_all("SELECT * FROM employees WHERE status = 'Active'")
    total_emp = len(employees)
    saudi_emp = sum(1 for e in employees if e["is_saudi"] == 1)
    expat_emp = total_emp - saudi_emp
    
    saudization_info = SaudiHREngine.calculate_saudization(total_emp, saudi_emp)
    total_payroll = sum((e["basic_salary"] + e["housing_allowance"] + e["transport_allowance"] + e["other_allowances"]) for e in employees)
    
    pending_leaves_row = db.query_one("SELECT COUNT(*) as cnt FROM leaves WHERE status = 'Pending'")
    pending_leaves = pending_leaves_row["cnt"] if pending_leaves_row else 0
    
    alerts = SaudiHREngine.check_expiries(employees, threshold_days=60)
    
    depts = db.query_all("""
        SELECT d.name, COUNT(e.id) as emp_count
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'Active'
        GROUP BY d.id
    """)
    
    pending_sp_row = db.query_one("SELECT SUM(remaining_amount) as tot FROM supplier_payments WHERE status != 'Paid'")
    pending_supplier_pay = float(pending_sp_row["tot"]) if pending_sp_row and pending_sp_row["tot"] is not None else 0.0
    
    return {
        "total_employees": total_emp,
        "saudi_employees": saudi_emp,
        "expat_employees": expat_emp,
        "saudization": saudization_info,
        "total_monthly_payroll": total_payroll if user["role"] in ["admin", "hr_manager"] else 0.0,
        "pending_supplier_payables": pending_supplier_pay if user["role"] in ["admin", "hr_manager"] else 0.0,
        "pending_leaves_count": pending_leaves,
        "expiring_alerts_count": len(alerts),
        "alerts_summary": alerts[:5],
        "department_distribution": depts
    }

# --- Departments Endpoints ---
@app.get("/api/departments")
def get_departments(user: dict = Depends(get_current_user)):
    return db.query_all("""
        SELECT d.*, COUNT(e.id) as employee_count 
        FROM departments d 
        LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'Active'
        GROUP BY d.id
        ORDER BY d.name ASC
    """)

@app.post("/api/departments")
def create_department(dept: DepartmentCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM departments WHERE code = ?", (dept.code,))
    if existing:
        raise HTTPException(status_code=400, detail=f"Department with code '{dept.code}' already exists.")
        
    d_id = db.execute_cmd(
        "INSERT INTO departments (name, code, manager_name, budget) VALUES (?, ?, ?, ?)",
        (dept.name, dept.code, dept.manager_name, dept.budget or 0.0)
    )
    return {"message": "Department created successfully", "id": d_id}

@app.put("/api/departments/{dept_id}")
def update_department(dept_id: int, dept: DepartmentUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM departments WHERE id = ?", (dept_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Department not found.")
        
    dup = db.query_one("SELECT id FROM departments WHERE code = ? AND id != ?", (dept.code, dept_id))
    if dup:
        raise HTTPException(status_code=400, detail=f"Department code '{dept.code}' is already used by another department.")
        
    db.execute_cmd("""
        UPDATE departments SET name = ?, code = ?, manager_name = ?, budget = ? WHERE id = ?
    """, (dept.name, dept.code, dept.manager_name, dept.budget or 0.0, dept_id))
    return {"message": "Department updated successfully"}

@app.delete("/api/departments/{dept_id}")
def delete_department(dept_id: int, user: dict = Depends(require_roles(["admin"]))):
    existing = db.query_one("SELECT id FROM departments WHERE id = ?", (dept_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Department not found.")
        
    db.execute_cmd("UPDATE employees SET department_id = NULL WHERE department_id = ?", (dept_id,))
    db.execute_cmd("DELETE FROM departments WHERE id = ?", (dept_id,))
    return {"message": "Department deleted successfully"}

# --- Employee Masterlist Parser & Date Normalizer ---
def parse_date_flexible(val: Any) -> Optional[str]:
    """Converts diverse date inputs (Excel datetime, int serial, date strings) to 'YYYY-MM-DD'."""
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, (int, float)):
        try:
            # Excel serial number date
            dt = datetime(1899, 12, 30) + timedelta(days=float(val))
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    raw = str(val).strip()
    if not raw or raw.lower() in ("-", "n/a", "none", "null", ""):
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    try:
        if len(raw) >= 10:
            return datetime.strptime(raw[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
    except Exception:
        pass
    return raw

def parse_float_safe(val: Any, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        s = str(val).replace(",", "").replace("SAR", "").replace("sar", "").strip()
        return float(s) if s else default
    except Exception:
        return default

# --- Employee Endpoints ---
@app.get("/api/employees")
def list_employees(
    search: Optional[str] = None,
    department_id: Optional[int] = None,
    is_saudi: Optional[int] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = "hire_date",
    sort_order: Optional[str] = "asc",
    user: dict = Depends(get_current_user)
):
    sql = """
        SELECT e.*, d.name as department_name 
        FROM employees e 
        LEFT JOIN departments d ON e.department_id = d.id 
        WHERE 1=1
    """
    params = []
    
    if search:
        sql += " AND (e.first_name LIKE ? OR e.middle_name LIKE ? OR e.last_name LIKE ? OR e.arabic_name LIKE ? OR e.emp_code LIKE ? OR e.national_id_iqama LIKE ? OR e.passport_number LIKE ? OR e.work_permit_number LIKE ? OR e.email LIKE ?)"
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern])
        
    if department_id:
        sql += " AND e.department_id = ?"
        params.append(department_id)
        
    if is_saudi is not None:
        sql += " AND e.is_saudi = ?"
        params.append(is_saudi)
        
    if status:
        sql += " AND e.status = ?"
        params.append(status)
        
    # Whitelist sort column & order
    sort_col_map = {
        "hire_date": "e.hire_date",
        "joining_date": "e.hire_date",
        "emp_code": "e.emp_code",
        "first_name": "e.first_name",
        "last_name": "e.last_name",
        "name": "e.first_name",
        "basic_salary": "e.basic_salary",
        "iqama_expiry_date": "e.iqama_expiry_date",
        "passport_expiry_date": "e.passport_expiry_date",
        "department_name": "department_name",
        "status": "e.status",
        "id": "e.id"
    }
    col = sort_col_map.get(str(sort_by).lower(), "e.hire_date")
    order = "DESC" if str(sort_order).upper() == "DESC" else "ASC"
    
    sql += f" ORDER BY {col} {order}, e.id ASC"
    results = db.query_all(sql, tuple(params))
    
    allow_map = {}
    for a in db.query_all("""
        SELECT ea.employee_id, ac.code, SUM(ea.amount) as tot
        FROM employee_allowances ea
        JOIN allowance_categories ac ON ea.category_id = ac.id
        WHERE ea.is_active = 1
        GROUP BY ea.employee_id, ac.code
    """):
        emp_key = a["employee_id"]
        if emp_key not in allow_map:
            allow_map[emp_key] = {}
        allow_map[emp_key][a["code"]] = float(a["tot"])
        
    ded_map = {}
    for d in db.query_all("""
        SELECT ed.employee_id, SUM(ed.amount) as tot
        FROM employee_deductions ed
        WHERE ed.is_active = 1
        GROUP BY ed.employee_id
    """):
        ded_map[d["employee_id"]] = float(d["tot"])
        
    for r in results:
        r_allows = allow_map.get(r["id"], {})
        r["meal_allowance"] = r_allows.get("FOOD", 0.0)
        r["site_allowance"] = r_allows.get("SITE", 0.0)
        r["housing_allowance"] = 0.0
        r["transport_allowance"] = 0.0
        r["active_deductions"] = ded_map.get(r["id"], 0.0)
        b_sal = float(r.get("basic_salary") or 0.0)
        r["gross_salary"] = b_sal + r["meal_allowance"] + r["site_allowance"] + float(r.get("other_allowances") or 0.0)

    if user["role"] == "viewer":
        for r in results:
            r["basic_salary"] = 0.0
            r["meal_allowance"] = 0.0
            r["site_allowance"] = 0.0
            r["housing_allowance"] = 0.0
            r["transport_allowance"] = 0.0
            r["other_allowances"] = 0.0
            r["gross_salary"] = 0.0
            
    return results

@app.get("/api/employees/template.xlsx")
def download_employee_template_excel(user: dict = Depends(get_current_user)):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employees Masterlist"
    
    headers = [
        "Employee Code", "First Name", "Middle Name", "Last Name", "Arabic Full Name",
        "National ID / Iqama", "Iqama Expiry Date", "Passport Number", "Passport Expiry Date",
        "Qiwa Work Permit No", "Work Permit Expiry Date", "Date of Joining (Hire Date)",
        "Department", "Designation", "Worker Classification (Direct/Indirect)", "Contract Type",
        "Nationality", "Is Saudi Citizen (1=Yes, 0=No)", "Gender", "Date of Birth", "Marital Status",
        "Religion", "Blood Group", "Basic Salary (SAR)", "Housing Allowance", "Transport Allowance",
        "Other Allowances", "Bank Name", "IBAN Number", "GOSI Number", "Email Address", "Phone Number",
        "Medical Insurance Policy", "Insurance Category", "Insurance Expiry Date", "Driving License No",
        "Driving License Expiry", "Emergency Contact Name", "Emergency Relationship", "Emergency Phone", "Status"
    ]
    ws.append(headers)
    
    sample_row1 = [
        "EMP-001", "Mohammed", "Abdullah", "Al-Otaibi", "محمد عبدالله العتيبي",
        "1098765432", "2028-12-31", "A9841029", "2029-05-15",
        "WP-KSA-908124", "2028-12-31", "2019-03-01",
        "Engineering & Technology", "Lead Software Architect", "Direct", "Indefinite",
        "Saudi Arabia", 1, "Male", "1988-04-12", "Married",
        "Muslim", "O+", 18000.0, 4500.0, 1500.0,
        1000.0, "Al Rajhi Bank", "SA0380000000608010167519", "304918201", "m.otaibi@alamal-ksa.com", "+966501234567",
        "BUPA-KSA-88491", "Class VIP", "2027-04-30", "DL-1098765432",
        "2029-10-15", "Abdullah Al-Otaibi", "Father", "+966509876543", "Active"
    ]
    sample_row2 = [
        "EMP-002", "Rahul", "Kumar", "Sharma", "راهول كومار شارما",
        "2391029384", "2027-08-30", "Z8910293", "2028-06-15",
        "QIWA-WP-2026-881", "2027-08-30", "2021-01-10",
        "Engineering & Technology", "Senior DevOps Engineer", "Direct", "Fixed",
        "India", 0, "Male", "1985-11-03", "Married",
        "Hindu", "B+", 14000.0, 3500.0, 1000.0,
        500.0, "Saudi National Bank (SNB)", "SA4410000000123456789012", "908127364", "rahul.sharma@alamal-ksa.com", "+966541122334",
        "MEDGULF-99401", "Class B", "2027-09-30", "DL-2391029384",
        "2027-08-14", "Pooja Sharma", "Spouse", "+966549988776", "Active"
    ]
    ws.append(sample_row1)
    ws.append(sample_row2)
    
    # Auto column width
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 14)
        
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Employees_Masterlist_Template.xlsx"}
    )

@app.get("/api/employees/template.csv")
def download_employee_template_csv(user: dict = Depends(get_current_user)):
    out = io.StringIO()
    writer = csv.writer(out)
    headers = [
        "Employee Code", "First Name", "Middle Name", "Last Name", "Arabic Full Name",
        "National ID / Iqama", "Iqama Expiry Date", "Passport Number", "Passport Expiry Date",
        "Qiwa Work Permit No", "Work Permit Expiry Date", "Date of Joining (Hire Date)",
        "Department", "Designation", "Worker Classification (Direct/Indirect)", "Contract Type",
        "Nationality", "Is Saudi Citizen", "Gender", "Date of Birth", "Marital Status",
        "Religion", "Blood Group", "Basic Salary", "Housing Allowance", "Transport Allowance",
        "Other Allowances", "Bank Name", "IBAN Number", "GOSI Number", "Email Address", "Phone Number",
        "Medical Insurance Policy", "Insurance Category", "Insurance Expiry Date", "Driving License No",
        "Driving License Expiry", "Emergency Contact Name", "Emergency Relationship", "Emergency Phone", "Status"
    ]
    writer.writerow(headers)
    writer.writerow([
        "EMP-001", "Mohammed", "Abdullah", "Al-Otaibi", "محمد عبدالله العتيبي",
        "1098765432", "2028-12-31", "A9841029", "2029-05-15",
        "WP-KSA-908124", "2028-12-31", "2019-03-01",
        "Engineering & Technology", "Lead Software Architect", "Direct", "Indefinite",
        "Saudi Arabia", "1", "Male", "1988-04-12", "Married",
        "Muslim", "O+", "18000.0", "4500.0", "1500.0",
        "1000.0", "Al Rajhi Bank", "SA0380000000608010167519", "304918201", "m.otaibi@alamal-ksa.com", "+966501234567",
        "BUPA-KSA-88491", "Class VIP", "2027-04-30", "DL-1098765432",
        "2029-10-15", "Abdullah Al-Otaibi", "Father", "+966509876543", "Active"
    ])
    
    return Response(
        content=out.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=Employees_Masterlist_Template.csv"}
    )

@app.post("/api/employees/import-masterlist")
async def import_employee_masterlist(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Imports and populates the employee directory from an Excel (.xlsx/.xls) or CSV masterlist.
    Automatically parses all columns, normalizes joining/expiry dates, maps departments,
    and sorts the population based on Joining Date (Hire Date).
    """
    rows_data: List[Dict[str, Any]] = []
    
    if file:
        contents = await file.read()
        fn = file.filename.lower()
        if fn.endswith(".xlsx") or fn.endswith(".xls"):
            wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
            sheet = wb.active
            headers = []
            for cell in sheet[1]:
                headers.append(str(cell.value or "").strip().lower())
            for row in sheet.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                row_dict = {}
                for h, v in zip(headers, row):
                    if h:
                        row_dict[h] = v
                rows_data.append(row_dict)
        else:
            text = contents.decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            for r in reader:
                if any(r.values()):
                    rows_data.append({str(k).strip().lower(): v for k, v in r.items() if k})
    elif raw_text and raw_text.strip():
        reader = csv.DictReader(io.StringIO(raw_text.strip()))
        for r in reader:
            if any(r.values()):
                rows_data.append({str(k).strip().lower(): v for k, v in r.items() if k})
    else:
        raise HTTPException(status_code=400, detail="Please upload an Excel/CSV file or paste masterlist text.")

    if not rows_data:
        raise HTTPException(status_code=400, detail="No employee rows found in the uploaded masterlist.")

    # Helper function to find value by matching multiple possible header variations
    def get_matched_val(row: dict, keys: List[str], default=None):
        for k in keys:
            k_clean = k.lower().replace(" ", "").replace("_", "").replace("-", "")
            for r_key, r_val in row.items():
                r_clean = str(r_key).lower().replace(" ", "").replace("_", "").replace("-", "")
                if r_clean == k_clean:
                    if r_val is not None and str(r_val).strip() not in ("", "none", "null", "n/a", "-"):
                        return r_val
        return default

    # Pre-fetch existing departments
    dept_rows = db.query_all("SELECT id, name, code FROM departments")
    dept_map = {d["name"].strip().lower(): d["id"] for d in dept_rows}
    dept_map.update({d["code"].strip().lower(): d["id"] for d in dept_rows})

    parsed_employees = []
    
    for idx, r in enumerate(rows_data, 1):
        # 1. Name parsing
        first_name = get_matched_val(r, ["first_name", "firstname", "first", "fname", "given_name"])
        middle_name = get_matched_val(r, ["middle_name", "middlename", "middle", "second_name", "mname"])
        last_name = get_matched_val(r, ["last_name", "lastname", "last", "family_name", "surname", "lname"])
        
        if not first_name:
            # Fallback to combined name column
            full_n = get_matched_val(r, ["name", "full_name", "employee_name", "emp_name", "staff_name"])
            if full_n:
                parts = str(full_n).strip().split()
                if len(parts) == 1:
                    first_name = parts[0]
                    last_name = parts[0]
                elif len(parts) == 2:
                    first_name = parts[0]
                    last_name = parts[1]
                else:
                    first_name = parts[0]
                    middle_name = parts[1]
                    last_name = " ".join(parts[2:])
            else:
                first_name = f"Employee-{idx}"
                last_name = "Staff"
        if not last_name:
            last_name = "Staff"
            
        arabic_name = get_matched_val(r, ["arabic_name", "arabic", "name_arabic", "arabic_full_name", "الاسم بالعربي", "الاسم"])

        # 2. Codes & National IDs
        emp_code = get_matched_val(r, ["emp_code", "employee_code", "code", "emp_id", "id", "employee_id", "emp#", "badge#"])
        if not emp_code:
            emp_code = f"EMP-{100 + idx:03d}"
        else:
            emp_code = str(emp_code).strip()

        national_id = get_matched_val(r, ["national_id_iqama", "iqama", "iqama_no", "iqama_number", "national_id", "id_number", "id_no", "رقم الهوية", "رقم الإقامة"])
        if not national_id:
            national_id = f"19{idx:08d}" if "saudi" in str(get_matched_val(r, ["nationality", "country"], "saudi")).lower() else f"29{idx:08d}"
        else:
            national_id = str(national_id).strip()

        # 3. Joining / Hire Date (CRITICAL)
        joining_date = parse_date_flexible(get_matched_val(r, [
            "hire_date", "joining_date", "join_date", "date_of_joining", "start_date", "hired_date",
            "joining", "hired_on", "تاريخ الالتحاق", "تاريخ المباشرة", "تاريخ التعيين"
        ])) or date.today().strftime("%Y-%m-%d")

        # 4. Department auto-matching / creation
        dept_name_raw = get_matched_val(r, ["department", "dept", "department_name", "dept_name", "القسم", "الإدارة"])
        dept_id = None
        if dept_name_raw:
            d_clean = str(dept_name_raw).strip().lower()
            if d_clean in dept_map:
                dept_id = dept_map[d_clean]
            else:
                # Auto-create department
                d_name_real = str(dept_name_raw).strip()
                d_code_cand = "".join([w[0] for w in d_name_real.split() if w])[:6].upper() or f"DEP{len(dept_map)+1}"
                new_d_id = db.execute_cmd("INSERT INTO departments (name, code, budget) VALUES (?, ?, ?)", (d_name_real, d_code_cand, 100000.0))
                dept_map[d_clean] = new_d_id
                dept_id = new_d_id

        # 5. Designation & Worker Classification
        designation = get_matched_val(r, ["designation", "job_title", "position", "role", "title", "occupation", "المسمى الوظيفي", "المهنة"], "Technician / Staff")
        wt_raw = str(get_matched_val(r, ["worker_type", "type", "classification", "direct_indirect"], "Direct")).strip().lower()
        worker_type = "Indirect" if "indirect" in wt_raw or "hourly" in wt_raw else "Direct"

        # 6. Saudi Citizen & Nationality
        nat_val = str(get_matched_val(r, ["nationality", "country", "الجنسية"], "Saudi Arabia")).strip()
        is_saudi_raw = get_matched_val(r, ["is_saudi", "saudi", "citizen", "سعودي"])
        if is_saudi_raw is not None:
            is_saudi = 1 if str(is_saudi_raw).strip() in ("1", "true", "yes", "saudi", "نعم") else 0
        else:
            is_saudi = 1 if "saudi" in nat_val.lower() else 0

        # 7. Expiries & Legal Documents
        iqama_exp = parse_date_flexible(get_matched_val(r, ["iqama_expiry_date", "iqama_expiry", "iqama_exp", "تاريخ انتهاء الإقامة"]))
        passport_num = get_matched_val(r, ["passport_number", "passport_no", "passport", "رقم الجواز"])
        passport_exp = parse_date_flexible(get_matched_val(r, ["passport_expiry_date", "passport_expiry", "passport_exp", "تاريخ انتهاء الجواز"]))
        work_permit_num = get_matched_val(r, ["work_permit_number", "work_permit_no", "qiwa_work_permit", "رخصة العمل"])
        work_permit_exp = parse_date_flexible(get_matched_val(r, ["work_permit_expiry_date", "work_permit_exp", "انتهاء رخصة العمل"]))
        ins_policy = get_matched_val(r, ["insurance_policy_number", "insurance_policy", "insurance_no", "رقم التأمين"])
        ins_cat = get_matched_val(r, ["medical_insurance_category", "insurance_category", "insurance_class", "فئة التأمين"])
        ins_exp = parse_date_flexible(get_matched_val(r, ["medical_insurance_expiry_date", "insurance_expiry", "انتهاء التأمين"]))
        dl_num = get_matched_val(r, ["driving_license_number", "driving_license_no", "driving_license", "رخصة القيادة"])
        dl_exp = parse_date_flexible(get_matched_val(r, ["driving_license_expiry_date", "driving_license_exp", "انتهاء رخصة القيادة"]))
        border_num = get_matched_val(r, ["border_number", "border_no", "border", "رقم الحدود"])
        contract_type = get_matched_val(r, ["contract_type", "contract", "نوع العقد"], "Fixed")
        contract_end = parse_date_flexible(get_matched_val(r, ["contract_end_date", "contract_end", "انتهاء العقد"]))
        probation_end = parse_date_flexible(get_matched_val(r, ["probation_end_date", "probation_end", "انتهاء التجربة"]))

        # 8. Bio Data
        dob = parse_date_flexible(get_matched_val(r, ["dob", "birth_date", "date_of_birth", "تاريخ الميلاد"]))
        gender = get_matched_val(r, ["gender", "sex", "الجنس"], "Male")
        marital_status = get_matched_val(r, ["marital_status", "marital", "الحالة الاجتماعية"], "Single")
        religion = get_matched_val(r, ["religion", "الديانة"])
        blood_group = get_matched_val(r, ["blood_group", "blood", "فصيلة الدم"])
        phone = get_matched_val(r, ["phone", "phone_number", "mobile", "contact_no", "الجوال", "الهاتف"])
        email = get_matched_val(r, ["email", "email_address", "mail"]) or f"{emp_code.lower().replace('-', '')}@alamal-ksa.com"

        basic_sal = parse_float_safe(get_matched_val(r, ["basic_salary", "basic", "basic_pay", "salary", "base_salary", "الراتب الأساسي"]), 0.0)
        housing = parse_float_safe(get_matched_val(r, ["housing_allowance", "housing", "house_allowance", "بدل سكن"]), 0.0)
        transport = parse_float_safe(get_matched_val(r, ["transport_allowance", "transport", "trans_allowance", "بدل نقل"]), 0.0)
        other = parse_float_safe(get_matched_val(r, ["other_allowances", "other", "allowances", "بدلات أخرى"]), 0.0)
        bank_name = get_matched_val(r, ["bank_name", "bank", "اسم البنك"])
        iban = get_matched_val(r, ["iban", "iban_number", "account_number", "الآيبان"])
        gosi_num = get_matched_val(r, ["gosi_number", "gosi_no", "gosi", "التأمينات"])

        # 10. Emergency Contact
        emg_name = get_matched_val(r, ["emergency_contact_name", "emergency_contact", "emergency_name"])
        emg_rel = get_matched_val(r, ["emergency_contact_relation", "emergency_relation"])
        emg_phone = get_matched_val(r, ["emergency_contact_phone", "emergency_phone"])
        status = get_matched_val(r, ["status", "state", "الحالة"], "Active")

        parsed_employees.append({
            "emp_code": str(emp_code),
            "first_name": str(first_name),
            "middle_name": str(middle_name) if middle_name else None,
            "last_name": str(last_name),
            "arabic_name": str(arabic_name) if arabic_name else None,
            "email": str(email),
            "phone": str(phone) if phone else None,
            "national_id_iqama": str(national_id),
            "nationality": str(nat_val),
            "gender": str(gender),
            "is_saudi": is_saudi,
            "dob": dob,
            "marital_status": marital_status,
            "religion": religion,
            "blood_group": blood_group,
            "department_id": dept_id,
            "designation": str(designation),
            "worker_type": worker_type,
            "hire_date": joining_date,
            "contract_type": str(contract_type),
            "contract_end_date": contract_end,
            "probation_end_date": probation_end,
            "border_number": str(border_num) if border_num else None,
            "iqama_expiry_date": iqama_exp,
            "passport_number": str(passport_num) if passport_num else None,
            "passport_expiry_date": passport_exp,
            "work_permit_number": str(work_permit_num) if work_permit_num else None,
            "work_permit_expiry_date": work_permit_exp,
            "insurance_policy_number": str(ins_policy) if ins_policy else None,
            "medical_insurance_category": str(ins_cat) if ins_cat else None,
            "medical_insurance_expiry_date": ins_exp,
            "driving_license_number": str(dl_num) if dl_num else None,
            "driving_license_expiry_date": dl_exp,
            "emergency_contact_name": str(emg_name) if emg_name else None,
            "emergency_contact_phone": str(emg_phone) if emg_phone else None,
            "emergency_contact_relation": str(emg_rel) if emg_rel else None,
            "bank_name": str(bank_name) if bank_name else None,
            "iban": str(iban) if iban else None,
            "basic_salary": basic_sal,
            "housing_allowance": housing,
            "transport_allowance": transport,
            "other_allowances": other,
            "gosi_number": str(gosi_num) if gosi_num else None,
            "status": str(status)
        })

    # SORT BY JOINING DATE (HIRE_DATE)
    parsed_employees.sort(key=lambda x: str(x.get("hire_date") or "9999-99-99"))

    created_count = 0
    updated_count = 0

    for emp in parsed_employees:
        existing = db.query_one("SELECT id FROM employees WHERE emp_code = ? OR national_id_iqama = ?", (emp["emp_code"], emp["national_id_iqama"]))
        if existing:
            emp["id"] = existing["id"]
            db.execute_cmd("""
                UPDATE employees SET
                    first_name = :first_name,
                    middle_name = :middle_name,
                    last_name = :last_name,
                    arabic_name = :arabic_name,
                    email = :email,
                    phone = :phone,
                    national_id_iqama = :national_id_iqama,
                    nationality = :nationality,
                    gender = :gender,
                    is_saudi = :is_saudi,
                    dob = :dob,
                    marital_status = :marital_status,
                    religion = :religion,
                    blood_group = :blood_group,
                    department_id = :department_id,
                    designation = :designation,
                    worker_type = :worker_type,
                    hire_date = :hire_date,
                    contract_type = :contract_type,
                    contract_end_date = :contract_end_date,
                    probation_end_date = :probation_end_date,
                    border_number = :border_number,
                    iqama_expiry_date = :iqama_expiry_date,
                    passport_number = :passport_number,
                    passport_expiry_date = :passport_expiry_date,
                    work_permit_number = :work_permit_number,
                    work_permit_expiry_date = :work_permit_expiry_date,
                    insurance_policy_number = :insurance_policy_number,
                    medical_insurance_category = :medical_insurance_category,
                    medical_insurance_expiry_date = :medical_insurance_expiry_date,
                    driving_license_number = :driving_license_number,
                    driving_license_expiry_date = :driving_license_expiry_date,
                    emergency_contact_name = :emergency_contact_name,
                    emergency_contact_phone = :emergency_contact_phone,
                    emergency_contact_relation = :emergency_contact_relation,
                    bank_name = :bank_name,
                    iban = :iban,
                    basic_salary = :basic_salary,
                    housing_allowance = :housing_allowance,
                    transport_allowance = :transport_allowance,
                    other_allowances = :other_allowances,
                    gosi_number = :gosi_number,
                    status = :status
                WHERE id = :id
            """, emp)
            updated_count += 1
        else:
            db.execute_cmd("""
                INSERT INTO employees (
                    emp_code, first_name, middle_name, last_name, arabic_name, email, phone,
                    national_id_iqama, nationality, gender, is_saudi, dob, marital_status, religion, blood_group,
                    department_id, designation, worker_type, hire_date, contract_type, contract_end_date,
                    probation_end_date, border_number, iqama_expiry_date, passport_number, passport_expiry_date,
                    work_permit_number, work_permit_expiry_date, insurance_policy_number, medical_insurance_category,
                    medical_insurance_expiry_date, driving_license_number, driving_license_expiry_date,
                    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
                    bank_name, iban, basic_salary, housing_allowance, transport_allowance, other_allowances,
                    gosi_number, status
                ) VALUES (
                    :emp_code, :first_name, :middle_name, :last_name, :arabic_name, :email, :phone,
                    :national_id_iqama, :nationality, :gender, :is_saudi, :dob, :marital_status, :religion, :blood_group,
                    :department_id, :designation, :worker_type, :hire_date, :contract_type, :contract_end_date,
                    :probation_end_date, :border_number, :iqama_expiry_date, :passport_number, :passport_expiry_date,
                    :work_permit_number, :work_permit_expiry_date, :insurance_policy_number, :medical_insurance_category,
                    :medical_insurance_expiry_date, :driving_license_number, :driving_license_expiry_date,
                    :emergency_contact_name, :emergency_contact_phone, :emergency_contact_relation,
                    :bank_name, :iban, :basic_salary, :housing_allowance, :transport_allowance, :other_allowances,
                    :gosi_number, :status
                )
            """, emp)
            created_count += 1

    return {
        "status": "SUCCESS",
        "message": f"Successfully imported and populated {len(parsed_employees)} employees sorted by Joining Date.",
        "total_processed": len(parsed_employees),
        "created_count": created_count,
        "updated_count": updated_count
    }

@app.post("/api/employees")
def create_employee(emp: EmployeeCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM employees WHERE emp_code = ? OR national_id_iqama = ? OR email = ?", (emp.emp_code, emp.national_id_iqama, emp.email))
    if existing:
        raise HTTPException(status_code=400, detail="Employee Code, Iqama/National ID, or Email already exists in the system.")
        
    data = emp.dict()
    if not data.get("worker_type"):
        data["worker_type"] = "Direct"

    e_id = db.execute_cmd("""
        INSERT INTO employees (
            emp_code, first_name, middle_name, last_name, arabic_name, email, phone,
            national_id_iqama, nationality, gender, is_saudi, dob, marital_status, religion, blood_group,
            department_id, designation, worker_type, hire_date, contract_type, contract_end_date,
            probation_end_date, border_number, iqama_expiry_date, passport_number, passport_expiry_date,
            work_permit_number, work_permit_expiry_date, insurance_policy_number, medical_insurance_category,
            medical_insurance_expiry_date, driving_license_number, driving_license_expiry_date,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
            bank_name, iban, basic_salary, housing_allowance, transport_allowance, other_allowances,
            gosi_number, status
        ) VALUES (
            :emp_code, :first_name, :middle_name, :last_name, :arabic_name, :email, :phone,
            :national_id_iqama, :nationality, :gender, :is_saudi, :dob, :marital_status, :religion, :blood_group,
            :department_id, :designation, :worker_type, :hire_date, :contract_type, :contract_end_date,
            :probation_end_date, :border_number, :iqama_expiry_date, :passport_number, :passport_expiry_date,
            :work_permit_number, :work_permit_expiry_date, :insurance_policy_number, :medical_insurance_category,
            :medical_insurance_expiry_date, :driving_license_number, :driving_license_expiry_date,
            :emergency_contact_name, :emergency_contact_phone, :emergency_contact_relation,
            :bank_name, :iban, :basic_salary, :housing_allowance, :transport_allowance, :other_allowances,
            :gosi_number, :status
        )
    """, data)
    return {"message": "Employee profile created successfully", "id": e_id}

@app.get("/api/employees/{emp_id}")
def get_employee_detail(emp_id: int, user: dict = Depends(get_current_user)):
    emp = db.query_one("""
        SELECT e.*, d.name as department_name 
        FROM employees e 
        LEFT JOIN departments d ON e.department_id = d.id 
        WHERE e.id = ?
    """, (emp_id,))
    
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    if user["role"] == "viewer":
        emp["basic_salary"] = 0.0
        emp["housing_allowance"] = 0.0
        emp["transport_allowance"] = 0.0
        emp["other_allowances"] = 0.0
        
    documents = db.query_all("SELECT * FROM documents WHERE employee_id = ? ORDER BY id DESC", (emp_id,))
    leaves = db.query_all("SELECT * FROM leaves WHERE employee_id = ? ORDER BY id DESC", (emp_id,))
    payroll_history = db.query_all("""
        SELECT pd.*, pr.payroll_month, pr.payroll_year, pr.processed_at 
        FROM payroll_details pd 
        JOIN payroll_runs pr ON pd.payroll_run_id = pr.id 
        WHERE pd.employee_id = ? 
        ORDER BY pr.id DESC
    """, (emp_id,)) if user["role"] in ["admin", "hr_manager"] else []
    
    gosi_info = SaudiHREngine.calculate_gosi(
        emp["is_saudi"] == 1,
        emp["basic_salary"],
        emp["housing_allowance"]
    )
    
    allowances = db.query_all("""
        SELECT ea.*, ac.name as category_name, ac.name_ar as category_name_ar, ac.code as category_code, ac.is_gosi_eligible
        FROM employee_allowances ea
        JOIN allowance_categories ac ON ea.category_id = ac.id
        WHERE ea.employee_id = ?
        ORDER BY ea.is_active DESC, ac.name ASC
    """, (emp_id,))
    
    total_active_allowances = sum(float(a["amount"]) for a in allowances if a["is_active"] == 1)
    gosi_allowances = sum(float(a["amount"]) for a in allowances if a["is_active"] == 1 and a.get("is_gosi_eligible") == 1)
    non_gosi_allowances = total_active_allowances - gosi_allowances
    basic_salary = float(emp["basic_salary"] or 0.0)
    total_gross = basic_salary + total_active_allowances
    
    salary_history = db.query_all("""
        SELECT * FROM salary_history 
        WHERE employee_id = ? 
        ORDER BY effective_date DESC, id DESC
    """, (emp_id,))
    
    salary_logs = db.query_all("""
        SELECT * FROM salary_audit_logs 
        WHERE employee_id = ? 
        ORDER BY id DESC LIMIT 25
    """, (emp_id,))
    
    deductions = db.query_all("""
        SELECT ed.*, dc.name as category_name, dc.name_ar as category_name_ar, dc.code as category_code
        FROM employee_deductions ed
        JOIN deduction_categories dc ON ed.category_id = dc.id
        WHERE ed.employee_id = ?
        ORDER BY ed.is_active DESC, dc.name ASC
    """, (emp_id,))
    total_active_deductions = sum(float(d["amount"]) for d in deductions if d["is_active"] == 1)
    
    return {
        "employee": emp,
        "documents": documents,
        "leaves": leaves,
        "payroll_history": payroll_history,
        "gosi_breakdown": gosi_info,
        "allowances": allowances,
        "deductions": deductions,
        "salary_history": salary_history,
        "salary_logs": salary_logs,
        "financial_summary": {
            "basic_salary": basic_salary,
            "total_allowances": total_active_allowances,
            "total_deductions": total_active_deductions,
            "gross_salary": total_gross,
            "estimated_net": max(0.0, total_gross - total_active_deductions)
        }
    }

@app.put("/api/employees/{emp_id}")
def update_employee(emp_id: int, emp: EmployeeUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id, basic_salary, housing_allowance, transport_allowance, other_allowances FROM employees WHERE id = ?", (emp_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    # Prevent duplicate code, national ID, or email across OTHER employees
    dup = db.query_one("""
        SELECT id FROM employees 
        WHERE (emp_code = ? OR national_id_iqama = ? OR email = ?) AND id != ?
    """, (emp.emp_code, emp.national_id_iqama, emp.email, emp_id))
    if dup:
        raise HTTPException(status_code=400, detail="Employee Code, Iqama/National ID, or Email is already registered to another employee.")
        
    data = emp.dict()
    data["id"] = emp_id
    if not data.get("worker_type"):
        data["worker_type"] = "Direct"
    
    # Audit log salary change if basic changed via direct profile edit
    old_b = float(existing["basic_salary"] or 0.0)
    new_b = float(emp.basic_salary or 0.0)
    if abs(old_b - new_b) > 0.01:
        db.execute_cmd("""
            INSERT INTO salary_history (
                employee_id, previous_basic, new_basic, previous_gross, new_gross,
                change_reason, effective_date, approved_by, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, 'Profile Update', date('now'), ?, 'Updated via Employee Profile Form', datetime('now'))
        """, (emp_id, old_b, new_b, old_b + float(existing["housing_allowance"] or 0.0) + float(existing["transport_allowance"] or 0.0) + float(existing["other_allowances"] or 0.0),
              new_b + float(emp.housing_allowance or 0.0) + float(emp.transport_allowance or 0.0) + float(emp.other_allowances or 0.0), user["full_name"]))
        db.execute_cmd("""
            INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, new_values_json, timestamp)
            VALUES (?, 'SALARY_INCREMENT', ?, ?, ?, ?, datetime('now'))
        """, (emp_id, f"Basic salary changed from SAR {old_b:,.2f} to SAR {new_b:,.2f} via Profile Edit", user["full_name"], json.dumps({"basic": old_b}), json.dumps({"basic": new_b})))

    db.execute_cmd("""
        UPDATE employees SET
            emp_code = :emp_code,
            first_name = :first_name,
            middle_name = :middle_name,
            last_name = :last_name,
            arabic_name = :arabic_name,
            email = :email,
            phone = :phone,
            national_id_iqama = :national_id_iqama,
            nationality = :nationality,
            gender = :gender,
            is_saudi = :is_saudi,
            dob = :dob,
            marital_status = :marital_status,
            religion = :religion,
            blood_group = :blood_group,
            department_id = :department_id,
            designation = :designation,
            worker_type = :worker_type,
            hire_date = :hire_date,
            contract_type = :contract_type,
            contract_end_date = :contract_end_date,
            probation_end_date = :probation_end_date,
            border_number = :border_number,
            iqama_expiry_date = :iqama_expiry_date,
            passport_number = :passport_number,
            passport_expiry_date = :passport_expiry_date,
            work_permit_number = :work_permit_number,
            work_permit_expiry_date = :work_permit_expiry_date,
            insurance_policy_number = :insurance_policy_number,
            medical_insurance_category = :medical_insurance_category,
            medical_insurance_expiry_date = :medical_insurance_expiry_date,
            driving_license_number = :driving_license_number,
            driving_license_expiry_date = :driving_license_expiry_date,
            emergency_contact_name = :emergency_contact_name,
            emergency_contact_phone = :emergency_contact_phone,
            emergency_contact_relation = :emergency_contact_relation,
            bank_name = :bank_name,
            iban = :iban,
            basic_salary = :basic_salary,
            housing_allowance = :housing_allowance,
            transport_allowance = :transport_allowance,
            other_allowances = :other_allowances,
            gosi_number = :gosi_number,
            status = :status
        WHERE id = :id
    """, data)
    return {"message": "Employee profile updated successfully"}

@app.delete("/api/employees/{emp_id}")
def delete_employee(emp_id: int, user: dict = Depends(require_roles(["admin"]))):
    existing = db.query_one("SELECT id, first_name, last_name FROM employees WHERE id = ?", (emp_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    db.execute_cmd("DELETE FROM employees WHERE id = ?", (emp_id,))
    return {"message": f"Employee {existing['first_name']} {existing['last_name']} removed successfully"}

# =========================================================================
# SALARY TRACKING, ALLOWANCE CATEGORIES & AUDIT LOGS ENDPOINTS
# =========================================================================

@app.get("/api/allowance-categories")
def list_allowance_categories(user: dict = Depends(get_current_user)):
    return db.query_all("SELECT * FROM allowance_categories ORDER BY id ASC")

@app.post("/api/allowance-categories")
def create_allowance_category(cat: AllowanceCategoryCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM allowance_categories WHERE LOWER(code) = ?", (cat.code.strip().lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="Allowance category code already exists.")
    c_id = db.execute_cmd("""
        INSERT INTO allowance_categories (name, name_ar, code, is_gosi_eligible, is_recurring, default_amount, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (cat.name.strip(), cat.name_ar, cat.code.strip().upper(), cat.is_gosi_eligible or 0, cat.is_recurring or 1, cat.default_amount or 0.0, cat.description))
    return {"id": c_id, "message": f"Allowance category '{cat.name}' created successfully"}

@app.put("/api/allowance-categories/{cat_id}")
def update_allowance_category(cat_id: int, cat: AllowanceCategoryUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM allowance_categories WHERE id = ?", (cat_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    dup = db.query_one("SELECT id FROM allowance_categories WHERE LOWER(code) = ? AND id != ?", (cat.code.strip().lower(), cat_id))
    if dup:
        raise HTTPException(status_code=400, detail="Allowance category code is already used.")
    db.execute_cmd("""
        UPDATE allowance_categories SET
            name = ?, name_ar = ?, code = ?, is_gosi_eligible = ?, is_recurring = ?, default_amount = ?, description = ?
        WHERE id = ?
    """, (cat.name.strip(), cat.name_ar, cat.code.strip().upper(), cat.is_gosi_eligible or 0, cat.is_recurring or 1, cat.default_amount or 0.0, cat.description, cat_id))
    return {"message": "Allowance category updated successfully"}

@app.delete("/api/allowance-categories/{cat_id}")
def delete_allowance_category(cat_id: int, user: dict = Depends(require_roles(["admin"]))):
    existing = db.query_one("SELECT id, name FROM allowance_categories WHERE id = ?", (cat_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    db.execute_cmd("DELETE FROM allowance_categories WHERE id = ?", (cat_id,))
    return {"message": f"Allowance category '{existing['name']}' removed successfully"}

@app.get("/api/employees/{emp_id}/allowances")
def get_employee_allowances(emp_id: int, user: dict = Depends(get_current_user)):
    emp = db.query_one("SELECT id, emp_code, first_name, last_name, basic_salary, housing_allowance, transport_allowance, other_allowances, is_saudi FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    
    allowances = db.query_all("""
        SELECT ea.*, ac.name as category_name, ac.name_ar as category_name_ar, ac.code as category_code, ac.is_gosi_eligible
        FROM employee_allowances ea
        JOIN allowance_categories ac ON ea.category_id = ac.id
        WHERE ea.employee_id = ?
        ORDER BY ea.is_active DESC, ac.name ASC
    """, (emp_id,))
    
    total_active_allowances = sum(float(a["amount"]) for a in allowances if a["is_active"] == 1)
    gosi_allowances = sum(float(a["amount"]) for a in allowances if a["is_active"] == 1 and a.get("is_gosi_eligible") == 1)
    non_gosi_allowances = total_active_allowances - gosi_allowances
    basic_salary = float(emp["basic_salary"] or 0.0)
    total_gross = basic_salary + total_active_allowances
    
    return {
        "employee_id": emp_id,
        "basic_salary": basic_salary,
        "total_allowances": total_active_allowances,
        "gosi_eligible_allowances": gosi_allowances,
        "non_gosi_allowances": non_gosi_allowances,
        "gross_salary": total_gross,
        "allowances": allowances
    }

@app.post("/api/employees/{emp_id}/allowances")
def add_employee_allowance(emp_id: int, allow: EmployeeAllowanceCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    emp = db.query_one("SELECT id, first_name, last_name FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    cat = db.query_one("SELECT * FROM allowance_categories WHERE id = ?", (allow.category_id,))
    if not cat:
        raise HTTPException(status_code=400, detail="Allowance category not found.")
    
    a_id = db.execute_cmd("""
        INSERT INTO employee_allowances (employee_id, category_id, amount, frequency, effective_from, effective_to, is_active, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (emp_id, allow.category_id, allow.amount, allow.frequency or "Monthly", allow.effective_from, allow.effective_to, allow.is_active or 1, allow.notes))
    
    # Sync employee table quick fields
    if cat["code"] == "HRA":
        db.execute_cmd("UPDATE employees SET housing_allowance = ? WHERE id = ?", (allow.amount, emp_id))
    elif cat["code"] == "TRA":
        db.execute_cmd("UPDATE employees SET transport_allowance = ? WHERE id = ?", (allow.amount, emp_id))
    else:
        other_sum = db.query_one("""
            SELECT COALESCE(SUM(ea.amount), 0.0) as tot
            FROM employee_allowances ea
            JOIN allowance_categories ac ON ea.category_id = ac.id
            WHERE ea.employee_id = ? AND ea.is_active = 1 AND ac.code NOT IN ('HRA', 'TRA')
        """, (emp_id,))["tot"]
        db.execute_cmd("UPDATE employees SET other_allowances = ? WHERE id = ?", (other_sum, emp_id))
        
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, new_values_json, timestamp)
        VALUES (?, 'ALLOWANCE_ADDED', ?, ?, ?, datetime('now'))
    """, (emp_id, f"Added allowance '{cat['name']}' of SAR {allow.amount:,.2f} ({allow.frequency or 'Monthly'})", user["full_name"], json.dumps(allow.dict())))
    
    return {"id": a_id, "message": f"{cat['name']} allowance assigned successfully"}

@app.put("/api/employees/{emp_id}/allowances/{allowance_id}")
def update_employee_allowance(emp_id: int, allowance_id: int, allow: EmployeeAllowanceUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT * FROM employee_allowances WHERE id = ? AND employee_id = ?", (allowance_id, emp_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Allowance record not found.")
    cat = db.query_one("SELECT * FROM allowance_categories WHERE id = ?", (existing["category_id"],))
    
    db.execute_cmd("""
        UPDATE employee_allowances SET
            amount = ?, frequency = ?, effective_from = ?, effective_to = ?, is_active = ?, notes = ?
        WHERE id = ?
    """, (allow.amount, allow.frequency or "Monthly", allow.effective_from, allow.effective_to, allow.is_active, allow.notes, allowance_id))
    
    if cat and cat["code"] == "HRA":
        db.execute_cmd("UPDATE employees SET housing_allowance = ? WHERE id = ?", (allow.amount if allow.is_active else 0.0, emp_id))
    elif cat and cat["code"] == "TRA":
        db.execute_cmd("UPDATE employees SET transport_allowance = ? WHERE id = ?", (allow.amount if allow.is_active else 0.0, emp_id))
    else:
        other_sum = db.query_one("""
            SELECT COALESCE(SUM(ea.amount), 0.0) as tot
            FROM employee_allowances ea
            JOIN allowance_categories ac ON ea.category_id = ac.id
            WHERE ea.employee_id = ? AND ea.is_active = 1 AND ac.code NOT IN ('HRA', 'TRA')
        """, (emp_id,))["tot"]
        db.execute_cmd("UPDATE employees SET other_allowances = ? WHERE id = ?", (other_sum, emp_id))
        
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, new_values_json, timestamp)
        VALUES (?, 'ALLOWANCE_UPDATED', ?, ?, ?, ?, datetime('now'))
    """, (emp_id, f"Updated allowance '{cat['name'] if cat else ''}' to SAR {allow.amount:,.2f}", user["full_name"], json.dumps(dict(existing)), json.dumps(allow.dict())))
    
    return {"message": "Allowance updated successfully"}

@app.delete("/api/employees/{emp_id}/allowances/{allowance_id}")
def delete_employee_allowance(emp_id: int, allowance_id: int, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT * FROM employee_allowances WHERE id = ? AND employee_id = ?", (allowance_id, emp_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Allowance record not found.")
    cat = db.query_one("SELECT * FROM allowance_categories WHERE id = ?", (existing["category_id"],))
    
    db.execute_cmd("DELETE FROM employee_allowances WHERE id = ?", (allowance_id,))
    
    if cat and cat["code"] == "HRA":
        hra_sum = db.query_one("""
            SELECT COALESCE(SUM(ea.amount), 0.0) as tot
            FROM employee_allowances ea
            JOIN allowance_categories ac ON ea.category_id = ac.id
            WHERE ea.employee_id = ? AND ea.is_active = 1 AND ac.code = 'HRA'
        """, (emp_id,))["tot"]
        db.execute_cmd("UPDATE employees SET housing_allowance = ? WHERE id = ?", (hra_sum, emp_id))
    elif cat and cat["code"] == "TRA":
        tra_sum = db.query_one("""
            SELECT COALESCE(SUM(ea.amount), 0.0) as tot
            FROM employee_allowances ea
            JOIN allowance_categories ac ON ea.category_id = ac.id
            WHERE ea.employee_id = ? AND ea.is_active = 1 AND ac.code = 'TRA'
        """, (emp_id,))["tot"]
        db.execute_cmd("UPDATE employees SET transport_allowance = ? WHERE id = ?", (tra_sum, emp_id))
    else:
        other_sum = db.query_one("""
            SELECT COALESCE(SUM(ea.amount), 0.0) as tot
            FROM employee_allowances ea
            JOIN allowance_categories ac ON ea.category_id = ac.id
            WHERE ea.employee_id = ? AND ea.is_active = 1 AND ac.code NOT IN ('HRA', 'TRA')
        """, (emp_id,))["tot"]
        db.execute_cmd("UPDATE employees SET other_allowances = ? WHERE id = ?", (other_sum, emp_id))
        
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, timestamp)
        VALUES (?, 'ALLOWANCE_REMOVED', ?, ?, ?, datetime('now'))
    """, (emp_id, f"Removed allowance '{cat['name'] if cat else ''}'", user["full_name"], json.dumps(dict(existing))))
    
    return {"message": "Allowance removed successfully"}

# --- Deduction Categories & Employee Deductions ---

@app.get("/api/deduction-categories")
def list_deduction_categories(user: dict = Depends(get_current_user)):
    categories = db.query_all("SELECT * FROM deduction_categories ORDER BY name ASC")
    return categories

@app.post("/api/deduction-categories")
def create_deduction_category(cat: DeductionCategoryCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM deduction_categories WHERE LOWER(code) = ?", (cat.code.strip().lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="A deduction category with this code already exists.")
    c_id = db.execute_cmd("""
        INSERT INTO deduction_categories (name, name_ar, code, default_amount, is_recurring, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    """, (cat.name.strip(), cat.name_ar, cat.code.strip().upper(), cat.default_amount or 0.0, cat.is_recurring or 1, cat.description))
    return {"id": c_id, "message": f"Deduction category '{cat.name}' created successfully"}

@app.put("/api/deduction-categories/{cat_id}")
def update_deduction_category(cat_id: int, cat: DeductionCategoryUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM deduction_categories WHERE id = ?", (cat_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    dup = db.query_one("SELECT id FROM deduction_categories WHERE LOWER(code) = ? AND id != ?", (cat.code.strip().lower(), cat_id))
    if dup:
        raise HTTPException(status_code=400, detail="Deduction category code is already used.")
    db.execute_cmd("""
        UPDATE deduction_categories SET
            name = ?, name_ar = ?, code = ?, default_amount = ?, is_recurring = ?, description = ?
        WHERE id = ?
    """, (cat.name.strip(), cat.name_ar, cat.code.strip().upper(), cat.default_amount or 0.0, cat.is_recurring or 1, cat.description, cat_id))
    return {"message": "Deduction category updated successfully"}

@app.delete("/api/deduction-categories/{cat_id}")
def delete_deduction_category(cat_id: int, user: dict = Depends(require_roles(["admin"]))):
    existing = db.query_one("SELECT id, name FROM deduction_categories WHERE id = ?", (cat_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found.")
    db.execute_cmd("DELETE FROM deduction_categories WHERE id = ?", (cat_id,))
    return {"message": f"Deduction category '{existing['name']}' removed successfully"}

@app.get("/api/employees/{emp_id}/deductions")
def get_employee_deductions(emp_id: int, user: dict = Depends(get_current_user)):
    emp = db.query_one("SELECT id, emp_code, first_name, last_name, basic_salary FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    
    deductions = db.query_all("""
        SELECT ed.*, dc.name as category_name, dc.name_ar as category_name_ar, dc.code as category_code
        FROM employee_deductions ed
        JOIN deduction_categories dc ON ed.category_id = dc.id
        WHERE ed.employee_id = ?
        ORDER BY ed.is_active DESC, dc.name ASC
    """, (emp_id,))
    
    total_active_deductions = sum(float(d["amount"]) for d in deductions if d["is_active"] == 1)
    
    return {
        "employee_id": emp_id,
        "total_active_deductions": total_active_deductions,
        "deductions": deductions
    }

@app.post("/api/employees/{emp_id}/deductions")
def add_employee_deduction(emp_id: int, ded: EmployeeDeductionCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    emp = db.query_one("SELECT id, first_name, last_name FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    cat = db.query_one("SELECT * FROM deduction_categories WHERE id = ?", (ded.category_id,))
    if not cat:
        raise HTTPException(status_code=400, detail="Deduction category not found.")
    
    d_id = db.execute_cmd("""
        INSERT INTO employee_deductions (employee_id, category_id, amount, frequency, effective_from, effective_to, is_active, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (emp_id, ded.category_id, ded.amount, ded.frequency or "Monthly", ded.effective_from, ded.effective_to, ded.is_active or 1, ded.notes))
    
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, new_values_json, timestamp)
        VALUES (?, 'DEDUCTION_ADDED', ?, ?, ?, datetime('now'))
    """, (emp_id, f"Assigned deduction '{cat['name']}' of SAR {ded.amount:,.2f} ({ded.frequency or 'Monthly'})", user["full_name"], json.dumps(ded.dict())))
    
    return {"id": d_id, "message": f"{cat['name']} deduction assigned successfully"}

@app.put("/api/employees/{emp_id}/deductions/{deduction_id}")
def update_employee_deduction(emp_id: int, deduction_id: int, ded: EmployeeDeductionUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT * FROM employee_deductions WHERE id = ? AND employee_id = ?", (deduction_id, emp_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Deduction record not found.")
    cat = db.query_one("SELECT * FROM deduction_categories WHERE id = ?", (existing["category_id"],))
    
    db.execute_cmd("""
        UPDATE employee_deductions SET
            amount = ?, frequency = ?, effective_from = ?, effective_to = ?, is_active = ?, notes = ?
        WHERE id = ?
    """, (ded.amount, ded.frequency or "Monthly", ded.effective_from, ded.effective_to, ded.is_active, ded.notes, deduction_id))
    
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, new_values_json, timestamp)
        VALUES (?, 'DEDUCTION_UPDATED', ?, ?, ?, ?, datetime('now'))
    """, (emp_id, f"Updated deduction '{cat['name'] if cat else ''}' to SAR {ded.amount:,.2f}", user["full_name"], json.dumps(dict(existing)), json.dumps(ded.dict())))
    
    return {"message": "Deduction updated successfully"}

@app.delete("/api/employees/{emp_id}/deductions/{deduction_id}")
def delete_employee_deduction(emp_id: int, deduction_id: int, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT * FROM employee_deductions WHERE id = ? AND employee_id = ?", (deduction_id, emp_id))
    if not existing:
        raise HTTPException(status_code=404, detail="Deduction record not found.")
    cat = db.query_one("SELECT * FROM deduction_categories WHERE id = ?", (existing["category_id"],))
    
    db.execute_cmd("DELETE FROM employee_deductions WHERE id = ?", (deduction_id,))
    
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, timestamp)
        VALUES (?, 'DEDUCTION_REMOVED', ?, ?, ?, datetime('now'))
    """, (emp_id, f"Removed deduction '{cat['name'] if cat else ''}'", user["full_name"], json.dumps(dict(existing))))
    
    return {"message": "Deduction removed successfully"}

@app.get("/api/salary-tracking/audit-logs")
def get_all_salary_audit_logs(
    action_type: Optional[str] = Query(None),
    employee_id: Optional[int] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user)
):
    query = """
        SELECT sal.*, e.emp_code, e.first_name, e.last_name, e.designation, d.name as department_name
        FROM salary_audit_logs sal
        JOIN employees e ON sal.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE 1=1
    """
    params = []
    if action_type:
        query += " AND sal.action_type = ?"
        params.append(action_type)
    if employee_id:
        query += " AND sal.employee_id = ?"
        params.append(employee_id)
    query += " ORDER BY sal.id DESC LIMIT ?"
    params.append(limit)
    
    logs = db.query_all(query, tuple(params))
    return logs

@app.get("/api/employees/{emp_id}/salary-history")
def get_employee_salary_history(emp_id: int, user: dict = Depends(get_current_user)):
    history = db.query_all("""
        SELECT * FROM salary_history 
        WHERE employee_id = ? 
        ORDER BY effective_date DESC, id DESC
    """, (emp_id,))
    return history

@app.post("/api/employees/{emp_id}/salary-adjustments")
def create_salary_adjustment(emp_id: int, adj: SalaryAdjustmentCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    emp = db.query_one("SELECT * FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    old_basic = float(emp["basic_salary"] or 0.0)
    old_allowances = float(emp["housing_allowance"] or 0.0) + float(emp["transport_allowance"] or 0.0) + float(emp["other_allowances"] or 0.0)
    old_gross = old_basic + old_allowances
    
    new_basic = float(adj.new_basic)
    new_gross = new_basic + old_allowances
    
    h_id = db.execute_cmd("""
        INSERT INTO salary_history (
            employee_id, previous_basic, new_basic, previous_gross, new_gross,
            change_reason, effective_date, approved_by, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (emp_id, old_basic, new_basic, old_gross, new_gross, adj.change_reason, adj.effective_date, user["full_name"], adj.notes))
    
    db.execute_cmd("UPDATE employees SET basic_salary = ? WHERE id = ?", (new_basic, emp_id))
    
    diff_basic = new_basic - old_basic
    pct = (diff_basic / old_basic * 100.0) if old_basic > 0 else 0.0
    desc = f"Salary adjusted from SAR {old_basic:,.2f} to SAR {new_basic:,.2f} ({'+' if diff_basic >= 0 else ''}{diff_basic:,.2f} SAR / {pct:+.1f}%) - Reason: {adj.change_reason}"
    
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, new_values_json, timestamp)
        VALUES (?, 'SALARY_INCREMENT', ?, ?, ?, ?, datetime('now'))
    """, (emp_id, desc, user["full_name"], json.dumps({"basic_salary": old_basic, "gross": old_gross}), json.dumps({"basic_salary": new_basic, "gross": new_gross})))
    
    return {
        "id": h_id,
        "message": f"Salary increment recorded successfully. New base: SAR {new_basic:,.2f}",
        "old_basic": old_basic,
        "new_basic": new_basic,
        "diff": diff_basic,
        "percentage": pct
    }

@app.put("/api/employees/{emp_id}/direct-salary")
def update_employee_direct_salary(emp_id: int, adj: DirectSalaryUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    emp = db.query_one("SELECT * FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    old_basic = float(emp["basic_salary"] or 0.0)
    old_other = float(emp["other_allowances"] or 0.0)
    old_gross = old_basic + old_other
    
    new_basic = float(adj.basic_salary or 0.0)
    new_meal = float(adj.meal_allowance or 0.0)
    new_site = float(adj.site_allowance or 0.0)
    new_other = float(adj.other_allowances or 0.0)
    new_gross = new_basic + new_meal + new_site + new_other
    
    eff_date = adj.effective_date or date.today().isoformat()
    reason = adj.change_reason or "Direct Salary Input"
    
    # Record in history if basic or gross changed
    if abs(old_basic - new_basic) > 0.01 or abs(old_gross - new_gross) > 0.01:
        db.execute_cmd("""
            INSERT INTO salary_history (
                employee_id, previous_basic, new_basic, previous_gross, new_gross,
                change_reason, effective_date, approved_by, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (emp_id, old_basic, new_basic, old_gross, new_gross, reason, eff_date, user["full_name"], adj.notes))
    
    # Update employee table directly with values (clean zero out for housing and transport)
    db.execute_cmd("""
        UPDATE employees SET
            basic_salary = ?,
            housing_allowance = 0.0,
            transport_allowance = 0.0,
            other_allowances = ?
        WHERE id = ?
    """, (new_basic, new_other, emp_id))
    
    # Sync FOOD (Meal Allowance)
    cat_food = db.query_one("SELECT id FROM allowance_categories WHERE code = 'FOOD'")
    if cat_food:
        if new_meal > 0:
            existing_food = db.query_one("SELECT id FROM employee_allowances WHERE employee_id = ? AND category_id = ?", (emp_id, cat_food["id"]))
            if existing_food:
                db.execute_cmd("UPDATE employee_allowances SET amount = ?, is_active = 1 WHERE id = ?", (new_meal, existing_food["id"]))
            else:
                db.execute_cmd("""
                    INSERT INTO employee_allowances (employee_id, category_id, amount, frequency, effective_from, is_active, notes, created_at)
                    VALUES (?, ?, ?, 'Monthly', ?, 1, 'Meal allowance', datetime('now'))
                """, (emp_id, cat_food["id"], new_meal, eff_date))
        else:
            db.execute_cmd("DELETE FROM employee_allowances WHERE employee_id = ? AND category_id = ?", (emp_id, cat_food["id"]))
            
    # Sync SITE (Project/Site Location Allowance)
    cat_site = db.query_one("SELECT id FROM allowance_categories WHERE code = 'SITE'")
    if cat_site:
        if new_site > 0:
            existing_site = db.query_one("SELECT id FROM employee_allowances WHERE employee_id = ? AND category_id = ?", (emp_id, cat_site["id"]))
            if existing_site:
                db.execute_cmd("UPDATE employee_allowances SET amount = ?, is_active = 1 WHERE id = ?", (new_site, existing_site["id"]))
            else:
                db.execute_cmd("""
                    INSERT INTO employee_allowances (employee_id, category_id, amount, frequency, effective_from, is_active, notes, created_at)
                    VALUES (?, ?, ?, 'Monthly', ?, 1, 'Project/Site location allowance', datetime('now'))
                """, (emp_id, cat_site["id"], new_site, eff_date))
        else:
            db.execute_cmd("DELETE FROM employee_allowances WHERE employee_id = ? AND category_id = ?", (emp_id, cat_site["id"]))
            
    # Remove any HRA/TRA from allowances
    cat_hra = db.query_one("SELECT id FROM allowance_categories WHERE code = 'HRA'")
    cat_tra = db.query_one("SELECT id FROM allowance_categories WHERE code = 'TRA'")
    if cat_hra:
        db.execute_cmd("DELETE FROM employee_allowances WHERE employee_id = ? AND category_id = ?", (emp_id, cat_hra["id"]))
    if cat_tra:
        db.execute_cmd("DELETE FROM employee_allowances WHERE employee_id = ? AND category_id = ?", (emp_id, cat_tra["id"]))
    
    diff_gross = new_gross - old_gross
    desc = f"Salary updated: Base SAR {new_basic:,.2f}, Meal SAR {new_meal:,.2f}, Site SAR {new_site:,.2f}, Other SAR {new_other:,.2f} (Gross SAR {new_gross:,.2f})"
    
    db.execute_cmd("""
        INSERT INTO salary_audit_logs (employee_id, action_type, description, changed_by, old_values_json, new_values_json, timestamp)
        VALUES (?, 'DIRECT_SALARY_UPDATE', ?, ?, ?, ?, datetime('now'))
    """, (emp_id, desc, user["full_name"],
          json.dumps({"basic": old_basic, "gross": old_gross}),
          json.dumps({"basic": new_basic, "meal": new_meal, "site": new_site, "other": new_other, "gross": new_gross})))
    
    return {
        "message": f"Salary updated successfully. Total Gross: SAR {new_gross:,.2f}",
        "basic_salary": new_basic,
        "meal_allowance": new_meal,
        "site_allowance": new_site,
        "other_allowances": new_other,
        "gross_salary": new_gross,
        "diff_gross": diff_gross
    }


@app.get("/api/employees/{emp_id}/salary-logs")
def get_employee_salary_audit_logs(emp_id: int, user: dict = Depends(get_current_user)):
    logs = db.query_all("""
        SELECT * FROM salary_audit_logs
        WHERE employee_id = ?
        ORDER BY id DESC LIMIT 50
    """, (emp_id,))
    return logs

@app.get("/api/salary-tracking/summary")
def get_salary_tracking_summary(user: dict = Depends(get_current_user)):
    return CompensationEngine.get_company_compensation_summary(db)

# --- Image & Document Endpoints ---
@app.post("/api/employees/{emp_id}/photo")
async def upload_employee_photo(emp_id: int, file: UploadFile = File(...), user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    emp = db.query_one("SELECT id FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Invalid image format. Allowed: JPG, PNG, WEBP")
        
    unique_filename = f"emp_{emp_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOADS_PHOTOS_DIR, unique_filename)
    
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
            
        try:
            with Image.open(file_path) as im:
                im.thumbnail((400, 400))
                im.save(file_path)
        except Exception:
            pass
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image upload: {str(e)}")
        
    db.execute_cmd("UPDATE employees SET photo_filename = ? WHERE id = ?", (f"photos/{unique_filename}", emp_id))
    return {"message": "Employee photo uploaded successfully", "photo_url": f"/uploads/photos/{unique_filename}"}

@app.post("/api/employees/{emp_id}/documents")
async def upload_employee_document(
    emp_id: int,
    doc_type: str = Form(...),
    notes: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    file: UploadFile = File(...),
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    emp = db.query_one("SELECT id FROM employees WHERE id = ?", (emp_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    ext = os.path.splitext(file.filename)[1].lower()
    unique_filename = f"doc_emp_{emp_id}_{uuid.uuid4().hex[:8]}{ext}"
    saved_path = os.path.join(UPLOADS_DOCS_DIR, unique_filename)
    rel_path = f"uploads/documents/{unique_filename}"
    
    try:
        contents = await file.read()
        with open(saved_path, "wb") as buffer:
            buffer.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file upload: {str(e)}")
        
    doc_id = db.execute_cmd("""
        INSERT INTO documents (employee_id, doc_type, file_name, file_path, upload_date, expiry_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (emp_id, doc_type, file.filename, rel_path, date.today().strftime("%Y-%m-%d"), expiry_date, notes))
    
    return {"message": "Document uploaded successfully", "document_id": doc_id, "file_name": file.filename}

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: int, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    doc = db.query_one("SELECT * FROM documents WHERE id = ?", (doc_id,))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    full_path = os.path.join(BASE_DIR, doc["file_path"])
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except Exception:
            pass
            
    db.execute_cmd("DELETE FROM documents WHERE id = ?", (doc_id,))
    return {"message": "Document deleted successfully"}

@app.get("/api/documents/{doc_id}/download")
def download_document(doc_id: int, user: dict = Depends(get_current_user)):
    doc = db.query_one("SELECT * FROM documents WHERE id = ?", (doc_id,))
    if not doc:
        raise HTTPException(status_code=404, detail="Document record not found.")
        
    full_path = os.path.join(BASE_DIR, doc["file_path"])
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Document file does not exist on disk.")
        
    return FileResponse(full_path, filename=doc["file_name"])

# --- Robust Supplier Payment & Vendor Ledger Endpoints ---
@app.get("/api/suppliers/payments")
def list_supplier_payments(
    search: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    sql = "SELECT * FROM supplier_payments WHERE 1=1"
    params = []
    
    if search:
        sql += " AND (company_name LIKE ? OR invoice_number LIKE ? OR invoice_details LIKE ? OR remarks LIKE ?)"
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern, pattern])
        
    if status:
        sql += " AND status = ?"
        params.append(status)
        
    sql += " ORDER BY id DESC"
    raw_payments = db.query_all(sql, tuple(params))
    
    aging_res = SaudiHREngine.calculate_accounts_payable_aging(raw_payments)
    return {
        "summary": aging_res["summary"],
        "payments": aging_res["processed_payments"]
    }

@app.get("/api/suppliers/export/pdf")
def export_supplier_report_pdf(
    suppliers: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    user: dict = Depends(get_current_user)
):
    """Generates an executive Accounts Payable & Supplier Invoices PDF Report with custom vendor selection."""
    sql = "SELECT * FROM supplier_payments WHERE 1=1"
    params = []
    
    selected_names = []
    if suppliers and suppliers.strip() and suppliers.strip().lower() != "all":
        selected_names = [s.strip() for s in suppliers.split(",") if s.strip()]
        if selected_names:
            placeholders = ",".join("?" * len(selected_names))
            sql += f" AND company_name IN ({placeholders})"
            params.extend(selected_names)
            
    if status and status.strip() and status.strip() != "All":
        sql += " AND status = ?"
        params.append(status.strip())
        
    if start_date and start_date.strip():
        sql += " AND invoice_date >= ?"
        params.append(start_date.strip())
        
    if end_date and end_date.strip():
        sql += " AND invoice_date <= ?"
        params.append(end_date.strip())
        
    sql += " ORDER BY company_name ASC, id DESC"
    raw_payments = db.query_all(sql, tuple(params))
    aging_res = SaudiHREngine.calculate_accounts_payable_aging(raw_payments)
    
    setting_rows = db.query_all("SELECT * FROM settings")
    settings = {s["key"]: s["value"] for s in setting_rows}
    
    target_scope_str = ", ".join(selected_names) if selected_names else "All Registered Suppliers"
    date_scope_str = f"{start_date or 'Start'} to {end_date or 'Present'}" if (start_date or end_date) else "All Historical Invoices"
    
    filter_info = {
        "selected_suppliers": target_scope_str,
        "status": status or "All Statuses",
        "date_range": date_scope_str
    }
    
    pdf_bytes = generate_supplier_summary_report_pdf(
        aging_res["processed_payments"],
        aging_res["summary"],
        settings,
        filter_info
    )
    
    filename = f"Accounts_Payable_Report_{date.today().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

# --- Registered Suppliers / Vendors Directory Endpoints ---
@app.get("/api/suppliers")
def list_suppliers(user: dict = Depends(get_current_user)):
    """Lists all registered suppliers/vendors with aggregated invoice and liability stats."""
    suppliers = db.query_all("SELECT * FROM suppliers ORDER BY name ASC")
    
    # Calculate live invoice summaries per supplier
    for sup in suppliers:
        name = sup["name"]
        inv_stats = db.query_one("""
            SELECT COUNT(id) as inv_count,
                   COALESCE(SUM(amount), 0.0) as total_billed,
                   COALESCE(SUM(paid_amount), 0.0) as total_paid,
                   COALESCE(SUM(remaining_amount), 0.0) as total_balance
            FROM supplier_payments
            WHERE company_name = ?
        """, (name,))
        
        sup["invoices_count"] = inv_stats["inv_count"] if inv_stats else 0
        sup["total_billed"] = round(float(inv_stats["total_billed"]), 2) if inv_stats else 0.0
        sup["total_paid"] = round(float(inv_stats["total_paid"]), 2) if inv_stats else 0.0
        sup["total_balance"] = round(float(inv_stats["total_balance"]), 2) if inv_stats else 0.0
        
    return suppliers

@app.post("/api/suppliers")
def create_supplier(req: SupplierCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Supplier / Vendor name is required.")
        
    existing = db.query_one("SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?)", (req.name.strip(),))
    if existing:
        raise HTTPException(status_code=400, detail=f"Supplier '{req.name.strip()}' is already registered.")
        
    sup_id = db.execute_cmd("""
        INSERT INTO suppliers (
            name, contact_person, phone, email, cr_number, vat_number,
            bank_name, iban, payment_terms, address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.name.strip(), req.contact_person, req.phone, req.email,
        req.cr_number, req.vat_number, req.bank_name, req.iban,
        req.payment_terms or "Net 30", req.address, datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    
    return {"message": "Supplier profile created successfully", "id": sup_id}

@app.get("/api/suppliers/{sup_id}")
def get_supplier_detail(sup_id: int, user: dict = Depends(get_current_user)):
    sup = db.query_one("SELECT * FROM suppliers WHERE id = ?", (sup_id,))
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found.")
        
    invoices = db.query_all("SELECT * FROM supplier_payments WHERE company_name = ? ORDER BY id DESC", (sup["name"],))
    return {
        "supplier": sup,
        "invoices": invoices
    }

@app.put("/api/suppliers/{sup_id}")
def update_supplier(sup_id: int, req: SupplierUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    sup = db.query_one("SELECT * FROM suppliers WHERE id = ?", (sup_id,))
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found.")
        
    dup = db.query_one("SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ?", (req.name.strip(), sup_id))
    if dup:
        raise HTTPException(status_code=400, detail=f"Another supplier with name '{req.name.strip()}' already exists.")
        
    old_name = sup["name"]
    new_name = req.name.strip()
    
    db.execute_cmd("""
        UPDATE suppliers SET
            name = ?,
            contact_person = ?,
            phone = ?,
            email = ?,
            cr_number = ?,
            vat_number = ?,
            bank_name = ?,
            iban = ?,
            payment_terms = ?,
            address = ?
        WHERE id = ?
    """, (
        new_name, req.contact_person, req.phone, req.email,
        req.cr_number, req.vat_number, req.bank_name, req.iban,
        req.payment_terms or "Net 30", req.address, sup_id
    ))
    
    # If name changed, update linked supplier_payments
    if old_name != new_name:
        db.execute_cmd("UPDATE supplier_payments SET company_name = ? WHERE company_name = ?", (new_name, old_name))
        
    return {"message": "Supplier profile updated successfully"}

@app.delete("/api/suppliers/{sup_id}")
def delete_supplier(sup_id: int, user: dict = Depends(require_roles(["admin"]))):
    sup = db.query_one("SELECT * FROM suppliers WHERE id = ?", (sup_id,))
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found.")
        
    db.execute_cmd("DELETE FROM suppliers WHERE id = ?", (sup_id,))
    return {"message": f"Supplier '{sup['name']}' deleted successfully."}

@app.get("/api/suppliers/vendors")
def list_vendor_summaries(user: dict = Depends(get_current_user)):
    sql = """
        SELECT company_name,
               COUNT(id) as total_invoices,
               SUM(amount) as total_billed,
               SUM(paid_amount) as total_paid,
               SUM(remaining_amount) as total_outstanding,
               MAX(due_date) as latest_due_date
        FROM supplier_payments
        GROUP BY company_name
        ORDER BY total_outstanding DESC
    """
    return db.query_all(sql)

@app.get("/api/suppliers/vendors/{company_name}/ledger")
def get_vendor_ledger(company_name: str, user: dict = Depends(get_current_user)):
    invoices = db.query_all("SELECT * FROM supplier_payments WHERE company_name = ? ORDER BY id DESC", (company_name,))
    if not invoices:
        raise HTTPException(status_code=404, detail="Vendor company not found.")
        
    invoice_ids = [inv["id"] for inv in invoices]
    placeholders = ",".join("?" * len(invoice_ids))
    logs = db.query_all(f"SELECT * FROM supplier_payment_logs WHERE supplier_payment_id IN ({placeholders}) ORDER BY id DESC", tuple(invoice_ids)) if invoice_ids else []
    
    total_billed = sum(float(i["amount"]) for i in invoices)
    total_paid = sum(float(i["paid_amount"]) for i in invoices)
    total_balance = sum(float(i["remaining_amount"]) for i in invoices)
    
    return {
        "company_name": company_name,
        "summary": {
            "total_invoices_count": len(invoices),
            "total_billed": round(total_billed, 2),
            "total_paid": round(total_paid, 2),
            "total_balance": round(total_balance, 2)
        },
        "invoices": invoices,
        "payment_logs": logs
    }

@app.post("/api/suppliers/vendors/{company_name}/disburse")
def disburse_vendor_lump_sum(
    company_name: str,
    req: SupplierDisburseRequest,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Applies a lump-sum supplier payment across all open/pending invoices 
    using FIFO (First-In, First-Out: oldest invoices settled first).
    """
    if req.payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Disbursal amount must be greater than zero.")
        
    open_invoices = db.query_all("""
        SELECT * FROM supplier_payments 
        WHERE company_name = ? AND remaining_amount > 0 
        ORDER BY invoice_date ASC, id ASC
    """, (company_name,))
    
    if not open_invoices:
        raise HTTPException(status_code=400, detail=f"No outstanding unpaid invoices found for '{company_name}'.")
        
    remaining_to_apply = float(req.payment_amount)
    pay_date = req.payment_date or date.today().strftime("%Y-%m-%d")
    settlements = []
    
    for inv in open_invoices:
        if remaining_to_apply <= 0:
            break
            
        inv_rem = float(inv["remaining_amount"])
        inv_id = inv["id"]
        
        applied_now = min(remaining_to_apply, inv_rem)
        new_paid = float(inv["paid_amount"]) + applied_now
        new_rem = max(0.0, float(inv["amount"]) - new_paid)
        new_status = "Paid" if new_rem == 0 else "Partially Paid"
        
        # Update invoice
        db.execute_cmd("""
            UPDATE supplier_payments 
            SET paid_amount = ?, remaining_amount = ?, status = ?, payment_date = ?
            WHERE id = ?
        """, (new_paid, new_rem, new_status, pay_date, inv_id))
        
        # Log payment transaction
        log_notes = f"{req.notes or 'Vendor settlement'} (Auto-applied SAR {applied_now:,.2f} from lump-sum payment)"
        db.execute_cmd("""
            INSERT INTO supplier_payment_logs (
                supplier_payment_id, payment_amount, payment_date, payment_method, reference_number, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (inv_id, applied_now, pay_date, req.payment_method or "Bank Transfer", req.reference_number or None, log_notes, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        
        settlements.append({
            "invoice_id": inv_id,
            "invoice_number": inv.get("invoice_number"),
            "applied_amount": applied_now,
            "new_remaining": new_rem,
            "status": new_status
        })
        
        remaining_to_apply -= applied_now
        
    return {
        "message": f"Successfully disbursed SAR {req.payment_amount:,.2f} to {company_name} across {len(settlements)} invoice(s).",
        "company_name": company_name,
        "total_disbursed": req.payment_amount,
        "unapplied_credit": max(0.0, remaining_to_apply),
        "settlements": settlements
    }

@app.post("/api/suppliers/payments")
def create_supplier_payment(req: SupplierPaymentCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    if not req.company_name or not req.company_name.strip():
        raise HTTPException(status_code=400, detail="Vendor / Company name is required.")
        
    inv_amount = float(req.amount or 0.0)
    if inv_amount < 0:
        raise HTTPException(status_code=400, detail="Invoice amount cannot be negative.")
        
    inv_date = req.invoice_date.strip() if req.invoice_date and req.invoice_date.strip() else date.today().strftime("%Y-%m-%d")
    
    # Handle Supply Date From & To
    if req.supply_start_date and req.supply_start_date.strip():
        sup_start = req.supply_start_date.strip()
    elif req.supply_date and req.supply_date.strip():
        sup_start = req.supply_date.strip()
    else:
        sup_start = inv_date
        
    if req.supply_end_date and req.supply_end_date.strip():
        sup_end = req.supply_end_date.strip()
    else:
        sup_end = sup_start
        
    sup_date = sup_start
    
    if req.due_date and req.due_date.strip():
        due_date = req.due_date.strip()
    else:
        try:
            due_date = (datetime.strptime(inv_date, "%Y-%m-%d").date() + timedelta(days=30)).strftime("%Y-%m-%d")
        except Exception:
            due_date = (date.today() + timedelta(days=30)).strftime("%Y-%m-%d")
            
    inv_details = req.invoice_details.strip() if req.invoice_details and req.invoice_details.strip() else "General Supplies & Services"
    inv_status = req.status or "Pending"
    
    paid_amt = inv_amount if inv_status == "Paid" else 0.0
    rem_amt = max(0.0, inv_amount - paid_amt)
    
    sp_id = db.execute_cmd("""
        INSERT INTO supplier_payments (
            company_name, invoice_number, invoice_date, due_date, invoice_details,
            supply_date, supply_start_date, supply_end_date, amount, paid_amount, remaining_amount, status, remarks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.company_name.strip(), req.invoice_number or None, inv_date, due_date, inv_details,
        sup_date, sup_start, sup_end, inv_amount, paid_amt, rem_amt, inv_status, req.remarks or None, datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    
    if paid_amt > 0:
        db.execute_cmd("""
            INSERT INTO supplier_payment_logs (
                supplier_payment_id, payment_amount, payment_date, payment_method, reference_number, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (sp_id, paid_amt, inv_date, "Bank Transfer", "Initial Settlement", "Full upfront payment", datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        
    return {"message": "Supplier payment record created successfully", "id": sp_id}

@app.put("/api/suppliers/payments/{sp_id}")
def update_supplier_payment(sp_id: int, req: SupplierPaymentCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp:
        raise HTTPException(status_code=404, detail="Supplier payment record not found.")
        
    inv_amount = float(req.amount or 0.0)
    inv_date = req.invoice_date.strip() if req.invoice_date and req.invoice_date.strip() else sp["invoice_date"]
    
    sup_start = req.supply_start_date.strip() if req.supply_start_date and req.supply_start_date.strip() else (sp.get("supply_start_date") or sp["supply_date"])
    sup_end = req.supply_end_date.strip() if req.supply_end_date and req.supply_end_date.strip() else (sp.get("supply_end_date") or sup_start)
    sup_date = sup_start
    
    due_date = req.due_date.strip() if req.due_date and req.due_date.strip() else sp["due_date"]
    inv_details = req.invoice_details.strip() if req.invoice_details and req.invoice_details.strip() else sp["invoice_details"]
    
    current_paid = float(sp["paid_amount"])
    new_remaining = max(0.0, inv_amount - current_paid)
    
    if new_remaining <= 0:
        new_status = "Paid"
        new_remaining = 0.0
    elif current_paid > 0:
        new_status = "Partially Paid"
    else:
        new_status = req.status or "Pending"
        
    db.execute_cmd("""
        UPDATE supplier_payments SET
            company_name = ?,
            invoice_number = ?,
            invoice_date = ?,
            due_date = ?,
            invoice_details = ?,
            supply_date = ?,
            supply_start_date = ?,
            supply_end_date = ?,
            amount = ?,
            remaining_amount = ?,
            status = ?,
            remarks = ?
        WHERE id = ?
    """, (
        req.company_name.strip(), req.invoice_number or None, inv_date,
        due_date, inv_details, sup_date, sup_start, sup_end, inv_amount, new_remaining,
        new_status, req.remarks or None, sp_id
    ))
    
def add_one_month(date_str: Optional[str]) -> str:
    """Safely increments a YYYY-MM-DD date string by 1 month, capping at the target month's maximum days."""
    if not date_str or not str(date_str).strip():
        return date.today().strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(str(date_str).strip(), "%Y-%m-%d")
        year = dt.year + (dt.month // 12)
        month = (dt.month % 12) + 1
        max_days = calendar.monthrange(year, month)[1]
        day = min(dt.day, max_days)
        return date(year, month, day).strftime("%Y-%m-%d")
    except Exception:
        return (date.today() + timedelta(days=30)).strftime("%Y-%m-%d")

@app.post("/api/suppliers/payments/{sp_id}/repeat-next-month")
def repeat_supplier_payment_next_month(
    sp_id: int,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """Duplicates an existing invoice for the following month with the same amount and automatically calculated next-month dates."""
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp:
        raise HTTPException(status_code=404, detail="Supplier invoice not found.")
        
    next_inv_date = add_one_month(sp["invoice_date"])
    next_due_date = add_one_month(sp["due_date"])
    next_sup_start = add_one_month(sp["supply_start_date"] or sp["supply_date"])
    next_sup_end = add_one_month(sp["supply_end_date"] or sp["supply_date"])
    
    # Generate distinct new invoice number
    old_num = sp.get("invoice_number") or ""
    import random
    new_inv_num = f"{old_num}-REC" if old_num and not old_num.endswith("-REC") else f"INV-{datetime.now().year}-{random.randint(1000, 9999)}"
    
    inv_amount = float(sp["amount"])
    
    new_id = db.execute_cmd("""
        INSERT INTO supplier_payments (
            company_name, invoice_number, invoice_date, due_date, invoice_details,
            supply_date, supply_start_date, supply_end_date, amount, paid_amount,
            remaining_amount, status, remarks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        sp["company_name"], new_inv_num, next_inv_date, next_due_date, sp["invoice_details"],
        next_sup_start, next_sup_start, next_sup_end, inv_amount, 0.0,
        inv_amount, "Pending", f"Recurring monthly bill (Cloned from #{sp_id})",
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    
    return {
        "message": f"Recurring invoice for next month created successfully (Invoice #{new_id})",
        "id": new_id,
        "company_name": sp["company_name"],
        "amount": inv_amount,
        "invoice_number": new_inv_num,
        "invoice_date": next_inv_date,
        "due_date": next_due_date,
        "supply_start_date": next_sup_start,
        "supply_end_date": next_sup_end
    }

@app.post("/api/suppliers/payments/{sp_id}/disburse")
def disburse_supplier_payment(
    sp_id: int,
    req: SupplierDisburseRequest,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp:
        raise HTTPException(status_code=404, detail="Supplier payment record not found.")
        
    if req.payment_amount <= 0:
        raise HTTPException(status_code=400, detail="Disbursal amount must be greater than zero.")
        
    pay_date = req.payment_date or date.today().strftime("%Y-%m-%d")
    
    db.execute_cmd("""
        INSERT INTO supplier_payment_logs (
            supplier_payment_id, payment_amount, payment_date, payment_method, reference_number, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (sp_id, req.payment_amount, pay_date, req.payment_method or "Bank Transfer", req.reference_number, req.notes, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    
    total_paid_row = db.query_one("SELECT SUM(payment_amount) as tot FROM supplier_payment_logs WHERE supplier_payment_id = ?", (sp_id,))
    total_paid = float(total_paid_row["tot"] or 0.0)
    
    invoice_amount = float(sp["amount"])
    new_remaining = max(0.0, invoice_amount - total_paid)
    
    if new_remaining <= 0:
        new_status = "Paid"
        new_remaining = 0.0
    else:
        new_status = "Partially Paid"
        
    db.execute_cmd("""
        UPDATE supplier_payments SET
            paid_amount = ?,
            remaining_amount = ?,
            status = ?,
            payment_date = ?
        WHERE id = ?
    """, (total_paid, new_remaining, new_status, pay_date, sp_id))
    
    return {
        "message": f"Payment of SAR {req.payment_amount:,.2f} disbursed successfully",
        "paid_amount": total_paid,
        "remaining_amount": new_remaining,
        "status": new_status
    }

@app.get("/api/suppliers/payments/{sp_id}/history")
def get_supplier_payment_history(sp_id: int, user: dict = Depends(get_current_user)):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp:
        raise HTTPException(status_code=404, detail="Supplier payment record not found.")
        
    logs = db.query_all("SELECT * FROM supplier_payment_logs WHERE supplier_payment_id = ? ORDER BY id DESC", (sp_id,))
    
    return {
        "supplier_payment": sp,
        "payment_logs": logs
    }

@app.get("/api/suppliers/payments/{sp_id}/statement.pdf")
def download_supplier_statement_pdf(sp_id: int, user: dict = Depends(get_current_user)):
    try:
        doc = DocumentService.render_document("supplier_statement", sp_id, db)
        return Response(content=doc["content"], media_type=doc["media_type"], headers={"Content-Disposition": f"inline; filename={doc['filename']}"})
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/suppliers/payments/{sp_id}/attachment")
async def upload_supplier_invoice_attachment(
    sp_id: int,
    file: UploadFile = File(...),
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp:
        raise HTTPException(status_code=404, detail="Supplier invoice not found.")
        
    orig_filename = os.path.basename(file.filename) if file.filename else "invoice.pdf"
    safe_name = f"INV_{sp_id}_{uuid.uuid4().hex[:8]}_{orig_filename}"
    file_path = os.path.join(UPLOADS_INVOICES_DIR, safe_name)
    
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
        
    db.execute_cmd(
        "UPDATE supplier_payments SET attachment_filename = ?, attachment_path = ? WHERE id = ?",
        (orig_filename, safe_name, sp_id)
    )
    
    return {
        "message": "Invoice attachment uploaded successfully",
        "attachment_filename": orig_filename,
        "download_url": f"/api/suppliers/payments/{sp_id}/attachment"
    }

@app.get("/api/suppliers/payments/{sp_id}/attachment")
def download_supplier_invoice_attachment(
    sp_id: int,
    user: dict = Depends(get_current_user)
):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp or not sp.get("attachment_path"):
        raise HTTPException(status_code=404, detail="No attachment found for this invoice.")
        
    safe_name = sp["attachment_path"]
    full_path = os.path.join(UPLOADS_INVOICES_DIR, safe_name)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Attachment file not found on server disk.")
        
    orig_name = sp.get("attachment_filename") or f"Invoice_{sp_id}.pdf"
    media_type = "application/pdf" if orig_name.lower().endswith(".pdf") else "application/octet-stream"
    
    return FileResponse(
        full_path,
        media_type=media_type,
        filename=orig_name,
        headers={"Content-Disposition": f"inline; filename={orig_name}"}
    )

@app.delete("/api/suppliers/payments/{sp_id}/attachment")
def delete_supplier_invoice_attachment(
    sp_id: int,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if not sp:
        raise HTTPException(status_code=404, detail="Supplier invoice not found.")
        
    if sp.get("attachment_path"):
        full_path = os.path.join(UPLOADS_INVOICES_DIR, sp["attachment_path"])
        if os.path.exists(full_path):
            try:
                os.remove(full_path)
            except Exception:
                pass
                
    db.execute_cmd(
        "UPDATE supplier_payments SET attachment_filename = NULL, attachment_path = NULL WHERE id = ?",
        (sp_id,)
    )
    return {"message": "Invoice attachment removed successfully"}

@app.delete("/api/suppliers/payments/{sp_id}")
def delete_supplier_payment(sp_id: int, user: dict = Depends(require_roles(["admin"]))):
    sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (sp_id,))
    if sp and sp.get("attachment_path"):
        full_path = os.path.join(UPLOADS_INVOICES_DIR, sp["attachment_path"])
        if os.path.exists(full_path):
            try:
                os.remove(full_path)
            except Exception:
                pass
    db.execute_cmd("DELETE FROM supplier_payments WHERE id = ?", (sp_id,))
    return {"message": "Supplier payment record deleted successfully"}

# --- Financial Analytics & Accounts Payable Aging Hub ---
@app.get("/api/finance/analytics")
def get_finance_analytics(user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    supplier_payments = db.query_all("SELECT * FROM supplier_payments ORDER BY id DESC")
    aging_res = SaudiHREngine.calculate_accounts_payable_aging(supplier_payments)
    
    employees = db.query_all("SELECT * FROM employees WHERE status = 'Active'")
    monthly_payroll = sum((e["basic_salary"] + e["housing_allowance"] + e["transport_allowance"] + e["other_allowances"]) for e in employees)
    
    projected_30_day_outflow = monthly_payroll + aging_res["summary"]["total_outstanding_payable"]
    
    return {
        "summary": aging_res["summary"],
        "aging_buckets": aging_res["aging_buckets"],
        "monthly_payroll_commitment": monthly_payroll,
        "projected_30_day_outflow": projected_30_day_outflow,
        "vendor_invoices_count": len(supplier_payments)
    }

# =========================================================================
# ACCOUNTS RECEIVABLE: CLIENT COLLECTIONS & INVOICING HUB
# =========================================================================

@app.get("/api/clients")
def get_clients_directory(user: dict = Depends(get_current_user)):
    """Lists all registered clients with aggregate billed, collected, and receivable balances."""
    clients = db.query_all("""
        SELECT 
            c.*,
            COUNT(ci.id) as total_invoices,
            COALESCE(SUM(ci.total_amount), 0.0) as total_billed,
            COALESCE(SUM(ci.collected_amount), 0.0) as total_collected,
            COALESCE(SUM(ci.remaining_amount), 0.0) as balance_due,
            MAX(ci.invoice_date) as last_invoice_date
        FROM clients c
        LEFT JOIN client_invoices ci ON c.id = ci.client_id
        GROUP BY c.id
        ORDER BY balance_due DESC, c.name ASC
    """)
    return {"clients": clients}

@app.post("/api/clients")
def create_client(req: ClientCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    name = SecuritySanitizer.sanitize_text(req.name)
    if not name:
        raise HTTPException(status_code=400, detail="Client name is required.")
    
    existing = db.query_one("SELECT id FROM clients WHERE name = ?", (name,))
    if existing:
        raise HTTPException(status_code=409, detail="A client with this name already exists.")

    new_id = db.execute_cmd("""
        INSERT INTO clients (
            name, name_ar, contact_person, phone, email, cr_number, vat_number,
            payment_terms, address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name,
        SecuritySanitizer.sanitize_text(req.name_ar),
        SecuritySanitizer.sanitize_text(req.contact_person),
        SecuritySanitizer.sanitize_text(req.phone),
        req.email.strip() if req.email else None,
        SecuritySanitizer.sanitize_text(req.cr_number),
        SecuritySanitizer.sanitize_text(req.vat_number),
        req.payment_terms or "Net 30",
        SecuritySanitizer.sanitize_text(req.address),
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    return {"message": "Client registered successfully", "id": new_id}

@app.put("/api/clients/{client_id}")
def update_client(client_id: int, req: ClientUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    client = db.query_one("SELECT * FROM clients WHERE id = ?", (client_id,))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found.")

    name = SecuritySanitizer.sanitize_text(req.name)
    if not name:
        raise HTTPException(status_code=400, detail="Client name is required.")

    db.execute_cmd("""
        UPDATE clients SET
            name = ?, name_ar = ?, contact_person = ?, phone = ?, email = ?,
            cr_number = ?, vat_number = ?, payment_terms = ?, address = ?
        WHERE id = ?
    """, (
        name,
        SecuritySanitizer.sanitize_text(req.name_ar),
        SecuritySanitizer.sanitize_text(req.contact_person),
        SecuritySanitizer.sanitize_text(req.phone),
        req.email.strip() if req.email else None,
        SecuritySanitizer.sanitize_text(req.cr_number),
        SecuritySanitizer.sanitize_text(req.vat_number),
        req.payment_terms or "Net 30",
        SecuritySanitizer.sanitize_text(req.address),
        client_id
    ))
    # Also update denormalized client_name on invoices
    db.execute_cmd("UPDATE client_invoices SET client_name = ? WHERE client_id = ?", (name, client_id))
    return {"message": "Client profile updated successfully"}

@app.delete("/api/clients/{client_id}")
def delete_client(client_id: int, user: dict = Depends(require_roles(["admin"]))):
    client = db.query_one("SELECT * FROM clients WHERE id = ?", (client_id,))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found.")
    db.execute_cmd("DELETE FROM clients WHERE id = ?", (client_id,))
    return {"message": "Client deleted successfully"}

@app.get("/api/client-invoices")
def get_client_invoices(
    search: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    client_id: Optional[int] = None,
    user: dict = Depends(get_current_user)
):
    """Retrieves client invoices with search and multi-criteria filters."""
    query = """
        SELECT ci.*, c.contact_person, c.phone as client_phone, c.payment_terms
        FROM client_invoices ci
        LEFT JOIN clients c ON ci.client_id = c.id
        WHERE 1=1
    """
    params = []

    if search and search.strip():
        s = f"%{search.strip()}%"
        query += " AND (ci.client_name LIKE ? OR ci.invoice_number LIKE ? OR ci.invoice_details LIKE ?)"
        params.extend([s, s, s])

    if status and status.strip():
        query += " AND ci.status = ?"
        params.append(status.strip())

    if client_id:
        query += " AND ci.client_id = ?"
        params.append(client_id)

    if month and year:
        period_prefix = f"{year:04d}-{month:02d}%"
        query += " AND (ci.invoice_date LIKE ? OR ci.service_period_start LIKE ? OR ci.service_period_end LIKE ?)"
        params.extend([period_prefix, period_prefix, period_prefix])
    elif year:
        year_prefix = f"{year:04d}%"
        query += " AND (ci.invoice_date LIKE ? OR ci.service_period_start LIKE ?)"
        params.extend([year_prefix, year_prefix])

    query += " ORDER BY ci.due_date ASC, ci.invoice_date DESC"
    invoices = db.query_all(query, tuple(params))
    return {"invoices": invoices}

@app.post("/api/client-invoices")
def create_client_invoice(req: ClientInvoiceCreate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    inv_num = SecuritySanitizer.sanitize_text(req.invoice_number)
    if not inv_num:
        raise HTTPException(status_code=400, detail="Invoice number is required.")

    existing = db.query_one("SELECT id FROM client_invoices WHERE invoice_number = ?", (inv_num,))
    if existing:
        raise HTTPException(status_code=409, detail=f"Invoice number '{inv_num}' already exists.")

    client_name = req.client_name.strip()
    client_id = req.client_id
    if not client_id:
        c_row = db.query_one("SELECT id FROM clients WHERE name = ?", (client_name,))
        if c_row:
            client_id = c_row["id"]

    tot = float(req.total_amount or 0.0)
    sub = float(req.subtotal or 0.0)
    if sub <= 0.0 and tot > 0.0:
        sub = round(tot / 1.15, 2)
    vat_amt = float(req.vat_amount or 0.0)
    if vat_amt <= 0.0 and tot > sub:
        vat_amt = round(tot - sub, 2)

    new_id = db.execute_cmd("""
        INSERT INTO client_invoices (
            client_id, client_name, invoice_number, invoice_date, due_date,
            invoice_details, service_period_start, service_period_end,
            subtotal, vat_rate, vat_amount, total_amount, collected_amount,
            remaining_amount, status, remarks, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        client_id,
        client_name,
        inv_num,
        req.invoice_date.strip(),
        req.due_date.strip(),
        SecuritySanitizer.sanitize_text(req.invoice_details),
        req.service_period_start.strip() if req.service_period_start else None,
        req.service_period_end.strip() if req.service_period_end else None,
        sub,
        float(req.vat_rate or 15.0),
        vat_amt,
        tot,
        0.0,
        tot,
        "Pending",
        SecuritySanitizer.sanitize_text(req.remarks),
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    return {"message": "Client invoice issued successfully", "id": new_id}

@app.put("/api/client-invoices/{invoice_id}")
def update_client_invoice(invoice_id: int, req: ClientInvoiceUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    inv = db.query_one("SELECT * FROM client_invoices WHERE id = ?", (invoice_id,))
    if not inv:
        raise HTTPException(status_code=404, detail="Client invoice not found.")

    tot = float(req.total_amount or 0.0)
    sub = float(req.subtotal or 0.0)
    if sub <= 0.0 and tot > 0.0:
        sub = round(tot / 1.15, 2)
    vat_amt = float(req.vat_amount or 0.0)
    if vat_amt <= 0.0 and tot > sub:
        vat_amt = round(tot - sub, 2)

    current_col = float(inv["collected_amount"] or 0.0)
    new_rem = max(0.0, tot - current_col)

    if new_rem <= 0:
        new_status = "Collected"
        new_rem = 0.0
    elif current_col > 0:
        new_status = "Partially Collected"
    else:
        new_status = "Pending"

    db.execute_cmd("""
        UPDATE client_invoices SET
            client_id = ?, client_name = ?, invoice_number = ?, invoice_date = ?,
            due_date = ?, invoice_details = ?, service_period_start = ?, service_period_end = ?,
            subtotal = ?, vat_rate = ?, vat_amount = ?, total_amount = ?,
            remaining_amount = ?, status = ?, remarks = ?
        WHERE id = ?
    """, (
        req.client_id or inv["client_id"],
        req.client_name.strip(),
        req.invoice_number.strip(),
        req.invoice_date.strip(),
        req.due_date.strip(),
        SecuritySanitizer.sanitize_text(req.invoice_details),
        req.service_period_start.strip() if req.service_period_start else None,
        req.service_period_end.strip() if req.service_period_end else None,
        sub,
        float(req.vat_rate or 15.0),
        vat_amt,
        tot,
        new_rem,
        new_status,
        SecuritySanitizer.sanitize_text(req.remarks),
        invoice_id
    ))
    return {"message": "Client invoice updated successfully"}

@app.delete("/api/client-invoices/{invoice_id}")
def delete_client_invoice(invoice_id: int, user: dict = Depends(require_roles(["admin"]))):
    inv = db.query_one("SELECT * FROM client_invoices WHERE id = ?", (invoice_id,))
    if not inv:
        raise HTTPException(status_code=404, detail="Client invoice not found.")
    db.execute_cmd("DELETE FROM client_invoices WHERE id = ?", (invoice_id,))
    return {"message": "Client invoice deleted successfully"}

@app.post("/api/client-invoices/{invoice_id}/record-collection")
def record_client_collection(
    invoice_id: int,
    req: ClientCollectionLogCreate,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """Records an incoming collection payment from a client and auto-adjusts remaining balances."""
    inv = db.query_one("SELECT * FROM client_invoices WHERE id = ?", (invoice_id,))
    if not inv:
        raise HTTPException(status_code=404, detail="Client invoice not found.")

    amt = float(req.payment_amount or 0.0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Collection amount must be greater than zero.")

    col_date = req.payment_date or date.today().strftime("%Y-%m-%d")

    # Record log
    db.execute_cmd("""
        INSERT INTO client_collection_logs (
            client_invoice_id, payment_amount, payment_date, payment_method, reference_number, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        invoice_id,
        amt,
        col_date,
        req.payment_method or "Bank Transfer",
        SecuritySanitizer.sanitize_text(req.reference_number),
        SecuritySanitizer.sanitize_text(req.notes),
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))

    # Recalculate total collected
    tot_row = db.query_one("SELECT SUM(payment_amount) as tot FROM client_collection_logs WHERE client_invoice_id = ?", (invoice_id,))
    total_col = float(tot_row["tot"] or 0.0)
    inv_total = float(inv["total_amount"] or 0.0)
    rem = max(0.0, inv_total - total_col)

    if rem <= 0:
        status = "Collected"
        rem = 0.0
    else:
        status = "Partially Collected"

    db.execute_cmd("""
        UPDATE client_invoices SET
            collected_amount = ?,
            remaining_amount = ?,
            status = ?,
            payment_date = ?
        WHERE id = ?
    """, (total_col, rem, status, col_date, invoice_id))

    return {
        "message": f"Collection of SAR {amt:,.2f} recorded successfully",
        "collected_amount": total_col,
        "remaining_amount": rem,
        "status": status
    }

@app.get("/api/client-invoices/{invoice_id}/logs")
def get_client_invoice_logs(invoice_id: int, user: dict = Depends(get_current_user)):
    inv = db.query_one("SELECT * FROM client_invoices WHERE id = ?", (invoice_id,))
    if not inv:
        raise HTTPException(status_code=404, detail="Client invoice not found.")
    logs = db.query_all("SELECT * FROM client_collection_logs WHERE client_invoice_id = ? ORDER BY payment_date DESC, id DESC", (invoice_id,))
    return {"invoice": inv, "logs": logs}

@app.get("/api/client-collections/monthly-summary")
def get_monthly_client_collection_summary(
    month: Optional[int] = None,
    year: Optional[int] = None,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """Returns the comprehensive monthly collection list, AR aging metrics, and client breakdown."""
    cur_m = month or date.today().month
    cur_y = year or date.today().year
    res = ClientCollectionEngine.get_monthly_collection_summary(cur_m, cur_y, db)
    return res

@app.get("/api/client-collections/monthly-summary/pdf")
def download_client_collection_summary_pdf(
    month: Optional[int] = None,
    year: Optional[int] = None,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """Streams official PDF report of the Monthly Collection Summary List."""
    cur_m = month or date.today().month
    cur_y = year or date.today().year
    summary = ClientCollectionEngine.get_monthly_collection_summary(cur_m, cur_y, db)
    doc = DocumentService.render_document("client_summary", 0, db, month=cur_m, year=cur_y, summary_data=summary)
    return Response(
        content=doc["content"],
        media_type=doc["media_type"],
        headers={"Content-Disposition": f"inline; filename={doc['filename']}"}
    )

@app.get("/api/clients/{client_id}/statement/pdf")
def download_client_statement_pdf(client_id: int, user: dict = Depends(get_current_user)):
    """Streams official Client Statement of Account PDF."""
    statement = ClientCollectionEngine.get_client_statement(client_id, db)
    doc = DocumentService.render_document("client_statement", client_id, db, statement_data=statement)
    return Response(
        content=doc["content"],
        media_type=doc["media_type"],
        headers={"Content-Disposition": f"inline; filename={doc['filename']}"}
    )


# --- Automated Backup & Restoration Endpoints ---
@app.post("/api/backup/google-drive")
def trigger_google_drive_backup(user: dict = Depends(require_roles(["admin"]))):
    try:
        backup_zip_path = generate_full_backup_archive()
        filename = os.path.basename(backup_zip_path)
        download_url = f"/uploads/backups/{filename}"
        
        return {
            "message": "Full system backup archive created successfully!",
            "status": "SUCCESS",
            "backup_filename": filename,
            "backup_download_url": download_url,
            "timestamp": datetime.now().isoformat(),
            "google_drive_status": "Ready for automated sync to user Google Drive"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {str(e)}")

@app.post("/api/backup/restore")
async def restore_system_backup(
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(require_roles(["admin"]))
):
    try:
        if not file:
            raise HTTPException(status_code=400, detail="Please provide a backup ZIP or JSON file.")
            
        contents = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith(".json"):
            dump = json.loads(contents.decode("utf-8"))
        elif filename.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(contents)) as zf:
                if "database_dump.json" not in zf.namelist():
                    raise HTTPException(status_code=400, detail="Invalid backup ZIP: 'database_dump.json' not found.")
                json_bytes = zf.read("database_dump.json")
                dump = json.loads(json_bytes.decode("utf-8"))
        else:
            raise HTTPException(status_code=400, detail="Unsupported backup format. Please upload a .ZIP or .JSON file.")
            
        result = restore_from_backup_dict(dump)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore operation failed: {str(e)}")

# --- Payroll Endpoints ---
@app.get("/api/payroll/runs")
def get_payroll_runs(user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    return db.query_all("SELECT * FROM payroll_runs ORDER BY id DESC")

@app.post("/api/payroll/generate")
def generate_monthly_payroll(req: PayrollRunRequest, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (req.month, req.year))
    if existing:
        raise HTTPException(status_code=400, detail=f"Payroll for {req.month}/{req.year} has already been processed.")
        
    active_emps = db.query_all("SELECT * FROM employees WHERE status = 'Active'")
    if not active_emps:
        raise HTTPException(status_code=400, detail="No active employees found to generate payroll.")
        
    tot_basic = 0.0
    tot_allowances = 0.0
    tot_deductions = 0.0
    tot_net = 0.0
    
    run_id = db.execute_cmd("""
        INSERT INTO payroll_runs (payroll_month, payroll_year, total_basic, total_allowances, total_deductions, total_net_pay, status, processed_at)
        VALUES (?, ?, 0.0, 0.0, 0.0, 0.0, 'Approved', ?)
    """, (req.month, req.year, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    
    for emp in active_emps:
        c_data = CompensationEngine.evaluate_employee_compensation(emp["id"], db)
        
        basic = c_data["basic_salary"]
        meal = c_data["meal_allowance"]
        site = c_data["site_allowance"]
        other = c_data["other_allowances"]
        gross = c_data["gross_salary"]
        gosi_emp = c_data["gosi_employee"]
        gosi_empr = c_data["gosi_employer"]
        wps_ded = c_data["wps_deduction"]
        water_bill = c_data["water_bill"]
        cash_advance = c_data["cash_advance"]
        other_ded = c_data["other_deductions"]
        net = c_data["net_salary"]
        actual_pay = max(0.0, net - cash_advance)
        
        tot_basic += basic
        tot_allowances += (meal + site + other)
        tot_deductions += c_data["total_deductions"]
        tot_net += actual_pay
        
        db.execute_cmd("""
            INSERT INTO payroll_details (
                payroll_run_id, employee_id, basic_salary, housing_allowance,
                transport_allowance, other_allowances, gross_salary,
                gosi_employee, gosi_employer, wps_deduction, water_bill,
                cash_advance, other_deductions, net_salary,
                meal_allowance_pay, adjustment_add, total_pay, actual_pay
            ) VALUES (?, ?, ?, 0.0, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (run_id, emp["id"], basic, other, gross, gosi_emp, gosi_empr, wps_ded, water_bill, cash_advance, other_ded, net, meal, site, gross, actual_pay))
        
    db.execute_cmd("""
        UPDATE payroll_runs SET
            total_basic = ?,
            total_allowances = ?,
            total_deductions = ?,
            total_net_pay = ?
        WHERE id = ?
    """, (tot_basic, tot_allowances, tot_deductions, tot_net, run_id))
    
    return {"message": "Payroll generated and approved successfully", "payroll_run_id": run_id}

@app.delete("/api/payroll/runs/{run_id}")
def delete_payroll_run(run_id: int, user: dict = Depends(require_roles(["admin"]))):
    run = db.query_one("SELECT * FROM payroll_runs WHERE id = ?", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")
        
    db.execute_cmd("DELETE FROM payroll_runs WHERE id = ?", (run_id,))
    return {"message": f"Payroll run for {run['payroll_month']}/{run['payroll_year']} deleted successfully"}

@app.get("/api/payroll/runs/{run_id}/details")
def get_payroll_run_details(run_id: int, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    run = db.query_one("SELECT * FROM payroll_runs WHERE id = ?", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")
        
    items = db.query_all("""
        SELECT pd.*, e.emp_code, e.first_name, e.last_name, e.national_id_iqama, e.is_saudi, e.bank_name, e.iban, d.name as department_name
        FROM payroll_details pd
        JOIN employees e ON pd.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE pd.payroll_run_id = ?
    """, (run_id,))
    
    return {"run": run, "details": items}

@app.get("/api/payroll/monthly-roster")
def get_monthly_payroll_roster(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2050),
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Returns the monthly worker payroll roster for a specific month and year.
    """
    run = db.query_one("SELECT * FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (month, year))
    
    if not run:
        return {
            "month": month,
            "year": year,
            "has_run": False,
            "run": None,
            "workers": [],
            "summary": {
                "total_workers": 0,
                "total_basic": 0.0,
                "total_allowances": 0.0,
                "total_gross": 0.0,
                "total_gosi": 0.0,
                "total_other_ded": 0.0,
                "total_net": 0.0
            }
        }
        
    workers = db.query_all("""
        SELECT pd.*, e.emp_code, e.first_name, e.last_name, e.national_id_iqama, e.is_saudi, e.designation,
               e.bank_name, e.iban, d.name as department_name
        FROM payroll_details pd
        JOIN employees e ON pd.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE pd.payroll_run_id = ?
        ORDER BY e.emp_code ASC, e.id ASC
    """, (run["id"],))
    
    tot_basic = sum(float(w["basic_salary"]) for w in workers)
    tot_housing = sum(float(w["housing_allowance"]) for w in workers)
    tot_transport = sum(float(w["transport_allowance"]) for w in workers)
    tot_other_allow = sum(float(w["other_allowances"]) for w in workers)
    tot_gross = sum(float(w["gross_salary"]) for w in workers)
    tot_gosi = sum(float(w["gosi_employee"]) for w in workers)
    tot_other_ded = sum(float(w["other_deductions"]) for w in workers)
    tot_net = sum(float(w["net_salary"]) for w in workers)
    
    return {
        "month": month,
        "year": year,
        "has_run": True,
        "run": run,
        "workers": workers,
        "summary": {
            "total_workers": len(workers),
            "total_basic": round(tot_basic, 2),
            "total_housing": round(tot_housing, 2),
            "total_allowances": round(tot_housing + tot_transport + tot_other_allow, 2),
            "total_gross": round(tot_gross, 2),
            "total_gosi": round(tot_gosi, 2),
            "total_other_ded": round(tot_other_ded, 2),
            "total_net": round(tot_net, 2)
        }
    }

@app.post("/api/payroll/monthly-roster/populate")
def populate_monthly_payroll_roster(
    req: PayrollRunRequest,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Auto-populates the monthly roster with all active employees and computes their standard contract salary & GOSI.
    """
    active_emps = db.query_all("SELECT * FROM employees WHERE status = 'Active'")
    if not active_emps:
        raise HTTPException(status_code=400, detail="No active employees found to populate payroll.")
        
    run = db.query_one("SELECT * FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (req.month, req.year))
    if not run:
        run_id = db.execute_cmd("""
            INSERT INTO payroll_runs (payroll_month, payroll_year, total_basic, total_allowances, total_deductions, total_net_pay, status, processed_at)
            VALUES (?, ?, 0.0, 0.0, 0.0, 0.0, 'Approved', ?)
        """, (req.month, req.year, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    else:
        run_id = run["id"]
        
    for emp in active_emps:
        existing_detail = db.query_one("SELECT id FROM payroll_details WHERE payroll_run_id = ? AND employee_id = ?", (run_id, emp["id"]))
        if existing_detail:
            continue  # Keep existing adjusted values if already populated
            
        c_data = CompensationEngine.evaluate_employee_compensation(emp["id"], db)
        basic = c_data["basic_salary"]
        meal = c_data["meal_allowance"]
        site = c_data["site_allowance"]
        other = c_data["other_allowances"]
        gross = c_data["gross_salary"]
        gosi_emp = c_data["gosi_employee"]
        gosi_empr = c_data["gosi_employer"]
        wps_ded = c_data["wps_deduction"]
        water_bill = c_data["water_bill"]
        cash_advance = c_data["cash_advance"]
        other_ded = c_data["other_deductions"]
        net = c_data["net_salary"]
        actual_pay = max(0.0, net - cash_advance)
        
        db.execute_cmd("""
            INSERT INTO payroll_details (
                payroll_run_id, employee_id, basic_salary, housing_allowance,
                transport_allowance, other_allowances, gross_salary,
                gosi_employee, gosi_employer, wps_deduction, water_bill,
                cash_advance, other_deductions, net_salary,
                meal_allowance_pay, adjustment_add, total_pay, actual_pay
            ) VALUES (?, ?, ?, 0.0, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (run_id, emp["id"], basic, other, gross, gosi_emp, gosi_empr, wps_ded, water_bill, cash_advance, other_ded, net, meal, site, gross, actual_pay))
        
    # Recompute parent run totals
    details = db.query_all("SELECT * FROM payroll_details WHERE payroll_run_id = ?", (run_id,))
    tot_basic = sum(float(d["basic_salary"]) for d in details)
    tot_allowances = sum(float(d["other_allowances"] or 0.0) + float(d.get("meal_allowance_pay") or 0.0) + float(d.get("adjustment_add") or 0.0) for d in details)
    tot_deductions = sum(float(d.get("gosi_employee") or 0.0) + float(d.get("wps_deduction") or 0.0) + float(d.get("water_bill") or 0.0) + float(d.get("cash_advance") or 0.0) + float(d.get("other_deductions") or 0.0) for d in details)
    tot_net = sum(float(d.get("actual_pay") or d["net_salary"]) for d in details)
    
    db.execute_cmd("""
        UPDATE payroll_runs SET
            total_basic = ?,
            total_allowances = ?,
            total_deductions = ?,
            total_net_pay = ?
        WHERE id = ?
    """, (tot_basic, tot_allowances, tot_deductions, tot_net, run_id))
    
    return {"message": f"Successfully populated payroll for {len(details)} workers for {req.month}/{req.year}", "run_id": run_id}

@app.post("/api/payroll/monthly-roster/worker")
def save_worker_monthly_pay(
    req: WorkerMonthlyPayRequest,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Adds or updates an individual worker's full industrial payslip breakdown for a specific month.
    """
    emp = db.query_one("SELECT * FROM employees WHERE id = ?", (req.employee_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee record not found.")
        
    run = db.query_one("SELECT * FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (req.month, req.year))
    if not run:
        run_id = db.execute_cmd("""
            INSERT INTO payroll_runs (payroll_month, payroll_year, total_basic, total_allowances, total_deductions, total_net_pay, status, processed_at)
            VALUES (?, ?, 0.0, 0.0, 0.0, 0.0, 'Approved', ?)
        """, (req.month, req.year, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    else:
        run_id = run["id"]
        
    basic = max(0.0, float(req.basic_salary))
    days_worked = float(req.days_worked or 30.0)
    cutoff_period = req.cutoff_period or f"{datetime(req.year, req.month, 1).strftime('%B 01')}-{calendar.monthrange(req.year, req.month)[1]}, {req.year}"
    
    daily_rate = float(req.daily_rate if req.daily_rate is not None else (basic / 30.0 if basic > 0 else 83.33333333))
    hourly_rate = float(req.hourly_rate if req.hourly_rate is not None else (daily_rate / 8.0 if daily_rate > 0 else 10.42))
    ot_rate = float(req.ot_rate if req.ot_rate is not None else round(hourly_rate * 1.5, 2))
    
    working_hours = float(req.working_hours if req.working_hours is not None else (days_worked * 8.0))
    regular_pay = float(req.regular_pay if req.regular_pay is not None else round(working_hours * hourly_rate, 2))
    
    ot_hours = float(req.ot_hours or 0.0)
    ot_pay = float(req.ot_pay if req.ot_pay is not None else round(ot_hours * ot_rate, 2))
    subtotal_pay = round(regular_pay + ot_pay, 2)
    
    rest_day_hours = float(req.rest_day_hours or 0.0)
    rest_day_rate = float(req.rest_day_rate if req.rest_day_rate is not None else hourly_rate)
    rest_day_pay = float(req.rest_day_pay if req.rest_day_pay is not None else round(rest_day_hours * rest_day_rate, 2))
    
    holiday_hours = float(req.holiday_hours or 0.0)
    holiday_rate = float(req.holiday_rate if req.holiday_rate is not None else hourly_rate)
    holiday_pay = float(req.holiday_pay if req.holiday_pay is not None else round(holiday_hours * holiday_rate, 2))
    
    meal_allowance_qty = float(req.meal_allowance_qty or 0.0)
    meal_allowance_rate = float(req.meal_allowance_rate if req.meal_allowance_rate is not None else (10.0 if meal_allowance_qty > 0 else 0.0))
    meal_allowance_pay = float(req.meal_allowance_pay if req.meal_allowance_pay is not None else round(meal_allowance_qty * meal_allowance_rate, 2))
    
    adjustment_add = float(req.adjustment_add if req.adjustment_add is not None else float(req.other_allowances or 0.0))
    total_pay = float(req.total_pay if req.total_pay is not None else round(subtotal_pay + rest_day_pay + holiday_pay + meal_allowance_pay + adjustment_add, 2))
    
    wps_deduction = float(req.wps_deduction or 0.0)
    water_bill = float(req.water_bill or 0.0)
    other_ded = float(req.other_deductions or 0.0)
    
    # For Direct/site workers or explicit 0 deductions, strictly use input deductions
    gosi_emp = 0.0
    gosi_empr = 0.0
    if emp["is_saudi"] == 1 and req.worker_type != "Direct":
        gosi_res = SaudiHREngine.calculate_gosi(True, basic, 0.0)
        gosi_emp = gosi_res["employee_deduction"]
        gosi_empr = gosi_res["employer_contribution"]
    
    total_deductions = round(wps_deduction + water_bill + gosi_emp + other_ded, 2)
    net_pay = max(0.0, round(total_pay - total_deductions, 2))
    
    cash_advance = float(req.cash_advance or 0.0)
    adjustment_sub = float(req.adjustment_sub or 0.0)
    actual_pay = max(0.0, round(net_pay - cash_advance - adjustment_sub, 2))
    
    housing = 0.0
    transport = 0.0
    other_allow = meal_allowance_pay + adjustment_add
    gross = total_pay
    
    existing_detail = db.query_one("SELECT id FROM payroll_details WHERE payroll_run_id = ? AND employee_id = ?", (run_id, req.employee_id))
    if existing_detail:
        db.execute_cmd("""
            UPDATE payroll_details SET
                basic_salary = ?,
                housing_allowance = 0.0,
                transport_allowance = 0.0,
                other_allowances = ?,
                gross_salary = ?,
                gosi_employee = ?,
                gosi_employer = ?,
                other_deductions = ?,
                net_salary = ?,
                cutoff_period = ?,
                days_worked = ?,
                daily_rate = ?,
                hourly_rate = ?,
                ot_rate = ?,
                working_hours = ?,
                regular_pay = ?,
                ot_hours = ?,
                ot_pay = ?,
                subtotal_pay = ?,
                rest_day_hours = ?,
                rest_day_pay = ?,
                holiday_hours = ?,
                holiday_pay = ?,
                meal_allowance_qty = ?,
                meal_allowance_rate = ?,
                meal_allowance_pay = ?,
                adjustment_add = ?,
                total_pay = ?,
                wps_deduction = ?,
                water_bill = ?,
                total_deductions = ?,
                cash_advance = ?,
                adjustment_sub = ?,
                actual_pay = ?
            WHERE id = ?
        """, (
            basic, housing, transport, other_allow, gross, gosi_emp, gosi_empr, other_ded, net_pay,
            cutoff_period, days_worked, daily_rate, hourly_rate, ot_rate, working_hours, regular_pay,
            ot_hours, ot_pay, subtotal_pay, rest_day_hours, rest_day_pay, holiday_hours, holiday_pay,
            meal_allowance_qty, meal_allowance_rate, meal_allowance_pay, adjustment_add, total_pay,
            wps_deduction, water_bill, total_deductions, cash_advance, adjustment_sub, actual_pay,
            existing_detail["id"]
        ))
        detail_id = existing_detail["id"]
    else:
        detail_id = db.execute_cmd("""
            INSERT INTO payroll_details (
                payroll_run_id, employee_id, basic_salary, housing_allowance,
                transport_allowance, other_allowances, gross_salary,
                gosi_employee, gosi_employer, other_deductions, net_salary,
                cutoff_period, days_worked, daily_rate, hourly_rate, ot_rate,
                working_hours, regular_pay, ot_hours, ot_pay, subtotal_pay,
                rest_day_hours, rest_day_pay, holiday_hours, holiday_pay,
                meal_allowance_qty, meal_allowance_rate, meal_allowance_pay,
                adjustment_add, total_pay, wps_deduction, water_bill,
                total_deductions, cash_advance, adjustment_sub, actual_pay
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            run_id, req.employee_id, basic, housing, transport, other_allow, gross, gosi_emp, gosi_empr, other_ded, net_pay,
            cutoff_period, days_worked, daily_rate, hourly_rate, ot_rate, working_hours, regular_pay,
            ot_hours, ot_pay, subtotal_pay, rest_day_hours, rest_day_pay, holiday_hours, holiday_pay,
            meal_allowance_qty, meal_allowance_rate, meal_allowance_pay, adjustment_add, total_pay,
            wps_deduction, water_bill, total_deductions, cash_advance, adjustment_sub, actual_pay
        ))
        
    # Recompute parent run totals
    details = db.query_all("SELECT * FROM payroll_details WHERE payroll_run_id = ?", (run_id,))
    tot_basic = sum(float(d["basic_salary"]) for d in details)
    tot_allowances = sum(float(d["housing_allowance"] or 0) + float(d["transport_allowance"] or 0) + float(d["other_allowances"] or 0) for d in details)
    tot_deductions = sum(float(d["gosi_employee"] or 0) + float(d["other_deductions"] or 0) for d in details)
    tot_net = sum(float(d["net_salary"] or 0) for d in details)
    
    db.execute_cmd("""
        UPDATE payroll_runs SET
            total_basic = ?,
            total_allowances = ?,
            total_deductions = ?,
            total_net_pay = ?
        WHERE id = ?
    """, (tot_basic, tot_allowances, tot_deductions, tot_net, run_id))
    
    return {
        "message": f"Successfully updated monthly payroll for {emp['first_name']} {emp['last_name']}",
        "detail_id": detail_id,
        "net_salary": net_pay,
        "actual_pay": actual_pay
    }

@app.delete("/api/payroll/monthly-roster/worker/{detail_id}")
def delete_worker_monthly_pay(
    detail_id: int,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Removes a worker from the monthly payroll roster.
    """
    detail = db.query_one("SELECT * FROM payroll_details WHERE id = ?", (detail_id,))
    if not detail:
        raise HTTPException(status_code=404, detail="Payroll detail item not found.")
        
    run_id = detail["payroll_run_id"]
    db.execute_cmd("DELETE FROM payroll_details WHERE id = ?", (detail_id,))
    
    # Recompute parent run totals
    details = db.query_all("SELECT * FROM payroll_details WHERE payroll_run_id = ?", (run_id,))
    tot_basic = sum(float(d["basic_salary"] or 0) for d in details)
    tot_allowances = sum(float(d["housing_allowance"] or 0) + float(d["transport_allowance"] or 0) + float(d["other_allowances"] or 0) for d in details)
    tot_deductions = sum(float(d["gosi_employee"] or 0) + float(d["other_deductions"] or 0) for d in details)
    tot_net = sum(float(d["net_salary"] or 0) for d in details)
    
    db.execute_cmd("""
        UPDATE payroll_runs SET
            total_basic = ?,
            total_allowances = ?,
            total_deductions = ?,
            total_net_pay = ?
        WHERE id = ?
    """, (tot_basic, tot_allowances, tot_deductions, tot_net, run_id))
    
    return {"message": "Worker removed from this month's payroll roster."}

# =========================================================================
# WORKER DAILY TIMESHEET ATTENDANCE CALENDAR & PAYROLL ENGINE
# =========================================================================
@app.get("/api/payroll/timesheet")
def get_worker_timesheet(
    employee_id: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2050),
    user: dict = Depends(require_roles(["admin", "hr_manager", "viewer"]))
):
    """
    Retrieves the daily attendance & working hours calendar for an employee in a given month.
    Combines existing logged records with default dates for full calendar display.
    """
    emp = db.query_one("""
        SELECT e.*, d.name as department_name 
        FROM employees e 
        LEFT JOIN departments d ON e.department_id = d.id 
        WHERE e.id = ?
    """, (employee_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    num_days = calendar.monthrange(year, month)[1]
    
    # Query logged daily timesheets
    logged_rows = db.query_all("""
        SELECT * FROM worker_timesheets 
        WHERE employee_id = ? AND year = ? AND month = ?
        ORDER BY day ASC
    """, (employee_id, year, month))
    logged_map = {row["day"]: row for row in logged_rows}
    
    # Check if a payroll detail record already exists for this worker & month
    run = db.query_one("SELECT * FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (month, year))
    detail = None
    if run:
        detail = db.query_one("SELECT * FROM payroll_details WHERE payroll_run_id = ? AND employee_id = ?", (run["id"], employee_id))
        
    # Build complete calendar days
    calendar_days = []
    for day in range(1, num_days + 1):
        dt = date(year, month, day)
        weekday_name = dt.strftime("%a")  # Mon, Tue, etc.
        is_friday = dt.weekday() == 4     # In Saudi Arabia, Friday is rest day (weekday 4 in Python)
        
        if day in logged_map:
            rec = logged_map[day]
            calendar_days.append({
                "day": day,
                "date": rec["timesheet_date"],
                "weekday": weekday_name,
                "regular_hours": rec["regular_hours"],
                "ot_hours": rec["ot_hours"],
                "day_type": rec["day_type"],
                "meal_allowance": rec["meal_allowance"],
                "notes": rec.get("notes") or ""
            })
        else:
            # Default suggestion: Fridays are RestDay, other days are Regular 8.0h
            def_type = "RestDay" if is_friday else "Regular"
            def_hours = 0.0 if is_friday else 8.0
            calendar_days.append({
                "day": day,
                "date": dt.isoformat(),
                "weekday": weekday_name,
                "regular_hours": def_hours,
                "ot_hours": 0.0,
                "day_type": def_type,
                "meal_allowance": 0 if is_friday else 1,
                "notes": ""
            })
            
    base_sal = float(emp["basic_salary"] or 0)
    worker_type = emp.get("worker_type") or "Direct"
    
    if worker_type == "Direct":
        # Direct: Rate depends on Monthly Basic / 30, then / 8
        daily_rate = float(detail.get("daily_rate") or (base_sal / 30.0 if base_sal > 0 else 83.33333333)) if detail else (base_sal / 30.0 if base_sal > 0 else 83.33333333)
        hourly_rate = float(detail.get("hourly_rate") or (daily_rate / 8.0 if daily_rate > 0 else 10.42)) if detail else (daily_rate / 8.0 if daily_rate > 0 else 10.42)
        ot_rate = float(detail.get("ot_rate") or round(hourly_rate * 1.5, 2)) if detail else round(hourly_rate * 1.5, 2)
    else:
        # Indirect: Regular only and hourly
        daily_rate = float(detail.get("daily_rate") or (base_sal / 30.0 if base_sal > 0 else 0.0)) if detail else (base_sal / 30.0 if base_sal > 0 else 0.0)
        hourly_rate = float(detail.get("hourly_rate") or (base_sal / 240.0 if base_sal > 0 else 25.0)) if detail else (base_sal / 240.0 if base_sal > 0 else 25.0)
        ot_rate = 0.0  # Indirect workers are regular only
    
    return {
        "employee": {
            "id": emp["id"],
            "emp_code": emp["emp_code"],
            "first_name": emp["first_name"],
            "last_name": emp["last_name"],
            "designation": emp["designation"] or "Electrician Foreman",
            "department_name": emp.get("department_name") or "Operations",
            "is_saudi": emp["is_saudi"],
            "worker_type": worker_type,
            "basic_salary": base_sal,
            "daily_rate": daily_rate,
            "hourly_rate": hourly_rate,
            "ot_rate": ot_rate
        },
        "month": month,
        "year": year,
        "days": calendar_days,
        "detail": detail
    }

@app.post("/api/payroll/timesheet/bulk-save")
def save_worker_timesheet_and_payroll(
    req: BulkTimesheetSaveRequest,
    user: dict = Depends(require_roles(["admin", "hr_manager"]))
):
    """
    Saves daily attendance & hours timesheet for an employee and automatically calculates
    the monthly payslip breakdown and updates the monthly payroll run.
    """
    emp = db.query_one("SELECT * FROM employees WHERE id = ?", (req.employee_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    # 1. Upsert daily timesheet records
    for d in req.days:
        db.execute_cmd("""
            INSERT INTO worker_timesheets (
                employee_id, timesheet_date, year, month, day,
                regular_hours, ot_hours, day_type, meal_allowance, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, timesheet_date) DO UPDATE SET
                regular_hours = excluded.regular_hours,
                ot_hours = excluded.ot_hours,
                day_type = excluded.day_type,
                meal_allowance = excluded.meal_allowance,
                notes = excluded.notes;
        """, (
            req.employee_id, d.date, req.year, req.month, d.day,
            float(d.regular_hours or 0), float(d.ot_hours or 0),
            d.day_type or "Regular", int(d.meal_allowance or 0), d.notes or ""
        ))
        
    # 2. Aggregate timesheet totals & Saudi Friday Paid Rest Day Rule
    days_by_num = {d.day: d for d in req.days}
    tot_regular_hours = 0.0
    tot_ot_hours = sum(float(d.ot_hours or 0) for d in req.days)
    tot_rest_day_hours = 0.0
    tot_holiday_hours = 0.0

    for d in req.days:
        reg_h = float(d.regular_hours or 0)
        dt = date(req.year, req.month, d.day)
        is_friday = (dt.weekday() == 4)  # 4 is Friday in Python datetime

        if d.day_type == 'Holiday':
            tot_holiday_hours += (reg_h if reg_h > 0 else 8.0)
        elif d.day_type == 'RestDay' or is_friday:
            if reg_h > 0:
                # Explicit hours entered
                tot_rest_day_hours += reg_h
            else:
                # Friday Paid Rest Day Policy:
                # Paid if employee was NOT absent on Thursday (day - 1) AND Saturday (day + 1)
                thu = days_by_num.get(d.day - 1)
                sat = days_by_num.get(d.day + 1)
                
                thu_absent = (thu is not None and (thu.day_type == 'Absent' or (float(thu.regular_hours or 0) == 0 and thu.day_type not in ['Holiday', 'Leave', 'RestDay'])))
                sat_absent = (sat is not None and (sat.day_type == 'Absent' or (float(sat.regular_hours or 0) == 0 and sat.day_type not in ['Holiday', 'Leave', 'RestDay'])))
                
                if not thu_absent and not sat_absent:
                    tot_rest_day_hours += 8.0  # Paid Friday Rest Day
                else:
                    tot_rest_day_hours += 0.0  # Unpaid due to absence on Thu or Sat
        else:
            tot_regular_hours += reg_h

    # Days worked: any day where regular hours > 0 or marked Regular
    days_worked = sum(1 for d in req.days if float(d.regular_hours or 0) > 0 or d.day_type == 'Regular')
    
    # Meal allowances count
    tot_meal_qty = sum(1 for d in req.days if int(d.meal_allowance or 0) == 1)
    
    # 3. Rates & Financial Calculations
    base_sal = float(emp["basic_salary"] or 0)
    daily_rate = float(req.daily_rate if req.daily_rate is not None else (base_sal / 30.0 if base_sal > 0 else 83.33333333))
    hourly_rate = float(req.hourly_rate if req.hourly_rate is not None else (daily_rate / 8.0 if daily_rate > 0 else 10.42))
    ot_rate = float(req.ot_rate if req.ot_rate is not None else round(hourly_rate * 1.5, 2))
    
    regular_pay = round(tot_regular_hours * hourly_rate, 2)
    ot_pay = round(tot_ot_hours * ot_rate, 2)
    subtotal_pay = round(regular_pay + ot_pay, 2)
    
    rest_day_pay = round(tot_rest_day_hours * hourly_rate, 2)
    holiday_pay = round(tot_holiday_hours * hourly_rate, 2)
    
    meal_rate = float(req.meal_rate or 10.0)
    meal_allowance_pay = round(tot_meal_qty * meal_rate, 2)
    
    adjustment_add = float(req.adjustment_add or 0.0)
    total_pay = round(subtotal_pay + rest_day_pay + holiday_pay + meal_allowance_pay + adjustment_add, 2)
    
    # Deductions: strictly sum explicit deduction inputs (no unexpected auto-deductions)
    wps_deduction = float(req.wps_deduction or 0.0)
    water_bill = float(req.water_bill or 0.0)
    other_ded = float(req.other_deductions or 0.0)
    
    gosi_emp = 0.0
    gosi_empr = 0.0
    if emp["is_saudi"] == 1 and req.worker_type != "Direct":
        gosi_res = SaudiHREngine.calculate_gosi(True, total_pay, 0.0)
        gosi_emp = gosi_res["employee_deduction"]
        gosi_empr = gosi_res["employer_contribution"]
    
    total_deductions = round(wps_deduction + water_bill + other_ded + gosi_emp, 2)
    net_pay = max(0.0, round(total_pay - total_deductions, 2))
    
    cash_advance = float(req.cash_advance or 0.0)
    adjustment_sub = float(req.adjustment_sub or 0.0)
    actual_pay = max(0.0, round(net_pay - cash_advance - adjustment_sub, 2))
    
    # 4. Sync with Payroll Run & Payroll Details
    run = db.query_one("SELECT * FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (req.month, req.year))
    if not run:
        run_id = db.execute_cmd("""
            INSERT INTO payroll_runs (payroll_month, payroll_year, total_basic, total_allowances, total_deductions, total_net_pay, status, processed_at)
            VALUES (?, ?, 0.0, 0.0, 0.0, 0.0, 'Approved', ?)
        """, (req.month, req.year, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    else:
        run_id = run["id"]
        
    cutoff_period = req.cutoff_period or f"{datetime(req.year, req.month, 1).strftime('%B 01')}-{calendar.monthrange(req.year, req.month)[1]}, {req.year}"
    
    existing_detail = db.query_one("SELECT id FROM payroll_details WHERE payroll_run_id = ? AND employee_id = ?", (run_id, req.employee_id))
    if existing_detail:
        db.execute_cmd("""
            UPDATE payroll_details SET
                basic_salary = ?,
                housing_allowance = ?,
                transport_allowance = ?,
                other_allowances = ?,
                gross_salary = ?,
                gosi_employee = ?,
                gosi_employer = ?,
                other_deductions = ?,
                net_salary = ?,
                cutoff_period = ?,
                days_worked = ?,
                daily_rate = ?,
                hourly_rate = ?,
                ot_rate = ?,
                working_hours = ?,
                regular_pay = ?,
                ot_hours = ?,
                ot_pay = ?,
                subtotal_pay = ?,
                rest_day_hours = ?,
                rest_day_pay = ?,
                holiday_hours = ?,
                holiday_pay = ?,
                meal_allowance_qty = ?,
                meal_allowance_rate = ?,
                meal_allowance_pay = ?,
                adjustment_add = ?,
                total_pay = ?,
                wps_deduction = ?,
                water_bill = ?,
                total_deductions = ?,
                cash_advance = ?,
                adjustment_sub = ?,
                actual_pay = ?
            WHERE id = ?
        """, (
            regular_pay, meal_allowance_pay, 0.0, adjustment_add, total_pay, gosi_emp, gosi_empr, other_ded, net_pay,
            cutoff_period, days_worked, daily_rate, hourly_rate, ot_rate, tot_regular_hours, regular_pay,
            tot_ot_hours, ot_pay, subtotal_pay, tot_rest_day_hours, rest_day_pay, tot_holiday_hours, holiday_pay,
            tot_meal_qty, meal_rate, meal_allowance_pay, adjustment_add, total_pay,
            wps_deduction, water_bill, total_deductions, cash_advance, adjustment_sub, actual_pay,
            existing_detail["id"]
        ))
        detail_id = existing_detail["id"]
    else:
        detail_id = db.execute_cmd("""
            INSERT INTO payroll_details (
                payroll_run_id, employee_id, basic_salary, housing_allowance,
                transport_allowance, other_allowances, gross_salary,
                gosi_employee, gosi_employer, other_deductions, net_salary,
                cutoff_period, days_worked, daily_rate, hourly_rate, ot_rate,
                working_hours, regular_pay, ot_hours, ot_pay, subtotal_pay,
                rest_day_hours, rest_day_pay, holiday_hours, holiday_pay,
                meal_allowance_qty, meal_allowance_rate, meal_allowance_pay,
                adjustment_add, total_pay, wps_deduction, water_bill,
                total_deductions, cash_advance, adjustment_sub, actual_pay
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            run_id, req.employee_id, regular_pay, meal_allowance_pay, 0.0, adjustment_add, total_pay, gosi_emp, gosi_empr, other_ded, net_pay,
            cutoff_period, days_worked, daily_rate, hourly_rate, ot_rate, tot_regular_hours, regular_pay,
            tot_ot_hours, ot_pay, subtotal_pay, tot_rest_day_hours, rest_day_pay, tot_holiday_hours, holiday_pay,
            tot_meal_qty, meal_rate, meal_allowance_pay, adjustment_add, total_pay,
            wps_deduction, water_bill, total_deductions, cash_advance, adjustment_sub, actual_pay
        ))
        
    # Recompute parent run totals
    details = db.query_all("SELECT * FROM payroll_details WHERE payroll_run_id = ?", (run_id,))
    tot_basic = sum(float(d["basic_salary"] or 0) for d in details)
    tot_allowances = sum(float(d["housing_allowance"] or 0) + float(d["transport_allowance"] or 0) + float(d["other_allowances"] or 0) for d in details)
    tot_deductions = sum(float(d["gosi_employee"] or 0) + float(d["other_deductions"] or 0) for d in details)
    tot_net = sum(float(d["net_salary"] or 0) for d in details)
    
    db.execute_cmd("""
        UPDATE payroll_runs SET
            total_basic = ?,
            total_allowances = ?,
            total_deductions = ?,
            total_net_pay = ?
        WHERE id = ?
    """, (tot_basic, tot_allowances, tot_deductions, tot_net, run_id))
    
    return {
        "message": f"Timesheet calendar and payslip saved for {emp['first_name']} {emp['last_name']}",
        "detail_id": detail_id,
        "total_pay": total_pay,
        "net_pay": net_pay,
        "actual_pay": actual_pay,
        "working_hours": tot_regular_hours,
        "ot_hours": tot_ot_hours,
        "days_worked": days_worked
    }

@app.get("/api/payroll/monthly-roster/export/pdf")
def export_monthly_payroll_schedule_pdf(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2050),
    user: dict = Depends(get_current_user)
):
    """
    Generates an executive consolidated Monthly Payroll Schedule PDF using Playwright.
    """
    run = db.query_one("SELECT * FROM payroll_runs WHERE payroll_month = ? AND payroll_year = ?", (month, year))
    if not run:
        workers = []
    else:
        workers = db.query_all("""
            SELECT pd.*, e.emp_code, e.first_name, e.last_name, e.national_id_iqama, e.is_saudi, e.designation,
                   e.bank_name, e.iban, d.name as department_name
            FROM payroll_details pd
            JOIN employees e ON pd.employee_id = e.id
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE pd.payroll_run_id = ?
            ORDER BY e.emp_code ASC, e.id ASC
        """, (run["id"],))
        
    setting_rows = db.query_all("SELECT * FROM settings")
    settings = {s["key"]: s["value"] for s in setting_rows}
    
    pdf_bytes = generate_monthly_payroll_schedule_pdf(month, year, workers, settings)
    filename = f"ADK_Payroll_Schedule_{month:02d}_{year}.pdf"
    
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={filename}"})

@app.get("/api/payroll/details/{detail_id}/payslip.pdf")
def download_payslip_pdf(
    detail_id: int,
    user: dict = Depends(get_current_user)
):
    try:
        doc = DocumentService.render_document("payslip", detail_id, db)
        return Response(content=doc["content"], media_type=doc["media_type"], headers={"Content-Disposition": f"inline; filename={doc['filename']}"})
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/payroll/runs/{run_id}/wps.csv")
def download_wps_file(run_id: int, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    run = db.query_one("SELECT * FROM payroll_runs WHERE id = ?", (run_id,))
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found.")
        
    items = db.query_all("""
        SELECT pd.*, e.emp_code, e.first_name, e.last_name, e.national_id_iqama, e.bank_name, e.iban
        FROM payroll_details pd
        JOIN employees e ON pd.employee_id = e.id
        WHERE pd.payroll_run_id = ?
    """, (run_id,))
    
    records = []
    for item in items:
        records.append({
            "national_id_iqama": item["national_id_iqama"],
            "emp_name": f"{item['first_name']} {item['last_name']}",
            "bank_name": item["bank_name"],
            "iban": item["iban"],
            "basic_salary": item["basic_salary"],
            "housing_allowance": item["housing_allowance"],
            "transport_allowance": item["transport_allowance"],
            "other_allowances": item["other_allowances"],
            "gosi_employee": item["gosi_employee"],
            "other_deductions": item["other_deductions"],
            "net_salary": item["net_salary"]
        })
        
    settings = get_company_settings(db)
    
    cr = settings.get("cr_number", DEFAULT_CR_NUMBER)
    mol = settings.get("mol_establishment_id", "7-889412")
    bank = settings.get("wps_bank_code", "RIBL")
    pay_date = date.today().strftime("%Y-%m-%d")
    
    csv_content = SaudiHREngine.generate_wps_csv(records, cr, mol, bank, pay_date)
    filename = f"WPS_Salary_File_{run['payroll_year']}_{run['payroll_month']:02d}.csv"
    
    return Response(content=csv_content, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})

# --- Leave Management Endpoints ---
@app.get("/api/leaves")
def get_leaves(user: dict = Depends(get_current_user)):
    return db.query_all("""
        SELECT l.*, e.emp_code, e.first_name, e.last_name, d.name as department_name
        FROM leaves l
        JOIN employees e ON l.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        ORDER BY l.id DESC
    """)

@app.post("/api/leaves")
def apply_leave(req: LeaveCreate, user: dict = Depends(get_current_user)):
    emp = db.query_one("SELECT id FROM employees WHERE id = ?", (req.employee_id,))
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
        
    if req.days <= 0:
        raise HTTPException(status_code=400, detail="Leave duration must be at least 1 day.")
        
    l_id = db.execute_cmd("""
        INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)
    """, (req.employee_id, req.leave_type, req.start_date, req.end_date, req.days, req.reason, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    
    return {"message": "Leave application submitted successfully", "id": l_id}

@app.put("/api/leaves/{leave_id}/status")
def update_leave_status(leave_id: int, body: LeaveStatusUpdate, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM leaves WHERE id = ?", (leave_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Leave application not found.")
        
    db.execute_cmd("UPDATE leaves SET status = ? WHERE id = ?", (body.status, leave_id))
    return {"message": f"Leave status updated to {body.status}"}

@app.delete("/api/leaves/{leave_id}")
def delete_leave(leave_id: int, user: dict = Depends(require_roles(["admin", "hr_manager"]))):
    existing = db.query_one("SELECT id FROM leaves WHERE id = ?", (leave_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Leave record not found.")
        
    db.execute_cmd("DELETE FROM leaves WHERE id = ?", (leave_id,))
    return {"message": "Leave application record removed successfully"}

# --- Saudi Compliance Calculators ---
@app.post("/api/calculators/eosb")
def calculate_eosb_api(req: EOSBRequest, user: dict = Depends(get_current_user)):
    return SaudiHREngine.calculate_eosb(
        req.basic_salary,
        req.gross_salary,
        req.start_date,
        req.end_date,
        req.reason
    )

@app.post("/api/calculators/gosi")
def calculate_gosi_api(req: GOSIRequest, user: dict = Depends(get_current_user)):
    return SaudiHREngine.calculate_gosi(
        req.is_saudi,
        req.basic_salary,
        req.housing_allowance
    )

@app.get("/api/alerts/expiries")
def get_document_expiry_alerts(user: dict = Depends(get_current_user)):
    employees = db.query_all("SELECT * FROM employees WHERE status = 'Active'")
    return SaudiHREngine.check_expiries(employees, threshold_days=90)

# --- Settings ---
@app.get("/api/settings")
def get_settings(user: dict = Depends(get_current_user)):
    rows = db.query_all("SELECT * FROM settings")
    return {r["key"]: r["value"] for r in rows}

@app.post("/api/settings")
def update_settings(settings_dict: dict, user: dict = Depends(require_roles(["admin"]))):
    for k, v in settings_dict.items():
        db.execute_cmd("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
    return {"message": "Settings updated successfully"}
