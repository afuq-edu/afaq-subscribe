// match.js — مطابقة عنوان الدرس المفتوح في نور مع دروس التحاضير المحفوظة
// القاعدة: رقم الدرس هو الفيصل (Lesson 8 لا يطابق Lesson 2)، ثم الكلمات المفتاحية.

const STOP = new Set(['في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'و', 'او', 'أو', 'ثم', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'بين', 'حول', 'كل', 'بعض',
  'الدرس', 'درس', 'الوحدة', 'وحدة', 'الحصة', 'حصة', 'الاول', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'عمان', 'سلطنة', 'lesson', 'unit', 'the', 'and', 'of', 'a', 'an', 'to', 'in']);

export function kwNorm(s) {
  return String(s || '').normalize('NFKC')
    .replace(/[ً-ٰٟـ​-‏؜﻿]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^؀-ۿa-z0-9 ]+/gi, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function stem(w) {
  return w.replace(/^(وال|بال|كال|فال|لل|ال|و)(?=...)/, '')
    .replace(/(ات|ون|ين|ان|ه|ي)$/, (m, _g, _o, str) => (str.length - m.length >= 3 ? '' : m));
}

export function keywords(s) {
  return [...new Set(kwNorm(s).split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w) && !STOP.has(w.replace(/^ال/, '')))
    .map(stem).filter((w) => w.length >= 2 && !/^\d+$/.test(w)))];
}

export function kwScore(title, target) {
  const a = keywords(title), b = keywords(target);
  if (!a.length || !b.length) return 0;
  let hit = 0;
  for (const w of a) if (b.some((x) => x === w || (w.length >= 4 && x.length >= 4 && (x.includes(w) || w.includes(x))))) hit++;
  return hit / Math.max(a.length, Math.min(b.length, a.length + 2));
}

const ORDN = {
  'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14, 'الخامس عشر': 15,
  'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
};

const ENUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const ENUM_RE = Object.keys(ENUM).join('|');
const digits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
// «(2)» في آخر عنوان نور: رقم الحصة (تحضير ثانٍ للدرس نفسه) — لا يدخل في رقم الدرس
export const stripSessionSuffix = (s) => String(s || '').replace(/\s*[(（]\s*[0-9٠-٩]{1,2}\s*[)）]\s*$/, '');
export function sessionSuffix(s) { const m = digits(s).match(/[(（]\s*(\d{1,2})\s*[)）]\s*$/); return m ? +m[1] : null; }

// رقم الدرس من العنوان: «Lesson 8» أو «Lesson Eight» أو «U1 L3» أو «الدرس 8» أو «الدرس الثامن»
export function lessonNum(s) {
  const t = kwNorm(digits(stripSessionSuffix(s)));
  let m = t.match(/(?:(?<![a-z])(?:lesson|les)|درس|الدرس)\s*(?:رقم\s*|no\s*)?(\d+)/i);
  if (m) return +m[1];
  m = t.match(new RegExp('\\blesson\\s+(' + ENUM_RE + ')\\b', 'i'));
  if (m) return ENUM[m[1].toLowerCase()];
  m = t.match(/\bu\s*\d+\s*l\s*(\d+)\b/i) || t.match(/^l\s*(\d+)\b/i);
  if (m) return +m[1];
  m = t.match(/(?:الدرس|درس)\s+(الحادي عشر|الثاني عشر|الثالث عشر|الرابع عشر|الخامس عشر|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/);
  if (m) return ORDN[m[1]];
  return null;
}

// رقم الوحدة: «Unit 2» أو «U2» أو «الوحدة 2» أو «الوحدة الثانية»؛ الوحدة التمهيدية (Welcome/Starter/Hello) = ٠
const ORDF = { 'الاولي': 1, 'الثانيه': 2, 'الثالثه': 3, 'الرابعه': 4, 'الخامسه': 5, 'السادسه': 6, 'السابعه': 7, 'الثامنه': 8, 'التاسعه': 9, 'العاشره': 10 };
export function unitNum(s) {
  const t = kwNorm(digits(s));
  let m = t.match(/(?:(?<![a-z])unit|الوحده|وحده)\s*(?:رقم\s*|no\s*)?(\d+)/i);
  if (m) return +m[1];
  m = t.match(new RegExp('\\bunit\\s+(' + ENUM_RE + ')\\b', 'i'));
  if (m) return ENUM[m[1].toLowerCase()];
  m = t.match(/\bu\s*(\d+)\s*l\s*\d+\b/i) || t.match(/^u\s*(\d+)\b/i);
  if (m) return +m[1];
  if (/\b(?:welcome|starter|hello|intro(?:duction|ductory)?)\s+unit\b|\bunit\s+(?:0|zero)\b|الوحده التمهيديه/i.test(t)) return 0;
  m = t.match(/(?:الوحده|وحده)\s+(الاولي|الثانيه|الثالثه|الرابعه|الخامسه|السادسه|السابعه|الثامنه|التاسعه|العاشره)/);
  if (m) return ORDF[m[1]];
  return null;
}

// درجة تشابه عنوان نور مع درس — رقم الدرس فيصل، ثم الكلمات المفتاحية، ثم الوحدة
function scoreLesson(title, l, na, ua) {
  const name = l.lesson || '';
  let sc = kwScore(title, name);
  const nb = lessonNum(name);
  if (na != null && nb != null) sc = na === nb ? Math.max(sc, 0.5) + 1 : 0;
  // كلمات الوحدة ترجّح بين دروس متشابهة (مثل Lesson 2 في أكثر من وحدة)
  if (sc > 0) sc += 0.3 * kwScore(title, l.unit || '');
  const ub = unitNum((l.unit || '') + ' ' + name);
  if (sc > 0 && ua != null && ub != null) sc = ua === ub ? sc + 0.5 : 0;
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
export function bestLesson(pkgs, title) {
  const top = rankLessons(pkgs, title, 1)[0];
  return top && top.score >= 0.34 ? top : null;
}

// درس شجرة نور المطابق لدرس في مكتبتك — nodes: [{ id, text, unit }]
// يُرجع { node, score } أو null إن لم يتضح (لا نخمّن بين درسين متساويين)
export function bestTreeLesson(nodes, lesson) {
  const title = [lesson && lesson.unit, lesson && lesson.lesson].filter(Boolean).join(' — ');
  if (!title || !(nodes || []).length) return null;
  const pseudo = [{ id: 'tree', lessons: nodes.map((n) => ({ id: n.id, unit: n.unit || '', lesson: n.text })) }];
  const top = rankLessons(pseudo, title, 2);
  if (!top[0] || top[0].score < 0.34) return null;
  if (top[1] && top[1].score === top[0].score) return null;
  return { node: nodes.find((n) => n.id === top[0].lesson.id), score: top[0].score };
}

// للتصفية قبل تحميل الدروس: هل تحتمل وحدة الشجرة هذه درسَ المكتبة؟
export function unitMayHold(unitText, lesson) {
  const want = unitNum([lesson && lesson.unit, lesson && lesson.lesson].filter(Boolean).join(' '));
  const got = unitNum(unitText);
  if (want != null && got != null) return want === got;
  if (want != null || got != null) return null;   // لا نعرف — تُفحص بعد الوحدات الواضحة
  return null;   // بلا أرقام لا نجزم: تُحمَّل كل الوحدات ويُختار الأقرب بينها
}
