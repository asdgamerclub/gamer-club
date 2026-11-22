-- Gamer Club - migrazione v6: richiesta online con email verificata
-- Prerequisito: eseguire prima migrazione_v2_iscrizioni.sql.
-- Solo domande PENDING. Nessun nuovo socio viene approvato automaticamente.
begin;
create or replace function public.gc_online_request_membership(
 p_first_name text,p_last_name text,p_birth_date date,
 p_residence text default null,p_phone text default null
)
returns table(member_number bigint, request_status text)
language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid();
 v_email text;
 v_confirmed timestamptz;
 v_number bigint;
begin
 if v_uid is null then raise exception 'Verifica la tua email prima di inviare la richiesta'; end if;
 select lower(trim(u.email)),u.email_confirmed_at
 into v_email,v_confirmed from auth.users u where u.id=v_uid;
 if v_email is null or v_confirmed is null then raise exception 'Email non verificata'; end if;
 if length(trim(coalesce(p_first_name,''))) not between 1 and 80
 or length(trim(coalesce(p_last_name,''))) not between 1 and 80
 then raise exception 'Nome o cognome non valido'; end if;
 if p_birth_date is null or p_birth_date<date '1900-01-01'
 or p_birth_date>current_date then raise exception 'Data di nascita non valida'; end if;
 if length(coalesce(p_residence,''))>160 or length(coalesce(p_phone,''))>24
 then raise exception 'Campo troppo lungo'; end if;
 -- Impedisce le domande doppie, anche se richieste contemporaneamente.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_email));
 if exists(select 1 from public.gc_members where auth_user_id=v_uid
   or lower(trim(email))=v_email)
 then raise exception 'Esiste gia una domanda o tessera associata a questa email'; end if;
 insert into public.gc_members
 (auth_user_id,first_name,last_name,birth_date,residence,phone,email,status,privacy_notice_version)
 values(v_uid,trim(p_first_name),trim(p_last_name),p_birth_date,
  nullif(trim(coalesce(p_residence,'')),''),
  nullif(trim(coalesce(p_phone,'')),''),
  v_email,'pending','WEB_REQUEST_V1')
 returning number into v_number;
 return query select v_number,'pending'::text;
end;
$$;

create or replace function public.gc_online_request_status()
returns table(member_number bigint,request_status text)
language sql stable security definer set search_path=''
as $$
 select m.number,m.status from public.gc_members m
 where m.auth_user_id=auth.uid()
 order by m.created_at desc limit 1;
$$;

revoke all on function public.gc_online_request_membership(text,text,date,text,text) from public;
revoke all on function public.gc_online_request_status() from public;
grant execute on function public.gc_online_request_membership(text,text,date,text,text),
 public.gc_online_request_status() to authenticated;
commit;
