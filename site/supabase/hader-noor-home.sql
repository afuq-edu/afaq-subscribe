-- «حاضر» 4.10.36 (المالك 2026-11-03): الأداة تقرأ اسم المعلم من صفحة نور الرئيسية وترسله وحدها (لا يكتبه المعلم)،
-- ثم تسأل الموقع عبر ext_noor: إن كان المشرف قد سجّل هذا الاسم يُفتح الاشتراك فورًا.
-- هنا: معلم اسمه مسجّل في «المسجّلون بالاسم» لا يوقفه حدّ الطلبات اليومي للشبكة (مدارس كثيرة على عنوان واحد)،
-- ولا يأخذ الاسمُ المكتوب القيدَ: يأخذه حساب نور الذي يطابق اسمه (ext_noor) كما في hader-noor-name.sql.
do $$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ext_start';
  if position('hader-noor-home' in d) > 0 then return; end if;
  n := replace(d, 'if v_ns is null and not public.open_access() and (select count(*) from public.ext_requests where ip_hash = v_ip and created_at > now() - interval ''1 day'') >= 6 then',
                  'if v_ns is null and not public.open_access()
     and not exists (select 1 from public.name_subs ns where public.name_sub_live(ns.plan, ns.term_id, ns.hidden_at) and public.noor_name_match(ns.name, v_name))   -- hader-noor-home: اسم مسجّل لا يوقفه حدّ الشبكة
     and (select count(*) from public.ext_requests where ip_hash = v_ip and created_at > now() - interval ''1 day'') >= 6 then');
  if n = d then raise exception 'ext_start: الموضع غير موجود'; end if;
  execute n;
end $$;

-- «فعّل» على طلب وصل (المالك 2026-11-03): الاسم يصل إلى المشرف فيفعّله ويختار نوع الاشتراك مباشرة — كل مواد المعلم
-- (لا اختيار مواد: المعلم لا يستفيد إلا من مواده في نور). يُسجَّل الاسم في «المسجّلون بالاسم» باسم حساب نور إن قرأته الأداة،
-- ويُفتح اشتراكه الآن، فيكمل «حاضر» وحده عنده خلال ثوانٍ
create or replace function public.admin_request_activate(p_id bigint, p_service text, p_plan text default 'term') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ext_requests; v_name text; v_nn text; v_id bigint;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if coalesce(p_service, '') not in ('prep', 'both', 'hw') then raise exception 'اختر نوع الخدمة: تحضير فقط أو تحضير مع واجب أو واجب فقط'; end if;
  select * into r from public.ext_requests where id = p_id;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  select coalesce(nullif(nb.noor_name, ''), nullif(nb.pending_name, '')) into v_nn from public.noor_bind nb where nb.user_id = r.user_id;
  v_name := left(trim(regexp_replace(coalesce(v_nn, r.name, ''), '\s+', ' ', 'g')), 80);
  if cardinality(public.name_key(v_name)) < 2 then raise exception 'اسم المعلم ناقص: يحتاج اسمين على الأقل كما في نور'; end if;
  insert into public.name_subs (name, name_norm, plan, all_subjects, service, package_ids, note, term_id)
  values (v_name, public.ar_name_norm(v_name), p_plan, true, p_service, '{}', 'من طلب ' || r.id, public.current_term_id())
  returning id into v_id;
  perform public.name_sub_apply(r.user_id, v_id);
  -- حساب نور الذي قرأته الأداة لهذا الطلب (إن كان معلّقًا) يصير حساب اشتراكه
  update public.noor_bind set noor_hash = pending_hash, noor_name = pending_name, bound_at = now(), pending_hash = null, pending_name = null, pending_at = null
   where user_id = r.user_id and pending_hash is not null and coalesce(noor_hash, '') = '';
  return jsonb_build_object('ok', true, 'id', v_id, 'request', r.id, 'name', v_name);
end $$;
revoke execute on function public.admin_request_activate(bigint, text, text) from public, anon;
grant execute on function public.admin_request_activate(bigint, text, text) to authenticated;
