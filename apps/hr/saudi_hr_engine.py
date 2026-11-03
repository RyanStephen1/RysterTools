"""
Saudi HR & Financial Domain Engine Shim (Backward Compatibility).
Redirects to services.hr_engine, services.collections_engine, and core.security modules.
"""

from services.hr_engine import SaudiHREngine, CompensationEngine
from services.collections_engine import ClientCollectionEngine
from core.security import SecuritySanitizer

__all__ = [
    "SaudiHREngine",
    "CompensationEngine",
    "ClientCollectionEngine",
    "SecuritySanitizer"
]
