-- Study time per day, for the weekly leaderboard and streaks in the Study page.
-- Run once in the Supabase SQL editor. Each user only writes their own rows; friends can read them.
-- (A user opts in under Study → "Share my study time"; nothing is written without it.)
create table if not exists public.study_days (
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  minutes integer not null check (minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.study_days enable row level security;

create policy "study visible to self and friends" on public.study_days
  for select to authenticated using (user_id = auth.uid() or public.is_friend(user_id, auth.uid()));
create policy "set own study" on public.study_days
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own study" on public.study_days
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own study" on public.study_days
  for delete to authenticated using (user_id = auth.uid());
