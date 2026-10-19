-- 2026-10-18 (مطبَّق على القاعدة): الاشتراك المدفوع لحساب نور واحد — أول حساب نور يُعبَّأ له يصير صاحبه.
-- «حاضر» يقرأ رقم المعلم في نور (var user_id) ويرسل بصمته sha256('noor:'+id) مع اسمه إلى ext_noor قبل كل تعبئة.
create table if not exists public.noor_bind (
  user_id uuid primary key references auth.users(id) on delete cascade,
  noor_hash text not null,          -- '' = فكّه المدير، يُربط من جديد بأول حساب
  noor_name text,
  bound_at timestamptz not null default now()
);
alter table public.noor_bind enable row level security;
alter table public.devices add column if not exists noor_hash text;   -- حساب نور الظاهر آخر مرة على الجهاز

create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; b public.noor_bind; v_paid boolean;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
  v_paid := exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                    where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on);
  if not v_paid then return jsonb_build_object('ok', true); end if;
  select * into b from public.noor_bind where user_id = d.user_id;
  if b.user_id is null or b.noor_hash = '' then
    insert into public.noor_bind (user_id, noor_hash, noor_name) values (d.user_id, p_noor, left(nullif(trim(coalesce(p_name, '')), ''), 120))
    on conflict (user_id) do update set noor_hash = excluded.noor_hash, noor_name = excluded.noor_name, bound_at = now();
    return jsonb_build_object('ok', true, 'bound', true);
  end if;
  if b.noor_hash = p_noor then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', false, 'error', 'noor_other', 'owner', b.noor_name);
end $$;
grant execute on function public.ext_noor(text, text, text) to anon, authenticated;

create or replace function public.admin_noor_reset(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.noor_bind set noor_hash = '', noor_name = null where user_id = (select user_id from public.ext_requests where id = p_id);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.admin_noor_reset(bigint) from anon;
grant execute on function public.admin_noor_reset(bigint) to authenticated;

-- ext_session: بعد حساب v_acc أُضيف:
--   if v_acc = 'sub' and not admin: إن كان للمستخدم ربط (noor_hash <> '') وحساب نور الجهاز معروف ومختلف ← {error:'noor_other', owner}
-- admin_requests: أُضيف الحقل 'noor_name' (اسم حساب نور المربوط).
-- (النصان الكاملان مطبّقان في الهجرتين hader_ext_session_noor وhader_noor_admin)

-- 2026-10-18 (مطبَّق، هجرة hader_noor_name_allow): الاشتراك باسم المعلم — إن اختلف اسم حساب نور عن الاسم المسجّل لا يُربط تلقائيًا؛
-- يُسجَّل طلب سماح (pending_*) وتنتظر «حاضر» حتى يضغط المدير «اسمح بحساب نور» (admin_noor_allow).
alter table public.noor_bind add column if not exists pending_hash text;
alter table public.noor_bind add column if not exists pending_name text;
alter table public.noor_bind add column if not exists pending_at timestamptz;

create or replace function public.ar_name_norm(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(translate(regexp_replace(coalesce(t, ''), '[ًٌٍَُِّْـ]', '', 'g'), 'أإآٱىة', 'اااايه'),
    '(^|\s)(عبد|ابو|أبو|ام|بن|بنت)\s+', '\1\2', 'g'), '[^ء-ي0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;
-- كل كلمات الاسم المسجّل موجودة في اسم نور، والاسم الأول نفسه
create or replace function public.noor_name_ok(p_reg text, p_noor text) returns boolean language plpgsql immutable as $$
declare r text[]; n text[]; w text;
begin
  r := string_to_array(public.ar_name_norm(p_reg), ' '); n := string_to_array(public.ar_name_norm(p_noor), ' ');
  if coalesce(array_length(r, 1), 0) = 0 or coalesce(array_length(n, 1), 0) = 0 then return true; end if;
  if r[1] <> n[1] then return false; end if;
  foreach w in array r loop if not (w = any(n)) then return false; end if; end loop;
  return true;
end $$;

create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; b public.noor_bind; v_paid boolean; v_reg text; v_name text := left(nullif(trim(coalesce(p_name, '')), ''), 120);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
  v_paid := exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                    where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on);
  if not v_paid then return jsonb_build_object('ok', true); end if;
  select * into b from public.noor_bind where user_id = d.user_id;
  if b.user_id is not null and b.noor_hash = p_noor then return jsonb_build_object('ok', true); end if;
  select r.name into v_reg from public.ext_requests r where r.user_id = d.user_id order by r.created_at desc limit 1;
  if (b.user_id is null or b.noor_hash = '') and public.noor_name_ok(v_reg, v_name) then
    insert into public.noor_bind (user_id, noor_hash, noor_name) values (d.user_id, p_noor, v_name)
    on conflict (user_id) do update set noor_hash = excluded.noor_hash, noor_name = excluded.noor_name, bound_at = now(),
      pending_hash = null, pending_name = null, pending_at = null;
    return jsonb_build_object('ok', true, 'bound', true);
  end if;
  -- اسم مختلف أو حساب آخر: يُسجَّل طلب سماح للمدير
  insert into public.noor_bind (user_id, noor_hash, pending_hash, pending_name, pending_at) values (d.user_id, '', p_noor, v_name, now())
  on conflict (user_id) do update set pending_hash = excluded.pending_hash, pending_name = excluded.pending_name, pending_at = now();
  return jsonb_build_object('ok', false, 'error', 'noor_wait', 'reg', v_reg, 'noor', v_name);
end $$;
grant execute on function public.ext_noor(text, text, text) to anon, authenticated;

create or replace function public.admin_noor_allow(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.noor_bind set noor_hash = pending_hash, noor_name = pending_name, bound_at = now(), pending_hash = null, pending_name = null, pending_at = null
  where user_id = (select user_id from public.ext_requests where id = p_id) and pending_hash is not null;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.admin_noor_allow(bigint) from anon;
grant execute on function public.admin_noor_allow(bigint) to authenticated;

create or replace function public.admin_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare v_t int := public.current_term_id(); v_tn smallint := (select term from public.terms where id = public.current_term_id());
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'user_id', r.user_id, 'name', r.name, 'phone', r.phone, 'shift', r.shift, 'status', r.status,
    'created_at', r.created_at, 'requested_at', r.requested_at, 'activated_at', r.activated_at,
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
        'used', public.trial_used(r.user_id, p.id), 'active', public.active_term(r.user_id, p.id, v_tn) is not null) order by p.grade, p.subject)
      from public.packages p where p.id = any (r.package_ids)), '[]'::jsonb),
    'devices', (select count(*) from public.devices d where d.user_id = r.user_id and d.revoked_at is null),
    'last_seen', (select max(d.last_seen) from public.devices d where d.user_id = r.user_id),
    'referred_by', r.referred_by,
    'ref_name', (select x.name from public.ext_requests x where x.id = r.referred_by),
    'invited', (select count(*) from public.ext_requests x where x.referred_by = r.id),
    'invited_active', (select count(*) from public.ext_requests x where x.referred_by = r.id and x.status = 'active'),
    'noor_name', (select coalesce(nb.noor_name, 'مربوط') from public.noor_bind nb where nb.user_id = r.user_id and nb.noor_hash <> ''),
    'noor_wait', (select coalesce(nb.pending_name, 'حساب نور باسم آخر') from public.noor_bind nb where nb.user_id = r.user_id and nb.pending_hash is not null
                  and r.id = (select max(x.id) from public.ext_requests x where x.user_id = r.user_id))
  ) order by case when exists (select 1 from public.noor_bind nb where nb.user_id = r.user_id and nb.pending_hash is not null) then -1
                  else case r.status when 'requested' then 0 when 'trial' then 1 when 'active' then 2 else 3 end end,
             coalesce(r.requested_at, r.created_at) desc)
  from public.ext_requests r), '[]'::jsonb);
end $function$;

-- 2026-10-18 (مطبَّق، هجرة hader_name_norm_dots): مطابقة الاسم لا تحاسب على الهمزات ولا النقاط (رسم الحروف بلا نقاط)
create or replace function public.ar_name_norm(t text) returns text language sql immutable as $$
  select translate(trim(regexp_replace(regexp_replace(regexp_replace(translate(regexp_replace(coalesce(t, ''), '[ًٌٍَُِّْـ]', '', 'g'), 'أإآٱىة', 'اااايه'),
    '(^|\s)(عبد|ابو|أبو|ام|بن|بنت)\s+', '\1\2', 'g'), '[^ء-ي0-9 ]', ' ', 'g'), '\s+', ' ', 'g')),
    'بتثنيجخذزشضظغقؤئء', 'ٮٮٮٮٮححدرسصطعفوٮ')
$$;

-- 2026-10-18 (مطبَّق، هجرة hader_trial_noor_bind): التجربة المجانية أيضًا لحساب نور صاحب الاسم؛ ext_session يرفض (noor_wait) التجربة والاشتراك لحساب نور آخر أو حساب ينتظر السماح.
create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; b public.noor_bind; v_reg text; v_name text := left(nullif(trim(coalesce(p_name, '')), ''), 120);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
  -- التجربة والاشتراك كلاهما لحساب نور صاحب الاسم فقط
  select * into b from public.noor_bind where user_id = d.user_id;
  if b.user_id is not null and b.noor_hash = p_noor then return jsonb_build_object('ok', true); end if;
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

create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare d record; v_lesson jsonb; v_used int; v_limit int := public.setting_int('daily_limit', 200); v_acc text; v_trial int := public.setting_int('trial_lessons', 3);
  v_bound text; v_dev text;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  v_acc := public.ext_access(d.user_id, p_package, p_term);
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  -- التجربة والاشتراك لحساب نور صاحبه فقط (حساب نور الظاهر آخر مرة على هذا الجهاز)
  if v_acc in ('sub', 'trial') and not coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then
    select nb.noor_hash into v_bound from public.noor_bind nb where nb.user_id = d.user_id;
    select dv.noor_hash into v_dev from public.devices dv where dv.id = d.device_id;
    if coalesce(v_bound, '') <> '' and v_dev is not null and v_dev <> v_bound then
      return jsonb_build_object('ok', false, 'error', 'noor_wait', 'owner', (select nb.noor_name from public.noor_bind nb where nb.user_id = d.user_id));
    end if;
    if coalesce(v_bound, '') = '' and v_dev is not null and exists (select 1 from public.noor_bind nb where nb.user_id = d.user_id and nb.pending_hash = v_dev) then
      return jsonb_build_object('ok', false, 'error', 'noor_wait');
    end if;
  end if;
  select l into v_lesson from public.package_content c, jsonb_array_elements(c.pkg->'lessons') l
    where c.package_id = p_package and c.term = p_term and l->>'id' = p_lesson limit 1;
  if v_lesson is null then return jsonb_build_object('ok', false, 'error', 'no_lesson'); end if;
  if v_acc = 'trial' and not exists (select 1 from public.usage_log u where u.user_id = d.user_id and u.package_id = p_package and u.term = p_term and u.lesson_id = p_lesson)
     and public.trial_used_total(d.user_id) >= v_trial then
    return jsonb_build_object('ok', false, 'error', 'trial_over', 'limit', v_trial,
      'request', (select id from public.ext_requests where user_id = d.user_id));
  end if;
  if not exists (select 1 from public.usage_log u where u.user_id = d.user_id and u.package_id = p_package and u.term = p_term
                   and u.lesson_id = p_lesson and u.at > now() - interval '24 hours') then
    select count(distinct (u.package_id, u.term, u.lesson_id)) into v_used from public.usage_log u
      where u.user_id = d.user_id and u.at > now() - interval '24 hours';
    if v_used >= v_limit then return jsonb_build_object('ok', false, 'error', 'limit', 'limit', v_limit); end if;
  end if;
  insert into public.usage_log (user_id, device_id, package_id, term, lesson_id) values (d.user_id, d.device_id, p_package, p_term, p_lesson);
  if jsonb_typeof(v_lesson->'procedures') = 'string' and length(v_lesson->>'procedures') > 0 then
    v_lesson := jsonb_set(v_lesson, '{procedures}', to_jsonb((v_lesson->>'procedures') || public.watermark(d.user_id)));
  end if;
  return jsonb_build_object('ok', true, 'lesson', v_lesson,
    'left', case when v_acc = 'trial' then greatest(0, v_trial - public.trial_used_total(d.user_id)) end);
end $function$;

-- 2026-10-19 (مطبَّق، هجرة hader_trial_per_noor_account): التجربة المجانية لحساب نور لا للتثبيت
create or replace function public.trial_peers(p_uid uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with h as (
    select d.noor_hash x from public.devices d where d.user_id = p_uid and coalesce(d.noor_hash, '') <> ''
    union select nb.noor_hash from public.noor_bind nb where nb.user_id = p_uid and nb.noor_hash <> ''
  )
  select p_uid
  union select d.user_id from public.devices d where d.noor_hash in (select x from h)
  union select nb.user_id from public.noor_bind nb where nb.noor_hash in (select x from h)
$$;
create or replace function public.trial_used_total(p_uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct (u.package_id, u.term, u.lesson_id))::int from public.usage_log u
  where u.user_id in (select public.trial_peers(p_uid))
$$;
