-- =====================================================================
--  منصة أفق التعليمية — قاعدة بيانات «حاضر» (Supabase / PostgreSQL)
--  نفّذ هذا الملف كاملًا مرة واحدة في: Supabase ← SQL Editor ← New query ← Run
--  آمن للتنفيذ مرة ثانية (يحدّث الدوال ولا يمسح البيانات).
-- =====================================================================

-- ---------- الجداول ----------

-- المعلمون (يُنشأ السجل تلقائيًا عند التسجيل)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  school      text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- الباقات: مادة + صف (اللغة الإنجليزية الأول، اللغة الإنجليزية الثاني… كلٌّ باقة مستقلة)
create table if not exists public.packages (
  id          text primary key,                       -- رمز قصير ثابت، مثل en-5
  subject     text not null,                          -- اللغة الإنجليزية
  grade       smallint not null check (grade between 1 and 12),
  title       text not null,                          -- اللغة الإنجليزية — الخامس
  description text,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- الفصول الدراسية: الاشتراك ينتهي بنهاية ends_on (بتوقيت مسقط)
create table if not exists public.terms (
  id          serial primary key,
  year        text not null,                          -- 2026/2027
  term        smallint not null check (term in (1, 2)),
  starts_on   date not null,
  ends_on     date not null,
  unique (year, term),
  check (ends_on >= starts_on)
);

-- محتوى التحاضير لكل باقة وفصل (ملف «حاضر» كاملًا) — لا يقرؤه إلا المدير، ويُسلَّم للمعلم حصةً حصة
create table if not exists public.package_content (
  package_id     text not null references public.packages(id) on delete cascade,
  term           smallint not null check (term in (1, 2)),
  pkg            jsonb not null,
  lessons_count  int not null default 0,
  sessions_count int not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (package_id, term)
);

-- رموز التفعيل: تُصدر باسم المعلم لفصل محدد وباقة أو أكثر، وتُستعمل مرة واحدة
create table if not exists public.activation_codes (
  code          text primary key,
  teacher_name  text not null,
  phone         text,
  term_id       int not null references public.terms(id),
  package_ids   text[] not null check (cardinality(package_ids) > 0),
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  redeemed_by   uuid references auth.users(id),
  redeemed_at   timestamptz,
  revoked       boolean not null default false
);

-- الاشتراكات: معلم × باقة × فصل
create table if not exists public.subscriptions (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  package_id  text not null references public.packages(id),
  term_id     int not null references public.terms(id),
  code        text references public.activation_codes(code),
  created_at  timestamptz not null default now(),
  revoked     boolean not null default false,
  unique (user_id, package_id, term_id)
);

-- الأجهزة المرتبطة بالإضافة (رمز سري لكل جهاز؛ يُحفظ مُجزّأً فقط)
create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  label       text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  revoked_at  timestamptz
);

-- سجل تسليم الحصص (للحد اليومي والإحصاءات)
create table if not exists public.usage_log (
  id          bigserial primary key,
  user_id     uuid not null,
  device_id   uuid,
  package_id  text,
  term        smallint,
  lesson_id   text,
  at          timestamptz not null default now()
);
create index if not exists usage_log_user_at on public.usage_log (user_id, at);

-- محاولات تفعيل فاشلة (حماية من التخمين)
create table if not exists public.redeem_failures (
  id       bigserial primary key,
  user_id  uuid not null,
  at       timestamptz not null default now()
);
create index if not exists redeem_failures_user_at on public.redeem_failures (user_id, at);

-- نوع الاشتراك: فصلي (فصل واحد) أو سنوي (فصلا العام الدراسي كلاهما)
alter table public.activation_codes add column if not exists plan text not null default 'term';
alter table public.subscriptions    add column if not exists plan text not null default 'term';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'activation_codes_plan_check') then
    alter table public.activation_codes add constraint activation_codes_plan_check check (plan in ('term', 'year'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_plan_check') then
    alter table public.subscriptions add constraint subscriptions_plan_check check (plan in ('term', 'year'));
  end if;
end $$;

-- إعدادات عامة يقرؤها الموقع
create table if not exists public.settings (
  key    text primary key,
  value  text not null default ''
);
insert into public.settings (key, value) values
  ('site_name',    'منصة أفق التعليمية'),
  ('whatsapp',     ''),             -- رقم واتساب بالصيغة الدولية بلا +، مثل 9689XXXXXXX
  ('daily_limit',  '200'),          -- أقصى عدد حصص مختلفة يجلبها المعلم في ٢٤ ساعة
  ('max_devices',  '2'),            -- أقصى عدد أجهزة مرتبطة لكل معلم
  ('extension_url', ''),            -- رابط الإضافة في متجر كروم
  ('announcement', ''),             -- إعلان يظهر أعلى الموقع (اختياري)
  ('price_term',   '5'),            -- سعر الباقة الواحدة للاشتراك الفصلي (ر.ع.)، فارغ = لا يظهر السعر
  ('price_year',   '9')             -- سعر الباقة الواحدة للاشتراك السنوي (ر.ع.)
on conflict (key) do nothing;


-- ---------- دوال مساعدة ----------

create or replace function public.today_muscat() returns date
language sql stable as $$ select (now() at time zone 'Asia/Muscat')::date $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select value from public.settings where key = p_key), '')::int, p_default)
$$;

-- كلمات الاسم بعد التوحيد: الهمزات والتاء المربوطة والياء والتشكيل، «عبد الله» = «عبدالله»، «الحارثي» = «حارثي»
create or replace function public.name_tokens(p text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(regexp_replace(t, '^ال(?=...)', '')) filter (where t <> '' and t not in ('بن', 'بنت', 'ابن')), '{}')
  from unnest(regexp_split_to_array(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p, '')), 'أإآٱىةؤئ', 'اااايهوي'),
        '[ً-ٰٟـ]', '', 'g'),
      'عبد\s+', 'عبد', 'g'),
    '[^[:alnum:]؀-ۿ]+')) as t
$$;

-- هل الاسمان لشخص واحد؟ الاسم الأول نفسه، وكل كلمات الاسم الأقصر موجودة في الأطول (ولا يكفي الاسم الأول وحده)
create or replace function public.names_match(a text, b text) returns boolean
language plpgsql immutable as $$
declare ta text[] := public.name_tokens(a); tb text[] := public.name_tokens(b); s text[]; l text[];
begin
  if cardinality(ta) = 0 or cardinality(tb) = 0 then return false; end if;
  if cardinality(ta) <= cardinality(tb) then s := ta; l := tb; else s := tb; l := ta; end if;
  if cardinality(s) < 2 and cardinality(l) >= 2 then return false; end if;
  return s[1] = l[1] and s <@ l;
end $$;

-- رمز تفعيل: AFQ-XXXX-XXXX من حروف وأرقام لا تلتبس (بلا 0 O 1 I)
create or replace function public.new_code() returns text
language plpgsql volatile as $$
declare
  alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea; c text := ''; idx int[] := array[0,1,2,3,4,5,10,11];
begin
  b := uuid_send(gen_random_uuid());
  for i in 1..8 loop c := c || substr(alpha, 1 + get_byte(b, idx[i]) % 32, 1); end loop;
  return 'AFQ-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
end $$;

-- توحيد ما يكتبه المعلم: مسافات، أحرف صغيرة، أرقام عربية، شرطات
create or replace function public.clean_code(p text) returns text
language sql immutable as $$
  select case when length(x) = 11 then 'AFQ-' || substr(x, 4, 4) || '-' || substr(x, 8, 4) else x end
  from (select regexp_replace(upper(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')), '[^A-Z0-9]', '', 'g') as x) s
$$;

-- مفاتيح المحتوى في الدرس (بنود نور) — تُحذف من «الهيكل» الذي يصل الإضافة
create or replace function public.content_keys() returns text[]
language sql immutable as $$
  select array['outcomes','levels','strategies','resources','concepts','intro','procedures','formative','summative','notes',
               'outcomesOther','levelsOther','strategiesOther','resourcesOther','conceptsOther','introOther','proceduresOther',
               'formativeOther','summativeOther','notesOther']
$$;

-- علامة مائية خفية (محارف بعرض صفري) تحمل رمزًا قصيرًا للمعلم — لتتبّع أي تسريب
create or replace function public.watermark(p_uid uuid) returns text
language plpgsql immutable as $$
declare h text := substr(md5(p_uid::text), 1, 6); bits text := ''; i int;
begin
  for i in 1..length(h) loop
    bits := bits || lpad((('x' || substr(h, i, 1))::bit(4))::text, 4, '0');
  end loop;
  return chr(8288) || translate(bits, '01', chr(8203) || chr(8204)) || chr(8288);
end $$;


-- ---------- الإنشاء التلقائي لملف المعلم ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, school)
  values (new.id,
          coalesce(trim(new.raw_user_meta_data->>'full_name'), ''),
          nullif(trim(new.raw_user_meta_data->>'phone'), ''),
          nullif(trim(new.raw_user_meta_data->>'school'), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- حماية الملف: لا يغيّر المعلم صلاحية المدير، ولا اسمه بعد أول تفعيل (الاسم مرتبط بالرمز)
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;   -- محرر SQL أو المدير
  if new.is_admin is distinct from old.is_admin then raise exception 'غير مسموح'; end if;
  if new.full_name is distinct from old.full_name
     and exists (select 1 from public.subscriptions s where s.user_id = old.id) then
    raise exception 'لا يمكن تغيير الاسم بعد التفعيل — تواصل مع منصة أفق';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();


-- منح اشتراك: الفصلي لفصل واحد، والسنوي لكل فصول العام الدراسي الموجودة (والفصل الثاني يُضاف تلقائيًا عند إنشائه)
create or replace function public.grant_subscriptions(p_uid uuid, p_plan text, p_term_id int, p_package_ids text[], p_code text)
returns void language sql security definer set search_path = public as $$
  insert into public.subscriptions (user_id, package_id, term_id, code, plan)
  select p_uid, pid, t.id, p_code, p_plan
  from unnest(p_package_ids) as pid, public.terms t
  where (p_plan = 'year' and t.year = (select year from public.terms where id = p_term_id)) or (p_plan <> 'year' and t.id = p_term_id)
  on conflict (user_id, package_id, term_id) do update set revoked = false, code = excluded.code,
    plan = case when subscriptions.plan = 'year' then 'year' else excluded.plan end
$$;

-- نهاية الاشتراك: الفصلي بنهاية فصله، والسنوي بنهاية آخر فصول عامه (إن لم يُضف الفصل الثاني بعد فالاشتراك قائم)
create or replace function public.plan_expired(p_plan text, p_term_id int) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_plan = 'year' then
      (select count(*) >= 2 and max(t.ends_on) < public.today_muscat() from public.terms t where t.year = (select year from public.terms where id = p_term_id))
    else (select ends_on < public.today_muscat() from public.terms where id = p_term_id) end
$$;

-- عند إضافة فصل جديد: يحصل عليه كل مشترك سنوي في العام نفسه
create or replace function public.extend_year_subs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, package_id, term_id, code, plan)
  select distinct on (s.user_id, s.package_id) s.user_id, s.package_id, new.id, s.code, 'year'
  from public.subscriptions s join public.terms t on t.id = s.term_id
  where s.plan = 'year' and not s.revoked and t.year = new.year and t.id <> new.id
  on conflict (user_id, package_id, term_id) do nothing;
  return new;
end $$;
drop trigger if exists terms_extend_year on public.terms;
create trigger terms_extend_year after insert on public.terms
  for each row execute function public.extend_year_subs();


-- ---------- صلاحيات الصفوف (RLS) ----------
alter table public.profiles         enable row level security;
alter table public.packages         enable row level security;
alter table public.terms            enable row level security;
alter table public.package_content  enable row level security;
alter table public.activation_codes enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.devices          enable row level security;
alter table public.usage_log        enable row level security;
alter table public.redeem_failures  enable row level security;
alter table public.settings         enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages for select using (active or public.is_admin());
drop policy if exists packages_admin on public.packages;
create policy packages_admin on public.packages for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists terms_read on public.terms;
create policy terms_read on public.terms for select using (true);
drop policy if exists terms_admin on public.terms;
create policy terms_admin on public.terms for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_admin on public.package_content;
create policy content_admin on public.package_content for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists codes_admin on public.activation_codes;
create policy codes_admin on public.activation_codes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists subs_read on public.subscriptions;
create policy subs_read on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists subs_admin on public.subscriptions;
create policy subs_admin on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists devices_admin on public.devices;
create policy devices_admin on public.devices for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists usage_admin on public.usage_log;
create policy usage_admin on public.usage_log for select using (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- المعلم يعدّل اسمه وهاتفه ومدرسته فقط
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, school) on public.profiles to authenticated;
grant update (is_admin) on public.profiles to authenticated;   -- محكوم بالحارس: المدير وحده


-- ---------- دوال الموقع (للمستخدم المسجّل) ----------

-- كتالوج الباقات للعامة: الباقات الفعالة وما جهز من فصولها
create or replace function public.catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'subject', p.subject, 'grade', p.grade, 'title', p.title, 'description', p.description,
    'terms', coalesce((select jsonb_agg(jsonb_build_object('term', c.term, 'lessons', c.lessons_count, 'sessions', c.sessions_count) order by c.term)
                       from public.package_content c where c.package_id = p.id), '[]'::jsonb)
  ) order by p.sort, p.grade, p.subject), '[]'::jsonb)
  from public.packages p where p.active
$$;

-- تفعيل رمز
create or replace function public.redeem_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.clean_code(p_code);
  c public.activation_codes;
  t public.terms;
  v_name text;
  v_titles jsonb;
  fails int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select count(*) into fails from public.redeem_failures where user_id = v_uid and at > now() - interval '1 hour';
  if fails >= 10 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

  select * into c from public.activation_codes where code = v_code for update;
  if c.code is null or c.revoked then
    insert into public.redeem_failures (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', case when c.code is null then 'invalid' else 'revoked' end);
  end if;
  if c.redeemed_by is not null and c.redeemed_by <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'used');
  end if;

  select * into t from public.terms where id = c.term_id;
  if public.plan_expired(c.plan, c.term_id) then return jsonb_build_object('ok', false, 'error', 'expired', 'ends_on', t.ends_on); end if;

  select full_name into v_name from public.profiles where id = v_uid;
  if not public.names_match(v_name, c.teacher_name) then
    insert into public.redeem_failures (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'name', 'code_name', c.teacher_name, 'account_name', v_name);
  end if;

  perform public.grant_subscriptions(v_uid, c.plan, c.term_id, c.package_ids, c.code);

  update public.activation_codes set redeemed_by = v_uid, redeemed_at = coalesce(redeemed_at, now()) where code = c.code;

  select jsonb_agg(p.title order by p.grade, p.subject) into v_titles from public.packages p where p.id = any (c.package_ids);
  return jsonb_build_object('ok', true, 'packages', coalesce(v_titles, '[]'::jsonb), 'plan', c.plan, 'year', t.year, 'term', t.term,
    'ends_on', case when c.plan = 'year' then (select max(x.ends_on) from public.terms x where x.year = t.year) else t.ends_on end);
end $$;

-- اشتراكاتي (للوحة المعلم)
create or replace function public.my_subscriptions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade,
    'year', t.year, 'term', t.term, 'starts_on', t.starts_on, 'ends_on', t.ends_on, 'plan', s.plan,
    'active', (not s.revoked and public.today_muscat() <= t.ends_on),
    'revoked', s.revoked,
    'days_left', greatest(0, t.ends_on - public.today_muscat()),
    'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = t.term),
    'sessions', (select c.sessions_count from public.package_content c where c.package_id = p.id and c.term = t.term)
  ) order by (public.today_muscat() <= t.ends_on) desc, t.ends_on desc, p.grade, p.subject), '[]'::jsonb)
  from public.subscriptions s join public.packages p on p.id = s.package_id join public.terms t on t.id = s.term_id
  where s.user_id = auth.uid()
$$;

-- ربط جهاز (الإضافة): يعيد رمزًا سريًا يُرسل للإضافة مرة واحدة. عند تجاوز الحد يُفصل أقدم جهاز
create or replace function public.link_device(p_label text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tok text;
  v_max int := public.setting_int('max_devices', 2);
  v_dropped int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  with active as (
    select id from public.devices where user_id = v_uid and revoked_at is null
    order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)
  )
  update public.devices d set revoked_at = now() from active where d.id = active.id;
  get diagnostics v_dropped = row_count;
  v_tok := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
  insert into public.devices (user_id, token_hash, label, last_seen)
  values (v_uid, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), left(coalesce(p_label, ''), 80), now());
  return jsonb_build_object('ok', true, 'token', v_tok, 'dropped', v_dropped);
end $$;

create or replace function public.unlink_device(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  with u as (update public.devices set revoked_at = now()
             where id = p_id and user_id = auth.uid() and revoked_at is null returning 1)
  select jsonb_build_object('ok', exists (select 1 from u))
$$;


-- ---------- دوال الإضافة (برمز الجهاز، دون تسجيل دخول) ----------

create or replace function public.ext_device(p_token text, out device_id uuid, out user_id uuid)
language sql security definer set search_path = public as $$
  update public.devices d set last_seen = now()
  where d.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and d.revoked_at is null
  returning d.id, d.user_id
$$;

-- الفصل الفعّال للمعلم في باقة وفصل (١ أو ٢)، أو null
create or replace function public.active_term(p_uid uuid, p_package text, p_term smallint) returns int
language sql stable security definer set search_path = public as $$
  select t.id from public.subscriptions s join public.terms t on t.id = s.term_id
  where s.user_id = p_uid and s.package_id = p_package and t.term = p_term
    and not s.revoked and public.today_muscat() <= t.ends_on
  order by t.ends_on desc limit 1
$$;

-- ---------- «حاضر» مباشرة دون الموقع: تجربة مجانية، طلب اشتراك، تفعيل من لوحة المدير ----------
-- المعلم يختار في الإضافة الصف والمادة ونوع المدرسة، فيُنشأ له حساب خفي ورمز جهاز وطلب (رقمه يظهر له).
-- أول ٣ حصص في كل مادة مختارة مجانًا؛ بعدها يراسل واتساب، والمدير يضغط «فعّل» على طلبه فتفتح مواده وحدها.

-- نوع المدرسة لكل باقة: فترة واحدة (حصة ٤٠ دقيقة) أو فترتان (٣٥ دقيقة) أو كلاهما (المواد القديمة)
alter table public.packages add column if not exists shift text not null default 'both';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'packages_shift_check') then
    alter table public.packages add constraint packages_shift_check check (shift in ('one', 'two', 'both'));
  end if;
end $$;

-- رموز الأجهزة: رمز «device» يربط جهازًا جديدًا بحساب معلم موجود دون منح مواد
alter table public.activation_codes add column if not exists kind text not null default 'sub';

create table if not exists public.ext_requests (
  id            bigint generated by default as identity (start with 1001) primary key,
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  name          text not null default '',
  phone         text,
  shift         text check (shift in ('one', 'two')),
  package_ids   text[] not null default '{}',
  status        text not null default 'trial' check (status in ('trial', 'requested', 'active', 'cancelled')),
  ip_hash       text,
  created_at    timestamptz not null default now(),
  requested_at  timestamptz,
  activated_at  timestamptz
);
alter table public.ext_requests enable row level security;
create index if not exists ext_requests_ip on public.ext_requests (ip_hash, created_at);
insert into public.settings (key, value) values ('trial_lessons', '3') on conflict (key) do nothing;

-- الفصل الجاري (أو القادم إن كنا بين فصلين، أو آخر فصل)
create or replace function public.current_term_id() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.terms where public.today_muscat() between starts_on and ends_on order by starts_on desc limit 1),
    (select id from public.terms where starts_on > public.today_muscat() order by starts_on limit 1),
    (select id from public.terms order by ends_on desc limit 1))
$$;

create or replace function public.client_ip_hash() returns text
language sql stable as $$
  select md5('ext-ip:' || coalesce(nullif(trim(split_part(coalesce((nullif(current_setting('request.headers', true), '')::json)->>'x-forwarded-for', ''), ',', 1)), ''), 'none'))
$$;

-- حصص التجربة المستعملة في باقة (حصص مختلفة)
create or replace function public.trial_used(p_uid uuid, p_package text) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct (u.term, u.lesson_id))::int from public.usage_log u where u.user_id = p_uid and u.package_id = p_package
$$;

-- صلاحية المعلم في باقة وفصل: sub (مشترك) · trial (تجربة) · null
create or replace function public.ext_access(p_uid uuid, p_package text, p_term smallint) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.active_term(p_uid, p_package, p_term) is not null then 'sub'
    when exists (select 1 from public.ext_requests r where r.user_id = p_uid and p_package = any (r.package_ids) and r.status <> 'cancelled')
      and p_term = (select term from public.terms where id = public.current_term_id()) then 'trial'
  end
$$;

-- كتالوج الإضافة (للجميع): الصفوف والمواد الجاهزة في الفصل الجاري، ونوع المدرسة لكل مادة
create or replace function public.ext_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  with t as (select * from public.terms where id = public.current_term_id())
  select jsonb_build_object('ok', true, 'term', (select term from t), 'year', (select year from t), 'ends_on', (select ends_on from t),
    'trial', public.setting_int('trial_lessons', 3),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'subject', p.subject, 'grade', p.grade, 'title', p.title, 'shift', p.shift,
        'lessons', c.lessons_count, 'sessions', c.sessions_count) order by p.grade, p.sort, p.subject)
      from public.packages p join public.package_content c on c.package_id = p.id and c.term = (select term from t)
      where p.active), '[]'::jsonb))
$$;

-- من أنا: الاشتراكات الفعالة + مواد التجربة (مع المتبقي منها) + الطلب
create or replace function public.ext_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests; v_lim int := public.setting_int('trial_lessons', 3); v_t public.terms;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select * into r from public.ext_requests where user_id = d.user_id;
  select * into v_t from public.terms where id = public.current_term_id();
  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'name', (select full_name from public.profiles where id = d.user_id),
    'subs', coalesce((select jsonb_agg(x order by x->>'grade', x->>'subject') from (
        select jsonb_build_object(
              'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade, 'shift', p.shift,
              'year', t.year, 'term', t.term, 'ends_on', t.ends_on,
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = t.term)) x
          from public.subscriptions s join public.packages p on p.id = s.package_id join public.terms t on t.id = s.term_id
          where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on
        union all
        select jsonb_build_object(
              'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade, 'shift', p.shift,
              'year', v_t.year, 'term', v_t.term, 'ends_on', v_t.ends_on, 'trial', true,
              'left', greatest(0, v_lim - public.trial_used(d.user_id, p.id)),
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = v_t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = v_t.term))
          from public.packages p
          where r.id is not null and r.status <> 'cancelled' and p.id = any (r.package_ids)
            and public.active_term(d.user_id, p.id, v_t.term) is null) q), '[]'::jsonb),
    'request', case when r.id is not null then jsonb_build_object('id', r.id, 'status', r.status, 'shift', r.shift, 'packages', to_jsonb(r.package_ids)) end,
    'whatsapp', (select value from public.settings where key = 'whatsapp'),
    'trial_lessons', v_lim));
end $$;

-- هيكل الباقة (الوحدات والدروس وعدد الحصص) دون محتوى البنود — للمشترك ولمن يجرّبها
create or replace function public.ext_structure(p_token text, p_package text, p_term smallint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; v_pkg jsonb;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if public.ext_access(d.user_id, p_package, p_term) is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select c.pkg into v_pkg from public.package_content c where c.package_id = p_package and c.term = p_term;
  if v_pkg is null then return jsonb_build_object('ok', false, 'error', 'not_ready'); end if;
  return jsonb_build_object('ok', true, 'pkg', jsonb_set(v_pkg, '{lessons}', coalesce(
    (select jsonb_agg(l - public.content_keys() order by o) from jsonb_array_elements(v_pkg->'lessons') with ordinality as x(l, o)), '[]'::jsonb)));
end $$;

-- محتوى حصة واحدة لحظة تعبئتها (يتحقق من الاشتراك أو التجربة والحد اليومي، ويضع العلامة المائية)
create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; v_lesson jsonb; v_used int; v_limit int := public.setting_int('daily_limit', 200); v_acc text; v_trial int := public.setting_int('trial_lessons', 3);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  v_acc := public.ext_access(d.user_id, p_package, p_term);
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select l into v_lesson from public.package_content c, jsonb_array_elements(c.pkg->'lessons') l
    where c.package_id = p_package and c.term = p_term and l->>'id' = p_lesson limit 1;
  if v_lesson is null then return jsonb_build_object('ok', false, 'error', 'no_lesson'); end if;
  -- التجربة: أول ٣ حصص مختلفة في المادة (إعادة الحصة نفسها لا تُحتسب)
  if v_acc = 'trial' and not exists (select 1 from public.usage_log u where u.user_id = d.user_id and u.package_id = p_package and u.term = p_term and u.lesson_id = p_lesson)
     and public.trial_used(d.user_id, p_package) >= v_trial then
    return jsonb_build_object('ok', false, 'error', 'trial_over', 'limit', v_trial,
      'request', (select id from public.ext_requests where user_id = d.user_id));
  end if;
  -- الحد اليومي يُحسب بالحصص المختلفة (إعادة المحاولة لنفس الحصة لا تُحتسب)
  if not exists (select 1 from public.usage_log u where u.user_id = d.user_id and u.package_id = p_package and u.term = p_term
                   and u.lesson_id = p_lesson and u.at > now() - interval '24 hours') then
    select count(distinct (u.package_id, u.term, u.lesson_id)) into v_used from public.usage_log u
      where u.user_id = d.user_id and u.at > now() - interval '24 hours';
    if v_used >= v_limit then return jsonb_build_object('ok', false, 'error', 'limit', 'limit', v_limit); end if;
  end if;
  insert into public.usage_log (user_id, device_id, package_id, term, lesson_id) values (d.user_id, d.device_id, p_package, p_term, p_lesson);
  if jsonb_typeof(v_lesson->'procedures') = 'string' and length(v_lesson->>'procedures') > 0 then
    v_lesson := jsonb_set(v_lesson, '{procedures}', to_jsonb((v_lesson->>'procedures') || public.watermark(d.user_id)));
  end if;
  return jsonb_build_object('ok', true, 'lesson', v_lesson,
    'left', case when v_acc = 'trial' then greatest(0, v_trial - public.trial_used(d.user_id, p_package)) end);
end $$;

-- أول استعمال: اسم المعلم ومواده ونوع مدرسته ← حساب خفي + رمز جهاز + طلب (للتجربة ثم التفعيل)
create or replace function public.ext_start(p_name text, p_phone text, p_shift text, p_packages text[], p_label text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ip text := public.client_ip_hash(); v_uid uuid := gen_random_uuid(); v_tok text; v_req bigint; v_name text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 80);
begin
  if length(v_name) < 3 then return jsonb_build_object('ok', false, 'error', 'name'); end if;
  if coalesce(p_shift, '') not in ('one', 'two') then return jsonb_build_object('ok', false, 'error', 'shift'); end if;
  if cardinality(coalesce(p_packages, '{}')) = 0 or cardinality(p_packages) > 6
     or exists (select 1 from unnest(p_packages) x where x not in (select id from public.packages where active)) then
    return jsonb_build_object('ok', false, 'error', 'packages');
  end if;
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

-- إضافة مادة إلى طلب المعلم (أو إنشاء طلب لمعلم مربوط من الموقع)
create or replace function public.ext_pick(p_token text, p_packages text[], p_shift text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests; v_new text[]; v_t smallint := (select term from public.terms where id = public.current_term_id());
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if exists (select 1 from unnest(coalesce(p_packages, '{}')) x where x not in (select id from public.packages where active)) then
    return jsonb_build_object('ok', false, 'error', 'packages');
  end if;
  select * into r from public.ext_requests where user_id = d.user_id for update;
  if r.id is null then
    insert into public.ext_requests (user_id, name, phone, shift, package_ids, ip_hash)
    select d.user_id, coalesce(p.full_name, ''), p.phone, case when p_shift in ('one', 'two') then p_shift end, '{}', public.client_ip_hash()
    from public.profiles p where p.id = d.user_id
    returning * into r;
  end if;
  select array_agg(distinct x) into v_new from unnest(r.package_ids || coalesce(p_packages, '{}')) x;
  if cardinality(v_new) > 12 then return jsonb_build_object('ok', false, 'error', 'packages'); end if;
  update public.ext_requests set package_ids = v_new,
    shift = case when p_shift in ('one', 'two') then p_shift else shift end,
    -- مادة جديدة غير مشترك فيها بعد تفعيل الطلب: يعود الطلب للتجربة حتى يُفعَّل من جديد
    status = case when status in ('active', 'cancelled') and exists (select 1 from unnest(v_new) x where public.active_term(d.user_id, x, v_t) is null) then 'trial' else status end
  where id = r.id;
  return jsonb_build_object('ok', true, 'request', r.id);
end $$;

-- ضغط المعلم زر واتساب: الطلب «بانتظار التفعيل» (يظهر أولًا في لوحة المدير)
create or replace function public.ext_contact(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  update public.ext_requests set status = case when status = 'trial' then 'requested' else status end, requested_at = now()
    where user_id = d.user_id returning * into r;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'no_request'); end if;
  return jsonb_build_object('ok', true, 'request', r.id, 'name', r.name, 'status', r.status,
    'packages', coalesce((select jsonb_agg(p.title order by p.grade, p.subject) from public.packages p where p.id = any (r.package_ids)), '[]'::jsonb),
    'shift', r.shift, 'whatsapp', (select value from public.settings where key = 'whatsapp'));
end $$;

-- تفعيل رمز من داخل الإضافة مباشرة (احتياط لتغيير الجهاز أو للرموز القديمة): الرمز + اسم المعلم.
-- • جهاز جديد: يُنشأ حساب للمعلم باسم الرمز (أو يُستعمل حسابه إن فُعّل الرمز من قبل) ويُعاد رمز الجهاز.
-- • رمز «جهاز جديد» من لوحة المدير: يربط الجهاز بحساب المعلم نفسه (ويفصل أقدم جهاز إن بلغ الحد).
-- • جهاز مربوط (p_token): تُضاف مواد الرمز إلى حساب الجهاز نفسه.
-- الحماية: ١٠ محاولات فاشلة في الساعة لكل عنوان، والرمز يبقى لصاحبه.
create or replace function public.ext_activate(p_code text, p_name text, p_label text default null, p_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := public.clean_code(p_code);
  v_key uuid := public.client_ip_hash()::uuid;
  v_max int := public.setting_int('max_devices', 2);
  c public.activation_codes;
  t public.terms;
  d record;
  v_uid uuid;
  v_name text;
  v_tok text;
  v_titles jsonb;
  fails int;
begin
  select count(*) into fails from public.redeem_failures where user_id = v_key and at > now() - interval '1 hour';
  if fails >= 10 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

  if nullif(p_token, '') is not null then
    select * into d from public.ext_device(p_token);
    if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
    v_uid := d.user_id;
  end if;

  select * into c from public.activation_codes where code = v_code for update;
  if c.code is null or c.revoked then
    insert into public.redeem_failures (user_id) values (v_key);
    return jsonb_build_object('ok', false, 'error', case when c.code is null then 'invalid' else 'revoked' end);
  end if;

  select * into t from public.terms where id = c.term_id;
  if c.kind <> 'device' and public.plan_expired(c.plan, c.term_id) then return jsonb_build_object('ok', false, 'error', 'expired', 'ends_on', t.ends_on); end if;

  if v_uid is not null then
    -- جهاز مربوط: الرمز لصاحب الحساب نفسه
    if c.redeemed_by is not null and c.redeemed_by <> v_uid then return jsonb_build_object('ok', false, 'error', 'used'); end if;
    select full_name into v_name from public.profiles where id = v_uid;
    if not public.names_match(v_name, c.teacher_name) then
      insert into public.redeem_failures (user_id) values (v_key);
      return jsonb_build_object('ok', false, 'error', 'name', 'code_name', c.teacher_name, 'account_name', v_name);
    end if;
  else
    if not public.names_match(p_name, c.teacher_name) then
      insert into public.redeem_failures (user_id) values (v_key);
      return jsonb_build_object('ok', false, 'error', 'name');
    end if;
    if c.redeemed_by is not null then
      v_uid := c.redeemed_by;
      if c.kind = 'device' then
        -- رمز جهاز جديد أصدره المدير: يُفصل أقدم جهاز إن بلغ الحد
        update public.devices x set revoked_at = now() from (
          select id from public.devices where user_id = v_uid and revoked_at is null
          order by coalesce(last_seen, created_at) desc offset greatest(v_max - 1, 0)) o where x.id = o.id;
        update public.activation_codes set revoked = true where code = c.code;   -- يُستعمل مرة واحدة
      elsif (select count(*) from public.devices where user_id = v_uid and revoked_at is null) >= v_max then
        return jsonb_build_object('ok', false, 'error', 'devices', 'max', v_max);
      end if;
    else
      v_uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', true,
              '{"provider":"hader"}'::jsonb, jsonb_build_object('full_name', c.teacher_name, 'phone', c.phone), now(), now());
    end if;
    v_tok := encode(uuid_send(gen_random_uuid()), 'hex') || encode(uuid_send(gen_random_uuid()), 'hex');
    insert into public.devices (user_id, token_hash, label, last_seen)
    values (v_uid, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), left(coalesce(p_label, ''), 80), now());
  end if;

  if c.kind <> 'device' then
    perform public.grant_subscriptions(v_uid, c.plan, c.term_id, c.package_ids, c.code);
    update public.ext_requests set status = 'active', activated_at = now() where user_id = v_uid and status <> 'cancelled'
      and not exists (select 1 from unnest(package_ids) x where public.active_term(v_uid, x, t.term) is null);
  end if;
  update public.activation_codes set redeemed_by = v_uid, redeemed_at = coalesce(redeemed_at, now()) where code = c.code;

  select jsonb_agg(p.title order by p.grade, p.subject) into v_titles from public.packages p where p.id = any (c.package_ids);
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'token', v_tok,
    'name', (select full_name from public.profiles where id = v_uid),
    'packages', coalesce(v_titles, '[]'::jsonb), 'plan', c.plan, 'year', t.year, 'term', t.term,
    'ends_on', case when c.plan = 'year' then (select max(x.ends_on) from public.terms x where x.year = t.year) else t.ends_on end));
end $$;

-- ---------- لوحة المدير: طلبات «حاضر» ----------
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
    'last_seen', (select max(d.last_seen) from public.devices d where d.user_id = r.user_id)
  ) order by case r.status when 'requested' then 0 when 'trial' then 1 when 'active' then 2 else 3 end, coalesce(r.requested_at, r.created_at) desc)
  from public.ext_requests r), '[]'::jsonb);
end $$;

-- «فعّل»: يمنح المعلم مواد طلبه (أو المحددة منها) للفصل الجاري أو للعام كله، فتفتح في الإضافة وحدها
create or replace function public.admin_activate_request(p_id bigint, p_plan text default 'term', p_package_ids text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.ext_requests; v_ids text[]; v_t int := public.current_term_id();
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  select * into r from public.ext_requests where id = p_id for update;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  v_ids := coalesce(p_package_ids, r.package_ids);
  if cardinality(v_ids) = 0 then raise exception 'لا مواد في الطلب'; end if;
  if exists (select 1 from unnest(v_ids) x where x not in (select id from public.packages)) then raise exception 'باقة غير موجودة'; end if;
  perform public.grant_subscriptions(r.user_id, p_plan, v_t, v_ids, null);
  update public.ext_requests set status = 'active', activated_at = now(),
    package_ids = (select array_agg(distinct x) from unnest(r.package_ids || v_ids) x) where id = p_id;
  return jsonb_build_object('ok', true, 'request', p_id, 'packages', to_jsonb(v_ids));
end $$;

-- إلغاء طلب (تتوقف التجربة) أو إعادته
create or replace function public.admin_set_request(p_id bigint, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if p_status not in ('trial', 'requested', 'cancelled') then raise exception 'حالة غير صحيحة'; end if;
  update public.ext_requests set status = p_status where id = p_id;
  return jsonb_build_object('ok', found);
end $$;

-- رمز «جهاز جديد» لمعلم طلبه موجود (يكتبه في الإضافة مع اسمه)
create or replace function public.admin_device_code(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.ext_requests; v text;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  select * into r from public.ext_requests where id = p_id;
  if r.id is null then raise exception 'الطلب غير موجود'; end if;
  loop v := public.new_code(); exit when not exists (select 1 from public.activation_codes where code = v); end loop;
  insert into public.activation_codes (code, teacher_name, phone, term_id, package_ids, note, created_by, plan, kind, redeemed_by, redeemed_at)
  values (v, r.name, r.phone, public.current_term_id(), case when cardinality(r.package_ids) > 0 then r.package_ids else array['-'] end,
          'جهاز جديد — طلب ' || r.id, auth.uid(), 'term', 'device', r.user_id, now());
  return jsonb_build_object('ok', true, 'code', v, 'name', r.name);
end $$;

-- ---------- دوال المدير ----------

-- إصدار رمز (أو عدة رموز بنفس البيانات): فصلي لفصل محدد، أو سنوي لعام الفصل المحدد كله
drop function if exists public.admin_issue_code(text, text, int, text[], text, int);
create or replace function public.admin_issue_code(p_teacher_name text, p_phone text, p_term_id int, p_package_ids text[], p_note text default null, p_count int default 1, p_plan text default 'term')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_codes text[] := '{}'; v text; i int;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if not exists (select 1 from public.terms where id = p_term_id) then raise exception 'اختر الفصل أو العام الدراسي'; end if;
  if coalesce(trim(p_teacher_name), '') = '' then raise exception 'اكتب اسم المعلم'; end if;
  if cardinality(coalesce(p_package_ids, '{}')) = 0 then raise exception 'اختر باقة واحدة على الأقل'; end if;
  if exists (select 1 from unnest(p_package_ids) x where x not in (select id from public.packages)) then raise exception 'باقة غير موجودة'; end if;
  for i in 1..greatest(1, least(coalesce(p_count, 1), 50)) loop
    loop
      v := public.new_code();
      exit when not exists (select 1 from public.activation_codes where code = v);
    end loop;
    insert into public.activation_codes (code, teacher_name, phone, term_id, package_ids, note, created_by, plan)
    values (v, trim(p_teacher_name), nullif(trim(p_phone), ''), p_term_id, p_package_ids, p_note, auth.uid(), p_plan);
    v_codes := v_codes || v;
  end loop;
  return jsonb_build_object('ok', true, 'codes', to_jsonb(v_codes));
end $$;

-- رفع محتوى باقة لفصل (ملف «حاضر») مع حساب عدد الدروس والحصص
create or replace function public.admin_upload_content(p_package text, p_term smallint, p_pkg jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_sessions int; v_lessons int;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if jsonb_typeof(p_pkg->'lessons') <> 'array' or jsonb_array_length(p_pkg->'lessons') = 0 then raise exception 'الملف لا يحتوي حصصًا'; end if;
  if exists (select 1 from jsonb_array_elements(p_pkg->'lessons') l where coalesce(l->>'id', '') = '') then raise exception 'حصة بلا معرّف في الملف'; end if;
  v_sessions := jsonb_array_length(p_pkg->'lessons');
  select count(distinct coalesce(l->>'unit', '') || '|' || coalesce(l->>'lesson', '')) into v_lessons from jsonb_array_elements(p_pkg->'lessons') l;
  insert into public.package_content (package_id, term, pkg, lessons_count, sessions_count, updated_at)
  values (p_package, p_term, p_pkg, v_lessons, v_sessions, now())
  on conflict (package_id, term) do update set pkg = excluded.pkg, lessons_count = excluded.lessons_count,
    sessions_count = excluded.sessions_count, updated_at = now();
  return jsonb_build_object('ok', true, 'lessons', v_lessons, 'sessions', v_sessions);
end $$;

-- لوحة المدير: المعلمون واشتراكاتهم وأجهزتهم واستهلاكهم
create or replace function public.admin_teachers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'phone', p.phone, 'school', p.school, 'is_admin', p.is_admin, 'created_at', p.created_at,
    'email', (select u.email from auth.users u where u.id = p.id),
    'subs', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'package_id', s.package_id, 'title', k.title, 'year', t.year, 'term', t.term, 'plan', s.plan,
               'ends_on', t.ends_on, 'revoked', s.revoked, 'active', not s.revoked and public.today_muscat() <= t.ends_on) order by t.ends_on desc)
             from public.subscriptions s join public.packages k on k.id = s.package_id join public.terms t on t.id = s.term_id where s.user_id = p.id), '[]'::jsonb),
    'devices', (select count(*) from public.devices d where d.user_id = p.id and d.revoked_at is null),
    'used_today', (select count(distinct (u.package_id, u.term, u.lesson_id)) from public.usage_log u where u.user_id = p.id and u.at > now() - interval '24 hours'),
    'used_total', (select count(*) from public.usage_log u where u.user_id = p.id)
  ) order by p.created_at desc) from public.profiles p), '[]'::jsonb);
end $$;

-- إنشاء اشتراك مباشرة لمعلم مسجّل (دون رمز تفعيل)
create or replace function public.admin_grant(p_user uuid, p_plan text, p_term_id int, p_package_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  if coalesce(p_plan, '') not in ('term', 'year') then raise exception 'نوع الاشتراك فصلي أو سنوي'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'المعلم غير موجود'; end if;
  if not exists (select 1 from public.terms where id = p_term_id) then raise exception 'اختر الفصل أو العام الدراسي'; end if;
  if cardinality(coalesce(p_package_ids, '{}')) = 0 then raise exception 'اختر باقة واحدة على الأقل'; end if;
  if exists (select 1 from unnest(p_package_ids) x where x not in (select id from public.packages)) then raise exception 'باقة غير موجودة'; end if;
  perform public.grant_subscriptions(p_user, p_plan, p_term_id, p_package_ids, null);
  select count(*) into n from public.subscriptions s join public.terms t on t.id = s.term_id
    where s.user_id = p_user and s.package_id = any (p_package_ids)
      and ((p_plan = 'year' and t.year = (select year from public.terms where id = p_term_id)) or t.id = p_term_id);
  return jsonb_build_object('ok', true, 'count', n);
end $$;

-- فصل كل أجهزة معلم (عند الاشتباه بمشاركة الحساب)
create or replace function public.admin_reset_devices(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'غير مسموح'; end if;
  update public.devices set revoked_at = now() where user_id = p_user and revoked_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'count', n);
end $$;


-- ---------- صلاحيات تنفيذ الدوال ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.catalog() to anon, authenticated;
grant execute on function public.today_muscat(), public.is_admin(), public.setting_int(text, int) to anon, authenticated;
grant execute on function public.redeem_code(text), public.my_subscriptions(), public.link_device(text), public.unlink_device(uuid) to authenticated;
grant execute on function public.ext_me(text), public.ext_structure(text, text, smallint), public.ext_session(text, text, smallint, text) to anon, authenticated;
grant execute on function public.admin_issue_code(text, text, int, text[], text, int, text), public.admin_upload_content(text, smallint, jsonb),
  public.admin_teachers(), public.admin_reset_devices(uuid), public.admin_grant(uuid, text, int, text[]) to authenticated;
revoke execute on function public.current_term_id(), public.client_ip_hash(), public.trial_used(uuid, text), public.ext_access(uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.ext_catalog(), public.ext_me(text), public.ext_start(text, text, text, text[], text), public.ext_pick(text, text[], text),
  public.ext_contact(text), public.ext_activate(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_requests(), public.admin_activate_request(bigint, text, text[]), public.admin_set_request(bigint, text),
  public.admin_device_code(bigint) to authenticated;

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

-- «حاضر» — التجربة المجانية ٣ حصص للمعلم في كل المواد معًا (لا لكل مادة)
create or replace function public.trial_used_total(p_uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct (u.package_id, u.term, u.lesson_id))::int from public.usage_log u where u.user_id = p_uid
$$;
revoke execute on function public.trial_used_total(uuid) from public, anon, authenticated;

create or replace function public.ext_session(p_token text, p_package text, p_term smallint, p_lesson text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d record; v_lesson jsonb; v_used int; v_limit int := public.setting_int('daily_limit', 200); v_acc text; v_trial int := public.setting_int('trial_lessons', 3);
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  v_acc := public.ext_access(d.user_id, p_package, p_term);
  if v_acc is null then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select l into v_lesson from public.package_content c, jsonb_array_elements(c.pkg->'lessons') l
    where c.package_id = p_package and c.term = p_term and l->>'id' = p_lesson limit 1;
  if v_lesson is null then return jsonb_build_object('ok', false, 'error', 'no_lesson'); end if;
  if v_acc = 'trial' and not exists (select 1 from public.usage_log u where u.user_id = d.user_id and u.package_id = p_package and u.term = p_term and u.lesson_id = p_lesson)
     and public.trial_used_total(d.user_id) >= v_trial then
    return jsonb_build_object('ok', false, 'error', 'trial_over', 'limit', v_trial,
      'request', (select id from public.ext_requests where user_id = d.user_id));
  end if;
  if not exists (select 1 from public.usage_log u where u.user_id = d.user_id and u.package_id = p_package and u.term = p_term
                   and u.lesson_id = p_lesson and u.at > now() - interval '24 hours') then
    select count(distinct (u.package_id, u.term, u.lesson_id)) into v_used from public.usage_log u
      where u.user_id = d.user_id and u.at > now() - interval '24 hours';
    if v_used >= v_limit then return jsonb_build_object('ok', false, 'error', 'limit', 'limit', v_limit); end if;
  end if;
  insert into public.usage_log (user_id, device_id, package_id, term, lesson_id) values (d.user_id, d.device_id, p_package, p_term, p_lesson);
  if jsonb_typeof(v_lesson->'procedures') = 'string' and length(v_lesson->>'procedures') > 0 then
    v_lesson := jsonb_set(v_lesson, '{procedures}', to_jsonb((v_lesson->>'procedures') || public.watermark(d.user_id)));
  end if;
  return jsonb_build_object('ok', true, 'lesson', v_lesson,
    'left', case when v_acc = 'trial' then greatest(0, v_trial - public.trial_used_total(d.user_id)) end);
end $$;

create or replace function public.ext_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r public.ext_requests; v_lim int := public.setting_int('trial_lessons', 3); v_t public.terms; v_left int;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select * into r from public.ext_requests where user_id = d.user_id;
  select * into v_t from public.terms where id = public.current_term_id();
  v_left := greatest(0, v_lim - public.trial_used_total(d.user_id));
  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'name', (select full_name from public.profiles where id = d.user_id),
    'subs', coalesce((select jsonb_agg(x order by x->>'grade', x->>'subject') from (
        select jsonb_build_object(
              'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade, 'shift', p.shift,
              'year', t.year, 'term', t.term, 'ends_on', t.ends_on,
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = t.term)) x
          from public.subscriptions s join public.packages p on p.id = s.package_id join public.terms t on t.id = s.term_id
          where s.user_id = d.user_id and not s.revoked and public.today_muscat() <= t.ends_on
        union all
        select jsonb_build_object(
              'package_id', p.id, 'title', p.title, 'subject', p.subject, 'grade', p.grade, 'shift', p.shift,
              'year', v_t.year, 'term', v_t.term, 'ends_on', v_t.ends_on, 'trial', true,
              'left', v_left,
              'updated', (select extract(epoch from c.updated_at)::bigint from public.package_content c where c.package_id = p.id and c.term = v_t.term),
              'ready', exists (select 1 from public.package_content c where c.package_id = p.id and c.term = v_t.term))
          from public.packages p
          where r.id is not null and r.status <> 'cancelled' and p.id = any (r.package_ids)
            and public.active_term(d.user_id, p.id, v_t.term) is null) q), '[]'::jsonb),
    'request', case when r.id is not null then jsonb_build_object('id', r.id, 'status', r.status, 'shift', r.shift, 'packages', to_jsonb(r.package_ids)) end,
    'trial_left', case when r.id is not null then v_left end,
    'whatsapp', (select value from public.settings where key = 'whatsapp'),
    'trial_lessons', v_lim));
end $$;
