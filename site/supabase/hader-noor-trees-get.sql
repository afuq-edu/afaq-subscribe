-- 2026-10-25: «حاضر» تستفيد من الشجرات المحفوظة — إذا لم تظهر دروس الشجرة في نور أو جاءت ناقصة، ولا شجرة محفوظة على الجهاز،
-- تأخذ آخر شجرة كاملة لنفس المادة والفصل قرأها أي معلم (الأكثر تكرارًا بين المدارس، ثم الأحدث). أسماء دروس فقط، لا شيء عن المعلمين.
create or replace function public.ext_tree_get(p_token text, p_package text, p_term int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d record; r record;
begin
  select * into d from public.ext_device(p_token);
  if d.user_id is null then return jsonb_build_object('ok', false, 'error', 'unlinked'); end if;
  select lessons, last_at, seen into r from public.noor_trees
   where package_id = left(p_package, 60) and term is not distinct from p_term::smallint and last_at > now() - interval '120 days'
   order by seen desc, last_at desc limit 1;
  if r.lessons is null then return jsonb_build_object('ok', true, 'lessons', '[]'::jsonb); end if;
  return jsonb_build_object('ok', true, 'seen', r.seen, 'at', extract(epoch from r.last_at) * 1000,
    'lessons', (select coalesce(jsonb_agg(jsonb_build_object('u', x->>'u', 't', x->>'t') order by o), '[]'::jsonb)
                  from jsonb_array_elements(r.lessons) with ordinality as e(x, o)));
end $$;
grant execute on function public.ext_tree_get(text, text, int) to anon, authenticated;
