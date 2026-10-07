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
    const meta = { package_id: s.package_id, term: s.term, year: s.year, ends_on: s.ends_on, updated: s.updated };
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
      installed: (old && old.installed) || Date.now(),
      days: old && old.days,
      driveLink: pkg.driveLink || '',
    }));
  }
  // مع حذف مواد الاشتراكات المنتهية: تبقى المواد المحلية (إن وُجدت) كما هي
  await chrome.storage.local.set({
    packages: keep.concat(next),
    [STATUS]: { ok: true, name: me.name, at: Date.now(), subs: me.subs, notes },
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
  return { ok: true, lesson: Object.assign({}, lesson, r.lesson) };
}

export const REMOTE_ERR = {
  unlinked: 'الإضافة غير مرتبطة بحسابك — افتح موقع منصة أفق وسجّل الدخول.',
  expired: 'انتهى اشتراكك في هذه المادة — جدّده من منصة أفق.',
  limit: 'بلغت الحد اليومي لعدد الحصص — أكمل غدًا.',
  not_ready: 'تحاضير هذه المادة قيد الإعداد.',
  no_lesson: 'هذه الحصة لم تعد في المادة — حدّث المواد من موقع منصة أفق.',
  network: 'تعذّر الاتصال بخادم منصة أفق — تحقق من الإنترنت.',
  server: 'خادم منصة أفق لم يستجب كما يجب — أعد المحاولة بعد قليل.',
  config: 'الإضافة غير مضبوطة على خادم منصة أفق.',
};
export const siteUrl = (hash) => AFAQ.SITE_URL.replace(/#.*$/, '') + (hash || '');
