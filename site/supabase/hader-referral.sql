-- «حاضر» — دعوة زميل: كل طلب له رابط دعوة (رقم الطلب)، والمعلم الجديد يُسجَّل «مدعوًّا من» صاحب الرابط.
-- الخصم يحدده المشرف في الإعدادات (referral_discount) ويُطبَّق عند الدفع لكليهما.
alter table public.ext_requests add column if not exists referred_by bigint references public.ext_requests(id) on delete set null;
create index if not exists ext_requests_ref on public.ext_requests (referred_by);
insert into public.settings (key, value) values ('referral_discount', '20%') on conflict (key) do nothing;

-- رقم الدعوة يُسجَّل بعد أول استعمال مباشرة (مرة واحدة، خلال يوم من إنشاء الطلب، ولا يدعو المعلم نفسه)
create or replace function public.ext_set_ref(p_token text, p_ref bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select * into r from public.ext_requests where user_id = d.user_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  if r.referred_by is not null then return jsonb_build_object('ok', true, 'referred_by', r.referred_by); end if;
  if p_ref is null or p_ref = r.id or r.status = 'active' or r.created_at < now() - interval '1 day'
     or not exists (select 1 from public.ext_requests x where x.id = p_ref and x.status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'ref');
  end if;
  update public.ext_requests set referred_by = p_ref where id = r.id;
  return jsonb_build_object('ok', true, 'referred_by', p_ref);
end $$;

-- دعوتي: رقم رابطي، والخصم، ومن دعوتُ ومن اشترك منهم، ومن دعاني
create or replace function public.ext_referral(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select * into r from public.ext_requests where user_id = d.user_id;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  return jsonb_build_object('ok', true, 'request', r.id, 'referred_by', r.referred_by,
    'discount', coalesce((select value from public.settings where key = 'referral_discount'), ''),
    'invited', (select count(*) from public.ext_requests x where x.referred_by = r.id),
    'invited_active', (select count(*) from public.ext_requests x where x.referred_by = r.id and x.status = 'active'));
end $$;

-- طلبات «حاضر» للمشرف (مع الدعوات)
create or replace function public.admin_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_t int := public.current_term_id(); v_tn smallint := (select term from public.terms where id = public.current_term_id());
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', r.id, 'user_id', r.user_id, 'name', r.name, 'phone', r.phone, 'shift', r.shift, 'status', r.status,
    'created_at', r.created_at, 'requested_at', r.requested_at, 'activated_at', r.activated_at,
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
        'used', public.trial_used(r.user_id, p.id), 'active', public.active_term(r.user_id, p.id, v_tn) is not null) order by p.grade, p.subject)
      from public.packages p where p.id = any (r.package_ids)), '[]'::jsonb),
    'devices', (select count(*) from public.devices d where d.user_id = r.user_id and d.revoked_at is null),
    'last_seen', (select max(d.last_seen) from public.devices d where d.user_id = r.user_id),
    'referred_by', r.referred_by,
    'ref_name', (select x.name from public.ext_requests x where x.id = r.referred_by),
    'invited', (select count(*) from public.ext_requests x where x.referred_by = r.id),
    'invited_active', (select count(*) from public.ext_requests x where x.referred_by = r.id and x.status = 'active')
  ) order by case r.status when 'requested' then 0 when 'trial' then 1 when 'active' then 2 else 3 end, coalesce(r.requested_at, r.created_at) desc)
  from public.ext_requests r), '[]'::jsonb);
end $$;

grant execute on function public.ext_set_ref(text, bigint), public.ext_referral(text) to anon, authenticated;
grant execute on function public.admin_requests() to authenticated;
