import os
import io
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from playwright.sync_api import sync_playwright

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

def format_long_date(date_val: Optional[str]) -> str:
    """Formats 'YYYY-MM-DD' into clean calendar format e.g. '05 Oct 2026'."""
    if not date_val or not str(date_val).strip() or str(date_val).strip() in ("-", "N/A", "None", ""):
        return "-"
    raw = str(date_val).strip()
    try:
        if len(raw) >= 10:
            dt = datetime.strptime(raw[:10], "%Y-%m-%d")
            return dt.strftime("%d %b %Y")
    except Exception:
        pass
    return raw

def format_date_range(start_val: Optional[str], end_val: Optional[str]) -> str:
    """Formats start and end dates into '01 Jul 2026 – 31 Jul 2026'."""
    d1 = format_long_date(start_val)
    d2 = format_long_date(end_val)
    if d1 == "-" and d2 == "-":
        return "N/A"
    if d1 != "-" and d2 != "-" and d1 != d2:
        return f"{d1} – {d2}"
    return d1 if d1 != "-" else d2

def format_long_datetime(dt_val: Optional[Any] = None) -> str:
    """Formats current or provided datetime into '16 Aug 2026, 09:00 PM'."""
    if dt_val is None:
        dt = datetime.now()
    elif isinstance(dt_val, datetime):
        dt = dt_val
    else:
        try:
            dt = datetime.strptime(str(dt_val)[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            dt = datetime.now()
    return dt.strftime("%d %b %Y, %I:%M %p")

def format_pay_period(month_val: Any, year_val: Any) -> str:
    """Formats month and year into 'August 2026'."""
    try:
        m = int(month_val)
        y = int(year_val)
        if 1 <= m <= 12:
            return f"{MONTH_NAMES[m]} {y}"
    except Exception:
        pass
    return f"{month_val}/{year_val}"

def html_to_pdf_playwright(html_content: str, landscape: bool = False) -> bytes:
    """Renders pixel-perfect, modern vector PDFs using Playwright Chromium."""
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        )
        page = browser.new_page()
        page.set_content(html_content, wait_until='networkidle')
        pdf_bytes = page.pdf(
            format='Letter',
            landscape=landscape,
            print_background=True,
            margin={'top': '20px', 'bottom': '20px', 'left': '22px', 'right': '22px'}
        )
        browser.close()
        return pdf_bytes


# =========================================================================
# 1. EXECUTIVE ACCOUNTS PAYABLE & SUPPLIER AUDIT REPORT (FOR BOSS / CFO)
# =========================================================================
def generate_supplier_summary_report_pdf(
    invoices: List[Dict[str, Any]],
    summary_stats: Dict[str, Any],
    company_info: Dict[str, Any],
    filter_info: Optional[Dict[str, Any]] = None
) -> bytes:
    """
    Generates a high-stakes, executive-grade Accounts Payable Financial Advisory Report PDF
    using Playwright with rich corporate styling, supplier grouping, subtotal ribbons,
    cash-flow advisory, and boardroom verification.
    """
    company_name = company_info.get("company_name", "ADK Co., LTD.")
    ar_name = company_info.get("company_arabic_name", "شركة إيه دي كيه للخدمات الصناعية المحدودة")
    cr_num = company_info.get("cr_number", "2055001234")
    address = company_info.get("address", "2837, B13, Tebah District, Al Jubail, Kingdom of Saudi Arabia")
    
    gen_time = format_long_datetime()
    f_info = filter_info or {}
    sel_sups = f_info.get("selected_suppliers", "All Registered Suppliers")
    st_filter = f_info.get("status", "All Statuses")
    date_scope = f_info.get("date_range", "All Historical Invoices")
    
    tot_billed = float(summary_stats.get("total_billed", sum(float(i.get("amount", 0)) for i in invoices)))
    tot_paid = float(summary_stats.get("total_paid", sum(float(i.get("paid_amount", 0)) for i in invoices)))
    tot_rem = float(summary_stats.get("total_outstanding_payable", sum(float(i.get("remaining_amount", 0)) for i in invoices)))
    
    settled_pct = round((tot_paid / tot_billed * 100), 1) if tot_billed > 0 else 100.0
    open_invoices_count = sum(1 for i in invoices if float(i.get("remaining_amount", 0)) > 0)
    
    # Group and sort by supplier
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for inv in invoices:
        c_name = str(inv.get("company_name", "Other Registered Vendors")).strip()
        if c_name not in grouped:
            grouped[c_name] = []
        grouped[c_name].append(inv)
        
    sorted_suppliers = sorted(
        grouped.items(),
        key=lambda x: sum(float(i.get("remaining_amount", max(0.0, float(i.get("amount", 0)) - float(i.get("paid_amount", 0))))) for i in x[1]),
        reverse=True
    )
    
    vendor_sections_html = ""
    for v_idx, (vendor_name, v_invoices) in enumerate(sorted_suppliers, 1):
        v_billed = sum(float(i.get("amount", 0.0)) for i in v_invoices)
        v_paid = sum(float(i.get("paid_amount", 0.0)) for i in v_invoices)
        v_rem = sum(float(i.get("remaining_amount", max(0.0, float(i.get("amount", 0.0)) - float(i.get("paid_amount", 0.0))))) for i in v_invoices)
        
        sorted_v_invoices = sorted(v_invoices, key=lambda x: str(x.get("invoice_date", "")))
        
        inv_rows_html = ""
        for inv in sorted_v_invoices:
            period_str = format_date_range(
                inv.get("supply_start_date") or inv.get("supply_date"),
                inv.get("supply_end_date") or inv.get("supply_date")
            )
            inv_d_str = format_long_date(inv.get("invoice_date"))
            due_d_str = format_long_date(inv.get("due_date"))
            
            amt = float(inv.get("amount", 0.0))
            pd = float(inv.get("paid_amount", 0.0))
            rem = float(inv.get("remaining_amount", max(0.0, amt - pd)))
            st_text = str(inv.get("status", "Pending"))
            inv_num = str(inv.get('invoice_number') or f"#INV-{inv.get('id', '001')}")
            
            badge_class = "badge-paid" if st_text == "Paid" else ("badge-partial" if st_text in ("Partially Paid", "Partial") else "badge-pending")
            
            inv_rows_html += f"""
            <tr>
              <td><strong>{inv_num}</strong></td>
              <td>{inv_d_str}</td>
              <td>{period_str}</td>
              <td>{due_d_str}</td>
              <td class="num">{amt:,.2f}</td>
              <td class="num font-green">{pd:,.2f}</td>
              <td class="num {'font-red bold' if rem > 0 else 'font-green bold'}">{rem:,.2f}</td>
              <td class="text-center"><span class="badge {badge_class}">{st_text.upper()}</span></td>
            </tr>
            """
            
        vendor_sections_html += f"""
        <div class="vendor-block">
          <div class="vendor-banner">
            <div class="vendor-title">🏢 VENDOR #{v_idx}: <strong>{vendor_name.upper()}</strong> <span class="vendor-count">({len(v_invoices)} Invoices)</span></div>
            <div class="vendor-meta">
              Billed: <strong>SAR {v_billed:,.2f}</strong> &nbsp;|&nbsp;
              Paid: <strong style="color: #6EE7B7;">SAR {v_paid:,.2f}</strong> &nbsp;|&nbsp;
              Net Due: <strong style="color: #FCA5A5;">SAR {v_rem:,.2f}</strong>
            </div>
          </div>
          
          <table class="data-table">
            <thead>
              <tr>
                <th>INVOICE #</th>
                <th>INVOICE DATE</th>
                <th>SUPPLY PERIOD</th>
                <th>DUE DATE</th>
                <th class="text-right">BILLED (SAR)</th>
                <th class="text-right">PAID (SAR)</th>
                <th class="text-right">BALANCE DUE (SAR)</th>
                <th class="text-center">PAYMENT STATUS</th>
              </tr>
            </thead>
            <tbody>
              {inv_rows_html}
            </tbody>
            <tfoot>
              <tr class="subtotal-row">
                <td colspan="4"><strong>SUBTOTAL ({vendor_name}):</strong></td>
                <td class="num"><strong>SAR {v_billed:,.2f}</strong></td>
                <td class="num font-green"><strong>SAR {v_paid:,.2f}</strong></td>
                <td class="num {'font-red bold' if v_rem > 0 else 'font-green bold'}"><strong>SAR {v_rem:,.2f}</strong></td>
                <td class="text-center"><strong>● {len(v_invoices)} Bills</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
        """
        
    html = f"""<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Accounts Payable Financial Audit Report</title>
      <style>
        @page {{
          size: letter;
          margin: 0;
        }}
        * {{
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }}
        body {{
          background-color: #FFFFFF;
          color: #0F172A;
          padding: 16px 20px;
          font-size: 8pt;
          line-height: 1.35;
        }}
        .header-banner {{
          background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
          color: #FFFFFF;
          padding: 12px 16px;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 3px solid #B45309;
        }}
        .header-left .comp-title {{
          font-size: 13pt;
          font-weight: 800;
          letter-spacing: -0.2px;
        }}
        .header-left .comp-ar {{
          font-size: 8.5pt;
          color: #94A3B8;
          margin-top: 1px;
        }}
        .header-left .comp-meta {{
          font-size: 7pt;
          color: #64748B;
          margin-top: 2px;
        }}
        .header-right {{
          text-align: right;
        }}
        .header-right .doc-badge {{
          font-size: 12pt;
          font-weight: 800;
          color: #FEF3C7;
          letter-spacing: 0.5px;
        }}
        .header-right .doc-ar {{
          font-size: 8pt;
          color: #FDE68A;
        }}
        .header-right .doc-meta {{
          font-size: 7pt;
          color: #94A3B8;
          margin-top: 2px;
        }}
        
        .scope-strip {{
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 6px;
          padding: 6px 12px;
          margin: 8px 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 16px;
          font-size: 7.5pt;
        }}
        .scope-item strong {{
          color: #0F172A;
        }}
        
        .kpi-grid {{
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 10px;
        }}
        .kpi-card {{
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid #CBD5E1;
          text-align: center;
        }}
        .kpi-card.blue {{ background: #EFF6FF; border-color: #BFDBFE; }}
        .kpi-card.green {{ background: #ECFDF5; border-color: #A7F3D0; }}
        .kpi-card.red {{ background: #FEF2F2; border-color: #FECACA; }}
        .kpi-card.gold {{ background: #FEF3C7; border-color: #FDE68A; }}
        
        .kpi-label {{
          font-size: 6.5pt;
          font-weight: 700;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }}
        .kpi-val {{
          font-size: 11.5pt;
          font-weight: 800;
          color: #0F172A;
          margin: 2px 0;
        }}
        .kpi-sub {{
          font-size: 6.5pt;
          font-weight: 700;
        }}
        
        .vendor-block {{
          margin-bottom: 10px;
          page-break-inside: avoid;
        }}
        .vendor-banner {{
          background: #1E293B;
          color: #FFFFFF;
          padding: 5px 10px;
          border-radius: 5px 5px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8pt;
        }}
        .vendor-banner .vendor-title {{
          font-weight: 700;
        }}
        .vendor-banner .vendor-count {{
          font-size: 7pt;
          color: #CBD5E1;
          font-weight: normal;
        }}
        
        .data-table {{
          width: 100%;
          border-collapse: collapse;
          font-size: 7.2pt;
          border: 1px solid #CBD5E1;
          border-top: none;
        }}
        .data-table th {{
          background: #065F46;
          color: #FFFFFF;
          font-weight: 700;
          padding: 4px 6px;
          text-align: left;
          font-size: 6.8pt;
        }}
        .data-table td {{
          padding: 3.5px 6px;
          border-bottom: 1px solid #E2E8F0;
          color: #334155;
        }}
        .data-table tbody tr:nth-child(even) {{
          background-color: #F8FAFC;
        }}
        .subtotal-row td {{
          background-color: #E2E8F0;
          border-top: 1.5px solid #94A3B8;
          color: #0F172A;
          font-size: 7.5pt;
        }}
        
        .badge {{
          display: inline-block;
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 6.2pt;
          font-weight: 700;
        }}
        .badge-paid {{ background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; }}
        .badge-partial {{ background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; }}
        .badge-pending {{ background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA; }}
        
        .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .text-right {{ text-align: right; }}
        .text-center {{ text-align: center; }}
        .font-green {{ color: #065F46; }}
        .font-red {{ color: #991B1B; }}
        .bold {{ font-weight: 700; }}
        
        .grand-total-bar {{
          background: #FEF3C7;
          border: 1.5px solid #B45309;
          border-radius: 6px;
          padding: 6px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8pt;
          margin-bottom: 8px;
        }}
        
        .advisory-box {{
          background: #EFF6FF;
          border: 1px solid #3B82F6;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 7.2pt;
          color: #0F172A;
          margin-bottom: 10px;
        }}
        
        .sig-grid {{
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 8px;
        }}
        .sig-card {{
          background: #F8FAFC;
          border: 1px solid #CBD5E1;
          border-radius: 6px;
          padding: 6px 10px;
          text-align: center;
        }}
        .sig-card .sig-title {{
          font-size: 7.2pt;
          font-weight: 700;
          color: #0F172A;
          margin-bottom: 2px;
        }}
        .sig-card .sig-dept {{
          font-size: 6.8pt;
          color: #64748B;
          margin-bottom: 14px;
        }}
        .sig-line {{
          border-top: 1px solid #94A3B8;
          padding-top: 3px;
          font-size: 6.5pt;
          color: #64748B;
        }}
        
        .footer-note {{
          text-align: center;
          font-size: 6.5pt;
          color: #94A3B8;
          margin-top: 6px;
        }}
      </style>
    </head>
    <body>
      <div class="header-banner">
        <div class="header-left">
          <div class="comp-title">🏢 {company_name}</div>
          <div class="comp-ar">{ar_name}</div>
          <div class="comp-meta">Commercial Reg: {cr_num} • VAT: 300492819200003 • {address}</div>
        </div>
        <div class="header-right">
          <div class="doc-badge">ACCOUNTS PAYABLE & SUPPLIER AUDIT</div>
          <div class="doc-ar">تقرير التزامات الموردين والتدفقات النقدية</div>
          <div class="doc-meta">Generated: {gen_time} • Strictly Confidential</div>
        </div>
      </div>
      
      <div class="scope-strip">
        <div class="scope-item"><strong>REPORTING SCOPE:</strong> {sel_sups}</div>
        <div class="scope-item"><strong>AUDIT TIMESTAMP:</strong> {gen_time}</div>
        <div class="scope-item"><strong>PAYMENT STATUS SCOPE:</strong> {st_filter}</div>
        <div class="scope-item"><strong>DATE RANGE:</strong> {date_scope}</div>
      </div>
      
      <div class="kpi-grid">
        <div class="kpi-card blue">
          <div class="kpi-label">TOTAL BILLED LIABILITY</div>
          <div class="kpi-val">SAR {tot_billed:,.2f}</div>
          <div class="kpi-sub" style="color: #1E40AF;">{len(invoices)} Invoices In Scope</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">SETTLED DISBURSEMENTS</div>
          <div class="kpi-val" style="color: #065F46;">SAR {tot_paid:,.2f}</div>
          <div class="kpi-sub" style="color: #065F46;">● {settled_pct}% Disbursed</div>
        </div>
        <div class="kpi-card {'red' if tot_rem > 0 else 'green'}">
          <div class="kpi-label">OUTSTANDING PAYABLE (NET DUE)</div>
          <div class="kpi-val" style="color: {'#991B1B' if tot_rem > 0 else '#065F46'};">SAR {tot_rem:,.2f}</div>
          <div class="kpi-sub" style="color: {'#991B1B' if tot_rem > 0 else '#065F46'};">{'● ' + str(open_invoices_count) + ' Open Invoices' if tot_rem > 0 else '● Fully Settled'}</div>
        </div>
        <div class="kpi-card gold">
          <div class="kpi-label">WORKING CAPITAL IMPACT</div>
          <div class="kpi-val">SAR {tot_rem:,.2f}</div>
          <div class="kpi-sub" style="color: #B45309;">Cash Flow Advisory Active</div>
        </div>
      </div>
      
      {vendor_sections_html}
      
      <div class="grand-total-bar">
        <div><strong>CONSOLIDATED ACCOUNTS PAYABLE GRAND TOTALS:</strong></div>
        <div>Billed: <strong>SAR {tot_billed:,.2f}</strong></div>
        <div style="color: #065F46;">Disbursed: <strong>SAR {tot_paid:,.2f}</strong></div>
        <div style="color: #991B1B;">Total Net Liability: <strong>SAR {tot_rem:,.2f}</strong></div>
      </div>
      
      <div class="advisory-box">
        <strong>CFO & Financial Advisory Commentary:</strong> Out of <strong>SAR {tot_billed:,.2f}</strong> total liabilities, 
        <strong>SAR {tot_paid:,.2f} ({settled_pct}%)</strong> has been successfully settled via corporate bank transfer. 
        The net remaining liability of <strong>SAR {tot_rem:,.2f}</strong> is distributed across {open_invoices_count} open invoice(s). 
        <strong>Strategic Recommendation:</strong> Prioritize settlement for due vendor invoices to ensure supply continuity and preserve vendor credit terms.
      </div>
      
      <div class="sig-grid">
        <div class="sig-card">
          <div class="sig-title">PREPARED BY: SENIOR FINANCIAL CONTROLLER / ADVISOR</div>
          <div class="sig-dept">Treasury & Accounts Payable Division</div>
          <div class="sig-line">Signature & Audit Verification Stamp</div>
        </div>
        <div class="sig-card">
          <div class="sig-title">APPROVED BY: CHIEF EXECUTIVE OFFICER (CEO) / MANAGING DIRECTOR</div>
          <div class="sig-dept">Executive Leadership & Board of Directors</div>
          <div class="sig-line">Authorized Signature & Official Corporate Seal</div>
        </div>
      </div>
      
      <div class="footer-note">
        Page 1 of 1 | Strictly Confidential • Certified Accounts Payable Audit Report under Saudi Corporate Law
      </div>
    </body>
    </html>
    """
    return html_to_pdf_playwright(html)


# =========================================================================
# 2. EXECUTIVE VENDOR STATEMENT & SETTLEMENT VOUCHER
# =========================================================================
def generate_supplier_statement_pdf(sp: dict, payment_logs: list, company_info: dict) -> bytes:
    """Generates an executive Vendor Statement of Account & Payment Voucher PDF using Playwright."""
    company_name = company_info.get("company_name", "ADK Co., LTD.")
    ar_name = company_info.get("company_arabic_name", "شركة إيه دي كيه للخدمات الصناعية المحدودة")
    cr_num = company_info.get("cr_number", "2055001234")
    address = company_info.get("address", "2837, B13, Tebah District, Al Jubail, Kingdom of Saudi Arabia")
    
    total_amt = float(sp.get("amount", 0.0))
    paid_amt = float(sp.get("paid_amount", 0.0))
    rem_amt = float(sp.get("remaining_amount", max(0.0, total_amt - paid_amt)))
    
    inv_date_str = format_long_date(sp.get("invoice_date"))
    due_date_str = format_long_date(sp.get("due_date"))
    supply_period_str = format_date_range(
        sp.get("supply_start_date") or sp.get("supply_date"),
        sp.get("supply_end_date") or sp.get("supply_date")
    )
    gen_time = format_long_datetime()
    
    settled_pct = round((paid_amt / total_amt * 100), 1) if total_amt > 0 else 100.0
    st_text = str(sp.get("status", "Pending"))
    badge_class = "badge-paid" if st_text == "Paid" else ("badge-partial" if st_text in ("Partially Paid", "Partial") else "badge-pending")
    
    logs_rows_html = ""
    if not payment_logs:
        logs_rows_html = '<tr><td colspan="5" class="text-center" style="padding: 10px;">No payment disbursals recorded yet. Full balance remains open.</td></tr>'
    else:
        for lg in payment_logs:
            amt_lg = float(lg.get("payment_amount", 0.0))
            pay_d_str = format_long_date(lg.get("payment_date"))
            logs_rows_html += f"""
            <tr>
              <td>{pay_d_str}</td>
              <td>{lg.get("payment_method", "Bank Transfer")}</td>
              <td><code>{lg.get("reference_number", "N/A")}</code></td>
              <td>{lg.get("notes", "N/A")}</td>
              <td class="num font-green bold">SAR {amt_lg:,.2f}</td>
            </tr>
            """
            
    html = f"""<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Vendor Statement of Account</title>
      <style>
        @page {{ size: letter; margin: 0; }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }}
        body {{ background-color: #FFFFFF; color: #0F172A; padding: 16px 20px; font-size: 8pt; line-height: 1.35; }}
        .header-banner {{
          background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
          color: #FFFFFF; padding: 12px 16px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #B45309;
        }}
        .header-left .comp-title {{ font-size: 13pt; font-weight: 800; }}
        .header-left .comp-ar {{ font-size: 8.5pt; color: #94A3B8; margin-top: 1px; }}
        .header-left .comp-meta {{ font-size: 7pt; color: #64748B; margin-top: 2px; }}
        .header-right {{ text-align: right; }}
        .header-right .doc-badge {{ font-size: 12pt; font-weight: 800; color: #FEF3C7; }}
        .header-right .doc-ar {{ font-size: 8pt; color: #FDE68A; }}
        .header-right .doc-meta {{ font-size: 7pt; color: #94A3B8; margin-top: 2px; }}
        
        .kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }}
        .kpi-card {{ padding: 8px 10px; border-radius: 6px; border: 1px solid #CBD5E1; text-align: center; }}
        .kpi-card.blue {{ background: #EFF6FF; border-color: #BFDBFE; }}
        .kpi-card.green {{ background: #ECFDF5; border-color: #A7F3D0; }}
        .kpi-card.red {{ background: #FEF2F2; border-color: #FECACA; }}
        .kpi-card.gold {{ background: #FEF3C7; border-color: #FDE68A; }}
        .kpi-label {{ font-size: 6.5pt; font-weight: 700; color: #64748B; text-transform: uppercase; }}
        .kpi-val {{ font-size: 11.5pt; font-weight: 800; color: #0F172A; margin: 2px 0; }}
        .kpi-sub {{ font-size: 6.5pt; font-weight: 700; }}
        
        .meta-card {{
          background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 7.5pt;
        }}
        .meta-item strong {{ color: #0F172A; }}
        
        .section-title {{ font-size: 9pt; font-weight: 800; color: #0F172A; margin-bottom: 5px; }}
        .data-table {{ width: 100%; border-collapse: collapse; font-size: 7.2pt; border: 1px solid #CBD5E1; margin-bottom: 12px; }}
        .data-table th {{ background: #0F172A; color: #FFFFFF; font-weight: 700; padding: 5px 8px; text-align: left; }}
        .data-table td {{ padding: 4px 8px; border-bottom: 1px solid #E2E8F0; }}
        .data-table tbody tr:nth-child(even) {{ background-color: #F8FAFC; }}
        
        .badge {{ display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 6.5pt; font-weight: 700; }}
        .badge-paid {{ background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; }}
        .badge-partial {{ background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; }}
        .badge-pending {{ background: #FEE2E2; color: #B91C1C; border: 1px solid #FECACA; }}
        
        .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .font-green {{ color: #065F46; }}
        .font-red {{ color: #991B1B; }}
        .bold {{ font-weight: 700; }}
        .text-center {{ text-align: center; }}
        
        .sig-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }}
        .sig-card {{ background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; text-align: center; }}
        .sig-title {{ font-size: 7.2pt; font-weight: 700; color: #0F172A; margin-bottom: 2px; }}
        .sig-dept {{ font-size: 6.8pt; color: #64748B; margin-bottom: 16px; }}
        .sig-line {{ border-top: 1px solid #94A3B8; padding-top: 3px; font-size: 6.5pt; color: #64748B; }}
        .footer-note {{ text-align: center; font-size: 6.5pt; color: #94A3B8; margin-top: 8px; }}
      </style>
    </head>
    <body>
      <div class="header-banner">
        <div class="header-left">
          <div class="comp-title">🏢 {company_name}</div>
          <div class="comp-ar">{ar_name}</div>
          <div class="comp-meta">Commercial Reg: {cr_num} • VAT: 300492819200003 • {address}</div>
        </div>
        <div class="header-right">
          <div class="doc-badge">VENDOR STATEMENT OF ACCOUNT</div>
          <div class="doc-ar">كشف حساب المورد وسند الصرف الرسمي</div>
          <div class="doc-meta">Generated: {gen_time}</div>
        </div>
      </div>
      
      <div class="kpi-grid">
        <div class="kpi-card blue">
          <div class="kpi-label">TOTAL BILLED INVOICE</div>
          <div class="kpi-val">SAR {total_amt:,.2f}</div>
          <div class="kpi-sub" style="color: #1E40AF;">Verified Liability</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">TOTAL DISBURSED (PAID)</div>
          <div class="kpi-val" style="color: #065F46;">SAR {paid_amt:,.2f}</div>
          <div class="kpi-sub" style="color: #065F46;">● {settled_pct}% Settled</div>
        </div>
        <div class="kpi-card {'red' if rem_amt > 0 else 'green'}">
          <div class="kpi-label">NET BALANCE OUTSTANDING</div>
          <div class="kpi-val" style="color: {'#991B1B' if rem_amt > 0 else '#065F46'};">SAR {rem_amt:,.2f}</div>
          <div class="kpi-sub" style="color: {'#991B1B' if rem_amt > 0 else '#065F46'};">{'● Net Due Now' if rem_amt > 0 else '● Fully Disbursed'}</div>
        </div>
        <div class="kpi-card gold">
          <div class="kpi-label">INVOICE STATUS</div>
          <div style="margin: 4px 0;"><span class="badge {badge_class}">{st_text.upper()}</span></div>
          <div class="kpi-sub" style="color: #475569;">Official Record</div>
        </div>
      </div>
      
      <div class="meta-card">
        <div class="meta-item"><strong>Vendor Company:</strong> {sp.get("company_name", "")}</div>
        <div class="meta-item"><strong>Invoice Number:</strong> {sp.get("invoice_number", "N/A")}</div>
        <div class="meta-item"><strong>Invoice Issue Date:</strong> {inv_date_str}</div>
        <div class="meta-item"><strong>Payment Due Date:</strong> {due_date_str}</div>
        <div class="meta-item"><strong>Supply Period:</strong> {supply_period_str}</div>
        <div class="meta-item"><strong>ERP Record Ref:</strong> #INV-{sp.get('id', '')}</div>
        <div class="meta-item"><strong>Service / Scope:</strong> {sp.get("invoice_details", "N/A")}</div>
        <div class="meta-item"><strong>Financial Remarks:</strong> {sp.get("remarks", "N/A")}</div>
      </div>
      
      <div class="section-title">DISBURSAL TRANSACTIONS & SETTLEMENT LOGS</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>SETTLEMENT DATE</th>
            <th>PAYMENT METHOD</th>
            <th>TRANSACTION REF #</th>
            <th>SETTLEMENT DETAILS / NOTES</th>
            <th class="num">AMOUNT DISBURSED</th>
          </tr>
        </thead>
        <tbody>
          {logs_rows_html}
        </tbody>
      </table>
      
      <div class="sig-grid">
        <div class="sig-card">
          <div class="sig-title">ACCOUNTS PAYABLE CONTROLLER</div>
          <div class="sig-dept">Finance & Treasury Department</div>
          <div class="sig-line">Authorized Signature & Company Stamp</div>
        </div>
        <div class="sig-card">
          <div class="sig-title">VENDOR AUTHORIZED REPRESENTATIVE</div>
          <div class="sig-dept">Vendor Commercial Receiver</div>
          <div class="sig-line">Signature & Official Stamp</div>
        </div>
      </div>
      
      <div class="footer-note">
        Page 1 of 1 | Strictly Confidential • Official Accounts Payable Statement under Saudi Commercial Law
      </div>
    </body>
    </html>
    """
    return html_to_pdf_playwright(html)


# =========================================================================
# 3. EXECUTIVE MODERN INDUSTRIAL WORKER PAYSLIP VOUCHER
# =========================================================================
def generate_payslip_pdf(employee_data: dict, payroll_detail: dict, company_info: dict) -> bytes:
    """
    Generates an executive, highly readable, visually modern ADK Industrial Worker
    Payslip Voucher PDF. Clear typography, soft harmonious palettes, structured card
    sections, and full itemized rate, hour, deduction, and actual pay breakdowns.
    """
    company_name = company_info.get("company_name", "ADK Co., LTD.")
    ar_name = company_info.get("company_arabic_name", "شركة إيه دي كيه للخدمات الصناعية المحدودة")
    cr_num = company_info.get("cr_number", "2055001234")
    address = company_info.get("address", "2837, B13, Tebah District, Al Jubail, Kingdom of Saudi Arabia")
    
    pay_period_str = format_pay_period(payroll_detail.get('month', ''), payroll_detail.get('year', ''))
    cutoff_str = payroll_detail.get("cutoff_period") or f"{pay_period_str}"
    
    _first = employee_data.get('first_name', '').strip()
    _mid = (employee_data.get('middle_name') or '').strip()
    _last = employee_data.get('last_name', '').strip()
    emp_name = f"{_first} {_mid} {_last}".replace("  ", " ").strip() if _mid else f"{_first} {_last}".strip()
    designation = str(employee_data.get("designation") or "Technician / Operator")
    emp_code = employee_data.get("emp_code", "EMP-001")
    iqama_num = employee_data.get("national_id_iqama", "-")
    dept_name = employee_data.get("department_name", "Operations")
    is_saudi = employee_data.get("is_saudi") == 1
    nat_badge = "Saudi National" if is_saudi else "Expatriate"
    
    worker_type = payroll_detail.get("worker_type") or employee_data.get("worker_type") or "Direct"
    wt_badge = "🔨 Direct (Monthly/30)" if worker_type == "Direct" else "🏢 Indirect (Regular Hourly)"

    # Days & Rates calculation
    days_worked = float(payroll_detail.get("days_worked") or 30.0)
    basic = float(payroll_detail.get("basic_salary") or 0.0)
    
    if worker_type == "Direct":
        daily_rate = float(payroll_detail.get("daily_rate") or (basic / 30.0 if basic > 0 else 83.33333333))
        hourly_rate = float(payroll_detail.get("hourly_rate") or (daily_rate / 8.0 if daily_rate > 0 else 10.42))
        ot_rate = float(payroll_detail.get("ot_rate") or round(hourly_rate * 1.5, 2))
    else:
        daily_rate = float(payroll_detail.get("daily_rate") or 0.0)
        hourly_rate = float(payroll_detail.get("hourly_rate") or (basic / 240.0 if basic > 0 else 25.0))
        ot_rate = 0.0
    
    # Hours & Base Earnings
    working_hours = float(payroll_detail.get("working_hours") if payroll_detail.get("working_hours") is not None else (days_worked * 8.0 if days_worked > 0 else 64.0))
    regular_pay = float(payroll_detail.get("regular_pay") if payroll_detail.get("regular_pay") is not None else round(working_hours * hourly_rate, 2))
    
    ot_hours = float(payroll_detail.get("ot_hours") or 0.0)
    ot_pay = float(payroll_detail.get("ot_pay") or round(ot_hours * ot_rate, 2))
    
    subtotal_hours = working_hours + ot_hours
    subtotal_pay = float(payroll_detail.get("subtotal_pay") or round(regular_pay + ot_pay, 2))
    
    # Rest Day, Holiday, Meal Allowance, Adjustments
    rest_day_hours = float(payroll_detail.get("rest_day_hours") or 0.0)
    rest_day_rate = float(payroll_detail.get("rest_day_rate") or hourly_rate)
    rest_day_pay = float(payroll_detail.get("rest_day_pay") or round(rest_day_hours * rest_day_rate, 2))
    
    holiday_hours = float(payroll_detail.get("holiday_hours") or 0.0)
    holiday_rate = float(payroll_detail.get("holiday_rate") or hourly_rate)
    holiday_pay = float(payroll_detail.get("holiday_pay") or round(holiday_hours * holiday_rate, 2))
    
    meal_allowance_qty = float(payroll_detail.get("meal_allowance_qty") or 0.0)
    meal_allowance_rate = float(payroll_detail.get("meal_allowance_rate") or (10.0 if meal_allowance_qty > 0 else 0.0))
    meal_allowance_pay = float(payroll_detail.get("meal_allowance_pay") or float(payroll_detail.get("housing_allowance") or 0.0) or round(meal_allowance_qty * meal_allowance_rate, 2))
    
    adjustment_add = float(payroll_detail.get("adjustment_add") or float(payroll_detail.get("other_allowances") or 0.0))
    total_pay = float(payroll_detail.get("total_pay") or float(payroll_detail.get("gross_salary") or 0.0) or round(subtotal_pay + rest_day_pay + holiday_pay + meal_allowance_pay + adjustment_add, 2))
    
    # Deductions
    wps_deduction = float(payroll_detail.get("wps_deduction") or 0.0)
    water_bill = float(payroll_detail.get("water_bill") or 0.0)
    gosi_emp = float(payroll_detail.get("gosi_employee") or 0.0)
    other_ded = float(payroll_detail.get("other_deductions") or 0.0)
    
    total_deductions = float(payroll_detail.get("total_deductions") or round(wps_deduction + water_bill + gosi_emp + other_ded, 2))
    net_pay = float(payroll_detail.get("net_salary") or float(payroll_detail.get("net_pay") or 0.0) or round(total_pay - total_deductions, 2))
    
    # Cash Advance & Actual Pay
    cash_advance = float(payroll_detail.get("cash_advance") or 0.0)
    adjustment_sub = float(payroll_detail.get("adjustment_sub") or 0.0)
    actual_pay = float(payroll_detail.get("actual_pay") or round(net_pay - cash_advance - adjustment_sub, 2))
    
    gen_time = format_long_datetime()
    
    def fmt_num(val, show_zero_as_dash=True, decimals=2):
        if val is None:
            return "-"
        try:
            v = float(val)
            if v == 0.0 and show_zero_as_dash:
                return "-"
            if decimals == 8:
                return f"{v:.8f}".rstrip('0').rstrip('.') if '.' in f"{v:.8f}" else f"{v:.2f}"
            return f"{v:,.2f}"
        except Exception:
            return str(val)

    html = f"""<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Official Salary Voucher - {emp_name}</title>
      <style>
        @page {{
          size: A4 portrait;
          margin: 12mm 14mm;
        }}
        * {{
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }}
        body {{
          background-color: #FFFFFF;
          color: #1E293B;
          font-size: 8.5pt;
          line-height: 1.4;
        }}

        /* Corporate Top Header */
        .doc-header {{
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 2px solid #E2E8F0;
          margin-bottom: 14px;
        }}
        .logo-title {{
          font-size: 15pt;
          font-weight: 800;
          color: #0A1128;
          letter-spacing: -0.3px;
        }}
        .logo-ar {{
          font-size: 9pt;
          color: #64748B;
          font-weight: 600;
          margin-top: 1px;
        }}
        .logo-meta {{
          font-size: 7pt;
          color: #94A3B8;
          margin-top: 2px;
        }}
        .badge-doc {{
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          padding: 6px 14px;
          border-radius: 8px;
          text-align: right;
        }}
        .badge-doc-title {{
          font-size: 11pt;
          font-weight: 800;
          color: #0047AB;
        }}
        .badge-doc-sub {{
          font-size: 7.5pt;
          color: #64748B;
          margin-top: 2px;
        }}

        /* Employee Identity Profile Card */
        .emp-profile-card {{
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 14px;
          display: grid;
          grid-template-columns: 2fr 1.2fr;
          gap: 16px;
        }}
        .emp-main-name {{
          font-size: 13pt;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 2px;
        }}
        .emp-main-role {{
          font-size: 8.5pt;
          color: #0047AB;
          font-weight: 700;
          margin-bottom: 6px;
        }}
        .emp-tags {{
          display: flex;
          gap: 6px;
        }}
        .pill-badge {{
          font-size: 7pt;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 20px;
          background: #E2E8F0;
          color: #475569;
        }}
        .pill-badge.saudi {{ background: #DCFCE7; color: #166534; }}
        .pill-badge.expat {{ background: #EFF6FF; color: #1E40AF; }}

        .emp-meta-grid {{
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 14px;
          font-size: 7.5pt;
        }}
        .meta-lbl {{ color: #64748B; font-weight: 600; }}
        .meta-val {{ color: #0F172A; font-weight: 700; text-align: right; }}

        /* Top 3 KPI Financial Highlights */
        .kpi-strip {{
          display: grid;
          grid-template-columns: 1fr 1fr 1.3fr;
          gap: 10px;
          margin-bottom: 14px;
        }}
        .kpi-box {{
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid #E2E8F0;
          background: #FFFFFF;
        }}
        .kpi-box.gross {{
          background: #F0FDF4;
          border-color: #BBF7D0;
        }}
        .kpi-box.ded {{
          background: #FEF2F2;
          border-color: #FECACA;
        }}
        .kpi-box.actual {{
          background: linear-gradient(135deg, #FFFBEB 0%, #FEF08A 100%);
          border-color: #FDE047;
          box-shadow: 0 2px 6px rgba(217, 119, 6, 0.08);
        }}
        .kpi-caption {{
          font-size: 7pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748B;
        }}
        .kpi-box.gross .kpi-caption {{ color: #166534; }}
        .kpi-box.ded .kpi-caption {{ color: #991B1B; }}
        .kpi-box.actual .kpi-caption {{ color: #854D0E; }}
        .kpi-amount {{
          font-size: 13.5pt;
          font-weight: 900;
          margin-top: 2px;
          color: #0F172A;
        }}
        .kpi-box.gross .kpi-amount {{ color: #15803D; }}
        .kpi-box.ded .kpi-amount {{ color: #DC2626; }}
        .kpi-box.actual .kpi-amount {{ color: #B45309; }}

        /* Dual Section Breakdown Grid */
        .section-grid {{
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 12px;
          margin-bottom: 14px;
        }}
        .section-panel {{
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          overflow: hidden;
          background: #FFFFFF;
        }}
        .panel-header {{
          background: #0A1128;
          color: #FFFFFF;
          padding: 7px 12px;
          font-size: 8pt;
          font-weight: 700;
          letter-spacing: 0.3px;
          display: flex;
          justify-content: space-between;
        }}
        .panel-header.ded-header {{
          background: #475569;
        }}
        
        .breakdown-table {{
          width: 100%;
          border-collapse: collapse;
          font-size: 7.8pt;
        }}
        .breakdown-table th {{
          background: #F8FAFC;
          color: #475569;
          font-weight: 700;
          padding: 6px 10px;
          border-bottom: 1px solid #E2E8F0;
          text-align: left;
        }}
        .breakdown-table td {{
          padding: 5.5px 10px;
          border-bottom: 1px solid #F1F5F9;
          vertical-align: middle;
        }}
        .breakdown-table tbody tr:nth-child(even) {{
          background: #FAFAFA;
        }}
        .breakdown-table tfoot td {{
          background: #F8FAFC;
          font-weight: 800;
          border-top: 1.5px solid #CBD5E1;
          color: #0F172A;
          padding: 7px 10px;
        }}

        .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .bold {{ font-weight: 700; }}
        .text-emerald {{ color: #16A34A; }}
        .text-rose {{ color: #E11D48; }}

        /* Payout Settlement Banner */
        .settlement-card {{
          background: #F8FAFC;
          border: 1.5px solid #CBD5E1;
          border-radius: 8px;
          padding: 10px 16px;
          margin-bottom: 14px;
        }}
        .settlement-flex {{
          display: flex;
          justify-content: space-between;
          align-items: center;
        }}
        .settlement-step {{
          text-align: center;
        }}
        .step-lbl {{ font-size: 7pt; color: #64748B; font-weight: 600; }}
        .step-val {{ font-size: 10pt; font-weight: 800; color: #0F172A; margin-top: 1px; }}
        .step-op {{ font-size: 12pt; font-weight: 800; color: #94A3B8; margin: 0 4px; }}
        .final-payout-box {{
          background: #0047AB;
          color: #FFFFFF;
          padding: 6px 16px;
          border-radius: 6px;
          text-align: right;
        }}
        .final-lbl {{ font-size: 7pt; color: #93C5FD; font-weight: 700; }}
        .final-val {{ font-size: 13pt; font-weight: 900; color: #FFFFFF; letter-spacing: -0.2px; }}

        /* Authorization Signatures */
        .signatures-grid {{
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 10px;
        }}
        .sig-block {{
          border: 1px solid #E2E8F0;
          background: #F8FAFC;
          border-radius: 8px;
          padding: 8px 14px;
          text-align: center;
        }}
        .sig-name {{ font-size: 7.5pt; font-weight: 700; color: #0F172A; }}
        .sig-sub {{ font-size: 6.8pt; color: #64748B; margin-bottom: 16px; }}
        .sig-line {{
          border-top: 1px dashed #94A3B8;
          padding-top: 3px;
          font-size: 6.5pt;
          color: #94A3B8;
        }}

        .footer-stamp {{
          text-align: center;
          font-size: 6.8pt;
          color: #94A3B8;
          margin-top: 12px;
          border-top: 1px solid #F1F5F9;
          padding-top: 6px;
        }}
      </style>
    </head>
    <body>
      
      <!-- Top Header -->
      <div class="doc-header">
        <div>
          <div class="logo-title">🏢 {company_name}</div>
          <div class="logo-ar">{ar_name}</div>
          <div class="logo-meta">Commercial Reg: {cr_num} • Al Jubail, Kingdom of Saudi Arabia</div>
        </div>
        <div class="badge-doc">
          <div class="badge-doc-title">SALARY PAYSLIP VOUCHER</div>
          <div class="badge-doc-sub">Wage Period: {pay_period_str}</div>
        </div>
      </div>

      <!-- Employee Information Card -->
      <div class="emp-profile-card">
        <div>
          <div class="emp-main-name">{emp_name}</div>
          <div class="emp-main-role">{designation}</div>
          <div class="emp-tags">
            <span class="pill-badge { 'saudi' if is_saudi else 'expat' }">{nat_badge}</span>
            <span class="pill-badge">{wt_badge}</span>
            <span class="pill-badge">Code: {emp_code}</span>
            <span class="pill-badge">Dept: {dept_name}</span>
          </div>
        </div>
        <div class="emp-meta-grid">
          <div class="meta-lbl">National ID / Iqama:</div>
          <div class="meta-val">{iqama_num}</div>
          <div class="meta-lbl">Cutoff Period:</div>
          <div class="meta-val">{cutoff_str}</div>
          <div class="meta-lbl">Monthly Base Rate:</div>
          <div class="meta-val"><strong>SAR {basic:,.2f} / mo</strong></div>
          <div class="meta-lbl">Daily & Hourly Rates:</div>
          <div class="meta-val">SAR {daily_rate:,.2f} / d (÷30) • SAR {hourly_rate:,.2f} / h</div>
        </div>
      </div>

      <!-- Top KPI Summary Cards -->
      <div class="kpi-strip">
        <div class="kpi-box gross">
          <div class="kpi-caption">Total Gross Earnings</div>
          <div class="kpi-amount">SAR {total_pay:,.2f}</div>
        </div>
        <div class="kpi-box ded">
          <div class="kpi-caption">Total Deductions</div>
          <div class="kpi-amount">SAR {total_deductions:,.2f}</div>
        </div>
        <div class="kpi-box actual">
          <div class="kpi-caption">Actual Payout Disbursed</div>
          <div class="kpi-amount">SAR {actual_pay:,.2f}</div>
        </div>
      </div>

      <!-- Itemized Earnings & Deductions Tables -->
      <div class="section-grid">
        
        <!-- Earnings Breakdown -->
        <div class="section-panel">
          <div class="panel-header">
            <span>EARNINGS & ALLOWANCES BREAKDOWN</span>
            <span>SAR</span>
          </div>
          <table class="breakdown-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="num">Rate</th>
                <th class="num">Hours / Qty</th>
                <th class="num">Total (SAR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="bold">Regular Working Hours</td>
                <td class="num">{fmt_num(hourly_rate, show_zero_as_dash=False)}</td>
                <td class="num">{fmt_num(working_hours, show_zero_as_dash=False)}</td>
                <td class="num bold text-emerald">{fmt_num(regular_pay, show_zero_as_dash=False)}</td>
              </tr>
              <tr>
                <td class="bold">Overtime (O.T)</td>
                <td class="num">{fmt_num(ot_rate, show_zero_as_dash=False)}</td>
                <td class="num">{fmt_num(ot_hours)}</td>
                <td class="num bold">{fmt_num(ot_pay)}</td>
              </tr>
              <tr style="background: #F8FAFC;">
                <td colspan="3" class="bold" style="color: #475569;">SUBTOTAL BASE PAY</td>
                <td class="num bold">{fmt_num(subtotal_pay, show_zero_as_dash=False)}</td>
              </tr>
              <tr>
                <td class="bold">Friday / Rest Day Pay</td>
                <td class="num">{fmt_num(rest_day_rate, show_zero_as_dash=False)}</td>
                <td class="num">{fmt_num(rest_day_hours)}</td>
                <td class="num bold">{fmt_num(rest_day_pay)}</td>
              </tr>
              <tr>
                <td class="bold">Public Holiday Pay</td>
                <td class="num">{fmt_num(holiday_rate, show_zero_as_dash=False)}</td>
                <td class="num">{fmt_num(holiday_hours)}</td>
                <td class="num bold">{fmt_num(holiday_pay)}</td>
              </tr>
              <tr>
                <td class="bold">Meal Allowance</td>
                <td class="num">{fmt_num(meal_allowance_rate, show_zero_as_dash=False)}</td>
                <td class="num">{fmt_num(meal_allowance_qty)}</td>
                <td class="num bold">{fmt_num(meal_allowance_pay)}</td>
              </tr>
              <tr>
                <td class="bold">Project / Site Location & Additions</td>
                <td class="num">-</td>
                <td class="num">-</td>
                <td class="num bold">{fmt_num(adjustment_add)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">TOTAL GROSS PAYABLE:</td>
                <td class="num text-emerald">SAR {total_pay:,.2f}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Deductions Breakdown -->
        <div class="section-panel">
          <div class="panel-header ded-header">
            <span>DEDUCTIONS & WITHHOLDINGS</span>
            <span>SAR</span>
          </div>
          <table class="breakdown-table">
            <thead>
              <tr>
                <th>Deduction Item</th>
                <th class="num">Amount (SAR)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="bold">Water Bill / Utilities Charge</td>
                <td class="num text-rose bold">{fmt_num(water_bill)}</td>
              </tr>
              <tr>
                <td class="bold">WPS Banking Transaction Fee</td>
                <td class="num text-rose bold">{fmt_num(wps_deduction)}</td>
              </tr>
              <tr>
                <td class="bold">GOSI Statutory Contribution</td>
                <td class="num text-rose bold">{fmt_num(gosi_emp)}</td>
              </tr>
              <tr>
                <td class="bold">Other Deductions / Penalties</td>
                <td class="num text-rose bold">{fmt_num(other_ded)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL DEDUCTIONS:</td>
                <td class="num text-rose">SAR {total_deductions:,.2f}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Cash Advance Note in Deductions Panel -->
          <div style="padding: 10px 12px; background: #FFFBEB; border-top: 1px solid #FEF08A; font-size: 7.5pt;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span class="bold" style="color: #92400E;">Cash Advance Repayment:</span>
              <span class="bold" style="color: #92400E;">SAR {cash_advance:,.2f}</span>
            </div>
            <div style="font-size: 6.8pt; color: #B45309;">Deducted directly from Net Salary during disbursal.</div>
          </div>
        </div>

      </div>

      <!-- Settlement Payout Summary Banner -->
      <div class="settlement-card">
        <div class="settlement-flex">
          <div class="settlement-step">
            <div class="step-lbl">GROSS EARNINGS</div>
            <div class="step-val text-emerald">SAR {total_pay:,.2f}</div>
          </div>
          <div class="step-op">-</div>
          <div class="settlement-step">
            <div class="step-lbl">DEDUCTIONS</div>
            <div class="step-val text-rose">SAR {total_deductions:,.2f}</div>
          </div>
          <div class="step-op">=</div>
          <div class="settlement-step">
            <div class="step-lbl">NET SALARY</div>
            <div class="step-val" style="color: #0047AB;">SAR {net_pay:,.2f}</div>
          </div>
          <div class="step-op">-</div>
          <div class="settlement-step">
            <div class="step-lbl">CASH ADVANCE</div>
            <div class="step-val" style="color: #D97706;">SAR {cash_advance:,.2f}</div>
          </div>
          <div class="step-op">=</div>
          <div class="final-payout-box">
            <div class="final-lbl">ACTUAL NET DISBURSAL</div>
            <div class="final-val">SAR {actual_pay:,.2f}</div>
          </div>
        </div>
      </div>

      <!-- Signatures & Authorization -->
      <div class="signatures-grid">
        <div class="sig-block">
          <div class="sig-name">EMPLOYEE ACKNOWLEDGEMENT</div>
          <div class="sig-sub">I confirm receipt of full settlement and salary voucher.</div>
          <div class="sig-line">Employee Signature & Date</div>
        </div>
        <div class="sig-block">
          <div class="sig-name">AUTHORIZED BY: PAYROLL & HR CONTROLLER</div>
          <div class="sig-sub">ADK Finance & Human Resources Operations</div>
          <div class="sig-line">Controller Signature & Corporate Stamp</div>
        </div>
      </div>

      <!-- Footer Compliance Note -->
      <div class="footer-stamp">
        Certified Official Payslip Voucher • ADK Co., LTD. • Compliant with Saudi Labor Law & SAMA Wage Protection System • Generated on {gen_time}
      </div>

    </body>
    </html>
    """
    return html_to_pdf_playwright(html)


# =========================================================================
# 4. EXECUTIVE MONTHLY PAYROLL & WORKER SALARY SCHEDULE PDF
# =========================================================================
def generate_monthly_payroll_schedule_pdf(
    month: int,
    year: int,
    workers: List[Dict[str, Any]],
    company_info: Dict[str, Any]
) -> bytes:
    """
    Generates an executive-grade Monthly Payroll & Worker Salary Schedule PDF
    using Playwright with ADK Co., LTD. corporate branding, summary KPI cards,
    individual worker salary breakdowns, GOSI contributions, net payouts, and authorization blocks.
    """
    company_name = company_info.get("company_name", "ADK Co., LTD.")
    ar_name = company_info.get("company_arabic_name", "شركة إيه دي كيه للخدمات الصناعية المحدودة")
    cr_num = company_info.get("cr_number", "2055001234")
    address = company_info.get("address", "2837, B13, Tebah District, Al Jubail, Kingdom of Saudi Arabia")
    
    pay_period_str = format_pay_period(month, year)
    gen_time = format_long_datetime()
    
    tot_basic = sum(float(w.get("basic_salary", 0)) for w in workers)
    tot_housing = sum(float(w.get("housing_allowance", 0)) for w in workers)
    tot_transport = sum(float(w.get("transport_allowance", 0)) for w in workers)
    tot_other_allow = sum(float(w.get("other_allowances", 0)) for w in workers)
    tot_gross = sum(float(w.get("gross_salary", 0)) for w in workers)
    tot_gosi = sum(float(w.get("gosi_employee", 0)) for w in workers)
    tot_other_ded = sum(float(w.get("other_deductions", 0)) for w in workers)
    tot_net = sum(float(w.get("net_salary", 0)) for w in workers)
    
    worker_rows_html = ""
    if not workers:
        worker_rows_html = '<tr><td colspan="10" class="text-center" style="padding: 14px;">No workers registered on payroll for this month.</td></tr>'
    else:
        for idx, w in enumerate(workers, 1):
            emp_code = w.get("emp_code", f"EMP-{w.get('id', idx)}")
            _w_first = w.get('first_name', '').strip()
            _w_mid = (w.get('middle_name') or '').strip()
            _w_last = w.get('last_name', '').strip()
            emp_name = f"{_w_first} {_w_mid} {_w_last}".replace("  ", " ").strip() if _w_mid else f"{_w_first} {_w_last}".strip()
            is_saudi = w.get("is_saudi") == 1
            nat_badge = '<span class="badge badge-saudi">SAUDI</span>' if is_saudi else '<span class="badge badge-expat">EXPAT</span>'
            dept_name = w.get("department_name", "Operations")
            
            b = float(w.get("basic_salary", 0))
            h = float(w.get("housing_allowance", 0))
            t_o = float(w.get("transport_allowance", 0)) + float(w.get("other_allowances", 0))
            gr = float(w.get("gross_salary", b + h + t_o))
            gosi = float(w.get("gosi_employee", 0))
            o_ded = float(w.get("other_deductions", 0))
            net = float(w.get("net_salary", gr - gosi - o_ded))
            
            worker_rows_html += f"""
            <tr>
              <td><strong>{emp_code}</strong></td>
              <td><strong>{emp_name}</strong> {nat_badge}</td>
              <td>{dept_name}</td>
              <td class="num">{b:,.2f}</td>
              <td class="num">{h:,.2f}</td>
              <td class="num">{t_o:,.2f}</td>
              <td class="num font-blue bold">{gr:,.2f}</td>
              <td class="num font-red">{gosi:,.2f}</td>
              <td class="num">{o_ded:,.2f}</td>
              <td class="num font-green bold">SAR {net:,.2f}</td>
            </tr>
            """
            
    html = f"""<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Monthly Payroll Schedule - {pay_period_str}</title>
      <style>
        @page {{ size: letter landscape; margin: 0; }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }}
        body {{ background-color: #FFFFFF; color: #0F172A; padding: 14px 18px; font-size: 7.5pt; line-height: 1.3; }}
        .header-banner {{
          background: linear-gradient(135deg, #0A1128 0%, #0047AB 100%);
          color: #FFFFFF; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #D97706;
        }}
        .header-left .comp-title {{ font-size: 12pt; font-weight: 800; }}
        .header-left .comp-ar {{ font-size: 8pt; color: #BFDBFE; margin-top: 1px; }}
        .header-left .comp-meta {{ font-size: 6.8pt; color: #94A3B8; margin-top: 2px; }}
        .header-right {{ text-align: right; }}
        .header-right .doc-badge {{ font-size: 11pt; font-weight: 800; color: #FEF3C7; }}
        .header-right .doc-ar {{ font-size: 7.5pt; color: #FDE68A; }}
        .header-right .doc-meta {{ font-size: 6.8pt; color: #BFDBFE; margin-top: 2px; }}
        
        .kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }}
        .kpi-card {{ padding: 6px 10px; border-radius: 5px; border: 1px solid #CBD5E1; text-align: center; }}
        .kpi-card.blue {{ background: #EFF6FF; border-color: #BFDBFE; }}
        .kpi-card.green {{ background: #ECFDF5; border-color: #A7F3D0; }}
        .kpi-card.red {{ background: #FEF2F2; border-color: #FECACA; }}
        .kpi-card.gold {{ background: #FEF3C7; border-color: #FDE68A; }}
        .kpi-label {{ font-size: 6pt; font-weight: 700; color: #64748B; text-transform: uppercase; }}
        .kpi-val {{ font-size: 11pt; font-weight: 800; color: #0F172A; margin: 1px 0; }}
        .kpi-sub {{ font-size: 6pt; font-weight: 700; }}
        
        .data-table {{ width: 100%; border-collapse: collapse; font-size: 7pt; border: 1px solid #CBD5E1; margin-bottom: 8px; }}
        .data-table th {{ background: #0A1128; color: #FFFFFF; font-weight: 700; padding: 4px 6px; text-align: left; font-size: 6.5pt; }}
        .data-table td {{ padding: 3px 6px; border-bottom: 1px solid #E2E8F0; }}
        .data-table tbody tr:nth-child(even) {{ background-color: #F8FAFC; }}
        .data-table tfoot td {{ background-color: #E2E8F0; font-weight: 700; color: #0F172A; border-top: 1.5px solid #64748B; }}
        
        .badge {{ display: inline-block; padding: 1px 4px; border-radius: 2px; font-size: 5.5pt; font-weight: 700; }}
        .badge-saudi {{ background: #DCFCE7; color: #15803D; border: 1px solid #86EFAC; }}
        .badge-expat {{ background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; }}
        
        .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
        .font-blue {{ color: #0047AB; }}
        .font-green {{ color: #065F46; }}
        .font-red {{ color: #991B1B; }}
        .bold {{ font-weight: 700; }}
        .text-center {{ text-align: center; }}
        
        .sig-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; }}
        .sig-card {{ background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 5px; padding: 6px 10px; text-align: center; }}
        .sig-title {{ font-size: 6.8pt; font-weight: 700; color: #0F172A; margin-bottom: 1px; }}
        .sig-dept {{ font-size: 6.2pt; color: #64748B; margin-bottom: 12px; }}
        .sig-line {{ border-top: 1px solid #94A3B8; padding-top: 2px; font-size: 6pt; color: #64748B; }}
        .footer-note {{ text-align: center; font-size: 6pt; color: #94A3B8; margin-top: 4px; }}
      </style>
    </head>
    <body>
      <div class="header-banner">
        <div class="header-left">
          <div class="comp-title">🏢 {company_name}</div>
          <div class="comp-ar">{ar_name}</div>
          <div class="comp-meta">Commercial Reg: {cr_num} • Al Jubail, Saudi Arabia • www.adknprotech.com</div>
        </div>
        <div class="header-right">
          <div class="doc-badge">MONTHLY PAYROLL ROSTER | {pay_period_str.upper()}</div>
          <div class="doc-ar">جدول مسير الرواتب الشهري المعتمد</div>
          <div class="doc-meta">Generated: {gen_time} • Confidential</div>
        </div>
      </div>
      
      <div class="kpi-grid">
        <div class="kpi-card blue">
          <div class="kpi-label">TOTAL WORKERS ON PAYROLL</div>
          <div class="kpi-val">{len(workers)} Active Staff</div>
          <div class="kpi-sub" style="color: #0047AB;">● SAMA WPS Standard</div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-label">TOTAL GROSS PAYABLE</div>
          <div class="kpi-val" style="color: #0047AB;">SAR {tot_gross:,.2f}</div>
          <div class="kpi-sub" style="color: #0047AB;">Basic + All Allowances</div>
        </div>
        <div class="kpi-card red">
          <div class="kpi-label">STATUTORY GOSI DEDUCTIONS</div>
          <div class="kpi-val" style="color: #991B1B;">SAR {tot_gosi:,.2f}</div>
          <div class="kpi-sub" style="color: #991B1B;">Social Insurance Share</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">NET SALARY OUTFLOW</div>
          <div class="kpi-val" style="color: #065F46;">SAR {tot_net:,.2f}</div>
          <div class="kpi-sub" style="color: #065F46;">● Disbursable Net Pay</div>
        </div>
      </div>
      
      <table class="data-table">
        <thead>
          <tr>
            <th>EMP CODE</th>
            <th>WORKER / EMPLOYEE NAME</th>
            <th>DEPARTMENT</th>
            <th class="num">BASIC (SAR)</th>
            <th class="num">HOUSING (SAR)</th>
            <th class="num">OTHER ALLOW.</th>
            <th class="num">GROSS (SAR)</th>
            <th class="num">GOSI (SAR)</th>
            <th class="num">OTHER DED.</th>
            <th class="num">NET SALARY (SAR)</th>
          </tr>
        </thead>
        <tbody>
          {worker_rows_html}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"><strong>CONSOLIDATED ROSTER TOTALS ({len(workers)} WORKERS):</strong></td>
            <td class="num"><strong>SAR {tot_basic:,.2f}</strong></td>
            <td class="num"><strong>SAR {tot_housing:,.2f}</strong></td>
            <td class="num"><strong>SAR {tot_transport + tot_other_allow:,.2f}</strong></td>
            <td class="num font-blue bold"><strong>SAR {tot_gross:,.2f}</strong></td>
            <td class="num font-red bold"><strong>SAR {tot_gosi:,.2f}</strong></td>
            <td class="num"><strong>SAR {tot_other_ded:,.2f}</strong></td>
            <td class="num font-green bold"><strong>SAR {tot_net:,.2f}</strong></td>
          </tr>
        </tfoot>
      </table>
      
      <div class="sig-grid">
        <div class="sig-card">
          <div class="sig-title">PREPARED BY: PAYROLL & HR OPERATIONS MANAGER</div>
          <div class="sig-dept">ADK Human Resources & Payroll Division</div>
          <div class="sig-line">Signature & Audit Verification</div>
        </div>
        <div class="sig-card">
          <div class="sig-title">APPROVED BY: CHIEF FINANCIAL OFFICER (CFO) / MANAGING DIRECTOR</div>
          <div class="sig-dept">ADK Executive Financial Leadership</div>
          <div class="sig-line">Authorized Signature & Corporate Stamp</div>
        </div>
      </div>
      
      <div class="footer-note">
        Page 1 of 1 | Strictly Confidential • ADK Co., LTD. Official Payroll Document under Saudi Labor Law & SAMA WPS
      </div>
    </body>
    </html>
    """
    return html_to_pdf_playwright(html, landscape=True)


class DocumentService:
    """
    Deep Module for Document & Executive Report Generation.
    Hides data extraction, entity joins, HTML template generation, and Playwright PDF rendering
    behind a unified interface at a single seam.
    """

    @staticmethod
    def render_document(doc_type: str, entity_id: int, db, **kwargs) -> Dict[str, Any]:
        """
        Renders a document or report binary by type and entity ID:
        - 'payslip': Employee monthly payslip PDF
        - 'supplier_statement': Vendor payment voucher & statement PDF
        - 'supplier_summary': Executive Accounts Payable Audit Report PDF
        - 'payroll_report': Monthly Payroll Run summary PDF
        """
        from core.config import get_company_settings
        comp_data = get_company_settings(db)

        if doc_type == "payslip":
            pd = db.query_one("""
                SELECT pd.*, pr.payroll_month, pr.payroll_year 
                FROM payroll_details pd
                JOIN payroll_runs pr ON pd.payroll_run_id = pr.id
                WHERE pd.id = ?
            """, (entity_id,))
            if not pd:
                raise ValueError("Payroll detail record not found.")

            emp = db.query_one("""
                SELECT e.*, d.name as department_name 
                FROM employees e 
                LEFT JOIN departments d ON e.department_id = d.id 
                WHERE e.id = ?
            """, (pd["employee_id"],))
            if not emp:
                raise ValueError("Employee record not found.")

            pay_data = {
                "month": pd["payroll_month"],
                "year": pd["payroll_year"],
                "cutoff_period": pd.get("cutoff_period"),
                "days_worked": pd.get("days_worked"),
                "daily_rate": pd.get("daily_rate"),
                "hourly_rate": pd.get("hourly_rate"),
                "ot_rate": pd.get("ot_rate"),
                "working_hours": pd.get("working_hours"),
                "regular_pay": pd.get("regular_pay"),
                "ot_hours": pd.get("ot_hours"),
                "ot_pay": pd.get("ot_pay"),
                "subtotal_pay": pd.get("subtotal_pay"),
                "rest_day_hours": pd.get("rest_day_hours"),
                "rest_day_rate": pd.get("rest_day_rate"),
                "rest_day_pay": pd.get("rest_day_pay"),
                "holiday_hours": pd.get("holiday_hours"),
                "holiday_rate": pd.get("holiday_rate"),
                "holiday_pay": pd.get("holiday_pay"),
                "meal_allowance_qty": pd.get("meal_allowance_qty"),
                "meal_allowance_rate": pd.get("meal_allowance_rate"),
                "meal_allowance_pay": pd.get("meal_allowance_pay") or pd.get("housing_allowance"),
                "adjustment_add": pd.get("adjustment_add") or pd.get("other_allowances"),
                "total_pay": pd.get("total_pay") or pd.get("gross_salary"),
                "wps_deduction": pd.get("wps_deduction"),
                "water_bill": pd.get("water_bill"),
                "gosi_employee": pd.get("gosi_employee"),
                "other_deductions": pd.get("other_deductions"),
                "total_deductions": pd.get("total_deductions"),
                "net_salary": pd.get("net_salary"),
                "cash_advance": pd.get("cash_advance"),
                "adjustment_sub": pd.get("adjustment_sub"),
                "actual_pay": pd.get("actual_pay")
            }

            pdf_bytes = generate_payslip_pdf(emp, pay_data, comp_data)
            fn = f"ADK_Payslip_{emp.get('emp_code', 'EMP')}_{pd.get('payroll_month', '01')}_{pd.get('payroll_year', '2026')}.pdf"
            return {"content": pdf_bytes, "filename": fn, "media_type": "application/pdf"}

        elif doc_type == "supplier_statement":
            sp = db.query_one("SELECT * FROM supplier_payments WHERE id = ?", (entity_id,))
            if not sp:
                raise ValueError("Supplier invoice record not found.")
            logs = db.query_all("SELECT * FROM supplier_payment_logs WHERE supplier_payment_id = ? ORDER BY id ASC", (entity_id,))
            pdf_bytes = generate_supplier_statement_pdf(sp, logs, comp_data)
            inv_ref = str(sp.get("company_name", "Vendor")).replace(" ", "_")
            fn = f"Supplier_Statement_{inv_ref}_{entity_id}.pdf"
            return {"content": pdf_bytes, "filename": fn, "media_type": "application/pdf"}

        elif doc_type == "supplier_summary":
            invoices = db.query_all("SELECT * FROM supplier_payments ORDER BY due_date ASC, id ASC")
            summary_stats = kwargs.get("summary_stats") or {}
            filter_info = kwargs.get("filter_info") or {}
            pdf_bytes = generate_supplier_summary_report_pdf(invoices, summary_stats, comp_data, filter_info)
            fn = f"AP_Audit_Report_{datetime.now().strftime('%Y%m%d')}.pdf"
            return {"content": pdf_bytes, "filename": fn, "media_type": "application/pdf"}

        elif doc_type == "client_summary":
            month = kwargs.get("month", 8)
            year = kwargs.get("year", 2026)
            summary_data = kwargs.get("summary_data") or {}
            pdf_bytes = generate_client_collection_summary_pdf(month, year, summary_data, comp_data)
            fn = f"Client_Monthly_Collections_{year}_{month:02d}.pdf"
            return {"content": pdf_bytes, "filename": fn, "media_type": "application/pdf"}

        elif doc_type == "client_statement":
            client_id = entity_id
            statement_data = kwargs.get("statement_data") or {}
            pdf_bytes = generate_client_statement_pdf(statement_data, comp_data)
            c_name = str(statement_data.get("client", {}).get("name", "Client")).replace(" ", "_")
            fn = f"Client_Statement_{c_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
            return {"content": pdf_bytes, "filename": fn, "media_type": "application/pdf"}

        else:
            raise ValueError(f"Unsupported document type '{doc_type}'.")


def generate_client_collection_summary_pdf(month: int, year: int, summary: Dict[str, Any], comp: Dict[str, Any]) -> bytes:
    """
    Generates an executive PDF report for the Monthly Summary Collection List (Accounts Receivable).
    """
    month_name = MONTH_NAMES[month] if (1 <= month <= 12) else f"Month {month}"
    invoices = summary.get("month_invoices", [])
    client_breakdown = summary.get("client_breakdown", [])
    tot_inv = summary.get("month_invoiced_total", 0.0)
    tot_col = summary.get("month_collected_total", 0.0)
    tot_rem = summary.get("month_remaining_total", 0.0)
    col_rate = summary.get("collection_rate", 0.0)
    
    rows_html = ""
    for idx, c in enumerate(client_breakdown, 1):
        c_inv = float(c.get("total_invoiced", 0) or 0)
        c_col = float(c.get("total_collected", 0) or 0)
        c_bal = float(c.get("total_balance", 0) or 0)
        c_rate = (c_col / c_inv * 100) if c_inv > 0 else 0.0
        
        rows_html += f"""
        <tr>
            <td style="text-align: center; font-weight: bold;">{idx}</td>
            <td style="font-weight: 700; color: #0047AB;">{c.get('client_name', 'Client')}</td>
            <td style="text-align: center;">{c.get('total_invoices', 0)}</td>
            <td style="text-align: right;">SAR {c_inv:,.2f}</td>
            <td style="text-align: right; color: #059669; font-weight: 700;">SAR {c_col:,.2f}</td>
            <td style="text-align: right; color: #DC2626; font-weight: 700;">SAR {c_bal:,.2f}</td>
            <td style="text-align: center; font-weight: 700;">{c_rate:.1f}%</td>
        </tr>
        """
        
    if not rows_html:
        rows_html = "<tr><td colspan='7' style='text-align: center; padding: 18px;'>No client billings or collections recorded for this period.</td></tr>"

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {{ size: A4 landscape; margin: 12mm 14mm; }}
    body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1E293B; margin: 0; padding: 0; }}
    .header-table {{ width: 100%; border-bottom: 2px solid #0047AB; padding-bottom: 8px; margin-bottom: 12px; }}
    .kpi-grid {{ width: 100%; margin-bottom: 14px; }}
    .kpi-box {{ background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; }}
    .kpi-label {{ font-size: 8px; color: #64748B; font-weight: bold; text-transform: uppercase; }}
    .kpi-val {{ font-size: 14px; font-weight: 800; margin-top: 2px; }}
    table.data-table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    table.data-table th {{ background: #0047AB; color: #FFFFFF; font-size: 9px; padding: 6px 8px; text-align: left; }}
    table.data-table td {{ border-bottom: 1px solid #E2E8F0; padding: 5px 8px; font-size: 9px; }}
    table.data-table tr:nth-child(even) {{ background: #F8FAFC; }}
    .footer-sign {{ margin-top: 25px; width: 100%; }}
</style>
</head>
<body>
    <table class="header-table">
        <tr>
            <td style="width: 60%;">
                <div style="font-size: 15px; font-weight: 900; color: #0047AB;">{comp.get('name', 'ADK Co., LTD.')}</div>
                <div style="font-size: 9px; color: #475569;">Commercial Registration: {comp.get('cr_number', '2055000000')} • VAT ID: {comp.get('vat_number', '300000000000003')}</div>
                <div style="font-size: 12px; font-weight: 800; color: #0F172A; margin-top: 6px;">📥 MONTHLY SUMMARY CLIENT COLLECTION REPORT — {month_name.upper()} {year}</div>
            </td>
            <td style="width: 40%; text-align: right;">
                <div style="font-size: 9px; color: #64748B;">Generated: {datetime.now().strftime('%d %B %Y, %H:%M')}</div>
                <div style="font-size: 9px; font-weight: bold; color: #059669;">Accounts Receivable & Revenue Audit</div>
            </td>
        </tr>
    </table>

    <table class="kpi-grid">
        <tr>
            <td style="width: 25%; padding-right: 6px;">
                <div class="kpi-box">
                    <div class="kpi-label">Total Monthly Billed (Inflows)</div>
                    <div class="kpi-val" style="color: #0047AB;">SAR {tot_inv:,.2f}</div>
                </div>
            </td>
            <td style="width: 25%; padding: 0 4px;">
                <div class="kpi-box">
                    <div class="kpi-label">Total Collections Received</div>
                    <div class="kpi-val" style="color: #059669;">SAR {tot_col:,.2f}</div>
                </div>
            </td>
            <td style="width: 25%; padding: 0 4px;">
                <div class="kpi-box">
                    <div class="kpi-label">Outstanding Receivables</div>
                    <div class="kpi-val" style="color: #DC2626;">SAR {tot_rem:,.2f}</div>
                </div>
            </td>
            <td style="width: 25%; padding-left: 6px;">
                <div class="kpi-box">
                    <div class="kpi-label">Collection Rate</div>
                    <div class="kpi-val" style="color: #4338CA;">{col_rate:.1f}%</div>
                </div>
            </td>
        </tr>
    </table>

    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 5%; text-align: center;">#</th>
                <th style="width: 30%;">Client / Company Name</th>
                <th style="width: 10%; text-align: center;">Invoices</th>
                <th style="width: 15%; text-align: right;">Total Billed (SAR)</th>
                <th style="width: 15%; text-align: right;">Collected (SAR)</th>
                <th style="width: 15%; text-align: right;">Balance Due (SAR)</th>
                <th style="width: 10%; text-align: center;">Collection %</th>
            </tr>
        </thead>
        <tbody>
            {rows_html}
        </tbody>
        <tfoot>
            <tr style="background: #F1F5F9; font-weight: 800;">
                <td colspan="3" style="text-align: right; padding: 6px 8px;">CONSOLIDATED TOTALS:</td>
                <td style="text-align: right; color: #0047AB;">SAR {tot_inv:,.2f}</td>
                <td style="text-align: right; color: #059669;">SAR {tot_col:,.2f}</td>
                <td style="text-align: right; color: #DC2626;">SAR {tot_rem:,.2f}</td>
                <td style="text-align: center;">{col_rate:.1f}%</td>
            </tr>
        </tfoot>
    </table>

    <table class="footer-sign">
        <tr>
            <td style="width: 33%; text-align: center;">
                <div style="border-top: 1px dashed #94A3B8; margin: 25px 20px 4px 20px;"></div>
                <div style="font-size: 8.5px; font-weight: bold;">Accounts Receivable Officer</div>
            </td>
            <td style="width: 33%; text-align: center;">
                <div style="border-top: 1px dashed #94A3B8; margin: 25px 20px 4px 20px;"></div>
                <div style="font-size: 8.5px; font-weight: bold;">Chief Financial Officer (CFO)</div>
            </td>
            <td style="width: 33%; text-align: center;">
                <div style="border-top: 1px dashed #94A3B8; margin: 25px 20px 4px 20px;"></div>
                <div style="font-size: 8.5px; font-weight: bold;">Managing Director Sign-off</div>
            </td>
        </tr>
    </table>
</body>
</html>"""
    return html_to_pdf_playwright(html, landscape=True)


def generate_client_statement_pdf(statement: Dict[str, Any], comp: Dict[str, Any]) -> bytes:
    """
    Generates an official Client Statement of Account PDF.
    """
    client = statement.get("client", {})
    invoices = statement.get("invoices", [])
    logs = statement.get("logs", [])
    tot_billed = statement.get("total_billed", 0.0)
    tot_paid = statement.get("total_paid", 0.0)
    balance_due = statement.get("balance_due", 0.0)

    inv_rows = ""
    for inv in invoices:
        inv_rows += f"""
        <tr>
            <td style="font-weight: bold;">{inv.get('invoice_number', 'N/A')}</td>
            <td>{inv.get('invoice_date', '')}</td>
            <td>{inv.get('due_date', '')}</td>
            <td>{inv.get('invoice_details', 'Engineering & Construction Services')}</td>
            <td style="text-align: right;">SAR {float(inv.get('total_amount', 0)):,.2f}</td>
            <td style="text-align: right; color: #059669;">SAR {float(inv.get('collected_amount', 0)):,.2f}</td>
            <td style="text-align: right; color: #DC2626; font-weight: bold;">SAR {float(inv.get('remaining_amount', 0)):,.2f}</td>
            <td style="text-align: center;"><span style="padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; background: {'#D1FAE5; color: #065F46;' if inv.get('status') == 'Collected' else '#FEF3C7; color: #92400E;'}">{inv.get('status', 'Pending')}</span></td>
        </tr>
        """

    if not inv_rows:
        inv_rows = "<tr><td colspan='8' style='text-align: center; padding: 14px;'>No invoices found for this client.</td></tr>"

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {{ size: A4 portrait; margin: 12mm 14mm; }}
    body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1E293B; margin: 0; padding: 0; }}
    .header-table {{ width: 100%; border-bottom: 2px solid #0047AB; padding-bottom: 8px; margin-bottom: 12px; }}
    .client-card {{ background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; }}
    table.data-table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    table.data-table th {{ background: #0047AB; color: #FFFFFF; font-size: 9px; padding: 6px 8px; text-align: left; }}
    table.data-table td {{ border-bottom: 1px solid #E2E8F0; padding: 5px 8px; font-size: 9px; }}
    table.data-table tr:nth-child(even) {{ background: #F8FAFC; }}
</style>
</head>
<body>
    <table class="header-table">
        <tr>
            <td style="width: 60%;">
                <div style="font-size: 15px; font-weight: 900; color: #0047AB;">{comp.get('name', 'ADK Co., LTD.')}</div>
                <div style="font-size: 9px; color: #475569;">Commercial Registration: {comp.get('cr_number', '2055000000')} • VAT ID: {comp.get('vat_number', '300000000000003')}</div>
                <div style="font-size: 12px; font-weight: 800; color: #0F172A; margin-top: 6px;">STATEMENT OF ACCOUNT (ACCOUNTS RECEIVABLE)</div>
            </td>
            <td style="width: 40%; text-align: right;">
                <div style="font-size: 9px; color: #64748B;">Statement Date: {datetime.now().strftime('%d %B %Y')}</div>
                <div style="font-size: 12px; font-weight: 800; color: #DC2626; margin-top: 4px;">TOTAL BALANCE DUE: SAR {balance_due:,.2f}</div>
            </td>
        </tr>
    </table>

    <div class="client-card">
        <div style="font-size: 12px; font-weight: 800; color: #0047AB;">{client.get('name', 'Client Company')}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 9px; color: #475569; margin-top: 4px;">
            <div>Contact: {client.get('contact_person', 'N/A')} • Phone: {client.get('phone', 'N/A')}</div>
            <div>CR #: {client.get('cr_number', 'N/A')} • VAT #: {client.get('vat_number', 'N/A')}</div>
            <div>Payment Terms: {client.get('payment_terms', 'Net 30')}</div>
            <div>Address: {client.get('address', 'KSA')}</div>
        </div>
    </div>

    <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">Invoice History & Receivables</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Details</th>
                <th style="text-align: right;">Billed</th>
                <th style="text-align: right;">Collected</th>
                <th style="text-align: right;">Balance</th>
                <th style="text-align: center;">Status</th>
            </tr>
        </thead>
        <tbody>
            {inv_rows}
        </tbody>
        <tfoot>
            <tr style="background: #F1F5F9; font-weight: 800;">
                <td colspan="4" style="text-align: right;">TOTALS:</td>
                <td style="text-align: right; color: #0047AB;">SAR {tot_billed:,.2f}</td>
                <td style="text-align: right; color: #059669;">SAR {tot_paid:,.2f}</td>
                <td style="text-align: right; color: #DC2626;">SAR {balance_due:,.2f}</td>
                <td></td>
            </tr>
        </tfoot>
    </table>
</body>
</html>"""
    return html_to_pdf_playwright(html, landscape=False)


