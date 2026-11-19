-- A.S.D. Gamer Club - Galleria fotografica con moderazione
-- Eseguire una sola volta nel Supabase SQL Editor PRIMA di abilitare il caricamento online.
-- La galleria richiede Supabase Auth email OTP e una chiave PUBBLICA nel sito.
-- Foto in bucket PRIVATO; utenti anonimi possono ottenere URL temporanei SOLO per foto approvate.
begin;

create extension if not exists pgcrypto;

create table if not exists public.gc_gallery (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 160),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index if not exists gc_gallery_review_idx
on public.gc_gallery(status,created_at desc);
create index if not exists gc_gallery_submitter_idx
on public.gc_gallery(submitted_by,created_at desc);

alter table public.gc_gallery enable row level security;
drop policy if exists "gallery public approved" on public.gc_gallery;
create policy "gallery public approved" on public.gc_gallery
for select to anon, authenticated using (status='approved');
drop policy if exists "gallery submitter sees own" on public.gc_gallery;
create policy "gallery submitter sees own" on public.gc_gallery
for select to authenticated using (submitted_by=(select auth.uid()));
drop policy if exists "gallery operator sees all" on public.gc_gallery;
create policy "gallery operator sees all" on public.gc_gallery
for select to authenticated using (public.gc_is_operator());

revoke all on public.gc_gallery from anon, authenticated;
grant select on public.gc_gallery to anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('gc-gallery','gc-gallery',false,4194304,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=false,file_size_limit=4194304,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "gc gallery upload authorized" on storage.objects;
create policy "gc gallery upload authorized"
on storage.objects for insert to authenticated
with check (
 bucket_id='gc-gallery'
 and (auth.jwt() ->> 'email') is not null
 and (storage.foldername(name))[1] = (select auth.uid())::text
 and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
);

drop policy if exists "gc gallery view approved or owner" on storage.objects;
create policy "gc gallery view approved or owner"
on storage.objects for select to anon,authenticated
using (
 bucket_id='gc-gallery'
 and (
   exists(select 1 from public.gc_gallery g
     where g.storage_path=storage.objects.name and g.status='approved')
   or ((select auth.uid()) is not null
       and (storage.foldername(name))[1]=(select auth.uid())::text)
   or public.gc_is_operator()
 )
);

drop policy if exists "gc gallery operator delete" on storage.objects;
create policy "gc gallery operator delete"
on storage.objects for delete to authenticated
using (bucket_id='gc-gallery' and public.gc_is_operator());

create or replace function public.gc_gallery_submit(
 p_storage_path text,p_caption text,p_authorized boolean
)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid();
 v_id uuid;
begin
 if v_uid is null or coalesce(auth.jwt()->>'email','')=''
 then raise exception 'Accedi con un indirizzo email verificato'; end if;
 if p_authorized is distinct from true then
   raise exception 'È necessaria la dichiarazione di autorizzazione alla pubblicazione'; end if;
 if coalesce(p_storage_path,'') !~ ('^'||v_uid::text||'/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
  raise exception 'Percorso non valido'; end if;
 if char_length(coalesce(p_caption,''))>160 then
  raise exception 'Didascalia troppo lunga'; end if;
 if not exists (
  select 1 from storage.objects o
  where o.bucket_id='gc-gallery' and o.name=p_storage_path
  and o.owner_id=v_uid::text
 ) then
  raise exception 'Foto non trovata o non autorizzata'; end if;
 if (select count(*) from public.gc_gallery g
   where g.submitted_by=v_uid and g.created_at>now()-interval '24 hours')>=5 then
  raise exception 'Limite di cinque foto ogni 24 ore raggiunto'; end if;
 if exists(select 1 from public.gc_gallery g where g.submitted_by=v_uid
  and g.created_at>now()-interval '1 minute') then
  raise exception 'Attendi almeno un minuto tra le richieste'; end if;
 insert into public.gc_gallery (storage_path,caption,submitted_by)
 values (p_storage_path,trim(coalesce(p_caption,'')),v_uid)
 returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.gc_gallery_review(p_photo uuid,p_status text)
returns text language plpgsql security definer set search_path=''
as $$
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 if p_status not in ('approved','rejected') then raise exception 'Stato non valido'; end if;
 update public.gc_gallery set status=p_status,reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_photo and status='pending';
 if not found then raise exception 'Foto non trovata o già esaminata'; end if;
 return p_status;
end;
$$;

create or replace function public.gc_gallery_pending()
returns table(photo_id uuid,storage_path text,caption text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 return query select g.id,g.storage_path,g.caption,g.created_at
 from public.gc_gallery g where g.status='pending'
 order by g.created_at limit 80;
end;
$$;

revoke all on function public.gc_gallery_submit(text,text,boolean) from public;
revoke all on function public.gc_gallery_review(uuid,text) from public;
revoke all on function public.gc_gallery_pending() from public;
-- Questa funzione rivela solo un booleano: ad anon restituisce false.
grant execute on function public.gc_is_operator() to anon;
grant execute on function public.gc_gallery_submit(text,text,boolean),
 public.gc_gallery_review(uuid,text),public.gc_gallery_pending() to authenticated;

commit;
