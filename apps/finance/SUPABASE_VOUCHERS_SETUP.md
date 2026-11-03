# Supabase Storage & Database Setup for Cash Vouchers Drive

Execute these commands in your **Supabase Dashboard ➔ SQL Editor** to create the required `vouchers` table, set up the `cash-vouchers` private storage bucket, and establish RLS security rules for your new Vouchers Drive.

---

### Step 1: Create the Metadata Table and Policies
This table will store the info (names, sizes, uploader, paths) for all files uploaded to the cash vouchers drive. Only admins can insert/delete, but anyone authenticated can view:

```sql
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
```

---

### Step 2: Configure the Storage Bucket & RLS Policies
Run these queries to configure storage policies for the new `cash-vouchers` private bucket. Only admins can upload files, while other members can view/preview:

```sql
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
```

---

### Step 3: Enable Realtime for Vouchers
To ensure cash vouchers pop up on everyone's screen immediately upon upload:
1. Go to your **Supabase Dashboard** ➔ **Database** ➔ **Replication**.
2. Click **"0 tables"** (or the table list) under the **`supabase_realtime`** row.
3. Toggle the switch to **On** for the newly created **`vouchers`** table.
