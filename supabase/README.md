# One Supabase project for RysterTools

Use one project URL and public anon key in Vercel. Each tool gets its own data and policies. Users can share an Auth account, with access granted separately per module.

## Set up the new project

1. Create an empty Supabase project. In its SQL Editor, run the entire [fresh-install.sql](fresh-install.sql) script once. It installs Finance and the shared membership rules in one transaction. Keep ryster_private outside the exposed API schemas.
2. Create your initial user in Authentication and copy their Auth UUID. Grant Finance access in the SQL Editor.

       insert into ryster_private.module_memberships (user_id, module)
       values ('replace-with-auth-user-uuid', 'finance')
       on conflict do nothing;

3. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the new project in Vercel and redeploy.
4. Test sign-in, an expense entry, and a file upload with the authorized account. Verify that another authenticated account without Finance membership cannot read or change Finance data.

The fresh install starts with an empty register and a zero-balance summary. It does not copy or delete records in the old project. The separate shared-project.sql file is for adding module access to an already-provisioned database.

The membership policy adds a boundary around the legacy Finance module. Existing policies inside that boundary still govern what Finance members can do, and the old setup guides grant broad access within Finance. Review and replace those policies before relying on separate administrator, reviewer, and clerk privileges.

When building Document Control, Procurement, CV Tracking, and HR, give each its own schema or tables, its own membership checks, and private file buckets where needed.
