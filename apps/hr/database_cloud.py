"""
Database Engine Shim (Backward Compatibility).
Redirects to database.db module.
"""

from database.db import (
    DB_WORKSPACE_PATH,
    DB_TMP_PATH,
    is_vercel,
    sync_from_workspace,
    sync_to_workspace,
    get_db_connection,
    init_db,
    query_all,
    query_one,
    execute_cmd,
    execute_script
)

__all__ = [
    "DB_WORKSPACE_PATH",
    "DB_TMP_PATH",
    "is_vercel",
    "sync_from_workspace",
    "sync_to_workspace",
    "get_db_connection",
    "init_db",
    "query_all",
    "query_one",
    "execute_cmd",
    "execute_script"
]
