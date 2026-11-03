import sys
import os
from datetime import datetime, date, timedelta

sys.path.append(os.path.dirname(__file__))

import database_cloud as db

def seed_database():
    print("Initializing Database Schema & Indexes...")
    db.init_db()
    
    existing_emps = db.query_all("SELECT COUNT(*) as cnt FROM employees")
    if existing_emps and existing_emps[0]["cnt"] > 0:
        print("Database already contains records. Verifying data integrity...")
        # Auto-correct any legacy records with 0.0 remaining amounts on non-paid status
        db.execute_cmd("""
            UPDATE supplier_payments 
            SET remaining_amount = amount - paid_amount 
            WHERE remaining_amount = 0 AND status != 'Paid' AND amount > paid_amount
        """)
        return

    excel_master = os.path.join(os.path.dirname(__file__), "employeelist.xlsx")
    if not os.path.exists(excel_master):
        excel_master = os.path.join(os.path.dirname(__file__), "masterlist.xlsx")
    if os.path.exists(excel_master):
        from import_employeelist import populate_from_employeelist
        populate_from_employeelist(excel_master)
        return
        
    print("Seeding Departments...")
    depts = [
        ("Engineering & Technology", "ENG", "Eng. Tariq Al-Mansoor", 450000.0),
        ("Human Resources & Admin", "HR", "Sara Al-Dosari", 200000.0),
        ("Finance & Accounting", "FIN", "Fahad Al-Qahtani", 300000.0),
        ("Operations & Supply Chain", "OPS", "John Smith", 500000.0),
        ("Executive Office", "EXEC", "Dr. Khalid Al-Ghamdi", 750000.0)
    ]
    dept_ids = {}
    for name, code, mgr, budget in depts:
        existing_dept = db.query_one("SELECT id FROM departments WHERE code = ?", (code,))
        if existing_dept:
            dept_ids[code] = existing_dept["id"]
        else:
            d_id = db.execute_cmd(
                "INSERT INTO departments (name, code, manager_name, budget) VALUES (?, ?, ?, ?)",
                (name, code, mgr, budget)
            )
            dept_ids[code] = d_id

    print("Seeding Employee Directory (Saudi & Expat profiles)...")
    today = date.today()
    employees = [
        {
            "emp_code": "EMP-001",
            "first_name": "Mohammed",
            "middle_name": "Abdullah",
            "last_name": "Al-Otaibi",
            "arabic_name": "محمد عبدالله العتيبي",
            "email": "m.otaibi@alamal-ksa.com",
            "phone": "+966501234567",
            "national_id_iqama": "1098765432",
            "nationality": "Saudi Arabia",
            "gender": "Male",
            "is_saudi": 1,
            "dob": "1988-04-12",
            "marital_status": "Married",
            "religion": "Muslim",
            "blood_group": "O+",
            "department_id": dept_ids["ENG"],
            "designation": "Lead Software Architect",
            "worker_type": "Direct",
            "hire_date": "2019-03-01",
            "contract_type": "Indefinite",
            "contract_end_date": None,
            "probation_end_date": "2019-06-01",
            "border_number": None,
            "iqama_expiry_date": "2028-12-31",
            "passport_number": "A9841029",
            "passport_expiry_date": "2029-05-15",
            "work_permit_number": "WP-KSA-908124",
            "work_permit_expiry_date": "2028-12-31",
            "insurance_policy_number": "BUPA-KSA-88491",
            "medical_insurance_category": "Class VIP",
            "medical_insurance_expiry_date": "2027-04-30",
            "driving_license_number": "DL-1098765432",
            "driving_license_expiry_date": "2029-10-15",
            "emergency_contact_name": "Abdullah Al-Otaibi",
            "emergency_contact_phone": "+966509876543",
            "emergency_contact_relation": "Father",
            "bank_name": "Al Rajhi Bank",
            "iban": "SA0380000000608010167519",
            "basic_salary": 18000.0,
            "housing_allowance": 4500.0,
            "transport_allowance": 1500.0,
            "other_allowances": 1000.0,
            "gosi_number": "304918201",
            "status": "Active"
        },
        {
            "emp_code": "EMP-002",
            "first_name": "Sara",
            "middle_name": "Fahad",
            "last_name": "Al-Dosari",
            "arabic_name": "سارة فهد الدوسري",
            "email": "sara.dosari@alamal-ksa.com",
            "phone": "+966559876543",
            "national_id_iqama": "1087654321",
            "nationality": "Saudi Arabia",
            "gender": "Female",
            "is_saudi": 1,
            "dob": "1992-09-25",
            "marital_status": "Single",
            "religion": "Muslim",
            "blood_group": "A+",
            "department_id": dept_ids["HR"],
            "designation": "HR Operations Director",
            "worker_type": "Direct",
            "hire_date": "2020-06-15",
            "contract_type": "Indefinite",
            "contract_end_date": None,
            "probation_end_date": "2020-09-15",
            "border_number": None,
            "iqama_expiry_date": "2027-10-10",
            "passport_number": "B7651092",
            "passport_expiry_date": "2028-08-20",
            "work_permit_number": "WP-KSA-908125",
            "work_permit_expiry_date": "2027-10-10",
            "insurance_policy_number": "TAWUNIYA-KSA-3021",
            "medical_insurance_category": "Class A",
            "medical_insurance_expiry_date": "2027-06-15",
            "driving_license_number": "DL-1087654321",
            "driving_license_expiry_date": "2028-11-20",
            "emergency_contact_name": "Fahad Al-Dosari",
            "emergency_contact_phone": "+966551122334",
            "emergency_contact_relation": "Father",
            "bank_name": "Riyad Bank",
            "iban": "SA2020000000100020003000",
            "basic_salary": 22000.0,
            "housing_allowance": 5500.0,
            "transport_allowance": 2000.0,
            "other_allowances": 1500.0,
            "gosi_number": "409182736",
            "status": "Active"
        },
        {
            "emp_code": "EMP-003",
            "first_name": "Rahul",
            "middle_name": "Kumar",
            "last_name": "Sharma",
            "arabic_name": "راهول كومار شارما",
            "email": "rahul.sharma@alamal-ksa.com",
            "phone": "+966541122334",
            "national_id_iqama": "2391029384",
            "nationality": "India",
            "gender": "Male",
            "is_saudi": 0,
            "dob": "1985-11-03",
            "marital_status": "Married",
            "religion": "Hindu",
            "blood_group": "B+",
            "department_id": dept_ids["ENG"],
            "designation": "Senior DevOps Engineer",
            "worker_type": "Direct",
            "hire_date": "2021-01-10",
            "contract_type": "Fixed",
            "contract_end_date": (today + timedelta(days=45)).strftime("%Y-%m-%d"),
            "probation_end_date": "2021-04-10",
            "border_number": "3920192841",
            "iqama_expiry_date": (today + timedelta(days=25)).strftime("%Y-%m-%d"),
            "passport_number": "Z8910293",
            "passport_expiry_date": (today + timedelta(days=50)).strftime("%Y-%m-%d"),
            "work_permit_number": "QIWA-WP-2026-881",
            "work_permit_expiry_date": (today + timedelta(days=20)).strftime("%Y-%m-%d"),
            "insurance_policy_number": "MEDGULF-99401",
            "medical_insurance_category": "Class B",
            "medical_insurance_expiry_date": (today + timedelta(days=35)).strftime("%Y-%m-%d"),
            "driving_license_number": "DL-2391029384",
            "driving_license_expiry_date": "2027-08-14",
            "emergency_contact_name": "Pooja Sharma",
            "emergency_contact_phone": "+966549988776",
            "emergency_contact_relation": "Spouse",
            "bank_name": "Saudi National Bank (SNB)",
            "iban": "SA4410000000123456789012",
            "basic_salary": 14000.0,
            "housing_allowance": 3500.0,
            "transport_allowance": 1000.0,
            "other_allowances": 500.0,
            "gosi_number": "908127364",
            "status": "Active"
        }
    ]

    emp_db_ids = []
    for emp in employees:
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
        """, emp)
        emp_db_ids.append(e_id)

    print("Seeding Sample Supplier Payments & Aging Invoices...")
    today = date.today()
    suppliers = [
        {
            "company_name": "Al-Jazeera Office Supplies Co.",
            "invoice_number": "INV-2026-0812",
            "invoice_date": (today - timedelta(days=20)).strftime("%Y-%m-%d"),
            "due_date": (today + timedelta(days=10)).strftime("%Y-%m-%d"), # Current
            "invoice_details": "Supply of ergonomic office desks, chairs, and paper supplies",
            "supply_date": (today - timedelta(days=18)).strftime("%Y-%m-%d"),
            "amount": 18500.00,
            "paid_amount": 0.0,
            "remaining_amount": 18500.00,
            "status": "Pending",
            "remarks": "Net 30 days payment term"
        },
        {
            "company_name": "Saudi Technology Hardware Ltd",
            "invoice_number": "INV-2026-0744",
            "invoice_date": (today - timedelta(days=50)).strftime("%Y-%m-%d"),
            "due_date": (today - timedelta(days=20)).strftime("%Y-%m-%d"), # 1-30 Days Overdue!
            "invoice_details": "High-performance developer laptops and server racks",
            "supply_date": (today - timedelta(days=48)).strftime("%Y-%m-%d"),
            "amount": 42000.00,
            "paid_amount": 10000.00,
            "remaining_amount": 32000.00,
            "status": "Partially Paid",
            "remarks": "Advance paid SAR 10,000. Remainder scheduled for transfer."
        },
        {
            "company_name": "Riyadh Logistics & Warehousing",
            "invoice_number": "INV-2026-0610",
            "invoice_date": (today - timedelta(days=80)).strftime("%Y-%m-%d"),
            "due_date": (today - timedelta(days=50)).strftime("%Y-%m-%d"), # 31-60 Days Overdue!
            "invoice_details": "Freight handling, customs clearance, and courier services",
            "supply_date": (today - timedelta(days=78)).strftime("%Y-%m-%d"),
            "amount": 12800.00,
            "paid_amount": 0.0,
            "remaining_amount": 12800.00,
            "status": "Pending",
            "remarks": "Awaiting finance manager final signoff"
        },
        {
            "company_name": "Al-Olayan Facilities Management",
            "invoice_number": "INV-2026-0501",
            "invoice_date": (today - timedelta(days=60)).strftime("%Y-%m-%d"),
            "due_date": (today - timedelta(days=30)).strftime("%Y-%m-%d"),
            "invoice_details": "Monthly facility maintenance and HVAC servicing",
            "supply_date": (today - timedelta(days=58)).strftime("%Y-%m-%d"),
            "amount": 15000.00,
            "paid_amount": 15000.00,
            "remaining_amount": 0.0,
            "status": "Paid",
            "payment_date": (today - timedelta(days=5)).strftime("%Y-%m-%d"),
            "remarks": "Settled via Riyad Bank corporate transfer"
        }
    ]

    for sp in suppliers:
        sup_start = sp.get("supply_start_date") or sp["supply_date"]
        sup_end = sp.get("supply_end_date") or sp["supply_date"]
        sp_id = db.execute_cmd("""
            INSERT INTO supplier_payments (
                company_name, invoice_number, invoice_date, due_date, invoice_details,
                supply_date, supply_start_date, supply_end_date, amount, paid_amount, remaining_amount, status, payment_date, remarks, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sp["company_name"], sp["invoice_number"], sp["invoice_date"], sp["due_date"],
            sp["invoice_details"], sp["supply_date"], sup_start, sup_end, sp["amount"], sp["paid_amount"],
            sp["remaining_amount"], sp["status"], sp.get("payment_date"), sp["remarks"],
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
        
        if sp["paid_amount"] > 0:
            db.execute_cmd("""
                INSERT INTO supplier_payment_logs (
                    supplier_payment_id, payment_amount, payment_date, payment_method, reference_number, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                sp_id, sp["paid_amount"], sp.get("payment_date") or (today - timedelta(days=10)).strftime("%Y-%m-%d"),
                "Bank Transfer", f"INIT-{sp_id}", "Initial settlement disbursement", datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ))

    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed_database()
