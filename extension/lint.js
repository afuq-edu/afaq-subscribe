// lint.js — فحص ملف المادة قبل التشغيل: ما الذي قد يعطّل التعبئة أو يضعف التعرّف على الدروس في نور؟
// لا يمنع شيئًا — يكشف المشكلات ويقترح الحل، وما يمكن إصلاحه تلقائيًا (تاريخ بصيغة غريبة، يوم إجازة…) يُصلَح وقت التشغيل.
import { lessonNum, unitNum, kwNorm, titleSim, sessionSuffix, numberScheme, lessonNumber } from './match.js';
import { isIso, isSchoolDay, dayLabel, parseAnyDate, toArDigits, isoOf, weekNo, rangeStartDate } from './dates.js';

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
  if (pkg && Array.isArray(pkg.lessons)) pkg.lessons.forEach(normalizeLesson);
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
  // رقم الدرس وفق مخطط ترقيم وحدته: «1- 5 الأسس» = الدرس ٥ (لا الدرس ١) — وإلا كل دروس الوحدة «الدرس ١» وتحذيرات كاذبة
  const schemes = new Map();
  gs.forEach((g) => { const k = kwNorm(g.unit); if (!schemes.has(k)) schemes.set(k, numberScheme(gs.filter((x) => kwNorm(x.unit) === k).map((x) => x.lesson))); });
  const numOf = (g) => lessonNumber(g.lesson, schemes.get(kwNorm(g.unit)));
  const nums = gs.map(numOf);
  const withNum = nums.filter((n) => n != null).length;
  if (withNum && withNum < gs.length && gs.length >= 3) {
    const bad = gs.filter((g) => numOf(g) == null && !/review|مراجع|project|مشروع|test|اختبار|تقويم|تقييم/i.test(g.lesson));
    if (bad.length) add('info', 'no-number', `${toArDigits(bad.length)} ${bad.length === 1 ? 'درس بلا رقم' : 'دروس بلا رقم'} بينما البقية مرقّمة — تُطابَق بالاسم والترتيب: ${bad.slice(0, 3).map((g) => '«' + g.lesson + '»').join('، ')}${bad.length > 3 ? '…' : ''}`, bad.flatMap((g) => g.sessions.map((s) => s.id)));
  }
  // أسماء متشابهة جدًا في الوحدة نفسها (بلا أرقام تفرّق) — قد تختلط في نور
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
    const a = gs[i], b = gs[j];
    if (kwNorm(a.unit) !== kwNorm(b.unit)) continue;
    const na = numOf(a), nb = numOf(b);
    if (na != null && nb != null && na !== nb) continue;
    const sa = sessionSuffix(a.lesson), sb = sessionSuffix(b.lesson);
    if (sa != null && sb != null && sa !== sb) continue;
    if (kwNorm(a.lesson) === kwNorm(b.lesson)) add('warn', 'dup-lesson', `درسان بالاسم نفسه في «${a.unit || 'بلا وحدة'}»: «${a.lesson}» — سيُعامَلان درسًا واحدًا بحصص أكثر. فرّق بينهما برقم أو اسم.`, [...a.sessions, ...b.sessions].map((s) => s.id));
    else if (titleSim(a.lesson, b.lesson) >= 0.8) add('info', 'similar-lesson', `اسمان متقاربان جدًا في الوحدة نفسها: «${a.lesson}» و«${b.lesson}» — أضف رقم الدرس ليُفرَّق بينهما بثقة.`, [...a.sessions, ...b.sessions].map((s) => s.id));
  }
  // فجوات الترقيم داخل الوحدة
  const byUnit = new Map(), unitName = new Map();
  gs.forEach((g) => { const n = numOf(g); if (n != null) { const k = kwNorm(g.unit); if (!byUnit.has(k)) { byUnit.set(k, []); unitName.set(k, g.unit); } byUnit.get(k).push(n); } });
  for (const [uk, arr] of byUnit) {
    const u = unitName.get(uk);
    const s = [...new Set(arr)].sort((x, y) => x - y);
    const gaps = []; for (let i = 1; i < s.length; i++) for (let n = s[i - 1] + 1; n < s[i]; n++) gaps.push(n);
    if (gaps.length && gaps.length <= 6) add('info', 'gap', `في «${u || 'الدروس'}» ينقص ${gaps.length === 1 ? 'الدرس' : 'الدروس'} ${gaps.map(toArDigits).join('، ')} — إن كانت في نور فستبقى بلا تحضير.`);
    const dups = [...new Set(s.filter((n) => arr.filter((x) => x === n).length > 1))];
    if (dups.length) {
      // الرقم نفسه لدرسين بأسماء مختلفة واضحة (أجزاء أ/ب مثلًا) لا يضر — يُفرَّق بينهما بالاسم؛ الخطر حين تتشابه الأسماء أيضًا
      const inUnit = gs.filter((g) => kwNorm(g.unit) === uk);
      const risky = dups.filter((n) => { const same = inUnit.filter((g) => numOf(g) === n); return same.some((a, i) => same.some((b, j) => j > i && titleSim(a.lesson, b.lesson) >= 0.8)); });
      if (risky.length) add('warn', 'dup-number', `رقم الدرس مكرر مع تشابه الأسماء في «${u || 'الدروس'}»: ${risky.map(toArDigits).join('، ')} — قد يُربط درسان بدرس واحد في نور.`);
      const soft = dups.filter((n) => !risky.includes(n));
      if (soft.length) add('info', 'dup-number-soft', `رقم الدرس ${soft.map(toArDigits).join('، ')} يحمله أكثر من درس في «${u || 'الدروس'}» (أجزاء أ/ب غالبًا) — يُفرَّق بينها بالاسم.`);
    }
  }
  // وحدات: بعض الحصص بلا وحدة وبعضها بوحدة
  const noUnit = lessons.filter((l) => !l.unit).length;
  if (noUnit && noUnit < lessons.length) add('info', 'mixed-unit', `${toArDigits(noUnit)} ${noUnit === 1 ? 'حصة بلا وحدة' : 'حصص بلا وحدة'} والبقية بوحدات — تُطابَق بالاسم عبر الوحدات كلها.`);
  gs.forEach((g) => { if (String(g.lesson).length > 140) add('warn', 'long-title', `اسم درس طويل جدًا (${toArDigits(String(g.lesson).length)} حرفًا): «${String(g.lesson).slice(0, 60)}…» — اجعله كما في الكتاب.`, g.sessions.map((s) => s.id)); });

  // الحصص — مواد الاشتراك (البعيدة) لا تحمل محتوى البنود محليًا: يُجلب من منصة أفق لحظة التعبئة، فلا معنى لفحص «فارغة» فيها
  if (pkg.remote) add('info', 'remote-content', 'محتوى البنود (المخرجات، سير الدرس…) يُجلب من منصة أفق لحظة تعبئة كل حصة ولا يُخزَّن في الإضافة — لذا لا يُفحص هنا.');
  const empty = pkg.remote ? [] : lessons.filter((l) => !textOf(l.outcomes) && !textOf(l.procedures) && !textOf(l.intro) && !textOf(l.formative) && !textOf(l.summative));
  if (empty.length) add('warn', 'empty-session', `${toArDigits(empty.length)} ${empty.length === 1 ? 'حصة فارغة' : 'حصص فارغة'} (لا مخرجات ولا سير درس) — تُعبَّأ خاناتها فارغة في نور: ${empty.slice(0, 3).map((l) => '«' + (l.lesson || '') + ' / ' + l.title + '»').join('، ')}${empty.length > 3 ? '…' : ''}`, empty.map((l) => l.id));
  const thin = pkg.remote ? [] : lessons.filter((l) => !empty.includes(l) && !textOf(l.procedures));
  if (thin.length) add('info', 'no-procedures', `${toArDigits(thin.length)} ${thin.length === 1 ? 'حصة بلا «سير الدرس»' : 'حصص بلا «سير الدرس»'}.`, thin.map((l) => l.id));
  // عناوين حصص مكررة داخل الدرس — سطر واحد لكل الملف (لا سطر لكل درس)
  const dupSess = gs.filter((g) => {
    const seen = new Map();
    g.sessions.forEach((s) => { const k = kwNorm(s.title); seen.set(k, (seen.get(k) || 0) + 1); });
    return [...seen.values()].some((n) => n > 1);
  });
  if (dupSess.length) add('info', 'dup-session', `${dupSess.length === 1 ? `في «${dupSess[0].lesson}» حصتان بالعنوان نفسه` : `${toArDigits(dupSess.length)} درسًا فيها حصص بالعنوان نفسه`} — تُرقَّم في نور «(2)، (3)…» تلقائيًا.`, dupSess.flatMap((g) => g.sessions.map((s) => s.id)));

  // التواريخ
  const dated = lessons.filter((l) => l.pubDate);
  const badDates = dated.filter((l) => !isIso(l.pubDate));
  if (badDates.length) add('warn', 'bad-date', `${toArDigits(badDates.length)} ${badDates.length === 1 ? 'تاريخ نشر بصيغة غير مفهومة' : 'تواريخ نشر بصيغة غير مفهومة'}: ${badDates.slice(0, 3).map((l) => '«' + l.pubDate + '»').join('، ')} — تُتجاهل ويُحسب التاريخ بالتسلسل.`, badDates.map((l) => l.id));
  const good = dated.filter((l) => isIso(l.pubDate));
  if (good.length) {
    const off = good.filter((l) => !isSchoolDay(l.pubDate, days));
    if (off.length) add('info', 'offday-date', `${toArDigits(off.length)} ${off.length === 1 ? 'تاريخ يقع' : 'تواريخ تقع'} في يوم بلا حصص (${off.slice(0, 3).map((l) => dayLabel(l.pubDate, false)).join('، ')}) — يُنقل كلٌّ منها إلى يوم الحصة التالي تلقائيًا.`, off.map((l) => l.id));
    const seen = new Map();
    good.forEach((l) => { seen.set(l.pubDate, (seen.get(l.pubDate) || 0) + 1); });
    const dup = [...seen].filter(([, n]) => n > 1).map(([d]) => d);
    if (dup.length) add('warn', 'dup-date', `التاريخ نفسه لأكثر من حصة (${dup.slice(0, 3).map((d) => dayLabel(d, false)).join('، ')}) — نور لا تقبل تاريخين متطابقين للمادة؛ تُنقل الثانية إلى اليوم التالي تلقائيًا.`, good.filter((l) => dup.includes(l.pubDate)).map((l) => l.id));
    let back = 0;
    for (let i = 1; i < good.length; i++) if (good[i].pubDate < good[i - 1].pubDate) back++;
    if (back) add('info', 'order-date', `${toArDigits(back)} ${back === 1 ? 'تاريخ يسبق' : 'تواريخ تسبق'} تاريخ الحصة التي قبله في الملف — تُنشر بتواريخها كما كُتبت (الترتيب الزمني يختلف عن ترتيب الملف).`);
    const today = isoOf(new Date());
    const old = good.filter((l) => l.pubDate < today.slice(0, 4) + '-01-01' && (new Date(today) - new Date(l.pubDate)) > 300 * 864e5);
    if (old.length === good.length) add('warn', 'old-dates', `كل تواريخ الملف من عام سابق (${good[0].pubDate.slice(0, 4)}) — تأكد أنها المقصودة، أو ألغِ «استعمال تواريخ الملف» لتُحسب من تاريخ البداية.`);
    if (good.length < lessons.length) add('info', 'partial-dates', `${toArDigits(good.length)} من ${toArDigits(lessons.length)} حصة لها تاريخ في الملف — ما بعد كل تاريخ بلا تاريخ يتبعه على أيام الحصص.`);
  }
  return { warnings: out, groups: gs.length, sessions: lessons.length, dated: good.length };
}
export const lintLevel = (r) => (r.warnings.some((w) => w.level === 'bad') ? 'bad' : r.warnings.some((w) => w.level === 'warn') ? 'warn' : r.warnings.length ? 'info' : 'ok');
