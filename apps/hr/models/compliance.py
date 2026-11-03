from pydantic import BaseModel
from typing import Optional

class LeaveCreate(BaseModel):
    employee_id: int
    leave_type: str
    start_date: str
    end_date: str
    days: int
    reason: Optional[str] = None

class LeaveStatusUpdate(BaseModel):
    status: str
    approved_by: Optional[str] = "Admin"

class EOSBRequest(BaseModel):
    basic_salary: float
    housing_allowance: Optional[float] = 0.0
    transport_allowance: Optional[float] = 0.0
    other_allowances: Optional[float] = 0.0
    start_date: str
    end_date: str
    reason: str = "resignation"

class GOSIRequest(BaseModel):
    is_saudi: bool
    basic_salary: float
    housing_allowance: Optional[float] = 0.0
