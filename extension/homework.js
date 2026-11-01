// الواجبات في «المهام الإلكترونية» بنور (المالك 2026-11-01): لكل درس واجب من خمسة أسئلة،
// مربوط بتحضير الدرس ودرسه في الشجرة، ويُنشر بتاريخ نشر التحضير. الأسئلة من أنشطة الدرس في موقع أفق (site/games).
// نور (Classera): «إضافة واجب جديد» ← homeworks/create/cid:… ثم «إضافة مجموعة مفردات دفعة واحدة» ← questions/add_bulk_questions/cid/aid/type

export const GAMES_BASE = 'https://afuq-edu.github.io/afaq-subscribe/games/';
// ملفات الواجبات (مثل ملفات التحضير): لكل باقة ملف فيه لكل درس أسئلته الخمسة وإجاباتها — site/homework/<الباقة>.json
export const HW_BASE = 'https://afuq-edu.github.io/afaq-subscribe/homework/';
export const HW_MARK = 2;          // درجتان لكل سؤال — المجموع ١٠
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
export function toNoorRows(qs) {
  const p = (s) => `<p${isAr(s) ? ' dir="rtl"' : ''}>${esc(String(s).trim())}</p>`;
  return (qs || []).filter((x) => x && x.q && (x.t === 'tf' ? typeof x.a === 'boolean' : Array.isArray(x.o) && x.o.length >= 2 && x.a >= 1 && x.a <= x.o.length))
    .map((x) => (x.t === 'tf' ? { type: 'tfq', text: p(x.q), correct: x.a ? 1 : 2 } : { type: 'mcq', text: p(x.q), options: x.o.slice(0, 6).map((o) => String(o).trim()), correct: x.a }));
}

const pad = (n) => String(n).padStart(2, '0');
export function noorDT(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`; }
// النشر بتاريخ التحضير (السابعة صباحًا)، ولا يسبق الآن (نور تقترح بعد ربع ساعة)
export function hwDates(iso, now = new Date()) {
  let pub = new Date(iso + 'T07:00:00');
  const soon = new Date(now.getTime() + 15 * 60000); soon.setSeconds(0, 0);
  if (!(pub > soon)) pub = soon;
  const due = new Date(pub.getTime() + HW_DUE_DAYS * 86400000);
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
    if (!prep) return { err: 'noprep', preps: fm.preps.length };
    // الدرس في الشجرة: كما تربطه نور بالتحضير، وإلا بالاسم
    let lessonId = '';
    try {
      const r = await fetch(`${origin}/teacher/attachments/get_prep_lessons`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: 'selectedPreps=' + encodeURIComponent(prep.id) });
      const t = (await r.text()).trim().replace(/^"|"$/g, '');
      if (/^\d+$/.test(t) && fm.lessons.some((l) => l.id === t)) lessonId = t;
    } catch (e) {}
    if (!lessonId && want.length) { const l = fm.lessons.find((x) => want.includes(norm(x.title)) || want.some((w) => norm(x.title).endsWith(' ' + w))); if (l) lessonId = l.id; }
    const fd = new FormData(fm.f);
    const set = (k, v) => fd.set(k, v);
    set('data[Assignment][title]', op.title);
    set('data[Assignment][publishing_datetime]', op.publish);
    set('data[Assignment][due_datetime]', op.due);
    set('data[Assignment][cutoff_datetime]', op.cutoff);
    set('data[Assignment][preparation_id]', prep.id);
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
      return { err: errs.length ? 'noor' : 'noaid', msg: errs.join(' | ').slice(0, 200), prepId: prep.id };
    }
    const qcid = m[1], aid = m[2], qtype = m[3] || '';
    const bulkUrl = `${origin}/teacher/questions/add_bulk_questions/cid:${qcid}/aid:${aid}${qtype ? '/type:' + qtype : ''}`;
    const b = await get(bulkUrl);
    const bd = parse(b.html);
    if (isLogin(bd, b.url)) return { err: 'login', aid };
    const bf = bd.getElementById('the_form') || bd.querySelector('form[action*="add_bulk_questions"]#the_form');
    if (!bf) return { err: 'nobulk', aid, prepId: prep.id };
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
    if (!pr.ok) return { err: 'bulk', aid, prepId: prep.id, status: pr.status };
    if (n === 0) return { err: 'noq', aid, prepId: prep.id };
    return { ok: true, aid, prepId: prep.id, lessonId, n, sections: lects.length, bulkStatus: pr.status, len: ph.length };
  } catch (e) {
    return { err: 'crash', msg: String((e && e.message) || e).slice(0, 160) };
  }
}
