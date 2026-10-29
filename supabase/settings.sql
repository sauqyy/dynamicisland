-- Settings that follow the account: after an update or a reinstall, signing in brings them back.
-- Run this once in the SQL editor (after schema.sql).
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 16000),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "read own settings" on public.user_settings
  for select to authenticated using (user_id = auth.uid());
create policy "create own settings" on public.user_settings
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own settings" on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
