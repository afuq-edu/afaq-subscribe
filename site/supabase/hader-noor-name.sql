-- 2026-11-03 (طلب المالك): «حاضر» يعمل لمن يسجّل المدير اسمه في الموقع فقط، والمفتاح اسم المعلم في صفحته في نور.
-- • المدير يكتب الاسم كما في نور (أي عدد من الكلمات) مع نوع الاشتراك والخدمة، بلا اختيار مواد.
-- • حين يفتح المعلم «حاضر» على حساب نور اسمه يطابق الاسم المسجّل يتفعّل وحده لكل المواد (ext_noor)،
--   والأداة لا تعبّئ إلا مقررات حسابه في نور، فيستفيد من مواده هو.
-- • المطابقة ذكية: الهمزات والتاء المربوطة والألف المقصورة والتشكيل و«بن/بنت» و«عبد ال…» و«آل/ال» والحروف المكررة
--   و«داوود/داود» و«عبدالرحمان/عبدالرحمن» لا تفرّق، لكن عدد الكلمات يجب أن يطابق عددها في نور والترتيب نفسه.
-- • الاسم المكتوب في «حاضر» لم يعد يأخذ القيد؛ حساب نور هو الذي يأخذه.
-- • القيد لفصل: يعمل في الفصل الذي أُضيف فيه (والسنوي في سنته)، و«جدّد» يعيده للفصل الجاري.
-- • من سبق تفعيله بـ«فعّل» يبقى كما هو.

alter table public.name_subs add column if not exists term_id int;
update public.name_subs set term_id = public.current_term_id() where term_id is null;

-- مفتاح الاسم: كلمات الاسم بعد التطبيع (ar_name_norm)، بلا «ال» في أولها
create or replace function public.name_key(t text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(w2 order by i) filter (where w2 <> ''), '{}')
  from (
    select i, replace(regexp_replace(
             case when length(w) > 3 and left(w, 2) = 'ال' then substr(w, 3) else w end,
             'و+', 'و', 'g'), 'رحمان', 'رحمن') as w2
    from unnest(string_to_array(regexp_replace(public.ar_name_norm(t), '(^|\s)ال\s+', '\1ال', 'g'), ' ')) with ordinality as x(w, i)
  ) k
$$;

-- الاسم المسجّل يطابق اسم نور: نفس عدد الكلمات وكل كلمة تطابق نظيرتها (كلمتان على الأقل)
create or replace function public.noor_name_match(p_reg text, p_noor text) returns boolean
language sql immutable set search_path = public as $$
  select cardinality(public.name_key(p_reg)) >= 2 and public.name_key(p_reg) = public.name_key(p_noor)
$$;

-- القيد ساري: غير مخفي، ولفصله الجاري (أو لسنته إن كان سنويًا)
create or replace function public.name_sub_live(p_plan text, p_term int, p_hidden timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select p_hidden is null and (p_term is null or p_term = public.current_term_id()
    or (p_plan = 'year' and (select year from public.terms where id = p_term) = (select year from public.terms where id = public.current_term_id())))
$$;
revoke execute on function public.name_sub_live(text, int, timestamptz) from public, anon, authenticated;

-- حساب نور المفتوح يُفحص قبل كل تعبئة. الجديد: اسم حساب نور يطابق اسمًا سجّله المدير → يتفعّل الجهاز وحده.
create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; b public.noor_bind; v_reg text; v_name text := left(nullif(trim(coalesce(p_name, '')), ''), 120);
  v_old uuid; v_old_reg text; v_max int := public.setting_int('max_devices', 2);
  v_ns bigint; v_to uuid; v_had boolean;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if public.open_access() or coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
  -- اسم مسجّل في الموقع (hader-noor-name.sql): قيد هذا الحساب، ثم قيد أخذه صاحب حساب نور نفسه من جهاز سابق، ثم قيد لم يؤخذ
  if v_name is not null then
    select ns.id, ns.claimed_user into v_ns, v_to from public.name_subs ns
     where public.name_sub_live(ns.plan, ns.term_id, ns.hidden_at) and public.noor_name_match(ns.name, v_name)
       and (ns.claimed_user is null
            or not exists (select 1 from public.noor_bind nb where nb.user_id = ns.claimed_user and nb.noor_hash <> '' and nb.noor_hash <> p_noor))
       and not coalesce((select pr.is_admin from public.profiles pr where pr.id = ns.claimed_user), false)
     order by case when ns.claimed_user = d.user_id then 0
                   when exists (select 1 from public.noor_bind nb where nb.user_id = ns.claimed_user and nb.noor_hash = p_noor) then 1
                   when ns.claimed_user is null then 2 else 3 end, ns.created_at
     limit 1;
    if v_ns is not null then
      v_to := coalesce(v_to, d.user_id);
      v_had := exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                       where s.user_id = v_to and not s.revoked and public.today_muscat() <= t.ends_on);
      if v_to = d.user_id and v_had and exists (select 1 from public.noor_bind nb where nb.user_id = v_to and nb.noor_hash = p_noor) then
        return jsonb_build_object('ok', true);
      end if;
      if v_to <> d.user_id then
        -- أُعيد التثبيت أو جهاز جديد: يعود الجهاز إلى حساب صاحب الاسم
        update public.devices set user_id = v_to, last_seen = now() where id = d.device_id;
        update public.devices x set revoked_at = now() from (
          select id from public.devices where user_id = v_to and revoked_at is null and id <> d.device_id
          order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)) o where x.id = o.id;
        update public.ext_requests set status = 'cancelled' where user_id = d.user_id and status in ('trial', 'requested');
        update public.ext_requests set status = 'active', activated_at = coalesce(activated_at, now()) where user_id = v_to and status = 'cancelled';
      end if;
      perform public.name_sub_apply(v_to, v_ns);
      insert into public.noor_bind (user_id, noor_hash, noor_name) values (v_to, p_noor, v_name)
      on conflict (user_id) do update set noor_hash = excluded.noor_hash, noor_name = excluded.noor_name, bound_at = now(),
        pending_hash = null, pending_name = null, pending_at = null;
      return jsonb_build_object('ok', true, 'merged', true);
    end if;
  end if;
  if not exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                 where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on) then
    select nb.user_id into v_old from public.noor_bind nb
     where nb.noor_hash = p_noor and nb.user_id <> d.user_id
       and exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                   where s.user_id = nb.user_id and not s.revoked and public.today_muscat() <= t.ends_on)
     order by nb.bound_at desc limit 1;
    if v_old is not null then
      select r.name into v_reg from public.ext_requests r where r.user_id = d.user_id order by r.created_at desc limit 1;
      select r.name into v_old_reg from public.ext_requests r where r.user_id = v_old order by r.created_at desc limit 1;
      if v_old_reg is null then select pr.full_name into v_old_reg from public.profiles pr where pr.id = v_old; end if;
      if coalesce(v_reg, '') <> '' and coalesce(v_old_reg, '') <> ''
         and (public.noor_name_ok(v_old_reg, v_reg) or public.noor_name_ok(v_reg, v_old_reg)) then
        update public.devices set user_id = v_old, last_seen = now() where id = d.device_id;
        update public.devices x set revoked_at = now() from (
          select id from public.devices where user_id = v_old and revoked_at is null and id <> d.device_id
          order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)) o where x.id = o.id;
        update public.ext_requests set status = 'cancelled' where user_id = d.user_id and status in ('trial', 'requested');
        return jsonb_build_object('ok', true, 'merged', true);
      end if;
    end if;
  end if;
  select * into b from public.noor_bind where user_id = d.user_id;
  if b.user_id is not null and b.noor_hash = p_noor then return jsonb_build_object('ok', true); end if;
  if v_name is null and (b.user_id is null or b.noor_hash = '') then return jsonb_build_object('ok', true); end if;
  select r.name into v_reg from public.ext_requests r where r.user_id = d.user_id order by r.created_at desc limit 1;
  if (b.user_id is null or b.noor_hash = '') and public.noor_name_ok(v_reg, v_name) then
    insert into public.noor_bind (user_id, noor_hash, noor_name) values (d.user_id, p_noor, v_name)
    on conflict (user_id) do update set noor_hash = excluded.noor_hash, noor_name = excluded.noor_name, bound_at = now(),
      pending_hash = null, pending_name = null, pending_at = null;
    return jsonb_build_object('ok', true, 'bound', true);
  end if;
  insert into public.noor_bind (user_id, noor_hash, pending_hash, pending_name, pending_at) values (d.user_id, '', p_noor, v_name, now())
  on conflict (user_id) do update set pending_hash = excluded.pending_hash, pending_name = excluded.pending_name, pending_at = now();
  return jsonb_build_object('ok', false, 'error', 'noor_wait', 'reg', v_reg, 'noor', v_name);
end $$;
grant execute on function public.ext_noor(text, text, text) to anon, authenticated;

-- الاسم المكتوب في «حاضر» لم يعد يأخذ قيدًا لم يؤخذ: يأخذه حساب نور الذي يطابق اسمه (ext_noor)
do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ext_start';
  if d like '%hader-noor-name%' then return; end if;
  n := replace(d, 'select id into v_ns from public.name_subs where name_norm = v_norm and claimed_user is null and hidden_at is null order by created_at limit 1;',
                  'v_ns := null;   -- hader-noor-name: القيد يأخذه حساب نور الذي يطابق اسمه، لا الاسم المكتوب');
  if n = d then raise exception 'ext_start: الموضع غير موجود'; end if;
  execute n;
end $$;

-- ---------- لوحة الإدارة ----------
create or replace function public.admin_name_subs() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', ns.id, 'name', ns.name, 'plan', ns.plan, 'service', ns.service,
    'note', ns.note, 'created_at', ns.created_at, 'claimed_at', ns.claimed_at,
    'live', public.name_sub_live(ns.plan, ns.term_id, ns.hidden_at),
    'request', (select r.id from public.ext_requests r where r.user_id = ns.claimed_user),
    'devices', (select count(*) from public.devices d where d.user_id = ns.claimed_user and d.revoked_at is null),
    'noor_bound', exists (select 1 from public.noor_bind nb where nb.user_id = ns.claimed_user and nb.noor_hash <> ''),
    'noor_name', (select nb.noor_name from public.noor_bind nb where nb.user_id = ns.claimed_user and nb.noor_hash <> '')
  ) order by (ns.claimed_user is null) desc, ns.created_at desc) from public.name_subs ns where ns.hidden_at is null), '[]'::jsonb);
end $$;

-- يضيف المدير الاسم كما في نور (المواد كلها دائمًا). معلم فتح نور بهذا الاسم وينتظر يتفعّل الآن.
create or replace function public.admin_name_sub_add(p_name text, p_plan text, p_all boolean, p_packages text[], p_service text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80); v_id bigint;
  v_uid uuid; v_req bigint; v_hash text; v_nn text;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if coalesce(p_service, '') not in ('prep', 'both', 'hw') then raise exception 'اختر نوع الخدمة: تحضير فقط أو تحضير مع واجب أو واجب فقط'; end if;
  if cardinality(public.name_key(v_name)) < 2 then raise exception 'اكتب اسم المعلم كما يظهر في صفحته في نور'; end if;
  if exists (select 1 from public.name_subs ns where ns.claimed_user is null and public.name_sub_live(ns.plan, ns.term_id, ns.hidden_at)
             and public.noor_name_match(ns.name, v_name)) then
    raise exception 'هذا الاسم مضاف وينتظر صاحبه';
  end if;
  insert into public.name_subs (name, name_norm, plan, all_subjects, service, package_ids, note, term_id)
  values (v_name, public.ar_name_norm(v_name), p_plan, true, p_service, '{}', nullif(trim(coalesce(p_note, '')), ''), public.current_term_id())
  returning id into v_id;
  -- معلم فتح «حاضر» على حساب نور بهذا الاسم وينتظر (لا اشتراك فعّال عنده)
  select nb.user_id, coalesce(nullif(nb.noor_hash, ''), nb.pending_hash), coalesce(nb.noor_name, nb.pending_name) into v_uid, v_hash, v_nn
    from public.noor_bind nb
   where (public.noor_name_match(v_name, nb.noor_name) or public.noor_name_match(v_name, nb.pending_name))
     and coalesce(nullif(nb.noor_hash, ''), nb.pending_hash) is not null
     and not coalesce((select pr.is_admin from public.profiles pr where pr.id = nb.user_id), false)
     and not exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                     where s.user_id = nb.user_id and not s.revoked and public.today_muscat() <= t.ends_on)
   order by coalesce(nb.pending_at, nb.bound_at) desc nulls last limit 1;
  if v_uid is not null then
    perform public.name_sub_apply(v_uid, v_id);
    update public.noor_bind set noor_hash = v_hash, noor_name = v_nn, bound_at = now(), pending_hash = null, pending_name = null, pending_at = null
     where user_id = v_uid;
    select r.id into v_req from public.ext_requests r where r.user_id = v_uid;
    return jsonb_build_object('ok', true, 'id', v_id, 'applied', true, 'request', v_req);
  end if;
  -- طلب قائم بالاسم المكتوب نفسه: يتفعّل، والتعبئة تبقى لحساب نور الذي يطابق اسمه فقط
  select r.user_id, r.id into v_uid, v_req from public.ext_requests r
   where r.status in ('trial', 'requested') and public.noor_name_match(v_name, r.name)
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

-- «جدّد»: القيد يعود للفصل الجاري، وصاحبه (إن أخذه) يتفعّل الآن
create or replace function public.admin_name_sub_renew(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_u uuid;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.name_subs set term_id = public.current_term_id(), hidden_at = null where id = p_id returning claimed_user into v_u;
  if v_u is not null then perform public.name_sub_apply(v_u, p_id); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.admin_name_subs(), public.admin_name_sub_add(text, text, boolean, text[], text, text), public.admin_name_sub_renew(bigint) from public, anon;
grant execute on function public.admin_name_subs(), public.admin_name_sub_add(text, text, boolean, text[], text, text), public.admin_name_sub_renew(bigint) to authenticated;
revoke execute on function public.name_key(text), public.noor_name_match(text, text) from public, anon, authenticated;

-- الإعدادات (المالك 2026-11-03: «اجعل التطبيق فقط يعمل لمن أسجل اسمه»): لا حصص تجربة، ويُطفأ الفتح المؤقت
insert into public.settings (key, value) values ('trial_lessons', '0') on conflict (key) do update set value = '0';
update public.settings set value = 'off' where key = 'open_access';
