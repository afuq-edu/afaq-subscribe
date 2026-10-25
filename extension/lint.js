// lint.js — فحص ملف المادة قبل التشغيل: ما الذي قد يعطّل التعبئة أو يضعف التعرّف على الدروس في نور؟
// لا يمنع شيئًا — يكشف المشكلات ويقترح الحل، وما يمكن إصلاحه تلقائيًا (تاريخ بصيغة غريبة، يوم إجازة…) يُصلَح وقت التشغيل.
import { lessonNum, unitNum, kwNorm, titleSim, sessionSuffix, nameOnly, keywords, fixPairOrder } from './match.js';
import { isIso, isSchoolDay, dayLabel, parseAnyDate, toArDigits, isoOf, weekNo, diffDays, countSchoolDays, nextSchoolDay, addDays, rangeStartDate } from './dates.js';

const textOf = (h) => String(h || '').replace(/<[^<>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const groupKey = (l) => (l && ((l.unit || '') + '|' + (l.lesson || ''))) || '';

// توحيد حقل تاريخ النشر في حصة قادمة من ملف أو من الخادم: pubDate | publishDate | publish_date | date | «تاريخ النشر» — إلى ISO
const DATE_KEYS = ['pubDate', 'publishDate', 'publish_date', 'publishdate', 'pub_date', 'date', 'تاريخ النشر', 'تاريخ_النشر', 'التاريخ'];
const WEEK_KEYS = ['week', 'weekNo', 'week_no', 'الأسبوع', 'الاسبوع'];
export function normalizeLesson(l) {
  if (!l || typeof l !== 'object') return l;
  let iso = '';
  for (const k of DATE_KEYS) {
    const v = l[k];
    if (v == null || v === '') continue;
    const s = typeof v === 'number' && v > 1e11 ? isoOf(new Date(v)) : String(v);
    iso = isIso(s) ? s : parseAnyDate(s);
    if (iso) break;
  }
  // لا تاريخ للحصة نفسها: تاريخ أسبوعها المكتوب في الخطة (حقل week فيها أو في parts) — أول يوم من مداه
  const weekTexts = [l.week, l['الأسبوع'], ...(Array.isArray(l.parts) ? l.parts.map((p) => p && (p.week || p['الأسبوع'])) : [])].filter((v) => typeof v === 'string' && v.trim());
  if (!iso) for (const w of weekTexts) { iso = rangeStartDate(w) || parseAnyDate(w); if (iso) break; }
  if (iso) l.pubDate = iso; else if (l.pubDate) delete l.pubDate;
  for (const k of WEEK_KEYS) {
    const v = l[k];
    if (v == null || v === '' || k === 'week' && typeof v === 'string' && /^الأسبوع \d+$/.test(v)) continue;
    const n = typeof v === 'number' ? v : (weekNo(String(v)) ?? weekNo('الأسبوع ' + String(v).trim()));
    if (n != null && n > 0) { l.week = 'الأسبوع ' + n; break; }
  }
  if (!/^الأسبوع \d+$/.test(l.week || '')) for (const w of weekTexts) { const n = weekNo(w); if (n != null && n > 0) { l.week = 'الأسبوع ' + n; break; } }
  return l;
}
export function normalizePackage(pkg) {
  if (pkg && Array.isArray(pkg.lessons)) { pkg.lessons.forEach(normalizeLesson); fixPairOrder(pkg.lessons); }
  return pkg;
}
export const hasFileDates = (pkg) => !!(pkg && (pkg.lessons || []).some((l) => isIso(l.pubDate)));
export const datedCount = (pkg) => ((pkg && pkg.lessons) || []).filter((l) => isIso(l.pubDate)).length;

// warnings: [{ level: 'bad' | 'warn' | 'info', code, text, lessonIds: [] }]
export function lintPackage(pkg, opts = {}) {
  const out = [];
  const add = (level, code, text, lessonIds = []) => out.push({ level, code, text, lessonIds });
  const lessons = (pkg && pkg.lessons) || [];
  if (!lessons.length) { add('bad', 'empty', 'المادة بلا حصص.'); return { warnings: out, groups: 0, sessions: 0 }; }
  const days = opts.days && opts.days.length ? opts.days : [0, 1, 2, 3, 4];
  if (!pkg.subject && !pkg.title) add('warn', 'no-subject', 'لا اسم للمادة — يُستخدم للعثور على بطاقتها في نور.');
  if (!pkg.gradeNum && !/\d|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|عشر/.test(String(pkg.grade || ''))) add('warn', 'no-grade', 'لا صف للمادة — قد تُختار بطاقة صف آخر في نور.');

  // الدروس
  const groups = new Map();
  lessons.forEach((l) => { const k = groupKey(l); if (!groups.has(k)) groups.set(k, { unit: l.unit || '', lesson: l.lesson || '', sessions: [] }); groups.get(k).sessions.push(l); });
  const gs = [...groups.values()];
  const nums = gs.map((g) => lessonNum(g.lesson));
  const withNum = nums.filter((n) => n != null).length;
  if (withNum && withNum < gs.length && gs.length >= 3) {
    const bad = gs.filter((g) => lessonNum(g.lesson) == null && !/review|مراجع|project|مشروع|test|اختبار|تقويم|تقييم/i.test(g.lesson));
    if (bad.length) add('info', 'no-number', `${toArDigits(bad.length)} ${bad.length === 1 ? 'درس بلا رقم' : 'دروس بلا رقم'} بينما البقية مرقّمة — تُطابَق بالاسم والترتيب: ${bad.slice(0, 3).map((g) => '«' + g.lesson + '»').join('، ')}${bad.length > 3 ? '…' : ''}`, bad.flatMap((g) => g.sessions.map((s) => s.id)));
  }
  // أسماء متشابهة جدًا في الوحدة نفسها (بلا أرقام تفرّق) — قد تختلط في نور
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    const a = gs[i], b = gs[j];
    if (kwNorm(a.unit) !== kwNorm(b.unit)) continue;
    const na = lessonNum(a.lesson), nb = lessonNum(b.lesson);
    if (na != null && nb != null && na !== nb) continue;
    const sa = sessionSuffix(a.lesson), sb = sessionSuffix(b.lesson);
    if (sa != null && sb != null && sa !== sb) continue;
    if (kwNorm(a.lesson) === kwNorm(b.lesson)) add('warn', 'dup-lesson', `درسان بالاسم نفسه في «${a.unit || 'بلا وحدة'}»: «${a.lesson}» — سيُعامَلان درسًا واحدًا بحصص أكثر. فرّق بينهما برقم أو اسم.`, [...a.sessions, ...b.sessions].map((s) => s.id));
    else if (titleSim(a.lesson, b.lesson) >= 0.8) add('info', 'similar-lesson', `اسمان متقاربان جدًا في الوحدة نفسها: «${a.lesson}» و«${b.lesson}» — أضف رقم الدرس ليُفرَّق بينهما بثقة.`, [...a.sessions, ...b.sessions].map((s) => s.id));
  }
  // فجوات الترقيم داخل الوحدة
  const byUnit = new Map(), unitName = new Map();
  gs.forEach((g) => { const n = lessonNum(g.lesson); if (n != null) { const k = kwNorm(g.unit); if (!byUnit.has(k)) { byUnit.set(k, []); unitName.set(k, g.unit); } byUnit.get(k).push(n); } });
  for (const [uk, arr] of byUnit) {
    const u = unitName.get(uk);
    const s = [...new Set(arr)].sort((x, y) => x - y);
    const gaps = []; for (let i = 1; i < s.length; i++) for (let n = s[i - 1] + 1; n < s[i]; n++) gaps.push(n);
    if (gaps.length && gaps.length <= 6) add('info', 'gap', `في «${u || 'الدروس'}» ينقص ${gaps.length === 1 ? 'الدرس' : 'الدروس'} ${gaps.map(toArDigits).join('، ')} — إن كانت في نور فستبقى بلا تحضير.`);
    const dups = [...new Set(s.filter((n) => arr.filter((x) => x === n).length > 1))].filter((n) => {
      // الرقم نفسه لدرسين: مشكلة فقط إن تشابه الاسمان (أما «١ - ١ … أ» و«١ - ١ … ب» أو اسمان مختلفان فدروس فرعية مشروعة)
      const same = gs.filter((g) => kwNorm(g.unit) === uk && lessonNum(g.lesson) === n);
      for (let i = 0; i < same.length; i++) for (let j = i + 1; j < same.length; j++) {
        const a = nameOnly(same[i].lesson), b = nameOnly(same[j].lesson);
        if (!a || !b || titleSim(a, b) >= 0.85 || (keywords(a).length < 2 && keywords(b).length < 2)) return true;
      }
      return false;
    });
    if (dups.length) add('warn', 'dup-number', `رقم الدرس مكرر لدرسين بالاسم نفسه تقريبًا في «${u || 'الدروس'}»: ${dups.map(toArDigits).join('، ')} — قد يُربط درسان بدرس واحد في نور.`);
  }
  // وحدات: بعض الحصص بلا وحدة وبعضها بوحدة
  const noUnit = lessons.filter((l) => !l.unit).length;
  if (noUnit && noUnit < lessons.length) add('info', 'mixed-unit', `${toArDigits(noUnit)} ${noUnit === 1 ? 'حصة بلا وحدة' : 'حصص بلا وحدة'} والبقية بوحدات — تُطابَق بالاسم عبر الوحدات كلها.`);
  gs.forEach((g) => { if (String(g.lesson).length > 140) add('warn', 'long-title', `اسم درس طويل جدًا (${toArDigits(String(g.lesson).length)} حرفًا): «${String(g.lesson).slice(0, 60)}…» — اجعله كما في الكتاب.`, g.sessions.map((s) => s.id)); });

  // الحصص — في مواد الاشتراك (منصة أفق) المحتوى يُجلب لحظة التعبئة فلا تُفحص الخانات هنا
  const remote = !!(pkg.remote) || (lessons.length >= 3 && lessons.every((l) => !textOf(l.outcomes) && !textOf(l.procedures) && !textOf(l.intro)));
  if (remote && pkg.remote) add('info', 'remote-content', 'مادة اشتراك: محتوى الحصص يُجلب من منصة أفق لحظة التعبئة (لا يظهر هنا) — هذا طبيعي.');
  const empty = remote ? [] : lessons.filter((l) => !textOf(l.outcomes) && !textOf(l.procedures) && !textOf(l.intro) && !textOf(l.formative) && !textOf(l.summative));
  if (empty.length) add('warn', 'empty-session', `${toArDigits(empty.length)} ${empty.length === 1 ? 'حصة فارغة' : 'حصص فارغة'} (لا مخرجات ولا سير درس) — تُعبَّأ خاناتها فارغة في نور: ${empty.slice(0, 3).map((l) => '«' + (l.lesson || '') + ' / ' + l.title + '»').join('، ')}${empty.length > 3 ? '…' : ''}`, empty.map((l) => l.id));
  const thin = remote ? [] : lessons.filter((l) => !empty.includes(l) && !textOf(l.procedures));
  if (thin.length) add('info', 'no-procedures', `${toArDigits(thin.length)} ${thin.length === 1 ? 'حصة بلا «سير الدرس»' : 'حصص بلا «سير الدرس»'}.`, thin.map((l) => l.id));
  // عناوين حصص مكررة داخل الدرس
  gs.forEach((g) => {
    const seen = new Map();
    g.sessions.forEach((s) => { const k = kwNorm(s.title); seen.set(k, (seen.get(k) || 0) + 1); });
    const d = [...seen].filter(([, n]) => n > 1);
    if (d.length) add('info', 'dup-session', `في «${g.lesson}» حصتان بالعنوان نفسه — تُرقَّم في نور «(2)» تلقائيًا.`, g.sessions.map((s) => s.id));
  });

  // التواريخ
  const dated = lessons.filter((l) => l.pubDate);
  const badDates = dated.filter((l) => !isIso(l.pubDate));
  if (badDates.length) add('warn', 'bad-date', `${toArDigits(badDates.length)} ${badDates.length === 1 ? 'تاريخ نشر بصيغة غير مفهومة' : 'تواريخ نشر بصيغة غير مفهومة'}: ${badDates.slice(0, 3).map((l) => '«' + l.pubDate + '»').join('، ')} — تُتجاهل ويُحسب التاريخ بالتسلسل.`, badDates.map((l) => l.id));
  const good = dated.filter((l) => isIso(l.pubDate));
  if (good.length) {
    const off = good.filter((l) => !isSchoolDay(l.pubDate, days));
    if (off.length) add('info', 'offday-date', `${toArDigits(off.length)} ${off.length === 1 ? 'تاريخ يقع' : 'تواريخ تقع'} في يوم بلا حصص (${off.slice(0, 3).map((l) => dayLabel(l.pubDate, false)).join('، ')}) — يُنقل كلٌّ منها إلى يوم الحصة التالي تلقائيًا.`, off.map((l) => l.id));
    // the same date twice is fine: Noor takes one prep per period, and two periods can fall on one day
    let back = 0;
    for (let i = 1; i < good.length; i++) if (good[i].pubDate < good[i - 1].pubDate) back++;
    if (back) add('info', 'order-date', `${toArDigits(back)} ${back === 1 ? 'تاريخ يسبق' : 'تواريخ تسبق'} تاريخ الحصة التي قبله في الملف — تُنشر بتواريخها كما كُتبت (الترتيب الزمني يختلف عن ترتيب الملف).`);
    // قفزة كبيرة بين تاريخين متتاليين (أكثر من ١٤ يومًا): غالبًا خطأ مطبعي صالح الشكل (12/11 بدل 12/10) أو سنة خاطئة
    const jumps = [];
    for (let i = 1; i < good.length; i++) {
      const gap = diffDays(good[i - 1].pubDate, good[i].pubDate);
      if (gap > 14 || gap < -14) jumps.push({ a: good[i - 1], b: good[i], gap });
    }
    if (jumps.length) add('warn', 'date-jump', `${toArDigits(jumps.length)} ${jumps.length === 1 ? 'قفزة' : 'قفزات'} في التواريخ أكثر من أسبوعين بين حصتين متتاليتين — راجعها فقد تكون خطأ مطبعيًا: ${jumps.slice(0, 3).map((j) => `«${j.a.lesson}» ${dayLabel(j.a.pubDate, false)} ← «${j.b.lesson}» ${dayLabel(j.b.pubDate, false)} (${toArDigits(Math.abs(j.gap))} يومًا)`).join('؛ ')}${jumps.length > 3 ? '…' : ''}`, jumps.flatMap((j) => [j.a.id, j.b.id]));
    const today = isoOf(new Date());
    const old = good.filter((l) => l.pubDate < today.slice(0, 4) + '-01-01' && (new Date(today) - new Date(l.pubDate)) > 300 * 864e5);
    if (old.length === good.length) add('warn', 'old-dates', `كل تواريخ الملف من عام سابق (${good[0].pubDate.slice(0, 4)}) — تأكد أنها المقصودة، أو ألغِ «استعمال تواريخ الملف» لتُحسب من تاريخ البداية.`);
    if (good.length < lessons.length) add('info', 'partial-dates', `${toArDigits(good.length)} من ${toArDigits(lessons.length)} حصة لها تاريخ في الملف — ما بعد كل تاريخ بلا تاريخ يتبعه على أيام الحصص.`);
  }
  // ميزانية الفصل: هل تكفي أيام الحصص المتبقية حتى نهاية الفصل لكل حصص الملف؟ (opts.termEnd ISO، opts.start ISO، opts.holidays Set)
  let budget = null;
  if (isIso(opts.termEnd)) {
    const undone = typeof opts.isDone === 'function' ? lessons.filter((l) => !opts.isDone(l)) : lessons;
    const first = isIso(opts.start) ? opts.start : (undone.find((l) => isIso(l.pubDate)) || {}).pubDate || isoOf(new Date());
    const avail = countSchoolDays(nextSchoolDay(first, days, true), opts.termEnd, days, opts.holidays);
    const after = undone.filter((l) => isIso(l.pubDate) && l.pubDate > opts.termEnd);
    budget = { need: undone.length, avail, from: first, termEnd: opts.termEnd, over: Math.max(0, undone.length - avail), after: after.length };
    if (after.length) add('warn', 'after-term', `${toArDigits(after.length)} ${after.length === 1 ? 'حصة تاريخها' : 'حصص تواريخها'} بعد نهاية الفصل (${dayLabel(opts.termEnd, false)}): ${after.slice(0, 3).map((l) => '«' + l.lesson + ' / ' + l.title + '» ' + dayLabel(l.pubDate, false)).join('، ')}${after.length > 3 ? '…' : ''}`, after.map((l) => l.id));
    if (budget.over) add('warn', 'over-budget', `ميزانية الفصل لا تكفي: ${toArDigits(undone.length)} حصة ${undone.length < lessons.length ? 'متبقية ' : ''}لـ${toArDigits(avail)} ${avail === 1 ? 'يوم حصة متاح' : avail === 2 ? 'يومَي حصص متاحين' : 'يوم حصة متاح'} من ${dayLabel(first, false)} حتى ${dayLabel(opts.termEnd, false)} (بعد استبعاد الإجازات) — ${toArDigits(budget.over)} ${budget.over === 1 ? 'حصة ستقع' : budget.over === 2 ? 'حصتان ستقعان' : budget.over <= 10 ? 'حصص ستقع' : 'حصة ستقع'} بعد نهاية الفصل إن تتابعت يومًا بيوم.`);
    else if (avail - undone.length <= 3 && undone.length) add('info', 'tight-budget', `ميزانية الفصل مضبوطة: ${toArDigits(undone.length)} حصة لـ${toArDigits(avail)} يومًا متاحًا حتى ${dayLabel(opts.termEnd, false)} — لا مجال لإجازة طارئة.`);
  }
  return { warnings: out, groups: gs.length, sessions: lessons.length, dated: good.length, budget };
}
export const lintLevel = (r) => (r.warnings.some((w) => w.level === 'bad') ? 'bad' : r.warnings.some((w) => w.level === 'warn') ? 'warn' : r.warnings.length ? 'info' : 'ok');

// مدد الأنشطة في «سير الدرس» — «(5 دقائق)» — تُوزَّع على مدة الحصة في نوع المدرسة:
// فترتان = ٣٥ دقيقة، فترة واحدة = ٤٠. ملفات «فترتين» قد تأتي بتوقيت ٤٠ دقيقة فتُصغَّر بالتناسب (المجموع ٣٥ لكل حصة).
const MIN_RE = /([(（]\s*)([0-9٠-٩]{1,2})(\s*)(دقائق|دقيقة|دقيقه|دقيقتان|دقيقتين|د)(\s*[)）])/g;
const latin = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const minWord = (n, w) => (w === 'د' ? 'د' : n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتان' : n <= 10 ? 'دقائق' : 'دقيقة');
export function sessionMinutesOf(pkg) {
  const m = +((pkg && pkg.sessionMinutes) || 0);
  return m || (pkg && pkg.shift === 'two' ? 35 : pkg && pkg.shift === 'one' ? 40 : 0);
}
export function fitMinutes(text, perSession) {
  const s = String(text || '');
  if (!perSession || !s) return s;
  const parts = [...s.matchAll(MIN_RE)].map((m) => +latin(m[2]));
  const total = parts.reduce((a, b) => a + b, 0);
  if (!total || total % perSession === 0) return s;
  const base = perSession === 35 ? 40 : perSession === 40 ? 35 : 0;   // التوقيت الآخر
  if (!base) return s;
  const target = Math.round((total * perSession) / base);
  if (total % base !== 0 && Math.abs(total - target) < 3) return s;
  // توزيع بالتناسب مع أكبر الكسور، دون أن ينزل نشاط عن دقيقة
  const raw = parts.map((n) => (n * target) / total);
  const out = raw.map((x) => Math.max(1, Math.floor(x)));
  let left = target - out.reduce((a, b) => a + b, 0);
  raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  for (let i = out.length - 1; left < 0 && i >= 0; i--) if (out[i] > 1) { out[i]--; left++; }
  let k = 0;
  return s.replace(MIN_RE, (m, a, num, sp, w, b) => {
    const n = out[k++];
    const shown = /[٠-٩]/.test(num) ? String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : String(n);
    return a + shown + sp + minWord(n, w) + b;
  });
}
// سطر المجموع «المجموع: 40 دقيقة» / «مجموع زمن الحصة: ٤٠ دقيقة» (بلا أقواس، فلا يمسّه MIN_RE): يُكتب بمدة الحصة
const TOTAL_RE = /((?:ال)?مجموع(?:\s+(?:زمن\s+الحصة|الزمن|الكلي))?|الزمن\s+الكلي|زمن\s+الحصة)(\s*[:：]?\s*)([0-9٠-٩]{1,3})(\s*)(دقيقة|دقيقه|دقائق|د)/g;
function fitTotals(text, per) {
  if (typeof text !== 'string' || !per) return text;
  const other = per === 35 ? 40 : per === 40 ? 35 : 0;
  return text.replace(TOTAL_RE, (m, a, sp, num, sp2, w) => {
    if (+latin(num) !== other) return m;
    const shown = /[٠-٩]/.test(num) ? String(per).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : String(per);
    return a + sp + shown + sp2 + minWord(per, w);
  });
}
// الحصة كلها: «سير الدرس» يُوزَّع على مدة الحصة، وما يُذكر من دقائق في بقية البنود يتبعه بالنسبة نفسها، وسطر «المجموع» يصير مدة الحصة
export function fitLessonMinutes(lesson, pkg) {
  const per = sessionMinutesOf(pkg);
  if (!lesson || !per) return lesson;
  const totals = (l) => { const o = Object.assign({}, l); ['procedures', 'intro', 'notes', 'formative', 'summative', 'outcomes'].forEach((k) => { if (typeof o[k] === 'string') o[k] = fitTotals(o[k], per); }); return o; };
  const proc = fitMinutes(lesson.procedures, per);
  if (proc === lesson.procedures) return totals(lesson);
  const sum = (t) => [...String(t || '').matchAll(MIN_RE)].reduce((a, m) => a + +latin(m[2]), 0);
  const ratio = sum(proc) / sum(lesson.procedures);
  const scale = (t) => (typeof t === 'string' ? t.replace(MIN_RE, (m, a, num, sp, w, b) => {
    const n = Math.max(1, Math.round(+latin(num) * ratio));
    return a + (/[٠-٩]/.test(num) ? String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : String(n)) + sp + minWord(n, w) + b;
  }) : t);
  const out = Object.assign({}, lesson, { procedures: proc });
  ['intro', 'notes', 'formative', 'summative', 'outcomes'].forEach((k) => { if (out[k]) out[k] = scale(out[k]); });
  return totals(out);
}
