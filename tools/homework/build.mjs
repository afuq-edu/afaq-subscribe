// build.mjs — ملفات الواجبات (مثل ملفات التحضير): لكل باقة أنشطة في site/games ملف site/homework/<الباقة>.json
// فيه لكل درس (باسمه في ملف التحضير) خمسة أسئلة بإجاباتها، تأخذها «حاضر» إلى «المهام الإلكترونية» في نور.
// وصفحة مقروءة لكل مادة للمراجعة: <out>/<الباقة>.html و<out>/index.html
// الاستعمال: node tools/homework/build.mjs [مجلد صفحات المراجعة] [باقات…] [--sessions] [--force]
// ملف موجود يُعدَّل يدويًا لا يُكتب فوقه إلا بـ --force (التعديل اليدوي هو المرجع).
// لكل حصة واجب (المالك 2026-11-07): sessions[«الدرس»] = مجموعات الحصة الثانية فما بعدها (خمسة أسئلة لكل حصة)، بعدد حصص الدرس
// في ملفي التحضير (الفترتان)، من أسئلة أنشطة الدرس التي لم تأتِ في واجب الحصة الأولى. --sessions يعيد بناءها وحدها (lessons كما هي).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestions } from '../../extension/homework.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const force = args.includes('--force'), redoSessions = args.includes('--sessions');
const rest = args.filter((a) => a !== '--force' && a !== '--sessions');
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
// عدد حصص كل درس: الأكبر بين ملفي الفترتين
const sessionCounts = (key) => {
  const out = new Map();
  try {
    for (const d of fs.readdirSync(PREPS)) {
      if (!/^g/.test(d)) continue;
      for (const f of [`${key}-t1.json`, `${key}-2-t1.json`]) {
        const file = path.join(PREPS, d, f);
        if (!fs.existsSync(file)) continue;
        const c = new Map(); JSON.parse(fs.readFileSync(file, 'utf8')).lessons.forEach((l) => c.set(l.lesson, (c.get(l.lesson) || 0) + 1));
        c.forEach((v, k) => out.set(k, Math.max(out.get(k) || 0, v)));
      }
    }
  } catch (e) {}
  return out;
};
const clean = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
const rotate = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);
// مجموعات أسئلة الحصص ٢…k من أنشطة الدرس: اختيار من متعدد (mcq ثم الصناديق ثم الصيد بالتناوب) وصح وخطأ، بنمط واجب الحصة الأولى
// (اختيار، صح وخطأ، اختيار، صح وخطأ، اختيار)، دون ما في واجب الحصة الأولى؛ تدور على الأسئلة إن نفدت. ثابتة لا عشوائية
export function sessionSets(game, first, count) {
  if (!game || count < 1) return [];
  const used = new Set((first || []).map((q) => clean(q.q)));
  const ok = (q, o) => q && Array.isArray(o) && o.length >= 2 && o.every((x) => clean(x)) && !used.has(clean(q));
  const src = [
    (game.mcq || []).filter((x) => x && ok(x.q, x.o)).map((x) => ({ q: clean(x.q), o: x.o.slice(0, 6).map(clean) })),
    (game.boxes || []).filter((x) => x && ok(x.q, x.o)).map((x) => ({ q: clean(x.q), o: x.o.slice(0, 6).map(clean) })),
    (game.hunt || []).filter((x) => x && ok(x.q, [x.a].concat(x.d || []))).map((x) => ({ q: clean(x.q), o: [x.a].concat(x.d || []).slice(0, 6).map(clean) })),
  ];
  const mc = []; for (let i = 0; src.some((l) => i < l.length); i++) src.forEach((l) => { if (i < l.length && !mc.some((y) => y.q === l[i].q)) mc.push(l[i]); });
  const tf = (game.tf || []).filter((x) => x && clean(x.s) && typeof x.t === 'boolean' && !used.has(clean(x.s))).map((x) => ({ q: clean(x.s), a: x.t }));
  // صح وخطأ: صحيح وخاطئ بالتناوب ما أمكن
  const tt = tf.filter((x) => x.a), tff = tf.filter((x) => !x.a), tfo = [];
  for (let i = 0; i < Math.max(tt.length, tff.length); i++) { if (tt[i]) tfo.push(tt[i]); if (tff[i]) tfo.push(tff[i]); }
  if (mc.length + tfo.length < 5) return [];
  const out = [];
  let pm = 0, pt = 0;
  for (let s = 0; s < count; s++) {
    const set = [], seen = new Set();
    const takeM = () => { for (let k = 0; k < mc.length; k++) { const x = mc[pm++ % mc.length]; if (!seen.has(x.q)) { seen.add(x.q); return x; } } return null; };
    const takeT = () => { for (let k = 0; k < tfo.length; k++) { const x = tfo[pt++ % tfo.length]; if (!seen.has(x.q)) { seen.add(x.q); return x; } } return null; };
    for (const want of ['m', 't', 'm', 't', 'm']) {
      let x = want === 'm' ? takeM() : takeT();
      let isM = want === 'm';
      if (!x) { x = isM ? takeT() : takeM(); isM = !isM; }
      if (!x) break;
      if (isM) { const r = rotate(x.o, (s * 2 + set.length + 1) % x.o.length); set.push({ t: 'mcq', q: x.q, o: r, a: r.indexOf(x.o[0]) + 1 }); }
      else set.push({ t: 'tf', q: x.q, a: !!x.a });
    }
    if (set.length === 5) out.push(set);
  }
  return out;
}
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
  if (!doc.sessions || force || redoSessions) {
    const idxF = path.join(GAMES, key, 'index.json');
    const idx = fs.existsSync(idxF) ? JSON.parse(fs.readFileSync(idxF, 'utf8')) : {};
    const counts = sessionCounts(key);
    const sessions = {};
    for (const name of Object.keys(doc.lessons)) {
      const k = counts.get(name) || 1, n = idx[name];
      const gf = n != null ? path.join(GAMES, key, `${n}.json`) : '';
      // درس بلا أنشطة في site/games: مجموعات حصصه مكتوبة يدويًا في الملف، فتبقى كما هي
      if (k < 2 || !gf || !fs.existsSync(gf)) { if (doc.sessions && doc.sessions[name]) sessions[name] = doc.sessions[name]; continue; }
      const sets = sessionSets(JSON.parse(fs.readFileSync(gf, 'utf8')), doc.lessons[name], k - 1);
      if (sets.length) sessions[name] = sets;
    }
    doc.sessions = sessions;
    if (doc.note && !/sessions/.test(doc.note)) doc.note += ' · sessions = أسئلة الحصة الثانية فما بعدها لكل درس (lessons = الحصة الأولى)';
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
