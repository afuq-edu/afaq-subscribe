-- 2026-10-17 (مطبَّق على القاعدة): حساب المدير (profiles.is_admin) تُفتح له كل المواد في «حاضر»
-- دون تجربة ولا اشتراك. يربط المدير الإضافة بحسابه من الموقع («اربط الإضافة بحسابي»).
-- يعدّل ext_access وext_me في hader-direct.sql (الإصدار هنا هو الأحدث).

create or replace function public.ext_access(p_uid uuid, p_package text, p_term smallint)
returns text language sql stable security definer set search_path to 'public' as $function$
  select case
    when exists (select 1 from public.profiles pr where pr.id = p_uid and pr.is_admin) then 'sub'
    when public.active_term(p_uid, p_package, p_term) is not null then 'sub'
    when exists (select 1 from public.ext_requests r where r.user_id = p_uid and p_package = any (r.package_ids) and r.status <> 'cancelled')
      and p_term = (select term from public.terms where id = public.current_term_id()) then 'trial'
  end
$function$;

create or replace function public.ext_me(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare d record; r public.ext_requests; v_lim int := public.setting_int('trial_lessons', 3); v_t public.terms; v_left int; v_admin boolean;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select * into r from public.ext_requests where user_id = d.user_id;
  select * into v_t from public.terms where id = public.current_term_id();
  v_admin := coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false);
  v_left := greatest(0, v_lim - public.trial_used_total(d.user_id));
  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'name', (select full_name from public.profiles where id = d.user_id),
    'subs', coalesce((select jsonb_agg(x order by x->>'grade', x->>'subject') from (
        select jsonb_build_object(
              'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade, 'shift', p.shift,
              'year', t.year, 'term', t.term, 'ends_on', t.ends_on,
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = t.term)) x
          from public.subscriptions s join public.packages p on p.id = s.package_id join public.terms t on t.id = s.term_id
          where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on
        union all
        select jsonb_build_object(
              'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade, 'shift', p.shift,
              'year', v_t.year, 'term', v_t.term, 'ends_on', v_t.ends_on,
              'trial', case when v_admin then null else true end,
              'left', case when v_admin then null else v_left end,
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = v_t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = v_t.term))
          from public.packages p
          where r.id is not null and r.status <> 'cancelled' and p.id = any (r.package_ids)
            and public.active_term(d.user_id, p.id, v_t.term) is null) q), '[]'::jsonb),
    'request', case when r.id is not null then jsonb_build_object('id', r.id, 'status', case when v_admin then 'active' else r.status end, 'shift', r.shift, 'packages', to_jsonb(r.package_ids)) end,
    'trial_left', case when r.id is not null and not v_admin then v_left end,
    'whatsapp', (select value from public.settings where key = 'whatsapp'),
    'trial_lessons', v_lim));
end $function$;

-- ext_pick: حساب المدير بلا حد ١٢ مادة، وطلبه يبقى 'active'
create or replace function public.ext_pick(p_token text, p_packages text[], p_shift text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare d record; r public.ext_requests; v_new text[]; v_t smallint := (select term from public.terms where id = public.current_term_id());
  v_admin boolean; v_cap int;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if exists (select 1 from unnest(coalesce(p_packages, '{}')) x where x not in (select id from public.packages where active)) then
    return jsonb_build_object('ok', false, 'error', 'packages');
  end if;
  v_admin := coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false);
  v_cap := case when v_admin then 400 else 12 end;
  select * into r from public.ext_requests where user_id = d.user_id for update;
  if r.id is null then
    insert into public.ext_requests (user_id, name, phone, shift, package_ids, ip_hash)
    select d.user_id, coalesce(p.full_name, ''), p.phone, case when p_shift in ('one', 'two') then p_shift end, '{}', public.client_ip_hash()
    from public.profiles p where p.id = d.user_id
    returning * into r;
  end if;
  select array_agg(distinct x) into v_new from unnest(r.package_ids || coalesce(p_packages, '{}')) x;
  if cardinality(v_new) > v_cap then return jsonb_build_object('ok', false, 'error', 'packages'); end if;
  update public.ext_requests set package_ids = v_new,
    shift = case when p_shift in ('one', 'two') then p_shift else shift end,
    status = case when v_admin then 'active'
                  when status in ('active', 'cancelled') and exists (select 1 from unnest(v_new) x where public.active_term(d.user_id, x, v_t) is null) then 'trial' else status end
  where id = r.id;
  return jsonb_build_object('ok', true, 'request', r.id);
end $function$;

-- 2026-10-18: اشتراك مادة لصف يشمل نوعي المدرسة معًا (فترة واحدة وفترتان)
create or replace function public.sub_mirror_shift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.subscriptions (user_id, package_id, term_id, plan, revoked)
    select new.user_id, q.id, new.term_id, new.plan, new.revoked
      from public.packages p join public.packages q on q.subject = p.subject and q.grade = p.grade and q.id <> p.id
     where p.id = new.package_id
    on conflict (user_id, package_id, term_id) do nothing;
  elsif tg_op = 'UPDATE' and new.revoked is distinct from old.revoked then
    update public.subscriptions s set revoked = new.revoked
      from public.packages p, public.packages q
     where p.id = new.package_id and q.subject = p.subject and q.grade = p.grade and q.id <> p.id
       and s.package_id = q.id and s.user_id = new.user_id and s.term_id = new.term_id;
  end if;
  return new;
end $$;
create trigger sub_mirror_shift after insert or update of revoked on public.subscriptions
  for each row execute function public.sub_mirror_shift();
-- (طُبّق مع إضافة النوع الآخر لكل اشتراك موجود)
