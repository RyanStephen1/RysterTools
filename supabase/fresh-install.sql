-- Run once on an empty Supabase project as the database owner.
-- Creates Finance tables, private buckets, and module access in one transaction.

begin;
set local search_path = public, extensions;

-- Create users table
CREATE TABLE users (
  uid UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  "displayName" TEXT,
  role TEXT DEFAULT 'PENDING',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "lastLogin" TIMESTAMP WITH TIME ZONE
);

-- Create expenses table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payee TEXT NOT NULL,
  "cvNo" TEXT,
  particulars TEXT,
  amount NUMERIC NOT NULL,
  remarks TEXT,
  status TEXT DEFAULT 'PENDING',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "createdBy" UUID REFERENCES users(uid)
);

-- Create summaries table
CREATE TABLE summaries (
  id TEXT PRIMARY KEY DEFAULT 'current',
  "withdrawalAmount" NUMERIC DEFAULT 0,
  "bankBalance" NUMERIC DEFAULT 0,
  "cashOnHand" NUMERIC DEFAULT 0,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert initial summary row
INSERT INTO summaries (id, "withdrawalAmount", "bankBalance", "cashOnHand") 
VALUES ('current', 0, 0, 0);

-- Create reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "cvNo" TEXT,
  particulars TEXT,
  "cvAmount" NUMERIC,
  "siennaChecked" NUMERIC,
  "rysterCrossChecked" NUMERIC,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "createdBy" UUID REFERENCES users(uid),
  "dateStr" TEXT
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all authenticated users full access
CREATE POLICY "Allow authenticated full access to users" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to expenses" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to summaries" ON summaries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access to reviews" ON reviews FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create bank_transactions table
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "date" TEXT NOT NULL,                  -- Format: 'YYYY-MM-DD'
  "type" TEXT NOT NULL,                  -- 'DEPOSIT', 'FUND_TRANSFER', 'DEPOSIT_FROM_KOREA', 'PAYMENT_TO_BE_MADE', 'WITHDRAWAL', 'KOREA_PAYMENT'
  "particulars" TEXT NOT NULL,           -- Description of transaction
  "refNo" TEXT,                          -- Reference number, invoice, voucher, or transfer reference
  "bankName" TEXT NOT NULL,              -- 'Al Rajhi Bank', 'SNB (AlAhli)', 'Riyad Bank', 'SABB', etc.
  "amount" NUMERIC NOT NULL,             -- Transaction amount
  "status" TEXT DEFAULT 'CLEARED',       -- 'CLEARED', 'PENDING', 'BOUNCED'
  "remarks" TEXT,                        -- Additional remarks
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "createdBy" UUID REFERENCES public.users(uid) ON DELETE SET NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies to prevent collision errors
DROP POLICY IF EXISTS "Allow authenticated read bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow authenticated insert bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow authenticated update bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Allow authenticated delete bank_transactions" ON public.bank_transactions;

-- 1. Allow all authenticated users to read bank transactions metadata
CREATE POLICY "Allow authenticated read bank_transactions"
ON public.bank_transactions
FOR SELECT
TO authenticated
USING (true);

-- 2. Allow authenticated users to insert transactions
CREATE POLICY "Allow authenticated insert bank_transactions"
ON public.bank_transactions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3. Allow authenticated users to update transactions
CREATE POLICY "Allow authenticated update bank_transactions"
ON public.bank_transactions
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Allow authenticated users to delete transactions
CREATE POLICY "Allow authenticated delete bank_transactions"
ON public.bank_transactions
FOR DELETE
TO authenticated
USING (true);

-- Create reports metadata table
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,      -- Path inside the Supabase storage bucket
  file_size NUMERIC NOT NULL,          -- File size in bytes
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  uploaded_by UUID REFERENCES public.users(uid) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies to prevent collision errors
DROP POLICY IF EXISTS "Allow authenticated read reports" ON public.reports;
DROP POLICY IF EXISTS "Allow only admins to insert reports" ON public.reports;
DROP POLICY IF EXISTS "Allow only admins to delete reports" ON public.reports;

-- 1. Allow all authenticated users to select/view reports metadata
CREATE POLICY "Allow authenticated read reports"
ON public.reports
FOR SELECT
TO authenticated
USING (true);

-- 2. Allow ONLY admins (or superadmin email) to upload/insert report metadata
CREATE POLICY "Allow only admins to insert reports"
ON public.reports
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.uid = auth.uid() 
    AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
  )
);

-- 3. Allow ONLY admins (or superadmin email) to delete report metadata
CREATE POLICY "Allow only admins to delete reports"
ON public.reports
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.uid = auth.uid() 
    AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
  )
);

-- 1. Insert bucket configuration (if not created via dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cash-reports', 
  'cash-reports', 
  false,               -- KEEP IT PRIVATE
  52428800,            -- 50 MB single-file size limit (in bytes)
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET 
  public = false, 
  file_size_limit = 52428800;

-- Clean up any existing policies on storage objects to prevent collision errors
DROP POLICY IF EXISTS "Allow auth select reports" ON storage.objects;
DROP POLICY IF EXISTS "Allow only admins to insert storage reports" ON storage.objects;
DROP POLICY IF EXISTS "Allow only admins to delete storage reports" ON storage.objects;

-- 2. Allow all authenticated users to view/download/preview files
CREATE POLICY "Allow auth select reports"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'cash-reports');

-- 3. Allow ONLY admins (or superadmin email) to upload/insert files
CREATE POLICY "Allow only admins to insert storage reports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cash-reports' AND (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.uid = auth.uid() 
      AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
    )
  )
);

-- 4. Allow ONLY admins (or superadmin email) to delete files
CREATE POLICY "Allow only admins to delete storage reports"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'cash-reports' AND (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.uid = auth.uid() 
      AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
    )
  )
);

-- Create vouchers metadata table
CREATE TABLE IF NOT EXISTS public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,      -- Path inside the Supabase storage bucket
  file_size NUMERIC NOT NULL,          -- File size in bytes
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  uploaded_by UUID REFERENCES public.users(uid) ON DELETE SET NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies to prevent collision errors
DROP POLICY IF EXISTS "Allow authenticated read vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Allow only admins to insert vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Allow only admins to delete vouchers" ON public.vouchers;

-- 1. Allow all authenticated users to select/view vouchers metadata
CREATE POLICY "Allow authenticated read vouchers"
ON public.vouchers
FOR SELECT
TO authenticated
USING (true);

-- 2. Allow ONLY admins (or superadmin email) to upload/insert voucher metadata
CREATE POLICY "Allow only admins to insert vouchers"
ON public.vouchers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.uid = auth.uid() 
    AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
  )
);

-- 3. Allow ONLY admins (or superadmin email) to delete voucher metadata
CREATE POLICY "Allow only admins to delete vouchers"
ON public.vouchers
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.uid = auth.uid() 
    AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
  )
);

-- 1. Insert bucket configuration (if not created via dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cash-vouchers', 
  'cash-vouchers', 
  false,               -- KEEP IT PRIVATE
  52428800,            -- 50 MB single-file size limit (in bytes)
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET 
  public = false, 
  file_size_limit = 52428800;

-- Clean up any existing policies on storage objects to prevent collision errors
DROP POLICY IF EXISTS "Allow auth select vouchers" ON storage.objects;
DROP POLICY IF EXISTS "Allow only admins to insert storage vouchers" ON storage.objects;
DROP POLICY IF EXISTS "Allow only admins to delete storage vouchers" ON storage.objects;

-- 2. Allow all authenticated users to view/download/preview files
CREATE POLICY "Allow auth select vouchers"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'cash-vouchers');

-- 3. Allow ONLY admins (or superadmin email) to upload/insert files
CREATE POLICY "Allow only admins to insert storage vouchers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cash-vouchers' AND (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.uid = auth.uid() 
      AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
    )
  )
);

-- 4. Allow ONLY admins (or superadmin email) to delete files
CREATE POLICY "Allow only admins to delete storage vouchers"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'cash-vouchers' AND (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.uid = auth.uid() 
      AND (users.role = 'ADMIN' OR users.email = 'rcascalla1@gmail.com')
    )
  )
);

grant select, insert, update, delete on public.users, public.expenses, public.summaries, public.reviews, public.bank_transactions, public.reports, public.vouchers to authenticated;

create schema if not exists ryster_private;
revoke all on schema ryster_private from public, anon, authenticated;
grant usage on schema ryster_private to authenticated;

create table if not exists ryster_private.module_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('finance', 'documents', 'procurement', 'cv', 'hr')),
  primary key (user_id, module)
);

alter table ryster_private.module_memberships enable row level security;
revoke all on ryster_private.module_memberships from public, anon, authenticated;

create or replace function ryster_private.has_module_access(module_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from ryster_private.module_memberships
    where user_id = (select auth.uid()) and module = module_name
  );
$$;

revoke all on function ryster_private.has_module_access(text) from public, anon;
grant execute on function ryster_private.has_module_access(text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['users', 'expenses', 'summaries', 'reviews',
    'bank_transactions', 'reports', 'vouchers']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('drop policy if exists ryster_finance_members_only on public.%I', table_name);
    execute format(
      'create policy ryster_finance_members_only on public.%I as restrictive
       for all to authenticated
       using ((select ryster_private.has_module_access(''finance'')))
       with check ((select ryster_private.has_module_access(''finance'')))',
      table_name
    );
  end loop;
end;
$$;

update storage.buckets set public = false where id in ('cash-reports', 'cash-vouchers');

drop policy if exists ryster_finance_members_only on storage.objects;
create policy ryster_finance_members_only on storage.objects as restrictive
for all to authenticated
using (bucket_id not in ('cash-reports', 'cash-vouchers') or
  (select ryster_private.has_module_access('finance')))
with check (bucket_id not in ('cash-reports', 'cash-vouchers') or
  (select ryster_private.has_module_access('finance')));

drop policy if exists ryster_finance_deny_anonymous on storage.objects;
create policy ryster_finance_deny_anonymous on storage.objects as restrictive
for all to anon
using (bucket_id not in ('cash-reports', 'cash-vouchers'))
with check (bucket_id not in ('cash-reports', 'cash-vouchers'));

commit;
