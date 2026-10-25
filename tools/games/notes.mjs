// نص الأنشطة الذي يُضاف تحت «ملاحظات ضمن خطة الدراسة الأسبوعية» (البند العاشر) دون حذف ما فيها.
//   node tools/games/notes.mjs sql <pkg>...          ← SQL يضيف النص في package_content (الفترتان)
//   node tools/games/notes.mjs files <preps dir> <pkg>...  ← يضيفه في ملفات التحاضير المحلية (لإعادة الرفع لاحقًا)
// لا يُضاف إلا لدرس له ملف أنشطة سليم، ولا يُكرَّر إن كان الرابط موجودًا.
import fs from 'node:fs';
import path from 'node:path';
import { check } from './check.mjs';

const SITE = 'https://afuq-edu.github.io/afaq-subscribe/play.html?d=';
const GAMES = path.join(path.dirname(new URL(import.meta.url).pathname), '../../site/games');
export const MARK = 'play.html?d=';

// تعليمة قصيرة للطالب والرابط في سطر وحده (طلب المالك 2026-10-25: بلا شرح للأنشطة، وبالإنجليزية في مواد الإنجليزي)
export function notesText(pkg, n, hunt, en = /^en-/.test(pkg)) {
  return (en ? 'Students: complete the lesson activities using this link:' : 'للطالب: حلّ أنشطة الدرس من خلال الرابط:') + '\n' + SITE + pkg + '/' + n;
}

// اسم الدرس → نص الأنشطة، للدروس التي لها ملف سليم فقط
export function ready(pkg) {
  const idx = JSON.parse(fs.readFileSync(path.join(GAMES, pkg, 'index.json'), 'utf8')), out = {};
  for (const [name, n] of Object.entries(idx)) {
    const f = path.join(GAMES, pkg, n + '.json');
    if (!fs.existsSync(f)) continue;
    const G = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (G.lesson === name && !check(G).length) out[name] = notesText(pkg, n, Array.isArray(G.hunt));
  }
  return out;
}

const append = (notes, text) => (notes || '').includes(MARK) ? notes : ((notes || '').trimEnd() + (notes && notes.trim() ? '\n\n' : '') + text);
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const [mode, ...args] = import.meta.url === `file://${process.argv[1]}` ? process.argv.slice(2) : [];
if (mode === 'sql') {
  for (const pkg of args) {
    const map = ready(pkg);
    if (!Object.keys(map).length) continue;
    console.log(`update package_content c set pkg = jsonb_set(c.pkg, '{lessons}', (
  select jsonb_agg(case when m.t is not null and position(${q(MARK)} in coalesce(l->>'notes','')) = 0
    then jsonb_set(l, '{notes}', to_jsonb(case when btrim(coalesce(l->>'notes','')) = '' then m.t else rtrim(l->>'notes', E' \\n') || E'\\n\\n' || m.t end))
    else l end order by o)
  from jsonb_array_elements(c.pkg->'lessons') with ordinality a(l, o)
  left join lateral (select ${q(JSON.stringify(map))}::jsonb ->> (l->>'lesson') t) m on true))
where c.term = 1 and c.package_id in (${q(pkg)}, ${q(pkg + '-2')});`);
  }
} else if (mode === 'files') {
  const [dir, ...pkgs] = args;
  for (const pkg of pkgs) {
    const map = ready(pkg);
    for (const g of fs.readdirSync(dir)) {
      for (const id of [pkg, pkg + '-2']) {
        const f = path.join(dir, g, id + '-t1.json');
        if (!/^g\d/.test(g) || !fs.existsSync(f)) continue;
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        if ((id === pkg) !== (d.shift !== 'two')) continue;
        let k = 0;
        for (const l of d.lessons) if (map[l.lesson] && !(l.notes || '').includes(MARK)) { l.notes = append(l.notes, map[l.lesson]); k++; }
        if (k) { fs.writeFileSync(f, JSON.stringify(d, null, 1)); console.log(f, k); }
      }
    }
  }
}
