-- Gamer Club Card - migrazione v2: gestione richieste dal pannello cassa
-- Da eseguire UNA VOLTA in Supabase SQL Editor su progetto corretto.
-- L'accesso pubblico alla raccolta dati resta disabilitato.
-- Prima di inserire persone reali: informativa privacy, termini associativi e procedura minori.

begin;

alter table public.gc_members alter column auth_user_id drop not null;
alter table public.gc_members add column if not exists birth_date date;
alter table public.gc_members add column if not exists residence text;
alter table public.gc_members add column if not exists phone text;
alter table public.gc_members add column if not exists email text;
alter table public.gc_members add column if not exists guardian_verified boolean not null default false;
alter table public.gc_members add column if not exists reviewed_at timestamptz;
alter table public.gc_members add column if not exists reviewed_by uuid references auth.users(id);

-- La vecchia RPC di registrazione non richiede la data di nascita:
-- disabilitarla finché non sarà attivo il nuovo flusso pubblico verificato.
revoke execute on function public.gc_register(text,text,text) from authenticated;
revoke execute on function public.gc_register(text,text,text) from anon;
-- La funzione era gia stata revocata da PUBLIC nello schema iniziale.

create or replace function public.gc_operator_create_member(
 p_first_name text, p_last_name text, p_birth_date date,
 p_residence text default null, p_phone text default null, p_email text default null
)
returns table(member_id uuid, member_number bigint, qr_token uuid, status text)
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 if length(trim(coalesce(p_first_name,''))) not between 1 and 80
 or length(trim(coalesce(p_last_name,''))) not between 1 and 80
 then raise exception 'Nome e cognome non validi'; end if;
 if p_birth_date is null or p_birth_date < date '1900-01-01'
 or p_birth_date > current_date then raise exception 'Data di nascita non valida'; end if;
 if length(coalesce(p_residence,''))>160
 or length(coalesce(p_phone,''))>24
 or length(coalesce(p_email,''))>254
 then raise exception 'Campo facoltativo troppo lungo'; end if;
 if nullif(trim(coalesce(p_email,'')),'') is not null
 and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Email non valida'; end if;
 insert into public.gc_members
  (first_name,last_name,birth_date,residence,phone,email,status,privacy_notice_version)
 values
  (trim(p_first_name),trim(p_last_name),p_birth_date,nullif(trim(coalesce(p_residence,'')),''),
   nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_email,'')),''),'pending','OPERATOR_INTAKE_PENDING')
 returning id into v_id;
 return query select m.id,m.number,m.qr_token,m.status from public.gc_members m where m.id=v_id;
end;
$$;

create or replace function public.gc_operator_list_members(p_limit integer default 40)
returns table(member_id uuid, member_number bigint, first_name text, last_name text,
 birth_date date, status text, qr_token uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 return query select m.id,m.number,m.first_name,m.last_name,m.birth_date,m.status,m.qr_token,m.created_at
 from public.gc_members m
 order by (case when m.status='pending' then 0 else 1 end),m.created_at desc
 limit greatest(1,least(coalesce(p_limit,40),100));
end;
$$;

create or replace function public.gc_operator_review_member(
 p_member uuid,p_status text,p_guardian_verified boolean default false
)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_birth date; v_current text;
begin
 if not public.gc_is_operator() then raise exception 'Operatore non autorizzato'; end if;
 if p_status not in ('active','suspended','expired') then raise exception 'Stato non valido';end if;
 select m.birth_date,m.status into v_birth,v_current
 from public.gc_members m where m.id=p_member for update;
 if not found then raise exception 'Socio non trovato'; end if;
 if p_status='active' then
  if v_birth is null then
    raise exception 'Data di nascita mancante: integrare e verificare la richiesta';
  end if;
  if v_birth > (current_date - interval '18 years')::date
     and not coalesce(p_guardian_verified,false) then
    raise exception 'Minorenne: verifica del tutore richiesta';
  end if;
 end if;
 update public.gc_members
 set status=p_status,guardian_verified=case when p_status='active'
   then (coalesce(p_guardian_verified,false) and v_birth>(current_date-interval '18 years')::date)
   else guardian_verified end,
 reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_member;
 return p_status;
end;
$$;

revoke all on function public.gc_operator_create_member(text,text,date,text,text,text) from public;
revoke all on function public.gc_operator_list_members(integer) from public;
revoke all on function public.gc_operator_review_member(uuid,text,boolean) from public;
grant execute on function public.gc_operator_create_member(text,text,date,text,text,text),
 public.gc_operator_list_members(integer),public.gc_operator_review_member(uuid,text,boolean)
to authenticated;

commit;

-- Nota: gli account non autorizzati non possono invocare con successo le RPC,
-- anche se la funzione risulta raggiungibile tramite l'API pubblica.
-- Verificare l'informativa privacy, retention e le procedure associative prima del go-live.
