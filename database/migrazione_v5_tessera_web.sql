-- Gamer Club Card: tessera web personale + richieste di partite.
-- Eseguire su Supabase SQL Editor (una sola volta).
-- Il socio puo' consultare la sua tessera e INVIARE richieste.
-- SOLO l'operatore puo' approvare e registrare partite nel conto loyalty.
begin;

create table if not exists public.gc_point_requests (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.gc_members(id) on delete cascade,
 requester_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz
);
create index if not exists gc_point_requests_pending_idx on public.gc_point_requests(status,created_at);
create index if not exists gc_point_requests_member_idx on public.gc_point_requests(member_id,created_at desc);
alter table public.gc_point_requests enable row level security;
revoke all on public.gc_point_requests from anon,authenticated;

-- Associa un account autenticato solo dopo verifica email, se il socio esiste gia',
-- e l'email e' stata registrata e verificata dall'operatore.
create or replace function public.gc_claim_my_card()
returns text language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz; v_count integer;
begin
 if v_uid is null then raise exception 'Accedi con email prima di continuare'; end if;
 select lower(trim(u.email)), u.email_confirmed_at into v_email, v_confirmed
 from auth.users u where u.id=v_uid;
 if v_confirmed is null then raise exception 'Email non ancora verificata'; end if;
 if v_email is null or v_email='' then raise exception 'Email non disponibile'; end if;
 if exists(select 1 from public.gc_members where auth_user_id=v_uid) then return 'already_linked'; end if;
 -- Per evitare associazioni ambigue non autorizzare email duplicate.
 select count(*) into v_count from public.gc_members m where lower(trim(m.email))=v_email;
 if v_count<>1 then raise exception 'Nessuna tessera univoca associata a questa email. Rivolgiti alla cassa'; end if;
 update public.gc_members m set auth_user_id=v_uid
 where lower(trim(m.email))=v_email and m.auth_user_id is null and m.status='active';
 if not found then raise exception 'Tessera non attiva o gia collegata ad altro account'; end if;
 return 'linked';
end;
$$;

create or replace function public.gc_my_card()
returns table(member_id uuid,member_number bigint,first_name text,last_name text,qr_token uuid,
 status text,joined_at timestamptz,valid_until date,
 progress integer,rewards_available integer,rewards_redeemed integer,tier text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
 return query
 select m.id,m.number,m.first_name,m.last_name,m.qr_token,
 m.status,m.joined_at,m.valid_until,
 (count(a.id) filter(where a.event_type='paid_game')%10)::integer,
 ((count(a.id) filter(where a.event_type='paid_game')/10)
  -count(a.id) filter(where a.event_type='reward_redeemed'))::integer,
 (count(a.id) filter(where a.event_type='reward_redeemed'))::integer,
 case when exists(select 1 from public.gc_gold_members g where g.member_id=m.id) then 'gold'
 when count(a.id) filter(where a.event_type='reward_redeemed')>10 then 'silver'
 else 'blue' end
 from public.gc_members m
 left join public.gc_activity a on a.member_id=m.id
 where m.auth_user_id=auth.uid() and m.status='active'
 group by m.id;
end;
$$;

create or replace function public.gc_request_paid_game()
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_member uuid; v_id uuid; v_pending integer; v_today integer;
begin
 if v_uid is null then raise exception 'Effettua il login'; end if;
 select m.id into v_member from public.gc_members m
 where m.auth_user_id=v_uid and m.status='active' for update;
 if v_member is null then raise exception 'Nessuna tessera attiva collegata'; end if;
 select count(*) into v_pending from public.gc_point_requests
 where member_id=v_member and status='pending';
 if v_pending>=5 then raise exception 'Hai gia cinque richieste in attesa'; end if;
 select count(*) into v_today from public.gc_point_requests
 where member_id=v_member and created_at>=now()-interval '24 hours';
 if v_today>=10 then raise exception 'Limite di richieste giornaliere raggiunto'; end if;
 insert into public.gc_point_requests(member_id,requester_id)
 values(v_member,v_uid) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.gc_my_point_requests()
returns table(request_id uuid,status text,created_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select r.id,r.status,r.created_at from public.gc_point_requests r
 where r.requester_id=auth.uid() order by r.created_at desc limit 15;
$$;

create or replace function public.gc_operator_pending_points(p_limit integer default 40)
returns table(request_id uuid,member_id uuid,member_number bigint,first_name text,last_name text,created_at timestamptz,qr_token uuid)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 return query select r.id,m.id,m.number,m.first_name,m.last_name,r.created_at,m.qr_token
 from public.gc_point_requests r join public.gc_members m on m.id=r.member_id
 where r.status='pending'
 order by r.created_at asc limit greatest(1,least(coalesce(p_limit,40),100));
end;
$$;

create or replace function public.gc_operator_review_point(p_request uuid,p_approve boolean)
returns text language plpgsql security definer set search_path=''
as $$
declare v_member uuid; v_status text; v_owner uuid;
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 select r.member_id,r.status into v_member,v_status
 from public.gc_point_requests r where r.id=p_request for update;
 if v_member is null then raise exception 'Richiesta non trovata'; end if;
 if v_status<>'pending' then raise exception 'Richiesta gia gestita'; end if;
 select m.auth_user_id into v_owner from public.gc_members m
 where m.id=v_member and m.status='active' for update;
 if v_owner is null then raise exception 'Tessera inattiva o scollegata'; end if;
 update public.gc_point_requests set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=now() where id=p_request;
 if p_approve then
   insert into public.gc_activity(member_id,event_type,operator_id)
   values(v_member,'paid_game',auth.uid());
 end if;
 return case when p_approve then 'approved' else 'rejected' end;
end;
$$;

-- L'email viene assegnata o corretta esclusivamente da un operatore.
create or replace function public.gc_operator_set_member_email(p_member uuid,p_email text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_email text;
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 v_email:=lower(trim(coalesce(p_email,'')));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Email non valida'; end if;
 if exists(select 1 from public.gc_members where lower(trim(email))=v_email and id<>p_member)
 then raise exception 'Email gia associata a un altro socio'; end if;
 update public.gc_members set email=v_email where id=p_member;
 if not found then raise exception 'Socio non trovato';end if;
 return 'updated';
end;
$$;

revoke all on function public.gc_claim_my_card() from public;
revoke all on function public.gc_my_card() from public;
revoke all on function public.gc_request_paid_game() from public;
revoke all on function public.gc_my_point_requests() from public;
revoke all on function public.gc_operator_pending_points(integer) from public;
revoke all on function public.gc_operator_review_point(uuid,boolean) from public;
revoke all on function public.gc_operator_set_member_email(uuid,text) from public;
grant execute on function public.gc_claim_my_card(),public.gc_my_card(),
public.gc_request_paid_game(),public.gc_my_point_requests(),
public.gc_operator_pending_points(integer),
public.gc_operator_review_point(uuid,boolean),public.gc_operator_set_member_email(uuid,text)
to authenticated;
commit;
