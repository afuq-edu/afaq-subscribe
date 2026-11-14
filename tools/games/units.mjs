// units.mjs — يكتب site/games/<الباقة>/units.json لكل باقة: [[الوحدة, الدرس, رقم ملف الأنشطة], …] بترتيب الملفات.
// index.json يحمل اسم الدرس وحده، فالدرس الذي يتكرر اسمه في وحدات كثيرة («القراءة الحرة»، «Lesson 9: Review») يأخذ فيه رقمًا واحدًا؛
// «حاضر» (غرف النقاش) يقرأ units.json أولًا ليصل كل درس إلى أنشطة وحدته هو.
//   node tools/games/units.mjs
import fs from 'node:fs';
import path from 'node:path';
const G = path.join(path.dirname(new URL(import.meta.url).pathname), '../../site/games');
let n = 0;
for (const key of fs.readdirSync(G).filter((d) => fs.statSync(path.join(G, d)).isDirectory()).sort()) {
  const files = fs.readdirSync(path.join(G, key)).filter((f) => /^\d+\.json$/.test(f)).map((f) => +f.slice(0, -5)).sort((a, b) => a - b);
  const rows = files.map((k) => { const g = JSON.parse(fs.readFileSync(path.join(G, key, k + '.json'), 'utf8')); return [g.unit || '', g.lesson || '', k]; });
  fs.writeFileSync(path.join(G, key, 'units.json'), JSON.stringify(rows));
  n += rows.length;
}
console.log(`units.json: ${n} lessons`);
