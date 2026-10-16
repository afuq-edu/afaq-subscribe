// تحويل ملف «نسخ حقول نور» (صفحة HTML فيها const D={fields, les}) إلى ملف مادة «حاضر» (JSON) جاهز للرفع من لوحة الإدارة.
// الاستعمال: node tools/noor-fields-html.mjs <ملف.html> [ملف-الناتج.json] [--id=bio-9] [--term=1]
// • كل حصة (ps) تصبح حصة مستقلة: الوحدة، الدرس «1-1 العنوان»، الحصة «الحصة الأولى: محورها».
// • البنود العشرة بترتيب D.fields: المخرجات، المستوى، الاستراتيجيات، المصادر، المفاهيم، التهيئة، سير الدرس، التكويني، الختامي، الملاحظات.
// • تاريخ النشر من مدى أسبوع الحصة («من 6 إلى 10 سبتمبر 2026»): الحصة الأولى في الأسبوع أول يومه، والثانية اليوم الدراسي التالي…
//   و«حاضر» ينقل كل تاريخ إلى أقرب يوم حصة للمعلم إن لم يكن يوم حصته.
import fs from 'node:fs';
import path from 'node:path';
import { mapStrategies, mapResources } from '../extension/parse.js';
import { normalizeLesson, lintPackage } from '../extension/lint.js';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [src, outArg] = args.filter((a) => !a.startsWith('--'));
if (!src) { console.error('الاستعمال: node tools/noor-fields-html.mjs <ملف.html> [ناتج.json] [--id=bio-9] [--term=1]'); process.exit(1); }

const html = fs.readFileSync(src, 'utf8');
const at = html.indexOf('const D=');
if (at < 0) throw new Error('لم أجد بيانات التحضير (const D=) في الملف');
const D = JSON.parse(rawJson(html, at + 'const D='.length));
if (!Array.isArray(D.les) || !D.les.length) throw new Error('لا دروس في الملف');

// أول كائن JSON كامل يبدأ من الموضع i
function rawJson(s, i) {
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { if (--depth === 0) return s.slice(i, j + 1); }
  }
  throw new Error('بيانات التحضير ناقصة');
}

const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'];
const GRADES = [['الحادي عشر', 11], ['الثاني عشر', 12], ['الأول', 1], ['الثاني', 2], ['الثالث', 3], ['الرابع', 4], ['الخامس', 5], ['السادس', 6], ['السابع', 7], ['الثامن', 8], ['التاسع', 9], ['العاشر', 10]];
const parts = title.split(/\s+[—–-]\s+/);
const subject = parts[1] || '';
const gradeWord = (parts[2] || '').replace(/^الصف\s+/, '');
const gradeNum = (GRADES.find(([w]) => gradeWord.startsWith(w)) || [])[1] || null;
const term = +(opt.term || (/الثاني/.test(parts[3] || '') ? 2 : 1));
const latin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
// نوع المدرسة: فترة واحدة (الحصة ٤٠ دقيقة) أو فترتان (٣٥ دقيقة) — من العنوان، وإلا من «مجموع زمن الحصة» في سير الدرس
const SHIFT_NAME = { one: 'فترة واحدة', two: 'فترتان' };
const minutes = [...html.matchAll(/مجموع زمن الحصة\s*[:：]?\s*([0-9٠-٩]+)\s*دقيقة/g)].map((m) => +latin(m[1]));
const minCount = minutes.reduce((o, n) => ((o[n] = (o[n] || 0) + 1), o), {});
const byMinutes = minCount[35] > (minCount[40] || 0) ? 'two' : minCount[40] ? 'one' : '';
const byTitle = /فترتين|فترتان|الفترتين|فترة\s*مسائية/.test(title) ? 'two' : /فترة\s*واحدة|الفترة\s*الواحدة/.test(title) ? 'one' : '';
const shift = opt.shift || byTitle || byMinutes || '';
const shiftWarn = byTitle && byMinutes && byTitle !== byMinutes ? `العنوان يقول «${SHIFT_NAME[byTitle]}» لكن زمن الحصص ${byTitle === 'one' ? 35 : 40} دقيقة` : !shift ? 'لم أعرف نوع المدرسة (فترة أو فترتان): أضفه إلى العنوان أو مرّر --shift=one|two' : '';

const MONTHS = { يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// «الأسبوع 4 (من 27 سبتمبر إلى 1 أكتوبر 2026)» ← 2026-09-27 · «(من 6 إلى 10 سبتمبر 2026)» ← 2026-09-06
function weekStart(wk) {
  const t = latin(wk);
  const mo = Object.keys(MONTHS).join('|');
  let m = t.match(new RegExp(`من\\s*(\\d{1,2})\\s*(${mo})\\s*إلى\\s*(\\d{1,2})\\s*(${mo})\\s*(\\d{4})`));
  if (m) { const m1 = MONTHS[m[2]], m2 = MONTHS[m[4]]; return iso(+m[5] - (m1 > m2 ? 1 : 0), m1, +m[1]); }
  m = t.match(new RegExp(`من\\s*(\\d{1,2})\\s*إلى\\s*(\\d{1,2})\\s*(${mo})\\s*(\\d{4})`));
  if (m) return iso(+m[4], MONTHS[m[3]], +m[1]);
  return '';
}
const weekNum = (wk) => { const m = latin(wk).match(/الأسبوع\s*(\d+)/); return m ? +m[1] : null; };

const LEVELS = [[/تذكر/, 'التذكر'], [/فهم/, 'الفهم'], [/تطبيق/, 'التطبيق'], [/تحليل/, 'التحليل'], [/تقييم|تقويم/, 'التقييم'], [/إبداع|ابداع|ابتكار/, 'الإبداع']];
function levelsOf(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const tag = (line.match(/\(([^()]+)\)\s*$/) || [])[1] || '';
    const hit = LEVELS.find(([re]) => re.test(tag));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
  }
  return out;
}
const items = (text) => String(text || '').split('\n').map((s) => s.replace(/^\s*[-–•*]\s*/, '').trim()).filter(Boolean);
const unitName = (u) => (/^الوحدة/.test(u) ? u : 'الوحدة ' + u);

// اليوم الدراسي رقم k (من الصفر) في الأسبوع الذي يبدأ في ws (الأحد–الخميس)، دون تجاوز آخر يوم في المدى
function nthSchoolDay(ws, k) {
  const d = new Date(ws + 'T12:00:00Z');
  for (let i = 0; i < k; ) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() <= 4) i++; }
  return d.toISOString().slice(0, 10);
}

const id = opt.id || '';
const perWeek = new Map();
const lessons = [];
let n = 0;
for (const l of D.les) {
  l.ps.forEach((p, i) => {
    const T = p.T || [];
    const st = mapStrategies(items(T[2]));
    const rs = mapResources(items(T[3]));
    const x = {
      id: `${id || 'pkg'}-t${term}-${String(++n).padStart(3, '0')}`,
      unit: unitName(l.u || ''),
      lesson: `${l.c} ${l.t}`.trim(),
      title: `الحصة ${ORD[i] || i + 1}: ${p.f || ''}`.replace(/:\s*$/, ''),
      week: p.wk || '',
      publishDate: (() => { const ws = weekStart(p.wk); if (!ws) return ''; const k = perWeek.get(ws) || 0; perWeek.set(ws, k + 1); return nthSchoolDay(ws, Math.min(k, 4)); })(),
      outcomes: T[0] || '',
      levels: levelsOf(T[1]),
      strategies: st.strategies, strategiesOther: st.other,
      resources: rs.resources, resourcesOther: rs.other,
      concepts: T[4] || '', intro: T[5] || '', procedures: T[6] || '',
      formative: T[7] || '', summative: T[8] || '', notes: T[9] || '',
      pages: [p.sb && `كتاب الطالب ص ${p.sb}`, p.ab && `كتاب النشاط ص ${p.ab}`].filter(Boolean).join(' · '),
    };
    normalizeLesson(x);
    if (x.publishDate && x.pubDate !== x.publishDate) x.pubDate = x.publishDate;
    lessons.push(x);
  });
}
const pkg = { id: id || `${subject}-${gradeNum}`, term: term === 2 ? 'الفصل الدراسي الثاني' : 'الفصل الدراسي الأول', subject, grade: parts[2] || '', gradeNum, title: [subject, parts[2]].filter(Boolean).join(' — '), shift, shiftName: SHIFT_NAME[shift] || '', sessionMinutes: shift === 'two' ? 35 : shift === 'one' ? 40 : null, lessons };

const out = outArg || path.join(path.dirname(src), path.basename(src).replace(/\.[^.]+$/, '') + '.hadir.json');
fs.writeFileSync(out, JSON.stringify(pkg, null, 1));
const rep = lintPackage(pkg);
const weeks = new Set(lessons.map((x) => weekNum(x.week)).filter(Boolean));
console.log(JSON.stringify({
  out, subject, gradeNum, term, shift: SHIFT_NAME[shift] || '?', minutes: minCount, shiftWarn, units: new Set(lessons.map((x) => x.unit)).size, lessons: D.les.length, sessions: lessons.length, weeks: weeks.size,
  dated: lessons.filter((x) => /^\d{4}-\d\d-\d\d$/.test(x.pubDate || '')).length,
  first: lessons[0] && lessons[0].pubDate, last: lessons.at(-1) && lessons.at(-1).pubDate,
  noLevels: lessons.filter((x) => !x.levels.length).length,
  lint: (rep.warnings || []).map((r) => `${r.level}: ${r.text}`),
}, null, 1));
