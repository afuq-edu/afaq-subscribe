// parse.js — تحويل نص التحضير (Word / Markdown / نص عادي) إلى حصص جاهزة لبنود نور

export const NOOR_STRATEGIES = ['الفصل المقلوب', 'التعلم التعاوني', 'التعلم التشاركي', 'التعلم الذاتي', 'التعلم بالاكتشاف',
  'التعلم المبني على حل المشكلات', 'التعلم المبني على المشاريع', 'التعلم المبني على اللعب', 'التعلم بالنمذجة', 'التعلم المتمايز',
  'الخرائط الذهنية', 'العصف الذهني', 'رحلات تعليمية', 'رحلات تعليمية افتراضية', 'تجارب معملية', 'تجارب معملية افتراضية', 'تقارير كتب', 'دراسة حالة'];
export const NOOR_RESOURCES = ['الكتاب', 'كتب الكترونية', 'السبورة التقليدية', 'السبورة الذكية', 'الأقلام', 'جهاز عرض البيانات', 'جهاز الحاسب',
  'صورة توضيحية', 'عروض تقديمية', 'نماذج مجسمة', 'الوسائط المتعددة (سمعية - بصرية)', 'الوسائط الاجتماعية', 'برمجيات /تطبيقات مثل Edpuzzle, Padlet, Kahoot'];
export const NOOR_LEVELS = ['التذكر', 'الفهم', 'التطبيق', 'التحليل', 'التقييم', 'الإبداع'];

const ORD_F = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
const ORD_ANY = '(?:الأول[ىى]?|الاول[ىى]?|الأولى|الثاني[ةه]?|الثالث[ةه]?|الرابع[ةه]?|الخامس[ةه]?|السادس[ةه]?|السابع[ةه]?|الثامن[ةه]?|التاسع[ةه]?|العاشر[ةه]?|الحادي?[ةه]? عشر[ةه]?|الثاني[ةه]? عشر[ةه]?|\\d+|[٠-٩]+)';

const deDia = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '');
const normA = (s) => deDia(s).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
const bare = (s) => String(s).replace(/^\s*([-*•▪◦·]|\d+[.)-]|[٠-٩]+[.)-])\s*/, '').replace(/\*\*|__/g, '').replace(/[.。:：]\s*$/, '').trim();

function toHtml(lines) {
  // «- » و«* » نقطة، أما «**نص**» فعريض لا نقطة
  return lines.filter((l) => l.trim()).map((l) => `<p>${inline(l.replace(/^\s*(?:[-•▪◦·]|\*(?!\*))\s*/, '• ').trim())}</p>`).join('');
}

// ---------- أقسام الحصة وأسماؤها المحتملة ----------
const SECTIONS = [
  ['outcomes', /^(المخرجات|مخرجات|الأهداف|الاهداف|أهداف|نواتج|learning outcomes?|outcomes?|objectives?)/i],
  ['levels', /^(المستوى|المستويات|مستوى|levels?|bloom)/i],
  ['strategies', /^(الاستراتيجي|الإستراتيجي|استراتيجي|إستراتيجي|طرائق|طرق التدريس|strateg|teaching methods?)/i],
  ['resources', /^(المصادر|مصادر|الوسائل|وسائل|الأدوات|resources?|materials?|aids?)/i],
  ['concepts', /^(المفاهيم|مفاهيم|المصطلحات|المفردات|vocabulary|key words|concepts?)/i],
  ['intro', /^(التهيئة|التمهيد|تهيئة|تمهيد|التعلم القبلي|warm.?up|lead.?in|starter|introduction)/i],
  ['procedures', /^(إجراءات|اجراءات|الإجراءات|الاجراءات|سير الدرس|خطوات|الأنشطة|الانشطة|procedures?|activities|steps|main activity)/i],
  ['formative', /^(التقويم التكويني|تقويم تكويني|التكويني|formative)/i],
  ['summative', /^(التقويم الختامي|تقويم ختامي|الختامي|summative|closure|plenary|wrap.?up)/i],
  ['homework', /^(الواجب|واجب|الواجبات|homework)/i],
  ['support', /^(الدعم|الإثراء|الاثراء|المعالجة|differentiation|support|extension)/i],
  ['notes', /^(ملاحظات|notes?)/i],
];
// loose (للعناوين والتسميات فقط): يسمح برقم أو رمز قبل اسم البند «١ المخرجات التعليمية»، «🎯 المخرجات»
export function sectionOf(t, loose = false) {
  let x = bare(t).replace(/^#+\s*/, '').replace(/^\(?[\d٠-٩]+\s*[.)\-–:]\s*/, '');   // «(٣) …» «٣- …»
  if (loose) x = x.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^[\d٠-٩]+\s*/, '').replace(/^[^\p{L}]+/u, '');
  x = x.trim();
  for (const [k, re] of SECTIONS) if (re.test(x)) return k;
  return null;
}

// ---------- مطابقة الاستراتيجيات والمصادر بقوائم نور ----------
const STRAT_ALIAS = [
  [/حل المشكلات|problem.?solv/i, 'التعلم المبني على حل المشكلات'], [/المشاريع|project/i, 'التعلم المبني على المشاريع'],
  [/اللعب|الألعاب|العاب|game|play/i, 'التعلم المبني على اللعب'], [/النمذجة|model/i, 'التعلم بالنمذجة'],
  [/الاكتشاف|الاستكشاف|discover|inquiry/i, 'التعلم بالاكتشاف'], [/التعاوني|تعاوني|المجموعات|cooperat|group work/i, 'التعلم التعاوني'],
  [/التشاركي|تشاركي|الأقران|pair|peer|collaborat/i, 'التعلم التشاركي'], [/الذاتي|ذاتي|self/i, 'التعلم الذاتي'],
  [/المتمايز|متمايز|الفروق الفردية|differentiat/i, 'التعلم المتمايز'], [/المقلوب|flipped/i, 'الفصل المقلوب'],
  [/الخرائط الذهنية|خريطة ذهنية|mind.?map/i, 'الخرائط الذهنية'], [/العصف الذهني|brainstorm/i, 'العصف الذهني'],
  [/رحلات? تعليمية افتراضية|جولة افتراضية|virtual (trip|tour)/i, 'رحلات تعليمية افتراضية'], [/رحلات? تعليمية|field trip/i, 'رحلات تعليمية'],
  [/تجارب معملية افتراضية|مختبر افتراضي|virtual lab/i, 'تجارب معملية افتراضية'], [/تجارب معملية|التجريب|experiment|lab/i, 'تجارب معملية'],
  [/تقارير? كتب|book report/i, 'تقارير كتب'], [/دراسة حالة|case study/i, 'دراسة حالة'],
];
const RES_ALIAS = [
  [/كتب? (ال)?(ا|إ)لكترونية|e.?book/i, 'كتب الكترونية'], [/الكتاب|كتاب الطالب|الكتاب المدرسي|كتاب النشاط|text ?book|student'?s? book|activity book|workbook/i, 'الكتاب'],
  [/السبورة الذكية|اللوح الذكي|smart ?board|interactive board/i, 'السبورة الذكية'], [/السبورة|اللوح|white ?board|board/i, 'السبورة التقليدية'],
  [/الأقلام|أقلام|اقلام|markers?|pens?/i, 'الأقلام'], [/جهاز (ال)?عرض|بروجكتر|داتا ?شو|projector|data ?show/i, 'جهاز عرض البيانات'],
  [/الحاسب(?!ة)|الحاسوب|حاسوب|الكمبيوتر|لابتوب|computer|laptop/i, 'جهاز الحاسب'],
  [/صور|صورة|خريطة|خرائط|الأشكال|أشكال|بطاقات|لوحات|pictures?|images?|flash ?cards?|posters?|maps?/i, 'صورة توضيحية'],
  [/عرض تقديمي|عروض تقديمية|بوربوينت|باوربوينت|power ?point|slides?|presentation/i, 'عروض تقديمية'],
  [/مجسم|نماذج|realia|models?/i, 'نماذج مجسمة'], [/الوسائط الاجتماعية|وسائل التواصل|social media/i, 'الوسائط الاجتماعية'],
  [/فيديو|مقطع|صوت|تسجيل|أغنية|اغنية|أنشودة|audio|video|song|cd|listening/i, 'الوسائط المتعددة (سمعية - بصرية)'],
  [/برمجيات|تطبيقات|تطبيق|kahoot|padlet|edpuzzle|wordwall|quizizz|app/i, 'برمجيات /تطبيقات مثل Edpuzzle, Padlet, Kahoot'],
];
const LEVEL_ALIAS = [[/تذكر|remember|recall|knowledge/i, 'التذكر'], [/فهم|understand|comprehen/i, 'الفهم'], [/تطبيق|apply|application/i, 'التطبيق'],
  [/تحليل|analy/i, 'التحليل'], [/تقويم|تقييم|evaluat/i, 'التقييم'], [/ابداع|إبداع|تركيب|create|creat|synthes/i, 'الإبداع']];

function splitItems(lines) {
  return lines.map(bare).filter(Boolean).flatMap((x) => x.split(/[،,؛;]/)).map((x) => x.trim()).filter(Boolean);
}

const OTHER_RE = /^\s*(?:أخرى|اخرى|other)\s*[:：\-–]\s*/i;
export function mapStrategies(items) {
  const strategies = [], other = [];
  for (const raw of items) {
    if (OTHER_RE.test(raw)) { const x = raw.replace(OTHER_RE, '').trim(); if (x && !other.includes(x)) other.push(x); continue; }
    let y = deDia(raw).trim();
    const hits = [];
    for (const [re, v] of STRAT_ALIAS) if (re.test(y) && !hits.includes(v)) { hits.push(v); y = y.replace(re, ' '); }
    hits.forEach((h) => { if (!strategies.includes(h)) strategies.push(h); });
    // ما تبقى من العبارة (مثل «الحوار والمناقشة») يُكتب في خانة «أخرى»
    // (حدود الكلمات \b لا تعمل مع العربية في JS، لذا نستخدم المسافات)
    const rest = (' ' + y + ' ').replace(/\s(التعلم|المبني على|المبني|learning|based|on)(?=\s)/gi, ' ')
      .replace(/\s+/g, ' ').trim().replace(/^و(?=\S)/, '').replace(/^[\s,،-]+|[\s,،و-]+$/g, '').trim();
    if (!hits.length) { if (raw.trim() && !other.includes(raw.trim())) other.push(raw.trim()); }
    else if (rest.length > 3 && /[؀-ۿa-z]{3}/i.test(rest) && !other.includes(rest)) other.push(rest);
  }
  return { strategies, other: other.join('، ') };
}

export function mapResources(items) {
  const resources = [], other = [];
  for (const raw of items) {
    if (OTHER_RE.test(raw)) { const x = raw.replace(OTHER_RE, '').trim(); if (x && !other.includes(x)) other.push(x); continue; }
    const y = deDia(raw);
    const hit = RES_ALIAS.find(([re]) => re.test(y));
    if (hit) { if (!resources.includes(hit[1])) resources.push(hit[1]); }
    else if (raw.trim() && !other.includes(raw.trim())) other.push(raw.trim());
  }
  return { resources, other: other.join('، ') };
}

// كل المستويات المذكورة بترتيب ظهورها (مهما كان الفاصل: ، أو - أو /)
function mapLevels(text) {
  const t = deDia(String(text));
  const hits = [];
  for (const [re, v] of LEVEL_ALIAS) { const m = re.exec(t); if (m) hits.push([m.index, v]); }
  return hits.sort((a, b) => a[0] - b[0]).map(([, v]) => v).filter((v, i, a) => a.indexOf(v) === i);
}

// ---------- التحليل ----------
export const RE_UNIT = new RegExp('^(?:الوحدة\\s+' + ORD_ANY + '|unit\\s*\\d+)', 'i');
export const RE_LESSON = new RegExp('^(?:الدرس\\s+' + ORD_ANY + '|lesson\\s*\\d+)', 'i');
export const RE_SESSION = new RegExp('^(?:الحصة\\s+' + ORD_ANY + '|(?:session|period|class)\\s*\\d+)', 'i');
// في سطر عادي (لا عنوان #): «Period 2:» أو «Class 6» وحدها حصة، أما «Class 6 will read…» فمحتوى
const RE_SESSION_PLAIN = new RegExp('^(?:الحصة\\s+' + ORD_ANY + '|(?:session|period|class)\\s*\\d+\\s*(?:[:：\\-–—(.]|$))', 'i');
const RE_ORD_ONLY = new RegExp('^' + ORD_ANY + '$');
// عنوان صريح بلا ترتيب: «## الدرس: الموقع ومظاهر السطح» · «## الحصة: الأولى» · «# الوحدة: عمان»
const RE_MARK = /^(الوحدة|الدرس|الحصة|unit|lesson|session)\s*[:：]\s*(.*)$/i;

// هل يُقرأ هذا السطر عنوانًا (وحدة/درس/حصة/بند)؟ — من يولّد نصًا يسبق سطور المحتوى بـ«> » إن كانت كذلك
export function isStructural(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/^[-=_*]{3,}$/.test(t) || /^[#>]/.test(t)) return true;
  const head = bare(t).replace(/^\*+|\*+$/g, '').trim();
  if (head.length <= 110 && (RE_UNIT.test(head) || RE_LESSON.test(head) || RE_SESSION.test(head))) return true;
  if (head.length <= 40 && sectionOf(head)) return true;
  if (/[:：]/.test(head)) { const pre = head.split(/[:：]/)[0]; if (pre.length <= 30 && sectionOf(pre)) return true; }
  return false;
}

// «الحصة الثانية» وحدها أو «الحصة الثانية: نص» (لا «الحصة الثانية من هذا الدرس…»)
const RE_SESSION_SPLIT = new RegExp('^((?:الحصة\\s+' + ORD_ANY + ')|(?:(?:session|period|class)\\s*\\d+))\\s*(?:[:：\\-–—]\\s*(.*))?$', 'i');
// سطر عنوان حصة (لا يُحمى بـ«> » داخل بند، ليُقرأ التحضير المدمج)
export const isSessionLine = (l) => RE_SESSION.test(bare(String(l || '').replace(/^#+\s*/, '')).replace(/^\*+|\*+$/g, '').trim());

// fieldMajor: «التحضير المدمج» — كل بند ثم أجزاء الحصص داخله («المخرجات» ← «الحصة الأولى: …» ← «الحصة الثانية: …»)
export function parsePlanText(text, opts = {}) {
  const fieldMajor = !!(opts && opts.fieldMajor);
  const lines = String(text || '').replace(/\r/g, '').replace(/ /g, ' ').split('\n');
  const created = [];
  const bySess = new Map();
  let unit = '', lesson = '', cur = null, sec = null;
  const sk = (t) => unit + '|' + lesson + '|' + normA(bare(t)).replace(/[\s:：.\-–—]+/g, ' ').trim();
  const newSession = (title, implicit) => { const s = { unit, lesson, title, sec: {}, implicit: !!implicit }; created.push(s); if (!bySess.has(sk(title))) bySess.set(sk(title), s); return s; };
  const startSession = (title) => { cur = newSession(title); sec = null; };
  // داخل بند (المدمج): الحصة نفسها تُستكمل من كل بند، ويبقى البند الحالي
  const partKinds = new Set();
  const sessionPart = (m) => {
    const title = m[1].trim();
    partKinds.add(sec);
    cur = bySess.get(sk(title)) || newSession(title);
    cur.sec[sec] = cur.sec[sec] || [];
    if (m[2] && m[2].trim()) cur.sec[sec].push(m[2].trim());
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^[-=_*]{3,}$/.test(line)) continue;
    // «> نص»: محتوى دائمًا (لا يُقرأ عنوانًا حتى لو بدأ باسم بند)
    if (line.startsWith('>')) { if (cur && sec) cur.sec[sec].push(line.replace(/^>\s?/, '')); continue; }
    const md = line.match(/^#{1,6}\s*(.+)$/);
    const head = bare(md ? md[1] : line).replace(/^\*+|\*+$/g, '').trim();
    const short = head.length <= 110;

    const mk = md && head.match(RE_MARK);
    if (mk) {
      const kind = mk[1].toLowerCase(), name = mk[2].trim();
      if (kind === 'الوحدة' || kind === 'unit') { cur = null; sec = null; unit = !name ? head : RE_ORD_ONLY.test(name) ? 'الوحدة ' + name : name; continue; }
      if (kind === 'الدرس' || kind === 'lesson') { cur = null; sec = null; lesson = !name ? head : RE_ORD_ONLY.test(name) ? 'الدرس ' + name : name; continue; }
      if (!name) { cur = newSession('الحصة الأولى', true); sec = null; } else startSession(RE_ORD_ONLY.test(name) ? 'الحصة ' + name : name);
      continue;
    }

    if (short && RE_UNIT.test(head) && (md || head.length <= 90)) { cur = null; sec = null; unit = head; continue; }
    if (short && RE_LESSON.test(head) && (md || head.length <= 100)) { cur = null; sec = null; lesson = head; continue; }
    // داخل بند (المدمج): سطر «الحصة الأولى: …» جزء من البند الحالي لتلك الحصة — أما العناوين (#) فحصص جديدة
    if (fieldMajor && sec && !md && head.length <= 400) { const m = head.match(RE_SESSION_SPLIT); if (m) { sessionPart(m); continue; } }
    if (short && (md ? RE_SESSION : RE_SESSION_PLAIN).test(head) && (md || head.length <= 100)) { startSession(head); continue; }

    // عنوان قسم: بعلامة # أو سطر قصير يطابق اسم قسم معروف (مثل «المخرجات:»)
    let k = md ? sectionOf(head, true) : head.length <= 40 ? sectionOf(head) : null;
    // «الاستراتيجيات: العصف الذهني، …» — اسم القسم ثم المحتوى في نفس السطر
    if (!k && /[:：]/.test(head)) { const pre = head.split(/[:：]/)[0]; if (pre.length <= 30) k = sectionOf(pre); }
    if (k) {
      if (!cur) { if (!lesson && !unit) lesson = 'الدرس'; cur = newSession('الحصة الأولى', true); }
      sec = k; cur.sec[k] = cur.sec[k] || [];
      // نص بعد النقطتين في نفس السطر: «المستوى: تطبيق»
      const after = line.replace(/^#+\s*/, '').split(/[:：]/).slice(1).join(':').trim();
      if (after) cur.sec[k].push(after);
      continue;
    }
    // عنوان غير معروف داخل بند: يُضاف نصه دون علامات #
    if (cur && sec) cur.sec[sec].push(md ? md[1] : raw);
  }
  if (opts && opts.stats) opts.stats.partKinds = partKinds.size;
  const filled = (c) => Object.values(c.sec).reduce((n, a) => n + (a.some((l) => l.trim()) ? 1 : 0), 0);
  const txt = (c, k) => (c.sec[k] || []).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  // نسخة مكررة فعلًا: كل ما فيها موجود في الأخرى (مثل صفحة فيها المدمج والمنفصل معًا)
  const within = (small, big) => Object.keys(small.sec).every((k) => !txt(small, k) || txt(big, k).includes(txt(small, k)));
  const out = [], at = new Map();
  for (const c of created.filter((x) => filled(x) > 0)) {
    const key = c.unit + '|' + c.lesson + '|' + normA(bare(c.title));
    const i = at.get(key);
    if (i != null && within(c, out[i])) continue;
    if (i != null && within(out[i], c)) { out[i] = c; continue; }
    if (i == null) at.set(key, out.length);
    out.push(c);
  }

  // ترقيم الحصص التي تكرر عنوانها «الحصة الأولى» داخل الدرس (كما كان)
  const counters = {};
  out.forEach((c) => {
    const key = c.unit + '|' + c.lesson;
    counters[key] = (counters[key] || 0) + 1;
    if (c.title === 'الحصة الأولى' && counters[key] > 1) c.title = 'الحصة ' + (ORD_F[counters[key] - 1] || counters[key]);
  });
  return out.map((c, i) => buildSession(c, i));
}

// تقييم ناتج القراءة: حصص مختلفة × بنود فيها محتوى
export function planScore(sessions) {
  const seen = new Set();
  let s = 0;
  for (const x of sessions || []) {
    const k = x.unit + '|' + x.lesson + '|' + x.title;
    if (seen.has(k)) continue;
    seen.add(k);
    s += 1 + ['outcomes', 'concepts', 'intro', 'procedures', 'formative', 'summative', 'notes'].filter((f) => String(x[f] || '').replace(/<[^<>]*>/g, '').trim().length > 3).length;
  }
  return s;
}
// القراءة الأنسب للنص: حسب الحصص (المنفصل) أو حسب البنود (المدمج)
// (القراءة حسب البنود لا تُختار إلا إذا أعطت حصصًا أكثر أو محتوى أوفر بوضوح)
export function parsePlanBest(text) {
  const a = parsePlanText(text);
  const stats = {};
  const b = parsePlanText(text, { fieldMajor: true, stats });
  if (stats.partKinds < 2) return a;   // أجزاء حصص في بندين على الأقل وإلا فليس مدمجًا
  const sa = planScore(a), sb = planScore(b);
  return b.length > a.length || sa < sb * 0.6 ? b : a;
}

function buildSession(c, i) {
  const s = c.sec;
  const get = (k) => s[k] || [];
  // المخرجات: نفصل عبارة «— المستوى: …» إن وُجدت
  let levels = [];
  const outcomes = get('outcomes').filter((l) => l.trim()).map((l) => {
    const m = l.match(/[—\-–(]\s*\**\s*(?:المستوى|المستويات|level)\s*[:：]\s*([^*)]+)\**\)?\s*[.。]?\s*$/i);
    if (m) mapLevels(m[1]).forEach((x) => { if (!levels.includes(x)) levels.push(x); });
    return l.replace(/[—\-–(]\s*\**\s*(?:المستوى|المستويات|level)\s*[:：].*$/i, '').trim();
  });
  mapLevels(get('levels').join('،')).forEach((x) => { if (!levels.includes(x)) levels.push(x); });
  for (const f of ['التذكر', 'الفهم', 'التطبيق']) if (levels.length < 3 && !levels.includes(f)) levels.push(f);

  const st = mapStrategies(splitItems(get('strategies')));
  if (!st.strategies.length) st.strategies.push('التعلم التعاوني');
  const rs = mapResources(splitItems(get('resources')));
  if (!rs.resources.length) rs.resources.push('الكتاب', 'جهاز عرض البيانات', 'صورة توضيحية');

  const support = get('support');
  const hw = get('homework').filter((l) => l.trim());
  const extraNotes = get('notes').filter((l) => l.trim());
  let notes = hw.length ? '<p><strong>الواجب:</strong> ' + inline(hw.map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).join(' — ')) + '</p>' : '';
  if (extraNotes.length) notes += toHtml(extraNotes);

  return {
    id: 's' + Date.now().toString(36) + i + Math.random().toString(36).slice(2, 5),
    unit: c.unit || '',
    lesson: c.lesson || 'الدرس',
    title: c.title || 'الحصة ' + (ORD_F[i] || i + 1),
    outcomes: toHtml(outcomes),
    levels: levels.slice(0, 3),
    strategies: st.strategies, strategiesOther: st.other,
    resources: rs.resources, resourcesOther: rs.other,
    concepts: toHtml(get('concepts')),
    intro: toHtml(get('intro')),
    procedures: toHtml(get('procedures')) + (support.length ? toHtml(support) : ''),
    formative: toHtml(get('formative')),
    summative: toHtml(get('summative')),
    notes,
  };
}

export const SAMPLE_PLAN = `# الوحدة الأولى
## الدرس الأول: عنوان الدرس
## الحصة الأولى: عنوان الحصة
### المخرجات
١. أن يحدد الطالب … — المستوى: تطبيق
٢. أن يوضح … — المستوى: فهم
### الاستراتيجيات
التعلم التعاوني، العصف الذهني، الحوار والمناقشة
### المصادر
الكتاب، جهاز عرض البيانات، صور
### المفاهيم
مفهوم ١، مفهوم ٢
### التهيئة
يعرض المعلم صورة ويسأل …
### إجراءات سير الدرس
(٥ دقائق) …
(١٠ دقائق) …
### التقويم التكويني
١. …
### التقويم الختامي
…
### الواجب
حل تمرين … صفحة …`;
