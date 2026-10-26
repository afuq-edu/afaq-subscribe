// noor-mock.mjs — a stateful in-memory mock of the Omani Noor LMS teacher pages, served through Playwright's
// context.route('https://lms.moe.gov.om/**'). Only the DOM the «حاضر» extension relies on is reproduced:
//   home page course cards (readHomePage) · «تحضير الدروس» list (#preparations_grid + jQuery DataTable stub, .title-text,
//   a[href*=add_preparation]) · «إضافة تحضير» form (labels found by engine.js locate(), lazy jstree lessons tree,
//   #PreparationTitle/#lesson-id, criteria checkboxes, publish date, lecture_timeslots, global check, «حفظ» submit button)
//   · swal2 / alert-danger error messages · login page (input[type=password]).
// Saving the form adds a row to that course's prep list with the submitted title and publish date.
import fs from 'node:fs';

const HOST = 'https://lms.moe.gov.om';
const JQ = fs.readFileSync(new URL('./jq-stub.js', import.meta.url), 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const nowStamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const stripNo = (t) => String(t || '').replace(/^\s*\d+\s*-\s*\d+\s*/, '').trim();

// Noor tree for term 1 from the package: units in order, lesson names without the «1-1» prefix (like t-410).
// opts.rename: { 'file lesson name': 'noor name' } · opts.extra: [{ unit: 'unit text', text, at }] decoy lessons
export function treeFromPackage(pkg, opts = {}) {
  const units = [];
  let nid = 5000;
  for (const l of pkg.lessons) {
    let u = units.find((x) => x.text === l.unit);
    if (!u) { u = { text: l.unit, lessons: [] }; units.push(u); }
    if (u.lessons.some((x) => x.fileLesson === l.lesson)) continue;
    const text = (opts.rename && opts.rename[l.lesson]) || (opts.keepNumbers ? l.lesson : stripNo(l.lesson));
    u.lessons.push({ text, nodeId: String(++nid), fileLesson: l.lesson });
  }
  for (const x of opts.extra || []) {
    const u = units.find((y) => y.text === x.unit);
    const n = { text: x.text, nodeId: String(++nid), fileLesson: null, decoy: true };
    if (x.at != null) u.lessons.splice(x.at, 0, n); else u.lessons.push(n);
  }
  return {
    book: 'الأحياء - الصف التاسع',
    terms: [
      { text: 'الفصل الدراسي الأول', units },
      { text: 'الفصل الدراسي الثاني', units: [
        { text: 'الوحدة السابعة: التكاثر', lessons: [{ text: 'التكاثر اللاجنسي', nodeId: '7001' }, { text: 'التكاثر الجنسي في النبات', nodeId: '7002' }] },
        { text: 'الوحدة الثامنة: الوراثة', lessons: [{ text: 'الكروموسومات والجينات', nodeId: '7003' }] },
      ] },
    ],
  };
}

export function createNoor(cfg) {
  const courses = cfg.courses || [
    { cid: 'BIO9', title: 'الأحياء', level: 'الصف التاسع', subject: 'الأحياء', grade: 'التاسع', tree: cfg.tree },
    { cid: 'BIO10', title: 'الأحياء', level: 'الصف العاشر', subject: 'الأحياء', grade: 'العاشر', tree: cfg.tree },
    { cid: 'CHEM9', title: 'الكيمياء', level: 'الصف التاسع', subject: 'الكيمياء', grade: 'التاسع', tree: cfg.tree },
  ];
  const st = {
    loggedIn: cfg.loggedIn !== false,
    rows: [],          // every prep in Noor: { id, cid, title, lessonId, nodeText, unit, publishDate, created, preexisting, ... }
    posts: [],         // every POST to add_preparation: { n, cid, title, date, outcome }
    events: [],
    nextId: 9000,
    rejectAtFill: new Set(cfg.rejectAtFill || []),   // date popup «التاريخ مستخدم من قبل» right after typing it
    rejectAtSave: new Set(cfg.rejectAtSave || []),   // the save returns the form with that error
    uniqueDates: cfg.uniqueDates !== false,          // Noor refuses two preps with the same publish date in one course
    noPast: cfg.noPast || '',                        // Noor refuses a publish date before this day (its «today»): the save returns the form with that error
    ambiguous: cfg.ambiguous || {},                  // { saveAttemptNo: 'form' | 'abort' | 'form-nosave' } — row saved (or not) but result unclear
    noClassDates: new Set(cfg.noClassDates || []),
    // the teacher's timetable: weekday → [[section, periods that day], …] (default: two sections, one period each, every day);
    // takenSlots: how the form shows a period that already has a prep on that date — 'disable' | 'hide' | 'show' (save then refuses)
    periods: cfg.periods || null,
    sameDaySuffix: cfg.sameDaySuffix !== false,       // Noor numbers a second prep of one lesson on one date itself: «X (2)» sent → «X (2) (2)» stored
    partialForms: cfg.partialForms || 0,             // the first N «إضافة تحضير» pages show lessons under the first unit only (slow Noor tree)
    formRenders: 0,
    takenSlots: cfg.takenSlots || 'disable',
    createdOld: cfg.createdOld || '2026-10-15 09:12',
    showCreated: cfg.showCreated !== false,
  };
  const course = (cid) => courses.find((c) => c.cid === cid);
  const takenOf = (cid) => { const m = {}; st.rows.filter((r) => r.cid === cid && r.publishDate).forEach((r) => { m[r.publishDate] = (m[r.publishDate] || []).concat(r.slots || ['*']); }); return m; };
  const nodeById = (c, id) => { for (const t of c.tree.terms) for (const u of t.units) for (const l of u.lessons) if (l.nodeId === id) return { term: t.text, unit: u.text, ...l }; return null; };
  for (const e of cfg.existing || []) {
    st.rows.push({ id: String(++st.nextId), cid: e.cid || 'BIO9', title: e.title, publishDate: e.publishDate || '', created: e.created || st.createdOld, preexisting: true, lessonId: e.nodeId || '', nodeText: e.title.replace(/\s*\(\d+\)$/, '') });
  }

  const page = (title, body, head = '') => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px Tahoma,sans-serif;margin:16px}label{display:block;margin:4px 0}.ctl-label{font-weight:bold;margin-top:10px}textarea{width:90%;height:40px}
.swal2-popup{position:fixed;top:30%;left:30%;background:#fff;border:2px solid #c00;padding:16px;display:block;z-index:99}
.jstree-node{list-style:none}.jstree-anchor{cursor:pointer;display:inline-block;padding:1px 4px}.jstree-clicked{background:#bdf}
.alert-danger{color:#a00;border:1px solid #a00;padding:6px}</style>${head}</head>
<body><script>var user_id = '99887766';</script><div class="wlc-section"><h1>سالم علي</h1></div>${body}</body></html>`;

  const loginPage = () => page('تسجيل الدخول', `<form method="post" action="${HOST}/users/login"><input name="u"><input type="password" name="p"><button>دخول</button></form>`);

  const homePage = () => page('الرئيسية', courses.map((c) => `<div class="course-box-in-teacher-dashbaord"><div class="main_category_stu_title">${esc(c.title)}</div>
<div class="main_category_level_title">${esc(c.level)}</div><a href="${HOST}/teacher/courses/preparations_index/cid:${c.cid}">تحضير الدروس</a></div>`).join('\n'));

  const listPage = (cid, extra = {}) => {
    const c = course(cid);
    const rows = st.rows.filter((r) => r.cid === cid).slice().reverse()   // newest first, like Noor
      .map((r) => [`<span class="title-text">${esc(r.title)}</span>`, esc(c.subject), esc(c.grade), st.showCreated ? esc(r.created) : '', esc(r.publishDate),
        `<a href="${HOST}/teacher/courses/edit_preparation/${r.id}" data-prep-id="${r.id}">تعديل</a>`]);
    const ok = extra.ok ? `<div class="swal2-popup swal2-icon-success"><h2 class="swal2-title">${esc(extra.ok)}</h2><button type="button" class="swal2-confirm" onclick="this.closest('.swal2-popup').remove()">موافق</button></div>` : '';
    const moved = extra.url ? `<script>history.replaceState(null, '', ${JSON.stringify(extra.url)});</script>` : '';
    return page('تحضير الدروس', `${moved}${ok}<a class="btn" href="${HOST}/teacher/courses/add_preparation/cid:${cid}">إضافة تحضير</a>
<table id="preparations_grid"><thead><tr><th>العنوان</th><th>المادة</th><th>الصف</th><th>تاريخ الإنشاء</th><th>تاريخ النشر</th><th></th></tr></thead><tbody></tbody></table>
<div id="preparations_grid_info"></div>
<script>${JQ}</script>
<script>setTimeout(function(){ jQuery('#preparations_grid').DataTable({ data: ${JSON.stringify(rows)}, pageLength: 10 }); }, 300);</script>`);
  };

  const options = (vals) => vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const union = (k) => [...new Set((cfg.pkg.lessons || []).flatMap((l) => l[k] || []))];
  const formPage = (cid, extra = {}) => {
    const c = course(cid);
    const partial = ++st.formRenders <= st.partialForms;
    const tree = { book: c.tree.book, terms: c.tree.terms.map((t) => ({ text: t.text, units: t.units.map((u, ui) => ({ text: u.text, lessons: partial && ui ? [] : u.lessons.map((l) => ({ text: l.text, nodeId: l.nodeId })) })) })) };
    const err = extra.swal ? `<div class="swal2-popup swal2-icon-error"><h2 class="swal2-title">خطأ</h2><div class="swal2-html-container">${esc(extra.swal)}</div><button type="button" class="swal2-confirm" onclick="this.closest('.swal2-popup').remove()">موافق</button></div>` : '';
    const alertBox = extra.alert ? `<div class="alert alert-danger">${esc(extra.alert)}</div>` : '';
    return page('إضافة تحضير', `${err}${alertBox}
<form id="add_preparation_form" method="post" action="${HOST}/teacher/courses/add_preparation/cid:${cid}">
 <div><span>عنوان الدرس</span> <input id="PreparationTitle" name="data[Preparation][title]" value=""></div>
 <input type="hidden" id="lesson-id" name="data[Preparation][lesson_id]" value="0">
 <div id="jstree_node_tree"><ul class="jstree-container-ul"></ul></div>
 <div class="pub"><span>تاريخ النشر</span> <input type="text" class="pubDateClass" id="publishdate-1" name="data[Preparation][date1][publish_date]" autocomplete="off"></div>
 <div class="timeslots"><label for="AssessmentAssessmentTasks" class="control-label"> <div class="lecture_timeslots_div" id="slots-1"></div> </label></div>
 <label><input type="checkbox" name="data[Preparation][global]" value="1"> تعميم التحضير على كافة الجداول</label>
 <label><input type="checkbox" name="data[Preparation][semester_plan]" value="1" id="semesterPlan"> خطة فصلية</label>
 <label class="ctl-label">المخرجات التعليمية</label>
 <div id="criteria-checkbox"></div>
 <label class="ctl-label">المستوى</label>
 <select multiple size="4" name="data[Preparation][levels][]">${options(['التذكر', 'الفهم', 'التطبيق', 'التحليل', 'التقييم', 'الإبداع'])}</select>
 <label class="ctl-label">الاستراتيجيات</label>
 <select multiple size="4" name="data[Preparation][strategies][]">${options(union('strategies').concat('أخرى'))}</select>
 <input name="data[Preparation][strategies_other]" placeholder="الاستراتيجيات الأخرى">
 <label class="ctl-label">المصادر التعليمية</label>
 <select multiple size="4" name="data[Preparation][resources][]">${options(union('resources').concat('أخرى'))}</select>
 <input name="data[Preparation][resources_other]" placeholder="المصادر الأخرى">
 <label class="ctl-label">المفاهيم</label><textarea name="data[Preparation][concepts]"></textarea>
 <label class="ctl-label">التهيئة</label><textarea name="data[Preparation][intro]"></textarea>
 <label class="ctl-label">إجراءات سير الدرس</label><textarea name="data[Preparation][procedures]"></textarea>
 <label class="ctl-label">التقويم التكويني</label><textarea name="data[Preparation][formative]"></textarea>
 <label class="ctl-label">التقويم الختامي</label><textarea name="data[Preparation][summative]"></textarea>
 <label class="ctl-label">ملاحظات ضمن خطة الدراسة الأسبوعية</label><textarea name="data[Preparation][notes]"></textarea>
 <button type="submit" class="btn btn-primary">حفظ</button>
</form>
<script>
(function(){
  var TREE = ${JSON.stringify(tree)};
  var REJECT = ${JSON.stringify([...st.rejectAtFill])}, NOCLASS = ${JSON.stringify([...st.noClassDates])};
  var CTITLE = ${JSON.stringify(c.subject + ' - ' + c.grade)}, PERIODS = ${JSON.stringify(st.periods)}, TAKEN = ${JSON.stringify(takenOf(cid))}, TAKENMODE = ${JSON.stringify(st.takenSlots)};
  var gen = 0, root = document.querySelector('#jstree_node_tree > ul');
  function node(text, level, nodeId, kind, data) {
    var li = document.createElement('li'); li.className = 'jstree-node jstree-closed'; li.id = 'j1_' + (++gen);
    if (nodeId) li.setAttribute('node_id', nodeId);
    var a = document.createElement('a'); a.className = 'jstree-anchor'; a.setAttribute('aria-level', level); a.textContent = text;
    li.appendChild(a); li._kind = kind; li._data = data; return li;
  }
  function kids(li, list) { var ul = document.createElement('ul'); list.forEach(function (x) { ul.appendChild(x); }); li.appendChild(ul); li.className = 'jstree-node jstree-open'; }
  var book = node(TREE.book, 1, '', 'book'); root.appendChild(book);
  kids(book, TREE.terms.map(function (t) { return node(t.text, 2, '', 'term', t); }));
  function collapse(li) { var ul = li.querySelector(':scope > ul'); if (ul) ul.remove(); li.className = 'jstree-node jstree-closed'; }
  document.getElementById('jstree_node_tree').addEventListener('click', function (e) {
    var a = e.target.closest('a.jstree-anchor'); if (!a) return;
    var li = a.parentElement;
    if (li._kind === 'term') {
      if (li.querySelector(':scope > ul')) return;
      setTimeout(function () { kids(li, li._data.units.map(function (u) { return node(u.text, 3, '', 'unit', u); })); }, 120);
    } else if (li._kind === 'unit') {
      // like Noor: selecting a unit drops the lesson children of every other unit (recreated with new ids later)
      Array.prototype.forEach.call(document.querySelectorAll('#jstree_node_tree li.jstree-node'), function (x) { if (x._kind === 'unit' && x !== li) collapse(x); });
      if (li.querySelector(':scope > ul')) return;
      setTimeout(function () { kids(li, li._data.lessons.map(function (l) { return node(l.text, 4, l.nodeId, 'lesson', l); })); }, 150);
    } else if (li._kind === 'lesson') {
      Array.prototype.forEach.call(document.querySelectorAll('#jstree_node_tree a.jstree-clicked'), function (x) { x.classList.remove('jstree-clicked'); x.removeAttribute('aria-selected'); });
      a.classList.add('jstree-clicked'); a.setAttribute('aria-selected', 'true');
      document.getElementById('PreparationTitle').value = li._data.text;
      document.getElementById('lesson-id').value = li._data.nodeId;
      var box = document.getElementById('criteria-checkbox'); box.innerHTML = '';
      setTimeout(function () {
        box.innerHTML = [1, 2, 3].map(function (k) { return '<label><input type="checkbox" name="data[Preparation][objectives][]" value="' + li._data.nodeId + '-' + k + '"> ناتج ' + k + '</label>'; }).join('');
      }, 200);
    }
  });
  var pub = document.getElementById('publishdate-1');
  pub.addEventListener('change', function () {
    var v = pub.value, slots = document.getElementById('slots-1');
    slots.innerHTML = '';
    if (REJECT.indexOf(v) >= 0) {
      pub.value = '';
      var p = document.createElement('div'); p.className = 'swal2-popup swal2-icon-error';
      p.innerHTML = '<h2 class="swal2-title">تنبيه</h2><div class="swal2-html-container">التاريخ مستخدم من قبل، اختر تاريخًا آخر</div><button type="button" class="swal2-confirm">موافق</button>';
      p.querySelector('.swal2-confirm').onclick = function () { p.remove(); };
      document.body.appendChild(p);
      return;
    }
    // as real Noor (saved pages 2026-10-24): a day without periods shows the notice and a section-only box
    var wd0 = new Date(v + 'T12:00').getDay();
    if (NOCLASS.indexOf(v) >= 0 || (PERIODS && !(PERIODS[wd0] || []).length)) { setTimeout(function () { slots.innerHTML = '<label style="color:#DC143C">لا يوجد فترات زمنية مرتبطة بهذه الحصص </label> <br><label><input style="margin: 0 13px" type="checkbox" class="lecture_timeslots" name="data[plane][date1][section][]" value="8026942">' + CTITLE + ' - 1</label>'; }, 150); return; }
    setTimeout(function () {
      var wd = new Date(v + 'T12:00').getDay(), per = PERIODS ? (PERIODS[wd] || []) : [['1', 1], ['2', 1]], html = '', p0 = 1;
      var tk = TAKEN[v] || [];
      per.forEach(function (x) {
        for (var k = 0; k < x[1]; k++) {
          var val = x[0] + '|' + (p0 + k), taken = tk.indexOf('*') >= 0 || tk.indexOf(val) >= 0;
          if (taken && TAKENMODE === 'hide') continue;
          html += '<div class="checkbox"><input type="checkbox" class="lecture_timeslots' + (taken && TAKENMODE === 'disable' ? ' disabled" disabled="true' : '') + '" name="data[plane][date1][timeslot][]" date-i="1" value="' + val + '"/><label>' + CTITLE + ' - ' + x[0] + ' -  الحصة ' + (p0 + k) + ' </label>' + (taken && TAKENMODE === 'disable' ? '<div style="color: red; font-size: 12px">لا يمكنك نشر التحضير لهذه الحصة في التاريخ المحدد لأن تحضيرًا آخر نُشر عليه</div>' : '') + '</div>';
        }
        p0 += x[1] + 1;
      });
      slots.innerHTML = html;
    }, 150);
  });
})();
</script>`);
  };

  function save(cid, body) {
    const f = new URLSearchParams(body || '');
    const g = (k) => f.get(`data[Preparation][${k}]`) || '';
    const all = (k) => f.getAll(`data[Preparation][${k}][]`);
    const c = course(cid);
    const n = st.posts.length + 1;
    const title = g('title').trim(), lessonId = g('lesson_id'), date = f.get('data[Preparation][date1][publish_date]') || '';
    const post = { n, cid, title, date, lessonId };
    st.posts.push(post);
    const node = nodeById(c, lessonId);
    const missing = [];
    if (!title || !node) missing.push('الدرس');
    if (!date) missing.push('تاريخ النشر');
    const want = f.getAll('data[plane][date1][timeslot][]'), secOnly = f.getAll('data[plane][date1][section][]');
    if (!want.length && !secOnly.length) missing.push('الصفوف');
    if (!all('objectives').length) missing.push('المخرجات');
    if (missing.length) { post.outcome = 'invalid:' + missing.join(','); return { kind: 'form', extra: { alert: 'يجب تعبئة: ' + missing.join('، ') } }; }
    if (st.noPast && date && date < st.noPast) { post.outcome = 'date-past'; return { kind: 'form', extra: { swal: 'لا يمكن اختيار تاريخ سابق لليوم الحالي' } }; }
    if (st.rejectAtSave.has(date)) { post.outcome = 'date-rejected'; return { kind: 'form', extra: { swal: 'لا يمكن إضافة التحضير: التاريخ مستخدم من قبل' } }; }
    // Noor: a second prep on the same date only on a period that has none (a pre-existing prep holds every period of its day)
    if (st.uniqueDates && st.rows.some((r) => r.cid === cid && r.publishDate === date && (!r.slots || r.slots.some((x) => want.includes(x))))) { post.outcome = 'date-dup'; return { kind: 'form', extra: { swal: 'يوجد تحضير مسبق بنفس التاريخ' } }; }
    const amb = st.ambiguous[n];
    if (amb === 'form-nosave') { post.outcome = 'ambiguous-not-saved'; return { kind: 'form', extra: {} }; }
    // real Noor (owner's list 2026-10-26): the second prep of the same lesson on the same date gets « (2)» added to its title
    const sameDay = st.rows.filter((r) => r.cid === cid && r.lessonId === lessonId && r.publishDate === date).length;
    const stored = st.sameDaySuffix && sameDay ? `${title} (${sameDay + 1})` : title;
    const row = {
      id: String(++st.nextId), cid, title: stored, sentTitle: title, dayRank: sameDay + 1, lessonId, nodeText: node.text, unit: node.unit, term: node.term, publishDate: date, created: nowStamp(), post: n,
      concepts: g('concepts'), procedures: g('procedures').slice(0, 80), levels: all('levels'), strategies: all('strategies'), resources: all('resources'),
      timeslots: want.length || secOnly.length, slots: want.length ? want : null, sectionOnly: !want.length, objectives: all('objectives').length, global: g('global') === '1', semesterPlan: g('semester_plan') === '1',
    };
    st.rows.push(row);
    post.outcome = amb ? 'saved-' + amb : 'saved';
    if (amb === 'form') return { kind: 'form', extra: {} };     // saved, but Noor shows the (empty) form again with no message
    if (amb === 'abort') return { kind: 'abort' };               // saved, but the connection dropped (chrome-error page)
    return { kind: 'redirect', to: `${HOST}/teacher/courses/preparations_index/cid:${cid}` };
  }

  async function handle(route) {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname.replace(/\/+$/, '');
    const html = (body, status = 200) => route.fulfill({ status, contentType: 'text/html; charset=utf-8', body });
    st.events.push(req.method() + ' ' + p);
    if (!st.loggedIn && /^\/teacher/.test(p)) return html(loginPage());
    if (p === '/teacher' || p === '/teacher/dashboard') return html(homePage());
    let m = p.match(/^\/teacher\/courses\/preparations_index\/cid:([A-Za-z0-9_-]+)$/);
    if (m && course(m[1])) return html(listPage(m[1]));
    m = p.match(/^\/teacher\/courses\/add_preparation\/cid:([A-Za-z0-9_-]+)$/);
    if (m && course(m[1])) {
      if (req.method() === 'POST') {
        const r = save(m[1], req.postData());
        if (r.kind === 'abort') return route.abort('connectionreset');
        // Playwright cannot fulfil a POST navigation with a 3xx (Chromium shows an error page), so a «redirect» is the list
        // page itself, with Noor's success popup and the address bar moved to the list URL (history.replaceState)
        if (r.kind === 'redirect') return html(listPage(m[1], { ok: 'تم حفظ التحضير بنجاح', url: r.to }));
        return html(formPage(m[1], r.extra));
      }
      return html(formPage(m[1]));
    }
    return html(page('غير موجود', '<p>الصفحة غير موجودة</p>'), 404);
  }
  return { st, handle, course };
}
