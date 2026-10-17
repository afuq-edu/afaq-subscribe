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
