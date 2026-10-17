// match.js — مطابقة عنوان الدرس المفتوح في نور مع دروس التحاضير المحفوظة
// القاعدة: رقم الدرس هو الفيصل (Lesson 8 لا يطابق Lesson 2)، ثم الكلمات المفتاحية، ثم التشابه الحرفي (للأخطاء الإملائية
// والاختلافات الصغيرة: «الموقع و مظاهر السطح» = «الموقع ومظاهر السطح»، «Lesson1» = «Lesson 1»، «Colours» = «Colors»)،
// ثم الوحدة للتفريق بين الدروس المتشابهة (Lesson 2 في أكثر من وحدة).

const STOP = new Set(['في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'و', 'او', 'أو', 'ثم', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'بين', 'حول', 'كل', 'بعض',
  'ما', 'لا', 'ان', 'كيف', 'ماذا', 'لماذا', 'متى', 'اين', 'هل', 'الدرس', 'درس', 'دروس', 'الوحدة', 'الوحده', 'وحدة', 'وحده', 'الحصة', 'الحصه', 'حصة', 'حصه', 'الجزء', 'جزء',
  'الاول', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'عمان', 'سلطنة', 'سلطنه', 'lesson', 'lessons', 'unit', 'units', 'part', 'the', 'and', 'of', 'a', 'an', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'is', 'are', 'it', 'its', 'my', 'our', 'your', 'let', 's']);

// توحيد قوي للنص: همزات، تاء مربوطة، ألف مقصورة، حروف فارسية، أرقام عربية، تشكيل، ترقيم، «Lesson1» ← «lesson 1»
export function kwNorm(s) {
  return String(s || '').normalize('NFKC')
    .replace(/[ً-ْٰـ​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[کك]/g, 'ك').replace(/[یي]/g, 'ي').replace(/گ/g, 'ك')
    .replace(/&/g, ' and ')
    .replace(/[^؀-ۿa-z0-9 ]+/gi, ' ')
    .replace(/([a-z؀-ۿ])(\d)/gi, '$1 $2').replace(/(\d)([a-z؀-ۿ])/gi, '$1 $2')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function stem(w) {
  if (/^[a-z]+$/.test(w)) {
    // إنجليزي: جمع وتصريف بسيط — «colours/colors» «numbers» «reading» (تُطبَّق على الطرفين فتتساوى)
    if (w.length >= 6) w = w.replace(/(ies)$/, 'y').replace(/(ing|ed|es)$/, '');
    if (w.length >= 5) w = w.replace(/s$/, '');
    return w.replace(/ou(?=r$)/, 'o');
  }
  return w.replace(/^(وال|بال|كال|فال|لل|ال|و)(?=...)/, '')
    .replace(/(ات|ون|ين|ان|ه|ي)$/, (m, _g, _o, str) => (str.length - m.length >= 3 ? '' : m));
}

// مرادفات شائعة في أسماء الدروس (عربي/إنجليزي) تُوحَّد إلى كلمة واحدة: «Review» = «مراجعة»، «Quiz» = «اختبار»…
const SYN_GROUPS = [
  ['review', 'review', 'revision', 'revise', 'مراجعه', 'مراجعات'], ['project', 'project', 'projects', 'مشروع', 'مشاريع'],
  ['test', 'test', 'quiz', 'exam', 'assessment', 'اختبار', 'اختبارات', 'تقويم', 'تقييم'], ['story', 'story', 'stories', 'قصه', 'قصص'],
  ['grammar', 'grammar', 'قواعد'], ['vocab', 'vocabulary', 'vocab', 'مفردات'], ['read', 'reading', 'read', 'قراءه'],
  ['write', 'writing', 'write', 'كتابه'], ['listen', 'listening', 'listen', 'استماع'], ['speak', 'speaking', 'speak', 'تحدث', 'محادثه'],
  ['song', 'song', 'songs', 'chant', 'انشوده', 'اناشيد'], ['intro', 'introduction', 'intro', 'starter', 'مقدمه', 'تمهيد', 'تمهيديه'],
  ['practice', 'practice', 'practise', 'تدريب', 'تدريبات', 'تمارين'], ['culture', 'culture', 'ثقافه'], ['phonics', 'phonics', 'اصوات'],
];
const SYN = new Map();
SYN_GROUPS.forEach(([c, ...ws]) => ws.forEach((w) => SYN.set(w, c)));
const canon = (w) => SYN.get(w) || SYN.get(w.replace(/^(وال|بال|فال|ال|و)(?=..)/, '')) || stem(w);
export function keywords(s) {
  return [...new Set(kwNorm(s).split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w) && !STOP.has(w.replace(/^ال/, '')))
    .map(canon).filter((w) => w.length >= 2 && !/^\d+$/.test(w)))];
}

// نسبة الكلمات المفتاحية المشتركة
export function kwScore(title, target) {
  const a = keywords(title), b = keywords(target);
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const w of a) if (b.some((x) => x === w || (w.length >= 4 && x.length >= 4 && (x.includes(w) || w.includes(x))))) hit++;
  const base = hit / Math.max(a.length, Math.min(b.length, a.length + 2));
  // الاسم الأقصر محتوى كله في الأطول («الموقع» ⊂ «الموقع ومظاهر السطح»): تطابق قوي وإن اختلف الطول
  const short = Math.min(a.length, b.length);
  const cover = hit / short;
  return Math.max(base, cover === 1 ? (short >= 2 ? 0.8 : 0.6) : cover * 0.6);
}

// تشابه حرفي (Dice على ثلاثيات الحروف) — يلتقط الأخطاء الإملائية والاختلافات الصغيرة التي تفوّتها الكلمات
function grams(s, n = 3) {
  const t = ' ' + kwNorm(s).split(' ').filter((w) => !STOP.has(w) && !/^\d+$/.test(w)).join(' ') + ' ';
  const out = new Map();
  for (let i = 0; i + n <= t.length; i++) { const g = t.slice(i, i + n); out.set(g, (out.get(g) || 0) + 1); }
  return out;
}
export function triScore(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0, na = 0, nb = 0;
  for (const [g, c] of A) { na += c; if (B.has(g)) hit += Math.min(c, B.get(g)); }
  for (const c of B.values()) nb += c;
  return (2 * hit) / (na + nb);
}
// درجة تشابه عنوانين (٠..١): الكلمات المفتاحية أولًا، والتشابه الحرفي يسعف عند اختلاف الكتابة
export function titleSim(a, b) {
  const kw = kwScore(a, b);
  const tri = triScore(a, b);
  return Math.max(kw, (kw + tri) / 2, tri - 0.15, 0);
}

const ORDN = {
  'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14, 'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18, 'التاسع عشر': 19, 'العشرون': 20,
  'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
};
const ORDN_RE = Object.keys(ORDN).sort((a, b) => b.length - a.length).join('|');
const ENUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const ENUM_RE = Object.keys(ENUM).join('|');
const digits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
// «(2)» في آخر عنوان نور: رقم الحصة (تحضير ثانٍ للدرس نفسه) — لا يدخل في رقم الدرس
export const stripSessionSuffix = (s) => String(s || '').replace(/\s*[(（]\s*[0-9٠-٩]{1,2}\s*[)）]\s*$/, '');
export function sessionSuffix(s) { const m = digits(s).match(/[(（]\s*(\d{1,2})\s*[)）]\s*$/); return m ? +m[1] : null; }

// ترقيم مزدوج في أول العنوان «1 - 4 الصيغة التربيعية» «2.5 …» «3/1 …»: الوحدة ثم الدرس — { u, l } أو null
export function pairNums(s) {
  let t = String(digits(stripSessionSuffix(s))).trim();
  // «الدرس 1-2: …»: بعد كلمة الدرس يُقبل «:» بعد الزوج
  const pre = t.match(/^(?:الدرس|درس|lesson)\s*[:\-–—]?\s*(?=\d{1,2}\s*[-–—.\/:]\s*\d)/i);
  if (pre) t = t.slice(pre[0].length);
  const m = pre ? t.match(/^(\d{1,2})\s*[-–—.\/]\s*(\d{1,2})(?=[^\d\/.\-–—]|$)/) : t.match(/^[(\[]?\s*(\d{1,2})\s*[-–—.\/:]\s*(\d{1,2})\s*(?=[^\d\/.\-–—:]|$)/);
  return m ? { u: +m[1], l: +m[2] } : null;
}
// ملف يكتب الترقيم «الدرس-الوحدة» («1-1 الجهاز الدوري»، «2-1 القلب»…) بدل «الوحدة-الدرس»: في كل وحدة يثبت الرقم الثاني ويتغيّر الأول.
// نقلبه إلى «الوحدة-الدرس» ليُقرأ رقم الدرس صحيحًا (والمعكوس في نور يطابقه عبر swappedPair). يغيّر الحصص في مكانها.
export function fixPairOrder(lessons) {
  if (!Array.isArray(lessons)) return lessons;
  const byUnit = new Map();
  lessons.forEach((l) => { if (!l || !l.lesson) return; const k = kwNorm(l.unit || ''); if (!byUnit.has(k)) byUnit.set(k, new Map()); byUnit.get(k).set(kwNorm(l.lesson), l.lesson); });
  let swap = 0, keep = 0;
  for (const names of byUnit.values()) {
    const ps = [...names.values()].map(pairNums);
    if (ps.length < 2 || ps.some((x) => !x)) continue;
    const us = new Set(ps.map((x) => x.u)), ls = new Set(ps.map((x) => x.l));
    if (ls.size === 1 && us.size === ps.length) swap++; else if (us.size === 1 && ls.size === ps.length) keep++;
  }
  if (!swap || keep) return lessons;
  lessons.forEach((l) => {
    if (!l || !pairNums(l.lesson)) return;
    l.lesson = String(l.lesson).replace(/^(\s*(?:الدرس|درس|lesson)?\s*[:\-–—]?\s*[(\[]?\s*)([0-9٠-٩]{1,2})(\s*[-–—.\/:]\s*)([0-9٠-٩]{1,2})/i, (m, a, x, sep, y) => a + y + sep + x);
  });
  return lessons;
}
// الزوجان نفسهما معكوسين «2 - 5» و«5 - 2» (خطأ شائع في شجرة نور) — يُعدّان الدرس نفسه
export const swappedPair = (a, b) => { const x = pairNums(a), y = pairNums(b); return !!(x && y && x.u === y.l && x.l === y.u && x.u !== x.l); };
// رقم في أول العنوان «3- الموقع» «٣. المناخ» «(3) السكان» — شائع في أسماء الدروس العربية (لا في عناوين الوحدات)
export function leadNum(s) {
  const pr = pairNums(s);
  if (pr) return pr.l;
  const t = kwNorm(digits(stripSessionSuffix(s)));
  if (/^(unit|الوحده|وحده|الفصل|فصل|week|الاسبوع)\b/.test(t)) return null;
  const m = String(digits(s)).trim().match(/^[(\[]?\s*(\d{1,2})\s*[)\]\-–—.:،]\s*\S/);
  return m ? +m[1] : null;
}
// رقم الدرس من العنوان: «Lesson 8» أو «Lesson Eight» أو «U1 L3» أو «الدرس 8» أو «الدرس الثامن» أو «درس رقم ٨» — وإلا رقم في أوله «8- …»
export function lessonNum(s) {
  // «الدرس 1-2 …» / «Lesson 1-2 …»: ترقيم مزدوج بعد كلمة الدرس — الرقم الثاني هو الدرس، لا رقم الوحدة
  if (/^\s*(?:الدرس|درس|lesson)/i.test(String(digits(s)))) { const pr = pairNums(s); if (pr) return pr.l; }
  const t = kwNorm(digits(stripSessionSuffix(s)));
  let m = t.match(/(?:(?<![a-z])(?:lesson|les|lsn)|درس|الدرس)\s*(?:رقم\s*|no\s*|number\s*)?(\d+)/i);
  if (m) return +m[1];
  m = t.match(new RegExp('\\blesson\\s+(' + ENUM_RE + ')\\b', 'i'));
  if (m) return ENUM[m[1].toLowerCase()];
  m = t.match(/\bu\s*\d+\s*l\s*(\d+)\b/i) || t.match(/^l\s*(\d+)\b/i);
  if (m) return +m[1];
  m = t.match(new RegExp('(?:الدرس|درس)\\s+(' + ORDN_RE + ')'));
  if (m) return ORDN[m[1]];
  return leadNum(s);
}

// رقم الوحدة: «Unit 2» أو «U2» أو «الوحدة 2» أو «الوحدة الثانية»؛ الوحدة التمهيدية (Welcome/Starter/Hello) = ٠
const ORDF = { 'الاولي': 1, 'الثانيه': 2, 'الثالثه': 3, 'الرابعه': 4, 'الخامسه': 5, 'السادسه': 6, 'السابعه': 7, 'الثامنه': 8, 'التاسعه': 9, 'العاشره': 10, 'الحاديه عشره': 11, 'الحاديه عشر': 11, 'الثانيه عشره': 12, 'الثانيه عشر': 12 };
const ORDF_RE = Object.keys(ORDF).sort((a, b) => b.length - a.length).join('|');
export function unitNum(s) {
  const t = kwNorm(digits(s));
  let m = t.match(/(?:(?<![a-z])unit|الوحده|وحده)\s*(?:رقم\s*|no\s*|number\s*)?(\d+)/i);
  if (m) return +m[1];
  m = t.match(new RegExp('\\bunit\\s+(' + ENUM_RE + ')\\b', 'i'));
  if (m) return ENUM[m[1].toLowerCase()];
  m = t.match(/\bu\s*(\d+)\s*l\s*\d+\b/i) || t.match(/^u\s*(\d+)\b/i);
  if (m) return +m[1];
  if (/\b(?:welcome|starter|hello|intro(?:duction|ductory)?)\s+unit\b|\bunit\s+(?:0|zero)\b|الوحده التمهيديه/i.test(t)) return 0;
  m = t.match(new RegExp('(?:الوحده|وحده)\\s+(' + ORDF_RE + ')'));
  if (m) return ORDF[m[1]];
  const pr = pairNums(s);
  return pr ? pr.u : null;
}
// اسم الدرس دون أرقامه الأولى — للمقارنة الاسمية الصرفة
export const nameOnly = (s) => String(stripSessionSuffix(s) || '').replace(/^[(\[]?\s*\d{1,2}\s*[-–—.\/:]\s*\d{1,2}\s*[)\]\-–—.:،]?\s*/, '').replace(/^[(\[]?\s*\d{1,2}\s*[)\]\-–—.:،]\s*/, '').trim();

// درجة تشابه عنوان نور مع درس — رقم الدرس فيصل، ثم الكلمات والتشابه الحرفي، ثم الوحدة
// unitTitle: وحدة درس المكتبة (إن عُرفت) — وإلا تُقارن كلمات الوحدة بالعنوان نفسه (عنوان نور قد يحمل اسم الوحدة)
function scoreLesson(title, l, na, ua, unitTitle) {
  const name = l.lesson || '';
  let sc = titleSim(title, name);
  const nb = lessonNum(name);
  const swapped = swappedPair(title, name);
  if (na != null && nb != null) {
    if (na === nb || swapped) sc = Math.max(sc, 0.5) + (swapped ? 0.8 : 1);
    else {
      // الرقم مختلف لكن الاسم طويل ومحدد ومتطابق تقريبًا (لا «Grammar» عامة): الرقم هو الخطأ غالبًا
      const specific = keywords(nameOnly(title)).length >= 3 && keywords(nameOnly(name)).length >= 3;
      sc = specific && titleSim(nameOnly(title), nameOnly(name)) >= 0.8 ? sc * 0.9 : 0;
    }
  }
  // كلمات الوحدة ترجّح بين دروس متشابهة (مثل Lesson 2 في أكثر من وحدة)
  if (sc > 0) sc += 0.3 * titleSim(unitTitle != null ? unitTitle : title, l.unit || '');
  const ub = unitNum((l.unit || '') + ' ' + name);
  if (sc > 0 && ua != null && ub != null && !swapped) sc = ua === ub ? sc + 0.5 : (sc >= 1.5 ? sc : 0);
  return sc;
}

// الدروس مرتبة بقربها من عنوان نور (حتى القريب قليلًا) — لعرضها للتأكيد حين لا يكون التطابق واضحًا
export function rankLessons(pkgs, title, n = 3) {
  title = stripSessionSuffix(title);
  if (!title) return [];
  const na = lessonNum(title), ua = unitNum(title);
  const out = [];
  for (const p of pkgs || []) {
    const seen = new Set();
    for (const l of p.lessons || []) {
      const key = (l.unit || '') + '|' + (l.lesson || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const sc = scoreLesson(title, l, na, ua);
      if (sc > 0) out.push({ pkg: p, lesson: l, score: sc });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

// أفضل درس مطابق عبر كل الحزم: { pkg, lesson (أول حصة في الدرس), score } أو null
export const MATCH_MIN = 0.34;
export function bestLesson(pkgs, title) {
  const top = rankLessons(pkgs, title, 3);
  if (!top[0] || top[0].score < MATCH_MIN) return null;
  if (top[1] && top[1].score === top[0].score && top[1].pkg === top[0].pkg) {
    // أسماء الدروس نفسها تنتهي بأرقام بين قوسين («سورة النبأ (2)»): الرقم يفرّق
    const sfx = sessionSuffix(title);
    if (sfx != null) { const exact = top.find((t) => t.score === top[0].score && sessionSuffix(t.lesson.lesson) === sfx); if (exact) return exact; }
    // مرشّحان متساويان تمامًا (الاسم نفسه في وحدتين بلا ما يفرّق): لا نخمّن
    if (lessonNum(title) == null && unitNum(title) == null) return null;
  }
  return top[0];
}

// درس شجرة نور المطابق لدرس في مكتبتك — nodes: [{ id, text, unit }]
// يُرجع { node, score } أو null إن لم يتضح (لا نخمّن بين درسين متساويين إلا إن فرّقت بينهما الوحدة)
export function bestTreeLesson(nodes, lesson) {
  const name = stripSessionSuffix((lesson && lesson.lesson) || '').trim();
  if (!name || !(nodes || []).length) return null;
  const unit = (lesson && lesson.unit) || '';
  // اسم الدرس وحده يُقارن بأسماء دروس الشجرة (اسم الوحدة يُقارن بوحدة الشجرة على حدة — فلا تُشوّش كلمات الوحدة على التطابق)
  const na = lessonNum(name), ua = unitNum(unit + ' ' + name);
  const top = nodes.map((n) => ({ n, score: scoreLesson(name, { lesson: n.text, unit: n.unit || '' }, na, ua, unit) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
  if (!top[0] || top[0].score < MATCH_MIN) return null;
  if (top[1] && (top[1].score === top[0].score || (top[0].score < 0.7 && top[0].score - top[1].score < 0.1))) {
    // تعادل أو تقارب شديد بين مرشّحين ضعيفين: الوحدة تفرّق (الأقرب لوحدة درس المكتبة)، وإلا لا نجزم
    const u0 = titleSim(unit, top[0].n.unit || ''), u1 = titleSim(unit, top[1].n.unit || '');
    if (!(unit && Math.abs(u0 - u1) >= 0.25)) return null;
    if (u1 > u0) top[0] = top[1];
  }
  return { node: top[0].n, score: top[0].score, runner: top[1] ? { node: top[1].n, score: top[1].score } : null };
}
// أقرب درس في الشجرة مهما كان ضعيفًا (للتشخيص: «الأقرب في نور: … ٤٥٪»)
export function closestTreeLesson(nodes, lesson) {
  const name = stripSessionSuffix((lesson && lesson.lesson) || '').trim();
  if (!name || !(nodes || []).length) return null;
  const best = nodes.map((n) => ({ node: n, sim: titleSim(nameOnly(name) || name, nameOnly(n.text) || n.text) })).sort((a, b) => b.sim - a.sim)[0];
  return best && best.sim > 0 ? best : null;
}

// للتصفية قبل تحميل الدروس: هل تحتمل وحدة الشجرة هذه درسَ المكتبة؟
export function unitMayHold(unitText, lesson) {
  const want = unitNum([lesson && lesson.unit, lesson && lesson.lesson].filter(Boolean).join(' '));
  const got = unitNum(unitText);
  if (want != null && got != null) return want === got;
  if (want != null || got != null) return null;   // لا نعرف — تُفحص بعد الوحدات الواضحة
  return null;   // بلا أرقام لا نجزم: تُحمَّل كل الوحدات ويُختار الأقرب بينها
}

// شرح مختصر لسبب التطابق أو عدمه (للتشخيص وتقرير التشغيل)
export function explainMatch(title, lesson) {
  const na = lessonNum(title), nb = lessonNum((lesson && lesson.lesson) || '');
  const kw = kwScore(title, (lesson && lesson.lesson) || ''), tri = triScore(title, (lesson && lesson.lesson) || '');
  const parts = [];
  if (na != null && nb != null) parts.push(na === nb ? `رقم الدرس متطابق (${na})` : `رقم الدرس مختلف (${na} ≠ ${nb})`);
  parts.push(`كلمات مشتركة ${Math.round(kw * 100)}٪`, `تشابه حرفي ${Math.round(tri * 100)}٪`);
  return parts.join(' · ');
}
