-- خدمات الاشتراك (المالك 2026-11-14): «في الاشتراك ممكن احدد باقه كامله تشمل كل شي او بعض الاشياء فقط ممكن واجب ممكن تحضير
-- ممكن فديو ممكن واجب وفديو وهكذا هذا كله يتم تحديده من الموقع».
-- الخدمات خمس: prep التحضير · hw الواجبات · rooms غرف النقاش · video الفيديو · scorm الدرس التفاعلي.
-- عمود service (في subscriptions وname_subs) يحمل: prep أو hw أو both (= تحضير وواجبات، كما كان) أو all (الخمس كلها)
-- أو قائمة بفواصل بترتيب ثابت مثل «prep,video» أو «hw,rooms,scorm». ما كان مسجّلًا يبقى كما هو (both = تحضير وواجبات فقط).
-- يُنفَّذ أكثر من مرة دون ضرر.

-- الصيغة الموحّدة لقائمة خدمات (null إن لم يبقَ منها شيء معروف)
create or replace function public.svc_norm(p text) returns text
language sql immutable as $$
  with k as (
    select distinct trim(x) as k
      from unnest(string_to_array(replace(replace(coalesce(p, ''), 'both', 'prep,hw'), 'all', 'prep,hw,rooms,video,scorm'), ',')) x
  ), v as (select k from k where k in ('prep', 'hw', 'rooms', 'video', 'scorm'))
  select case
    when (select count(*) from v) = 0 then null
    when (select count(*) from k where k <> '') > (select count(*) from v) then null   -- فيها ما ليس خدمة
    when (select count(*) from v) = 5 then 'all'
    when (select count(*) from v) = 2 and not exists (select 1 from v where k not in ('prep', 'hw')) then 'both'
    else (select string_agg(k, ',' order by array_position(array['prep', 'hw', 'rooms', 'video', 'scorm'], k)) from v)
  end
$$;

-- هل تشمل قائمة الخدمات خدمةً بعينها
create or replace function public.svc_has(p text, k text) returns boolean
language sql immutable as $$
  select k = any (string_to_array(replace(replace(coalesce(p, ''), 'both', 'prep,hw'), 'all', 'prep,hw,rooms,video,scorm'), ','))
$$;

-- القيد القديم (prep/both/hw) يُستبدل بالصيغة الموحّدة
do $$
declare c record;
begin
  for c in select conrelid::regclass as tbl, conname from pg_constraint
            where contype = 'c' and conrelid in ('public.subscriptions'::regclass, 'public.name_subs'::regclass)
              and pg_get_constraintdef(oid) like '%service%' and pg_get_constraintdef(oid) not like '%svc_norm%' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_service_svc') then
    alter table public.subscriptions add constraint subscriptions_service_svc check (public.svc_norm(service) is not distinct from service);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'name_subs_service_svc') then
    alter table public.name_subs add constraint name_subs_service_svc check (public.svc_norm(service) is not distinct from service);
  end if;
end $$;

-- خدمات اشتراك المعلم في مادة وفصل: مجموع ما في اشتراكاته السارية
create or replace function public.sub_service(p_uid uuid, p_package text, p_term smallint) returns text
language sql stable security definer set search_path = public as $$
  select public.svc_norm(string_agg(s.service, ','))
  from public.subscriptions s join public.terms t on t.id = s.term_id
  where s.user_id = p_uid and s.package_id = p_package and t.term = p_term and not s.revoked and public.today_muscat() <= t.ends_on
$$;
revoke execute on function public.sub_service(uuid, text, smallint) from public, anon, authenticated;

create or replace function public.set_service(p_uid uuid, p_package_ids text[], p_service text) returns void
language sql security definer set search_path = public as $$
  update public.subscriptions s set service = public.svc_norm(p_service)
   where s.user_id = p_uid and public.svc_norm(p_service) is not null and s.package_id in (
     select q.id from public.packages p join public.packages q on q.subject = p.subject and q.grade = p.grade
      where p.id = any (p_package_ids))
$$;
revoke execute on function public.set_service(uuid, text[], text) from public, anon, authenticated;

-- دوال الإدارة تقبل أي قائمة خدمات، و«حاضر» يُحجب عنه محتوى التحضير حين لا يشمل الاشتراك التحضير. يُعدَّل القائم في القاعدة بنصه الحالي.
do $$
declare r record; d text; n text;
  v_new text := $q$p_service := public.svc_norm(p_service);
  if p_service is null then raise exception 'اختر خدمة واحدة على الأقل'; end if;$q$;
begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('admin_name_sub_add', 'admin_request_activate', 'admin_set_service', 'ext_session') loop
    d := pg_get_functiondef(r.oid);
    if r.proname = 'ext_session' then
      n := replace(d, $q$public.sub_service(d.user_id, p_package, p_term) = 'hw' then$q$,
                      $q$not public.svc_has(public.sub_service(d.user_id, p_package, p_term), 'prep') then$q$);
    else
      n := regexp_replace(d, $q$if coalesce\(p_service, ''\) not in \('prep', 'both', 'hw'\) then raise exception '[^']*'; end if;$q$, v_new);
    end if;
    if n <> d then execute n; end if;
  end loop;
  for r in select p.proname, pg_get_functiondef(p.oid) as d from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('admin_name_sub_add', 'admin_request_activate', 'admin_set_service') loop
    if r.d not like '%svc_norm(p_service)%' then raise exception 'لم يُعثر على موضع تعديل %', r.proname; end if;
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ext_session'
              and pg_get_functiondef(p.oid) like '%sub_service(%' and pg_get_functiondef(p.oid) not like '%svc_has(public.sub_service(%') then
    raise exception 'لم يُعثر على موضع تعديل ext_session';
  end if;
end $$;

-- تغيير خدمات اسم مسجَّل من لوحة الإدارة («المسجّلون بالاسم» ← «الخدمات»): يسري فورًا على مواد صاحبه إن كان مفعّلًا
create or replace function public.admin_name_sub_service(p_id bigint, p_service text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ns public.name_subs; v_svc text := public.svc_norm(p_service); v_ids text[];
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if v_svc is null then raise exception 'اختر خدمة واحدة على الأقل'; end if;
  select * into ns from public.name_subs where id = p_id;
  if ns.id is null then raise exception 'الاسم غير موجود'; end if;
  update public.name_subs set service = v_svc where id = p_id;
  if ns.claimed_user is not null then
    v_ids := case when ns.all_subjects then coalesce((select array_agg(id) from public.packages where active), '{}') else ns.package_ids end;
    perform public.set_service(ns.claimed_user, v_ids, v_svc);
  end if;
  return jsonb_build_object('ok', true, 'service', v_svc, 'applied', ns.claimed_user is not null);
end $$;
revoke execute on function public.admin_name_sub_service(bigint, text) from public, anon;
grant execute on function public.admin_name_sub_service(bigint, text) to authenticated;
