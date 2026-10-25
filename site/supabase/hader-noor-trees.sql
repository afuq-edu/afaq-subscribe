-- طُبّق على القاعدة الحية 2026-10-25 (اختبار ext_tree أدناه: RESULT OK).
-- 2026-10-25: شجرة دروس نور لكل مادة — كلما فتح معلم مادة في نور ترسل «حاضر» أسماء وحداتها ودروسها (لا شيء عن المعلم)،
-- مع ما رُبط بكل درس من ملف المادة. الشجرة نفسها لا تُكرر (بصمتها)، والمختلفة بين المدارس تُحفظ نسخةً جديدة.
-- المدير يراها في «الباقات والتحاضير» ← «شجرات نور»: كل درس في الشجرة وهل له تحضير في الملف.
create table if not exists public.noor_trees (
  id          bigserial primary key,
  package_id  text not null,
  term        smallint,
  term_text   text,                     -- اسم الفصل كما في نور
  hash        text not null,            -- بصمة الشجرة: الوحدات والدروس بترتيبها
  units       int, lessons_n int,
  orphans     int,                      -- دروس في الشجرة لم يُربط بها شيء من الملف
  lessons     jsonb not null,           -- [{ u: الوحدة, t: الدرس, f: درس الملف المربوط أو '' , n: عدد حصصه }]
  ver         text,
  seen        int not null default 1,
  first_user  uuid,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  unique (package_id, term, hash)
);
alter table public.noor_trees enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'noor_trees' and policyname = 'noor_trees_admin') then
    create policy noor_trees_admin on public.noor_trees for select using (public.is_admin());
  end if;
end $p$;
-- لا سياسة إدراج أو تعديل: القراءة للمدير وحده (السياسة أعلاه)، والكتابة من ext_tree وحدها (security definer)

create or replace function public.ext_tree(p_token text, p_tree jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; v_pkg text; v_term smallint; v_ls jsonb; v_hash text; v_new int;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  if p_tree is null or jsonb_typeof(p_tree) <> 'object' or jsonb_typeof(p_tree->'lessons') <> 'array'
     or jsonb_array_length(p_tree->'lessons') = 0 or jsonb_array_length(p_tree->'lessons') > 800 then
    return jsonb_build_object('ok', false, 'error', 'tree');
  end if;
  v_pkg := left(p_tree->>'package_id', 60);
  if not exists (select 1 from public.packages where id = v_pkg) then return jsonb_build_object('ok', false, 'error', 'package'); end if;
  v_term := case when (p_tree->>'term') ~ '^\d{1,2}$' then (p_tree->>'term')::smallint end;
  -- النصوص تُقصّ، وما ليس كائنًا يُتخطّى
  select coalesce(jsonb_agg(jsonb_build_object('u', left(coalesce(x->>'u', ''), 200), 't', left(coalesce(x->>'t', ''), 200),
           'f', left(coalesce(x->>'f', ''), 200), 'n', case when (x->>'n') ~ '^\d{1,3}$' then (x->>'n')::int else 0 end) order by o), '[]'::jsonb)
    into v_ls from jsonb_array_elements(p_tree->'lessons') with ordinality as e(x, o) where jsonb_typeof(x) = 'object';
  if jsonb_array_length(v_ls) = 0 then return jsonb_build_object('ok', false, 'error', 'tree'); end if;
  select md5(string_agg((x->>'u') || '|' || (x->>'t'), E'\n' order by o)) into v_hash from jsonb_array_elements(v_ls) with ordinality as e(x, o);
  -- شجرة لم تُرَ من قبل: حدّ لكل حساب في اليوم (لا يملأ أحد الجدول)
  if not exists (select 1 from public.noor_trees where package_id = v_pkg and term is not distinct from v_term and hash = v_hash) then
    select count(*) into v_new from public.noor_trees where first_user = d.user_id and first_at > now() - interval '1 day';
    if v_new >= 40 then return jsonb_build_object('ok', false, 'error', 'limit'); end if;
  end if;
  insert into public.noor_trees (package_id, term, term_text, hash, units, lessons_n, orphans, lessons, ver, first_user)
  values (v_pkg, v_term, left(p_tree->>'term_text', 200), v_hash,
    (select count(distinct x->>'u') from jsonb_array_elements(v_ls) x), jsonb_array_length(v_ls),
    (select count(*) from jsonb_array_elements(v_ls) x where coalesce(x->>'f', '') = ''), v_ls, left(p_tree->>'ver', 40), d.user_id)
  on conflict (package_id, term, hash) do update set seen = noor_trees.seen + 1, last_at = now(),
    lessons = excluded.lessons, orphans = excluded.orphans, ver = excluded.ver, term_text = coalesce(excluded.term_text, noor_trees.term_text);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.ext_tree(text, jsonb) to anon, authenticated;

-- ---------- اختبار (انسخه وشغّله وحده بعد التطبيق؛ ينتهي بـ raise exception فيُلغى كل ما أدرجه) ----------
-- do $$
-- declare v_uid uuid := gen_random_uuid(); v_tok text := 'tree-test-' || gen_random_uuid(); v_pkg text; r jsonb; n int;
-- begin
--   select id into v_pkg from public.packages limit 1;
--   insert into auth.users (instance_id, id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
--   values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', true, '{"provider":"hader"}'::jsonb, '{"full_name":"اختبار الشجرة"}'::jsonb, now(), now());
--   insert into public.devices (user_id, token_hash, label, last_seen) values (v_uid, encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), 'test', now());
--   if public.ext_tree('no-such-token', '{}'::jsonb)->>'error' is distinct from 'unlinked' then raise exception 'RESULT FAIL: unlinked'; end if;
--   if public.ext_tree(v_tok, '{"package_id":"x","lessons":[]}'::jsonb)->>'error' is distinct from 'tree' then raise exception 'RESULT FAIL: empty'; end if;
--   if public.ext_tree(v_tok, '{"package_id":"no-such-pkg","lessons":[{"u":"a","t":"b"}]}'::jsonb)->>'error' is distinct from 'package' then raise exception 'RESULT FAIL: package'; end if;
--   r := jsonb_build_object('package_id', v_pkg, 'term', 1, 'term_text', 'الفصل الأول', 'ver', '4.10.11', 'lessons', jsonb_build_array(
--     jsonb_build_object('u', 'U1', 't', 'L1', 'f', 'Lesson 1', 'n', 2), jsonb_build_object('u', 'U1', 't', 'L2', 'f', '', 'n', 0), 'junk'));
--   if (public.ext_tree(v_tok, r)->>'ok')::boolean is distinct from true then raise exception 'RESULT FAIL: first send'; end if;
--   if (public.ext_tree(v_tok, r)->>'ok')::boolean is distinct from true then raise exception 'RESULT FAIL: second send'; end if;
--   select count(*) into n from public.noor_trees where first_user = v_uid and seen = 2 and lessons_n = 2 and orphans = 1 and units = 1;
--   if n <> 1 then raise exception 'RESULT FAIL: same tree stored twice or counts wrong'; end if;
--   r := jsonb_set(r, '{lessons,1,t}', '"L2 renamed"');
--   perform public.ext_tree(v_tok, r);
--   select count(*) into n from public.noor_trees where first_user = v_uid; if n <> 2 then raise exception 'RESULT FAIL: a different tree was not kept'; end if;
--   raise exception 'RESULT OK: ext_tree سليمة (أُلغيت صفوف الاختبار)';
-- end $$;
