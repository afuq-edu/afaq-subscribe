// packages.js — مكتبة التحاضير: التخزين، التقدم (عُبّئ/حُفظ)، الإعدادات، النسخ الاحتياطي، والتعبئة في نموذج منصة نور
import { hadirEngine } from './engine.js';
import { bestLesson, rankLessons, lessonNum, unitNum, kwNorm, kwScore, bestTreeLesson, unitMayHold, stripSessionSuffix, sessionSuffix } from './match.js';
import { parsePlanText, parsePlanBest, NOOR_STRATEGIES, NOOR_RESOURCES, NOOR_LEVELS, SAMPLE_PLAN, mapStrategies, mapResources } from './parse.js';
import { AFAQ } from './afaq-config.js';
import { remoteLesson, isRemote, REMOTE_ERR } from './remote.js';
export { isRemote, REMOTE_ERR };
export const SERVICE = !!AFAQ.SERVICE;
const SERVICE_ONLY = 'في نسخة منصة أفق تأتي المواد من اشتراكك فقط — فعّل اشتراكك من موقع المنصة.';

export { bestLesson, rankLessons, lessonNum, kwNorm, stripSessionSuffix, sessionSuffix, parsePlanText, parsePlanBest, NOOR_STRATEGIES, NOOR_RESOURCES, NOOR_LEVELS, SAMPLE_PLAN, mapStrategies, mapResources };

// ---------- بنود نموذج التحضير في منصة نور (بالترتيب) ----------
// match: عبارات يُعرف بها عنوان البند — mode: text نص منسّق، pick قائمة اختيار، auto قائمة أو نص، checkall تحديد كل المربعات
export const NOOR_FIELDS = [
  { key: 'outcomes', name: 'المخرجات التعليمية', short: 'المخرجات', match: ['المخرجات التعليمية', 'المخرجات', 'نواتج التعلم'], mode: 'checkall' },
  { key: 'levels', name: 'المستوى', short: 'المستوى', match: ['المستوى', 'مستوى'], mode: 'auto', fillTo: 3 },
  { key: 'strategies', name: 'الاستراتيجيات', short: 'الاستراتيجيات', match: ['الاستراتيجيات', 'استراتيجيات التدريس', 'الاستراتيجية'], mode: 'pick' },
  { key: 'resources', name: 'المصادر التعليمية', short: 'المصادر', match: ['المصادر التعليمية', 'مصادر التعلم', 'الوسائل التعليمية'], mode: 'pick' },
  { key: 'concepts', name: 'المفاهيم', short: 'المفاهيم', match: ['المفاهيم'], mode: 'text' },
  { key: 'intro', name: 'التهيئة / التمهيد / التعلم القبلي', short: 'التهيئة', match: ['التهيئة', 'التمهيد', 'التعلم القبلي'], mode: 'text' },
  { key: 'procedures', name: 'إجراءات سير الدرس / الأنشطة التدريسية', short: 'سير الدرس', match: ['سير الدرس', 'الأنشطة التدريسية', 'اجراءات'], mode: 'text' },
  { key: 'formative', name: 'التقويم التكويني', short: 'التكويني', match: ['التقويم التكويني', 'التكويني'], mode: 'text' },
  { key: 'summative', name: 'التقويم الختامي', short: 'الختامي', match: ['التقويم الختامي', 'الختامي'], mode: 'text' },
  { key: 'notes', name: 'ملاحظات (خطة الدراسة الأسبوعية)', short: 'الملاحظات', match: ['ملاحظات ضمن خطة الدراسة', 'خطة الدراسة الأسبوعية', 'ملاحظات'], mode: 'text' },
];
export const GLOBAL_CHECK = 'تعميم التحضير على كافة الجداول';
export const GRADES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ---------- الإعدادات ----------
export const DEFAULT_SETTINGS = {
  schoolDays: [0, 1, 2, 3, 4],   // الأحد … الخميس
  driveLink: '',                 // رابط الدرايف الافتراضي للحزم الجديدة (يضبطه المعلم من الإعدادات)
  checkTimeslots: true,          // تحديد كل الصفوف (الحصص) الظاهرة
  ensureGlobal: true,            // «تعميم التحضير على كافة الجداول»
  setWeek: true,                 // اختيار أسبوع العمل حسب التاريخ
  skipFilled: false,             // عدم تغيير الحقول المكتوبة
  fab: true,                     // زر «حاضر» داخل صفحة نور
  autoOpen: true,                // فتح النافذة داخل الصفحة تلقائيًا أثناء متابعة التحضير
  batchAutoOpen: true,           // «عدة حصص»: فتح نموذج الدرس تلقائيًا إن كان معروفًا
  pickLesson: true,              // اختيار الدرس من شجرة نور تلقائيًا إن لم يكن مختارًا
  titleSuffix: true,             // «(2)» في عنوان الحصة الثانية من الدرس (كما في قائمة التحاضير)
  noorSync: true,                // قراءة قائمة التحاضير في نور لتعليم ما حُفظ
};
export async function getSettings() {
  const r = await chrome.storage.local.get('settings');
  return Object.assign({}, DEFAULT_SETTINGS, r.settings || {});
}
export async function patchSettings(patch) {
  const cur = await getSettings();
  const next = Object.assign(cur, patch);
  await chrome.storage.local.set({ settings: next });
  return next;
}

// ---------- التواريخ ----------
export const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
export const parseIso = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d, 12); };
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function dayLabel(iso, withMonth = true) {
  if (!iso) return '';
  const d = parseIso(iso);
  return DAY_NAMES[d.getDay()] + ' ' + toAr(d.getDate()) + (withMonth ? ' ' + MONTHS[d.getMonth()] : '/' + toAr(d.getMonth() + 1));
}
export function nextSchoolDay(fromIso, days, includeSame = true) {
  const set = (days && days.length) ? days : DEFAULT_SETTINGS.schoolDays;
  const d = fromIso ? parseIso(fromIso) : new Date();
  if (!includeSame) d.setDate(d.getDate() + 1);
  for (let i = 0; i < 14 && !set.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
  return isoOf(d);
}
export function scheduleDates(startIso, count, weekdays) {
  const days = (weekdays && weekdays.length) ? weekdays : DEFAULT_SETTINGS.schoolDays;
  const cur = parseIso(startIso);
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < 800) {
    if (days.includes(cur.getDay())) out.push(isoOf(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ---------- التشفير (للحزم المحمية بكلمة سر) ----------
const ITER = 150000;
const enc = new TextEncoder();
const b64 = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password).normalize('NFKC').trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptPackage(pkg, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(pkg)));
  return { app: 'hadir', type: 'package', v: 1, meta: { id: pkg.id, title: pkg.title, subject: pkg.subject, grade: pkg.grade, count: (pkg.lessons || []).length }, salt: b64(salt), iv: b64(iv), data: b64(data) };
}
export async function decryptPackage(file, password) {
  const key = await keyFrom(password, unb64(file.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
export const isPackageFile = (x) => !!(x && x.app === 'hadir' && x.type === 'package' && x.data && x.salt && x.iv);
export const isPlainPackage = (x) => !!(x && ((x.app === 'hadir' && x.type === 'package-plain' && x.package) || (Array.isArray(x.lessons) && x.id)));
export const isBackupFile = (x) => !!(x && x.app === 'hadir' && x.type === 'backup' && x.data);

// ---------- التخزين والتقدم ----------
export const sessionKey = (pkgId, lessonId) => pkgId + ':' + lessonId;

function migrateState(st) {
  st.sessions = st.sessions || {};
  if (st.done && typeof st.done === 'object') {
    for (const [k, ts] of Object.entries(st.done)) if (!st.sessions[k]) st.sessions[k] = { filled: ts };
    delete st.done;
  }
  return st;
}
export async function getPackages() {
  const r = await chrome.storage.local.get(['packages', 'pkgState']);
  const all = Array.isArray(r.packages) ? r.packages : [];
  return {
    packages: SERVICE ? all.filter((p) => p.remote) : all,   // نسخة الخدمة: مواد الاشتراك فقط
    state: migrateState(Object.assign({ pkgId: null, lessonId: null, sessions: {} }, r.pkgState || {})),
  };
}
export async function savePackages(packages) {
  if (SERVICE) {
    // القائمة المعروضة في نسخة الخدمة مصفّاة؛ نحفظ المواد الأخرى كما هي
    const r = await chrome.storage.local.get('packages');
    const ids = new Set(packages.map((p) => p.id));
    packages = (r.packages || []).filter((p) => !p.remote && !ids.has(p.id)).concat(packages);
  }
  await chrome.storage.local.set({ packages });
}
export async function savePkgState(state) { await chrome.storage.local.set({ pkgState: migrateState(state) }); }

export function sessionStatus(state, pkgId, lessonId) {
  const s = (state.sessions || {})[sessionKey(pkgId, lessonId)] || {};
  // failed: لم تُحفظ بعد آخر تعبئة — رفضتها نور (error) أو تُخطّيت/أُوقفت قبل الحفظ (unsaved) — فتبقى مقترحة حتى تُحفظ
  const failed = !s.saved && s.failed && s.failed >= (s.filled || 0) ? s.failed : 0;
  return { filled: s.filled || 0, saved: s.saved || 0, failed, failWhy: failed ? (s.failWhy || 'error') : '', date: s.date || '', savedDate: s.savedDate || '' };
}
export function packageProgress(pkg, state) {
  const ls = pkg.lessons || [];
  let saved = 0, filled = 0;
  ls.forEach((l) => { const s = sessionStatus(state, pkg.id, l.id); if (s.saved) saved++; else if (s.filled) filled++; });
  return { total: ls.length, saved, filled, left: ls.length - saved };
}

async function patchSession(pkgId, lessonId, patch) {
  const { state } = await getPackages();
  const k = sessionKey(pkgId, lessonId);
  state.sessions[k] = Object.assign({}, state.sessions[k] || {}, patch);
  await savePkgState(state);
  return state;
}
export async function markSaveFailed(pkgId, lessonId, why = 'error') { return patchSession(pkgId, lessonId, { failed: Date.now(), failWhy: why }); }
// نص حالة حصة عُبّئت ولم تُسجَّل محفوظة
export const unsavedText = (s) => (s.failed ? (s.failWhy === 'error' ? 'ظهر خطأ عند حفظها في نور' : 'لم تُحفظ في نور') : 'لم يُسجَّل حفظها');
export async function markFilled(pkgId, lessonId, date) { return patchSession(pkgId, lessonId, { filled: Date.now(), date: date || '' }); }
export async function markSaved(pkgId, lessonId, date, source) {
  const { packages, state } = await getPackages();
  const k = sessionKey(pkgId, lessonId);
  const prev = state.sessions[k] || {};
  // تجنب التسجيل المكرر لنفس الحفظ (مثلًا: التحضير الجماعي + اكتشاف الحفظ معًا)
  const dup = prev.saved && Date.now() - prev.saved < 3 * 60 * 1000 && (prev.savedDate || '') === (date || prev.date || '');
  const savedDate = date || prev.date || '';
  state.sessions[k] = Object.assign({}, prev, { saved: Date.now(), savedDate });
  if (savedDate && savedDate > ((state.lastPub || {})[pkgId] || '')) state.lastPub = Object.assign({}, state.lastPub || {}, { [pkgId]: savedDate });
  await savePkgState(state);
  if (!dup) {
    const pkg = packages.find((p) => p.id === pkgId);
    const l = pkg && (pkg.lessons || []).find((x) => x.id === lessonId);
    await addLog({ pkgId, lessonId, pkg: pkg ? pkg.title : '', lesson: l ? l.title : '', unitLesson: l ? l.lesson : '', date: date || '', action: 'حُفظ', source: source || '' });
  }
  return !dup;
}
export async function clearSession(pkgId, lessonId) {
  const { state } = await getPackages();
  delete state.sessions[sessionKey(pkgId, lessonId)];
  if (state.lastPub) delete state.lastPub[pkgId];   // يُعاد حسابه من تواريخ الحصص الباقية
  await savePkgState(state);
}
// تعليم يدوي: «حفظتُها في نور» أو إلغاء ذلك
export async function setSavedManually(pkgId, lessonId, saved, date) {
  if (saved) return markSaved(pkgId, lessonId, date || '', 'يدوي');
  const { state } = await getPackages();
  const k = sessionKey(pkgId, lessonId);
  if (state.sessions[k]) { delete state.sessions[k].saved; delete state.sessions[k].savedDate; }
  if (state.lastPub) delete state.lastPub[pkgId];
  await savePkgState(state);
  return true;
}
export async function resetProgress(pkgId) {
  const { state } = await getPackages();
  Object.keys(state.sessions).forEach((k) => { if (k.startsWith(pkgId + ':')) delete state.sessions[k]; });
  if (state.lastPub) delete state.lastPub[pkgId];
  await savePkgState(state);
}

// ---------- الدروس (تجميع الحصص) ----------
export const groupKey = (l) => (l && ((l.unit || '') + '|' + (l.lesson || ''))) || '';
export function lessonGroups(pkg) {
  const map = new Map();
  for (const l of (pkg && pkg.lessons) || []) {
    const k = groupKey(l);
    if (!map.has(k)) map.set(k, { key: k, unit: l.unit || '', lesson: l.lesson || '', sessions: [] });
    map.get(k).sessions.push(l);
  }
  return [...map.values()];
}

// اختيار المعلم اليدوي لدرس نور يُحفظ، فلا تعود المطابقة التلقائية لتغييره
export async function getPicks() { const r = await chrome.storage.local.get('picks'); return r.picks || {}; }
export async function rememberPick(noorTitle, pkgId, lessonId) {
  if (!noorTitle) return;
  const picks = await getPicks();
  picks[kwNorm(noorTitle)] = { pkgId, lessonId, at: Date.now() };
  const keys = Object.keys(picks);
  if (keys.length > 400) keys.sort((a, b) => picks[a].at - picks[b].at).slice(0, keys.length - 400).forEach((k) => delete picks[k]);
  await chrome.storage.local.set({ picks });
}

// هل انتهى المعلم من الحصة؟ (حُفظت، أو عُبّئت في صفحة سابقة) — لننتقل مباشرة إلى التالية
const sessionDone = (state, pkgId, l) => { const s = sessionStatus(state, pkgId, l.id); return !!(s.saved || (s.filled && !s.failed)); };

// الحصة المقترحة داخل الدرس:
// ما عُبّئ في هذه الصفحة ← آخر حصة اخترتها إن لم تُعبّأ ← التالية بعد آخر حصة أنجزتها ← أول حصة لم تُنجز
export function pickSession(sessions, state, pkgId, mark) {
  if (!sessions.length) return null;
  if (mark && mark.pkgId === pkgId) { const m = sessions.find((l) => l.id === mark.lessonId); if (m) return m; }
  const done = (l) => sessionDone(state, pkgId, l);
  const i = pkgId === state.pkgId ? sessions.findIndex((l) => l.id === state.lessonId) : -1;
  if (i >= 0 && !done(sessions[i])) return sessions[i];
  if (i >= 0) { const nx = sessions.slice(i + 1).find((l) => !done(l)); if (nx) return nx; }
  return sessions.find((l) => !done(l)) || sessions.find((l) => !sessionStatus(state, pkgId, l.id).saved) || (i >= 0 ? sessions[i] : sessions[0]);
}

// الحصة التالية في المادة بعد حصة معينة (بترتيب الدروس ثم الحصص)، متخطيًا ما أُنجز.
// wrap: إن لم يبقَ بعدها شيء نعود إلى أول حصة سابقة لم تُنجز
export function nextInPackage(pkg, state, fromId, wrap = false) {
  const order = lessonGroups(pkg).flatMap((g) => g.sessions);
  const i = order.findIndex((l) => l.id === fromId);
  const undone = (l) => l.id !== fromId && !sessionDone(state, pkg.id, l);
  return order.slice(i + 1).find(undone) || (wrap && i > 0 ? order.slice(0, i).find(undone) : null) || null;
}

// «سلسلة التحضير»: آخر حصة أنجزتها والتالية المتوقعة (تُقترح عند فتح نموذج لا يتوافق تلقائيًا).
// إن لم تُحفظ آخر حصة (رفضتها نور أو تُركت) فهي المقترحة أولًا: retry
export function activeChain(state, packages, maxAgeMs = 24 * 3600e3) {
  const ch = state && state.chain;
  if (!ch || Date.now() - (ch.at || 0) > maxAgeMs) return null;
  const pkg = (packages || []).find((p) => p.id === ch.pkgId);
  if (!pkg) return null;
  const byId = (id) => (id && (pkg.lessons || []).find((l) => l.id === id)) || null;
  const from = byId(ch.from);
  if (from && sessionStatus(state, pkg.id, from.id).failed) return { pkg, lesson: from, at: ch.at, retry: true };
  const lesson = from ? nextInPackage(pkg, state, from.id, true) : byId(ch.next);
  if (!lesson || sessionDone(state, pkg.id, lesson)) return null;
  return { pkg, lesson, at: ch.at };
}

// الدرس والحصة المقترحان لصفحة نور المفتوحة
// how: page (عُبّئ في هذه الصفحة) | manual (أكّدت التوافق سابقًا) | auto (توافق تلقائي بالعنوان)
//      nomatch (لم يتوافق — يحتاج تأكيدًا) | chain (لا عنوان: التالية في خطتك) | last (لا عنوان)
// candidates: دروس مرشّحة لتأكيد التوافق حين لا يتوافق تلقائيًا
export function suggestSelection({ packages, state, title, picks, mark }) {
  const withLessons = (packages || []).filter((p) => (p.lessons || []).length);
  if (!withLessons.length) return null;
  let pkg = null, lesson = null, how = 'none', score = 0, candidates = [];
  const find = (pid, lid) => { const p = withLessons.find((x) => x.id === pid); const l = p && p.lessons.find((x) => x.id === lid); return l ? { p, l } : null; };
  if (mark) { const f = find(mark.pkgId, mark.lessonId); if (f) { pkg = f.p; lesson = f.l; how = 'page'; } }
  if (!pkg && title && picks) { const pk = picks[kwNorm(title)]; const f = pk && find(pk.pkgId, pk.lessonId); if (f) { pkg = f.p; lesson = f.l; how = 'manual'; } }
  // عند التساوي تُفضَّل المادة التي تعمل عليها الآن
  const ordered = withLessons.slice().sort((a, b) => (b.id === state.pkgId) - (a.id === state.pkgId));
  if (!pkg && title) { const m = bestLesson(ordered, title); if (m) { pkg = m.pkg; lesson = m.lesson; how = 'auto'; score = m.score; } }
  if (!pkg) {
    const chain = activeChain(state, withLessons);
    if (chain) candidates.push({ pkg: chain.pkg, lesson: chain.lesson, why: 'chain', retry: !!chain.retry });
    rankLessons(ordered, title, 4).forEach((r) => {
      const same = candidates.find((c) => c.pkg.id === r.pkg.id && groupKey(c.lesson) === groupKey(r.lesson));
      if (same) same.similar = true;   // التالية في خطتك وهي أيضًا الأقرب لعنوان نور
      else candidates.push({ pkg: r.pkg, lesson: r.lesson, why: 'similar', score: r.score });
    });
    candidates = candidates.slice(0, 3);
    const base = candidates[0] ? { p: candidates[0].pkg, l: candidates[0].lesson } : (find(state.pkgId, state.lessonId) || { p: withLessons[0], l: withLessons[0].lessons[0] });
    pkg = base.p; lesson = base.l;
    how = title ? 'nomatch' : (chain ? 'chain' : 'last');
  }
  const sessions = pkg.lessons.filter((l) => groupKey(l) === groupKey(lesson));
  // مرشّح «التالية في خطتك» يحدد الحصة نفسها لا أول حصة في الدرس
  const chainPick = candidates[0] && candidates[0].why === 'chain' && sessions.find((l) => l.id === candidates[0].lesson.id);
  // «… (2)» في عنوان نور = الحصة الثانية من الدرس
  const nth = (how === 'auto' || how === 'manual') && suffixIsSession([pkg]) ? sessionSuffix(title) : null;
  const suffixPick = nth && !(mark && sessions.some((l) => l.id === mark.lessonId)) ? sessions[nth - 1] : null;
  const session = suffixPick || chainPick || pickSession(sessions, state, pkg.id, mark);
  return { pkg, group: groupKey(lesson), sessions, session, how, score, candidates };
}

// هل يتوافق درس الصفحة المفتوحة مع حصة معينة؟ match | mismatch (يبدو لدرس آخر) | unknown
export function matchVerdict({ title, packages, pkg, lesson, picks }) {
  if (!title) return { v: 'unknown' };
  const want = groupKey(lesson);
  const pk = picks && picks[kwNorm(title)];
  if (pk) {
    const p = (packages || []).find((x) => x.id === pk.pkgId);
    const l = p && (p.lessons || []).find((x) => x.id === pk.lessonId);
    if (l) return p.id === pkg.id && groupKey(l) === want ? { v: 'match', how: 'manual' } : { v: 'mismatch', other: { pkg: p, lesson: l } };
  }
  // المادة نفسها أولًا (قد يتكرر الدرس في مادة أخرى، كنسخة مستوردة منها)
  const mine = bestLesson([pkg], title);
  if (mine && groupKey(mine.lesson) === want) return { v: 'match', how: 'auto' };
  const any = mine || bestLesson((packages || []).filter((p) => (p.lessons || []).length), title);
  return any ? { v: 'mismatch', other: any } : { v: 'unknown' };
}

// عنوان صفحة «إضافة تحضير» الذي عُبّئ فيه هذا الدرس آخر مرة (لفتحه تلقائيًا)
export const formKey = (pkgId, lesson) => pkgId + '|' + groupKey(lesson);
// في نور رابط «إضافة تحضير» للمادة كلها (الدرس يُختار من الشجرة)، فإن لم نعرف رابط هذا الدرس نستعمل رابط المادة
export function formUrlFor(state, pkgId, lesson) {
  const forms = (state && state.forms) || {};
  const own = forms[formKey(pkgId, lesson)];
  if (own) return own;
  const any = Object.keys(forms).filter((k) => k.startsWith(pkgId + '|')).map((k) => forms[k]).filter((u) => /add_preparation/.test(u || ''));
  return state && state.treeForms && state.treeForms[pkgId] && any.length ? any[any.length - 1] : '';
}

// أيام حصص المادة (لاقتراح التواريخ) — لكل حزمة أيامها، وإلا أيام الدوام العامة
export function daysFor(state, settings, pkgId) {
  const d = state && state.pkgDays && state.pkgDays[pkgId];
  return Array.isArray(d) && d.length ? d : ((settings && settings.schoolDays) || DEFAULT_SETTINGS.schoolDays);
}
export async function setPkgDays(pkgId, days) {
  const { state } = await getPackages();
  state.pkgDays = Object.assign({}, state.pkgDays || {}, { [pkgId]: days });
  await savePkgState(state);
}

// التواريخ المستخدمة في حصص الحزمة: { 'yyyy-mm-dd': [{lessonId, saved}] }
export function usedDates(pkg, state) {
  const out = {};
  for (const l of (pkg && pkg.lessons) || []) {
    const s = sessionStatus(state, pkg.id, l.id);
    const d = s.savedDate || s.date;
    if (d) (out[d] = out[d] || []).push({ lessonId: l.id, title: l.title, saved: !!s.saved });
  }
  return out;
}

// التاريخ المقترح: تاريخ الحصة نفسها إن عُبّئت ولم تُحفظ ← اليوم الدراسي التالي بعد آخر تاريخ استخدمته ← اليوم (أو أقرب يوم دوام)
export function suggestDate(state, settings, pkg, session) {
  const today = isoOf(new Date());
  const days = daysFor(state, settings, pkg && pkg.id);
  if (pkg && session) {
    const s = sessionStatus(state, pkg.id, session.id);
    if (!s.saved && s.date && s.date >= today) return { date: s.date, why: 'same' };
  }
  const used = pkg ? usedDates(pkg, state) : {};
  // آخر تاريخ نشر استخدمته في هذه المادة
  const last = [((state.lastPub || {})[pkg && pkg.id]) || '', ...Object.keys(used)].filter(Boolean).sort().pop() || '';
  let cand, why;
  if (last && last >= today) { cand = nextSchoolDay(last, days, false); why = 'after'; }
  else { cand = nextSchoolDay(today, days, true); why = 'today'; }
  for (let i = 0; i < 60 && used[cand]; i++) cand = nextSchoolDay(cand, days, false);
  return { date: cand, why, last };
}

export async function duplicateLesson(pkgId, lessonId) {
  let copy = null;
  await updatePackage(pkgId, (p) => {
    const i = (p.lessons || []).findIndex((l) => l.id === lessonId);
    if (i < 0) return;
    copy = JSON.parse(JSON.stringify(p.lessons[i]));
    copy.id = newId();
    copy.title = (copy.title || 'الحصة') + ' (نسخة)';
    p.lessons.splice(i + 1, 0, copy);
  });
  return copy;
}
export async function moveLesson(pkgId, lessonId, dir) {
  await updatePackage(pkgId, (p) => {
    const ls = p.lessons || [];
    const i = ls.findIndex((l) => l.id === lessonId);
    if (i < 0) return;
    // الحصة المجاورة من نفس الدرس (قد لا تكون ملاصقة في القائمة)
    const same = ls.map((l, k) => k).filter((k) => groupKey(ls[k]) === groupKey(ls[i]));
    const pos = same.indexOf(i);
    const j = same[pos + dir];
    if (j === undefined) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
  });
}

// آخر تعبئة (لربط ضغطة «حفظ» في نور بالحصة الصحيحة)
export async function setLastFill(info) { await chrome.storage.local.set({ lastFill: Object.assign({ at: Date.now() }, info) }); }
export async function getLastFill() { const r = await chrome.storage.local.get('lastFill'); return r.lastFill || null; }
export async function clearLastFill() { await chrome.storage.local.remove('lastFill'); }

// ---------- إدارة الحزم والحصص ----------
export const newId = (p = 's') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function installPackage(pkg) {
  if (SERVICE) throw new Error(SERVICE_ONLY);
  const { packages } = await getPackages();
  const i = packages.findIndex((p) => p.id === pkg.id);
  pkg.installed = Date.now();
  if (i >= 0) packages[i] = pkg; else packages.push(pkg);
  await savePackages(packages);
  return { replaced: i >= 0 };
}
export async function updatePackage(pkgId, fn) {
  const { packages } = await getPackages();
  const p = packages.find((x) => x.id === pkgId);
  if (!p) return null;
  fn(p);
  p.edited = Date.now();
  await savePackages(packages);
  return p;
}
export async function deletePackage(pkgId) {
  const { packages } = await getPackages();
  await savePackages(packages.filter((x) => x.id !== pkgId));
}
export async function saveLesson(pkgId, lesson) {
  if (SERVICE || isRemote((await getPackages()).packages.find((p) => p.id === pkgId))) throw new Error('محتوى مواد الاشتراك يُدار من منصة أفق ولا يُعدَّل في الإضافة.');
  return updatePackage(pkgId, (p) => {
    p.lessons = p.lessons || [];
    const i = p.lessons.findIndex((l) => l.id === lesson.id);
    if (i >= 0) p.lessons[i] = lesson; else p.lessons.push(lesson);
  });
}
export async function deleteLesson(pkgId, lessonId) {
  if (SERVICE) throw new Error('محتوى مواد الاشتراك يُدار من منصة أفق.');
  await updatePackage(pkgId, (p) => { p.lessons = (p.lessons || []).filter((l) => l.id !== lessonId); });
  await clearSession(pkgId, lessonId);
}
export function blankLesson(unit, lesson, title) {
  return { id: newId(), unit: unit || '', lesson: lesson || 'الدرس', title: title || 'الحصة', outcomes: '', levels: ['التذكر', 'الفهم', 'التطبيق'], strategies: ['التعلم التعاوني'], strategiesOther: '', resources: ['الكتاب'], resourcesOther: '', concepts: '', intro: '', procedures: '', formative: '', summative: '', notes: '' };
}
// دمج حصص جديدة في حزمة (موجودة أو جديدة) — الحصة بنفس الدرس والعنوان تُستبدل
// المادة الموجودة لنفس المادة والصف (بالاسم والصف، لا بالمعرّف — فالنسخ المستوردة معرّفها مختلف)
export function findSubjectPackage(packages, subject, gradeNum) {
  const s = kwNorm(subject);
  return s ? (packages || []).find((p) => kwNorm(p.subject || '') === s && gradeNumber(p) === +gradeNum) || null : null;
}
export async function mergeSessions({ pkgId, subject, gradeNum, driveLink, sessions }) {
  const { packages } = await getPackages();
  const existing = (pkgId && packages.find((p) => p.id === pkgId)) || findSubjectPackage(packages, subject, gradeNum);
  let id = (String(subject).trim() + '-' + gradeNum).replace(/[\s/\\#?%]+/g, '-');
  while (!existing && packages.some((p) => p.id === id)) id += '-' + Math.random().toString(36).slice(2, 5);
  const pkg = existing ? JSON.parse(JSON.stringify(existing)) : { id, subject: String(subject).trim(), grade: GRADES[gradeNum - 1], gradeNum, title: String(subject).trim() + ' — ' + GRADES[gradeNum - 1], lessons: [] };
  if (!existing) pkg.driveLink = driveLink || '';   // لا نغيّر رابط مادة موجودة (يُعدَّل من صفحتها)
  pkg.built = new Date().toISOString();
  let added = 0, replaced = 0;
  for (const l of sessions) {
    const i = pkg.lessons.findIndex((x) => (x.unit || '') === (l.unit || '') && x.lesson === l.lesson && x.title === l.title);
    if (i >= 0) { l.id = pkg.lessons[i].id; pkg.lessons[i] = l; replaced++; } else { pkg.lessons.push(l); added++; }
  }
  await installPackage(pkg);
  return { pkg, added, replaced };
}

// ---------- قيم البنود لحصة ----------
export function gradeNumber(pkg) {
  if (typeof pkg.gradeNum === 'number') return pkg.gradeNum;
  const g = String(pkg.grade || '');
  const m = g.match(/\d+/); if (m) return +m[0];
  for (let i = GRADES.length - 1; i >= 0; i--) if (g.includes(GRADES[i])) return i + 1;
  return 0;
}
export function driveApplies(pkg) {
  const n = gradeNumber(pkg);
  return !!pkg.driveLink && n >= 5 && n <= 12;
}
// تنظيف HTML القادم من ملفات مشاركة قبل كتابته في نور (يعمل أيضًا في العامل الخلفي حيث لا يوجد DOMParser)
export function cleanHtml(h) {
  return String(h || '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|frame|frameset|object|embed|link|meta|base|form|input|button|textarea|select|svg|math|img)\b[^>]*>/gi, '')
    .replace(/<[a-z][^>]*>/gi, (tag) => tag
      .replace(/([\s"'\/])on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '$1')
      .replace(/([\s"'\/])(href|src|action|formaction|xlink:href)\s*=\s*("|')?\s*(javascript|data|vbscript):[^\s>]*/gi, '$1'));
}
export function lessonValues(pkg, lesson) {
  const v = {};
  NOOR_FIELDS.forEach((f) => {
    const raw = lesson[f.key] != null ? lesson[f.key] : (f.mode === 'text' || f.mode === 'checkall' ? '' : []);
    v[f.key] = typeof raw === 'string' ? cleanHtml(raw) : raw;
  });
  if (driveApplies(pkg)) {
    const link = String(pkg.driveLink).trim();
    // لا نكرر الرابط إن كان مكتوبًا في الملاحظات أصلًا
    if (!String(v.notes || '').includes(link)) {
      const safe = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      v.notes = (v.notes || '') + `<p><strong>ملفات الدرس والمواد الداعمة:</strong> <a href="${safe}" target="_blank">${safe}</a></p>`;
    }
  }
  return v;
}
export function buildItems(pkg, lesson) {
  const vals = lessonValues(pkg, lesson);
  return NOOR_FIELDS.map((f) => ({ key: f.key, match: f.match, mode: f.mode, fillTo: f.fillTo, value: vals[f.key], other: lesson[f.key + 'Other'] || '' }))
    .filter((it) => it.mode === 'checkall' || (Array.isArray(it.value) ? it.value.length : String(it.value || '').trim()));
}

// ---------- التشغيل على التبويب ----------
async function execNoor(tabId, action, payload) {
  const res = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: hadirEngine, args: [action, payload || {}] });
  return res.map((r) => r.result).filter((r) => r && !r.skipFrame);
}
const FIELD_KEYS = NOOR_FIELDS.map((f) => ({ key: f.key, match: f.match }));
export async function pageContext(tabId) {
  try {
    const parts = await execNoor(tabId, 'context', { keys: FIELD_KEYS });
    const found = Math.max(0, ...parts.map((p) => p.found || 0));
    const title = (parts.find((p) => p.title) || {}).title || '';
    const mark = (parts.find((p) => p.mark) || {}).mark || null;
    return { isForm: found >= 5, found, title, mark, tree: parts.some((p) => p.tree), ready: parts.length > 0 && parts.every((p) => p.ready), url: (parts[0] || {}).url || '' };
  } catch (e) { return { isForm: false, found: 0, title: '', mark: null, ready: false, error: String(e.message || e) }; }
}
export async function noorLessonTitle(tabId) { return (await pageContext(tabId)).title; }

const RANK = { ok: 6, partial: 5, skip: 4, fail: 3, miss: 2, notarget: 1, nolabel: 0 };

// «(2)» في آخر عنوان نور رقمُ حصة — إلا إن كانت أسماء الدروس نفسها تنتهي بأرقام بين قوسين (مثل «سورة النبأ (2)»)
export const suffixIsSession = (pkgs) => !(pkgs || []).some((p) => (p.lessons || []).some((l) => sessionSuffix(l.lesson) != null));

// ---------- شجرة الدروس في نور ----------
async function treeOp(tabId, payload) {
  const parts = await execNoor(tabId, 'noorTree', payload);
  return parts.find((p) => p && p.tree) || parts.find((p) => p && p.tree === false) || { tree: false };
}
export const sessionNo = (pkg, lesson) => {
  const sessions = ((pkg && pkg.lessons) || []).filter((l) => groupKey(l) === groupKey(lesson));
  return sessions.findIndex((l) => l.id === lesson.id) + 1;
};

// ---------- مطابقة الدروس بالترتيب (لأي مادة) ----------
// اسم ترتيبي مثل «الدرس 4 من 55»: رقم الدرس بين دروس الفصل كلها لا داخل وحدته
const ORDINAL = /(?:الدرس|درس|lesson)\s*(\d+)\s*(?:من|of|\/)\s*(\d+)/i;
const toLatin = (x) => String(x || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export function ordinalOf(lesson) { const m = toLatin(lesson && lesson.lesson).match(ORDINAL); return m ? { n: +m[1], of: +m[2] } : null; }
const pickKeyMatches = (key, text) => { const t = kwNorm(text); return key === t || (key.startsWith(t + ' ') && /^\d+$/.test(key.slice(t.length + 1))); };

// كل دروس الشجرة بالترتيب — تُحفظ لكل مقرر (الرابط) أسبوعًا حتى لا تُفتح الوحدات كلها كل مرة
async function treeLessons(tabId, url) {
  const cid = (String(url || '').match(/cid:([A-Za-z0-9_-]+)/) || [])[1] || String(url || '').split('#')[0];
  const r = await chrome.storage.local.get('treeCache');
  const cache = r.treeCache || {};
  const hit = cache[cid];
  if (hit && Date.now() - hit.at < 7 * 864e5 && (hit.lessons || []).length) return hit.lessons;
  const res = await treeOp(tabId, { op: 'allLessons' });
  const lessons = (res.lessons || []).map((x) => ({ text: x.text, unit: x.unit, term: x.term }));
  if (lessons.length) {
    cache[cid] = { at: Date.now(), lessons };
    const keys = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
    keys.slice(30).forEach((k) => delete cache[k]);
    await chrome.storage.local.set({ treeCache: cache });
  }
  return lessons;
}

// درس الشجرة المقابل لدرس المكتبة بالترتيب:
// ١) درسٌ اخترتَه سابقًا من المادة نفسها (مرساة) — ما بعده وما قبله بالفرق نفسه
// ٢) الاسم الترتيبي «الدرس N من M» مع فصل في الشجرة عدد دروسه M
// ٣) فصل في الشجرة عدد دروسه يساوي عدد دروس المادة تمامًا
export function orderPick(pkg, lesson, tree, picks) {
  const groups = lessonGroups(pkg);
  const gi = groups.findIndex((g) => g.key === groupKey(lesson));
  if (gi < 0 || !tree.length) return null;
  const anchors = [];
  Object.entries(picks || {}).forEach(([k, v]) => {
    if (v.pkgId !== pkg.id) return;
    const l = (pkg.lessons || []).find((x) => x.id === v.lessonId);
    const ai = l ? groups.findIndex((g) => g.key === groupKey(l)) : -1;
    const ti = ai >= 0 ? tree.findIndex((t) => pickKeyMatches(k, t.text)) : -1;
    if (ti >= 0) anchors.push({ ai, ti });
  });
  if (anchors.length) {
    anchors.sort((a, b) => Math.abs(a.ai - gi) - Math.abs(b.ai - gi));
    const t = tree[anchors[0].ti + (gi - anchors[0].ai)];
    return t ? { node: t, how: 'anchor' } : null;
  }
  const terms = [...new Set(tree.map((t) => t.term))].map((term) => tree.filter((t) => t.term === term));
  const ord = ordinalOf(lesson);
  if (ord) { const list = terms.find((l) => l.length === ord.of); if (list && list[ord.n - 1]) return { node: list[ord.n - 1], how: 'ordinal' }; }
  const same = terms.find((l) => l.length === groups.length);
  if (same && same[gi]) return { node: same[gi], how: 'count' };
  return null;
}

// يختار في شجرة نور الدرسَ المطابق لحصة المكتبة إن لم يكن في الصفحة درس مختار
// status: none (لا شجرة) | already (درس مختار) | picked | nomatch (cands: دروس الشجرة لتختار منها) | fail
export async function selectNoorLesson(tabId, pkg, lesson) {
  const st = await treeOp(tabId, { op: 'state' });
  if (!st.tree) return { status: 'none' };
  if (st.hasLesson) return { status: 'already', title: st.title };
  const picks = await getPicks();
  const mine = new Set(Object.entries(picks).filter(([, v]) => {
    if (v.pkgId !== pkg.id) return false;
    const l = (pkg.lessons || []).find((x) => x.id === v.lessonId);
    return l && groupKey(l) === groupKey(lesson);
  }).map(([k]) => k));
  const seen = [];
  let pick = null;
  const known = (list) => { const n = list.find((x) => [...mine].some((k) => pickKeyMatches(k, x.text))); return n ? { node: n, score: 9 } : null; };
  // ١) بالاسم — إلا إن كان الاسم ترتيبيًا («الدرس 4 من 55») فرقمه ليس رقم الدرس في وحدته
  if (!ordinalOf(lesson)) {
    const u = await treeOp(tabId, { op: 'units', unitNo: unitNum([lesson.unit, lesson.lesson].filter(Boolean).join(' ')) });
    const units = u.units || [];
    const sure = units.filter((x) => unitMayHold(x.text, lesson) === true);
    const maybe = units.filter((x) => unitMayHold(x.text, lesson) === null)
      .map((x) => ({ x, s: kwScore(x.text, (lesson.unit || '') + ' ' + (lesson.lesson || '')) })).sort((a, b) => b.s - a.s).map((y) => y.x);
    for (const [group, firstWins] of [[sure, true], [maybe, false]]) {
      for (let i = 0; i < Math.min(group.length, 16); i++) {
        const r = await treeOp(tabId, { op: 'lessons', units: [group[i]] });
        seen.push(...(r.lessons || []));
        pick = known(seen) || bestTreeLesson(seen, lesson);
        if (pick && (firstWins || pick.score >= 1.3)) break;
      }
      if (pick) break;
    }
    if (pick && pick.score !== 9) {
      // تحقق عكسي: درس الشجرة المختار يجب أن يطابق في مكتبتك الدرسَ نفسه لا درسًا آخر
      const back = bestLesson([pkg], pick.node.text);
      if (back && groupKey(back.lesson) !== groupKey(lesson)) pick = null;
    }
  }
  // ٢) بالترتيب: كل دروس الفصل في الشجرة ↔ دروس المادة بترتيبها (يعمل لأي مادة مهما كانت الأسماء)
  let tree = null;
  if (!pick) {
    tree = await treeLessons(tabId, st.url).catch(() => []);
    pick = known(tree);
    if (!pick) {
      const o = orderPick(pkg, lesson, tree, picks);
      // بالترتيب، لكن إن كان اسم درس الشجرة يطابق بوضوح درسًا آخر في مكتبتك فلا نختاره
      // (لا يُطبَّق على الأسماء الترتيبية: «الدرس 1 من 25» يشبه «Lesson1» برقمه فقط)
      const ordinalNames = (pkg.lessons || []).some((l) => ordinalOf(l));
      const other = o && !ordinalNames && bestLesson([pkg], o.node.text);
      if (o && !(other && other.score >= 0.6 && groupKey(other.lesson) !== groupKey(lesson))) pick = { node: o.node, how: o.how };
    }
  }
  if (!pick) {
    const list = (tree && tree.length ? tree : seen).slice(0, 200);
    return { status: 'nomatch', cands: list.map((x) => ({ id: x.id || '', text: x.text, unit: x.unit, term: x.term })) };
  }
  const r = await pickTreeNode(tabId, pick.node);
  if (r.status === 'fail' && tree) {
    // ربما تغيّرت الشجرة منذ حفظناها: نعيد قراءتها مرة
    const c = await chrome.storage.local.get('treeCache'); const cache = c.treeCache || {}; Object.keys(cache).forEach((k) => { if (String(st.url).includes(k)) delete cache[k]; }); await chrome.storage.local.set({ treeCache: cache });
  }
  return Object.assign(r, { how: pick.how || 'name' });
}

// ---------- «فصل كامل» ----------
// أسماء الفصول الدراسية في الشجرة دون فتحها (تنتظر ظهورها إن تأخرت الشجرة): { tree, terms: [نص] }
export async function noorTerms(tabId) {
  const r = await treeOp(tabId, { op: 'terms' });
  return { tree: !!r.tree, terms: r.terms || [] };
}
// كل دروس فصل دراسي واحد بالترتيب (يُفتح هو وحده): [{ text, unit, term }]
export async function termAllLessons(tabId, term) {
  const r = await treeOp(tabId, { op: 'allLessons', terms: [term] });
  return (r.lessons || []).map((x) => ({ text: x.text, unit: x.unit, term: x.term }));
}

// اختيار درس محدد من الشجرة (من قائمة الاختيار في النافذة) — node: { id, text, unit, term }
export async function pickTreeNode(tabId, node) {
  const sel = await treeOp(tabId, { op: 'select', id: node.id, text: node.text, unit: node.unit, term: node.term });
  if (!sel.ok) return { status: 'fail', text: node.text };
  return { status: 'picked', text: node.text, title: sel.title, outcomes: sel.outcomes };
}

// «(2)» لعنوان الحصة الثانية من الدرس — فقط إن كان العنوان هو اسم الدرس في الشجرة (لا نغيّر عنوانًا كتبه المعلم)
export async function applyTitleSuffix(tabId, pkg, lesson) {
  const st = await treeOp(tabId, { op: 'state' });
  if (!st.tree || !st.title || !st.selected) return null;
  const base = stripSessionSuffix(st.title);
  if (base !== st.selected.text) return null;
  const n = sessionNo(pkg, lesson);
  const want = n >= 2 ? `${base} (${n})` : base;
  if (want === st.title) return null;
  const r = await treeOp(tabId, { op: 'title', value: want });
  return r.ok ? want : null;
}

// تعبئة حصة في نموذج نور — مع حفظ «آخر تعبئة» وتحديث التقدم والسجل
export async function fillNoor(tabId, pkg, lesson, opts = {}) {
  if (isRemote(pkg)) {
    // مادة اشتراك: محتوى الحصة يُجلب الآن من منصة أفق (لا يُخزَّن في الإضافة)
    const r = await remoteLesson(pkg, lesson);
    if (!r.ok) return [{ key: 'remote', name: 'الاشتراك', short: 'الاشتراك', status: 'fail', blocked: true, remoteError: r.error, error: REMOTE_ERR[r.error] || REMOTE_ERR.network, values: [] }];
    lesson = r.lesson;
  }
  const settings = await getSettings();
  const skipFilled = opts.skipFilled != null ? !!opts.skipFilled : !!settings.skipFilled;
  const items = buildItems(pkg, lesson);
  // الدرس في نور: يُختار من الشجرة إن لم يكن مختارًا، ثم «(2)» للحصة الثانية
  let lessonRow = null, finalTitle = opts.noorTitle || '', treeUsed = false;
  if (opts.pickLesson !== false && settings.pickLesson !== false) {
    const r = await selectNoorLesson(tabId, pkg, lesson).catch((e) => ({ status: 'fail', error: String(e.message || e) }));
    treeUsed = r.status !== 'none';
    if (r.status === 'picked') { lessonRow = { status: 'ok', how: 'tree', values: [r.text] }; finalTitle = r.title || r.text; }
    else if (r.status === 'nomatch' || r.status === 'fail') {
      // بلا درس مختار في نور لا تعبئة ولا تسجيل: نور لن تحفظها، ولا نريد أن تُعدّ الحصة منجزة
      return [{ key: 'lesson', name: 'الدرس في نور', short: 'الدرس', status: 'miss', how: 'tree', why: r.status, values: r.text ? [r.text] : [], cands: r.cands || [], blocked: true }];
    }
  }
  if (settings.titleSuffix !== false) {
    const t = await applyTitleSuffix(tabId, pkg, lesson).catch(() => null);
    if (t) { lessonRow = Object.assign(lessonRow || { status: 'ok', how: 'suffix' }, { values: [t] }); finalTitle = t; }
  }
  const parts = await execNoor(tabId, 'noor', {
    items, skipFilled, publishDate: opts.publishDate || '', allRows: true,
    ensureChecks: settings.ensureGlobal ? [GLOBAL_CHECK] : [],
    checkTimeslots: settings.checkTimeslots !== false,
    setWeek: settings.setWeek !== false,
    mark: { pkgId: pkg.id, lessonId: lesson.id, date: opts.publishDate || '', at: Date.now() },
  });
  const merged = {};
  parts.forEach((p) => Object.entries(p.results || {}).forEach(([k, r]) => {
    if (!merged[k] || (RANK[r.status] || 0) > (RANK[merged[k].status] || 0)) merged[k] = r;
  }));
  const report = items.map((it) => {
    const f = NOOR_FIELDS.find((x) => x.key === it.key);
    return Object.assign({ key: it.key, name: f.name, short: f.short }, merged[it.key] || { status: 'nolabel' });
  });
  if (settings.checkTimeslots !== false) report.push(Object.assign({ key: 'timeslots', name: 'الصفوف (الحصص)', short: 'الصفوف' }, merged.timeslots || { status: 'nolabel' }));
  if (merged.week) report.push(Object.assign({ key: 'week', name: 'أسبوع العمل', short: 'الأسبوع' }, merged.week));
  if (settings.ensureGlobal) report.push(Object.assign({ key: 'global', name: GLOBAL_CHECK, short: 'التعميم' }, merged['check:' + GLOBAL_CHECK] || { status: 'nolabel' }));
  if (opts.publishDate) report.push(Object.assign({ key: 'publish', name: 'تاريخ النشر', short: 'التاريخ' }, merged.publish || { status: 'nolabel' }));
  if (lessonRow) report.unshift(Object.assign({ key: 'lesson', name: 'الدرس في نور', short: 'الدرس' }, lessonRow));
  if (merged.preflight) report.push(Object.assign({ key: 'preflight', name: 'جاهز للحفظ', short: 'جاهز للحفظ' }, merged.preflight));

  const anyOk = report.some((r) => r.status === 'ok' || r.status === 'partial');
  const pubOk = !opts.publishDate || (report.find((r) => r.key === 'publish') || {}).status === 'ok';
  const { state } = await getPackages();
  state.pkgId = pkg.id; state.lessonId = lesson.id;
  if (opts.publishDate && pubOk) {
    state.lastPubDate = opts.publishDate;
    state.lastPub = Object.assign({}, state.lastPub || {}, { [pkg.id]: opts.publishDate });
  }
  if (anyOk) {
    const k = sessionKey(pkg.id, lesson.id);
    state.sessions[k] = Object.assign({}, state.sessions[k] || {}, { filled: Date.now(), date: pubOk ? (opts.publishDate || '') : '' });
    // التالية في الخطة، ورابط نموذج هذا الدرس
    const nx = nextInPackage(pkg, state, lesson.id, true);
    state.chain = { pkgId: pkg.id, from: lesson.id, next: nx ? nx.id : null, at: Date.now() };
    const top = parts.find((p) => (p.frames || []).includes('top')) || parts[0];
    if (top && top.url) state.forms = Object.assign({}, state.forms || {}, { [formKey(pkg.id, lesson)]: top.url });
    if (treeUsed) state.treeForms = Object.assign({}, state.treeForms || {}, { [pkg.id]: Date.now() });
  }
  await savePkgState(state);
  if (anyOk) await setLastFill({ tabId, pkgId: pkg.id, lessonId: lesson.id, date: pubOk ? (opts.publishDate || '') : '', title: finalTitle });
  if (anyOk && !opts.noLog) await addLog({ pkgId: pkg.id, lessonId: lesson.id, pkg: pkg.title, lesson: lesson.title, unitLesson: lesson.lesson, date: opts.publishDate || '', action: 'عُبّئ', ok: report.filter((r) => r.status === 'ok').length, total: report.length });
  return report;
}

// ---------- قائمة التحاضير في نور: ما حُفظ فعلًا (حتى من جهاز آخر أو يدويًا) ----------
const isEnglish = (t) => /انجليز|english/.test(t);
export function sameSubject(a, b) {
  const x = kwNorm(a), y = kwNorm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  return isEnglish(x) && isEnglish(y);
}
export const gradeOfName = (name) => GRADES.indexOf(String(name || '').replace(/\s+/g, ' ').trim()) + 1;   // ٠ إن لم يُعرف

// rows: [{ title, subject, grade, created, id }] — يعلّم الحصص المطابقة «محفوظة» ويحفظ العناوين للتنبيه من التكرار
export async function syncNoorList(rows) {
  const { packages, state } = await getPackages();
  const picks = await getPicks();
  const cidOf = (u) => (String(u || '').match(/cid:([A-Za-z0-9_-]+)/) || [])[1] || '';
  // مقرر هذه المادة في نور (من روابط نماذجها) — لا نحتسب صفوف مقرر آخر (كعام سابق)
  const pkgCids = (pid) => new Set(Object.entries(state.forms || {}).filter(([k]) => k.startsWith(pid + '|')).map(([, u]) => cidOf(u)).filter(Boolean));
  const found = [];
  for (const row of rows || []) {
    const g = gradeOfName(row.grade);
    const pk = packages.filter((p) => {
      if (!(p.lessons || []).length || !sameSubject(p.subject || p.title, row.subject)) return false;
      if (g && gradeNumber(p) && gradeNumber(p) !== g) return false;
      const cids = pkgCids(p.id);
      return !row.cid || !cids.size || cids.has(row.cid);
    });
    if (!pk.length) continue;
    const asSession = suffixIsSession(pk);
    const base = asSession ? stripSessionSuffix(row.title) : row.title;
    // تأكيدك اليدوي للتوافق أولًا، ثم المطابقة التلقائية الواضحة فقط
    let m = null;
    const pkd = picks[kwNorm(row.title)] || picks[kwNorm(base)];
    if (pkd) { const p = pk.find((x) => x.id === pkd.pkgId); const l = p && p.lessons.find((x) => x.id === pkd.lessonId); if (l) m = { pkg: p, lesson: l, score: 9 }; }
    if (!m) { m = bestLesson(pk, base); if (m && m.score < 0.6) m = null; }
    if (!m) continue;
    const sessions = m.pkg.lessons.filter((l) => groupKey(l) === groupKey(m.lesson));
    const target = sessions[((asSession && sessionSuffix(row.title)) || 1) - 1];
    if (!target || sessionStatus(state, m.pkg.id, target.id).saved) continue;
    if (found.some((x) => x.lessonId === target.id && x.pkgId === m.pkg.id)) continue;
    found.push({ pkgId: m.pkg.id, pkg: m.pkg.title, lessonId: target.id, lesson: target.title, unitLesson: target.lesson, noor: row.title, id: row.id });
  }
  const marked = [];
  if (found.length) {
    // نعيد قراءة الحالة قبل الكتابة مباشرة ونغيّر الحصص المعنية فقط (قد يكون اكتشاف الحفظ كتب للتو)
    const fresh = (await getPackages()).state;
    for (const x of found) {
      const k = sessionKey(x.pkgId, x.lessonId);
      const prev = fresh.sessions[k] || {};
      if (prev.saved) continue;
      fresh.sessions[k] = Object.assign({}, prev, { saved: Date.now(), savedDate: prev.date || '', noor: x.id || true });
      marked.push(x);
    }
    if (marked.length) {
      await savePkgState(fresh);
      for (const x of marked) await addLog({ pkgId: x.pkgId, lessonId: x.lessonId, pkg: x.pkg, lesson: x.lesson, unitLesson: x.unitLesson, date: '', action: 'حُفظ', source: 'قائمة نور' });
    }
  }
  const r = await chrome.storage.local.get('noorList');
  const prevTitles = (r.noorList && r.noorList.titles) || [];
  const titles = [...new Set([...(rows || []).map((x) => kwNorm(x.title)), ...prevTitles])].slice(0, 3000);
  await chrome.storage.local.set({ noorList: { at: Date.now(), titles } });
  return { marked, rows: (rows || []).length };
}
export async function noorHasTitle(title) {
  if (!title) return false;
  const r = await chrome.storage.local.get('noorList');
  return !!(r.noorList && (r.noorList.titles || []).includes(kwNorm(title)));
}

export async function diagNoor(tabId) {
  const items = NOOR_FIELDS.map((f) => ({ key: f.key, match: f.match, mode: f.mode }));
  const parts = await execNoor(tabId, 'noorDiag', { items });
  return { when: new Date().toISOString(), version: chrome.runtime.getManifest().version, frames: parts.map((p) => ({ url: p.url, frames: p.frames, results: p.results })) };
}
export async function formReady(tabId) {
  const c = await pageContext(tabId);
  return { ready: c.ready, found: c.found, url: c.url, title: c.title };
}
export async function clickSave(tabId, waitMs = 10000, aborted = null) {
  // زر الحفظ في نور يبقى معطّلًا حتى تكتمل الشروط (مثل اختيار الصفوف) — ننتظره قليلًا
  // aborted(): يلغي الانتظار قبل الضغط (زر «إيقاف»)
  const end = Date.now() + waitMs;
  let last = { clicked: false };
  do {
    if (aborted && aborted()) return { clicked: false, aborted: true };
    const parts = await execNoor(tabId, 'saveForm', {});
    last = parts.find((p) => p.clicked) || parts.find((p) => p.disabled) || { clicked: false };
    if (last.clicked || !last.disabled) return last;
    await new Promise((r) => setTimeout(r, 700));
  } while (Date.now() < end);
  return last;
}
export async function pageAlerts(tabId) {
  const parts = await execNoor(tabId, 'checkErrors', {});
  return {
    errs: parts.flatMap((p) => p.errs || []), oks: parts.flatMap((p) => p.oks || []), url: (parts[0] || {}).url,
    login: parts.some((p) => p.login), form: parts.some((p) => p.form),
  };
}
// الحكم على نتيجة الضغط على «حفظ»: saved | error | unknown
// نفضّل «لا أعرف» على تسجيل حفظ لم يحدث (مثل إعادة تحميل النموذج أو انتهاء الجلسة)
export function judgeSave(al, formUrl) {
  if (!al) return 'unknown';
  if (al.errs && al.errs.length) return 'error';
  if (al.oks && al.oks.length) return 'saved';
  if (al.login) return 'unknown';
  const strip = (u) => String(u || '').split('#')[0];
  if (al.form && formUrl && strip(al.url) === strip(formUrl)) return 'unknown';
  return al.url ? 'saved' : 'unknown';
}
export async function pageReport(tabId) {
  const parts = await execNoor(tabId, 'pageReport', {});
  return { when: new Date().toISOString(), parts };
}

// ---------- السجل ----------
export async function addLog(entry) {
  const r = await chrome.storage.local.get('log');
  const log = Array.isArray(r.log) ? r.log : [];
  log.unshift(Object.assign({ when: Date.now() }, entry));
  await chrome.storage.local.set({ log: log.slice(0, 1000) });
}
export async function getLog() { const r = await chrome.storage.local.get('log'); return Array.isArray(r.log) ? r.log : []; }
export async function clearLog() { await chrome.storage.local.set({ log: [] }); }

// ---------- النسخ الاحتياطي ----------
const BACKUP_KEYS = ['packages', 'pkgState', 'templates', 'settings', 'log'];
export async function makeBackup() {
  const data = await chrome.storage.local.get(BACKUP_KEYS);
  return { app: 'hadir', type: 'backup', v: 2, when: new Date().toISOString(), version: chrome.runtime.getManifest().version, data };
}
export async function restoreBackup(file) {
  if (!isBackupFile(file)) throw new Error('ليس ملف نسخة احتياطية من «حاضر»');
  const data = {};
  BACKUP_KEYS.forEach((k) => { if (file.data[k] !== undefined) data[k] = file.data[k]; });
  await chrome.storage.local.set(data);
}
export function exportPackageFile(pkg) {
  if (isRemote(pkg)) throw new Error('مواد الاشتراك لا تُصدَّر.');
  const clean = JSON.parse(JSON.stringify(pkg));
  delete clean.builtin; delete clean.installed;
  return { app: 'hadir', type: 'package-plain', v: 1, exported: new Date().toISOString(), package: clean };
}
