// تحويل ملف «التحضير اليومي» (صفحة HTML فيها <script id="data"> = { meta, plans }) إلى ملف مادة «حاضر» (JSON) جاهز للرفع.
// الاستعمال: node tools/hader-plans-html.mjs <ملف.html> [ملف-الناتج.json] [--id=sc-4] [--term=1]
// • كل تحضير يومي (plan) يصبح حصة واحدة في نور بتاريخ نشره: اليوم رقم day من أسبوعه (الأحد–الخميس).
// • التحضير الذي يجمع حصتين في اليوم نفسه يبقى تحضيرًا واحدًا (نور لا تقبل تاريخين متطابقين للمادة)، ويُكتب محورا الحصتين في العنوان.
//   يُربط بدرس أول حصة فيه، إلا إن كان درس حصة أخرى فيه لا تحضير له غير هذا اليوم: يُربط به (وحصته أولًا في العنوان)،
//   وإلا لم يصل ذلك الدرس إلى نور أبدًا.
// • البنود العشرة بترتيب الملف: المخرجات، المستوى، الاستراتيجيات، المصادر، المفاهيم، التهيئة، سير الدرس، التكويني، الختامي، الملاحظات.
// • المستوى المعرفي في الملف (معرفة/تطبيق/استدلال) يُحوَّل إلى مستويات نور: التذكر/التطبيق/التحليل.
import fs from 'node:fs';
import path from 'node:path';
import { mapStrategies, mapResources } from '../extension/parse.js';
import { normalizeLesson, lintPackage, fitLessonMinutes } from '../extension/lint.js';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [src, outArg] = args.filter((a) => !a.startsWith('--'));
if (!src) { console.error('الاستعمال: node tools/hader-plans-html.mjs <ملف.html> [ناتج.json] [--id=sc-4] [--term=1]'); process.exit(1); }

const html = fs.readFileSync(src, 'utf8');
const m = html.match(/<script[^>]*id="data"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('لم أجد بيانات التحضير (<script id="data">) في الملف');
const D = JSON.parse(m[1]);
if (!D.meta || !Array.isArray(D.plans) || !D.plans.length) throw new Error('لا تحاضير في الملف');

const GRADES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
const ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'];
const SHIFT_NAME = { one: 'فترة واحدة', two: 'فترتان' };
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const subject = String(D.meta.subject || '').trim();
const gradeNum = +D.meta.grade || null;
const gradeWord = GRADES[gradeNum - 1] || '';
const shift = opt.shift || (D.meta.shift === 2 ? 'two' : D.meta.shift === 1 ? 'one' : '');
const byTitle = /فترتين|فترتان/.test(title) ? 'two' : /فترة\s*واحدة/.test(title) ? 'one' : '';
const shiftWarn = !shift ? 'لم أعرف نوع المدرسة' : byTitle && byTitle !== shift ? `العنوان يقول «${SHIFT_NAME[byTitle]}» والبيانات «${SHIFT_NAME[shift]}»` : '';
const term = +(opt.term || 1);

const iso = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// «6–10/9/2026» · «27/9–1/10/2026» · «28/12/2026–1/1/2027» ← أول يوم في الأسبوع
function weekStart(s) {
  const t = String(s || '').replace(/\s+/g, '');
  const x = t.match(/^(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{4}))?[–—-](\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!x) return '';
  const m2 = +x[5], y2 = +x[6], m1 = x[2] ? +x[2] : m2;
  const y1 = x[3] ? +x[3] : m1 > m2 ? y2 - 1 : y2;
  return iso(y1, m1, +x[1]);
}
// اليوم الدراسي رقم k (من الصفر) بعد بداية الأسبوع (الأحد–الخميس)
function nthSchoolDay(ws, k) {
  const d = new Date(ws + 'T12:00:00Z');
  while (d.getUTCDay() > 4) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < k; ) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() <= 4) i++; }
  return d.toISOString().slice(0, 10);
}
const LEVEL = [[/معرف|تذكر/, 'التذكر'], [/فهم/, 'الفهم'], [/تطبيق/, 'التطبيق'], [/استدلال|تحليل/, 'التحليل'], [/تقييم|تقويم/, 'التقييم'], [/إبداع|ابداع/, 'الإبداع']];
function levelsOf(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    // «…: معرفة» · «… ← معرفة» · «… — ( معرفة)»
    const tags = [(line.match(/\(\s*([^()]+?)\s*\)\s*$/) || [])[1], (line.match(/(?:[:：]|←)\s*([^:：←]+)$/) || [])[1]].filter(Boolean);
    const hit = tags.map((t) => LEVEL.find(([re]) => re.test(t))).find(Boolean);
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
  }
  return out;
}
// بنود القائمة بلا ترقيم، ودون عناوين «الحصة الأولى: …» في التحضير الذي يجمع أكثر من حصة، وبلا تكرار
const items = (text) => [...new Set(String(text || '').split('\n').map((s) => s.replace(/^\s*(?:[-–•*]|\d+\s*[.)\-])\s*/, '').replace(/^(?:استراتيجيات|مصادر)\s+أخرى(?:\s+من\s+دليل\s+المعلم)?\s*[:：]/, 'أخرى:').trim()).filter((s) => s && !/^الحصة\s+\S+\s*[:：]/.test(s) && !/[:：]$/.test(s)))];
const unitName = (u) => String(u || '').trim();
const posNum = (p) => +((String(p || '').match(/(\d+)/) || [])[1] || 0);
const sessionTitle = (it) => { const k = posNum(it.pos), t = it.topic || it.lesson || ''; return k ? `الحصة ${ORD[k - 1] || k}: ${t}`.replace(/:\s*$/, '') : t; };

const id = opt.id || `${subject}-${gradeNum}`;
const lessons = [];
let n = 0, multi = 0, mixed = 0, undated = 0, relinked = 0;
// درس التحضير في كل يوم: أول حصة فيه، ثم مطابقة (مسارات تبديل) تعطي كل درس يومًا واحدًا على الأقل إن أمكن:
// درس بلا يوم يأخذ يومًا مزدوجًا هو فيه، ودرس ذلك اليوم يبقى له يوم آخر أو ينتقل بدوره إلى يوم مزدوج آخر هو فيه
const keyOf = (it) => (it.unit || '') + '|' + (it.lesson || '');
const lead = D.plans.map(() => 0);
const owner = D.plans.map((p) => (p.items[0] ? keyOf(p.items[0]) : ''));   // درس كل يوم الآن
const plansOf = new Map();   // درس ← الأيام التي هو فيها
D.plans.forEach((p, i) => p.items.forEach((it) => { const k = keyOf(it); if (!plansOf.has(k)) plansOf.set(k, []); if (!plansOf.get(k).includes(i)) plansOf.get(k).push(i); }));
const count = (k) => owner.filter((o) => o === k).length;
// يحاول أن يعطي الدرس k يومًا: يوم صاحبه له يوم آخر، أو صاحبه يجد يومًا غيره (بلا تكرار في المسار)
function claim(k, seen) {
  for (const i of plansOf.get(k) || []) {
    if (seen.has(i) || owner[i] === k) continue;
    seen.add(i);
    const prev = owner[i];
    if (count(prev) > 1 || (owner[i] = k, claim(prev, seen))) { owner[i] = k; return true; }
    owner[i] = prev;
  }
  return false;
}
for (const k of plansOf.keys()) if (!count(k)) claim(k, new Set());
D.plans.forEach((p, i) => { const j = p.items.findIndex((it) => keyOf(it) === owner[i]); if (j > 0) { lead[i] = j; relinked++; } });
for (const [pi, p] of D.plans.entries()) {
  const f = p.f || [];
  const it0 = p.items[lead[pi]] || {};
  const order = p.items.map((_, j) => j).sort((a, b) => (b === lead[pi]) - (a === lead[pi]));
  if (p.items.length > 1) { multi++; if (new Set(p.items.map((i) => i.lesson)).size > 1) mixed++; }
  const ws = weekStart(p.dates);
  const date = ws && p.day ? nthSchoolDay(ws, Math.min(+p.day - 1, 4)) : '';
  if (!date) undated++;
  const st = mapStrategies(items(f[2]));
  const rs = mapResources(items(f[3]));
  const x = {
    id: `${id}-t${term}-${String(++n).padStart(3, '0')}`,
    unit: unitName(it0.unit || ''),
    lesson: it0.lesson || '',
    title: order.map((j) => sessionTitle(p.items[j])).join(' + '),
    week: `الأسبوع ${p.wl || p.w} (${p.dates})`,
    publishDate: date,
    outcomes: f[0] || '',
    levels: levelsOf(f[1]),
    strategies: st.strategies, strategiesOther: st.other,
    resources: rs.resources, resourcesOther: rs.other,
    concepts: f[4] || '', intro: f[5] || '', procedures: f[6] || '',
    formative: f[7] || '', summative: f[8] || '', notes: f[9] || '',
  };
  normalizeLesson(x);
  if (x.publishDate && x.pubDate !== x.publishDate) x.pubDate = x.publishDate;
  lessons.push(fitLessonMinutes(x, { shift }));   // «فترتين» بتوقيت ٤٠ دقيقة ← ٣٥
}
const gradeLabel = gradeWord ? 'الصف ' + gradeWord : '';
const pkg = { id, term: term === 2 ? 'الفصل الدراسي الثاني' : 'الفصل الدراسي الأول', subject, grade: gradeLabel, gradeNum, title: [subject, gradeWord].filter(Boolean).join(' — '), shift, shiftName: SHIFT_NAME[shift] || '', sessionMinutes: shift === 'two' ? 35 : shift === 'one' ? 40 : null, lessons };

const out = outArg || path.join(path.dirname(src), path.basename(src).replace(/\.[^.]+$/, '') + '.hadir.json');
fs.writeFileSync(out, JSON.stringify(pkg, null, 1));
const rep = lintPackage(pkg);
const dates = lessons.map((x) => x.pubDate).filter(Boolean).sort();
const dupDates = dates.length - new Set(dates).size;
console.log(JSON.stringify({
  out, subject, gradeNum, term, shift: SHIFT_NAME[shift] || '?', shiftWarn,
  units: new Set(lessons.map((x) => x.unit)).size, lessons: new Set(lessons.map((x) => x.unit + '|' + x.lesson)).size,
  hidden: [...new Set(D.plans.flatMap((p) => p.items.map(keyOf)))].filter((k) => !lessons.some((x) => x.unit + '|' + x.lesson === k)), sessions: lessons.length,
  periods: D.meta.periods, multi, mixed, relinked, undated, dupDates,
  dated: lessons.filter((x) => /^\d{4}-\d\d-\d\d$/.test(x.pubDate || '')).length, first: dates[0], last: dates.at(-1),
  noLevels: lessons.filter((x) => !x.levels.length).length,
  lint: (rep.warnings || []).filter((r) => r.level !== 'info').map((r) => `${r.level}: ${r.text}`),
}));
