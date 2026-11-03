"""
Seed Data Script Shim (Backward Compatibility).
Redirects to scripts.seed_database module.
"""

from scripts.seed_database import seed_database

if __name__ == "__main__":
    seed_database()
