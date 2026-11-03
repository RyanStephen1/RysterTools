# ADK CO., LTD — Financial Control System

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-1C1C1C?style=for-the-badge&logo=supabase&logoColor=3ECF8E)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion/)

A premium, high-fidelity brutalist financial control ledger and vault storage application designed for **ADK CO., LTD**. Track withdrawals, manage daily cash payables, carry forward petty cash roll balances, review transactions with dual audit checks, and safely store statements.

---

## 🌟 Key Features

### 1. Daily Cash Registry & Petty Cash Flow
* **Live Bank Reconciliation**: Input initial book balances and track withdrawal processing.
* **Granular Payables Tracker**: Register expenses with voucher numbers (`CV-XXXX`), payees, categorized authorization statuses (`APPROVED`, `PENDING`, `REJECTED`), and internal remarks.
* **Dynamic Analytics Panel**: Visualizes daily expenditures and payee breakdowns in real-time using responsive Brutalist Recharts charts.

### 2. Automated Roll-Forward Mechanics
* **Carry Forward Balances**: Shunts vault cash on hand to tomorrow's statement with a single click, adjusting bank book balances dynamically.
* **Carry Forward Expenses (Only)**: Roll outstanding daily expenses directly into tomorrow's statement if zero cash was withdrawn, shifting Postgres timestamps safely.

### 3. Bulk Registry Correction (Multi-Select Delete)
* **Select-All or Individual Checklists**: Highlight multiple registry items via table checkboxes (fully active in both desktop spreadsheets and responsive mobile cards).
* **Supabase Batch Deletion**: Executes single-query Postgres purges with automatic on-screen selection resets to prevent accidental off-screen data alterations.

### 4. Granular Multi-Role Authorization (RBAC)
* **ADMIN**: Full system powers. Can manage user roles (Admin permissions dashboard), create/delete registry entries, upload files to the drive, and delete records.
* **REVIEWER**: Access to **Review** and **Drive** tabs. Can write/edit review audits and read files, but cannot touch admin controls or delete review items.
* **USER**: View-only access to **Drive** tab. All administrative, modification, and deletion features are strictly hidden and disabled.

### 5. Verified Dual Audit Review Ledger
* **Discrepancy Highlight Tracker**: Computes auditing deltas between raw values, `Sienna Checked`, and `Ryster Checked` balances, highlighting anomalies in blue and emerald.

---

## 🛠️ Tech Stack & Dependencies
* **Core**: [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
* **Database & Authentication**: [Supabase JS Client v2](https://supabase.com/) (PostgreSQL + Row Level Security + Storage Buckets)
* **Styling & UI**: Vanilla CSS + [Tailwind CSS](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/) (Brutalist UX cards, transitions)
* **Icons**: [Lucide React](https://lucide.dev/)
* **Reports Export**: [jsPDF](https://github.com/parallax/jsPDF) (A4 Corporate Layout, Soft Slate Backgrounds) and [html-to-image](https://github.com/bubkoo/html-to-image)

---

## 🚀 Getting Started

### 📋 Prerequisites
* **Node.js** (v16.0.0 or higher)
* **npm** (v8.0.0 or higher)
* **Supabase Project** (A free or premium Supabase instance)

### 1. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/RyanStephen1/adk-expense-finance.git

# Navigate into the project folder
cd adk-expense-finance

# Install required node modules
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anonymous-key
```

### 3. Database Setup (SQL Schema)
Navigate to your Supabase Project Dashboard, open the **SQL Editor**, and run the SQL instructions located in:
1. [SUPABASE_SETUP.md](SUPABASE_SETUP.md) — Initializes core tables (`users`, `expenses`, `summaries`, `reviews`), configures automatic timestamps, and enables RLS policies.
2. [SUPABASE_DRIVE_SETUP.md](SUPABASE_DRIVE_SETUP.md) — Configures the `reports` metadata table, establishes the `cash-reports` storage bucket, and handles RLS media upload profiles.

### 4. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser to run the application locally!

---

## 🔒 Permission & Roles Matrix

| Feature | ADMIN | REVIEWER | USER |
| :--- | :---: | :---: | :---: |
| View Cash Registry | ✅ | ❌ | ❌ |
| Create/Edit Expenses | ✅ | ❌ | ❌ |
| Bulk Delete Records | ✅ | ❌ | ❌ |
| Create/Edit Review Audits | ✅ | ✅ | ❌ |
| Delete Review Audits | ✅ | ❌ | ❌ |
| Access Reports Drive | ✅ (Read/Write) | ✅ (Read-Only) | ✅ (Read-Only) |
| Manage User Roles | ✅ | ❌ | ❌ |

---

## 📄 Licensing & Security Note
This system utilizes secure **Supabase Row-Level Security (RLS)**. All database endpoints require active authenticated Google sessions. New accounts default to `PENDING` status and must be promoted by an `ADMIN` in the **Admin Hub** before they can interact with company resources.
