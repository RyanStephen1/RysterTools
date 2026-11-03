from pydantic import BaseModel
from typing import Optional

# Accounts Payable & Supplier Invoices
class SupplierCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    cr_number: Optional[str] = None
    vat_number: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    payment_terms: Optional[str] = "Net 30"
    address: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    cr_number: Optional[str] = None
    vat_number: Optional[str] = None
    bank_name: Optional[str] = None
    iban: Optional[str] = None
    payment_terms: Optional[str] = "Net 30"
    address: Optional[str] = None

class SupplierPaymentCreate(BaseModel):
    company_name: str
    invoice_number: Optional[str] = None
    invoice_date: str
    due_date: str
    invoice_details: Optional[str] = None
    supply_date: Optional[str] = None
    supply_start_date: Optional[str] = None
    supply_end_date: Optional[str] = None
    amount: float
    status: Optional[str] = "Pending"
    remarks: Optional[str] = None

class SupplierPaymentStatusUpdate(BaseModel):
    status: str

class SupplierDisburseRequest(BaseModel):
    payment_amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = "Bank Transfer"
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class BackupRestoreRequest(BaseModel):
    confirm: bool

# Accounts Receivable & Client Collections Models
class ClientCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    cr_number: Optional[str] = None
    vat_number: Optional[str] = None
    payment_terms: Optional[str] = "Net 30"
    address: Optional[str] = None

class ClientUpdate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    cr_number: Optional[str] = None
    vat_number: Optional[str] = None
    payment_terms: Optional[str] = "Net 30"
    address: Optional[str] = None

class ClientInvoiceCreate(BaseModel):
    client_id: Optional[int] = None
    client_name: str
    invoice_number: str
    invoice_date: str
    due_date: str
    invoice_details: Optional[str] = None
    service_period_start: Optional[str] = None
    service_period_end: Optional[str] = None
    subtotal: Optional[float] = 0.0
    vat_rate: Optional[float] = 15.0
    vat_amount: Optional[float] = 0.0
    total_amount: float
    remarks: Optional[str] = None

class ClientInvoiceUpdate(BaseModel):
    client_id: Optional[int] = None
    client_name: str
    invoice_number: str
    invoice_date: str
    due_date: str
    invoice_details: Optional[str] = None
    service_period_start: Optional[str] = None
    service_period_end: Optional[str] = None
    subtotal: Optional[float] = 0.0
    vat_rate: Optional[float] = 15.0
    vat_amount: Optional[float] = 0.0
    total_amount: float
    remarks: Optional[str] = None

class ClientCollectionLogCreate(BaseModel):
    payment_amount: float
    payment_date: str
    payment_method: Optional[str] = "Bank Transfer"
    reference_number: Optional[str] = None
    notes: Optional[str] = None
