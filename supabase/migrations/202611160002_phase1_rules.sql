-- Applies after 202611160001_comptoir.sql. Existing validated sheets retain their original formula.
begin;

alter table public.daily_sheets add column if not exists shortage_basis text not null default 'sold'
  check (shortage_basis in ('sold','received'));
alter table public.daily_sheets alter column shortage_basis set default 'received';

-- Replace only the financial basis of new sheets, without rewriting historical rows.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_command(uuid,jsonb)'::regprocedure) into definition;
  if position('total_value := total_value+sold_value*product.price;' in definition)=0 then
    raise exception 'Version inattendue de apply_command : migration interrompue.';
  end if;
  definition := replace(definition,
    'total_value := total_value+sold_value*product.price;',
    'total_value := total_value+received_value*product.price;
      if total_value>1000000000 then raise exception ''La valeur totale de la fiche dépasse le maximum autorisé.''; end if;');
  definition := replace(definition,
    'Le total remis et justifié dépasse les ventes.',
    'Le total remis et justifié dépasse la marchandise prise.');
  definition := replace(definition,
    '(select sum(l.sold*l.price) from public.sale_lines l where l.sheet_id=s.id)',
    '(select sum((case when s.shortage_basis=''received'' then l.received else l.sold end)*l.price) from public.sale_lines l where l.sheet_id=s.id)');
  execute definition;

  select pg_get_functiondef('public.get_snapshot()'::regprocedure) into definition;
  definition := replace(definition,
    '''settings'',jsonb_build_object(',
    '''calculationVersion'',2,''settings'',jsonb_build_object(');
  definition := replace(definition,
    '''shortage'',s.shortage,''status''',
    '''shortage'',s.shortage,''shortageBasis'',s.shortage_basis,''status''');
  execute definition;
end $$;

-- Changes to a validated sheet are limited to one motivated compensating reversal.
create function public.guard_validated_sheet() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.status<>'validated' or new.status<>'reversed' or length(trim(coalesce(new.reversal_reason,'')))<5
     or (to_jsonb(old)-'status'-'reversal_reason') is distinct from (to_jsonb(new)-'status'-'reversal_reason') then
    raise exception 'Fiche validée : seule une annulation motivée est autorisée.';
  end if;
  return new;
end $$;
create trigger guard_sheet_update before update on public.daily_sheets for each row execute function public.guard_validated_sheet();
revoke all on function public.guard_validated_sheet() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
