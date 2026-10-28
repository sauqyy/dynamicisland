-- Dynamic Island group chats: run this once in the Supabase SQL editor, after schema.sql.
-- Safe to run again: it is how you pick up changes to the functions.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '👥' check (char_length(emoji) <= 8),
  color text not null default '#60a5fa' check (color ~ '^#[0-9a-fA-F]{6}$'),
  owner uuid not null references public.profiles on delete cascade,
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at timestamptz not null default now()
);

-- 'invited' = the owner added them and they have not answered yet
-- already ran an older groups.sql? this adds the icon colour:
alter table public.groups add column if not exists color text not null default '#60a5fa' check (color ~ '^#[0-9a-fA-F]{6}$');

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'member')),
  invited_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups on delete cascade,
  sender uuid not null references public.profiles on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'activity', 'note')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at);

-- how far each member has read, so a message can show who has seen it
create table if not exists public.group_reads (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  last_read_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- helpers are security definer so policies on one table can look at another without recursing
create or replace function public.is_group_member(gid uuid, uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid and status = 'member');
$$;
create or replace function public.in_group(gid uuid, uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid);
$$;
create or replace function public.is_group_owner(gid uuid, uid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.groups where id = gid and owner = uid);
$$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_reads enable row level security;

drop policy if exists "see groups you are in or invited to" on public.groups;
create policy "see groups you are in or invited to" on public.groups
  for select to authenticated using (owner = auth.uid() or public.in_group(id, auth.uid()));
drop policy if exists "owner edits the group" on public.groups;
create policy "owner edits the group" on public.groups
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "owner deletes the group" on public.groups;
create policy "owner deletes the group" on public.groups
  for delete to authenticated using (owner = auth.uid());

-- rows are only created and accepted through the functions below
drop policy if exists "see members of your groups" on public.group_members;
create policy "see members of your groups" on public.group_members
  for select to authenticated using (user_id = auth.uid() or public.is_group_member(group_id, auth.uid()));
drop policy if exists "leave, decline or remove" on public.group_members;
create policy "leave, decline or remove" on public.group_members
  for delete to authenticated using (user_id = auth.uid() or public.is_group_owner(group_id, auth.uid()));

drop policy if exists "read group messages" on public.group_messages;
create policy "read group messages" on public.group_messages
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));
drop policy if exists "write to your groups" on public.group_messages;
create policy "write to your groups" on public.group_messages
  for insert to authenticated with check (sender = auth.uid() and public.is_group_member(group_id, auth.uid()));
drop policy if exists "delete own group messages" on public.group_messages;
create policy "delete own group messages" on public.group_messages
  for delete to authenticated using (sender = auth.uid());

drop policy if exists "see who read" on public.group_reads;
create policy "see who read" on public.group_reads
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));
drop policy if exists "mark your own read" on public.group_reads;
create policy "mark your own read" on public.group_reads
  for insert to authenticated with check (user_id = auth.uid() and public.is_group_member(group_id, auth.uid()));
drop policy if exists "move your own read" on public.group_reads;
create policy "move your own read" on public.group_reads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_group_member(group_id, auth.uid()));

drop function if exists public.create_group(text, text);
create or replace function public.create_group(group_name text, group_emoji text default '👥', group_color text default '#60a5fa') returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.groups (name, emoji, color, owner)
    values (trim(group_name), coalesce(nullif(trim(group_emoji), ''), '👥'), coalesce(nullif(trim(group_color), ''), '#60a5fa'), auth.uid())
    returning * into g;
  insert into public.group_members (group_id, user_id, status) values (g.id, auth.uid(), 'member');
  return g;
end $$;

-- join with an invite code (or finish an invitation you already have)
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into gid from public.groups where invite_code = upper(trim(code));
  if gid is null then raise exception 'That invite code does not exist'; end if;
  insert into public.group_members (group_id, user_id, status) values (gid, auth.uid(), 'member')
    on conflict (group_id, user_id) do update set status = 'member';
  return gid;
end $$;

-- the owner adds someone by username; they get an invitation to accept or decline
drop function if exists public.invite_to_group(uuid, text);
create or replace function public.invite_to_group(gid uuid, uname text) returns void
language plpgsql security definer set search_path = public as $$
declare target uuid; current_status text;
begin
  if not public.is_group_owner(gid, auth.uid()) then raise exception 'Only the group owner can add people'; end if;
  select id into target from public.profiles where profiles.username = lower(trim(both '@' from trim(uname)));
  if target is null then raise exception 'No one is called @%', lower(trim(both '@' from trim(uname))); end if;
  select status into current_status from public.group_members where group_id = gid and user_id = target;
  if current_status = 'member' then raise exception 'Already in the group'; end if;
  if current_status = 'invited' then raise exception 'Already invited'; end if;
  insert into public.group_members (group_id, user_id, status, invited_by) values (gid, target, 'invited', auth.uid());
end $$;

create or replace function public.respond_group_invite(gid uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if accept then
    update public.group_members set status = 'member' where group_id = gid and user_id = auth.uid() and status = 'invited';
  else
    delete from public.group_members where group_id = gid and user_id = auth.uid() and status = 'invited';
  end if;
end $$;

-- a new code makes the old link and code stop working
create or replace function public.reset_invite_code(gid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_group_owner(gid, auth.uid()) then raise exception 'Only the group owner can do that'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  update public.groups set invite_code = c where id = gid;
  return c;
end $$;

grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.invite_to_group(uuid, text) to authenticated;
grant execute on function public.respond_group_invite(uuid, boolean) to authenticated;
grant execute on function public.reset_invite_code(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['groups', 'group_members', 'group_messages', 'group_reads'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- make PostgREST see the new functions straight away
notify pgrst, 'reload schema';
