from pydantic import BaseModel
from typing import Optional, List

class DailyTimesheetEntry(BaseModel):
    day: int
    status: str = "P"
    duty_hours: float = 8.0
    ot_hours: float = 0.0
    is_rest_day: int = 0
    is_holiday: int = 0
    has_meal: int = 0
    remarks: Optional[str] = None

class BulkTimesheetSaveRequest(BaseModel):
    employee_id: int
    year: int
    month: int
    entries: List[DailyTimesheetEntry]

class PayrollRunRequest(BaseModel):
    month: int
    year: int

class WorkerMonthlyPayRequest(BaseModel):
    employee_id: int
    month: int
    year: int
    worker_type: Optional[str] = "Direct"
    cutoff_period: Optional[str] = None
    days: Optional[List[DailyTimesheetEntry]] = []
    
    # Financial Deductions & Overrides
    water_bill: Optional[float] = 0.0
    wps_deduction: Optional[float] = 0.0
    other_deductions: Optional[float] = 0.0
    cash_advance: Optional[float] = 0.0
    adjustment_add: Optional[float] = 0.0
    adjustment_sub: Optional[float] = 0.0
    meal_rate: Optional[float] = 10.0
    daily_rate: Optional[float] = None
    hourly_rate: Optional[float] = None
    ot_rate: Optional[float] = None
    remarks: Optional[str] = None

class AllowanceCategoryCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    code: str
    is_gosi_eligible: Optional[int] = 0
    is_recurring: Optional[int] = 1
    default_amount: Optional[float] = 0.0
    description: Optional[str] = None

class AllowanceCategoryUpdate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    code: str
    is_gosi_eligible: Optional[int] = 0
    is_recurring: Optional[int] = 1
    default_amount: Optional[float] = 0.0
    description: Optional[str] = None

class EmployeeAllowanceCreate(BaseModel):
    category_id: int
    amount: float
    frequency: Optional[str] = "Monthly"
    effective_from: str
    effective_to: Optional[str] = None
    is_active: Optional[int] = 1
    notes: Optional[str] = None

class EmployeeAllowanceUpdate(BaseModel):
    amount: float
    frequency: Optional[str] = "Monthly"
    effective_from: str
    effective_to: Optional[str] = None
    is_active: Optional[int] = 1
    notes: Optional[str] = None

class SalaryAdjustmentCreate(BaseModel):
    new_basic: float
    change_reason: str = "Annual Increment"
    effective_date: str
    notes: Optional[str] = None

class DirectSalaryUpdate(BaseModel):
    basic_salary: float
    meal_allowance: Optional[float] = 0.0
    site_allowance: Optional[float] = 0.0
    other_allowances: Optional[float] = 0.0
    housing_allowance: Optional[float] = 0.0
    transport_allowance: Optional[float] = 0.0
    change_reason: Optional[str] = "Direct Salary Update"
    effective_date: Optional[str] = None
    notes: Optional[str] = None

class DeductionCategoryCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    code: str
    is_recurring: Optional[int] = 1
    default_amount: Optional[float] = 0.0
    description: Optional[str] = None

class DeductionCategoryUpdate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    code: str
    is_recurring: Optional[int] = 1
    default_amount: Optional[float] = 0.0
    description: Optional[str] = None

class EmployeeDeductionCreate(BaseModel):
    category_id: int
    amount: float
    frequency: Optional[str] = "Monthly"
    effective_from: str
    effective_to: Optional[str] = None
    is_active: Optional[int] = 1
    notes: Optional[str] = None

class EmployeeDeductionUpdate(BaseModel):
    amount: float
    frequency: Optional[str] = "Monthly"
    effective_from: str
    effective_to: Optional[str] = None
    is_active: Optional[int] = 1
    notes: Optional[str] = None
