-- Configurare in Supabase Vault i segreti gc_guest_wifi_ssid e gc_guest_wifi_password.
begin;
create extension if not exists supabase_vault with schema vault;

create or replace function public.gc_guest_wifi_access()
returns table(ssid text, password text)
language sql stable security definer set search_path = ''
as $$
  select network.decrypted_secret, credential.decrypted_secret
  from vault.decrypted_secrets network
  cross join vault.decrypted_secrets credential
  where network.name = 'gc_guest_wifi_ssid'
    and credential.name = 'gc_guest_wifi_password'
    and length(network.decrypted_secret) > 0
    and length(credential.decrypted_secret) > 0
    and exists (
      select 1
      from public.gc_members m
      where m.auth_user_id = auth.uid()
        and m.status in ('pending', 'active')
    );
$$;

revoke all on function public.gc_guest_wifi_access() from public, anon;
grant execute on function public.gc_guest_wifi_access() to authenticated;
commit;
