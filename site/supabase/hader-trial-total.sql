-- «حاضر» — التجربة المجانية ٣ حصص للمعلم في كل المواد معًا (لا لكل مادة)
create or replace function public.trial_used_total(p_uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct (u.package_id, u.term, u.lesson_id))::int from public.usage_log u where u.user_id = p_uid
$$;
revoke execute on function public.trial_used_total(uuid) from public, anon, authenticated;

create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; v_lesson jsonb; v_used int; v_limit int := public.setting_int('daily_limit', 200); v_acc text; v_trial int := public.setting_int('trial_lessons', 3);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  v_acc := public.ext_access(d.user_id, p_package, p_term);
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
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
end $$;

create or replace function public.ext_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests; v_lim int := public.setting_int('trial_lessons', 3); v_t public.terms; v_left int;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select * into r from public.ext_requests where user_id = d.user_id;
  select * into v_t from public.terms where id = public.current_term_id();
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
              'year', v_t.year, 'term', v_t.term, 'ends_on', v_t.ends_on, 'trial', true,
              'left', v_left,
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = v_t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = v_t.term))
          from public.packages p
          where r.id is not null and r.status <> 'cancelled' and p.id = any (r.package_ids)
            and public.active_term(d.user_id, p.id, v_t.term) is null) q), '[]'::jsonb),
    'request', case when r.id is not null then jsonb_build_object('id', r.id, 'status', r.status, 'shift', r.shift, 'packages', to_jsonb(r.package_ids)) end,
    'trial_left', case when r.id is not null then v_left end,
    'whatsapp', (select value from public.settings where key = 'whatsapp'),
    'trial_lessons', v_lim));
end $$;
