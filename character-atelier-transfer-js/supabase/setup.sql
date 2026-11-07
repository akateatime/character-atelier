-- Run once in your own Supabase project's SQL Editor.
begin;

create table if not exists public.atelier_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.atelier_owners enable row level security;
revoke all on public.atelier_owners from anon, authenticated;

create or replace function public.is_atelier_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.atelier_owners where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_atelier_owner() from public;
grant execute on function public.is_atelier_owner() to anon, authenticated;

create table if not exists public.atelier_document (
  id integer primary key check (id = 1),
  payload jsonb not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.atelier_document enable row level security;
revoke all on public.atelier_document from anon, authenticated;
grant select on public.atelier_document to anon, authenticated;
drop policy if exists "Published archive is public" on public.atelier_document;
create policy "Published archive is public" on public.atelier_document
  for select to anon, authenticated using (true);

create or replace function public.publish_atelier(document jsonb, expected_version integer)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  current_version integer;
begin
  if not public.is_atelier_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if expected_version is null or expected_version < 0
    or document is null
    or (document->>'schemaVersion') is distinct from '1'
    or jsonb_typeof(document->'locales') is distinct from 'object'
    or not (document->'locales' ?& array['zh-Hant', 'en', 'ja', 'ko'])
    or octet_length(document::text) > 4000000 then
    raise exception 'Invalid document or document exceeds 4 MB';
  end if;
  perform pg_advisory_xact_lock(832419504);
  select version into current_version from public.atelier_document where id = 1;
  current_version := coalesce(current_version, 0);
  if current_version <> expected_version then
    raise exception '版本衝突 / Version conflict. Download your draft, then reload the latest published version.';
  end if;
  insert into public.atelier_document (id, payload, version, updated_at)
    values (1, document, current_version + 1, now())
    on conflict (id) do update
      set payload = excluded.payload, version = excluded.version, updated_at = excluded.updated_at;
  return current_version + 1;
end;
$$;
revoke all on function public.publish_atelier(jsonb, integer) from public;
grant execute on function public.publish_atelier(jsonb, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'atelier-images', 'atelier-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners upload archive images" on storage.objects;
create policy "Owners upload archive images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'atelier-images'
    and public.is_atelier_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Only upload is granted here. Delete unused images manually in Storage after
-- checking published content and backups. Removing an entry does not delete files.
commit;

-- After creating your owner account in Authentication > Users, copy its UID.
-- Replace the placeholder below, select that statement, and run it separately:
-- insert into public.atelier_owners (user_id) values ('YOUR-USER-UUID');
