-- «حاضر» — بعد رفع تحضيري «فترة واحدة» و«فترتان» لمادة كانت باقة واحدة لكل المدارس:
-- من اشترك في الباقة القديمة (X) يحصل على اشتراك مماثل في باقة الفترتين (X-2) للفصل نفسه، ما لم يكن معلم «فترة واحدة».
create or replace function public.admin_copy_shift_subs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_subs int; v_reqs int;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  insert into public.subscriptions (user_id, package_id, term_id, plan, revoked)
  select s.user_id, k2.id, s.term_id, s.plan, s.revoked
  from public.subscriptions s
  join public.packages k on k.id = s.package_id and k.shift = 'one'
  join public.packages k2 on k2.id = k.id || '-2' and k2.shift = 'two'
  where coalesce((select r.shift from public.ext_requests r where r.user_id = s.user_id), 'two') <> 'one'
  on conflict (user_id, package_id, term_id) do nothing;
  get diagnostics v_subs = row_count;
  update public.ext_requests r set package_ids = (select array_agg(distinct x) from unnest(r.package_ids || array(
      select k.id || '-2' from unnest(r.package_ids) i join public.packages k on k.id = i and k.shift = 'one'
      where exists (select 1 from public.packages k2 where k2.id = k.id || '-2' and k2.shift = 'two'))) x)
  where r.shift = 'two' and exists (select 1 from unnest(r.package_ids) i join public.packages k on k.id = i and k.shift = 'one'
      where exists (select 1 from public.packages k2 where k2.id = k.id || '-2' and k2.shift = 'two') and not (k.id || '-2') = any (r.package_ids));
  get diagnostics v_reqs = row_count;
  return jsonb_build_object('ok', true, 'subs', v_subs, 'requests', v_reqs);
end $$;
grant execute on function public.admin_copy_shift_subs() to authenticated;
