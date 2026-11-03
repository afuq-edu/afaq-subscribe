-- المالك 2026-11-03 16:42: «مجرد آني أضيف اسم يكون مفعل مباشرة ولا ينتظر التأكيد من قبل المستخدم».
-- قبل هذا: «أضف» في «المسجّلون بالاسم» لا يفعّل إلا معلمًا بلا اشتراك قائم، فمن عنده اشتراك سابق (مثل من فُعّل بـ«فعّل»)
-- يبقى اسمه «ينتظر» ولا يأخذ نوع الخدمة الجديد. الآن: أي حساب في «حاضر» يطابق اسمُ نوره (أو الاسم الذي كتبه) الاسمَ المضاف
-- يُفعَّل فورًا لكل المواد بنوع الاشتراك والخدمة المختارين. ومن لم يفتح «حاضر» بعد يتفعّل وحده حين يفتحه (ext_noor).
create or replace function public.admin_name_sub_add(p_name text, p_plan text, p_all boolean, p_packages text[], p_service text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80); v_id bigint;
  v_uid uuid; v_req bigint; v_hash text; v_nn text;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if coalesce(p_service, '') not in ('prep', 'both', 'hw') then raise exception 'اختر نوع الخدمة: تحضير فقط أو تحضير مع واجب أو واجب فقط'; end if;
  if cardinality(public.name_key(v_name)) < 2 then raise exception 'اكتب اسم المعلم كما يظهر في صفحته في نور'; end if;
  if exists (select 1 from public.name_subs ns where ns.claimed_user is null and public.name_sub_live(ns.plan, ns.term_id, ns.hidden_at)
             and public.noor_name_match(ns.name, v_name)) then
    raise exception 'هذا الاسم مضاف وينتظر صاحبه';
  end if;
  insert into public.name_subs (name, name_norm, plan, all_subjects, service, package_ids, note, term_id)
  values (v_name, public.ar_name_norm(v_name), p_plan, true, p_service, '{}', nullif(trim(coalesce(p_note, '')), ''), public.current_term_id())
  returning id into v_id;
  -- 1) حساب نور قرأته الأداة بهذا الاسم (مربوط أو معلّق)، ولو كان عنده اشتراك سابق
  select nb.user_id, coalesce(nullif(nb.noor_hash, ''), nb.pending_hash), coalesce(nb.noor_name, nb.pending_name) into v_uid, v_hash, v_nn
    from public.noor_bind nb
   where (public.noor_name_match(v_name, nb.noor_name) or public.noor_name_match(v_name, nb.pending_name))
     and coalesce(nullif(nb.noor_hash, ''), nb.pending_hash) is not null
     and not coalesce((select pr.is_admin from public.profiles pr where pr.id = nb.user_id), false)
     and exists (select 1 from public.ext_requests r where r.user_id = nb.user_id and r.status <> 'cancelled')
   order by coalesce(nb.pending_at, nb.bound_at) desc nulls last limit 1;
  if v_uid is not null then
    perform public.name_sub_apply(v_uid, v_id);
    update public.noor_bind set noor_hash = v_hash, noor_name = v_nn, bound_at = coalesce(bound_at, now()), pending_hash = null, pending_name = null, pending_at = null
     where user_id = v_uid;
    select r.id into v_req from public.ext_requests r where r.user_id = v_uid;
    return jsonb_build_object('ok', true, 'id', v_id, 'applied', true, 'request', v_req);
  end if;
  -- 2) طلب في «حاضر» كتب صاحبه هذا الاسم ولم تُقرأ نوره بعد (حين تُقرأ يُربط حسابه كالمعتاد)
  select r.user_id, r.id into v_uid, v_req from public.ext_requests r
   where r.status <> 'cancelled' and public.noor_name_match(v_name, r.name)
     and not coalesce((select pr.is_admin from public.profiles pr where pr.id = r.user_id), false)
     and not exists (select 1 from public.noor_bind nb where nb.user_id = r.user_id and coalesce(nullif(nb.noor_hash, ''), nb.pending_hash) is not null
                     and not public.noor_name_match(v_name, coalesce(nb.noor_name, nb.pending_name)))
   order by r.created_at desc limit 1;
  if v_uid is not null then
    perform public.name_sub_apply(v_uid, v_id);
    return jsonb_build_object('ok', true, 'id', v_id, 'applied', true, 'request', v_req);
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- الأسماء المضافة قبل هذا التعديل وما زالت «تنتظر» وصاحبها قرأت الأداة حساب نوره: تُفعَّل الآن
do $$
declare e record; u uuid;
begin
  for e in select ns.* from public.name_subs ns where ns.claimed_user is null and public.name_sub_live(ns.plan, ns.term_id, ns.hidden_at) loop
    select nb.user_id into u from public.noor_bind nb
     where public.noor_name_match(e.name, nb.noor_name) and nullif(nb.noor_hash, '') is not null
       and not coalesce((select pr.is_admin from public.profiles pr where pr.id = nb.user_id), false)
       and exists (select 1 from public.ext_requests r where r.user_id = nb.user_id and r.status <> 'cancelled')
     order by nb.bound_at desc nulls last limit 1;
    if u is not null then perform public.name_sub_apply(u, e.id); end if;
  end loop;
end $$;
