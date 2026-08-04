-- 👑 PANEL BOS (L3.5) — JALANKAN SEKALI di Supabase → SQL Editor → New query → tempel → Run.
-- Tabel tombol kendali pemilik. TERTUTUP total (RLS tanpa policy) — hanya service role server kita yang baca/tulis.

create table if not exists public.app_settings (
  kunci       text primary key,
  nilai       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- baris awal panel bos: semua fitur NYALA, tanpa batas, tanpa pengumuman
insert into public.app_settings (kunci, nilai)
values ('panel_bos', '{"mati": [], "batas": {}, "pengumuman": ""}'::jsonb)
on conflict (kunci) do nothing;
