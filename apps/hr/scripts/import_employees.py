import os
import openpyxl
from datetime import datetime, date, timedelta
import database_cloud as db

def parse_date_flexible(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, (int, float)):
        try:
            dt = datetime(1899, 12, 30) + timedelta(days=float(val))
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    raw = str(val).strip()
    if not raw or raw.lower() in ("-", "n/a", "none", "null", ""):
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y"):
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

def parse_float_safe(val, default=0.0):
    if val is None:
        return default
    try:
        s = str(val).replace(",", "").replace("SAR", "").replace("sar", "").strip()
        return float(s) if s else default
    except Exception:
        return default

def clean_name(name_str):
    if not name_str:
        return "Employee", None, "Staff"
    # Remove excessive dashes or spaces
    cleaned = str(name_str).replace(" - ", " ").replace(" -", " ").replace("- ", " ").strip()
    words = [w.capitalize() for w in cleaned.split() if w and w != "-"]
    if not words:
        return "Employee", None, "Staff"
    if len(words) == 1:
        return words[0], None, words[0]
    elif len(words) == 2:
        return words[0], None, words[1]
    elif len(words) == 3:
        return words[0], words[1], words[2]
    else:
        return words[0], words[1], " ".join(words[2:])

def get_department_for_job(job_title):
    jt = str(job_title or "").strip().lower()
    if "accountant" in jt or "finance" in jt:
        return "Finance & Accounting", "FIN"
    elif "human resources" in jt or "hr" in jt or "administrative" in jt or "admin" in jt:
        return "Human Resources & Admin", "HR"
    elif "customer" in jt or "data entry" in jt:
        return "Customer Operations & Data Management", "OPS-DATA"
    elif "government" in jt or "gro" in jt or "relations" in jt:
        return "Government Relations (GRO) & Compliance", "GRO"
    elif "cleaner" in jt or "cleaning" in jt or "facilities" in jt:
        return "Facilities & Maintenance", "FAC"
    elif "manager" in jt or "director" in jt or "executive" in jt:
        return "Executive Management", "EXEC"
    elif "translator" in jt or "legal" in jt:
        return "Legal & Translation Services", "LEGAL"
    elif "construction" in jt or "port" in jt or "worker" in jt:
        return "Site & Port Operations", "SITE"
    else:
        return "Operations & Logistics", "OPS"

def get_worker_type_for_job(job_title):
    jt = str(job_title or "").strip().lower()
    if any(k in jt for k in ["worker", "cleaner", "technician", "labor", "driver", "operator"]):
        return "Direct"
    return "Indirect"

def populate_from_employeelist(excel_path="employeelist.xlsx"):
    print(f"==================================================")
    print(f"CLEARING ALL EXISTING EMPLOYEES & IMPORTING: {excel_path}")
    print(f"==================================================")

    db.init_db()

    # Clear employees and linked relational rows cleanly
    for tbl in ["daily_timesheets", "worker_timesheets", "leaves", "payroll_details", "payroll_runs", "documents", "employees"]:
        try:
            db.execute_cmd(f"DELETE FROM {tbl}")
        except Exception:
            pass

    wb = openpyxl.load_workbook(excel_path, data_only=True)

    # Pre-populate / ensure core departments exist
    dept_map = {}
    for d in db.query_all("SELECT id, name, code FROM departments"):
        dept_map[d["name"].strip().lower()] = d["id"]
        dept_map[d["code"].strip().lower()] = d["id"]

    all_parsed = []

    # 1. Process 'All employees' sheet (Active employees)
    if "All employees" in wb.sheetnames:
        ws = wb["All employees"]
        headers = [str(c.value or "").strip() for c in ws[1]]
        for row in ws.iter_rows(min_row=2, values_only=False):
            if not any(c.value for c in row):
                continue
            r = {headers[i]: c.value for i, c in enumerate(row) if i < len(headers)}
            
            full_name = r.get("Full Name")
            if not full_name or not str(full_name).strip():
                continue
            first_n, mid_n, last_n = clean_name(full_name)
            
            iqama = str(r.get("Iqama/ National ID") or "").strip()
            job_title = str(r.get("Job Title") or "Staff").strip()
            arabic_profession = str(r.get("المهنة") or "").strip()
            gender = str(r.get("Gender") or "Male").capitalize()
            nat = str(r.get("Nationality") or "Saudi").strip()
            is_saudi = 1 if "saudi" in nat.lower() else 0
            
            joining_date = parse_date_flexible(r.get("Joining Date")) or "2025-08-01"
            dob = parse_date_flexible(r.get("DOB"))
            
            phone_raw = str(r.get("Mobile #") or "").strip()
            if phone_raw and not phone_raw.startswith("+"):
                if phone_raw.startswith("5"):
                    phone_raw = f"+966{phone_raw}"
                elif phone_raw.startswith("05"):
                    phone_raw = f"+966{phone_raw[1:]}"
            
            email = str(r.get("Email") or "").strip()
            if not email or "@" not in email:
                clean_uname = f"{first_n.lower()}.{last_n.lower().replace(' ', '')}"
                email = f"{clean_uname}@alamal-ksa.com"
                
            basic = parse_float_safe(r.get("Basic"), 3200.0)
            hra = parse_float_safe(r.get("HRA"), 800.0 if is_saudi else 0.0)
            tra = parse_float_safe(r.get("TRA"), 0.0)
            food = parse_float_safe(r.get("FOOD"), 0.0)
            shift = parse_float_safe(r.get("SHIFT"), 0.0)
            other = parse_float_safe(r.get("OTHER"), 0.0)
            other_total = food + shift + other
            
            iban = str(r.get("IBAN") or "").strip()
            bank_name = str(r.get("Bank Name") or "Al Rajhi Bank").strip()
            
            contract_period = r.get("Contract Period")
            contract_type = f"{contract_period} Year Fixed" if contract_period else "Fixed"
            
            dept_name, dept_code = get_department_for_job(job_title)
            dept_key = dept_name.lower()
            existing_d = db.query_one("SELECT id FROM departments WHERE LOWER(name) = ? OR LOWER(code) = ?", (dept_key, dept_code.lower()))
            if existing_d:
                dept_id = existing_d["id"]
                dept_map[dept_key] = dept_id
            else:
                code_cand = dept_code
                cnt = 1
                while db.query_one("SELECT id FROM departments WHERE code = ?", (code_cand,)):
                    code_cand = f"{dept_code[:4]}{cnt}"
                    cnt += 1
                dept_id = db.execute_cmd(
                    "INSERT INTO departments (name, code, budget) VALUES (?, ?, ?)",
                    (dept_name, code_cand, 250000.0)
                )
                dept_map[dept_key] = dept_id
                dept_map[dept_code.lower()] = dept_id
                
            worker_type = get_worker_type_for_job(job_title)

            all_parsed.append({
                "first_name": first_n,
                "middle_name": mid_n,
                "last_name": last_n,
                "arabic_name": arabic_profession if arabic_profession else None,
                "email": email,
                "phone": phone_raw if phone_raw else None,
                "national_id_iqama": iqama,
                "nationality": nat,
                "gender": gender,
                "is_saudi": is_saudi,
                "dob": dob,
                "department_id": dept_id,
                "designation": job_title,
                "worker_type": worker_type,
                "hire_date": joining_date,
                "contract_type": contract_type,
                "basic_salary": basic,
                "housing_allowance": hra,
                "transport_allowance": tra,
                "other_allowances": other_total,
                "bank_name": bank_name if bank_name else None,
                "iban": iban if iban else None,
                "status": "Active"
            })

    # 2. Process 'Termination' sheet
    if "Termination" in wb.sheetnames:
        ws_t = wb["Termination"]
        headers_t = [str(c.value or "").strip() for c in ws_t[1]]
        for row in ws_t.iter_rows(min_row=2, values_only=False):
            if not any(c.value for c in row):
                continue
            r = {headers_t[i]: c.value for i, c in enumerate(row) if i < len(headers_t)}
            full_name = r.get("Full Name")
            if not full_name or not str(full_name).strip():
                continue
            first_n, mid_n, last_n = clean_name(full_name)
            iqama = str(r.get("Iqama/ National ID") or "").strip()
            job_title = str(r.get("Job Title") or "Staff").strip()
            nat = str(r.get("Nationality") or "Saudi").strip()
            is_saudi = 1 if "saudi" in nat.lower() else 0
            joining_date = parse_date_flexible(r.get("Joining Date")) or "2025-08-01"
            dob = parse_date_flexible(r.get("DOB"))
            
            basic = parse_float_safe(r.get("Basic"), 3000.0)
            hra = parse_float_safe(r.get("HRA"), 0.0)
            tra = parse_float_safe(r.get("TRA"), 0.0)
            food = parse_float_safe(r.get("FOOD"), 0.0)
            shift = parse_float_safe(r.get("SHIFT"), 0.0)
            other = parse_float_safe(r.get("OTHER"), 0.0)
            
            dept_name, dept_code = get_department_for_job(job_title)
            dept_key = dept_name.lower()
            dept_id = dept_map.get(dept_key) or dept_map.get("ops")
            
            all_parsed.append({
                "first_name": first_n,
                "middle_name": mid_n,
                "last_name": last_n,
                "arabic_name": str(r.get("المهنة") or "").strip() or None,
                "email": f"{first_n.lower()}.{last_n.lower().replace(' ', '')}@alamal-ksa.com",
                "phone": str(r.get("Mobile #") or "").strip() or None,
                "national_id_iqama": iqama,
                "nationality": nat,
                "gender": str(r.get("Gender") or "Male").capitalize(),
                "is_saudi": is_saudi,
                "dob": dob,
                "department_id": dept_id,
                "designation": job_title,
                "worker_type": get_worker_type_for_job(job_title),
                "hire_date": joining_date,
                "contract_type": "Terminated",
                "basic_salary": basic,
                "housing_allowance": hra,
                "transport_allowance": tra,
                "other_allowances": food + shift + other,
                "bank_name": str(r.get("Bank Name") or "Al Rajhi Bank").strip(),
                "iban": str(r.get("IBAN") or "").strip(),
                "status": "Terminated"
            })

    # CRITICAL: SORT BY JOINING DATE (HIRE_DATE ASCENDING)
    all_parsed.sort(key=lambda x: str(x.get("hire_date") or "9999-99-99"))

    print(f"Total employees parsed from employeelist.xlsx: {len(all_parsed)}")
    print("Assigning sequential Employee Codes sorted by Joining Date...")

    inserted_count = 0
    for idx, emp in enumerate(all_parsed, 1):
        emp_code = f"EMP-{idx:03d}"
        emp["emp_code"] = emp_code

        # If email collision happens, make unique
        base_email = emp["email"]
        e_cnt = 1
        while db.query_one("SELECT id FROM employees WHERE email = ?", (emp["email"],)):
            parts = base_email.split("@")
            emp["email"] = f"{parts[0]}{e_cnt}@{parts[1]}"
            e_cnt += 1

        db.execute_cmd("""
            INSERT INTO employees (
                emp_code, first_name, middle_name, last_name, arabic_name, email, phone,
                national_id_iqama, nationality, gender, is_saudi, dob,
                department_id, designation, worker_type, hire_date, contract_type,
                bank_name, iban, basic_salary, housing_allowance, transport_allowance, other_allowances,
                status
            ) VALUES (
                :emp_code, :first_name, :middle_name, :last_name, :arabic_name, :email, :phone,
                :national_id_iqama, :nationality, :gender, :is_saudi, :dob,
                :department_id, :designation, :worker_type, :hire_date, :contract_type,
                :bank_name, :iban, :basic_salary, :housing_allowance, :transport_allowance, :other_allowances,
                :status
            )
        """, emp)
        inserted_count += 1

    print(f"\n=======================================================")
    print(f"EMPLOYEE DIRECTORY SUCCESSFULLY RESET AND POPULATED!")
    print(f"Total Imported from employeelist.xlsx: {inserted_count} employees")
    print(f"Earliest Joining Date: {all_parsed[0]['hire_date']} ({all_parsed[0]['first_name']} {all_parsed[0]['last_name']})")
    print(f"Latest Joining Date: {all_parsed[-1]['hire_date']} ({all_parsed[-1]['first_name']} {all_parsed[-1]['last_name']})")
    print(f"=======================================================\n")

if __name__ == "__main__":
    populate_from_employeelist("employeelist.xlsx")
