// غرف النقاش في نور (المالك 2026-11-14): غرفة لكل وحدة، وفي الغرفة موضوع لكل درس فيه رابط نشاط الدرس وسؤالا نقاش،
// منشورة لكل طلبة شعب المادة. نور (Classera): «غرف النقاش» /teacher/posts/view — «إنشاء غرفة» (نموذج #PostTeacherAddForm
// في نافذة على الصفحة نفسها) ← الغرفة /teacher/posts/article/pid:… — «إضافة موضوع جديد» (نموذج #PostReplyForm).
// ما في نور بالعنوان نفسه لا يتكرر (غرفة أو موضوع). كل شيء بهدوء: ما تعذّر يُسجَّل للمشرف فقط.

export const PLAY_BASE = 'https://afuq-edu.github.io/afaq-subscribe/play.html?d=';
export const ROOM_TITLE_MAX = 50;   // maxlength حقل عنوان الغرفة في نور

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isAr = (s) => /[؀-ۿ]/.test(String(s || ''));

// عنوان الغرفة: الوحدة ثم المادة والصف (الغرف عامة لكل مواد المعلم في نور)، في ٥٠ حرفًا
export function roomTitle(unit, subject, grade) {
  const tail = clean([subject, grade].filter(Boolean).join(' '));
  let u = clean(unit) || 'دروس الفصل';
  const room = (x) => (tail ? `${x} — ${tail}` : x);
  if (room(u).length <= ROOM_TITLE_MAX) return room(u);
  // اسم الوحدة الطويل يُختصر من آخره، والمادة والصف تبقيان
  const keep = ROOM_TITLE_MAX - (tail ? tail.length + 3 : 0) - 1;
  if (keep >= 12) { u = u.slice(0, keep).replace(/\s+\S*$/, '') || u.slice(0, keep); return room(u + '…'); }
  return u.slice(0, ROOM_TITLE_MAX - 1) + '…';
}
export function roomInstructions() {
  return 'لكل درس موضوع فيه رابط نشاطه وسؤالان للنقاش. افتح الرابط وحلّ الأنشطة، فتظهر لك شهادة باسمك ونتيجتك. حمّل الشهادة، ثم اكتب نتيجتك في موضوع الدرس وأرفق صورة شهادتك، وأجب عن سؤال النقاش، واقرأ ردود زملائك وعلّق عليها بأدب.';
}
// عنوان الموضوع: اسم الدرس كما في شجرة نور
export const topicTitle = (lessonName) => clean(lessonName).slice(0, 255);

// سؤالا نقاش من أنشطة الدرس: أسئلة «التحليل» المفتوحة أولًا (لماذا/كيف…) ثم «التطبيق»، دون الخيارات
const OPEN = /^(?:لماذا|لم|كيف|ما الدرس|ما رأيك|ماذا تفعل|بم تنصح|ما الذي|ما الفرق|علّل|علل|فسّر|فسر|why|how|what would|what do you|what lesson)/i;
const CLOSED = /^(?:أي|أيّ|اختر|which|choose|who|when|where)/i;
export function discussQuestions(game, k = 2) {
  const all = ((game && game.mcq) || []).filter((x) => x && x.q);
  const lv = (x, l) => x.lv === l;
  const pool = [
    ...all.filter((x) => lv(x, 'التحليل') && OPEN.test(clean(x.q))),
    ...all.filter((x) => lv(x, 'التطبيق') && OPEN.test(clean(x.q))),
    ...all.filter((x) => lv(x, 'التحليل') && !CLOSED.test(clean(x.q))),
    ...all.filter((x) => lv(x, 'التطبيق') && !CLOSED.test(clean(x.q))),
  ];
  const out = [];
  for (const x of pool) { const q = clean(x.q); if (q && !out.includes(q)) out.push(q); if (out.length >= k) break; }
  return out;
}
// رابط نشاط الدرس؛ ومعه اسم المعلم ليظهر في شهادة الطالب (المالك 2026-11-14)
export const playLink = (ref, teacher = '') => (ref && ref.pkg && ref.n ? `${PLAY_BASE}${ref.pkg}/${ref.n}${clean(teacher) ? '&t=' + encodeURIComponent(clean(teacher)) : ''}` : '');

// نص الموضوع (يقبله محرر نور): رابط النشاط رابطًا يُضغط في سطره (كما يكتبه المعلم بزر «رابط» في المحرر)، ثم الخطوات:
// الأنشطة ← الشهادة باسمه ونتيجته ← تحميلها ← النتيجة وصورة الشهادة في الرد ← سؤالا النقاش
export function topicHtml({ link = '', questions = [] } = {}) {
  const rows = [];
  const q = questions.map((x, i) => `<p><strong>${i ? 'سؤال آخر' : 'سؤال للنقاش'}:</strong> <span dir="${isAr(x) ? 'rtl' : 'ltr'}">${esc(x)}</span></p>`);
  if (link) {
    rows.push(`<p><strong>نشاط الدرس:</strong></p>`, `<p><a href="${esc(link)}" target="_blank">${esc(link)}</a></p>`);
    rows.push('<p>١- افتح الرابط وحلّ أنشطة الدرس. في آخرها تظهر شهادتك باسمك ونتيجتك.</p>');
    rows.push('<p>٢- اضغط «حفظ الشهادة صورة» لتحميلها.</p>');
    rows.push('<p>٣- اكتب نتيجتك هنا في ردك، وأرفق صورة شهادتك.</p>');
    if (q.length) rows.push('<p>٤- أجب عن سؤال النقاش، واقرأ ردود زملائك وعلّق عليها.</p>');
  } else rows.push('<p>اكتب هنا ما تعلمته في هذا الدرس، وأجب عن سؤال النقاش.</p>');
  return rows.concat(q).join('\n');
}

// ———— دوال تُنفَّذ في صفحة نور (MAIN world): لا تعتمد على شيء خارجها ————

// قائمة الغرف في «غرف النقاش»: [{ title, url }]
export function roomsRead() {
  const out = [];
  document.querySelectorAll('.discussion-block a.upper[href*="/posts/article/"]').forEach((a) => {
    const h = a.querySelector('.title');
    out.push({ title: (h ? h.textContent : '').replace(/\s+/g, ' ').trim(), url: a.href });
  });
  return { ok: !!document.querySelector('#PostTeacherAddForm'), rooms: out, url: location.href };
}

// «إنشاء غرفة»: العنوان والتعليمات، ثم شعب المادة (وكل طلبتها) كما يختارها المعلم، ثم «إنشاء غرفة»
export function roomCreateFill(op) {
  const norm = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  const f = document.querySelector('#PostTeacherAddForm');
  if (!f) return { ok: false, err: 'noform', url: location.href };
  const $q = (s) => f.querySelector(s);
  const t = $q('#PostTitle'), body = $q('#PostPost');
  if (!t) return { ok: false, err: 'notitle' };
  t.value = op.title; t.dispatchEvent(new Event('input', { bubbles: true }));
  if (body) body.value = op.post || '';
  const pv = $q('#publish_to_val'); if (pv) pv.value = '1';
  // شعب المادة: «اللغة الانجليزية - الخامس - 1» — اسم المادة ثم الصف
  // الصف كما في بطاقة المادة («الصف الخامس») يقابل جزء الصف في اسم الشعبة («الخامس») بالتمام: «الثاني» ليس «الثاني عشر»
  const subj = norm(op.subject), grades = (op.grades || []).map((g) => norm(g).replace(/^الصف\s+/, '')).filter(Boolean);
  const lecs = [...f.querySelectorAll('input.lecture_checkbox')];
  const partsOf = (cb) => norm((cb.closest('label') || cb.parentElement || {}).textContent).split(/\s+-\s+/).map((x) => x.trim().replace(/^الصف\s+/, ''));
  const sameSubj = lecs.filter((cb) => subj && partsOf(cb)[0] === subj);
  let mine = sameSubj.filter((cb) => grades.some((g) => partsOf(cb).slice(1, -1).includes(g)));
  // بطاقة بلا صف مقروء: شعب المادة كلها إن كانت لصف واحد
  if (!mine.length && new Set(sameSubj.map((cb) => partsOf(cb).slice(1, -1).join('|'))).size === 1) mine = sameSubj;
  if (!mine.length) return { ok: false, err: 'nosections', labels: lecs.map((cb) => ((cb.closest('label') || {}).textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 12) };
  let students = 0;
  mine.forEach((cb) => {
    cb.checked = true;
    const id = cb.getAttribute('data-lecture');
    f.querySelectorAll('input.students_checkbox').forEach((s) => { if (s.classList.contains(id)) { s.checked = true; students++; } });
  });
  if (!students) return { ok: false, err: 'nostudents', sections: mine.length };
  // كما يفعل زر «إنشاء غرفة» في نور: ينتقل إلى الخطوة الثانية ثم يرسل النموذج
  f.classList.add('step-2'); f.classList.remove('step-1');
  setTimeout(() => {
    try { if (window.jQuery) window.jQuery('#PostTeacherAddForm').submit(); else HTMLFormElement.prototype.submit.call(f); } catch (e) { HTMLFormElement.prototype.submit.call(f); }
  }, 50);
  return { ok: true, sections: mine.length, students };
}

// مواضيع الغرفة المفتوحة: عناوينها
export function topicsRead() {
  const titles = [...document.querySelectorAll('.mainComment .topic-title')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
  return { ok: !!document.querySelector('#PostReplyForm'), titles, room: ((document.querySelector('h1.post-title') || {}).textContent || '').trim(), url: location.href };
}

// «إضافة موضوع جديد»: العنوان والنص في محرر نور ثم «إضافة»
export function topicFill(op) {
  const f = document.querySelector('#PostReplyForm');
  if (!f) return { ok: false, err: 'noform', url: location.href };
  const t = f.querySelector('input[name="data[Post][title]"]');
  if (!t) return { ok: false, err: 'notitle' };
  t.value = op.title;
  const ta = f.querySelector('textarea[name="data[Post][post]"]');
  if (ta) ta.value = op.html;
  try { const ck = window.CKEDITOR && window.CKEDITOR.instances && (window.CKEDITOR.instances.post || window.CKEDITOR.instances[ta && ta.id]); if (ck) { ck.setData(op.html); ck.updateElement(); } } catch (e) {}
  const req = f.querySelector('#PostDescriptionRequired'); if (req) req.value = 'x';
  const box = document.querySelector('#add_post_checkbox'); if (box) box.checked = true;
  const btn = [...f.querySelectorAll('button[type=submit],input[type=submit]')].find((b) => /إضافة|add/i.test(b.textContent || b.value || '')) || f.querySelector('button[type=submit]');
  setTimeout(() => {
    try { if (ta && window.CKEDITOR && window.CKEDITOR.instances && window.CKEDITOR.instances.post) window.CKEDITOR.instances.post.updateElement(); } catch (e) {}
    if (btn && f.requestSubmit) f.requestSubmit(btn); else if (btn) btn.click(); else HTMLFormElement.prototype.submit.call(f);
  }, 50);
  return { ok: true };
}
