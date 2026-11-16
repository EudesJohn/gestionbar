-- Only administrators and managers have active access. Keep account and audit history.
begin;

select pg_advisory_xact_lock(763412001);
select set_config('comptoir.action','profile.role',true);

-- An obsolete account must not silently receive broader managerial permissions.
-- The administrator can explicitly assign a new role from the accounts screen.
update public.profiles set role='pending' where role='entry';
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','manager','pending'));

do $$
declare definition text; function_name text;
begin
  foreach function_name in array array['public.apply_command(uuid,jsonb)','public.get_snapshot()'] loop
    select pg_get_functiondef(function_name::regprocedure) into definition;
    if position('if actor.role=''pending'' then' in definition)=0 then
      raise exception 'Version inattendue de % : migration interrompue.',function_name;
    end if;
    definition := replace(definition, 'if actor.role=''pending'' then', 'if actor.role not in (''admin'',''manager'') then');
    definition := replace(definition,
      '  if actor.role=''entry'' and action<>''sheet.create'' then raise exception ''Action réservée au gérant ou à l’administrateur.''; end if;', '');
    definition := replace(definition, 'case when actor.role=''entry'' then 0 else e.salary end', 'e.salary');
    definition := replace(definition, 'case when actor.role=''entry'' then 0 else p.cost end', 'p.cost');
    definition := replace(definition, 'case when actor.role=''entry'' then 0 else l.cost end', 'l.cost');
    -- Keep the data filtering structure but close it to any unsupported role.
    definition := replace(definition, 'case when actor.role=''entry'' then', 'case when actor.role not in (''admin'',''manager'') then');
    execute definition;
  end loop;
end $$;

update public.sync_events set changed_at=clock_timestamp() where id=1;
notify pgrst, 'reload schema';
commit;
