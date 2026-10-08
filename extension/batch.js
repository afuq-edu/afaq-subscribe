// batch.js — تحضير عدة حصص (من درس واحد أو عدة دروس) بتواريخ نشر متتالية.
// بعد كل حصة ننتقل مباشرة إلى التالية؛ وحين يُفتح نموذج «إضافة تحضير» في نور نتحقق من التوافق ونعبّئها،
// وإن لم يتوافق تلقائيًا يظهر زر «تأكد من التوافق» هنا وفي أعلى صفحة نور.
import {
  getPackages, getSettings, patchSettings, fillNoor, selectNoorLesson, pageContext, clickSave, pageAlerts, judgeSave, isoOf, dayLabel, DAY_NAMES,
  bestLesson, stripSessionSuffix, groupKey, lessonGroups, sessionStatus, markSaved, markSaveFailed, unsavedText, daysFor, setPkgDays, suggestDate, usedDates,
  nextSchoolDay, matchVerdict, formUrlFor, getPicks, rememberPick, kwNorm,
  layoutDates, isIso, inWeekOf, weekStart, weekEnd, hasFileDates, datedCount, holidaySet,
} from './packages.js';
import { ic } from './icons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortT = (t) => { const h = String(t || '').split(/[:：]/)[0].trim(); return h && h.length <= 26 ? h : String(t || '').slice(0, 26) + '…'; };
const q = new URLSearchParams(location.search);
let tabId = Number(q.get('tab'));   // تبويب نور (يتغير إن فتحت النموذج في تبويب آخر)
const noorWin = Number(q.get('win')) || null;

let packages = [], pkg = null, state = null, settings = null, picks = {};
let rows = [];                      // { lesson, on, date } بترتيب المادة
let days = [0, 1, 2, 3, 4];
let matchedGroup = '';
const openGroups = new Set();
let running = false, stopFlag = false;
let runMode = 'review';             // auto: «تلقائي بالكامل» — لا أسئلة أثناء التشغيل
const stopHooks = [];
const stMap = {};                   // حالة كل حصة (بمعرّفها) لتبقى ظاهرة بعد إعادة الرسم
let curId = null, nextId = null;
const skippedIds = new Set();       // حصص تخطّيتها في هذا التشغيل (لا نسأل قبل مغادرة صفحتها)
const lastSubmit = new Map();       // تبويب ← وقت آخر ضغط على «حفظ» في نموذج التحضير (من content.js)
let askCur = null;                  // السؤال المعروض الآن (هنا وفي شريط صفحة نور)
const SESSION = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const fmtDay = (iso) => dayLabel(iso, false);
function msg(type, html) { const el = $('topMsg'); el.className = 'msg show ' + type; el.innerHTML = html; }
function countWord(n) { return n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n <= 10 ? toAr(n) + ' حصص' : toAr(n) + ' حصة'; }
// أُنجزت: حُفظت، أو عُبّئت ولم يظهر أنها لم تُحفظ
const done = (l) => { const s = sessionStatus(state, pkg.id, l.id); return !!(s.saved || (s.filled && !s.failed)); };
async function ctxOf(tid) { try { return await pageContext(tid); } catch (e) { return { isForm: false }; } }
async function tabUrl(tid) { try { return (await chrome.tabs.get(tid)).url || ''; } catch (e) { return ''; } }
function setNoorTitle(t) { $('noorT').innerHTML = t ? `الدرس المفتوح في نور: <q><bdi>${esc(t)}</bdi></q>` : 'لم أجد عنوان درس في صفحة نور'; }
const orderOf = (p) => lessonGroups(p).flatMap((g) => g.sessions);
function lessonById(pkgId, id) { const p = packages.find((x) => x.id === pkgId); return (p && (p.lessons || []).find((l) => l.id === id)) || null; }

async function reload() {
  const r = await getPackages();
  packages = r.packages; state = r.state;
  // أول مرة: المادة من الرابط (أو أول مادة فيها حصص)؛ بعدها: المادة نفسها فقط (null إن حُذفت)
  pkg = packages.find((p) => p.id === (pkg ? pkg.id : q.get('pkg'))) || (pkg ? null : packages.find((p) => (p.lessons || []).length)) || null;
  picks = await getPicks();
}
function pkgGone() {
  msg('bad', 'حُذفت هذه المادة من المكتبة — أغلق هذه النافذة وافتحها من جديد.');
  $('startBtn').disabled = true;
}
// الحصص بترتيب المادة، مع إبقاء التحديد والتواريخ (بعد تعديل المادة في المكتبة)
function syncRows() {
  const old = new Map(rows.map((r) => [r.lesson.id, r]));
  rows = orderOf(pkg).map((l) => { const o = old.get(l.id); return o ? Object.assign(o, { lesson: l }) : { lesson: l, on: false, date: '' }; });
}

// درس الصفحة المفتوحة في نور ضمن هذه المادة: علامة التعبئة، ثم توافق أكّدته سابقًا، ثم العنوان
function pageLesson(c) {
  if (c.mark && c.mark.pkgId === pkg.id) { const l = (pkg.lessons || []).find((x) => x.id === c.mark.lessonId); if (l) return l; }
  if (!c.title) return null;
  const pk = picks[kwNorm(c.title)];
  if (pk) {
    if (pk.pkgId !== pkg.id) return null;   // أكّدت أنها لدرس في مادة أخرى
    const l = (pkg.lessons || []).find((x) => x.id === pk.lessonId);
    if (l) return l;
  }
  const m = bestLesson([pkg], c.title);
  return m ? m.lesson : null;
}

// ================= التهيئة والقائمة =================
async function init() {
  await reload();
  settings = await getSettings();
  if (!pkg) { msg('bad', 'لا توجد تحاضير في المكتبة. أضف تحضيرًا أولًا.'); $('startBtn').disabled = true; return; }
  $('pkgName').textContent = pkg.title || [pkg.subject, pkg.grade].filter(Boolean).join(' · ');
  $('autoOpen').checked = settings.batchAutoOpen !== false;
  // تواريخ النشر المكتوبة في ملف المادة (إن وُجدت): تُستعمل كما هي، وما بلا تاريخ يتبع ما قبله
  $('fileRow').hidden = !hasFileDates(pkg);
  $('useFile').checked = settings.fileDates !== false;
  $('fileN').textContent = hasFileDates(pkg) ? `(${toAr(datedCount(pkg))} من ${toAr((pkg.lessons || []).length)} حصة لها تاريخ)` : '';
  $('useFile').onchange = () => { if (running) return; autoDates(); };
  days = daysFor(state, settings, pkg.id);
  const c = await ctxOf(tabId);
  setNoorTitle(c.title);
  const m = pageLesson(c);
  const from = (pkg.lessons || []).find((l) => l.id === q.get('from'));
  matchedGroup = m ? groupKey(m) : '';
  const startGroup = matchedGroup || (from ? groupKey(from) : groupKey((pkg.lessons || [])[0]));
  const order = orderOf(pkg);
  const fromIdx = from && groupKey(from) === startGroup ? order.indexOf(from) : -1;
  rows = order.map((l, i) => ({ lesson: l, on: groupKey(l) === startGroup && !done(l) && (fromIdx < 0 || i >= fromIdx), date: '' }));
  openGroups.add(startGroup);
  const units = [...new Set(lessonGroups(pkg).map((g) => g.unit || ''))];
  $('unitPick').innerHTML = '<option value="">تحديد وحدة…</option>' + units.map((u) => `<option value="${esc(kwNorm(u))}">${esc(u || 'بلا وحدة')}</option>`).join('');
  const first = rows.find((x) => x.on);
  $('start').value = suggestDate(state, settings, pkg, first ? first.lesson : null).date;
  renderDays();
  autoDates();
  const modeOf = (v) => { const el = document.querySelector(`input[name=mode][value="${v}"]`); if (el) el.checked = true; };
  if (settings.batchMode) modeOf(settings.batchMode);
  if (q.get('all') === '1') { modeOf('auto'); selectTerm(true); }   // من «كل حصص الفصل»: تلقائي بالكامل
  document.querySelectorAll('input[name=mode]').forEach((el) => { el.onchange = () => patchSettings({ batchMode: el.value }).catch(() => {}); });
}

function renderDays() {
  $('days').innerHTML = [0, 1, 2, 3, 4, 5, 6].map((d) => `<button class="day ${days.includes(d) ? 'on' : ''}" data-d="${d}">${DAY_NAMES[d]}</button>`).join('');
  $('days').querySelectorAll('.day').forEach((b) => {
    b.onclick = async () => {
      if (running) return;
      const d = +b.dataset.d;
      days = days.includes(d) ? days.filter((x) => x !== d) : days.concat(d).sort();
      if (!days.length) days = [d];
      await setPkgDays(pkg.id, days);
      renderDays(); autoDates();
    };
  });
}

// تغيير تاريخ حصة محددة: ما بعدها يتبعها بالتدريج على أيام الحصص (حتى لو كان التاريخ سابقًا)
// وتغيير تاريخ أول حصة = تغيير «تاريخ أول حصة» نفسه
let startTouched = false;
const useFileDates = () => !$('fileRow').hidden && $('useFile').checked;
// تغيير تاريخ حصة بيدك: يثبت تاريخها (مرساة)، وما بعدها بلا تاريخ ملف يتبعها بالتدريج؛ وتغيير الأولى يغيّر «تاريخ أول حصة»
function dateChanged(r, value) {
  if (running) return;
  if (!value) { r.date = ''; r.fixed = ''; renderList(); return; }
  const sel = rows.filter((x) => x.on);
  const i = sel.indexOf(r);
  r.fixed = value;
  if (i <= 0 && !useFileDates()) { $('start').value = value; startTouched = true; }
  autoDates();
  const after = rows.filter((x) => x.on);
  const j = after.indexOf(r);
  if (j >= 0 && j < after.length - 1) msg('info', `تبعتها ${countWord(after.length - j - 1)} بالتدريج: من ${esc(dayLabel(after[j + 1].date))} إلى ${esc(dayLabel(after[after.length - 1].date))}.`);
}

// توزيع التواريخ على الحصص المحددة بالترتيب: تواريخ الملف كما هي (تُنقل إلى يوم الحصة التالي إن كانت إجازة أو مستعملة)،
// وما بلا تاريخ يتبع ما قبله على أيام الحصص مع تخطي التواريخ المستخدمة لحصص أخرى
function autoDates() {
  const sel = rows.filter((r) => r.on);
  const selIds = new Set(sel.map((r) => r.lesson.id));
  const taken = Object.entries(usedDates(pkg, state)).filter(([, arr]) => arr.some((u) => !selIds.has(u.lessonId))).map(([d]) => d);
  const uf = useFileDates();
  const items = sel.map((r) => ({ r, fileDate: uf && isIso(r.lesson.pubDate) ? r.lesson.pubDate : '', fixed: r.fixed || '' }));
  const notes = layoutDates(items, { start: $('start').value || isoOf(new Date()), days, taken, useFileDates: uf, skip: holidaySet(settings) });
  items.forEach((it) => { it.r.date = it.date; it.r.dateSrc = it.dateSrc; it.r.movedFrom = ''; });
  notes.forEach((n) => { if (n.src === 'file') items[n.i].r.movedFrom = n.from; });
  rows.filter((r) => !r.on).forEach((r) => { r.date = ''; r.dateSrc = ''; r.movedFrom = ''; });
  $('startDay').textContent = $('start').value ? dayLabel($('start').value) : '';
  renderList();
}
// الحصص التي تقع تواريخها (من النشرة، وإلا بالتتابع من أول تاريخ) في مدى زمني — لتحديد «حصص أسبوع» و«حصة اليوم» و«من تاريخ إلى تاريخ»
function selectByDates(from, to, label) {
  if (running || (!from && !to)) return;
  const left = rows.filter((r) => !done(r.lesson));
  const uf = useFileDates();
  if (!uf && from) { $('start').value = nextSchoolDay(from, days, true); startTouched = true; }
  const items = left.map((r) => ({ r, fileDate: uf && isIso(r.lesson.pubDate) ? r.lesson.pubDate : '', fixed: r.fixed || '' }));
  const taken = Object.entries(usedDates(pkg, state)).filter(([, arr]) => arr.some((u) => !left.some((x) => x.lesson.id === u.lessonId))).map(([d]) => d);
  layoutDates(items, { start: $('start').value || isoOf(new Date()), days, taken, useFileDates: uf, skip: holidaySet(settings) });
  rows.forEach((r) => { r.on = false; });
  items.forEach((it) => { if ((!from || it.date >= from) && (!to || it.date <= to)) { it.r.on = true; openGroups.add(groupKey(it.r.lesson)); } });
  autoDates();
  const sel = rows.filter((r) => r.on);
  msg(sel.length ? 'info' : 'warn', sel.length ? `${label}: ${countWord(sel.length)}${uf ? ' (بحسب تواريخ النشرة)' : ''} — راجعها ثم اضغط «ابدأ».` : `لا حصص تقع في ${label} بالتواريخ الحالية${uf ? ' (تواريخ النشرة)' : ''}.`);
}
function selectWeek(anyDay) { if (anyDay) selectByDates(weekStart(anyDay), weekEnd(anyDay), `حصص أسبوع ${esc(dayLabel(weekStart(anyDay), false))} – ${esc(dayLabel(weekEnd(anyDay), false))}`); }

function rowHtml(r) {
  const s = sessionStatus(state, pkg.id, r.lesson.id);
  const stat = s.saved ? `<small class="sv">✓ محفوظة في نور${s.savedDate ? ' · ' + fmtDay(s.savedDate) : ''}</small>`
    : s.filled ? `<small class="fl">• عُبّئت${s.date ? ' · ' + fmtDay(s.date) : ''}${s.failed ? ' — ' + unsavedText(s) : ''}</small>` : '';
  const tag = r.lesson.id === curId ? '<span class="tagx cur">الآن</span>' : r.lesson.id === nextId ? '<span class="tagx next">التالية</span>' : '';
  const st = stMap[r.lesson.id];
  return `<div class="row ${r.on ? 'on' : ''} ${r.lesson.id === curId ? 'cur' : ''}" data-id="${esc(r.lesson.id)}">
    <input type="checkbox" ${r.on ? 'checked' : ''} ${running ? 'disabled' : ''} aria-label="تحديد الحصة">
    <div class="t">${esc(r.lesson.title)}${tag}${stat}${r.on && r.date ? `<small>النشر: ${esc(dayLabel(r.date))}${r.dateSrc === 'file' ? ' <b class="srcf">· من الملف</b>' : ''}${r.movedFrom ? ` <b class="srcm">(كان ${esc(dayLabel(r.movedFrom, false))})</b>` : ''}</small>` : !r.on && isIso(r.lesson.pubDate) && useFileDates() ? `<small>في الملف: ${esc(dayLabel(r.lesson.pubDate, false))}</small>` : ''}</div>
    ${r.on ? `<input type="date" class="input" value="${r.date}" ${running ? 'disabled' : ''} aria-label="تاريخ النشر">` : '<span></span>'}
    <div class="st ${st ? 'show ' + st.cls : ''}">${st ? esc(st.text) : ''}</div>
  </div>`;
}

function renderList() {
  const byId = new Map(rows.map((r) => [r.lesson.id, r]));
  $('list').innerHTML = lessonGroups(pkg).map((g) => {
    const gRows = g.sessions.map((l) => byId.get(l.id)).filter(Boolean);
    const sel = gRows.filter((r) => r.on).length;
    const saved = g.sessions.filter((l) => sessionStatus(state, pkg.id, l.id).saved).length;
    const open = openGroups.has(g.key) || gRows.some((r) => r.lesson.id === curId);
    return `<div class="grp ${open ? 'open' : ''}" data-g="${esc(g.key)}">
      <div class="grp-h">${ic('left', 15, 'chev')}<div class="gt">${g.unit ? `<small>${esc(g.unit)}</small>` : ''}<b>${esc(g.lesson || 'درس')}</b></div>
        ${g.key === matchedGroup ? '<span class="match">مفتوح في نور</span>' : ''}<span class="gc">${sel ? `<em>${toAr(sel)} محددة</em> · ` : ''}${toAr(saved)}/${toAr(g.sessions.length)} محفوظة</span></div>
      <div class="grp-b"><div class="grp-tools"><button class="lnk" data-gall>تحديد غير المنجزة</button><button class="lnk muted" data-gnone>إلغاء التحديد</button></div>${gRows.map(rowHtml).join('')}</div>
    </div>`;
  }).join('') || '<div class="empty">لا توجد حصص.</div>';

  $('list').querySelectorAll('.grp').forEach((gEl) => {
    const key = gEl.dataset.g;
    gEl.querySelector('.grp-h').onclick = () => { if (openGroups.has(key)) openGroups.delete(key); else openGroups.add(key); renderList(); };
    gEl.querySelector('[data-gall]').onclick = () => { if (running) return; rows.forEach((r) => { if (groupKey(r.lesson) === key) r.on = !done(r.lesson); }); autoDates(); };
    gEl.querySelector('[data-gnone]').onclick = () => { if (running) return; rows.forEach((r) => { if (groupKey(r.lesson) === key) r.on = false; }); autoDates(); };
  });
  $('list').querySelectorAll('.row').forEach((el) => {
    const r = rows.find((x) => x.lesson.id === el.dataset.id);
    el.querySelector('input[type=checkbox]').onchange = (e) => { r.on = e.target.checked; autoDates(); };
    const di = el.querySelector('input[type=date]');
    if (di) di.onchange = () => dateChanged(r, di.value);
  });
  const n = rows.filter((r) => r.on).length;
  const leftN = rows.filter((r) => !done(r.lesson)).length;
  const allOn = leftN > 0 && rows.every((r) => done(r.lesson) || r.on);
  $('selTerm').textContent = allOn ? 'إلغاء تحديد الكل' : 'تحديد كل حصص الفصل';
  $('selTerm').disabled = running || !leftN;
  $('termInfo').textContent = `${toAr(rows.length - leftN)} من ${toAr(rows.length)} منجزة · ${leftN ? 'بقيت ' + countWord(leftN) : 'اكتمل الفصل ✓'}`;
  if (!running) $('startBtn').textContent = n ? `ابدأ (${countWord(n)})` : 'اختر حصة واحدة على الأقل';
  $('startBtn').disabled = !n || running;
}

function setSt(r, cls, text) {
  stMap[r.lesson.id] = { cls, text };
  renderList();
  const row = $('list').querySelector(`.row[data-id="${CSS.escape(r.lesson.id)}"]`);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function logLine(cls, text) {
  $('logCard').hidden = false;
  const d = document.createElement('div');
  d.className = 'st show ' + cls;
  d.style.margin = '3px 0';
  d.textContent = text;
  $('log').appendChild(d);
}

// ================= بطاقة «الآن» والشريط داخل صفحة نور =================
function showNow(r, k, total) {
  $('nowCard').hidden = false;
  $('nowPos').textContent = `الحصة ${toAr(k + 1)} من ${toAr(total)}`;
  $('nowDate').textContent = r.date ? 'النشر: ' + dayLabel(r.date) : '';
  $('nowLesson').textContent = [r.lesson.unit, r.lesson.lesson].filter(Boolean).join(' — ');
  $('nowTitle').textContent = r.lesson.title;
}
function setBox(kind, head, text, buttons = []) {
  const box = $('nowBox');
  box.className = 'now-box ' + kind;
  $('nowHead').innerHTML = (kind === 'run' ? '<span class="spin"></span>' : '') + esc(head);
  $('nowText').textContent = text || '';
  $('nowText').hidden = !text;
  const acts = $('nowActs');
  acts.innerHTML = '';
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.primary ? 'primary' : '');
    el.textContent = b.label;
    el.onclick = b.onclick;
    acts.appendChild(el);
  });
  acts.hidden = !buttons.length;
}

// يُحقن في صفحة نور (عالم الإضافة المعزول): شريط علوي برسالة وأزرار تعود إلينا عبر رسالة.
// opts=null: إزالة أي شريط · {remove:id}: إزالة شريط سؤال معيّن فقط · غير ذلك: عرض شريط السؤال.
// نافذة «عدة حصص» صاحبة السؤال تفتح منفذًا مباشرًا إلى الشريط (tabs.connect)، فيختفي وحده
// إن أُغلقت النافذة أو انتهى السؤال — دون أن تتدخل نوافذ «عدة حصص» أخرى مفتوحة.
function pageBar(opts) {
  const W = window;
  const drop = () => {
    const el = document.getElementById('hadir-bar');
    if (el) el.remove();
    const p = W.__hadirBarPort;
    W.__hadirBarPort = null;
    try { if (p) p.disconnect(); } catch (e) {}
  };
  if (!W.__hadirBarListen) {
    W.__hadirBarListen = true;
    chrome.runtime.onConnect.addListener((port) => {
      if (!port.name.startsWith('hadir-bar:')) return;
      const el = document.getElementById('hadir-bar');
      if (!el || port.name !== 'hadir-bar:' + el.dataset.id) { port.disconnect(); return; }   // شريط قديم أو أُزيل
      const old = W.__hadirBarPort;
      W.__hadirBarPort = port;
      try { if (old) old.disconnect(); } catch (e) {}
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (W.__hadirBarPort === port) W.__hadirBarPort = null;
        const cur = document.getElementById('hadir-bar');
        if (cur && 'hadir-bar:' + cur.dataset.id === port.name) cur.remove();
      });
    });
  }
  const cur = document.getElementById('hadir-bar');
  if (opts && opts.remove) { if (cur && cur.dataset.id === opts.remove) drop(); return; }
  if (opts && cur && cur.dataset.sess === opts.sess && Number(cur.dataset.seq) > opts.seq) return;   // وصل متأخرًا: يوجد شريط أحدث
  drop();
  if (!opts) return;
  const C = { warn: '#b45309', ok: '#15803d' }[opts.kind] || '#0f766e';
  const h = document.createElement('div');
  h.id = 'hadir-bar';
  h.dataset.id = opts.id; h.dataset.seq = String(opts.seq); h.dataset.sess = opts.sess;
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
    btn.onclick = () => { try { chrome.runtime.sendMessage({ type: 'hadirBarReply', id: opts.id, btn: x.id }); } catch (e) {} drop(); };
    a.appendChild(btn);
  });
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'x'; x.textContent = '✕'; x.title = 'إخفاء';
  x.onclick = drop;
  a.appendChild(x);
  b.append(t, a);
  root.append(st, b);
  document.documentElement.appendChild(h);
}
let barSeq = 0, lastBarTab = null;
const barPorts = new Map();         // سؤال ← منفذ شريطه في صفحة نور
async function showBar(opts, t) {
  lastBarTab = t;
  try { await chrome.scripting.executeScript({ target: { tabId: t }, func: pageBar, args: [Object.assign({ seq: ++barSeq, sess: SESSION }, opts)] }); } catch (e) { return; }
  if (!askCur || askCur.id !== opts.id) { hideBar(opts.id, t); return; }   // انتهى السؤال قبل ظهور الشريط
  try {
    const port = chrome.tabs.connect(t, { name: 'hadir-bar:' + opts.id, frameId: 0 });
    barPorts.set(opts.id, port);
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (barPorts.get(opts.id) === port) barPorts.delete(opts.id); });
  } catch (e) {}
}
function hideBar(id, t) {
  if (t == null) return Promise.resolve();
  return chrome.scripting.executeScript({ target: { tabId: t }, func: pageBar, args: [id ? { remove: id } : null] }).catch(() => {});
}

// سؤال المعلم: أزرار هنا وفي صفحة نور، أو حدث:
// onForm: فُتح نموذج «إضافة تحضير» في أي تبويب ← {nav}
// onNavOf: انتقلت صفحة التبويب ← {navOf} · onClose: أُغلق التبويب ← {closed}
// watch: نتيجة الحفظ من الصفحة نفسها بلا انتقال — نجاح ← {okOf} أو رفض ← {failOf, text} · الإيقاف ← 'stop'
chrome.runtime.onMessage.addListener((m, sender) => {
  if (!m || typeof m !== 'object') return;
  const tid = sender && sender.tab ? sender.tab.id : null;
  if (m.type === 'hadirBarReply') { if (askCur && m.id === askCur.id) askCur.finish(m.btn); return; }
  if (tid == null) return;
  if (m.type === 'hadirSubmitting') lastSubmit.set(tid, Date.now());
  else if (m.type === 'hadirSubmitFailed') {
    lastSubmit.delete(tid);   // رفضت نور هذا الحفظ: مغادرة الصفحة بعده ليست حفظًا
    if (askCur && askCur.watch === tid) askCur.finish({ failOf: tid, text: String(m.text || '') });
  } else if (m.type === 'hadirSaved' && askCur && askCur.watch === tid) askCur.finish({ okOf: tid });
});
function ask({ kind = 'info', head = '', text = '', buttons = [], bar = null, onForm = false, pollAccept = null, onNavOf = null, onClose = null, watch = null }) {
  if (stopFlag) return Promise.resolve('stop');
  return new Promise((resolve) => {
    const id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const t = tabId;
    const offs = [];
    let poll = null;
    const finish = (v) => {
      if (!askCur || askCur.id !== id) return;
      askCur = null;
      offs.forEach((f) => f());
      clearInterval(poll);
      const p = barPorts.get(id);
      if (p) { barPorts.delete(id); try { p.disconnect(); } catch (e) {} }
      if (bar) hideBar(id, t);
      resolve(v);
    };
    askCur = { id, finish, watch };
    setBox(kind, head, text, buttons.map((b) => Object.assign({}, b, { onclick: () => finish(b.id) })));
    if (bar) showBar(Object.assign({ id, kind }, bar), t);
    if (onForm) {
      const fn = async (tid, info) => {
        if (info.status !== 'complete' || !/add_preparation/i.test(await tabUrl(tid))) return;
        const c = await ctxOf(tid);
        if (c.isForm) finish({ nav: tid });
      };
      chrome.tabs.onUpdated.addListener(fn);
      offs.push(() => chrome.tabs.onUpdated.removeListener(fn));
    }
    if (pollAccept) {
      // احتياط: فحص التبويب المرتبط دوريًا (قد يتغير النموذج دون حدث تحميل)
      poll = setInterval(async () => { const c = await ctxOf(t); if (pollAccept(c)) finish({ nav: t }); }, 3000);
    }
    if (onNavOf != null) {
      let saw = false;
      const fn = (tid, info) => {
        if (tid !== onNavOf) return;
        if (info.status === 'loading') saw = true;
        if (info.status === 'complete' && saw) finish({ navOf: tid });
      };
      chrome.tabs.onUpdated.addListener(fn);
      offs.push(() => chrome.tabs.onUpdated.removeListener(fn));
    }
    if (onClose != null) {
      const fn = (tid) => { if (tid === onClose) finish({ closed: tid }); };
      chrome.tabs.onRemoved.addListener(fn);
      offs.push(() => chrome.tabs.onRemoved.removeListener(fn));
    }
    const onStop = () => finish('stop');
    stopHooks.push(onStop);
    offs.push(() => { const i = stopHooks.indexOf(onStop); if (i >= 0) stopHooks.splice(i, 1); });
  });
}

// انتظار انتقال التبويب (تحميل ثم اكتمال)
function waitNavigation(timeout, tid = tabId) {
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
      if (id !== tid) return;
      if (info.status === 'loading') sawLoading = true;
      if (info.status === 'complete' && sawLoading) fin(true);
    };
    chrome.tabs.onUpdated.addListener(l);
    if (timeout && timeout !== Infinity) t = setTimeout(() => fin(false), timeout);
    stopHooks.push(onStop);
  });
}
async function waitComplete(tid, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !stopFlag) {
    await sleep(400);
    try { const t = await chrome.tabs.get(tid); if (t.status === 'complete' && t.url && !/^about:/.test(t.url)) return true; } catch (e) { return false; }
  }
  return false;
}
// فتح نموذج الدرس في تبويب نور، أو في تبويب جديد إن أُغلق
async function openFormUrl(url) {
  let alive = true;
  try { await chrome.tabs.get(tabId); } catch (e) { alive = false; }
  if (alive) {
    const nav = waitNavigation(30000);
    try { await chrome.tabs.update(tabId, { url }); return await nav; } catch (e) { /* أُغلق للتو */ }
  }
  let t = null;
  try { t = await chrome.tabs.create(noorWin ? { url, active: true, windowId: noorWin } : { url, active: true }); }
  catch (e) { try { t = await chrome.tabs.create({ url, active: true }); } catch (e2) { return false; } }
  tabId = t.id;
  return waitComplete(t.id, 30000);
}
async function focusNoor() {
  try { const t = await chrome.tabs.get(tabId); await chrome.windows.update(t.windowId, { focused: true }); await chrome.tabs.update(tabId, { active: true }); } catch (e) {}
}

// ================= الخطوات لكل حصة =================
const freshFor = (c, r) => c.isForm && (!c.mark || (c.mark.lessonId === r.lesson.id && (!c.mark.pkgId || c.mark.pkgId === pkg.id)));

// في الصفحة حصة أخرى عُبّئت ولم تُحفظ بعد؟ (فلا نغادرها دون سؤال)
function unsavedMark(mark) {
  if (!mark || !mark.lessonId || (mark.pkgId === pkg.id && skippedIds.has(mark.lessonId))) return false;
  const s = sessionStatus(state, mark.pkgId, mark.lessonId);
  return !(s.saved && s.saved >= (mark.at || 0));
}

// ١) الحصول على نموذج «إضافة تحضير» متوافق مع الحصة
async function obtainForm(r) {
  let triedAuto = !!r.noAuto, leaveOk = false, waits = 0;
  r.noAuto = false;
  r.treeTried = ''; r.treePicked = ''; r.reopened = false;
  for (;;) {
    if (stopFlag) return null;
    const c = await ctxOf(tabId);
    if (freshFor(c, r)) {
      if (!c.ready && waits++ < 40) { setBox('run', 'انتظار اكتمال تحميل النموذج…'); await sleep(700); continue; }
      // نور تفتح النموذج بلا درس: نختاره من شجرة الدروس بدل سؤالك (مرة واحدة لكل صفحة)
      if (!c.title && !c.mark && r.treeTried !== c.url + '|' + r.lesson.id && (await getSettings()).pickLesson !== false) {
        r.treeTried = c.url + '|' + r.lesson.id;
        setSt(r, 'run', 'اختيار الدرس من شجرة نور…');
        setBox('run', `أختار «${r.lesson.lesson}» من شجرة الدروس في نور…`);
        const t = await selectNoorLesson(tabId, pkg, r.lesson).catch(() => null);
        if (t && t.status === 'picked') { r.treeNote = `اختير في نور: «${t.text}»`; r.treePicked = t.text; continue; }
        // التلقائي بالكامل: لا نسأل — تُتخطّى الحصة مع السبب ونكمل
        if (runMode === 'auto' && t && (t.status === 'nomatch' || t.status === 'fail')) throw Object.assign(new Error(`لم أجد درسها «${r.lesson.lesson}» في شجرة الدروس في نور`), { skip: true });
      }
      setNoorTitle(c.title);
      const pl = pageLesson(c);
      matchedGroup = pl ? groupKey(pl) : '';   // شارة «مفتوح في نور» تتبع الصفحة الحالية
      // بلا عنوان درس لا يمكن التحقق: نسأل المعلم بدل التعبئة مباشرة
      // الدرس الذي اخترناه نحن من الشجرة (بتحقق عكسي) متوافق بلا سؤال
      const v = c.title && r.treePicked && stripSessionSuffix(c.title) === r.treePicked ? { v: 'match', how: 'tree' }
        : c.title ? matchVerdict({ title: c.title, packages, pkg, lesson: r.lesson, picks }) : { v: 'unknown' };
      if (v.v === 'match') { r.matchNote = r.treeNote && c.title ? '✓ ' + r.treeNote : v.how === 'manual' ? '✓ متوافق (حسب تأكيدك السابق)' : '✓ متوافق تلقائيًا'; r.treeNote = ''; setSt(r, 'run', r.matchNote); return c; }
      if (runMode === 'auto') {
        // في الصفحة درس آخر: نفتح نموذجًا جديدًا للمادة (بلا درس) فنختار درسها من الشجرة — مرة واحدة
        const fresh = state.treeForms && state.treeForms[pkg.id] ? formUrlFor(state, pkg.id, r.lesson) : '';
        if (fresh && !r.reopened) { r.reopened = true; setBox('run', 'أفتح نموذجًا جديدًا لهذه الحصة…'); await openFormUrl(fresh); waits = 0; r.treeTried = ''; continue; }
        throw Object.assign(new Error(c.title ? `الصفحة المفتوحة لدرس آخر: «${c.title}»` : 'لم أتعرّف على درس الصفحة'), { skip: true });
      }
      const a = await askMatch(c, r, v);
      if (a === 'yes') {
        if (c.title) { await rememberPick(c.title, pkg.id, r.lesson.id); picks = await getPicks(); }
        r.matchNote = '✓ أكّدت التوافق';
        setSt(r, 'run', r.matchNote);
        return c;
      }
      if (a === 'skip') return 'skip';
      if (a === 'stop') return null;
      if (a && a.nav) { tabId = a.nav; waits = 0; continue; }
      const w = await waitOpenForm(r, true);   // «ليست هي» أو أُغلقت الصفحة: ننتظر فتح الصفحة الصحيحة
      if (w !== true) return w;
      waits = 0; r.treeTried = '';
      continue;
    }
    // ليست نموذجًا جديدًا لهذه الحصة (صفحة أخرى، أو نموذج حصة سابقة)
    const url = ($('autoOpen').checked || runMode === 'auto') && !triedAuto ? formUrlFor(state, pkg.id, r.lesson) : '';
    if (url) {
      if (!leaveOk && c.isForm && c.mark) {
        state = (await getPackages()).state;
        if (unsavedMark(c.mark) && runMode !== 'auto') {   // التلقائي: الحصة السابقة سُجّل سببها في السجل
          const a = await askLeave(c, r);
          if (a === 'skip') return 'skip';
          if (a === 'stop') return null;
          if (a !== 'open') { if (a && a.nav) tabId = a.nav; waits = 0; continue; }   // حُفظت أو تغيّرت الصفحة: نعيد الفحص
          leaveOk = true;
        }
      }
      triedAuto = true;
      setSt(r, 'run', 'فتح نموذج «إضافة تحضير» للدرس…');
      setBox('run', 'أفتح نموذج «إضافة تحضير» لهذا الدرس…');
      await openFormUrl(url);
      waits = 0; r.treeTried = '';
      continue;
    }
    const w = await waitOpenForm(r, false);
    if (w !== true) return w;
    waits = 0; r.treeTried = '';
  }
}

async function waitOpenForm(r, wrongPage) {
  const note = r.waitNote || '';
  r.waitNote = '';
  setSt(r, 'wait', note || 'بانتظار فتح نموذجها في نور');
  const a = await ask({
    kind: 'info',
    head: 'افتح نموذج «إضافة تحضير» لهذه الحصة في نور',
    text: `${note ? note + '.\n' : ''}الدرس: «${r.lesson.lesson}»\nعندما تفتح النموذج أتحقق من التوافق وأعبّئه تلقائيًا.`,
    buttons: [{ id: 'skip', label: 'تخطَّ هذه الحصة' }],
    bar: { title: `حاضر — التالية: «${shortT(r.lesson.title)}»`, text: `افتح «إضافة تحضير» للدرس «${r.lesson.lesson}» وسأعبّئها تلقائيًا`, buttons: [] },
    onForm: true,
    pollAccept: wrongPage ? null : (c) => freshFor(c, r),
  });
  if (a === 'skip') return 'skip';
  if (a === 'stop') return null;
  if (a && a.nav) tabId = a.nav;
  return true;
}

function askMatch(c, r, v) {
  setSt(r, 'wait', '⚠ لم يتوافق تلقائيًا — بانتظار تأكيدك');
  const other = !c.title ? 'لا يظهر عنوان الدرس في هذه الصفحة، فلم أستطع التحقق منه.'
    : v.v === 'mismatch' ? `تبدو الصفحة لدرس آخر في مكتبتك: «${v.other.lesson.lesson}».` : 'لم أتعرّف تلقائيًا على درس هذه الصفحة.';
  return ask({
    kind: 'warn',
    head: '⚠ لم يتوافق تلقائيًا',
    text: `${c.title ? `الصفحة المفتوحة في نور: «${c.title}»\n` : ''}${other}\nالحصة التالية: «${r.lesson.title}» من «${r.lesson.lesson}».`,
    buttons: [{ id: 'yes', label: '✓ تأكد من التوافق وعبّئ', primary: true }, { id: 'no', label: 'ليست هي — سأفتح الصحيحة' }, { id: 'skip', label: 'تخطَّ الحصة' }],
    bar: {
      title: `حاضر: هل هذه الصفحة للحصة «${shortT(r.lesson.title)}»؟`,
      text: `لم يتوافق تلقائيًا — الدرس المتوقع: «${r.lesson.lesson}»`,
      buttons: [{ id: 'yes', label: '✓ تأكد من التوافق وعبّئ', primary: true }, { id: 'no', label: 'ليست هي' }],
    },
    onForm: true, onClose: tabId,
  });
}

function askLeave(c, r) {
  const l = lessonById(c.mark.pkgId, c.mark.lessonId);
  const name = l ? `«${l.title}»` : 'حصة أخرى';
  setSt(r, 'wait', 'بانتظارك: في صفحة نور حصة لم تُحفظ');
  return ask({
    kind: 'warn',
    head: 'في صفحة نور حصة عُبّئت ولم تُحفظ بعد',
    text: `${name} معبّأة في الصفحة المفتوحة ولم يُسجَّل حفظها.\nاحفظها في نور أولًا وسأفتح نموذج الحصة التالية بعدها — أو افتحه الآن مكانها (تضيع تعبئتها).`,
    buttons: [{ id: 'open', label: 'افتح نموذج التالية الآن' }, { id: 'skip', label: 'تخطَّ هذه الحصة' }],
    bar: { kind: 'warn', title: `حاضر: احفظ ${l ? '«' + shortT(l.title) + '»' : 'هذه الحصة'} أولًا`, text: 'بعد الحفظ أفتح نموذج الحصة التالية', buttons: [{ id: 'open', label: 'افتح التالية دون حفظها' }] },
    onNavOf: tabId, onForm: true, onClose: tabId,
  });
}

function askSaved(r, al, noSubmit) {
  const why = al && al.login ? 'يبدو أن جلسة نور انتهت — سجّل الدخول ثم أكمل.'
    : noSubmit ? 'تغيّرت صفحة نور دون أن ألاحظ ضغطًا على «حفظ».' : 'لم أتأكد من نجاح الحفظ من الصفحة.';
  return ask({
    kind: 'warn',
    head: `هل حُفظت «${r.lesson.title}»؟`,
    text: why,
    buttons: [{ id: 'yes', label: '✓ نعم، حُفظت — التالي', primary: true }, { id: 'no', label: 'لا، لم تُحفظ' }],
    bar: { title: `حاضر: هل حُفظت «${shortT(r.lesson.title)}»؟`, text: why, buttons: [{ id: 'yes', label: '✓ نعم — التالي', primary: true }, { id: 'no', label: 'لا' }] },
  });
}

// ٣أ) المراجعة والحفظ بيد المعلم: لا نحتسب انتقال الصفحة حفظًا إلا إن ضُغط «حفظ» فيها (أو ظهرت رسالة نجاح)
async function reviewSave(r, formUrl, warn) {
  const t0 = Date.now();
  lastSubmit.delete(tabId);
  focusNoor();
  let err = '';
  for (;;) {
    setSt(r, 'wait', '✎ راجعها ثم اضغط «حفظ» في نور' + (r.matchNote ? ' · ' + r.matchNote : ''));
    const a = await ask({
      kind: err ? 'bad' : 'ok',
      head: err ? 'ظهر خطأ في نور' : '✓ عُبّئت — راجعها ثم اضغط «حفظ» في نور',
      text: (err ? err + '\n' : '') + (r.matchNote ? r.matchNote + ' مع الدرس المفتوح في نور.\n' : '') + 'بعد الحفظ أنتقل مباشرة إلى الحصة التالية.' + (warn.length ? `\nراجع: ${warn.join('، ')}` : ''),
      buttons: [{ id: 'saved', label: '✓ حفظتُها — التالي', primary: true }, { id: 'skip', label: 'تخطَّ' }],
      bar: { kind: err ? 'warn' : 'ok', title: `حاضر: عُبّئت «${shortT(r.lesson.title)}» · ${dayLabel(r.date)}`, text: err || 'راجعها ثم اضغط «حفظ» في نور — وسأنتقل للتالية', buttons: [{ id: 'saved', label: '✓ حفظتُها — التالي' }] },
      onNavOf: tabId, onClose: tabId, watch: tabId,
    });
    if (a === 'saved' || a === 'skip' || a === 'stop') return a;
    if (a && a.okOf) return 'saved';
    if (a && a.failOf) { err = 'رفضت نور الحفظ' + (a.text ? ': ' + a.text.slice(0, 160) : '') + ' — صحّحه ثم اضغط «حفظ» مجددًا.'; continue; }
    if (a && a.closed) { r.noAuto = true; r.waitNote = 'أُغلقت صفحة نور قبل الحفظ — افتح نموذجها من جديد'; return 'refill'; }
    if (a && a.navOf) {
      await sleep(700);
      const sub = lastSubmit.get(tabId) || 0;
      lastSubmit.delete(tabId);
      const submitted = sub >= t0 && Date.now() - sub < 90000;   // ضُغط «حفظ» في هذه المراجعة قبل الانتقال مباشرة
      const al = await pageAlerts(tabId).catch(() => null);
      const v = judgeSave(al, formUrl);
      if (v === 'error') { err = al.errs.join(' | ') + ' — صحّحه ثم اضغط «حفظ» مجددًا.'; continue; }
      if (v === 'saved' && (submitted || (al && al.oks.length))) return 'saved';
      const b = await askSaved(r, al, !submitted);
      if (b === 'yes') return 'saved';
      if (b === 'stop') return 'stop';
      return 'refill';
    }
  }
}

// ٣ب) الحفظ التلقائي
async function autoSave(r, formUrl) {
  setSt(r, 'run', 'حفظ…');
  setBox('run', 'جارٍ الحفظ في نور…');
  await sleep(800);
  if (stopFlag) return 'stop';
  const nav = waitNavigation(30000);
  const c = await clickSave(tabId, 10000, () => stopFlag);
  if (c.aborted || stopFlag && !c.clicked) return 'stop';
  if (!c.clicked) throw new Error(c.disabled ? 'زر «حفظ» في نور ما زال معطّلًا — ربما ينقص اختيار الصفوف أو حقل مطلوب' : 'لم أجد زر «حفظ» في الصفحة');
  const navigated = await nav;
  await sleep(600);
  const al = await pageAlerts(tabId).catch(() => null);
  const v = judgeSave(al, formUrl);
  if (v === 'error') throw Object.assign(new Error('رسالة من نور: ' + al.errs.join(' | ')), { noor: true });
  if (v === 'saved' && (navigated || (al && al.oks.length))) return 'saved';
  if (al && al.login) throw Object.assign(new Error('انتهت جلسة نور — سجّل الدخول ثم اضغط «ابدأ» لتكمل'), { fatal: true });
  // لم يتضح من الصفحة: قائمة التحاضير (إن انتقلت نور إليها) تحسم الأمر خلال ثوانٍ
  for (let i = 0; i < 6 && !stopFlag; i++) {
    await sleep(800);
    state = (await getPackages()).state;
    if (sessionStatus(state, pkg.id, r.lesson.id).saved) return 'saved';
  }
  throw Object.assign(new Error('لم أتأكد من الحفظ — راجعها في قائمة التحاضير'), { skip: true });
}

async function recordSaved(lesson, date) {
  await sleep(1500);   // قد يكون العامل الخلفي سجّلها للتو
  state = (await getPackages()).state;
  const s = sessionStatus(state, pkg.id, lesson.id);
  if (!(s.saved && Date.now() - s.saved < 60000)) await markSaved(pkg.id, lesson.id, date, 'جماعي');
  state = (await getPackages()).state;
}

const BAD = ['nolabel', 'notarget', 'fail', 'miss'];
const anyFilled = (rep) => rep.some((x) => x.status === 'ok' || x.status === 'partial');

// أحدث نسخة من الحصة (ربما عُدّلت في المكتبة والنافذة مفتوحة) — false إن حُذفت
async function refreshLesson(r) {
  const fresh = await getPackages();
  packages = fresh.packages; state = fresh.state;
  const p = packages.find((x) => x.id === pkg.id);
  const l = p && (p.lessons || []).find((x) => x.id === r.lesson.id);
  if (!l) return false;
  pkg = p; r.lesson = l;
  return true;
}
// بعد كل تعبئة: «عُبّئت ولم تُحفظ بعد» حتى يثبت الحفظ (فلا تُعدّ منجزة إن أُغلقت النافذة قبل ذلك)
async function filled(r, rep) {
  if (!anyFilled(rep)) return;
  r.filledAt = Date.now();
  await markSaveFailed(pkg.id, r.lesson.id, 'unsaved');
}

async function processItem(r, mode, queue) {
  if (!(await refreshLesson(r))) return 'gone';
  const c = await obtainForm(r);
  if (c === 'skip') return 'skip';
  if (!c) return 'stop';
  if (!(await refreshLesson(r))) return 'gone';   // قد يطول انتظار النموذج: نعبّئ بآخر نسخة
  const formUrl = await tabUrl(tabId);
  setSt(r, 'run', 'تعبئة…');
  setBox('run', 'جارٍ التعبئة…', 'لحظات — قوائم نور تأخذ بضع ثوانٍ.');
  let rep = await fillNoor(tabId, pkg, r.lesson, { publishDate: r.date, skipFilled: false, noLog: true, noorTitle: c.title });
  if (rep.some((x) => x.blocked)) throw Object.assign(new Error(`لم أجد درسها «${r.lesson.lesson}» في شجرة الدروس في نور`), { skip: true });
  await filled(r, rep);
  // إذا قالت نور إن التاريخ مستخدم: ننتقل لأقرب يوم حصة تالٍ (حتى ٥ محاولات)
  for (let tries = 0; tries < 5 && !stopFlag; tries++) {
    const pb = rep.find((x) => x.key === 'publish');
    if (!pb || pb.status === 'ok' || !/من قبل|مسبق|مستخدم|مكرر/.test(pb.error || '')) break;
    const used = new Set(queue.filter((x) => x !== r).map((x) => x.date));
    const hol = holidaySet(settings);
    let cand = nextSchoolDay(r.date, days, false);
    for (let j = 0; j < 30 && (used.has(cand) || hol.has(cand)); j++) cand = nextSchoolDay(cand, days, false);
    setSt(r, 'wait', `التاريخ ${fmtDay(r.date)} مستخدم في نور — أجرّب ${fmtDay(cand)}`);
    r.date = cand; r.fixed = cand; r.dateSrc = 'fixed';
    $('nowDate').textContent = 'النشر: ' + dayLabel(r.date);
    rep = await fillNoor(tabId, pkg, r.lesson, { publishDate: r.date, skipFilled: false, noLog: true, noorTitle: c.title });
    await filled(r, rep);
  }
  if (stopFlag) return 'stop';
  const bad = rep.filter((x) => BAD.includes(x.status));
  const pub = rep.find((x) => x.key === 'publish');
  if (pub && pub.status !== 'ok') throw new Error(pub.error ? 'نور: ' + pub.error : 'لم أستطع كتابة تاريخ النشر');
  const ts = rep.find((x) => x.key === 'timeslots');
  if (ts && ts.status === 'nolabel' && mode === 'auto') throw Object.assign(new Error('لم تظهر الصفوف لهذا التاريخ — تأكد أن لديك حصة في هذا اليوم'), { skip: true });
  if (bad.length > 2) throw new Error('لم تُعبَّأ بنود: ' + bad.map((x) => x.name).join('، '));
  const pf = rep.find((x) => x.key === 'preflight');
  if (pf && pf.status !== 'ok' && mode === 'auto') throw Object.assign(new Error('لا يمكن الحفظ — ينقص: ' + (pf.missing || []).join('، ')), { skip: true });
  const warn = rep.filter((x) => x.status === 'partial' || BAD.includes(x.status)).map((x) => x.name);
  state = (await getPackages()).state;
  return mode === 'auto' ? autoSave(r, formUrl) : reviewSave(r, formUrl, warn);
}

// نبضة «جماعي يعمل» حتى لا تفتح نافذة الصفحة نفسها فوقه (تنتهي وحدها خلال ثوانٍ إن أُغلقت النافذة فجأة)
let hb = null;
function heartbeat(on) {
  clearInterval(hb);
  const beat = () => chrome.storage.session.set({ batchRun: { at: Date.now() } }).catch(() => {});
  if (on) { beat(); hb = setInterval(beat, 5000); } else chrome.storage.session.remove('batchRun').catch(() => {});
}

// حصة عُبّئت في هذا التشغيل ثم لم تُحفظ (تخطٍّ أو إيقاف أو خطأ): تبقى مقترحة لا «منجزة» ومع سبب صحيح
async function leftUnsaved(r, why) {
  if (!r.filledAt) return;
  r.filledAt = 0;
  await markSaveFailed(pkg.id, r.lesson.id, why);
  state = (await getPackages()).state;
}

// ================= التشغيل =================
let starting = false;
async function run() {
  if (running || starting) return;   // ضغطتان سريعتان على «ابدأ» لا تبدآن دفعتين
  starting = true;
  try { await runInner(); } finally { starting = false; }
}
async function runInner() {
  const id0 = pkg && pkg.id;
  await reload();
  if (!pkg || pkg.id !== id0) { pkgGone(); return; }
  syncRows();
  const queue = rows.filter((r) => r.on);
  if (!queue.length) { renderList(); return; }
  if (queue.some((r) => !r.date)) { msg('bad', 'حدد تاريخًا لكل حصة مختارة.'); return; }
  const dups = queue.map((r) => r.date).filter((d, i, a) => a.indexOf(d) !== i);
  if (dups.length) { msg('bad', `التاريخ ${esc(dayLabel(dups[0]))} مكرر لأكثر من حصة — نور لا تقبل ذلك.`); return; }
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'auto' && !confirm(`سأعبّئ وأحفظ ${countWord(queue.length)} في نور وحدي دون أن أسألك — وأتخطّى أي حصة فيها مشكلة وأكمل، وأعرض لك ما تخطّيته في النهاية. متابعة؟`)) return;

  running = true; stopFlag = false; stopHooks.length = 0;
  skippedIds.clear(); lastSubmit.clear();
  queue.forEach((r) => { r.filledAt = 0; r.noAuto = false; r.waitNote = ''; });
  $('startBtn').hidden = true; $('stopBtn').hidden = false; $('stopBtn').disabled = false;
  $('topMsg').className = 'msg';
  heartbeat(true);
  let ok = 0, skipped = 0, k = 0, endMsg = null, fails = 0;
  const problems = [];
  runMode = mode;

  while (k < queue.length && !stopFlag) {
    const r = queue[k];
    curId = r.lesson.id;
    nextId = queue[k + 1] ? queue[k + 1].lesson.id : null;
    showNow(r, k, queue.length);
    renderList();
    $('prog').style.width = (k / queue.length * 100) + '%';
    let out;
    try { out = await processItem(r, mode, queue); fails = 0; }
    catch (e) {
      await leftUnsaved(r, e && e.noor ? 'error' : 'unsaved');
      // التلقائي بالكامل: الحصة تُتخطّى مع سببها ونكمل (وإن تعثّرت ٣ حصص متتالية نتوقف — غالبًا مشكلة عامة)
      if (mode === 'auto' && !(e && e.fatal) && !stopFlag && ++fails < 3) {
        skipped++; skippedIds.add(r.lesson.id);
        problems.push(`${r.lesson.lesson ? r.lesson.lesson + " — " : ""}${r.lesson.title}: ${e.message || e}`);
        setSt(r, 'bad', '✕ تُخطّيت: ' + (e.message || e));
        logLine('bad', `✕ ${r.lesson.title} — ${e.message || e}`);
        k++;
        continue;
      }
      setSt(r, 'bad', '✕ ' + (e.message || e));
      logLine('bad', `توقف عند: ${r.lesson.title}`);
      endMsg = ['bad', `توقف: ${esc(e.message || e)}<br>ما حُفظ قبلها بقي محفوظًا. صحّح المشكلة ثم اضغط «ابدأ» لتكمل من هذه الحصة.`];
      setBox('bad', 'توقف', String(e.message || e));
      break;
    }
    if (out === 'saved') {
      ok++;
      r.filledAt = 0;
      await recordSaved(r.lesson, r.date);
      setSt(r, 'ok', `✓ حُفظت — تاريخ النشر ${fmtDay(r.date)}`);
      logLine('ok', `✓ ${r.lesson.title}`);
      r.on = false;
      k++;
    } else if (out === 'skip' || out === 'gone') {
      skipped++;
      if (out === 'skip') { skippedIds.add(r.lesson.id); await leftUnsaved(r, 'unsaved'); }
      setSt(r, 'skip', out === 'gone' ? '— حُذفت من المكتبة' : '— تُخطّيت');
      logLine('skip', `— ${out === 'gone' ? 'حُذفت من المكتبة' : 'تُخطّيت'}: ${r.lesson.title}`);
      k++;
    } else if (out === 'refill') {
      setSt(r, 'wait', r.waitNote || 'لم تُحفظ — سأعيد تعبئتها');
    } else {   // stop
      await leftUnsaved(r, 'unsaved');
      break;
    }
  }

  heartbeat(false);
  await hideBar(null, lastBarTab);
  running = false; runMode = 'review';
  curId = null; nextId = null;
  $('startBtn').hidden = false; $('stopBtn').hidden = true;
  $('prog').style.width = (ok / queue.length * 100) + '%';
  state = (await getPackages()).state;
  if (endMsg) msg(endMsg[0], endMsg[1]);
  else if (stopFlag) { msg('warn', `أُوقف. حُفظ ${toAr(ok)} من ${toAr(queue.length)}.`); $('nowCard').hidden = true; }
  else {
    const head = !ok ? 'انتهى دون حفظ أي حصة.' : ok === 1 ? '✔ انتهى: حُفظت الحصة في نور.' : `✔ انتهى: حُفظ ${countWord(ok)} بتواريخ نشر مختلفة.`;
    msg(ok && !problems.length ? 'ok' : 'warn', head + (skipped ? ` (تُخطّيت ${countWord(skipped)})` : '')
      + (problems.length ? `<br><b>تحتاج نظرك:</b><br>${problems.map((x) => '• ' + esc(x)).join('<br>')}` : ''));
    $('nowCard').hidden = true;
  }
  renderList();
}

// تحديث القائمة إن عُدّلت المادة أو حُفظت حصة من مكان آخر والنافذة مفتوحة (قبل البدء)
let syncT = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !(ch.packages || ch.pkgState) || running || !pkg) return;
  clearTimeout(syncT);
  syncT = setTimeout(async () => {
    if (running || !pkg) return;
    const id0 = pkg.id, before = state;
    await reload();
    if (running) return;
    if (!pkg || pkg.id !== id0) { pkgGone(); return; }
    syncRows();
    // حصة محددة حُفظت للتو من مكان آخر: نلغي تحديدها حتى لا تُحفظ مرتين
    let changed = false;
    rows.forEach((r) => { if (r.on && !sessionStatus(before, id0, r.lesson.id).saved && sessionStatus(state, id0, r.lesson.id).saved) { r.on = false; changed = true; } });
    if (changed) autoDates(); else renderList();
  }, 500);
});

$('start').onchange = () => { if (running) return; startTouched = true; autoDates(); };
// «تحديد كل حصص الفصل»: كل ما لم يُنجز في المادة، بترتيبها، والتواريخ توزَّع على أيام حصصك — ضغطة ثانية تلغي التحديد
function selectTerm(on) {
  if (running) return;
  const left = rows.filter((r) => !done(r.lesson));
  rows.forEach((r) => { r.on = on && !done(r.lesson); });
  if (on) {
    left.forEach((r) => openGroups.add(groupKey(r.lesson)));
    const first = left[0];
    const sug = first ? suggestDate(state, settings, pkg, first.lesson).date : '';
    if (sug && !startTouched) $('start').value = sug;   // تاريخ اخترته أنت (ولو سابقًا) يبقى
  }
  autoDates();
  if (on && left.length) {
    const sel = rows.filter((r) => r.on);
    msg('info', `حُدِّدت كل حصص الفصل غير المنجزة: ${countWord(sel.length)} — من ${esc(dayLabel(sel[0].date))} إلى ${esc(dayLabel(sel[sel.length - 1].date))}. راجع التواريخ وطريقة الحفظ ثم اضغط «ابدأ».`);
  } else if (on) msg('ok', 'كل حصص هذا الفصل منجزة ✓');
}
$('selTerm').onclick = () => { const left = rows.filter((r) => !done(r.lesson)); selectTerm(!(left.length && left.every((r) => r.on))); };
$('selAll').onclick = () => { if (running) return; rows.forEach((r) => { if (openGroups.has(groupKey(r.lesson))) r.on = !done(r.lesson); }); autoDates(); };
$('selNone').onclick = () => { if (running) return; rows.forEach((r) => { r.on = false; }); autoDates(); };
$('weekPick').onchange = () => selectWeek($('weekPick').value);
$('todayPick').onclick = () => { const t = isoOf(new Date()); selectByDates(t, t, 'حصة اليوم ' + esc(dayLabel(t, false))); };
$('thisWeekPick').onclick = () => selectWeek(isoOf(new Date()));
$('rangePick').onclick = () => { const f = $('rangeFrom').value, t = $('rangeTo').value; if (!f && !t) { msg('warn', 'اكتب تاريخ البداية أو النهاية.'); return; } selectByDates(f && t && t < f ? t : f, f && t && t < f ? f : t, `الحصص من ${esc(dayLabel(f || t, false))} إلى ${esc(dayLabel(t || f, false))}`); };
// «تحديد وحدة»: كل غير المنجز في وحدة واحدة
$('unitPick').onchange = () => {
  if (running) return;
  const u = $('unitPick').value; if (!u) return;
  rows.forEach((r) => { r.on = kwNorm(r.lesson.unit || '') === u && !done(r.lesson); if (r.on) openGroups.add(groupKey(r.lesson)); });
  $('unitPick').value = '';
  autoDates();
  const sel = rows.filter((r) => r.on);
  msg(sel.length ? 'info' : 'warn', sel.length ? `حُدِّدت حصص الوحدة غير المنجزة: ${countWord(sel.length)}.` : 'كل حصص هذه الوحدة منجزة ✓');
};
$('expandAll').onclick = () => { const all = lessonGroups(pkg).map((g) => g.key); const allOpen = all.every((k) => openGroups.has(k)); all.forEach((k) => (allOpen ? openGroups.delete(k) : openGroups.add(k))); $('expandAll').textContent = allOpen ? 'عرض كل الدروس' : 'طيّ الدروس'; renderList(); };
$('autoOpen').onchange = () => patchSettings({ batchAutoOpen: $('autoOpen').checked });
$('startBtn').onclick = run;
$('stopBtn').onclick = () => { stopFlag = true; stopHooks.splice(0).forEach((f) => f()); $('stopBtn').disabled = true; };
const endBeat = () => { if (running) { clearInterval(hb); chrome.storage.session.remove('batchRun').catch(() => {}); } };
window.addEventListener('beforeunload', endBeat);
window.addEventListener('pagehide', endBeat);

init();
