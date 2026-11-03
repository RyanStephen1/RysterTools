"""
Authentication Module Shim (Backward Compatibility).
Redirects to core.auth module.
"""

from core.auth import (
    SECRET_KEY,
    hash_password,
    verify_password,
    create_jwt_token,
    verify_jwt_token
)

__all__ = [
    "SECRET_KEY",
    "hash_password",
    "verify_password",
    "create_jwt_token",
    "verify_jwt_token"
]
