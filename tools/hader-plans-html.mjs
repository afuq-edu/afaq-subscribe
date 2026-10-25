// تحويل ملف «التحضير اليومي» (صفحة HTML فيها <script id="data"> = { meta, plans }) إلى ملف مادة «حاضر» (JSON) جاهز للرفع.
// الاستعمال: node tools/hader-plans-html.mjs <ملف.html> [ملف-الناتج.json] [--id=sc-4] [--term=1]
// • كل تحضير يومي (plan) يصبح حصة واحدة في نور بتاريخ نشره: اليوم رقم day من أسبوعه (الأحد–الخميس).
// • التحضير الذي يجمع حصتين من الدرس نفسه يبقى تحضيرًا واحدًا، ويُكتب محورا الحصتين في العنوان.
// • التحضير الذي يجمع حصصًا من دروس مختلفة يُربط بدرس أول حصة فيه، إلا إذا كان فيه درس لا تحضير آخر له:
//   عندها يُفصل، فيأخذ كل درس تحضيرًا مستقلًا بالتاريخ نفسه (نور يقبل تحضيرًا لكل حصة)، حتى لا يبقى درس
//   في شجرة نور بلا تحضير باسمه. تُقسَم البنود عند عناوين «Period 1: …» / «الحصة الأولى: …».
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

// بند فيه أكثر من حصة ← أجزاء: يبدأ الجزء بعنوان «Period k: …» أو «الحصة …: …» في أول البند أو بعد سطر فارغ
const HEAD = /^(?:Period \d+|الحصة (?:ال)?[ء-ي]+|Session \d+)\s*[:：]\s*([^\n]*)$/;
const norm = (s) => String(s || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
function blocks(txt) {
  const lines = String(txt || '').split('\n'), out = [];
  lines.forEach((ln, i) => { if (HEAD.test(ln) && (i === 0 || lines[i - 1].trim() === '')) out.push([ln]); else if (out.length) out[out.length - 1].push(ln); else out.push(['', ln]); });
  return out.map((b) => ({ head: b[0], topic: norm((b[0].match(HEAD) || [])[1]), body: b.slice(1).join('\n').replace(/\n+$/, '') }));
}
// جزء كل حصة: بمحورها المكتوب في العنوان، وإلا بالترتيب
function assign(bs, its) {
  if (bs.length !== its.length) return null;
  const used = new Set();
  const m = its.map((it) => { const t = norm(it.topic || it.lesson); const j = bs.findIndex((b, j) => !used.has(j) && b.topic && (b.topic === t || b.topic.startsWith(t) || t.startsWith(b.topic))); if (j >= 0) used.add(j); return j; });
  const r = m.map((j, k) => (j >= 0 ? j : !used.has(k) ? (used.add(k), k) : -1));
  return r.every((j) => j >= 0) ? r : null;
}
// حصص التحضير مقسومة حسب الدرس: [[k…] لكل درس] — أو تحضير واحد إن تعذّر قسم البنود
const firsts = new Set(D.plans.map((p) => (p.items[0] || {}).lesson));
function groupsOf(p) {
  const order = [...new Set(p.items.map((i) => i.lesson))];
  if (order.length < 2 || order.every((ls) => firsts.has(ls))) return null;
  const f = p.f || [];
  const maps = f.map((t) => (String(t || '').trim() ? assign(blocks(t), p.items) : 'empty'));
  if (maps.some((m) => !m)) return null;
  return { groups: order.map((ls) => p.items.map((it, k) => (it.lesson === ls ? k : -1)).filter((k) => k >= 0)), maps };
}
const pickF = (p, maps, ks) => (p.f || []).map((t, i) => { if (maps[i] === 'empty') return ''; const bs = blocks(t), b = ks.map((k) => bs[maps[i][k]]); return b.length === 1 ? b[0].body : b.map((x) => x.head + '\n' + x.body).join('\n\n'); });

const id = opt.id || `${subject}-${gradeNum}`;
const lessons = [];
let n = 0, multi = 0, mixed = 0, undated = 0;
let split = 0, unsplit = 0;
for (const p0 of D.plans) {
  if (p0.items.length > 1) { multi++; if (new Set(p0.items.map((i) => i.lesson)).size > 1) mixed++; }
  const ws = weekStart(p0.dates);
  const date = ws && p0.day ? nthSchoolDay(ws, Math.min(+p0.day - 1, 4)) : '';
  if (!date) undated++;
  const g = groupsOf(p0);
  if (g) split++; else if (p0.items.some((i) => !firsts.has(i.lesson))) unsplit++;
  const parts = g ? g.groups.map((ks) => ({ items: ks.map((k) => p0.items[k]), f: pickF(p0, g.maps, ks) })) : [{ items: p0.items, f: p0.f || [] }];
  for (const p of parts) {
  const f = p.f;
  const it0 = p.items[0] || {};
  const st = mapStrategies(items(f[2]));
  const rs = mapResources(items(f[3]));
  const x = {
    id: `${id}-t${term}-${String(++n).padStart(3, '0')}`,
    unit: unitName(it0.unit || ''),
    lesson: it0.lesson || '',
    title: p.items.map(sessionTitle).join(' + '),
    week: `الأسبوع ${p0.wl || p0.w} (${p0.dates})`,
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
  units: new Set(lessons.map((x) => x.unit)).size, lessons: new Set(lessons.map((x) => x.unit + '|' + x.lesson)).size, sessions: lessons.length,
  periods: D.meta.periods, multi, mixed, split, unsplit, undated, dupDates,
  dated: lessons.filter((x) => /^\d{4}-\d\d-\d\d$/.test(x.pubDate || '')).length, first: dates[0], last: dates.at(-1),
  noLevels: lessons.filter((x) => !x.levels.length).length,
  lint: (rep.warnings || []).filter((r) => r.level !== 'info').map((r) => `${r.level}: ${r.text}`),
}));
