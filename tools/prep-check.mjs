#!/usr/bin/env node
// prep-check.mjs — يفحص ملفات التحضير (باقات JSON) قبل رفعها من لوحة الإدارة ← «الباقات» ← «رفع تحاضير كثيرة دفعة واحدة».
//
//   node tools/prep-check.mjs                                   # كل الباقات في /mnt/project-files/afaq-platform/preps/g*/
//   node tools/prep-check.mjs preps/hader-preps-g6-10-t1.zip    # ملف zip (يُقرأ دون فكّه في مكانه)
//   node tools/prep-check.mjs file.json dir/ other.zip          # ملفات ومجلدات وzip معًا
//   node tools/prep-check.mjs --only en-9,ar-5 -v               # باقات بعينها، مع كل تحذير (-v)
//
// أخطاء (تُفشل الفحص): JSON غير صالح، حقول الباقة الأساسية ناقصة، معرّف حصة مكرر، حصة بلا درس أو وحدة، تاريخ ليس YYYY-MM-DD أو
// يوم جمعة/سبت، publishDate يخالف pubDate، فترة واحدة ≠ 40 دقيقة أو فترتان ≠ 35، حقل أساسي فارغ (الأهداف، المفاهيم، الإجراءات)،
// رابط نشاط play.html?d=<باقة>/<رقم> لا ملف له في site/games.
// تحذيرات: تواريخ غير متصاعدة بترتيب الملف، مستوى غير معروف، اسم الملف لا يطابق المعرّف، رابط مكسور («https://،»)، مفاهيم مكررة
// حصص بلا وحدة، حقل اختياري فارغ. لا يعدّل أي ملف.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREPS = process.env.PREPS || '/mnt/project-files/afaq-platform/preps';
const argv = process.argv.slice(2);
const VERB = argv.includes('-v');
const oi = argv.indexOf('--only');
const ONLY = oi >= 0 ? String(argv[oi + 1] || '').split(',').filter(Boolean) : [];
const inputs = argv.filter((a, i) => !a.startsWith('-') && !(oi >= 0 && i === oi + 1));

const LEVELS = new Set(['التذكر', 'التطبيق', 'التحليل', 'الفهم', 'التقييم', 'الإبداع', 'التركيب']);
const REQUIRED = ['outcomes', 'concepts', 'procedures'];
const OPTIONAL = ['intro', 'formative', 'summative', 'notes'];
const DAY = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ---------- جمع الملفات ----------
const tmpDirs = [];
function collect(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const x of fs.readdirSync(p)) { const q = path.join(p, x); if (fs.statSync(q).isDirectory() || /\.(json|zip)$/.test(x)) collect(q, out); } return; }
  if (p.endsWith('.zip')) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-check-')); tmpDirs.push(d);
    execFileSync('unzip', ['-qq', '-o', p, '-d', d]);
    const before = out.length; collect(d, out);
    for (let i = before; i < out.length; i++) out[i].label = path.basename(p) + ':' + path.relative(d, out[i].file);
    return;
  }
  if (p.endsWith('.json')) out.push({ file: p, label: p.startsWith(PREPS + '/') ? path.relative(PREPS, p) : path.relative(process.cwd(), p) });
}
const files = [];
if (inputs.length) inputs.forEach((p) => collect(path.resolve(p), files));
else for (const d of fs.readdirSync(PREPS).filter((x) => /^g\d/.test(x))) { const p = path.join(PREPS, d); if (fs.statSync(p).isDirectory()) collect(p, files); }

// ---------- فحص باقة ----------
const games = path.join(REPO, 'site/games');
const gameExists = new Map();
const hasGame = (d) => { if (!gameExists.has(d)) gameExists.set(d, fs.existsSync(path.join(games, d + '.json'))); return gameExists.get(d); };

function check(pkg, label) {
  const E = [], W = [];
  for (const k of ['id', 'subject', 'grade', 'title', 'shift', 'lessons']) if (pkg[k] == null || pkg[k] === '') E.push(`حقل الباقة «${k}» ناقص`);
  if (!Array.isArray(pkg.lessons) || !pkg.lessons.length) { E.push('لا حصص فيها (lessons فارغة)'); return { E, W }; }
  if (pkg.shift && !['one', 'two'].includes(pkg.shift)) E.push(`shift «${pkg.shift}» ليست one أو two`);
  const wantMin = pkg.shift === 'two' ? 35 : 40;
  if (pkg.sessionMinutes && pkg.sessionMinutes !== wantMin) E.push(`${pkg.shiftName || pkg.shift}: زمن الحصة ${pkg.sessionMinutes} والمتوقع ${wantMin}`);
  const base = path.basename(label).replace(/\.json$/, '');
  if (pkg.id && !new RegExp('^' + pkg.id.replace(/[-]/g, '\\-') + '-t\\d$').test(base)) W.push(`اسم الملف «${base}» لا يطابق المعرّف «${pkg.id}» (المتوقع ${pkg.id}-t1.json)`);
  const ids = new Set();
  let prev = '', noUnit = 0;
  pkg.lessons.forEach((l, i) => {
    const at = `الحصة ${i + 1} (${l.id || 'بلا معرّف'})`;
    if (!l.id) E.push(`${at}: بلا معرّف`); else if (ids.has(l.id)) E.push(`${at}: المعرّف مكرر`); else ids.add(l.id);
    if (!String(l.lesson || '').trim()) E.push(`${at}: بلا اسم درس`);
    if (!String(l.unit || '').trim()) noUnit++;
    const d = l.publishDate || '';
    if (d) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + 'T00:00:00Z'))) E.push(`${at}: تاريخ «${d}» ليس YYYY-MM-DD`);
      else {
        const wd = new Date(d + 'T00:00:00Z').getUTCDay();
        if (wd === 5 || wd === 6) E.push(`${at}: ${d} يوم ${DAY[wd]}`);
        if (prev && d < prev) W.push(`${at}: ${d} قبل الحصة السابقة ${prev} (ترتيب الملف هو ترتيب التعبئة)`);
        prev = d;
      }
    }
    if ((l.pubDate || '') !== d) E.push(`${at}: publishDate «${d}» يخالف pubDate «${l.pubDate || ''}»`);
    for (const k of REQUIRED) if (!String(l[k] || '').trim()) E.push(`${at}: الحقل «${k}» فارغ`);
    for (const k of OPTIONAL) if (!String(l[k] || '').trim()) W.push(`${at}: الحقل «${k}» فارغ`);
    (l.levels || []).forEach((x) => { if (!LEVELS.has(x)) W.push(`${at}: مستوى غير معروف «${x}»`); });
    for (const v of Object.values(l)) {
      if (typeof v !== 'string') continue;
      for (const [, g] of v.matchAll(/play\.html\?d=([\w-]+\/\d+)/g)) if (!hasGame(g)) E.push(`${at}: رابط النشاط play.html?d=${g} ولا ملف site/games/${g}.json`);
      for (const [u] of v.matchAll(/https?:\/\/[^\s<>"'«»]*/g)) if (!/^https?:\/\/[\w-]+(\.[\w-]+)+/.test(u)) W.push(`${at}: رابط مكسور «${u}»`);
    }
  });
  // باقات بلا وحدات (الرياضيات الثامن) تعمل: الدرس يُطابَق في نور باسمه
  if (noUnit) W.push(`${noUnit} من ${pkg.lessons.length} حصة بلا وحدة (المطابقة في نور بالاسم وحده)`);
  return { E, W };
}

// ---------- التشغيل ----------
let nPk = 0, nSes = 0, nE = 0, nW = 0, badPk = 0;
for (const f of files) {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(f.file, 'utf8')); } catch (e) { console.log(`✗ ${f.label}: JSON غير صالح — ${e.message}`); nE++; badPk++; continue; }
  if (!pkg || !Array.isArray(pkg.lessons)) continue;   // ليست باقة (تقرير، فهرس…)
  if (ONLY.length && !ONLY.some((o) => pkg.id === o || f.label.includes(o))) continue;
  nPk++; nSes += pkg.lessons.length;
  const { E, W } = check(pkg, f.label);
  nE += E.length; nW += W.length;
  if (E.length) badPk++;
  if (E.length || (W.length && VERB)) {
    console.log(`${E.length ? '✗' : '!'} ${f.label} — ${pkg.title || pkg.id} (${pkg.lessons.length} حصة): ${E.length} خطأ، ${W.length} تحذير`);
    E.slice(0, VERB ? 1e9 : 8).forEach((x) => console.log(`    ✗ ${x}`));
    if (!VERB && E.length > 8) console.log(`    … و${E.length - 8} خطأ آخر (-v للكل)`);
    if (VERB) W.forEach((x) => console.log(`    ! ${x}`));
  } else if (W.length) console.log(`! ${f.label}: ${W.length} تحذير (-v للتفاصيل)`);
}
tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
console.log(`\n${nE ? 'PREPS FAILED' : 'PREPS OK'} — ${nPk} باقة · ${nSes} حصة · ${nE} خطأ في ${badPk} باقة · ${nW} تحذير`);
process.exit(nE ? 1 : (nPk ? 0 : 2));
