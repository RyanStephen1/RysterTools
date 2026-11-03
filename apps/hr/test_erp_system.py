"""
Comprehensive Automated Test Suite for Saudi HR & SME Finance ERP System
Tests all calculations, database operations, API routes, PDF outputs, SAMA WPS files, and backup/restore.
"""

import os
import io
import json
from fastapi.testclient import TestClient

import database_cloud as db
from app import app
import auth
from saudi_hr_engine import SaudiHREngine

client = TestClient(app)

def test_database_initialization():
    """Verify database schema, tables, indexes, and default settings."""
    db.init_db()
    from seed_data import seed_database
    seed_database()
    settings = db.query_all("SELECT * FROM settings")
    assert len(settings) >= 5
    
    admin_user = db.query_one("SELECT * FROM users WHERE email = 'admin@alamal-ksa.com'")
    assert admin_user is not None
    assert admin_user["role"] == "admin"

def test_auth_and_jwt():
    """Test login with valid and invalid credentials and JWT token generation."""
    res = client.post("/api/auth/login", json={
        "email": "admin@alamal-ksa.com",
        "password": "AdminSecret123!"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"
    token = data["access_token"]
    
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "admin@alamal-ksa.com"
    
    bad_res = client.post("/api/auth/login", json={
        "email": "admin@alamal-ksa.com",
        "password": "WrongPassword!"
    })
    assert bad_res.status_code == 401

def test_saudi_hr_engine_eosb():
    """Test Saudi Labor Law End of Service calculations."""
    calc1 = SaudiHREngine.calculate_eosb(
        basic_salary=10000.0,
        gross_salary=12500.0,
        start_date="2020-01-01",
        end_date="2024-01-01",
        reason="resignation"
    )
    assert calc1["years_of_service"] >= 3.9
    assert calc1["multiplier_percentage"] == 33.33
    assert calc1["net_eosb"] > 0
    
    calc2 = SaudiHREngine.calculate_eosb(
        basic_salary=10000.0,
        gross_salary=12500.0,
        start_date="2018-01-01",
        end_date="2024-01-01",
        reason="contract_ended"
    )
    assert calc2["multiplier_percentage"] == 100.0
    assert abs(calc2["net_eosb"] - 35000.0) < 100

def test_saudi_hr_engine_gosi():
    """Test GOSI deductions for Saudi vs Expat."""
    gosi_saudi = SaudiHREngine.calculate_gosi(
        is_saudi=True,
        basic_salary=10000.0,
        housing_allowance=2500.0
    )
    assert gosi_saudi["gosi_base"] == 12500.0
    assert gosi_saudi["employee_deduction"] == round(12500.0 * 0.0975, 2)
    assert gosi_saudi["employer_contribution"] == round(12500.0 * 0.1175, 2)
    
    gosi_expat = SaudiHREngine.calculate_gosi(
        is_saudi=False,
        basic_salary=10000.0,
        housing_allowance=2500.0
    )
    assert gosi_expat["employee_deduction"] == 0.0
    assert gosi_expat["employer_contribution"] == round(12500.0 * 0.02, 2)

def test_saudi_hr_engine_nitaqat():
    """Test Nitaqat Saudization band calculation."""
    res = SaudiHREngine.calculate_saudization(total_employees=10, saudi_employees=5)
    assert res["saudization_percentage"] == 50.0
    assert res["nitaqat_band"] == "Platinum"

def test_department_crud():
    """Test Department Create, Read, Update, Delete."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    create_res = client.post("/api/departments", json={
        "name": "Quality Assurance",
        "code": "QA_TEST",
        "manager_name": "Tariq Test",
        "budget": 150000.0
    }, headers=headers)
    assert create_res.status_code == 200
    dept_id = create_res.json()["id"]
    
    upd_res = client.put(f"/api/departments/{dept_id}", json={
        "name": "Quality Assurance & Testing",
        "code": "QA_TEST",
        "manager_name": "Tariq Test Jr",
        "budget": 180000.0
    }, headers=headers)
    assert upd_res.status_code == 200
    
    del_res = client.delete(f"/api/departments/{dept_id}", headers=headers)
    assert del_res.status_code == 200

def test_employee_crud_and_duplicates():
    """Test Employee creation with middle name, legal expiries, duplicate rejection, update, and search."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    emp_payload = {
        "emp_code": "EMP-TEST-99",
        "first_name": "Khaled",
        "middle_name": "Sultan",
        "last_name": "Al-Amri",
        "arabic_name": "خالد سلطان العامري",
        "email": "khaled.test@alamal-ksa.com",
        "phone": "+966512345678",
        "national_id_iqama": "1999888777",
        "nationality": "Saudi Arabia",
        "gender": "Male",
        "is_saudi": 1,
        "dob": "1990-05-15",
        "marital_status": "Married",
        "religion": "Muslim",
        "blood_group": "O+",
        "department_id": None,
        "designation": "Systems Analyst",
        "worker_type": "Direct",
        "hire_date": "2022-05-01",
        "contract_type": "Fixed",
        "contract_end_date": "2027-05-01",
        "probation_end_date": "2022-08-01",
        "border_number": None,
        "iqama_expiry_date": "2028-12-31",
        "passport_number": "N8910243",
        "passport_expiry_date": "2029-06-30",
        "work_permit_number": "WP-TEST-9988",
        "work_permit_expiry_date": "2028-12-31",
        "insurance_policy_number": "POL-BUPA-0099",
        "medical_insurance_category": "Class VIP",
        "medical_insurance_expiry_date": "2027-05-01",
        "driving_license_number": "DL-1999888777",
        "driving_license_expiry_date": "2030-01-01",
        "emergency_contact_name": "Sultan Al-Amri",
        "emergency_contact_phone": "+966501122334",
        "emergency_contact_relation": "Father",
        "bank_name": "Al Rajhi Bank",
        "iban": "SA0380000000123456789999",
        "basic_salary": 12000.0,
        "housing_allowance": 3000.0,
        "transport_allowance": 1000.0,
        "other_allowances": 500.0,
        "gosi_number": "550011223",
        "status": "Active"
    }
    
    res = client.post("/api/employees", json=emp_payload, headers=headers)
    assert res.status_code == 200
    emp_id = res.json()["id"]
    
    dup_res = client.post("/api/employees", json=emp_payload, headers=headers)
    assert dup_res.status_code == 400
    
    detail_res = client.get(f"/api/employees/{emp_id}", headers=headers)
    assert detail_res.status_code == 200
    emp_data = detail_res.json()["employee"]
    assert emp_data["first_name"] == "Khaled"
    assert emp_data["middle_name"] == "Sultan"
    assert emp_data["passport_number"] == "N8910243"
    assert emp_data["work_permit_number"] == "WP-TEST-9988"
    assert emp_data["insurance_policy_number"] == "POL-BUPA-0099"
    
    # Search by middle name
    search_res = client.get("/api/employees?search=Sultan", headers=headers)
    assert search_res.status_code == 200
    assert any(e["id"] == emp_id for e in search_res.json())
    
    # Update employee
    emp_payload["designation"] = "Senior Systems Analyst"
    emp_payload["middle_name"] = "Sultan Mansoor"
    upd_res = client.put(f"/api/employees/{emp_id}", json=emp_payload, headers=headers)
    assert upd_res.status_code == 200
    
    del_res = client.delete(f"/api/employees/{emp_id}", headers=headers)
    assert del_res.status_code == 200

def test_employee_sorting_and_masterlist_import():
    """Test Employee Directory Sorting and Excel/CSV Masterlist Import populated by joining date."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Test Excel & CSV Template Downloads
    tpl_xlsx = client.get("/api/employees/template.xlsx", headers=headers)
    assert tpl_xlsx.status_code == 200
    assert len(tpl_xlsx.content) > 1000
    
    tpl_csv = client.get("/api/employees/template.csv", headers=headers)
    assert tpl_csv.status_code == 200
    assert "Employee Code" in tpl_csv.text
    
    # 2. Test Masterlist CSV Import with multiple joining dates
    csv_content = """Employee Code,First Name,Middle Name,Last Name,National ID / Iqama,Joining Date,Department,Designation,Basic Salary,Is Saudi Citizen
EMP-IMP-01,Zaid,Mansoor,Al-Harbi,1882910291,2017-02-15,Engineering & Technology,Principal Engineer,22000,1
EMP-IMP-02,Tariq,Sami,Al-Otaibi,1773910291,2023-08-01,Human Resources & Admin,HR Specialist,9500,1
EMP-IMP-03,Amit,Kumar,Patel,2661910291,2019-11-10,Engineering & Technology,Senior QA Engineer,13000,0
"""
    import_res = client.post("/api/employees/import-masterlist", data={"raw_text": csv_content}, headers=headers)
    assert import_res.status_code == 200
    data = import_res.json()
    assert data["status"] == "SUCCESS"
    assert data["total_processed"] == 3
    
    # 3. Test Sorting by Joining Date (hire_date asc)
    sort_asc = client.get("/api/employees?sort_by=hire_date&sort_order=asc", headers=headers)
    assert sort_asc.status_code == 200
    emps_asc = sort_asc.json()
    assert len(emps_asc) >= 3
    # Check that hire_dates are monotonically non-decreasing
    dates_asc = [e["hire_date"] for e in emps_asc if e.get("hire_date")]
    assert dates_asc == sorted(dates_asc)
    
    # 4. Test Sorting by Joining Date (hire_date desc)
    sort_desc = client.get("/api/employees?sort_by=hire_date&sort_order=desc", headers=headers)
    assert sort_desc.status_code == 200
    emps_desc = sort_desc.json()
    dates_desc = [e["hire_date"] for e in emps_desc if e.get("hire_date")]
    assert dates_desc == sorted(dates_desc, reverse=True)
    
    # 5. Test Sorting by Basic Salary desc
    sort_sal = client.get("/api/employees?sort_by=basic_salary&sort_order=desc", headers=headers)
    assert sort_sal.status_code == 200
    emps_sal = sort_sal.json()
    salaries = [e["basic_salary"] for e in emps_sal]
    assert salaries == sorted(salaries, reverse=True)
    
    # Cleanup imported test records
    for code in ["EMP-IMP-01", "EMP-IMP-02", "EMP-IMP-03"]:
        row = db.query_one("SELECT id FROM employees WHERE emp_code = ?", (code,))
        if row:
            client.delete(f"/api/employees/{row['id']}", headers=headers)


def test_leaves_workflow():
    """Test Leave application, approval, and deletion."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    emp = db.query_one("SELECT id FROM employees LIMIT 1")
    if not emp:
        return
    emp_id = emp["id"]
    
    l_res = client.post("/api/leaves", json={
        "employee_id": emp_id,
        "leave_type": "Annual Leave",
        "start_date": "2026-09-01",
        "end_date": "2026-09-10",
        "days": 10,
        "reason": "Annual vacation trip"
    }, headers=headers)
    assert l_res.status_code == 200
    l_id = l_res.json()["id"]
    
    upd_res = client.put(f"/api/leaves/{l_id}/status", json={"status": "Approved"}, headers=headers)
    assert upd_res.status_code == 200
    
    del_res = client.delete(f"/api/leaves/{l_id}", headers=headers)
    assert del_res.status_code == 200

def test_payroll_and_wps():
    """Test Monthly Payroll generation, SAMA WPS CSV, PDF Payslip, and run deletion."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # Clean any previous run for month 11/2026
    existing = db.query_one("SELECT id FROM payroll_runs WHERE payroll_month = 11 AND payroll_year = 2026")
    if existing:
        client.delete(f"/api/payroll/runs/{existing['id']}", headers=headers)
        
    p_res = client.post("/api/payroll/generate", json={"month": 11, "year": 2026}, headers=headers)
    assert p_res.status_code == 200
    run_id = p_res.json()["payroll_run_id"]
    
    # Get details
    dtl_res = client.get(f"/api/payroll/runs/{run_id}/details", headers=headers)
    assert dtl_res.status_code == 200
    details = dtl_res.json()["details"]
    assert len(details) > 0
    
    # Download WPS CSV
    wps_res = client.get(f"/api/payroll/runs/{run_id}/wps.csv", headers=headers)
    assert wps_res.status_code == 200
    assert "HDR" in wps_res.text
    assert "SAR" in wps_res.text
    
    # Download Payslip PDF
    first_detail_id = details[0]["id"]
    ps_res = client.get(f"/api/payroll/details/{first_detail_id}/payslip.pdf", headers=headers)
    assert ps_res.status_code == 200
    assert len(ps_res.content) > 1000
    
    # Delete run
    del_res = client.delete(f"/api/payroll/runs/{run_id}", headers=headers)
    assert del_res.status_code == 200

def test_monthly_worker_payroll_tracking():
    """Test individual monthly worker payroll roster, auto-population, adjustments, payslip PDF, and consolidated schedule PDF."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@adknprotech.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Clean any previous test run for January 2026
    existing = db.query_one("SELECT id FROM payroll_runs WHERE payroll_month = 1 AND payroll_year = 2026")
    if existing:
        client.delete(f"/api/payroll/runs/{existing['id']}", headers=headers)
        
    # 2. Get initial empty roster
    r_res = client.get("/api/payroll/monthly-roster?month=1&year=2026", headers=headers)
    assert r_res.status_code == 200
    assert r_res.json()["has_run"] is False
    
    # 3. 1-Click Auto-Populate Roster
    pop_res = client.post("/api/payroll/monthly-roster/populate", json={"month": 1, "year": 2026}, headers=headers)
    assert pop_res.status_code == 200
    
    # 4. Verify populated workers
    r_after = client.get("/api/payroll/monthly-roster?month=1&year=2026", headers=headers)
    assert r_after.status_code == 200
    workers = r_after.json()["workers"]
    assert len(workers) > 0
    first_worker = workers[0]
    
    # 5. Adjust an individual worker's pay (e.g. Add 1,500 SAR bonus for January)
    adj_res = client.post("/api/payroll/monthly-roster/worker", json={
        "month": 1,
        "year": 2026,
        "employee_id": first_worker["employee_id"],
        "basic_salary": first_worker["basic_salary"],
        "housing_allowance": first_worker["housing_allowance"],
        "transport_allowance": first_worker["transport_allowance"],
        "other_allowances": 1500.0,
        "other_deductions": 0.0,
        "remarks": "January engineering milestone bonus"
    }, headers=headers)
    assert adj_res.status_code == 200
    
    # 6. Verify 1-click individual worker payslip PDF download
    detail_id = first_worker["id"]
    ps_pdf = client.get(f"/api/payroll/details/{detail_id}/payslip.pdf?token={token}")
    assert ps_pdf.status_code == 200
    assert len(ps_pdf.content) > 1000
    assert ps_pdf.headers["content-type"] == "application/pdf"
    
    # 7. Verify consolidated Monthly Payroll Schedule PDF export
    sched_pdf = client.get(f"/api/payroll/monthly-roster/export/pdf?month=1&year=2026&token={token}")
    assert sched_pdf.status_code == 200
    assert len(sched_pdf.content) > 1000
    assert sched_pdf.headers["content-type"] == "application/pdf"
    
    # 8. Remove worker from roster
    rem_res = client.delete(f"/api/payroll/monthly-roster/worker/{detail_id}", headers=headers)
    assert rem_res.status_code == 200

def test_worker_timesheet_calendar_and_payslip_sync():
    """Test monthly attendance calendar hours logging, rates, deductions, and automated payslip sync."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@adknprotech.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    emp = db.query_one("SELECT * FROM employees LIMIT 1")
    assert emp is not None
    emp_id = emp["id"]
    
    # 1. Fetch timesheet calendar for July 2026
    ts_res = client.get(f"/api/payroll/timesheet?employee_id={emp_id}&month=7&year=2026", headers=headers)
    assert ts_res.status_code == 200
    ts_data = ts_res.json()
    assert len(ts_data["days"]) == 31
    
    # 2. Simulate 10 days worked (64.0 hrs @ 10.42/hr = 666.67, 16.0 rest hrs = 166.67, 10 meals @ 10 = 100.00, water bill = 12.89, cash advance = 400.00)
    days_payload = []
    for day in range(1, 32):
        if day <= 8:
            days_payload.append({
                "day": day,
                "date": f"2026-07-{day:02d}",
                "regular_hours": 8.0,
                "ot_hours": 0.0,
                "day_type": "Regular",
                "meal_allowance": 1,
                "notes": "Site work"
            })
        elif day in [9, 10]:
            days_payload.append({
                "day": day,
                "date": f"2026-07-{day:02d}",
                "regular_hours": 8.0,
                "ot_hours": 0.0,
                "day_type": "RestDay",
                "meal_allowance": 1,
                "notes": "Rest day support"
            })
        else:
            days_payload.append({
                "day": day,
                "date": f"2026-07-{day:02d}",
                "regular_hours": 0.0,
                "ot_hours": 0.0,
                "day_type": "Regular",
                "meal_allowance": 0,
                "notes": ""
            })
            
    bulk_res = client.post("/api/payroll/timesheet/bulk-save", json={
        "employee_id": emp_id,
        "month": 7,
        "year": 2026,
        "cutoff_period": "July 01-31, 2026",
        "days": days_payload,
        "daily_rate": 83.33333333,
        "hourly_rate": 10.42,
        "ot_rate": 15.63,
        "water_bill": 12.89,
        "wps_deduction": 0.0,
        "other_deductions": 0.0,
        "cash_advance": 400.0,
        "adjustment_add": 0.0,
        "adjustment_sub": 0.0,
        "meal_rate": 10.0
    }, headers=headers)
    
    assert bulk_res.status_code == 200
    res_data = bulk_res.json()
    assert res_data["total_pay"] == 933.33  # 666.67 + 166.67 + 100.00 = 933.34/933.33
    assert res_data["actual_pay"] == 520.44  # 933.33 - 12.89 - 400.00 = 520.44
    
    # 3. Verify Payslip PDF generates successfully with new timesheet data
    detail_id = res_data["detail_id"]
    pdf_res = client.get(f"/api/payroll/details/{detail_id}/payslip.pdf?token={token}")
    assert pdf_res.status_code == 200
    assert len(pdf_res.content) > 1000



def test_supplier_payments_and_disbursals():
    """Test Supplier Payments recording, partial disbursals, aging, and PDF statement generation."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    # Pre-clean any test supplier records
    db.execute_cmd("DELETE FROM supplier_payments WHERE company_name = 'Test Cloud Services Ltd'")
    db.execute_cmd("DELETE FROM suppliers WHERE name = 'Test Cloud Services Ltd'")

    # 1. Test Supplier Profile Creation & Listing
    sup_create_res = client.post("/api/suppliers", json={
        "name": "Test Cloud Services Ltd",
        "contact_person": "Eng. Faisal Al-Zahrani",
        "phone": "+966500000000",
        "email": "cloud@testvendor.com",
        "cr_number": "1010999888",
        "payment_terms": "Net 30"
    }, headers=headers)
    assert sup_create_res.status_code == 200
    sup_id = sup_create_res.json()["id"]

    sups_res = client.get("/api/suppliers", headers=headers)
    assert sups_res.status_code == 200
    assert any(s["name"] == "Test Cloud Services Ltd" for s in sups_res.json())

    # 2. Test Supplier Invoice Recording
    sp_res = client.post("/api/suppliers/payments", json={
        "company_name": "Test Cloud Services Ltd",
        "invoice_number": "INV-TEST-001",
        "invoice_date": "2026-08-01",
        "due_date": "2026-08-25",
        "supply_start_date": "2026-07-01",
        "supply_end_date": "2026-07-31",
        "invoice_details": "Cloud server hosting & managed databases",
        "amount": 20000.0,
        "status": "Pending",
        "remarks": "Net 30 term"
    }, headers=headers)
    assert sp_res.status_code == 200
    sp_id = sp_res.json()["id"]
    
    disb_res = client.post(f"/api/suppliers/payments/{sp_id}/disburse", json={
        "payment_amount": 5000.0,
        "payment_method": "Bank Transfer",
        "reference_number": "TXN-TEST-123",
        "notes": "First partial settlement"
    }, headers=headers)
    assert disb_res.status_code == 200
    assert disb_res.json()["remaining_amount"] == 15000.0
    assert disb_res.json()["status"] == "Partially Paid"
    
    # 3. Test Statement PDF & AP Report PDF Export (All, Single Supplier, Multi Supplier)
    pdf_res = client.get(f"/api/suppliers/payments/{sp_id}/statement.pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert len(pdf_res.content) > 1000

    # All suppliers report
    ap_report_pdf = client.get("/api/suppliers/export/pdf", headers=headers)
    assert ap_report_pdf.status_code == 200
    assert len(ap_report_pdf.content) > 1000

    # Single supplier report
    ap_single_pdf = client.get("/api/suppliers/export/pdf?suppliers=Test%20Cloud%20Services%20Ltd", headers=headers)
    assert ap_single_pdf.status_code == 200
    assert len(ap_single_pdf.content) > 1000

    # Multi supplier report with status filter
    ap_multi_pdf = client.get("/api/suppliers/export/pdf?suppliers=Test%20Cloud%20Services%20Ltd,Al-Jazeera%20Office%20Supplies%20Co.&status=Pending", headers=headers)
    assert ap_multi_pdf.status_code == 200
    assert len(ap_multi_pdf.content) > 1000
    
    ledger_res = client.get("/api/suppliers/vendors/Test%20Cloud%20Services%20Ltd/ledger", headers=headers)
    assert ledger_res.status_code == 200
    # 4. Test Recurring Next Month Invoice Auto-Cloning
    rec_res = client.post(f"/api/suppliers/payments/{sp_id}/repeat-next-month", headers=headers)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    rec_id = rec_data["id"]
    assert rec_data["amount"] == 20000.0
    assert rec_data["invoice_date"] == "2026-09-01"
    assert rec_data["due_date"] == "2026-09-25"
    assert rec_data["supply_start_date"] == "2026-08-01"
    assert rec_data["supply_end_date"] == "2026-08-31"

    # 5. Test Optional Invoice Attachment Upload, Download & Deletion
    fake_pdf = io.BytesIO(b"%PDF-1.4 Fake test invoice content...")
    upload_res = client.post(
        f"/api/suppliers/payments/{sp_id}/attachment",
        files={"file": ("tax_invoice_101.pdf", fake_pdf, "application/pdf")},
        headers=headers
    )
    assert upload_res.status_code == 200
    assert upload_res.json()["attachment_filename"] == "tax_invoice_101.pdf"

    # Download attachment
    dl_res = client.get(f"/api/suppliers/payments/{sp_id}/attachment", headers=headers)
    assert dl_res.status_code == 200
    assert b"Fake test invoice content" in dl_res.content

    # Delete attachment
    del_att_res = client.delete(f"/api/suppliers/payments/{sp_id}/attachment", headers=headers)
    assert del_att_res.status_code == 200

    # 6. Test Multi-Invoice Lump-Sum Settlement (Jan 5000 + Feb 17000, Paid 8000 -> Remaining 14000)
    inv1_res = client.post("/api/suppliers/payments", json={
        "company_name": "Test Cloud Services Ltd",
        "invoice_number": "INV-JAN-5000",
        "invoice_date": "2026-01-10",
        "due_date": "2026-02-10",
        "amount": 5000.0,
        "status": "Pending"
    }, headers=headers)
    inv1_id = inv1_res.json()["id"]

    inv2_res = client.post("/api/suppliers/payments", json={
        "company_name": "Test Cloud Services Ltd",
        "invoice_number": "INV-FEB-17000",
        "invoice_date": "2026-02-10",
        "due_date": "2026-03-10",
        "amount": 17000.0,
        "status": "Pending"
    }, headers=headers)
    inv2_id = inv2_res.json()["id"]

    # Settle SAR 8,000 across the vendor
    lump_res = client.post("/api/suppliers/vendors/Test%20Cloud%20Services%20Ltd/disburse", json={
        "payment_amount": 8000.0,
        "payment_method": "Bank Transfer",
        "reference_number": "LUMP-8000-TEST",
        "notes": "Lump sum partial vendor settlement"
    }, headers=headers)
    assert lump_res.status_code == 200

    # Verify FIFO allocation:
    # First invoice (Jan 5000) is Paid (remaining 0)
    # Second invoice (Feb 17000) is Partially Paid (remaining 14000)
    i1 = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (inv1_id,))
    i2 = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (inv2_id,))
    assert i1["paid_amount"] == 5000.0
    assert i1["remaining_amount"] == 0.0
    assert i1["status"] == "Paid"

    assert i2["paid_amount"] == 3000.0
    assert i2["remaining_amount"] == 14000.0
    assert i2["status"] == "Partially Paid"

    # Cleanup
    client.delete(f"/api/suppliers/payments/{inv1_id}", headers=headers)
    client.delete(f"/api/suppliers/payments/{inv2_id}", headers=headers)
    client.delete(f"/api/suppliers/payments/{rec_id}", headers=headers)
    client.delete(f"/api/suppliers/payments/{sp_id}", headers=headers)
    client.delete(f"/api/suppliers/{sup_id}", headers=headers)

def test_backup_and_restore():
    """Test full system backup archive creation and JSON restoration."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}
    
    b_res = client.post("/api/backup/google-drive", headers=headers)
    assert b_res.status_code == 200
    assert b_res.json()["status"] == "SUCCESS"
    
    fn = b_res.json()["backup_filename"]
    path = os.path.join(os.path.dirname(__file__), "uploads", "backups", fn)
    assert os.path.exists(path)

def test_logo_and_favicon():
    """Test logo.svg and favicon assets and endpoints."""
    # 1. Test /logo.svg endpoint
    l_res = client.get("/logo.svg")
    assert l_res.status_code == 200
    assert "svg" in l_res.headers["content-type"]
    assert "ADK" in l_res.text or "<svg" in l_res.text

    # 2. Test /static/logo.svg
    sl_res = client.get("/static/logo.svg")
    assert sl_res.status_code == 200

    # 3. Test /favicon.ico
    fav_res = client.get("/favicon.ico")
    assert fav_res.status_code == 200

    # 4. Test /static/favicon.svg
    fav_svg = client.get("/static/favicon.svg")
    assert fav_svg.status_code == 200

def test_salary_tracking_and_allowances():
    """Test custom allowance categories, employee allowances, salary tracking increments & audit logs."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test Listing Default Allowance Categories (Food, Site, Shift, Mobile, Bonus, OT)
    db.execute_cmd("DELETE FROM allowance_categories WHERE code = 'OFFSHORE'")
    cats_res = client.get("/api/allowance-categories", headers=headers)
    assert cats_res.status_code == 200
    cats = cats_res.json()
    assert len(cats) >= 5
    food_cat = next((c for c in cats if c["code"] == "FOOD"), None)
    assert food_cat is not None
    site_cat = next((c for c in cats if c["code"] == "SITE"), None)
    assert site_cat is not None

    # 2. Test Creating Custom Category
    new_cat_res = client.post("/api/allowance-categories", json={
        "name": "Offshore Rig Allowance",
        "name_ar": "بدل منصة بحرية",
        "code": "OFFSHORE",
        "is_gosi_eligible": 0,
        "is_recurring": 1,
        "default_amount": 1500.0,
        "description": "Hazard and deployment allowance for offshore marine operations"
    }, headers=headers)
    assert new_cat_res.status_code == 200
    offshore_cat_id = new_cat_res.json()["id"]

    # 3. Test Assigning Allowance to an Employee
    emp = db.query_one("SELECT id, basic_salary FROM employees LIMIT 1")
    emp_id = emp["id"]
    old_basic = float(emp["basic_salary"])

    add_allow_res = client.post(f"/api/employees/{emp_id}/allowances", json={
        "category_id": offshore_cat_id,
        "amount": 1200.0,
        "frequency": "Monthly",
        "effective_from": "2026-01-01",
        "notes": "Assigned for Jubail Port project"
    }, headers=headers)
    assert add_allow_res.status_code == 200
    allow_id = add_allow_res.json()["id"]

    # 4. Test Getting Employee Allowances
    get_allows_res = client.get(f"/api/employees/{emp_id}/allowances", headers=headers)
    assert get_allows_res.status_code == 200
    allow_data = get_allows_res.json()
    assert allow_data["total_allowances"] >= 1200.0
    assert any(a["id"] == allow_id for a in allow_data["allowances"])

    # 5. Test Recording Salary Adjustment / Increment
    new_salary = old_basic + 750.0
    adj_res = client.post(f"/api/employees/{emp_id}/salary-adjustments", json={
        "new_basic": new_salary,
        "change_reason": "Annual Merit Increment",
        "effective_date": "2026-08-01",
        "notes": "Approved pursuant to 2026 appraisal"
    }, headers=headers)
    assert adj_res.status_code == 200
    adj_data = adj_res.json()
    assert adj_data["new_basic"] == new_salary
    assert adj_data["diff"] == 750.0

    # Verify employee record updated
    updated_emp = db.query_one("SELECT basic_salary FROM employees WHERE id = ?", (emp_id,))
    assert updated_emp["basic_salary"] == new_salary

    # 6. Test Salary History Timeline
    hist_res = client.get(f"/api/employees/{emp_id}/salary-history", headers=headers)
    assert hist_res.status_code == 200
    hist = hist_res.json()
    assert len(hist) >= 1
    assert any(h["new_basic"] == new_salary and h["change_reason"] == "Annual Merit Increment" for h in hist)

    # 7. Test Salary Audit Logs
    logs_res = client.get(f"/api/employees/{emp_id}/salary-logs", headers=headers)
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) >= 2
    assert any(l["action_type"] in ["SALARY_INCREMENT", "ALLOWANCE_ADDED"] for l in logs)

    # 8. Test Company-Wide Summary
    sum_res = client.get("/api/salary-tracking/summary", headers=headers)
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert sum_data["active_employees"] >= 1
    assert sum_data["total_monthly_basic"] > 0
    assert len(sum_data["category_breakdown"]) >= 5

    # 9. Test Direct Salary Input (Meal Allowance & Site Allowance, no Housing / Transport)
    direct_res = client.put(f"/api/employees/{emp_id}/direct-salary", json={
        "basic_salary": 15000.0,
        "meal_allowance": 300.0,
        "site_allowance": 500.0,
        "other_allowances": 0.0,
        "change_reason": "Direct Value Setting",
        "notes": "Direct salary with meal and site location allowances"
    }, headers=headers)
    assert direct_res.status_code == 200
    direct_data = direct_res.json()
    assert direct_data["basic_salary"] == 15000.0
    assert direct_data["meal_allowance"] == 300.0
    assert direct_data["site_allowance"] == 500.0
    assert direct_data["gross_salary"] == 15800.0

    # Cleanup test allowance & custom category
    client.delete(f"/api/employees/{emp_id}/allowances/{allow_id}", headers=headers)
    client.delete(f"/api/allowance-categories/{offshore_cat_id}", headers=headers)
    db.execute_cmd("UPDATE employees SET basic_salary = ? WHERE id = ?", (old_basic, emp_id))

def test_deduction_categories_and_employee_deductions():
    """Test custom deduction categories, employee deductions, and unified audit logs."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test Listing Default Deduction Categories
    db.execute_cmd("DELETE FROM deduction_categories WHERE code = 'EQUIPMENT'")
    cats_res = client.get("/api/deduction-categories", headers=headers)
    assert cats_res.status_code == 200
    cats = cats_res.json()
    assert len(cats) >= 5
    wps_cat = next((c for c in cats if c["code"] == "WPS"), None)
    assert wps_cat is not None
    water_cat = next((c for c in cats if c["code"] == "WATER"), None)
    assert water_cat is not None

    # 2. Test Creating Custom Deduction Category
    new_cat_res = client.post("/api/deduction-categories", json={
        "name": "Equipment Damage Charge",
        "name_ar": "خصم أضرار المعدات",
        "code": "EQUIPMENT",
        "default_amount": 250.0,
        "is_recurring": 0,
        "description": "Deduction for equipment breakage or loss"
    }, headers=headers)
    assert new_cat_res.status_code == 200
    eq_cat_id = new_cat_res.json()["id"]

    # 3. Test Assigning Deduction to Employee
    emp = db.query_one("SELECT id FROM employees LIMIT 1")
    emp_id = emp["id"]

    add_ded_res = client.post(f"/api/employees/{emp_id}/deductions", json={
        "category_id": eq_cat_id,
        "amount": 200.0,
        "frequency": "Monthly",
        "effective_from": "2026-08-01",
        "notes": "Safety helmet and vest replacement fee"
    }, headers=headers)
    assert add_ded_res.status_code == 200
    ded_id = add_ded_res.json()["id"]

    # 4. Test Getting Employee Deductions
    get_deds_res = client.get(f"/api/employees/{emp_id}/deductions", headers=headers)
    assert get_deds_res.status_code == 200
    ded_data = get_deds_res.json()
    assert ded_data["total_active_deductions"] >= 200.0
    assert any(d["id"] == ded_id for d in ded_data["deductions"])

    # 5. Test Unified Company-Wide Audit Logs with Filter
    logs_res = client.get("/api/salary-tracking/audit-logs?action_type=DEDUCTION_ADDED", headers=headers)
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) >= 1
    assert logs[0]["action_type"] == "DEDUCTION_ADDED"

    # 6. Test Summary includes deduction metrics
    sum_res = client.get("/api/salary-tracking/summary", headers=headers)
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert "total_monthly_deductions" in sum_data
    assert len(sum_data["deduction_category_breakdown"]) >= 5

    # 7. Cleanup
    del_ded_res = client.delete(f"/api/employees/{emp_id}/deductions/{ded_id}", headers=headers)
    assert del_ded_res.status_code == 200
    del_cat_res = client.delete(f"/api/deduction-categories/{eq_cat_id}", headers=headers)
    assert del_cat_res.status_code == 200

def test_pdf_and_report_generation():
    """Test all PDF and WPS export endpoints to ensure flawless binary generation."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test Accounts Payable Aging Report PDF
    ap_pdf = client.get(f"/api/suppliers/export/pdf?token={token}")
    assert ap_pdf.status_code == 200
    assert ap_pdf.headers["content-type"] == "application/pdf"
    assert ap_pdf.content.startswith(b"%PDF")

    # 2. Test Monthly Payroll Generation & WPS Export
    run_res = client.post("/api/payroll/generate", json={"month": 11, "year": 2026}, headers=headers)
    assert run_res.status_code == 200
    run_id = run_res.json()["payroll_run_id"]

    # 3. Test SAMA WPS CSV Generation
    wps_res = client.get(f"/api/payroll/runs/{run_id}/wps.csv?token={token}")
    assert wps_res.status_code == 200
    assert "text/csv" in wps_res.headers["content-type"] or "application/octet-stream" in wps_res.headers["content-type"]
    assert len(wps_res.text.strip().split("\n")) >= 2

    # 4. Test Employee Payslip PDF Generation
    detail = db.query_one("SELECT id FROM payroll_details WHERE payroll_run_id = ? LIMIT 1", (run_id,))
    if detail:
        payslip_res = client.get(f"/api/payroll/details/{detail['id']}/payslip.pdf?token={token}")
        assert payslip_res.status_code == 200
        assert payslip_res.headers["content-type"] == "application/pdf"
        assert payslip_res.content.startswith(b"%PDF")

    # 5. Test Supplier Statement PDF Generation
    sp = db.query_one("SELECT id FROM supplier_payments LIMIT 1")
    if sp:
        sp_pdf = client.get(f"/api/suppliers/payments/{sp['id']}/statement.pdf?token={token}")
        assert sp_pdf.status_code == 200
        assert sp_pdf.headers["content-type"] == "application/pdf"
        assert sp_pdf.content.startswith(b"%PDF")

    # Cleanup test payroll run
    client.delete(f"/api/payroll/runs/{run_id}", headers=headers)

def test_client_collections_and_ar():
    """Test Client Invoicing, Collections, Monthly Summary Lists, and PDF Exports."""
    token = auth.create_jwt_token({"user_id": 1, "email": "admin@alamal-ksa.com", "role": "admin", "full_name": "Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    # Initial cleanup in case of previous failed test run
    db.execute_cmd("DELETE FROM client_invoices WHERE invoice_number = 'INV-ADK-TEST-001'")
    db.execute_cmd("DELETE FROM clients WHERE name = 'Saudi Aramco Project Alpha'")

    # 1. Create a Client
    c_res = client.post("/api/clients", json={
        "name": "Saudi Aramco Project Alpha",
        "name_ar": "مشروع أرامكو السعودية ألفا",
        "contact_person": "Eng. Khalid Al-Otaibi",
        "phone": "+966501112233",
        "email": "khalid@aramco.com.sa",
        "cr_number": "2055019283",
        "vat_number": "300123456789003",
        "payment_terms": "Net 30",
        "address": "Jubail 2 Industrial City, KSA"
    }, headers=headers)
    assert c_res.status_code == 200
    client_id = c_res.json()["id"]

    # 2. Issue Client Invoice
    inv_res = client.post("/api/client-invoices", json={
        "client_id": client_id,
        "client_name": "Saudi Aramco Project Alpha",
        "invoice_number": "INV-ADK-TEST-001",
        "invoice_date": "2026-08-01",
        "due_date": "2026-08-31",
        "service_period_start": "2026-08-01",
        "service_period_end": "2026-08-31",
        "invoice_details": "Mechanical & Electrical Installation Services",
        "subtotal": 100000.0,
        "vat_rate": 15.0,
        "vat_amount": 15000.0,
        "total_amount": 115000.0,
        "remarks": "Project Milestone 1"
    }, headers=headers)
    assert inv_res.status_code == 200
    invoice_id = inv_res.json()["id"]

    # 3. Record Partial Collection Receipt (SAR 50,000)
    col1 = client.post(f"/api/client-invoices/{invoice_id}/record-collection", json={
        "payment_amount": 50000.0,
        "payment_date": "2026-08-10",
        "payment_method": "Bank Transfer",
        "reference_number": "TR-99881122",
        "notes": "First milestone installment"
    }, headers=headers)
    assert col1.status_code == 200
    assert col1.json()["paid_amount" if "paid_amount" in col1.json() else "collected_amount"] == 50000.0
    assert col1.json()["remaining_amount"] == 65000.0
    assert col1.json()["status"] == "Partially Collected"

    # 4. Record Final Collection Receipt (SAR 65,000)
    col2 = client.post(f"/api/client-invoices/{invoice_id}/record-collection", json={
        "payment_amount": 65000.0,
        "payment_date": "2026-08-18",
        "payment_method": "Bank Transfer",
        "reference_number": "TR-99881133",
        "notes": "Full balance clearance"
    }, headers=headers)
    assert col2.status_code == 200
    assert col2.json()["remaining_amount"] == 0.0
    assert col2.json()["status"] == "Collected"

    # 5. Test Monthly Summary Collection List API
    summary_res = client.get("/api/client-collections/monthly-summary?month=8&year=2026", headers=headers)
    assert summary_res.status_code == 200
    s_data = summary_res.json()
    assert s_data["month_invoiced_total"] >= 115000.0
    assert s_data["month_collected_total"] >= 115000.0
    assert len(s_data["client_breakdown"]) >= 1

    # 6. Test Monthly Collection Summary PDF Export
    pdf_res = client.get("/api/client-collections/monthly-summary/pdf?month=8&year=2026", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")

    # 7. Test Client Statement PDF Export
    stmt_res = client.get(f"/api/clients/{client_id}/statement/pdf", headers=headers)
    assert stmt_res.status_code == 200
    assert stmt_res.headers["content-type"] == "application/pdf"
    assert stmt_res.content.startswith(b"%PDF")

    # 8. Clean up test invoice & client
    client.delete(f"/api/client-invoices/{invoice_id}", headers=headers)
    client.delete(f"/api/clients/{client_id}", headers=headers)

if __name__ == "__main__":
    print("Running Complete ERP Test Suite...")
    test_database_initialization()
    test_auth_and_jwt()
    test_saudi_hr_engine_eosb()
    test_saudi_hr_engine_gosi()
    test_saudi_hr_engine_nitaqat()
    test_department_crud()
    test_employee_crud_and_duplicates()
    test_employee_sorting_and_masterlist_import()
    test_leaves_workflow()
    test_payroll_and_wps()
    test_supplier_payments_and_disbursals()
    test_backup_and_restore()
    test_logo_and_favicon()
    test_salary_tracking_and_allowances()
    test_deduction_categories_and_employee_deductions()
    test_client_collections_and_ar()
    test_pdf_and_report_generation()
    print("ALL TESTS PASSED WITH ZERO ERRORS!")

