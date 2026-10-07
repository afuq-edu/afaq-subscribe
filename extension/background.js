// background.js — العامل الخلفي: اختصار لوحة المفاتيح، اكتشاف الحفظ في نور، وتهيئة الإضافة
import { getAll, fillTab, canRunOn } from './lib.js';
import { getPackages, getSettings, getPicks, pageContext, fillNoor, suggestSelection, suggestDate, activeChain, markSaved, markSaveFailed, getLastFill, clearLastFill, pageAlerts, judgeSave, dayLabel, syncNoorList, sessionStatus } from './packages.js';
import { linkWith, unlink, sync as afaqSync, getLink, getStatus } from './remote.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortT = (t) => { const h = String(t || '').split(/[:：]/)[0].trim(); return h.length <= 30 ? h : h.slice(0, 30) + '…'; };

function badge(tabId, text, color, ms = 4000) {
  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
    if (ms) setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), ms);
  } catch (e) {}
}

// رسالة قصيرة أعلى الصفحة (تعمل حتى في صفحات نور التي لا يعمل فيها الزر العائم)
async function toastOnPage(tabId, text, kind) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (t, k) => {
        const old = document.getElementById('hadir-toast');
        if (old) old.remove();
        const h = document.createElement('div');
        h.id = 'hadir-toast';
        h.style.cssText = 'all:initial;position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;';
        const r = h.attachShadow({ mode: 'open' });
        const box = document.createElement('div');
        box.style.cssText = `direction:rtl;font:700 14px Tajawal,'Segoe UI',Tahoma,sans-serif;background:${k === 'warn' ? '#b45309' : '#15803d'};color:#fff;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px -8px rgba(0,0,0,.45);max-width:80vw`;
        box.textContent = t;
        r.appendChild(box);
        document.documentElement.appendChild(h);
        setTimeout(() => h.remove(), 5000);
      },
      args: [text, kind || 'ok'],
    });
  } catch (e) { /* صفحة لا يمكن الوصول إليها */ }
}

// ---------- الاختصار Alt+Shift+H: تعبئة الدرس المفتوح في نور بالحصة المقترحة ----------
async function fillFromShortcut(tab) {
  if (!tab || !tab.id) return;
  try {
    const ctx = await pageContext(tab.id);
    if (ctx.isForm) {
      const [{ packages, state }, settings, picks] = await Promise.all([getPackages(), getSettings(), getPicks()]);
      const sel = suggestSelection({ packages, state, title: ctx.title, picks, mark: ctx.mark });
      if (!sel || sel.how === 'nomatch') {
        badge(tab.id, '؟', '#b45309');
        toastOnPage(tab.id, 'لم أتعرّف على هذا الدرس — افتح «حاضر» واختر الدرس بنفسك مرة واحدة.', 'warn');
        return;
      }
      const date = state.pubOn === false ? '' : (ctx.mark && ctx.mark.lessonId === sel.session.id && ctx.mark.date) || suggestDate(state, settings, sel.pkg, sel.session).date;
      badge(tab.id, '…', '#0f766e', 0);
      const rep = await fillNoor(tab.id, sel.pkg, sel.session, { publishDate: date, noorTitle: ctx.title });
      if (rep.some((r) => r.blocked)) {
        badge(tab.id, '؟', '#b45309');
        toastOnPage(tab.id, `لم أجد «${sel.session.lesson}» في شجرة الدروس — افتح «حاضر» واختره من القائمة مرة واحدة.`, 'warn');
        return;
      }
      const ok = rep.filter((r) => r.status === 'ok').length;
      badge(tab.id, String(ok), ok === rep.length ? '#15803d' : '#b45309');
      toastOnPage(tab.id, `عُبّئت «${shortT(sel.session.title)}»${date ? ' · ' + dayLabel(date) : ''} — ${ok === rep.length ? 'راجعها ثم احفظ' : 'بعض البنود تحتاج مراجعة'}`, ok === rep.length ? 'ok' : 'warn');
      return;
    }
    // الطريقة الإضافية: آخر قالب ملتقط
    const { templates, settings } = await getAll();
    const t = templates.find((x) => x.id === settings.lastTemplateId) || templates[0];
    if (!t || !canRunOn(tab.url)) { badge(tab.id, '!', '#b45309'); return; }
    const r = await fillTab(tab.id, t, { skipFilled: settings.skipFilled });
    badge(tab.id, String(r.filled), r.missing ? '#b45309' : '#15803d');
  } catch (e) {
    badge(tab.id, '✕', '#b91c1c');
  }
}
chrome.commands.onCommand.addListener((command, tab) => { if (command === 'fill-last') fillFromShortcut(tab); });
self.hadirFillFromShortcut = fillFromShortcut;   // للتشخيص والاختبار

// ---------- اكتشاف الحفظ ----------
// الصفحة تبلغنا لحظة الضغط على «حفظ»؛ إذا انتقلت الصفحة بعدها دون رسالة خطأ نسجّل الحصة محفوظة.
const PK = (tabId) => 'pend:' + tabId;
// نسخة في الذاكرة (فورية) ونسخة في storage.session (إن أُعيد تشغيل العامل الخلفي)
const mem = new Map();
const lastLoading = new Map();
async function getPending(tabId) {
  if (mem.has(tabId)) return mem.get(tabId);
  try { const r = await chrome.storage.session.get(PK(tabId)); const p = r[PK(tabId)] || null; if (p) mem.set(tabId, p); return p; } catch (e) { return null; }
}
function setPending(tabId, p) { mem.set(tabId, p); chrome.storage.session.set({ [PK(tabId)]: p }).catch(() => {}); }
function clearPending(tabId) { mem.delete(tabId); chrome.storage.session.remove(PK(tabId)).catch(() => {}); }

// الحصة التي ضُغط «حفظ» لها: علامة الصفحة، أو (احتياطًا) آخر تعبئة في نفس التبويب ولنفس الدرس خلال ساعتين
async function resolveTarget(tabId, p) {
  if (p.mark && p.mark.pkgId && p.mark.lessonId) return { pkgId: p.mark.pkgId, lessonId: p.mark.lessonId, date: p.date || p.mark.date || '' };
  const lf = await getLastFill();
  if (lf && lf.tabId === tabId && Date.now() - lf.at < 2 * 3600e3 && lf.title && p.title && lf.title === p.title) {
    return { pkgId: lf.pkgId, lessonId: lf.lessonId, date: p.date || lf.date || '' };
  }
  return null;
}
async function commitSave(tabId, p, source) {
  const target = await resolveTarget(tabId, p);
  if (!target) return false;
  await clearLastFill();   // لا نربط حفظًا لاحقًا بهذه الحصة مرة أخرى
  await markSaved(target.pkgId, target.lessonId, target.date, source);
  const { packages } = await getPackages();
  const pkg = packages.find((x) => x.id === target.pkgId);
  const l = pkg && (pkg.lessons || []).find((x) => x.id === target.lessonId);
  badge(tabId, '✓', '#15803d', 6000);
  toastOnPage(tabId, `✓ «حاضر»: سُجّلت ${l ? '«' + shortT(l.title) + '»' : 'الحصة'} محفوظة${target.date ? ' · ' + dayLabel(target.date) : ''}`);
  return true;
}

// حالة التوافق لصفحة نور المفتوحة (يعرضها الزر العائم فور فتح النموذج)
async function computeMatch(tab) {
  const ctx = await pageContext(tab.id);
  if (!ctx.isForm) return { ok: false };
  const [{ packages, state }, settings, picks] = await Promise.all([getPackages(), getSettings(), getPicks()]);
  const sel = suggestSelection({ packages, state, title: ctx.title, picks, mark: ctx.mark });
  if (!sel) return { ok: true, empty: true };
  const date = (ctx.mark && ctx.mark.lessonId === sel.session.id && ctx.mark.date) || (state.pubOn === false ? '' : suggestDate(state, settings, sel.pkg, sel.session).date);
  let batch = false;
  try { const r = await chrome.storage.session.get('batchRun'); batch = !!(r.batchRun && Date.now() - r.batchRun.at < 12000); } catch (e) {}
  const chain = activeChain(state, packages, 12 * 3600e3);
  // الحصة محفوظة في نور سابقًا (من قائمة التحاضير أو اكتشاف الحفظ) — تنبيه من التكرار
  const savedBefore = !ctx.mark && !!ctx.title && (sel.how === 'auto' || sel.how === 'manual') && !!sessionStatus(state, sel.pkg.id, sel.session.id).saved;
  return {
    ok: true, how: sel.how, filledHere: !!ctx.mark, batch, savedBefore,
    session: shortT(sel.session.title), lesson: sel.sessions[0].lesson || '', date: date ? dayLabel(date, false) : '',
    // أثناء متابعة التحضير (أنجزت حصة قبل قليل) تُفتح النافذة وحدها لتُكمل
    autoOpen: settings.autoOpen !== false && !batch && !ctx.mark && !!chain,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || !sender.tab || !sender.tab.id) return;
  const tabId = sender.tab.id;
  if (msg.type === 'hadirMatch') {
    computeMatch(sender.tab).then(reply).catch(() => reply({ ok: false }));
    return true;
  }
  if (msg.type === 'hadirSubmitting') {
    // قد يبدأ تحميل الصفحة قبل وصول الرسالة — نحتسبه إن كان قبل لحظات
    const ll = lastLoading.get(tabId);
    setPending(tabId, { at: Date.now(), mark: msg.mark || null, date: msg.date || '', title: msg.title || '', url: sender.tab.url || '', loading: ll && Date.now() - ll < 3000 ? ll : 0 });
  } else if (msg.type === 'hadirSaved') {
    (async () => { const p = await getPending(tabId); if (p) { await clearPending(tabId); await commitSave(tabId, p, 'تلقائي'); } })();
  } else if (msg.type === 'hadirSubmitFailed') {
    (async () => { const p = await getPending(tabId); clearPending(tabId); const t = p && await resolveTarget(tabId, p); if (t) await markSaveFailed(t.pkgId, t.lessonId); })();
  } else if (msg.type === 'hadirQuickFill') {
    fillFromShortcut(sender.tab);
  } else if (msg.type === 'hadirNoorList') {
    // صفحة «التحاضير» في نور: ما حُفظ فعلًا يُعلَّم «محفوظ» فلا يُقترح مرة أخرى
    (async () => {
      const st = await getSettings();
      if (st.noorSync === false) return;
      // بعد «حفظ» تنتقل نور إلى هذه القائمة: نترك لاكتشاف الحفظ أن يسجّل الحصة أولًا بتاريخها
      await sleep(2500);
      const r = await syncNoorList(Array.isArray(msg.rows) ? msg.rows.slice(0, 500) : []);
      if (r.marked.length) {
        badge(tabId, String(r.marked.length), '#15803d', 6000);
        const n = r.marked.length;
        toastOnPage(tabId, `✓ «حاضر»: قرأت قائمة تحاضيرك في نور — ${n === 1 ? 'حصة واحدة سُجّلت' : n === 2 ? 'حصتان سُجّلتا' : n + ' حصص سُجّلت'} محفوظة في مكتبتك`);
      }
    })().catch(() => {});
  }
});

// ملاحظة: كروم لا يدعم مرشّحات لهذا الحدث، لذا نفحص الحالة داخل المستمع
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === 'loading') lastLoading.set(tabId, Date.now());
  if (info.status !== 'loading' && info.status !== 'complete') return;
  const p = await getPending(tabId);
  if (!p) return;
  const age = Date.now() - p.at;
  if (age > 120000) { clearPending(tabId); return; }
  if (info.status === 'loading') { if (!p.loading) { p.loading = Date.now(); setPending(tabId, p); } return; }
  // اكتمل تحميل صفحة بعد الضغط على «حفظ»: نقبله إن بدأ الانتقال خلال ٣٠ ثانية من الضغط
  const soon = p.loading ? p.loading - p.at < 30000 : age < 30000;
  clearPending(tabId);
  if (!soon) return;
  await sleep(900);
  let al;
  try { al = await pageAlerts(tabId); } catch (e) { return; }
  const v = judgeSave(al, p.url);
  if (v === 'error') {
    badge(tabId, '!', '#b45309', 6000);
    const t = await resolveTarget(tabId, p);
    if (t) await markSaveFailed(t.pkgId, t.lessonId);   // تبقى الحصة مقترحة حتى تُحفظ
    return;
  }
  if (v === 'saved') await commitSave(tabId, p, 'تلقائي');
});

chrome.tabs.onRemoved.addListener((tabId) => { clearPending(tabId); lastLoading.delete(tabId); });

// ---------- التثبيت والتحديث ----------
chrome.runtime.onInstalled.addListener(async (d) => {
  // ٣٫٦٫١: حصص سُجّلت «عُبّئت» في نسخة سابقة دون أن يُختار درسها في نور (فلم تُحفظ) تعود مقترحة —
  // كل حصة «عُبّئت» ولم تُسجَّل محفوظة تصبح «لم تُحفظ في نور» حتى تُحفظ فعلًا (أو تعلّمها قائمة التحاضير)
  if (d.reason === 'update') {
    try {
      const r = await chrome.storage.local.get(['pkgState', 'mig361']);
      if (!r.mig361 && r.pkgState && r.pkgState.sessions) {
        const ss = r.pkgState.sessions;
        Object.keys(ss).forEach((k) => { const x = ss[k]; if (x && x.filled && !x.saved && !(x.failed >= x.filled)) { x.failed = x.filled; x.failWhy = 'unsaved'; } });
        await chrome.storage.local.set({ pkgState: r.pkgState, mig361: Date.now() });
      } else if (!r.mig361) await chrome.storage.local.set({ mig361: Date.now() });
    } catch (e) {}
  }
  if (d.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options.html#welcome') });
  else if (d.reason === 'update' && d.previousVersion && parseInt(d.previousVersion, 10) < 3) chrome.tabs.create({ url: chrome.runtime.getURL('options.html#whatsnew') });
  // تفعيل الزر العائم في صفحات نور المفتوحة الآن دون الحاجة لإعادة تحميلها
  try {
    const cs = (chrome.runtime.getManifest().content_scripts || [])[0];
    const tabs = await chrome.tabs.query({ url: cs.matches });
    for (const t of tabs) chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {});
  } catch (e) {}
});

// ---------- منصة أفق: الموقع يربط الإضافة بحساب المعلم (externally_connectable) ----------
// الرسائل تصل فقط من نطاق الموقع المحدد في manifest.json
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (!msg || typeof msg !== 'object') return;
  (async () => {
    if (msg.type === 'afaqPing') {
      const [link, st, { packages }] = await Promise.all([getLink(), getStatus(), getPackages()]);
      return { ok: true, version: chrome.runtime.getManifest().version, linked: !!link, name: link ? link.name : '', packages: packages.filter((p) => p.remote).length, lastSync: st ? st.at : 0 };
    }
    if (msg.type === 'afaqLink') return linkWith(msg.token, msg.name);
    if (msg.type === 'afaqSync') return afaqSync({ force: true });
    if (msg.type === 'afaqUnlink') return unlink();
    return { ok: false, error: 'unknown' };
  })().then(reply).catch((e) => reply({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
// مزامنة دورية: تُحذف المواد المنتهية وتُحدَّث المعدّلة (كل ٦ ساعات، وعند تشغيل كروم)
try {
  chrome.alarms.create('afaqSync', { periodInMinutes: 360, delayInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'afaqSync') afaqSync().catch(() => {}); });
} catch (e) {}
chrome.runtime.onStartup.addListener(() => { afaqSync().catch(() => {}); });
