-- Dynamic Island: run this once in the Supabase SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 40),
  avatar_emoji text not null default '🙂' check (char_length(avatar_emoji) <= 8),
  avatar_color text not null default '#60a5fa' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default '' check (char_length(status) <= 80),
  presence text not null default 'online' check (presence in ('online', 'idle', 'dnd', 'invisible')),
  last_seen timestamptz not null default now(),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 40000),
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null references public.profiles on delete cascade,
  addressee uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee),
  unique (requester, addressee)
);

-- what a user is doing right now; only visible to the user and their friends
create table if not exists public.activity (
  user_id uuid primary key references public.profiles on delete cascade,
  text text not null default '' check (char_length(text) <= 120),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null references public.profiles on delete cascade,
  recipient uuid not null references public.profiles on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'activity', 'note')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_pair_idx on public.messages (sender, recipient, created_at);
create index if not exists messages_recipient_idx on public.messages (recipient, created_at);

create or replace function public.is_friend(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.activity enable row level security;
alter table public.messages enable row level security;

create policy "profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "send a friend request" on public.friendships
  for insert to authenticated with check (requester = auth.uid() and status = 'pending');
create policy "accept a request sent to you" on public.friendships
  for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy "remove a friendship" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

create policy "activity visible to self and friends" on public.activity
  for select to authenticated using (user_id = auth.uid() or public.is_friend(user_id, auth.uid()));
create policy "set own activity" on public.activity
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own activity" on public.activity
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own activity" on public.activity
  for delete to authenticated using (user_id = auth.uid());

create policy "read own conversations" on public.messages
  for select to authenticated using (auth.uid() in (sender, recipient));
create policy "message friends only" on public.messages
  for insert to authenticated with check (sender = auth.uid() and public.is_friend(sender, recipient));
create policy "delete own messages" on public.messages
  for delete to authenticated using (sender = auth.uid());

-- the recipient marks a friend's messages as read; only read_at can change, and only through this function
create or replace function public.mark_read(friend uuid) returns void
language sql security definer set search_path = public as $$
  update public.messages set read_at = now()
  where recipient = auth.uid() and sender = friend and read_at is null;
$$;
grant execute on function public.mark_read(uuid) to authenticated;

alter publication supabase_realtime add table public.messages, public.friendships, public.activity, public.profiles;

-- already ran an older version of this file? run this line once to add the presence column:
-- alter table public.profiles add column if not exists presence text not null default 'online' check (presence in ('online', 'idle', 'dnd', 'invisible'));

-- already ran an older version of this file? run this line once so closed apps show as offline:
-- alter table public.profiles add column if not exists last_seen timestamptz not null default now();

-- already ran an older version of this file? run this once to add read receipts:
-- alter table public.messages add column if not exists read_at timestamptz;
-- (then also run the create function public.mark_read ... block above)
-- friends see status changes live: alter publication supabase_realtime add table public.profiles;
