-- ASD Gamer Club - Passo 2: QR stabile, numero socio e livelli tessera
-- Esegui sul progetto Supabase gamer-club-card tramite SQL Editor.
-- Non modifica i codici QR, i numeri tessera, i punti o i premi esistenti.
-- BLU: tutti i soci salvo idoneita Argento/Oro
-- ARGENTO: dal 11esimo premio EFFETTIVAMENTE riscattato
-- ORO: massimo 5 soci collaboratori assegnati esplicitamente dal titolare

begin;

create table if not exists public.gc_gold_members (
  member_id uuid primary key references public.gc_members(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now()
);
alter table public.gc_gold_members enable row level security;
revoke all on public.gc_gold_members from anon,authenticated;

-- L'operatore può leggere il livello di una tessera senza divulgare la lista dei collaboratori.
create or replace function public.gc_card_tier(p_member uuid)
returns text
language plpgsql stable security definer set search_path=''
as $$
declare
  v_redeemed bigint;
begin
  if not public.gc_is_operator() then
    raise exception 'Operatore non autorizzato';
  end if;
  if not exists(select 1 from public.gc_members m where m.id=p_member) then
    raise exception 'Socio inesistente';
  end if;
  if exists(select 1 from public.gc_gold_members g where g.member_id=p_member) then
    return 'gold';
  end if;
  select count(*) into v_redeemed from public.gc_activity a
  where a.member_id=p_member and a.event_type='reward_redeemed';
  if v_redeemed>10 then return 'silver'; end if;
  return 'blue';
end;
$$;

-- La promozione Oro deve essere volontaria e verificata dall'operatore.
-- Blocco transazionale per impedire oltre cinque assegnazioni simultanee.
create or replace function public.gc_operator_set_gold(p_member uuid,p_enable boolean)
returns integer
language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  if not public.gc_is_operator() then
    raise exception 'Operatore non autorizzato';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(703521,5);
  if not exists(select 1 from public.gc_members m where m.id=p_member and m.status='active') then
    raise exception 'La tessera deve essere attiva';
  end if;
  if p_enable then
    select count(*) into v_count from public.gc_gold_members;
    if v_count>=5 and not exists(select 1 from public.gc_gold_members where member_id=p_member) then
      raise exception 'Sono gia presenti cinque tessere Oro';
    end if;
    insert into public.gc_gold_members(member_id,assigned_by)
    values(p_member,auth.uid()) on conflict(member_id) do nothing;
  else
    delete from public.gc_gold_members where member_id=p_member;
  end if;
  select count(*)::integer into v_count from public.gc_gold_members;
  return v_count;
end;
$$;

revoke all on function public.gc_card_tier(uuid) from public;
revoke all on function public.gc_operator_set_gold(uuid,boolean) from public;
grant execute on function public.gc_card_tier(uuid),
  public.gc_operator_set_gold(uuid,boolean) to authenticated;
commit;

-- Verifica facoltativa operator-only: select public.gc_card_tier('UUID_SOCIO');
