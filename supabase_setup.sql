-- Jalankan ini di Supabase SQL Editor untuk setup database
-- Project Settings -> Database -> SQL Editor -> New query -> paste -> RUN

-- 1. Tabel projek video
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  niche text,
  keywords jsonb default '[]'::jsonb,
  titles jsonb default '[]'::jsonb,
  slides jsonb default '[]'::jsonb,
  viz_style text default 'bars',
  viz_color text default '#ec4899',
  audio_mode text default 'tts',
  slide_duration numeric default 3,
  tts_text text,
  status text default 'draft',
  video_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. RLS (hanya pemilik yang bisa CRUD)
alter table public.projects enable row level security;

create policy "Users can read own projects" on public.projects
  for select using (auth.uid() = user_id);
create policy "Users can insert own projects" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "Users can update own projects" on public.projects
  for update using (auth.uid() = user_id);
create policy "Users can delete own projects" on public.projects
  for delete using (auth.uid() = user_id);

-- 3. Storage bucket untuk video
insert into storage.buckets (id, name, public) values ('videos','videos',true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('images','images',true)
  on conflict (id) do nothing;

-- Policy storage: user bisa upload ke folder miliknya
create policy "Public read videos" on storage.objects for select
  using (bucket_id = 'videos' or bucket_id = 'images');

create policy "Authenticated upload own" on storage.objects for insert
  to authenticated with check (
    (bucket_id = 'videos' or bucket_id = 'images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Trigger updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_projects_updated on public.projects;
create trigger trg_projects_updated before update on public.projects
  for each row execute function set_updated_at();
