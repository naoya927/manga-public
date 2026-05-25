create extension if not exists pgcrypto;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.manga_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  record_type text not null default 'record',
  title text not null,
  title_reading text not null default '',
  recorded_at timestamptz not null,
  quote text not null default '',
  quote_speaker text not null default '',
  thoughts text not null default '',
  tag text not null default '',
  summary text not null default '',
  favorite boolean not null default false,
  cover_image_path text not null default '',
  cover_image_url text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.manga_records
  add column if not exists record_type text not null default 'record';

alter table public.manga_records
  add column if not exists quote_speaker text not null default '';

alter table public.manga_records
  add column if not exists currently_reading boolean not null default false;

create unique index if not exists manga_records_user_title_recorded_at_key
  on public.manga_records (user_id, title, recorded_at);

create index if not exists manga_records_user_type_recorded_at_idx
  on public.manga_records (user_id, record_type, recorded_at desc);

create table if not exists public.manga_record_gallery_images (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.manga_records (id) on delete cascade,
  position integer not null default 0,
  storage_path text not null,
  public_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists manga_record_gallery_images_record_position_key
  on public.manga_record_gallery_images (record_id, position);

create table if not exists public.reading_logs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reading_date date not null,
  title text not null,
  volume_start text not null default '',
  volume_end text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists reading_logs_user_date_idx
  on public.reading_logs (user_id, reading_date desc);

drop trigger if exists manga_records_set_updated_at on public.manga_records;
create trigger manga_records_set_updated_at
before update on public.manga_records
for each row
execute function public.handle_updated_at();

drop trigger if exists reading_logs_set_updated_at on public.reading_logs;
create trigger reading_logs_set_updated_at
before update on public.reading_logs
for each row
execute function public.handle_updated_at();

alter table public.manga_records enable row level security;
alter table public.manga_record_gallery_images enable row level security;
alter table public.reading_logs enable row level security;

drop policy if exists "manga_records_select_own" on public.manga_records;
create policy "manga_records_select_own"
on public.manga_records
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "manga_records_insert_own" on public.manga_records;
create policy "manga_records_insert_own"
on public.manga_records
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "manga_records_update_own" on public.manga_records;
create policy "manga_records_update_own"
on public.manga_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "manga_records_delete_own" on public.manga_records;
create policy "manga_records_delete_own"
on public.manga_records
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "gallery_images_select_own" on public.manga_record_gallery_images;
create policy "gallery_images_select_own"
on public.manga_record_gallery_images
for select
to authenticated
using (
  exists (
    select 1
    from public.manga_records
    where public.manga_records.id = record_id
      and public.manga_records.user_id = auth.uid()
  )
);

drop policy if exists "gallery_images_insert_own" on public.manga_record_gallery_images;
create policy "gallery_images_insert_own"
on public.manga_record_gallery_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.manga_records
    where public.manga_records.id = record_id
      and public.manga_records.user_id = auth.uid()
  )
);

drop policy if exists "gallery_images_update_own" on public.manga_record_gallery_images;
create policy "gallery_images_update_own"
on public.manga_record_gallery_images
for update
to authenticated
using (
  exists (
    select 1
    from public.manga_records
    where public.manga_records.id = record_id
      and public.manga_records.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.manga_records
    where public.manga_records.id = record_id
      and public.manga_records.user_id = auth.uid()
  )
);

drop policy if exists "gallery_images_delete_own" on public.manga_record_gallery_images;
create policy "gallery_images_delete_own"
on public.manga_record_gallery_images
for delete
to authenticated
using (
  exists (
    select 1
    from public.manga_records
    where public.manga_records.id = record_id
      and public.manga_records.user_id = auth.uid()
  )
);

drop policy if exists "reading_logs_select_own" on public.reading_logs;
create policy "reading_logs_select_own"
on public.reading_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "reading_logs_insert_own" on public.reading_logs;
create policy "reading_logs_insert_own"
on public.reading_logs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "reading_logs_update_own" on public.reading_logs;
create policy "reading_logs_update_own"
on public.reading_logs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "reading_logs_delete_own" on public.reading_logs;
create policy "reading_logs_delete_own"
on public.reading_logs
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manga-images',
  'manga-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "manga_images_public_read" on storage.objects;
create policy "manga_images_public_read"
on storage.objects
for select
to public
using (bucket_id = 'manga-images');

drop policy if exists "manga_images_insert_own_folder" on storage.objects;
create policy "manga_images_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'manga-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "manga_images_update_own_folder" on storage.objects;
create policy "manga_images_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'manga-images'
  and owner_id::text = auth.uid()::text
)
with check (
  bucket_id = 'manga-images'
  and owner_id::text = auth.uid()::text
);

drop policy if exists "manga_images_delete_own_folder" on storage.objects;
create policy "manga_images_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'manga-images'
  and owner_id::text = auth.uid()::text
);
