-- 2026-10-20: سجل تعبئة صامت — «حاضر» ترسل بعد كل حصة (وعند بدء التعبئة وانتهائها) سطرًا إلى ext_log دون أن يرى المعلم شيئًا،
-- والمدير يقرأه في لوحته تحت كل طلب («سجل التعبئة» ← admin_fill_log). الإرسال في الخلفية: لا يوقف التعبئة ولا يبطئها، وأخطاؤه تُتجاهل.
create table if not exists public.fill_log (
  id            bigserial primary key,
  user_id       uuid not null,
  device_id     uuid,
  run_id        text,                          -- تشغيلة المعالج في الإضافة (WIZ.rid)
  mode          text,                          -- 'pick' حصص مختارة · 'term' الفصل كاملًا · ''
  ver           text,                          -- نسخة الإضافة
  package_id    text, term smallint,
  lesson_id     text, lesson_title text,       -- الحصة في ملف المادة
  noor_lesson   text, noor_unit text,          -- الدرس والوحدة المختاران في شجرة نور
  pub_date      date,                          -- تاريخ النشر الذي وُضع في نور (null إن لم يوضع)
  moved_from    date,                          -- التاريخ الأصلي إن زُحزحت الحصة
  status        text not null check (status in ('start', 'saved', 'unconfirmed', 'failed', 'skipped', 'end')),
  note          text,                          -- سبب أو خلاصة قصيرة (≤ ٣٠٠ حرف)
  client_at     timestamptz,                   -- وقت الحدث على جهاز المعلم
  at            timestamptz not null default now()
);
create index if not exists fill_log_user_at on public.fill_log (user_id, at desc);
-- الدفعة نفسها قد تصل مرتين (انقطع الرد بعد الحفظ فأعادتها الإضافة، أو نافذتان تقرآن الطابور نفسه): مفتاح الصف الطبيعي يُدرج مرة واحدة
create unique index if not exists fill_log_once on public.fill_log (user_id, run_id, lesson_id, status, client_at);
alter table public.fill_log enable row level security;
drop policy if exists fill_log_admin on public.fill_log;
create policy fill_log_admin on public.fill_log for select using (public.is_admin());
revoke all on table public.fill_log from anon, authenticated;
grant select on public.fill_log to authenticated;                           -- محكوم بالسياسة: المدير وحده
revoke all on sequence public.fill_log_id_seq from anon, authenticated;     -- الإدراج من ext_log وحدها

-- تحويل آمن لما يرسله العميل من تواريخ: قيمة معطوبة ← null بدل خطأ يوقف السجل كله
create or replace function public.safe_date(t text) returns date language plpgsql immutable as $$
begin
  if coalesce(t, '') !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(t, 10)::date;
exception when others then return null;
end $$;
create or replace function public.safe_ts(t text) returns timestamptz language plpgsql stable as $$
begin
  if coalesce(t, '') !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return t::timestamptz;
exception when others then return null;
end $$;
revoke execute on function public.safe_date(text), public.safe_ts(text) from public, anon, authenticated;

-- «حاضر» ترسل دفعة أسطر (≤ ١٠٠) عن تشغيلة تعبئة: المستخدم والجهاز من رمز الجهاز لا من العميل
create or replace function public.ext_log(p_token text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r jsonb; n int := 0; k int;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then return jsonb_build_object('ok', false, 'error', 'rows'); end if;
  for r in select x from jsonb_array_elements(p_rows) x loop
    if jsonb_typeof(r) <> 'object' then continue; end if;
    -- النصوص تُقصّ، والحالة المجهولة = failed، والتاريخ المعطوب = null (لا يُرفع خطأ لبيانات عميل سيئة)، والصف المكرر (إعادة إرسال) يُتجاهل
    insert into public.fill_log (user_id, device_id, run_id, mode, ver, package_id, term, lesson_id, lesson_title, noor_lesson, noor_unit, pub_date, moved_from, status, note, client_at)
    values (d.user_id, d.device_id, left(r->>'run_id', 200), left(r->>'mode', 200), left(r->>'ver', 200), left(r->>'package_id', 200),
      case when (r->>'term') ~ '^\d{1,4}$' then (r->>'term')::smallint end,
      left(r->>'lesson_id', 200), left(r->>'lesson_title', 200), left(r->>'noor_lesson', 200), left(r->>'noor_unit', 200),
      public.safe_date(r->>'pub_date'), public.safe_date(r->>'moved_from'),
      case when r->>'status' in ('start', 'saved', 'unconfirmed', 'failed', 'skipped', 'end') then r->>'status' else 'failed' end,
      left(r->>'note', 300), public.safe_ts(r->>'client_at'))
    on conflict do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return jsonb_build_object('ok', true, 'n', n);
end $$;
grant execute on function public.ext_log(text, jsonb) to anon, authenticated;

-- لوحة المدير: سجل تعبئة صاحب الطلب، الأحدث أولًا، مع عنوان الباقة
create or replace function public.admin_fill_log(p_request bigint, p_limit int default 400) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', f.id, 'user_id', f.user_id, 'device_id', f.device_id, 'run_id', f.run_id, 'mode', f.mode, 'ver', f.ver,
    'package_id', f.package_id, 'title', p.title, 'term', f.term, 'lesson_id', f.lesson_id, 'lesson_title', f.lesson_title,
    'noor_lesson', f.noor_lesson, 'noor_unit', f.noor_unit, 'pub_date', f.pub_date, 'moved_from', f.moved_from,
    'status', f.status, 'note', f.note, 'client_at', f.client_at, 'at', f.at) order by f.at desc, f.id desc)
  from (select * from public.fill_log where user_id = (select user_id from public.ext_requests where id = p_request)
        order by at desc, id desc limit least(greatest(coalesce(p_limit, 400), 1), 5000)) f
  left join public.packages p on p.id = f.package_id), '[]'::jsonb);
end $$;
revoke execute on function public.admin_fill_log(bigint, int) from public, anon;
grant execute on function public.admin_fill_log(bigint, int) to authenticated;

-- ---------- اختبار (انسخه وشغّله وحده بعد التطبيق؛ ينتهي بـ raise exception فيُلغى كل ما أدرجه ولا يبقى صف) ----------
-- do $$
-- declare v_uid uuid := gen_random_uuid(); v_tok text := 'fill-log-test-' || gen_random_uuid(); v_req bigint; v_admin uuid; r jsonb; n int;
-- begin
--   insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
--   values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', true, '{"provider":"hader"}'::jsonb, '{"full_name":"اختبار السجل"}'::jsonb, now(), now());
--   insert into public.devices (user_id, token_hash, label, last_seen) values (v_uid, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), 'test', now());
--   insert into public.ext_requests (user_id, name) values (v_uid, 'اختبار السجل') returning id into v_req;
--   -- رمز غير مربوط ← unlinked؛ ليس مصفوفة ← rows؛ أكثر من ١٠٠ سطر ← rows
--   if public.ext_log('no-such-token', '[]'::jsonb)->>'error' is distinct from 'unlinked' then raise exception 'RESULT FAIL: unlinked'; end if;
--   if public.ext_log(v_tok, '{}'::jsonb)->>'error' is distinct from 'rows' then raise exception 'RESULT FAIL: not an array'; end if;
--   if public.ext_log(v_tok, (select jsonb_agg('{"status":"saved"}'::jsonb) from generate_series(1, 101)))->>'error' is distinct from 'rows' then raise exception 'RESULT FAIL: > 100 rows'; end if;
--   -- سطر سليم + سطر معطوب (حالة مجهولة، فصل وتواريخ غير صالحة، ملاحظة طويلة، معرّف مستخدم مزيّف يُتجاهل) + عنصر ليس كائنًا يُتخطّى
--   r := public.ext_log(v_tok, jsonb_build_array(
--     jsonb_build_object('run_id', '1', 'mode', 'term', 'ver', '4.10.5', 'package_id', 'en-5', 'term', 1, 'lesson_id', 'L1', 'lesson_title', 'درس', 'noor_lesson', 'درس نور',
--       'noor_unit', 'وحدة', 'pub_date', '2026-10-20', 'moved_from', '2026-10-19', 'status', 'saved', 'note', 'ok', 'client_at', '2026-10-20T10:00:00Z'),
--     jsonb_build_object('user_id', gen_random_uuid(), 'status', 'zzz', 'term', 'x', 'pub_date', '2026-13-45', 'moved_from', 'yesterday', 'client_at', 'bad', 'note', repeat('n', 400)),
--     'not-an-object'));
--   if (r->>'ok')::boolean is distinct from true or (r->>'n')::int <> 2 then raise exception 'RESULT FAIL: ext_log returned %', r; end if;
--   select count(*) into n from public.fill_log where user_id = v_uid and status = 'saved' and pub_date = '2026-10-20' and moved_from = '2026-10-19' and term = 1
--     and client_at = '2026-10-20T10:00:00Z'::timestamptz and run_id = '1' and ver = '4.10.5';
--   if n <> 1 then raise exception 'RESULT FAIL: الصف السليم لم يُحفظ كما هو'; end if;
--   select count(*) into n from public.fill_log where user_id = v_uid and status = 'failed' and pub_date is null and moved_from is null and term is null and client_at is null and length(note) = 300;
--   if n <> 1 then raise exception 'RESULT FAIL: الصف المعطوب لم يُنظَّف'; end if;
--   if exists (select 1 from public.fill_log where user_id = v_uid and device_id is null) then raise exception 'RESULT FAIL: الجهاز لم يُسجَّل'; end if;
--   -- إعادة إرسال الصف السليم نفسه (كما بعد انقطاع الرد): لا يُدرج ثانية
--   r := public.ext_log(v_tok, jsonb_build_array(jsonb_build_object('run_id', '1', 'lesson_id', 'L1', 'status', 'saved', 'client_at', '2026-10-20T10:00:00Z', 'note', 'again')));
--   if (r->>'ok')::boolean is distinct from true or (r->>'n')::int <> 0 then raise exception 'RESULT FAIL: الصف المكرر أُدرج ثانية (%)', r; end if;
--   select count(*) into n from public.fill_log where user_id = v_uid; if n <> 2 then raise exception 'RESULT FAIL: عدد الصفوف بعد الإعادة % لا ٢', n; end if;
--   -- admin_fill_log: يرفض غير المدير (auth.uid() فارغ هنا)
--   begin perform public.admin_fill_log(v_req); raise exception 'RESULT FAIL: admin_fill_log لم يرفض غير المدير';
--   exception when others then if sqlerrm not like '%غير مسموح%' then raise; end if; end;
--   -- وبصفة المدير (إن وُجد حساب مدير): يعيد الصفين الأحدث أولًا مع عنوان الباقة
--   select id into v_admin from public.profiles where is_admin limit 1;
--   if v_admin is not null then
--     perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
--     perform set_config('request.jwt.claim.sub', v_admin::text, true);
--     r := public.admin_fill_log(v_req);
--     if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> 2 or r->0->>'status' <> 'failed' or r->1->>'status' <> 'saved' then raise exception 'RESULT FAIL: admin_fill_log returned %', r; end if;
--     if not (r->1 ? 'title') then raise exception 'RESULT FAIL: admin_fill_log بلا عنوان الباقة'; end if;
--     if jsonb_array_length(public.admin_fill_log(v_req, 1)) <> 1 then raise exception 'RESULT FAIL: p_limit'; end if;
--   end if;
--   raise exception 'RESULT OK: ext_log وadmin_fill_log سليمتان (أُلغيت صفوف الاختبار)';
-- end $$;
