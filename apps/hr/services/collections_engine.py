"""
Accounts Receivable & Client Collection Engine (services/collections_engine.py).
Handles client billing analytics, monthly collection lists, AR aging schedules, and statement reconciliation.
"""

from datetime import datetime, date
from typing import Dict, Any, List, Optional
from core.config import get_company_settings

class ClientCollectionEngine:
    """
    Accounts Receivable & Client Collection Engine.
    Handles client billing analytics, monthly collection lists, AR aging schedules, and statement reconciliation.
    """

    @staticmethod
    def get_monthly_collection_summary(month: int, year: int, db) -> Dict[str, Any]:
        """
        Computes monthly summary collection list and inbound revenue metrics.
        """
        period_prefix = f"{year:04d}-{month:02d}%"

        # Month Invoices
        invoices = db.query_all("""
            SELECT ci.*, c.contact_person, c.phone as client_phone, c.email as client_email, c.payment_terms
            FROM client_invoices ci
            LEFT JOIN clients c ON ci.client_id = c.id
            WHERE ci.invoice_date LIKE ? OR (ci.service_period_start LIKE ? OR ci.service_period_end LIKE ?)
            ORDER BY ci.invoice_date DESC
        """, (period_prefix, period_prefix, period_prefix))

        # Overall AR Aging & Totals across all active invoices
        all_active_invoices = db.query_all("""
            SELECT ci.*, c.name as client_full_name
            FROM client_invoices ci
            LEFT JOIN clients c ON ci.client_id = c.id
            ORDER BY ci.due_date ASC
        """)

        total_billed = sum(float(x["total_amount"] or 0) for x in all_active_invoices)
        total_collected = sum(float(x["collected_amount"] or 0) for x in all_active_invoices)
        total_remaining = sum(float(x["remaining_amount"] or 0) for x in all_active_invoices)

        # Current Month Collections
        month_logs = db.query_all("""
            SELECT ccl.*, ci.invoice_number, ci.client_name, ci.client_id
            FROM client_collection_logs ccl
            JOIN client_invoices ci ON ccl.client_invoice_id = ci.id
            WHERE ccl.payment_date LIKE ?
            ORDER BY ccl.payment_date DESC, ccl.id DESC
        """, (period_prefix,))

        month_collected_total = sum(float(x["payment_amount"] or 0) for x in month_logs)
        month_invoiced_total = sum(float(x["total_amount"] or 0) for x in invoices)
        month_remaining_total = sum(float(x["remaining_amount"] or 0) for x in invoices)

        # Aging schedule calculation
        aging = {
            "current": {"count": 0, "amount": 0.0, "label": "0 - 30 Days (Current)"},
            "days_31_60": {"count": 0, "amount": 0.0, "label": "31 - 60 Days (Standard)"},
            "days_61_90": {"count": 0, "amount": 0.0, "label": "61 - 90 Days (Attention)"},
            "over_90": {"count": 0, "amount": 0.0, "label": "90+ Days (Critical Overdue)"}
        }

        total_overdue = 0.0
        today = date.today()

        for inv in all_active_invoices:
            rem = float(inv["remaining_amount"] or 0)
            if rem <= 0.001:
                continue

            due_str = inv["due_date"]
            try:
                due_d = datetime.strptime(due_str, "%Y-%m-%d").date()
                days_past = (today - due_d).days
            except Exception:
                days_past = 0

            if days_past <= 30:
                aging["current"]["count"] += 1
                aging["current"]["amount"] += rem
            elif days_past <= 60:
                aging["days_31_60"]["count"] += 1
                aging["days_31_60"]["amount"] += rem
                total_overdue += rem
            elif days_past <= 90:
                aging["days_61_90"]["count"] += 1
                aging["days_61_90"]["amount"] += rem
                total_overdue += rem
            else:
                aging["over_90"]["count"] += 1
                aging["over_90"]["amount"] += rem
                total_overdue += rem

        # Client Summary Collection Breakdown
        client_breakdown = db.query_all("""
            SELECT 
                COALESCE(c.id, 0) as client_id,
                COALESCE(c.name, ci.client_name) as client_name,
                COUNT(ci.id) as total_invoices,
                SUM(ci.total_amount) as total_invoiced,
                SUM(ci.collected_amount) as total_collected,
                SUM(ci.remaining_amount) as total_balance,
                MAX(ci.payment_date) as last_collection_date
            FROM client_invoices ci
            LEFT JOIN clients c ON ci.client_id = c.id
            GROUP BY COALESCE(c.id, 0), COALESCE(c.name, ci.client_name)
            ORDER BY total_balance DESC, total_invoiced DESC
        """)

        collection_rate = (total_collected / total_billed * 100) if total_billed > 0 else 0.0

        return {
            "month": month,
            "year": year,
            "month_invoiced_total": month_invoiced_total,
            "month_collected_total": month_collected_total,
            "month_remaining_total": month_remaining_total,
            "total_billed": total_billed,
            "total_collected": total_collected,
            "total_remaining": total_remaining,
            "total_overdue": total_overdue,
            "collection_rate": round(collection_rate, 2),
            "aging_schedule": aging,
            "client_breakdown": client_breakdown,
            "month_invoices": invoices,
            "month_logs": month_logs
        }

    @staticmethod
    def get_client_statement(client_id: int, db) -> Dict[str, Any]:
        """
        Retrieves detailed client account ledger, invoices, and payment receipts.
        """
        client = db.query_one("SELECT * FROM clients WHERE id = ?", (client_id,))
        if not client:
            inv_sample = db.query_one("SELECT client_name FROM client_invoices WHERE client_id = ? OR id = ?", (client_id, client_id))
            client_name = inv_sample["client_name"] if inv_sample else "Client"
            client = {
                "id": client_id,
                "name": client_name,
                "contact_person": "N/A",
                "phone": "N/A",
                "email": "N/A",
                "payment_terms": "Net 30",
                "address": "KSA"
            }

        invoices = db.query_all("""
            SELECT * FROM client_invoices
            WHERE client_id = ? OR client_name = ?
            ORDER BY invoice_date DESC, id DESC
        """, (client_id, client.get("name", "")))

        inv_ids = [str(x["id"]) for x in invoices]
        logs = []
        if inv_ids:
            placeholders = ",".join("?" for _ in inv_ids)
            logs = db.query_all(f"""
                SELECT ccl.*, ci.invoice_number 
                FROM client_collection_logs ccl
                JOIN client_invoices ci ON ccl.client_invoice_id = ci.id
                WHERE ccl.client_invoice_id IN ({placeholders})
                ORDER BY ccl.payment_date DESC, ccl.id DESC
            """, tuple(inv_ids))

        total_billed = sum(float(x["total_amount"] or 0) for x in invoices)
        total_paid = sum(float(x["collected_amount"] or 0) for x in invoices)
        balance_due = sum(float(x["remaining_amount"] or 0) for x in invoices)

        return {
            "client": client,
            "invoices": invoices,
            "logs": logs,
            "total_billed": total_billed,
            "total_paid": total_paid,
            "balance_due": balance_due
        }
