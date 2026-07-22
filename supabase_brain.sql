-- 🧠🔒 BRANKAS OTAK VERVE (v13.1)
-- Jalankan SEKALI di: Supabase Dashboard → SQL Editor → New query → paste → RUN
-- Fungsinya: memori VERVE Brain (riwayat judul + laporan CTR/performa) disalin ke sini,
-- supaya tidak hilang saat ganti HP / clear cache browser.

create table if not exists public.verve_brain (
  id text primary key,               -- selalu 'main' (alat personal, 1 otak)
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Alat personal tanpa login: izinkan baca/tulis (kalau nanti ada auth, perketat di sini)
alter table public.verve_brain enable row level security;

create policy "brain read"  on public.verve_brain for select using (true);
create policy "brain write" on public.verve_brain for insert with check (true);
create policy "brain upd"   on public.verve_brain for update using (true);
