-- 2026-11-01 (طلب المالك): معلم مشترك أعاد تثبيت «حاضر» أو ثبّتها على جهاز جديد، وكتب في الأداة اسمه الرباعي نفسه
-- المسجّل في اشتراكه الفعّال: يعود الجهاز إلى اشتراكه مباشرة (دون تجربة ودون «فعّل»)، ويُحفظ الاسم الذي كتبه في طلبه.
-- الشروط: أربعة أسماء على الأقل، تطابق تام بعد توحيد الكتابة (ar_name_norm)، اشتراك فعّال غير ملغى في مادة مما اختاره،
-- ومعلم واحد فقط بهذا الاسم (إن تطابق اثنان يُكمل المسار العادي). حد الأجهزة يبقى: الجهاز العائد يأخذ مكان أقدم جهاز.
-- الاشتراك يبقى لحساب نور المربوط به (ext_noor)، فالاسم وحده لا يفتح التحضير لحساب نور آخر.
create or replace function public.ext_start(p_name text, p_phone text, p_shift text, p_packages text[], p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ip text := public.client_ip_hash(); v_uid uuid := gen_random_uuid(); v_tok text; v_req bigint; v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80);
  v_norm text; v_old uuid[]; v_dev uuid; v_max int := public.setting_int('max_devices', 2);
begin
  if length(v_name) < 3 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if coalesce(p_shift, '') not in ('one', 'two') then return jsonb_build_object('ok', false, 'error', 'shift'); end if;
  if cardinality(coalesce(p_packages, '{}')) = 0 or cardinality(p_packages) > 6
     or exists (select 1 from unnest(p_packages) x where x not in (select id from public.packages where active)) then
    return jsonb_build_object('ok', false, 'error', 'packages');
  end if;
  -- عودة مشترك باسمه الرباعي
  v_norm := public.ar_name_norm(v_name);
  if cardinality(string_to_array(v_norm, ' ')) >= 4 then
    select array_agg(distinct u.uid) into v_old from (
      select r.user_id as uid from public.ext_requests r where r.status <> 'cancelled' and public.ar_name_norm(r.name) = v_norm
      union
      select pr.id from public.profiles pr where public.ar_name_norm(pr.full_name) = v_norm
    ) u
    where not coalesce((select pr.is_admin from public.profiles pr where pr.id = u.uid), false)
      and exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                  where s.user_id = u.uid and s.package_id = any (p_packages) and not s.revoked and public.today_muscat() <= t.ends_on);
    if cardinality(v_old) = 1 then
      v_tok := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
      insert into public.devices (user_id, token_hash, label, last_seen)
      values (v_old[1], encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), left(coalesce(p_label, ''), 80), now())
      returning id into v_dev;
      update public.devices x set revoked_at = now() from (
        select id from public.devices where user_id = v_old[1] and revoked_at is null and id <> v_dev
        order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)) o where x.id = o.id;
      insert into public.ext_requests (user_id, name, phone, shift, package_ids, ip_hash, status, activated_at)
      values (v_old[1], v_name, nullif(trim(coalesce(p_phone, '')), ''), p_shift,
              (select array_agg(distinct x) from unnest(p_packages) x), v_ip, 'active', now())
      on conflict (user_id) do update set name = excluded.name, phone = coalesce(excluded.phone, ext_requests.phone),
        status = case when ext_requests.status = 'cancelled' then 'active' else ext_requests.status end
      returning id into v_req;
      return jsonb_build_object('ok', true, 'token', v_tok, 'request', v_req, 'name', v_name, 'returned', true);
    end if;
  end if;
  -- حد التسجيل اليومي للشبكة يخص الطلبات الجديدة فقط، لا عودة المشترك
  if (select count(*) from public.ext_requests where ip_hash = v_ip and created_at > now() - interval '1 day') >= 6 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;
  insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', true,
          '{"provider":"hader"}'::jsonb, jsonb_build_object('full_name', v_name, 'phone', nullif(trim(coalesce(p_phone, '')), '')), now(), now());
  v_tok := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
  insert into public.devices (user_id, token_hash, label, last_seen)
  values (v_uid, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), left(coalesce(p_label, ''), 80), now());
  insert into public.ext_requests (user_id, name, phone, shift, package_ids, ip_hash)
  values (v_uid, v_name, nullif(trim(coalesce(p_phone, '')), ''), p_shift, (select array_agg(distinct x) from unnest(p_packages) x), v_ip)
  returning id into v_req;
  return jsonb_build_object('ok', true, 'token', v_tok, 'request', v_req, 'name', v_name);
end $$;
grant execute on function public.ext_start(text, text, text, text[], text) to anon, authenticated;
