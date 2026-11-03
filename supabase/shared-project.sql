-- Run after provisioning the legacy Finance tables and buckets.
-- Grant memberships before switching the production frontend to this database.
begin;

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
