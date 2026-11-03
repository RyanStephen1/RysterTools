"""
Saudi Labor Law & Compensation Domain Engine (services/hr_engine.py).
Handles Saudi Labor Law calculations (EOSB Articles 84/85/87, GOSI contributions, Nitaqat) and Worker Compensation.
"""

from datetime import datetime, date
from typing import Dict, Any, List, Optional
from core.config import (
    GOSI_SAUDI_EMPLOYEE_RATE,
    GOSI_SAUDI_EMPLOYER_RATE,
    GOSI_EXPAT_EMPLOYER_RATE,
    GOSI_MIN_CONTRIBUTION_BASE,
    GOSI_MAX_CONTRIBUTION_BASE,
    DEFAULT_MEAL_ALLOWANCE_RATE
)

class SaudiHREngine:
    """
    Core Domain Engine for Saudi Labor Law calculations, Statutory GOSI contributions,
    Nitaqat Saudization metrics, and Accounts Payable Aging schedules.
    """

    @staticmethod
    def calculate_eosb(
        basic_salary: float,
        gross_salary: float,
        start_date: str,
        end_date: str,
        reason: str = "resignation"
    ) -> Dict[str, Any]:
        """
        Calculates Saudi Labor Law End of Service Benefits (Articles 84, 85, 87).
        """
        try:
            d_start = datetime.strptime(start_date, "%Y-%m-%d").date()
            d_end = datetime.strptime(end_date, "%Y-%m-%d").date()
        except Exception as e:
            raise ValueError(f"Invalid date format for EOSB: {e}")

        if d_end < d_start:
            raise ValueError("End date cannot be prior to start date.")

        days_worked = (d_end - d_start).days
        years_of_service = days_worked / 365.25

        # Standard Article 84 base accrual
        if years_of_service <= 5:
            base_eosb = (basic_salary / 2.0) * years_of_service
        else:
            base_eosb = (basic_salary / 2.0) * 5.0 + (basic_salary * (years_of_service - 5.0))

        multiplier = 1.0
        applied_article = "Article 84 (Full Entitlement)"

        if reason.lower() == "resignation":
            applied_article = "Article 85 (Resignation Scale)"
            if years_of_service < 2.0:
                multiplier = 0.0
            elif years_of_service < 5.0:
                multiplier = 1.0 / 3.0
            elif years_of_service < 10.0:
                multiplier = 2.0 / 3.0
            else:
                multiplier = 1.0
        elif reason.lower() in ("female_marriage", "female_childbirth", "force_majeure"):
            applied_article = "Article 87 (Special Full Entitlement Exceptions)"
            multiplier = 1.0

        net_eosb = round(base_eosb * multiplier, 2)

        return {
            "years_of_service": round(years_of_service, 2),
            "days_of_service": days_worked,
            "applied_article": applied_article,
            "multiplier_percentage": round(multiplier * 100, 2),
            "base_eosb": round(base_eosb, 2),
            "net_eosb": net_eosb
        }

    @staticmethod
    def calculate_gosi(
        is_saudi: bool,
        basic_salary: float,
        housing_allowance: float = 0.0
    ) -> Dict[str, Any]:
        """
        Calculates GOSI statutory contributions using configured rates.
        """
        raw_base = basic_salary + housing_allowance
        gosi_base = min(max(raw_base, GOSI_MIN_CONTRIBUTION_BASE), GOSI_MAX_CONTRIBUTION_BASE)

        if is_saudi:
            emp_ded = round(gosi_base * GOSI_SAUDI_EMPLOYEE_RATE, 2)
            empr_cont = round(gosi_base * GOSI_SAUDI_EMPLOYER_RATE, 2)
        else:
            emp_ded = 0.0
            empr_cont = round(gosi_base * GOSI_EXPAT_EMPLOYER_RATE, 2)

        return {
            "gosi_base": gosi_base,
            "employee_deduction": emp_ded,
            "employer_contribution": empr_cont,
            "total_gosi": round(emp_ded + empr_cont, 2)
        }

    @staticmethod
    def calculate_saudization(total_employees: int, saudi_employees: int) -> Dict[str, Any]:
        """Calculates Nitaqat Saudization band."""
        if total_employees <= 0:
            return {"saudization_percentage": 0.0, "nitaqat_band": "Red"}

        ratio = (saudi_employees / total_employees) * 100.0
        band = "Red"
        if ratio >= 40.0:
            band = "Platinum"
        elif ratio >= 26.0:
            band = "High Green"
        elif ratio >= 18.0:
            band = "Medium Green"
        elif ratio >= 10.0:
            band = "Low Green"

        return {
            "saudization_percentage": round(ratio, 2),
            "nitaqat_band": band,
            "saudi_count": saudi_employees,
            "expat_count": total_employees - saudi_employees
        }

    @staticmethod
    def calculate_accounts_payable_aging(invoices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Computes Accounts Payable (AP) Aging Schedule (0-30, 31-60, 61-90, 90+ days).
        """
        today = date.today()
        buckets = {
            "current": {"amount": 0.0, "count": 0, "label": "0 - 30 Days (Current)"},
            "days_31_60": {"amount": 0.0, "count": 0, "label": "31 - 60 Days (Standard)"},
            "days_61_90": {"amount": 0.0, "count": 0, "label": "61 - 90 Days (Attention)"},
            "over_90": {"amount": 0.0, "count": 0, "label": "90+ Days (Critical Overdue)"}
        }

        total_outstanding = 0.0
        total_overdue = 0.0
        supplier_balances: Dict[str, float] = {}

        for inv in invoices:
            rem = float(inv.get("remaining_amount", 0.0) or 0.0)
            if rem <= 0.001:
                continue

            total_outstanding += rem
            comp_name = inv.get("company_name", "Unknown")
            supplier_balances[comp_name] = supplier_balances.get(comp_name, 0.0) + rem

            due_date_str = inv.get("due_date")
            try:
                due_d = datetime.strptime(due_date_str, "%Y-%m-%d").date()
                days_overdue = (today - due_d).days
            except Exception:
                days_overdue = 0

            if days_overdue <= 30:
                buckets["current"]["amount"] += rem
                buckets["current"]["count"] += 1
            elif days_overdue <= 60:
                buckets["days_31_60"]["amount"] += rem
                buckets["days_31_60"]["count"] += 1
                total_overdue += rem
            elif days_overdue <= 90:
                buckets["days_61_90"]["amount"] += rem
                buckets["days_61_90"]["count"] += 1
                total_overdue += rem
            else:
                buckets["over_90"]["amount"] += rem
                buckets["over_90"]["count"] += 1
                total_overdue += rem

        overdue_ratio = (total_overdue / total_outstanding * 100) if total_outstanding > 0 else 0.0

        return {
            "summary": {
                "total_outstanding_payable": round(total_outstanding, 2),
                "total_overdue_payable": round(total_overdue, 2),
                "overdue_ratio_percentage": round(overdue_ratio, 2)
            },
            "aging_buckets": buckets,
            "supplier_breakdown": supplier_balances,
            "processed_payments": invoices
        }

    @staticmethod
    def generate_wps_csv(
        records: List[Dict[str, Any]],
        cr_number: str,
        mol_establishment_id: str,
        wps_bank_code: str,
        payment_date: str
    ) -> str:
        """
        Generates SAMA (Saudi Central Bank) Wages Protection System (WPS) compliant CSV file content.
        """
        import io
        import csv
        output = io.StringIO()
        writer = csv.writer(output)

        tot_sal = sum(float(r.get("net_salary", 0) or 0) for r in records)
        count = len(records)

        # SAMA WPS Header Record
        writer.writerow(["HDR", cr_number, mol_establishment_id, wps_bank_code, payment_date, f"{tot_sal:.2f}", "SAR", str(count)])

        # SAMA WPS Worker Records
        for r in records:
            nid = str(r.get("national_id_iqama") or "")
            name = str(r.get("emp_name") or "")
            iban = str(r.get("iban") or "")
            basic = f"{float(r.get('basic_salary', 0)):.2f}"
            housing = f"{float(r.get('housing_allowance', 0)):.2f}"
            transport = f"{float(r.get('transport_allowance', 0)):.2f}"
            other = f"{float(r.get('other_allowances', 0)):.2f}"
            deductions = f"{float(r.get('gosi_employee', 0) or 0) + float(r.get('other_deductions', 0) or 0):.2f}"
            net = f"{float(r.get('net_salary', 0)):.2f}"

            writer.writerow(["DED", nid, "", name, iban, wps_bank_code, basic, housing, other, deductions, net])

        return output.getvalue()

    @staticmethod
    def check_expiries(employees: List[Dict[str, Any]], threshold_days: int = 90) -> Dict[str, Any]:
        """Checks Iqama, Passport, and Medical Insurance expiration alerts."""
        today = date.today()
        iqama_alerts = []
        passport_alerts = []
        insurance_alerts = []

        for emp in employees:
            iq_exp = emp.get("iqama_expiry_date")
            if iq_exp:
                try:
                    d = datetime.strptime(iq_exp, "%Y-%m-%d").date()
                    diff = (d - today).days
                    if diff <= threshold_days:
                        iqama_alerts.append({"employee_id": emp["id"], "name": f"{emp['first_name']} {emp['last_name']}", "emp_code": emp["emp_code"], "expiry_date": iq_exp, "days_remaining": diff, "is_expired": diff < 0})
                except Exception:
                    pass

            pass_exp = emp.get("passport_expiry_date")
            if pass_exp:
                try:
                    d = datetime.strptime(pass_exp, "%Y-%m-%d").date()
                    diff = (d - today).days
                    if diff <= threshold_days:
                        passport_alerts.append({"employee_id": emp["id"], "name": f"{emp['first_name']} {emp['last_name']}", "emp_code": emp["emp_code"], "expiry_date": pass_exp, "days_remaining": diff, "is_expired": diff < 0})
                except Exception:
                    pass

            ins_exp = emp.get("medical_insurance_expiry_date")
            if ins_exp:
                try:
                    d = datetime.strptime(ins_exp, "%Y-%m-%d").date()
                    diff = (d - today).days
                    if diff <= threshold_days:
                        insurance_alerts.append({"employee_id": emp["id"], "name": f"{emp['first_name']} {emp['last_name']}", "emp_code": emp["emp_code"], "expiry_date": ins_exp, "days_remaining": diff, "is_expired": diff < 0})
                except Exception:
                    pass

        return {
            "iqama_alerts": iqama_alerts,
            "passport_alerts": passport_alerts,
            "insurance_alerts": insurance_alerts,
            "total_alerts": len(iqama_alerts) + len(passport_alerts) + len(insurance_alerts)
        }



class CompensationEngine:
    """
    Domain Engine for Monthly Compensation, Direct Salary Updates, Allowance Categories,
    and Deductions Management.
    """

    @staticmethod
    def get_salary_tracking_summary(db) -> Dict[str, Any]:
        """Aggregates company-wide compensation totals, allowance breakdowns, and deduction totals."""
        employees = db.query_all("SELECT * FROM employees WHERE status = 'Active'")

        total_basic = sum(float(e.get("basic_salary", 0) or 0) for e in employees)
        total_meal = sum(float(e.get("housing_allowance", 0) or 0) for e in employees)
        total_site = sum(float(e.get("transport_allowance", 0) or 0) for e in employees)
        total_other = sum(float(e.get("other_allowances", 0) or 0) for e in employees)

        emp_allowances = db.query_all("""
            SELECT ea.*, ac.name as cat_name, ac.code as cat_code 
            FROM employee_allowances ea 
            JOIN allowance_categories ac ON ea.category_id = ac.id 
            WHERE ea.is_active = 1
        """)
        total_allow = sum(float(a.get("amount", 0) or 0) for a in emp_allowances)

        emp_deductions = db.query_all("""
            SELECT ed.*, dc.name as cat_name, dc.code as cat_code
            FROM employee_deductions ed
            JOIN deduction_categories dc ON ed.category_id = dc.id
            WHERE ed.is_active = 1
        """)
        total_ded = sum(float(d.get("amount", 0) or 0) for d in emp_deductions)
        total_gross = total_basic + total_meal + total_site + total_other + total_allow

        all_cats = db.query_all("SELECT code FROM allowance_categories")
        cat_breakdown: Dict[str, float] = {c["code"]: 0.0 for c in all_cats}
        for a in emp_allowances:
            code = a.get("cat_code", "OTHER")
            cat_breakdown[code] = cat_breakdown.get(code, 0.0) + float(a.get("amount", 0) or 0)

        all_ded_cats = db.query_all("SELECT code FROM deduction_categories")
        ded_breakdown: Dict[str, float] = {c["code"]: 0.0 for c in all_ded_cats}
        for d in emp_deductions:
            code = d.get("cat_code", "OTHER")
            ded_breakdown[code] = ded_breakdown.get(code, 0.0) + float(d.get("amount", 0) or 0)

        recent_increments = db.query_all("""
            SELECT sh.*, e.first_name, e.last_name, e.emp_code
            FROM salary_history sh
            JOIN employees e ON sh.employee_id = e.id
            ORDER BY sh.effective_date DESC, sh.id DESC
            LIMIT 10
        """)

        recent_logs = db.query_all("""
            SELECT sal.*, e.first_name, e.last_name, e.emp_code
            FROM salary_audit_logs sal
            JOIN employees e ON sal.employee_id = e.id
            ORDER BY sal.id DESC
            LIMIT 15
        """)

        return {
            "active_employees": len(employees),
            "total_monthly_basic": total_basic,
            "total_monthly_meal": total_meal,
            "total_monthly_site": total_site,
            "total_monthly_allowances": total_allow + total_other,
            "total_monthly_gross_payroll": total_gross,
            "total_monthly_deductions": total_ded,
            "category_breakdown": cat_breakdown,
            "deduction_category_breakdown": ded_breakdown,
            "recent_increments": recent_increments,
            "recent_logs": recent_logs
        }

    # Backward compatible aliases
    get_company_compensation_summary = get_salary_tracking_summary

    @staticmethod
    def evaluate_employee_compensation(employee_id: int, db) -> Dict[str, Any]:
        """
        Evaluates active contract compensation, allowances, deductions, and GOSI for an employee.
        """
        emp = db.query_one("SELECT * FROM employees WHERE id = ?", (employee_id,))
        if not emp:
            raise ValueError("Employee record not found.")

        basic = float(emp.get("basic_salary", 0) or 0)
        meal = float(emp.get("housing_allowance", 0) or 0)
        site = float(emp.get("transport_allowance", 0) or 0)
        other = float(emp.get("other_allowances", 0) or 0)

        # Recurring allowances
        emp_allowances = db.query_all("""
            SELECT ea.amount, ac.code 
            FROM employee_allowances ea
            JOIN allowance_categories ac ON ea.category_id = ac.id
            WHERE ea.employee_id = ? AND ea.is_active = 1
        """, (employee_id,))
        cat_allow_total = sum(float(a["amount"] or 0) for a in emp_allowances)

        gross = basic + meal + site + other + cat_allow_total

        # GOSI calculation
        gosi_res = SaudiHREngine.calculate_gosi(bool(emp.get("is_saudi", 1)), basic, meal)
        gosi_emp = gosi_res["employee_deduction"]
        gosi_empr = gosi_res["employer_contribution"]

        # Recurring deductions
        emp_deductions = db.query_all("""
            SELECT ed.amount, dc.code
            FROM employee_deductions ed
            JOIN deduction_categories dc ON ed.category_id = dc.id
            WHERE ed.employee_id = ? AND ed.is_active = 1
        """, (employee_id,))
        
        wps_ded = sum(float(d["amount"] or 0) for d in emp_deductions if d["code"] == "WPS")
        water_bill = sum(float(d["amount"] or 0) for d in emp_deductions if d["code"] == "WATER")
        cash_advance = sum(float(d["amount"] or 0) for d in emp_deductions if d["code"] == "ADVANCE")
        other_ded = sum(float(d["amount"] or 0) for d in emp_deductions if d["code"] not in ("WPS", "WATER", "ADVANCE"))

        total_ded = gosi_emp + wps_ded + water_bill + cash_advance + other_ded
        net_salary = max(0.0, gross - total_ded)

        return {
            "basic_salary": basic,
            "meal_allowance": meal,
            "site_allowance": site,
            "other_allowances": other + cat_allow_total,
            "gross_salary": gross,
            "gosi_employee": gosi_emp,
            "gosi_employer": gosi_empr,
            "wps_deduction": wps_ded,
            "water_bill": water_bill,
            "cash_advance": cash_advance,
            "other_deductions": other_ded,
            "total_deductions": total_ded,
            "net_salary": net_salary
        }

