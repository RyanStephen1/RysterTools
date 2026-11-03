# Supabase Database Setup for Bank Registry

Execute these commands in your **Supabase Dashboard ➔ SQL Editor** to create the required `bank_transactions` table, configure Row Level Security (RLS), and establish realtime syncing rules.

---

### Step 1: Create the Bank Transactions Table
Run this SQL block to create the table, assign correct types, and set up relational keys for tracking uploaders:

```sql
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
```

---

### Step 2: Configure Row Level Security (RLS)
This ensures only authenticated users can access the bank registry:

```sql
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
```

---

### Step 3: Enable Realtime Replication
To ensure bank ledger modifications sync instantly across all open tabs:
1. Go to your **Supabase Dashboard** ➔ **Database** ➔ **Replication**.
2. Click **"0 tables"** (or the table list) under the **`supabase_realtime`** row.
3. Toggle the switch to **On** for the newly created **`bank_transactions`** table.
