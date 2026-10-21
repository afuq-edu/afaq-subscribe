-- مراجعة 4.10.4: إحكام ربط نور والتجربة
-- اسم فارغ لا يُعدّ تطابقًا (كان يربط أي حساب نور تلقائيًا)
create or replace function public.noor_name_ok(p_reg text, p_noor text)
 returns boolean language plpgsql immutable as $function$
declare r text[]; n text[]; w text;
begin
  r := string_to_array(public.ar_name_norm(p_reg), ' '); n := string_to_array(public.ar_name_norm(p_noor), ' ');
  if coalesce(array_length(r, 1), 0) = 0 or coalesce(array_length(n, 1), 0) = 0 then return false; end if;
  if r[1] <> n[1] then return false; end if;
  foreach w in array r loop if not (w = any(n)) then return false; end if; end loop;
  return true;
end $function$;

-- لم يُقرأ اسم نور: يكمل المعلم دون ربط ولا انتظار، ويُربط في أول مرة يُقرأ فيها الاسم
create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare d record; b public.noor_bind; v_reg text; v_name text := left(nullif(trim(coalesce(p_name, '')), ''), 120);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
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
end $function$;

-- إلغاء المشرف يبقى إلغاءً: اختيار مواد جديدة لا يعيد التجربة
create or replace function public.ext_pick(p_token text, p_packages text[], p_shift text default null::text)
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
                  when status = 'active' and exists (select 1 from unnest(v_new) x where public.active_term(d.user_id, x, v_t) is null) then 'trial' else status end
  where id = r.id;
  return jsonb_build_object('ok', true, 'request', r.id);
end $function$;

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- عدّاد التجربة: طلبات متزامنة لا تتجاوز الحد (قفل على حساب نور أو المعلم)
create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text, p_ver text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare d record; v_lesson jsonb; v_used int; v_limit int := public.setting_int('daily_limit', 200); v_acc text; v_trial int := public.setting_int('trial_lessons', 3);
  v_bound text; v_dev text;
begin
  if not public.ext_ver_ok(p_ver) then
    return jsonb_build_object('ok', false, 'error', 'old_version', 'min', (select value from public.settings where key = 'min_ext_version'));
  end if;
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  v_acc := public.ext_access(d.user_id, p_package, p_term);
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select dv.noor_hash into v_dev from public.devices dv where dv.id = d.device_id;
  if v_acc = 'trial' then perform pg_advisory_xact_lock(hashtext('trial:' || coalesce(nullif(v_dev, ''), d.user_id::text))); end if;
  if v_acc in ('sub', 'trial') and not coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then
    select nb.noor_hash into v_bound from public.noor_bind nb where nb.user_id = d.user_id;
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
