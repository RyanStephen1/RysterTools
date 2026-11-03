from pydantic import BaseModel
from typing import Optional

class DepartmentCreate(BaseModel):
    name: str
    code: str
    manager_name: Optional[str] = None
    budget: Optional[float] = 0.0

class DepartmentUpdate(BaseModel):
    name: str
    code: str
    manager_name: Optional[str] = None
    budget: Optional[float] = 0.0
