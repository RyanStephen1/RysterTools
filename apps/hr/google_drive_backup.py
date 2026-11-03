"""
Google Drive & Local Backup Service Shim (Backward Compatibility).
Redirects to services.backup_service module.
"""

from services.backup_service import (
    BACKUP_DIR,
    get_google_drive_service,
    generate_full_backup_archive,
    upload_backup_to_google_drive,
    restore_from_backup_dict
)

__all__ = [
    "BACKUP_DIR",
    "get_google_drive_service",
    "generate_full_backup_archive",
    "upload_backup_to_google_drive",
    "restore_from_backup_dict"
]
