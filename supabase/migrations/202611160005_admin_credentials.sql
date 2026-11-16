-- Run after security_hardening. Never store passwords or reset tokens in application tables.
begin;
create function public.authorize_admin_credentials_change(p_kind text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare subject uuid; counter integer;
begin
  subject := public.require_secure_session(true);
  if p_kind not in ('email','password') or not exists(select 1 from public.profiles where id=subject and role='admin') then
    insert into public.security_events(user_id,action,allowed,session_id) values(subject,'account.credentials_change',false,(auth.jwt()->>'session_id')::uuid);
    return false;
  end if;
  insert into public.security_rate_windows(user_id,operation,window_start,requests) values(subject,'account.credentials_change',now(),1)
  on conflict(user_id,operation) do update set
    requests=case when security_rate_windows.window_start<now()-interval '15 minutes' then 1 else least(security_rate_windows.requests+1,6) end,
    window_start=case when security_rate_windows.window_start<now()-interval '15 minutes' then now() else security_rate_windows.window_start end
  returning requests into counter;
  insert into public.security_events(user_id,action,allowed,session_id) values(subject,'account.change_'||p_kind,counter<=5,(auth.jwt()->>'session_id')::uuid);
  return counter<=5;
end $$;

create function public.revoke_changed_credentials_sessions() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password or old.email is distinct from new.email then
    -- Covers direct Supabase Auth updates and confirmed e-mail changes as well as the app API.
    insert into public.security_sessions(session_id,user_id,revoked_at)
      select s.id,s.user_id,now() from auth.sessions s
      where s.user_id=new.id and exists(select 1 from public.profiles p where p.id=new.id)
    on conflict(session_id) do update set revoked_at=now();
    if exists(select 1 from public.profiles where id=new.id) then
      insert into public.security_events(user_id,action,allowed) values(new.id,'account.credentials_changed',true);
      update public.sync_events set changed_at=clock_timestamp() where id=1;
    end if;
  end if;
  return new;
end $$;
create trigger security_credentials_change after update of encrypted_password,email on auth.users for each row execute function public.revoke_changed_credentials_sessions();
revoke all on function public.authorize_admin_credentials_change(text),public.revoke_changed_credentials_sessions() from public,anon,authenticated;
grant execute on function public.authorize_admin_credentials_change(text) to authenticated;
notify pgrst,'reload schema';
commit;
