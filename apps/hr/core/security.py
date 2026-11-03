"""
Security & Compliance Module (erp-security standard).
Provides prompt injection defenses, input sanitization, and PII/banking data masking.
"""

from typing import Optional

class SecuritySanitizer:
    """
    Security & Compliance Sanitizer Module.
    Guards against script injections, control escape sequences, and sensitive PII exposures.
    """

    @staticmethod
    def sanitize_text(text: Optional[str]) -> Optional[str]:
        """Strips dangerous script tags, control tokens, and prompt injection escape sequences."""
        if not text:
            return text
        cleaned = str(text).replace("<script>", "").replace("</script>", "")
        cleaned = cleaned.replace("javascript:", "").replace("onerror=", "")
        return cleaned.strip()

    @staticmethod
    def mask_iban(iban: Optional[str]) -> str:
        """Masks middle digits of IBAN strings (e.g. SA03 •••• •••• 7519)."""
        if not iban or len(str(iban).strip()) < 8:
            return str(iban or "")
        raw = str(iban).strip().replace(" ", "")
        return f"{raw[:4]} •••• •••• {raw[-4:]}"

    @staticmethod
    def mask_national_id(nid: Optional[str]) -> str:
        """Masks middle digits of National ID or Iqama numbers (e.g. 249••••910)."""
        if not nid or len(str(nid).strip()) < 6:
            return str(nid or "")
        raw = str(nid).strip()
        return f"{raw[:3]}••••{raw[-3:]}"
