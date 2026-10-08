// semester.js — «تحضير فصل كامل»
// يبدأ من الصفحة الرئيسية في نور ← بطاقة المادة ← «تحضير الدروس» ← «إضافة تحضير»، ثم يقرأ دروس الفصل الدراسي المختار
// (الأول أو الثاني) من شجرة نور بترتيبها، ويطابقها بكل دروس المادة في مكتبتك (الفصل = كل ما في الملف، بعدد حصص كل درس)،
// ثم يعبّئ كل حصة ويحفظها بتواريخ نشر متتالية من التاريخ المحدد حتى آخر درس — دون أن يلمس الفصل الآخر.
// اختيار الدرس في نور يتم بنصّه (الفصل ← الوحدة ← الدرس)، لأن نور تعيد إنشاء عقد الوحدات بمعرّفات جديدة عند كل اختيار.
import {
  getPackages, getSettings, fillNoor, pageContext, clickSave, pageAlerts, judgeSave, isoOf, dayLabel, DAY_NAMES,
  groupKey, lessonGroups, sessionStatus, markSaved, markSaveFailed, daysFor, setPkgDays, usedDates, nextSchoolDay,
  gradeNumber, gradeOfName, sameSubject, unsavedText, kwNorm, ordinalOf, getPicks,
  noorTerms, termAllLessons, pickTreeNode, stripSessionSuffix, sessionSuffix, lessonNum,
  layoutDates, isIso, inWeekOf, weekStart, weekEnd, hasFileDates, datedCount, lintPackage, lintLevel, knownCourse, rememberCourse,
} from './packages.js';
import { unitNum, bestTreeLesson, kwScore, titleSim } from './match.js';
import { alignGroups } from './align.js';
import { AFAQ } from './afaq-config.js';
import { siteUrl, sync as afaqSync } from './remote.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortT = (t) => { const h = String(t || '').split(/[:：]/)[0].trim(); return h && h.length <= 28 ? h : String(t || '').slice(0, 28) + '…'; };
const countWord = (n) => (n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n <= 10 ? toAr(n) + ' حصص' : toAr(n) + ' حصة');
const termName = (n) => (n === 1 ? 'الأول' : 'الثاني');
const HOME = 'https://lms.moe.gov.om/teacher';
const q = new URLSearchParams(location.search);

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
const scope = { kind: 'term', units: new Set(), weekDay: '', from: '', to: '' };
let useFile = false;       // تواريخ الملف تُستعمل (المادة فيها تواريخ واخترتَ «كما في الملف»)
const dateNotes = new Set();   // ملاحظات نقل التواريخ التي سُجّلت (حتى لا تتكرر)
let lintRes = null;
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

// تواريخ لا تُستعمل: تواريخ حصص أخرى محفوظة أو معبّأة (ليست من المرشّحة الآن)
function fixedDates(cands) {
  const ids = new Set((cands || []).map((s) => s.lesson.id));
  return new Set(Object.entries(usedDates(pkg, state)).filter(([, arr]) => arr.some((u) => !ids.has(u.lessonId))).map(([d]) => d));
}
// هل الحصة ضمن النطاق المختار؟
function inScope(s) {
  const p = s.p;
  if (scope.kind === 'unit') return scope.units.size ? scope.units.has(kwNorm(p.group.unit || '')) : true;
  if (scope.kind === 'week') return scope.weekDay ? inWeekOf(s.date, scope.weekDay) : true;
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
function assignDates() {
  const pos = (p) => (p.node ? treeNodes.indexOf(p.node) : 1e9);
  const ordered = plan.slice().sort((a, b) => pos(a) - pos(b) || a.i - b.i);
  const cands = ordered.flatMap((p) => p.sessions.filter((s) => s.eligible));
  const taken = fixedDates(cands);
  const items = cands.map((s) => ({ s, fileDate: useFile && isIso(s.lesson.pubDate) ? s.lesson.pubDate : '', fixed: s.fixed || '' }));
  const notes = layoutDates(items, { start: $('start').value || isoOf(new Date()), days, taken: [...taken], useFileDates: useFile });
  items.forEach((it) => { it.s.date = it.date; it.s.dateSrc = it.dateSrc; it.s.movedFrom = ''; });
  notes.forEach((n) => {
    const s = items[n.i].s;
    if (n.src === 'file' || n.src === 'fixed') s.movedFrom = n.from;
    const key = s.lesson.id + '|' + n.from + '|' + n.to;
    if (n.src === 'file' && !dateNotes.has(key)) { dateNotes.add(key); logLine('info', `تاريخ الملف ${dayLabel(n.from)} لـ«${shortT(s.lesson.title)}» ${n.why === 'offday' ? 'يوم بلا حصص' : 'مستعمل لحصة أخرى'} — نقلته إلى ${dayLabel(n.to)}`); }
  });
  cands.forEach((s) => { s.on = s.manual != null ? s.manual : inScope(s); });
  plan.forEach((p) => p.sessions.filter((s) => !s.eligible).forEach((s) => { s.on = false; s.date = s.date || ''; }));
  queue = cands.filter((s) => s.on).sort((a, b) => a.date.localeCompare(b.date) || cands.indexOf(a) - cands.indexOf(b));
  if (scope.kind === 'week' && scope.weekDay) $('weekHint').textContent = `${dayLabel(weekStart(scope.weekDay))} – ${dayLabel(weekEnd(scope.weekDay))}: ${countWord(queue.length)}`;
}
// تأجيل حصة إلى يوم الحصة التالي المتاح (رفضت نور تاريخها أو لا صفوف فيه): يثبت تاريخها الجديد، وما بعدها بلا تاريخ ملف يتبعها
function shiftDate(s) {
  const fixed = fixedDates(plan.flatMap((p) => p.sessions.filter((x) => x.eligible)));
  queue.forEach((x) => { if (x !== s && x.date && (x.fixed || (useFile && isIso(x.lesson.pubDate)))) fixed.add(x.date); });   // المراسي فقط؛ المتسلسلة تتبع
  let c = nextSchoolDay(s.date, days, false);
  for (let i = 0; i < 60 && fixed.has(c); i++) c = nextSchoolDay(c, days, false);
  s.fixed = c;
  assignDates();
  renderPlan();
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

const HOW = { order: ['warn', 'بالترتيب — تأكد'], ordinal: ['ok', 'بترقيم الدرس'], pick: ['ok', 'اختيارك السابق'], manual: ['ok', 'اخترته أنت'], exact: ['ok', ''], name: ['ok', 'بالاسم التقريبي'], number: ['warn', 'برقم الوحدة فقط — تأكد'] };
function dupNodes() { const seen = new Map(); plan.forEach((p) => { if (p.node) seen.set(p.node.id, (seen.get(p.node.id) || 0) + 1); }); return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id)); }
function conflicts() {
  const dup = dupNodes();
  return {
    miss: plan.filter((p) => p.miss && !p.skipped),
    weak: plan.filter((p) => !p.miss && (p.how === 'order' || p.how === 'number') && p.sessions.some((s) => s.on)),
    dup: plan.filter((p) => p.node && dup.has(p.node.id)),
  };
}
let editable = false;   // تعديل الربط مسموح أثناء مراجعة الخطة وقبل البدء
function nodeOptions(sel) {
  const units = [...new Set(treeNodes.map((n) => n.unit))];
  return `<option value="">— تخطَّ هذا الدرس —</option>` + units.map((u) => `<optgroup label="${esc(u)}">${treeNodes.filter((n) => n.unit === u).map((n) => `<option value="${esc(n.id)}" ${sel === n ? 'selected' : ''}>${esc(n.text)}</option>`).join('')}</optgroup>`).join('');
}
function renderPlan() {
  if (!plan.length) { $('planCard').hidden = true; return; }
  $('planCard').hidden = false;
  const c = conflicts();
  const matched = plan.filter((p) => !p.miss).length;
  const n = plan.flatMap((p) => p.sessions.filter((s) => s.on)).length;
  const inNoor = plan.flatMap((p) => p.sessions.filter((s) => s.inNoor)).length;
  $('planSum').textContent = `— ${toAr(plan.length)} درسًا في ملفك، مربوط منها بدروس نور ${toAr(matched)}${noorHave ? ` · موجود في نور ${countWord(inNoor)}` : ''} · سيُعبّأ ${countWord(n)}`
    + (c.miss.length + c.weak.length + c.dup.length ? ` · للمراجعة: ${toAr(c.miss.length + c.weak.length + c.dup.length)}` : '');
  const dup = dupNodes();
  $('plan').innerHTML = plan.map((p, i) => {
    const h = HOW[p.how] || ['ok', ''];
    const flag = p.node && dup.has(p.node.id) ? '<span class="flag bad">⚠ درس نور نفسه مربوط بدرس آخر من ملفك</span>'
      : p.miss ? `<span class="flag ${p.skipped ? 'ok' : 'bad'}">${p.skipped ? 'تخطّيته' : '⚠ ' + esc(p.why || 'لم أجده في شجرة هذا الفصل')}</span>`
        : h[1] ? `<span class="flag ${h[0]}">${h[1]}</span>` : '';
    const cls = p.node && dup.has(p.node.id) ? 'bad' : p.miss && !p.skipped ? 'bad' : h[0] === 'warn' ? 'warn' : '';
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
      const mv = s.movedFrom ? ` <span class="mv">(كان ${esc(dayLabel(s.movedFrom, false))})</span>` : '';
      return `<div class="ses ${s.cur ? 'cur' : ''}" data-id="${esc(s.lesson.id)}">
        <input type="checkbox" ${s.on ? 'checked' : ''} ${!editable || p.miss ? 'disabled' : ''} aria-label="تحديد الحصة">
        <div>${esc(s.lesson.title)}${s.on && s.date ? `<small>النشر: ${esc(dayLabel(s.date))}${src}${mv}</small>` : !s.on && s.eligible ? '<small>خارج النطاق المختار</small>' : ''}</div>${stat}</div>`;
    }).join('');
    return `<div class="lesson">${head}${rows}</div>`;
  }).join('');
  $('plan').querySelectorAll('.ses input').forEach((cb) => {
    cb.onchange = () => {
      const s = plan.flatMap((p) => p.sessions).find((x) => x.lesson.id === cb.closest('.ses').dataset.id);
      if (s) { s.manual = cb.checked; assignDates(); renderPlan(); }
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
function presence(p) {
  const have = p.node && noorHave ? (noorHave.get(kwNorm(p.node.text)) || []) : [];
  p.sessions.forEach((s, k) => {
    s.p = p;
    s.inNoor = have.includes(k + 1) || !!semSaved[s.lesson.id];
    s.eligible = !!p.node && !s.inNoor && !s.savedNow && (noorHave ? true : !done(s.lesson));
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
  const t = win ? await chrome.tabs.create({ url: HOME, active: true, windowId: win }) : (await chrome.windows.create({ url: HOME, type: 'normal' })).tabs[0];
  tabId = t.id;
  await waitComplete(25000);
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
  if (!titles.length || titles.some((t) => !t || t === '[object Object]')) titles = Array.from(el.querySelectorAll('tbody tr .title-text')).map((x) => x.textContent.replace(/\s+/g, ' ').trim());
  return { ok: true, total, titles };
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
    if (bar) { showBar({ id, kind, title: 'حاضر: ' + head, text: String(text || '').split('\n')[0], buttons }); focusNoor(); }
    else chrome.windows.getCurrent().then((w) => chrome.windows.update(w.id, { focused: true })).catch(() => {});
    if (poll) iv = setInterval(async () => { try { const v = await poll(); if (v) finish(v); } catch (e) {} }, pollMs);
  });
}

// انتهت جلسة نور: ننتظر تسجيل الدخول ثم نكمل
async function loginWait(url) {
  const a = await ask({
    kind: 'warn', head: 'يبدو أن جلسة نور انتهت — سجّل الدخول',
    text: 'بعد تسجيل الدخول أكمل تلقائيًا من حيث توقفت.',
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
    for (let j = 0; j < 4 && !stopFlag; j++) {
      const r = await exec(readHomePage);
      if (r && r.login) { if (!(await loginWait(HOME))) return null; j = -1; continue; }
      if (r && r.courses.length) return r.courses;
      await sleep(1500);
    }
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
  const known = knownCourse(state, pkg.id);
  const kc = known && courses.find((c) => c.cid === known.cid);
  if (kc) { logLine('info', `بطاقة المادة (اختيارك السابق): «${kc.title} — ${(kc.levels || []).join(' · ')}»`); return kc; }
  const g = gradeNumber(pkg);
  const gradeOf = (c) => (c.levels || []).map(gradeOfLevel).find(Boolean) || 0;
  let cands = courses.filter((c) => sameSubject(pkg.subject || pkg.title, c.title));
  if (g && cands.length > 1) { const byG = cands.filter((c) => gradeOf(c) === g); if (byG.length) cands = byG; }
  // لا تطابق بالاسم: الأقرب لفظًا إن كان قريبًا بوضوح (مثل «دراسات اجتماعية» و«الدراسات الاجتماعية»)
  if (!cands.length) {
    const scored = courses.map((c) => ({ c, v: titleSim(pkg.subject || pkg.title, c.title) })).filter((x) => x.v >= 0.6).sort((x, y) => y.v - x.v);
    if (scored.length === 1 || (scored.length > 1 && scored[0].v - scored[1].v >= 0.25)) { cands = [scored[0].c]; logLine('info', `البطاقة الأقرب لاسم المادة: «${scored[0].c.title}»`); }
    else if (scored.length) cands = scored.map((x) => x.c);
  }
  if (cands.length === 1) { logLine('info', `بطاقة المادة: «${cands[0].title} — ${(cands[0].levels || []).join(' · ')}»`); await rememberCourse(pkg.id, cands[0]).catch(() => {}); return cands[0]; }
  const list = (cands.length ? cands : courses).slice(0, 6);
  // الاسم مطابق لأكثر من بطاقة (صفوف أو شُعب): نسأل، وفي التشغيل التلقائي تُختار الأولى بعد مهلة
  const auto = $('optAuto').checked && cands.length > 1;
  const a = await ask({
    kind: 'warn', head: cands.length ? 'أكثر من بطاقة تطابق المادة — اختر' : 'لم أجد بطاقة تطابق المادة — اختر البطاقة الصحيحة',
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
  let titles = null, total = -1;
  for (let i = 0; i < 3 && !stopFlag && !titles; i++) {
    if (i) await sleep(2500);
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: readAllPrepTitles });
      const v = r && r[0] && r[0].result;
      if (v && v.ok && (v.titles.length || v.total === 0)) { titles = v.titles; total = v.total; }
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
    let n = sessionSuffix(t) || 1;
    while (list.includes(n)) n++;
    list.push(n); have.set(k, list);
  });
  have.partial = total === -2 || total > titles.length;   // لا يُبنى عليها تحقق نهائي
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
  if (!lessons.length) throw new Error(`لم تظهر دروس تحت الفصل «${term.text}» — ربما بطء في نور. اضغط «ابدأ» مرة أخرى.`);
  const units = [...new Set(lessons.map((l) => l.unit))];
  diag.tree = { term: term.text, terms: t.terms, units: units.map((u) => ({ text: u, lessons: lessons.filter((l) => l.unit === u).map((l) => l.text) })) };
  logLine('info', `شجرة نور — الفصل «${term.text}»: ${toAr(units.length)} وحدة و${toAr(lessons.length)} درسًا: ${units.map((u) => `${u} (${toAr(lessons.filter((l) => l.unit === u).length)})`).join('، ')}`);
  return lessons.map((l, i) => ({ id: 't' + i, text: l.text, unit: l.unit, unitId: l.unit, term: l.term || term.text }));
}

// ================= مطابقة دروس المكتبة بدروس الشجرة — المنطق في align.js (alignGroups) =================
const pickKeyMatches = (key, text) => { const t = kwNorm(text); return key === t || (key.startsWith(t + ' ') && /^\d+$/.test(key.slice(t.length + 1))); };
async function buildPlan(nodes) {
  treeNodes = nodes;
  const groups = lessonGroups(pkg);
  // اختياراتك السابقة: عنوان درس نور ← حصة من المادة (الأحدث أولًا)
  const known = new Map(), usedNode = new Set();
  const picks = await getPicks().catch(() => ({}));
  Object.entries(picks).sort((x, y) => ((y[1] && y[1].at) || 0) - ((x[1] && x[1].at) || 0)).forEach(([k, v]) => {
    if (!v || v.pkgId !== pkg.id) return;
    const l = (pkg.lessons || []).find((x) => x.id === v.lessonId);
    const gi = l ? groups.findIndex((g) => g.key === groupKey(l)) : -1;
    const n = gi >= 0 ? nodes.find((x) => pickKeyMatches(k, x.text)) : null;
    if (n && !known.has(gi) && !usedNode.has(n.id)) { known.set(gi, n); usedNode.add(n.id); }
  });
  const al = alignGroups(groups, nodes, known);
  plan = groups.map((group, i) => {
    const { node, how, why } = al[i];
    const p = { i, group, node, how, miss: !node, why, sessions: group.sessions.map((l) => ({ lesson: l, on: false, inNoor: false, date: '', st: null, cur: false })) };
    presence(p);
    return p;
  });
  // أسماء وحدات ملفك لا تشبه وحدات هذا المقرر: غالبًا المادة لصف أو كتاب آخر
  plan.mismatch = al.unitsNamed >= 2 && al.unitsByName / al.unitsNamed < 0.5;
  diag.plan = plan.map((p) => ({ unit: p.group.unit, lesson: p.group.lesson, sessions: p.sessions.length, node: p.node ? p.node.text : null, how: p.how || '', why: p.why || '', inNoor: p.sessions.filter((s) => s.inNoor).length }));
  const c = conflicts();
  if (plan.mismatch) logLine('bad', `أسماء وحدات ملفك لا تشبه وحدات هذا المقرر في نور (طابق بالاسم ${toAr(al.unitsByName)} من ${toAr(al.unitsNamed)}) — تأكد أن الصف في المادة صحيح («${pkg.grade || ''}»)`);
  if (c.weak.length) logLine('info', `${toAr(c.weak.length)} ${c.weak.length === 1 ? 'درس رُبط' : 'دروس رُبطت'} بالترتيب أو برقم الوحدة فقط — راجعها في «الخطة»`);
  c.miss.forEach((p) => logLine('skip', `— «${[p.group.unit, p.group.lesson].filter(Boolean).join(' / ')}»: ${p.why || 'لم أجده في شجرة هذا الفصل'}`));
  assignDates();
}
// الربط الذي راجعته يُحفظ ليُستعمل في المرات القادمة (ويُلغى ما يخالفه من اختيارات قديمة لهذه المادة)
async function savePicks() {
  const r = await chrome.storage.local.get('picks').catch(() => ({}));
  const picks = r.picks || {};
  const touched = plan.filter((p) => p.edited || p.how === 'order' || p.how === 'number');
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
  setBox('warn', 'انقطع الاتصال بالإنترنت — أنتظر عودته', 'أكمل تلقائيًا فور عودة الاتصال، من حيث توقفت.');
  logLine('info', 'انقطع الاتصال — بانتظار عودته');
  while (navigator.onLine === false && !stopFlag) await sleep(3000);
  if (!stopFlag) { logLine('info', 'عاد الاتصال — أكمل'); await sleep(2000); }
  return !stopFlag;
}
// انتظار متدرّج: ٥ ثم ١٠ ثم ٢٠ ثم ٤٠ ثانية (حتى دقيقة)
async function backoff(n, why) {
  const ms = Math.min(60000, 5000 * 2 ** Math.max(0, n - 1));
  setBox('warn', why || 'نور بطيئة — أنتظر قليلًا ثم أعيد المحاولة', `إعادة المحاولة تلقائيًا بعد ${toAr(Math.round(ms / 1000))} ثانية…`);
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
  return h && !h.partial ? h : null;
}
const noorCount = (h, p) => (h && p.node ? (h.get(kwNorm(p.node.text)) || []).length : 0);
// هل تُظهر القائمة ما حفظناه فعلًا؟ (عناوين نور بالصيغة التي نتوقعها) — وإلا لا يُبنى عليها أي قرار إعادة،
// فلا يتكرر الفصل كله لو اختلفت صيغة العناوين
function listReliable(h) {
  if (!h) return false;
  let want = 0, seen = 0;
  plan.forEach((p) => { if (p.savedNow) { want += p.savedNow; seen += Math.min(p.savedNow, Math.max(0, noorCount(h, p) - p.initial)); } });
  if (want) return seen / want >= 0.8;
  return plan.some((p) => p.initial > 0);   // لم نحفظ بعد: موثوقة إن طابقت تحاضير موجودة مسبقًا دروسَ الخطة
}
// هل حُفظت فعلًا؟ عدد تحاضير هذا الدرس في نور زاد عما نعرفه ← نعم. true | false | null (تعذّر التحقق)
async function verifyInNoor(item) {
  const h = await refreshNoorHave();
  if (!h || !listReliable(h)) return null;
  const p = item.p;
  return noorCount(h, p) > p.initial + p.savedNow;
}

// ================= الحصة الواحدة =================
// اسم الدرس تغيّر في شجرة نور؟ نعيد قراءة الفصل ونجده باسمه أو برقمه داخل وحدته
async function refreshNode(item) {
  const fresh = await termAllLessons(tabId, item.node.term).catch(() => []);
  if (!fresh.length) return false;
  const k = kwNorm(item.node.text), ln = lessonNum(item.node.text);
  const n = fresh.find((x) => kwNorm(x.text) === k) || (ln != null ? fresh.find((x) => kwNorm(x.unit) === kwNorm(item.node.unit) && lessonNum(x.text) === ln) : null);
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
const BAD = ['nolabel', 'notarget', 'fail', 'miss'];
// تعبئة النموذج: { ok } أو { ok:false, cls: date|fill, why }
async function fillOnce(item, c) {
  const s = item.s;
  setSt(s, 'run', 'تعبئة…');
  setBox('run', `أعبّئ «${shortT(s.lesson.title)}»…`, `الدرس: ${item.node.text}\nالنشر: ${dayLabel(s.date)}`);
  const opts = () => ({ publishDate: s.date, pickLesson: false, skipFilled: false, noorTitle: c.title });
  let rep = await fillNoor(tabId, pkg, s.lesson, opts());
  const blk = rep.find((x) => x.key === 'remote');
  if (blk) return { ok: false, cls: blk.remoteError === 'network' || blk.remoteError === 'server' ? 'net' : 'fatal', why: blk.error };
  // تعارض في الجدول: التاريخ مستخدم في نور، أو لا حصة لك (لا صفوف) في ذلك اليوم ← يوم الحصة التالي تلقائيًا
  for (let tries = 0; tries < 6 && !stopFlag; tries++) {
    const pb = rep.find((x) => x.key === 'publish');
    const ts = rep.find((x) => x.key === 'timeslots');
    const usedDay = pb && pb.status !== 'ok' && /من قبل|مسبق|مستخدم|مكرر|موجود/.test(pb.error || '');
    const noClassDay = !usedDay && ts && ts.status === 'nolabel' && (!pb || pb.status === 'ok');
    if (!usedDay && !noClassDay) break;
    const old = s.date;
    if (noClassDay) learnNoClass(old);
    shiftDate(s);
    logLine('info', `${usedDay ? 'التاريخ ' + dayLabel(old, false) + ' مستخدم في نور' : 'لا صفوف لك يوم ' + dayLabel(old, false)} — نقلت «${shortT(s.lesson.title)}» إلى ${dayLabel(s.date, false)}`);
    rep = await fillNoor(tabId, pkg, s.lesson, opts());
  }
  const pub = rep.find((x) => x.key === 'publish');
  const ts = rep.find((x) => x.key === 'timeslots');
  if (ts && ts.status === 'ok') classOk.add(new Date(s.date + 'T12:00').getDay());
  if (pub && pub.status !== 'ok') return { ok: false, cls: 'fill', why: pub.error ? 'نور: ' + pub.error : 'لم أستطع كتابة تاريخ النشر' };
  if (ts && ts.status === 'nolabel') return { ok: false, cls: 'date', why: 'لم تظهر الصفوف في عدة أيام متتالية' };
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
  if (v === 'error') { const t = al.errs.join(' | '); return { err: /مسبق|من قبل|موجود|تعارض|مكرر|نفس الحصة|نفس التاريخ|محجوز/.test(t) ? 'date' : 'noor', msg: 'نور: ' + t }; }
  if (v === 'saved' && (navigated || (al && al.oks.length))) return { ok: true };
  return { err: 'unknown', msg: 'لم يتأكد نجاح الحفظ من الصفحة' };
}
async function recordSaved(item) {
  const s = item.s;
  item.p.savedNow++;
  savedThisRun.push(item);
  // سجل هذا المقرر: لا تُعاد هذه الحصة فيه أبدًا (حتى لو لم تظهر بعد في قائمة نور)
  semSaved[s.lesson.id] = s.date;
  await semStore((m) => { m[s.lesson.id] = s.date; });
  await sleep(1200);   // قد يكون اكتشاف الحفظ في العامل الخلفي سجّلها للتو
  state = (await getPackages()).state;
  const st = sessionStatus(state, pkg.id, s.lesson.id);
  if (!(st.saved && Date.now() - st.saved < 60000)) await markSaved(pkg.id, s.lesson.id, s.date, 'فصل كامل');
  state = (await getPackages()).state;
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
  if (!(c && c.isForm && c.ready && !c.mark && /add_preparation/i.test(c.url || ''))) c = await openForm(addUrl);
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
async function processItem(item, addUrl, maxTries = 4) {
  const s = item.s;
  let tries = 0, moves = 0;
  while (!stopFlag) {
    if (!(await waitOnline())) return 'stop';
    const gen = ++attemptGen;
    const r = await withTimeout(attemptOnce(item, addUrl, gen).catch((e) => ({ err: 'crash', msg: 'خطأ غير متوقع: ' + String((e && e.message) || e).slice(0, 80) })), WATCHDOG, { err: 'timeout', msg: 'تعلّقت الخطوة أكثر من المعتاد' });
    if (r.err === 'timeout') attemptGen++;   // ما بقي من المحاولة المعلّقة يتوقف عند أول خطوة
    if (r.ok) return 'saved';
    if (stopFlag || r.err === 'stop') return 'stop';
    if (r.err === 'fatal') return { fatal: r.msg };
    if (r.err === 'skip') { await markSaveFailed(pkg.id, s.lesson.id, 'unsaved'); return 'skip'; }
    if (r.err === 'login') {
      if (!(await loginWait(addUrl))) return 'stop';
      item.reload = true;
      // انتهت الجلسة بعد الضغط على «حفظ»: هل حُفظت قبل انتهائها؟ نتحقق قبل أي إعادة
      if (item.clicked) {
        const v = await verifyInNoor(item);
        if (v === true) { logLine('info', `تحققت من قائمة نور: «${shortT(s.lesson.title)}» حُفظت قبل انتهاء الجلسة`); return 'saved'; }
        if (v === null) return { defer: true, why: 'انتهت الجلسة أثناء الحفظ ولم أستطع التأكد من قائمة نور', verifyOnly: true };
      }
      continue;
    }
    // ضُغط «حفظ» ولم تتأكد النتيجة: قائمة نور هي الحكم — إن ظهرت الحصة فقد حُفظت
    if (item.clicked && ['unknown', 'net', 'timeout', 'noor', 'stale', 'crash'].includes(r.err)) {
      const v = await verifyInNoor(item);
      if (v === true) { logLine('info', `تحققت من قائمة نور: «${shortT(s.lesson.title)}» حُفظت فعلًا`); return 'saved'; }
      if (v === null && r.err === 'unknown') {
        // لا نستطيع التحقق: لا نعيدها (خطر التكرار) — تؤجَّل للتحقق في جولة الإكمال
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
  const sc = { kind: scope.kind, units: [...scope.units], weekDay: scope.weekDay, from: scope.from, to: scope.to, dsrc: useFile ? 'file' : 'seq' };
  await chrome.storage.local.set({ semesterRun: active ? { pkgId: pkg.id, term: termNo, at: Date.now(), start: $('start').value, startTouched, scope: sc } : null }).catch(() => {});
}
function setRunning(on) {
  running = on;
  $('startBtn').hidden = on; $('stopBtn').hidden = !on; $('stopBtn').disabled = false;
  $('goBtn').hidden = true;
  ['pkgSel', 'start', 'optReview', 'optStep', 'optNoor', 'optAuto', 'weekDay', 'fromLesson', 'toLesson'].forEach((id) => { if ($(id)) $(id).disabled = on; });
  document.querySelectorAll('input[name=term], input[name=scope], input[name=dsrc], #unitChips .day').forEach((r) => { r.disabled = on; });
  if (on) $('topMsg').className = 'msg';
  heartbeat(on);
}
// انتظار «ابدأ التعبئة» — ومع autoMs يبدأ وحده بعد المهلة ما لم تعدّل شيئًا في الخطة
function waitGo(autoMs) {
  return new Promise((res) => {
    let iv = null, left = Math.round((autoMs || 0) / 1000);
    const label = '✓ الخطة مناسبة — ابدأ التعبئة';
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
  await chrome.storage.local.set({ semesterOpts: { review: $('optReview').checked, step: $('optStep').checked, noor: $('optNoor').checked, auto: $('optAuto').checked, term: termNo, scope: scope.kind, dsrc: useFile ? 'file' : 'seq' } }).catch(() => {});
  stopFlag = false; stopHooks.length = 0;
  plan = []; queue = []; treeNodes = []; noorHave = null; noClass = new Map(); classOk = new Set(); editable = false; courseCid = ''; coursePrepUrl = ''; semSaved = {}; savedThisRun = []; dateNotes.clear();
  days = daysFor(state, settings, pkg.id);
  logN = 0; diag.log = []; diag.tree = null; diag.plan = null; diag.failed = null;
  $('log').innerHTML = ''; $('logCard').hidden = true; $('prog').style.width = '0%'; renderPlan();
  setRunning(true);
  await checkpoint(true);
  let ok = 0, skipped = 0, total = 0, endMsg = null, finished = false;
  const failed = [];
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
        // متابعة بعد توقف: تبدأ التواريخ بعد آخر تاريخ استُعمل، ما لم تحدد أنت تاريخًا (مع تواريخ الملف لا حاجة لذلك)
        const lastUsed = [...Object.keys(usedDates(pkg, state)), ...Object.values(semSaved)].filter(Boolean).sort().pop();
        if (!startTouched && !useFile && scope.kind !== 'week' && lastUsed && lastUsed >= $('start').value) {
          $('start').value = nextSchoolDay(lastUsed, days, false);
          renderDays();
          logLine('info', `أكمل التواريخ بعد آخر تاريخ مستعمل (${dayLabel(lastUsed, false)}): من ${dayLabel($('start').value)}`);
        }
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
    // تعارض بين ملفك ونور: تُعرض الخطة للمراجعة، وتبدأ وحدها بعد مهلة (أطول كلما كان التعارض أخطر) ما لم تطلب المراجعة اليدوية
    const c = conflicts();
    const nConf = c.miss.length + c.weak.length + c.dup.length;
    if ($('optReview').checked || nConf || plan.mismatch || !queue.length) {
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
      if (go === 'auto' && plan.mismatch) {
        // بدء تلقائي رغم اختلاف الوحدات: الربط الضعيف (بالترتيب/برقم الوحدة فقط) يُستبعد احتياطًا
        let dropped = 0;
        plan.forEach((p) => { if (p.node && (p.how === 'order' || p.how === 'number') && !p.edited) { p.node = null; p.miss = true; p.skipped = true; p.why = 'استُبعد: ربط بالترتيب فقط مع اختلاف الوحدات'; presence(p); dropped++; } });
        if (dropped) logLine('info', `استبعدت ${toAr(dropped)} ${dropped === 1 ? 'درسًا مربوطًا' : 'دروس مربوطة'} بالترتيب فقط لأن وحدات الملف لا تشبه وحدات نور — راجعها لاحقًا`);
      }
      if (go === 'auto') { const miss = plan.filter((p) => p.miss && !p.skipped).length; if (miss) logLine('info', `بدأت تلقائيًا: ${toAr(miss)} ${miss === 1 ? 'درس بلا مقابل' : 'دروس بلا مقابل'} في نور تُخطّيت — تظهر في النهاية`); }
      await savePicks();
      assignDates(); renderPlan();
      if (!queue.length) { finished = true; throw new Error(plan.some((p) => p.sessions.some((s) => s.inNoor)) ? 'كل حصص الدروس المربوطة موجودة في نور — لا ناقص.' : scope.kind !== 'term' ? 'لا حصص ضمن النطاق المختار (الوحدة/الأسبوع/المدى) — غيّر النطاق.' : 'لم تحدد أي حصة.'); }
    }
    // عدد تحاضير كل درس في نور قبل البدء (أساس التحقق)، وما وُجد في نور يُسجَّل «محفوظًا» في مكتبتك
    plan.forEach((p) => { p.initial = noorCount(noorHave, p); p.savedNow = 0; });
    for (const p of plan) for (const s of p.sessions) if (s.inNoor && !sessionStatus(state, pkg.id, s.lesson.id).saved) await markSaved(pkg.id, s.lesson.id, '', 'قائمة نور');
    state = (await getPackages()).state;
    setPhase('fill');
    total = queue.length;
    const itemOf = (s) => { const p = plan.find((x) => x.sessions.includes(s)); return { s, p, node: p.node, first: p.sessions[0] }; };
    const onSaved = async (item, note) => {
      ok++; await recordSaved(item);
      setSt(item.s, 'ok', `✓ حُفظت · ${dayLabel(item.s.date, false)}`);
      logLine('ok', `✓ ${item.s.lesson.title} — ${item.node.text} — ${dayLabel(item.s.date)}${note || ''}`);
      item.s.on = false; item.s.eligible = false; item.s.savedNow = true;
      $('prog').style.width = (Math.min(1, (ok + skipped) / total) * 100) + '%';
      await checkpoint(true);
    };
    // الجولة الأولى
    const deferred = [];
    const runList = queue.slice();   // نسخة ثابتة: تعديل التواريخ أثناء التشغيل لا يغيّر ترتيب التنفيذ
    for (let k = 0; k < runList.length && !stopFlag; k++) {
      const item = itemOf(runList[k]);
      plan.forEach((x) => x.sessions.forEach((y) => { y.cur = y === item.s; }));
      renderPlan();
      const out = await processItem(item, addUrl, 4);
      item.s.cur = false;
      if (out === 'saved') await onSaved(item);
      else if (out === 'skip') { skipped++; setSt(item.s, 'skip', '— تُخطّيت'); logLine('skip', `— تُخطّيت: ${item.s.lesson.title}`); }
      else if (out && out.defer) { deferred.push(Object.assign(item, { why: out.why, verifyOnly: !!out.verifyOnly })); setSt(item.s, 'wait', '⏳ مؤجلة لجولة الإكمال'); logLine('info', `⏳ أجّلت «${item.s.lesson.title}» لجولة الإكمال: ${out.why}`); }
      else if (out && out.fatal) { setSt(item.s, 'bad', '✗ ' + out.fatal); if (AFAQ.SERVICE) afaqSync().catch(() => {}); throw new Error(out.fatal); }
      else break;
      await sleep(600);
    }
    // جولة الإكمال: ما تعذّر في الأولى يُعاد بعد مهلة — بعد التحقق من قائمة نور أنه لم يُحفظ فعلًا
    for (let round = 1; round <= 2 && deferred.length && !stopFlag; round++) {
      logLine('info', `جولة الإكمال ${toAr(round)}: ${countWord(deferred.length)} لم تنجح قبل`);
      await backoff(round + 1, 'أمهل نور قليلًا قبل جولة الإكمال');
      const h0 = await refreshNoorHave();
      const h = listReliable(h0) ? h0 : null;
      const list = deferred.splice(0);
      for (const item of list) {
        if (stopFlag) { deferred.push(item); continue; }
        if (h && noorCount(h, item.p) > item.p.initial + item.p.savedNow) { await onSaved(item, ' (وُجدت في قائمة نور)'); continue; }
        if (item.verifyOnly && !h) { deferred.push(item); continue; }   // لا نعيد ما قد يكون محفوظًا دون تحقق
        setSt(item.s, 'run', 'جولة الإكمال…');
        const out = await processItem(item, addUrl, 3);
        if (out && out.fatal) throw new Error(out.fatal);
        if (out === 'saved') await onSaved(item, ' (جولة الإكمال)');
        else if (out === 'skip') { skipped++; setSt(item.s, 'skip', '— تُخطّيت'); }
        else if (out && out.defer) deferred.push(Object.assign(item, { why: out.why, verifyOnly: !!out.verifyOnly }));
        else { deferred.push(item); break; }
      }
    }
    // التحقق النهائي: كل ما حُفظ في هذا التشغيل ظاهر فعلًا في قائمة نور؟ ما لم يظهر يُعاد مرة واحدة
    if (!stopFlag && savedThisRun.length && $('optNoor').checked) {
      setBox('run', 'أتحقق من قائمة نور أن كل الحصص حُفظت…');
      const h = await refreshNoorHave();
      const lost = [];
      if (h) plan.filter((p) => p.savedNow).forEach((p) => {
        const missing = p.initial + p.savedNow - noorCount(h, p);
        if (missing > 0) lost.push(...savedThisRun.filter((it) => it.p === p).slice(-missing));
      });
      const redo = !!h && listReliable(h) && lost.length <= Math.max(3, Math.round(savedThisRun.length * 0.1));
      if (!h) logLine('info', 'تعذّر التحقق النهائي من قائمة نور — راجع القائمة بنفسك');
      else if (!lost.length) logLine('ok', `✓ التحقق النهائي: كل ما حُفظ (${countWord(savedThisRun.length)}) ظاهر في قائمة نور`);
      else if (!redo) logLine('bad', `التحقق النهائي: ${countWord(lost.length)} لا تظهر في قائمة نور بالعنوان المتوقع — لم أعدها خشية التكرار؛ راجع القائمة (ربما عُدّلت العناوين)`);
      if (redo) {
        for (const item of lost) {
          if (stopFlag) break;
          logLine('info', `التحقق النهائي: «${item.s.lesson.title}» لم تظهر في قائمة نور — أعيدها`);
          ok--; item.p.savedNow--; savedThisRun.splice(savedThisRun.indexOf(item), 1);
          delete semSaved[item.s.lesson.id]; await semStore((m) => { delete m[item.s.lesson.id]; });
          const out = await processItem(item, addUrl, 3);
          if (out === 'saved') await onSaved(item, ' (بعد التحقق)');
          else failed.push({ item, why: 'لم تظهر في قائمة نور بعد الحفظ' });
        }
      }
    }
    deferred.forEach((item) => failed.push({ item, why: item.why }));
    failed.forEach(({ item, why }) => { setSt(item.s, 'bad', '✗ ' + why); logLine('bad', `✗ لم تكتمل «${item.s.lesson.title}» (${item.node.text}): ${why}`); });
    diag.failed = failed.map(({ item, why }) => ({ lesson: item.s.lesson.title, node: item.node.text, date: item.s.date, why }));
    finished = !stopFlag;
  } catch (e) {
    const m = String((e && e.message) || e);
    if (m !== 'stop' && !finished) { endMsg = ['bad', `توقف: ${esc(m)}<br>ما حُفظ قبلها بقي محفوظًا. اضغط «ابدأ» ليكمل من حيث توقف (المحفوظ لا يتكرر).`]; logLine('bad', 'توقف: ' + m); setBox('bad', 'توقف', m); }
    else if (finished && m !== 'stop') { endMsg = ['ok', esc(m)]; setBox('ok', m, ''); }
  }
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
  else if (total) {
    const miss = plan.filter((p) => p.miss && !p.skipped).length;
    const had = plan.flatMap((p) => p.sessions.filter((s) => s.inNoor)).length;
    const what = scope.kind === 'unit' ? 'الوحدة المختارة' : scope.kind === 'week' ? 'الأسبوع المختار' : scope.kind === 'range' ? 'المدى المختار' : `الفصل ${termName(termNo)}`;
    const head = !ok ? 'انتهى دون حفظ أي حصة.' : `✔ انتهى ${what}: حُفظ ${countWord(ok)} بتواريخ نشر${useFile ? ' كما في الملف' : ' متتالية'}.`;
    const tail = [had ? `كان موجودًا في نور ${countWord(had)}` : '', skipped ? `تُخطّيت ${countWord(skipped)}` : '', failed.length ? `لم تكتمل ${countWord(failed.length)} — اضغط «ابدأ» لإعادتها` : '', miss ? `${toAr(miss)} ${miss === 1 ? 'درس بلا مقابل' : 'دروس بلا مقابل'} في نور` : ''].filter(Boolean).join(' · ');
    msg(ok && !failed.length ? 'ok' : 'warn', head + (tail ? ` (${tail})` : ''));
    setBox(miss || skipped || failed.length || !ok ? 'warn' : 'ok', head, tail ? tail + ' — التفاصيل في السجل.' : '');
  }
}

// ================= التهيئة =================
async function init() {
  $('ver').textContent = 'الإصدار ' + chrome.runtime.getManifest().version;
  const r = await getPackages();
  packages = r.packages; state = r.state;
  settings = await getSettings();
  const withLessons = packages.filter((p) => (p.lessons || []).length);
  if (!withLessons.length) {
    msg('bad', AFAQ.SERVICE
      ? `لا مواد في اشتراكك. افتح <a href="${esc(siteUrl('#dashboard'))}" target="_blank" rel="noopener">حسابك في منصة أفق</a> لربط الإضافة أو تفعيل اشتراكك، ثم أعد فتح هذه النافذة.`
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
  // الفصل: المحفوظ، وإلا حسب الشهر (من فبراير إلى يونيو = الثاني)
  const m = new Date().getMonth() + 1;
  termNo = o.term || (m >= 2 && m <= 6 ? 2 : 1);
  const radio = document.querySelector(`input[name=term][value="${termNo}"]`);
  if (radio) radio.checked = true;
  // ---- النطاق وتواريخ الملف ----
  const scopeUi = () => {
    $('scopeUnit').hidden = scope.kind !== 'unit';
    $('scopeWeek').hidden = scope.kind !== 'week';
    $('scopeRange').hidden = scope.kind !== 'range';
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
    lintRes = lintPackage(pkg, { days });
    const lv = lintLevel(lintRes);
    $('lintCard').hidden = !lintRes.warnings.length;
    const n = lintRes.warnings.length;
    $('lintHead').textContent = `فحص ملف المادة: ${lv === 'ok' ? 'سليم ✓' : `${toAr(n)} ${n === 1 ? 'ملاحظة' : n === 2 ? 'ملاحظتان' : n <= 10 ? 'ملاحظات' : 'ملاحظة'}${lv === 'warn' || lv === 'bad' ? ' — بعضها قد يؤثر على الربط' : ' (معلومات فقط)'}`}`;
    $('lint').innerHTML = lintRes.warnings.map((w) => `<div class="${w.level}">${esc(w.text)}</div>`).join('');
    diag.lint = lintRes.warnings.map((w) => `[${w.level}] ${w.text}`);
  };
  $('lintToggle').onclick = () => { $('lint').hidden = !$('lint').hidden; $('lintToggle').textContent = $('lint').hidden ? 'عرض التفاصيل' : 'إخفاء'; };
  document.querySelectorAll('input[name=scope]').forEach((r) => { r.onchange = () => { if (running) return; scope.kind = r.value; if (scope.kind === 'week' && !scope.weekDay) { scope.weekDay = $('start').value || isoOf(new Date()); $('weekDay').value = scope.weekDay; } syncWeekStart(); scopeUi(); }; });
  document.querySelectorAll('input[name=dsrc]').forEach((r) => { r.onchange = () => { if (running) return; useFile = r.value === 'file'; o.dsrc = r.value; scopeUi(); }; });
  // أسبوع: أول تاريخ نشر = أول يوم حصة في ذلك الأسبوع (ما لم تكن التواريخ من الملف)
  const syncWeekStart = () => {
    if (scope.kind !== 'week' || !scope.weekDay) return;
    const ws = weekStart(scope.weekDay);
    $('weekHint').textContent = `${dayLabel(ws)} – ${dayLabel(weekEnd(scope.weekDay))}`;
    if (!useFile) { $('start').value = nextSchoolDay(ws, days, true); startTouched = true; renderDays(); }
  };
  $('weekDay').onchange = () => { if (running) return; scope.weekDay = $('weekDay').value; syncWeekStart(); scopeUi(); };
  $('fromLesson').onchange = () => { scope.from = $('fromLesson').value; scopeUi(); };
  $('toLesson').onchange = () => { scope.to = $('toLesson').value; scopeUi(); };
  const sk = (o.scope && ['term', 'unit', 'week', 'range'].includes(o.scope)) ? o.scope : 'term';
  scope.kind = sk; const sr = document.querySelector(`input[name=scope][value="${sk}"]`); if (sr) sr.checked = true;

  const onPkg = () => {
    pkg = packages.find((p) => p.id === $('pkgSel').value) || pkg;
    days = daysFor(state, settings, pkg.id);
    let start = nextSchoolDay(isoOf(new Date()), days, true);
    const used = Object.keys(usedDates(pkg, state)).sort().pop();
    if (used && used >= start) start = nextSchoolDay(used, days, false);
    $('start').value = start;
    renderDays();
    scope.units.clear(); scope.from = ''; scope.to = '';
    renderUnits(); renderRange(); renderDateSrc(); renderLint(); scopeUi();
    plan = []; renderPlan();
  };
  $('pkgSel').onchange = () => { startTouched = false; onPkg(); };
  onPkg();
  $('start').onchange = () => { startTouched = true; renderDays(); if (plan.length) { assignDates(); renderPlan(); } };
  // استعادة نطاق تشغيل سابق (من offerResume)
  init.restoreScope = (sc) => {
    if (!sc) return;
    scope.kind = sc.kind || 'term'; scope.units = new Set(sc.units || []); scope.weekDay = sc.weekDay || ''; scope.from = sc.from || ''; scope.to = sc.to || '';
    const r2 = document.querySelector(`input[name=scope][value="${scope.kind}"]`); if (r2) r2.checked = true;
    if (scope.weekDay) $('weekDay').value = scope.weekDay;
    if (sc.dsrc) { useFile = hasFileDates(pkg) && sc.dsrc === 'file'; const rd = document.querySelector(`input[name=dsrc][value="${useFile ? 'file' : 'seq'}"]`); if (rd) rd.checked = true; }
    renderUnits(); renderRange(); scopeUi();
  };
  $('startBtn').onclick = run;
  $('stopBtn').onclick = () => { stopFlag = true; stopHooks.splice(0).forEach((f) => f()); $('stopBtn').disabled = true; };
  $('reportBtn').onclick = async () => {
    const rep = {
      version: chrome.runtime.getManifest().version, term: termNo, scope: { kind: scope.kind, units: [...scope.units], weekDay: scope.weekDay, from: scope.from, to: scope.to, fileDates: useFile },
      pkg: pkg && { title: pkg.title, subject: pkg.subject, grade: pkg.grade, dated: datedCount(pkg), lessons: lessonGroups(pkg).map((g) => ({ unit: g.unit, lesson: g.lesson, sessions: g.sessions.length, dates: g.sessions.map((s) => s.pubDate || '').filter(Boolean) })) },
      lint: diag.lint || [], tree: diag.tree, plan: diag.plan, failed: diag.failed, log: diag.log,
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
  let left = 10, cancelled = false;
  const tick = () => {
    if (cancelled) return;
    msg('info', `تشغيل سابق لم يكتمل — أكمله تلقائيًا بعد ${toAr(left)} ثوانٍ (المحفوظ لا يتكرر). <button class="btn sm" id="resumeCancel">إلغاء</button>`);
    const b = $('resumeCancel'); if (b) b.onclick = async () => { cancelled = true; clearInterval(iv); $('topMsg').className = 'msg'; await chrome.storage.local.set({ semesterRun: null }).catch(() => {}); };
    if (left-- <= 0) { clearInterval(iv); $('topMsg').className = 'msg'; run(); }
  };
  const iv = setInterval(tick, 1000); tick();
}
init().then(offerResume).catch(() => {});
// للاختبار الآلي فقط (?debug=1): يكشف الحالة الداخلية دون أثر على الاستخدام العادي
if (q.get('debug') === '1') {
  window.__hadirSem = {
    set(o) { if (o.pkg) pkg = o.pkg; if (o.state) state = o.state; if (o.settings) settings = o.settings; if (o.days) days = o.days; if (o.scope) Object.assign(scope, o.scope, o.scope.units ? { units: new Set(o.scope.units) } : {}); if (o.useFile != null) useFile = o.useFile; if (o.start) $('start').value = o.start; },
    buildPlan, assignDates, shiftDate, conflicts,
    get plan() { return plan; }, get queue() { return queue; }, get treeNodes() { return treeNodes; }, get log() { return diag.log; },
  };
}
