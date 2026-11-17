-- A.S.D. Gamer Club — struttura iniziale Supabase/PostgreSQL
-- ATTENZIONE: non applicare prima di avere informativa privacy, ruoli e test.
-- Non usare mai service_role key nel browser o in questo repository.

create extension if not exists pgcrypto;

create table if not exists public.gc_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create table if not exists public.gc_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  number bigint generated always as identity unique,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  qr_token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','active','suspended','expired')),
  joined_at timestamptz not null default now(),
  valid_until date,
  privacy_notice_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.gc_activity (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.gc_members(id) on delete restrict,
  event_type text not null check(event_type in ('paid_game','reward_redeemed')),
  operator_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists gc_activity_member_idx on public.gc_activity(member_id,created_at desc);
create index if not exists gc_members_qr_idx on public.gc_members(qr_token);

alter table public.gc_operators enable row level security;
alter table public.gc_members enable row level security;
alter table public.gc_activity enable row level security;

create or replace function public.gc_is_operator()
returns boolean language sql stable security definer
set search_path = '' as $$
 select exists (select 1 from public.gc_operators where user_id = (select auth.uid()));
$$;

revoke all on function public.gc_is_operator() from public;
grant execute on function public.gc_is_operator() to authenticated;

drop policy if exists "operators read themselves" on public.gc_operators;
create policy "operators read themselves" on public.gc_operators for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "member reads own record or operator" on public.gc_members;
create policy "member reads own record or operator" on public.gc_members
for select to authenticated using (auth_user_id=(select auth.uid()) or public.gc_is_operator());

drop policy if exists "member requests own registration" on public.gc_members;
create policy "member requests own registration" on public.gc_members
for insert to authenticated with check (
 auth_user_id=(select auth.uid()) and status='pending' and valid_until is null
);

drop policy if exists "member sees own activity or operator" on public.gc_activity;
create policy "member sees own activity or operator" on public.gc_activity
for select to authenticated using (
 public.gc_is_operator() or exists(
   select 1 from public.gc_members m where m.id=member_id and m.auth_user_id=(select auth.uid())
 )
);

-- Impedire che l'utente autenticato scelga qr_token, numero o altri campi sensibili:
-- vietare l'INSERT diretto e usare solo questa RPC.
drop policy if exists "member requests own registration" on public.gc_members;
revoke insert, update, delete on public.gc_members from anon, authenticated;
revoke insert, update, delete on public.gc_activity from anon, authenticated;
revoke all on public.gc_operators from anon, authenticated;
grant select on public.gc_operators, public.gc_members, public.gc_activity to authenticated;

create or replace function public.gc_register(p_first_name text,p_last_name text,p_notice_version text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Accesso richiesto'; end if;
 if length(trim(coalesce(p_first_name,''))) not between 1 and 80
 or length(trim(coalesce(p_last_name,''))) not between 1 and 80
 or length(trim(coalesce(p_notice_version,''))) not between 1 and 40
 then raise exception 'Dati non validi'; end if;
 insert into public.gc_members(auth_user_id,first_name,last_name,privacy_notice_version)
 values(v_uid,trim(p_first_name),trim(p_last_name),trim(p_notice_version))
 returning id into v_id;
 return v_id;
end;
$$;

-- Gli operatori identificano un socio dal QR, non ne ricavano privilegi.
create or replace function public.gc_member_by_qr(p_token uuid)
returns table(member_id uuid, member_number bigint, first_name text, last_name text,
 status text, progress integer, rewards_available integer, rewards_redeemed integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 return query
 select m.id,m.number,m.first_name,m.last_name,m.status,
  (count(a.id) filter (where a.event_type='paid_game') % 10)::integer,
  ((count(a.id) filter (where a.event_type='paid_game') / 10)
   - count(a.id) filter (where a.event_type='reward_redeemed'))::integer,
  (count(a.id) filter (where a.event_type='reward_redeemed'))::integer
 from public.gc_members m left join public.gc_activity a on a.member_id=m.id
 where m.qr_token=p_token group by m.id;
end;
$$;

create or replace function public.gc_record_event(p_member uuid,p_kind text)
returns table(progress integer,rewards_available integer,rewards_redeemed integer)
language plpgsql security definer set search_path = ''
as $$
declare v_paid bigint;v_redeemed bigint;v_status text;
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 if p_kind not in ('paid_game','reward_redeemed') then raise exception 'Evento non valido'; end if;
 -- Lock serializza le operazioni sullo stesso socio, compresi riscatti simultanei.
 select m.status into v_status from public.gc_members m where m.id=p_member for update;
 if not found then raise exception 'Socio inesistente'; end if;
 if v_status<>'active' then raise exception 'Tessera non attiva'; end if;
 select count(*) filter (where event_type='paid_game'),
        count(*) filter (where event_type='reward_redeemed')
 into v_paid,v_redeemed from public.gc_activity where member_id=p_member;
 if p_kind='reward_redeemed' and v_redeemed>=v_paid/10 then
   raise exception 'Nessun premio disponibile';
 end if;
 insert into public.gc_activity(member_id,event_type,operator_id) values(p_member,p_kind,auth.uid());
 if p_kind='paid_game' then v_paid:=v_paid+1; else v_redeemed:=v_redeemed+1;end if;
 return query select (v_paid%10)::integer,(v_paid/10-v_redeemed)::integer,v_redeemed::integer;
end;
$$;

revoke all on function public.gc_register(text,text,text) from public;
revoke all on function public.gc_member_by_qr(uuid) from public;
revoke all on function public.gc_record_event(uuid,text) from public;
grant execute on function public.gc_register(text,text,text),
 public.gc_member_by_qr(uuid),public.gc_record_event(uuid,text) to authenticated;

-- Da eseguire solo dopo aver creato in Supabase Auth l'account del titolare:
-- insert into public.gc_operators(user_id) values('UUID-OPERATORE');
--
-- Per attivare una tessera, procedura riservata e da aggiungere in seguito.
-- La registrazione NON equivale all'ammissione all'associazione.
-- La data validità deve essere gestita con una regola associativa concordata.
