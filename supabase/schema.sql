-- Dialysis Tracker database
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- It is safe to run more than once.

-- Every record (sessions, BP readings, supplies, settings) is one row, stored as JSON.
-- Each person can only ever read and write their own rows.
create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  kind       text not null check (kind in ('settings', 'session', 'bp', 'item', 'delivery', 'stockcheck')),
  data       jsonb not null,
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists records_sync_idx on public.records (user_id, synced_at);

-- The server stamps synced_at, so devices with slightly wrong clocks still sync correctly.
create or replace function public.records_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records
for each row execute function public.records_stamp();

alter table public.records enable row level security;

drop policy if exists "own records: read" on public.records;
drop policy if exists "own records: add" on public.records;
drop policy if exists "own records: change" on public.records;

create policy "own records: read" on public.records
  for select to authenticated using (user_id = auth.uid());
create policy "own records: add" on public.records
  for insert to authenticated with check (user_id = auth.uid());
create policy "own records: change" on public.records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No delete policy: deleting in the app marks a row as deleted so other devices find out.

revoke all on public.records from anon;
grant select, insert, update on public.records to authenticated;
