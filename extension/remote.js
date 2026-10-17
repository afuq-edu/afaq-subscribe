// remote.js — «حاضر» مع منصة أفق: الربط بحساب المعلم، مزامنة المواد المشترك فيها، وجلب محتوى الحصة لحظة التعبئة
// القاعدة: لا يُخزَّن في الإضافة إلا «هيكل» المادة (الوحدات والدروس والحصص). محتوى البنود يُجلب حصةً حصة ويبقى في الذاكرة دقائق.
import { AFAQ } from './afaq-config.js';

const LINK = 'afaqLink';       // { token, name, at }
const STATUS = 'afaqStatus';   // { ok, name, at, subs: [...], error }
export const remoteId = (packageId, term) => `afaq-${packageId}-t${term}`;
export const isRemote = (pkg) => !!(pkg && pkg.remote);
const configured = () => !/YOUR-PROJECT/.test(AFAQ.SUPABASE_URL) && !/YOUR-ANON/.test(AFAQ.SUPABASE_ANON_KEY);

async function rpc(fn, args, timeout = 20000) {
  if (!configured()) return { ok: false, error: 'config' };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(`${AFAQ.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: AFAQ.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + AFAQ.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    if (!r.ok) return { ok: false, error: r.status >= 500 || r.status === 429 ? 'network' : 'server', status: r.status };
    return await r.json();
  } catch (e) { return { ok: false, error: 'network' }; }
  finally { clearTimeout(t); }
}

export async function getLink() { return (await chrome.storage.local.get(LINK))[LINK] || null; }
export async function getStatus() { return (await chrome.storage.local.get(STATUS))[STATUS] || null; }

// يُستدعى من الموقع بعد تسجيل الدخول: يحفظ رمز الجهاز ثم يجلب المواد
export async function linkWith(token, name) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return { ok: false, error: 'bad_token' };
  await chrome.storage.local.set({ [LINK]: { token, name: String(name || ''), at: Date.now() } });
  return sync({ force: true });
}

export async function unlink() {
  await chrome.storage.local.remove([LINK, STATUS]);
  const r = await chrome.storage.local.get('packages');
  await chrome.storage.local.set({ packages: (r.packages || []).filter((p) => !p.remote) });
  memo.clear();
  return { ok: true };
}

// مزامنة: مواد الاشتراكات الفعالة تُضاف أو تُحدَّث، والمنتهية والملغاة تُحذف
let syncing = null;
export function sync(opts = {}) {
  if (!syncing) syncing = doSync(opts).finally(() => { syncing = null; });
  return syncing;
}
async function doSync({ force } = {}) {
  const link = await getLink();
  if (!link) return { ok: false, error: 'unlinked' };
  officialHolidays();
  const me = await rpc('ext_me', { p_token: link.token });
  if (!me || me.ok === false) {
    if (me && me.error === 'unlinked') { await unlink(); return { ok: false, error: 'unlinked' }; }
    // تعذّر الاتصال: نُبقي المواد كما هي (تنتهي في الخادم على أي حال) ونحاول لاحقًا
    await chrome.storage.local.set({ [STATUS]: Object.assign({}, await getStatus(), { ok: false, error: me ? me.error : 'network', at: Date.now() }) });
    return { ok: false, error: me ? me.error : 'network' };
  }
  const r = await chrome.storage.local.get('packages');
  const all = Array.isArray(r.packages) ? r.packages : [];
  const keep = all.filter((p) => !p.remote);
  const next = [];
  const notes = [];
  for (const s of me.subs || []) {
    if (!s.ready) { notes.push({ title: s.title, term: s.term, why: 'not_ready' }); continue; }
    const id = remoteId(s.package_id, s.term);
    const old = all.find((p) => p.id === id);
    const meta = { package_id: s.package_id, term: s.term, year: s.year, ends_on: s.ends_on, updated: s.updated, shift: s.shift || 'both', trial: !!s.trial, left: s.trial ? Math.max(0, +s.left || 0) : null };
    if (old && !force && old.remote && old.remote.updated === s.updated) { next.push(Object.assign(old, { remote: meta })); continue; }
    const st = await rpc('ext_structure', { p_token: link.token, p_package: s.package_id, p_term: s.term });
    if (!st || !st.ok || !st.pkg) { if (old) next.push(old); continue; }
    const pkg = st.pkg;
    next.push(Object.assign({}, pkg, {
      id, remote: meta,
      title: `${s.title} — ${s.term === 1 ? 'الفصل الأول' : 'الفصل الثاني'}`,
      subject: pkg.subject || s.subject,
      grade: pkg.grade || s.grade,
      gradeNum: s.grade,
      shift: s.shift && s.shift !== 'both' ? s.shift : (pkg.shift || ''),
      installed: (old && old.installed) || Date.now(),
      days: old && old.days,
      driveLink: pkg.driveLink || '',
    }));
  }
  // مع حذف مواد الاشتراكات المنتهية: تبقى المواد المحلية (إن وُجدت) كما هي
  await chrome.storage.local.set({
    packages: keep.concat(next),
    [STATUS]: { ok: true, name: me.name, at: Date.now(), subs: me.subs, notes, request: me.request || null, whatsapp: me.whatsapp || '', trialLessons: me.trial_lessons || 3, trialLeft: me.trial_left == null ? null : +me.trial_left },
    [LINK]: Object.assign(link, { name: me.name }),
  });
  memo.clear();
  return { ok: true, name: me.name, packages: next.length, notes };
}

// محتوى حصة واحدة: يُجلب عند التعبئة فقط ويُحفظ في الذاكرة ١٠ دقائق (لإعادة المحاولة دون طلب جديد)
const memo = new Map();
export async function remoteLesson(pkg, lesson) {
  const key = pkg.id + '|' + lesson.id;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 10 * 60000) return { ok: true, lesson: Object.assign({}, lesson, hit.content) };
  const link = await getLink();
  if (!link) return { ok: false, error: 'unlinked' };
  let r = await rpc('ext_session', { p_token: link.token, p_package: pkg.remote.package_id, p_term: pkg.remote.term, p_lesson: lesson.id });
  if (r && r.error === 'network') { await new Promise((ok) => setTimeout(ok, 1500)); r = await rpc('ext_session', { p_token: link.token, p_package: pkg.remote.package_id, p_term: pkg.remote.term, p_lesson: lesson.id }); }
  if (!r || !r.ok) {
    const error = (r && r.error) || 'network';
    if (error === 'unlinked') await unlink();
    else if (error === 'expired') sync().catch(() => {});   // تُحذف المادة المنتهية من المكتبة
    return { ok: false, error, limit: r && r.limit };
  }
  memo.set(key, { at: Date.now(), content: r.lesson });
  if (r.left != null && pkg.remote.trial) pkg.remote.left = r.left;
  return { ok: true, lesson: Object.assign({}, lesson, r.lesson) };
}

export const REMOTE_ERR = {
  unlinked: 'الإضافة غير مرتبطة بحسابك — افتح موقع منصة أفق وسجّل الدخول.',
  expired: 'انتهى اشتراكك في هذه المادة — جدّده من منصة أفق.',
  limit: 'بلغت الحد اليومي لعدد الحصص — أكمل غدًا.',
  not_ready: 'تحاضير هذه المادة قيد الإعداد.',
  no_lesson: 'هذه الحصة لم تعد في المادة — حدّث المواد من موقع منصة أفق.',
  trial_over: 'انتهت حصصك المجانية — راسلنا على واتساب لتفعيل اشتراكك.',
  network: 'تعذّر الاتصال بخادم منصة أفق — تحقق من الإنترنت.',
  server: 'خادم منصة أفق لم يستجب كما يجب — أعد المحاولة بعد قليل.',
  config: 'الإضافة غير مضبوطة على خادم منصة أفق.',
};
export const siteUrl = (hash) => AFAQ.SITE_URL.replace(/#.*$/, '') + (hash || '');

// ---------- «حاضر» مباشرة دون الموقع ----------
// كتالوج المواد الجاهزة (للجميع) — يُحفظ آخر كتالوج ليعمل المعالج دون اتصال لحظي
export async function catalog() {
  const [r] = await Promise.all([rpc('ext_catalog', {}), officialHolidays()]);
  if (r && r.ok) { await chrome.storage.local.set({ afaqCatalog: Object.assign(r, { at: Date.now() }) }); return r; }
  const old = (await chrome.storage.local.get('afaqCatalog')).afaqCatalog;
  return old ? Object.assign({}, old, { stale: true }) : (r || { ok: false, error: 'network' });
}
// إجازات التقويم الرسمي (إعداد «holidays» في لوحة الإدارة): تُتخطّى عند توزيع التواريخ لكل المعلمين
async function officialHolidays() {
  if (!configured()) return;
  try {
    const r = await fetch(`${AFAQ.SUPABASE_URL}/rest/v1/settings?key=eq.holidays&select=value`, { headers: { apikey: AFAQ.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + AFAQ.SUPABASE_ANON_KEY } });
    if (!r.ok) return;
    const rows = await r.json();
    await chrome.storage.local.set({ afaqHolidays: String((rows[0] && rows[0].value) || '') });
  } catch (e) {}
}
const deviceLabel = () => { const ua = navigator.userAgent; const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : ''; return ['Chrome', os].filter(Boolean).join(' — '); };
// أول استعمال: يُنشأ للمعلم حساب ورمز جهاز وطلب برقم، وتبدأ تجربته في المواد المختارة
export async function startTrial(name, phone, shift, packageIds) {
  const r = await rpc('ext_start', { p_name: name, p_phone: phone || '', p_shift: shift, p_packages: packageIds, p_label: deviceLabel() });
  if (!r || !r.ok) return r || { ok: false, error: 'network' };
  await chrome.storage.local.set({ [LINK]: { token: r.token, name: r.name, at: Date.now(), request: r.request } });
  await sendRef().catch(() => {});
  const s = await sync({ force: true });
  return Object.assign({ request: r.request, name: r.name }, s, { ok: true });
}
// إضافة مادة لطلب معلم مربوط (تجربة لها حتى التفعيل)
export async function pickPackages(packageIds, shift) {
  const link = await getLink();
  if (!link) return { ok: false, error: 'unlinked' };
  const r = await rpc('ext_pick', { p_token: link.token, p_packages: packageIds, p_shift: shift || null });
  if (!r || !r.ok) { if (r && r.error === 'unlinked') await unlink(); return r || { ok: false, error: 'network' }; }
  return Object.assign({ request: r.request }, await sync({ force: true }), { ok: true });
}
// زر واتساب: يُعلَّم الطلب «بانتظار التفعيل» ويُعاد نص الرسالة الجاهزة
export async function contactRequest() {
  const link = await getLink();
  if (!link) return { ok: false, error: 'unlinked' };
  const r = await rpc('ext_contact', { p_token: link.token });
  return r || { ok: false, error: 'network' };
}
export function whatsappUrl(number, text) {
  const n = String(number || '').replace(/\D/g, '').replace(/^00/, '') || '96876506037';
  return `https://web.whatsapp.com/send?phone=${n}&text=${encodeURIComponent(text)}`;   // الإضافة على الحاسوب: واتساب ويب مباشرة
}
// رمز التفعيل (احتياط: جهاز جديد أو رمز قديم) — يربط الجهاز ويجلب المواد
export async function activateCode(code, name) {
  const link = await getLink();
  const r = await rpc('ext_activate', { p_code: code, p_name: name || '', p_label: deviceLabel(), p_token: link ? link.token : null });
  if (!r || !r.ok) return r || { ok: false, error: 'network' };
  if (r.token) await chrome.storage.local.set({ [LINK]: { token: r.token, name: r.name || name || '', at: Date.now() } });
  return Object.assign({}, r, await sync({ force: true }), { ok: true });
}

// ---------- دعوة زميل ----------
// رقم الدعوة يصل من صفحة الموقع (invite.html ← install.html) أو يكتبه المعلم، ويُسجَّل في طلبه مرة واحدة
export async function setRef(ref) {
  const n = +ref;
  if (!Number.isInteger(n) || n < 100) return { ok: false, error: 'ref' };
  await chrome.storage.local.set({ afaqRef: n });
  const link = await getLink();
  return link ? sendRef() : { ok: true, pending: true };
}
async function sendRef() {
  const { afaqRef } = await chrome.storage.local.get('afaqRef');
  const link = await getLink();
  if (!afaqRef || !link) return { ok: false };
  const r = await rpc('ext_set_ref', { p_token: link.token, p_ref: afaqRef });
  if (r && (r.ok || r.error === 'ref')) await chrome.storage.local.remove('afaqRef');
  return r || { ok: false, error: 'network' };
}
// رابط دعوتي ومن دعوت (للمعالج)
export async function referral() {
  const link = await getLink();
  if (!link) return { ok: false, error: 'unlinked' };
  const r = await rpc('ext_referral', { p_token: link.token });
  if (r && r.ok) r.url = AFAQ.SITE_URL.replace(/#.*$/, '') + 'install.html?r=' + r.request;
  return r || { ok: false, error: 'network' };
}

// ---------- نسخة جديدة ----------
// حتى يُقبل المتجر: من ثبّت «حاضر» يدويًا (غير مضغوطة) يرى تنبيهًا بزر «حدّث الآن» إن نُشرت نسخة أحدث في الموقع
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
export async function updateInfo(force) {
  let self = null;
  try { self = await chrome.management.getSelf(); } catch (e) {}
  if (!self || self.installType !== 'development') return null;   // من المتجر: يتحدث وحده
  const cur = chrome.runtime.getManifest().version;
  let { afaqUpdate: u } = await chrome.storage.local.get('afaqUpdate');
  if (force || !u || Date.now() - u.at > 6 * 3600e3) {
    try {
      const r = await fetch(AFAQ.SITE_URL.replace(/#.*$/, '') + 'hader-version.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); u = { latest: String(j.version || ''), at: Date.now() }; await chrome.storage.local.set({ afaqUpdate: u }); }
    } catch (e) {}
  }
  return u && u.latest && newer(u.latest, cur) ? { current: cur, latest: u.latest, url: AFAQ.SITE_URL.replace(/#.*$/, '') + 'install.html#update' } : null;
}
