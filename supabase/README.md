# One Supabase project for RysterTools

Use one project URL and public anon key in Vercel. Each tool gets its own data and policies. Users can share an Auth account, with access granted separately per module.

## Set up the new project

1. Provision Finance using the setup guides in apps/finance. Keep the existing Finance table names for compatibility. Run all setup steps on the new project before attaching the production frontend.
2. Run supabase/shared-project.sql as the database owner. This adds a private module membership table and restricts Finance tables and file buckets to Finance members. Keep ryster_private outside the exposed API schemas.
3. Create or migrate Auth accounts. Grant Finance access in the SQL editor using each authorized account's Auth UUID.

       insert into ryster_private.module_memberships (user_id, module)
       values ('replace-with-auth-user-uuid', 'finance')
       on conflict do nothing;

4. If moving existing records, back up the old project first. Migrate Auth users, Finance records, and Storage files, preserving user IDs and file paths or mapping them explicitly. Verify row counts, balances, file access, and both a Finance user and a user without Finance membership.
5. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the shared project in Vercel and redeploy. Verify the new environment before retiring the old project.

The membership policy adds a boundary around the legacy Finance module. Existing policies inside that boundary still govern what Finance members can do, and the old setup guides grant broad access within Finance. Review and replace those policies before relying on separate administrator, reviewer, and clerk privileges.

When building Document Control, Procurement, CV Tracking, and HR, give each its own schema or tables, its own membership checks, and private file buckets where needed.
