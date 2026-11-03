from pydantic import BaseModel
from typing import Optional

class EmployeeCreate(BaseModel):
    emp_code: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    arabic_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    national_id_iqama: str
    nationality: str
    gender: Optional[str] = "Male"
    is_saudi: int = 1
    dob: Optional[str] = None
    marital_status: Optional[str] = None
    religion: Optional[str] = None
    blood_group: Optional[str] = None
    department_id: Optional[int] = None
    designation: str
    hire_date: str
    contract_type: Optional[str] = "Fixed"
    contract_end_date: Optional[str] = None
    probation_end_date: Optional[str] = None
    border_number: Optional[str] = None
    iqama_expiry_date: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry_date: Optional[str] = None
    work_permit_number: Optional[str] = None
    work_permit_expiry_date: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    medical_insurance_category: Optional[str] = None
    medical_insurance_expiry_date: Optional[str] = None
    driving_license_number: Optional[str] = None
    driving_license_expiry_date: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    basic_salary: float = 0.0
    housing_allowance: float = 0.0
    transport_allowance: float = 0.0
    other_allowances: float = 0.0
    worker_type: Optional[str] = "Direct"
    gosi_number: Optional[str] = None
    status: Optional[str] = "Active"

class EmployeeUpdate(BaseModel):
    emp_code: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    arabic_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    national_id_iqama: str
    nationality: str
    gender: Optional[str] = "Male"
    is_saudi: int = 1
    dob: Optional[str] = None
    marital_status: Optional[str] = None
    religion: Optional[str] = None
    blood_group: Optional[str] = None
    department_id: Optional[int] = None
    designation: str
    hire_date: str
    contract_type: Optional[str] = "Fixed"
    contract_end_date: Optional[str] = None
    probation_end_date: Optional[str] = None
    border_number: Optional[str] = None
    iqama_expiry_date: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry_date: Optional[str] = None
    work_permit_number: Optional[str] = None
    work_permit_expiry_date: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    medical_insurance_category: Optional[str] = None
    medical_insurance_expiry_date: Optional[str] = None
    driving_license_number: Optional[str] = None
    driving_license_expiry_date: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    basic_salary: float = 0.0
    housing_allowance: float = 0.0
    transport_allowance: float = 0.0
    other_allowances: float = 0.0
    worker_type: Optional[str] = "Direct"
    gosi_number: Optional[str] = None
    status: Optional[str] = "Active"
