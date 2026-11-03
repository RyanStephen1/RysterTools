"""
Employee List Excel Importer Shim (Backward Compatibility).
Redirects to scripts.import_employees module.
"""

from scripts.import_employees import (
    parse_date_flexible,
    parse_float_safe,
    clean_name,
    get_department_for_job,
    populate_from_employeelist
)

if __name__ == "__main__":
    import os
    excel_path = os.path.join(os.path.dirname(__file__), "employeelist.xlsx")
    if not os.path.exists(excel_path):
        excel_path = os.path.join(os.path.dirname(__file__), "data", "templates", "employeelist.xlsx")
    if os.path.exists(excel_path):
        populate_from_employeelist(excel_path)
