// dates.js — قراءة «تاريخ النشر» من ملفات التحضير بذكاء، بأي صيغة يكتبها المعلم:
//   2026-10-12 · 12/10/2026 · 12-10-2026 · 12.10.2026 · ١٢/١٠/٢٠٢٦ · 12/10 (بلا سنة) · 12 أكتوبر 2026 · 12 تشرين الأول
//   October 12, 2026 · 12 Oct 2026 · الأحد 12/10/2026 · 20/4/1448هـ (هجري — يُحوَّل ميلاديًا بتقويم أم القرى)
// النتيجة دائمًا ISO «yyyy-mm-dd» ميلادي (كما تطلبه نور). لا يُخمَّن تاريخ من نص لا يحمل تاريخًا.

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(parseIso(s).getTime());
export const addDays = (iso, n) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const diffDays = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);
export const toLatinDigits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
export const toArDigits = (s) => String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const STRIP = /[ً-ْٰـ‏‎​‪-‮⁦-⁩﻿]/g;
// توحيد لا يغيّر طول النص (ليبقى موضع التاريخ صالحًا في النص الأصلي)
const normLen = (s) => String(s).replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').toLowerCase();
const normA = (s) => normLen(String(s || '').replace(STRIP, ''));

// ---------- أسماء الشهور ----------
// الميلادية بأسمائها الشائعة في الخليج ومصر، والشامية، والمغاربية، والإنجليزية (كاملة ومختصرة)
const G_MONTHS = [
  ['يناير', 'كانون الثاني', 'كانون ثاني', 'جانفي', 'january', 'jan'],
  ['فبراير', 'شباط', 'فيفري', 'february', 'feb'],
  ['مارس', 'اذار', 'آذار', 'march', 'mar'],
  ['ابريل', 'أبريل', 'إبريل', 'نيسان', 'افريل', 'april', 'apr'],
  ['مايو', 'ايار', 'أيار', 'ماي', 'may'],
  ['يونيو', 'يونيه', 'حزيران', 'جوان', 'june', 'jun'],
  ['يوليو', 'يوليه', 'تموز', 'جويلية', 'july', 'jul'],
  ['اغسطس', 'أغسطس', 'آب', 'اوت', 'أوت', 'august', 'aug'],
  ['سبتمبر', 'ايلول', 'أيلول', 'september', 'sept', 'sep'],
  ['اكتوبر', 'أكتوبر', 'تشرين الاول', 'تشرين الأول', 'تشرين اول', 'october', 'oct'],
  ['نوفمبر', 'تشرين الثاني', 'تشرين ثاني', 'november', 'nov'],
  ['ديسمبر', 'كانون الاول', 'كانون الأول', 'كانون اول', 'december', 'dec'],
];
const H_MONTHS = [
  ['محرم', 'المحرم'], ['صفر'], ['ربيع الاول', 'ربيع الأول', 'ربيع 1'], ['ربيع الثاني', 'ربيع الاخر', 'ربيع الآخر', 'ربيع 2'],
  ['جمادي الاولي', 'جمادى الأولى', 'جمادى الاولى', 'جماد الاول', 'جمادي الاول'], ['جمادي الاخره', 'جمادى الآخرة', 'جمادى الاخرة', 'جمادي الثانيه', 'جمادى الثانية', 'جماد الثاني'],
  ['رجب'], ['شعبان'], ['رمضان'], ['شوال'], ['ذو القعده', 'ذو القعدة', 'ذي القعده', 'ذي القعدة'], ['ذو الحجه', 'ذو الحجة', 'ذي الحجه', 'ذي الحجة'],
];
function monthIndex(table, word) {
  const w = normA(word).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < table.length; i++) if (table[i].some((n) => normA(n) === w)) return i + 1;
  return 0;
}
const alt = (list) => [...new Set(list.map((m) => normA(m)))].sort((a, b) => b.length - a.length).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const G_RE = alt(G_MONTHS.flat());
const H_RE = alt(H_MONTHS.flat());
const DAY_RE = '(?:يوم\\s+)?(?:الاحد|الاثنين|الإثنين|الثلاثاء|الاربعاء|الخميس|الجمعه|السبت|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\\.?\\s*[،,]?\\s*';
const HIJRI_AFTER = /^\s*(?:هـ|ه(?![؀-ۿ])|هجري[هة]?|ah(?![a-z])|h(?![a-z]))/i;

// ---------- هجري ← ميلادي (تقويم أم القرى عبر Intl، مع تقدير حسابي أولًا) ----------
let hijriFmt = null;
function hijriParts(date) {
  try {
    hijriFmt = hijriFmt || new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
    const p = {};
    hijriFmt.formatToParts(date).forEach((x) => { if (x.type === 'day' || x.type === 'month' || x.type === 'year') p[x.type] = +x.value; });
    return p.year ? p : null;
  } catch (e) { return null; }
}
export function hijriToIso(hy, hm, hd) {
  if (!(hy > 1300 && hy < 1600 && hm >= 1 && hm <= 12 && hd >= 1 && hd <= 30)) return null;
  // تقدير جدولي ثم تصحيح بالتقويم الفعلي (أم القرى) ± أيام
  const jd = Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm - Math.floor((hm - 1) / 2) + hd + 1948440 - 385;
  const base = new Date((jd - 2440587.5) * 864e5); base.setHours(12, 0, 0, 0);
  for (const off of [0, 1, -1, 2, -2, 3, -3]) {
    const d = new Date(base); d.setDate(d.getDate() + off);
    const p = hijriParts(d);
    if (p && p.year === hy && p.month === hm && p.day === hd) return isoOf(d);
  }
  return isoOf(base);   // لا Intl هجري في هذا المتصفح: التقدير الجدولي (خطؤه يوم أو يومان)
}
export function isoToHijriLabel(iso) {
  try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseIso(iso)); } catch (e) { return ''; }
}

// ---------- السنة الناقصة ----------
// «12/10» بلا سنة: السنة التي تجعل التاريخ أقرب إلى المرجع (آخر تاريخ في الملف أو اليوم)، مع تفضيل ما بعد المرجع في الملف
export function inferYear(day, month, ctx = {}) {
  const ref = ctx.ref && isIso(ctx.ref) ? parseIso(ctx.ref) : new Date();
  const ry = ref.getFullYear();
  const cands = [ry - 1, ry, ry + 1].map((y) => ({ y, d: new Date(y, month - 1, day, 12) })).filter((c) => c.d.getMonth() === month - 1);
  if (!cands.length) return ry;
  const score = (c) => {
    const diff = (c.d - ref) / 864e5;
    // في الملف: التاريخ التالي يأتي بعد السابق غالبًا — نرجّح ما بعد المرجع ما دام خلال ٨ أشهر
    if (ctx.ref && diff >= 0 && diff <= 245) return Math.abs(diff) - 400;
    return Math.abs(diff);
  };
  return cands.sort((a, b) => score(a) - score(b))[0].y;
}
const fullYear = (y) => { y = +y; return y < 100 ? (y >= 90 ? 1900 + y : 2000 + y) : y; };
const validGreg = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100 && new Date(y, m - 1, d).getDate() === d;
const LABEL_BEFORE = /(تاريخ|نشر|date|يوم|بتاريخ|موعد|publish)\w*\s*[:：]?\s*[(\[]?\s*$/i;

// ---------- التحليل ----------
// يجد أول تاريخ في النص ويعيد { iso, start, end, hijri, noYear, raw } أو null — ctx.ref: تاريخ مرجعي ISO للسنة الناقصة
// المواضع start/end على النص بعد حذف التشكيل والمحارف الخفية (src) — طول الأرقام العربية والإنجليزية واحد
export function findDate(text, ctx = {}) {
  if (!text) return null;
  const src = toLatinDigits(String(text)).replace(STRIP, '');
  const s = normLen(src);
  const out = [];
  const push = (iso, m, extra) => { if (iso) out.push(Object.assign({ iso, start: m.index, end: m.index + m[0].length, hijri: false, noYear: false, raw: src.slice(m.index, m.index + m[0].length) }, extra || {})); };
  // ١) yyyy-mm-dd أو yyyy/mm/dd (وسنة أقل من ١٦٠٠ هجرية)
  for (const m of s.matchAll(/(?<![\d])(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g)) {
    const y = +m[1], a = +m[2], b = +m[3];
    if (y < 1600) push(hijriToIso(y, a, b), m, { hijri: true });
    else if (validGreg(y, a, b)) push(`${y}-${pad(a)}-${pad(b)}`, m);
  }
  // ٢) dd/mm/yyyy · dd-mm-yy · dd.mm.yyyy · dd/mm (بلا سنة) — اليوم أولًا (كما في عُمان)؛ وإن تعذّر فالشهر أولًا
  for (const m of s.matchAll(/(?<![\d/.-])(\d{1,2})\s*([-/.])\s*(\d{1,2})(?:\s*\2\s*(\d{2}|\d{4}))?(?![\d/.-])/g)) {
    const a = +m[1], b = +m[3];
    const yRaw = m[4];
    const end = m.index + m[0].length;
    const after = s.slice(end, end + 10), before = s.slice(Math.max(0, m.index - 18), m.index);
    let y = yRaw != null ? fullYear(yRaw) : null;
    const hij = (y != null && y >= 1300 && y < 1600) || HIJRI_AFTER.test(after) || /هجري/.test(before);
    if (hij) {
      if (y == null) continue;   // هجري بلا سنة: لا نخمّن
      push((a <= 30 && b <= 12) ? hijriToIso(y, b, a) : (b <= 30 && a <= 12 ? hijriToIso(y, a, b) : null), m, { hijri: true });
      continue;
    }
    if (yRaw == null) {
      if (m[2] === '.') continue;   // «3.5» رقم لا تاريخ
      // بلا سنة: نقبل «12/10» إن سبقته تسمية تاريخ، أو كان وحده بين قوسين/بعد فاصل/في أول النص؛ و«12-10» مع تسمية فقط (قد يكون مدى صفحات)
      const labeled = LABEL_BEFORE.test(before);
      // وحده: بين قوسين لا شيء معه «(12/10)»، أو بعد فاصل «— 12/10»، أو النص كله «12/10» — لا «page 12/13»
      const alone = m[2] === '/' && ((/[(\[]\s*$/.test(before) && /^\s*[)\]]/.test(after)) || /[—–\-|:：]\s*$/.test(before) || (m.index === 0 && /^\s*[)\]]?\s*$/.test(after)));
      if (!labeled && !alone) continue;
    }
    let d, mo;
    if (a > 12 && b <= 12) { d = a; mo = b; } else if (b > 12 && a <= 12) { d = b; mo = a; } else if (a <= 12 && b <= 12) { d = a; mo = b; } else continue;
    if (y == null) y = inferYear(d, mo, ctx);
    if (validGreg(y, mo, d)) push(`${y}-${pad(mo)}-${pad(d)}`, m, { noYear: yRaw == null });
  }
  // ٣) «12 أكتوبر 2026» · «12 أكتوبر» · «October 12, 2026» · «Oct 12»
  const gRe = new RegExp(`(?<![\\d])(\\d{1,2})\\s*(?:من\\s+)?(?:شهر\\s+)?(${G_RE})(?![\\u0600-\\u06FFa-z])\\.?,?\\s*(\\d{4})?(?![\\d])|(?<![a-z\\u0600-\\u06FF])(${G_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?(?![\\d])`, 'gi');
  for (const m of s.matchAll(gRe)) {
    const d = +(m[1] || m[5]), mo = monthIndex(G_MONTHS, m[2] || m[4]);
    const yRaw = m[3] || m[6];
    if (!mo) continue;
    const y = yRaw ? +yRaw : inferYear(d, mo, ctx);
    if (validGreg(y, mo, d)) push(`${y}-${pad(mo)}-${pad(d)}`, m, { noYear: !yRaw });
  }
  // ٤) «20 ربيع الآخر 1448» (هجري بالاسم)
  const hRe = new RegExp(`(?<![\\d])(\\d{1,2})\\s*(?:من\\s+)?(?:شهر\\s+)?(${H_RE})\\s*(\\d{4})\\s*(?:هـ|ه)?`, 'g');
  for (const m of s.matchAll(hRe)) {
    const hm = monthIndex(H_MONTHS, m[2]);
    push(hm ? hijriToIso(+m[3], hm, +m[1]) : null, m, { hijri: true });
  }
  if (!out.length) return null;
  // الأول في النص، وعند التداخل الأطول (مثل yyyy-mm-dd داخل نص أوسع)
  out.sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start));
  const first = out[0];
  // اسم اليوم قبله جزء من التاريخ
  const dm = s.slice(0, first.start).match(new RegExp(DAY_RE + '$', 'i'));
  if (dm) { first.start -= dm[0].length; first.raw = src.slice(first.start, first.end); }
  return first;
}
// تاريخ واحد من نص قصير (عمود «تاريخ النشر» مثلًا) — ISO أو ''
export function parseAnyDate(text, ctx) { const f = findDate(text, ctx); return f ? f.iso : ''; }

// أول يوم في مدى أسبوع مكتوب في الخطة: «الأسبوع الأول (6–10/9/2026م)» ← 2026-09-06 · «(27/9–1/10/2026م)» ← 2026-09-27
// (findDate وحدها تقرأ آخر المدى، فتنقل الحصة إلى نهاية الأسبوع)
export function rangeStartDate(text) {
  const t = toLatinDigits(String(text || '')).replace(STRIP, '');
  const iso = (y, m, d) => { const v = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return isIso(v) ? v : ''; };
  let m = t.match(/(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*[–—\-]\s*(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{4})/);
  if (m) return iso(+m[5] - (+m[2] > +m[4] ? 1 : 0), +m[2], +m[1]);
  m = t.match(/(\d{1,2})\s*[–—\-]\s*(\d{1,2})\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{4})/);
  if (m && +m[1] <= +m[2]) return iso(+m[4], +m[3], +m[1]);
  return '';
}

// ---------- «تاريخ النشر» في سطر ----------
// تسمية تدل على تاريخ النشر — تُقبل أيضًا «التاريخ» وحدها و«date»، لا «تاريخ عُمان» (مادة التاريخ)
const PUB_WORDS = /^(?:(?:تاريخ|موعد|يوم)\s*(?:ال)?نشر(?:ها|ه)?|(?:ال)?نشر(?:\s*(?:في|يوم|بتاريخ))?|تاريخ\s*(?:ال)?(?:حصه|درس|تحضير|تنفيذ|تطبيق|بدايه|بدء|انطلاق)|(?:ال)?تاريخ|بتاريخ|اول\s*(?:تاريخ\s*)?(?:ال)?نشر|يبدا\s*(?:ال)?نشر(?:\s*(?:من|في))?|publish(?:ing|ed)?\s*(?:date|on)?|pub\.?\s*date|date\s*(?:of\s*)?(?:publish(?:ing)?|publication)?|publication\s*date|start(?:ing)?\s*date|first\s*(?:publish(?:ing)?\s*)?date)$/i;
export function isPubLabel(t) {
  const x = normA(toLatinDigits(t)).replace(/^[^\p{L}]+/u, '').replace(/[\s:：.\-–—]+$/g, '').replace(/\s+/g, ' ').trim();
  return !!x && x.length <= 30 && PUB_WORDS.test(x);
}

// يستخرج من سطر عنوان (حصة/درس/وحدة) تاريخَ نشر مكتوبًا فيه، ويعيد { iso, text } حيث text العنوان دون التاريخ
// يقبل: «الحصة الأولى — تاريخ النشر: 12/10/2026» · «الحصة الأولى (12/10/2026)» · «الدرس 3: … [النشر 14 أكتوبر]» · «الحصة 1 | 2026-10-12» · «الحصة الأولى 12/10/2026»
const TITLE_LABEL = /[\s\-–—|•·،,;(\[]*(?:(?:تاريخ|موعد|يوم)\s*(?:ال)?نشر(?:ها|ه)?|(?:ال)?نشر(?:\s*(?:في|يوم))?|(?:ال)?تاريخ|بتاريخ|publish(?:ing|ed)?(?:\s*(?:date|on))?|pub\.?\s*date|date)\s*[:：]?\s*[(\[]?\s*$/i;
export function splitDateFromTitle(title, ctx = {}) {
  const t = String(title || '');
  if (!t.trim()) return { iso: '', text: t };
  const f = findDate(t, ctx);
  if (!f) return { iso: '', text: t };
  const src = toLatinDigits(t).replace(STRIP, '');
  let pre = src.slice(0, f.start), post = src.slice(f.end);
  const preN = normA(pre);
  const hadLabel = TITLE_LABEL.test(preN);
  const bare = /[(\[]\s*$/.test(pre) || /^\s*[)\]]/.test(post) || /[—–|:：]\s*$/.test(pre) || /^\s*$/.test(post);
  if (!hadLabel && !bare) return { iso: '', text: t };   // تاريخ وسط جملة ليس تاريخ النشر
  pre = (hadLabel ? pre.replace(TITLE_LABEL, '') : pre).replace(/[\s\-–—|•·،,;:：(\[]+$/g, '').trim();
  post = post.replace(/^\s*(?:هـ|ه(?![؀-ۿ])|م(?![؀-ۿ])|ميلادي|هجري)?\s*[)\]]?\s*(?:[-–—|•·،,;:：]\s*)?/, '').trim();
  const text = (pre && post ? pre + ' — ' + post : pre + post).replace(/\s+/g, ' ').replace(/[\s\-–—|•·،,;:：]+$/g, '').trim();
  return { iso: f.iso, text: text || t.trim(), hijri: !!f.hijri, noYear: !!f.noYear };
}

// ---------- الأسابيع ----------
// بداية الأسبوع (الأحد) ونهايته (السبت) لتاريخ
export function weekStart(iso) { const d = parseIso(iso); d.setDate(d.getDate() - d.getDay()); return isoOf(d); }
export function weekEnd(iso) { return addDays(weekStart(iso), 6); }
export const sameWeek = (a, b) => weekStart(a) === weekStart(b);
// «الأسبوع 3» أو «الأسبوع الثالث» أو «Week 3» في عنوان — رقمه أو null
const ORD_W = { 'الاول': 1, 'الاولي': 1, 'الثاني': 2, 'الثانيه': 2, 'الثالث': 3, 'الثالثه': 3, 'الرابع': 4, 'الرابعه': 4, 'الخامس': 5, 'الخامسه': 5, 'السادس': 6, 'السادسه': 6, 'السابع': 7, 'السابعه': 7, 'الثامن': 8, 'الثامنه': 8, 'التاسع': 9, 'التاسعه': 9, 'العاشر': 10, 'العاشره': 10,
  'الحادي عشر': 11, 'الحاديه عشره': 11, 'الحاديه عشر': 11, 'الثاني عشر': 12, 'الثانيه عشره': 12, 'الثانيه عشر': 12, 'الثالث عشر': 13, 'الثالثه عشره': 13, 'الرابع عشر': 14, 'الرابعه عشره': 14, 'الخامس عشر': 15, 'الخامسه عشره': 15, 'السادس عشر': 16, 'السادسه عشره': 16, 'السابع عشر': 17, 'السابعه عشره': 17, 'الثامن عشر': 18, 'الثامنه عشره': 18 };
export function weekNo(title) {
  const s = normA(toLatinDigits(title)).replace(/^[#\s]+/, '').trim();
  let m = s.match(/(?:^|\s)(?:ال)?اسبوع\s*(?:رقم\s*)?(\d{1,2})(?!\d)/) || s.match(/(?:^|[^a-z])week\s*(\d{1,2})(?!\d)/i) || s.match(/^w(\d{1,2})\b/i);
  if (m) return +m[1];
  m = s.match(/(?:^|\s)(?:ال)?اسبوع\s+((?:الحادي|الحاديه|الثاني|الثانيه|الثالث|الثالثه|الرابع|الرابعه|الخامس|الخامسه|السادس|السادسه|السابع|السابعه|الثامن|الثامنه)\s+عشره?|[^\s:：\-–—(\[]+)/);
  if (m && ORD_W[m[1]]) return ORD_W[m[1]];
  return null;
}
// عنوان أسبوع في خطة: «الأسبوع 3» أو «الأسبوع الثالث: 12/10 – 16/10» أو «أسبوع: 12/10/2026» — لا «أسبوع المرور» (درس) إلا مع تاريخ
export const isWeekTitle = (t) => {
  const s = normA(toLatinDigits(t)).replace(/^[#\s]+/, '').trim();
  if (s.length > 90 || !(/^(?:ال)?اسبوع(?:\s|$|[:：\-–—(])/.test(s) || /^week(?:\s|$|[:：\-–—(\d])/i.test(s))) return false;
  return weekNo(s) != null || !!findDate(s);
};

// ---------- أيام الدوام ----------
export function nextSchoolDay(fromIso, days, includeSame = true) {
  const set = (days && days.length) ? days : [0, 1, 2, 3, 4];
  const d = fromIso ? parseIso(fromIso) : new Date();
  if (!includeSame) d.setDate(d.getDate() + 1);
  for (let i = 0; i < 14 && !set.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
  return isoOf(d);
}
export const isSchoolDay = (iso, days) => ((days && days.length) ? days : [0, 1, 2, 3, 4]).includes(parseIso(iso).getDay());
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function dayLabel(iso, withMonth = true) {
  if (!isIso(iso)) return '';
  const d = parseIso(iso);
  return DAY_NAMES[d.getDay()] + ' ' + toArDigits(d.getDate()) + (withMonth ? ' ' + MONTHS_AR[d.getMonth()] : '/' + toArDigits(d.getMonth() + 1));
}
export const shortDate = (iso) => (isIso(iso) ? toArDigits(parseIso(iso).getDate()) + '/' + toArDigits(parseIso(iso).getMonth() + 1) : '');

// ---------- توزيع التواريخ على الحصص ----------
// items: [{ fileDate?: ISO, fixed?: ISO }] بترتيب التنفيذ. تواريخ الملف «مراسٍ»: تُحترم كما هي (تُنقل إلى يوم الحصة التالي إن لم تكن
// يوم حصة أو كانت مستعملة)، وما بعدها بلا تاريخ يتبعها يومًا بعد يوم على أيام الحصص. fixed: تاريخ نُقل أثناء التشغيل (لا يتغيّر).
// taken: تواريخ لا تُستعمل (محفوظة لحصص أخرى). يعيد ملاحظات التعديل: [{ i, from, to, why: offday|taken, src }]
// skip: أيام إجازة (مجموعة ISO) لا تُستعمل أبدًا — تُحسب كيوم بلا حصص (why: holiday)
export function layoutDates(items, { start, days, taken, useFileDates = true, skip } = {}) {
  const used = new Set(taken || []);
  const hol = skip instanceof Set ? skip : new Set(skip || []);
  const notes = [];
  let prev = null;
  const free = (iso) => { let d = nextSchoolDay(iso, days, true); for (let i = 0; i < 120 && (used.has(d) || hol.has(d)); i++) d = nextSchoolDay(d, days, false); return d; };
  items.forEach((s, i) => {
    let want, src;
    if (s.fixed && isIso(s.fixed)) { want = s.fixed; src = 'fixed'; }
    else if (useFileDates && s.fileDate && isIso(s.fileDate)) { want = s.fileDate; src = 'file'; }
    else if (prev) { want = nextSchoolDay(prev, days, false); src = 'seq'; }
    else { want = nextSchoolDay(start && isIso(start) ? start : isoOf(new Date()), days, true); src = 'start'; }
    const d = free(want);
    if (d !== want) notes.push({ i, from: want, to: d, why: hol.has(want) ? 'holiday' : isSchoolDay(want, days) ? 'taken' : 'offday', src });
    s.date = d; s.dateSrc = src;
    used.add(d);
    // التسلسل يتبع آخر تاريخ (الأكبر) حتى لا نعود للخلف بعد مرساة متأخرة
    prev = prev && prev > d ? prev : d;
  });
  return notes;
}
// الحصص التي تقع تواريخها في أسبوع تاريخٍ ما
export const inWeekOf = (iso, anyDayIso) => isIso(iso) && isIso(anyDayIso) && weekStart(iso) === weekStart(anyDayIso);

// ---------- الإجازات وميزانية الفصل ----------
// نص الإجازات من الإعدادات: سطر لكل إجازة — «2026-11-18» أو «من 18/11/2026 إلى 19/11/2026 العيد الوطني» أو «18/11 – 22/11» — يعيد مجموعة أيام ISO
export function parseHolidays(text, ctx = {}) {
  const out = new Set();
  String(text || '').split(/\r?\n|[;؛]/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const a = findDate(t, ctx);
    if (!a) return;
    const rest = toLatinDigits(t).replace(STRIP, '').slice(a.end);
    const b = findDate(rest, { ref: a.iso });
    let from = a.iso, to = b ? b.iso : a.iso;
    if (to < from) [from, to] = [to, from];
    if (diffDays(from, to) > 120) to = from;   // مدى غير معقول: يوم واحد
    for (let x = from; x <= to; x = addDays(x, 1)) out.add(x);
  });
  return out;
}
// عدد أيام الحصص المتاحة بين تاريخين (شاملين) بعد استبعاد الإجازات
export function countSchoolDays(fromIso, toIso, days, skip) {
  if (!isIso(fromIso) || !isIso(toIso) || toIso < fromIso) return 0;
  const hol = skip instanceof Set ? skip : new Set(skip || []);
  let n = 0;
  for (let x = fromIso, i = 0; x <= toIso && i < 400; x = addDays(x, 1), i++) if (isSchoolDay(x, days) && !hol.has(x)) n++;
  return n;
}
