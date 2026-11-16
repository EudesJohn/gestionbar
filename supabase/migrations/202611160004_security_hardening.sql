-- Apply after 001, 002, 003. Requires Supabase Auth (JWT aal and auth.sessions).
begin;
select pg_advisory_xact_lock(763412001);

create table public.security_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  first_seen timestamptz not null default now(), last_seen timestamptz not null default now(),
  revoked_at timestamptz
);
create index security_sessions_user_idx on public.security_sessions(user_id);
create table public.security_rate_windows (
  user_id uuid not null references public.profiles(id) on delete restrict,
  operation text not null, window_start timestamptz not null, requests integer not null check(requests>0),
  primary key(user_id,operation)
);
create table public.security_events (
  id uuid primary key default gen_random_uuid(), date timestamptz not null default clock_timestamp(),
  user_id uuid, action text not null, allowed boolean not null, session_id uuid
);
create index security_events_date_idx on public.security_events(date desc);
alter table public.security_sessions enable row level security;
alter table public.security_rate_windows enable row level security;
alter table public.security_events enable row level security;
revoke all on public.security_sessions,public.security_rate_windows,public.security_events from anon,authenticated;
create trigger security_events_immutable before update or delete on public.security_events for each row execute function public.forbid_mutation();

create function public.require_secure_session(p_touch boolean default false) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare claims jsonb := auth.jwt(); subject uuid := auth.uid(); sid uuid;
  auth_created timestamptz; deadline timestamptz; current_session public.security_sessions%rowtype;
begin
  if subject is null or not exists(select 1 from public.profiles where id=subject and role in ('admin','manager')) then
    raise exception using errcode='42501',message='Votre compte attend l’attribution d’un rôle par l’administrateur.';
  end if;
  if coalesce(claims->>'aal','')<>'aal2' then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
  begin sid := (claims->>'session_id')::uuid; exception when others then sid := null; end;
  if sid is null then raise exception using errcode='42501',message='SESSION_EXPIRED'; end if;
  select created_at,not_after into auth_created,deadline from auth.sessions where id=sid and user_id=subject;
  if not found or auth_created<now()-interval '8 hours' or (deadline is not null and deadline<=now()) then
    raise exception using errcode='42501',message='SESSION_EXPIRED';
  end if;
  insert into public.security_sessions(session_id,user_id) values(sid,subject) on conflict do nothing;
  select * into current_session from public.security_sessions where session_id=sid for update;
  if current_session.user_id<>subject or current_session.revoked_at is not null then
    raise exception using errcode='42501',message='SESSION_REVOKED';
  end if;
  if current_session.last_seen<now()-interval '15 minutes' then raise exception using errcode='42501',message='SESSION_EXPIRED'; end if;
  if p_touch then update public.security_sessions set last_seen=now() where session_id=sid; end if;
  return subject;
end $$;

create function public.get_security_status() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare account public.profiles%rowtype;
begin
  select * into account from public.profiles where id=auth.uid();
  if not found or account.role not in ('admin','manager') then raise exception using errcode='42501',message='Votre compte attend l’attribution d’un rôle par l’administrateur.'; end if;
  return jsonb_build_object('securityVersion',1,'mfaRequired',true,'role',account.role,'idleMinutes',15,'sessionHours',8);
end $$;
create function public.touch_secure_session() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.require_secure_session(true); end $$;

create function public.revoke_current_session() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Connexion requise.'; end if;
  sid := (auth.jwt()->>'session_id')::uuid;
  if sid is null then return; end if;
  insert into public.security_sessions(session_id,user_id,revoked_at) values(sid,auth.uid(),now())
  on conflict(session_id) do update set revoked_at=now() where security_sessions.user_id=auth.uid();
  insert into public.security_events(user_id,action,allowed,session_id) values(auth.uid(),'session.logout',true,sid);
end $$;

-- A separate RPC commits the limit before the external Auth Admin API call.
create function public.authorize_account_creation() returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare subject uuid; counter integer;
begin
  subject := public.require_secure_session(true);
  if not exists(select 1 from public.profiles where id=subject and role='admin') then
    insert into public.security_events(user_id,action,allowed,session_id) values(subject,'account.create',false,(auth.jwt()->>'session_id')::uuid);
    return false;
  end if;
  insert into public.security_rate_windows(user_id,operation,window_start,requests) values(subject,'account.create',now(),1)
  on conflict(user_id,operation) do update set
    requests=case when security_rate_windows.window_start<now()-interval '10 minutes' then 1 else least(security_rate_windows.requests+1,11) end,
    window_start=case when security_rate_windows.window_start<now()-interval '10 minutes' then now() else security_rate_windows.window_start end
  returning requests into counter;
  insert into public.security_events(user_id,action,allowed,session_id) values(subject,'account.create',counter<=10,(auth.jwt()->>'session_id')::uuid);
  return counter<=10;
end $$;

create function public.revoke_changed_role_sessions() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.role is distinct from new.role then
    insert into public.security_sessions(session_id,user_id,revoked_at)
      select id,user_id,now() from auth.sessions where user_id=new.id
    on conflict(session_id) do update set revoked_at=now();
    insert into public.security_events(user_id,action,allowed) values(auth.uid(),'account.role_changed',true);
  end if;
  return new;
end $$;
create trigger security_role_change after update of role on public.profiles for each row execute function public.revoke_changed_role_sessions();

do $$ declare definition text; begin
  select pg_get_functiondef('public.apply_command(uuid,jsonb)'::regprocedure) into definition;
  if position('perform pg_advisory_xact_lock(763412001);' in definition)=0 then raise exception 'Version inattendue de apply_command.'; end if;
  definition := replace(definition,'perform pg_advisory_xact_lock(763412001);',
    'perform pg_advisory_xact_lock(763412001);
     perform public.require_secure_session(true);
     select * into actor from public.profiles where id=auth.uid();
     if pg_column_size(p_command)>65536 then raise exception ''Requête trop volumineuse.''; end if;');
  definition := replace(definition,'jsonb_array_length(p->''lines'')=0','jsonb_array_length(p->''lines'') not between 1 and 100');
  execute definition;

  select pg_get_functiondef('public.get_snapshot()'::regprocedure) into definition;
  definition := replace(definition,' STABLE',' VOLATILE');
  definition := replace(definition,'select * into actor from public.profiles where id=auth.uid();',
    'perform public.require_secure_session(false);
     select * into actor from public.profiles where id=auth.uid();');
  definition := replace(definition,'''calculationVersion'',2,','''securityVersion'',1,''calculationVersion'',2,');
  execute definition;
end $$;

revoke all on function public.require_secure_session(boolean),public.get_security_status(),public.touch_secure_session(),public.revoke_current_session(),public.authorize_account_creation(),public.revoke_changed_role_sessions() from public,anon,authenticated;
grant execute on function public.get_security_status(),public.touch_secure_session(),public.revoke_current_session(),public.authorize_account_creation() to authenticated;
notify pgrst,'reload schema';
commit;
