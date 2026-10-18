
-- 2026-10-18 (مطبَّق، هجرتا hader_min_version_part1/part2): تعمل النسخة الجديدة فقط.
-- 2026-10-18: تعمل النسخة الجديدة فقط — ext_session بخمس معاملات (p_ver)، والقديمة (أربع معاملات) لا تعطي محتوى
insert into public.settings (key, value) values ('min_ext_version', '4.9.18') on conflict (key) do update set value = excluded.value;
create or replace function public.ext_ver_ok(p_ver text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_min text := coalesce((select value from public.settings where key = 'min_ext_version'), '');
begin
  if v_min !~ '^\d+(\.\d+)*$' then return true; end if;
  if coalesce(p_ver, '') !~ '^\d+(\.\d+)*$' then return false; end if;
  return string_to_array(p_ver, '.')::int[] >= string_to_array(v_min, '.')::int[];
end $$;
create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text, p_ver text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare d record; v_lesson jsonb; v_used int; v_limit int := public.setting_int('daily_limit', 200); v_acc text; v_trial int := public.setting_int('trial_lessons', 3);
  v_bound text; v_dev text;
begin
  -- النسخ القديمة من «حاضر» لا تُعبّئ: يجب أن تكون النسخة على الأقل min_ext_version
  if not public.ext_ver_ok(p_ver) then
    return jsonb_build_object('ok', false, 'error', 'old_version', 'min', (select value from public.settings where key = 'min_ext_version'));
  end if;
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

grant execute on function public.ext_session(text, text, smallint, text, text) to anon, authenticated;
-- النسخ القديمة: تظهر لها «هذه الحصة لم تعد في المادة — حدّث…» وإشعار التحديث، ولا يُعطى محتوى
create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('ok', false, 'error', 'no_lesson', 'old_version', true);
end $$;
