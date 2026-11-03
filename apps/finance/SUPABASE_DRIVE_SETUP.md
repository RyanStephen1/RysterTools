# Supabase Storage & Database Setup for Cash Reports Drive (Admin-Only Uploads)

Execute these commands in your **Supabase Dashboard ➔ SQL Editor** to create the required tables, enable Row Level Security, and set up admin-only write/upload rules for your new Document Drive.

---

### Step 1: Create the Metadata Table and Policies
This table will store the info (names, sizes, uploader, paths) for all files uploaded to the storage bucket. Only admins can insert/delete, but anyone authenticated can view:

```sql
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
```

---

### Step 2: Configure the Storage Bucket & RLS Policies
Run these queries to configure policies for the `cash-reports` storage bucket. Only admins can upload files to the storage bucket, while other members can view/preview:

```sql
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
```

---

### Step 3: Enable Realtime for Reports
To ensure files pop up on everyone's screen immediately upon upload:
1. Go to your **Supabase Dashboard** ➔ **Database** ➔ **Replication**.
2. Click **"0 tables"** (or the table list) under the **`supabase_realtime`** row.
3. Toggle the switch to **On** for the newly created **`reports`** table.
