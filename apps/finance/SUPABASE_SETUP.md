# How to Connect Your App to Supabase

This guide walks you through connecting your existing React application to Supabase.

## Step 1: Create a Supabase Project
1. Go to [https://supabase.com/](https://supabase.com/) and sign in or create an account.
2. Click **"New Project"**.
3. Select your organization, give your project a name (e.g., `ADK Expense`), create a strong database password, and choose a region closest to your users.
4. Click **"Create new project"**. It will take a few minutes to provision the database.

## Step 2: Get Your API Keys
1. Once your project is ready, go to the **Project Settings** (the gear icon on the left sidebar).
2. Click on **API** under the Configuration section.
3. You will need two pieces of information:
   - **Project URL** (This is your `VITE_SUPABASE_URL`)
   - **Publishable Key** (This is your `VITE_SUPABASE_ANON_KEY`. Do NOT use the secret key!)

## Step 3: Configure Your Local Environment
1. In your project folder, create a new file named `.env` (or rename `.env.example` to `.env`).
2. Open the `.env` file and add your keys like this:
   ```env
   VITE_SUPABASE_URL="YOUR_SUPABASE_PROJECT_URL_HERE"
   VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY_HERE"
   ```
   *(Make sure there are no spaces around the `=` sign, and replace the placeholder text with the actual keys from Step 2)*.

## Step 4: Set Up Authentication
1. In your Supabase dashboard, go to **Authentication** (the people icon).
2. Click on **Providers** under the Configuration section.
3. Enable **Google** (since your app uses Google Sign-In).
4. You will need to obtain a Google Client ID and Client Secret from the [Google Cloud Console](https://console.cloud.google.com/) and enter them here.
5. In your Google Cloud Console, make sure to add your Supabase project's **Callback URL** (which you can find in the Supabase Google Provider settings) to your authorized redirect URIs.

## Step 5: Create Your Database Tables
Your app uses several tables (`users`, `expenses`, `summaries`, `reviews`). You need to create these in Supabase.
1. In the Supabase dashboard, go to the **SQL Editor** (the terminal icon).
2. Click **"New query"**.
3. You will need to execute SQL commands to create your tables. Here is a basic schema based on your app's types:

```sql
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
```

4. You must also configure Row Level Security (RLS) policies. Copy and run the following query in the SQL Editor to allow authenticated users to read and write data:

```sql
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
```

## Step 6: Enable Realtime (Optional but Recommended)
Since your app uses Supabase Realtime (e.g., `supabase.channel('expenses-changes')`), you need to enable it for your tables:
1. Go to **Database** -> **Replication**.
2. Under "Source", click "0 tables" (or the current number) next to `supabase_realtime`.
3. Toggle the switch to enable Realtime for `expenses`, `summaries`, `users`, and `reviews`.

## Step 7: Restart Your App
If your local development server is running, stop it (Ctrl+C) and restart it (`npm run dev`) so it can load the new `.env` variables.

Your app should now be connected to Supabase!
