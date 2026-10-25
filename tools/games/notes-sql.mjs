// SQL مختصر يضيف روابط الأنشطة لعدة باقات في أمر واحد (مطابقة اسم الدرس ببصمة md5).
//   node tools/games/notes-sql.mjs <pkg>...
import crypto from 'node:crypto';
import { ready } from './notes.mjs';
const h = s => crypto.createHash('md5').update(s,'utf8').digest('hex').slice(0,6);
const rows = [];
for (const pkg of process.argv.slice(2)) {
  const map = {};
  for (const [name, t] of Object.entries(ready(pkg))) { if (map[h(name)]) throw new Error('collision '+pkg); map[h(name)] = (t.includes('صياد') ? '' : 'x') + t.split('/').pop(); }
  if (Object.keys(map).length) rows.push(`('${pkg}','${JSON.stringify(map)}')`);
}
console.log(`update package_content c set pkg = jsonb_set(c.pkg,'{lessons}',(select jsonb_agg(case when m.v is not null and position('play.html?d=' in coalesce(l->>'notes',''))=0 then jsonb_set(l,'{notes}',to_jsonb(case when btrim(coalesce(l->>'notes',''))='' then '' else rtrim(l->>'notes',E' \\n')||E'\\n\\n' end || case when v.p like 'en-%' then 'Students: complete the lesson activities using this link:' else 'للطالب: حلّ أنشطة الدرس من خلال الرابط:' end || E'\\nhttps://afuq-edu.github.io/afaq-subscribe/play.html?d=' || v.p || '/' || ltrim(m.v,'x'))) else l end order by o) from jsonb_array_elements(c.pkg->'lessons') with ordinality a(l,o) left join lateral (select v.m::jsonb->>left(md5(l->>'lesson'),6) v) m on true)) from (values ${rows.join(',\n')}) v(p,m) where c.term=1 and c.package_id in (v.p, v.p||'-2');`);
