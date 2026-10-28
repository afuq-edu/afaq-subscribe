// semester.js — «تحضير فصل كامل»
// يبدأ من الصفحة الرئيسية في نور ← بطاقة المادة ← «تحضير الدروس» ← «إضافة تحضير»، ثم يقرأ دروس الفصل الدراسي المختار
// (الأول أو الثاني) من شجرة نور بترتيبها، ويطابقها بكل دروس المادة في مكتبتك (الفصل = كل ما في الملف، بعدد حصص كل درس)،
// ثم يعبّئ كل حصة ويحفظها بتواريخ نشر متتالية من التاريخ المحدد حتى آخر درس — دون أن يلمس الفصل الآخر.
// اختيار الدرس في نور يتم بنصّه (الفصل ← الوحدة ← الدرس)، لأن نور تعيد إنشاء عقد الوحدات بمعرّفات جديدة عند كل اختيار.
import {
  getPackages, savePkgState, getSettings, patchSettings, fillNoor, pageContext, clickSave, pageAlerts, judgeSave, isoOf, parseIso, dayLabel, DAY_NAMES,
  groupKey, lessonGroups, sessionStatus, markSaved, markSaveFailed, daysFor, setPkgDays, usedDates, nextSchoolDay,
  gradeNumber, gradeOfName, sameSubject, unsavedText, kwNorm, ordinalOf, getPicks,
  noorTerms, termAllLessons, pickTreeNode, stripSessionSuffix, sessionSuffix, sessionNums, lessonNum,
  layoutDates, isIso, inWeekOf, weekStart, weekEnd, hasFileDates, datedCount, lintPackage, lintLevel, knownCourse, rememberCourse, resetProgress, packageProgress, clearSession,
  holidaySet, termEndOf, countSchoolDays, loadNoorTree, storeNoorTree, dateOverrides, setDateOverride, GRADES, noorWho, probeDays,
} from './packages.js';
import { unitNum, bestTreeLesson, closestTreeLesson, kwScore, titleSim, swappedPair, nameOnly, keywords } from './match.js';
import { diffDays, addDays } from './dates.js';
import { AFAQ } from './afaq-config.js';
import { siteUrl, sync as afaqSync, getLink, getStatus, catalog as afaqCatalog, startTrial, pickPackages, contactRequest, whatsappUrl, setRef, referral, updateInfo, noorCheck, installUrl, fillLog, flushFillLog, sendNoorTree, getNoorTree } from './remote.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// روابط خارجية (واتساب): بتبويب جديد عبر كروم — لا يمنعه حاجب النوافذ المنبثقة
const openUrl = (u) => { try { chrome.tabs.create({ url: u }).catch(() => window.open(u, '_blank')); } catch (e) { window.open(u, '_blank'); } };
const shortT = (t) => { const h = String(t || '').split(/[:：]/)[0].trim(); return h && h.length <= 28 ? h : String(t || '').slice(0, 28) + '…'; };
const countWord = (n) => (n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n <= 10 ? toAr(n) + ' حصص' : toAr(n) + ' حصة');
const termName = (n) => (n === 1 ? 'الأول' : 'الثاني');
const HOME = 'https://lms.moe.gov.om/teacher';
const q = new URLSearchParams(location.search);
// اليوم: تاريخ الجهاز — وللاختبار الآلي فقط (?debug=1&now=YYYY-MM-DD) تاريخ ثابت
const NOW_FIXED = q.get('debug') === '1' && /^\d{4}-\d{2}-\d{2}$/.test(q.get('now') || '') ? q.get('now') : '';
const todayIso = () => NOW_FIXED || isoOf(new Date());

let packages = [], pkg = null, state = null, settings = null;
let tabId = Number(q.get('tab')) || null;
const noorWin = Number(q.get('win')) || null;
let days = [0, 1, 2, 3, 4];
let termNo = 1;
let plan = [];          // دروس مكتبتك بترتيب ملفك: { i, group, node, how, sessions: [{ lesson, on, inNoor, date, st, cur }], miss, why }
let queue = [];         // الحصص المختارة بترتيب دروس نور (فتأتي التواريخ بترتيب المنهج)
let treeNodes = [];     // دروس الفصل في شجرة نور بترتيبها: { id, text, unit, term }
let noorHave = null;    // ما في قائمة «التحاضير» في نور: Map(عنوان الدرس الموحَّد ← [أرقام الحصص]) — null إن لم تُقرأ
let noClass = new Map(); // أيام الأسبوع التي لم تظهر فيها صفوف (لا حصة لك) ← عدد المرات
let courseCid = '';      // المقرر في نور (من بطاقة المادة)
let semSaved = {};
let classOk = new Set();   // أيام الأسبوع التي ظهرت فيها صفوف فعلًا (فلا تُستبعد بسبب إجازة)
let coursePrepUrl = '';    // صفحة «تحضير الدروس» للمقرر (للتحقق من قائمة نور)
let startTouched = false;  // غيّرتَ «أول تاريخ نشر» بنفسك؟ (وإلا يُكمل بعد آخر تاريخ استُعمل)       // semSaved: ما حفظه «فصل كامل» في هذا المقرر: { lessonId: تاريخ } — فلا يتكرر حتى لو تأخرت قائمة نور
// النطاق: الفصل كاملًا | وحدة (أو أكثر) | أسبوع (الحصص التي تقع تواريخها فيه) | من درس إلى درس — وتواريخ النشر: من الملف أو متتالية
const scope = { kind: 'term', picks: new Set(), units: new Set(), weekDay: '', from: '', to: '', dateFrom: '', dateTo: '' };
let useFile = false;       // تواريخ الملف تُستعمل (المادة فيها تواريخ واخترتَ «كما في الملف»)
let startAuto = '';        // «أول تاريخ نشر» كما اقترحته الأداة — إن اختلف عنه ما في الخانة فقد حددته أنت
const dateNotes = new Set();   // ملاحظات نقل التواريخ التي سُجّلت (حتى لا تتكرر)
let lintRes = null;
let schedRead = false;   // قُرئ جدول حصص المعلم من نور (أو تعذّرت قراءته) في هذه التعبئة
let treeFromServer = false;   // دروس هذه الجولة من شجرة الموقع لا من نور: لا تُحفظ ولا تُرسل كأنها قُرئت
// المعالج (الخطوات البسيطة): القاعدة المختارة للتواريخ، وحد التجربة المجانية، وتواريخ التحاضير الموجودة في نور
const WIZ = { on: false, rule: '', trialCap: null, trialOver: false, rid: 0, sum: 0, auto: 0, timer: null };
let noorDates = new Set();
let noorDateN = new Map();   // تاريخ نشر ← عدد تحاضير المقرر عليه في نور
let caps = {};               // يوم الأسبوع ← عدد حصص الشعبة نفسها فيه (يُعرف من نور، ويُحفظ لكل مادة)
let slotSeen = new Map();    // تاريخ ← حصص كل شعبة كما ظهرت في أول تحضير عليه (لاختيار الحصة الثانية)
const wdOf = (iso) => new Date(iso + 'T12:00').getDay();
const capOf = (iso) => (isIso(iso) && caps[wdOf(iso)] >= 1 ? caps[wdOf(iso)] : 1);
let offRule = null;   // قرار «حسب النشرة الرسمية» يُتخذ مرة واحدة لكل تشغيل: { seq, last }
let running = false, stopFlag = false;
const stopHooks = [];
let askCur = null, logN = 0;
const diag = { log: [] };   // تقرير التشغيل (يُنسخ بزر «نسخ تقرير التشغيل» ليُرسل للمطوّر)
const STEPS = [['home', 'الرئيسية'], ['course', 'بطاقة المادة'], ['list', 'تحضير الدروس'], ['form', 'إضافة تحضير'], ['tree', 'دروس الفصل'], ['fill', 'التعبئة والحفظ']];

// ================= واجهة =================
function msg(type, html) { const el = $('topMsg'); el.className = 'msg show ' + type; el.innerHTML = html; }
function setPhase(p) {
  const idx = STEPS.findIndex(([k]) => k === p);
  $('steps').innerHTML = STEPS.map(([, n], i) => `<span class="step ${i < idx ? 'done' : i === idx ? 'on' : ''}">${i < idx ? '✓ ' : ''}${n}</span>`).join('');
}
function setBox(kind, head, text, buttons = []) {
  if (WIZ.on && (kind === 'warn' || kind === 'bad')) kind = buttons.length ? 'info' : 'run';
  $('nowCard').hidden = false;
  $('nowBox').className = 'now ' + kind;
  $('nowHead').innerHTML = (kind === 'run' ? '<span class="spin"></span>' : '') + esc(head);
  $('nowText').textContent = text || '';
  $('nowText').hidden = !text;
  const acts = $('nowActs');
  acts.innerHTML = '';
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.className = 'btn sm ' + (b.primary ? 'primary' : b.danger ? 'danger' : '');
    el.textContent = b.label;
    el.onclick = b.onclick;
    acts.appendChild(el);
  });
  acts.hidden = !buttons.length;
}
function logLine(cls, text) {
  $('logCard').hidden = false;
  const d = document.createElement('div');
  d.className = cls; d.textContent = `${toAr(++logN)}. ${text}`;
  $('log').appendChild(d);
  diag.log.push(`[${cls}] ${text}`);
  d.scrollIntoView({ block: 'nearest' });
}
const done = (l) => { const s = sessionStatus(state, pkg.id, l.id); return !!(s.saved || (s.filled && !s.failed)); };

function renderDays() {
  $('days').innerHTML = [0, 1, 2, 3, 4, 5, 6].map((d) => `<button class="day ${days.includes(d) ? 'on' : ''}" data-d="${d}">${DAY_NAMES[d]}</button>`).join('');
  $('days').querySelectorAll('.day').forEach((b) => {
    b.onclick = async () => {
      if (running) return;
      const d = +b.dataset.d;
      days = days.includes(d) ? days.filter((x) => x !== d) : days.concat(d).sort();
      if (!days.length) days = [d];
      await setPkgDays(pkg.id, days);
      renderDays();
      if (plan.length) { assignDates(); renderPlan(); }
    };
  });
  $('startDay').textContent = $('start').value ? '· يبدأ ' + dayLabel($('start').value) : '';
}

// تحاضير قائمة على كل تاريخ: حصص أخرى محفوظة أو معبّأة (ليست من المرشّحة الآن)، أو ما في قائمة نور — الأكبر منهما
// (المحفوظ من «حاضر» يظهر في نور أيضًا فلا يُعدّ مرتين)
function takenCounts(cands) {
  const ids = new Set((cands || []).map((s) => s.lesson.id));
  const m = new Map();
  Object.entries(usedDates(pkg, state)).forEach(([d, arr]) => { const n = arr.filter((u) => !ids.has(u.lessonId)).length; if (n) m.set(d, n); });
  if (WIZ.on) noorDateN.forEach((n, d) => m.set(d, Math.max(m.get(d) || 0, n)));
  return m;
}
// تواريخ لا تُستعمل: تواريخ حصص أخرى محفوظة أو معبّأة (ليست من المرشّحة الآن)
function fixedDates(cands) {
  const ids = new Set((cands || []).map((s) => s.lesson.id));
  return new Set(Object.entries(usedDates(pkg, state)).filter(([, arr]) => arr.some((u) => !ids.has(u.lessonId))).map(([d]) => d));
}
// هل الحصة ضمن النطاق المختار؟
// حصة اختارها المعلم في «أختار الدروس بنفسي» (وكل الحصص في غيره)
const pickedS = (s) => !WIZ.pickDates || !!WIZ.pickDates[s.lesson.id];
function inScope(s) {
  const p = s.p;
  if (scope.kind === 'pick') return scope.picks ? scope.picks.has(p.group.key) : true;
  if (scope.kind === 'unit') return scope.units.size ? scope.units.has(kwNorm(p.group.unit || '')) : true;
  if (scope.kind === 'week') return scope.weekDay ? inWeekOf(s.date, scope.weekDay) : true;
  if (scope.kind === 'dates') return (!scope.dateFrom || s.date >= scope.dateFrom) && (!scope.dateTo || s.date <= scope.dateTo);
  if (scope.kind === 'range') {
    const keys = plan.map((x) => x.group.key);
    let a = scope.from ? keys.indexOf(scope.from) : 0, b = scope.to ? keys.indexOf(scope.to) : keys.length - 1;
    if (a < 0) a = 0; if (b < 0) b = keys.length - 1; if (a > b) [a, b] = [b, a];
    const i = keys.indexOf(p.group.key);
    return i >= a && i <= b;
  }
  return true;
}
// التواريخ: كل حصة مرشّحة (درس مربوط، لم تُنجز، ليست في نور) تأخذ تاريخها — من الملف إن وُجد (مرساة)، وإلا تتبع ما قبلها على أيام الحصص —
// ثم يُطبَّق النطاق لتحديد ما يُعبَّأ، وتُرتَّب قائمة التنفيذ زمنيًا
// آخر يوم في خطة المادة: خميس أسبوع آخر حصة في الملف
function pkgEnd(p) {
  const last = ((p && p.lessons) || []).map((l) => l.pubDate).filter(isIso).sort().pop();
  return last ? weekEnd(last) : '';
}
// أزواج الحصص المتتالية من الدرس نفسه (لم تُحفظ) التي يمكن جمعها في تحضير واحد، الأفضل أولًا: حصتان في أسبوع واحد
// متتاليتان في الملف، ثم الأقرب؛ ولا تُمسّ الحصة الجارية تعبئتها الآن
const wanted = (s) => (s.manual != null ? s.manual : inScope(s));   // الحصة ضمن ما سيُعبَّأ (قبل أن تُضبط s.on)
function mergePairs(items, max = 3, today = '') {
  const size = (s) => 1 + ((s.merge || []).length);
  const idx = (s) => s.p ? s.p.sessions.indexOf(s) : -1;
  const lastOf = (s) => (s.merge && s.merge.length ? s.merge[s.merge.length - 1] : s);
  const out = [];
  for (let i = 0; i + 1 < items.length; i++) {
    const a = items[i].s;
    if (!a.p || !wanted(a) || !a.eligible || a.savedNow || a.cur || a.done) continue;
    if (today && items[i].date && items[i].date < today) continue;   // ما تاريخه مضى لا تقبله نور أصلًا — لا يُجمع إليه شيء
    // الحصة التالية من الدرس نفسه: تليها مباشرة، أو بعد حصص دروس أخرى في الأسبوعين التاليين (دروس متداخلة كالتلاوة)
    for (let j = i + 1; j < Math.min(items.length, i + 12); j++) {
      const b = items[j].s;
      if (b.p !== a.p) continue;
      if (!wanted(b) || !b.eligible || b.savedNow || b.cur || b.done || idx(lastOf(a)) + 1 !== idx(b) || size(a) + size(b) > max) break;
      const gap = isIso(a.lesson.pubDate) && isIso(b.lesson.pubDate) ? diffDays(weekStart(a.lesson.pubDate), weekStart(b.lesson.pubDate)) : 99;
      if (gap > 14) break;
      out.push({ score: (size(a) + size(b) > 2 ? 4 : 0) + (j > i + 1 ? 2 : 0) + (gap ? 1 : 0), i, a, b });
      break;
    }
  }
  return out.sort((x, y) => x.score - y.score || y.i - x.i);   // الأفضل أولًا، ثم الأقرب إلى آخر الفصل (أقل تغيير في أسابيع الخطة)
}
function assignDates() {
  const pos = (p) => (p.node ? treeNodes.indexOf(p.node) : 1e9);
  const ordered = plan.slice().sort((a, b) => pos(a) - pos(b) || a.i - b.i);
  let fileMode = useFile, startIso = $('start').value || todayIso();
  // ترتيب التوزيع: بتواريخ الملف (النشرة) حين تُعتمد — فدروس تتداخل حصصها عبر الوحدات (سور القرآن، القصائد) تبقى على
  // تسلسل النشرة بعد أي تأجيل — وما بلا تاريخ يتبع ما قبله؛ وإلا بترتيب شجرة نور
  let seqAll = ordered.flatMap((p) => p.sessions);
  if (fileMode) {
    let d0 = '';
    // حصتان في اليوم نفسه: بترتيب ملفك (شجرة نور قد ترتّب دروسها غير ترتيبه)
    const fi = new Map(((pkg && pkg.lessons) || []).map((l, i) => [l.id, i]));
    const fo = (x) => (fi.has(x.s.lesson.id) ? fi.get(x.s.lesson.id) : 1e9);
    seqAll = seqAll.map((s, i) => { if (isIso(s.lesson.pubDate)) d0 = s.lesson.pubDate; return { s, i, d: d0 }; })
      .sort((a, b) => a.d.localeCompare(b.d) || fo(a) - fo(b) || a.i - b.i).map((x) => x.s);
  }
  const cands = seqAll.filter((s) => s.eligible);
  // «حسب النشرة الرسمية»: حصص كل أسبوع في أسبوعها وبترتيبها، فلا يُنشر درس سابق بعد درس لاحق.
  // تحضير لكل حصة: يوم فيه حصتان للشعبة يتسع لتحضيرين، وما عليه تحاضير في نور يأخذ ما بقي من حصصه فقط
  const taken = [...takenCounts(cands)].flatMap(([d, n]) => Array(n).fill(d));
  // تواريخ متتابعة: الحصص المختارة أولًا على أيام متتالية، ثم ما لم يُختر بعدها — حتى لا تتباعد المختارة بحصص لن تُنشر
  const picked = (s) => (s.manual != null ? s.manual : inScope(s));
  const order = !fileMode && !['week', 'dates'].includes(scope.kind) ? cands.filter(picked).concat(cands.filter((s) => !picked(s))) : cands;
  // ما حُفظ منذ فتح الأداة مرساة: حصة بعده في ترتيب الدروس لا تُنشر قبله ولا معه (بعد تأخير أو توقف أو استئناف)
  const after = new Map();
  let floor = '';
  seqAll.forEach((s) => {
    if (s.eligible) { if (floor) after.set(s, floor); return; }
    const d = savedIds.has(s.lesson.id) ? semSaved[s.lesson.id] : '';
    if (isIso(d) && d > floor) floor = d;
  });
  // «بداية الإدخال» (اختيار المعلم في التحضير التلقائي): لا تُنشر حصة قبل هذا التاريخ، وما بعده يُلاءم آخر أسبوع في الخطة
  const fromIso = fileMode && !WIZ.pickDates && isIso(WIZ.fromDate) ? WIZ.fromDate : '';
  if (fromIso) cands.forEach((s) => { const a = after.get(s) || ''; if (fromIso > a) after.set(s, fromIso); });
  // حدّان: آخر أسبوع في خطة المادة (تُجمع الحصص حتى تتسع له)، ونهاية الفصل الفعلية (ما بعدها يُعلَّم «بعد نهاية الفصل»)
  const planEnd = pkgEnd(pkg) || termEndOf(settings, termNo);
  const termEnd = termEndOf(settings, termNo) || (pkg.remote && isIso(pkg.remote.ends_on) ? pkg.remote.ends_on : '') || planEnd;
  let loose = '';   // ضغط الفصل: من هذا التاريخ تلي كل حصة ما قبلها مباشرة بدل انتظار أسبوعها في الخطة
  // الجمع يُحسب من جديد في كل توزيع: ما جُمع قبل قراءة جدول حصص المعلم (حصتان في يوم مثلًا) لا يبقى إن اتسع له الجدول.
  // ما حُفظ في نور لا يدخل هنا (ليس من المرشحين)، فتبقى تحاضيره المجموعة كما هي
  const candSet = new Set(cands);
  cands.forEach((s) => {
    if (s.merge && s.merge.length) { s.merge.forEach((x) => { if (candSet.has(x)) x.mergedInto = null; }); s.merge = null; }
    if (s.mergedInto && candSet.has(s.mergedInto)) s.mergedInto = null;
  });
  const lay = () => {
    const items = order.filter((s) => !s.mergedInto).map((s) => ({ s, fileDate: fileMode && isIso(s.lesson.pubDate) ? s.lesson.pubDate : '', fixed: s.fixed || '', after: after.get(s) || '' }));
    const notes = layoutDates(items, { start: startIso, days, taken, useFileDates: fileMode, skip: holidaySet(settings), exact: !!WIZ.pickDates, cap: capOf, weekly: fileMode && !WIZ.pickDates, loose, today: fromIso ? '' : todayIso() });
    return { items, notes };
  };
  let { items, notes } = lay();
  // نهاية الفصل حدّ لا يُتجاوز حين تكون حصص الملف أكثر من حصص المعلم في الجدول حتى آخر أسبوع في الخطة:
  // ١) حصتان (حتى أربع) متتاليتان من الدرس نفسه في تحضير واحد «الدرس (2 و 3)» — يُجمع الزوج الذي يقرّب الفصل فعلًا
  //    (جمع في أسبوع فيه متسع لا يفيد؛ ما بعده لا يتقدّم إلى أسبوع قبل أسبوعه)
  // ٢) فإن بقيت حصص بعد الخطة (آخر أسابيعها دروس مختلفة لا تُجمع): ما بعد اليوم يُضغط فتلي كل حصة ما قبلها مباشرة
  //    (لا تسبق اليوم ولا ترتيبها)، ويُجمع ما يلزم بعدها، ثم يُعاد ما أمكن إلى أسابيعه فلا يبدأ الضغط إلا من حيث يلزم
  if (planEnd && fileMode && !WIZ.pickDates && WIZ.trialCap == null) {   // التجربة (٣ حصص) لا تحتاج ضغط الفصل
    const today = fromIso || todayIso();
    const lateN = (its) => its.filter((it) => it.date > planEnd).length;
    const join = (a, b) => { const was = { am: a.merge, bm: b.merge }; a.merge = (a.merge || []).concat(b, b.merge || []); b.mergedInto = a; b.merge = null; return () => { a.merge = was.am; b.merge = was.bm; b.mergedInto = null; }; };
    const tryMerges = () => {
      for (let guard = 0, late = lateN(items); guard < 300 && late; guard++) {
        let done = false;
        for (const c of mergePairs(items, 4, today)) {
          const undo = join(c.a, c.b);
          const next = lay();
          if (lateN(next.items) < late) { ({ items, notes } = next); late = lateN(items); done = true; break; }
          undo();
        }
        if (!done) break;
      }
    };
    if (lateN(items)) tryMerges();
    if (lateN(items)) {
      loose = nextSchoolDay(today, days, true);
      ({ items, notes } = lay());
      if (lateN(items)) tryMerges();
      if (!lateN(items)) {   // أبعد بداية للضغط تُبقي الفصل متّسعًا: ما قبلها يبقى في أسابيعه
        const wks = [...new Set(items.map((it) => (isIso(it.fileDate) ? weekStart(it.fileDate) : '')).filter((w) => w > loose))].sort();
        for (let k = wks.length - 1; k >= 0; k--) { const was = loose; loose = wks[k]; const next = lay(); if (!lateN(next.items)) { ({ items, notes } = next); break; } loose = was; }
      }
      if (!dateNotes.has('loose:' + loose)) { dateNotes.add('loose:' + loose); logLine('info', `حصصك في الجدول أقل من حصص الخطة: من ${dayLabel(loose, false)} تتابع الحصص على حصصك مباشرة حتى يكتمل الفصل في وقته`); }
    }
  }
  items.forEach((it) => { it.s.date = it.date; it.s.slot = it.slot || 1; it.s.dateSrc = it.dateSrc; it.s.movedFrom = ''; it.s.afterTerm = !!(termEnd && it.date > termEnd); });
  cands.forEach((x) => { let r = x.mergedInto; while (r && r.mergedInto) r = r.mergedInto; if (r) { x.date = r.date; x.slot = r.slot; x.afterTerm = r.afterTerm; } });
  notes.forEach((n) => {
    const s = items[n.i].s;
    if (n.src === 'file' || n.src === 'fixed') s.movedFrom = n.from;
    const key = s.lesson.id + '|' + n.from + '|' + n.to;
    if (n.src === 'file' && !dateNotes.has(key)) { dateNotes.add(key); logLine('info', `تاريخ الملف ${dayLabel(n.from)} لـ«${shortT(s.lesson.title)}» ${n.why === 'offday' ? 'يوم بلا حصص' : n.why === 'holiday' ? 'يوم إجازة' : n.why === 'order' ? 'يسبق الحصة التي قبلها بعد تأجيلها' : 'مستعمل لحصة أخرى'} — نقلته إلى ${dayLabel(n.to)}`); }
  });
  // ميزانية الفصل: حصص ستقع بعد آخر يوم دراسي (تُعبَّأ بتواريخها، لكن تُنبَّه عليها)
  const late = items.filter((it) => it.s.afterTerm).length;
  const merged = cands.filter((x) => x.mergedInto).length;
  // يُذكر الجمع بعد قراءة جدول المعلم فقط: قبلها قد يُجمع ما يتسع له الجدول ثم يُفكّ
  if (merged && schedRead && !dateNotes.has('merge:' + merged)) { dateNotes.add('merge:' + merged); logLine('info', `حصص الفصل أكثر من حصصك في الجدول: جمعت ${countWord(merged)} مع حصة قبلها من الدرس نفسه في تحضير واحد، فتكتمل الخطة في أسابيعها (آخرها ${dayLabel(planEnd, false)})`); }
  if (!WIZ.on && termEnd && late && !dateNotes.has('late:' + late)) { dateNotes.add('late:' + late); logLine('info', `${toAr(late)} ${late === 1 ? 'حصة ستقع' : 'حصص ستقع'} بعد نهاية الفصل (${dayLabel(termEnd, false)}) — راجع ميزانية الفصل في «فحص ملف المادة»`); }
  cands.forEach((s) => { s.on = s.manual != null ? s.manual : inScope(s); });
  plan.forEach((p) => p.sessions.filter((s) => !s.eligible).forEach((s) => { s.on = false; s.date = s.date || ''; }));
  queue = cands.filter((s) => s.on).sort((a, b) => a.date.localeCompare(b.date) || cands.indexOf(a) - cands.indexOf(b));
  // التجربة المجانية: لا يُعبّأ أكثر من الحصص المجانية المتبقية
  if (WIZ.trialCap != null) {
    const was = (s) => WIZ.fetched0 && WIZ.fetched0.has(s.lesson.id);
    const keep = new Set(queue.filter(was).concat(queue.filter((s) => !was(s)).slice(0, WIZ.trialCap)));
    queue.filter((s) => !keep.has(s)).forEach((s) => { s.on = false; s.trialCut = true; });
    queue = queue.filter((s) => keep.has(s));
  }
  if (scope.kind === 'week' && scope.weekDay) $('weekHint').textContent = `${dayLabel(weekStart(scope.weekDay))} – ${dayLabel(weekEnd(scope.weekDay))}: ${countWord(queue.length)}`;
}
// تأجيل حصة إلى يوم الحصة التالي المتاح (رفضت نور تاريخها أو لا صفوف فيه): يثبت تاريخها الجديد، وما بعدها بلا تاريخ ملف يتبعها
function shiftDate(s) {
  const fixed = takenCounts(plan.flatMap((p) => p.sessions.filter((x) => x.eligible)));
  // المثبّت بيد المعلم أو بتأجيل سابق فقط؛ تواريخ الملف لما بعدها تتزحزح خلفها (لا قفز إلى أول فجوة بعيدة)
  queue.forEach((x) => { if (x !== s && x.date && x.fixed) fixed.set(x.date, (fixed.get(x.date) || 0) + 1); });
  const hol = holidaySet(settings);
  let c = nextSchoolDay(s.date, days, false);
  for (let i = 0; i < 60 && ((fixed.get(c) || 0) >= capOf(c) || hol.has(c)); i++) c = nextSchoolDay(c, days, false);
  s.fixed = c;
  assignDates();
  renderPlan();
}
// سعة يوم الأسبوع (حصص الشعبة نفسها فيه) كما عرضها نور — تُحفظ لهذه المادة فتعرفها المرات القادمة من البداية
async function setCap(iso, n) {
  const wd = wdOf(iso), was = capOf(iso);
  caps[wd] = Math.max(1, Math.min(6, n || 1));
  if (caps[wd] !== was && caps[wd] > 1) logLine('info', `يوم ${DAY_NAMES[wd]}: ${toAr(caps[wd])} حصص للشعبة نفسها — لكل حصة تحضيرها`);
  try { const { state: st } = await getPackages(); st.pkgCaps = Object.assign({}, st.pkgCaps || {}, { [pkg.id]: Object.assign({}, caps) }); await savePkgState(st); state = st; } catch (e) {}
}
// يوم بلا صفوف لهذا المقرر مرتين: لا حصة لك فيه — يُتخطّى في بقية الفصل
// يميّز الإجازة عن يوم بلا حصة: لا يُستبعد اليوم إلا إن خلا من الصفوف في أسبوعين مختلفين ولم تظهر فيه صفوف قط
function learnNoClass(iso) {
  const d = new Date(iso + 'T12:00');
  const wd = d.getDay(), week = Math.floor(d.getTime() / (7 * 864e5));
  const weeks = noClass.get(wd) || new Set();
  weeks.add(week); noClass.set(wd, weeks);
  if (weeks.size >= 2 && !classOk.has(wd) && days.includes(wd) && days.length > 1) {
    days = days.filter((d) => d !== wd);
    renderDays();
    logLine('info', `لا تظهر لك صفوف يوم ${DAY_NAMES[wd]} في هذا المقرر — أتخطاه في بقية الفصل (عدّل «أيام الحصص» إن كان خطأ)`);
  }
}

const HOW = { fuzzy: ['ok', 'بالتشابه'], near: ['warn', 'بالتشابه — تأكد'], order: ['warn', 'بالترتيب — تأكد'], seq: ['ok', 'بالترتيب بين درسين مطابقين'], ordinal: ['ok', 'بترقيم الدرس'], pick: ['ok', 'اختيارك السابق'], manual: ['ok', 'اخترته أنت'], name: ['ok', ''], number: ['warn', 'برقم الوحدة فقط — تأكد'] };
function dupNodes() { const seen = new Map(); plan.forEach((p) => { if (p.node) seen.set(p.node.id, (seen.get(p.node.id) || 0) + 1); }); return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id)); }
function conflicts() {
  const dup = dupNodes();
  return {
    miss: plan.filter((p) => p.miss && !p.skipped),
    weak: plan.filter((p) => !p.miss && (p.how === 'order' || p.how === 'number') && p.sessions.some((s) => s.on)),
    dup: plan.filter((p) => p.node && dup.has(p.node.id)),
  };
}
// الاكتمال: كل درس من ملفك مربوط بدرس في نور، وكل حصصه موجودة في نور (أو محفوظة) — عندها لا مراجعة ولا اقتراحات: «مكتمل» فقط
function completion() {
  const linked = plan.filter((p) => p.node);
  const all = linked.flatMap((p) => p.sessions);
  const isDone = (s) => s.inNoor || s.savedNow || done(s.lesson);
  const left = all.filter((s) => !isDone(s)).length;
  const miss = plan.filter((p) => p.miss && !p.skipped).length;
  return { total: all.length, left, miss, linkedDone: all.length > 0 && !left, complete: all.length > 0 && !left && !miss };
}
const completeText = (c) => `✔ مكتمل: كل حصص «${pkg.title || pkg.subject || 'المادة'}» مُدخلة في نور (${toAr(c.total)} من ${toAr(c.total)})`;
let editable = false;   // تعديل الربط مسموح أثناء مراجعة الخطة وقبل البدء
function nodeOptions(sel) {
  const units = [...new Set(treeNodes.map((n) => n.unit))];
  return `<option value="">— تخطَّ هذا الدرس —</option>` + units.map((u) => `<optgroup label="${esc(u)}">${treeNodes.filter((n) => n.unit === u).map((n) => `<option value="${esc(n.id)}" ${sel === n ? 'selected' : ''}>${esc(n.text)}</option>`).join('')}</optgroup>`).join('');
}
function renderPlan() {
  if (!plan.length) { $('planCard').hidden = true; return; }
  $('planCard').hidden = false;
  const c = conflicts();
  const cp = completion();
  const matched = plan.filter((p) => !p.miss).length;
  const n = plan.flatMap((p) => p.sessions.filter((s) => s.on)).length;
  const inNoor = plan.flatMap((p) => p.sessions.filter((s) => s.inNoor)).length;
  $('planSum').textContent = cp.complete ? `— مكتمل ✓: ${toAr(plan.length)} درسًا، ${countWord(cp.total)} كلها في نور` : `— ${toAr(plan.length)} درسًا في ملفك، مربوط منها بدروس نور ${toAr(matched)}${noorHave ? ` · موجود في نور ${countWord(inNoor)}` : ''} · سيُعبّأ ${countWord(n)}`
    + (c.miss.length + c.weak.length + c.dup.length ? ` · للمراجعة: ${toAr(c.miss.length + c.weak.length + c.dup.length)}` : '');
  const dup = dupNodes();
  $('plan').innerHTML = plan.map((p, i) => {
    if (WIZ.on && p.miss) return '';   // المعالج: درس بلا مقابل في الشجرة لا يُعرض للمعلم
    const h = HOW[p.how] || ['ok', ''];
    // درس كل حصصه في نور: لا داعي لعلامة «بالترتيب — تأكد» بعد أن حُفظ
    const settled = p.node && !dup.has(p.node.id) && p.sessions.every((s) => s.inNoor || s.savedNow || done(s.lesson));
    const flag = p.node && dup.has(p.node.id) ? '<span class="flag bad">⚠ درس نور نفسه مربوط بدرس آخر من ملفك</span>'
      : p.miss ? `<span class="flag ${p.skipped ? 'ok' : 'bad'}">${p.skipped ? 'تخطّيته' : '⚠ ' + esc(p.why || 'لم أجده في شجرة هذا الفصل')}</span>`
        : settled ? '' : h[1] ? `<span class="flag ${h[0]}">${h[1]}</span>` : '';
    const cls = p.node && dup.has(p.node.id) ? 'bad' : p.miss && !p.skipped ? 'bad' : h[0] === 'warn' && !settled ? 'warn' : '';
    const map = editable
      ? `<select class="map ${cls}" data-i="${i}" title="درس نور المقابل">${nodeOptions(p.node)}</select>${p.node ? `<button class="seq" data-seq="${i}" title="اربط الدروس التالية في ملفك بدروس نور التالية لهذا الدرس بالترتيب">↧ ما بعده بالترتيب</button>` : ''}`
      : (p.node ? `<div class="u" dir="ltr" style="text-align:right">في نور: ${esc(p.node.text)}</div>` : '');
    const head = `<div class="lh ${p.miss && !p.skipped ? 'miss' : ''}"><div><div class="u">${esc(p.group.unit || '')}</div><b>${toAr(i + 1)}. ${esc(p.group.lesson || 'درس')}</b> ${flag}${map}</div>
      <span class="c">${countWord(p.sessions.length)}</span></div>`;
    const rows = p.sessions.map((s) => {
      const st = sessionStatus(state, pkg.id, s.lesson.id);
      const stat = s.st ? `<span class="st ${s.st.cls}">${esc(s.st.text)}</span>`
        : s.inNoor ? '<span class="st ok">✓ موجودة في نور</span>'
          : !noorHave && st.saved ? `<span class="st ok">✓ محفوظة${st.savedDate ? ' · ' + dayLabel(st.savedDate, false) : ''}</span>`
            : !noorHave && st.filled ? `<span class="st wait">• عُبّئت — ${esc(unsavedText(st))}</span>` : '<span class="st skip"></span>';
      const src = s.dateSrc === 'file' ? ' <span class="src">· من الملف</span>' : s.dateSrc === 'fixed' ? ' <span class="mv">· نُقل</span>' : '';
      const mv = (s.movedFrom ? ` <span class="mv">(كان ${esc(dayLabel(s.movedFrom, false))})</span>` : '') + (s.afterTerm ? ' <span class="mv">⚠ بعد نهاية الفصل</span>' : '');
      const src2 = s.manualDate ? ' <span class="src">· حددته أنت</span>' : src;
      const dateIn = editable && s.on && s.date ? `<span class="dwrap"><input type="date" class="sd" value="${esc(s.date)}" aria-label="تاريخ نشر الحصة" title="غيّر تاريخ هذه الحصة — ما بعدها بلا تاريخ يتبعها">${s.manualDate ? '<button type="button" class="undo" title="أعد التاريخ التلقائي">↺</button>' : ''}</span>` : '';
      return `<div class="ses ${s.cur ? 'cur' : ''}" data-id="${esc(s.lesson.id)}">
        <input type="checkbox" ${s.on ? 'checked' : ''} ${!editable || p.miss ? 'disabled' : ''} aria-label="تحديد الحصة">
        <div>${esc(s.lesson.title)}${s.on && s.date ? `<small>النشر: ${esc(dayLabel(s.date))}${src2}${mv}</small>` : !s.on && s.eligible ? '<small>خارج النطاق المختار</small>' : ''}${dateIn}</div>${stat}</div>`;
    }).join('');
    return `<div class="lesson">${head}${rows}</div>`;
  }).join('');
  $('plan').querySelectorAll('.ses input[type=checkbox]').forEach((cb) => {
    cb.onchange = () => {
      const s = plan.flatMap((p) => p.sessions).find((x) => x.lesson.id === cb.closest('.ses').dataset.id);
      if (s) { s.manual = cb.checked; assignDates(); renderPlan(); }
    };
  });
  // تاريخ حصة بيدك: يصبح مرساة (تتبعها الحصص التي بعدها)، ويُحفظ للمرات القادمة
  const sesOf = (el) => plan.flatMap((p) => p.sessions).find((x) => x.lesson.id === el.closest('.ses').dataset.id);
  $('plan').querySelectorAll('.ses input.sd').forEach((inp) => {
    inp.onchange = async () => {
      const s = sesOf(inp); if (!s || !inp.value) return;
      s.fixed = inp.value; s.manualDate = true;
      await setDateOverride(pkg.id, s.lesson.id, inp.value).catch(() => {});
      assignDates(); renderPlan();
    };
  });
  $('plan').querySelectorAll('.ses .undo').forEach((b) => {
    b.onclick = async () => {
      const s = sesOf(b); if (!s) return;
      s.fixed = ''; s.manualDate = false;
      await setDateOverride(pkg.id, s.lesson.id, '').catch(() => {});
      assignDates(); renderPlan();
    };
  });
  $('plan').querySelectorAll('select.map').forEach((sel) => {
    sel.onchange = () => { setNode(plan[+sel.dataset.i], treeNodes.find((n) => n.id === sel.value) || null); assignDates(); renderPlan(); };
  });
  $('plan').querySelectorAll('button.seq').forEach((b) => {
    b.onclick = () => {
      const i = +b.dataset.seq;
      let k = treeNodes.indexOf(plan[i].node);
      for (let j = i + 1; j < plan.length; j++) setNode(plan[j], treeNodes[++k] || null);
      assignDates(); renderPlan();
    };
  });
  const cur = $('plan').querySelector('.ses.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// ربط درس من ملفك بدرس نور (أو تخطيه) بيدك
function setNode(p, node) {
  p.node = node; p.how = node ? 'manual' : ''; p.miss = !node; p.skipped = !node; p.why = ''; p.edited = true;
  presence(p);
}
// الحصص الموجودة في نور لهذا الدرس (بعنوان درس نور، و«(2)» للحصة الثانية)
// قائمة نور تُصدَّق وحدها متى قُرئت كاملة وكانت عناوينها بصيغة دروس الشجرة (أو كانت فارغة):
// ما حذفه المعلم من نور يعود حصةً تُعبّأ، ويُمحى من سجل «حاضر» دون سؤال
let noorTrust = false;
const forgotten = new Set();
let nodeSes = new Map();     // درس نور ← عدد حصصه في الخطة (لتوزيع تحاضير الاسم المكرر في أكثر من وحدة)
let nodeLs = new Map();      // درس نور ← حصص ملفك المربوطة به بالترتيب (لمعرفة تواريخها)
let savedBak = {};           // ما حُفظ لهذا المقرر في فتحات سابقة: lessonId ← تاريخ (نسخة «حاضر» الاحتياطية)
let pendingSave = {};        // حصص ضُغط حفظها ولم يتأكد: lessonId ← { date, at } — تُعدّ موجودة فلا تتكرر
const savedIds = new Set();  // ما حُفظ منذ فتح الأداة (لا يُمحى ولو تأخر ظهوره في قائمة نور)
// عناوين قائمة نور ← حصص كل درس في الشجرة.
// · درس اسمه نفسه ينتهي بـ«(1)» («الجمع (1)»): يُطابَق بعنوانه الكامل أولًا، فلا يُحسب «(1)» رقم حصة
// · اسم مكرر في أكثر من وحدة («تحقق من تقدمك»): كل تحضير إلى الدرس الذي له حصة برقمه («(2)» = الحصة الثانية) وأقرب
//   تاريخًا إلى تاريخ نشره (ما حفظه «حاضر» لتلك الحصة، ثم تاريخ الملف)، وإلا بترتيب الشجرة
function haveMap(h) {
  if (!h) return null;
  if (h.byNode && h.byFor === treeNodes && h.bySes === nodeSes) return h.byNode;
  const own = new Map();
  treeNodes.forEach((n) => { const k = kwNorm(n.text); if (k) own.set(k, (own.get(k) || []).concat(n)); });
  const counts = new Map(), rows = new Map();
  const dates = h.dates || [];
  (h.titles || []).forEach((t, i) => {
    let k = kwNorm(t), ns = [1];
    // «X (2 و 3)»: تحضير واحد لحصتين من الدرس نفسه — يُحسب للحصتين
    if (!own.has(k)) {
      // نور تضيف «(j)» بنفسها لتحضير ثانٍ للدرس نفسه في اليوم نفسه: «X (2) (2)» — رقم الحصة هو الأقرب لاسم الدرس
      let base = t, inner = t;
      for (let i = 0; i < 3 && !own.has(kwNorm(base)) && stripSessionSuffix(base) !== base; i++) { inner = base; base = stripSessionSuffix(base); }
      if (own.has(kwNorm(base))) { k = kwNorm(base); ns = sessionNums(inner) || [1]; }
      else { k = kwNorm(stripSessionSuffix(t)); ns = sessionNums(t) || [1]; }
    }
    if (!k) return;
    const list = counts.get(k) || [];
    if (!rows.has(k)) rows.set(k, []);
    ns.forEach((n0) => {
      let n = n0;
      while (list.includes(n)) n++;
      list.push(n);
      // رقم الحصة كما في العنوان؛ وما بلا رقم قد يكون حصة أولى لدرس آخر بالاسم نفسه، أو حصة تالية حُفظت بلا «(n)» (plain)
      rows.get(k).push({ n: n0, plain: n0 === 1 && !sessionSuffix(t), d: isIso(dates[i]) ? dates[i] : '' });
    });
    counts.set(k, list);
  });
  const sesOf = (n) => (nodeLs.get(n.id) || Array.from({ length: nodeSes.get(n.id) || 1 }, () => null))
    .map((l) => (l ? { saved: semSaved[l.id] || (pendingSave[l.id] || {}).date || savedBak[l.id] || '', file: l.pubDate || '' } : { saved: '', file: '' }));
  const by = new Map(), amb = new Map();
  own.forEach((nodes, k) => {
    const list = counts.get(k) || [];
    if (nodes.length === 1) { by.set(nodes[0].id, list); return; }
    const slots = nodes.map((n, i) => ({ n, i, ses: sesOf(n), got: new Set() }));
    const left = (rows.get(k) || []).slice();
    // كلفة وضع الصف في حصة رقم n من هذا الدرس: ٠ تاريخه = ما حفظه «حاضر» لها، ١ = تاريخ الملف، ٢+ الأقرب تاريخًا، ١٠+ بلا دليل (ترتيب الشجرة)
    const cost = (r, x, n) => {
      if (x.ses.length < n || x.got.has(n)) return null;
      const s = x.ses[n - 1];
      if (r.d && s.saved === r.d) return 0;
      if (r.d && s.file === r.d) return 1;
      const near = r.d && isIso(s.saved || s.file) ? Math.abs(diffDays(r.d, s.saved || s.file)) : null;
      return near != null ? 2 + Math.min(near, 400) / 1000 : 10 + x.i;
    };
    // جولتان: برقم الحصة كما في العنوان، ثم ما بقي بلا رقم يُعدّ حصة تالية لدرس له متسع (كما تُعدّ العناوين المكررة لدرس واحد)
    for (const bump of [false, true]) {
      while (left.length) {
        let best = null;
        left.forEach((r, ri) => slots.forEach((x) => {
          let n = r.n;
          if (bump) { if (!r.plain) return; while (x.got.has(n) && n < x.ses.length) n++; }
          const c = cost(r, x, n);
          if (c != null && (!best || c < best.c)) best = { c, ri, x, r, n };
        }));
        if (!best) break;
        best.x.got.add(best.n); left.splice(best.ri, 1);
        // بلا أي دليل تاريخ: لا نجزم أي درس هو صاحبه — الحصة نفسها في الدروس الأخرى بالاسم نفسه تُعدّ موجودة أيضًا (فلا تتكرر)
        if (best.c >= 10) slots.forEach((x) => { if (x !== best.x && x.ses.length >= best.n && !x.got.has(best.n)) { if (!amb.has(x.n.id)) amb.set(x.n.id, new Set()); amb.get(x.n.id).add(best.n); } });
      }
    }
    slots.forEach((x) => by.set(x.n.id, [...x.got].sort((a, b) => a - b)));
  });
  h.byNode = by; h.ambNode = amb; h.byFor = treeNodes; h.bySes = nodeSes; h.keyCounts = counts;
  return by;
}
const haveOf = (h, node) => (h && node ? (haveMap(h).get(node.id) || []) : []);
// العدد في نور لكل الدروس التي تحمل هذا الاسم، والمتوقع منها (للتحقق من الحفظ دون خلط الوحدات)
const keyCount = (h, p) => { if (!h || !p.node) return 0; haveMap(h); return (h.keyCounts.get(kwNorm(p.node.text)) || []).length; };
// المتوقع الآن = العدد الخام للاسم عند بدء التشغيل (keyInit، يشمل صفوفًا لم تُنسب لأي حصة) + ما حفظه هذا التشغيل للاسم
const keyWant = (p) => { const k = kwNorm(p.node.text); const ps = plan.filter((x) => x.node && kwNorm(x.node.text) === k); return (ps[0] ? ps[0].keyInit || 0 : 0) + ps.reduce((a, x) => a + (x.savedNow || 0), 0); };
// رقم الحصة بين حصص درس نور كله: درس واحد في نور قد يقابل أكثر من درس في ملفك (وحدة التلاوة في نور درس واحد لسورها كلها)،
// فتُرقَّم حصصها كلها معًا بترتيب الملف — ولدرس عادي هو رقمها في درسها
function nodeNo(s) {
  const k = s.p ? s.p.sessions.indexOf(s) + 1 : 1;
  const L = s.p && s.p.node ? nodeLs.get(s.p.node.id) : null;
  const i = L ? L.indexOf(s.lesson) : -1;
  return i >= 0 ? i + 1 : k;
}
function presence(p) {
  const have = haveOf(noorHave, p.node);
  const ambSet = noorHave && p.node && noorHave.ambNode ? noorHave.ambNode.get(p.node.id) : null;
  p.sessions.forEach((s) => {
    s.p = p;
    const no = nodeNo(s);
    const pend = pendingSave[s.lesson.id];
    const maybe = !!(ambSet && ambSet.has(no));   // تحضير بالاسم نفسه في نور قد يكون لهذه الحصة (لا دليل تاريخ): تُعدّ موجودة
    if (noorTrust && p.node && !have.includes(no) && !maybe && !savedIds.has(s.lesson.id) && !pend && (semSaved[s.lesson.id] || done(s.lesson))) { delete semSaved[s.lesson.id]; forgotten.add(s.lesson.id); }
    s.inNoor = have.includes(no) || maybe || !!pend || savedIds.has(s.lesson.id) || (!noorTrust && !!semSaved[s.lesson.id]);
    s.eligible = !!p.node && !s.inNoor && !s.savedNow && (noorHave || forgotten.has(s.lesson.id) ? true : !done(s.lesson));
    if (!s.eligible) s.on = false;
  });
}
function setSt(s, cls, text) { s.st = { cls, text }; renderPlan(); }

// ================= التبويب والتنقل =================
async function tabUrl() { try { return (await chrome.tabs.get(tabId)).url || ''; } catch (e) { return ''; } }
async function waitComplete(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !stopFlag) {
    await sleep(400);
    try { const t = await chrome.tabs.get(tabId); if (t.status === 'complete' && t.url && !/^about:/.test(t.url)) return true; } catch (e) { return false; }
  }
  return false;
}
async function ensureTab() {
  if (tabId) { try { await chrome.tabs.get(tabId); return; } catch (e) { tabId = null; } }
  try {
    const tabs = await chrome.tabs.query({ url: ['https://*.moe.gov.om/*', 'http://*.moe.gov.om/*'] });
    const t = tabs.find((x) => noorWin && x.windowId === noorWin) || tabs[0];
    if (t) { tabId = t.id; return; }
  } catch (e) {}
  // لا تبويب لنور: نفتحه في نافذة عادية (لا في نافذة «حاضر» المنبثقة)
  let win = noorWin;
  if (!win) { try { const ws = await chrome.windows.getAll({ windowTypes: ['normal'] }); if (ws[0]) win = ws[0].id; } catch (e) {} }
  const t = win ? await chrome.tabs.create({ url: HOME, active: true, windowId: win })
    : await chrome.windows.create({ url: HOME, type: 'normal' }).then((w) => w.tabs[0]).catch(() => chrome.tabs.create({ url: HOME, active: true })); // الهاتف: لا نوافذ
  tabId = t.id;
  await waitComplete(25000);
}
// بعد إعادة تثبيت «حاضر» يبدأ الجهاز بطلب تجربة جديد. إن كان حساب نور المفتوح هو حساب صاحب اشتراك فعّال وباسمه،
// يعود الجهاز إلى اشتراكه وحده (من الخادم) دون «فعّل» ودون أن تُستهلك التجربة
async function reclaim(openTab = true) {
  try {
    if (openTab) await ensureTab();
    // نور تُفتح الآن أو ما زالت تُحمَّل: نقرأ حسابها حتى يظهر (مهلة قصيرة)
    let who = tabId ? await noorWho(tabId) : null;
    for (let i = 0; openTab && !who && tabId && i < 15 && !stopFlag; i++) { if (i === 3 || i === 9) await chrome.tabs.reload(tabId).catch(() => {}); await sleep(1000); who = await noorWho(tabId); }
    const r = await noorCheck(who || ((await chrome.storage.local.get('noorWho').catch(() => ({}))).noorWho || null));
    if (!r || !r.merged) return false;
    const g = await getPackages(); packages = g.packages; state = g.state;
    wz.status = await getStatus();
    return true;
  } catch (e) { return false; }
}
function waitNavigation(timeout) {
  if (stopFlag) return Promise.resolve(false);
  return new Promise((res) => {
    let sawLoading = false, t = null, finished = false;
    const onStop = () => fin(false);
    const fin = (v) => {
      if (finished) return; finished = true;
      chrome.tabs.onUpdated.removeListener(l); clearTimeout(t);
      const i = stopHooks.indexOf(onStop); if (i >= 0) stopHooks.splice(i, 1);
      res(v);
    };
    const l = (id, info) => {
      if (id !== tabId) return;
      if (info.status === 'loading') sawLoading = true;
      if (info.status === 'complete' && sawLoading) fin(true);
    };
    chrome.tabs.onUpdated.addListener(l);
    if (timeout) t = setTimeout(() => fin(false), timeout);
    stopHooks.push(onStop);
  });
}
async function nav(url) {
  await ensureTab().catch(() => {});
  const nv = waitNavigation(40000);
  try { await chrome.tabs.update(tabId, { url }); } catch (e) { return false; }
  const ok = await nv;
  if (!ok) await waitComplete(8000);   // الصفحة نفسها أو تحميل لم يُرصد: ننتظر اكتمالها
  await sleep(500);
  return true;
}
async function focusNoor() {
  try { const t = await chrome.tabs.get(tabId); await chrome.windows.update(t.windowId, { focused: true }); await chrome.tabs.update(tabId, { active: true }); } catch (e) {}
}
async function exec(func, ...args) {
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return r && r[0] ? r[0].result : null;
  } catch (e) { return null; }
}

// يُحقن في صفحة نور: بطاقات المواد في الرئيسية وروابط «تحضير الدروس» فيها
function readHomePage() {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('a[href*="preparations_index/cid:"]').forEach((a) => {
    const card = a.closest('.course-box-in-teacher-dashbaord, .main-category-stu-box') || a.closest('[class*="course"]');
    const tEl = card && card.querySelector('.main_category_stu_title');
    const title = tEl ? (clean(tEl.textContent) || clean(tEl.getAttribute('data-original-title'))) : '';
    const levels = card ? Array.from(card.querySelectorAll('.main_category_level_title')).map((x) => clean(x.textContent)) : [];
    const cid = (a.getAttribute('href').match(/cid:([A-Za-z0-9_-]+)/) || [])[1] || '';
    if (out.some((x) => x.cid === cid)) return;
    out.push({ title, levels, cid, prepUrl: a.href });
  });
  return { login: !!document.querySelector('input[type="password"]'), url: location.href, courses: out };
}
// يُحقن في صفحة «تحضير الدروس»: رابط «إضافة تحضير»
function readPrepList() {
  const a = document.querySelector('a[href*="add_preparation"]');
  return { login: !!document.querySelector('input[type="password"]'), url: location.href, addUrl: a ? a.href : '', rows: document.querySelectorAll('table tbody tr').length };
}
// يُحقن في صفحة «تحضير الدروس» (عالم الصفحة نفسها): كل عناوين التحاضير من جدول نور — يوسّع عدد الصفوف المعروضة ليشمل الكل
async function readAllPrepTitles() {
  const jq = window.jQuery;
  const el = document.getElementById('preparations_grid');
  if (!jq || !jq.fn || !jq.fn.dataTable || !el || !jq.fn.dataTable.isDataTable(el)) return { ok: false };
  const dt = jq(el).DataTable();
  const total = dt.page.info().recordsTotal;
  if (dt.page.info().length !== -1 && dt.page.info().length < Math.max(total, 1)) {
    await new Promise((res) => { const t = setTimeout(res, 25000); dt.one('draw', () => { clearTimeout(t); res(); }); dt.page.len(2000).draw(); });
  }
  const strip = (h) => { const d = document.createElement('div'); d.innerHTML = String(h == null ? '' : h); return d.textContent.replace(/\s+/g, ' ').trim(); };
  let titles = [];
  try { titles = dt.cells(null, 0).render('display').toArray().map(strip); } catch (e) {}
  // تواريخ النشر: من عمود «تاريخ النشر» باسم رأسه فقط (تاريخ الإنشاء ليس يومًا مشغولًا). لا عمود باسمه ← لا تواريخ
  const heads = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent.replace(/\s+/g, ' ').trim());
  const col = heads.findIndex((t) => /نشر/.test(t) && !/انشاء|إنشاء|اضافة|إضافة/.test(t));
  const dateOf = (tr) => { const td = col >= 0 && tr.children[col]; const m = td && td.textContent.match(/\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
  // نصّ العنوان كما يراه المعلم (دون شارات أو نصوص مرافقة في الخلية) إن كانت كل الصفوف معروضة — مع تاريخ نشر كل صف
  const trs = Array.from(el.querySelectorAll('tbody tr')).filter((tr) => tr.querySelector('.title-text'));
  const dom = trs.map((tr) => tr.querySelector('.title-text').textContent.replace(/\s+/g, ' ').trim());
  let byRow = [];
  if ((dom.length && dom.length >= titles.length) || !titles.length || titles.some((t) => !t || t === '[object Object]')) { titles = dom; byRow = trs.map(dateOf); }
  const dates = Array.from(el.querySelectorAll('tbody tr')).map(dateOf).filter(Boolean);
  return { ok: true, total, titles, dates, byRow };
}
// احتياط (عالم الإضافة): عناوين الصفحة المعروضة فقط
function readVisiblePrepTitles() {
  const rows = Array.from(document.querySelectorAll('table tbody tr .title-text')).map((x) => x.textContent.replace(/\s+/g, ' ').trim());
  const info = (document.getElementById('preparations_grid_info') || {}).textContent || '';
  return { rows, info, empty: !!document.querySelector('td.dataTables_empty') };
}
// شريط علوي في صفحة نور بأزرار تعود إلى هذه النافذة
function pageBar(opts) {
  const old = document.getElementById('hadir-sem-bar');
  if (old) old.remove();
  if (!opts) return;
  const C = { warn: '#b45309', ok: '#15803d', bad: '#b91c1c' }[opts.kind] || '#0f766e';
  const h = document.createElement('div');
  h.id = 'hadir-sem-bar';
  h.style.cssText = 'all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483646;';
  const root = h.attachShadow({ mode: 'open' });
  const st = document.createElement('style');
  st.textContent = `.b{direction:rtl;font:500 13.5px/1.6 Tajawal,'Segoe UI',Tahoma,sans-serif;background:#fffdf8;color:#16302b;border:2px solid ${C};border-radius:14px;box-shadow:0 16px 36px -12px rgba(0,0,0,.45);padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:max-content;max-width:min(760px,92vw);box-sizing:border-box}
    .t{display:grid;gap:1px;min-width:0;flex:1 1 260px}.t b{font-size:14px;color:${C}}.t span{overflow-wrap:anywhere}
    .a{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    button{all:unset;box-sizing:border-box;cursor:pointer;border-radius:10px;padding:7px 12px;border:1.5px solid ${C};color:${C};background:#fff;white-space:nowrap;font:800 13px Tajawal,'Segoe UI',Tahoma,sans-serif}
    button.p{background:${C};color:#fff}button.x{border-color:transparent;color:#7c8d88;padding:4px 8px}`;
  const b = document.createElement('div'); b.className = 'b';
  const t = document.createElement('div'); t.className = 't';
  const tb = document.createElement('b'); tb.textContent = opts.title || '';
  const ts = document.createElement('span'); ts.textContent = opts.text || '';
  t.append(tb, ts);
  const a = document.createElement('div'); a.className = 'a';
  (opts.buttons || []).forEach((x) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = x.label; if (x.primary) btn.className = 'p';
    btn.onclick = () => { try { chrome.runtime.sendMessage({ type: 'hadirSemReply', id: opts.id, btn: x.id }); } catch (e) {} h.remove(); };
    a.appendChild(btn);
  });
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.title = 'إخفاء';
  x.onclick = () => h.remove();
  a.appendChild(x);
  b.append(t, a);
  root.append(st, b);
  document.documentElement.appendChild(h);
}
async function showBar(opts) { await exec(pageBar, opts); }
async function hideBar() { await exec(pageBar, null); }

// سؤال المعلم: أزرار هنا وفي أعلى صفحة نور · poll: شرط يُفحص دوريًا فينهي السؤال من تلقائه
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === 'hadirSemReply' && askCur && m.id === askCur.id) askCur.finish(m.btn);
});
function ask({ kind = 'info', head = '', text = '', buttons = [], bar = true, poll = null, pollMs = 2500, timeoutMs = 0, defaultId = '' }) {
  if (stopFlag) return Promise.resolve('stop');
  return new Promise((resolve) => {
    const id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    let iv = null, tm = null;
    // مهلة: إن لم تُجب اختير الافتراضي (في التشغيل التلقائي)
    if (timeoutMs && defaultId) {
      const t0 = Date.now();
      const label = (buttons.find((b) => b.id === defaultId) || {}).label || '';
      tm = setInterval(() => {
        const left = Math.max(0, Math.round((timeoutMs - (Date.now() - t0)) / 1000));
        const el = $('nowText'); if (el) el.textContent = `${text}\n(إن لم تختر: «${label}» تلقائيًا بعد ${toAr(left)} ث)`;
        if (left <= 0) finish(defaultId);
      }, 1000);
    }
    const onStop = () => finish('stop');
    function finish(v) {
      if (!askCur || askCur.id !== id) return;
      askCur = null; clearInterval(iv); clearInterval(tm);
      const i = stopHooks.indexOf(onStop); if (i >= 0) stopHooks.splice(i, 1);
      if (bar) hideBar();
      resolve(v);
    }
    askCur = { id, finish };
    stopHooks.push(onStop);
    setBox(kind, head, text, buttons.map((b) => Object.assign({}, b, { onclick: () => finish(b.id) })));
    if (bar) { showBar({ id, kind: WIZ.on && (kind === 'warn' || kind === 'bad') ? 'info' : kind, title: 'حاضر: ' + head, text: String(text || '').split('\n')[0], buttons }); focusNoor(); }
    else chrome.windows.getCurrent().then((w) => chrome.windows.update(w.id, { focused: true })).catch(() => {});
    if (poll) iv = setInterval(async () => { try { const v = await poll(); if (v) finish(v); } catch (e) {} }, pollMs);
  });
}

// انتهت جلسة نور: ننتظر تسجيل الدخول ثم نكمل
async function loginWait(url) {
  const a = await ask({
    kind: 'warn', head: WIZ.on ? 'سجّل دخولك في نور' : 'يبدو أن جلسة نور انتهت — سجّل الدخول',
    text: WIZ.on ? 'أكمل وحدي فور تسجيل الدخول، من حيث وصلت.' : 'بعد تسجيل الدخول أكمل تلقائيًا من حيث توقفت.',
    buttons: [{ id: 'go', label: '✓ سجّلتُ الدخول — أكمل', primary: true }, { id: 'stop', label: 'إيقاف', danger: true }],
    poll: async () => { const al = await pageAlerts(tabId).catch(() => null); return al && !al.login && /moe\.gov\.om\/teacher/.test(al.url || '') ? 'go' : null; },
  });
  if (a !== 'go') return false;
  if (url) await nav(url);
  return true;
}

// ================= مراحل ما قبل التعبئة =================
async function stepHome() {
  setPhase('home');
  for (let i = 0; i < 6 && !stopFlag; i++) {
    if (!(await waitOnline())) return null;
    setBox('run', 'أفتح الصفحة الرئيسية في نور…');
    await nav(HOME);
    let r = null;
    for (let j = 0; j < 4 && !stopFlag; j++) {
      r = await exec(readHomePage);
      if (r && r.login) { await focusNoor(); if (!(await loginWait(HOME))) return null; j = -1; continue; }
      if (r && r.courses.length) { chrome.storage.local.set({ noorCourses: { at: Date.now(), courses: r.courses } }).catch(() => {}); noorWho(tabId).catch(() => {}); return r.courses; }
      await sleep(1500);
    }
    if (stopFlag) break;
    // لم تُفتح صفحة نور الرئيسية (صفحة دخول بشكل آخر، أو تحويل إلى موقع غير نور): غالبًا الدخول مطلوب —
    // نُظهر نور للمعلم ونكمل وحدنا فور دخوله، بدل انتظار يتكرر
    if (!r || !/lms\.moe\.gov\.om\/teacher/.test(r.url || '')) { await focusNoor(); if (!(await loginWait(HOME))) return null; continue; }
    await backoff(i + 1, 'لم تظهر بطاقات المواد بعد — أعيد فتح الرئيسية');
  }
  if (stopFlag) return null;
  throw new Error('لم أجد بطاقات المواد في الصفحة الرئيسية (رابط «تحضير الدروس»).');
}
// الصف من عنوان مستوى البطاقة: «الخامس» أو «الصف الخامس» أو «صف خامس»
function gradeOfLevel(t) {
  const g = gradeOfName(t);
  if (g) return g;
  const s = kwNorm(t).replace(/(^| )ال/g, '$1');
  const names = ['اول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'سادس', 'سابع', 'ثامن', 'تاسع', 'عاشر'];
  if (/حادي عشر/.test(s)) return 11;
  if (/ثاني عشر/.test(s)) return 12;
  const i = names.findIndex((n) => new RegExp('(^| )' + n + '( |$)').test(s));
  return i >= 0 ? i + 1 : 0;
}
async function pickCourse(courses) {
  setPhase('course');
  // بطاقة اخترتها لهذه المادة من قبل: تُستعمل مباشرة
  const g = gradeNumber(pkg);
  const gradeOf = (c) => (c.levels || []).map(gradeOfLevel).find(Boolean) || 0;
  const known = knownCourse(state, pkg.id);
  const kc = known && courses.find((c) => c.cid === known.cid && (!g || !gradeOf(c) || gradeOf(c) === g));
  if (kc) { logLine('info', `بطاقة المادة (اختيارك السابق): «${kc.title} — ${(kc.levels || []).join(' · ')}»`); return kc; }
  let cands = courses.filter((c) => sameSubject(pkg.subject || pkg.title, c.title));
  if (g && cands.length > 1) { const byG = cands.filter((c) => gradeOf(c) === g); if (byG.length) cands = byG; }
  // بطاقة لصف آخر لا تُختار وحدها أبدًا (تحضير التاسع لا يدخل مقرر العاشر)
  if (g) cands = cands.filter((c) => !gradeOf(c) || gradeOf(c) === g);
  // لا تطابق بالاسم: الأقرب لفظًا إن كان قريبًا بوضوح (مثل «دراسات اجتماعية» و«الدراسات الاجتماعية»)
  if (!cands.length) {
    const scored = courses.filter((c) => !g || !gradeOf(c) || gradeOf(c) === g).map((c) => ({ c, v: titleSim(pkg.subject || pkg.title, c.title) })).filter((x) => x.v >= 0.6).sort((x, y) => y.v - x.v);
    if (scored.length === 1 || (scored.length > 1 && scored[0].v - scored[1].v >= 0.25)) { cands = [scored[0].c]; logLine('info', `البطاقة الأقرب لاسم المادة: «${scored[0].c.title}»`); }
    else if (scored.length) cands = scored.map((x) => x.c);
  }
  if (cands.length === 1) { logLine('info', `بطاقة المادة: «${cands[0].title} — ${(cands[0].levels || []).join(' · ')}»`); await rememberCourse(pkg.id, cands[0]).catch(() => {}); return cands[0]; }
  // بطاقتان أو أكثر للمادة نفسها والصف نفسه (شُعب): التحضير يُعمَّم على كافة الجداول، فتُستعمل الأولى دون انتظار
  if (WIZ.on && g && cands.length > 1 && cands.every((c) => gradeOf(c) === g)) {
    logLine('info', `بطاقة المادة: «${cands[0].title} — ${(cands[0].levels || []).join(' · ')}»`);
    await rememberCourse(pkg.id, cands[0]).catch(() => {});
    return cands[0];
  }
  const list = (cands.length ? cands : courses).slice(0, 6);
  // الاسم مطابق لأكثر من بطاقة (صفوف أو شُعب): نسأل، وفي التشغيل التلقائي تُختار الأولى بعد مهلة
  const auto = $('optAuto').checked && cands.length > 1;
  const a = await ask({
    kind: 'warn', head: WIZ.on ? 'اختر بطاقة هذه المادة في نور' : cands.length ? 'أكثر من بطاقة تطابق المادة — اختر' : 'لم أجد بطاقة تطابق المادة — اختر البطاقة الصحيحة',
    text: `مادتك في المكتبة: «${pkg.title}».`,
    buttons: list.map((c, i) => ({ id: 'c' + i, label: `${c.title} — ${(c.levels || []).slice(-1)[0] || ''}`, primary: i === 0 })).concat([{ id: 'stop', label: 'إيقاف', danger: true }]),
    bar: false, timeoutMs: auto ? 30000 : 0, defaultId: auto ? 'c0' : '',
  });
  if (!a || a === 'stop') return null;
  const c = list[+String(a).slice(1)];
  if (c) { logLine('info', `اخترت بطاقة: «${c.title} — ${(c.levels || []).join(' · ')}»`); await rememberCourse(pkg.id, c).catch(() => {}); }
  return c || null;
}
async function stepPrepList(course) {
  setPhase('list');
  coursePrepUrl = course.prepUrl;
  for (let i = 0; i < 6 && !stopFlag; i++) {
    if (!(await waitOnline())) return '';
    setBox('run', 'أفتح «تحضير الدروس»…', 'وأقرأ قائمة تحاضيرك المحفوظة في نور حتى لا تتكرر.');
    await nav(course.prepUrl);
    for (let j = 0; j < 4 && !stopFlag; j++) {
      const r = await exec(readPrepList);
      if (r && r.login) { if (!(await loginWait(course.prepUrl))) return ''; j = -1; continue; }
      if (r && r.addUrl) {
        // ما في نور فعلًا: كل التحاضير المحفوظة في هذا المقرر (لإكمال الناقص دون تكرار)
        noorHave = $('optNoor').checked ? await readNoorList() : null;
        listBase = noorHave && !noorHave.partial ? { n: (noorHave.titles || []).length, saved: savedThisRun.length } : { n: -1, saved: 0 };
        state = (await getPackages()).state;
        return r.addUrl;
      }
      await sleep(1500);
    }
    await backoff(i + 1, 'لم تكتمل صفحة «تحضير الدروس» — أعيد فتحها');
  }
  if (stopFlag) return '';
  throw new Error('لم أجد زر «إضافة تحضير» في صفحة «تحضير الدروس».');
}
async function readNoorList(quiet) {
  if (!quiet) setBox('run', 'أقرأ قائمة تحاضيرك في نور…', 'لأعرف الموجود منها فلا يتكرر، وأكمل الناقص فقط.');
  let titles = null, total = -1, byRow = [];
  for (let i = 0; i < 3 && !stopFlag && !titles; i++) {
    if (i) await sleep(2500);
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readAllPrepTitles });
      const v = r && r[0] && r[0].result;
      if (v && v.ok && (v.titles.length || v.total === 0)) { titles = v.titles; total = v.total; byRow = v.byRow || []; const ds = (v.dates || []).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)); noorDates = new Set(ds); noorDateN = new Map(); ds.forEach((d) => noorDateN.set(d, (noorDateN.get(d) || 0) + 1)); }
    } catch (e) {}
  }
  if (!titles) {
    // الجدول لم يُقرأ كاملًا: نكتفي بالصفحة المعروضة وننبّه
    await sleep(1500);
    const v = await exec(readVisiblePrepTitles);
    if (!v || (!v.rows.length && !v.empty)) { if (!quiet) logLine('bad', 'تعذّرت قراءة قائمة التحاضير في نور — سأعتمد سجل «حاضر» لمعرفة المنجز'); return null; }
    titles = v.rows;
    if (!quiet) logLine('info', `قرأت الصفحة المعروضة فقط من قائمة التحاضير (${toAr(titles.length)}) — ${v.info}`);
    total = -2;   // جزئية
  } else if (!quiet) logLine('info', `قائمة التحاضير في نور: ${toAr(titles.length)} تحضيرًا${total > titles.length ? ` (من ${toAr(total)} — لم تُقرأ كلها)` : ''}.`);
  // العنوان الموحّد للدرس ← أرقام حصصه الموجودة («X» = الأولى، «X (2)» = الثانية؛ والمكرر بلا رقم يُحسب حصة تالية)
  const have = new Map();
  titles.forEach((t) => {
    const k = kwNorm(stripSessionSuffix(t));
    if (!k) return;
    const list = have.get(k) || [];
    (sessionNums(t) || [1]).forEach((n0) => { let n = n0; while (list.includes(n)) n++; list.push(n); });
    have.set(k, list);
  });
  have.partial = total === -2 || total > titles.length;   // لا يُبنى عليها تحقق نهائي
  have.titles = titles;
  have.dates = byRow.length === titles.length ? byRow : [];   // تاريخ نشر كل صف (لتمييز الاسم المكرر في أكثر من وحدة)
  return have;
}
async function waitForm(ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !stopFlag) {
    const c = await pageContext(tabId).catch(() => ({ isForm: false }));
    if (c.isForm && c.ready) return c;
    if (!c.isForm) { const al = await pageAlerts(tabId).catch(() => null); if (al && al.login) return { login: true }; }
    await sleep(700);
  }
  return null;
}
// فتح نموذج جديد: يعيد المحاولة وحده بانتظار متدرّج (بطء نور أو انقطاع)، دون سؤالك
// جسّ جدول المعلم قبل التعبئة: يومٌ من كل يوم أسبوع في أسبوع البداية يُكتب تاريخه في النموذج وتُقرأ حصصه كما يعرضها نور —
// فتُعرف من البداية الأيام التي لا حصة فيها (تُتخطّى) وعدد حصص الشعبة في كل يوم (تحضير لكل حصة)، وتُرتَّب الخطة عليها قبل أول حصة
async function probeSchedule(addUrl) {
  try { return await probeSchedule0(addUrl); } finally { schedRead = true; }
}
async function probeSchedule0(addUrl) {
  if (!useFile || WIZ.pickDates || !queue.length || stopFlag) return;
  const today = todayIso();
  const ws = weekStart(queue[0].date > today ? queue[0].date : today);
  const hol = holidaySet(settings);
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(ws, i)).filter((d) => !hol.has(d));
  if (!dates.length) return;
  setBox('run', 'أقرأ جدول حصصك من نور…');
  let res = [];
  try {
    const c = await pageContext(tabId).catch(() => ({ isForm: false }));
    if (!(c.isForm && c.ready) && !(await openForm(addUrl))) return;
    res = await probeDays(tabId, dates);
  } catch (e) { res = []; }
  const seen = [], none = [];
  for (const r of res) {
    const wd = wdOf(r.date);
    if (r.status === 'ok') { classOk.add(wd); caps[wd] = Math.max(1, Math.min(6, r.cap || 1)); seen.push(`${DAY_NAMES[wd]}: ${countWord(caps[wd])}`); }
    else if (r.status === 'none') none.push(wd);
  }
  if (seen.length && none.length) {
    const keep = days.filter((d) => !none.includes(d));
    if (keep.length) days = keep;
  } else if (!seen.length && none.length >= 5) { WIZ.allowSection = true; none.forEach((wd) => WIZ.noPeriodDays.add(wd)); }   // لا جدول للمعلم في نور: يُنشر للشعبة
  if (!seen.length && !none.length) return;
  renderDays();
  if (seen.length) logLine('info', `جدول حصصك في نور (أسبوع ${dayLabel(ws, false)}): ${seen.join(' · ')}${none.length ? ` — ولا حصة لك يوم ${none.map((wd) => DAY_NAMES[wd]).join(' و')}` : ''}`);
  try { const { state: st } = await getPackages(); st.pkgCaps = Object.assign({}, st.pkgCaps || {}, { [pkg.id]: Object.assign({}, caps) }); await savePkgState(st); state = st; } catch (e) {}
  schedRead = true;
  assignDates(); renderPlan();
}
async function openForm(addUrl) {
  for (let i = 0; i < 4 && !stopFlag; i++) {
    if (!(await waitOnline())) return null;
    await nav(addUrl);
    const c = await waitForm();
    if (c && c.login) { if (!(await loginWait(''))) return null; i--; continue; }
    if (c) return c;
    await backoff(i + 1, 'نموذج «إضافة تحضير» لم يكتمل — أعيد فتحه');
  }
  return null;
}

// رقم الفصل الدراسي من اسم عقدته بعد توحيد الهمزات والأرقام («الأول/الآول/فصل ١»…)، وإلا ترتيبه في الشجرة
function termNumbers(terms) {
  const no = (t) => {
    const s = kwNorm(String(t || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (/الاول|(^| )اول( |$)|first|(^|[^\d])1(?!\d)/.test(s)) return 1;
    if (/الثاني|(^| )ثاني( |$)|second|(^|[^\d])2(?!\d)/.test(s)) return 2;
    return null;
  };
  const nos = terms.map(no);
  const ok = nos.length && nos.every((n) => n != null) && new Set(nos).size === nos.length;
  // الترتيب وحده لا يُعتمد إلا إذا كان في الشجرة فصلان بالضبط؛ غير ذلك قد يضع محتوى فصل في فصل آخر
  if (!ok && terms.length !== 2) return terms.map((t, i) => ({ text: t, no: nos[i] != null && nos.filter((n) => n === nos[i]).length === 1 ? nos[i] : null }));
  return terms.map((t, i) => ({ text: t, no: ok ? nos[i] : i + 1 }));
}
async function stepTree(addUrl) {
  setPhase('tree');
  setBox('run', `أقرأ دروس الفصل ${termName(termNo)} من شجرة نور…`, 'تُفتح وحدات هذا الفصل وحده، واحدةً بعد أخرى.');
  let t = { tree: false, terms: [] }, term = null, lessons = [];
  // الشجرة قد تتأخر أو تأتي ناقصة: نعيد المحاولة، ثم نعيد فتح النموذج، قبل أن نعلن الفشل
  for (let round = 0; round < 3 && !stopFlag; round++) {
    if (round) { await backoff(round, 'شجرة الدروس لم تكتمل — أعيد فتح النموذج وقراءتها'); if (addUrl) await openForm(addUrl); }
    t = await noorTerms(tabId).catch(() => ({ tree: false, terms: [] }));
    for (let i = 0; i < 3 && t.tree && !t.terms.length && !stopFlag; i++) { await sleep(2500); t = await noorTerms(tabId).catch(() => t); }
    if (!t.tree || !t.terms.length) continue;
    term = termNumbers(t.terms).find((x) => x.no === termNo);
    if (!term) break;
    for (let i = 0; i < 3 && !lessons.length && !stopFlag; i++) {
      if (i) await sleep(3000);
      lessons = await termAllLessons(tabId, term.text).catch(() => []);
    }
    if (lessons.length) break;
  }
  if (stopFlag) throw new Error('stop');
  if (!t.tree) throw new Error('لم أجد شجرة الدروس في نموذج «إضافة تحضير».');
  if (!t.terms.length) throw new Error('لم تظهر الفصول الدراسية في شجرة نور — افتح «الكتاب» في الشجرة بنفسك ثم اضغط «ابدأ».');
  if (!term) throw new Error(`لم أجد الفصل ${termName(termNo)} في الشجرة (الموجود: ${t.terms.join('، ')}).`);
  // الشجرة المحفوظة لهذا المقرر: تكشف القراءة الناقصة (بطء نور) وتغيّر الشجرة (دروس أُضيفت أو حُذفت أو تغيّر اسمها)
  let stored = await loadNoorTree(courseCid, termNo).catch(() => null);
  // لا شجرة محفوظة على هذا الجهاز والقراءة فارغة أو أقل من المعتاد: نأخذ شجرة المادة نفسها التي حفظها الموقع من قراءات المعلمين
  treeFromServer = false; let usedStored = false;
  if (!stored && pkg.remote && !stopFlag) {
    const sv = await getNoorTree(pkg.remote.package_id || pkg.id, pkg.remote.term || termNo).catch(() => null);
    if (sv && sv.lessons.length && (!lessons.length || lessons.length < sv.lessons.length * 0.9)) { stored = sv; treeFromServer = true; }
  }
  if (!lessons.length && stored && stored.lessons.length && Date.now() - stored.at < 120 * 864e5) {
    lessons = stored.lessons.map((l) => ({ text: l.text, unit: l.unit, term: term.text })); usedStored = true;
    logLine('info', `لم تظهر دروس الشجرة الآن — أعتمد شجرة هذا المقرر المحفوظة (${toAr(lessons.length)} درسًا، ${dayLabel(isoOf(new Date(stored.at)), false)})`);
  }
  if (!lessons.length) throw new Error(`لم تظهر دروس تحت الفصل «${term.text}» — ربما بطء في نور. اضغط «ابدأ» مرة أخرى.`);
  if (stored && lessons.length < stored.lessons.length * 0.9 && !stopFlag) {
    await sleep(3000);
    const again = await termAllLessons(tabId, term.text).catch(() => []);
    if (again.length > lessons.length) lessons = again;
    if (lessons.length < stored.lessons.length * 0.9 && Date.now() - stored.at < 120 * 864e5) {
      logLine('info', `الشجرة جاءت ناقصة (${toAr(lessons.length)} من ${toAr(stored.lessons.length)} درسًا) — أعتمد النسخة المحفوظة الكاملة لهذا المقرر`);
      lessons = stored.lessons.map((l) => ({ text: l.text, unit: l.unit, term: term.text })); usedStored = true;
    }
  }
  if (!usedStored) treeFromServer = false;   // نور أعطت الشجرة كاملة في المحاولة الثانية
  if (!treeFromServer && (!stored || lessons.length >= stored.lessons.length * 0.9)) {
    const sv = await storeNoorTree({ cid: courseCid, termNo, termText: term.text, lessons, pkgId: pkg.id, title: pkg.title }).catch(() => ({}));
    if (!sv.prev && courseCid) logLine('info', `حفظت شجرة دروس هذا المقرر (الفصل ${termName(termNo)}) — تُستعمل لكشف أي تغيير لاحق فيها`);
    const d = sv.diff;
    if (d && d.changed) {
      const parts = [d.renamed.length ? `تغيّر اسم ${toAr(d.renamed.length)}: ${d.renamed.slice(0, 3).map((x) => `«${x.from.text}» ← «${x.to.text}»`).join('، ')}` : '', d.added.length ? `أُضيف ${toAr(d.added.length)}: ${d.added.slice(0, 3).map((x) => '«' + x.text + '»').join('، ')}` : '', d.removed.length ? `حُذف ${toAr(d.removed.length)}: ${d.removed.slice(0, 3).map((x) => '«' + x.text + '»').join('، ')}` : ''].filter(Boolean);
      logLine('info', `تغيّرت شجرة نور منذ آخر مرة — ${parts.join(' · ')}. الربط يتكيّف تلقائيًا؛ راجع ما يظهر في «الخطة».`);
      diag.treeDiff = { renamed: d.renamed.map((x) => [x.from.text, x.to.text]), added: d.added.map((x) => x.text), removed: d.removed.map((x) => x.text) };
    }
  }
  const units = [...new Set(lessons.map((l) => l.unit))];
  diag.tree = { term: term.text, terms: t.terms, units: units.map((u) => ({ text: u, lessons: lessons.filter((l) => l.unit === u).map((l) => l.text) })) };
  logLine('info', `شجرة نور — الفصل «${term.text}»: ${toAr(units.length)} وحدة و${toAr(lessons.length)} درسًا: ${units.map((u) => `${u} (${toAr(lessons.filter((l) => l.unit === u).length)})`).join('، ')}`);
  return lessons.map((l, i) => ({ id: 't' + i, text: l.text, unit: l.unit, unitId: l.unit, term: l.term || term.text }));
}

// ================= مطابقة دروس المكتبة بدروس الشجرة =================
// ١) اختياراتك السابقة ٢) ترقيم «الدرس n من M» ٣) الوحدة باسمها ثم برقمها في الكتاب، والدرس باسمه/رقمه داخلها
// ٤) الترتيب حين يتساوى العدد في المقطع نفسه. ما لا يمكن ربطه بأمان يُعلَّم للمراجعة (تربطه أنت من القائمة) — لا تخمين.
const pickKeyMatches = (key, text) => { const t = kwNorm(text); return key === t || (key.startsWith(t + ' ') && /^\d+$/.test(key.slice(t.length + 1))); };
const toLat = (x) => String(x || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
// اسم الوحدة دون «الوحدة N:» في أوله إن تلاه اسم إنجليزي — رقمٌ لترتيب الملف، لا رقم الوحدة في الكتاب
// («الوحدة 2: Unit 1 – Talent show» ← «Unit 1 – Talent show»). في المواد العربية يبقى كما هو («الوحدة 2: الطعام»)
const unitName = (t) => {
  const x = toLat(t).trim();
  const rest = x.replace(/^(?:ال)?وحد[ةه]\s*\d+\s*[:：\-–—]?\s*/, '');
  return rest !== x && /[a-z]/i.test(rest) ? rest.trim() : x;
};
function bookNo(t) {
  const n = unitName(t);
  const m = kwNorm(n).match(/(?:^|[^a-z])unit\s*(\d+)/);
  if (m) return +m[1];
  const u = unitNum(n);
  if (u != null) return u;
  return /[a-z]/i.test(n) && n !== toLat(t).trim() ? null : unitNum(t);
}
// أرقام الوحدة: الأرقام وكلمات الترتيب («الأول»، «الثانية عشرة»، «first») — لتمييز وحدات لا تختلف إلا بها
const ORDW = { 'الاول': 1, 'الاولي': 1, 'الحادي': 1, 'الحاديه': 1, 'الثاني': 2, 'الثانيه': 2, 'الثالث': 3, 'الثالثه': 3, 'الرابع': 4, 'الرابعه': 4, 'الخامس': 5, 'الخامسه': 5,
  'السادس': 6, 'السادسه': 6, 'السابع': 7, 'السابعه': 7, 'الثامن': 8, 'الثامنه': 8, 'التاسع': 9, 'التاسعه': 9, 'العاشر': 10, 'العاشره': 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const digitsOf = (t) => {
  const k = kwNorm(unitName(t)), ws = k.split(' ');
  const out = new Set((k.match(/\d+/g) || []).map(Number));
  ws.forEach((w, i) => { if (ORDW[w]) out.add(/^عشره?$/.test(ws[i + 1] || '') ? ORDW[w] + 10 : ORDW[w]); });
  return out;
};
const sameDigits = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
// وحدة اسمها رقمها فقط («الوحدة (1)»، «الوحدة الأولى»، «Unit 3»): رقمها هو اسمها — ﻓ«الوحدة الأولى» هي «الوحدة (1)»
const numberOnlyUnit = (t) => {
  const ws = kwNorm(unitName(t)).split(' ').filter(Boolean);
  const d = digitsOf(t);
  return d.size === 1 && ws.every((w) => /^(?:ال)?وحد[هة]$|^unit$|^\d+$|^عشره?$/.test(w) || ORDW[w]) ? [...d][0] : null;
};
// محاذاة تحفظ الترتيب (برمجة ديناميكية): أكبر مجموع تشابه بين دروس الملف ودروس نور، مع السماح بتخطي درس من أي جهة.
// زوج يُقبل فقط إن كان تشابهه ≥ ٠٫٤٥ ولا يناقض رقم الدرس. يعيد [[فهرس درس الملف، فهرس درس نور]]
function pairScore(g, node) {
  const a = lessonNum(g.lesson), b = lessonNum(node.text);
  const sim = titleSim(stripSessionSuffix(g.lesson), node.text);
  if (a != null && b != null) {
    if (a === b || swappedPair(g.lesson, node.text)) return 1.5 + sim;
    // الرقم مختلف لكن الاسم (دون الأرقام) مطابق تمامًا: الرقم هو الخطأ (يسبق مرشّحًا بالرقم وحده)؛ أو مطابق تقريبًا ومحدَّد: بدرجة أقل
    const ns = titleSim(nameOnly(g.lesson) || g.lesson, nameOnly(node.text) || node.text);
    const kg = keywords(nameOnly(g.lesson)).length, kn = keywords(nameOnly(node.text)).length;
    if (ns >= 0.95 && kg >= 2 && kn >= 2) return 1.4 + ns;
    return ns >= 0.8 && kg >= 3 ? ns * 0.9 : 0;
  }
  return sim;
}
function alignBySimilarity(gs, ns) {
  const n = gs.length, m = ns.length;
  if (!n || !m) return [];
  const sc = gs.map((g) => ns.map((x) => { const v = pairScore(g, x); return v >= 0.45 ? v : 0; }));
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], sc[i][j] ? sc[i][j] + dp[i + 1][j + 1] : 0);
  const out = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (sc[i][j] && dp[i][j] === sc[i][j] + dp[i + 1][j + 1]) { out.push([i, j]); i++; j++; }
    else if (dp[i][j] === dp[i + 1][j]) i++; else j++;
  }
  return out;
}
// «لب» اسم الدرس للمقارنة: دون عنوان القسم («الأنشطة النحوية والصرفية:»، «التعبير:»…) ودون «الدرس الأول» وأل التعريف،
// مع إبقاء الحروف المفردة («خط الرقعة: (ط، ظ)» = «خط الرقعة: ط- ظ» لا «ف- ق»)
const SECT = /^(?:(?:ال)?انشطه (?:ال)?(?:نحويه|صرفيه|املاييه)(?: و ?(?:ال)?(?:نحويه|صرفيه|املاييه))?|(?:ال)?تعبير(?: (?:ال)?(?:شفوي|كتابي))?|(?:ال)?استماع|(?:ال)?تحدث|(?:ال)?قراءه|(?:ال)?نص (?:ال)?ادبي) /;
const ORDS = '(?:الاول|الاولي|الثاني|الثانيه|الثالث|الثالثه|الرابع|الرابعه|الخامس|الخامسه|السادس|السادسه|السابع|السابعه|الثامن|الثامنه|التاسع|التاسعه|العاشر|العاشره|\\d+)';
const coreOf = (t) => {
  let k = kwNorm(String(t || '').replace(/[،؛؟]/g, ' '));
  for (let i = 0; i < 3; i++) k = k.replace(SECT, '').replace(new RegExp(`(?:^| )(?:ال)?(?:درس|وحده) ${ORDS}(?= |$)`, 'g'), ' ').trim();
  return k.split(' ').filter(Boolean).map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w));
};
const coreKey = (t) => coreOf(t).join(' ');
// كلمات الاسم كلها مع عنوان القسم (لأسماء نور التي لا يميّزها إلا قسمها: «الأنشطة الإملائية: تطبيقات»)
const fullWords = (t) => kwNorm(String(t || '').replace(/[،؛؟]/g, ' ')).replace(new RegExp(`(?:^| )(?:ال)?(?:درس|وحده) ${ORDS}(?= |$)`, 'g'), ' ')
  .split(' ').filter(Boolean).map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w)).map((w) => (/^و.{3,}/.test(w) && !/^و[اوي]/.test(w) ? w.slice(1) : w));
// بلا ما بين القوسين («المشروع (تنظيم البيانات…)» = «المشروع»)
const coreKeyBare = (t) => coreKey(String(t || '').replace(/\([^()]*\)/g, ' '));
// كلمتان متطابقتان أو بفرق حرف واحد («Appaling» = «Appalling»)
const nearW = (a, b) => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0;
  while (i < a.length && a[i] === b[i]) i++;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(a.length, b.length) - i - j <= 1;
};
// وحدات ملفك أسماؤها أسماء دروس في نور (لا وحداته): درس نور لكل وحدة من ملفك تطابقه، أو null.
// يُعتمد إن طابقت نصف وحدات ملفك على الأقل (ثلاث فأكثر) دروسًا مختلفة في نور بالاسم ورقم الوحدة، ولم تطابق وحدات نور نفسها
function unitAsLesson(groups, nodes) {
  const us = [...new Set(groups.map((g) => g.unit || ''))].filter(Boolean);
  if (us.length < 3 || nodes.length < 3) return null;
  const nuNames = [...new Set(nodes.map((n) => n.unit || ''))];
  const words = (t) => kwNorm(String(t || '').replace(/\([^()]*\)/g, ' ')).split(' ').filter((w) => w && !/^(?:unit|lesson|theme|\d+)$/.test(w) && w.length > 2);
  const numOf = (t) => { const m = toLat(String(t || '')).match(/\bunit\s*(\d+)/i); return m ? +m[1] : null; };
  const fits = (u, x) => { const a = words(x), b = words(u); if (a.length < 1 || b.length < 1) return 0; const hit = a.filter((w) => b.some((z) => nearW(w, z))).length; return hit / a.length; };
  const out = new Map(), taken = new Set();
  let named = 0;
  us.forEach((u) => {
    // وحدة ملفك تطابق وحدة في نور: الطريقة العادية
    if (nuNames.some((x) => fits(u, x) >= 0.8)) named++;
    const nu = numOf(u);
    const c = nodes.filter((n) => !taken.has(n.id) && (nu == null || numOf(n.text) == null || numOf(n.text) === nu)).map((n) => ({ n, v: fits(u, n.text) })).filter((x) => x.v >= 0.66).sort((x, y) => y.v - x.v);
    if (c.length && (c.length === 1 || c[0].v - c[1].v >= 0.2)) { out.set(u, c[0].n); taken.add(c[0].n.id); }
  });
  if (!(out.size >= 3 && out.size * 2 >= us.length && named * 2 < us.length)) return null;
  // دروس ملفك نفسها تطابق دروس نور: الطريقة العادية (وحدات ملفك لا تقوم مقام الدروس)
  const own = groups.filter((g) => nodes.some((n) => fits(g.lesson, n.text) >= 0.8 || titleSim(stripSessionSuffix(g.lesson || ''), n.text) >= 0.85)).length;
  return own * 5 >= groups.length ? null : out;
}
const unitsOfList = (arr) => { const m = new Map(); arr.forEach((x, i) => { const k = x.unit || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return m; };
// «الدرس الأول/الثاني…» في اسم الدرس
const LNUM = /(?:ال)?درس\s+(?:رقم\s*)?(?:\d+|(?:ال)?(?:[أاإ]ول[ىي]?|ثاني[ةه]?|ثالث[ةه]?|رابع[ةه]?|خامس[ةه]?|سادس[ةه]?|سابع[ةه]?|ثامن[ةه]?|تاسع[ةه]?|عاشر[ةه]?))(?![\u0621-\u064a])\s*[:：\-–]?\s*/g;
// شجرة نور تكتب الوحدة داخل اسم الدرس تحت قسم كبير («1أ – الأعداد» » «2 المضاعفات والعوامل:2-1 المضاعفات والعوامل»):
// يُقرأ ما قبل النقطتين وحدةً وما بعدها درسًا عند الربط فقط، والربط يعود إلى درس نور نفسه
const UNIT_IN_NAME = /^\s*(\d{1,2}\s*[^\s\d:][^:]*?)\s*:\s*(\d{1,2}\s*-\s*\d{1,2}\s*\S.*)$/;
// درس واحد في ملفك قسّمه نور أجزاءً («3 - 1 الكسور الجبرية: أ تبسيط…»، «…: ب ضرب وقسمة…»، «…: ج جمع…»):
// حصصه تُوزَّع على الأجزاء بالترتيب، فلكل جزء في نور تحضيره (وتبقى الحصص كلها كما هي في ملفك)
const PART = /^(.*\S)\s*:\s*\(?([أابجده])\)?\s+(\S.*)$/;
function splitByParts(groups, nodes) {
  const fam = new Map();
  (nodes || []).forEach((n) => {
    const t = (String(n.text || '').match(UNIT_IN_NAME) || [])[2] || String(n.text || '');
    const m = t.match(PART);
    if (!m) return;
    const head = nameOnly(m[1]) || m[1], k = (n.unit || '') + '|' + kwNorm(head);
    if (!fam.has(k)) fam.set(k, { head, parts: [] });
    fam.get(k).parts.push({ n, name: (nameOnly(m[1]) || m[1]) + ': ' + m[2] + ' ' + m[3], tail: m[3] });
  });
  const fams = [...fam.values()].filter((f) => f.parts.length >= 2 && /^[أا]/.test(f.parts[0].name.slice(f.head.length + 2)));
  if (!fams.length) return groups;
  const nm = (g) => stripSessionSuffix(g.lesson || '');
  const out = [];
  groups.forEach((g) => {
    const f = fams.find((x) => titleSim(nm(g), x.head) >= 0.9);
    const ok = f && g.sessions.length >= f.parts.length
      && groups.filter((y) => titleSim(nm(y), f.head) >= 0.9).length === 1
      && !groups.some((y) => f.parts.some((pt) => titleSim(nm(y), pt.tail) >= 0.85));
    if (!ok) { out.push(g); return; }
    const m = f.parts.length, k = g.sessions.length;
    let at = 0;
    f.parts.forEach((pt, j) => {
      const len = Math.floor(k / m) + (j < k % m ? 1 : 0);
      out.push(Object.assign({}, g, { lesson: pt.name, sessions: g.sessions.slice(at, at + len) }));
      at += len;
    });
  });
  return out;
}
function alignGroups(groups, nodes, known) {
  const hits = nodes.filter((n) => UNIT_IN_NAME.test(String(n.text || '')));
  const sp1 = !(nodes.length < 3 || hits.length * 5 < nodes.length * 4);
  const split = !sp1 ? nodes : nodes.map((n) => { const m = String(n.text || '').match(UNIT_IN_NAME); return m ? Object.assign({}, n, { unit: m[1].trim(), text: m[2].trim() }) : n; });
  const byId = new Map(nodes.map((n) => [n.id, n])), sp = new Map(split.map((n) => [n.id, n]));
  const kn = !sp1 ? known : new Map([...(known || new Map())].map(([k, n]) => [k, (n && sp.get(n.id)) || n]));
  const res = alignGroups0(groups, split, kn);
  promoteSeq(res, groups, split);
  if (sp1) res.forEach((r) => { if (r.node) r.node = byId.get(r.node.id) || r.node; });
  return res;
}
// ربط بالترتيب بين درسين مربوطين بالاسم في الوحدة نفسها وبالمسافة نفسها في نور وملفك («التبخر» أول وحدته وبعده
// «لماذا يُعدّ التبخر مفيدًا؟» = «3-2 …»، فهو «3-1 حالات المادة» أول وحدته في نور): يُعدّ مؤكدًا
function promoteSeq(res, groups, nodes) {
  const ix = new Map(nodes.map((n, i) => [n.id, i]));
  const strong = (r) => r && r.node && !r.joined && (r.how === 'name' || r.how === 'ordinal' || r.how === 'pick');
  res.forEach((r, gi) => {
    if (!r.node || r.how !== 'order' || r.joined) return;
    const u = groups[gi].unit || '', nu = r.node.unit || '', ni = ix.get(r.node.id);
    if (ni == null) return;
    const sameU = (j) => j >= 0 && j < groups.length && (groups[j].unit || '') === u;
    let p = gi - 1; while (sameU(p) && !strong(res[p])) p--;
    let q = gi + 1; while (sameU(q) && !strong(res[q])) q++;
    const side = (j, edge) => {
      if (!sameU(j)) { const k = ni + edge; return j === gi + edge && (k < 0 || k >= nodes.length || (nodes[k].unit || '') !== nu) ? 'edge' : 'bad'; }
      return (res[j].node.unit || '') === nu && ix.get(res[j].node.id) - ni === j - gi ? 'ok' : 'bad';
    };
    const a = side(p, -1), b = side(q, 1);
    if (a !== 'bad' && b !== 'bad' && (a === 'ok' || b === 'ok')) r.how = 'seq';
  });
}
function alignGroups0(groups, nodes, known) {
  // ملفك يبدأ العدّ من جديد في كل قسم من الوحدة (نحوية: الدرس الأول، إملائية: الدرس الأول، تعبير: الدرس الأول) ونور يعدّ دروس الوحدة كلها:
  // رقم الدرس في هذه الوحدة لا يدل على درس نور — يُقارن بالاسم وحده
  const perSect = new Set();
  unitsOfList(groups).forEach((gis, u) => {
    const seen = new Map();
    gis.forEach((gi) => { const n = lessonNum(groups[gi].lesson); if (n == null) return; const k = coreKey(groups[gi].lesson); if (seen.has(n) && seen.get(n) !== k) perSect.add(u); seen.set(n, k); });
  });
  if (perSect.size) groups = groups.map((g) => { if (!perSect.has(g.unit || '')) return g; const t = String(g.lesson || '').replace(LNUM, ' ').replace(/\s+/g, ' ').replace(/^[\s:：\-–]+|[\s:：\-–]+$/g, '').replace(/:\s*:/g, ':'); return t ? { ...g, lesson: t } : g; });
  const res = groups.map(() => ({ node: null, how: '', why: '' }));
  const used = new Set();
  const put = (gi, node, how) => { res[gi] = { node, how, why: '' }; used.add(node.id); };
  // وحدات ملفك هي دروس نور (الإنجليزي ١٢: نور «Theme1 » Unit 1: A Fair Exchange» وملفك «Unit 1: A Fair Exchange (Reading)» وحصصها
  // بأسماء أنشطتها): كل حصص وحدة ملفك لدرس نور الذي يحمل اسمها، وما لا درس له في نور («Across Cultures…») إلى درس نور الذي قبله
  const byUnit = unitAsLesson(groups, nodes);
  if (byUnit) {
    groups.forEach((g, gi) => { const n = byUnit.get(g.unit || ''); if (n) { res[gi] = { node: n, how: 'name', why: '', shared: true }; used.add(n.id); } });
    groups.forEach((g, gi) => {
      if (res[gi].node) return;
      let h = gi - 1; while (h >= 0 && (!res[h].node || res[h].joined)) h--;
      if (h < 0) { h = gi + 1; while (h < groups.length && (!res[h].node || res[h].joined)) h++; }
      if (h >= 0 && h < groups.length && res[h].node) res[gi] = { node: res[h].node, how: 'name', why: '', shared: true, joined: true };
      else res[gi].why = 'لا يقابله درس في نور';
    });
    res.unitsByName = byUnit.size; res.unitsNamed = byUnit.size;
    return res;
  }
  const fail = (gi, why) => { if (!res[gi].node) res[gi].why = why; };
  const ords = groups.map((g) => ordinalOf({ lesson: g.lesson }));
  if (ords.some(Boolean) && ords.every(Boolean)) {
    // أسماء ترتيبية: الرقم موضع الدرس بين دروس الفصل كلها
    const of = ords[0].of;
    if (ords.every((o) => o.of === of) && of === nodes.length) { groups.forEach((g, gi) => { const n = nodes[ords[gi].n - 1]; if (n && !used.has(n.id)) put(gi, n, 'ordinal'); else fail(gi, n ? 'رقمه مكرر في ملفك' : 'رقمه أكبر من عدد دروس الفصل'); }); return res; }
    if (groups.length === nodes.length) { groups.forEach((g, gi) => put(gi, nodes[gi], 'order')); return res; }
    groups.forEach((g, gi) => fail(gi, `دروس ملفك مرقّمة من ${toAr(of)} وشجرة الفصل فيها ${toAr(nodes.length)} درسًا`));
    return res;
  }
  // الربط بالترتيب لا يناقض رقم الدرس: «Lesson 10» لا يُربط بـ«Graded readers» ولا بـ«Lesson9»
  const numOk = (gi, node) => { const a = lessonNum(groups[gi].lesson); return a == null || lessonNum(node.text) === a || swappedPair(groups[gi].lesson, node.text); };
  // سبب عدم الربط: درس مكرر في ملفك، أو لا مقابل له في وحدته بنور
  const whyMiss = (gi, fullPool, a, b) => {
    const m = bestTreeLesson(fullPool, { unit: unitName(groups[gi].unit), lesson: groups[gi].lesson });
    if (m && used.has(m.node.id)) return `مكرر في ملفك — «${m.node.text}» مربوط بدرس قبله`;
    const u = fullPool[0] ? fullPool[0].unit : '';
    const c = closestTreeLesson(fullPool.filter((n) => !used.has(n.id)), { lesson: groups[gi].lesson });
    const near = c ? ` — الأقرب في نور: «${c.node.text}» (تشابه ${toAr(Math.round(c.sim * 100))}٪${c.sim >= 0.9 ? '، الاسم مطابق لكن رقم الدرس مختلف' : c.sim >= 0.34 ? '، التشابه غير كافٍ للجزم' : ''}) — اختره من القائمة إن كان هو` : '';
    if (!b) return (u ? `لا يقابله درس في «${u}» بنور` : 'لا دروس متاحة له في الشجرة') + near;
    if (a === b) return (b === 1 ? 'بقي في نور درس واحد بلا تحضير لكن اسمه لا يشبهه' : `بقي في نور ${toAr(b)} دروس بلا تحضير لكن أسماءها لا تشبهه`) + near;
    return `عدد الدروس هنا لا يتساوى (${toAr(a)} في ملفك و${toAr(b)} في نور)` + near;
  };
  // اسم الدرس يكاد يطابق درس نور، ولا يشبهه بهذه القوة درس آخر في الشجرة كلها ولا درس آخر في ملفك: ربط بالاسم مهما كانت طريقة ربط الوحدة
  const strong = (a, b) => titleSim(nameOnly(a) || a, nameOnly(b) || b) >= 0.85;
  // رقم الدرس نفسه لكن الاسمين مختلفان تمامًا («الأنشطة الإملائية: الدرس الأول: الحروف التي تُكتب ولا تُنطق» و«الدرس الأول: الممنوع من الصرف 1»):
  // ملفك يبدأ العدّ من جديد في كل قسم ونور يعدّ دروس الوحدة كلها — لا يُربط بالرقم، فلا تذهب حصة إلى درس غير درسها
  const clash = (gi, node) => {
    const g = groups[gi], a = lessonNum(g.lesson), b = lessonNum(node.text);
    if (a == null || b == null || !(a === b || swappedPair(g.lesson, node.text))) return false;
    const x = nameOnly(stripSessionSuffix(g.lesson)) || '', y = nameOnly(node.text) || '';
    return keywords(x).length >= 2 && keywords(y).length >= 1 && titleSim(x, y) < 0.2 && !coreOf(node.text).some((w) => coreOf(g.lesson).includes(w));
  };
  // بلا رقم يجمعهما: الاسم وحده يجب أن يشبه (لا يكفي تشابه اسم الوحدة)
  const thin = (gi, node) => lessonNum(groups[gi].lesson) == null && titleSim(stripSessionSuffix(groups[gi].lesson), node.text) < 0.34
    && !coreOf(node.text).some((w) => w.length > 2 && coreOf(groups[gi].lesson).includes(w));
  // اسمان حقيقيان لا يشتركان في شيء: لا يُربطان بالترتيب
  const differ = (gi, node) => {
    const x = nameOnly(stripSessionSuffix(groups[gi].lesson)) || '', y = nameOnly(node.text) || '';
    return keywords(x).length >= 2 && keywords(y).length >= 1 && titleSim(x, y) < 0.2 && !coreOf(node.text).some((w) => w.length > 2 && coreOf(groups[gi].lesson).includes(w));
  };
  const sureName = (gi, node) => {
    const nm = stripSessionSuffix(groups[gi].lesson || '');
    return strong(nm, node.text) && nodes.filter((n) => strong(nm, n.text)).length === 1 && groups.filter((g) => strong(stripSessionSuffix(g.lesson || ''), node.text)).length === 1;
  };
  function alignRange(gisIn, fullPool, unitHow) {
    if (!gisIn.length) return;
    // دروس الوحدة بأرقامها إن كانت كلها مرقّمة (ترتيب ملفك قد يختلف)، وإلا بترتيب الملف
    const nums = gisIn.map((gi) => lessonNum(groups[gi].lesson));
    const gis = nums.every((x) => x != null) ? gisIn.slice().sort((x, y) => lessonNum(groups[x].lesson) - lessonNum(groups[y].lesson) || x - y) : gisIn;
    // وحدة في نور فيها درس واحد (التلاوة والحفظ: «سورتي المدثر والمزمل») ووحدتها في ملفك أكثر من درس: دروسها كلها لذلك الدرس
    if (unitHow !== 'order' && fullPool.length === 1 && gis.length > 1 && !used.has(fullPool[0].id)) {
      gis.forEach((gi) => { put(gi, fullPool[0], unitHow === 'number' ? 'number' : 'name'); res[gi].shared = true; });
      return;
    }
    const pool = fullPool.filter((n) => !used.has(n.id));
    if (!pool.length) { gis.forEach((gi) => fail(gi, whyMiss(gi, fullPool, gis.length, 0))); return; }
    // ١) المراسي — لا تعتمد على الترتيب: اختيارك السابق أولًا، ثم أقوى تطابق بالاسم لكل درس على دروس الوحدة كلها.
    //    تنازع درسين على درس واحد في نور: الأعلى درجة يأخذه والآخر يبحث عن غيره — فلا يضيع درس مطابق بسبب درس قبله
    const anc = new Map(), how = new Map(), takenIdx = new Set();
    const claim = (gi, idx, h) => { anc.set(gi, idx); how.set(gi, h); takenIdx.add(idx); };
    gis.forEach((gi) => { const kn = known.get(gi); const ki = kn ? pool.indexOf(kn) : -1; if (ki >= 0 && !takenIdx.has(ki)) claim(gi, ki, 'pick'); });
    let pending = gis.filter((gi) => !anc.has(gi));
    for (let round = 0; pending.length && round <= gis.length; round++) {
      const free = pool.filter((n, i) => !takenIdx.has(i));
      if (!free.length) break;
      const wants = [];
      pending.forEach((gi) => {
        const g = groups[gi];
        const m = bestTreeLesson(free.filter((n) => !clash(gi, n) && !thin(gi, n)), { unit: unitName(g.unit), lesson: g.lesson });
        if (m) wants.push({ gi, idx: pool.indexOf(m.node), score: m.score });
      });
      if (!wants.length) break;
      wants.sort((a, b) => b.score - a.score);
      const losers = [];
      wants.forEach((w) => { if (takenIdx.has(w.idx)) losers.push(w.gi); else claim(w.gi, w.idx, unitHow === 'number' && !sureName(w.gi, pool[w.idx]) ? 'number' : 'name'); });
      pending = losers;
    }
    anc.forEach((idx, gi) => put(gi, pool[idx], how.get(gi)));
    // ٢) ما بقي: بالترتيب بين المراسي (إن كان ترتيب ملفك كترتيب نور)، وإلا محاذاة ذكية بالتشابه مع حفظ الترتيب
    const bounds = [[-1, -1]].concat(gis.map((gi, k) => (anc.has(gi) ? [k, anc.get(gi)] : null)).filter(Boolean), [[gis.length, pool.length]]);
    const left = [];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const [k1, p1] = bounds[i], [k2, p2] = bounds[i + 1];
      const gg = gis.slice(k1 + 1, k2);
      if (!gg.length) continue;
      const nn = p2 > p1 ? pool.slice(p1 + 1, p2).filter((n) => !used.has(n.id)) : [];
      if (nn.length && gg.length === nn.length && gg.every((gi, j) => numOk(gi, nn[j]) && !differ(gi, nn[j]))) { gg.forEach((gi, j) => put(gi, nn[j], 'order')); continue; }
      const pairs = alignBySimilarity(gg.map((gi) => groups[gi]), nn).filter(([a, b]) => !clash(gg[a], nn[b]));
      pairs.forEach(([a, b]) => put(gg[a], nn[b], 'fuzzy'));
      gg.forEach((gi) => { if (!res[gi].node) left.push(gi); });
    }
    // ٣) فرصة أخيرة لما بقي: أشبه درس غير مربوط في الوحدة كلها ولو خالف الترتيب — إن كفى التشابه ولم يناقض الرقم
    if (!left.length) return;
    const free = pool.filter((n) => !used.has(n.id));
    const cand = [];
    left.forEach((gi) => free.forEach((n) => { const v = clash(gi, n) ? 0 : pairScore(groups[gi], n); if (v >= 0.45) cand.push({ gi, n, v }); }));
    cand.sort((a, b) => b.v - a.v).forEach((c) => { if (!res[c.gi].node && !used.has(c.n.id)) put(c.gi, c.n, 'near'); });
    left.forEach((gi) => fail(gi, whyMiss(gi, fullPool, left.length, free.length)));
  }
  const unitsOf = (arr, key) => { const m = new Map(); arr.forEach((x, i) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return m; };
  const gUnits = unitsOf(groups, (g) => g.unit || '');
  if (gUnits.size === 1 && gUnits.has('')) { alignRange(groups.map((_, i) => i), nodes, 'name'); return res; }
  const tList = [...unitsOf(nodes, (n) => n.unit || '').entries()].map(([k, idx]) => ({ k, idx, text: k, no: bookNo(k) }));
  const taken = new Set(), leftovers = [], pairs = [];
  let byName = 0, named = 0;
  [...gUnits.entries()].forEach(([gu, gis], ui) => {
    let t = null, how = 'name';
    // الوحدة التي فيها اختيارك السابق لأحد دروسها
    const kt = gis.map((gi) => known.get(gi)).filter(Boolean).map((n) => tList.find((x) => x.idx.some((i) => nodes[i] === n))).find(Boolean);
    if (kt) { t = kt; how = 'pick'; }
    // بالاسم (دون أرقام الملف)، ثم رقم الوحدة في الكتاب للتمييز بين المتساويين (Learning Club 1 / 2)
    if (/[a-z\u0621-\u064a]{3,}/i.test(unitName(gu).replace(/\b(?:unit|lesson)\b/gi, ''))) named++;
    // الاسم نفسه حرفيًا (بعد التوحيد) — قبل أي تشابه، فوحدات لا تختلف إلا بكلمة ترتيب تُميَّز
    if (!t) { const k = kwNorm(unitName(gu)); const ex = k ? tList.filter((x) => !taken.has(x.k) && kwNorm(unitName(x.text)) === k) : []; if (ex.length === 1) { t = ex[0]; byName++; } }
    if (!t) { const no = numberOnlyUnit(gu); const ex = no == null ? [] : tList.filter((x) => !taken.has(x.k) && numberOnlyUnit(x.text) === no); if (ex.length === 1) { t = ex[0]; byName++; } }
    if (!t) {
      const sc = tList.map((x) => ({ x, v: kwScore(unitName(gu), unitName(x.text)) })).filter((y) => y.v >= 0.5).sort((p, q) => q.v - p.v);
      if (sc.length) {
        let top = sc.filter((y) => y.v === sc[0].v);
        if (top.length > 1) {
          const dg = digitsOf(gu);
          const same = top.filter((y) => sameDigits(digitsOf(y.x.text), dg));
          const byD = top.filter((y) => [...digitsOf(y.x.text)].some((d) => dg.has(d)));
          if (same.length === 1) top = same; else if (byD.length === 1) top = byD;
        }
        if (top.length === 1) { t = top[0].x; byName++; }
      }
    }
    if (!t) { const no = bookNo(gu); if (no != null) { const c = tList.filter((x) => x.no === no); if (c.length === 1) { t = c[0]; how = 'number'; } } }
    if (!t && gUnits.size === tList.length && !taken.has(tList[ui].k)) { t = tList[ui]; how = 'number'; }   // العدد نفسه من الوحدات: بالترتيب
    if (!t) { leftovers.push(...gis); return; }
    taken.add(t.k);
    pairs.push({ gis, t, how, ui });
  });
  // وحدة نور الكبيرة («الباب الأول: الأدب والنصوص») تقابل عدة وحدات في ملفك («المؤنس: الأدب والنصوص - المحور الخامس: …»):
  // كلمات اسمها كلها في اسم وحدتك، ولا تشبهها بذلك وحدة أخرى في نور
  const uWords = (t) => kwNorm(t).split(' ').filter((w) => w && !ORDW[w] && !/^(?:ال)?(?:باب|وحده|محور|جزء)$|^\d+$|^(?:اولا|ثانيا|ثالثا|رابعا|خامسا|سادسا)$/.test(w))
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w)).map((w) => (/^و.{3,}/.test(w) && !/^و[اوي]/.test(w) ? w.slice(1) : w)).map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w));
  if (leftovers.length) {
    const byU = new Map();
    leftovers.forEach((gi) => { const u = groups[gi].unit || ''; if (!byU.has(u)) byU.set(u, []); byU.get(u).push(gi); });
    const keep = [];
    byU.forEach((gis, gu) => {
      const gw = new Set(uWords(gu));
      const c = gu ? tList.filter((x) => { const w = uWords(x.text); return w.length >= 2 && w.every((y) => gw.has(y)); }) : [];
      if (c.length === 1) { pairs.push({ gis, t: c[0], how: 'name', ui: gUnits.size + pairs.length }); byName++; } else keep.push(...gis);
    });
    leftovers.length = 0; leftovers.push(...keep);
  }
  // الوحدات المؤكدة بالاسم أو باختيارك تأخذ دروسها أولًا، ثم المربوطة برقمها فقط (كعناوين فرعية في ملفك تحمل «Unit 4»)
  const rank = { pick: 0, name: 1, number: 2 };
  pairs.sort((x, y) => rank[x.how] - rank[y.how] || x.ui - y.ui).forEach((p) => alignRange(p.gis, p.t.idx.map((i) => nodes[i]), p.how));
  if (leftovers.length) alignRange(leftovers.sort((x, y) => x - y), nodes, 'order');
  // فرصة أخيرة عبر الفصل كله: درس بقي بلا رابط واسمه (دون الأرقام) مميّز ويكاد يطابق درسًا حرًّا في وحدة أخرى من نور
  // (ملفك يضعه في وحدة غير وحدته في نور) — يُقبل إن كان الشبه قويًا وبلا منافس قريب
  groups.forEach((g, gi) => {
    if (res[gi].node) return;
    const nm = nameOnly(g.lesson) || g.lesson;
    if (keywords(nm).length < 2) return;
    const sc = nodes.filter((n) => !used.has(n.id)).map((n) => ({ n, v: titleSim(nm, nameOnly(n.text) || n.text) })).sort((a, b) => b.v - a.v);
    if (sc[0] && sc[0].v >= 0.85 && (!sc[1] || sc[0].v - sc[1].v >= 0.25)) { put(gi, sc[0].n, 'name'); res[gi].cross = true; }
  });
  // لب الاسم: اسم الدرس في نور هو اسمه في ملفك بعد حذف عنوان القسم ورقم الدرس وأل («التعبير: الدرس الأول: كتابة النص العلمي»
  // = «الدرس الرابع: كتابة نص علمي»)، أو كل كلمات اسم نور داخل اسم ملفك — في وحدة نور المقابلة أولًا، ثم في الشجرة كلها، ويُقبل إن انفرد
  const unitOfG = new Map();
  pairs.forEach((p) => p.gis.forEach((gi) => unitOfG.set(gi, p.t.idx.map((i) => nodes[i]))));
  const coreN = new Map(nodes.map((n) => [n.id, coreKey(n.text)]));
  const coreTry = (gi, test) => {
    for (const pool of [unitOfG.get(gi), nodes]) {
      if (!pool) continue;
      const c = pool.filter((n) => !used.has(n.id) && test(n));
      if (c.length === 1) return c[0];
      if (c.length > 1) return null;
    }
    return null;
  };
  for (const exact of [true, false]) {
    groups.forEach((g, gi) => {
      if (res[gi].node) return;
      const ks = [coreKey(g.lesson), coreKeyBare(g.lesson)].filter(Boolean);
      const gw = new Set(coreOf(g.lesson));
      const n = exact
        ? coreTry(gi, (x) => ks.includes(coreN.get(x.id)))
        : coreTry(gi, (x) => { const w = coreN.get(x.id).split(' ').filter(Boolean); return w.length >= 2 && w.every((y) => gw.has(y)); });
      if (n) put(gi, n, 'name');
    });
  }
  // أسماء متكررة في نور («الأنشطة الإملائية: تطبيقات» ثلاث مرات): كل كلمات اسم نور في اسم ملفك — بالترتيب، الأول في ملفك للأول في الشجرة
  const fw = new Map(nodes.map((n) => [n.id, fullWords(n.text)]));
  const holds = (g, n) => { const w = fw.get(n.id), gw = new Set(fullWords(g.lesson)); return w.length >= 2 && w.every((y) => gw.has(y)); };
  // ثم بفرق حرف واحد في الكلمة («إملاء اختباري» = «إملاء اختياري»، «النشطة» = «الأنشطة»)
  const near = (a, b) => {
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0;
    while (i < a.length && a[i] === b[i]) i++;
    while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
    return Math.max(a.length, b.length) - i - j <= 1;
  };
  const nearHolds = (g, n) => { const w = fw.get(n.id), gw = fullWords(g.lesson); return w.length >= 2 && w.every((y) => gw.some((z) => near(y, z))); };
  for (const test of [holds, nearHolds]) {
    groups.forEach((g, gi) => {
      if (res[gi].node) return;
      const n = nodes.find((x) => !used.has(x.id) && test(g, x));
      if (n) put(gi, n, 'name');
    });
  }
  // الكلمات المميزة بعد حذف الشائع في الشجرة («الأنشطة النحوية»، «تمارين تطبيقية»): «شبه الجملة (تمارين تطبيقية)» =
  // «تمارين تطبيقية في شبه الجملة» — إن احتوت كلمات أحدهما كلمات الآخر، ولم يشبه أحدهما غير الآخر بين ما بقي بلا ربط
  const df = new Map();
  nodes.forEach((n) => new Set(fullWords(n.text)).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const GEN = /^(?:تمارين|تطبيقيه|تطبيقات|تطبيقيه|تدريبات|انشطه|نشاط|على|في|من|الى|عن|مع|lesson|unit|review)$/;
  const rare = (t) => [...new Set(fullWords(stripSessionSuffix(t || '')).filter((w) => w.length > 2 && !GEN.test(w) && !/^\d+$/.test(w) && (df.get(w) || 0) < 3))];
  const within = (a, b) => a.length > 0 && b.length > 0 && a.every((w) => b.some((z) => nearW(w, z)));
  const fitsR = (a, b) => within(a, b) || within(b, a);
  const freeG = groups.map((g, gi) => gi).filter((gi) => !res[gi].node);
  const rg = new Map(freeG.map((gi) => [gi, rare(groups[gi].lesson)]));
  freeG.forEach((gi) => {
    if (res[gi].node) return;
    const a = rg.get(gi);
    const c = nodes.filter((n) => !used.has(n.id) && fitsR(a, rare(n.text)));
    if (c.length !== 1) return;
    const b = rare(c[0].text);
    if (freeG.filter((x) => !res[x].node && fitsR(rg.get(x), b)).length !== 1) return;
    put(gi, c[0], 'name');
  });
  // درس في ملفك لا مقابل له في نور، ووحدته في نور دروسها كلها مربوطة (أو لا وحدة له فيها): حصصه تُضم إلى درس نور
  // لدرس من ملفك في موضوعه نفسه («الحروف التي تُكتب ولا تُنطق» إلى «إملاء اختباري (الحروف التي تُكتب ولا تُنطق)»)،
  // وإن كان مراجعة أو مشروعًا أو تدريبات أو قراءة حرة فإلى الدرس الذي قبله (أو الذي بعده إن كان أولها) — فلا تضيع حصة من خطة المعلم
  const EXTRA = /مراجع|مشروع|تدريب|تطبيقات|قراءه (?:ال)?حره|review|revision|consolidation|practice|project|end of (?:semester|term|unit)/i;
  const INTRO = /(?:^| )(?:ال)?تمهيد|^(?:ال)?مقدمه$|introduction|warm.?up/i;
  const tie = (a, b) => { const y = new Set(coreOf(groups[a].lesson)); return coreOf(groups[b].lesson).filter((w) => w.length > 2 && !/^(?:unit|lesson|\d+)$/.test(w) && y.has(w)).length; };
  if (!(named >= 2 && byName / named < 0.5)) {
    groups.forEach((g, gi) => {
      if (res[gi].node || nodes.some((x) => !used.has(x.id) && holds(g, x))) return;
      const un = unitOfG.get(gi);
      if (un && un.some((n) => !used.has(n.id))) return;
      const linked = groups.map((x, i) => i).filter((i) => i !== gi && res[i].node && !res[i].joined && (!un || un.includes(res[i].node)));
      const same = linked.filter((i) => groups[i].unit === g.unit);
      const mates = !un || same.length ? (un ? same : linked) : linked;
      let host = null;
      const before = mates.filter((i) => i < gi).pop(), after = mates.find((i) => i > gi);
      // تمهيد أو مقدمة: إلى الدرس الذي بعده
      if (INTRO.test(kwNorm(g.lesson))) host = after != null ? after : before;
      else if (EXTRA.test(kwNorm(g.lesson))) host = before != null ? before : after;
      else { const tops = mates.map((i) => ({ i, t: tie(gi, i) })).filter((x) => x.t >= 2).sort((x, y) => y.t - x.t || Math.abs(x.i - gi) - Math.abs(y.i - gi)); if (tops.length) host = tops[0].i; }
      // وحدة نور أقل دروسًا من وحدتك («7 - 1 رسم المستقيمات» يجمع «ميل المستقيمات» و«إيجاد معادلة المستقيم»…): إلى درس نور
      // الذي يسبقه في الوحدة نفسها (أو الذي يليه إن كان أولها)
      if (host == null && un && same.length && un.length < groups.filter((x) => x.unit === g.unit).length) {
        // وفي الفرع نفسه فقط («الأنشطة النحوية: …» لا تُضم إلى «النص الشعري: …»)
        const br = (t) => { const m = String(t || '').match(/^\s*([^:]{2,30}?)\s*:/); return m && !/^(?:ال)?درس\b/.test(kwNorm(m[1])) ? kwNorm(m[1]) : ''; };
        const h = before != null ? before : after;
        if (h != null && br(groups[h].lesson) === br(g.lesson)) host = h;
      }
      if (host == null) return;
      res[gi] = { node: res[host].node, how: 'name', why: '', shared: true, joined: true };
      res[host].shared = true;
    });
  }
  res.unitsByName = byName; res.unitsNamed = named;
  return res;
}
async function buildPlan(nodes) {
  treeNodes = nodes;
  nodeSes = new Map(); nodeLs = new Map();
  savedBak = courseCid ? (((await chrome.storage.local.get('semesterSavedBak').catch(() => ({}))).semesterSavedBak || {})[courseCid] || {}) : {};
  noorTrust = !!noorHave && !noorHave.partial && (!(noorHave.titles || []).length || nodes.some((n) => haveOf(noorHave, n).length));
  // قائمة نور لم تُقرأ كاملة، أو عناوينها بصيغة لا تطابق دروس الشجرة: ما حُفظ في مرات سابقة
  // (قبل تصفير السجل عند الفتح) يُعدّ موجودًا، فلا يتكرر
  if (WIZ.on && courseCid && !noorTrust) semSaved = Object.assign({}, savedBak, semSaved);
  const groups = splitByParts(lessonGroups(pkg), nodes);
  // اختياراتك السابقة: عنوان درس نور ← حصة من المادة (الأحدث أولًا)
  const known = new Map(), usedNode = new Set(), stale = [];
  const picks = await getPicks().catch(() => ({}));
  // تطابق واضح: الاسم شبه مطابق والرقم لا يناقضه
  const exact = (g, t) => { const a = lessonNum(g.lesson), b = lessonNum(t); return titleSim(stripSessionSuffix(g.lesson), t) >= 0.9 && (a == null || b == null || a === b || swappedPair(g.lesson, t)); };
  Object.entries(picks).sort((x, y) => ((y[1] && y[1].at) || 0) - ((x[1] && x[1].at) || 0)).forEach(([k, v]) => {
    if (!v || v.pkgId !== pkg.id) return;
    const l = (pkg.lessons || []).find((x) => x.id === v.lessonId);
    const gi = l ? groups.findIndex((g) => g.key === groupKey(l)) : -1;
    const n = gi >= 0 ? nodes.find((x) => pickKeyMatches(k, x.text)) : null;
    if (!n || known.has(gi) || usedNode.has(n.id)) return;
    // اختيار قديم يناقض الواضح (درس نور هذا هو بالاسم درسٌ آخر في ملفك، أو لدرسك مقابل مطابق غيره): يُهمل ويُحذف حتى لا يُفسد الربط
    if (!exact(groups[gi], n.text) && (groups.some((g, j) => j !== gi && exact(g, n.text)) || nodes.some((x) => x !== n && exact(groups[gi], x.text)))) { stale.push(k); return; }
    known.set(gi, n); usedNode.add(n.id);
  });
  if (stale.length) {
    stale.forEach((k) => delete picks[k]);
    chrome.storage.local.set({ picks }).catch(() => {});
    logLine('info', `أهملتُ ${toAr(stale.length)} ${stale.length === 1 ? 'ربطًا قديمًا يخالف' : 'روابط قديمة تخالف'} أسماء الدروس في نور (من تشغيل سابق) — الربط الآن بالاسم`);
  }
  const al = alignGroups(groups, nodes, known);
  nodeSes = new Map(); nodeLs = new Map();
  al.forEach((r, i) => { if (r.node) { nodeSes.set(r.node.id, (nodeSes.get(r.node.id) || 0) + groups[i].sessions.length); nodeLs.set(r.node.id, (nodeLs.get(r.node.id) || []).concat(groups[i].sessions)); } });
  const fileIdx = new Map(pkg.lessons.map((l, i) => [l.id, i]));
  nodeLs.forEach((L) => L.sort((a, b) => (fileIdx.get(a.id) ?? 0) - (fileIdx.get(b.id) ?? 0)));
  pendingSave = await loadPending();
  // حفظ غير مؤكد من مرة سابقة: يُحذف إن مضت عليه ساعات وقائمة نور الموثوقة لا تُظهره (لم يُحفظ فعلًا)، أو إن ظهر فيها
  if (Object.keys(pendingSave).length) {
    const drop = [];
    al.forEach((r, i) => groups[i].sessions.forEach((l, k) => {
      const pd = pendingSave[l.id];
      const L = r.node ? nodeLs.get(r.node.id) : null, no = L && L.includes(l) ? L.indexOf(l) + 1 : k + 1;
      if (pd && Date.now() - (pd.at || 0) > 7 * 864e5) { drop.push(l.id); return; }
      if (!pd || !noorTrust || !r.node) return;
      const shown = haveOf(noorHave, r.node).includes(no);
      if (shown || Date.now() - (pd.at || 0) > 3 * 3600e3) drop.push(l.id);
    }));
    if (drop.length) await setPending((m) => drop.forEach((id) => delete m[id]));
  }
  al.forEach((r, i) => { if (r.cross && r.node) logLine('info', `«${groups[i].lesson}» وجدته في وحدة أخرى بنور: «${r.node.unit}» — رُبط بالاسم`); });
  const ov = dateOverrides(state, pkg.id);
  forgotten.clear();
  plan = groups.map((group, i) => {
    const { node, how, why, shared } = al[i];
    const p = { i, group, node, how, shared: !!shared, miss: !node, why, sessions: group.sessions.map((l) => (WIZ.pickDates
      // «أختار الدروس بنفسي»: الحصص التي اختارها المعلم فقط، بالتاريخ الذي كتبه لكل حصة
      ? { lesson: l, on: false, inNoor: false, date: '', st: null, cur: false, fixed: WIZ.pickDates[l.id] || '', manualDate: !!WIZ.pickDates[l.id], manual: !!WIZ.pickDates[l.id] }
      : { lesson: l, on: false, inNoor: false, date: '', st: null, cur: false, fixed: isIso(ov[l.id]) ? ov[l.id] : '', manualDate: isIso(ov[l.id]) })) };
    presence(p);
    return p;
  });
  if (forgotten.size) {
    const ids = [...forgotten];
    await semStore((m) => ids.forEach((id) => delete m[id]));
    for (const id of ids) await clearSession(pkg.id, id).catch(() => {});
    state = (await getPackages()).state;
    logLine('info', `${toAr(ids.length)} ${ids.length === 1 ? 'حصة لم تعد في نور — ستُعبّأ من جديد' : 'حصص لم تعد في نور — ستُعبّأ من جديد'}`);
  }
  // دروس في شجرة نور لم يُربط بها أي درس من ملفك (لن تُعبّأ) — للعلم
  const usedNodes = new Set(plan.filter((p) => p.node).map((p) => p.node.id));
  const orphans = nodes.filter((n) => !usedNodes.has(n.id));
  const cp0 = completion();
  if (orphans.length && orphans.length < nodes.length && !cp0.complete) logLine('info', `${toAr(orphans.length)} ${orphans.length === 1 ? 'درس في شجرة نور ليس له' : 'دروس في شجرة نور ليس لها'} تحضير في ملفك: ${orphans.slice(0, 5).map((n) => '«' + n.text + '»').join('، ')}${orphans.length > 5 ? '…' : ''} — اربطها يدويًا من «الخطة» إن كانت لدروس ملفك بأسماء مختلفة`);
  diag.orphans = orphans.map((n) => n.text);
  // شجرة المادة في نور مع ما رُبط بكل درس — إلى لوحة المدير (في الخلفية، بصمت)
  if (pkg.remote && nodes.length && !treeFromServer) {
    const bound = new Map();
    plan.forEach((p) => { if (p.node) { const b = bound.get(p.node.id) || { f: [], n: 0 }; b.f.push(p.group.lesson); b.n += p.group.sessions.length; bound.set(p.node.id, b); } });
    sendNoorTree({ package_id: pkg.remote.package_id || pkg.id, term: pkg.remote.term || termNo, term_text: nodes[0].term || '', lessons: nodes.map((n) => { const b = bound.get(n.id); return { u: n.unit || '', t: n.text, f: b ? b.f.join(' ؛ ') : '', n: b ? b.n : 0 }; }) });
  }
  // أسماء وحدات ملفك لا تشبه وحدات هذا المقرر: غالبًا المادة لصف أو كتاب آخر
  plan.mismatch = al.unitsNamed >= 2 && al.unitsByName / al.unitsNamed < 0.5;
  diag.plan = plan.map((p) => ({ unit: p.group.unit, lesson: p.group.lesson, sessions: p.sessions.length, node: p.node ? p.node.text : null, how: p.how || '', why: p.why || '', inNoor: p.sessions.filter((s) => s.inNoor).length }));
  const c = conflicts();
  if (plan.mismatch) logLine('bad', `أسماء وحدات ملفك لا تشبه وحدات هذا المقرر في نور (طابق بالاسم ${toAr(al.unitsByName)} من ${toAr(al.unitsNamed)}) — تأكد أن الصف في المادة صحيح («${pkg.grade || ''}»)`);
  if (c.weak.length && !cp0.complete) logLine('info', `${toAr(c.weak.length)} ${c.weak.length === 1 ? 'درس رُبط' : 'دروس رُبطت'} بالترتيب أو برقم الوحدة فقط — راجعها في «الخطة»`);
  c.miss.forEach((p) => logLine('skip', `— «${[p.group.unit, p.group.lesson].filter(Boolean).join(' / ')}»: ${p.why || 'لم أجده في شجرة هذا الفصل'}`));
  assignDates();
}
// الربط الذي اخترته يدويًا يُحفظ ليُستعمل في المرات القادمة (ويُلغى ما يخالفه من اختيارات قديمة لهذه المادة)
async function savePicks() {
  const r = await chrome.storage.local.get('picks').catch(() => ({}));
  const picks = r.picks || {};
  const touched = plan.filter((p) => p.edited);   // ما اخترته بنفسك فقط — الربط التلقائي بالترتيب لا يُحفظ كاختيار
  if (!touched.length) return;
  const ids = new Set(touched.flatMap((p) => p.group.sessions.map((l) => l.id)));
  const keys = new Set(touched.filter((p) => p.node).map((p) => kwNorm(p.node.text)));
  Object.keys(picks).forEach((k) => { const v = picks[k]; if (v && v.pkgId === pkg.id && (ids.has(v.lessonId) || keys.has(k))) delete picks[k]; });
  const now = Date.now();
  touched.filter((p) => p.node).forEach((p) => { picks[kwNorm(p.node.text)] = { pkgId: pkg.id, lessonId: p.group.sessions[0].id, at: now }; });
  await chrome.storage.local.set({ picks }).catch(() => {});
}

// ================= المتانة: الاتصال، الانتظار المتدرّج، المهلة =================
const WATCHDOG = globalThis.__hadirWatchdog || 4 * 60000;   // أقصى مدة لمحاولة حصة واحدة
let attemptGen = 0;
async function waitOnline() {
  if (navigator.onLine !== false) return !stopFlag;
  setBox('warn', WIZ.on ? 'أنتظر عودة الإنترنت' : 'انقطع الاتصال بالإنترنت — أنتظر عودته', WIZ.on ? 'أكمل وحدي فور عودته، من حيث وصلت.' : 'أكمل تلقائيًا فور عودة الاتصال، من حيث توقفت.');
  logLine('info', 'انقطع الاتصال — بانتظار عودته');
  while (navigator.onLine === false && !stopFlag) await sleep(3000);
  if (!stopFlag) { logLine('info', 'عاد الاتصال — أكمل'); await sleep(2000); }
  return !stopFlag;
}
// انتظار متدرّج: ٥ ثم ١٠ ثم ٢٠ ثم ٤٠ ثانية (حتى دقيقة)
async function backoff(n, why) {
  const ms = WIZ.on ? Math.min(15000, 3000 * n) : Math.min(60000, 5000 * 2 ** Math.max(0, n - 1));
  if (WIZ.on) setBox('run', 'أتابع مع نور…');
  else setBox('warn', why || 'نور بطيئة — أنتظر قليلًا ثم أعيد المحاولة', `إعادة المحاولة تلقائيًا بعد ${toAr(Math.round(ms / 1000))} ثانية…`);
  for (let t = 0; t < ms && !stopFlag; t += 500) await sleep(500);
}
function withTimeout(p, ms, fallback) { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(fallback), ms); })]).finally(() => clearTimeout(t)); }

// قائمة نور من جديد (للتحقق من حفظٍ غير مؤكد، ولجولة الإكمال والتحقق النهائي)
async function refreshNoorHave() {
  if (!coursePrepUrl || !$('optNoor').checked) return null;
  await nav(coursePrepUrl);
  await sleep(1200);
  const h = await readNoorList(true);
  if (h) noorHave = h;
  if (h && !h.partial) listBase = { n: (h.titles || []).length, saved: savedThisRun.length };
  return h && !h.partial ? h : null;
}
const noorCount = (h, p) => haveOf(h, p.node).length;
// عدّ متسامح (للتحقق النهائي فقط): نور قد يختصر العنوان الطويل أو يضيف إليه، فيُقبل الاحتواء والتشابه الشديد
const sameTitle = (a, b) => a === b || (a.length >= 15 && b.length >= 15 && (a.includes(b) || b.includes(a))) || titleSim(a, b) >= 0.92;
const noorCountLoose = (h, p) => { if (!h || !p.node) return 0; const k = kwNorm(p.node.text); let n = 0; for (const [kk, list] of h) if (sameTitle(kk, k)) n += list.length; return n; };
// هل تُظهر القائمة ما حفظناه فعلًا؟ (عناوين نور بالصيغة التي نتوقعها) — وإلا لا يُبنى عليها أي قرار إعادة،
// فلا يتكرر الفصل كله لو اختلفت صيغة العناوين
function listReliable(h) {
  if (!h) return false;
  let want = 0, seen = 0;
  // لكل درس في نور مرة واحدة (قد يقابل أكثر من درس في ملفك)
  const byNode = new Map();
  plan.forEach((p) => { if (p.savedNow && p.node) { const x = byNode.get(p.node.id) || { n: 0, p }; x.n += p.savedNow; byNode.set(p.node.id, x); } });
  byNode.forEach(({ n, p }) => { want += n; seen += Math.min(n, Math.max(0, noorCount(h, p) - p.initial)); });
  if (want) return seen / want >= 0.8;
  return plan.some((p) => p.initial > 0);   // لم نحفظ بعد: موثوقة إن طابقت تحاضير موجودة مسبقًا دروسَ الخطة
}
// هل حُفظت فعلًا؟ عدد تحاضير هذا الدرس في نور زاد عما نعرفه ← نعم. true | false | null (تعذّر التحقق)
async function verifyInNoor(item) {
  // عدد كل التحاضير قبل هذه الحصة: آخر قراءة كاملة + ما حفظناه بعدها
  const base = listBase.n >= 0 ? listBase.n + (savedThisRun.length - listBase.saved) : -1;
  const h = await refreshNoorHave();
  if (!h) return null;
  // ما يتأكد من هذه القراءة نفسها صفُّه محسوب في listBase.n، فيُحسب في «المحفوظ عند القراءة» حتى لا يُعدّ مرتين
  if (listReliable(h)) { const ok = keyCount(h, item.p) > keyWant(item.p); if (ok) listBase.saved++; return ok; }
  // أول حفظ في مقرر فارغ أو عناوين بصيغة أخرى: زيادة عدد التحاضير الكلي دليل على الحفظ؛ غير ذلك لا نحكم
  if (base >= 0 && (h.titles || []).length > base) { listBase.saved++; return true; }
  return null;
}

// ================= الحصة الواحدة =================
// اسم الدرس تغيّر في شجرة نور؟ نعيد قراءة الفصل ونجده باسمه أو برقمه داخل وحدته
async function refreshNode(item) {
  const fresh = await termAllLessons(tabId, item.node.term).catch(() => []);
  if (!fresh.length) return false;
  if (treeNodes.length && fresh.length < treeNodes.length * 0.9) return false;   // قراءة ناقصة (نور بطيء): لا نبني عليها
  const k = kwNorm(item.node.text), ln = lessonNum(item.node.text);
  // الاسم نفسه في أكثر من وحدة: لا يُقبل إلا من وحدة الدرس نفسها (حتى لا يُحفظ تحضير درس في درس آخر)
  const sameUnit = (x) => kwNorm(x.unit) === kwNorm(item.node.unit);
  const dup = treeNodes.filter((x) => kwNorm(x.text) === k).length > 1;
  const byName = fresh.filter((x) => kwNorm(x.text) === k);
  const n = byName.find(sameUnit) || (!dup && byName.length === 1 ? byName[0] : null) || (ln != null ? fresh.find((x) => sameUnit(x) && lessonNum(x.text) === ln) : null);
  if (!n) return false;
  if (n.text !== item.node.text || n.unit !== item.node.unit) {
    logLine('info', `تغيّر الدرس في شجرة نور: «${item.node.text}» ← «${n.text}»`);
    item.node.text = n.text; item.node.unit = n.unit;
  }
  return true;
}
async function selectLesson(node) {
  // الشجرة قد تتأخر بعد فتح النموذج: ننتظر الفصول، ثم نختار الدرس بنصّه (الفصل ← الوحدة ← الدرس) — محاولتان
  let r = { status: 'fail' };
  for (let a = 0; a < 2 && !stopFlag; a++) {
    if (a) await sleep(2500);
    await noorTerms(tabId).catch(() => null);
    r = await pickTreeNode(tabId, { text: node.text, unit: node.unit, term: node.term }).catch(() => ({ status: 'fail' }));
    if (r.status === 'picked') return r;
  }
  return r;
}
// تعمل النسخة الأحدث فقط: نطلب تثبيتها بهدوء، وما حُفظ يبقى ويكمل بعد التحديث من حيث وصل
async function oldVersionWait() {
  // من متجر كروم: يطلب التحديث ويعيد التشغيل وحده، دون تنزيل ولا فك
  let self = null;
  try { self = await chrome.management.getSelf(); } catch (e) {}
  if (self && self.installType !== 'development') {
    setBox('run', 'أحدّث «حاضر» إلى النسخة الجديدة…', 'لحظات وتعود «حاضر» وحدها، وموادك وما حضّرته يبقى كما هو.');
    const st = await new Promise((ok) => { try { chrome.runtime.requestUpdateCheck((s) => ok(s)); } catch (e) { ok(''); } });
    if (st === 'update_available') { await sleep(4000); chrome.runtime.reload(); return; }
  }
  for (;;) {
    const a = await ask({
      kind: 'info', head: 'نسخة جديدة من «حاضر» جاهزة',
      text: 'نزّل النسخة الجديدة من صفحة التثبيت وثبّتها مكان القديمة، ثم افتح «حاضر» وأكمل من حيث وصلت. موادك وما حضّرته يبقى كما هو.',
      buttons: [{ id: 'go', label: 'افتح صفحة التحديث', primary: true }, { id: 'stop', label: 'لاحقًا' }],
    });
    if (a !== 'go') return;
    openUrl(installUrl());
  }
}
// حساب نور باسم غير اسم المعلم المسجّل: ننتظر سماح المشرف من لوحته، ونكمل وحدنا فور موافقته
async function noorWait(blk) {
  const text = `حساب نور المفتوح باسم «${blk.noor || 'آخر'}»، واشتراكك في «حاضر» باسم «${blk.reg || '—'}».\nتواصل مع المشرف على واتساب ${waShow((wz.status || {}).whatsapp)} ليسمح بهذا الحساب، وأكمل وحدي فور موافقته.`;
  for (;;) {
    const a = await ask({
      kind: 'info', head: 'بانتظار سماح المشرف لحساب نور', text, pollMs: 20000,
      buttons: [{ id: 'wa', label: 'راسل المشرف على واتساب', primary: true }, { id: 'stop', label: 'إيقاف' }],
      poll: async () => ((await noorCheck(blk.who)).ok ? 'go' : null),
    });
    if (a === 'go') return true;
    if (a !== 'wa') return false;
    openUrl(whatsappUrl('', `السلام عليكم، أرجو السماح بحساب نور «${blk.noor || ''}» في اشتراكي في «حاضر».\nاسمي المسجّل: ${blk.reg || ''}`));
  }
}
const BAD = ['nolabel', 'notarget', 'fail', 'miss'];
// تعبئة النموذج: { ok } أو { ok:false, cls: date|fill, why }
const PAST_RE = /سابق|ماض|مضى|انقض|قديم|قبل اليوم|أقدم من|اليوم الحالي/;
async function fillOnce(item, c) {
  const s = item.s;
  setSt(s, 'run', 'تعبئة…');
  setBox('run', `أعبّئ «${shortT(s.lesson.title)}»…`, `الدرس: ${item.node.text}\nالنشر: ${dayLabel(s.date)}`);
  // ترتيب هذا التحضير بين تحاضير الدرس نفسه في اليوم نفسه (حصتان للدرس في يوم واحد) — نور ترقّم الثاني بنفسها
  const dayRank = () => 1 + savedThisRun.filter((x) => x.s !== s && x.s.date === s.date && x.s.p && s.p && x.s.p.node && s.p.node && x.s.p.node.id === s.p.node.id).length;
  const opts = () => ({ publishDate: s.date, pickLesson: false, skipFilled: false, noorTitle: c.title, dayRank: dayRank(), slotNo: s.slot || 1, slotFull: slotSeen.get(s.date) || null, allowSection: !!WIZ.allowSection,
    merge: s.merge && s.merge.length ? s.merge.map((x) => x.lesson) : null, sessionNos: s.merge && s.merge.length && s.p ? [s, ...s.merge].map(nodeNo) : null, sessionNo: nodeNo(s) });
  let rep = await fillNoor(tabId, pkg, s.lesson, opts());
  let blk = rep.find((x) => x.key === 'remote');
  if (blk && blk.remoteError === 'noor_wait') {
    if (!(await noorWait(blk))) return { ok: false, cls: 'stop', why: '' };
    setSt(s, 'run', 'تعبئة…');
    rep = await fillNoor(tabId, pkg, s.lesson, opts());
    blk = rep.find((x) => x.key === 'remote');
  }
  if (blk && blk.remoteError === 'old_version') { await oldVersionWait(); return { ok: false, cls: 'stop', why: '' }; }
  if (blk && blk.remoteError === 'trial_over') WIZ.trialOver = true;
  if (blk) return { ok: false, cls: blk.remoteError === 'network' || blk.remoteError === 'server' ? 'net' : 'fatal', why: blk.error };
  // تعارض في الجدول: التاريخ مستخدم في نور، أو لا حصة لك (لا صفوف) في ذلك اليوم ← يوم الحصة التالي تلقائيًا
  for (let tries = 0; tries < 6 && !stopFlag; tries++) {
    const pb = rep.find((x) => x.key === 'publish');
    const ts = rep.find((x) => x.key === 'timeslots');
    const usedDay = pb && pb.status !== 'ok' && /من قبل|مسبق|مستخدم|مكرر|موجود/.test(pb.error || '');
    // نور ترفض تاريخًا مضى: لا يُزحزح يومًا بعد يوم حتى اليوم (يقلب الترتيب ويهدر المحاولات) بل تُترك الحصة بهدوء
    if (pb && pb.status !== 'ok' && !usedDay && s.date < todayIso() && PAST_RE.test(pb.error || '')) return { ok: false, cls: 'past', why: 'نور: ' + pb.error };
    const noClassDay = !usedDay && ts && ts.status === 'nolabel' && (!pb || pb.status === 'ok');
    // لا حصة باقية للشعبة في ذلك اليوم (حصصه أقل مما قدّرت، أو حُجزت كلها): اليوم لا يتسع لأكثر مما أُخذ منه
    const dayFull = !usedDay && ts && ts.status === 'noslot' && (!pb || pb.status === 'ok');
    if (!usedDay && !noClassDay && !dayFull) break;
    // لا جدول حصص للمعلم في نور أصلًا (أيام الأسبوع الخمسة كلها «لا يوجد فترات زمنية» ولم تظهر حصة قط): يُنشر للشعبة بلا حصة كما تعرض نور
    if (noClassDay && ts.sectionOnly && !classOk.size && WIZ.noPeriodDays.add(wdOf(s.date)).size >= 5) {
      WIZ.allowSection = true;
      logLine('info', 'لا تظهر حصص في جدولك على نور — أنشر التحاضير للشعبة بتواريخها');
      rep = await fillNoor(tabId, pkg, s.lesson, opts());
      continue;
    }
    const old = s.date;
    if (noClassDay) learnNoClass(old);
    if (dayFull && (s.slot || 1) > 1 && capOf(old) >= (s.slot || 1)) await setCap(old, (s.slot || 1) - 1);
    shiftDate(s);
    logLine('info', `${usedDay ? 'التاريخ ' + dayLabel(old, false) + ' مستخدم في نور' : dayFull ? 'حصص يوم ' + dayLabel(old, false) + ' كلها محضّرة' : 'لا صفوف لك يوم ' + dayLabel(old, false)} — نقلت «${shortT(s.lesson.title)}» إلى ${dayLabel(s.date, false)}`);
    rep = await fillNoor(tabId, pkg, s.lesson, opts());
  }
  const pub = rep.find((x) => x.key === 'publish');
  const ts = rep.find((x) => x.key === 'timeslots');
  if (ts && ts.status === 'ok' && ts.how !== 'section') {
    classOk.add(new Date(s.date + 'T12:00').getDay());
    // جدول المعلم من نور: أول تحضير على يوم لم يُحضَّر فيه شيء يرى كل حصصه — عدد حصص الشعبة فيه يصير سعة هذا اليوم من الأسبوع
    if (ts.groups && !slotSeen.has(s.date) && (s.slot || 1) === 1 && !(takenCounts(plan.flatMap((p) => p.sessions.filter((x) => x.eligible))).get(s.date))) {
      slotSeen.set(s.date, ts.groups);
      if ((ts.cap || 1) !== capOf(s.date)) { await setCap(s.date, ts.cap || 1); assignDates(); renderPlan(); }
    }
  }
  if (pub && pub.status !== 'ok') return { ok: false, cls: 'fill', why: pub.error ? 'نور: ' + pub.error : 'لم أستطع كتابة تاريخ النشر' };
  if (ts && ts.status === 'nolabel') return { ok: false, cls: 'date', why: 'لم تظهر الصفوف في عدة أيام متتالية' };
  if (ts && ts.status === 'noslot') return { ok: false, cls: 'date', why: 'لم أجد حصة غير محضّرة في عدة أيام متتالية' };
  const bad = rep.filter((x) => BAD.includes(x.status));
  if (bad.length > 2) return { ok: false, cls: 'fill', why: 'لم تُعبَّأ بنود: ' + bad.map((x) => x.name).join('، ') };
  const pf = rep.find((x) => x.key === 'preflight');
  if (pf && pf.status !== 'ok') { const miss = (pf.missing || []).join('، '); return { ok: false, cls: /الصفوف|الحصص/.test(miss) ? 'date' : 'fill', why: 'لا يمكن الحفظ بعد — ينقص: ' + (miss || 'حقل مطلوب') }; }
  return { ok: true, warn: rep.filter((x) => x.status === 'partial' || BAD.includes(x.status)).map((x) => x.name) };
}
// الحفظ: { ok } أو { err: date|noor|disabled|nosave|net|unknown|login, msg }
async function saveNow(item, formUrl) {
  const s = item.s;
  setSt(s, 'run', 'حفظ…');
  setBox('run', `أحفظ «${shortT(s.lesson.title)}» في نور…`);
  await sleep(800);
  if (stopFlag) return { err: 'stop' };
  const nv = waitNavigation(30000);
  const c = await clickSave(tabId, 15000, () => stopFlag);
  if (c.aborted || (stopFlag && !c.clicked)) return { err: 'stop' };
  if (!c.clicked) return { err: c.disabled ? 'disabled' : 'nosave', msg: c.disabled ? 'زر «حفظ» بقي معطّلًا' : 'لم أجد زر «حفظ»' };
  item.clicked = true;
  const navigated = await nv;
  await sleep(700);
  if (/^chrome-error:/.test(await tabUrl())) return { err: 'net', msg: 'انقطع الاتصال أثناء الحفظ' };
  const al = await pageAlerts(tabId).catch(() => null);
  if (al && al.login) return { err: 'login' };
  const v = judgeSave(al, formUrl);
  if (v === 'error') { const t = al.errs.join(' | '); return { err: /مسبق|من قبل|موجود|تعارض|مكرر|نفس الحصة|نفس التاريخ|محجوز/.test(t) ? 'date' : s.date < todayIso() && PAST_RE.test(t) ? 'past' : 'noor', msg: 'نور: ' + t }; }
  if (v === 'saved' && (navigated || (al && al.oks.length))) return { ok: true };
  return { err: 'unknown', msg: 'لم يتأكد نجاح الحفظ من الصفحة' };
}
async function recordSaved(item) {
  const s = item.s;
  const tails = s.merge || [];
  item.p.savedNow += 1 + tails.length;
  savedThisRun.push(item);
  // سجل هذا المقرر: لا تُعاد هذه الحصة فيه أبدًا (حتى لو لم تظهر بعد في قائمة نور) — ولا حصص الدرس التي جُمعت معها
  [s, ...tails].forEach((x) => { semSaved[x.lesson.id] = s.date; savedIds.add(x.lesson.id); x.on = false; x.eligible = false; x.savedNow = true; x.date = s.date; });
  tails.forEach((x) => setSt(x, 'ok', `✓ مع الحصة السابقة · ${dayLabel(s.date, false)}`));
  await semStore((m) => { [s, ...tails].forEach((x) => { m[x.lesson.id] = s.date; }); });
  for (const x of tails) await markSaved(pkg.id, x.lesson.id, s.date, 'فصل كامل').catch(() => {});
  if ([s, ...tails].some((x) => pendingSave[x.lesson.id])) await setPending((m) => { [s, ...tails].forEach((x) => { delete m[x.lesson.id]; }); });
  await sleep(1200);   // قد يكون اكتشاف الحفظ في العامل الخلفي سجّلها للتو
  state = (await getPackages()).state;
  const st = sessionStatus(state, pkg.id, s.lesson.id);
  if (!(st.saved && Date.now() - st.saved < 60000)) await markSaved(pkg.id, s.lesson.id, s.date, 'فصل كامل');
  state = (await getPackages()).state;
}
// حصص ضُغط «حفظ» لها ولم يتأكد حفظها (لكل مقرر) — تبقى بعد إغلاق الأداة وتصفير السجل
async function loadPending() {
  if (!courseCid) return {};
  const r = await chrome.storage.local.get('semPending').catch(() => ({}));
  return Object.assign({}, ((r.semPending || {})[courseCid]) || {});
}
async function setPending(fn) {
  if (!courseCid) return;
  const r = await chrome.storage.local.get('semPending').catch(() => ({}));
  const all = r.semPending || {};
  all[courseCid] = all[courseCid] || {};
  fn(all[courseCid]);
  pendingSave = Object.assign({}, all[courseCid]);
  await chrome.storage.local.set({ semPending: all }).catch(() => {});
}
async function semStore(fn) {
  if (!courseCid) return;
  const r = await chrome.storage.local.get('semesterSaved').catch(() => ({}));
  const all = r.semesterSaved || {};
  all[courseCid] = all[courseCid] || {};
  fn(all[courseCid]);
  await chrome.storage.local.set({ semesterSaved: all }).catch(() => {});
}

// محاولة واحدة كاملة لحصة: نموذج جديد ← اختيار الدرس ← التعبئة ← الحفظ
async function attemptOnce(item, addUrl, gen) {
  const s = item.s;
  const stale = () => stopFlag || gen !== attemptGen;
  item.clicked = false;
  setSt(s, 'run', 'فتح نموذج «إضافة تحضير»…');
  setBox('run', 'أفتح نموذج «إضافة تحضير» جديدًا…');
  // نموذج جديد مفتوح بالفعل ولم يُعبَّأ فيه شيء (كالذي قرأنا منه الشجرة): نستعمله دون إعادة تحميل
  let c = item.reload ? null : await pageContext(tabId).catch(() => null);
  item.reload = false;
  // يُستعمل المفتوح فقط إن كان فارغًا فعلًا (بلا عنوان)، حتى لا تُكتب حصة فوق تحضير محفوظ
  if (!(c && c.isForm && c.ready && !c.mark && !String(c.title || '').trim() && /add_preparation/i.test(c.url || ''))) c = await openForm(addUrl);
  if (stale()) return { err: 'stale' };
  if (!c) return { err: 'load', msg: 'لم يكتمل تحميل نموذج «إضافة تحضير»' };
  if (c.login) return { err: 'login' };
  const formUrl = await tabUrl();
  setSt(s, 'run', 'اختيار الدرس من شجرة نور…');
  setBox('run', `أختار «${item.node.text}» من شجرة الدروس…`);
  const sel = await selectLesson(item.node);
  if (stale()) return { err: 'stale' };
  if (sel.status !== 'picked') return { err: 'pick', msg: `تعذّر اختيار «${item.node.text}» من الشجرة` };
  c = await pageContext(tabId).catch(() => c);
  const f = await fillOnce(item, c);
  if (f.ok && WIZ.trialCap != null && WIZ.fetched && !WIZ.fetched.has(s.lesson.id)) {
    WIZ.fetched.add(s.lesson.id);
    await chrome.storage.local.set({ trialFetched: [...WIZ.fetched] }).catch(() => {});
  }
  if (stale()) return { err: 'stale' };
  if (!f.ok) return { err: f.cls, msg: f.why };
  if ($('optStep').checked) {
    setSt(s, 'wait', '✎ بانتظارك: راجع ثم «احفظ وتابع»');
    const a = await ask({
      kind: 'ok', head: `✓ عُبّئت «${shortT(s.lesson.title)}» — راجعها`, text: (f.warn.length ? `راجع: ${f.warn.join('، ')}\n` : '') + 'اضغط «احفظ وتابع» وسأضغط «حفظ» وأنتقل للتالية.',
      buttons: [{ id: 'save', label: '✓ احفظ وتابع', primary: true }, { id: 'skip', label: 'تخطَّ دون حفظ' }, { id: 'stop', label: 'إيقاف', danger: true }],
    });
    if (a === 'skip') return { err: 'skip' };
    if (a !== 'save') return { err: 'stop' };
  }
  const r = await saveNow(item, formUrl);
  if (r.ok) return r;
  return stale() ? { err: 'stale' } : r;
}

// سلّم المعالجة لكل حصة — لا سؤال إلا تسجيل الدخول:
// تعارض التاريخ ← يوم الحصة التالي · بطء/انقطاع/تعليق ← انتظار متدرّج ثم نموذج جديد · تعذّر اختيار الدرس ← إعادة قراءة الشجرة
// حفظ غير مؤكد ← تحقّق من قائمة نور قبل أي إعادة (لا تكرار أبدًا) · بعد عدة محاولات ← تُؤجَّل لجولة الإكمال
// النتيجة: saved | skip | stop | { defer, why }
const markPending = (s) => setPending((m) => { [s, ...(s.merge || [])].forEach((x) => { m[x.lesson.id] = { date: s.date, at: Date.now() }; }); });
async function processItem(item, addUrl, maxTries = 4) {
  const s = item.s;
  let tries = 0, moves = 0;
  const NO_PAST = 'نور لا تقبل تاريخًا مضى';
  // عُرف في هذا التشغيل أن نور ترفض التواريخ الماضية: ما مضى تاريخه يُترك دون محاولة
  if (WIZ.noPast && s.date < todayIso()) return { skipped: true, why: NO_PAST };
  while (!stopFlag) {
    if (!(await waitOnline())) return 'stop';
    const gen = ++attemptGen;
    const r = await withTimeout(attemptOnce(item, addUrl, gen).catch((e) => ({ err: 'crash', msg: 'خطأ غير متوقع: ' + String((e && e.message) || e).slice(0, 80) })), WATCHDOG, { err: 'timeout', msg: 'تعلّقت الخطوة أكثر من المعتاد' });
    if (r.err === 'timeout') attemptGen++;   // ما بقي من المحاولة المعلّقة يتوقف عند أول خطوة
    if (r.ok) return 'saved';
    if (stopFlag || r.err === 'stop') return 'stop';
    if (r.err === 'fatal') return { fatal: r.msg };
    if (r.err === 'skip') { await markSaveFailed(pkg.id, s.lesson.id, 'unsaved'); return 'skip'; }
    if (r.err === 'past') { WIZ.noPast = true; await markSaveFailed(pkg.id, s.lesson.id, 'unsaved'); item.reload = true; return { skipped: true, why: NO_PAST }; }
    if (r.err === 'login') {
      if (!(await loginWait(addUrl))) return 'stop';
      item.reload = true;
      // انتهت الجلسة بعد الضغط على «حفظ»: هل حُفظت قبل انتهائها؟ نتحقق قبل أي إعادة
      if (item.clicked) {
        const v = await verifyInNoor(item);
        if (v === true) { logLine('info', `تحققت من قائمة نور: «${shortT(s.lesson.title)}» حُفظت قبل انتهاء الجلسة`); return 'saved'; }
        if (v === null) { await markPending(s); return { defer: true, why: 'انتهت الجلسة أثناء الحفظ ولم أستطع التأكد من قائمة نور', verifyOnly: true }; }
      }
      continue;
    }
    // ضُغط «حفظ» ولم تتأكد النتيجة: قائمة نور هي الحكم — إن ظهرت الحصة فقد حُفظت
    if (item.clicked && ['unknown', 'net', 'timeout', 'noor', 'stale', 'crash'].includes(r.err)) {
      const v = await verifyInNoor(item);
      if (v === true) { logLine('info', `تحققت من قائمة نور: «${shortT(s.lesson.title)}» حُفظت فعلًا`); return 'saved'; }
      if (v === null && r.err !== 'noor') {
        // ضُغط «حفظ» ولا نستطيع التحقق (انقطاع، تعليق، نتيجة غير واضحة): لا نعيدها أبدًا (خطر التكرار) — تؤجَّل للتحقق في جولة الإكمال.
        // («noor» وحدها رسالة خطأ صريحة من نور: لم تُحفظ، فتُعاد)
        await markPending(s);
        return { defer: true, why: 'حُفظت على الأرجح ولم أستطع التأكد من قائمة نور', verifyOnly: true };
      }
    }
    if (r.err === 'date' && moves < 10) {
      moves++;
      const old = s.date;
      shiftDate(s);
      logLine('info', `${r.msg || 'تعارض في التاريخ'} (${dayLabel(old, false)}) — أعيد «${shortT(s.lesson.title)}» بتاريخ ${dayLabel(s.date, false)}`);
      item.reload = true;
      continue;
    }
    tries++;
    if (tries >= maxTries) { await markSaveFailed(pkg.id, s.lesson.id, item.clicked ? 'error' : 'unsaved'); return { defer: true, why: r.msg || r.err }; }
    logLine('info', `محاولة ${toAr(tries)} لـ«${shortT(s.lesson.title)}» لم تنجح (${r.msg || r.err}) — أعيدها تلقائيًا`);
    item.reload = true;
    if (['load', 'net', 'timeout', 'noor', 'unknown', 'disabled', 'nosave', 'stale', 'crash'].includes(r.err)) await backoff(tries);
    else await sleep(1500);
    if (r.err === 'pick' && tries >= 2 && !stopFlag) { const c = await openForm(addUrl); if (c && !c.login) await refreshNode(item); item.reload = false; }
  }
  return 'stop';
}

// ================= التشغيل =================
let hb = null;
const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function heartbeat(on) {
  clearInterval(hb);
  const beat = () => {
    chrome.storage.session.set({ batchRun: { at: Date.now() } }).catch(() => {});
    chrome.storage.local.set({ semesterLock: { id: RUN_ID, at: Date.now() } }).catch(() => {});
  };
  if (on) { beat(); hb = setInterval(beat, 5000); }
  else { chrome.storage.session.remove('batchRun').catch(() => {}); chrome.storage.local.remove('semesterLock').catch(() => {}); }
}
// نقطة استئناف: إن أُغلقت النافذة أو تعطّل كروم يُتابَع التشغيل عند فتحها
async function checkpoint(active) {
  const sc = { kind: scope.kind, picks: [...(scope.picks || [])], units: [...scope.units], weekDay: scope.weekDay, from: scope.from, to: scope.to, dateFrom: scope.dateFrom, dateTo: scope.dateTo, dsrc: useFile ? 'file' : 'seq' };
  await chrome.storage.local.set({ semesterRun: active ? { pkgId: pkg.id, term: termNo, at: Date.now(), start: $('start').value, startTouched, scope: sc, wiz: WIZ.on ? { rid: WIZ.rid, sum: WIZ.sum, auto: WIZ.auto, rule: WIZ.rule, seq: !!WIZ.seq, pick: WIZ.pickDates || null, step: $('optStep').checked, review: $('optReview').checked } : null } : null }).catch(() => {});
}
function setRunning(on) {
  running = on;
  $('startBtn').hidden = on; $('stopBtn').hidden = !on; $('stopBtn').disabled = false;
  $('goBtn').hidden = true;
  ['pkgSel', 'start', 'optReview', 'optStep', 'optNoor', 'optAuto', 'optWeek', 'weekDay', 'fromLesson', 'toLesson', 'resetBtn', 'dateFrom', 'dateTo'].forEach((id) => { if ($(id)) $(id).disabled = on; });
  document.querySelectorAll('input[name=term], input[name=scope], input[name=dsrc], #unitChips .day').forEach((r) => { r.disabled = on; });
  if (on) $('topMsg').className = 'msg';
  heartbeat(on);
}
// انتظار «ابدأ التعبئة» — ومع autoMs يبدأ وحده بعد المهلة ما لم تعدّل شيئًا في الخطة
// سطر الخطة: «سأنشر ١٢ حصة من الأحد ٦ سبتمبر إلى …»
function planLine() {
  const ds = queue.map((q) => q.date).filter(isIso).sort();
  const when = !ds.length ? '' : ds[0] === ds[ds.length - 1] ? ` بتاريخ ${dayLabel(ds[0])}` : ` من ${dayLabel(ds[0])} إلى ${dayLabel(ds[ds.length - 1])}`;
  return `سأنشر ${countWord(queue.length).replace('حصتان', 'حصتين')}${when}`;
}
// بدء دون مراجعة رغم تعارض الربط: مع اختلاف الوحدات يُستبعد الربط الضعيف (بالترتيب/برقم الوحدة فقط) احتياطًا
function autoResolve() {
  if (plan.mismatch) {
    let dropped = 0;
    plan.forEach((p) => { if (p.node && (p.how === 'order' || p.how === 'number') && !p.edited) { p.node = null; p.miss = true; p.skipped = true; p.why = 'استُبعد: ربط بالترتيب فقط مع اختلاف الوحدات'; presence(p); dropped++; } });
    if (dropped) logLine('info', `استبعدت ${toAr(dropped)} ${dropped === 1 ? 'درسًا مربوطًا' : 'دروس مربوطة'} بالترتيب فقط لأن وحدات الملف لا تشبه وحدات نور — راجعها لاحقًا`);
  }
  const miss = plan.filter((p) => p.miss && !p.skipped).length;
  if (miss) logLine('info', `بدأت تلقائيًا: ${toAr(miss)} ${miss === 1 ? 'درس بلا مقابل' : 'دروس بلا مقابل'} في نور تُخطّيت — تظهر في النهاية`);
}
// المعالج (دون مراجعة): لا يُعبَّأ درس في درس نور غير مؤكد أنه مقابله — حتى لا يقع تحضير درس مكان درس آخر.
// الربط بالترتيب أو برقم الوحدة يبقى فقط إن وافق رقمُ الدرس أو اسمُه درسَ نور؛ ودرسا ملف على درس نور واحد يبقى أقربهما اسمًا
function safeLinks() {
  const sim = (p) => titleSim(stripSessionSuffix(p.group.lesson || ''), p.node.text);
  const drop = (p) => { p.node = null; p.miss = true; p.skipped = true; p.why = 'لم أتأكد من مقابله في نور'; presence(p); };
  let n = 0;
  plan.forEach((p) => {
    if (!p.node || p.edited) return;
    const a = lessonNum(p.group.lesson), b = lessonNum(p.node.text);
    // بالتشابه: لا يُقبل إن تناقض رقما الدرس والشبه غير قوي. وما رُبط خارج ترتيب الوحدة (أشبه درس حرّ) يحتاج شبهًا قويًا
    // أو رقمًا متفقًا («الكسور العشرية» ليست «الكسور الاعتيادية»)
    if (p.how === 'fuzzy' || p.how === 'near') {
      if (a != null && b != null && a !== b && sim(p) < 0.85) { drop(p); n++; return; }
      if (p.how === 'fuzzy' || (a != null && a === b) || sim(p) >= 0.7) return;
      drop(p); n++; return;
    }
    if (p.how !== 'order' && p.how !== 'number') return;
    if ((a != null && b != null && a === b) || sim(p) >= 0.5) return;
    drop(p); n++;
  });
  const by = new Map();
  plan.forEach((p) => { if (p.node) { const l = by.get(p.node.id) || []; l.push(p); by.set(p.node.id, l); } });
  by.forEach((l) => { if (l.length < 2 || l.every((p) => p.shared)) return; l.sort((x, y) => sim(y) - sim(x)).slice(1).forEach((p) => { drop(p); n++; }); });
  if (n) logLine('info', `${toAr(n)} ${n === 1 ? 'درس لم أتأكد من مقابله' : 'دروس لم أتأكد من مقابلها'} في نور — لم أعبّئها حتى لا يقع تحضير مكان آخر`);
}
function waitGo(autoMs, lbl) {
  return new Promise((res) => {
    let iv = null, left = Math.round((autoMs || 0) / 1000);
    const label = lbl || '✓ الخطة مناسبة — ابدأ التعبئة';
    const finish = (v) => { clearInterval(iv); $('goBtn').textContent = label; $('plan').removeEventListener('change', cancel); const i = stopHooks.indexOf(onStop); if (i >= 0) stopHooks.splice(i, 1); res(v); };
    const onStop = () => finish(false);
    const cancel = () => { clearInterval(iv); iv = null; $('goBtn').textContent = label; };
    stopHooks.push(onStop);
    $('goBtn').hidden = false;
    $('goBtn').textContent = label;
    $('goBtn').onclick = () => finish(true);
    if (autoMs) {
      $('plan').addEventListener('change', cancel);
      const tick = () => { $('goBtn').textContent = `${label} (تلقائيًا بعد ${toAr(left)} ث)`; if (left-- <= 0) finish('auto'); };
      tick(); iv = setInterval(tick, 1000);
    }
  });
}
let savedThisRun = [];
let listBase = { n: -1, saved: 0 };   // آخر قراءة كاملة لقائمة نور: عدد التحاضير وما كنا حفظناه عندها
let lastVerify = '';   // التحقق النهائي من قائمة نور: ok | loose | none | ''
// سجل التعبئة الصامت (للمشرف في لوحته): صف لكل حصة حاولها التشغيل (saved | unconfirmed | failed | skipped) وصفّا بداية ونهاية لكل تشغيل.
// لا يظهر منه شيء للمعلم ولا ينتظره أحد: الصف يُضاف فورًا ويُرسل في الخلفية كل ١٠ صفوف
let fillRid = '', fillN = 0, fillCnt = {};
const fillLogged = new Set();   // حصص هذا التشغيل التي أخذت صفها النهائي (حتى لا يتكرر عند جمع النهاية)
const flMode = () => (WIZ.on ? (wz.mode === 'pick' || wz.mode === 'term' ? wz.mode : scope.kind === 'pick' ? 'pick' : 'term') : '');
function flRow(status, item, note) {
  const s = item && item.s, n = item && item.node;
  fillLog({
    run_id: fillRid, mode: flMode(),
    package_id: pkg ? (pkg.remote ? pkg.remote.package_id : pkg.id) : '', term: pkg && pkg.remote ? pkg.remote.term : termNo,
    lesson_id: s ? s.lesson.id : '', lesson_title: s ? s.lesson.title : '', noor_lesson: n ? n.text : '', noor_unit: n ? n.unit : '',
    pub_date: s && isIso(s.date) ? s.date : null, moved_from: s && isIso(s.movedFrom) ? s.movedFrom : null,
    status, note: ((item && item.flAgain ? 'يحلّ محل الصف السابق · ' : '') + String(note || '')).slice(0, 300),   // أُعيدت بعد التحقق النهائي: صفها الجديد هو الحكم
  });
  if (s) fillLogged.add(s);
  fillCnt[status] = (fillCnt[status] || 0) + 1;
  if (++fillN % 10 === 0) flushFillLog().catch(() => {});
}
// درس من الملف بلا مقابل في نور: صف «skipped» واحد للدرس (باسمه لا باسم حصته)
const flMissRow = (p) => flRow('skipped', { s: { lesson: { id: p.sessions[0].lesson.id, title: [p.group.unit, p.group.lesson].filter(Boolean).join(' / ') || p.sessions[0].lesson.title }, date: '', movedFrom: '' }, node: null }, p.why ? `لم أجد مقابله في نور: ${p.why}` : 'لم أجد مقابله في نور');
async function run() {
  if (running) return;
  // تشغيل آخر في نافذة أخرى؟ (يمنع تعبئتين متزامنتين في نور)
  const lk = (await chrome.storage.local.get('semesterLock').catch(() => ({}))).semesterLock;
  if (lk && lk.id !== RUN_ID && Date.now() - lk.at < 15000) { msg('bad', 'يوجد تشغيل «فصل كامل» جارٍ في نافذة أخرى — أكمله أو أوقفه أولًا.'); return; }
  const r = await getPackages();
  packages = r.packages; state = r.state;
  pkg = packages.find((p) => p.id === $('pkgSel').value) || null;
  if (!pkg) { msg('bad', 'اختر مادة من مكتبتك أولًا.'); return; }
  if (!$('start').value) { msg('bad', 'حدد أول تاريخ نشر.'); return; }
  termNo = +((document.querySelector('input[name=term]:checked') || {}).value) || 1;
  // مصدر التواريخ يُقرأ من الاختيار الظاهر الآن (لا من حالة سابقة)
  useFile = hasFileDates(pkg) && ((document.querySelector('input[name=dsrc]:checked') || {}).value !== 'seq');
  if (WIZ.on && WIZ.seq) useFile = false;   // «أبدأ من تاريخ ثم متتابعًا»: لا تواريخ نشرة أبدًا، حتى عند الإكمال
  if ($('start').value && $('start').value !== startAuto) startTouched = true;
  await chrome.storage.local.set({ semesterOpts: { review: $('optReview').checked, step: $('optStep').checked, noor: $('optNoor').checked, auto: $('optAuto').checked, term: termNo, scope: scope.kind, dsrc: useFile ? 'file' : 'seq' } }).catch(() => {});
  stopFlag = false; stopHooks.length = 0;
  offRule = null; noorDates = new Set(); noorDateN = new Map(); slotSeen = new Map(); WIZ.allowSection = false; WIZ.noPeriodDays = new Set(); WIZ.trialOver = false; WIZ.noPast = false;
  if (pkg.remote && pkg.remote.trial && await reclaim()) pkg = packages.find((p) => p.id === pkg.id) || pkg;
  WIZ.trialCap = pkg.remote && pkg.remote.trial ? Math.max(0, +pkg.remote.left || 0) : null;
  // حصص تجربة جُلب محتواها ولم يكتمل حفظها: يسمح الخادم بجلبها ثانية دون احتساب، فتُكمل ولا تضيع على المعلم
  WIZ.fetched = WIZ.trialCap != null ? new Set((await chrome.storage.local.get('trialFetched').catch(() => ({}))).trialFetched || []) : new Set();
  WIZ.fetched0 = new Set(WIZ.fetched);
  if (WIZ.trialCap === 0 && !WIZ.fetched.size) { if (WIZ.on) payResume = 'run'; showPay(pkg); return; }
  plan = []; queue = []; treeNodes = []; noorHave = null; noClass = new Map(); classOk = new Set(); editable = false; courseCid = ''; coursePrepUrl = ''; semSaved = {}; savedThisRun = []; listBase = { n: -1, saved: 0 }; lastVerify = ''; dateNotes.clear();
  fillRid = String(WIZ.on && WIZ.rid ? WIZ.rid : Date.now()); fillN = 0; fillCnt = {}; fillLogged.clear();
  days = daysFor(state, settings, pkg.id);
  caps = Object.assign({}, (state.pkgCaps || {})[pkg.id] || {});
  logN = 0; diag.log = []; diag.tree = null; diag.plan = null; diag.failed = null;
  $('log').innerHTML = ''; $('logCard').hidden = true; $('prog').style.width = '0%'; renderPlan();
  setRunning(true);
  await checkpoint(true);
  let ok = 0, skipped = 0, pastSkipped = 0, total = 0, endMsg = null, finished = false, endWhy = '', flStarted = false;
  const failed = [], deferred = [];   // المؤجَّل خارج try: يأخذ صفه في سجل المشرف ولو انقطع التشغيل قبل جولة الإكمال
  try {
    // ما قبل التعبئة (الرئيسية ← البطاقة ← القائمة ← النموذج ← الشجرة): أي عطل فيه يُعاد من أوله حتى ثلاث مرات قبل التوقف
    let addUrl = '', nodes = null;
    for (let attempt = 1; attempt <= 3 && !stopFlag; attempt++) {
      try {
        const courses = await stepHome();
        if (!courses) throw new Error('stop');
        const course = await pickCourse(courses);
        if (!course) throw new Error('stop');
        courseCid = course.cid || '';
        semSaved = courseCid ? (((await chrome.storage.local.get('semesterSaved').catch(() => ({}))).semesterSaved || {})[courseCid] || {}) : {};
        Object.keys(semSaved).forEach((id) => savedIds.add(id));   // سجل هذا الفتح (يُصفَّر عند كل فتح): حُفظ فعلًا
        if (WIZ.resumed) { WIZ.sum = Math.max(WIZ.sum, Object.keys(semSaved).length); WIZ.resumed = false; }   // ما نُشر قبل الانقطاع يُحسب في السطر الختامي
        // متابعة بعد توقف: تبدأ التواريخ بعد آخر تاريخ استُعمل، ما لم تحدد أنت تاريخًا (مع تواريخ الملف لا حاجة لذلك)
        const lastUsed = [...Object.keys(usedDates(pkg, state)), ...Object.values(semSaved)].filter(Boolean).sort().pop();
        if (!startTouched && !useFile && scope.kind !== 'week' && scope.kind !== 'dates' && lastUsed && lastUsed >= $('start').value) {
          $('start').value = nextSchoolDay(lastUsed, days, false);
          renderDays();
          logLine('info', `أكمل التواريخ بعد آخر تاريخ مستعمل (${dayLabel(lastUsed, false)}): من ${dayLabel($('start').value)} — (حدد «أول تاريخ نشر» بنفسك إن أردت غير ذلك)`);
        }
        logLine('info', useFile ? `التواريخ: كما في ملف المادة (${toAr(datedCount(pkg))} حصة لها تاريخ) — وما بلا تاريخ يتبع ما قبله` : `التواريخ: متتالية من ${dayLabel($('start').value)} على أيام الحصص — تواريخ الملف متجاهَلة`);
        addUrl = await stepPrepList(course);
        if (!addUrl) throw new Error('stop');
        setPhase('form');
        setBox('run', 'أفتح نموذج «إضافة تحضير»…');
        if (!(await openForm(addUrl))) throw new Error(stopFlag ? 'stop' : 'تعذّر فتح نموذج «إضافة تحضير» بعد عدة محاولات — تأكد من الاتصال ثم اضغط «ابدأ».');
        nodes = await stepTree(addUrl);
        break;
      } catch (e) {
        const m = String((e && e.message) || e);
        if (m === 'stop' || stopFlag || attempt === 3) throw e;
        logLine('info', `تعثّرت الخطوات الأولى (${m}) — أعيدها من البداية (محاولة ${toAr(attempt + 1)} من ٣)`);
        await backoff(attempt + 1, 'أعيد المحاولة من الصفحة الرئيسية');
      }
    }
    if (stopFlag || !nodes) throw new Error('stop');
    await buildPlan(nodes);
    renderPlan();
    // المادة مكتملة في نور: لا مراجعة ولا اقتراحات — «مكتمل» فقط
    { const cp = completion(); if (cp.complete && !queue.length) { finished = true; logLine('ok', completeText(cp)); throw new Error(completeText(cp)); } }
    // تعارض بين ملفك ونور: تُعرض الخطة للمراجعة، وتبدأ وحدها بعد مهلة (أطول كلما كان التعارض أخطر) ما لم تطلب المراجعة اليدوية
    const c = conflicts();
    const nConf = c.miss.length + c.weak.length + c.dup.length;
    // المعالج: لا انتظار ولا تأكيد — سطر الخطة («سأنشر ١٢ حصة من … إلى …») يظهر والتعبئة تبدأ فورًا.
    // التعارض يُحل وحده كما في البدء التلقائي (المربوط بالاسم يُعبَّأ، وما لا مقابل له يُتخطّى ويظهر في التقرير)
    if (WIZ.on && !$('optReview').checked) {
      if (nConf || plan.mismatch) { autoResolve(); await savePicks(); }
      safeLinks(); assignDates(); renderPlan();
      if (!queue.length) { finished = true; throw new Error(plan.some((p) => p.sessions.some((s) => s.inNoor && pickedS(s))) ? 'كل الحصص المختارة موجودة في نور ✓' : 'انتهى ✓'); }
      setBox('run', planLine(), WIZ.trialCap != null ? `من تجربتك المجانية. أبدأ الآن.` : 'أبدأ الآن.');
    } else if ($('optReview').checked || nConf || plan.mismatch || !queue.length) {
      if (WIZ.on) document.body.classList.add('showplan');
      editable = true; renderPlan();
      const autoOn = $('optAuto').checked && !$('optReview').checked && queue.length;
      const auto = !autoOn ? 0 : (!nConf && !plan.mismatch ? 25000 : plan.mismatch ? 60000 : 40000);
      const parts = [plan.mismatch ? `أسماء وحدات ملفك لا تشبه وحدات هذا المقرر — تأكد أن هذه مادة «${pkg.grade || ''}» فعلًا قبل البدء.` : '',
        c.miss.length ? `${toAr(c.miss.length)} بلا مقابل في نور` : '', c.weak.length ? `${toAr(c.weak.length)} مربوطة بالترتيب أو برقم الوحدة فقط` : '', c.dup.length ? `${toAr(c.dup.length)} على درس واحد في نور` : ''].filter(Boolean);
      setBox(nConf || plan.mismatch || !queue.length ? 'warn' : 'ok', !queue.length ? (scope.kind !== 'term' ? 'لا حصص ضمن النطاق المختار — غيّر الوحدة/الأسبوع/المدى (أو تواريخ النشر) ثم «ابدأ التعبئة»' : 'لا حصص للتعبئة — كلها منجزة أو غير مربوطة') : nConf ? `راجع الربط: ${toAr(nConf)} ${nConf === 1 ? 'درس' : 'دروس'} فيها تعارض` : `الخطة جاهزة: ${countWord(queue.length)}`,
        (parts.length ? parts.join(' · ') + '\n' : '') + 'لكل درس من ملفك قائمة بدروس نور: اختر المقابل الصحيح أو «تخطَّ»، و«↧ ما بعده بالترتيب» يربط ما يليه دفعة واحدة.'
        + (auto ? ` إن لم تعدّل شيئًا تبدأ التعبئة وحدها بعد ${toAr(Math.round(auto / 1000))} ثانية${nConf ? ' (ما لم يُربط يُتخطّى، والمربوط بالترتيب يُعبَّأ)' : ''}${plan.mismatch ? ' — وبسبب اختلاف الوحدات لن يُعبَّأ إلا المربوط بالاسم أو برقم الدرس' : ''}.` : ' ثم اضغط «ابدأ التعبئة».'));
      running = false;
      const go = await waitGo(auto);
      running = true; editable = false;
      $('goBtn').hidden = true;
      if (!go) throw new Error('stop');
      if (go === 'auto') autoResolve();
      await savePicks();
      assignDates(); renderPlan();
      if (!queue.length) { finished = true; throw new Error(plan.some((p) => p.sessions.some((s) => s.inNoor)) ? 'كل حصص الدروس المربوطة موجودة في نور — لا ناقص.' : scope.kind !== 'term' ? 'لا حصص ضمن النطاق المختار (الوحدة/الأسبوع/المدى) — غيّر النطاق.' : 'لم تحدد أي حصة.'); }
    }
    await probeSchedule(addUrl);
    // عدد تحاضير كل درس في نور قبل البدء (أساس التحقق)، وما وُجد في نور يُسجَّل «محفوظًا» في مكتبتك
    plan.forEach((p) => { p.initial = noorCount(noorHave, p); p.keyInit = keyCount(noorHave, p); p.savedNow = 0; });
    for (const p of plan) for (const s of p.sessions) if (s.inNoor && !sessionStatus(state, pkg.id, s.lesson.id).saved) await markSaved(pkg.id, s.lesson.id, '', 'قائمة نور');
    state = (await getPackages()).state;
    setPhase('fill');
    total = queue.length;
    // سجل المشرف: صف البداية، وصف لكل درس في النطاق لم يُربط بدرس في نور (المعالج وحده يتخطّاه دون سؤال)
    flRow('start', null, `${flMode() || scope.kind} · ${total} حصة`); flStarted = true;
    if (WIZ.on) plan.filter((p) => p.miss && p.sessions[0] && inScope(p.sessions[0])).forEach(flMissRow);
    flushFillLog().catch(() => {});
    const itemOf = (s) => { const p = plan.find((x) => x.sessions.includes(s)); return { s, p, node: p.node, first: p.sessions[0] }; };
    const onSaved = async (item, note) => {
      ok += 1 + ((item.s.merge || []).length); await recordSaved(item);
      if (WIZ.trialCap != null && !(WIZ.fetched0 && WIZ.fetched0.has(item.s.lesson.id))) WIZ.trialCap = Math.max(0, WIZ.trialCap - 1);
      setSt(item.s, 'ok', `✓ حُفظت · ${dayLabel(item.s.date, false)}`);
      logLine('ok', `✓ ${item.s.lesson.title} — ${item.node.text} — ${dayLabel(item.s.date)}${note || ''}`);
      item.s.on = false; item.s.eligible = false; item.s.savedNow = true;
      flRow('saved', item, String(note || '').replace(/^\s*\(|\)\s*$/g, '').trim());
      $('prog').style.width = (Math.min(1, (ok + skipped) / total) * 100) + '%';
      await checkpoint(true);
    };
    // الجولة الأولى
    const runList = queue.slice();   // نسخة ثابتة: تعديل التواريخ أثناء التشغيل لا يغيّر ترتيب التنفيذ
    for (let k = 0; k < runList.length && !stopFlag; k++) {
      if (runList[k].mergedInto || runList[k].savedNow) continue;   // جُمعت مع حصة قبلها في تحضير واحد
      const item = itemOf(runList[k]);
      plan.forEach((x) => x.sessions.forEach((y) => { y.cur = y === item.s; }));
      renderPlan();
      const out = await processItem(item, addUrl, 4);
      item.s.cur = false;
      // ما مرّ دوره ولم يُؤجَّل لا يُجمع معه شيء لاحقًا (لن تعود إليه الأداة)
      if (out !== 'saved' && !(out && out.defer)) [item.s, ...(item.s.merge || [])].forEach((x) => { x.done = true; });
      if (out === 'saved') await onSaved(item);
      else if (out === 'skip') { skipped++; setSt(item.s, 'skip', '— تُخطّيت'); logLine('skip', `— تُخطّيت: ${item.s.lesson.title}`); flRow('skipped', item, 'تخطّاها المعلم'); }
      else if (out && out.skipped) { skipped++; pastSkipped++; setSt(item.s, 'skip', '— تاريخها مضى'); logLine('info', `— «${item.s.lesson.title}»: ${out.why}`); flRow('skipped', item, out.why); }
      else if (out && out.defer) { deferred.push(Object.assign(item, { why: out.why, verifyOnly: !!out.verifyOnly })); setSt(item.s, 'wait', '⏳ مؤجلة لجولة الإكمال'); logLine('info', `⏳ أجّلت «${item.s.lesson.title}» لجولة الإكمال: ${out.why}`); }
      else if (out && out.fatal) { setSt(item.s, 'bad', '✗ ' + out.fatal); flRow('failed', item, out.fatal); if (AFAQ.SERVICE) afaqSync().catch(() => {}); throw new Error(out.fatal); }
      else { if (out === 'stop') flRow(item.clicked ? 'unconfirmed' : 'skipped', item, item.clicked ? 'أوقف المعلم التشغيل بعد ضغط الحفظ ولم يتأكد' : 'أوقف المعلم التشغيل أثناءها'); break; }   // ما لم يُحاوَل بعد لا صف له
      await sleep(600);
    }
    // جولة الإكمال: ما تعذّر في الأولى يُعاد بعد مهلة — بعد التحقق من قائمة نور أنه لم يُحفظ فعلًا
    for (let round = 1; round <= 2 && deferred.length && !stopFlag; round++) {
      logLine('info', `جولة الإكمال ${toAr(round)}: ${countWord(deferred.length)} لم تنجح قبل`);
      await backoff(round + 1, 'أمهل نور قليلًا قبل جولة الإكمال');
      const h0 = await refreshNoorHave();
      const h = listReliable(h0) ? h0 : null;
      const list = deferred.splice(0);
      let i = 0;
      try {
        for (; i < list.length; i++) {
          const item = list[i];
          if (stopFlag) { deferred.push(item); continue; }
          if (h && keyCount(h, item.p) > keyWant(item.p)) { listBase.saved++; await onSaved(item, ' (وُجدت في قائمة نور)'); continue; }
          if (item.verifyOnly && !h) { deferred.push(item); continue; }   // لا نعيد ما قد يكون محفوظًا دون تحقق
          setSt(item.s, 'run', 'جولة الإكمال…');
          const out = await processItem(item, addUrl, 3);
          if (out && out.fatal) { flRow('failed', item, out.fatal); throw new Error(out.fatal); }
          if (out === 'saved') await onSaved(item, ' (جولة الإكمال)');
          else if (out === 'skip') { skipped++; setSt(item.s, 'skip', '— تُخطّيت'); flRow('skipped', item, 'تخطّاها المعلم'); }
          else if (out && out.skipped) { skipped++; pastSkipped++; setSt(item.s, 'skip', '— تاريخها مضى'); flRow('skipped', item, out.why); }
          else if (out && out.defer) deferred.push(Object.assign(item, { why: out.why, verifyOnly: !!out.verifyOnly }));
          else { deferred.push(item); break; }
        }
      } finally { deferred.push(...list.slice(i + 1)); }   // ما لم تصل إليه الجولة (إيقاف أو عطل قاطع) يبقى مؤجلًا فيأخذ صفه النهائي في سجل المشرف
    }
    // التحقق النهائي: كل ما حُفظ في هذا التشغيل ظاهر فعلًا في قائمة نور؟ ما لم يظهر يُعاد مرة واحدة
    if (!stopFlag && savedThisRun.length && $('optNoor').checked) {
      setBox('run', 'أتحقق من قائمة نور أن كل الحصص حُفظت…');
      const h = await refreshNoorHave();
      const lost = [];
      const seenKey = new Set();
      if (h) plan.filter((p) => p.savedNow).forEach((p) => {
        // الدروس التي تحمل الاسم نفسه تُعدّ معًا (لا يُحسب حفظ درس دليلًا على درس آخر ولا العكس)
        const k = kwNorm(p.node.text);
        if (seenKey.has(k)) return;
        seenKey.add(k);
        const ps = plan.filter((x) => x.node && kwNorm(x.node.text) === k);
        const missing = keyWant(p) - Math.max(keyCount(h, p), noorCountLoose(h, p));
        if (missing > 0) lost.push(...savedThisRun.filter((it) => ps.includes(it.p)).slice(-missing));
      });
      const redo = !!h && listReliable(h) && lost.length <= Math.max(3, Math.round(savedThisRun.length * 0.1));
      lastVerify = !h ? 'none' : !lost.length ? 'ok' : !redo ? 'loose' : 'ok';
      if (!h) logLine('info', 'تعذّر التحقق النهائي من قائمة نور — راجع القائمة بنفسك');
      else if (!lost.length) logLine('ok', `✓ التحقق النهائي: كل ما حُفظ (${countWord(savedThisRun.length)}) ظاهر في قائمة نور`);
      else if (!redo) logLine('info', `التحقق النهائي: أكّد نور حفظ الحصص كلها عند الحفظ، و${countWord(lost.length)} منها تظهر في القائمة بصياغة عنوان مختلفة قليلًا — لا إجراء مطلوب`);
      if (redo) {
        for (const item of lost) {
          if (stopFlag) break;
          logLine('info', `التحقق النهائي: «${item.s.lesson.title}» لم تظهر في قائمة نور — أعيدها`);
          ok--; item.p.savedNow--; savedThisRun.splice(savedThisRun.indexOf(item), 1); listBase.saved = Math.max(0, listBase.saved - 1);
          delete semSaved[item.s.lesson.id]; savedIds.delete(item.s.lesson.id); await semStore((m) => { delete m[item.s.lesson.id]; });
          fillLogged.delete(item.s); item.flAgain = true;   // صف «saved» السابق لم يعد صحيحًا: تأخذ صفًا جديدًا بنتيجة الإعادة يحلّ محله في لوحة المشرف
          const out = await processItem(item, addUrl, 3);
          if (out === 'saved') await onSaved(item, ' (بعد التحقق)');
          else { failed.push({ item, why: 'لم تظهر في قائمة نور بعد الحفظ', verifyOnly: !!(out && out.defer && out.verifyOnly) }); lastVerify = 'none'; }
        }
      }
    }
    deferred.forEach((item) => failed.push({ item, why: item.why, verifyOnly: !!item.verifyOnly }));
    WIZ.failedIds = failed.map(({ item }) => item.s.lesson.id);
    failed.forEach(({ item, why }) => { setSt(item.s, WIZ.on ? 'wait' : 'bad', WIZ.on ? '⏳ تُكمَل لاحقًا' : '✗ ' + why); logLine('bad', `✗ لم تكتمل «${item.s.lesson.title}» (${item.node.text}): ${why}`); });
    diag.failed = failed.map(({ item, why }) => ({ lesson: item.s.lesson.title, node: item.node.text, date: item.s.date, why }));
    finished = !stopFlag;
  } catch (e) {
    const m = String((e && e.message) || e);
    endWhy = m === 'stop' ? '' : m;
    if (m !== 'stop' && !finished) { endMsg = ['bad', `توقف: ${esc(m)}<br>ما حُفظ قبلها بقي محفوظًا. اضغط «ابدأ» ليكمل من حيث توقف (المحفوظ لا يتكرر).`]; logLine('bad', 'توقف: ' + m); if (!WIZ.on) setBox('bad', 'توقف', m); }
    else if (finished && m !== 'stop') { endMsg = ['ok', esc(m)]; setBox('ok', m, ''); }
  }
  // سجل المشرف: ما بقي مؤجلًا أو لم يكتمل يأخذ صفه النهائي (مرة واحدة)، ثم صف النهاية بالحصيلة وسببها
  failed.forEach(({ item, why, verifyOnly }) => { if (!fillLogged.has(item.s)) flRow(verifyOnly ? 'unconfirmed' : 'failed', item, why); });
  deferred.forEach((item) => { if (!fillLogged.has(item.s)) flRow(item.verifyOnly ? 'unconfirmed' : 'failed', item, item.why); });
  if (!flStarted) flRow('start', null, `${flMode() || scope.kind} · لم تبدأ التعبئة`);   // توقف قبل مرحلة التعبئة: لكل نهاية بداية في السجل
  flRow('end', null, `حُفظ ${ok} · غير مؤكد ${fillCnt.unconfirmed || 0} · لم تكتمل ${fillCnt.failed || 0} · تُخطّيت ${fillCnt.skipped || 0}${stopFlag ? ' · أوقفه المعلم' : ''}${endWhy ? ` · ${finished ? '' : 'توقف: '}${endWhy}` : ''}`);
  flushFillLog().catch(() => {});
  await hideBar();
  setRunning(false);
  // نقطة الاستئناف تبقى فقط إن انقطع التشغيل بخطأ (لا إن أوقفته أنت أو اكتمل)
  await checkpoint(!finished && !stopFlag && !!endMsg && endMsg[0] === 'bad');
  plan.forEach((p) => p.sessions.forEach((x) => { x.cur = false; }));
  state = (await getPackages()).state;
  renderPlan();
  if (total) $('prog').style.width = (Math.min(1, ok / total) * 100) + '%';
  if (endMsg) msg(endMsg[0], endMsg[1]);
  else if (stopFlag) { msg('warn', `أُوقف. حُفظ ${countWord(ok)} من ${toAr(total)}.`); setBox('warn', 'أُوقف', `حُفظ ${countWord(ok)} من ${toAr(total)}. اضغط «ابدأ» ليكمل من حيث توقف.`); }
  else if (total && !failed.length && completion().complete) {
    const cp = completion();
    const t = completeText(cp);
    logLine('ok', t);
    msg('ok', `${t} — حُفظ الآن ${countWord(ok)}.`);
    setBox('ok', t, '');
  }
  else if (total) {
    const miss = plan.filter((p) => p.miss && !p.skipped).length;
    const had = plan.flatMap((p) => p.sessions.filter((s) => s.inNoor)).length;
    const what = scope.kind === 'unit' ? 'الوحدة المختارة' : scope.kind === 'week' ? 'الأسبوع المختار' : scope.kind === 'dates' ? 'المدى التاريخي المختار' : scope.kind === 'range' ? 'المدى المختار' : `الفصل ${termName(termNo)}`;
    const head = !ok ? 'انتهى دون حفظ أي حصة.' : `✔ انتهى ${what}: حُفظ ${countWord(ok)} بتواريخ نشر${useFile ? ' كما في الملف' : ' متتالية'}.`;
    const tail = [had ? `كان موجودًا في نور ${countWord(had)}` : '', skipped ? `تُخطّيت ${countWord(skipped)}` : '', failed.length ? `لم تكتمل ${countWord(failed.length)} — اضغط «ابدأ» لإعادتها` : '', miss ? `${toAr(miss)} ${miss === 1 ? 'درس بلا مقابل' : 'دروس بلا مقابل'} في نور` : ''].filter(Boolean).join(' · ');
    msg(ok && !failed.length ? 'ok' : 'warn', head + (tail ? ` (${tail})` : ''));
    setBox(miss || skipped || failed.length || !ok ? 'warn' : 'ok', head, tail ? tail + ' — التفاصيل في السجل.' : '');
  }
  // «موجودة في نور»: في «أختار الدروس بنفسي» الحصص التي اختارها المعلم فقط — لا حصص دروس أخرى من المادة
  const had = plan.flatMap((p) => p.sessions.filter((s) => s.inNoor && pickedS(s))).length;
  const report = await saveReport({ failed, had }).catch(() => null);
  if (WIZ.on) wizAfterRun({ report, ok, failed: failed.length, stopped: stopFlag, error: !!endMsg && endMsg[0] === 'bad' && !WIZ.trialOver ? (diag.log.filter((l) => l.startsWith('[bad] ')).pop() || '[bad]  ').slice(6) || ' ' : '', had, past: pastSkipped });
}

// ---------- تقرير المعلم: ما نُشر وتواريخه (صفحة قابلة للطباعة) ----------
// تشغيلات المعالج المتتالية للطلب نفسه (الإكمال التلقائي) تُدمج في تقرير واحد
async function saveReport({ failed, had }) {
  if (!pkg) return;
  const rid = WIZ.on && WIZ.rid ? WIZ.rid : Date.now();
  const all = (await chrome.storage.local.get('hadirReports').catch(() => ({}))).hadirReports || [];
  const old = all.find((r) => r.rid === rid);
  const saved = (old ? old.saved : []).concat(savedThisRun.map((it) => ({ lesson: (it.node && it.node.text) || '', s: it.s.lesson.title, d: it.s.date })));
  const doneIds = new Set(saved.map((x) => x.s + '|' + x.d));
  const r = {
    rid, at: Date.now(), title: pkg.title || pkg.subject || '', subject: pkg.subject || '', grade: pkg.grade || '', shift: pkgShift(pkg),
    saved, had: Math.max(had || 0, old ? old.had : 0), verify: lastVerify || (old && old.verify) || '',
    left: failed.map(({ item }) => ({ lesson: (item.node && item.node.text) || '', s: item.s.lesson.title, d: item.s.date })).filter((x) => !doneIds.has(x.s + '|' + x.d)),
  };
  if (!r.saved.length && !r.left.length && !old) return null;
  await chrome.storage.local.set({ hadirReports: [r].concat(all.filter((x) => x.rid !== rid)).slice(0, 30) }).catch(() => {});
  return r;
}
function openReport() {
  chrome.windows.create({ url: chrome.runtime.getURL('report.html'), type: 'popup', width: 760, height: 900 }).catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('report.html') }));
}

// ================= التهيئة =================
async function init() {
  $('ver').textContent = 'الإصدار ' + chrome.runtime.getManifest().version;
  const r = await getPackages();
  packages = r.packages; state = r.state;
  settings = await getSettings();
  const withLessons = packages.filter((p) => (p.lessons || []).length);
  if (!withLessons.length) {
    if (!q.get('classic')) { $('startBtn').disabled = true; return; }
    msg('bad', AFAQ.SERVICE
      ? 'لا مواد بعد. افتح هذه النافذة دون «النسخة الكاملة» لتختار صفك ومادتك.'
      : 'المكتبة فارغة. أضف تحضير مادتك أولًا من صفحة «المكتبة» (لصق نص، أو ملف Word أو HTML، أو استيراد ملف مادة).');
    $('startBtn').disabled = true;
    return;
  }
  $('pkgSel').innerHTML = withLessons.map((p) => `<option value="${esc(p.id)}">${esc(p.title || [p.subject, p.grade].filter(Boolean).join(' · '))} — ${toAr(lessonGroups(p).length)} درسًا، ${countWord((p.lessons || []).length)}</option>`).join('');
  pkg = withLessons.find((p) => p.id === q.get('pkg')) || withLessons[0];
  $('pkgSel').value = pkg.id;
  const o = (await chrome.storage.local.get('semesterOpts').catch(() => ({}))).semesterOpts || {};
  $('optReview').checked = !!o.review;
  $('optStep').checked = !!o.step;
  $('optNoor').checked = o.noor !== false;
  $('optAuto').checked = o.auto != null ? !!o.auto : settings.autoContinue !== false;
  $('optWeek').checked = settings.setWeek !== false;
  $('optWeek').onchange = async () => { settings = await patchSettings({ setWeek: $('optWeek').checked }).catch(() => settings); };
  // الفصل: المحفوظ، وإلا حسب الشهر (من فبراير إلى يونيو = الثاني)
  const m = new Date().getMonth() + 1;
  termNo = o.term || (m >= 2 && m <= 6 ? 2 : 1);
  const radio = document.querySelector(`input[name=term][value="${termNo}"]`);
  if (radio) radio.checked = true;
  // ---- النطاق وتواريخ الملف ----
  const scopeUi = () => {
    $('scopeUnit').hidden = scope.kind !== 'unit';
    $('scopeWeek').hidden = scope.kind !== 'week';
    $('scopeDates').hidden = scope.kind !== 'dates';
    $('scopeRange').hidden = scope.kind !== 'range';
    if (scope.kind === 'dates') $('datesHint').textContent = scope.dateFrom && scope.dateTo ? `${dayLabel(scope.dateFrom)} – ${dayLabel(scope.dateTo)}${plan.length ? ': ' + countWord(queue.length) : ''}` : 'الحصص التي تقع تواريخ نشرها (من النشرة) بين التاريخين';
    $('startLbl').textContent = useFile ? 'أول تاريخ نشر (للحصص التي بلا تاريخ في الملف)' : scope.kind === 'week' ? 'أول تاريخ نشر (أول يوم حصة في الأسبوع)' : 'أول تاريخ نشر';
    if (plan.length) { assignDates(); renderPlan(); }
  };
  const renderUnits = () => {
    const units = [...new Set(lessonGroups(pkg).map((g) => g.unit || ''))];
    $('unitChips').innerHTML = units.map((u) => `<button type="button" class="day unit ${scope.units.has(kwNorm(u)) ? 'on' : ''}" data-u="${esc(kwNorm(u))}" title="${esc(u || 'بلا وحدة')}">${esc(u || 'بلا وحدة')}</button>`).join('');
    $('unitChips').querySelectorAll('.day').forEach((b) => { b.onclick = () => { if (running) return; const k = b.dataset.u; if (scope.units.has(k)) scope.units.delete(k); else scope.units.add(k); renderUnits(); scopeUi(); }; });
  };
  const renderRange = () => {
    const gs = lessonGroups(pkg);
    const opt = (sel) => gs.map((g) => `<option value="${esc(g.key)}" ${g.key === sel ? 'selected' : ''}>${esc([g.unit, g.lesson].filter(Boolean).join(' / '))}</option>`).join('');
    if (!gs.some((g) => g.key === scope.from)) scope.from = gs[0] ? gs[0].key : '';
    if (!gs.some((g) => g.key === scope.to)) scope.to = gs.length ? gs[gs.length - 1].key : '';
    $('fromLesson').innerHTML = opt(scope.from); $('toLesson').innerHTML = opt(scope.to);
  };
  const renderDateSrc = () => {
    const has = hasFileDates(pkg);
    $('dateSrcRow').hidden = !has;
    if (has) { $('datedN').textContent = `— ${toAr(datedCount(pkg))} من ${toAr((pkg.lessons || []).length)} حصة لها تاريخ`; }
    const want = has && (o.dsrc !== 'seq');
    useFile = want;
    const rd = document.querySelector(`input[name=dsrc][value="${useFile ? 'file' : 'seq'}"]`); if (rd) rd.checked = true;
  };
  const renderLint = () => {
    const termEnd = termEndOf(settings, termNo);
    lintRes = lintPackage(pkg, { days, termEnd, holidays: holidaySet(settings), start: $('start').value, isDone: (l) => done(l) });
    const lv = lintLevel(lintRes);
    const b = lintRes.budget;
    const allDone = (pkg.lessons || []).length > 0 && (pkg.lessons || []).every((l) => done(l));
    $('lintCard').hidden = (!lintRes.warnings.length && !b) || allDone;   // مادة مكتملة: لا ملاحظات ولا ميزانية
    const n = lintRes.warnings.length;
    const budgetTxt = b ? ` · ميزانية الفصل: ${countWord(b.need)} متبقية لـ${toAr(b.avail)} يوم حصة حتى ${dayLabel(b.termEnd, false)}${b.over ? ` — ينقص ${toAr(b.over)}` : ' ✓'}` : (settings.term1End || settings.term2End ? '' : ' · (اضبط «نهاية الفصل» في الإعدادات لحساب الميزانية)');
    $('lintHead').textContent = `فحص ملف المادة: ${lv === 'ok' ? 'سليم ✓' : `${toAr(n)} ${n === 1 ? 'ملاحظة' : n === 2 ? 'ملاحظتان' : n <= 10 ? 'ملاحظات' : 'ملاحظة'}${lv === 'warn' || lv === 'bad' ? ' — راجعها' : ' (معلومات فقط)'}`}${budgetTxt}`;
    $('lint').innerHTML = lintRes.warnings.map((w) => `<div class="${w.level}">${esc(w.text)}</div>`).join('');
    $('lint').hidden = !(lv === 'warn' || lv === 'bad');   // التنبيهات المهمة تظهر مباشرة
    $('lintToggle').textContent = $('lint').hidden ? 'عرض التفاصيل' : 'إخفاء';
    diag.lint = lintRes.warnings.map((w) => `[${w.level}] ${w.text}`);
    diag.budget = b;
  };
  $('lintToggle').onclick = () => { $('lint').hidden = !$('lint').hidden; $('lintToggle').textContent = $('lint').hidden ? 'عرض التفاصيل' : 'إخفاء'; };
  document.querySelectorAll('input[name=scope]').forEach((r) => { r.onchange = () => { if (running) return; scope.kind = r.value; if (scope.kind === 'week' && !scope.weekDay) { scope.weekDay = $('start').value || todayIso(); $('weekDay').value = scope.weekDay; } syncWeekStart(); scopeUi(); }; });
  document.querySelectorAll('input[name=dsrc]').forEach((r) => { r.onchange = () => { if (running) return; useFile = r.value === 'file'; o.dsrc = r.value; scopeUi(); }; });
  // أسبوع: أول تاريخ نشر = أول يوم حصة في ذلك الأسبوع (ما لم تكن التواريخ من الملف)
  const syncWeekStart = () => {
    if (scope.kind !== 'week' || !scope.weekDay) return;
    const ws = weekStart(scope.weekDay);
    $('weekHint').textContent = `${dayLabel(ws)} – ${dayLabel(weekEnd(scope.weekDay))}`;
    if (!useFile) { $('start').value = nextSchoolDay(ws, days, true); startTouched = true; renderDays(); }
  };
  $('weekDay').onchange = () => { if (running) return; scope.weekDay = $('weekDay').value; syncWeekStart(); scopeUi(); };
  // مدى تاريخي: مع التواريخ المتتالية يبدأ التسلسل من أول المدى
  const syncDates = () => {
    scope.dateFrom = $('dateFrom').value; scope.dateTo = $('dateTo').value;
    if (scope.dateFrom && scope.dateTo && scope.dateTo < scope.dateFrom) { [scope.dateFrom, scope.dateTo] = [scope.dateTo, scope.dateFrom]; $('dateFrom').value = scope.dateFrom; $('dateTo').value = scope.dateTo; }
    if (!useFile && scope.dateFrom) { $('start').value = nextSchoolDay(scope.dateFrom, days, true); startTouched = true; renderDays(); }
  };
  $('dateFrom').onchange = $('dateTo').onchange = () => { if (running) return; syncDates(); scopeUi(); };
  const setScope = (kind) => { scope.kind = kind; const r = document.querySelector(`input[name=scope][value="${kind}"]`); if (r) r.checked = true; };
  // اختيار سريع بتاريخ النشرة: حصة اليوم · هذا الأسبوع · الأسبوع القادم · الفائتة (تواريخها قبل اليوم ولم تُدخل)
  document.querySelectorAll('.quick [data-q]').forEach((b) => {
    b.onclick = () => {
      if (running) return;
      const today = todayIso();
      const q = b.dataset.q;
      if (q === 'today') { setScope('dates'); $('dateFrom').value = today; $('dateTo').value = today; syncDates(); }
      else if (q === 'week' || q === 'nextweek') { setScope('week'); const d = parseIso(today); if (q === 'nextweek') d.setDate(d.getDate() + 7); scope.weekDay = isoOf(d); $('weekDay').value = scope.weekDay; syncWeekStart(); }
      else if (q === 'overdue') { setScope('dates'); $('dateFrom').value = ''; $('dateTo').value = today; syncDates(); }
      scopeUi();
      if (!plan.length) msg('info', `النطاق: ${q === 'today' ? 'حصة اليوم ' + dayLabel(today) : q === 'week' ? 'هذا الأسبوع' : q === 'nextweek' ? 'الأسبوع القادم' : 'كل الحصص التي تاريخها حتى اليوم ولم تُدخل'} — ${useFile ? 'بحسب تواريخ النشرة' : 'بحسب التواريخ المتتالية من أول تاريخ'}. اضغط «ابدأ».`);
    };
  });
  $('fromLesson').onchange = () => { scope.from = $('fromLesson').value; scopeUi(); };
  $('toLesson').onchange = () => { scope.to = $('toLesson').value; scopeUi(); };
  const sk = (o.scope && ['term', 'unit', 'week', 'dates', 'range'].includes(o.scope)) ? o.scope : 'term';
  scope.kind = sk; const sr = document.querySelector(`input[name=scope][value="${sk}"]`); if (sr) sr.checked = true;

  const onPkg = () => {
    pkg = packages.find((p) => p.id === $('pkgSel').value) || pkg;
    days = daysFor(state, settings, pkg.id);
    let start = nextSchoolDay(todayIso(), days, true);
    const used = Object.keys(usedDates(pkg, state)).sort().pop();
    if (used && used >= start) start = nextSchoolDay(used, days, false);
    $('start').value = start; startAuto = start;
    renderDays();
    scope.units.clear(); scope.from = ''; scope.to = '';
    renderUnits(); renderRange(); renderDateSrc(); renderLint(); scopeUi();
    plan = []; renderPlan();
  };
  $('pkgSel').onchange = () => { startTouched = false; onPkg(); };
  onPkg();
  $('start').onchange = () => { startTouched = true; renderDays(); renderLint(); if (plan.length) { assignDates(); renderPlan(); } };
  document.querySelectorAll('input[name=term]').forEach((r) => { r.addEventListener('change', () => { termNo = +r.value || 1; renderLint(); }); });
  // استعادة نطاق تشغيل سابق (من offerResume)
  init.restoreScope = (sc) => {
    if (!sc) return;
    scope.kind = sc.kind || 'term'; scope.picks = new Set(sc.picks || []); scope.units = new Set(sc.units || []); scope.weekDay = sc.weekDay || ''; scope.from = sc.from || ''; scope.to = sc.to || ''; scope.dateFrom = sc.dateFrom || ''; scope.dateTo = sc.dateTo || '';
    const r2 = document.querySelector(`input[name=scope][value="${scope.kind}"]`); if (r2) r2.checked = true;
    if (scope.weekDay) $('weekDay').value = scope.weekDay;
    $('dateFrom').value = scope.dateFrom; $('dateTo').value = scope.dateTo;
    if (sc.dsrc) { useFile = hasFileDates(pkg) && sc.dsrc === 'file'; const rd = document.querySelector(`input[name=dsrc][value="${useFile ? 'file' : 'seq'}"]`); if (rd) rd.checked = true; }
    renderUnits(); renderRange(); scopeUi();
  };
  $('startBtn').onclick = run;
  $('stopBtn').onclick = () => { stopFlag = true; stopHooks.splice(0).forEach((f) => f()); $('stopBtn').disabled = true; };
  // تصفير المادة من هنا (بعد حذف التحاضير من نور مثلًا): تعود كأنها لم تُدخل، فيُعاد إدخالها كاملة
  $('resetBtn').onclick = async () => {
    if (running || !pkg) return;
    const pr = packageProgress(pkg, state);
    if (!confirm(`تصفير «${pkg.title}»؟\nتعود كل حصصها (${toAr(pr.total)}) إلى «لم تُعبّأ»، ويُمسح سجل إدخالها وسجل «فصل كامل» لمقررها، فتُدخل من جديد كأنها لم تُدخل قط.\nلا يُحذف شيء من نور ولا من محتوى الحصص. (إن كانت التحاضير ما زالت في نور فسيقرؤها «أكمل الناقص فقط» ولن يكررها.)`)) return;
    await resetProgress(pkg.id).catch(() => {});
    state = (await getPackages()).state;
    semSaved = {}; plan = []; queue = []; renderPlan();
    $('log').innerHTML = ''; $('logCard').hidden = true;
    await chrome.storage.local.set({ semesterRun: null }).catch(() => {});
    $('pkgSel').onchange();
    msg('ok', `✓ صُفّرت «${esc(pkg.title)}»: حالة الحصص وسجل الإدخال وسجل «فصل كامل» — اضغط «ابدأ» لإدخالها من جديد.`);
  };
  $('reportBtn').onclick = async () => {
    const rep = {
      version: chrome.runtime.getManifest().version, term: termNo, scope: { kind: scope.kind, units: [...scope.units], weekDay: scope.weekDay, from: scope.from, to: scope.to, fileDates: useFile },
      pkg: pkg && { title: pkg.title, subject: pkg.subject, grade: pkg.grade, dated: datedCount(pkg), lessons: lessonGroups(pkg).map((g) => ({ unit: g.unit, lesson: g.lesson, sessions: g.sessions.length, dates: g.sessions.map((s) => s.pubDate || '').filter(Boolean) })) },
      lint: diag.lint || [], budget: diag.budget || null, treeDiff: diag.treeDiff || null, orphans: diag.orphans || [], holidays: [...holidaySet(settings)].length, tree: diag.tree, plan: diag.plan, failed: diag.failed, log: diag.log,
    };
    const t = JSON.stringify(rep, null, 1);
    try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    $('reportBtn').textContent = '✓ نُسخ — الصقه في المحادثة مع المطوّر';
    setTimeout(() => { $('reportBtn').textContent = 'نسخ تقرير التشغيل'; }, 4000);
  };
}
const endBeat = () => { if (running) { clearInterval(hb); chrome.storage.session.remove('batchRun').catch(() => {}); chrome.storage.local.remove('semesterLock').catch(() => {}); } };
// خطأ غير متوقع خارج سلّم المعالجة: يُسجَّل ولا يُسقط التشغيل (المحاولة الجارية تعالج أخطاءها بنفسها)
window.addEventListener('unhandledrejection', (e) => { try { const m = String((e.reason && e.reason.message) || e.reason || '').slice(0, 120); if (m && !/stop/.test(m)) logLine('info', 'خطأ غير متوقع (تم تجاوزه): ' + m); e.preventDefault(); } catch (x) {} });
window.addEventListener('error', (e) => { try { logLine('info', 'خطأ غير متوقع (تم تجاوزه): ' + String(e.message || '').slice(0, 120)); } catch (x) {} });
// تنبيه قبل إغلاق النافذة أثناء التشغيل (وإن أُغلقت يُستأنف عند فتحها)
window.addEventListener('beforeunload', (e) => { if (running) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', endBeat);
// تشغيل سابق انقطع (أُغلقت النافذة أو تعطّل كروم)؟ يُستأنف وحده بعد ١٠ ثوانٍ ما لم تلغِه
async function offerResume() {
  const v = (await chrome.storage.local.get(['semesterRun', 'semesterLock']).catch(() => ({})));
  const run0 = v.semesterRun, lk = v.semesterLock;
  if (!run0 || Date.now() - run0.at > 12 * 3600e3) return;
  if (lk && Date.now() - lk.at < 15000) return;   // ما زال يعمل في نافذة أخرى
  if (![...$('pkgSel').options].some((o) => o.value === run0.pkgId)) return;
  $('pkgSel').value = run0.pkgId; $('pkgSel').onchange();
  const radio = document.querySelector(`input[name=term][value="${run0.term}"]`); if (radio) radio.checked = true;
  if (run0.startTouched && run0.start) { $('start').value = run0.start; startTouched = true; renderDays(); }
  if (run0.scope && init.restoreScope) init.restoreScope(run0.scope);
  if (run0.wiz) { WIZ.on = true; WIZ.rule = run0.wiz.rule || ''; WIZ.seq = !!run0.wiz.seq; WIZ.pickDates = run0.wiz.pick || null; WIZ.rid = run0.wiz.rid || Date.now(); WIZ.sum = run0.wiz.sum || 0; WIZ.resumed = true; WIZ.auto = run0.wiz.auto || 0; $('optStep').checked = !!run0.wiz.step; $('optReview').checked = !!run0.wiz.review; $('optNoor').checked = true; $('optAuto').checked = true; wizRunning(); }
  let left = 10, cancelled = false;
  const tick = () => {
    if (cancelled) return;
    msg('info', `تشغيل سابق لم يكتمل — أكمله تلقائيًا بعد ${toAr(left)} ثوانٍ (المحفوظ لا يتكرر). <button class="btn sm" id="resumeCancel">إلغاء</button>`);
    const b = $('resumeCancel'); if (b) b.onclick = async () => { cancelled = true; clearInterval(iv); $('topMsg').className = 'msg'; await chrome.storage.local.set({ semesterRun: null }).catch(() => {}); if (WIZ.on) wzAgain(); };
    if (left-- <= 0) { clearInterval(iv); $('topMsg').className = 'msg'; run(); }
  };
  const iv = setInterval(tick, 1000); tick();
}
const initDone = init().then(offerResume).catch(() => {});
// للاختبار الآلي فقط (?debug=1): يكشف الحالة الداخلية دون أثر على الاستخدام العادي
if (q.get('debug') === '1') {
  window.__hadirSem = {
    WIZ, get offRule() { return offRule; }, setNoorDates(a) { noorDates = new Set(a); offRule = null; }, setSemSaved(o) { semSaved = o; },
    set(o) { if (o.pkg) pkg = o.pkg; if (o.state) state = o.state; if (o.settings) settings = o.settings; if (o.days) days = o.days; if (o.scope) Object.assign(scope, o.scope, o.scope.units ? { units: new Set(o.scope.units) } : {}); if (o.useFile != null) useFile = o.useFile; if (o.start) $('start').value = o.start; if (o.editable != null) editable = o.editable; if (o.noorHave) { noorHave = new Map(Object.entries(o.noorHave)); } },
    renderPlan,
    buildPlan, assignDates, shiftDate, conflicts, completion, safeLinks,
    get plan() { return plan; }, get queue() { return queue; }, get treeNodes() { return treeNodes; }, get log() { return diag.log; },
    planLine: () => planLine(), setQueue(q) { queue = q; },
    wizAfterRun: (o) => wizAfterRun(o), wizRunning: () => wizRunning(), wzFromNoor: () => wzFromNoor(wzOffers()), get settings() { return settings; }, holidays: () => [...holidaySet(settings)],
  };
}

// ================= المعالج: خطوة واحدة كبيرة في كل شاشة =================
// أول شاشة: «أختار الدروس بنفسي» أو «تحضير الفصل كاملًا» ← الصف ← المادة ← نوع المدرسة ←
// (الدروس وتاريخ كل حصة) ← التعبئة والحفظ وحدهما. لا شاشات أخرى ولا اقتراحات.
const SHIFT = { one: { name: 'فترة واحدة', min: 40 }, two: { name: 'فترتان', min: 35 } };
const WZ_STEPS = ['mode', 'grade', 'subject', 'shift', 'lessons'];
// «بداية الإدخال» في التحضير التلقائي: في النسخة الخاصة بالمالك فقط (اسم الإصدار فيه «خاصة»)
const FROM_STEP = (() => { try { return /خاصة/.test(chrome.runtime.getManifest().version_name || ''); } catch (e) { return false; } })();
const wz = { step: 'mode', hist: [], mode: '', grade: 0, subject: '', shift: '', pkg: null, sel: new Map(), catalog: null, link: null, status: null, busy: false };
const ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
const wdone = (l) => { const x = sessionStatus(state, wz.pkg.id, l.id); return !!(x.saved || (x.filled && !x.failed)); };
const gradeName = (n) => 'الصف ' + (GRADES[n - 1] || toAr(n));
const curTermNo = () => (wz.catalog && wz.catalog.term) || ((m) => (m >= 2 && m <= 6 ? 2 : 1))(new Date().getMonth() + 1);
const pkgTerm = (p) => (p.remote ? p.remote.term : /الثاني/.test(p.term || '') ? 2 : 1);
const pkgShift = (p) => (p.remote && p.remote.shift && p.remote.shift !== 'both' ? p.remote.shift : p.shift === 'one' || p.shift === 'two' ? p.shift : 'both');
const fitsShift = (sh, want) => sh === 'both' || !sh || sh === want;
function wzMsg(type, html) { const el = $('wzMsg'); el.className = type ? 'msg show ' + type : 'msg'; el.innerHTML = html || ''; }

// كل ما يمكن تحضيره: مواد مكتبتك (مشترك/تجربة/محلية) ومواد كتالوج أفق الجاهزة للتجربة
function wzOffers() {
  const out = [];
  packages.filter((p) => (p.lessons || []).length).forEach((p) => out.push({ src: 'lib', pkg: p, id: p.remote ? p.remote.package_id : p.id, grade: gradeNumber(p), subject: p.subject || p.title || '', shift: pkgShift(p), term: pkgTerm(p) }));
  ((wz.catalog && wz.catalog.packages) || []).forEach((c) => {
    if (!out.some((o) => o.src === 'lib' && o.id === c.id && o.term === curTermNo())) out.push({ src: 'cat', cat: c, id: c.id, grade: c.grade, subject: c.subject, shift: c.shift || 'both', term: curTermNo() });
  });
  return out.filter((o) => o.grade);
}
// مواد المعلم في نور (آخر قراءة للصفحة الرئيسية) مقابل المواد المتاحة: [{ grade, subject }]
let noorCourses = [];
function wzFromNoor(offers) {
  const out = [];
  noorCourses.forEach((c) => {
    const g = (c.levels || []).map(gradeOfLevel).find(Boolean) || 0;
    offers.forEach((o) => {
      if ((g && o.grade !== g) || !sameSubject(o.subject, c.title)) return;
      if (!g && offers.filter((x) => sameSubject(x.subject, c.title)).length > 1) return;   // بلا صف معروف: فقط إن كانت المادة لصف واحد
      if (!out.some((x) => x.grade === o.grade && x.subject === o.subject)) out.push({ grade: o.grade, subject: o.subject });
    });
  });
  return out.slice(0, 6);
}
async function loadNoorCourses() {
  noorCourses = ((await chrome.storage.local.get('noorCourses').catch(() => ({}))).noorCourses || {}).courses || [];
  // نافذة نور مفتوحة على الصفحة الرئيسية؟ نقرأ البطاقات منها مباشرة (قراءة فقط، دون تنقّل)
  try {
    const tabs = await chrome.tabs.query({ url: ['https://lms.moe.gov.om/teacher*', 'https://*.moe.gov.om/teacher*'] });
    for (const t of tabs) {
      const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: readHomePage }).then((x) => x && x[0] && x[0].result).catch(() => null);
      if (r && !r.login && r.courses && r.courses.length) { noorCourses = r.courses; await chrome.storage.local.set({ noorCourses: { at: Date.now(), courses: r.courses } }).catch(() => {}); break; }
    }
  } catch (e) {}
}
// التجربة المجانية للمعلم في كل المواد معًا (الخادم يحسبها كذلك): الباقي واحد لكل مواد التجربة
function wzTrialLeft() {
  const t = packages.find((x) => x.remote && x.remote.trial);
  if (t) return Math.max(0, +t.remote.left || 0);
  if (wz.status && wz.status.trialLeft != null) return wz.status.trialLeft;
  return (wz.catalog && wz.catalog.trial) || 3;
}
const wzBadge = (o) => (o.src === 'cat' ? (wzTrialLeft() ? '<em class="bdg free">ضمن تجربتك المجانية</em>' : '')
  : o.pkg.remote && o.pkg.remote.trial ? `<em class="bdg ${o.pkg.remote.left ? 'free' : 'end'}">${o.pkg.remote.left ? 'تجربة: بقي ' + countWord(o.pkg.remote.left) : 'انتهت التجربة'}</em>`
    : o.pkg.remote ? '<em class="bdg sub">مشترك ✓</em>' : '');

function wzGo(step, push = true) {
  if (push && wz.step !== step) wz.hist.push(wz.step);
  wz.step = step;
  wzMsg('', '');
  wzRender();
}
function wzBack() { const s = wz.hist.pop(); if (s) { wz.step = s; wzMsg('', ''); wzRender(); } }
function wzCards(list, from = 0) {
  return `<div class="wz-cards">${list.map((c, i) => `<button type="button" class="wz-card ${c.on ? 'on' : ''}" data-i="${from + i}" ${c.disabled ? 'disabled' : ''}><b>${c.title}</b>${c.sub ? `<small>${c.sub}</small>` : ''}</button>`).join('')}</div>`;
}
function wzBind(list) { $('wzBody').querySelectorAll('.wz-card').forEach((b) => { b.onclick = () => { if (!wz.busy) list[+b.dataset.i].go(); }; }); }

function wzRender() {
  const i = WZ_STEPS.indexOf(wz.step === 'name' ? 'shift' : wz.step);
  $('wzDots').innerHTML = (wz.mode === 'term' ? WZ_STEPS.slice(0, 4) : WZ_STEPS).map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('');
  $('wzBack').hidden = !wz.hist.length || ['pay', 'wait'].includes(wz.step);
  const head = $('wzHead'), body = $('wzBody');
  const offers = wzOffers();
  let list = [];
  if (wz.step === 'mode') {
    head.textContent = 'ماذا تريد أن تحضّر؟';
    list = [
      { title: 'أختار الدروس بنفسي', sub: 'تختار الدرس وتكتب تاريخه', on: wz.mode === 'pick', go: () => { wz.mode = 'pick'; wzGo('grade'); } },
      { title: 'تحضير الفصل كاملًا', sub: 'كل دروس الفصل، درسًا بعد درس', on: wz.mode === 'term', go: () => { wz.mode = 'term'; wzGo('grade'); } },
    ];
    body.innerHTML = wzCards(list).replace('wz-cards', 'wz-cards big');
  } else if (wz.step === 'grade') {
    head.textContent = 'اختر الصف';
    const gs = [...new Set(offers.map((o) => o.grade))].sort((a, b) => a - b);
    if (!gs.length) { body.innerHTML = '<p class="empty">لا مواد جاهزة الآن. تأكد من اتصالك بالإنترنت ثم أعد فتح هذه النافذة.</p>'; return; }
    const nSub = (n) => (n === 1 ? 'مادة واحدة' : n === 2 ? 'مادتان' : n <= 10 ? toAr(n) + ' مواد' : toAr(n) + ' مادة');
    list = gs.map((g) => ({ title: gradeName(g), sub: nSub(new Set(offers.filter((o) => o.grade === g).map((o) => o.subject)).size), on: g === wz.grade, go: () => { wz.grade = g; wzGo('subject'); } }));
    // موادك في نور (من بطاقات الصفحة الرئيسية): اختيار بلمسة واحدة
    const mine = wzFromNoor(offers).map((m) => ({ title: esc(m.subject), sub: gradeName(m.grade), go: () => {
      wz.grade = m.grade; wz.subject = m.subject;
      const fit = offers.some((o) => o.grade === m.grade && o.subject === m.subject && wz.shift && fitsShift(o.shift, wz.shift));
      if (fit) { wz.hist.push('grade', 'subject'); wz.step = 'shift'; wzSavePrefs(); wzResolve(); } else wzGo('shift');
    } }));
    body.innerHTML = (mine.length ? `<p class="wz-note">من حسابك في نور</p>${wzCards(mine)}<p class="wz-unit">أو اختر الصف</p>` : '')
      + wzCards(list, mine.length).replace('wz-cards', 'wz-cards grid3');
    list = mine.concat(list);
  } else if (wz.step === 'subject') {
    head.textContent = `اختر المادة — ${gradeName(wz.grade)}`;
    const subs = [...new Set(offers.filter((o) => o.grade === wz.grade).map((o) => o.subject))];
    list = subs.map((sj) => { const o = offers.find((x) => x.grade === wz.grade && x.subject === sj && x.src === 'lib') || offers.find((x) => x.grade === wz.grade && x.subject === sj); return { title: esc(sj), sub: wzBadge(o), on: sj === wz.subject, go: () => { wz.subject = sj; wzGo('shift'); } }; });
    body.innerHTML = wzCards(list);
  } else if (wz.step === 'shift') {
    head.textContent = 'نوع مدرستك';
    const mine = offers.filter((o) => o.grade === wz.grade && o.subject === wz.subject);
    list = ['one', 'two'].map((k) => { const has = mine.some((o) => fitsShift(o.shift, k)); return { title: SHIFT[k].name, sub: has ? `الحصة ${toAr(SHIFT[k].min)} دقيقة` : 'تحضير هذا النوع غير جاهز بعد', disabled: !has, on: k === wz.shift, go: () => { wz.shift = k; wzSavePrefs(); wzResolve(); } }; });
    body.innerHTML = wzCards(list);
  } else if (wz.step === 'name') {
    head.textContent = 'اسمك كما في نور';
    body.innerHTML = `<p class="wz-note">تبدأ تجربتك المجانية الآن: ${toAr((wz.catalog && wz.catalog.trial) || 3)} حصص مجانًا في المواد كلها معًا، دون دفع ولا تواصل.</p>
      <p class="wz-note big"><b>اكتب اسمك كما هو مسجّل في منصة نور</b> — اشتراكك يكون باسمك، ويعمل لحساب نور الذي يحمل هذا الاسم.</p>
      <input class="input big" id="wzName" placeholder="اسمك كما في نور" autocomplete="name">
      <input class="input big" id="wzPhone" placeholder="رقم الهاتف (اختياري)" inputmode="tel" dir="ltr" style="text-align:right">
      <p class="wz-note" id="wzRefNote" hidden>دعاك زميلك ✓ — إذا اشتركت تحصلان كلاكما على خصم.</p>
      <details class="wz-code" id="wzRefBox"><summary>دعاني زميل (رقم الدعوة)</summary><input class="input big" id="wzRef" placeholder="رقم طلب زميلك، مثل 1003" inputmode="numeric" dir="ltr"></details>
      <button class="btn primary big" id="wzNameGo">ابدأ التجربة المجانية</button>`;
    $('wzName').focus();
    chrome.storage.local.get('afaqRef').then((v) => { if (v && v.afaqRef) { $('wzRefNote').hidden = false; $('wzRefBox').hidden = true; } }).catch(() => {});
    $('wzNameGo').onclick = async () => {
      const name = $('wzName').value.replace(/\s+/g, ' ').trim();
      if (name.split(' ').length < 2) { wzMsg('bad', 'اكتب اسمك كاملًا (اسمين على الأقل) كما في نور.'); return; }
      const o = wzPickOffer();
      if (!o) return;
      const ref = ($('wzRef').value || '').replace(/[^\d]/g, '');
      if (ref) await setRef(ref).catch(() => {});
      await wzBusy('أجهّز تجربتك…', async () => {
        const r = await startTrial(name, $('wzPhone').value.trim(), wz.shift, [o.id]);
        if (!r.ok && r.error === 'too_many') {
          // شبكة سجّل منها كثيرون اليوم: مسار هادئ — رسالة واتساب جاهزة باسمه ومادته، ونفتح له من لوحة الإدارة
          const wa = whatsappUrl('', `السلام عليكم، أنا ${name}، أريد تجربة «حاضر» في ${o.title || o.subject || 'مادتي'}.`);
          wzMsg('info', `نجهّز لك «حاضر» مباشرة عبر واتساب. <a class="btn wa" href="#" id="wzTooWa">راسلنا على واتساب</a>`);
          $('wzTooWa').onclick = (e) => { e.preventDefault(); openUrl(wa); };
          return;
        }
        if (!r.ok) { wzMsg('bad', wzErr(r.error)); return; }
        await wzReload();
        wzResolve(true);
      });
    };
    return;
  } else if (wz.step === 'from') {
    head.textContent = 'بداية الإدخال';
    body.innerHTML = `<p class="wz-note big">من أي تاريخ تبدأ التحاضير؟ اتركه فارغًا لتبدأ من أول الخطة.</p>
      <input class="input big wz-date" type="date" id="wzFrom" value="${isIso(WIZ.fromDate) ? WIZ.fromDate : ''}">
      <p class="wz-note">ما قبل هذا التاريخ لا يُنشر فيه شيء، وتتتابع الحصص بعده على حصصك حتى تنتهي في آخر أسبوع من الخطة.</p>
      <button class="btn primary big" id="wzFromGo">ابدأ التحضير</button>`;
    $('wzFromGo').onclick = () => { const v = $('wzFrom').value; WIZ.fromDate = isIso(v) ? v : ''; wzRun(); };
    return;
  } else if (wz.step === 'lessons') {
    wzLessons();
    return;
  } else if (wz.step === 'pay') {
    wzPayRender();
    return;
  }
  wzBind(list);
}
// «أختار الدروس بنفسي»: تضع علامة على الدرس، فتظهر حصصه وتاريخ كل حصة (يُقترح اليوم ثم ما بعده، وتغيّره كما تشاء)
function wzLessons() {
  const body = $('wzBody');
  const keep = body.querySelector('.wz-list'); const top = keep ? keep.scrollTop : 0;
  $('wzHead').textContent = 'اختر الدروس وتواريخها';
  // كل وحدة كتلة واحدة في القائمة (خطة الوزارة قد تداخل حصص وحدة مع غيرها فتبدو دروسها ناقصة)؛ ترتيب التعبئة الكاملة لا يتأثر
  const gs = groupByUnit(lessonGroups(wz.pkg));
  // لا تاريخ مقترح: المعلم يحدد تاريخ كل حصة بنفسه
  let u = null;
  body.innerHTML = wzTrialNote() + '<div class="wz-list">' + gs.map((g) => {
    const on = g.sessions.some((l) => wz.sel.has(l.id));
    const uh = g.unit !== u ? `<div class="wz-unit">${esc(g.unit || 'دروس')}</div>` : ''; u = g.unit;
    const one = g.sessions.length === 1;
    const dateIn = (l) => `<input class="input wz-date" type="date" data-d="${esc(l.id)}" value="${esc(wz.sel.get(l.id) || '')}">`;
    // خانة التاريخ تحت الدرس بالشكل نفسه للحصة الواحدة وللحصص المتعددة
    const ses = on && one ? `<div class="wz-ses"><label class="wz-s"><span>تاريخ النشر</span>${dateIn(g.sessions[0])}</label></div>`
      : on && !one ? `<div class="wz-ses">${g.sessions.map((l, k) => `<label class="wz-s"><input type="checkbox" data-s="${esc(l.id)}" ${wz.sel.has(l.id) ? 'checked' : ''}><span>الحصة ${ORD[k] || toAr(k + 1)}</span>${wz.sel.has(l.id) ? dateIn(l) : ''}</label>`).join('')}</div>` : '';
    return `${uh}<div class="wz-les ${on ? 'on' : ''}"><label class="wz-row"><input type="checkbox" data-k="${esc(g.key)}" ${on ? 'checked' : ''}><span>${esc(g.lesson || 'درس')}</span><em>${one ? '' : countWord(g.sessions.length)}</em></label>${ses}</div>`;
  }).join('') + '</div>';
  const n = wz.sel.size;
  body.insertAdjacentHTML('beforeend', `<button class="btn primary big" id="wzLessGo" ${n ? '' : 'disabled'}>${n ? `عبّئ ${countWord(n).replace('حصتان', 'الحصتين')} في نور` : 'اختر درسًا'}</button>`);
  const list = body.querySelector('.wz-list'); list.scrollTop = top;
  body.querySelectorAll('input[data-k]').forEach((cb) => {
    cb.onchange = () => {
      const g = gs.find((x) => x.key === cb.dataset.k);
      if (cb.checked) g.sessions.forEach((l) => { if (!wz.sel.has(l.id)) wz.sel.set(l.id, ''); });
      else g.sessions.forEach((l) => wz.sel.delete(l.id));
      wzLessons();
    };
  });
  body.querySelectorAll('input[data-s]').forEach((cb) => {
    cb.onchange = () => { if (cb.checked) wz.sel.set(cb.dataset.s, ''); else wz.sel.delete(cb.dataset.s); wzLessons(); };
  });
  body.querySelectorAll('input[data-d]').forEach((d) => { d.onclick = (e) => e.stopPropagation(); d.onchange = () => { wz.sel.set(d.dataset.d, isIso(d.value) ? d.value : ''); }; });
  $('wzLessGo').onclick = () => {
    if ([...wz.sel.values()].some((v) => !isIso(v))) { wzMsg('info', 'اكتب تاريخ كل حصة اخترتها.'); return; }
    wzRun();
  };
}
// الوحدات بترتيب أول ظهورها، ودروس كل وحدة بترتيب ظهورها (لا ترتيب رقمي: أرقام العناوين قد تكون مسافات أو أعدادًا من المحتوى)
function groupByUnit(groups) {
  const units = new Map();
  groups.forEach((g) => { const k = String(g.unit || '').replace(/\s+/g, ' ').trim(); if (!units.has(k)) units.set(k, []); units.get(k).push(g); });
  return [...units.values()].flat();
}
function wzTrialNote() {
  const r = wz.pkg && wz.pkg.remote;
  return r && r.trial ? `<p class="wz-note">${r.left ? `تجربتك المجانية: بقي لك ${countWord(r.left)} (في كل المواد معًا).` : 'انتهت حصصك المجانية.'}</p>` : '';
}
function wzPickOffer() {
  const mine = wzOffers().filter((o) => o.grade === wz.grade && o.subject === wz.subject && fitsShift(o.shift, wz.shift));
  // المطابقة التامة لنوع المدرسة أولًا، ثم مكتبتك، ثم الفصل الجاري
  mine.sort((a, b) => (b.shift === wz.shift) - (a.shift === wz.shift) || (b.src === 'lib') - (a.src === 'lib') || (b.term === curTermNo()) - (a.term === curTermNo()));
  if (!mine.length) { wzMsg('bad', 'لم أجد تحضير هذه المادة لهذا النوع من المدارس.'); return null; }
  return mine[0];
}
// المادة جاهزة: «أختار الدروس بنفسي» ← قائمة الدروس · «الفصل كاملًا» ← التعبئة مباشرة
function wzOpen(p) {
  wz.pkg = p;
  if (p.remote && p.remote.trial && !p.remote.left) { payResume = 'open'; wzGo('pay'); return; }
  const ids = new Set((p.lessons || []).map((l) => l.id));
  [...wz.sel.keys()].forEach((k) => { if (!ids.has(k)) wz.sel.delete(k); });
  if (wz.mode === 'term') { if (FROM_STEP) wzGo('from'); else wzRun(); } else wzGo('lessons');
}
// بعد نوع المدرسة: مادة في مكتبتك ← wzOpen · مادة من الكتالوج ← تجربة (الاسم أول مرة)
async function wzResolve(noName) {
  const o = wzPickOffer();
  if (!o) return;
  if (o.src === 'lib') { wzOpen(o.pkg); return; }
  if (!wz.link) { if (noName) { wzMsg('bad', 'لم تظهر المادة بعد التسجيل — أعد المحاولة.'); return; } wzGo('name'); return; }
  await wzBusy('أضيف المادة إلى تجربتك…', async () => {
    const r = await pickPackages([o.id], wz.shift);
    if (!r.ok) { wzMsg('bad', wzErr(r.error)); return; }
    await wzReload();
    const o2 = wzPickOffer();
    if (o2 && o2.src === 'lib') wzOpen(o2.pkg); else wzMsg('bad', 'لم تظهر المادة في مكتبتك بعد — أعد المحاولة بعد قليل.');
  });
}
const wzErr = (e) => ({ name: 'اكتب اسمك كاملًا.', shift: 'اختر نوع المدرسة.', packages: 'المادة غير متاحة الآن.', too_many: 'too_many', unlinked: 'انتهى ربط هذا الجهاز — أعد فتح النافذة.', expired: 'انتهى هذا الاشتراك.', devices: 'بلغت الحد الأقصى للأجهزة (جهازان) — راسلنا على واتساب.', network: 'تعذّر الاتصال بالإنترنت — تحقق ثم أعد المحاولة.', server: 'الخادم لم يستجب — أعد المحاولة بعد قليل.' }[e] || 'تعذّر إكمال الطلب — أعد المحاولة.');
async function wzBusy(text, fn) {
  wz.busy = true; wzMsg('info', `<span class="spin"></span>${esc(text)}`);
  try { await fn(); if ($('wzMsg').classList.contains('info')) wzMsg('', ''); } catch (e) { wzMsg('bad', wzErr('network')); }
  finally { wz.busy = false; }
}
async function wzReload() {
  const r = await getPackages(); packages = r.packages; state = r.state;
  wz.link = await getLink(); wz.status = await getStatus();
  await init();
}
async function wzSavePrefs() { await chrome.storage.local.set({ wizPrefs: { grade: wz.grade, subject: wz.subject, shift: wz.shift } }).catch(() => {}); }

// «ابدأ»: المعالج يضبط المحرّك (المخفي) ثم يشغّله
async function wzRun() {
  const p = wz.pkg;
  if (!p) return;
  if (p.remote && p.remote.trial && !p.remote.left) { payResume = 'start'; wzGo('pay'); return; }
  await init();   // المكتبة كما هي الآن
  if (![...$('pkgSel').options].some((o) => o.value === p.id)) { wzMsg('bad', 'المادة لم تعد في مكتبتك — أعد فتح النافذة.'); return; }
  $('pkgSel').value = p.id; startTouched = false; $('pkgSel').onchange();
  termNo = pkgTerm(p);
  const tr = document.querySelector(`input[name=term][value="${termNo}"]`); if (tr) tr.checked = true;
  const pick = wz.mode === 'pick';
  // اختيار المعلم: الحصص التي وضع عليها علامة، كلٌّ بتاريخها كما كتبه (لا نشرة ولا خطة أسبوعية)
  WIZ.pickDates = pick ? Object.fromEntries(wz.sel) : null;
  scope.kind = pick ? 'pick' : 'term';
  scope.picks = new Set(pick ? lessonGroups(p).filter((g) => g.sessions.some((l) => wz.sel.has(l.id))).map((g) => g.key) : []);
  // الفصل كاملًا: بتواريخ النشرة الرسمية إن كانت في ملف المادة، وإلا متتابعًا من أول يوم دراسي قادم
  const fileOk = !pick && hasFileDates(p);
  const rd = document.querySelector(`input[name=dsrc][value="${fileOk ? 'file' : 'seq'}"]`); if (rd) rd.checked = true;
  useFile = fileOk;
  const first = pick ? [...wz.sel.values()].filter(isIso).sort()[0] : '';
  $('start').value = first || nextSchoolDay(todayIso(), daysFor(state, settings, p.id), true); renderDays();
  $('optReview').checked = false;
  $('optStep').checked = false;
  $('optNoor').checked = true; $('optAuto').checked = true;
  WIZ.on = true; WIZ.rule = fileOk ? 'official' : ''; WIZ.seq = !fileOk;
  WIZ.rid = Date.now(); WIZ.sum = 0; WIZ.auto = 0;
  wizRunning();
  run();
}
function wizRunning() {
  document.body.classList.add('wiz-run');
  $('wizCard').hidden = true;
  $('wzAgain').hidden = true; $('wzResume').hidden = true; $('wzMore').hidden = true;
  clearTimeout(WIZ.timer);
}
// بعد انتهاء التشغيل: سطر واحد هادئ. ما بقي يُكمَل وحده مرة بعد مهلة، ثم يبقى زر «أكمل الباقي» — دون لغة أخطاء
const WZ_AUTO_MS = 20000;
async function wizAfterRun({ report, ok, failed, stopped, error, had, past = 0 }) {
  error = error ? String(error).replace(/^توقف:\s*/, '').trim() || ' ' : '';
  WIZ.sum += ok;
  $('topMsg').className = 'msg';
  $('wzAgain').hidden = false;
  $('wzResume').hidden = true;
  if (pkg && pkg.remote && pkg.remote.trial) {
    await afaqSync({ force: true }).catch(() => {});
    const r = await getPackages(); packages = r.packages; state = r.state;
    const p2 = packages.find((x) => x.id === pkg.id) || pkg;
    // انتهت الحصص المجانية: ما بقي منها لم يكتمل حفظه (جُلب ولم يُحفظ) يُكمَل أولًا، ثم شاشة الاشتراك
    // انتهت الحصص المجانية: لا إعادة تلقائية تصطدم بنهاية التجربة — شاشة التفعيل مباشرة، ويكمل التحضير وحده بعد التفعيل
    if (WIZ.trialOver || (p2.remote && p2.remote.trial && !p2.remote.left)) { wz.pkg = p2; payResume = 'run'; showPay(p2); return; }
  }
  if (WIZ.trialOver) { payResume = 'run'; showPay(pkg); return; }
  const n = WIZ.sum;
  const range = wzRange(report);
  if (stopped) {
    setBox('ok', n ? `أوقفتَ التحضير — نُشر ${countWord(n)}` : 'أوقفتَ التحضير', 'تكمل الباقي متى شئت، وما نُشر لا يتكرر.');
    wzResumeBtn('▶ أكمل الباقي');
    return;
  }
  if ((failed || error) && WIZ.auto < 1) {
    WIZ.auto++;
    let left = Math.round(WZ_AUTO_MS / 1000);
    const head = failed ? `بقيت ${countWord(failed)} — أكملها الآن` : 'أكمل التحضير';
    const tick = () => {
      setBox('run', head, `أمهل نور قليلًا ثم أكمل وحدي بعد ${toAr(left)} ثانية.${n ? ` نُشر حتى الآن ${countWord(n)}.` : ''}`);
      if (left-- <= 0) { wizRunning(); run(); return; }
      WIZ.timer = setTimeout(tick, 1000);
    };
    wzResumeBtn('▶ أكمل الآن');
    tick();
    return;
  }
  if (failed || error) {
    if (!n) setBox('ok', 'التحضير جاهز للإكمال', `${wzHint(error)}اضغط «أكمل الباقي» وأكمل من حيث وصلت.`);
    else setBox('ok', `✓ نُشر ${countWord(n)}${range}`, `${failed ? `بقيت ${countWord(failed)}` : 'بقي القليل'} — اضغط «أكمل الباقي» بعد قليل وأنشرها لك دون تكرار.`);
    wzResumeBtn('▶ أكمل الباقي');
    return;
  }
  if (wz.mode === 'pick') $('wzMore').hidden = false;
  // نور لا تقبل تاريخًا مضى: ما مضى تاريخه تُرك بهدوء، ويُذكر للمعلم دون صيغة خطأ
  const pt = past ? ` ${past === 1 ? 'حصة واحدة مضى تاريخها' : `${countWord(past)} مضى تاريخها`} ونور لا تقبل نشرها بتاريخ ماضٍ، فتركتها.` : '';
  if (!n) { setBox('ok', had ? '✓ هذه الحصص موجودة في نور' : past || wz.mode === 'pick' ? '✓ انتهى' : '✓ لا شيء ناقص', `${pt}${wz.mode === 'pick' ? ' هل تختار درسًا آخر؟' : ''}`.trim()); return; }
  // ما لا يقابله درس في شجرة نور لا يُذكر للمعلم (يبقى في سجل المشرف وحده)
  setBox('ok', '✓ تمت التعبئة بنجاح', `نُشر ${countWord(n).replace('حصتان', 'حصتين')}${range}.${pt}${wz.mode === 'pick' ? ' هل تختار درسًا آخر؟' : ''}`);
}
// ما يفعله المعلم ليكمل، دون عرض نص الخطأ (يبقى في السجل والتقرير)
function wzHint(e) {
  e = String(e || '');
  if (/بطاقات المواد|الصفحة الرئيسية/.test(e)) return 'افتح نور وسجّل دخولك بحساب المعلم، ثم ';
  if (/الشجرة|الفصل|دروس تحت|إضافة تحضير/.test(e)) return 'افتح «تحضير الدروس» في نور مرة، ثم ';
  if (/الاتصال|الإنترنت/.test(e)) return 'تأكد من الإنترنت، ثم ';
  return '';
}
// مدى تواريخ ما نُشر في هذا الطلب (من التقرير المدمج)
function wzRange(r) {
  const ds = ((r && r.saved) || []).map((x) => x.d).filter(isIso).sort();
  if (!ds.length) return '';
  return ds[0] === ds[ds.length - 1] ? ` يوم ${dayLabel(ds[0])}` : ` من ${dayLabel(ds[0])} إلى ${dayLabel(ds[ds.length - 1])}`;
}
// «ادعُ زميلًا»: رابط دعوة برقم طلبك، نسخ أو إرسال على واتساب، ومن اشترك بدعوتك
async function wzInviteFill(el) {
  if (!el) return;
  el.innerHTML = '<span class="spin"></span>';
  const r = await referral().catch(() => null);
  if (!r || !r.ok) { el.remove(); return; }
  wz.ref = r;
  const disc = r.discount ? `خصم ${esc(r.discount)}` : 'خصمًا';
  el.innerHTML = `<b>🎁 ادعُ زميلًا: إذا اشترك تحصلان كلاكما على ${disc}</b>
    <div class="row"><input class="input" readonly value="${esc(r.url)}"><button class="btn sm" type="button" data-copy>نسخ</button><button class="btn sm wa" type="button" data-wa>واتساب</button></div>
    ${r.invited ? `<small class="hint">دعوت ${toAr(r.invited)}${r.invited_active ? `، واشترك ${toAr(r.invited_active)} — خصمك محفوظ لك` : ''}.</small>` : ''}`;
  el.querySelector('[data-copy]').onclick = async (e) => { try { await navigator.clipboard.writeText(r.url); e.target.textContent = '✓ نُسخ'; } catch (x) { el.querySelector('input').select(); } };
  el.querySelector('[data-wa]').onclick = () => openUrl('https://wa.me/?text=' + encodeURIComponent(`جرّب «حاضر»: يعبّئ تحاضيرك في نور ويحفظها وحده. أول ٣ حصص مجانًا${r.discount ? `، وإذا اشتركت نحصل كلانا على خصم ${r.discount}` : ''}:\n${r.url}`), '_blank');
}
async function showUpdate() {
  const u = await updateInfo().catch(() => null);
  if (!u) return;
  $('updText').textContent = `نسخة جديدة من «حاضر» (${u.latest}) — حدّثها لتحصل على آخر الإصلاحات.`;
  $('updGo').href = u.url;
  $('updBar').hidden = false;
}
function wzResumeBtn(label) {
  const b = $('wzResume');
  b.textContent = label; b.hidden = false;
}
function wzAgain() {
  clearTimeout(WIZ.timer);
  document.body.classList.remove('wiz-run', 'showplan');
  WIZ.on = false; WIZ.rule = ''; WIZ.seq = false; WIZ.trialCap = null; WIZ.pickDates = null;
  $('wizCard').hidden = false;
  $('nowCard').hidden = true; $('planCard').hidden = true; $('logCard').hidden = true;
  $('topMsg').className = 'msg';
  wz.sel = new Map();
  wz.hist = []; wzReload().then(() => wzGo('mode', false));
}
// «اختر درسًا آخر»: قائمة دروس المادة نفسها مباشرة
function wzMore() {
  clearTimeout(WIZ.timer);
  document.body.classList.remove('wiz-run', 'showplan');
  WIZ.on = false; WIZ.rule = ''; WIZ.seq = false; WIZ.trialCap = null; WIZ.pickDates = null;
  $('wizCard').hidden = false;
  $('nowCard').hidden = true; $('planCard').hidden = true; $('logCard').hidden = true;
  $('topMsg').className = 'msg';
  wz.sel = new Map();
  wzReload().then(() => { const o = wzPickOffer(); wz.hist = ['mode', 'grade', 'subject', 'shift']; if (o && o.src === 'lib') wzOpen(o.pkg); else wzGo('mode', false); });
}

// ---------- انتهت التجربة: واتساب، ثم التفعيل يصل وحده ----------
function showPay(p) {
  wz.pkg = p || wz.pkg;
  document.body.classList.remove('wiz-run');
  $('wizCard').hidden = false;
  wz.hist = [];
  wzGo('pay', false);
}
let payTimer = null;
// رقم واتساب للعرض فقط (دون رابط): 96876506037 ← 76506037
const waShow = (n) => { const d = String(n || '').replace(/\D/g, '').replace(/^00/, '') || '96876506037'; return d.length === 11 && d.startsWith('968') ? d.slice(3) : d; };
let payAsked = false;
let payResume = '';   // ما يكمل وحده بعد التفعيل: 'run' تشغيل توقف عند نهاية التجربة · 'start' بدء التعبئة · 'open' فتح المادة
let payReclaim = false;
function wzPayRender() {
  if (!payReclaim) {
    payReclaim = true;
    $('wzHead').textContent = 'أتحقق من اشتراكك';
    $('wzBody').innerHTML = `<p class="wz-note big"><span class="spin"></span>لحظة…</p>`;
    reclaim().then((ok) => { if (wz.step !== 'pay') return; if (ok) wzActivated(); else wzPayRender(); });
    return;
  }
  const st = wz.status || {};
  const req = st.request || {};
  $('wzHead').textContent = 'انتهت تجربتك المجانية';
  $('wzBody').innerHTML = `<p class="wz-note big">لتفعيل اشتراكك تواصل معنا على واتساب، واذكر اسمك والمواد التي تريدها.</p>
    <div class="wz-wa"><span>واتساب</span><b dir="ltr">${esc(waShow(st.whatsapp))}</b></div>
    ${req.id ? `<p class="wz-line">رقم طلبك: <b>${toAr(req.id)}</b></p>` : ''}
    <p class="hint">${payResume ? 'اطلب التفعيل، وبعده يكمل التحضير وحده من حيث توقف — أبقِ هذه النافذة ونور مفتوحتين.' : 'بعد التفعيل تظهر موادك هنا وحدها.'}</p>
    <button class="btn sm" id="wzOther">رجوع</button>`;
  $('wzOther').onclick = () => { clearInterval(payTimer); payResume = ''; wzAgain(); };
  // يُسجَّل الطلب «بانتظار التفعيل» في لوحة الإدارة (مرة واحدة)
  if (!payAsked && req.status !== 'requested' && req.status !== 'active') { payAsked = true; contactRequest().then((r) => { if (r && r.ok) wz.status = Object.assign({}, st, { request: Object.assign({}, req, { id: r.request || req.id, status: r.status || 'requested' }) }); }).catch(() => {}); }
  clearInterval(payTimer);
  if (req.status !== 'active') payTimer = setInterval(wzPoll, 20000);   // يفتح وحده متى فعّله المشرف
}
async function wzPoll() {
  if (wz.step !== 'pay') { clearInterval(payTimer); return; }
  const before = new Set(packages.filter((x) => x.remote && x.remote.trial).map((x) => x.id));
  if (await reclaim(false)) { if (wz.step === 'pay') await wzActivated(); return; }
  await afaqSync({ force: true }).catch(() => {});
  const r = await getPackages(); packages = r.packages; state = r.state; wz.status = await getStatus();
  const opened = packages.some((x) => before.has(x.id) && x.remote && !x.remote.trial);
  if (opened || (wz.status && wz.status.request && wz.status.request.status === 'active')) await wzActivated();
}
async function wzActivated() {
  clearInterval(payTimer);
  await wzReload();
  const how = payResume; payResume = '';
  const p = wz.pkg && packages.find((x) => x.id === wz.pkg.id);
  if (how && p && !(p.remote && p.remote.trial)) {
    // التحضير يكمل وحده من حيث توقف، بالاختيارات نفسها (ما نُشر لا يتكرر: يُقرأ من قائمة نور)
    wz.pkg = p;
    if (how === 'run' && WIZ.on) {
      if ($('pkgSel')) $('pkgSel').value = p.id;
      WIZ.auto = 0;
      wizRunning();
      setBox('run', '✓ فُعّل اشتراكك', 'أكمل التحضير الآن من حيث توقف.');
      run();
      return;
    }
    if (how === 'start') { wzRun(); return; }
    if (how === 'open') { wzOpen(p); return; }
  }
  $('wzHead').textContent = '✓ فُعّل اشتراكك';
  $('wzBody').innerHTML = `<p class="wz-note big">موادك جاهزة الآن.</p><button class="btn primary big" id="wzCont">ابدأ</button>`;
  $('wzCont').onclick = () => { wz.hist = []; wzAgain(); };
}

// كل فتح للأداة يبدأ بسجل نظيف: ما أُدخل من قبل لا يُعدّ (ربما حذفه المعلم من نور ويريد إدخاله من جديد).
// ما هو موجود فعلًا في نور يُقرأ من قائمة نور عند التعبئة فلا يتكرر.
async function freshRecord() {
  try {
    const r = await getPackages();
    const st = r.state;
    st.sessions = {}; delete st.lastPub; delete st.chain; delete st.dateOverrides;
    await savePkgState(st);
    // نسخة احتياطية تُستعمل فقط إن تعذّرت قراءة قائمة نور كاملة (حتى لا يتكرر ما هو موجود فيها)
    const v = await chrome.storage.local.get(['semesterSaved', 'semesterSavedBak']);
    const bak = v.semesterSavedBak || {};
    Object.entries(v.semesterSaved || {}).forEach(([cid, m]) => { bak[cid] = Object.assign(bak[cid] || {}, m); });
    await chrome.storage.local.set({ semesterSaved: {}, semesterSavedBak: bak });
    await chrome.storage.local.remove(['noorList', 'lastFill']);
    state = st;
  } catch (e) {}
}
async function wizBoot() {
  flushFillLog().catch(() => {});   // ما بقي في سجل المشرف من جلسة سابقة يُرسل في الخلفية
  if (q.get('classic')) { document.body.classList.remove('wiz'); return; }
  document.body.classList.add('wiz');
  $('wzResume').onclick = () => { wizRunning(); run(); };
  $('wzMore').onclick = wzMore;
  showUpdate();
  $('wzBack').onclick = wzBack;
  $('wzAgain').onclick = wzAgain;
  if (WIZ.on) return;   // تشغيل سابق يُستأنف
  await freshRecord();
  wz.link = await getLink(); wz.status = await getStatus();
  const pf = (await chrome.storage.local.get('wizPrefs').catch(() => ({}))).wizPrefs || {};
  wz.grade = pf.grade || 0; wz.subject = pf.subject || ''; wz.shift = pf.shift || '';
  wzRender();
  const [cat] = await Promise.all([afaqCatalog().catch(() => null), wz.link ? afaqSync().catch(() => {}) : null, loadNoorCourses()]);
  settings = await getSettings();   // إجازات التقويم الرسمي وصلت مع الكتالوج
  wz.catalog = cat && cat.ok !== false ? cat : null;
  const r = await getPackages(); packages = r.packages; state = r.state; wz.status = await getStatus();
  if (q.get('pay')) { const p0 = packages.find((x) => x.id === q.get('pkg')) || packages.find((x) => x.remote && x.remote.trial); if (p0) { showPay(p0); return; } }
  if (!WIZ.on) wzRender();
}
initDone.then(wizBoot).catch(() => {});
