-- Dialysis Tracker: share links (database update 2)
-- Already applied to the live project (2 Nov 2026). Kept here as a record; safe to run again.
--
-- A share link lets someone without an account (for example your renal unit) view your
-- completed sessions for one date range, until the link expires or you stop it.

create table if not exists public.shares (
  token          text primary key check (length(token) >= 24),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date_from      date not null,
  date_to        date not null check (date_to >= date_from),
  label          text not null default '',
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked        boolean not null default false,
  views          integer not null default 0,
  last_viewed_at timestamptz
);
create index if not exists shares_user_idx on public.shares (user_id, created_at desc);

alter table public.shares enable row level security;
drop policy if exists "own shares: read" on public.shares;
drop policy if exists "own shares: add" on public.shares;
drop policy if exists "own shares: change" on public.shares;
create policy "own shares: read" on public.shares for select to authenticated using (user_id = (select auth.uid()));
create policy "own shares: add" on public.shares for insert to authenticated with check (user_id = (select auth.uid()) and expires_at <= now() + interval '366 days');
create policy "own shares: change" on public.shares for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.shares from anon;
grant select, insert, update on public.shares to authenticated;

-- Opening a link calls this. It only ever returns the sessions inside that link's dates,
-- and nothing at all once the link has expired or been stopped.
create or replace function public.get_share(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.shares;
  st jsonb;
  result jsonb;
begin
  select * into s from public.shares
   where token = p_token and not revoked and expires_at > now();
  if not found then return null; end if;

  update public.shares set views = views + 1, last_viewed_at = now() where token = p_token;

  select data into st from public.records
   where user_id = s.user_id and kind = 'settings' and id = 'settings' and not deleted;

  select jsonb_build_object(
    'from', s.date_from, 'to', s.date_to, 'label', s.label,
    'created_at', s.created_at, 'expires_at', s.expires_at,
    'name', coalesce(st->>'name', ''),
    'hidden', coalesce(st->'hidden', '{}'::jsonb),
    'sessions', coalesce(jsonb_agg(r.data order by r.data->>'date'), '[]'::jsonb)
  ) into result
  from public.records r
  where r.user_id = s.user_id and r.kind = 'session' and not r.deleted
    and r.data->>'status' = 'complete'
    and (r.data->>'date')::date between s.date_from and s.date_to;

  return result;
end;
$$;

revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
