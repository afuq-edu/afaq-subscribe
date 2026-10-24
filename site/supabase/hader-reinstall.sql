-- 2026-10-24 (المالك اختار «نعم تلقائيًا»): إعادة تثبيت «حاضر» (حذف الإضافة، جهاز جديد، الانتقال من الملف إلى المتجر)
-- تمسح رمز الجهاز من الإضافة فيُنشأ للمعلم طلب جديد بتجربة. فإن فُتح بعدها حساب نور نفسه المربوط باشتراك فعّال لمعلم،
-- والاسم المسجّل هو اسمه، يعود الجهاز إلى حسابه وحده دون «فعّل» من المدير: الاشتراك أصلًا لحساب نور واحد وباسم صاحبه.
-- حد الأجهزة يبقى: الجهاز العائد يأخذ مكان أقدم جهاز. الطلب الجديد يُلغى (status = cancelled) فلا يظهر للمدير كطلب ينتظر.
create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; b public.noor_bind; v_reg text; v_name text := left(nullif(trim(coalesce(p_name, '')), ''), 120);
  v_old uuid; v_old_reg text; v_max int := public.setting_int('max_devices', 2);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
  -- عودة بعد إعادة التثبيت: هذا الحساب بلا اشتراك فعّال، وحساب نور المفتوح مربوط باشتراك فعّال لمعلم بالاسم نفسه
  if not exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                 where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on) then
    select nb.user_id into v_old from public.noor_bind nb
     where nb.noor_hash = p_noor and nb.user_id <> d.user_id
       and exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                   where s.user_id = nb.user_id and not s.revoked and public.today_muscat() <= t.ends_on)
     order by nb.bound_at desc limit 1;
    if v_old is not null then
      select r.name into v_reg from public.ext_requests r where r.user_id = d.user_id order by r.created_at desc limit 1;
      select r.name into v_old_reg from public.ext_requests r where r.user_id = v_old order by r.created_at desc limit 1;
      if v_old_reg is null then select pr.full_name into v_old_reg from public.profiles pr where pr.id = v_old; end if;
      if coalesce(v_reg, '') <> '' and coalesce(v_old_reg, '') <> ''
         and (public.noor_name_ok(v_old_reg, v_reg) or public.noor_name_ok(v_reg, v_old_reg)) then
        update public.devices set user_id = v_old, last_seen = now() where id = d.device_id;
        update public.devices x set revoked_at = now() from (
          select id from public.devices where user_id = v_old and revoked_at is null and id <> d.device_id
          order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)) o where x.id = o.id;
        update public.ext_requests set status = 'cancelled' where user_id = d.user_id and status in ('trial', 'requested');
        return jsonb_build_object('ok', true, 'merged', true);
      end if;
    end if;
  end if;
  select * into b from public.noor_bind where user_id = d.user_id;
  if b.user_id is not null and b.noor_hash = p_noor then return jsonb_build_object('ok', true); end if;
  if v_name is null and (b.user_id is null or b.noor_hash = '') then return jsonb_build_object('ok', true); end if;
  select r.name into v_reg from public.ext_requests r where r.user_id = d.user_id order by r.created_at desc limit 1;
  if (b.user_id is null or b.noor_hash = '') and public.noor_name_ok(v_reg, v_name) then
    insert into public.noor_bind (user_id, noor_hash, noor_name) values (d.user_id, p_noor, v_name)
    on conflict (user_id) do update set noor_hash = excluded.noor_hash, noor_name = excluded.noor_name, bound_at = now(),
      pending_hash = null, pending_name = null, pending_at = null;
    return jsonb_build_object('ok', true, 'bound', true);
  end if;
  insert into public.noor_bind (user_id, noor_hash, pending_hash, pending_name, pending_at) values (d.user_id, '', p_noor, v_name, now())
  on conflict (user_id) do update set pending_hash = excluded.pending_hash, pending_name = excluded.pending_name, pending_at = now();
  return jsonb_build_object('ok', false, 'error', 'noor_wait', 'reg', v_reg, 'noor', v_name);
end $$;
grant execute on function public.ext_noor(text, text, text) to anon, authenticated;
