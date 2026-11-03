"""
Centralized Configuration & Settings Module (core/config.py).
Loads environment variables, manages default corporate parameters, and provides dynamic settings resolution.
Uses zero external dependencies.
"""

import os
from typing import Dict, Any, Optional

def load_env_file(filepath: str):
    """Simple standard-library .env file parser without third-party dependencies."""
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass

# Load presets or .env if available
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
presets_env_path = os.path.join(BASE_DIR, "presets.env")
env_path = os.path.join(BASE_DIR, ".env")

if os.path.exists(presets_env_path):
    load_env_file(presets_env_path)
elif os.path.exists(env_path):
    load_env_file(env_path)

# =========================================================================
# 1. SERVER & SECURITY CONFIGURATION
# =========================================================================
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))
DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

JWT_SECRET: str = os.getenv("JWT_SECRET", "ADK_SAUDI_ERP_SECRET_KEY_PRODUCTION_2026_SECURE")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

DEFAULT_ADMIN_EMAIL: str = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@adknprotech.com")
DEFAULT_ADMIN_PASSWORD: str = os.getenv("DEFAULT_ADMIN_PASSWORD", "AdminSecret123!")

# =========================================================================
# 2. DEFAULT SAUDI CORPORATE COMPLIANCE PROFILE
# =========================================================================
DEFAULT_COMPANY_NAME: str = os.getenv("COMPANY_NAME", "ADK Co., LTD.")
DEFAULT_COMPANY_ARABIC_NAME: str = os.getenv("COMPANY_ARABIC_NAME", "شركة إيه دي كيه للخدمات الصناعية المحدودة")
DEFAULT_CR_NUMBER: str = os.getenv("CR_NUMBER", "2055001234")
DEFAULT_VAT_NUMBER: str = os.getenv("VAT_NUMBER", "300000000000003")
DEFAULT_MOL_ESTABLISHMENT_ID: str = os.getenv("MOL_ESTABLISHMENT_ID", "7-889412")
DEFAULT_GOSI_REG_NUMBER: str = os.getenv("GOSI_REG_NUMBER", "309481920")
DEFAULT_WPS_BANK_CODE: str = os.getenv("WPS_BANK_CODE", "RIBL")
DEFAULT_WPS_BANK_NAME: str = os.getenv("WPS_BANK_NAME", "Riyad Bank")
DEFAULT_HR_EMAIL: str = os.getenv("HR_EMAIL", "sales@adknprotech.com")
DEFAULT_ADDRESS: str = os.getenv("ADDRESS", "2837, B13, Tebah District, Al Jubail, Kingdom of Saudi Arabia")
DEFAULT_PHONE: str = os.getenv("PHONE", "+966-50-285-4880")
DEFAULT_WEBSITE: str = os.getenv("WEBSITE", "www.adknprotech.com")

# =========================================================================
# 3. FINANCIAL & COMPLIANCE CONSTANTS (ZERO MAGIC NUMBERS)
# =========================================================================
DEFAULT_CURRENCY: str = "SAR"
DEFAULT_VAT_RATE: float = 15.0  # 15% standard KSA VAT

# Saudi GOSI contribution rates under Saudi Social Insurance Law
GOSI_SAUDI_EMPLOYEE_RATE: float = 0.0975  # 9.75% (9% Annuities + 0.75% SANED)
GOSI_SAUDI_EMPLOYER_RATE: float = 0.1175  # 11.75% (9% Annuities + 0.75% SANED + 2% Hazards)
GOSI_EXPAT_EMPLOYER_RATE: float = 0.02    # 2.00% (Occupational Hazards only)

GOSI_MIN_CONTRIBUTION_BASE: float = 1500.0   # SAR 1,500 monthly minimum cap
GOSI_MAX_CONTRIBUTION_BASE: float = 45000.0  # SAR 45,000 monthly maximum cap

DEFAULT_MEAL_ALLOWANCE_RATE: float = 10.0  # SAR 10.0 per duty day

# =========================================================================
# 4. DYNAMIC SETTINGS RESOLVER
# =========================================================================
def get_company_settings(db) -> Dict[str, Any]:
    """
    Fetches company settings dynamically from the database `settings` table,
    falling back seamlessly to environment configurations if not found.
    """
    defaults = {
        "name": DEFAULT_COMPANY_NAME,
        "company_name": DEFAULT_COMPANY_NAME,
        "name_ar": DEFAULT_COMPANY_ARABIC_NAME,
        "company_arabic_name": DEFAULT_COMPANY_ARABIC_NAME,
        "cr_number": DEFAULT_CR_NUMBER,
        "vat_number": DEFAULT_VAT_NUMBER,
        "mol_establishment_id": DEFAULT_MOL_ESTABLISHMENT_ID,
        "gosi_reg_number": DEFAULT_GOSI_REG_NUMBER,
        "wps_bank_code": DEFAULT_WPS_BANK_CODE,
        "wps_bank_name": DEFAULT_WPS_BANK_NAME,
        "email": DEFAULT_HR_EMAIL,
        "phone": DEFAULT_PHONE,
        "address": DEFAULT_ADDRESS,
        "website": DEFAULT_WEBSITE,
        "currency": DEFAULT_CURRENCY,
        "vat_rate": DEFAULT_VAT_RATE
    }

    try:
        rows = db.query_all("SELECT key, value FROM settings")
        for r in rows:
            k, v = r.get("key"), r.get("value")
            if k and v:
                defaults[k] = v
                if k == "company_name":
                    defaults["name"] = v
                elif k == "company_arabic_name":
                    defaults["name_ar"] = v
    except Exception:
        pass

    return defaults
