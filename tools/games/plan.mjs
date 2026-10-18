// يجهّز قائمة الدروس لكل مادة وصف من ملفات التحاضير، ويكتب:
//   site/games/<pkg>/index.json   ← اسم الدرس → رقم ملف الأنشطة (يخدم الفترتين)
//   <work>/<pkg>.json             ← محتوى كل درس لكتابة الأسئلة
// الاستعمال: node tools/games/plan.mjs <preps dir> <work dir>
import fs from 'node:fs';
import path from 'node:path';

const [prepsDir, workDir] = process.argv.slice(2);
const site = path.join(path.dirname(new URL(import.meta.url).pathname), '../../site/games');
fs.mkdirSync(workDir, { recursive: true });

const files = [];
for (const g of fs.readdirSync(prepsDir)) {
  const d = path.join(prepsDir, g);
  if (!fs.statSync(d).isDirectory() || !/^g\d/.test(g)) continue;
  for (const f of fs.readdirSync(d)) if (/-t1\.json$/.test(f)) files.push(path.join(d, f));
}
const byBase = {};
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const two = d.shift === 'two', base = two ? d.id.replace(/-2$/, '') : d.id;
  (byBase[base] ||= []).push({ f, two });
}
const cut = (s, n) => (s || '').length > n ? s.slice(0, n) + '…' : (s || '');
let total = 0;
for (const [base, list] of Object.entries(byBase).sort()) {
  list.sort((a, b) => a.two - b.two);   // الفترة الواحدة أولًا
  const lessons = [], at = {};
  let meta;
  for (const { f } of list) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    meta ||= { subject: d.subject, grade: d.grade, gradeNum: d.gradeNum };
    for (const l of d.lessons) {
      if (!(l.lesson in at)) { at[l.lesson] = lessons.length; lessons.push({ n: lessons.length + 1, lesson: l.lesson, unit: l.unit, parts: [] }); }
      const L = lessons[at[l.lesson]];
      if (L.parts.length < 3) L.parts.push({ title: l.title, outcomes: l.outcomes, concepts: l.concepts, intro: cut(l.intro, 700), procedures: cut(l.procedures, 1500), formative: l.formative, summative: l.summative });
    }
  }
  const index = Object.fromEntries(lessons.map((l) => [l.lesson, l.n]));
  fs.mkdirSync(path.join(site, base), { recursive: true });
  fs.writeFileSync(path.join(site, base, 'index.json'), JSON.stringify(index, null, 0));
  fs.writeFileSync(path.join(workDir, base + '.json'), JSON.stringify({ pkg: base, ...meta, lessons }, null, 1));
  total += lessons.length;
}
console.log(Object.keys(byBase).length, 'packages,', total, 'lessons');
