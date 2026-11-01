// build.mjs — ملفات الواجبات (مثل ملفات التحضير): لكل باقة أنشطة في site/games ملف site/homework/<الباقة>.json
// فيه لكل درس (باسمه في ملف التحضير) خمسة أسئلة بإجاباتها، تأخذها «حاضر» إلى «المهام الإلكترونية» في نور.
// وصفحة مقروءة لكل مادة للمراجعة: <out>/<الباقة>.html و<out>/index.html
// الاستعمال: node tools/homework/build.mjs [مجلد صفحات المراجعة] [باقات…]
// ملف موجود يُعدَّل يدويًا لا يُكتب فوقه إلا بـ --force (التعديل اليدوي هو المرجع).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestions } from '../../extension/homework.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const rest = args.filter((a) => a !== '--force');
const OUT = rest[0] || '/mnt/project-files/afaq-platform/homework';
const only = rest.slice(1);
const GAMES = path.join(REPO, 'site/games'), HW = path.join(REPO, 'site/homework');
fs.mkdirSync(HW, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isAr = (s) => /[؀-ۿ]/.test(String(s || ''));
const keys = [...new Set(fs.readdirSync(GAMES).filter((k) => fs.existsSync(path.join(GAMES, k, 'index.json')))
  .concat(fs.readdirSync(HW).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))))].filter((k) => !only.length || only.includes(k)).sort();
// ترتيب الدروس في صفحة المراجعة كما في ملف التحضير (الفصل الأول، فترة واحدة)
const PREPS = '/mnt/project-files/afaq-platform/preps';
const prepOrder = (key) => {
  try {
    for (const d of fs.readdirSync(PREPS)) { const f = path.join(PREPS, d, `${key}-t1.json`); if (/^g/.test(d) && fs.existsSync(f)) return [...new Set(JSON.parse(fs.readFileSync(f, 'utf8')).lessons.map((l) => l.lesson))]; }
  } catch (e) {}
  return null;
};
const summary = [];
for (const key of keys) {
  const file = path.join(HW, key + '.json');
  let doc;
  if (fs.existsSync(file) && !force) doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    if (!fs.existsSync(path.join(GAMES, key, 'index.json'))) continue;
    const idx = JSON.parse(fs.readFileSync(path.join(GAMES, key, 'index.json'), 'utf8'));
    doc = { key, subject: '', grade: 0, note: 'خمسة أسئلة لكل درس: a = رقم الخيار الصحيح (اختيار من متعدد) أو true/false (صح وخطأ)', lessons: {} };
    const order = Object.entries(idx).sort((a, b) => a[1] - b[1]);
    for (const [name, n] of order) {
      const f = path.join(GAMES, key, `${n}.json`);
      if (!fs.existsSync(f)) continue;
      const g = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!doc.subject) { doc.subject = g.subject || ''; doc.grade = g.grade || 0; }
      const qs = buildQuestions(g);
      if (qs.length === 5) doc.lessons[name] = qs;
    }
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
  }
  const ord = prepOrder(key);
  const names = Object.keys(doc.lessons).sort((a, b) => (ord ? (ord.indexOf(a) + 1 || 1e4) - (ord.indexOf(b) + 1 || 1e4) : 0));
  summary.push({ key, subject: doc.subject, grade: doc.grade, n: names.length });
  // صفحة المراجعة
  const dir = isAr(doc.subject + names.join('')) && !/^en-/.test(key) ? 'rtl' : 'ltr';
  const body = names.map((name, i) => `<section><h2>${i + 1}. ${esc(name)}</h2><ol>${doc.lessons[name].map((q) => q.t === 'tf'
    ? `<li><span class="k">صح أو خطأ</span> ${esc(q.q)} <b class="ans">${q.a ? 'صح' : 'خطأ'}</b></li>`
    : `<li><span class="k">اختيار</span> ${esc(q.q)}<ul>${q.o.map((o, k) => `<li class="${k + 1 === q.a ? 'ok' : ''}">${esc(o)}${k + 1 === q.a ? ' ✓' : ''}</li>`).join('')}</ul></li>`).join('')}</ol></section>`).join('\n');
  fs.writeFileSync(path.join(OUT, key + '.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>واجبات ${esc(doc.subject)} — الصف ${doc.grade}</title><style>body{font:15px/1.7 Tahoma,Arial,sans-serif;margin:0;padding:16px;background:#f6f8f8;color:#1d2b2a}
h1{color:#0d6e66;font-size:22px}section{background:#fff;border-radius:12px;padding:12px 16px;margin:12px 0;box-shadow:0 1px 3px #0001}
h2{font-size:17px;margin:4px 0 8px;color:#0d6e66}section ol{direction:${dir}}li{margin:6px 0}.k{font-size:12px;background:#e6f3f1;color:#0d6e66;border-radius:6px;padding:1px 6px;margin-inline-end:6px}
.ok{font-weight:bold;color:#0b7a3b}.ans{color:#0b7a3b;margin-inline-start:8px}</style></head><body>
<h1>واجبات ${esc(doc.subject)} — الصف ${doc.grade} (الفصل الأول)</h1><p>${names.length} درسًا · لكل درس خمسة أسئلة (٣ اختيار من متعدد + ٢ صح وخطأ)، لكل سؤال درجتان. الإجابة الصحيحة بالأخضر.</p>
${body}</body></html>\n`);
}
summary.sort((a, b) => a.grade - b.grade || a.subject.localeCompare(b.subject, 'ar'));
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ملفات الواجبات</title>
<style>body{font:15px/1.8 Tahoma,Arial,sans-serif;margin:0;padding:16px;background:#f6f8f8}h1{color:#0d6e66}a{color:#0d6e66}td,th{padding:4px 10px;border-bottom:1px solid #ddd;text-align:right}</style></head><body>
<h1>ملفات الواجبات — الفصل الأول</h1><p>${summary.length} مادة · ${summary.reduce((a, x) => a + x.n, 0)} درسًا</p><table><tr><th>الصف</th><th>المادة</th><th>الدروس</th></tr>
${summary.map((x) => `<tr><td>${x.grade}</td><td><a href="${x.key}.html">${esc(x.subject)}</a></td><td>${x.n}</td></tr>`).join('\n')}</table></body></html>\n`);
console.log(`homework files: ${summary.length} packages, ${summary.reduce((a, x) => a + x.n, 0)} lessons → site/homework/ · review pages → ${OUT}`);
const thin = summary.filter((x) => !x.n);
if (thin.length) console.log('no lessons:', thin.map((x) => x.key).join(', '));
