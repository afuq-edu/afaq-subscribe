-- 2026-11-02 (طلب المالك): مفتاح «فتح مؤقت بلا تفعيل» لكل نسخ «حاضر».
-- حين يكون settings.open_access = 'on': كل جهاز مرتبط يعبّئ دون تفعيل المدير ودون سقف التجربة (٣ دروس)،
-- وأي نسخة من الإضافة (حتى الأقدم من min_ext_version) تعبّئ، ولا ينتظر المعلم «اسمح بحساب نور» ولا حد التسجيل اليومي للشبكة.
-- إيقافه: غيّر القيمة إلى 'off' من لوحة الإدارة → الإعدادات، فيعود كل شيء كما كان (الاشتراكات والربط لم تُمَس).
-- ما يبقى في الوضع المفتوح: الجهاز يلزمه رمز مربوط بحساب، و«واجب فقط» لا يأخذ محتوى التحضير.
insert into public.settings (key, value) values ('open_access', 'off') on conflict (key) do nothing;

create or replace function public.open_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = 'open_access'), 'off') = 'on'
$$;
grant execute on function public.open_access() to anon, authenticated;

create or replace function public.ext_ver_ok(p_ver text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_min text := coalesce((select value from public.settings where key = 'min_ext_version'), '');
begin
  if public.open_access() then return true; end if;
  if v_min !~ '^\d+(\.\d+)*$' then return true; end if;
  if coalesce(p_ver, '') !~ '^\d+(\.\d+)*$' then return false; end if;
  return string_to_array(p_ver, '.')::int[] >= string_to_array(v_min, '.')::int[];
end $$;

create or replace function public.ext_access(p_uid uuid, p_package text, p_term smallint) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles pr where pr.id = p_uid and pr.is_admin) then 'sub'
    when public.open_access() then 'sub'
    when public.active_term(p_uid, p_package, p_term) is not null then 'sub'
    when exists (select 1 from public.ext_requests r where r.user_id = p_uid and p_package = any (r.package_ids) and r.status <> 'cancelled')
      and p_term = (select term from public.terms where id = public.current_term_id()) then 'trial'
  end
$$;

-- النسخ الأقدم جدًا (بلا رقم نسخة) تصل إلى المحتوى في الوضع المفتوح فقط
create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.open_access() then return public.ext_session(p_token, p_package, p_term, p_lesson, '0'); end if;
  return jsonb_build_object('ok', false, 'error', 'no_lesson', 'old_version', true);
end $$;

-- تعديل الدوال القائمة بنصها الحالي، ويتوقف إن لم يجد الموضع (فلا يُطبَّق نصف التعديل)
do $$
declare r record; d text; n text;
begin
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('ext_me', 'ext_noor', 'ext_start')
           or (p.pronamespace = 'public'::regnamespace and p.proname = 'ext_session' and p.pronargs = 5) loop
    d := pg_get_functiondef(r.oid);
    if d like '%open_access()%' then continue; end if;
    if r.proname = 'ext_me' then
      n := replace(d, 'v_admin := coalesce((select pr.is_admin', 'v_admin := public.open_access() or coalesce((select pr.is_admin');
    elsif r.proname = 'ext_noor' then
      n := replace(d, 'if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object(''ok'', true); end if;',
                      'if public.open_access() or coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object(''ok'', true); end if;');
    elsif r.proname = 'ext_start' then
      n := replace(d, 'if v_ns is null and (select count(*)', 'if v_ns is null and not public.open_access() and (select count(*)');
    else
      n := replace(d, 'if v_acc in (''sub'', ''trial'') and not coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then',
                      'if v_acc in (''sub'', ''trial'') and not public.open_access() and not coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then');
    end if;
    if n = d then raise exception 'open_access: الموضع غير موجود في %', r.proname; end if;
    execute n;
  end loop;
end $$;
