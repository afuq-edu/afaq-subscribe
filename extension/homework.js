// الواجبات في «المهام الإلكترونية» بنور (المالك 2026-11-01): لكل درس واجب من خمسة أسئلة،
// مربوط بتحضير الدرس ودرسه في الشجرة، ويُنشر بتاريخ نشر التحضير. الأسئلة من أنشطة الدرس في موقع أفق (site/games).
// نور (Classera): «إضافة واجب جديد» ← homeworks/create/cid:… ثم «إضافة مجموعة مفردات دفعة واحدة» ← questions/add_bulk_questions/cid/aid/type

export const GAMES_BASE = 'https://afuq-edu.github.io/afaq-subscribe/games/';
// ملفات الواجبات (مثل ملفات التحضير): لكل باقة ملف فيه لكل درس أسئلته الخمسة وإجاباتها — site/homework/<الباقة>.json
export const HW_BASE = 'https://afuq-edu.github.io/afaq-subscribe/homework/';
export const HW_MARK = 1;          // درجة لكل سؤال (المالك 2026-11-01) — المجموع ٥
export const HW_DUE_DAYS = 3;      // التسليم بعد ٣ أيام من النشر (كما يقترح نور)
export const HW_LATE_DAYS = 2;     // التسليم المتأخر بعد التسليم بيومين

// رابط أنشطة الدرس في البند العاشر: play.html?d=<الباقة>/<رقم الدرس>
export function gameRef(lesson) {
  const s = [lesson && lesson.notes, lesson && lesson.summative, lesson && lesson.resourcesOther].filter(Boolean).join('\n');
  const m = s.match(/play\.html\?d=([A-Za-z0-9_-]+)\/(\d+)/);
  return m ? { pkg: m[1], n: +m[2] } : null;
}

// باقة الأنشطة: معرّف الباقة دون «-2» (الفترتان تشتركان في أنشطة واحدة) ولا «-tN»
export function gameKey(pkg) {
  const id = String((pkg && pkg.remote && pkg.remote.package_id) || (pkg && pkg.id) || '');
  // «ar-2» الصف الثاني فترة واحدة · «ar-2-2» فترتان · «bio-9-t1» ملف الفصل الأول
  return id.replace(/-t\d+$/, '').replace(/^([a-z]+-\d+)-2$/, '$1');
}
const hwCache = new Map();
// ملف واجبات الباقة: { key, subject, grade, lessons: { «اسم الدرس في الملف»: [ { t: 'mcq'|'tf', q, o?, a } ×5 ] } }
export async function fetchHomeworkFile(key, base = HW_BASE) {
  if (!key) return null;
  const url = `${base}${key}.json`;
  if (hwCache.has(url)) return hwCache.get(url);
  let j = null;
  for (let i = 0; i < 3 && !j; i++) {
    try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) j = await r.json(); else if (r.status === 404) break; } catch (e) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
  }
  hwCache.set(url, j);
  return j;
}
// أسئلة درس من ملف الواجبات، جاهزة لنموذج نور
export async function lessonHomework(pkg, lesson, base = HW_BASE) {
  const f = await fetchHomeworkFile(gameKey(pkg), base);
  const qs = f && f.lessons && lesson ? f.lessons[lesson.lesson] : null;
  return Array.isArray(qs) ? toNoorRows(qs) : [];
}
const gameCache = new Map();
export async function fetchGame(ref, base = GAMES_BASE) {
  if (!ref) return null;
  const url = `${base}${ref.pkg}/${ref.n}.json`;
  if (gameCache.has(url)) return gameCache.get(url);
  let g = null;
  for (let i = 0; i < 3 && !g; i++) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) g = await r.json();
      else if (r.status === 404) break;
    } catch (e) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
  }
  if (g) gameCache.set(url, g);
  return g;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isAr = (s) => /[؀-ۿ]/.test(String(s || ''));
// ترتيب ثابت للخيارات (لا عشوائية: الإعادة تعطي الواجب نفسه)، والجواب الصحيح ليس الأول دائمًا
function rotate(arr, k) { const n = arr.length; return arr.map((_, i) => arr[(i + k) % n]); }

// خمسة أسئلة من أنشطة الدرس: ثلاثة اختيار من متعدد (من مستويات مختلفة) وصح وخطأ اثنان (واحد صحيح وواحد خاطئ إن وُجدا)
// بصيغة ملف الواجبات: { t: 'mcq', q, o: [..], a: رقم الصحيح من 1 } · { t: 'tf', q, a: true|false } — بالترتيب: اختيار، صح وخطأ، اختيار، صح وخطأ، اختيار
export function buildQuestions(game) {
  if (!game) return [];
  const mcq = (game.mcq || []).filter((q) => q && q.q && Array.isArray(q.o) && q.o.length >= 2 && q.o.every((o) => String(o || '').trim()));
  const tf = (game.tf || []).filter((q) => q && q.s && typeof q.t === 'boolean');
  const pickSpread = (list, n) => {
    if (list.length <= n) return list.slice();
    const out = [];
    for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]);
    return out;
  };
  const m = pickSpread(mcq, Math.min(3, mcq.length));
  const tt = tf.filter((q) => q.t), tff = tf.filter((q) => !q.t);
  const t = tt.length && tff.length ? [tt[0], tff[0]] : tf.slice(0, 2);
  // ينقص نوع: يكمل الآخر حتى خمسة
  if (m.length + t.length < 5) m.push(...mcq.filter((q) => !m.includes(q)).slice(0, 5 - m.length - t.length));
  if (m.length + t.length < 5) t.push(...tf.filter((q) => !t.includes(q)).slice(0, 5 - m.length - t.length));
  const clean = (x) => String(x).replace(/\s+/g, ' ').trim();
  const mc = m.map((q, i) => {
    const opts = q.o.slice(0, 6).map(clean);
    const rot = rotate(opts, (i + 1) % opts.length);   // الصحيح أولًا في الأنشطة ← موضع مختلف في كل سؤال (ثابت لا عشوائي)
    return { t: 'mcq', q: clean(q.q), o: rot, a: rot.indexOf(opts[0]) + 1 };
  });
  const tq = t.map((q) => ({ t: 'tf', q: clean(q.s), a: !!q.t }));
  const out = [];
  while (mc.length || tq.length) { if (mc.length) out.push(mc.shift()); if (tq.length) out.push(tq.shift()); }
  return out.slice(0, 5);
}
// سؤال من ملف الواجبات ← صف في «إضافة مجموعة مفردات دفعة واحدة» (النص بصيغة محرر نور)
// كل الأسئلة «اختيار من متعدد» كما يدخلها المالك (2026-11-01): صح/خطأ يصير خيارين، وموضع الجواب الصحيح يتنقّل بين الخيارات
// (ثابت لا عشوائي: الإعادة تعطي الواجب نفسه)
export function toNoorRows(qs) {
  const p = (s) => `<p${isAr(s) ? ' dir="rtl"' : ''}>${esc(String(s).trim())}</p>`;
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const ok = (qs || []).filter((x) => x && x.q && (x.t === 'tf' ? typeof x.a === 'boolean' : Array.isArray(x.o) && x.o.length >= 2 && x.a >= 1 && x.a <= x.o.length));
  const h0 = ok.length ? hash(ok[0].q) : 0;
  return ok.map((x, i) => {
    if (x.t === 'tf') {
      const opts = isAr(x.q) ? ['صح', 'خطأ'] : ['True', 'False'];
      return { type: 'mcq', text: p(x.q), options: opts, correct: x.a ? 1 : 2 };
    }
    const o = x.o.slice(0, 6).map((v) => String(v).trim());
    const right = o[x.a - 1];
    const rest = o.filter((_, k) => k !== x.a - 1);
    const at = (h0 + i * 3) % o.length;
    rest.splice(at, 0, right);
    return { type: 'mcq', text: p(x.q), options: rest, correct: at + 1 };
  });
}
const pad = (n) => String(n).padStart(2, '0');
export function noorDT(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`; }
// النشر بتاريخ التحضير (السابعة صباحًا)، ولا يسبق الآن (نور تقترح بعد ربع ساعة)
// تاريخ تسليم يكتبه المعلم («الواجبات فقط»): نهاية ذلك اليوم، وإن لم يأتِ بعد النشر فبعده بثلاثة أيام
export function hwDates(iso, now = new Date(), dueIso = '') {
  let pub = new Date(iso + 'T07:00:00');
  const soon = new Date(now.getTime() + 15 * 60000); soon.setSeconds(0, 0);
  if (!(pub > soon)) pub = soon;
  let due = /^\d{4}-\d{2}-\d{2}$/.test(dueIso || '') ? new Date(dueIso + 'T23:59:00') : null;
  if (!due || !(due > pub)) due = new Date(pub.getTime() + HW_DUE_DAYS * 86400000);
  const cut = new Date(due.getTime() + HW_LATE_DAYS * 86400000);
  return { publish: noorDT(pub), due: noorDT(due), cutoff: noorDT(cut) };
}
export function hwTitle(lessonName) { return 'واجب: ' + String(lessonName || '').replace(/\s+/g, ' ').trim(); }

// يُحقن في صفحة نور (MAIN): كل العمل بطلبات من الصفحة نفسها (ملفات تعريف نور كما هي)، دون فتح صفحات للمعلم.
// op.kind = 'preps' ← تحاضير المقرر في قائمة «التحضير» بنموذج الواجب، وواجبات المقرر الموجودة
// op.kind = 'create' ← إنشاء الواجب وإضافة أسئلته دفعة واحدة
export async function hwPageOp(op) {
  const norm = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  const peel = (s) => { let t = String(s || '').trim(); for (let i = 0; i < 4; i++) { const u = t.replace(/\s*\((\d+(\s*و\s*\d+)*)\)\s*$/, '').trim(); if (u === t) break; t = u; } return t; };
  const origin = location.origin;
  const get = async (url) => {
    const r = await fetch(url, { credentials: 'include', redirect: 'follow' });
    return { ok: r.ok, status: r.status, url: r.url, html: await r.text() };
  };
  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
  const isLogin = (d, url) => !!d.querySelector('input[type="password"]') || /\/users\/login|\/login\b/i.test(url || '');
  const createUrl = `${origin}/teacher/homeworks/create/cid:${op.cid}`;
  const formOf = async () => {
    const r = await get(createUrl);
    const d = parse(r.html);
    if (isLogin(d, r.url)) return { err: 'login' };
    const f = d.getElementById('AssignmentCreateForm') || d.querySelector('form[action*="homeworks/create"][enctype]');
    if (!f) return { err: 'noform', status: r.status };
    const sel = f.querySelector('#AssignmentPreparationId, select[name="data[Assignment][preparation_id]"]');
    const preps = sel ? [...sel.options].filter((o) => o.value).map((o) => ({ id: o.value, title: o.textContent.replace(/\s+/g, ' ').trim() })) : [];
    const lsel = f.querySelector('#lesson_title, select[name="data[Assignment][lessons][]"]');
    const lessons = lsel ? [...lsel.options].filter((o) => o.value).map((o) => ({ id: o.value, title: o.textContent.replace(/\s+/g, ' ').trim() })) : [];
    const lects = [...f.querySelectorAll('input[type=checkbox][name^="data[Lecture][checkbox]"]')].map((el) => {
      const lab = el.closest('label') || f.querySelector(`label[for="${el.id}"]`);
      return { name: el.name, label: lab ? lab.textContent.replace(/\s+/g, ' ').trim() : '' };
    });
    return { f, d, preps, lessons, lects, action: f.getAttribute('action') || createUrl, url: r.url };
  };
  // واجبات المقرر الموجودة (قائمة «المهام الإلكترونية» تُجلب بطلب جدول) — لمنع التكرار؛ إن تعذّرت فلا شيء
  const existing = async () => {
    try {
      const r = await fetch(`${origin}/teacher/homeworks/index/cid:${op.cid}?draw=1&start=0&length=1000`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*' } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch (e) { return null; }
      const out = [];
      const walk = (v) => { if (typeof v === 'string') { const s = v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); if (s) out.push(s); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
      walk(j);
      return out;
    } catch (e) { return null; }
  };
  try {
    if (op.kind === 'preps') {
      const fm = await formOf();
      if (fm.err) return fm;
      return { ok: true, preps: fm.preps, lessons: fm.lessons, lects: fm.lects.map((x) => x.label), existing: await existing() };
    }
    if (op.kind !== 'create') return { err: 'op' };
    const ex = await existing();
    if (ex && ex.some((s) => norm(s) === norm(op.title))) return { ok: true, dup: true };
    const fm = await formOf();
    if (fm.err) return fm;
    // التحضير: المعرّف المعطى، وإلا أحدث تحضير يحمل اسم الدرس
    const want = (op.match || []).map(norm).filter(Boolean);
    let prep = op.prepId ? fm.preps.find((p) => p.id === String(op.prepId)) : null;
    if (!prep && want.length) {
      const hits = fm.preps.filter((p) => want.includes(norm(peel(p.title))) || want.includes(norm(p.title)));
      if (hits.length) prep = op.newest ? hits.reduce((a, b) => (+b.id > +a.id ? b : a)) : hits.reduce((a, b) => (+b.id < +a.id ? b : a));
    }
    if (!prep && !op.noPrep) return { err: 'noprep', preps: fm.preps.length };
    // الدرس في الشجرة: كما تربطه نور بالتحضير، وإلا بالاسم
    let lessonId = '';
    if (prep) try {
      const r = await fetch(`${origin}/teacher/attachments/get_prep_lessons`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: 'selectedPreps=' + encodeURIComponent(prep.id) });
      const t = (await r.text()).trim().replace(/^"|"$/g, '');
      if (/^\d+$/.test(t) && fm.lessons.some((l) => l.id === t)) lessonId = t;
    } catch (e) {}
    // بالاسم: «الوحدة: الدرس» في قائمة دروس النموذج — الاسم نفسه في وحدتين يُفرّق بالوحدة، ثم بترتيبه
    if (!lessonId && want.length) {
      const hits = fm.lessons.filter((x) => want.includes(norm(x.title)) || want.some((w) => norm(x.title).endsWith(' ' + w)));
      const u = norm(op.unit || '');
      const inUnit = u ? hits.filter((x) => norm(x.title).startsWith(u + ' ') || norm(x.title) === u) : [];
      const pool = inUnit.length ? inUnit : hits;
      const l = pool[Math.min(op.nth || 0, pool.length - 1)];
      if (l) lessonId = l.id;
    }
    if (!prep && !lessonId) return { err: 'nolesson', lessons: fm.lessons.length };
    const fd = new FormData(fm.f);
    const set = (k, v) => fd.set(k, v);
    set('data[Assignment][title]', op.title);
    set('data[Assignment][publishing_datetime]', op.publish);
    set('data[Assignment][due_datetime]', op.due);
    set('data[Assignment][cutoff_datetime]', op.cutoff);
    set('data[Assignment][preparation_id]', prep ? prep.id : '');
    fd.delete('data[Assignment][lessons][]');
    if (lessonId) fd.append('data[Assignment][lessons][]', lessonId);
    set('data[Assignment][publish_to]', '0');
    set('data[Assignment][view_answers_radio]', 'view_answers_after_cutoff');
    set('data[Assignment][publish_later]', '0');
    // الشعب: شعب التحضير إن عُرفت (بالرقم في آخر الاسم)، وإلا كل الشعب
    const digit = (s) => (String(s || '').match(/(\d+)\s*$/) || [])[1] || '';
    const wantSec = (op.secs || []).map(digit).filter(Boolean);
    let lects = fm.lects;
    if (wantSec.length) { const m = lects.filter((x) => wantSec.includes(digit(x.label))); if (m.length) lects = m; }
    if (!lects.length) return { err: 'nosections' };
    lects.forEach((x) => fd.append(x.name, '1'));
    const r = await fetch(new URL(fm.action, createUrl).href, { method: 'POST', credentials: 'include', body: fd, redirect: 'follow' });
    const html = await r.text();
    const d = parse(html);
    if (isLogin(d, r.url)) return { err: 'login' };
    // المعرّف من العنوان بعد التحويل، أو من روابط قائمة مفردات هذا الواجب
    const aidRe = /\/questions\/(?:index|add_bulk_questions)\/cid:([A-Za-z0-9_-]+)\/aid:([A-Za-z0-9_-]+)(?:\/type:([A-Za-z0-9_-]+))?/;
    let m = String(r.url).match(aidRe);
    if (!m) { const a = [...d.querySelectorAll('a[href*="add_bulk_questions/cid:"]')].map((x) => x.getAttribute('href')).find((h) => aidRe.test(h)); if (a) m = a.match(aidRe); }
    if (!m) {
      const errs = [...d.querySelectorAll('.alert-danger, .error-message, .alert.alert-error, .has-error .help-block')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
      return { err: errs.length ? 'noor' : 'noaid', msg: errs.join(' | ').slice(0, 200), prepId: prep ? prep.id : '' };
    }
    const qcid = m[1], aid = m[2], qtype = m[3] || '';
    const bulkUrl = `${origin}/teacher/questions/add_bulk_questions/cid:${qcid}/aid:${aid}${qtype ? '/type:' + qtype : ''}`;
    const b = await get(bulkUrl);
    const bd = parse(b.html);
    if (isLogin(bd, b.url)) return { err: 'login', aid };
    const bf = bd.getElementById('the_form') || bd.querySelector('form[action*="add_bulk_questions"]#the_form');
    if (!bf) return { err: 'nobulk', aid, prepId: prep ? prep.id : '' };
    const body = new URLSearchParams();
    bf.querySelectorAll('input[type=hidden]').forEach((el) => { if (el.name && !/^data\[(type|mark|text|correct_answer|number_of_choices|option|Question)\]/.test(el.name)) body.append(el.name, el.value); });
    (op.qs || []).forEach((q, i) => {
      body.append(`data[type][${i}]`, q.type);
      body.append(`data[mark][${i}]`, String(op.mark || 2));
      body.append(`data[text][${i}]`, q.text);
      body.append(`data[correct_answer][${i}]`, String(q.correct));
      if (q.type === 'mcq') {
        body.append(`data[number_of_choices][${i}]`, String(q.options.length));
        q.options.forEach((o, k) => body.append(`data[option][${i}][${k + 1}]`, o));
      }
    });
    const pr = await fetch(new URL(bf.getAttribute('action') || bulkUrl, bulkUrl).href, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: body.toString(), redirect: 'follow' });
    const ph = await pr.text();
    // التحقق: عدد مفردات الواجب في قائمة المفردات
    let n = -1;
    try {
      const v = await fetch(`${origin}/teacher/questions/index/cid:${qcid}/aid:${aid}/type:Homework?start=0&page=1&length=50&draw=1`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*' } });
      const j = JSON.parse(await v.text());
      n = +(j.recordsTotal != null ? j.recordsTotal : j.iTotalRecords != null ? j.iTotalRecords : (Array.isArray(j.data) ? j.data.length : -1));
    } catch (e) {}
    if (!pr.ok) return { err: 'bulk', aid, prepId: prep ? prep.id : '', status: pr.status };
    if (n === 0) return { err: 'noq', aid, prepId: prep ? prep.id : '' };
    return { ok: true, aid, prepId: prep ? prep.id : '', lessonId, n, sections: lects.length, bulkStatus: pr.status, len: ph.length };
  } catch (e) {
    return { err: 'crash', msg: String((e && e.message) || e).slice(0, 160) };
  }
}

// ——— الإنشاء كما يفعل المعلم (4.10.25): تُفتح صفحة «إضافة واجب جديد» في تبويب نور، تُعبّأ حقولها، ويُضغط «إضافة» ———
// (الإرسال من الخلفية رفضه نور: صفحته تكمل نموذجها بسكربتاتها قبل الإرسال)
// يُحقن في صفحة «إضافة واجب جديد» (MAIN): يعبّئ النموذج ثم يرسله بعد لحظة، ويرجع ما اختاره
export function hwCreateFill(op) {
  const norm = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  const peel = (s) => { let t = String(s || '').trim(); for (let i = 0; i < 4; i++) { const u = t.replace(/\s*\((\d+(\s*و\s*\d+)*)\)\s*$/, '').trim(); if (u === t) break; t = u; } return t; };
  try {
    if (document.querySelector('input[type="password"]') || /\/users\/login|\/login\b/i.test(location.href)) return { err: 'login' };
    const f = document.getElementById('AssignmentCreateForm') || document.querySelector('form[action*="homeworks/create"]');
    if (!f) return { err: 'noform', url: location.pathname };
    const q = (sel) => f.querySelector(sel);
    const setVal = (el, v) => { if (!el) return false; el.removeAttribute('readonly'); el.value = v; el.setAttribute('value', v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    const title = q('#AssignmentTitle, input[name="data[Assignment][title]"]');
    if (!setVal(title, op.title)) return { err: 'nofield', which: 'title' };
    const pub = q('#publishdate, input[name="data[Assignment][publishing_datetime]"]'), due = q('#duedate, input[name="data[Assignment][due_datetime]"]'), cut = q('#cutoffdate, input[name="data[Assignment][cutoff_datetime]"]');
    if (!setVal(pub, op.publish) || !setVal(due, op.due) || !setVal(cut, op.cutoff)) return { err: 'nofield', which: 'dates' };
    const later = q('input[type=checkbox][name="data[Assignment][publish_later]"]'); if (later) later.checked = false;
    // التحضير (إن رُبط) ثم الدرس
    const want = (op.match || []).map(norm).filter(Boolean);
    const psel = q('#AssignmentPreparationId, select[name="data[Assignment][preparation_id]"]');
    const preps = psel ? [...psel.options].filter((o) => o.value).map((o) => ({ id: o.value, title: o.textContent.replace(/\s+/g, ' ').trim() })) : [];
    let prep = op.prepId ? preps.find((p) => p.id === String(op.prepId)) : null;
    if (!prep && !op.noPrep && want.length) {
      const hits = preps.filter((p) => want.includes(norm(peel(p.title))) || want.includes(norm(p.title)));
      if (hits.length) prep = op.newest ? hits.reduce((a, b) => (+b.id > +a.id ? b : a)) : hits.reduce((a, b) => (+b.id < +a.id ? b : a));
    }
    if (!prep && !op.noPrep) return { err: 'noprep', preps: preps.length };
    if (psel) psel.value = prep ? prep.id : '';
    const lsel = q('#lesson_title, select[name="data[Assignment][lessons][]"]');
    const lessons = lsel ? [...lsel.options].filter((o) => o.value) : [];
    let lessonId = '';
    if (want.length) {
      const hits = lessons.filter((x) => { const t = norm(x.textContent); return want.includes(t) || want.some((w) => t.endsWith(' ' + w)); });
      const u = norm(op.unit || '');
      const inUnit = u ? hits.filter((x) => norm(x.textContent).startsWith(u + ' ')) : [];
      const pool = inUnit.length ? inUnit : hits;
      const l = pool[Math.min(op.nth || 0, pool.length - 1)];
      if (l) lessonId = l.value;
    }
    if (!prep && !lessonId) return { err: 'nolesson', lessons: lessons.length };
    if (lsel) {
      lessons.forEach((o) => { o.selected = o.value === lessonId; });
      // كما يفعل نور: مع التحضير تُقفل قائمة الدروس (يأخذ الدرس من التحضير)
      lsel.disabled = !!prep;
    }
    // النشر للشعب: شعب التحضير إن عُرفت، وإلا كلها
    const pt = [...f.querySelectorAll('input[type=radio][name="data[Assignment][publish_to]"]')];
    pt.forEach((r) => { r.checked = r.value === '0'; });
    const digit = (s) => (String(s || '').match(/(\d+)\s*$/) || [])[1] || '';
    const boxes = [...f.querySelectorAll('input[type=checkbox][name^="data[Lecture][checkbox]"]')].map((el) => { const lab = el.closest('label') || f.querySelector(`label[for="${el.id}"]`); return { el, label: lab ? lab.textContent.replace(/\s+/g, ' ').trim() : '' }; });
    const wantSec = (op.secs || []).map(digit).filter(Boolean);
    let use = boxes;
    if (wantSec.length) { const m = boxes.filter((x) => wantSec.includes(digit(x.label))); if (m.length) use = m; }
    if (!use.length) return { err: 'nosections' };
    boxes.forEach((x) => { x.el.checked = use.includes(x); });
    const sl = document.getElementById('sections_list'); if (sl) sl.style.display = 'block';
    // الإجابات الصحيحة تظهر بعد التسليم المتأخر
    const va = [...f.querySelectorAll('input[type=radio][name="data[Assignment][view_answers_radio]"]')];
    const vaPick = va.find((r) => r.value === 'view_answers_after_cutoff'); if (vaPick) va.forEach((r) => { r.checked = r === vaPick; });
    setTimeout(() => { try { HTMLFormElement.prototype.submit.call(f); } catch (e) {} }, 60);
    return { ok: true, prepId: prep ? prep.id : '', lessonId, sections: use.length };
  } catch (e) { return { err: 'crash', msg: String((e && e.message) || e).slice(0, 160) }; }
}
// يُحقن بعد «إضافة»: معرّف الواجب من العنوان أو من روابط قائمة مفرداته، وإلا ما تعرضه الصفحة من أخطاء
export function hwAfterCreate() {
  const aidRe = /\/questions\/(?:index|add_bulk_questions)\/cid:([A-Za-z0-9_-]+)\/aid:([A-Za-z0-9_-]+)(?:\/type:([A-Za-z0-9_-]+))?/;
  let m = location.href.match(aidRe);
  if (!m) { const a = [...document.querySelectorAll('a[href*="add_bulk_questions/cid:"]')].map((x) => x.getAttribute('href')).find((h) => aidRe.test(h)); if (a) m = a.match(aidRe); }
  if (m) return { ok: true, cid: m[1], aid: m[2], type: m[3] || '' };
  const errs = [...document.querySelectorAll('.alert-danger:not(.popup-windows), .error-message, .alert-error, .has-error .help-block, #flashMessage, .message.error')]
    .filter((x) => x.offsetParent !== null || x.id === 'flashMessage').map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sw = [...document.scripts].map((s) => s.textContent).join('\n').match(/swal\(\s*\{?[^)]{0,200}/g) || [];
  return { err: 'noaid', url: location.pathname.slice(0, 120), title: document.title.slice(0, 80), msg: errs.concat(sw.slice(0, 2)).join(' | ').slice(0, 220) };
}
// يُحقن في صفحة «إضافة مجموعة مفردات دفعة واحدة»: يضع الأسئلة صفوفًا في نموذجها ويرسله
export function hwBulkFill(op) {
  try {
    if (document.querySelector('input[type="password"]')) return { err: 'login' };
    const f = document.getElementById('the_form') || document.querySelector('form[action*="add_bulk_questions"]');
    if (!f) return { err: 'nobulk', url: location.pathname.slice(0, 120) };
    // صفوف الصفحة وقوالبها تُزال، ثم تُضاف صفوفنا
    [...f.querySelectorAll('[name]')].forEach((el) => { if (/^data\[(type|mark|text|correct_answer|number_of_choices|option|difficulty)\]/.test(el.name)) el.remove(); });
    const add = (n, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = String(v); f.appendChild(i); };
    (op.qs || []).forEach((q, i) => {
      add(`data[type][${i}]`, q.type); add(`data[mark][${i}]`, op.mark || 2); add(`data[text][${i}]`, q.text); add(`data[correct_answer][${i}]`, q.correct);
      if (q.type === 'mcq') { add(`data[number_of_choices][${i}]`, q.options.length); q.options.forEach((o, k) => add(`data[option][${i}][${k + 1}]`, o)); }
    });
    const qn = f.querySelector('input[name="data[Question][number]"]'); if (qn) qn.value = String((op.qs || []).length);
    setTimeout(() => { try { HTMLFormElement.prototype.submit.call(f); } catch (e) {} }, 60);
    return { ok: true };
  } catch (e) { return { err: 'crash', msg: String((e && e.message) || e).slice(0, 160) }; }
}
// يُحقن في أي صفحة من نور: عدد مفردات الواجب (قائمة المفردات تُجلب بطلب جدول) — ‎-1 إن تعذّر
export async function hwCount(op) {
  try {
    const v = await fetch(`${location.origin}/teacher/questions/index/cid:${op.cid}/aid:${op.aid}/type:${op.type || 'Homework'}?start=0&page=1&length=50&draw=1`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*' } });
    const j = JSON.parse(await v.text());
    return +(j.recordsTotal != null ? j.recordsTotal : j.iTotalRecords != null ? j.iTotalRecords : (Array.isArray(j.data) ? j.data.length : -1));
  } catch (e) { return -1; }
}
// يُحقن في أي صفحة من نور: عناوين واجبات المقرر (لمنع التكرار) — null إن تعذّر
export async function hwExisting(op) {
  try {
    const r = await fetch(`${location.origin}/teacher/homeworks/index/cid:${op.cid}?draw=1&start=0&length=1000`, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*' } });
    let j = null; try { j = JSON.parse(await r.text()); } catch (e) { return null; }
    const out = [];
    const walk = (v) => { if (typeof v === 'string') { const s = v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); if (s) out.push(s); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(j);
    return out;
  } catch (e) { return null; }
}
