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

-- ext_me: كما في hader-direct.sql مع v_admin: موادّ الطلب بلا 'trial'/'left'، وحالة الطلب 'active'، وبلا trial_left.
-- (النص الكامل المطبَّق محفوظ في الهجرة hader_admin_full_access على القاعدة)
