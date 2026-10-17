-- «حاضر» — اشتراك من لوحة الإدارة (المعلمون ← منح اشتراك) يفعّل طلب الإضافة أيضًا: تفتح المواد وحدها، دون رمز
create or replace function public.admin_grant(p_user uuid, p_plan text, p_term_id int, p_package_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'المعلم غير موجود'; end if;
  if not exists (select 1 from public.terms where id = p_term_id) then raise exception 'اختر الفصل أو العام الدراسي'; end if;
  if cardinality(coalesce(p_package_ids, '{}')) = 0 then raise exception 'اختر باقة واحدة على الأقل'; end if;
  if exists (select 1 from unnest(p_package_ids) x where x not in (select id from public.packages)) then raise exception 'باقة غير موجودة'; end if;
  perform public.grant_subscriptions(p_user, p_plan, p_term_id, p_package_ids, null);
  update public.ext_requests set status = 'active', activated_at = coalesce(activated_at, now()),
    package_ids = (select array_agg(distinct x) from unnest(package_ids || p_package_ids) x)
    where user_id = p_user and status <> 'cancelled';
  select count(*) into n from public.subscriptions s join public.terms t on t.id = s.term_id
    where s.user_id = p_user and s.package_id = any (p_package_ids)
      and ((p_plan = 'year' and t.year = (select year from public.terms where id = p_term_id)) or t.id = p_term_id);
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- عناوين الباقات تذكر نوع المدرسة حتى لا يتكرر «العلوم — الرابع» مرتين (طُبّق مرة واحدة 2026-10-17)
update public.packages set title = regexp_replace(title, '\s*\((فترتان|فترة واحدة)\)$', '') || case shift when 'two' then ' (فترتان)' else ' (فترة واحدة)' end
  where shift in ('one', 'two') and title !~ '\((فترتان|فترة واحدة)\)$';
