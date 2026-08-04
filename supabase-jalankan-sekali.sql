-- 🧾 L3 FONDASI KREDIT — JALANKAN SEKALI di Supabase → SQL Editor → New query → tempel → Run.
-- Aman dijalankan berulang (if not exists). Tabel ini TERTUTUP untuk user biasa:
-- RLS aktif tanpa policy = hanya service role (server kita) yang bisa tulis/baca.

create table if not exists public.credit_ledger (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  fitur       text not null,           -- teks | gambar | suara-tts | video | musik | lainnya
  model       text,                    -- nama model yang dipakai (kalau ada)
  endpoint    text,                    -- endpoint gateway/provider (disensor, tanpa kunci)
  penyedia    text,                    -- hcnsec | kie | apiframe | ...
  ok          boolean not null default true,
  ms          integer,                 -- durasi panggilan (mendetik)
  err         text,                    -- potongan pesan error (disensor)
  user_id     uuid                     -- disediakan utk Fase D (multi-user); L3 belum mengisinya
);

create index if not exists credit_ledger_created_idx on public.credit_ledger (created_at desc);
create index if not exists credit_ledger_fitur_idx   on public.credit_ledger (fitur);

alter table public.credit_ledger enable row level security;
-- sengaja TANPA policy: anon/auth tidak bisa apa-apa; server pakai SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
