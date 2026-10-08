// options.js — مكتبة التحاضير: المواد والدروس والحصص، الإضافة والتعديل، الاستيراد والتصدير، جدول النشر، السجل، الإعدادات
import { getAll, saveTemplates, uid, VARIABLES, KIND_NAMES } from './lib.js';
import {
  getPackages, getSettings, patchSettings, installPackage, updatePackage, deletePackage, saveLesson, deleteLesson, blankLesson,
  mergeSessions, duplicateLesson, moveLesson, resetProgress, setSavedManually, clearSession,
  decryptPackage, isPackageFile, isPlainPackage, isBackupFile, makeBackup, restoreBackup, exportPackageFile,
  NOOR_LEVELS, NOOR_STRATEGIES, NOOR_RESOURCES, GRADES, DAY_NAMES, SAMPLE_PLAN,
  parsePlanText, parsePlanBest, lessonGroups, groupKey, sessionStatus, packageProgress, driveApplies, daysFor, setPkgDays, gradeNumber, findSubjectPackage,
  getLog, clearLog, dayLabel, isoOf, parseIso, kwNorm, newId, unsavedText,
  isIso, lintPackage, lintLevel, hasFileDates, datedCount, normalizeLesson, holidaySet, termEndOf, parseHolidays,
} from './packages.js';
import { docxToText } from './docx.js';
import { AFAQ } from './afaq-config.js';
import { siteUrl } from './remote.js';
import { readHtmlText, planFromHtml, isHtmlFile } from './html.js';
import { ic } from './icons.js';

// ================= أدوات =================
const $ = (id) => document.getElementById(id);
const V = () => $('view');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const textOf = (h) => new DOMParser().parseFromString(String(h || '').replace(/<\/p>|<br\s*\/?>|<\/li>|<\/div>/gi, '\n'), 'text/html').body.textContent.replace(/\n\s*\n+/g, '\n').trim();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function countWord(n, [one, two, few, many]) { return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? toAr(n) + ' ' + few : toAr(n) + ' ' + many; }
const sessionsWord = (n) => (n === 0 ? 'لا حصص' : countWord(n, ['حصة واحدة', 'حصتان', 'حصص', 'حصة']));
const lessonsWord = (n) => (n === 0 ? 'لا دروس' : countWord(n, ['درس واحد', 'درسان', 'دروس', 'درسًا']));
const fieldsWord = (n) => (n === 0 ? 'لا حقول' : countWord(n, ['حقل واحد', 'حقلان', 'حقول', 'حقلًا']));
const timesWord = (n) => (n === 0 ? 'لم يُستخدم' : 'استُخدم ' + countWord(n, ['مرة واحدة', 'مرتين', 'مرات', 'مرة']));
const templatesWord = (n) => countWord(n, ['قالب واحد', 'قالبان', 'قوالب', 'قالبًا']);
const ORD_F = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة', 'الحادية عشرة', 'الثانية عشرة'];
const enc = encodeURIComponent;

const D = { packages: [], state: null, settings: null };
let selfWriteAt = 0;
let dirty = false;
let current = { name: '', refresh: null };

async function loadAll() {
  const [{ packages, state }, settings] = await Promise.all([getPackages(), getSettings()]);
  D.packages = packages; D.state = state; D.settings = settings;
  $('cntLib').textContent = packages.length ? toAr(packages.length) : '';
}
async function write(fn) {
  selfWriteAt = Date.now();
  // الرفض (كتعديل محتوى مادة اشتراك) يظهر للمعلم بدل أن يضيع بصمت
  try { const r = await fn(); await loadAll(); selfWriteAt = Date.now(); return r; }
  catch (e) { toast(String((e && e.message) || e), 4500); throw e; }
}

function toast(t, ms = 2600) {
  const el = $('toast');
  el.textContent = t; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// تنظيف HTML قبل عرضه أو تحريره
const DROP = /^(SCRIPT|STYLE|IFRAME|FRAME|OBJECT|EMBED|LINK|META|IMG|SVG|VIDEO|AUDIO|SOURCE|FORM|INPUT|BUTTON|TEXTAREA|SELECT|NOSCRIPT|TEMPLATE|BASE)$/i;
function sanitize(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.body.querySelectorAll('*').forEach((el) => {
    if (DROP.test(el.tagName)) { el.remove(); return; }
    for (const a of Array.from(el.attributes)) if (!(el.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value))) el.removeAttribute(a.name);
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  });
  return doc.body.innerHTML;
}

function modal({ title, html = '', ok = 'موافق', cancel = 'إلغاء', danger = false, onOk }) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${html}<div class="msg" data-m></div>
      <div class="acts"><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>${cancel ? `<button class="btn" data-cancel>${esc(cancel)}</button>` : ''}</div></div>`;
    document.body.appendChild(bg);
    const close = (v) => { bg.remove(); resolve(v); };
    const cb = bg.querySelector('[data-cancel]'); if (cb) cb.onclick = () => close(null);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(null); });
    const okB = bg.querySelector('[data-ok]');
    const run = async () => {
      if (!onOk) { close(true); return; }
      okB.disabled = true;
      try { const v = await onOk(bg); if (v !== false) { close(v === undefined ? true : v); return; } }
      catch (e) { const m = bg.querySelector('[data-m]'); m.className = 'msg show bad'; m.textContent = e.message || String(e); }
      okB.disabled = false;
    };
    okB.onclick = run;
    bg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); run(); }
    });
    setTimeout(() => (bg.querySelector('input') || okB).focus(), 30);
  });
}
const confirmBox = (title, text, ok = 'نعم', danger = true) => modal({ title, html: `<p>${esc(text)}</p>`, ok, danger });

function download(name, data, type = 'application/json') {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 1)], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = $('fileIn');
    inp.value = ''; inp.accept = accept || '';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
function bindDrop(el, onFile) {
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  el.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); el.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
}
const dayChips = (days) => [0, 1, 2, 3, 4, 5, 6].map((d) => `<button type="button" class="day ${days.includes(d) ? 'on' : ''}" data-d="${d}">${DAY_NAMES[d]}</button>`).join('');
function bindDays(el, days, onChange) {
  el.querySelectorAll('.day').forEach((b) => {
    b.onclick = () => {
      const d = +b.dataset.d;
      let next = days.includes(d) ? days.filter((x) => x !== d) : days.concat(d).sort();
      if (!next.length) next = [d];
      days.splice(0, days.length, ...next);
      el.innerHTML = dayChips(days); bindDays(el, days, onChange);
      onChange(days.slice());
    };
  });
}
function statusText(s) {
  if (s.saved) return `محفوظة في نور${s.savedDate ? ' · النشر ' + dayLabel(s.savedDate) : ''}`;
  if (s.filled) return `عُبّئت${s.date ? ' · ' + dayLabel(s.date) : ''} — ${unsavedText(s)}`;
  return 'لم تُعبّأ بعد';
}

// ================= التنقل =================
function setDirty(v) { dirty = v; const el = $('dirtyMark'); if (el) el.hidden = !v; }
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  if (dirty && !confirm('لديك تغييرات غير محفوظة. تركها دون حفظ؟')) { history.replaceState(null, '', lastHash); return; }
  setDirty(false);
  lastHash = location.hash;
  if (!location.hash.startsWith('#search')) $('gq').value = '';
  route();
});
const go = (...parts) => { location.hash = parts.map((p, i) => (i ? enc(p) : p)).join('/'); };

function route() {
  const raw = location.hash.replace(/^#/, '') || 'library';
  const [name, ...args] = raw.split('/').map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
  const libLike = ['library', 'pkg', 'edit', 'whatsnew', 'welcome', 'search'];
  document.querySelectorAll('#nav a').forEach((a) => {
    const r = a.dataset.r;
    a.classList.toggle('on', r === name || (r === 'library' && libLike.includes(name)) || (r === 'templates' && name === 'tpl'));
  });
  current = { name, refresh: null };
  (VIEWS[name] || VIEWS.library)(...args);
}
function notFound(msg) {
  V().innerHTML = `<section class="card empty"><b>${esc(msg || 'الصفحة غير موجودة')}</b><a class="btn" href="#library">${ic('book', 15)} العودة إلى المكتبة</a></section>`;
}

const VIEWS = {};

// ================= المكتبة =================
function pkgCard(p) {
  const pr = packageProgress(p, D.state);
  const nG = lessonGroups(p).length;
  const pct = (x) => (pr.total ? Math.round(x / pr.total * 100) : 0);
  const ini = String(p.subject || p.title || '؟').trim().replace(/^ال(?=\S\S)/, '').charAt(0);
  const g = gradeNumber(p);
  return `<a class="card pcard" href="#pkg/${enc(p.id)}">
    <div class="pc-top"><span class="pc-ico">${esc(ini)}</span><div><b>${esc(p.title || p.subject)}</b><small>${esc([p.subject, g ? 'الصف ' + GRADES[g - 1] : p.grade, p.term].filter(Boolean).join(' · '))}</small></div></div>
    <div class="bar" title="محفوظ ${pr.saved} · عُبّئ ${pr.filled} من ${pr.total}"><i style="width:${pct(pr.saved)}%"></i><i class="f" style="width:${pct(pr.filled)}%"></i></div>
    <div class="pc-meta"><span>${lessonsWord(nG)} · ${sessionsWord(pr.total)}</span><span class="ok">✓ ${toAr(pr.saved)} محفوظة</span>${pr.filled ? `<span class="fl">• ${toAr(pr.filled)} عُبّئت</span>` : ''}</div>
    <div class="pc-tags">${driveApplies(p) ? `<span class="chip muted">${ic('link', 12)} رابط الدرايف</span>` : ''}</div>
  </a>`;
}

const WHATS_NEW = [
  'الإصدار ٣٫١٠ — «فصل كامل» يعالج الأخطاء وحده: انتظار متدرّج عند بطء نور، نموذج جديد عند التعليق، انتظار عودة الإنترنت، وتحقق من قائمة نور قبل أي إعادة فلا تتكرر حصة.',
  'جولة إكمال لما تعذّر، وتحقق نهائي من قائمة نور، واستئناف تلقائي إن أُغلقت النافذة، وتمييز الإجازة عن يوم بلا حصة.',
  'الإصدار ٣٫٩ — «فصل كامل» يكمل الناقص فقط: يقرأ قائمة تحاضيرك في نور ولا يكرر حصة موجودة، ويعبّئ الحصة الناقصة من الدرس وحدها.',
  'تعارض ملفك مع نور يُحل مرة واحدة قبل البدء: لكل درس قائمة بدروس نور تختار منها، و«ما بعده بالترتيب»، ويُحفظ اختيارك للمرات القادمة.',
  'تعارض الجدول يُحل تلقائيًا: التاريخ المستخدم، أو يوم بلا حصة لك، أو رفض نور للتاريخ — تُنقل الحصة لليوم التالي دون توقف.',
  'تحضير فصل كامل: من الصفحة الرئيسية في نور إلى آخر حصة في الفصل الأول أو الثاني، بكل دروس مادتك وعدد حصصها وتواريخ نشر متتالية — من صفحة المادة أو نافذة «حاضر».',
  'الإضافة تأتي فارغة من المواد ومن رابط الدرايف — تضيف موادك ورابطك بنفسك.',
  'الإصدار ٣٫٧ — مطابقة الدروس لأي مادة: إن لم تكفِ الأسماء يقرأ «حاضر» كل دروس الفصل في شجرة نور بالترتيب ويطابقها مع دروس مادتك بترتيبها — «الدرس 4 من 55» هو الدرس الرابع في الفصل، وإن تساوى عدد الدروس طابقها بالترتيب، وإن اختلف تختار درسًا واحدًا من القائمة فيصبح مرجعًا تُطابَق عليه بقية الدروس. وتُحفظ الشجرة أسبوعًا فلا تُقرأ كل مرة.',
  'الإصدار ٣٫٦٫١ — إصلاح اختيار الدرس في شجرة نور: نور تحذف دروس الوحدات الأخرى وتعيد إنشاءها كلما فتحت وحدة، فصار «حاضر» يصل إلى الدرس بنصّه (الفصل ← الوحدة ← الدرس) ويضغطه فعلًا. وإن لم يُختر الدرس فلا تعبئة ولا تسجيل للحصة «منجزة»، بل قائمة بدروس الشجرة تختار منها مرة واحدة ويتذكّرها «حاضر» بعدها.',
  'الإصدار ٣٫٦ — «تلقائي بالكامل» في «عدة حصص»: يفتح «حاضر» النموذج ويختار الدرس من الشجرة ويعبّئ ويحفظ كل حصة وحده دون «تأكد» أو «التالي». الحصة التي فيها مشكلة يتخطّاها ويكمل، ويعرض في النهاية ما تخطّاه وسببه. و«عبّئ كل حصص الفصل» يبدأ بهذا الوضع.',
  'الإصدار ٣٫٥٫١ — في «عدة حصص»: اختر تاريخ الحصة الأولى — ولو تاريخًا سابقًا — فتأتي بقية حصص الفصل بعده بالتدريج على أيام حصصك، وتغيير تاريخ أي حصة يجعل ما بعدها يتبعها.',
  'الإصدار ٣٫٥ — «عبّئ كل حصص الفصل»: زر في نافذة «حاضر» يفتح «عدة حصص» وكل حصص الفصل غير المنجزة محددة، بتواريخ موزعة على أيام حصصك، ثم «ابدأ» (مع المراجعة أو الحفظ التلقائي). وفي «عدة حصص» زر «تحديد كل حصص الفصل» مع عدّاد ما بقي.',
  'الإصدار ٣٫٤ — يختار «حاضر» الدرس من شجرة الدروس في نور بنفسه: تفتح «إضافة تحضير» وتضغط «عبّئ» فيُختار الدرس ثم تظهر المخرجات وتُحدَّد، دون أن تبحث عنه في الشجرة.',
  'الحصة الثانية من الدرس يُضاف لعنوانها «(2)» تلقائيًا (و«(3)» للثالثة) كما في قائمة تحاضيرك.',
  'عند فتح صفحة «التحاضير» في نور يقرأ «حاضر» القائمة ويعلّم ما حضّرته فعلًا «محفوظًا» — حتى ما حضّرته يدويًا أو من جهاز آخر — فلا يقترحه مرة أخرى، وينبّهك إن فتحت درسًا محضّرًا سابقًا.',
  'فحص قبل الحفظ: يخبرك بما ينقص (الدرس، المخرجات، التاريخ، الصفوف) قبل أن ترفضه نور، و«عدة حصص» لا يحفظ تلقائيًا حصة ناقصة.',
  'أسرع: انتظار قوائم نور وصفوف التاريخ صار ينتهي لحظة ظهورها بدل مدة ثابتة.',
  'توافق أدق لعناوين الإنجليزي: Welcome Unit، و«U1 L3»، و«Lesson Three»، و«(2)» في آخر العنوان.',
  'الإصدار ٣٫٢ — إضافة التحضير من ملفات HTML: ملف Word المحفوظ «صفحة ويب» (‎.htm / ‎.mht)، والصفحات العادية، وملفات التحضير التفاعلية (المدمج والمنفصل) التي يكون التحضير فيها داخل شيفرة الصفحة.',
  'التحضير المدمج (كل بند ثم أجزاء الحصص داخله) يُقسَّم على الحصص تلقائيًا — من ملف أو من نص ملصوق.',
  'ملفات «نسخ حقول نور»: تختار عند الإضافة «مدمج» (نموذج واحد لكل درس، كل بند يجمع حصصه تحت «الحصة 1، الحصة 2…» كما في الملف) أو «منفصل» (نموذج لكل حصة). وما يُكتب «أخرى: …» في المصادر أو الاستراتيجيات يذهب إلى خانة «أخرى» في نور.',
  'الإصدار ٣٫١ — بعد كل حصة تنتقل «حاضر» مباشرة إلى الحصة التالية (حتى لو كانت في الدرس التالي).',
  'عند فتح نموذج «إضافة تحضير» في نور يُفحص التوافق تلقائيًا ويظهر على زر «حاضر» في الصفحة، وتُفتح النافذة وحدها أثناء متابعة التحضير.',
  'إن لم يتوافق الدرس تلقائيًا: زر «تأكد من التوافق» يعرض الدرس المتوقع والأقرب لتأكيده بضغطة، ويتذكر «حاضر» تأكيدك.',
  '«عدة حصص»: حصص من عدة دروس، ونموذج كل حصة يُفتح تلقائيًا أو تفتحه أنت فيتحقق من التوافق ويعبّئه، مع زر «تأكد من التوافق» في النافذة وفي أعلى صفحة نور.',
  'أمان أكثر: لا تُسجَّل الحصة «محفوظة» إلا بعد ضغطك «حفظ» في نور، والحصة التي عُبّئت ولم تُحفظ تبقى مقترحة، ويسألك «حاضر» قبل مغادرة صفحة فيها تعبئة لم تُحفظ، و«إيقاف» يعمل فورًا.',
  'نافذة أوضح بخطوات: الدرس ← الحصة ← التاريخ ← عبّئ، مع «تغيير الدرس» والبحث بالاسم أو الرقم وظهور العناوين كاملة.',
  'يتذكر اختيارك اليدوي للدرس، ويقترح الحصة التالية وتاريخ النشر التالي تلقائيًا (ويتخطى التواريخ المستخدمة).',
  'اكتشاف الحفظ: بعد ضغطك «حفظ» في نور تُسجَّل الحصة «محفوظة ✓»، مع زر «احفظ في نور الآن» ثم «الحصة التالية».',
  'زر «حاضر» داخل صفحة نور يفتح النافذة في الصفحة نفسها لتراجع النموذج وهي مفتوحة.',
  'مكتبة التحاضير: تعديل أي حصة بقوائم نور نفسها، نسخ الحصص وترتيبها، وإضافة دروس وحصص جديدة.',
  'إضافة التحضير من ملف Word مباشرة، مع معاينة قبل الإضافة.',
  'جدول النشر، والسجل مع تصدير Excel، والنسخ الاحتياطي والاستعادة، وأيام حصص لكل مادة.',
  'إصلاحات: مطابقة «المستوى» حتى مع التشكيل (التذكُّر)، عدم تكرار رابط الدرايف، والتفريق بين «عُبّئت» و«حُفظت».',
];

VIEWS.library = (flag) => {
  const pk = D.packages;
  let banner = '';
  if (flag === 'whatsnew') {
    banner = `<section class="card banner"><h3>${ic('magic')} الجديد في الإصدار ${esc(chrome.runtime.getManifest().version)}</h3><ul>${WHATS_NEW.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div style="margin-top:10px"><a class="btn sm" href="#library">حسنًا</a> <a class="btn sm ghost" href="#help">طريقة الاستخدام</a></div></section>`;
  } else if (flag === 'welcome') {
    banner = `<section class="card banner"><h3>${ic('zap')} أهلًا بك في «حاضر»</h3>
      <div class="steps" style="margin-top:6px">
        ${AFAQ.SERVICE ? `<div class="step"><span class="n">١</span><b>افتح حسابك في منصة أفق</b><p>سجّل الدخول في <a href="${esc(siteUrl('#dashboard'))}" target="_blank" rel="noopener">موقع المنصة</a> وفعّل رمزك، فتُربط الإضافة وتصلها موادك.</p></div>` : `<div class="step"><span class="n">١</span><b>جهّز تحضير مادتك</b><p>أضف تحضير مادتك بلصق النص أو رفع ملف Word أو HTML، أو استورد ملف مادة جاهزًا.</p></div>`}
        <div class="step"><span class="n">٢</span><b>افتح «إضافة تحضير» في نور</b><p>من صفحة المادة اختر الدرس ثم «إضافة تحضير».</p></div>
        <div class="step"><span class="n">٣</span><b>اضغط «حاضر» ← عبّئ</b><p>يتعرّف على الدرس ويقترح الحصة والتاريخ، ويعبّئ البنود كلها.</p></div>
        <div class="step"><span class="n">٤</span><b>راجع واحفظ</b><p>بعد «حفظ» في نور تُسجَّل الحصة محفوظة تلقائيًا.</p></div>
      </div><div style="margin-top:10px"><a class="btn sm" href="#library">ابدأ</a></div></section>`;
  }
  V().innerHTML = `
    <div class="page-h"><div><h2>مكتبة التحاضير</h2><p class="sub">موادك ودروسها وحصصها في مكان واحد — افتح مادة لترى حصصها وتعدّلها وتتابع ما حُفظ.</p></div>
      <div class="acts">${AFAQ.SERVICE ? `<a class="btn primary" href="${esc(siteUrl('#dashboard'))}" target="_blank" rel="noopener">${ic('link', 16)} حسابي في منصة أفق</a>` : `<a class="btn primary" href="#create">${ic('plus', 16)} إضافة تحضير</a><a class="btn" href="#transfer">${ic('upload', 16)} استيراد ملف</a>`}</div></div>
    ${banner}
    ${pk.length ? `<div class="cards">${pk.map(pkgCard).join('')}${AFAQ.SERVICE ? '' : `<a class="card add-card" href="#create"><div>${ic('plus', 26)}<br><b>مادة أو صف جديد</b><br><small>الصق النص أو ارفع ملف Word أو HTML</small></div></a>`}</div>`
      : AFAQ.SERVICE
        ? `<section class="card empty"><b>لا مواد في اشتراكك بعد</b>موادك تأتي من اشتراكك في منصة أفق: افتح حسابك في الموقع، ففعّل رمزك وتُربط الإضافة تلقائيًا.<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn primary" href="${esc(siteUrl('#dashboard'))}" target="_blank" rel="noopener">${ic('link', 15)} افتح حسابي في منصة أفق</a></div></section>`
        : `<section class="card empty"><b>المكتبة فارغة</b>أضف تحضير مادتك مرة واحدة، ثم عبّئه في نور بضغطة.<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn primary" href="#create">${ic('plus', 15)} إضافة تحضير</a><a class="btn" href="#transfer">${ic('upload', 15)} استيراد ملف</a></div></section>`}`;
  current.refresh = () => VIEWS.library(flag);
};
VIEWS.whatsnew = () => VIEWS.library('whatsnew');
VIEWS.welcome = () => VIEWS.library('welcome');

// ================= صفحة المادة =================
function driveHint(g, link) {
  if (!link) return 'اتركه فارغًا إن لم ترد إضافة رابط في الملاحظات.';
  if (g >= 5 && g <= 12) return 'يُضاف تلقائيًا في بند «الملاحظات» لكل حصة (للصفوف من الخامس إلى الثاني عشر).';
  return 'لا يُضاف الرابط لصفوف الحلقة الأولى (الأول–الرابع).';
}
function fullPreview(p, l) {
  const empty = '<span class="empty-v">— فارغ —</span>';
  const chips = (a, c = '') => (a || []).map((x) => `<span class="chip ${c}">${esc(x)}</span>`).join('');
  const val = (h) => (textOf(h) ? sanitize(h) : empty);
  const other = (t) => (t ? `<div class="hint">أخرى: ${esc(t)}</div>` : '');
  const rows = [
    ['المخرجات التعليمية', val(l.outcomes)],
    ['المستوى', chips(l.levels, 'gold') || empty],
    ['الاستراتيجيات', (chips(l.strategies) || empty) + other(l.strategiesOther)],
    ['المصادر التعليمية', (chips(l.resources) || empty) + other(l.resourcesOther)],
    ['المفاهيم', val(l.concepts)],
    ['التهيئة / التمهيد', val(l.intro)],
    ['إجراءات سير الدرس', val(l.procedures)],
    ['التقويم التكويني', val(l.formative)],
    ['التقويم الختامي', val(l.summative)],
    ['الملاحظات', (textOf(l.notes) || !driveApplies(p) ? val(l.notes) : '') + (driveApplies(p) ? `<div class="hint">${ic('link', 13)} يُضاف رابط الدرايف تلقائيًا</div>` : '')],
  ];
  return rows.map(([k, v]) => `<div class="fv"><b>${k}</b><div>${v}</div></div>`).join('');
}


VIEWS.pkg = (id) => {
  const p = D.packages.find((x) => x.id === id);
  if (!p) return notFound('لم أجد هذه المادة — ربما حُذفت.');
  const pr = packageProgress(p, D.state);
  const days = daysFor(D.state, D.settings, p.id).slice();
  const g = gradeNumber(p) || 11;
  V().innerHTML = `
    <div class="crumbs"><a href="#library">المكتبة</a>${ic('left', 14)}<span>${esc(p.title)}</span></div>
    <section class="card ph">
      <div>
        <input class="input title-in" id="pTitle" value="${esc(p.title || '')}" aria-label="اسم المادة">
        <div class="ph-meta">
          <label class="f">المادة<input class="input" id="pSubject" value="${esc(p.subject || '')}"></label>
          <label class="f">الصف<select class="input" id="pGrade">${GRADES.map((x, i) => `<option value="${i + 1}" ${g === i + 1 ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="f">رابط ملفات الدرس (الدرايف)<input class="input" id="pDrive" dir="ltr" value="${esc(p.driveLink || '')}" placeholder="https://drive.google.com/…"></label>
        </div>
        <div class="hint" id="pDriveHint" style="margin-top:6px">${esc(driveHint(g, p.driveLink))}</div>
        <div class="days-row"><span>أيام حصص هذه المادة:</span><div class="days" id="pDays">${dayChips(days)}</div><span class="hint">تُستخدم لاقتراح تواريخ النشر</span></div>
      </div>
      <div class="ph-side">
        <div id="pStats"></div>
        <div class="ph-acts">
          <button class="btn sm primary" id="pTerm" title="يبدأ من الصفحة الرئيسية في نور ويعبّئ ويحفظ كل حصص الفصل الذي تختاره">${ic('calendar', 15)} تحضير فصل كامل</button>
          <button class="btn sm" id="pExport">${ic('download', 15)} تصدير ملف</button>
          <button class="btn sm" id="pReset">${ic('refresh', 15)} تصفير التقدم</button>
          <button class="btn sm danger" id="pDel">${ic('trash', 15)} حذف المادة</button>
        </div>
      </div>
    </section>
    <section class="card" id="pLint" hidden></section>
    <div class="toolbar">
      <input class="input" id="pq" placeholder="ابحث في حصص هذه المادة…">
      <label class="switch"><input type="checkbox" id="hideSaved"> إخفاء المحفوظة</label>
      <button class="btn primary sm" id="addLesson" style="margin-inline-start:auto">${ic('plus', 15)} درس جديد</button>
    </div>
    <div id="groups" style="display:grid;gap:12px"></div>`;

  const writeMeta = debounce(async (v) => {
    await write(() => updatePackage(p.id, (x) => {
      x.title = v.title || x.title; x.subject = v.subject;
      x.gradeNum = v.gn; x.grade = GRADES[v.gn - 1]; x.driveLink = v.drive;
    }));
    toast('✓ حُفظت بيانات المادة');
  }, 600);
  const saveMeta = () => {
    const v = { title: $('pTitle').value.trim(), subject: $('pSubject').value.trim(), gn: +$('pGrade').value, drive: $('pDrive').value.trim() };
    $('pDriveHint').textContent = driveHint(v.gn, v.drive);
    writeMeta(v);
  };
  ['pTitle', 'pSubject', 'pDrive'].forEach((k) => { $(k).oninput = saveMeta; });
  $('pGrade').onchange = saveMeta;
  bindDays($('pDays'), days, async (d) => { await write(() => setPkgDays(p.id, d)); toast('✓ حُفظت أيام الحصص'); });

  $('pTerm').onclick = () => chrome.windows.create({ url: chrome.runtime.getURL(`semester.html?pkg=${encodeURIComponent(p.id)}`), type: 'popup', width: 560, height: 900 });
  $('pExport').onclick = () => { try { download(`حاضر - ${p.title}.json`, exportPackageFile(p)); } catch (e) { toast(String(e.message || e), 4000); } };
  $('pReset').onclick = async () => {
    if (!(await confirmBox('تصفير التقدم', `ستعود كل حصص «${p.title}» إلى «لم تُعبّأ»، ويُمسح سجل إدخالها وسجل «فصل كامل» لمقررها، فتُدخل من جديد كأنها لم تُدخل قط (مناسب بعد حذف التحاضير من نور). لا يُحذف شيء من نور ولا من المحتوى.`, 'تصفير'))) return;
    await write(() => resetProgress(p.id)); route(); toast('✓ صُفّر التقدم وسجل الإدخال — يمكنك إدخال المادة من جديد');
  };
  $('pDel').onclick = async () => {
    if (!(await confirmBox('حذف المادة', `حذف «${p.title}» بكل دروسها وحصصها من المكتبة؟ صدّرها أولًا إن أردت الاحتفاظ بنسخة.`, 'حذف'))) return;
    await write(() => deletePackage(p.id)); go('library'); toast('حُذفت المادة');
  };
  $('addLesson').onclick = () => modal({
    title: 'درس جديد',
    html: `<div style="display:grid;gap:8px"><label class="f">الوحدة<input class="input" id="nlU" list="nlUl" placeholder="مثال: الوحدة الأولى"></label>
      <datalist id="nlUl">${[...new Set(lessonGroups(p).map((x) => x.unit).filter(Boolean))].map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
      <label class="f">اسم الدرس<input class="input" id="nlL" placeholder="مثال: الدرس الثالث: الموارد المائية"></label>
      <label class="f">عنوان أول حصة<input class="input" id="nlT" value="الحصة الأولى"></label></div>`,
    ok: 'إنشاء وتعديل',
    onOk: async (m) => {
      const L = m.querySelector('#nlL').value.trim();
      if (!L) throw new Error('اكتب اسم الدرس');
      const l = blankLesson(m.querySelector('#nlU').value.trim(), L, m.querySelector('#nlT').value.trim() || 'الحصة الأولى');
      await write(() => saveLesson(p.id, l));
      go('edit', p.id, l.id);
    },
  });

  const open = new Set();
  const renderGroups = () => {
    const pkg = D.packages.find((x) => x.id === p.id);
    if (!pkg) return;
    const q = kwNorm($('pq').value);
    const hide = $('hideSaved').checked;
    const gs = lessonGroups(pkg);
    let html = '';
    gs.forEach((gr, gi) => {
      const rows = gr.sessions.filter((l) => {
        if (hide && sessionStatus(D.state, pkg.id, l.id).saved) return false;
        if (q && !kwNorm([gr.unit, gr.lesson, l.title, textOf(l.concepts), textOf(l.outcomes)].join(' ')).includes(q)) return false;
        return true;
      });
      if (!rows.length && (q || hide)) return;
      const saved = gr.sessions.filter((l) => sessionStatus(D.state, pkg.id, l.id).saved).length;
      html += `<section class="card grp"><div class="grp-h"><div class="gt">${gr.unit ? `<small>${esc(gr.unit)}</small>` : ''}<h3>${esc(gr.lesson || 'درس')}</h3></div>
        <div class="grp-p"><span>${toAr(saved)} / ${toAr(gr.sessions.length)} محفوظة</span><div class="bar"><i style="width:${gr.sessions.length ? saved / gr.sessions.length * 100 : 0}%"></i></div></div>
        <button class="btn sm" data-addto="${gi}">${ic('plus', 14)} حصة</button></div>
        ${rows.map((l) => {
          const s = sessionStatus(D.state, pkg.id, l.id);
          const cls = s.saved ? 'saved' : s.filled ? 'filled' : '';
          const idx = gr.sessions.indexOf(l);
          return `<div class="srow ${cls}" data-id="${esc(l.id)}">
            <span class="sd">${s.saved ? '✓' : s.filled ? '•' : toAr(idx + 1)}</span>
            <div class="stt"><b>${esc(l.title || 'حصة')}</b><small>${esc(statusText(s))}${isIso(l.pubDate) ? ` · <span class="fdate" title="تاريخ النشر كما في الملف">📅 ${esc(dayLabel(l.pubDate, false))}</span>` : ''}${l.week ? ` · ${esc(l.week)}` : ''}</small></div>
            <div class="sacts">
              <button class="ib" data-a="view" title="معاينة">${ic('eye', 16)}</button>
              <button class="ib" data-a="edit" title="تعديل">${ic('edit', 16)}</button>
              <button class="ib" data-a="menu" title="المزيد">${ic('more', 16)}</button>
            </div>
            <div class="spv" ${open.has(l.id) ? '' : 'hidden'}>${open.has(l.id) ? fullPreview(pkg, l) : ''}</div>
          </div>`;
        }).join('')}</section>`;
    });
    $('groups').innerHTML = html || `<section class="card empty"><b>${q || hide ? 'لا نتائج' : 'لا توجد حصص بعد'}</b>${q || hide ? '' : 'أضف درسًا جديدًا، أو الصق التحضير من «إضافة تحضير».'}</section>`;

    $('groups').querySelectorAll('[data-addto]').forEach((b) => {
      b.onclick = async () => {
        const gr = gs[+b.dataset.addto];
        const l = blankLesson(gr.unit, gr.lesson, 'الحصة ' + (ORD_F[gr.sessions.length] || toAr(gr.sessions.length + 1)));
        const last = gr.sessions[gr.sessions.length - 1];
        await write(() => updatePackage(pkg.id, (x) => { const i = x.lessons.findIndex((y) => y.id === last.id); x.lessons.splice(i + 1, 0, l); }));
        go('edit', pkg.id, l.id);
      };
    });
    $('groups').querySelectorAll('.srow').forEach((row) => {
      const lid = row.dataset.id;
      const l = pkg.lessons.find((x) => x.id === lid);
      row.querySelector('[data-a="view"]').onclick = () => { if (open.has(lid)) open.delete(lid); else open.add(lid); renderGroups(); };
      row.querySelector('[data-a="edit"]').onclick = () => go('edit', pkg.id, lid);
      row.querySelector('[data-a="menu"]').onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.menu').forEach((m) => m.remove());
        const s = sessionStatus(D.state, pkg.id, lid);
        const m = document.createElement('div');
        m.className = 'menu';
        m.innerHTML = `<button data-m="dup">${ic('copy', 15)} نسخ الحصة</button>
          <button data-m="up">${ic('up', 15)} تحريك لأعلى</button><button data-m="down">${ic('down', 15)} تحريك لأسفل</button>
          <button data-m="saved">${ic('check', 15)} ${s.saved ? 'إلغاء «محفوظة»' : 'تعليم كمحفوظة في نور'}</button>
          ${s.saved || s.filled ? `<button data-m="clear">${ic('refresh', 15)} تصفير حالة الحصة</button>` : ''}
          <button data-m="del" class="danger">${ic('trash', 15)} حذف الحصة</button>`;
        row.querySelector('.sacts').appendChild(m);
        m.onclick = async (ev) => {
          const b = ev.target.closest('button'); if (!b) return;
          m.remove();
          const a = b.dataset.m;
          if (a === 'dup') { const c = await write(() => duplicateLesson(pkg.id, lid)); toast('✓ نُسخت الحصة'); if (c) go('edit', pkg.id, c.id); return; }
          if (a === 'up' || a === 'down') await write(() => moveLesson(pkg.id, lid, a === 'up' ? -1 : 1));
          if (a === 'saved') {
            if (s.saved) await write(() => setSavedManually(pkg.id, lid, false));
            else {
              const d = await modal({ title: 'تعليم كمحفوظة', html: `<p>«${esc(l.title)}» — تاريخ النشر في نور (اختياري):</p><input class="input" type="date" id="svd" value="${esc(s.date || isoOf(new Date()))}">`, ok: 'تعليم', onOk: (mm) => mm.querySelector('#svd').value || '' });
              if (d === null) return;
              await write(() => setSavedManually(pkg.id, lid, true, d));
            }
          }
          if (a === 'clear') await write(() => clearSession(pkg.id, lid));
          if (a === 'del') {
            if (!(await confirmBox('حذف الحصة', `حذف «${l.title}» نهائيًا من المكتبة؟`, 'حذف'))) return;
            await write(() => deleteLesson(pkg.id, lid)); toast('حُذفت الحصة');
          }
          renderStats(); renderGroups();
        };
      };
    });
  };
  const renderLint = () => {
    const pkg = D.packages.find((x) => x.id === p.id);
    const box = $('pLint');
    if (!pkg || !box) return;
    const termNo = (pkg.remote && pkg.remote.term) || ((new Date().getMonth() + 1) >= 2 && (new Date().getMonth() + 1) <= 6 ? 2 : 1);
    const r = lintPackage(pkg, { days: daysFor(D.state, D.settings, pkg.id), termEnd: termEndOf(D.settings, termNo), holidays: holidaySet(D.settings), isDone: (l) => sessionStatus(D.state, pkg.id, l.id).saved });
    const lv = lintLevel(r);
    box.hidden = !r.warnings.length && !hasFileDates(pkg) && !r.budget;
    if (box.hidden) return;
    const n = r.warnings.length;
    const b = r.budget;
    box.innerHTML = `<div class="acts" style="align-items:center;gap:10px"><b style="margin-inline-end:auto">${ic(lv === 'ok' ? 'check' : 'help', 16)} فحص المادة: ${lv === 'ok' ? 'سليمة ✓' : `${toAr(n)} ${n === 1 ? 'ملاحظة' : n === 2 ? 'ملاحظتان' : n <= 10 ? 'ملاحظات' : 'ملاحظة'}`}${hasFileDates(pkg) ? ` · 📅 ${toAr(datedCount(pkg))} من ${toAr((pkg.lessons || []).length)} حصة لها تاريخ نشر في الملف` : ''}${b ? ` · <span class="${b.over ? 'fdate' : ''}">ميزانية الفصل: ${sessionsWord(b.need)} متبقية لـ${toAr(b.avail)} يومًا حتى ${esc(dayLabel(b.termEnd, false))}${b.over ? ' — ينقص ' + toAr(b.over) : ' ✓'}</span>` : ' · <a href="#settings">اضبط نهاية الفصل لحساب الميزانية</a>'}</b>${n ? `<button class="btn sm" id="pLintT">${(VIEWS.pkg.lintOpen ? 'إخفاء' : 'عرض')} التفاصيل</button>` : ''}</div>
      <div class="lintlist" ${VIEWS.pkg.lintOpen ? '' : 'hidden'}>${r.warnings.map((w) => `<div class="li ${w.level}">${esc(w.text)}</div>`).join('')}</div>`;
    const t = $('pLintT'); if (t) t.onclick = () => { VIEWS.pkg.lintOpen = !VIEWS.pkg.lintOpen; renderLint(); };
  };
  const renderStats = () => {
    const pkg = D.packages.find((x) => x.id === p.id);
    if (!pkg || !$('pStats')) return;
    renderLint();
    const r = packageProgress(pkg, D.state);
    $('pStats').innerHTML = `<div class="big-num">${toAr(r.saved)}<small> / ${toAr(r.total)} محفوظة</small></div>
      <div class="bar" style="margin-top:6px"><i style="width:${r.total ? r.saved / r.total * 100 : 0}%"></i><i class="f" style="width:${r.total ? r.filled / r.total * 100 : 0}%"></i></div>
      <div class="hint" style="margin-top:4px">${r.filled ? `• ${toAr(r.filled)} عُبّئت ولم يُسجَّل حفظها` : ''}</div>`;
  };
  $('pq').oninput = debounce(renderGroups, 200);
  $('hideSaved').onchange = renderGroups;
  renderStats(); renderGroups();
  current.refresh = () => { if (!D.packages.find((x) => x.id === p.id)) { route(); return; } renderStats(); renderGroups(); };
};

// ================= محرر الحصة =================
function rich(id, html, ph) {
  return `<div class="rich-wrap"><div class="rich-tb">
      <button type="button" data-cmd="bold" title="عريض"><b>B</b></button>
      <button type="button" data-cmd="insertUnorderedList" title="قائمة نقطية">•</button>
      <button type="button" data-cmd="insertOrderedList" title="قائمة مرقّمة">١.</button>
      <button type="button" data-cmd="removeFormat" title="إزالة التنسيق">⌀</button>
    </div><div class="rich" contenteditable="true" id="${id}" data-ph="${esc(ph || 'اكتب هنا…')}">${sanitize(html)}</div></div>`;
}
function bindRich(scope, onChange) {
  scope.querySelectorAll('.rich-tb button').forEach((b) => {
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => { const ed = b.closest('.rich-wrap').querySelector('.rich'); ed.focus(); document.execCommand(b.dataset.cmd, false, null); onChange(); };
  });
  scope.querySelectorAll('.rich').forEach((ed) => {
    ed.addEventListener('input', onChange);
    ed.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (t == null) return;
      e.preventDefault();
      const lines = t.replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean);
      document.execCommand('insertHTML', false, lines.length > 1 ? lines.map((x) => `<p>${esc(x)}</p>`).join('') : esc(t.trim()));
      onChange();
    });
  });
}
const richVal = (id) => { const el = $(id); if (!el) return ''; const h = sanitize(el.innerHTML).trim(); return textOf(h) ? h : ''; };
const fieldRow = (n, name, hint, body) => `<div class="fld"><div class="fh"><span class="n">${toAr(n)}</span><b>${name}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div>${body}</div>`;
const normLevel = (v) => NOOR_LEVELS.find((x) => kwNorm(x) === kwNorm(v)) || v;

VIEWS.edit = (pkgId, lessonId) => {
  const p = D.packages.find((x) => x.id === pkgId);
  const l0 = p && (p.lessons || []).find((x) => x.id === lessonId);
  if (!l0) return notFound('لم أجد هذه الحصة — ربما حُذفت.');
  const l = JSON.parse(JSON.stringify(l0));
  l.levels = (l.levels || []).map(normLevel);
  const gs = lessonGroups(p);
  const units = [...new Set(gs.map((x) => x.unit).filter(Boolean))];
  const lessons = [...new Set(gs.map((x) => x.lesson).filter(Boolean))];
  const strat = [...NOOR_STRATEGIES, ...(l.strategies || []).filter((x) => !NOOR_STRATEGIES.includes(x))];
  const res = [...NOOR_RESOURCES, ...(l.resources || []).filter((x) => !NOOR_RESOURCES.includes(x))];
  const picks = (id, list, on, cls = '') => `<div class="picks" id="${id}">${list.map((v) => `<button type="button" class="pick ${cls} ${on.includes(v) ? 'on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
  V().innerHTML = `
    <div class="crumbs"><a href="#library">المكتبة</a>${ic('left', 14)}<a href="#pkg/${enc(p.id)}">${esc(p.title)}</a>${ic('left', 14)}<span>تعديل الحصة</span></div>
    <section class="card">
      <div class="grid3">
        <label class="f">الوحدة<input class="input" id="eUnit" list="dlU" value="${esc(l.unit || '')}"></label>
        <label class="f">الدرس<input class="input" id="eLesson" list="dlL" value="${esc(l.lesson || '')}"></label>
        <label class="f">عنوان الحصة<input class="input" id="eTitle" value="${esc(l.title || '')}"></label>
      </div>
      <datalist id="dlU">${units.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
      <datalist id="dlL">${lessons.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
      <div class="hint" style="margin-top:6px">يتعرّف «حاضر» على الدرس المفتوح في نور من اسمه ورقمه — اكتب اسم الدرس كما في الكتاب (مثل «الدرس الثاني: …» أو «Lesson 2»).</div>
      <div class="grid3" style="margin-top:10px">
        <label class="f">تاريخ النشر (اختياري)<input class="input" type="date" id="eDate" value="${esc(isIso(l.pubDate) ? l.pubDate : '')}"></label>
        <label class="f">الأسبوع (اختياري)<input class="input" id="eWeek" value="${esc(l.week || '')}" placeholder="مثال: الأسبوع 3"></label>
        <div class="f"><span class="hint" style="margin-top:22px">يُستعمل التاريخ كما هو عند التعبئة (في «فصل كامل» و«عدة حصص»)؛ وإن تركته فارغًا يتبع الحصة التي قبله.</span></div>
      </div>
    </section>
    <section class="card">
      ${fieldRow(1, 'المخرجات التعليمية', 'في نور تُحدَّد مربعات المخرجات كلها تلقائيًا؛ هذا النص للمرجع ويُكتب فقط إن لم توجد مربعات.', rich('e_outcomes', l.outcomes, 'مخرج في كل سطر…'))}
      <div class="fld"><div class="fh"><span class="n">٢</span><b>المستوى</b><small>ثلاثة مستويات كما في نور</small><span class="cnt" id="lvCnt"></span></div>${picks('eLevels', NOOR_LEVELS, l.levels || [], 'lv')}</div>
      <div class="fld"><div class="fh"><span class="n">٣</span><b>الاستراتيجيات</b><small>من قائمة نور</small><span class="cnt" id="stCnt"></span></div>${picks('eStrat', strat, l.strategies || [])}
        <input class="input" id="eStratOther" value="${esc(l.strategiesOther || '')}" placeholder="استراتيجيات أخرى — تُكتب في خانة «أخرى» في نور (اختياري)"></div>
      <div class="fld"><div class="fh"><span class="n">٤</span><b>المصادر التعليمية</b><small>من قائمة نور</small><span class="cnt" id="rsCnt"></span></div>${picks('eRes', res, l.resources || [])}
        <input class="input" id="eResOther" value="${esc(l.resourcesOther || '')}" placeholder="مصادر أخرى — تُكتب في خانة «أخرى» في نور (اختياري)"></div>
      ${fieldRow(5, 'المفاهيم', '', rich('e_concepts', l.concepts))}
      ${fieldRow(6, 'التهيئة / التمهيد / التعلم القبلي', '', rich('e_intro', l.intro))}
      ${fieldRow(7, 'إجراءات سير الدرس / الأنشطة التدريسية', '', rich('e_procedures', l.procedures))}
      ${fieldRow(8, 'التقويم التكويني', '', rich('e_formative', l.formative))}
      ${fieldRow(9, 'التقويم الختامي', '', rich('e_summative', l.summative))}
      ${fieldRow(10, 'ملاحظات ضمن خطة الدراسة الأسبوعية', driveApplies(p) ? 'يشاهدها الطالب وولي الأمر — ويُضاف رابط الدرايف تلقائيًا في آخرها.' : 'يشاهدها الطالب وولي الأمر.', rich('e_notes', l.notes))}
    </section>
    <div class="savebar">
      <button class="btn primary" id="eSave">${ic('save', 16)} حفظ الحصة</button>
      <a class="btn" href="#pkg/${enc(p.id)}">رجوع</a>
      <span class="dirty" id="dirtyMark" hidden>● تغييرات غير محفوظة</span>
      <span class="hint">اختصار الحفظ: <kbd>Ctrl</kbd>+<kbd>S</kbd></span>
      <button class="btn danger sp" id="eDel">${ic('trash', 15)} حذف الحصة</button>
    </div>`;

  const mark = () => setDirty(true);
  const picked = (id) => Array.from($(id).querySelectorAll('.pick.on')).map((b) => b.dataset.v);
  const counts = () => {
    const n = picked('eLevels').length;
    $('lvCnt').textContent = toAr(n) + ' / ٣'; $('lvCnt').className = 'cnt' + (n === 3 ? ' full' : '');
    $('stCnt').textContent = toAr(picked('eStrat').length) + ' مختارة';
    $('rsCnt').textContent = toAr(picked('eRes').length) + ' مختارة';
  };
  ['eLevels', 'eStrat', 'eRes'].forEach((id) => {
    $(id).querySelectorAll('.pick').forEach((b) => {
      b.onclick = () => {
        if (id === 'eLevels' && !b.classList.contains('on') && picked('eLevels').length >= 3) { toast('ثلاثة مستويات فقط — ألغِ أحدها أولًا'); return; }
        b.classList.toggle('on'); counts(); mark();
      };
    });
  });
  counts();
  ['eUnit', 'eLesson', 'eTitle', 'eStratOther', 'eResOther', 'eDate', 'eWeek'].forEach((k) => { $(k).oninput = mark; $(k).onchange = mark; });
  bindRich(V(), mark);

  const save = async () => {
    const out = Object.assign({}, l, {
      unit: $('eUnit').value.trim(), lesson: $('eLesson').value.trim() || 'الدرس', title: $('eTitle').value.trim() || 'الحصة',
      outcomes: richVal('e_outcomes'), levels: picked('eLevels'),
      strategies: picked('eStrat'), strategiesOther: $('eStratOther').value.trim(),
      resources: picked('eRes'), resourcesOther: $('eResOther').value.trim(),
      concepts: richVal('e_concepts'), intro: richVal('e_intro'), procedures: richVal('e_procedures'),
      formative: richVal('e_formative'), summative: richVal('e_summative'), notes: richVal('e_notes'),
    });
    if ($('eDate').value) out.pubDate = $('eDate').value; else delete out.pubDate;
    if ($('eWeek').value.trim()) out.week = $('eWeek').value.trim(); else delete out.week;
    normalizeLesson(out);
    await write(() => saveLesson(p.id, out));
    setDirty(false);
    toast('✓ حُفظت الحصة');
    go('pkg', p.id);
  };
  $('eSave').onclick = save;
  $('eDel').onclick = async () => {
    if (!(await confirmBox('حذف الحصة', `حذف «${l.title}» نهائيًا؟`, 'حذف'))) return;
    await write(() => deleteLesson(p.id, l.id)); setDirty(false); go('pkg', p.id); toast('حُذفت الحصة');
  };
  current.keydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
};
document.addEventListener('keydown', (e) => { if (current.keydown) current.keydown(e); });

// ================= إضافة تحضير =================
const C = { sessions: [] };
const PV_FIELDS = [['outcomes', 'المخرجات'], ['levels', 'المستوى'], ['strategies', 'الاستراتيجيات'], ['resources', 'المصادر'], ['concepts', 'المفاهيم'], ['intro', 'التهيئة'], ['procedures', 'سير الدرس'], ['formative', 'التكويني'], ['summative', 'الختامي'], ['notes', 'الملاحظات']];
const FORMAT_HELP = `# الوحدة الأولى
## الدرس الأول: عنوان الدرس
## الحصة الأولى: عنوان الحصة
### تاريخ النشر
12/10/2026
### المخرجات
١. أن يحدد الطالب … — المستوى: تطبيق
### الاستراتيجيات
التعلم التعاوني، العصف الذهني، الحوار والمناقشة
### المصادر
الكتاب، جهاز عرض البيانات، صور
### المفاهيم
### التهيئة
### إجراءات سير الدرس
### التقويم التكويني
### التقويم الختامي
### الواجب
### ملاحظات`;

VIEWS.create = () => {
  const subjects = [...new Set(D.packages.map((p) => p.subject).filter(Boolean))];
  V().innerHTML = `
    <div class="page-h"><div><h2>إضافة تحضير</h2><p class="sub">الصق نص التحضير أو ارفع ملف Word أو HTML، فيقسّمه «حاضر» إلى دروس وحصص ويطابق الاستراتيجيات والمصادر مع قوائم نور.</p></div></div>
    <section class="card"><h3><span class="n">١</span> المادة والصف</h3>
      ${D.packages.length ? `<label class="f" style="margin-bottom:10px">أضف إلى<select class="input" id="cTo"><option value="">مادة جديدة (أو اكتب اسم مادة موجودة وصفها)</option>${D.packages.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label>` : ''}
      <div class="grid3">
        <label class="f">المادة<input class="input" id="cSubject" list="dlS" placeholder="مثال: هذا وطني"></label>
        <label class="f">الصف<select class="input" id="cGrade">${GRADES.map((g, i) => `<option value="${i + 1}" ${i === 10 ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="f">رابط ملفات الدرس (الدرايف)<input class="input" id="cDrive" dir="ltr" value="${esc(D.settings.driveLink || '')}"></label>
      </div>
      <datalist id="dlS">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <div class="hint" id="cTarget" style="margin-top:8px"></div>
    </section>
    <section class="card"><h3><span class="n">٢</span> نص التحضير</h3>
      <div class="src-tabs">
        <button class="seg on" data-src="paste">${ic('file', 15)} لصق النص</button>
        <button class="seg" data-src="file">${ic('upload', 15)} رفع ملف (Word أو HTML أو نص)</button>
        <button class="lnk" id="cSample" style="margin-inline-start:auto">أدرج مثالًا للصيغة</button>
      </div>
      <div class="drop" id="cDrop" hidden>${ic('upload', 28)}<b>اسحب ملف التحضير هنا</b><span>أو</span><button class="btn" id="cPick">اختر ملفًا…</button><small>Word ‏(.docx) · صفحة ويب ‏(.html / .htm / .mht) · نص (.txt / .md)</small></div>
      <div class="merge-opt" id="cMode" hidden><b>طريقة إضافة حصص هذا الملف:</b>
        <label><input type="radio" name="cMerge" value="m" checked> <span><b>مدمج</b> — نموذج واحد لكل درس، وكل بند يجمع حصصه تحت «الحصة 1، الحصة 2…»</span></label>
        <label><input type="radio" name="cMerge" value="s"> <span><b>منفصل</b> — نموذج لكل حصة</span></label></div>
      <textarea class="input plan" id="cText" placeholder="الصق هنا تحضير الوحدة أو الدرس…"></textarea>
      <details class="fmt"><summary>كيف أكتب التحضير ليُقرأ صحيحًا؟</summary>
        <p class="hint">كل عنوان في سطر مستقل (علامات # اختيارية). الوحدة ثم الدرس ثم الحصة، وتحت كل حصة أسماء البنود. في ملفات Word وHTML تُقرأ العناوين والجداول (عمود للبند وعمود للمحتوى)، وملفات التحضير التفاعلية (المدمج والمنفصل) تُقرأ من بياناتها مباشرة. التحضير المدمج (البند ثم أجزاء الحصص) يُقسَّم على الحصص تلقائيًا. ما لا يوجد في قوائم نور من الاستراتيجيات والمصادر يُكتب في «أخرى».</p>
        <p class="hint"><b>تاريخ النشر</b> يُكتب بأي صيغة: بندًا «### تاريخ النشر» تحته التاريخ، أو في عنوان الحصة «## الحصة الأولى (12/10/2026)» أو «— تاريخ النشر: 12/10/2026»، أو في عنوان الدرس أو الوحدة (فيأخذه أول حصة بعده وتتبعه البقية)، أو عنوان أسبوع «# الأسبوع 3: 12/10/2026». الصيغ المقبولة: 12/10/2026 · 2026-10-12 · ١٢/١٠/٢٠٢٦ · 12 أكتوبر 2026 · الأحد 12/10 (السنة تُستنتج) · 20/4/1448هـ (يُحوَّل ميلاديًا). ما بلا تاريخ يتبع ما قبله على أيام الحصص.</p>
        <pre>${esc(FORMAT_HELP)}</pre></details>
    </section>
    <section class="card"><h3><span class="n">٣</span> المعاينة</h3><div id="cPrev"><div class="empty">اكتب أو الصق النص لتظهر المعاينة هنا.</div></div></section>
    <div class="savebar"><button class="btn primary" id="cSave" disabled>${ic('plus', 16)} أضف إلى المكتبة</button><span class="hint" id="cSaveHint"></span>
      <button class="btn sp" id="cBlank">أو أنشئ حصة فارغة وعبّئها يدويًا</button></div>`;

  const target = () => {
    const subject = $('cSubject').value.trim();
    const gn = +$('cGrade').value;
    const chosen = $('cTo') && $('cTo').value ? D.packages.find((p) => p.id === $('cTo').value) : null;
    const existing = chosen || findSubjectPackage(D.packages, subject, gn);
    return { subject: chosen ? (chosen.subject || chosen.title) : subject, gn: chosen ? (gradeNumber(chosen) || gn) : gn, existing };
  };
  const renderTarget = () => {
    const t = target();
    // مادة موجودة: رابطها يبقى كما هو (يُعدَّل من صفحتها)
    const drive = $('cDrive');
    if (t.existing) { if (!drive.disabled) drive.dataset.typed = drive.value; drive.value = t.existing.driveLink || ''; drive.disabled = true; drive.title = 'رابط المادة الموجودة — يُعدَّل من صفحتها في المكتبة'; }
    else if (drive.disabled) { drive.disabled = false; drive.value = drive.dataset.typed != null ? drive.dataset.typed : (D.settings.driveLink || ''); drive.title = ''; }
    const link = drive.value.trim();
    $('cTarget').innerHTML = !t.subject ? 'اكتب اسم المادة.'
      : (t.existing ? `ستُضاف الحصص إلى المادة الموجودة <b>«${esc(t.existing.title)}»</b> (${sessionsWord((t.existing.lessons || []).length)})؛ الحصة التي لها نفس الدرس والعنوان تُستبدل.`
        : `ستُنشأ مادة جديدة: <b>«${esc(t.subject)} — ${GRADES[t.gn - 1]}»</b>.`) + ` ${esc(driveHint(t.gn, link))}`;
  };
  const renderPreview = () => {
    const text = $('cText').value;
    const sessions = text.trim() ? parsePlanBest(text) : [];
    C.sessions = sessions;
    const t = target();
    renderTarget();
    if (!sessions.length) {
      $('cPrev').innerHTML = `<div class="empty">${text.trim() ? '<b>لم أجد حصصًا</b>تأكد أن أسماء البنود (المخرجات، الاستراتيجيات…) كلٌّ في سطر مستقل.' : 'اكتب أو الصق النص لتظهر المعاينة هنا.'}</div>`;
    } else {
      const replaced = t.existing ? sessions.filter((s) => (t.existing.lessons || []).some((x) => (x.unit || '') === (s.unit || '') && x.lesson === s.lesson && x.title === s.title)).length : 0;
      const groups = [];
      sessions.forEach((s) => { const k = groupKey(s); let g = groups.find((x) => x.k === k); if (!g) { g = { k, unit: s.unit, lesson: s.lesson, list: [] }; groups.push(g); } g.list.push(s); });
      const dated = sessions.filter((s) => isIso(s.pubDate)).length;
      const lint = lintPackage({ id: 'preview', subject: t.subject || 'x', gradeNum: t.gn || 1, lessons: sessions }, { days: t.existing ? daysFor(D.state, D.settings, t.existing.id) : D.settings.schoolDays });
      const lw = lint.warnings.filter((w) => !['no-subject', 'no-grade'].includes(w.code));
      $('cPrev').innerHTML = `<div class="pv-sum">وُجدت ${sessionsWord(sessions.length)} في ${groups.length === 2 ? 'درسين' : lessonsWord(groups.length)}${replaced ? ` — ${toAr(replaced)} منها ستستبدل حصصًا موجودة` : ''}${dated ? ` · 📅 ${toAr(dated)} ${dated === 1 ? 'حصة لها تاريخ نشر' : 'حصص لها تاريخ نشر'} في الملف` : ''}</div>`
        + (lw.length ? `<div class="lintlist pv-lint">${lw.map((w) => `<div class="li ${w.level}">${esc(w.text)}</div>`).join('')}</div>` : '')
        + groups.map((g) => `<div class="pv-g"><div class="pv-gh">${g.unit ? `<small>${esc(g.unit)}</small>` : ''}${esc(g.lesson)}</div>`
          + g.list.map((s) => `<div class="pv-s"><b>${esc(s.title)}</b>${isIso(s.pubDate) ? ` <span class="chip gold" title="تاريخ النشر من الملف">📅 ${esc(dayLabel(s.pubDate))}</span>` : ''}${s.week ? ` <span class="chip muted">${esc(s.week)}</span>` : ''}
            <div class="pv-f">${PV_FIELDS.map(([k, n]) => { const has = Array.isArray(s[k]) ? s[k].length : textOf(s[k]); return `<span class="chip ${has ? 'ok' : 'muted'}">${has ? '✓' : '—'} ${n}</span>`; }).join('')}</div>
            <div class="pv-note">المستوى: ${esc((s.levels || []).join('، '))} · الاستراتيجيات: ${esc((s.strategies || []).join('، '))}${s.strategiesOther ? ' + أخرى: ' + esc(s.strategiesOther) : ''}</div>
            <div class="pv-note">المصادر: ${esc((s.resources || []).join('، '))}${s.resourcesOther ? ' + أخرى: ' + esc(s.resourcesOther) : ''}</div></div>`).join('') + '</div>').join('');
    }
    $('cSave').disabled = !sessions.length || !t.subject;
    $('cSaveHint').textContent = !t.subject && sessions.length ? 'اكتب اسم المادة أولًا' : sessions.length ? `(${sessionsWord(sessions.length)})` : '';
  };
  const rp = debounce(renderPreview, 250);
  if ($('cTo')) {
    $('cTo').onchange = () => {
      const p = D.packages.find((x) => x.id === $('cTo').value);
      $('cSubject').disabled = !!p; $('cGrade').disabled = !!p;
      if (p) { $('cSubject').value = p.subject || p.title; $('cGrade').value = String(gradeNumber(p) || 11); }
      renderPreview();
    };
  }
  $('cText').oninput = rp;
  $('cSubject').oninput = rp; $('cGrade').onchange = rp; $('cDrive').oninput = rp;
  $('cSample').onclick = () => { $('cText').value = SAMPLE_PLAN; showSrc('paste'); renderPreview(); };
  const showSrc = (s) => {
    document.querySelectorAll('.src-tabs .seg').forEach((b) => b.classList.toggle('on', b.dataset.src === s));
    $('cDrop').hidden = s !== 'file';
  };
  document.querySelectorAll('.src-tabs .seg').forEach((b) => { b.onclick = () => showSrc(b.dataset.src); });
  const mergeChoice = () => { const x = document.querySelector('input[name=cMerge]:checked'); return !x || x.value === 'm'; };
  // ملف فيه حصص كثيرة لكل درس: مدمج أو منفصل (يُعاد بناء النص من الملف نفسه)
  document.querySelectorAll('input[name=cMerge]').forEach((r) => {
    r.onchange = () => {
      if (!C.html) return;
      const h = planFromHtml(C.html.src, C.html.name, { merged: mergeChoice() });
      $('cText').value = h.text;
      renderPreview();
      toast(mergeChoice() ? 'مدمج: نموذج واحد لكل درس' : 'منفصل: نموذج لكل حصة');
    };
  });
  const readFile = async (f) => {
    C.html = null; $('cMode').hidden = true;
    try {
      let text, meta = null, html = null;
      if (/\.docx$/i.test(f.name)) text = await docxToText(await f.arrayBuffer());
      else if (/\.doc$/i.test(f.name)) throw new Error('صيغة Word القديمة (.doc) غير مدعومة — احفظ الملف في Word بصيغة ‎.docx (أو «صفحة ويب») ثم ارفعه.');
      else if (/\.pdf$/i.test(f.name)) throw new Error('ملفات PDF غير مدعومة — انسخ النص منها والصقه هنا.');
      else if (isHtmlFile(f)) {
        C.html = { src: await readHtmlText(f), name: f.name };
        html = planFromHtml(C.html.src, f.name, { merged: mergeChoice() });
        text = html.text; meta = html.meta;
        $('cMode').hidden = !html.canMerge;
      }
      else text = await f.text();
      $('cText').value = text;
      // المادة والصف: من الملف إن لم تخترهما (لا يتغيران إن اخترت مادة موجودة)
      const chosen = $('cTo') && $('cTo').value;
      if (!chosen && !$('cSubject').value.trim()) {
        const guess = (meta && meta.subject) || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/تحضير|خطة|الصف|\d+/g, '').trim();
        if (guess && guess.length <= 30) $('cSubject').value = guess;
        if (meta && meta.gradeNum) $('cGrade').value = String(meta.gradeNum);
      }
      showSrc('paste');
      renderPreview();
      if (html && !C.sessions.length) toast(`قرأت «${f.name}» لكن لم أجد فيه حصصًا — تأكد أن أسماء البنود (المخرجات، الاستراتيجيات…) ظاهرة في الملف`, 6000);
      else toast(`✓ قُرئ الملف «${f.name}»${html ? ` — ${sessionsWord(C.sessions.length)}` : ''} — راجع المعاينة`);
    } catch (e) { toast(e.message || 'تعذّرت قراءة الملف', 5000); }
  };
  $('cPick').onclick = async () => { const f = await pickFile('.docx,.html,.htm,.xhtml,.mht,.mhtml,.txt,.md,.markdown,.text'); if (f) readFile(f); };
  bindDrop($('cDrop'), readFile);
  bindDrop($('cText'), readFile);
  $('cSave').onclick = async () => {
    const t = target();
    if (!t.subject || !C.sessions.length) return;
    const r = await write(() => mergeSessions({ pkgId: t.existing && t.existing.id, subject: t.subject, gradeNum: t.gn, driveLink: $('cDrive').value.trim(), sessions: C.sessions }));
    toast(`✓ أُضيفت ${sessionsWord(r.added)}${r.replaced ? ` واستُبدلت ${toAr(r.replaced)}` : ''} إلى «${r.pkg.title}»`, 4000);
    go('pkg', r.pkg.id);
  };
  $('cBlank').onclick = async () => {
    const t = target();
    if (!t.subject) { $('cSubject').focus(); toast('اكتب اسم المادة أولًا'); return; }
    const l = blankLesson('', 'الدرس الأول', 'الحصة الأولى');
    const r = await write(() => mergeSessions({ pkgId: t.existing && t.existing.id, subject: t.subject, gradeNum: t.gn, driveLink: $('cDrive').value.trim(), sessions: [l] }));
    const saved = r.pkg.lessons.find((x) => (x.unit || '') === (l.unit || '') && x.lesson === l.lesson && x.title === l.title) || l;
    go('edit', r.pkg.id, saved.id);
  };
  renderTarget();
  // ملف وصل من «استيراد وتصدير»
  if (C.pendingFile) { const p = C.pendingFile; C.pendingFile = null; if (Date.now() - p.at < 15000) { showSrc('file'); readFile(p.file); } }
};

// ================= الاستيراد والتصدير =================
function normalizePkg(pkg) {
  if (!pkg || !Array.isArray(pkg.lessons)) throw new Error('ملف المادة لا يحتوي على حصص');
  const out = JSON.parse(JSON.stringify(pkg));
  out.id = String(out.id || newId('p'));
  out.title = out.title || [out.subject, out.grade].filter(Boolean).join(' — ') || 'مادة مستوردة';
  const seen = new Set();
  out.lessons = out.lessons.filter((l) => l && typeof l === 'object').map((l) => {
    const x = Object.assign(blankLesson(l.unit, l.lesson, l.title), l);
    x.id = x.id == null ? '' : String(x.id);
    if (!x.id || seen.has(x.id)) x.id = newId();
    ['unit', 'lesson', 'title', 'strategiesOther', 'resourcesOther'].forEach((k) => { if (x[k] != null && typeof x[k] !== 'string') x[k] = String(x[k]); });
    seen.add(x.id);
    ['levels', 'strategies', 'resources'].forEach((k) => { if (!Array.isArray(x[k])) x[k] = String(x[k] || '').split(/[،,]/).map((s) => s.trim()).filter(Boolean); });
    return x;
  });
  delete out.builtin; delete out.installed;
  return out;
}
async function installWithConfirm(pkg) {
  const p = normalizePkg(pkg);
  const ex = D.packages.find((x) => x.id === p.id);
  if (ex && !(await confirmBox('المادة موجودة', `«${ex.title}» موجودة في مكتبتك. استبدالها بالنسخة المستوردة؟ (تبقى حالة «محفوظة/عُبّئت» كما هي)`, 'استبدال', false))) return null;
  await write(() => installPackage(p));
  return p;
}
async function importAny(file) {
  // ملف تحضير (Word / HTML / نص): يُفتح في «إضافة تحضير» ويُقرأ مباشرة
  if (/\.(docx?|txt|md|markdown|html?|xhtml|mht|mhtml)$/i.test(file.name) || isHtmlFile(file)) { C.pendingFile = { file, at: Date.now() }; go('create'); return; }
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { throw new Error('الملف غير صالح — اختر ملفًا صدّرته من «حاضر» (.hadir أو .json)'); }
  if (isBackupFile(data)) {
    if (!(await confirmBox('استعادة نسخة احتياطية', `سيستبدل هذا كل موادك وتقدمك وإعداداتك الحالية بما في النسخة (${esc(String(data.when || '').slice(0, 10))}). متابعة؟`, 'استعادة'))) return;
    await write(() => restoreBackup(data));
    toast('✓ استُعيدت النسخة الاحتياطية'); go('library'); return;
  }
  if (isPackageFile(data)) {
    const pkg = await modal({
      title: 'ملف قديم محمي بكلمة سر',
      html: `<p>«${esc((data.meta && data.meta.title) || 'مادة')}» — اكتب كلمة السر التي وصلتك مع الملف.</p><input class="input" type="password" id="ipw" placeholder="كلمة السر">`,
      ok: 'فتح واستيراد',
      onOk: async (m) => {
        try { return await decryptPackage(data, m.querySelector('#ipw').value); } catch (e) { throw new Error('كلمة السر غير صحيحة'); }
      },
    });
    if (!pkg) return;
    const p = await installWithConfirm(pkg);
    if (p) { toast(`✓ أُضيفت «${p.title}»`); go('pkg', p.id); }
    return;
  }
  if (isPlainPackage(data)) {
    const p = await installWithConfirm(data.package || data);
    if (p) { toast(`✓ أُضيفت «${p.title}»`); go('pkg', p.id); }
    return;
  }
  const list = Array.isArray(data) ? data : data && data.templates;
  if (Array.isArray(list) && list.some((t) => t && Array.isArray(t.fields))) {
    const { templates } = await getAll();
    let n = 0;
    list.forEach((t) => {
      if (!t || !Array.isArray(t.fields)) return;
      const c = Object.assign({}, t, { id: templates.find((x) => x.id === t.id) ? uid() : (t.id || uid()), name: t.name || 'قالب مستورد', updated: Date.now() });
      templates.unshift(c); n++;
    });
    await write(() => saveTemplates(templates));
    toast(`✓ استُورد ${templatesWord(n)}`); go('templates'); return;
  }
  throw new Error('لم أتعرّف على هذا الملف — اختر ملف مادة أو نسخة احتياطية من «حاضر»');
}

VIEWS.transfer = () => {
  V().innerHTML = `
    <div class="page-h"><div><h2>استيراد وتصدير</h2><p class="sub">انقل تحاضيرك بين الأجهزة أو شاركها مع زملائك.</p></div></div>
    <section class="card"><h3>${ic('upload')} استيراد ملف</h3>
      <div class="drop" id="iDrop">${ic('upload', 28)}<b>اسحب الملف هنا</b><span>أو</span><button class="btn primary" id="iPick">اختر ملفًا…</button><small>ملف مادة (‎.hadir أو ‎.json) · نسخة احتياطية · قوالب ملتقطة · تحضير Word أو HTML</small></div>
      <div class="msg" id="iMsg" style="margin-top:10px"></div>
    </section>
    <section class="card"><h3>${ic('download')} تصدير مادة</h3>
      <p class="hint" style="margin-top:0">ملف المادة يستورده أي مستخدم لـ«حاضر» مباشرة، دون كلمة سر.</p>
      ${D.packages.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>المادة</th><th>الحصص</th><th></th></tr></thead><tbody>
        ${D.packages.map((p) => `<tr><td><b>${esc(p.title)}</b></td><td>${sessionsWord((p.lessons || []).length)}</td><td style="white-space:nowrap"><button class="btn sm" data-exp="${esc(p.id)}">${ic('download', 14)} تصدير</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">لا توجد مواد للتصدير.</div>'}
    </section>
    <section class="card"><h3>${ic('save')} النسخة الاحتياطية الكاملة</h3>
      <p class="hint" style="margin-top:0">كل موادك وتقدمك وسجلك وإعداداتك في ملف واحد — احفظه قبل تغيير الجهاز أو إعادة تثبيت الإضافة.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="bDown">${ic('download', 15)} تنزيل نسخة احتياطية</button><button class="btn" id="bRestore">${ic('upload', 15)} استعادة من نسخة…</button></div>
    </section>`;
  const handle = async (f) => {
    const m = $('iMsg'); m.className = 'msg';
    try { await importAny(f); } catch (e) { m.className = 'msg show bad'; m.textContent = e.message || String(e); }
  };
  $('iPick').onclick = async () => { const f = await pickFile('.hadir,.json,application/json,.docx,.html,.htm,.xhtml,.mht,.mhtml,.txt,.md'); if (f) handle(f); };
  bindDrop($('iDrop'), handle);
  V().querySelectorAll('[data-exp]').forEach((b) => { b.onclick = () => { const p = D.packages.find((x) => x.id === b.dataset.exp); try { download(`حاضر - ${p.title}.json`, exportPackageFile(p)); } catch (e) { toast(String(e.message || e), 4000); } }; });
  $('bDown').onclick = async () => download(`حاضر - نسخة احتياطية ${isoOf(new Date())}.json`, await makeBackup());
  $('bRestore').onclick = async () => { const f = await pickFile('.json,application/json'); if (f) handle(f); };
};

// ================= جدول النشر =================
function weekStart(iso) { const d = parseIso(iso); d.setDate(d.getDate() - d.getDay()); return isoOf(d); }
VIEWS.schedule = () => {
  const filter = VIEWS.schedule.filter || '';
  const items = [];
  for (const p of D.packages) {
    if (filter && p.id !== filter) continue;
    for (const l of p.lessons || []) {
      const s = sessionStatus(D.state, p.id, l.id);
      const d = s.savedDate || s.date;
      if (d) items.push({ d, p, l, s });
    }
  }
  items.sort((a, b) => a.d.localeCompare(b.d));
  const weeks = new Map();
  items.forEach((it) => { const w = weekStart(it.d); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(it); });
  const today = isoOf(new Date());
  const thisWeek = weekStart(today);
  let html = '';
  for (const [w, list] of weeks) {
    const end = parseIso(w); end.setDate(end.getDate() + 6);
    const byDay = new Map();
    list.forEach((it) => { if (!byDay.has(it.d)) byDay.set(it.d, []); byDay.get(it.d).push(it); });
    html += `<section class="card wk" ${w === thisWeek ? 'id="thisWeek"' : ''}><div class="wk-h">الأسبوع ${esc(dayLabel(w))} — ${esc(dayLabel(isoOf(end)))}${w === thisWeek ? '<span class="chip">هذا الأسبوع</span>' : w > thisWeek ? '<span class="chip gold">قادم</span>' : ''}</div>
      ${[...byDay.entries()].map(([d, arr]) => `<div class="wk-d ${d === today ? 'today' : ''}"><b>${esc(dayLabel(d))}${d === today ? ' (اليوم)' : ''}</b><div class="wk-items">
        ${arr.map((it) => `<div class="wk-it"><span class="chip ${it.s.saved ? 'ok' : 'gold'}">${it.s.saved ? '✓ محفوظة' : '• عُبّئت'}</span><a href="#pkg/${enc(it.p.id)}">${esc(it.l.title)}</a><small>${esc(it.l.lesson)} · ${esc(it.p.title)}</small></div>`).join('')}
      </div></div>`).join('')}</section>`;
  }
  V().innerHTML = `
    <div class="page-h"><div><h2>جدول النشر</h2><p class="sub">الحصص التي عبّأتها أو حفظتها مرتبة بتواريخ نشرها — لترى أسبوعك بنظرة.</p></div>
      <div class="acts"><select class="input" id="sFilter" style="width:auto"><option value="">كل المواد</option>${D.packages.map((p) => `<option value="${esc(p.id)}" ${p.id === filter ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div></div>
    ${html || '<section class="card empty"><b>لا توجد حصص بتواريخ بعد</b>بعد تعبئة الحصص في نور بتاريخ نشر تظهر هنا مرتبة بالأسابيع.</section>'}`;
  $('sFilter').onchange = () => { VIEWS.schedule.filter = $('sFilter').value; VIEWS.schedule(); };
  const tw = $('thisWeek'); if (tw) tw.scrollIntoView({ block: 'start' });
  current.refresh = () => VIEWS.schedule();
};

// ================= السجل =================
VIEWS.log = async () => {
  const log = await getLog();
  const f = VIEWS.log.f || { pkg: '', action: '' };
  const pkgs = [...new Set(log.map((e) => e.pkg).filter(Boolean))];
  const rows = log.filter((e) => (!f.pkg || e.pkg === f.pkg) && (!f.action || e.action === f.action));
  const when = (t) => new Date(t).toLocaleString('ar-OM', { dateStyle: 'medium', timeStyle: 'short' });
  V().innerHTML = `
    <div class="page-h"><div><h2>السجل</h2><p class="sub">كل تعبئة وحفظ قمت به عبر «حاضر» (آخر ١٠٠٠ عملية).</p></div>
      <div class="acts"><select class="input" id="lPkg" style="width:auto"><option value="">كل المواد</option>${pkgs.map((p) => `<option ${p === f.pkg ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select class="input" id="lAct" style="width:auto"><option value="">كل العمليات</option><option ${f.action === 'عُبّئ' ? 'selected' : ''}>عُبّئ</option><option ${f.action === 'حُفظ' ? 'selected' : ''}>حُفظ</option></select>
        <button class="btn" id="lCsv">${ic('download', 15)} تصدير Excel</button><button class="btn danger" id="lClear">${ic('trash', 15)} مسح</button></div></div>
    <section class="card" style="padding:0;overflow:hidden">${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>العملية</th><th>المادة</th><th>الحصة</th><th>تاريخ النشر</th><th>ملاحظة</th></tr></thead><tbody>
      ${rows.slice(0, 400).map((e) => `<tr><td>${esc(when(e.when))}</td><td><span class="chip ${e.action === 'حُفظ' ? 'ok' : 'gold'}">${esc(e.action || '')}</span></td><td>${esc(e.pkg || '')}</td><td>${esc(e.lesson || '')}<small>${esc(e.unitLesson || '')}</small></td><td>${e.date ? esc(dayLabel(e.date)) : '—'}</td><td>${e.total ? `${toAr(e.ok || 0)} / ${toAr(e.total)} بنود` : esc(e.source || '')}</td></tr>`).join('')}
      </tbody></table></div>${rows.length > 400 ? `<div class="hint" style="padding:10px 14px">يُعرض آخر ٤٠٠ — التصدير يشمل الكل (${toAr(rows.length)}).</div>` : ''}` : '<div class="empty"><b>السجل فارغ</b>تظهر هنا عمليات التعبئة والحفظ.</div>'}</section>`;
  $('lPkg').onchange = () => { VIEWS.log.f = { pkg: $('lPkg').value, action: $('lAct').value }; VIEWS.log(); };
  $('lAct').onchange = $('lPkg').onchange;
  $('lCsv').onclick = () => {
    const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const lines = [['الوقت', 'العملية', 'المادة', 'الدرس', 'الحصة', 'تاريخ النشر', 'البنود المعبأة', 'إجمالي البنود', 'المصدر'].map(q).join(',')]
      .concat(rows.map((e) => [new Date(e.when).toLocaleString('ar-OM'), e.action, e.pkg, e.unitLesson, e.lesson, e.date, e.ok ?? '', e.total ?? '', e.source || ''].map(q).join(',')));
    download(`حاضر - السجل ${isoOf(new Date())}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('lClear').onclick = async () => { if (await confirmBox('مسح السجل', 'مسح كل السجل؟ (لا يؤثر على حالة الحصص)', 'مسح')) { await write(clearLog); VIEWS.log(); } };
  current.refresh = () => VIEWS.log();
};

// ================= الإعدادات =================
VIEWS.settings = async () => {
  const s = D.settings;
  const days = (s.schoolDays || [0, 1, 2, 3, 4]).slice();
  let shortcut = '';
  try { const cmds = await chrome.commands.getAll(); shortcut = (cmds.find((c) => c.name === 'fill-last') || {}).shortcut || ''; } catch (e) {}
  const sw = (k, label, hint) => `<label class="switch"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}> ${label}${hint ? ` <small class="hint">— ${hint}</small>` : ''}</label>`;
  V().innerHTML = `
    <div class="page-h"><div><h2>الإعدادات</h2><p class="sub">تُحفظ التغييرات فورًا.</p></div></div>
    <section class="card">
      <div class="set-row"><b>أيام الدوام<small>لاقتراح التواريخ (ولكل مادة أيام حصصها من صفحتها)</small></b><div class="days" id="sDays">${dayChips(days)}</div></div>
      <div class="set-row"><b>رابط الدرايف الافتراضي<small>يُقترح للمواد الجديدة</small></b><input class="input" id="sDrive" dir="ltr" value="${esc(s.driveLink || '')}"></div>
      <div class="set-row"><b>نهاية الفصل الدراسي<small>آخر يوم دراسي — لحساب «ميزانية الفصل»: هل تكفي الأيام المتبقية لكل حصص الملف؟</small></b>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><label class="f">الفصل الأول<input class="input" type="date" id="sT1" value="${esc(s.term1End || '')}"></label><label class="f">الفصل الثاني<input class="input" type="date" id="sT2" value="${esc(s.term2End || '')}"></label></div></div>
      <div class="set-row"><b>أيام الإجازات<small>سطر لكل إجازة: يوم واحد «18/11/2026» أو مدى «من 18/11/2026 إلى 19/11/2026 العيد الوطني» — تُتخطّى عند توزيع التواريخ ولا تُحسب في الميزانية</small></b>
        <div><textarea class="input" id="sHol" rows="4" placeholder="18/11/2026 العيد الوطني&#10;من 14/12/2026 إلى 25/12/2026 إجازة منتصف الفصل">${esc(s.holidays || '')}</textarea><div class="hint" id="sHolN" style="margin-top:4px"></div></div></div>
      <div class="set-row"><b>عند التعبئة في نور</b><div class="set-stack">
        ${sw('pickLesson', 'اختر الدرس من شجرة الدروس في نور تلقائيًا', 'إن فتحت «إضافة تحضير» دون اختيار درس')}
        ${sw('titleSuffix', 'أضف «(2)» لعنوان الحصة الثانية من الدرس', 'وهكذا «(3)» للثالثة — كما في قائمة تحاضيرك')}
        ${sw('noorSync', 'اقرأ قائمة «التحاضير» في نور وعلّم ما حُفظ', 'حتى ما حضّرته يدويًا أو من جهاز آخر')}
        ${sw('checkTimeslots', 'حدّد كل الصفوف (الحصص) الظاهرة للتاريخ')}
        ${sw('ensureGlobal', 'علّم «تعميم التحضير على كافة الجداول»')}
        ${sw('setWeek', 'اختر «أسبوع العمل» حسب تاريخ النشر')}
        ${sw('fileDates', 'استعمل تاريخ النشر المكتوب في ملف المادة لكل حصة', 'وما بلا تاريخ يتبع الحصة التي قبله على أيام الحصص')}
        ${sw('autoContinue', '«فصل كامل»: لا تتوقف عند تعارضات الربط', 'تبدأ وحدها بعد مهلة وتتخطى ما لم يُربط بدرس في نور وتخبرك في النهاية')}
        ${sw('skipFilled', 'لا تغيّر البنود المكتوبة في الصفحة', 'مفيد إن كتبت جزءًا بنفسك')}
      </div></div>
      <div class="set-row"><b>داخل صفحة نور</b><div class="set-stack">${sw('fab', 'أظهر زر «حاضر» العائم في صفحة «إضافة تحضير»')}${sw('autoOpen', 'افتح النافذة داخل الصفحة تلقائيًا عند متابعة التحضير', 'بعد إنجاز حصة، تُفتح عند فتح نموذج التالية')}</div></div>
      <div class="set-row"><b>اختصار لوحة المفاتيح<small>يعبّئ الدرس المفتوح بالحصة والتاريخ المقترحين</small></b><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${shortcut ? `<kbd>${esc(shortcut)}</kbd>` : '<span class="hint">غير مضبوط</span>'}<button class="btn sm" id="sKeys">تغيير الاختصار</button></div></div>
      <div class="set-row"><b>البيانات<small>صدّر نسخة احتياطية قبل أي حذف</small></b><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="#transfer">${ic('save', 14)} النسخ الاحتياطي</a><button class="btn sm danger" id="sReset">تصفير تقدم كل المواد</button></div></div>
    </section>`;
  bindDays($('sDays'), days, async (d) => { D.settings = await write(() => patchSettings({ schoolDays: d })); toast('✓ حُفظت أيام الدوام'); });
  $('sDrive').oninput = debounce(async () => { await write(() => patchSettings({ driveLink: $('sDrive').value.trim() })); toast('✓ حُفظ الرابط'); }, 600);
  $('sT1').onchange = async () => { await write(() => patchSettings({ term1End: $('sT1').value })); toast('✓ حُفظت نهاية الفصل الأول'); };
  $('sT2').onchange = async () => { await write(() => patchSettings({ term2End: $('sT2').value })); toast('✓ حُفظت نهاية الفصل الثاني'); };
  const holN = () => { const n = parseHolidays($('sHol').value).size; $('sHolN').textContent = n ? `${toAr(n)} ${n === 1 ? 'يوم إجازة' : n === 2 ? 'يوما إجازة' : n <= 10 ? 'أيام إجازة' : 'يوم إجازة'} مفهومة` : ($('sHol').value.trim() ? 'لم أفهم أي تاريخ — اكتب كل إجازة في سطر' : ''); };
  holN();
  $('sHol').oninput = debounce(async () => { await write(() => patchSettings({ holidays: $('sHol').value })); holN(); toast('✓ حُفظت الإجازات'); }, 700);
  V().querySelectorAll('[data-set]').forEach((el) => { el.onchange = async () => { await write(() => patchSettings({ [el.dataset.set]: el.checked })); toast('✓ حُفظ'); }; });
  $('sKeys').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  $('sReset').onclick = async () => {
    if (!(await confirmBox('تصفير كل التقدم', 'ستعود كل الحصص في كل المواد إلى «لم تُعبّأ»، ويُمسح سجل الإدخال وسجل «فصل كامل» لكل المواد. المحتوى لا يُحذف.', 'تصفير'))) return;
    await write(async () => { for (const p of D.packages) await resetProgress(p.id); });
    toast('✓ صُفّر التقدم وسجل الإدخال لكل المواد');
  };
};

// ================= طريقة الاستخدام =================
VIEWS.help = () => {
  V().innerHTML = `
    <div class="page-h"><div><h2>طريقة الاستخدام</h2><p class="sub">«حاضر» يعبّئ نموذج «إضافة تحضير» في منصة نور من مكتبة تحاضيرك.</p></div></div>
    <section class="card help">
      <div class="steps">
        <div class="step"><span class="n">١</span><b>أضف تحضير المادة مرة واحدة</b><p>من «إضافة تحضير»: الصق النص أو ارفع ملف Word أو HTML، وراجع المعاينة ثم «أضف إلى المكتبة».</p></div>
        <div class="step"><span class="n">٢</span><b>افتح «إضافة تحضير» في نور</b><p>من صفحة المادة في نور اختر الدرس ثم «إضافة تحضير».</p></div>
        <div class="step"><span class="n">٣</span><b>اضغط «حاضر»</b><p>من أيقونة الإضافة أو الزر العائم في الصفحة: الدرس مختار تلقائيًا، اختر الحصة وتأكد من التاريخ ثم «عبّئ التحضير».</p></div>
        <div class="step"><span class="n">٤</span><b>راجع واحفظ</b><p>اضغط «حفظ» في نور (أو «احفظ في نور الآن») فتُسجَّل الحصة «محفوظة ✓» وتنتقل للتالية.</p></div>
      </div>
    </section>
    <section class="card"><h3>ماذا يفعل «حاضر» عند التعبئة؟</h3>
      <ul class="tips">
        <li>يحدد كل مربعات <b>المخرجات التعليمية</b>، ويختار ثلاثة <b>مستويات</b>، ويختار <b>الاستراتيجيات</b> و<b>المصادر</b> من قوائم نور (وما ليس فيها يُكتب في «أخرى»).</li>
        <li>يكتب المفاهيم والتهيئة وسير الدرس والتقويمين والملاحظات، ويضيف <b>رابط الدرايف</b> في الملاحظات للصفوف ٥–١٢.</li>
        <li>يكتب <b>تاريخ النشر</b> ويختار <b>أسبوع العمل</b>، ويحدد كل <b>الصفوف</b> الظاهرة، ويعلّم «<b>تعميم التحضير على كافة الجداول</b>».</li>
        <li>لا يحفظ شيئًا دون إذنك: الحفظ بيدك، أو بزر «احفظ في نور الآن»، أو في «عدة حصص» بخيار الحفظ التلقائي.</li>
      </ul>
    </section>
    <section class="card faq"><h3>أسئلة شائعة</h3>
      <details><summary>اختارت الإضافة درسًا خاطئًا؟</summary><p>اضغط «تغيير الدرس» في النافذة واختر الصحيح (يمكنك البحث برقم الدرس). تتذكر الإضافة اختيارك لهذا الدرس في المرات القادمة.</p></details>
      <details><summary>ظهرت رسالة «تم اختيار هذا التاريخ من قبل»؟</summary><p>نور لا تقبل تاريخين متطابقين للمادة. اضغط «جرّب …» في نتيجة التعبئة لاختيار اليوم الدراسي التالي، أو غيّر التاريخ يدويًا.</p></details>
      <details><summary>لم تظهر الصفوف (الحصص)؟</summary><p>تظهر الصفوف في نور حسب جدولك لليوم المختار؛ إن لم تكن لديك حصة لهذه المادة في ذلك اليوم اختر يومًا آخر. اضبط «أيام حصص المادة» من صفحتها في المكتبة لتقترح الإضافة الأيام الصحيحة.</p></details>
      <details><summary>حفظت في نور ولم تُسجَّل الحصة «محفوظة»؟</summary><p>اضغط «حفظتُها ✓» بجانب الحصة في النافذة، أو «تعليم كمحفوظة» من المكتبة. (إن كانت صفحة نور مفتوحة قبل تثبيت الإصدار الجديد فأعد تحميلها.)</p></details>
      <details><summary>كيف أعبّئ عدة حصص دفعة واحدة؟</summary><p>من نافذة «حاضر» اضغط «عدة حصص دفعة واحدة»: اختر الحصص (من درس أو عدة دروس) وأيام حصص المادة وتاريخ أول حصة فتوزَّع التواريخ تلقائيًا. بعد كل حصة تنتقل النافذة مباشرة إلى التالية: يُفتح نموذجها تلقائيًا إن كان معروفًا، وإلا تفتحه أنت في نور فيُفحص التوافق وتُعبّأ. في «أراجع وأحفظ بنفسي» تضغط أنت «حفظ» في نور (أو «حفظتُها — التالي»)، وفي «الحفظ التلقائي» تُحفظ كل حصة وحدها.</p></details>
      <details><summary>كيف أكتب تاريخ النشر في ملف التحضير؟</summary><p>بأي طريقة من هذه: بندًا مستقلًا في الحصة «<b>تاريخ النشر</b>» وتحته التاريخ (أو في السطر نفسه «تاريخ النشر: 12/10/2026»)، أو في عنوان الحصة «الحصة الأولى (12/10/2026)»، أو في عنوان الدرس أو الوحدة فيأخذه أول حصة بعده وتتبعه بقية الحصص يومًا بعد يوم على أيام حصصك، أو في عنوان أسبوع «الأسبوع 3: 12/10/2026 – 16/10/2026». الصيغ المفهومة: 12/10/2026 · 12-10-2026 · 2026-10-12 · ١٢/١٠/٢٠٢٦ · 12 أكتوبر 2026 · الأحد 12 أكتوبر · 12/10 بلا سنة (تُستنتج من السنة الدراسية) · 20/4/1448هـ (يُحوَّل ميلاديًا). في ملفات HTML التفاعلية يكفي مفتاح <code>publishDate</code> أو <code>date</code> أو «تاريخ النشر» في بيانات الحصة، وفي جداول Word صف «تاريخ النشر | التاريخ». وإن وقع التاريخ في يوم إجازة أو كان مستعملًا في نور يُنقل تلقائيًا إلى يوم الحصة التالي ويُخبرك السجل.</p></details>
      <details><summary>حذفتُ التحاضير من نور وأريد إدخالها من جديد — لكن «حاضر» يعدّها مُدخلة؟</summary><p>اضغط «تصفير التقدم» من صفحة المادة في المكتبة (أو «↺ تصفير تقدم المادة» في نافذة «فصل كامل»). التصفير يمسح كل ما يجعل الحصة تُعدّ مُدخلة: حالتها (عُبّئت/حُفظت)، وسجل إدخالها في «السجل»، وسجل «فصل كامل» لمقررها، وذاكرة عناوين قائمة نور — فتعود المادة كأنها لم تُدخل قط. ثم «ابدأ» فتُدخل كاملة. (إن كانت بعض التحاضير ما زالت في نور فسيقرؤها «أكمل الناقص فقط» ولن يكررها.)</p></details>
      <details><summary>كيف يختار «حاضر» الحصة المستحقة بتاريخ النشرة؟</summary><p>إن كانت في ملف المادة تواريخ نشر، فالتاريخ هو الذي يحكم لا ترتيب الحصص: في نافذة «حاضر» تُقترح حصة اليوم (أو أقرب قادمة، أو أحدث فائتة لم تُدخل) بعلامة 📅، وفي «فصل كامل» و«عدة حصص» تختار «حصة اليوم» أو «هذا الأسبوع» أو «من تاريخ إلى تاريخ» فتُعبَّأ الحصص التي تقع تواريخ نشرها فيه، وتُرتَّب زمنيًا. الحصة التي بلا تاريخ تتبع التي قبلها على أيام الحصص.</p></details>
      <details><summary>ما «ميزانية الفصل» و«أيام الإجازات»؟</summary><p>اضبط في الإعدادات آخر يوم دراسي في كل فصل وأيام الإجازات (سطر لكل إجازة). عندها يحسب «حاضر» أيام الحصص المتاحة من أول تاريخ نشر حتى نهاية الفصل بعد استبعاد الإجازات، ويقارنها بعدد الحصص المتبقية في الملف قبل البدء: «٧٥ حصة لـ٧٢ يومًا — ٣ ستقع بعد نهاية الفصل». والإجازات تُتخطّى عند توزيع التواريخ من البداية (لا بعد محاولة فاشلة). وفي فحص الملف يُنبَّه على أي قفزة أكثر من أسبوعين بين تاريخي حصتين متتاليتين، فهي غالبًا خطأ مطبعي.</p></details>
      <details><summary>كيف أعبّئ وحدة واحدة أو أسبوعًا فقط بدل الفصل كله؟</summary><p>في «تحضير فصل كامل» اختر «ما الذي يُعبَّأ؟»: الفصل كاملًا، أو وحدة (واحدة أو أكثر)، أو أسبوع (أي يوم منه فتُعبَّأ الحصص التي تقع تواريخها فيه)، أو من درس إلى درس. وفي «عدة حصص» استعمل «تحديد وحدة…» أو «حصص أسبوع». الحصص خارج النطاق لا تُلمس، وما حُفظ لا يتكرر.</p></details>
      <details><summary>هل يقبل «حاضر» ملفات HTML؟</summary><p>نعم. من «إضافة تحضير» ← «رفع ملف» اختر ملف ‎.html أو ‎.htm أو ‎.mht (أو اسحبه إلى الصفحة): ملف Word المحفوظ «صفحة ويب»، أو صفحة تحضير عادية، أو ملف تحضير تفاعلي يعرض المدمج والمنفصل. يقرأ «حاضر» الدروس والحصص والبنود ويعرض لك معاينة قبل الإضافة، ولا يُشغَّل أي شيء من الملف. إن لم تظهر الحصص فتأكد أن أسماء البنود (المخرجات، الاستراتيجيات…) موجودة في الملف.</p></details>
      <details><summary>ماذا يعني «تأكد من التوافق»؟</summary><p>يتحقق «حاضر» أن الدرس المفتوح في نور هو درس الحصة التي سيعبّئها. إن لم يتوافق تلقائيًا (مثلًا اسم الدرس في نور مختلف عن اسمه في مكتبتك) يعرض لك الدرس المتوقع والأقرب لتؤكده بضغطة — ويتذكر تأكيدك فيتوافق تلقائيًا في المرات القادمة. وإن كانت الصفحة لدرس آخر اضغط «ليست هي» وافتح الصفحة الصحيحة.</p></details>
      <details><summary>كيف أعدّل محتوى حصة؟</summary><p>المكتبة ← المادة ← «تعديل» بجانب الحصة. المستوى والاستراتيجيات والمصادر تُختار من قوائم نور نفسها.</p></details>
      <details><summary>كيف أنقل تحاضيري لجهاز آخر أو أشاركها؟</summary><p>«استيراد وتصدير»: صدّر المادة (دون كلمة سر) أو نزّل نسخة احتياطية كاملة، ثم استوردها في الجهاز الآخر.</p></details>
      <details><summary>شيء لا يعمل كما يجب؟</summary><p>افتح نموذج التحضير في نور، ثم من نافذة «حاضر» اضغط «نسخ تقرير التشخيص» والصقه في المحادثة مع المطوّر.</p></details>
    </section>
    <section class="card"><h3>اختصار لوحة المفاتيح</h3><p class="hint" style="margin:0"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> في صفحة «إضافة تحضير» يعبّئ الدرس المفتوح بالحصة والتاريخ المقترحين مباشرة.</p></section>`;
};

// ================= البحث العام =================
VIEWS.search = (q) => {
  q = q || '';
  const qn = kwNorm(q);
  const hits = [];
  if (qn) {
    for (const p of D.packages) for (const l of p.lessons || []) {
      const hay = kwNorm([p.title, l.unit, l.lesson, l.title, textOf(l.concepts), textOf(l.outcomes), textOf(l.intro)].join(' '));
      if (hay.includes(qn)) hits.push({ p, l });
    }
  }
  V().innerHTML = `
    <div class="page-h"><div><h2>نتائج البحث</h2><p class="sub">${q ? `عن «${esc(q)}» — ${sessionsWord(hits.length)}` : 'اكتب في مربع البحث أعلى الصفحة.'}</p></div></div>
    <section class="card" style="padding:0;overflow:hidden">${hits.length ? hits.slice(0, 150).map(({ p, l }) => {
      const s = sessionStatus(D.state, p.id, l.id);
      return `<div class="srow ${s.saved ? 'saved' : s.filled ? 'filled' : ''}"><span class="sd">${s.saved ? '✓' : s.filled ? '•' : ''}</span>
        <div class="stt"><b>${esc(l.title)}</b><small>${esc([l.lesson, p.title].filter(Boolean).join(' · '))} — ${esc(statusText(s))}</small></div>
        <div class="sacts"><a class="btn sm" href="#pkg/${enc(p.id)}">المادة</a><a class="btn sm" href="#edit/${enc(p.id)}/${enc(l.id)}">${ic('edit', 14)} تعديل</a></div></div>`;
    }).join('') : q ? '<div class="empty">لا نتائج.</div>' : ''}</section>`;
  current.refresh = () => VIEWS.search(q);
};

// ================= القوالب الملتقطة =================
let tplSaveTimer = null;
VIEWS.templates = async () => {
  const { templates } = await getAll();
  V().innerHTML = `
    <div class="page-h"><div><h2>القوالب الملتقطة</h2><p class="sub">طريقة إضافية: التقط تحضيرًا مكتوبًا في أي صفحة من نافذة «حاضر» ← «القوالب الملتقطة»، ثم أعد تعبئته كما هو.</p></div>
      <div class="acts"><button class="btn" id="tExp" ${templates.length ? '' : 'disabled'}>${ic('download', 15)} تصدير الكل</button></div></div>
    <section class="card">${templates.length ? `<div class="tlist-o">${templates.map((t) => `<a class="tit" href="#tpl/${enc(t.id)}">${ic('layers', 18)}<div><b>${esc(t.name || 'بدون اسم')}</b><br><small>${esc([t.subject, t.grade].filter(Boolean).join(' · '))} · ${fieldsWord((t.fields || []).length)} · ${timesWord(t.uses || 0)}</small></div></a>`).join('')}</div>`
      : '<div class="empty"><b>لا توجد قوالب ملتقطة</b>هذه الطريقة اختيارية — المكتبة هي الطريقة الأساسية.</div>'}</section>`;
  const e = $('tExp');
  if (e) e.onclick = () => download(`حاضر - قوالب ${isoOf(new Date())}.json`, { app: 'hadir', version: 1, exported: new Date().toISOString(), templates });
};
VIEWS.tpl = async (id) => {
  const { templates } = await getAll();
  const t = templates.find((x) => x.id === id);
  if (!t) return notFound('لم أجد هذا القالب.');
  const persist = () => {
    clearTimeout(tplSaveTimer);
    tplSaveTimer = setTimeout(async () => {
      await write(async () => {
        const fresh = (await getAll()).templates;   // قد يكون قالب جديد التُقط من النافذة في الأثناء
        const i = fresh.findIndex((x) => x.id === t.id);
        if (i >= 0) fresh[i] = t; else fresh.unshift(t);
        await saveTemplates(fresh);
      });
      toast('✓ حُفظ');
    }, 450);
  };
  const editor = (f) => {
    if (f.kind === 'check' || f.kind === 'radio') return `<label class="switch"><input type="checkbox" data-role="bool" ${f.value ? 'checked' : ''}> محدَّد</label>`;
    if (f.kind === 'select') return `<input class="input" data-role="${Array.isArray(f.value) ? 'multi' : 'select'}" value="${esc(Array.isArray(f.value) ? f.value.map((x) => x.t).join('، ') : (f.value && f.value.t) || '')}">`;
    if (f.kind === 'rich') return rich('tf_' + String(f.fid || '').replace(/[^\w-]/g, ''), f.value);
    return `<textarea class="input" data-role="text" rows="${Math.min(8, Math.max(1, String(f.value || '').split('\n').length))}">${esc(f.value)}</textarea>`;
  };
  V().innerHTML = `
    <div class="crumbs"><a href="#templates">القوالب الملتقطة</a>${ic('left', 14)}<span>${esc(t.name)}</span></div>
    <section class="card">
      <div class="grid3"><label class="f">اسم القالب<input class="input" id="tN" value="${esc(t.name)}"></label><label class="f">المادة<input class="input" id="tS" value="${esc(t.subject || '')}"></label><label class="f">الصف<input class="input" id="tG" value="${esc(t.grade || '')}"></label></div>
      <div class="hint" style="margin-top:8px">متغيرات تُستبدل وقت التعبئة: ${VARIABLES.map((v) => `<code>${esc(v.key)}</code> ${esc(v.desc)}`).join(' · ')}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" id="tDup">${ic('copy', 14)} نسخ القالب</button><button class="btn sm danger" id="tDel">${ic('trash', 14)} حذف</button></div>
    </section>
    <section class="card">${(t.fields || []).map((f, i) => `<div class="tfield ${f.enabled === false ? 'off' : ''}" data-i="${i}">
        <label class="switch" title="تفعيل/تعطيل"><input type="checkbox" data-role="enabled" ${f.enabled === false ? '' : 'checked'}></label>
        <div class="tfv"><div class="tfl">${esc(f.label || f.name || 'حقل')} <span class="chip muted">${esc(KIND_NAMES[f.kind] || f.kind)}</span></div>${editor(f)}</div>
        <button class="ib danger" data-role="remove" title="حذف الحقل">${ic('x', 15)}</button></div>`).join('') || '<div class="empty">لا توجد حقول.</div>'}</section>`;
  const meta = (el, k) => { $(el).oninput = () => { t[k] = $(el).value; t.updated = Date.now(); persist(); }; };
  meta('tN', 'name'); meta('tS', 'subject'); meta('tG', 'grade');
  $('tDup').onclick = async () => { const c = JSON.parse(JSON.stringify(t)); c.id = uid(); c.name = t.name + ' (نسخة)'; c.uses = 0; c.lastUsed = 0; await write(async () => { const fresh = (await getAll()).templates; fresh.unshift(c); await saveTemplates(fresh); }); go('tpl', c.id); };
  $('tDel').onclick = async () => { if (!(await confirmBox('حذف القالب', `حذف «${t.name}»؟`, 'حذف'))) return; await write(async () => saveTemplates((await getAll()).templates.filter((x) => x.id !== t.id))); go('templates'); };
  V().querySelectorAll('.tfield').forEach((row) => {
    const f = t.fields[+row.dataset.i];
    row.querySelector('[data-role="enabled"]').onchange = (e) => { f.enabled = e.target.checked; row.classList.toggle('off', !f.enabled); persist(); };
    row.querySelector('[data-role="remove"]').onclick = async () => {
      t.fields.splice(+row.dataset.i, 1);
      await write(async () => { const fresh = (await getAll()).templates; const i = fresh.findIndex((x) => x.id === t.id); if (i >= 0) fresh[i] = t; await saveTemplates(fresh); });
      VIEWS.tpl(id);
    };
    const ed = row.querySelector('[data-role="text"],[data-role="select"],[data-role="multi"],[data-role="bool"],.rich');
    if (!ed) return;
    const role = ed.classList.contains('rich') ? 'rich' : ed.dataset.role;
    const update = () => {
      if (role === 'text') f.value = ed.value;
      else if (role === 'rich') f.value = sanitize(ed.innerHTML);
      else if (role === 'bool') f.value = ed.checked;
      else if (role === 'select') f.value = Object.assign({}, f.value || {}, { t: ed.value.trim() });
      else if (role === 'multi') f.value = ed.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean).map((s) => (f.value || []).find((x) => x.t === s) || { v: '', t: s });
      t.updated = Date.now(); persist();
    };
    if (role === 'rich') bindRich(row, update); else ed.addEventListener(role === 'bool' ? 'change' : 'input', update);
  });
};

// ================= التشغيل =================
const onStore = debounce(async () => {
  const self = Date.now() - selfWriteAt < 1500;
  await loadAll();
  if (self || dirty) return;
  if (current.refresh) current.refresh();
}, 300);
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local') onStore(); });

async function init() {
  document.addEventListener('click', () => document.querySelectorAll('.menu').forEach((m) => m.remove()));
  document.querySelectorAll('[data-ic]').forEach((el) => { el.outerHTML = ic(el.dataset.ic, 18); });
  $('gsIc').outerHTML = ic('search', 16);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
  await loadAll();
  $('gq').oninput = debounce(() => {
    const v = $('gq').value.trim();
    if (dirty && !confirm('لديك تغييرات غير محفوظة. تركها دون حفظ؟')) return;
    setDirty(false);
    if (!v) { if (location.hash.startsWith('#search')) go('library'); return; }
    history.replaceState(null, '', '#search/' + enc(v));
    lastHash = location.hash;
    route();
  }, 250);
  route();
}
init();
