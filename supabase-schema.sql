-- Run this script in the Supabase SQL Editor for your project.
create extension if not exists pgcrypto;

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null default 'US' check (market in ('US','TW')),
  symbol text not null check (char_length(symbol) between 1 and 12),
  company text not null check (char_length(company) between 1 and 80),
  shares numeric(18,6) not null default 0 check (shares >= 0),
  average_cost numeric(18,6) not null default 0 check (average_cost >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null default 'US' check (market in ('US','TW')),
  symbol text not null check (char_length(symbol) between 1 and 12),
  company text not null check (char_length(company) between 1 and 80),
  theme text not null default '個人觀察',
  created_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create table if not exists public.daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null default (now() at time zone 'Asia/Taipei')::date,
  title text not null default '每日投資簡報',
  summary text not null default '',
  market_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

alter table public.holdings enable row level security;
alter table public.watchlist enable row level security;
alter table public.daily_briefs enable row level security;
alter table public.attachments enable row level security;

-- New Supabase projects no longer expose newly created public tables to the
-- Data API by default. Grant table operations to authenticated users; RLS
-- below still limits every operation to rows owned by the current user.
grant select, insert, update, delete on public.holdings to authenticated;
grant select, insert, update, delete on public.watchlist to authenticated;
grant select, insert, update, delete on public.daily_briefs to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;

drop policy if exists "Users manage their own holdings" on public.holdings;
create policy "Users manage their own holdings" on public.holdings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own watchlist" on public.watchlist;
create policy "Users manage their own watchlist" on public.watchlist for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own daily briefs" on public.daily_briefs;
create policy "Users manage their own daily briefs" on public.daily_briefs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own attachments" on public.attachments;
create policy "Users manage their own attachments" on public.attachments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-files', 'research-files', false, 15728640,
  array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "Users upload files to their own folder" on storage.objects;
create policy "Users upload files to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users read files from their own folder" on storage.objects;
create policy "Users read files from their own folder" on storage.objects for select to authenticated
  using (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete files from their own folder" on storage.objects;
create policy "Users delete files from their own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'research-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The project's automatic-RLS event trigger has a SECURITY DEFINER function.
-- It is only needed by Postgres event triggers, not through the Data API.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
