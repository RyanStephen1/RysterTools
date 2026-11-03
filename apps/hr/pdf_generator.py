"""
PDF Document Generator Shim (Backward Compatibility).
Redirects to services.pdf_service module.
"""

from services.pdf_service import (
    MONTH_NAMES,
    format_long_date,
    format_date_range,
    format_long_datetime,
    format_pay_period,
    html_to_pdf_playwright,
    generate_supplier_summary_report_pdf,
    generate_supplier_statement_pdf,
    generate_payslip_pdf,
    generate_monthly_payroll_schedule_pdf,
    generate_client_collection_summary_pdf,
    generate_client_statement_pdf,
    DocumentService
)

__all__ = [
    "MONTH_NAMES",
    "format_long_date",
    "format_date_range",
    "format_long_datetime",
    "format_pay_period",
    "html_to_pdf_playwright",
    "generate_supplier_summary_report_pdf",
    "generate_supplier_statement_pdf",
    "generate_payslip_pdf",
    "generate_monthly_payroll_schedule_pdf",
    "generate_client_collection_summary_pdf",
    "generate_client_statement_pdf",
    "DocumentService"
]
