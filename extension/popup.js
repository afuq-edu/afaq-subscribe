// popup.js — نافذة «حاضر»: الدرس ← الحصة ← التاريخ ← عبّئ
// تعمل كنافذة منبثقة من شريط كروم، أو داخل صفحة نور نفسها (popup.html?embed=1) عبر زر «حاضر» العائم.
import { getAll, upsertTemplate, uid, captureTab, fillTab, canRunOn } from './lib.js';
import {
  getPackages, savePkgState, getSettings, patchSettings, pageContext, fillNoor, diagNoor, pageReport, clickSave, pageAlerts, judgeSave,
  suggestSelection, pickSession, suggestDate, lessonGroups, groupKey, sessionStatus, usedDates, daysFor, nextInPackage, formUrlFor,
  getPicks, rememberPick, setSavedManually, markSaved, markSaveFailed, dayLabel, isoOf, parseIso, nextSchoolDay, driveApplies, kwNorm, lessonNum,
  unsavedText, pickTreeNode,
} from './packages.js';
import { ic } from './icons.js';
import { AFAQ } from './afaq-config.js';
import { getLink, getStatus, siteUrl } from './remote.js';

const $ = (id) => document.getElementById(id);
const EMBED = new URLSearchParams(location.search).has('embed');
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const textOf = (h) => new DOMParser().parseFromString(String(h || '').replace(/<\/p>|<br\s*\/?>|<\/li>/gi, '\n'), 'text/html').body.textContent.replace(/\n\s*\n+/g, '\n').trim();
const isNoorUrl = (u) => /^https?:\/\/([^/]+\.)?moe\.gov\.om\//i.test(u || '');
const shortTitle = (t) => { const h = String(t || '').split(/[:：]/)[0].trim(); return h && h.length <= 22 ? h : String(t || '').slice(0, 22) + (String(t || '').length > 22 ? '…' : ''); };
function countWord(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? toAr(n) + ' ' + few : toAr(n) + ' ' + many; }
const sessionsWord = (n) => countWord(n, 'حصة واحدة', 'حصتان', 'حصص', 'حصة');
const fieldsWord = (n) => (n === 0 ? 'لا حقول' : countWord(n, 'حقل واحد', 'حقلان', 'حقول', 'حقلًا'));

const S = {
  tab: null, ctx: null, packages: [], state: null, settings: null, picks: {},
  sel: null, date: '', dateWhy: '', dateLast: '', dateTouched: false,
  pickerOpen: false, previewOpen: false, busy: false, result: null, saved: null, tplMode: false,
};

// ---------------- البيانات والصفحة ----------------
async function loadData() {
  const [{ packages, state }, settings, picks] = await Promise.all([getPackages(), getSettings(), getPicks()]);
  S.packages = packages; S.state = state; S.settings = settings; S.picks = picks;
}

async function getTab() {
  if (EMBED) { try { const t = await chrome.tabs.getCurrent(); if (t) return t; } catch (e) {} }
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t || null;
}

async function checkPage() {
  const url = (S.tab && S.tab.url) || '';
  if (!S.tab || (url && !canRunOn(url))) S.ctx = { isForm: false, found: 0, url };
  else S.ctx = await pageContext(S.tab.id);
  if (!S.ctx.url) S.ctx.url = url;
  renderAll();
  // النموذج ما زال يُحمَّل (أو صفحة الإضافة لم تكتمل): ننتظره قليلًا
  const loadingForm = (S.ctx.isForm && !S.ctx.ready) || (!S.ctx.isForm && /add_preparation/i.test(url));
  if (loadingForm && S.tab) {
    for (let i = 0; i < 25; i++) {
      await sleep(700);
      const c = await pageContext(S.tab.id);
      if (!c.url) c.url = url;
      const changed = c.isForm !== S.ctx.isForm || c.ready !== S.ctx.ready || c.title !== S.ctx.title;
      S.ctx = c;
      if (changed) renderAll();
      if (c.isForm && c.ready) break;
    }
  }
}

function ensureSelection() {
  if (S.sel) {
    const pkg = S.packages.find((p) => p.id === S.sel.pkg.id);
    const sessions = pkg ? (pkg.lessons || []).filter((l) => groupKey(l) === S.sel.group) : [];
    if (sessions.length) {
      const session = sessions.find((l) => l.id === S.sel.session.id) || pickSession(sessions, S.state, pkg.id, S.ctx.mark);
      S.sel = Object.assign({}, S.sel, { pkg, sessions, session });
      return;
    }
  }
  S.sel = suggestSelection({ packages: S.packages, state: S.state, title: S.ctx.title, picks: S.picks, mark: S.ctx.mark, settings: S.settings });
  if (S.sel && S.sel.how === 'nomatch' && !(S.sel.candidates || []).length) S.pickerOpen = true;
  if (S.sel && !S.dateTouched) setSuggestedDate();
}

function setSuggestedDate() {
  if (S.ctx && S.ctx.mark && S.sel && S.ctx.mark.lessonId === S.sel.session.id && S.ctx.mark.date) {
    S.date = S.ctx.mark.date; S.dateWhy = 'same'; S.dateLast = '';
    return;
  }
  const r = suggestDate(S.state, S.settings, S.sel.pkg, S.sel.session);
  S.date = r.date; S.dateWhy = r.why; S.dateLast = r.last; S.dateFrom = r.from || '';
}

async function persistChoice() {
  const { state } = await getPackages();
  state.pkgId = S.sel.pkg.id; state.lessonId = S.sel.session.id;
  await savePkgState(state);
  S.state = state;
}

// ---------------- العرض ----------------
function renderAll() {
  renderContext();
  const hasLib = S.packages.some((p) => (p.lessons || []).length);
  const onForm = !!(S.ctx && S.ctx.isForm);
  $('tplView').hidden = !S.tplMode;
  $('noPage').hidden = S.tplMode || onForm || !!S.saved;
  $('noLib').hidden = S.tplMode || !onForm || hasLib;
  $('flow').hidden = S.tplMode || !onForm || !hasLib;
  renderBanner();
  if (!$('noPage').hidden) renderNoPage();
  if ($('flow').hidden) return;
  ensureSelection();
  if (!S.sel) { $('flow').hidden = true; $('noLib').hidden = false; return; }
  renderLesson(); renderSessions(); renderPreview(); renderDate(); renderFill(); renderResult();
}

function renderContext() {
  const c = S.ctx || {};
  const url = c.url || (S.tab && S.tab.url) || '';
  if (c.isForm) {
    $('dot').className = 'dot ' + (c.ready ? 'on' : 'wait');
    $('ctxMain').textContent = c.ready ? 'صفحة «إضافة تحضير» — جاهزة للتعبئة' : 'نموذج التحضير يُحمَّل… لحظات';
    $('ctxSub').innerHTML = c.title ? `الدرس في نور: <q><bdi>${esc(c.title)}</bdi></q>` : 'لم أجد عنوان الدرس في الصفحة';
  } else {
    $('dot').className = 'dot';
    $('ctxMain').textContent = isNoorUrl(url) ? 'هذه الصفحة ليست نموذج «إضافة تحضير»' : 'لست في منصة نور الآن';
    $('ctxSub').textContent = c.error && isNoorUrl(url) ? 'تعذّر الوصول إلى الصفحة — أعد تحميلها ثم جرّب مجددًا.' : '';
  }
}

function renderNoPage() {
  const url = (S.ctx && S.ctx.url) || '';
  $('npTitle').textContent = isNoorUrl(url) ? 'افتح نموذج «إضافة تحضير» للدرس' : 'افتح صفحة «إضافة تحضير» في منصة نور';
  $('npText').textContent = isNoorUrl(url)
    ? 'من صفحة المادة في نور اختر الدرس ثم «إضافة تحضير»، وعندها يتعرّف «حاضر» على الدرس تلقائيًا.'
    : 'ادخل منصة نور ← المادة ← الدرس ← «إضافة تحضير»، ثم اضغط أيقونة «حاضر» أو الزر العائم في الصفحة.';
  $('openNoor').hidden = isNoorUrl(url);
}

function renderBanner() {
  const b = S.saved;
  if (!b) { $('banner').innerHTML = ''; return; }
  const pkg = S.packages.find((p) => p.id === b.pkgId);
  const cur = pkg && (pkg.lessons || []).find((l) => l.id === b.lessonId);
  const next = pkg && nextInPackage(pkg, S.state, b.lessonId, true);
  const back = next && cur && isBefore(pkg, next, cur);
  const sameLesson = next && cur && groupKey(next) === groupKey(cur);
  const url = next ? (sameLesson ? b.formUrl : formUrlFor(S.state, pkg.id, next)) : '';
  S.saved.nextUrl = url;
  $('banner').innerHTML = `<div class="res ok"><div class="res-h">${ic('check')} حُفظ التحضير في نور: ${esc(cur ? shortTitle(cur.title) : '')}${b.date ? ' · ' + esc(dayLabel(b.date)) : ''}</div>
    <div class="res-b">${next ? `<span class="note" style="margin:0">${back ? 'بقيت حصة سابقة لم تُنجز' : 'التالية'}: <b>${esc(next.title)}</b>${sameLesson ? '' : ` — من «${esc(next.lesson)}»`}</span>` : '<span class="note" style="margin:0">اكتملت حصص هذه المادة ✓</span>'}
      ${next && url ? `<button class="btn primary sm" id="nextForm">${ic('plus', 15)} افتح نموذج الحصة التالية</button>` : next ? '<span class="note" style="margin:0">افتح نموذج «إضافة تحضير» لدرسها في نور، وسأتحقق من التوافق وأختارها تلقائيًا.</span>' : ''}</div></div>`;
  const nf = $('nextForm');
  if (nf) nf.onclick = openNextForm;
}

const HOW = {
  page: ['info', 'عُبّئت في هذه الصفحة'], manual: ['', '✓ متوافق (أكّدته أنت)'], auto: ['', '✓ متوافق تلقائيًا'],
  nomatch: ['warn', '⚠ لم يتوافق تلقائيًا'], chain: ['info', 'التالية في خطتك'], last: ['info', 'آخر درس استخدمته'],
};
function confirmCardHtml() {
  const cands = S.sel.candidates || [];
  const items = cands.map((c) => {
    const s = c.why === 'chain' || c.why === 'date' ? c.lesson : null;
    return `<button class="cand" data-p="${esc(c.pkg.id)}" data-k="${esc(groupKey(c.lesson))}" data-s="${s ? esc(s.id) : ''}">
      <span class="cw">${c.why === 'date' ? '📅 بتاريخ الملف ' + esc(dayLabel(c.date, false)) + (c.diff === 0 ? ' (اليوم)' : c.diff > 0 ? ' (قادمة)' : ' (فائتة)') + (c.similar ? '، والأقرب لعنوان نور' : '') + (s ? ': ' + esc(s.title) : '') : c.why === 'chain' ? (c.retry ? 'لم تُحفظ بعد — أعدها' : 'التالية في خطتك') + (c.similar ? '، والأقرب لعنوان نور' : '') + (s ? ': ' + esc(s.title) : '') : 'الأقرب لعنوان نور'}</span>
      <b>${esc(c.lesson.lesson || 'درس')}</b><small>${esc([c.lesson.unit, c.pkg.title].filter(Boolean).join(' · '))}</small>
      <span class="go">✓ تأكد من التوافق</span></button>`;
  }).join('');
  return `<div class="conf">
    <div class="ch">${ic('alert', 15)} لم يتوافق تلقائيًا مع مكتبتك</div>
    <div class="nt">الدرس المفتوح في نور: <q><bdi>${esc((S.ctx && S.ctx.title) || '')}</bdi></q></div>
    ${cands.length ? `<div class="nt">هل هذه الصفحة لـ:</div>${items}` : '<div class="nt">لم أجد درسًا قريبًا — اختر الدرس الصحيح من القائمة، وسأتذكر اختيارك.</div>'}
    <div class="acts2"><button class="lnk" id="pickOther">${cands.length ? 'درس آخر…' : 'اختر الدرس…'}</button><button class="lnk muted" id="recheck">⟳ أعد فحص الصفحة</button></div>
  </div>`;
}
function renderLesson() {
  const { pkg, sessions, how } = S.sel;
  const first = sessions[0];
  const saved = sessions.filter((l) => sessionStatus(S.state, pkg.id, l.id).saved).length;
  const [cls, txt] = HOW[how] || ['info', ''];
  $('how').className = 'tag ' + cls; $('how').textContent = txt; $('how').hidden = !txt;
  if (how === 'nomatch') {
    $('lessonBox').innerHTML = confirmCardHtml();
    $('lessonBox').querySelectorAll('.cand').forEach((b) => { b.onclick = () => chooseGroup(b.dataset.p, b.dataset.k, b.dataset.s); });
    $('pickOther').onclick = () => { S.pickerOpen = true; renderLesson(); setTimeout(() => $('q').focus(), 30); };
  } else {
    const line = how === 'page' ? 'عُبّئت هذه الحصة في هذه الصفحة'
      : (how === 'chain' || how === 'last' || how === 'date') ? (S.ctx && S.ctx.tree ? (how === 'date' ? '📅 مقترحة بتاريخها في الملف — ' : '') + 'لم يُختر درس في نور بعد — سأختاره من شجرة الدروس عند التعبئة' : 'لا يظهر عنوان الدرس في نور — تأكد أنه الدرس الصحيح')
        : '⇄ متوافق مع الدرس المفتوح في نور';
    $('lessonBox').innerHTML = `<div class="lesson">
        <div class="l-top"><span class="chip">${esc(pkg.title || pkg.subject || 'مادة')}</span>${first.unit ? `<span class="l-unit">${esc(first.unit)}</span>` : ''}<span class="l-meta" style="margin:0 auto 0 0">${sessionsWord(sessions.length)} · محفوظ ${toAr(saved)}</span></div>
        <div class="l-name">${esc(first.lesson || 'درس بلا عنوان')}</div>
      </div><div class="mline ${(how === 'chain' || how === 'last' || how === 'date') && !(S.ctx && S.ctx.tree) ? 'warn' : ''}"><span>${line}</span><button class="lnk" id="recheck">تأكد من التوافق ⟳</button></div>`;
  }
  const rc = $('recheck');
  if (rc) rc.onclick = recheckMatch;
  $('chgBtn').textContent = S.pickerOpen ? 'إغلاق القائمة' : 'تغيير الدرس';
  $('picker').hidden = !S.pickerOpen;
  if (S.pickerOpen) renderPicker();
}

// «تأكد من التوافق»: إعادة قراءة صفحة نور ومطابقتها من جديد
async function recheckMatch() {
  const rc = $('recheck');
  if (rc) rc.textContent = 'جارٍ الفحص…';
  S.sel = null; S.result = null; S.pickerOpen = false;
  if (!S.dateTouched) S.date = '';
  await loadData();
  await checkPage();
  const how = S.sel && S.sel.how;
  flashNote(how === 'nomatch' ? 'ما زال لا يتوافق تلقائيًا — أكّد الدرس الصحيح من الخيارات' : how ? '✓ فُحصت الصفحة: ' + (HOW[how] || ['', ''])[1] : '');
}
function flashNote(t) {
  if (!t) return;
  const n = document.createElement('div');
  n.className = 'note';
  n.style.cssText = 'margin:6px 2px 0;font-weight:700';
  n.textContent = t;
  $('lessonBox').appendChild(n);
  setTimeout(() => n.remove(), 4000);
}

function renderPicker() {
  const q = $('q').value.trim();
  const qn = kwNorm(q.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
  const num = /^\d+$/.test(qn) ? +qn : null;
  let html = '', n = 0;
  for (const p of S.packages) {
    const gs = lessonGroups(p).filter((g) => {
      if (!qn) return true;
      const hay = kwNorm(g.unit + ' ' + g.lesson + ' ' + (p.title || ''));
      return hay.includes(qn) || (num != null && lessonNum(g.lesson) === num);
    });
    if (!gs.length) continue;
    html += `<div class="pg">${esc(p.title || p.subject)}</div>`;
    gs.forEach((g) => {
      const saved = g.sessions.filter((l) => sessionStatus(S.state, p.id, l.id).saved).length;
      const sel = S.sel && S.sel.pkg.id === p.id && S.sel.group === g.key;
      html += `<button class="pl ${sel ? 'sel' : ''}" data-p="${esc(p.id)}" data-k="${esc(g.key)}">${g.unit ? `<small>${esc(g.unit)}</small>` : ''}<span>${esc(g.lesson || 'درس')}</span><em>${sessionsWord(g.sessions.length)} · محفوظ ${toAr(saved)}${sel ? ' · المختار الآن' : ''}</em></button>`;
      n++;
    });
  }
  $('pickList').innerHTML = n ? html : `<div class="empty">لا نتائج لـ «${esc(q)}»</div>`;
  $('pickList').querySelectorAll('.pl').forEach((b) => { b.onclick = () => chooseGroup(b.dataset.p, b.dataset.k); });
  const s = $('pickList').querySelector('.pl.sel');
  if (s && !q) s.scrollIntoView({ block: 'nearest' });
}

async function chooseGroup(pkgId, key, preferId) {
  const pkg = S.packages.find((p) => p.id === pkgId);
  if (!pkg) return;
  const sessions = pkg.lessons.filter((l) => groupKey(l) === key);
  if (!sessions.length) return;
  const session = (preferId && sessions.find((l) => l.id === preferId)) || pickSession(sessions, S.state, pkg.id, null);
  S.sel = { pkg, group: key, sessions, session, how: 'manual' };
  S.pickerOpen = false; S.result = null; $('q').value = '';
  if (!S.dateTouched) setSuggestedDate();
  renderAll();
  await rememberPick(S.ctx.title, pkg.id, session.id);
  await persistChoice();
}

// اسم مختصر للحصة على الزر: «الأولى»، «الثانية»… أو رقمها
function chipLabel(l, i) {
  const head = String(l.title || '').split(/[:：]/)[0].trim().replace(/^الحصة\s+/, '');
  return head && head.length <= 12 ? head : toAr(i + 1);
}
function renderSessions() {
  const { pkg, sessions, session } = S.sel;
  $('sessChips').innerHTML = sessions.map((l, i) => {
    const s = sessionStatus(S.state, pkg.id, l.id);
    const cls = s.saved ? 'saved' : s.filled ? 'filled' : '';
    const st = s.saved ? ' — محفوظة' : s.filled ? ' — عُبّئت' : '';
    return `<button class="sc ${cls} ${l.id === session.id ? 'sel' : ''}" data-id="${esc(l.id)}" title="${esc(l.title + st)}">${s.saved ? '✓ ' : s.filled ? '• ' : ''}${esc(chipLabel(l, i))}</button>`;
  }).join('');
  $('sessChips').querySelectorAll('.sc').forEach((b) => { b.onclick = () => selectSession(b.dataset.id); });
  const s = sessionStatus(S.state, pkg.id, session.id);
  const cls = s.saved ? 'saved' : s.filled ? 'filled' : '';
  let sd = s.saved ? `<b>محفوظة في نور</b>${s.savedDate ? ' · ' + esc(dayLabel(s.savedDate, false)) : ''} <button class="lnk muted" data-mark="0">إلغاء التسجيل</button>`
    : s.filled ? `<b>عُبّئت</b>${s.date ? ' · ' + esc(dayLabel(s.date, false)) : ''} · ${unsavedText(s)} <button class="lnk" data-mark="1" title="إن كنت حفظتها في نور ولم تُسجَّل">حفظتُها ✓</button>`
      : 'لم تُعبّأ بعد';
  const idx = sessions.indexOf(session);
  $('sessCard').innerHTML = `<div class="scard ${cls}"><span class="st">${esc(session.title || 'حصة')}</span><span class="sd">${sessions.length > 1 ? `${toAr(idx + 1)} من ${toAr(sessions.length)} · ` : ''}${sd}</span></div>`;
  $('sessCard').querySelectorAll('[data-mark]').forEach((b) => {
    b.onclick = async () => {
      await setSavedManually(pkg.id, session.id, b.dataset.mark === '1', s.date || S.date);
      await loadData(); ensureSelection(); renderLesson(); renderSessions(); renderDate();
    };
  });
}

async function selectSession(id) {
  const l = S.sel.sessions.find((x) => x.id === id);
  if (!l || l.id === S.sel.session.id) return;
  S.sel.session = l; S.result = null;
  if (!S.dateTouched) setSuggestedDate();
  renderSessions(); renderPreview(); renderDate(); renderFill(); renderResult();
  await persistChoice();
}

function renderPreview() {
  $('pvBtn').textContent = S.previewOpen ? 'إخفاء المعاينة' : 'معاينة المحتوى';
  $('preview').hidden = !S.previewOpen;
  if (!S.previewOpen) return;
  const { pkg, session: l } = S.sel;
  const empty = '<span class="pv-empty">— فارغ —</span>';
  const chips = (a, cls = '') => (a || []).map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join('');
  const txt = (h, n = 120) => { const t = textOf(h).replace(/\n/g, ' · '); return t ? esc(t.length > n ? t.slice(0, n) + '…' : t) : empty; };
  const outs = textOf(l.outcomes).split('\n').filter(Boolean);
  const rows = [
    ['المخرجات', (outs.length ? `${toAr(outs.length)} — ${esc(outs[0].slice(0, 80))}${outs[0].length > 80 ? '…' : ''}<br>` : '') + '<small>في نور تُحدَّد مربعات المخرجات كلها</small>'],
    ['المستوى', chips(l.levels, 'gold') || empty],
    ['الاستراتيجيات', (chips(l.strategies) || empty) + (l.strategiesOther ? `<div>أخرى: ${esc(l.strategiesOther)}</div>` : '')],
    ['المصادر', (chips(l.resources) || empty) + (l.resourcesOther ? `<div>أخرى: ${esc(l.resourcesOther)}</div>` : '')],
    ['المفاهيم', txt(l.concepts)],
    ['التهيئة', txt(l.intro)],
    ['سير الدرس', txt(l.procedures, 170)],
    ['التكويني', txt(l.formative)],
    ['الختامي', txt(l.summative)],
    ['الملاحظات', (textOf(l.notes) ? txt(l.notes) : (driveApplies(pkg) ? '' : empty)) + (driveApplies(pkg) ? `<div>${ic('link', 13)} يُضاف رابط ملفات الدرس (الدرايف)</div>` : '')],
  ];
  $('preview').innerHTML = rows.map(([k, v]) => `<div class="pv-r"><b>${k}</b><div>${v}</div></div>`).join('')
    + `<div class="pv-foot"><span class="note" style="margin:0">معاينة مختصرة</span><button class="lnk" id="editLesson">${ic('edit', 13)} تعديل هذه الحصة</button></div>`;
  $('editLesson').onclick = () => openPage(`options.html#edit/${encodeURIComponent(pkg.id)}/${encodeURIComponent(l.id)}`);
}

function prevSchoolDay(iso, days) {
  const d = parseIso(iso);
  for (let i = 0; i < 14; i++) { d.setDate(d.getDate() - 1); if (days.includes(d.getDay())) break; }
  return isoOf(d);
}

function renderDate() {
  const on = S.state.pubOn !== false;
  $('pubOn').checked = on;
  $('pubLbl').textContent = on ? 'يُكتب' : 'لا يُكتب';
  $('dateBox').classList.toggle('off', !on);
  $('pubDate').value = S.date || '';
  $('dayName').textContent = S.date ? dayLabel(S.date) : '';
  const notes = []; let warn = false;
  if (S.date && S.sel) {
    const today = isoOf(new Date());
    const days = daysFor(S.state, S.settings, S.sel.pkg.id);
    const other = (usedDates(S.sel.pkg, S.state)[S.date] || []).filter((u) => u.lessonId !== S.sel.session.id);
    if (other.length) { warn = true; notes.push(`⚠ هذا التاريخ مستخدم لـ«${shortTitle(other[0].title)}»${other[0].saved ? ' (محفوظة)' : ''} — نور لا تقبل تاريخين متطابقين.`); }
    if (S.date < today) { warn = true; notes.push('⚠ هذا تاريخ مضى.'); }
    if (!days.includes(parseIso(S.date).getDay())) { warn = true; notes.push('⚠ هذا اليوم ليس من أيام حصص المادة (يمكن تغييرها من المكتبة).'); }
  }
  if (!warn && S.date && !S.dateTouched) {
    notes.push(S.dateWhy === 'same' ? 'نفس تاريخ هذه الحصة عند تعبئتها.'
      : S.dateWhy === 'file' ? (S.dateFrom && S.dateFrom !== S.date ? `📅 تاريخ النشر من ملف المادة (${dayLabel(S.dateFrom, false)}) — نُقل إلى يوم الحصة التالي لأنه إجازة أو مستعمل.` : '📅 تاريخ النشر كما في ملف المادة.')
      : S.dateWhy === 'after' && S.dateLast ? `مقترح: اليوم الدراسي التالي بعد آخر تاريخ استخدمته (${dayLabel(S.dateLast, false)}).` : 'مقترح: أقرب يوم دراسي.');
  }
  $('dateNote').className = 'note' + (warn ? ' warn' : '');
  $('dateNote').innerHTML = notes.map(esc).join('<br>');
  $('dateNote').hidden = !notes.length;
}

function renderFill() {
  const ready = !!(S.ctx && S.ctx.isForm && S.ctx.ready);
  const l = S.sel && S.sel.session;
  const pub = S.state.pubOn !== false && S.date;
  const needConfirm = !!(S.sel && S.sel.how === 'nomatch');
  $('fillBtn').disabled = !ready || !l || S.busy || needConfirm;
  $('fillBtn').classList.toggle('busy', S.busy);
  $('fillLbl').innerHTML = S.busy ? 'جارٍ التعبئة…' : ic('zap', 17) + ' عبّئ التحضير';
  $('fillSub').textContent = S.busy ? 'لحظات… قوائم نور تأخذ بضع ثوانٍ'
    : !ready ? 'انتظر اكتمال تحميل النموذج…'
      : needConfirm ? 'أكّد التوافق أولًا (الخطوة ١)'
      : (l ? shortTitle(l.title) : '') + (pub ? ' · ' + dayLabel(S.date) : ' · بدون تاريخ نشر');
}

// ---------------- نتيجة التعبئة ----------------
const BAD = ['nolabel', 'notarget', 'fail', 'miss'];
function noteFor(r) {
  let note = '';
  if (r.status === 'nolabel') note = 'لم أجد هذا البند في الصفحة';
  else if (r.status === 'notarget') note = 'وجدت عنوان البند لكن لم أجد خانته';
  else if (r.status === 'skip') note = 'تُرك لأنه مكتوب مسبقًا';
  else if (r.miss && r.miss.length) note = 'غير موجود في قائمة نور: ' + r.miss.map((m) => '«' + m + '»').join('، ');
  else if (r.status === 'fail') note = 'تعذّرت الكتابة' + (r.error ? ': ' + r.error : '');
  if (r.key === 'global') note = r.status === 'ok' ? (r.already ? 'كان محددًا' : 'حُدِّد ✓') : (r.status === 'nolabel' ? 'لم أجد هذا الخيار في الصفحة' : 'تعذّر تحديده');
  if (r.key === 'timeslots') {
    note = r.consequence ? 'لم تظهر الصفوف لأن نور رفضت التاريخ'
      : r.status === 'nolabel' ? 'لم تظهر صفوف لهذا التاريخ — ربما لا توجد لك حصة لهذه المادة في هذا اليوم'
        : r.status === 'ok' ? `حُدِّدت كل الصفوف (${toAr(r.total || 0)})` : `حُدِّد ${toAr((r.hits || 0) + (r.already || 0))} من ${toAr(r.total || 0)} صفوف — أكمل الباقي يدويًا`;
  }
  if (r.key === 'week') note = (r.values || [])[0] || '';
  if (r.key === 'lesson') note = r.status === 'ok'
    ? (r.how === 'suffix' ? 'العنوان: ' : 'اختير من شجرة نور: ') + '«' + ((r.values || [])[0] || '') + '»'
    : 'لم أجد هذا الدرس في شجرة نور — اختره بنفسك من الشجرة ثم اضغط «عبّئ» مجددًا';
  if (r.key === 'preflight') note = r.status === 'ok' ? 'كل البنود الإلزامية مكتملة' : 'ينقص قبل الحفظ: ' + (r.missing || []).join('، ');
  if (r.key === 'publish') note = r.error ? 'نور: ' + r.error : r.status === 'ok' ? 'كُتب ' + (r.values || []).join('، ') : (r.status === 'nolabel' ? 'لم أجد خانة تاريخ النشر' : 'تعذّرت كتابة التاريخ');
  if (r.added && r.added.length) {
    note = (r.replaced && r.replaced.length)
      ? 'ليست في قائمة نور: ' + r.replaced.map((m) => '«' + m + '»').join('، ') + ' — فاخترت: ' + r.added.join('، ')
      : 'أُكمل إلى ثلاثة باختيار: ' + r.added.join('، ');
  }
  if (r.other === true) note += (note ? ' · ' : '') + 'وكُتبت الإضافات في «أخرى»';
  if (r.other === false) note += (note ? ' · ' : '') + 'لم أجد خانة «أخرى»';
  if (r.how === 'checks' && r.key === 'outcomes') note = `حُدِّدت كل المربعات (${toAr(r.total || 0)})` + (r.status !== 'ok' ? ` — تعذّر ${toAr(r.total - r.hits - r.already)}` : '');
  return note;
}

function saveBoxHtml() {
  if (EMBED) return '<div class="save-box">راجع التحضير في الصفحة ثم اضغط «حفظ» في نور — سأسجّل الحصة كمحفوظة تلقائيًا.</div>';
  return `<div class="save-box"><span>راجع التحضير في الصفحة، ثم احفظه:</span>
    <div class="btns"><button class="btn primary sm" id="saveNow">${ic('save', 15)} احفظ في نور الآن</button></div>
    <span class="note" style="margin:0">أو اضغط «حفظ» في نور بنفسك — سأسجّل الحصة كمحفوظة تلقائيًا.</span></div>`;
}

// الحصة التالية في خطتك (قد تكون من الدرس التالي) — تُختار تلقائيًا حين تفتح نموذجها
// هل تأتي الحصة a قبل الحصة b في ترتيب المادة؟
function isBefore(pkg, a, b) {
  const order = lessonGroups(pkg).flatMap((g) => g.sessions);
  return order.indexOf(a) < order.indexOf(b);
}
function nextBoxHtml(fromId) {
  const pkg = S.sel && S.sel.pkg;
  const nx = pkg && nextInPackage(pkg, S.state, fromId, true);
  if (!nx) return '<div class="next-box">اكتملت حصص هذه المادة في خطتك ✓</div>';
  const cur = (pkg.lessons || []).find((l) => l.id === fromId);
  const back = cur && isBefore(pkg, nx, cur);
  const other = groupKey(nx) !== S.sel.group;
  const d = suggestDate(S.state, S.settings, pkg, nx).date;
  return `<div class="next-box"><b>${back ? 'لا حصص بعدها — بقيت حصة سابقة لم تُنجز:' : 'التالية:'}</b> «${esc(nx.title)}»${other ? ` — من «${esc(nx.lesson)}»` : ''}${d ? ' · ' + esc(dayLabel(d)) : ''}
    <small>بعد حفظ هذه في نور افتح نموذج «إضافة تحضير» ${other ? 'لدرسها' : 'من جديد'}، وسأختارها وأتحقق من التوافق تلقائيًا.</small></div>`;
}

function nextFreeDate(from) {
  const days = daysFor(S.state, S.settings, S.sel.pkg.id);
  const used = usedDates(S.sel.pkg, S.state);
  let d = nextSchoolDay(from || S.date || isoOf(new Date()), days, false);
  for (let i = 0; i < 30 && (used[d] || []).some((u) => u.lessonId !== S.sel.session.id); i++) d = nextSchoolDay(d, days, false);
  return d;
}

function renderResult() {
  const R = S.result;
  const box = $('result');
  if (!R) {
    const m = S.ctx && S.ctx.mark;
    if (m && S.sel && m.lessonId === S.sel.session.id && !sessionStatus(S.state, S.sel.pkg.id, m.lessonId).saved) {
      box.innerHTML = `<div class="res info"><div class="res-h">${ic('info')} عُبّئت هذه الحصة في هذه الصفحة${m.date ? ' بتاريخ ' + esc(dayLabel(m.date)) : ''}.</div><div class="res-b">${saveBoxHtml()}</div></div>`;
      bindResult();
    } else box.innerHTML = '';
    return;
  }
  if (R.error) { box.innerHTML = `<div class="res bad"><div class="res-h">${ic('alert')} ${esc(R.error)}</div></div>`; return; }
  if (R.saveMsg) { box.innerHTML = `<div class="res ${R.saveMsg[0]}"><div class="res-h">${ic(R.saveMsg[0] === 'ok' ? 'check' : 'alert')} ${esc(R.saveMsg[1])}</div>${R.rep ? `<div class="res-b">${saveBoxHtml()}</div>` : ''}</div>`; bindResult(); return; }
  // لم يُعثر على الدرس في شجرة نور: قائمة بدروس الشجرة لتختار المطابق مرة واحدة (يُتذكَّر بعدها)
  const blk = R.rep.find((r) => r.blocked);
  if (blk) {
    const cands = blk.cands || [];
    const byUnit = [];
    cands.forEach((c, i) => { let g = byUnit.find((x) => x.unit === c.unit); if (!g) byUnit.push(g = { unit: c.unit, items: [] }); g.items.push(Object.assign({ i }, c)); });
    const l = S.sel && S.sel.session;
    box.innerHTML = `<div class="res warn"><div class="res-h">${ic('alert')} لم أجد الدرس «${esc(l ? l.lesson : '')}» في شجرة الدروس في نور</div>
      <div class="res-b">${cands.length ? `<p class="note" style="margin:0 0 8px">اختر درس نور المطابق — سأختاره وأعبّئ، وأتذكّره في المرات القادمة:</p>
        <div class="tree-pick">${byUnit.map((g) => `<div class="tp-u">${esc(g.unit || '')}</div>${g.items.map((c) => `<button class="btn sm block tp" data-i="${c.i}">${esc(c.text)}</button>`).join('')}`).join('')}</div>`
        : '<p class="note" style="margin:0">اختر الدرس بنفسك من شجرة الدروس في نور، ثم اضغط «عبّئ» مجددًا.</p>'}
      <p class="note" style="margin:8px 0 0">لم أعبّئ شيئًا ولم أسجّل الحصة — نور لا تحفظ تحضيرًا بلا درس.</p></div></div>`;
    box.querySelectorAll('.tp').forEach((b) => {
      b.onclick = async () => {
        const c = cands[+b.dataset.i];
        box.querySelectorAll('.tp').forEach((x) => { x.disabled = true; });
        b.textContent = 'جارٍ اختياره في نور…';
        const r = await pickTreeNode(S.tab.id, c).catch(() => ({ status: 'fail' }));
        if (r.status !== 'picked') { b.textContent = 'تعذّر اختياره — اختره من الشجرة بنفسك'; return; }
        await rememberPick(r.title || c.text, S.sel.pkg.id, S.sel.session.id);
        S.ctx.title = r.title || c.text;
        S.result = null;
        doFill();
      };
    });
    return;
  }
  const pubFail = R.rep.find((r) => r.key === 'publish' && r.status !== 'ok');
  // إذا رفضت نور التاريخ فعدم ظهور الصفوف نتيجة لذلك، لا خطأ مستقل
  const rep = R.rep.map((r) => (pubFail && r.key === 'timeslots' && r.status === 'nolabel' ? Object.assign({}, r, { status: 'partial', total: 0, consequence: true }) : r));
  const okN = rep.filter((r) => r.status === 'ok').length;
  const badL = rep.filter((r) => BAD.includes(r.status));
  const warnL = rep.filter((r) => r.status === 'partial' || r.status === 'skip');
  const cls = !badL.length && !warnL.length ? 'ok' : okN ? 'warn' : 'bad';
  const head = cls === 'ok' ? 'تمت التعبئة كاملة' : okN ? `عُبّئ ${toAr(okN)} من ${toAr(rep.length)} — راجع الملاحظات` : 'لم تتم التعبئة';
  const chips = rep.map((r) => {
    const c = BAD.includes(r.status) ? 'bad' : r.status === 'ok' ? '' : 'warn';
    const sym = r.status === 'ok' ? '✓' : BAD.includes(r.status) ? '✕' : '!';
    return `<span class="rc ${c}" title="${esc(noteFor(r))}">${sym} ${esc(r.short || r.name)}</span>`;
  }).join('');
  const issues = rep.filter((r) => !r.consequence && (r.status !== 'ok' || (r.other === false) || (r.added && r.added.length))).map((r) =>
    `<li class="${BAD.includes(r.status) ? 'bad' : ''}"><b>${esc(r.name)}</b><small>${esc(noteFor(r))}</small></li>`).join('');
  const pb = rep.find((r) => r.key === 'publish');
  const ts = rep.find((r) => r.key === 'timeslots');
  const dateProblem = (pb && pb.status !== 'ok' && /من قبل|مسبق|مستخدم|مكرر/.test(pb.error || '')) || (ts && ts.status === 'nolabel' && pb && pb.status === 'ok');
  const retry = dateProblem ? `<button class="btn sm" id="retryNext">${ic('refresh', 14)} جرّب ${esc(dayLabel(nextFreeDate(R.date)))}</button>` : '';
  box.innerHTML = `<div class="res ${cls}"><div class="res-h">${ic(cls === 'ok' ? 'check' : 'alert')} ${head}</div>
    <div class="res-b"><div class="rcs">${chips}</div>${issues ? `<ul class="iss">${issues}</ul>` : ''}${retry}${okN ? saveBoxHtml() + nextBoxHtml(R.lessonId) : ''}</div></div>`;
  bindResult();
}

function bindResult() {
  const rn = $('retryNext');
  if (rn) rn.onclick = () => { S.date = nextFreeDate(S.result && S.result.date); S.dateTouched = true; renderDate(); doFill(); };
  const sn = $('saveNow');
  if (sn) sn.onclick = doSave;
}

// ---------------- التعبئة والحفظ ----------------
async function doFill() {
  if (S.busy || !S.sel) return;
  const { pkg, session } = S.sel;
  const pub = S.state.pubOn !== false ? (S.date || '') : '';
  S.busy = true; S.saved = null; renderBanner(); renderFill();
  $('result').innerHTML = `<div class="res info"><div class="res-h">${ic('clock')} جارٍ تعبئة البنود في نور…</div></div>`;
  try {
    const c = await pageContext(S.tab.id);
    if (!c.isForm) throw new Error('لم أعد أجد نموذج التحضير في الصفحة — هل انتقلت الصفحة؟ افتح «إضافة تحضير» مجددًا.');
    const rep = await fillNoor(S.tab.id, pkg, session, { publishDate: pub, noorTitle: S.ctx.title });
    S.result = { rep, pkgId: pkg.id, lessonId: session.id, date: pub, at: Date.now() };
    if (!rep.some((r) => r.blocked)) S.ctx.mark = { pkgId: pkg.id, lessonId: session.id, date: pub };
    await loadData();
    ensureSelection();
  } catch (e) {
    S.result = { error: 'حدث خطأ أثناء التعبئة: ' + String(e.message || e) };
  }
  S.busy = false;
  renderLesson(); renderSessions(); renderDate(); renderFill(); renderResult();
  const rb = $('result').firstElementChild;
  if (rb) rb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function waitNav(tabId, timeout) {
  let finish = () => {};
  const p = new Promise((res) => {
    let saw = false, t = null;
    const l = (id, info) => {
      if (id !== tabId) return;
      if (info.status === 'loading') saw = true;
      if (info.status === 'complete' && saw) finish(true);
    };
    finish = (v) => { chrome.tabs.onUpdated.removeListener(l); clearTimeout(t); res(v); };
    chrome.tabs.onUpdated.addListener(l);
    t = setTimeout(() => finish(false), timeout);
  });
  p.cancel = () => finish(false);
  return p;
}

async function doSave() {
  const sn = $('saveNow');
  if (sn) { sn.disabled = true; sn.textContent = 'جارٍ الحفظ…'; }
  const target = S.result && S.result.rep ? { pkgId: S.result.pkgId, lessonId: S.result.lessonId, date: S.result.date } : (S.ctx.mark || null);
  const formUrl = S.ctx.url || (S.tab && S.tab.url) || '';
  const setMsg = (type, text) => { S.result = Object.assign({}, S.result || {}, { saveMsg: [type, text] }); renderResult(); };
  const navP = waitNav(S.tab.id, 45000);
  let c;
  try { c = await clickSave(S.tab.id, 8000); } catch (e) { c = { clicked: false, error: e.message }; }
  if (!c.clicked) {
    navP.cancel();
    setMsg('bad', c.disabled ? 'زر «حفظ» في نور ما زال معطّلًا — غالبًا لم تُحدَّد الصفوف أو التاريخ. أكمل النموذج ثم احفظ.' : 'لم أجد زر «حفظ» في الصفحة.');
    return;
  }
  const navigated = await navP;
  await sleep(1200);
  let al = null;
  try { al = await pageAlerts(S.tab.id); } catch (e) {}
  const v = judgeSave(al, formUrl);
  if (v === 'error') {
    if (target) await markSaveFailed(target.pkgId, target.lessonId);
    setMsg('bad', 'رسالة من نور: ' + al.errs.join(' | '));
    return;
  }
  if (v !== 'saved' || (!navigated && !(al && al.oks.length))) {
    setMsg('warn', al && al.login ? 'يبدو أن جلسة نور انتهت — سجّل الدخول ثم أعد المحاولة.' : 'لم أتأكد من الحفظ — تحقق في نور، وإن حُفظ فاضغط «حفظتُها ✓» بجانب الحصة.');
    return;
  }
  await loadData();
  if (target && !sessionStatus(S.state, target.pkgId, target.lessonId).saved) {
    await markSaved(target.pkgId, target.lessonId, target.date, 'النافذة');
    await loadData();
  }
  S.saved = target ? Object.assign({ formUrl, group: S.sel ? S.sel.group : '' }, target) : null;
  S.result = null; S.sel = null; S.dateTouched = false;
  try { S.tab = await chrome.tabs.get(S.tab.id); } catch (e) {}
  await checkPage();
}

async function openNextForm() {
  const url = S.saved && (S.saved.nextUrl || S.saved.formUrl);
  if (!url) return;
  const navP = waitNav(S.tab.id, 45000);
  await chrome.tabs.update(S.tab.id, { url });
  $('banner').innerHTML = `<div class="res info"><div class="res-h">${ic('clock')} جارٍ فتح نموذج جديد…</div></div>`;
  await navP;
  S.saved = null; S.result = null; S.sel = null; S.dateTouched = false; S.pickerOpen = false;
  try { S.tab = await chrome.tabs.get(S.tab.id); } catch (e) {}
  await loadData();
  await checkPage();
}

// ---------------- أدوات عامة ----------------
function openPage(path) {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  if (EMBED) closeUi();
}
function closeUi() {
  if (EMBED) parent.postMessage({ hadir: 'close' }, '*');
  else window.close();
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return; } catch (e) {}
  const ta = document.createElement('textarea');
  ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
}

// ---------------- القوالب الملتقطة (الطريقة الإضافية) ----------------
const T = { templates: [], selected: null, captured: null };
function tMsg(type, html) { const el = $('tMsg'); el.className = 'msg show ' + type; el.innerHTML = html; }
async function tLoad() {
  const all = await getAll();
  T.templates = all.templates;
  if (!T.selected || !T.templates.find((t) => t.id === T.selected)) T.selected = (T.templates.find((t) => t.id === all.settings.lastTemplateId) || T.templates[0] || {}).id || null;
  tRender();
}
function tRender() {
  const q = $('tSearch').value.trim();
  const items = T.templates.filter((t) => !q || [t.name, t.subject, t.grade].join(' ').includes(q));
  $('tList').innerHTML = !T.templates.length
    ? '<div class="empty"><b>لا توجد قوالب</b>اكتب التحضير في أي نموذج ثم اضغط «التقط» بالأسفل.</div>'
    : !items.length ? `<div class="empty">لا نتائج لـ «${esc(q)}»</div>`
      : items.map((t) => `<div class="tpl ${t.id === T.selected ? 'sel' : ''}" data-id="${esc(t.id)}"><div class="nm">${esc(t.name)}</div><div class="meta">${t.subject ? `<span class="chip">${esc(t.subject)}</span>` : ''}${t.grade ? `<span class="chip gold">${esc(t.grade)}</span>` : ''}<span>${fieldsWord((t.fields || []).length)}</span></div></div>`).join('');
  $('tList').querySelectorAll('.tpl').forEach((el) => { el.onclick = () => { T.selected = el.dataset.id; tRender(); }; });
  const can = !!(S.tab && canRunOn(S.tab.url || 'https://x'));
  $('tFill').disabled = !T.selected || !can;
  $('tCapture').disabled = !can;
  $('tSaveOver').disabled = !T.selected;
}
async function tFill() {
  const t = T.templates.find((x) => x.id === T.selected);
  if (!t) return;
  $('tFill').disabled = true;
  try {
    const r = await fillTab(S.tab.id, t, { skipFilled: !!S.settings.skipFilled });
    if (r.filled && !r.missing) tMsg('ok', `✓ عُبّئ ${fieldsWord(r.filled)}. راجع ثم احفظ.`);
    else if (r.filled) tMsg('warn', `عُبّئ ${toAr(r.filled)} من ${fieldsWord(r.total)} — أكمل الباقي يدويًا.`);
    else tMsg('bad', 'لم أجد حقول هذا القالب في الصفحة.');
    await tLoad();
  } catch (e) { tMsg('bad', 'خطأ: ' + esc(e.message || e)); }
  $('tFill').disabled = false;
}
async function tCapture() {
  try {
    const r = await captureTab(S.tab.id);
    if (!r.fields.length) { tMsg('warn', 'لم أجد حقولًا مكتوبة في الصفحة.'); return; }
    T.captured = r;
    $('tCapInfo').textContent = `التُقطت الحقول المكتوبة: ${fieldsWord(r.fields.length)}.`;
    $('tSave').hidden = false; $('tName').focus();
  } catch (e) { tMsg('bad', 'تعذّر قراءة الصفحة: ' + esc(e.message || e)); }
}
async function tSave(over) {
  const cap = T.captured; if (!cap) return;
  const name = $('tName').value.trim();
  let t;
  if (over) {
    const cur = T.templates.find((x) => x.id === T.selected); if (!cur) return;
    if (!confirm(`استبدال حقول القالب «${cur.name}» بما في الصفحة الآن؟`)) return;
    t = Object.assign({}, cur, { fields: cap.fields, name: name || cur.name, url: cap.url });
  } else {
    if (!name) { $('tName').focus(); return; }
    t = { id: uid(), name, subject: $('tSubject').value.trim(), grade: $('tGrade').value.trim(), notes: '', created: Date.now(), updated: Date.now(), lastUsed: 0, uses: 0, url: cap.url, pageTitle: cap.title, fields: cap.fields };
  }
  await upsertTemplate(t);
  T.selected = t.id; T.captured = null; $('tSave').hidden = true; $('tName').value = '';
  tMsg('ok', `✓ حُفظ القالب «${esc(t.name)}».`);
  await tLoad();
}

// ---------------- الربط ----------------
function setup() {
  document.body.classList.toggle('embed', EMBED);
  $('ver').textContent = 'الإصدار ' + chrome.runtime.getManifest().version;
  $('libBtn').innerHTML = ic('book', 16) + '<span>المكتبة</span>';
  $('helpBtn').innerHTML = ic('help', 16);
  $('closeBtn').innerHTML = ic('x', 16);
  $('closeBtn').hidden = !EMBED;
  $('openNoor').innerHTML = ic('external', 15) + ' فتح منصة نور';
  $('openLib').innerHTML = ic('book', 15) + ' المكتبة';
  $('addPlan').innerHTML = ic('plus', 15) + ' أضف تحضيرًا';
  $('batchBtn').innerHTML = ic('calendar', 16) + ' عدة حصص دفعة واحدة';
  $('termBtn').innerHTML = ic('zap', 16) + ' عبّئ كل حصص الفصل';
  $('optBtn').innerHTML = ic('sliders', 16);
  // «تحضير فصل كامل»: نافذة تبدأ من الصفحة الرئيسية في نور وتعبّئ كل حصص الفصل المختار
  // (زر بجوار «فتح منصة نور»، وآخر تحت «عبّئ كل حصص الفصل»)
  const openSemester = async () => {
    const tab = S.tab && isNoorUrl(S.tab.url || (S.ctx && S.ctx.url)) ? S.tab : null;
    const ps = [S.sel ? 'pkg=' + encodeURIComponent(S.sel.pkg.id) : '', tab ? `tab=${tab.id}&win=${tab.windowId}` : ''].filter(Boolean).join('&');
    await chrome.windows.create({ url: chrome.runtime.getURL('semester.html' + (ps ? '?' + ps : '')), type: 'popup', width: 560, height: 900 });
    closeUi();
  };
  [$('openNoor'), $('termBtn')].forEach((after) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = after.id + 'Semester';
    b.className = after.className.replace(/\bprimary\b/, '').replace(/\s+/g, ' ').trim();
    b.title = 'يبدأ من الصفحة الرئيسية في نور ويعبّئ ويحفظ كل حصص الفصل الدراسي الذي تختاره';
    b.innerHTML = ic('calendar', 15) + ' تحضير فصل كامل من الرئيسية';
    b.onclick = openSemester;
    after.insertAdjacentElement('afterend', b);
  });

  $('libBtn').onclick = () => openPage('options.html#library');
  $('helpBtn').onclick = () => openPage('options.html#help');
  $('closeBtn').onclick = closeUi;
  $('openNoor').onclick = () => { chrome.tabs.create({ url: 'https://lms.moe.gov.om/' }); if (EMBED) closeUi(); };
  $('openLib').onclick = () => openPage('options.html#library');
  $('addPlan').onclick = () => openPage('options.html#create');
  if (AFAQ.SERVICE) {
    // نسخة منصة أفق: المواد تأتي من الاشتراك — المكتبة الفارغة تعني حسابًا غير مربوط أو اشتراكًا منتهيًا
    (async () => {
      const [link, st] = await Promise.all([getLink(), getStatus()]);
      const box = $('noLib');
      const h = box.querySelector('h3'), p = box.querySelector('p');
      if (!link) { h.textContent = 'اربط «حاضر» بحسابك'; p.textContent = 'افتح موقع منصة أفق وسجّل الدخول، فتُربط الإضافة بحسابك وتصلها مواد اشتراكك.'; }
      else if (st && st.notes && st.notes.length && !(st.subs || []).some((x) => x.ready)) { h.textContent = 'تحاضير اشتراكك قيد الإعداد'; p.textContent = 'ستصل إلى الإضافة فور جاهزيتها. يمكنك تحديثها من حسابك في الموقع.'; }
      else { h.textContent = 'لا اشتراك فعّال'; p.textContent = 'انتهى اشتراكك أو لم يُفعَّل بعد. اطلب رمز التفعيل من منصة أفق وفعّله من حسابك.'; }
      $('addPlan').innerHTML = ic('link', 15) + ' افتح موقع منصة أفق';
      $('addPlan').onclick = () => { chrome.tabs.create({ url: siteUrl('#dashboard') }); };
    })().catch(() => {});
  }

  $('chgBtn').onclick = () => { S.pickerOpen = !S.pickerOpen; renderLesson(); if (S.pickerOpen) setTimeout(() => $('q').focus(), 30); };
  $('q').oninput = renderPicker;
  $('q').onkeydown = (e) => {
    if (e.key === 'Enter') { const b = $('pickList').querySelector('.pl'); if (b) b.click(); }
    if (e.key === 'Escape') { e.stopPropagation(); S.pickerOpen = false; renderLesson(); }
  };
  $('pvBtn').onclick = () => { S.previewOpen = !S.previewOpen; renderPreview(); };

  $('pubOn').onchange = async () => {
    const { state } = await getPackages();
    state.pubOn = $('pubOn').checked;
    await savePkgState(state); S.state = state;
    renderDate(); renderFill();
  };
  $('pubDate').onchange = () => { S.date = $('pubDate').value; S.dateTouched = true; S.result = null; renderDate(); renderFill(); renderResult(); };
  document.querySelectorAll('.qd button').forEach((b) => {
    b.onclick = () => {
      const days = daysFor(S.state, S.settings, S.sel && S.sel.pkg.id);
      const base = S.date || isoOf(new Date());
      const t = new Date();
      if (b.dataset.q === 'today') S.date = isoOf(t);
      else if (b.dataset.q === 'tomorrow') { t.setDate(t.getDate() + 1); S.date = isoOf(t); }
      else if (b.dataset.q === 'next') S.date = nextSchoolDay(base, days, false);
      else if (b.dataset.q === 'prev') S.date = prevSchoolDay(base, days);
      S.dateTouched = true; S.result = null;
      renderDate(); renderFill(); renderResult();
    };
  });

  $('fillBtn').onclick = doFill;
  const openBatch = async (all) => {
    if (!S.sel || !S.tab) return;
    const url = chrome.runtime.getURL(`batch.html?tab=${S.tab.id}&win=${S.tab.windowId}&pkg=${encodeURIComponent(S.sel.pkg.id)}&from=${encodeURIComponent(S.sel.session.id)}${all ? '&all=1' : ''}`);
    await chrome.windows.create({ url, type: 'popup', width: 490, height: 840 });
    closeUi();
  };
  $('batchBtn').onclick = () => openBatch(false);
  $('termBtn').onclick = () => openBatch(true);
  $('optBtn').onclick = () => { $('opts').hidden = !$('opts').hidden; if (!$('opts').hidden) $('opts').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  document.querySelectorAll('[data-set]').forEach((el) => {
    el.onchange = async () => { S.settings = await patchSettings({ [el.dataset.set]: el.checked }); };
  });

  $('diagBtn').onclick = async () => {
    if (!S.tab) return;
    try {
      const d = await diagNoor(S.tab.id);
      d.page = await pageReport(S.tab.id);
      d.ctx = S.ctx;
      await copyText(JSON.stringify(d, null, 1));
      $('diagBtn').textContent = '✓ نُسخ — الصقه في المحادثة مع المطوّر';
    } catch (e) {
      $('diagBtn').textContent = 'تعذّر التشخيص في هذه الصفحة';
    }
  };

  $('tplBtn').onclick = () => { S.tplMode = !S.tplMode; $('tplBtn').textContent = S.tplMode ? 'رجوع إلى التحاضير' : 'القوالب الملتقطة'; renderAll(); if (S.tplMode) tLoad(); };
  $('tplBack').onclick = () => $('tplBtn').click();
  $('tSearch').oninput = tRender;
  $('tFill').onclick = tFill;
  $('tCapture').onclick = tCapture;
  $('tSaveNew').onclick = () => tSave(false);
  $('tSaveOver').onclick = () => tSave(true);
  $('tCancel').onclick = () => { $('tSave').hidden = true; T.captured = null; };

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && EMBED) closeUi(); });

  // تحديث الحالات عند الحفظ من صفحة نور أو من نافذة أخرى
  let rt = null;
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !(ch.pkgState || ch.packages || ch.settings || ch.picks)) return;
    clearTimeout(rt);
    rt = setTimeout(async () => {
      if (S.busy) return;
      await loadData();
      if (!$('flow').hidden && S.sel) { ensureSelection(); renderLesson(); renderSessions(); renderDate(); renderFill(); }
      else if (S.saved) renderBanner();
    }, 250);
  });

  if (EMBED) {
    const post = () => parent.postMessage({ hadir: 'height', h: Math.ceil(document.body.getBoundingClientRect().height) }, '*');
    new ResizeObserver(post).observe(document.body);
    post();
    // عند إعادة فتح النافذة داخل الصفحة: تحديث حالة الصفحة
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data || e.data.hadir !== 'refresh' || S.busy) return;
      loadData().then(checkPage);
    });
  }
}

async function init() {
  setup();
  S.tab = await getTab();
  await loadData();
  // الإعدادات تأتي مدموجة مع القيم الافتراضية
  document.querySelectorAll('[data-set]').forEach((el) => { el.checked = !!S.settings[el.dataset.set]; });
  await checkPage();
}

init();
