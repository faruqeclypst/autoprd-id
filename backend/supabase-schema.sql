-- AutoPRD.id — skema Supabase Postgres
-- Jalankan sekali di Supabase Dashboard → SQL Editor → New query → Run.

create table if not exists prds (
  id          text primary key,
  owner_id    text not null,          -- supabase auth.users.id
  title       text not null,
  idea        text,
  markdown    text,
  specs       text not null default '',
  flowchart   text not null default '',
  suggestions jsonb not null default '[]',
  agentsmd    text not null default '',
  designmd    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prds_owner_idx on prds (owner_id, created_at desc);

-- Server memakai service_role key (melewati RLS). Aktifkan RLS agar akses
-- langsung via anon key tidak bisa membaca data orang lain.
alter table prds enable row level security;

drop policy if exists "deny anon" on prds;
create policy "deny anon" on prds for all to anon using (false) with check (false);
