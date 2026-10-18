-- 2026-10-18 (مطبَّق على القاعدة): الاشتراك المدفوع لحساب نور واحد — أول حساب نور يُعبَّأ له يصير صاحبه.
-- «حاضر» يقرأ رقم المعلم في نور (var user_id) ويرسل بصمته sha256('noor:'+id) مع اسمه إلى ext_noor قبل كل تعبئة.
create table if not exists public.noor_bind (
  user_id uuid primary key references auth.users(id) on delete cascade,
  noor_hash text not null,          -- '' = فكّه المدير، يُربط من جديد بأول حساب
  noor_name text,
  bound_at timestamptz not null default now()
);
alter table public.noor_bind enable row level security;
alter table public.devices add column if not exists noor_hash text;   -- حساب نور الظاهر آخر مرة على الجهاز

create or replace function public.ext_noor(p_token text, p_noor text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; b public.noor_bind; v_paid boolean;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if coalesce(p_noor, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', true); end if;
  update public.devices set noor_hash = p_noor where id = d.device_id;
  if coalesce((select pr.is_admin from public.profiles pr where pr.id = d.user_id), false) then return jsonb_build_object('ok', true); end if;
  v_paid := exists (select 1 from public.subscriptions s join public.terms t on t.id = s.term_id
                    where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on);
  if not v_paid then return jsonb_build_object('ok', true); end if;
  select * into b from public.noor_bind where user_id = d.user_id;
  if b.user_id is null or b.noor_hash = '' then
    insert into public.noor_bind (user_id, noor_hash, noor_name) values (d.user_id, p_noor, left(nullif(trim(coalesce(p_name, '')), ''), 120))
    on conflict (user_id) do update set noor_hash = excluded.noor_hash, noor_name = excluded.noor_name, bound_at = now();
    return jsonb_build_object('ok', true, 'bound', true);
  end if;
  if b.noor_hash = p_noor then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', false, 'error', 'noor_other', 'owner', b.noor_name);
end $$;
grant execute on function public.ext_noor(text, text, text) to anon, authenticated;

create or replace function public.admin_noor_reset(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.noor_bind set noor_hash = '', noor_name = null where user_id = (select user_id from public.ext_requests where id = p_id);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.admin_noor_reset(bigint) from anon;
grant execute on function public.admin_noor_reset(bigint) to authenticated;

-- ext_session: بعد حساب v_acc أُضيف:
--   if v_acc = 'sub' and not admin: إن كان للمستخدم ربط (noor_hash <> '') وحساب نور الجهاز معروف ومختلف ← {error:'noor_other', owner}
-- admin_requests: أُضيف الحقل 'noor_name' (اسم حساب نور المربوط).
-- (النصان الكاملان مطبّقان في الهجرتين hader_ext_session_noor وhader_noor_admin)
