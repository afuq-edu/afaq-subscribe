// اختبار شامل: المدير ← المعلم ← الرمز ← ربط الإضافة ← المزامنة ← محتوى الحصة ← انتهاء الفصل
// الموقع الحقيقي (index.html/admin.html + app.js/admin.js) في jsdom، والإضافة الحقيقية (background.js/remote.js/packages.js)،
// وقاعدة PostgreSQL حقيقية بالمخطط نفسه.
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { makeDb, fakeSupabase, fakeFetch, fakeChromeStorage } from './fakes.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(40); } return null; }

// نسخة اختبار من الإضافة موجّهة إلى الخادم المحاكى
const EXT_SRC = fs.existsSync(new URL('../extension/', import.meta.url)) ? new URL('../extension/', import.meta.url) : new URL('../ext/', import.meta.url);
fs.rmSync(new URL('./ext/', import.meta.url), { recursive: true, force: true });
fs.cpSync(EXT_SRC, new URL('./ext/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./ext/afaq-config.js', import.meta.url), "export const AFAQ = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'anon-test', SITE_URL: 'https://afaq.test/', SERVICE: true };\n");

const db = await makeDb();
const net = {};
globalThis.fetch = fakeFetch(db, net);

// ---------- الإضافة: chrome مصغّر، ثم تحميل background.js الحقيقي ----------
const storage = fakeChromeStorage();
let externalHandler = null;
const noop = { addListener() {} };
globalThis.chrome = {
  storage,
  runtime: { id: 'ext', getManifest: () => JSON.parse(fs.readFileSync(new URL('./ext/manifest.json', import.meta.url))), getURL: (p) => 'chrome-extension://ext/' + p,
    onMessage: noop, onInstalled: noop, onStartup: noop, onMessageExternal: { addListener: (f) => { externalHandler = f; } }, sendMessage: async () => {} },
  commands: { onCommand: noop }, tabs: { onUpdated: noop, onRemoved: noop, query: async () => [] },
  alarms: { create() {}, onAlarm: noop }, action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  scripting: { executeScript: async () => { throw new Error('no tab in test'); } },
};
globalThis.self = globalThis;
await import('./ext/background.js');
const P = await import('./ext/packages.js');
const R = await import('./ext/remote.js');
ok(typeof externalHandler === 'function', 'الإضافة تستقبل رسائل الموقع (externally_connectable)');

// ---------- صفحات الموقع في jsdom ----------
const SITE = new URL('../site/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, SITE), 'utf8');
const CFG = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'anon-test', EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' };
function openPage(file, store, opts = {}) {
  const html = read(file).replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://afaq.test/' + file + (opts.hash || ''), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.AFAQ_CONFIG = CFG;
  w.supabase = { createClient: () => fakeSupabase(db, store) };
  w.matchMedia = () => ({ matches: true });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  w.confirm = () => true; w.prompt = () => null;
  w.opened = []; w.open = (u) => { w.opened.push(u); return null; };
  w.navigator.clipboard = { writeText: async (t) => { w.copied = t; } };
  // جسر الإضافة: إن كانت «مثبتة» تصل الرسالة إلى background.js الحقيقي
  w.chrome = { runtime: { lastError: null, sendMessage: (id, msg, cb) => {
    if (!opts.extInstalled || !opts.extInstalled()) { w.chrome.runtime.lastError = { message: 'Could not establish connection' }; setTimeout(() => cb(undefined), 5); return; }
    w.chrome.runtime.lastError = null;
    externalHandler(msg, { url: 'https://afaq.test/' }, (r) => cb(r));
  } } };
  // jsdom لا يدعم Blob.text() الموجودة في المتصفحات
  if (!w.Blob.prototype.text) w.Blob.prototype.text = function () { return new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.readAsText(this); }); };
  // jsdom لا يدعم الوصول إلى حقول النموذج باسمها (form.email) كما تفعل المتصفحات
  w.document.querySelectorAll('form').forEach((f) => Array.from(f.elements).forEach((el) => { if (el.name && !(el.name in f)) Object.defineProperty(f, el.name, { get: () => f.elements.namedItem(el.name) }); }));
  w.eval(read('assets/common.js'));
  w.eval(read(file === 'admin.html' ? 'assets/admin.js' : 'assets/app.js'));
  return w;
}
const $ = (w, s) => w.document.querySelector(s);
const fill = (w, form, vals) => { const f = $(w, form); Object.entries(vals).forEach(([k, v]) => { f[k].value = v; }); f.dispatchEvent(new w.Event('submit', { cancelable: true })); };

// ================= المدير =================
console.log('\n— المدير يجهّز المنصة');
const adminStore = { session: null };
await fakeSupabase(db, adminStore).auth.signUp({ email: 'admin@afaq.om', password: 'secret1', options: { data: { full_name: 'مدير منصة أفق' } } });
await db.query(`update public.profiles set is_admin = true where full_name = 'مدير منصة أفق'`);
adminStore.session = null;
let adm = openPage('admin.html', adminStore);
await waitFor(() => !$(adm, '#gate').hidden);
fill(adm, '#loginForm', { email: 'admin@afaq.om', password: 'secret1' });
ok(await waitFor(() => !$(adm, '#app').hidden), 'دخول المدير إلى لوحة الإدارة');
ok(await waitFor(() => /أضف الفصل الدراسي الحالي/.test($(adm, '#setupHints').textContent)), 'نظرة عامة: تنبيهات إكمال الإعداد');

// الفصل
$(adm, '[data-tab="terms"]').click();
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
fill(adm, '#termForm', { year: '2026/2027', term: '1', starts_on: d(-30), ends_on: d(90) });
ok(await waitFor(() => /الحالي/.test($(adm, '#termTable').textContent)), 'إضافة الفصل الأول ٢٠٢٦/٢٠٢٧ (يظهر «الحالي»)');

// الباقات: الإنجليزي الخامس والسادس (باقتان)
$(adm, '[data-tab="packages"]').click();
for (const g of ['5', '6']) {
  const f = $(adm, '#pkgForm');
  f.subject.value = 'اللغة الإنجليزية'; f.subject.dispatchEvent(new adm.Event('input'));
  f.grade.value = g; f.grade.dispatchEvent(new adm.Event('change'));
  ok(f.pkg_id.value === 'en-' + g && f.pkg_title.value === 'اللغة الإنجليزية — ' + (g === '5' ? 'الخامس' : 'السادس'), `اقتراح الرمز والعنوان تلقائيًا (en-${g})`);
  f.dispatchEvent(new adm.Event('submit', { cancelable: true }));
  await waitFor(() => adm.document.querySelectorAll('#pkgTable [data-up]').length >= (g === '5' ? 2 : 4));
}
ok(adm.document.querySelectorAll('#pkgTable tr').length === 3, 'باقتان: كل صف باقة مستقلة');

// رفع ملف المادة المصدَّر من «حاضر» (٣ حصص في درسين) للفصل الأول من en-5
const exported = { app: 'hadir', type: 'package-plain', v: 1, package: { id: 'p1', title: 'English 5', subject: 'اللغة الإنجليزية', grade: 'الخامس', lessons: [
  { id: 'L1', unit: 'Unit 1: Talent show', lesson: 'Lesson 1', title: 'الحصة الأولى', outcomes: ['يتعرف الطالب صفات الشخصية'], strategies: ['التعلم التعاوني'], procedures: '<p>نشاط المفردات</p>', formative: '<p>س١</p>' },
  { id: 'L2', unit: 'Unit 1: Talent show', lesson: 'Lesson 1', title: 'الحصة الثانية', outcomes: ['يستخدم الصفات'], procedures: '<p>نشاط القصة</p>' },
  { id: 'L3', unit: 'Unit 1: Talent show', lesson: 'Lesson 2', title: 'الحصة الأولى', outcomes: ['يقارن'], procedures: '<p>نشاط القواعد</p>' },
] } };
const up = $(adm, '[data-up="en-5"][data-term="1"]');
up.click();
const fileInput = $(adm, '#pkgFile');
Object.defineProperty(fileInput, 'files', { value: [new adm.File([JSON.stringify(exported)], 'english5.json', { type: 'application/json' })], configurable: true });
fileInput.dispatchEvent(new adm.Event('change'));
ok(await waitFor(() => /٣ حصص/.test($(adm, '#pkgTable').textContent)), 'رفع ملف المادة من «حاضر»: ٣ حصص في درسين', ($(adm, '#toast') || {}).textContent);

// الإعدادات: واتساب ورابط المتجر
$(adm, '[data-tab="settings"]').click();
await waitFor(() => $(adm, '#setForm').site_name.value);
fill(adm, '#setForm', { whatsapp: '968 9123 4567', extension_url: 'https://chromewebstore.google.com/detail/hadir/abc' });
ok(await waitFor(async () => (await db.query(`select value from public.settings where key='whatsapp'`)).rows[0].value === '96891234567'), 'حفظ الإعدادات (رقم واتساب يُنظَّف من المسافات)');

// ================= المعلم =================
console.log('\n— المعلم يسجّل ويطلب');
const teacherStore = { session: null };
let extInstalled = false;
let site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled });
ok(await waitFor(() => $(site, '#catalog .grade')), 'الصفحة الرئيسية: الباقات من قاعدة البيانات');
ok(/جاهز: ف١/.test($(site, '[data-id="en-5"]').textContent) && /قيد الإعداد/.test($(site, '[data-id="en-6"]').textContent), 'الباقة تُظهر الفصل الجاهز');
ok($(site, '#horizon rect.tick.on'), 'الأفق: الحصص مرسومة (الحركة مختصرة عند تقليل الحركة)');

// اختيار باقة قبل التسجيل ← يُطلب التسجيل أولًا ويُحفظ الاختيار
$(site, '[data-id="en-5"]').click();
ok(!$(site, '#basket').hidden && /باقة واحدة/.test($(site, '#basketWhat').textContent), 'سلة الطلب تظهر بعد اختيار الباقة');
$(site, '#basketSend').click();
ok(site.location.hash === '#register', 'الطلب قبل التسجيل يوجّه إلى إنشاء الحساب');
fill(site, '#regForm', { full_name: 'عيسى', phone: '91234567', school: '', email: 't@x.om', password: 'secret1' });
ok(/الثلاثي/.test($(site, '#regMsg').textContent), 'التسجيل يرفض الاسم غير الثلاثي');
fill(site, '#regForm', { full_name: 'عيسى بن محمد الحارثي', phone: '91234567', school: 'مدرسة الأفق', email: 't@x.om', password: 'secret1' });
ok(await waitFor(() => site.location.hash === '#dashboard' && !$(site, '#view-dash').hidden), 'التسجيل يفتح لوحة المعلم');
ok(await waitFor(() => /لا اشتراكات بعد/.test($(site, '#subs').textContent)), 'لوحة المعلم: «لا اشتراكات بعد»');
ok(await waitFor(() => /طلبك جاهز/.test($(site, '#dashNotice').textContent)), 'الطلب المحفوظ قبل التسجيل يظهر جاهزًا للإرسال');
$(site, '#sendPend').click();
const wa = (await waitFor(() => site.opened[0])) || '';
ok(wa.startsWith('https://wa.me/96891234567?text=') && decodeURIComponent(wa).includes('الاسم: عيسى بن محمد الحارثي') && decodeURIComponent(wa).includes('اللغة الإنجليزية — الخامس'), 'رسالة واتساب: الاسم والباقة والفصل', decodeURIComponent(wa));
ok(await waitFor(() => /غير مثبتة/.test($(site, '#extState').textContent)), 'الإضافة غير مثبتة: يظهر زر المتجر');
ok($(site, '#extState a[href*="chromewebstore"]'), 'رابط الإضافة من الإعدادات');

// ================= المدير يصدر الرمز =================
console.log('\n— إصدار الرمز وتفعيله');
$(adm, '[data-tab="codes"]').click();
await waitFor(() => adm.document.querySelectorAll('#issuePkgs input').length === 2);
$(adm, '#issuePkgs input[value="en-5"]').checked = true;
$(adm, '#issuePkgs input[value="en-6"]').checked = true;
fill(adm, '#issueForm', { teacher_name: 'عيسى محمد الحارثى', phone: '96891234567', note: 'تحويل بنكي', count: '1' });
const code = (await waitFor(() => $(adm, '#issued .code')))?.textContent;
ok(/^AFQ-\w{4}-\w{4}$/.test(code || ''), 'إصدار رمز باسم المعلم لباقتين: ' + code);
const waAdmin = $(adm, '#issued a.wa');
ok(waAdmin && decodeURIComponent(waAdmin.href).includes(code) && decodeURIComponent(waAdmin.href).includes('#dashboard'), 'زر إرسال الرمز للمعلم عبر واتساب برسالة جاهزة');
ok(await waitFor(() => /لم يُفعَّل/.test($(adm, '#codesTable').textContent)), 'قائمة الرموز: «لم يُفعَّل»');

// المعلم يفعّل (بأحرف صغيرة ومسافات)، ثم يثبّت الإضافة
fill(site, '#codeForm', { code: ' ' + code.toLowerCase().replace(/-/g, ' ') + ' ' });
ok(await waitFor(() => /فُعّل اشتراكك/.test($(site, '#codeMsg').textContent)), 'التفعيل ينجح والاسم مكتوب بشكل مختلف قليلًا');
ok(await waitFor(() => (site.document.querySelectorAll('#subs .sub').length === 2)), 'اشتراكاتي: باقتان');
ok(/فعّال، والتحاضير قيد الإعداد/.test($(site, '#subs').textContent) && /باقٍ/.test($(site, '#subs').textContent), 'حالة كل باقة والأيام المتبقية حتى نهاية الفصل');

// ================= ربط الإضافة بفتح الموقع =================
console.log('\n— الإضافة تعمل بعد فتح الموقع');
extInstalled = true;
site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled, hash: '#dashboard' });
ok(await waitFor(() => /مرتبطة بحسابك وجاهزة/.test($(site, '#extState').textContent), 8000), 'فتح الموقع يربط الإضافة تلقائيًا', $(site, '#extState').textContent);
ok(/باقة واحدة/.test($(site, '#extState').textContent), 'الإضافة فيها الباقة الجاهزة فقط (السادس قيد الإعداد)');
ok(await waitFor(() => site.document.querySelectorAll('#devices li button').length === 1), 'الأجهزة المرتبطة: جهاز واحد');

let { packages } = await P.getPackages();
ok(packages.length === 1 && packages[0].remote && packages[0].lessons.length === 3, 'مكتبة الإضافة: مادة الاشتراك بهيكلها (٣ حصص)');
const dump = JSON.stringify(storage.data);
ok(!/نشاط المفردات|يتعرف الطالب|التعلم التعاوني/.test(dump), 'لا يُخزَّن أي محتوى من التحاضير في الإضافة');
ok(P.lessonGroups(packages[0]).length === 2 && P.gradeNumber(packages[0]) === 5, 'الدروس والحصص والصف كما في المادة');

// محتوى الحصة لحظة التعبئة
const pkg = packages[0];
const full = await R.remoteLesson(pkg, pkg.lessons[0]);
ok(full.ok && full.lesson.procedures.startsWith('<p>نشاط المفردات</p>') && full.lesson.outcomes[0] === 'يتعرف الطالب صفات الشخصية', 'محتوى الحصة يصل عند التعبئة');
const items = P.buildItems(pkg, full.lesson);
ok(items.find((i) => i.key === 'procedures') && items.find((i) => i.key === 'strategies').value[0] === 'التعلم التعاوني', 'بنود نور تُبنى من المحتوى المجلوب');
ok(!/نشاط المفردات/.test(JSON.stringify(storage.data)), 'وبعد الجلب أيضًا: لا محتوى في التخزين');
ok(await P.installPackage({ id: 'x', lessons: [] }).then(() => false, (e) => /اشتراكك فقط/.test(e.message)), 'نسخة الخدمة ترفض استيراد مواد من ملفات');
ok((() => { try { P.exportPackageFile(pkg); return false; } catch (e) { return /لا تُصدَّر/.test(e.message); } })(), 'مادة الاشتراك لا تُصدَّر');

// انقطاع الإنترنت أثناء الجلب: لا يُعتبر انتهاء اشتراك
net.offline = true;
const off = await R.remoteLesson(pkg, pkg.lessons[2]);
net.offline = false;
ok(!off.ok && off.error === 'network' && (await P.getPackages()).packages.length === 1, 'انقطاع الاتصال: خطأ مؤقت والمادة باقية');

// ================= المدير يرى التفعيل =================
$(adm, '[data-tab="teachers"]').click();
ok(await waitFor(() => /عيسى بن محمد الحارثي/.test($(adm, '#tTable').textContent) && /١ جهاز/.test($(adm, '#tTable').textContent)), 'لوحة المدير: المعلم واشتراكاته وجهازه');
$(adm, '[data-tab="codes"]').click();
ok(await waitFor(() => /مُفعَّل/.test($(adm, '#codesTable').textContent)), 'الرمز يظهر «مُفعَّل» باسم المعلم');

// ================= نهاية الفصل =================
console.log('\n— نهاية الفصل');
await db.query(`update public.terms set ends_on = current_date - 1`);
const rep = await P.fillNoor(1, pkg, pkg.lessons[1], { publishDate: d(1) });
ok(rep.length === 1 && rep[0].key === 'remote' && rep[0].remoteError === 'expired' && /انتهى اشتراكك/.test(rep[0].error), 'بعد نهاية الفصل: التعبئة ترفض بسبب انتهاء الاشتراك', rep);
await R.sync();
ok((await P.getPackages()).packages.length === 0, 'المزامنة تحذف المادة المنتهية من الإضافة');
site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled, hash: '#dashboard' });
ok(await waitFor(() => /منتهٍ/.test($(site, '#subs').textContent)), 'لوحة المعلم: الاشتراك «منتهٍ»');
await db.query(`update public.terms set ends_on = current_date + 90`);

// ================= فصل الأجهزة من المدير =================
await R.sync();
await waitFor(async () => (await P.getPackages()).packages.length === 1);
const tId = (await db.query(`select id from public.profiles where full_name like 'عيسى%'`)).rows[0].id;
await db.callRpc('authenticated', (await db.query(`select id from public.profiles where is_admin`)).rows[0].id, 'admin_reset_devices', { p_user: tId });
const after = await R.sync();
ok(after.error === 'unlinked' && (await P.getPackages()).packages.length === 0 && !(await R.getLink()), 'فصل المدير للأجهزة يفصل الإضافة ويمسح موادها');
site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled, hash: '#dashboard' });
ok(await waitFor(() => /مرتبطة بحسابك وجاهزة/.test($(site, '#extState').textContent), 8000), 'فتح الموقع يعيد الربط تلقائيًا');

// معلم آخر يحاول رمزًا ليس له
console.log('\n— الحماية');
const otherStore = { session: null };
const other = openPage('index.html', otherStore, { hash: '#register' });
await waitFor(() => !$(other, '#view-register').hidden);
fill(other, '#regForm', { full_name: 'سالم علي البلوشي', phone: '99887766', school: '', email: 's@x.om', password: 'secret2' });
await waitFor(() => !$(other, '#view-dash').hidden);
fill(other, '#codeForm', { code });
ok(await waitFor(() => /مستعمل في حساب آخر|صادر باسم/.test($(other, '#codeMsg').textContent)), 'رمز معلم آخر لا يعمل لغيره', $(other, '#codeMsg').textContent);
const st2 = await fakeSupabase(db, otherStore).from('package_content').select('*');
ok(Array.isArray(st2.data) && st2.data.length === 0, 'المعلم لا يقرأ جدول المحتوى من المتصفح مباشرة');

// ================= الاشتراك السنوي =================
console.log('\n— الاشتراك الفصلي والسنوي');
$(adm, '[data-tab="settings"]').click();
await waitFor(() => $(adm, '#setForm').site_name.value);
fill(adm, '#setForm', { price_term: '5', price_year: '٩' });
ok(await waitFor(async () => (await db.query(`select string_agg(value, ',' order by key) v from public.settings where key in ('price_term','price_year')`)).rows[0].v === '5,9'), 'المدير يحدد سعر الفصلي والسنوي (والأرقام العربية تُقبل)');

site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled });
ok(await waitFor(() => /٥ ر\.ع\./.test($(site, '#priceTerm').textContent) && /٩ ر\.ع\./.test($(site, '#priceYear').textContent)), 'صفحة الباقات تعرض سعر الفصلي والسنوي');
ok(/توفّر ١ ر\.ع\./.test($(site, '#saveYear').textContent), 'السنوي يُظهر التوفير مقارنة بفصلين');
await waitFor(() => $(site, '#catalog .grade'));
$(site, '[data-plan="year"]').click();
$(site, '[data-id="en-5"]').click(); $(site, '[data-id="en-6"]').click();
ok($(site, '#basketTermWrap').hidden && /اشتراك سنوي/.test($(site, '#basketWhat').textContent) && /١٨ ر\.ع\./.test($(site, '#basketTotal').textContent), 'السلة: سنوي بلا اختيار فصل، والمجموع ١٨ ر.ع. لباقتين', $(site, '#basket').textContent);
$(site, '[data-plan="term"]').click();
ok(!$(site, '#basketTermWrap').hidden && /١٠ ر\.ع\./.test($(site, '#basketTotal').textContent), 'العودة للفصلي: يظهر اختيار الفصل والمجموع ١٠ ر.ع.');
$(site, '[data-plan="year"]').click();
site.opened.length = 0;
$(site, '#basketSend').click();
const waY = decodeURIComponent((await waitFor(() => site.opened[0])) || '');
ok(/نوع الاشتراك: سنوي/.test(waY) && /المجموع: ١٨ ر\.ع\./.test(waY) && !/الفصل: الفصل/.test(waY), 'رسالة الطلب: سنوي والمجموع', waY);

// المدير يصدر رمزًا سنويًا
$(adm, '[data-tab="codes"]').click();
await waitFor(() => adm.document.querySelectorAll('#issuePkgs input').length === 2);
$(adm, '#issuePlan').value = 'year'; $(adm, '#issuePlan').dispatchEvent(new adm.Event('change'));
ok(/العام الدراسي/.test($(adm, '#issueTermLbl').textContent) && /العام الدراسي ٢٠٢٦\/٢٠٢٧/.test($(adm, '#issueTerm').textContent), 'اختيار «سنوي» يعرض الأعوام الدراسية بدل الفصول');
$(adm, '#issuePkgs input[value="en-5"]').checked = true;
$(adm, '#issuePkgs input[value="en-6"]').checked = true;
fill(adm, '#issueForm', { teacher_name: 'عيسى محمد الحارثي', phone: '96891234567', note: '', count: '1' });
const yCode = (await waitFor(() => $(adm, '#issued .code')?.textContent !== code && $(adm, '#issued .code')))?.textContent;
const yMsg = decodeURIComponent($(adm, '#issued a.wa').href);
ok(/^AFQ-/.test(yCode || '') && /اشتراك سنوي للعام الدراسي 2026\/2027/.test(yMsg), 'رمز سنوي برسالة واتساب توضح أنه للعام كله', yMsg);
ok(await waitFor(() => /سنوي — العام الدراسي/.test($(adm, '#codesTable').textContent)), 'قائمة الرموز تُظهر نوع الاشتراك');

site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled, hash: '#dashboard' });
await waitFor(() => !$(site, '#view-dash').hidden);
fill(site, '#codeForm', { code: yCode });
ok(await waitFor(() => /فُعّل اشتراكك السنوي/.test($(site, '#codeMsg').textContent)), 'المعلم يفعّل الرمز السنوي', $(site, '#codeMsg').textContent);
ok(await waitFor(() => site.document.querySelectorAll('#subs .chip.year').length === 2), 'اشتراكاتي: الباقتان «سنوي»');

// المدير يضيف الفصل الثاني ← يصل للمشترك السنوي دون رمز جديد
$(adm, '[data-tab="terms"]').click();
fill(adm, '#termForm', { year: '2026/2027', term: '2', starts_on: d(100), ends_on: d(200) });
ok(await waitFor(() => /الفصل الثاني/.test($(adm, '#termTable').textContent)), 'المدير يضيف الفصل الثاني');
site = openPage('index.html', teacherStore, { extInstalled: () => extInstalled, hash: '#dashboard' });
ok(await waitFor(() => site.document.querySelectorAll('#subs .sub').length === 4 && /الفصل الثاني/.test($(site, '#subs').textContent)), 'الفصل الثاني يظهر في اشتراكات المعلم السنوي تلقائيًا');

// المدير ينشئ اشتراكًا مباشرة لمعلم مسجّل (سالم)
$(adm, '[data-tab="teachers"]').click();
await waitFor(() => adm.document.querySelectorAll('#grantUser option').length >= 3 && $(adm, '#grantPkgs input'));
const salem = (await db.query(`select id from public.profiles where full_name like 'سالم%'`)).rows[0].id;
(await waitFor(() => $(adm, `[data-grant="${salem}"]`))).click();
ok($(adm, '#grantUser').value === salem, 'زر «أضف اشتراكًا» يختار المعلم في النموذج');
$(adm, '#grantPlan').value = 'year'; $(adm, '#grantPlan').dispatchEvent(new adm.Event('change'));
$(adm, '#grantPkgs input[value="en-5"]').checked = true;
$(adm, '#grantForm').dispatchEvent(new adm.Event('submit', { cancelable: true }));
ok(await waitFor(() => /أُنشئ اشتراك سنوي/.test($(adm, '#grantMsg').textContent)), 'المدير ينشئ اشتراكًا سنويًا مباشرة', $(adm, '#grantMsg').textContent);
const salemSubs = (await db.query(`select plan from public.subscriptions where user_id = $1`, [salem])).rows;
ok(salemSubs.length === 2 && salemSubs.every((r) => r.plan === 'year'), 'الاشتراك السنوي المباشر يغطي الفصلين');
ok(await waitFor(() => /سنوي/.test($(adm, '#tTable').textContent)), 'جدول المعلمين يُظهر «سنوي»');

console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
