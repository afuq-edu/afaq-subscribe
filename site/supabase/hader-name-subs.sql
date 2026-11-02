-- 2026-11-02 (طلب المالك): الاشتراك بالاسم الرباعي لا بالجهاز.
-- يضيف المدير من لوحة الإدارة («مشتركون بالاسم») اسم المعلم الرباعي والمواد (أو «كل المواد») حتى قبل أن يثبّت الإضافة.
-- عندما يكتب المعلم الاسم نفسه في «حاضر» يتفعّل اشتراكه مباشرة دون «فعّل»: الحذف وإعادة التثبيت والجهاز الجديد لا تلغي شيئًا.
-- الحماية كما هي: لا يعمل التحضير إلا في حساب نور الذي يطابق اسمه الاسم المكتوب (ext_noor / noor_bind)؛
-- فمن كتب اسم غيره ثم فتح حساب نور باسم آخر ينتظر ولا يُعبَّأ له شيء.
-- نوع الخدمة (المالك 2026-11-02): الاشتراك يحدد هل المعلم له «تحضير فقط» أو «تحضير مع واجب» أو «واجب فقط»، لا اشتراكًا مطلقًا:
-- prep = تحضير فقط · both = تحضير مع واجب (الافتراضي، فلا يتغير شيء لمن اشترك قبل) · hw = واجب فقط.
-- الإضافة تعرض للمعلم ما يغطيه اشتراكه فقط؛ والخادم يمنع محتوى التحضير (ext_session) عن اشتراك «واجب فقط».
alter table public.subscriptions add column if not exists service text not null default 'both' check (service in ('prep', 'both', 'hw'));

create table if not exists public.name_subs (
  id bigserial primary key,
  name text not null,
  name_norm text not null,
  plan text not null default 'term' check (plan in ('term', 'year')),
  all_subjects boolean not null default false,
  service text not null default 'both' check (service in ('prep', 'both', 'hw')),
  package_ids text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  claimed_user uuid,
  claimed_at timestamptz,
  hidden_at timestamptz   -- «حذف» من القائمة إخفاء لا مسح: يبقى القيد محفوظًا
);
alter table public.name_subs add column if not exists hidden_at timestamptz;
create index if not exists name_subs_norm_idx on public.name_subs (name_norm);
alter table public.name_subs enable row level security;   -- بلا سياسات: الوصول عبر الدوال فقط

-- نوع خدمة المعلم في باقة وفصل: both إن وُجد اشتراك واحد بها، ثم prep، ثم hw؛ null بلا اشتراك فعّال
create or replace function public.sub_service(p_uid uuid, p_package text, p_term smallint) returns text
language sql stable security definer set search_path = public as $$
  select case when bool_or(s.service = 'both') then 'both' when bool_or(s.service = 'prep') then 'prep' when count(*) > 0 then 'hw' end
  from public.subscriptions s join public.terms t on t.id = s.term_id
  where s.user_id = p_uid and s.package_id = p_package and t.term = p_term and not s.revoked and public.today_muscat() <= t.ends_on
$$;
revoke execute on function public.sub_service(uuid, text, smallint) from public, anon, authenticated;

-- يضبط نوع الخدمة لاشتراكات المعلم في المواد المحددة (وصفّيها الآخر من نوع المدرسة نفسه) في كل فصول اشتراكه
create or replace function public.set_service(p_uid uuid, p_package_ids text[], p_service text) returns void
language sql security definer set search_path = public as $$
  update public.subscriptions s set service = p_service
   where s.user_id = p_uid and p_service in ('prep', 'both', 'hw') and s.package_id in (
     select q.id from public.packages p join public.packages q on q.subject = p.subject and q.grade = p.grade
      where p.id = any (p_package_ids))
$$;
revoke execute on function public.set_service(uuid, text[], text) from public, anon, authenticated;

-- النسخ الجديدة من اشتراكات النوع الآخر والفصل الثاني ترث نوع الخدمة
create or replace function public.sub_mirror_shift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.subscriptions (user_id, package_id, term_id, plan, revoked, service)
    select new.user_id, q.id, new.term_id, new.plan, new.revoked, new.service
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

create or replace function public.extend_year_subs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, package_id, term_id, code, plan, service)
  select distinct on (s.user_id, s.package_id) s.user_id, s.package_id, new.id, s.code, 'year', s.service
  from public.subscriptions s join public.terms t on t.id = s.term_id
  where s.plan = 'year' and not s.revoked and t.year = new.year and t.id <> new.id
  on conflict (user_id, package_id, term_id) do nothing;
  return new;
end $$;

-- يمنح المعلم مواد القيد (كل المواد الجاهزة النشطة إن كان «كل المواد») للفصل الجاري، ويفعّل طلبه ويعلّم القيد مأخوذًا
create or replace function public.name_sub_apply(p_uid uuid, p_ns bigint) returns void
language plpgsql security definer set search_path = public as $$
declare ns public.name_subs; v_ids text[]; v_t int := public.current_term_id();
begin
  select * into ns from public.name_subs where id = p_ns;
  if ns.id is null then return; end if;
  v_ids := case when ns.all_subjects then coalesce((select array_agg(id) from public.packages where active), '{}') else ns.package_ids end;
  if v_t is not null and cardinality(v_ids) > 0 then
    perform public.grant_subscriptions(p_uid, ns.plan, v_t, v_ids, null);
    perform public.set_service(p_uid, v_ids, ns.service);
  end if;
  update public.ext_requests set status = 'active', activated_at = coalesce(activated_at, now()),
    package_ids = case when ns.all_subjects or cardinality(ns.package_ids) = 0 then package_ids
                       else (select array_agg(distinct x) from unnest(package_ids || ns.package_ids) x) end
    where user_id = p_uid and status <> 'cancelled';
  update public.name_subs set claimed_user = p_uid, claimed_at = coalesce(claimed_at, now()) where id = p_ns;
end $$;
revoke execute on function public.name_sub_apply(uuid, bigint) from public, anon, authenticated;

create or replace function public.ext_start(p_name text, p_phone text, p_shift text, p_packages text[], p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ip text := public.client_ip_hash(); v_uid uuid := gen_random_uuid(); v_tok text; v_req bigint; v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80);
  v_norm text; v_one uuid; v_dev uuid; v_max int := public.setting_int('max_devices', 2); v_ns bigint; v_four boolean;
begin
  if length(v_name) < 3 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if coalesce(p_shift, '') not in ('one', 'two') then return jsonb_build_object('ok', false, 'error', 'shift'); end if;
  if cardinality(coalesce(p_packages, '{}')) = 0 or cardinality(p_packages) > 6
     or exists (select 1 from unnest(p_packages) x where x not in (select id from public.packages where active)) then
    return jsonb_build_object('ok', false, 'error', 'packages');
  end if;
  v_norm := public.ar_name_norm(v_name);
  v_four := cardinality(string_to_array(v_norm, ' ')) >= 4;
  -- عودة مشترك باسمه الرباعي (hader-name-return.sql)
  if v_four then
    select u.uid into v_one from (
      select r.user_id as uid from public.ext_requests r where r.status <> 'cancelled' and public.ar_name_norm(r.name) = v_norm
      union
      select pr.id from public.profiles pr where public.ar_name_norm(pr.full_name) = v_norm
      union
      select ns.claimed_user from public.name_subs ns where ns.name_norm = v_norm and ns.claimed_user is not null
    ) u
    where not coalesce((select pr.is_admin from public.profiles pr where pr.id = u.uid), false)
      and exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                  where s.user_id = u.uid and s.package_id = any (p_packages) and not s.revoked and public.today_muscat() <= t.ends_on)
    order by (select max(s.created_at) from public.subscriptions s join public.terms t on t.id = s.term_id
              where s.user_id = u.uid and s.package_id = any (p_packages) and not s.revoked and public.today_muscat() <= t.ends_on) desc nulls last,
             (select max(coalesce(d.last_seen, d.created_at)) from public.devices d where d.user_id = u.uid) desc nulls last
    limit 1;
    if v_one is not null then
      v_tok := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
      insert into public.devices (user_id, token_hash, label, last_seen)
      values (v_one, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), left(coalesce(p_label, ''), 80), now())
      returning id into v_dev;
      update public.devices x set revoked_at = now() from (
        select id from public.devices where user_id = v_one and revoked_at is null and id <> v_dev
        order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)) o where x.id = o.id;
      insert into public.ext_requests (user_id, name, phone, shift, package_ids, ip_hash, status, activated_at)
      values (v_one, v_name, nullif(trim(coalesce(p_phone, '')), ''), p_shift,
              (select array_agg(distinct x) from unnest(p_packages) x), v_ip, 'active', now())
      on conflict (user_id) do update set name = excluded.name, phone = coalesce(excluded.phone, ext_requests.phone),
        status = case when ext_requests.status = 'cancelled' then 'active' else ext_requests.status end
      returning id into v_req;
      -- قيود المدير للاسم نفسه: «كل المواد» تلحقها المواد الجديدة، وقيد لم يؤخذ بعد يُؤخذ لهذا الحساب
      for v_ns in select id from public.name_subs where name_norm = v_norm and hidden_at is null and (claimed_user is null or claimed_user = v_one) loop
        perform public.name_sub_apply(v_one, v_ns);
      end loop;
      return jsonb_build_object('ok', true, 'token', v_tok, 'request', v_req, 'name', v_name, 'returned', true);
    end if;
  end if;
  -- اسم أضافه المدير ولم يُؤخذ بعد: اشتراك جاهز لا يخضع لحد التسجيل اليومي للشبكة
  v_ns := null;
  if v_four then
    select id into v_ns from public.name_subs where name_norm = v_norm and claimed_user is null and hidden_at is null order by created_at limit 1;
  end if;
  -- حد التسجيل اليومي للشبكة يخص الطلبات الجديدة فقط، لا عودة المشترك ولا اشتراكًا أضافه المدير
  if v_ns is null and (select count(*) from public.ext_requests where ip_hash = v_ip and created_at > now() - interval '1 day') >= 6 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', true,
          '{"provider":"hader"}'::jsonb, jsonb_build_object('full_name', v_name, 'phone', nullif(trim(coalesce(p_phone, '')), '')), now(), now());
  v_tok := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
  insert into public.devices (user_id, token_hash, label, last_seen)
  values (v_uid, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), left(coalesce(p_label, ''), 80), now());
  insert into public.ext_requests (user_id, name, phone, shift, package_ids, ip_hash)
  values (v_uid, v_name, nullif(trim(coalesce(p_phone, '')), ''), p_shift, (select array_agg(distinct x) from unnest(p_packages) x), v_ip)
  returning id into v_req;
  if v_ns is not null then
    perform public.name_sub_apply(v_uid, v_ns);
    return jsonb_build_object('ok', true, 'token', v_tok, 'request', v_req, 'name', v_name, 'returned', true);
  end if;
  return jsonb_build_object('ok', true, 'token', v_tok, 'request', v_req, 'name', v_name);
end $$;
grant execute on function public.ext_start(text, text, text, text[], text) to anon, authenticated;

-- ---------- لوحة الإدارة ----------
create or replace function public.admin_name_subs() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', ns.id, 'name', ns.name, 'plan', ns.plan, 'all_subjects', ns.all_subjects, 'service', ns.service, 'package_ids', to_jsonb(ns.package_ids),
    'note', ns.note, 'created_at', ns.created_at, 'claimed_at', ns.claimed_at,
    'request', (select r.id from public.ext_requests r where r.user_id = ns.claimed_user),
    'devices', (select count(*) from public.devices d where d.user_id = ns.claimed_user and d.revoked_at is null),
    'noor_bound', exists (select 1 from public.noor_bind nb where nb.user_id = ns.claimed_user and nb.noor_hash <> '')
  ) order by (ns.claimed_user is null) desc, ns.created_at desc) from public.name_subs ns where ns.hidden_at is null), '[]'::jsonb);
end $$;

create or replace function public.admin_name_sub_add(p_name text, p_plan text, p_all boolean, p_packages text[], p_service text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80); v_norm text; v_id bigint; v_ids text[] := coalesce(p_packages, '{}');
  v_uid uuid; v_req bigint;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if coalesce(p_service, '') not in ('prep', 'both', 'hw') then raise exception 'اختر نوع الخدمة: تحضير فقط أو تحضير مع واجب أو واجب فقط'; end if;
  v_norm := public.ar_name_norm(v_name);
  if cardinality(string_to_array(v_norm, ' ')) < 4 then raise exception 'اكتب الاسم الرباعي كما في نور (أربعة أسماء على الأقل)'; end if;
  if not coalesce(p_all, false) and cardinality(v_ids) = 0 then raise exception 'اختر مادة واحدة على الأقل أو «كل المواد»'; end if;
  if exists (select 1 from unnest(v_ids) x where x not in (select id from public.packages)) then raise exception 'باقة غير موجودة'; end if;
  if exists (select 1 from public.name_subs where name_norm = v_norm and claimed_user is null and hidden_at is null) then raise exception 'هذا الاسم مضاف وينتظر صاحبه'; end if;
  insert into public.name_subs (name, name_norm, plan, all_subjects, service, package_ids, note)
  values (v_name, v_norm, p_plan, coalesce(p_all, false), p_service, v_ids, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  -- معلم فتح «حاضر» وكتب اسمه قبل أن يُضاف القيد (طلب تجربة أو انتظار قائم): يتفعّل طلبه القائم الآن دون إعادة تثبيت.
  -- أحدث طلب بالاسم نفسه، لغير المدير ومن لا اشتراك فعّال عنده؛ وحماية حساب نور تبقى كما هي.
  select r.user_id, r.id into v_uid, v_req from public.ext_requests r
   where r.status in ('trial', 'requested') and public.ar_name_norm(r.name) = v_norm
     and not coalesce((select pr.is_admin from public.profiles pr where pr.id = r.user_id), false)
     and not exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                     where s.user_id = r.user_id and not s.revoked and public.today_muscat() <= t.ends_on)
   order by r.created_at desc limit 1;
  if v_uid is not null then
    perform public.name_sub_apply(v_uid, v_id);
    return jsonb_build_object('ok', true, 'id', v_id, 'applied', true, 'request', v_req);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.admin_name_sub_delete(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.name_subs set hidden_at = coalesce(hidden_at, now()) where id = p_id;   -- يُخفي القيد من القائمة فقط؛ اشتراكات من أُخذ قيده تبقى حتى تُسحب من «المعلمون»
  return jsonb_build_object('ok', true);
end $$;

-- يغيّر نوع خدمة اشتراك قائم (من لوحة الإدارة بعد «فعّل» أو من المعلمين)
create or replace function public.admin_set_service(p_user uuid, p_package_ids text[], p_service text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_service, '') not in ('prep', 'both', 'hw') then raise exception 'اختر نوع الخدمة'; end if;
  perform public.set_service(p_user, p_package_ids, p_service);
  return jsonb_build_object('ok', true);
end $$;

-- «حاضر» يعرف نوع الخدمة من ext_me، والخادم يحجب محتوى التحضير عن اشتراك «واجب فقط». يُعدَّل ما هو قائم في القاعدة بنصه الحالي.
do $$
declare r record; d text; n text; v_patched int := 0;
begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('ext_me', 'ext_session') loop
    d := pg_get_functiondef(r.oid);
    if r.proname = 'ext_me' then
      if d like '%''service'', s.service%' then continue; end if;
      n := replace(d, $q$'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = t.term)) x$q$,
                      $q$'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = t.term), 'service', s.service) x$q$);
    else
      if d like '%sub_service(%' then continue; end if;
      n := replace(d, $q$if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;$q$,
                      $q$if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if v_acc = 'sub' and public.sub_service(d.user_id, p_package, p_term) = 'hw' then return jsonb_build_object('ok', false, 'error', 'hw_only'); end if;$q$);
    end if;
    if n <> d then execute n; v_patched := v_patched + 1; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.proname = 'ext_me' and pg_get_functiondef(p.oid) like '%''service'', s.service%') then
    raise exception 'لم يُعثر على موضع تعديل ext_me';
  end if;
  if not exists (select 1 from pg_proc p where p.proname = 'ext_session' and pg_get_functiondef(p.oid) like '%sub_service(%') then
    raise exception 'لم يُعثر على موضع تعديل ext_session';
  end if;
end $$;

revoke execute on function public.admin_name_subs(), public.admin_name_sub_add(text, text, boolean, text[], text, text), public.admin_name_sub_delete(bigint), public.admin_set_service(uuid, text[], text) from public, anon;
grant execute on function public.admin_name_subs(), public.admin_name_sub_add(text, text, boolean, text[], text, text), public.admin_name_sub_delete(bigint), public.admin_set_service(uuid, text[], text) to authenticated;
