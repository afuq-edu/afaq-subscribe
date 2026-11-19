-- 2026-11-19 (بلاغ المالك): منح نفسه «الباقة الكاملة» من «منح اشتراك»، وكل مرة يفتح «حاضر» بعد تثبيت جديد تعود خدماته
-- «تحضير + واجبات». السبب: name_sub_apply تعمل عند كل عودة للمعلم المسجّل بالاسم (ext_noor / ext_start) وكانت تعيد خدمات
-- كل مواده إلى ما هو مسجّل بجانب الاسم، فتمحو ما منحه المدير لمواد بعينها.
-- القاعدة الآن: خدمات الاسم تُكتب على كل المواد حين يُربط الاسم بالمعلم أول مرة (تسجيل اسم، «فعّل»، أول فتح)،
-- وعند العودة (الاسم مربوط بالمعلم نفسه من قبل: تثبيت جديد، جهاز جديد، «جدّد») تأخذها المواد الجديدة فقط ويبقى القائم كما هو.
-- تغيير خدمات الاسم نفسه يبقى من زر «الخدمات» (admin_name_sub_service) ويسري على كل مواده فورًا.
create or replace function public.name_sub_apply(p_uid uuid, p_ns bigint) returns void
language plpgsql security definer set search_path = public as $$
declare ns public.name_subs; v_ids text[]; v_t int := public.current_term_id(); v_back boolean; v_old bigint[] := '{}';
begin
  select * into ns from public.name_subs where id = p_ns;
  if ns.id is null then return; end if;
  v_ids := case when ns.all_subjects then coalesce((select array_agg(id) from public.packages where active), '{}') else ns.package_ids end;
  if v_t is not null and cardinality(v_ids) > 0 then
    v_back := ns.claimed_user is not null and ns.claimed_user = p_uid;
    if v_back then
      v_old := coalesce((select array_agg(s.id) from public.subscriptions s where s.user_id = p_uid and not s.revoked), '{}');
    end if;
    perform public.grant_subscriptions(p_uid, ns.plan, v_t, v_ids, null);
    if v_back then
      update public.subscriptions s set service = ns.service
       where s.user_id = p_uid and not (s.id = any (v_old)) and s.package_id in (
         select q.id from public.packages p join public.packages q on q.subject = p.subject and q.grade = p.grade
          where p.id = any (v_ids));
    else
      perform public.set_service(p_uid, v_ids, ns.service);
    end if;
  end if;
  update public.ext_requests set status = 'active', activated_at = coalesce(activated_at, now()),
    package_ids = case when ns.all_subjects or cardinality(ns.package_ids) = 0 then package_ids
                       else (select array_agg(distinct x) from unnest(package_ids || ns.package_ids) x) end
    where user_id = p_uid and status <> 'cancelled';
  update public.name_subs set claimed_user = p_uid, claimed_at = coalesce(claimed_at, now()) where id = p_ns;
end $$;
revoke execute on function public.name_sub_apply(uuid, bigint) from public, anon, authenticated;
