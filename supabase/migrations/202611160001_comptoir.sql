-- Comptoir v1: single establishment, integer FCFA, all writes through transactional RPCs.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null check (length(name) between 1 and 150),
  role text not null default 'pending' check (role in ('admin','manager','entry','pending'))
);
create table public.bar_settings (
  id integer primary key default 1 check (id = 1),
  bar_name text not null default 'Le Comptoir', location text not null default 'Pobè, Bénin',
  shortage_alert bigint not null default 5000 check (shortage_alert between 0 and 1000000000),
  debt_limit bigint not null default 50000 check (debt_limit between 0 and 1000000000),
  advance_limit bigint not null default 15000 check (advance_limit between 0 and 1000000000),
  deduction_cap integer not null default 50 check (deduction_cap between 0 and 100),
  closing_time text not null default '23:00' check (closing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  credit_allowed boolean not null default true
);
insert into public.bar_settings default values;
create table public.employees (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 2 and 150),
  phone text not null default '', sponsor text not null default '', hired_on date not null,
  salary bigint not null check (salary between 0 and 1000000000),
  status text not null default 'active' check (status in ('active','departed')),
  departed_on date, departure_reason text, color text not null default '#d8e8de',
  rest_day integer not null default 0 check (rest_day between 0 and 6),
  created_at timestamptz not null default now(),
  check (departed_on is null or departed_on >= hired_on),
  check ((status = 'active' and departed_on is null) or (status = 'departed' and departed_on is not null and length(departure_reason) >= 3))
);
create table public.products (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 2 and 150),
  category text not null check (category in ('Locale','Importée','Sans alcool','Autre')),
  pack integer not null check (pack between 1 and 1000),
  cost bigint not null check (cost between 0 and 1000000000),
  price bigint not null check (price between 1 and 1000000000),
  threshold bigint not null default 24 check (threshold between 0 and 1000000000),
  stock bigint not null default 0 check (stock between 0 and 1000000000)
);
create unique index products_name_unique on public.products(lower(name));
create table public.daily_sheets (
  id uuid primary key default gen_random_uuid(), date date not null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  cash bigint not null check (cash between 0 and 1000000000),
  momo bigint not null check (momo between 0 and 1000000000),
  expense bigint not null default 0 check (expense between 0 and 1000000000), expense_note text not null default '',
  deposit bigint not null default 0 check (deposit between 0 and 1000000000),
  credit bigint not null default 0 check (credit between 0 and 1000000000), client text not null default '', note text not null default '',
  shortage bigint not null check (shortage >= 0), status text not null default 'validated' check (status in ('validated','reversed')),
  reversal_reason text, created_at timestamptz not null default now(), created_by uuid not null references public.profiles(id) on delete restrict,
  check (deposit <= cash + momo), check (expense = 0 or length(expense_note) >= 3), check (credit = 0 or length(client) >= 2)
);
create unique index one_active_sheet_per_employee_date on public.daily_sheets(employee_id,date) where status = 'validated';
create index sheets_date_idx on public.daily_sheets(date);
create index sheets_creator_idx on public.daily_sheets(created_by);
create table public.sale_lines (
  id uuid primary key default gen_random_uuid(), sheet_id uuid not null references public.daily_sheets(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  received bigint not null check (received between 1 and 100000), sold bigint not null check (sold between 0 and received),
  price bigint not null check (price > 0), cost bigint not null check (cost >= 0), unique(sheet_id,product_id)
);
create index sale_lines_product_idx on public.sale_lines(product_id);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), date date not null, product_id uuid not null references public.products(id) on delete restrict,
  quantity bigint not null, type text not null check (type in ('supply','issue','inventory','reversal')), note text not null,
  sheet_id uuid references public.daily_sheets(id) on delete restrict
);
create index movements_product_date_idx on public.stock_movements(product_id,date);
create index movements_sheet_idx on public.stock_movements(sheet_id);
create table public.debts (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete restrict,
  date date not null, kind text not null check (kind in ('shortage','credit','advance','other')),
  amount bigint not null check (amount > 0), balance bigint not null check (balance between 0 and amount), note text not null,
  sheet_id uuid references public.daily_sheets(id) on delete restrict
);
create index debts_employee_date_idx on public.debts(employee_id,date);
create index debts_sheet_idx on public.debts(sheet_id);
create table public.settlements (
  id uuid primary key default gen_random_uuid(), debt_id uuid not null references public.debts(id) on delete restrict,
  amount bigint not null check (amount > 0), date date not null,
  method text not null check (method in ('cash','momo','payroll','reversal')), note text not null default ''
);
create index settlements_debt_idx on public.settlements(debt_id);
create table public.payrolls (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references public.employees(id) on delete restrict,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'), base bigint not null check (base > 0),
  bonus bigint not null check (bonus >= 0), deductions bigint not null check (deductions between 0 and base),
  net bigint not null check (net = base + bonus - deductions), paid_on date not null,
  unique(employee_id,month)
);
create table public.payroll_allocations (
  payroll_id uuid not null references public.payrolls(id) on delete restrict,
  debt_id uuid not null references public.debts(id) on delete restrict,
  amount bigint not null check (amount > 0), primary key (payroll_id,debt_id)
);
create index payroll_allocations_debt_idx on public.payroll_allocations(debt_id);
create table public.day_closures (
  id uuid primary key default gen_random_uuid(), date date not null unique, closed_at timestamptz not null default now(), note text not null default ''
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(), date timestamptz not null default clock_timestamp(), actor text not null,
  user_id uuid, action text not null, detail text not null, old_value jsonb, new_value jsonb
);
create index audit_date_idx on public.audit_log(date desc);
create table public.command_receipts (
  id uuid primary key, user_id uuid not null references public.profiles(id) on delete restrict, command jsonb not null, created_at timestamptz not null default now()
);
create index receipts_user_idx on public.command_receipts(user_id);
-- Only a timestamp is published to Realtime; clients fetch a role-filtered snapshot.
create table public.sync_events (id integer primary key check(id=1), changed_at timestamptz not null default now());
insert into public.sync_events values (1,now());

create function public.local_day() returns date language sql stable set search_path = public,pg_temp as $$ select (now() at time zone 'Africa/Porto-Novo')::date $$;
create function public.nat(p jsonb, k text, maximum bigint default 1000000000) returns bigint language plpgsql immutable set search_path=public,pg_temp as $$
declare value text := p->>k; number bigint;
begin
  if value is null or value !~ '^\d+$' then raise exception '% : entier positif ou nul requis.',k; end if;
  number := value::bigint;
  if number > maximum then raise exception '% : montant ou quantité trop élevé.',k; end if;
  return number;
end $$;
create function public.valid_date(value text) returns date language plpgsql stable set search_path=public,pg_temp as $$
declare result date;
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Date invalide.'; end if;
  result := value::date;
  if result > public.local_day() then raise exception 'La date ne peut pas être dans le futur.'; end if;
  return result;
end $$;
create function public.capture_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_name text; new_row jsonb;
begin
  select name into actor_name from public.profiles where id=auth.uid();
  new_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log(actor,user_id,action,detail,old_value,new_value)
  values(coalesce(actor_name,'Administration système'),auth.uid(),coalesce(nullif(current_setting('comptoir.action',true),''),tg_op),
    coalesce(new_row->>'name',new_row->>'note',new_row->>'date',tg_table_name)||' · '||tg_table_name,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create function public.forbid_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Écriture validée : modification ou suppression interdite.'; end $$;
create trigger immutable_audit before update or delete on public.audit_log for each row execute function public.forbid_mutation();
do $$ declare name text; begin
  foreach name in array array['profiles','bar_settings','employees','products','daily_sheets','sale_lines','stock_movements','debts','settlements','payrolls','payroll_allocations','day_closures'] loop
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function public.capture_audit()',name);
  end loop;
  foreach name in array array['sale_lines','stock_movements','settlements','payrolls','payroll_allocations','day_closures','command_receipts'] loop
    execute format('create trigger immutable_entry before update or delete on public.%I for each row execute function public.forbid_mutation()',name);
  end loop;
  foreach name in array array['daily_sheets','debts','employees','products'] loop
    execute format('create trigger no_deletion before delete on public.%I for each row execute function public.forbid_mutation()',name);
  end loop;
end $$;

create function public.create_profile() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.profiles(id,name,role) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(new.email,'@',1),'Utilisateur'),150),'pending');
  return new;
end $$;
create trigger auth_user_created after insert on auth.users for each row execute function public.create_profile();
insert into public.profiles(id,name,role) select id,left(coalesce(nullif(raw_user_meta_data->>'name',''),split_part(email,'@',1),'Utilisateur'),150),'pending' from auth.users on conflict do nothing;

create function public.check_debt_limit(employee uuid, value bigint, kind text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare settings public.bar_settings%rowtype; outstanding bigint;
begin
  select * into strict settings from public.bar_settings where id=1;
  select coalesce(sum(balance),0) into outstanding from public.debts where employee_id=employee;
  if outstanding+value > settings.debt_limit then raise exception 'Le plafond de dette de cette serveuse est dépassé.'; end if;
  if kind='advance' then
    select coalesce(sum(balance),0) into outstanding from public.debts where employee_id=employee and debts.kind='advance';
    if outstanding+value > settings.advance_limit then raise exception 'Le plafond des avances est dépassé.'; end if;
  end if;
end $$;

create function public.apply_command(p_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor public.profiles%rowtype; settings public.bar_settings%rowtype; employee public.employees%rowtype;
  product public.products%rowtype; sheet public.daily_sheets%rowtype; debt public.debts%rowtype;
  previous public.command_receipts%rowtype;
  action text := p_command->>'type'; p jsonb := p_command->'payload'; line jsonb;
  target uuid; product_id_value uuid; employee_id_value uuid; payroll_id_value uuid; current_date_value date;
  received_value bigint; sold_value bigint; amount_value bigint; cash_value bigint; momo_value bigint;
  expense_value bigint; credit_value bigint; deposit_value bigint; total_value bigint := 0; shortage_value bigint;
  balance_value bigint; deduction_value bigint; bonus_value bigint; remaining_value bigint; allocated_value bigint;
  note_value text; lines_count integer; missing_count integer; month_value text;
begin
  select * into actor from public.profiles where id=auth.uid();
  if not found then raise exception 'Connexion requise.'; end if;
  if actor.role='pending' then raise exception 'Votre compte attend l’attribution d’un rôle par l’administrateur.'; end if;
  if p_id is null or jsonb_typeof(p)<>'object' or action is null then raise exception 'Commande invalide.'; end if;
  -- Serializes financial writes for this establishment, including offline retries.
  perform pg_advisory_xact_lock(763412001);
  select * into previous from public.command_receipts where id=p_id;
  if found then
    if previous.user_id<>actor.id or previous.command<>p_command then raise exception 'Identifiant de commande déjà utilisé.'; end if;
    return jsonb_build_object('ok',true,'replayed',true);
  end if;
  if action not in ('employee.create','employee.depart','employee.salary','product.create','stock.supply','stock.inventory','sheet.create','sheet.reverse','debt.create','debt.settle','payroll.pay','day.close','settings.update','profile.role') then raise exception 'Action inconnue.'; end if;
  if actor.role='entry' and action<>'sheet.create' then raise exception 'Action réservée au gérant ou à l’administrateur.'; end if;
  if actor.role<>'admin' and action in ('employee.salary','payroll.pay','settings.update','profile.role') then raise exception 'Action réservée à l’administrateur.'; end if;
  select * into strict settings from public.bar_settings where id=1;
  perform set_config('comptoir.action',action,true);
  note_value := trim(coalesce(p->>'note',''));
  case action
  when 'employee.create' then
    insert into public.employees(id,name,phone,sponsor,hired_on,salary,color,rest_day)
    values((p->>'id')::uuid,trim(p->>'name'),coalesce(p->>'phone',''),coalesce(p->>'sponsor',''),public.valid_date(p->>'hiredOn'),
      case when actor.role='admin' then public.nat(p,'salary') else 0 end,
      case when p->>'color' ~ '^#[0-9a-fA-F]{6}$' then p->>'color' else '#d8e8de' end,public.nat(p,'restDay',6));
  when 'employee.depart' then
    if length(trim(p->>'reason'))<3 then raise exception 'Motif de sortie obligatoire.'; end if;
    update public.employees set status='departed',departed_on=public.valid_date(p->>'date'),departure_reason=trim(p->>'reason') where id=(p->>'id')::uuid;
    if not found then raise exception 'Serveuse introuvable.'; end if;
  when 'employee.salary' then
    update public.employees set salary=public.nat(p,'salary') where id=(p->>'id')::uuid;
    if not found then raise exception 'Serveuse introuvable.'; end if;
  when 'product.create' then
    target := (p->>'id')::uuid; amount_value := public.nat(p,'stock');
    insert into public.products(id,name,category,pack,cost,price,threshold,stock)
    values(target,trim(p->>'name'),p->>'category',public.nat(p,'pack',1000),public.nat(p,'cost'),public.nat(p,'price'),public.nat(p,'threshold'),amount_value);
    if amount_value>0 then insert into public.stock_movements(date,product_id,quantity,type,note) values(public.local_day(),target,amount_value,'supply','Inventaire initial'); end if;
  when 'stock.supply','stock.inventory' then
    select * into product from public.products where id=(p->>'productId')::uuid for update;
    if not found then raise exception 'Produit introuvable.'; end if;
    current_date_value := public.valid_date(p->>'date');
    if length(note_value)<3 then raise exception 'Fournisseur ou motif obligatoire.'; end if;
    if action='stock.supply' then
      amount_value := public.nat(p,'quantity');
      if amount_value=0 then raise exception 'Quantité supérieure à zéro requise.'; end if;
    else amount_value := public.nat(p,'actual')-product.stock;
    end if;
    update public.products set stock=stock+amount_value where id=product.id;
    insert into public.stock_movements(date,product_id,quantity,type,note) values(current_date_value,product.id,amount_value,case when action='stock.supply' then 'supply' else 'inventory' end,note_value);
  when 'sheet.create' then
    target := (p->>'id')::uuid; current_date_value := public.valid_date(p->>'date'); employee_id_value := (p->>'employeeId')::uuid;
    select * into employee from public.employees where id=employee_id_value;
    if not found or employee.status<>'active' or employee.hired_on>current_date_value then raise exception 'Serveuse non active à cette date.'; end if;
    if exists(select 1 from public.day_closures where date=current_date_value) then raise exception 'Journée déjà clôturée.'; end if;
    if exists(select 1 from public.daily_sheets where employee_id=employee.id and date=current_date_value and status='validated') then raise exception 'Une fiche existe déjà pour cette serveuse et cette date.'; end if;
    if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines')=0 then raise exception 'Ajoutez au moins un produit.'; end if;
    select count(distinct value->>'productId') into lines_count from jsonb_array_elements(p->'lines');
    if lines_count<>jsonb_array_length(p->'lines') then raise exception 'Un produit apparaît plusieurs fois.'; end if;
    for line in select value from jsonb_array_elements(p->'lines') loop
      select * into product from public.products where id=(line->>'productId')::uuid for update;
      if not found then raise exception 'Produit introuvable.'; end if;
      received_value := public.nat(line,'received',100000); sold_value := public.nat(line,'sold',100000);
      if received_value=0 or sold_value>received_value then raise exception 'Quantités reçues ou vendues incohérentes.'; end if;
      if received_value>product.stock then raise exception 'Stock insuffisant : %.',product.name; end if;
      total_value := total_value+sold_value*product.price;
    end loop;
    cash_value := public.nat(p,'cash'); momo_value := public.nat(p,'momo'); expense_value := public.nat(p,'expense'); credit_value := public.nat(p,'credit'); deposit_value := public.nat(p,'deposit');
    shortage_value := total_value-cash_value-momo_value-expense_value-credit_value;
    if shortage_value<0 then raise exception 'Le total remis et justifié dépasse les ventes.'; end if;
    if credit_value>0 then
      if not settings.credit_allowed then raise exception 'Les ventes à crédit sont désactivées.'; end if;
      perform public.check_debt_limit(employee.id,credit_value,'credit');
    end if;
    insert into public.daily_sheets(id,date,employee_id,cash,momo,expense,expense_note,deposit,credit,client,note,shortage,created_by)
    values(target,current_date_value,employee.id,cash_value,momo_value,expense_value,trim(coalesce(p->>'expenseNote','')),deposit_value,credit_value,trim(coalesce(p->>'client','')),note_value,shortage_value,actor.id);
    for line in select value from jsonb_array_elements(p->'lines') loop
      select * into product from public.products where id=(line->>'productId')::uuid;
      received_value := public.nat(line,'received',100000); sold_value := public.nat(line,'sold',100000);
      insert into public.sale_lines(sheet_id,product_id,received,sold,price,cost) values(target,product.id,received_value,sold_value,product.price,product.cost);
      update public.products set stock=stock-received_value where id=product.id;
      insert into public.stock_movements(date,product_id,quantity,type,note,sheet_id) values(current_date_value,product.id,-received_value,'issue',employee.name,target);
    end loop;
    if shortage_value>0 then insert into public.debts(employee_id,date,kind,amount,balance,note,sheet_id) values(employee.id,current_date_value,'shortage',shortage_value,shortage_value,'Manquant de la fiche du '||current_date_value,target); end if;
    if credit_value>0 then insert into public.debts(employee_id,date,kind,amount,balance,note,sheet_id) values(employee.id,current_date_value,'credit',credit_value,credit_value,p->>'client',target); end if;
  when 'sheet.reverse' then
    select * into sheet from public.daily_sheets where id=(p->>'id')::uuid and status='validated' for update;
    if not found then raise exception 'Fiche introuvable ou déjà annulée.'; end if;
    note_value := trim(coalesce(p->>'reason',''));
    if length(note_value)<5 then raise exception 'Un motif détaillé est obligatoire.'; end if;
    if exists(select 1 from public.day_closures where date=sheet.date) then raise exception 'Journée clôturée : annulation impossible.'; end if;
    if exists(select 1 from public.debts where sheet_id=sheet.id and balance<>amount) then raise exception 'Cette fiche comporte déjà un règlement. Régularisation comptable nécessaire.'; end if;
    update public.daily_sheets set status='reversed',reversal_reason=note_value where id=sheet.id;
    for product_id_value,received_value in select product_id,received from public.sale_lines where sheet_id=sheet.id loop
      update public.products set stock=stock+received_value where id=product_id_value;
      insert into public.stock_movements(date,product_id,quantity,type,note,sheet_id) values(public.local_day(),product_id_value,received_value,'reversal',note_value,sheet.id);
    end loop;
    for debt in select * from public.debts where sheet_id=sheet.id and balance>0 loop
      insert into public.settlements(debt_id,amount,date,method,note) values(debt.id,debt.balance,public.local_day(),'reversal',note_value);
      update public.debts set balance=0 where id=debt.id;
    end loop;
  when 'debt.create' then
    employee_id_value := (p->>'employeeId')::uuid; amount_value := public.nat(p,'amount');
    if amount_value=0 or length(note_value)<3 then raise exception 'Montant et motif obligatoires.'; end if;
    if p->>'kind'='credit' and not settings.credit_allowed then raise exception 'Les ventes à crédit sont désactivées.'; end if;
    if p->>'kind'<>'shortage' then perform public.check_debt_limit(employee_id_value,amount_value,p->>'kind'); end if;
    insert into public.debts(id,employee_id,date,kind,amount,balance,note) values((p->>'id')::uuid,employee_id_value,public.valid_date(p->>'date'),p->>'kind',amount_value,amount_value,note_value);
  when 'debt.settle' then
    select * into debt from public.debts where id=(p->>'id')::uuid for update;
    if not found then raise exception 'Dette introuvable.'; end if;
    amount_value := public.nat(p,'amount'); current_date_value := public.valid_date(p->>'date');
    if amount_value=0 or amount_value>debt.balance then raise exception 'Le remboursement doit être compris entre 1 FCFA et le solde restant.'; end if;
    if current_date_value<debt.date then raise exception 'Le remboursement doit être postérieur à la dette.'; end if;
    if coalesce(p->>'method','') not in ('cash','momo') then raise exception 'Mode de règlement invalide.'; end if;
    insert into public.settlements(debt_id,amount,date,method,note) values(debt.id,amount_value,current_date_value,p->>'method',note_value);
    update public.debts set balance=balance-amount_value where id=debt.id;
  when 'payroll.pay' then
    select * into employee from public.employees where id=(p->>'employeeId')::uuid;
    if not found or employee.salary<=0 then raise exception 'Définissez d’abord un salaire de base.'; end if;
    month_value := p->>'month'; bonus_value := public.nat(p,'bonus');
    if month_value is null or month_value !~ '^\d{4}-(0[1-9]|1[0-2])$' or month_value>to_char(public.local_day(),'YYYY-MM') or month_value<to_char(employee.hired_on,'YYYY-MM') or (employee.departed_on is not null and month_value>to_char(employee.departed_on,'YYYY-MM')) then raise exception 'Mois de salaire invalide.'; end if;
    if exists(select 1 from public.payrolls where employee_id=employee.id and month=month_value) then raise exception 'Salaire déjà payé pour ce mois.'; end if;
    select coalesce(sum(balance),0) into balance_value from public.debts where employee_id=employee.id and to_char(date,'YYYY-MM')<=month_value;
    deduction_value := least(balance_value,employee.salary*settings.deduction_cap/100);
    payroll_id_value := gen_random_uuid();
    insert into public.payrolls(id,employee_id,month,base,bonus,deductions,net,paid_on) values(payroll_id_value,employee.id,month_value,employee.salary,bonus_value,deduction_value,employee.salary+bonus_value-deduction_value,public.local_day());
    remaining_value := deduction_value;
    for debt in select * from public.debts where employee_id=employee.id and balance>0 and to_char(date,'YYYY-MM')<=month_value order by date,id for update loop
      exit when remaining_value=0;
      allocated_value := least(debt.balance,remaining_value);
      insert into public.payroll_allocations(payroll_id,debt_id,amount) values(payroll_id_value,debt.id,allocated_value);
      insert into public.settlements(debt_id,amount,date,method,note) values(debt.id,allocated_value,public.local_day(),'payroll','Salaire '||month_value);
      update public.debts set balance=balance-allocated_value where id=debt.id;
      remaining_value := remaining_value-allocated_value;
    end loop;
  when 'day.close' then
    current_date_value := public.valid_date(p->>'date');
    if not exists(select 1 from public.daily_sheets where date=current_date_value and status='validated') then raise exception 'Aucune fiche à clôturer.'; end if;
    select count(*) into missing_count from public.employees e where e.hired_on<=current_date_value and (e.departed_on is null or e.departed_on>current_date_value) and e.rest_day<>extract(dow from current_date_value) and not exists(select 1 from public.daily_sheets s where s.employee_id=e.id and s.date=current_date_value and s.status='validated');
    if missing_count>0 and length(note_value)<5 then raise exception 'Expliquez les absences dans le rappel avant de clôturer.'; end if;
    if exists(select 1 from public.daily_sheets s where s.date=current_date_value and s.status='validated' and s.cash+s.momo+s.expense+s.credit+s.shortage<>(select sum(l.sold*l.price) from public.sale_lines l where l.sheet_id=s.id)) then raise exception 'Un écart reste à expliquer.'; end if;
    insert into public.day_closures(date,note) values(current_date_value,note_value);
  when 'settings.update' then
    if length(trim(coalesce(p->>'barName','')))=0 or length(trim(coalesce(p->>'location','')))=0 then raise exception 'Nom et localisation obligatoires.'; end if;
    update public.bar_settings set bar_name=trim(p->>'barName'),location=trim(p->>'location'),shortage_alert=public.nat(p,'shortageAlert'),debt_limit=public.nat(p,'debtLimit'),advance_limit=public.nat(p,'advanceLimit'),deduction_cap=public.nat(p,'deductionCap',100),closing_time=p->>'closingTime',credit_allowed=(p->>'creditAllowed')::boolean where id=1;
  when 'profile.role' then
    if (p->>'id')::uuid=actor.id then raise exception 'Vous ne pouvez pas modifier votre propre rôle.'; end if;
    update public.profiles set role=p->>'role' where id=(p->>'id')::uuid;
    if not found then raise exception 'Compte introuvable.'; end if;
  else raise exception 'Action inconnue.';
  end case;
  insert into public.command_receipts(id,user_id,command) values(p_id,actor.id,p_command);
  update public.sync_events set changed_at=clock_timestamp() where id=1;
  return jsonb_build_object('ok',true,'replayed',false);
end $$;

create function public.get_snapshot() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor public.profiles%rowtype; settings public.bar_settings%rowtype; result jsonb;
begin
  select * into actor from public.profiles where id=auth.uid();
  if not found then raise exception 'Connexion requise.'; end if;
  if actor.role='pending' then raise exception 'Votre compte attend l’attribution d’un rôle par l’administrateur.'; end if;
  select * into strict settings from public.bar_settings where id=1;
  result := jsonb_build_object(
    'settings',jsonb_build_object('barName',settings.bar_name,'location',settings.location,'shortageAlert',settings.shortage_alert,'debtLimit',settings.debt_limit,'advanceLimit',settings.advance_limit,'deductionCap',settings.deduction_cap,'closingTime',settings.closing_time,'creditAllowed',settings.credit_allowed),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'phone',e.phone,'sponsor',e.sponsor,'hiredOn',e.hired_on,'salary',case when actor.role='entry' then 0 else e.salary end,'status',e.status,'departedOn',e.departed_on,'departureReason',e.departure_reason,'color',e.color,'restDay',e.rest_day) order by e.created_at) from public.employees e),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'category',p.category,'pack',p.pack,'cost',case when actor.role='entry' then 0 else p.cost end,'price',p.price,'threshold',p.threshold,'stock',p.stock) order by p.name) from public.products p),'[]'::jsonb),
    'sheets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'date',s.date,'employeeId',s.employee_id,'cash',s.cash,'momo',s.momo,'expense',s.expense,'expenseNote',s.expense_note,'deposit',s.deposit,'credit',s.credit,'client',s.client,'note',s.note,'shortage',s.shortage,'status',s.status,'createdAt',s.created_at,'reversalReason',s.reversal_reason,'lines',coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'received',l.received,'sold',l.sold,'price',l.price,'cost',case when actor.role='entry' then 0 else l.cost end)) from public.sale_lines l where l.sheet_id=s.id),'[]'::jsonb)) order by s.date,s.created_at) from public.daily_sheets s),'[]'::jsonb),
    'debts',case when actor.role='entry' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'employeeId',d.employee_id,'date',d.date,'kind',d.kind,'amount',d.amount,'balance',d.balance,'note',d.note,'sheetId',d.sheet_id) order by d.date,d.id) from public.debts d),'[]'::jsonb) end,
    'settlements',case when actor.role='entry' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'debtId',s.debt_id,'amount',s.amount,'date',s.date,'method',s.method,'note',s.note) order by s.date,s.id) from public.settlements s),'[]'::jsonb) end,
    'movements',case when actor.role='entry' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'date',m.date,'productId',m.product_id,'quantity',m.quantity,'type',m.type,'note',m.note,'sheetId',m.sheet_id) order by m.date,m.id) from public.stock_movements m),'[]'::jsonb) end,
    'payrolls',case when actor.role='entry' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'employeeId',p.employee_id,'month',p.month,'base',p.base,'bonus',p.bonus,'deductions',p.deductions,'net',p.net,'paidOn',p.paid_on,'allocations',coalesce((select jsonb_agg(jsonb_build_object('debtId',a.debt_id,'amount',a.amount)) from public.payroll_allocations a where a.payroll_id=p.id),'[]'::jsonb)) order by p.month,p.id) from public.payrolls p),'[]'::jsonb) end,
    'closures',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'date',c.date,'closedAt',c.closed_at,'note',c.note) order by c.date) from public.day_closures c),'[]'::jsonb),
    'audit',case when actor.role='entry' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'date',a.date,'actor',a.actor,'action',a.action,'detail',a.detail) order by a.date desc) from (select * from public.audit_log order by date desc limit 500) a),'[]'::jsonb) end
  );
  return jsonb_build_object('data',result,'profile',jsonb_build_object('id',actor.id,'name',actor.name,'role',actor.role),'profiles',case when actor.role='admin' then coalesce((select jsonb_agg(to_jsonb(p)) from public.profiles p),'[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Clients cannot bypass business validation. Tables deny direct reads/writes; the snapshot RPC filters sensitive fields.
do $$ declare name text; begin
  foreach name in array array['profiles','bar_settings','employees','products','daily_sheets','sale_lines','stock_movements','debts','settlements','payrolls','payroll_allocations','day_closures','audit_log','command_receipts','sync_events'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from anon,authenticated',name);
  end loop;
end $$;
grant select on public.sync_events to authenticated;
create policy sync_read on public.sync_events for select to authenticated using (auth.uid() is not null);
revoke all on function public.local_day(),public.nat(jsonb,text,bigint),public.valid_date(text),public.capture_audit(),public.forbid_mutation(),public.create_profile(),public.check_debt_limit(uuid,bigint,text),public.apply_command(uuid,jsonb),public.get_snapshot() from public,anon,authenticated;
grant execute on function public.apply_command(uuid,jsonb),public.get_snapshot() to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.sync_events;
  end if;
end $$;
commit;
