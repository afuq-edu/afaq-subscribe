// admin.js — لوحة إدارة منصة أفق: الرموز، المعلمون، الباقات ومحتواها، الفصول، الإعدادات
(function () {
  const A = window.Afaq;
  const { $, $$, esc, toAr, db } = A;
  const D = { packages: [], terms: [], content: [], codes: [], teachers: [] };
  const SITE = location.origin + location.pathname.replace(/admin\.html$/, '');
  const setMsg = (el, kind, html) => { el.hidden = !html; el.className = 'msg ' + (kind || ''); el.innerHTML = html || ''; };
  const termLabel = (t) => (t ? `${A.termName(t.term)} ${toAr(t.year)}` : '');
  const today = () => new Date().toISOString().slice(0, 10);
  const pkgTitle = (id) => (D.packages.find((p) => p.id === id) || {}).title || id;
  const SUBJECT_IDS = { 'اللغة الإنجليزية': 'en', 'اللغة الانجليزية': 'en', 'اللغة العربية': 'ar', 'الرياضيات': 'ma', 'العلوم': 'sc', 'التربية الإسلامية': 'is',
    'الدراسات الاجتماعية': 'ss', 'الهوية والمواطنة': 'ic', 'تقنية المعلومات': 'it', 'الفنون البصرية': 'va', 'التربية البدنية والصحية': 'pe', 'المهارات الموسيقية': 'mu',
    'الفيزياء': 'ph', 'الكيمياء': 'ch', 'الأحياء': 'bi', 'هذا وطني': 'wt' };

  // ================= الدخول =================
  async function gate() {
    if (!db.ready) { document.body.innerHTML = '<main class="wrap"><div class="panel setup"><h2>اضبط config.js أولًا</h2><p class="muted">عنوان مشروع Supabase ومفتاحه، كما في دليل النشر.</p></div></main>'; return; }
    const { data } = await db.client.auth.getSession();
    const s = data.session;
    $('#gate').hidden = !!s; $('#logout').hidden = !s;
    if (!s) { $('#app').hidden = true; $('#denied').hidden = true; return; }
    let me = null;
    try { me = (await db.list('profiles', { eq: { id: s.user.id } }))[0]; } catch (e) {}
    if (!me || !me.is_admin) { $('#denied').hidden = false; $('#app').hidden = true; return; }
    $('#denied').hidden = true; $('#app').hidden = false;
    await loadAll();
    showTab(location.hash.replace('#', '') || 'home');
  }
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error } = await db.client.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) setMsg($('#loginMsg'), 'bad', esc(A.errText(error))); else gate();
  };
  $('#logout').onclick = async () => { await db.client.auth.signOut(); gate(); };

  function showTab(t) {
    if (!$(`[data-pane="${t}"]`)) t = 'home';
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    $$('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    history.replaceState(null, '', '#' + t);
    ({ home: renderHome, codes: renderCodes, teachers: renderTeachers, packages: renderPackages, terms: renderTerms, settings: renderSettings })[t]();
  }
  $$('[data-tab]').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

  async function loadAll() {
    const [packages, terms, content] = await Promise.all([
      db.list('packages', { order: [['sort'], ['subject'], ['grade']] }),
      db.list('terms', { order: [['ends_on', false]] }),
      db.list('package_content', { select: 'package_id,term,lessons_count,sessions_count,updated_at' }),
    ]);
    Object.assign(D, { packages, terms, content });
  }
  // اختيار المدة: فصل بعينه للاشتراك الفصلي، أو عام دراسي للسنوي (القيمة معرّف أحد فصول العام)
  const yearLabel = (y) => `العام الدراسي ${toAr(y)}`;
  const yearEnded = (y) => { const ts = D.terms.filter((t) => t.year === y); return ts.length >= 2 && ts.every((t) => t.ends_on < today()); };
  function fillPeriods(sel, lbl, plan) {
    const cur = currentTerm();
    lbl.textContent = plan === 'year' ? 'العام الدراسي' : 'الفصل';
    if (plan === 'year') {
      const years = [...new Set(D.terms.map((t) => t.year))].sort().reverse();
      sel.innerHTML = years.map((y) => {
        const id = D.terms.filter((t) => t.year === y).sort((a, b) => a.term - b.term)[0].id, ended = yearEnded(y);
        return `<option value="${id}" ${cur && cur.year === y ? 'selected' : ''} ${ended ? 'disabled' : ''}>${esc(yearLabel(y))}${ended ? ' (منتهٍ)' : ''}</option>`;
      }).join('');
    } else {
      sel.innerHTML = D.terms.map((t) => `<option value="${t.id}" ${cur && cur.id === t.id ? 'selected' : ''} ${t.ends_on < today() ? 'disabled' : ''}>${esc(termLabel(t))}${t.ends_on < today() ? ' (منتهٍ)' : ''}</option>`).join('');
    }
  }
  const periodLabel = (plan, termId) => { const t = D.terms.find((x) => x.id === termId); return !t ? '' : plan === 'year' ? 'سنوي — ' + yearLabel(t.year) : 'فصلي — ' + termLabel(t); };
  const currentTerm = () => D.terms.find((t) => t.starts_on <= today() && today() <= t.ends_on) || D.terms.filter((t) => t.ends_on >= today()).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] || D.terms[0];

  // ================= نظرة عامة =================
  async function renderHome() {
    let teachers = [], codes = [], usage = [];
    try { [teachers, codes, usage] = await Promise.all([db.rpc('admin_teachers'), db.list('activation_codes', { select: 'code,redeemed_by,revoked,term_id' }), db.list('usage_log', { select: 'user_id,at', order: [['at', false]], limit: 5000 })]); } catch (e) { A.toast(A.errText(e), 'bad'); }
    D.teachers = teachers;
    const activeSubs = teachers.reduce((n, t) => n + t.subs.filter((s) => s.active).length, 0);
    const activeTeachers = teachers.filter((t) => t.subs.some((s) => s.active)).length;
    const day = Date.now() - 864e5;
    const today24 = usage.filter((u) => new Date(u.at).getTime() > day).length;
    const cur = currentTerm();
    $('#stats').innerHTML = [
      [toAr(teachers.length), 'معلم مسجّل'], [toAr(activeTeachers), 'معلم مشترك الآن'], [toAr(activeSubs), 'اشتراك فعّال'],
      [toAr(teachers.reduce((n, t) => n + t.subs.filter((s) => s.active && s.plan === 'year').length, 0)), 'منها سنوي'],
      [toAr(codes.filter((c) => !c.redeemed_by && !c.revoked).length), 'رمز لم يُفعَّل'], [toAr(today24), 'حصة سُلّمت في ٢٤ ساعة'],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    const st = await A.settings();
    const hints = [];
    if (!D.terms.length) hints.push('أضف الفصل الدراسي الحالي من «الفصول».');
    else if (!cur || cur.ends_on < today()) hints.push('لا فصل حالي أو قادم — أضف الفصل التالي من «الفصول».');
    if (!D.packages.length) hints.push('أضف الباقات من «الباقات والتحاضير».');
    else if (!D.content.length) hints.push('ارفع محتوى التحاضير للباقات من «الباقات والتحاضير».');
    if (!st.whatsapp) hints.push('اكتب رقم واتساب المنصة من «الإعدادات».');
    if (!st.extension_url) hints.push('اكتب رابط الإضافة في متجر كروم من «الإعدادات».');
    setMsg($('#setupHints'), 'warn', hints.length ? '<b>لإكمال الإعداد:</b><br>' + hints.map(esc).join('<br>') : '');
  }

  // ================= الرموز =================
  function pkgPicker(box, selected) {
    const by = new Map();
    D.packages.filter((p) => p.active).forEach((p) => { if (!by.has(p.subject)) by.set(p.subject, []); by.get(p.subject).push(p); });
    box.innerHTML = by.size ? [...by].map(([s, list]) => `<div class="subj"><b>${esc(s)}</b>${list.map((p) => `<label><input type="checkbox" value="${esc(p.id)}" ${selected && selected.includes(p.id) ? 'checked' : ''}>${esc(A.GRADES[p.grade] || p.grade)}</label>`).join('')}</div>`).join('')
      : '<p class="muted small">أضف الباقات أولًا.</p>';
  }
  function codeMessage(c) {
    const t = D.terms.find((x) => x.id === c.term_id);
    let valid = '';
    if (t && c.plan === 'year') {
      const t2 = D.terms.filter((x) => x.year === t.year).sort((a, b) => b.term - a.term)[0];
      valid = `اشتراك سنوي للعام الدراسي ${t.year} (الفصلان الأول والثاني)` + (t2.term === 2 ? `، صالح حتى ${A.dateAr(t2.ends_on)}` : '');
    } else if (t) valid = `اشتراك فصلي، صالح حتى نهاية ${A.termName(t.term)} (${A.dateAr(t.ends_on)})`;
    return [`السلام عليكم أ. ${c.teacher_name}`, 'رمز تفعيل اشتراكك في منصة أفق التعليمية:', c.code, '',
      `الباقات: ${c.package_ids.map(pkgTitle).join('، ')}`, valid, '',
      `للتفعيل: ادخل حسابك في ${SITE}#dashboard ثم اكتب الرمز في «تفعيل رمز».`].filter((x) => x !== null).join('\n');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); A.toast('نُسخت الرسالة.', 'ok'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); A.toast('نُسخت الرسالة.', 'ok'); }
  }
  async function renderCodes() {
    fillPeriods($('#issueTerm'), $('#issueTermLbl'), $('#issuePlan').value);
    pkgPicker($('#issuePkgs'));
    try { D.codes = await db.list('activation_codes', { order: [['created_at', false]], limit: 300 }); } catch (e) { A.toast(A.errText(e), 'bad'); }
    if (!D.teachers.length) { try { D.teachers = await db.rpc('admin_teachers'); } catch (e) {} }
    drawCodes();
  }
  function drawCodes() {
    const q = $('#codeSearch').value.trim().toLowerCase();
    const list = D.codes.filter((c) => !q || c.code.toLowerCase().includes(q) || c.teacher_name.toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 150);
    $('#codesTable').innerHTML = `<tr><th>الرمز</th><th>المعلم</th><th>الباقات</th><th>الحالة</th><th></th></tr>` + (list.length ? list.map((c) => {
      const who = c.redeemed_by ? (D.teachers.find((t) => t.id === c.redeemed_by) || {}).full_name || 'معلم' : '';
      const stt = c.revoked ? '<span class="chip off">ملغى</span>' : c.redeemed_by ? `<span class="chip ok">مُفعَّل</span><br><small class="muted">${esc(who)}<br>${A.dateAr((c.redeemed_at || '').slice(0, 10))}</small>` : '<span class="chip warn">لم يُفعَّل</span>';
      return `<tr><td dir="ltr" style="text-align:right;font-weight:600;white-space:nowrap">${esc(c.code)}</td><td>${esc(c.teacher_name)}${c.phone ? `<br><small class="muted" dir="ltr">${esc(c.phone)}</small>` : ''}${c.note ? `<br><small class="muted">${esc(c.note)}</small>` : ''}</td>
        <td>${c.package_ids.map((id) => `<span class="tag">${esc(pkgTitle(id))}</span>`).join('')}<br><small class="muted">${esc(periodLabel(c.plan, c.term_id))}</small></td>
        <td>${stt}</td><td><div class="inline-acts"><button class="btn sm" data-copy="${esc(c.code)}" type="button">نسخ الرسالة</button>${!c.redeemed_by && !c.revoked ? `<button class="btn sm danger" data-revoke="${esc(c.code)}" type="button">إلغاء</button>` : ''}</div></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">لا رموز بعد.</td></tr>');
    $$('[data-copy]').forEach((b) => { b.onclick = () => copy(codeMessage(D.codes.find((c) => c.code === b.dataset.copy))); });
    $$('[data-revoke]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm(`إلغاء الرمز ${b.dataset.revoke}؟ لن يمكن تفعيله.`)) return;
        try { await db.update('activation_codes', { revoked: true }, { code: b.dataset.revoke }); A.toast('أُلغي الرمز.'); renderCodes(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
  }
  $('#codeSearch').oninput = drawCodes;
  $('#issuePlan').onchange = () => fillPeriods($('#issueTerm'), $('#issueTermLbl'), $('#issuePlan').value);
  $('#issueForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#issueMsg');
    const ids = $$('#issuePkgs input:checked').map((i) => i.value);
    const name = f.teacher_name.value.replace(/\s+/g, ' ').trim();
    if (name.split(' ').length < 2) { setMsg(msg, 'bad', 'اكتب اسم المعلم كما في حسابه (اسمان على الأقل).'); return; }
    if (!ids.length) { setMsg(msg, 'bad', 'اختر باقة واحدة على الأقل.'); return; }
    if (!f.term.value) { setMsg(msg, 'bad', 'أضف فصلًا دراسيًا أولًا.'); return; }
    // تنبيه: المعلم مسجّل باسم مختلف قليلًا؟
    setMsg(msg);
    try {
      const plan = f.plan.value;
      const r = await db.rpc('admin_issue_code', { p_teacher_name: name, p_phone: f.phone.value.trim(), p_term_id: +f.term.value, p_package_ids: ids, p_note: f.note.value.trim() || null, p_count: +f.count.value || 1, p_plan: plan });
      const phone = f.phone.value.replace(/[^\d]/g, '');
      const made = r.codes.map((code) => ({ code, teacher_name: name, term_id: +f.term.value, package_ids: ids, plan }));
      $('#issued').innerHTML = made.map((c, i) => `<div class="issued"><div class="code">${esc(c.code)}</div>
        <div class="inline-acts" style="justify-content:center"><button class="btn sm" data-ci="${i}" type="button">نسخ رسالة المعلم</button>${phone ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${esc(A.waLink(phone, codeMessage(c)))}">أرسلها عبر واتساب</a>` : ''}</div></div>`).join('');
      $$('[data-ci]').forEach((b) => { b.onclick = () => copy(codeMessage(made[+b.dataset.ci])); });
      f.reset(); f.count.value = 1; pkgPicker($('#issuePkgs')); fillPeriods($('#issueTerm'), $('#issueTermLbl'), 'term');
      try { D.codes = await db.list('activation_codes', { order: [['created_at', false]], limit: 300 }); } catch (err) {}
      drawCodes();
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };

  // ================= المعلمون =================
  async function renderTeachers() {
    try { D.teachers = await db.rpc('admin_teachers'); } catch (e) { A.toast(A.errText(e), 'bad'); }
    const gu = $('#grantUser'), keep = gu.value;
    gu.innerHTML = '<option value="">— اختر المعلم —</option>' + D.teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.full_name || t.email)}${t.email ? ' — ' + esc(t.email) : ''}</option>`).join('');
    gu.value = keep;
    pkgPicker($('#grantPkgs'), $$('#grantPkgs input:checked').map((i) => i.value));
    const keepTerm = $('#grantTerm').value;
    fillPeriods($('#grantTerm'), $('#grantTermLbl'), $('#grantPlan').value);
    if (keepTerm && [...$('#grantTerm').options].some((o) => o.value === keepTerm && !o.disabled)) $('#grantTerm').value = keepTerm;
    drawTeachers();
  }
  $('#grantPlan').onchange = () => fillPeriods($('#grantTerm'), $('#grantTermLbl'), $('#grantPlan').value);
  $('#grantForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#grantMsg');
    const ids = $$('#grantPkgs input:checked').map((i) => i.value);
    if (!f.user.value) { setMsg(msg, 'bad', 'اختر المعلم.'); return; }
    if (!f.term.value) { setMsg(msg, 'bad', 'أضف فصلًا دراسيًا أولًا من «الفصول».'); return; }
    if (!ids.length) { setMsg(msg, 'bad', 'اختر باقة واحدة على الأقل.'); return; }
    const t = D.teachers.find((x) => x.id === f.user.value);
    try {
      await db.rpc('admin_grant', { p_user: f.user.value, p_plan: f.plan.value, p_term_id: +f.term.value, p_package_ids: ids });
      setMsg(msg, 'ok', `أُنشئ ${f.plan.value === 'year' ? 'اشتراك سنوي' : 'اشتراك فصلي'} لـ«${esc(t ? t.full_name : '')}» في: ${esc(ids.map(pkgTitle).join('، '))}.`);
      $$('#grantPkgs input:checked').forEach((i) => { i.checked = false; });
      await renderTeachers();
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };
  function drawTeachers() {
    const q = $('#tSearch').value.trim().toLowerCase();
    const list = D.teachers.filter((t) => !q || [t.full_name, t.email, t.phone, t.school].some((x) => String(x || '').toLowerCase().includes(q)));
    $('#tTable').innerHTML = `<tr><th>المعلم</th><th>الاشتراكات</th><th>الاستخدام</th><th></th></tr>` + (list.length ? list.map((t) => `<tr>
      <td><b>${esc(t.full_name || '—')}</b>${t.is_admin ? ' <span class="chip warn">مدير</span>' : ''}<br><small class="muted" dir="ltr">${esc(t.email || '')}</small>${t.phone ? `<br><small class="muted" dir="ltr">${esc(t.phone)}</small>` : ''}${t.school ? `<br><small class="muted">${esc(t.school)}</small>` : ''}</td>
      <td>${t.subs.length ? t.subs.map((s) => `<div style="margin-bottom:4px"><span class="tag">${esc(s.title)}</span> <small class="muted">${A.termName(s.term)} ${esc(toAr(s.year))}</small>${s.plan === 'year' ? ' <span class="chip year">سنوي</span>' : ''} <span class="chip ${s.active ? 'ok' : 'off'}">${s.revoked ? 'ملغى' : s.active ? 'فعّال' : 'منتهٍ'}</span> <button class="btn ghost sm" data-sub="${s.id}" data-rev="${s.revoked ? 0 : 1}" type="button">${s.revoked ? 'استعادة' : 'إلغاء'}</button></div>`).join('') : '<span class="muted small">لا اشتراكات</span>'}</td>
      <td class="small">${toAr(t.used_today)} اليوم<br><span class="muted">${toAr(t.used_total)} إجمالًا</span><br><span class="muted">${toAr(t.devices)} جهاز</span></td>
      <td><div class="inline-acts"><button class="btn sm primary" data-grant="${t.id}" type="button">أضف اشتراكًا</button><button class="btn sm" data-rename="${t.id}" type="button">تعديل الاسم</button>${t.devices ? `<button class="btn sm danger" data-reset="${t.id}" type="button">فصل الأجهزة</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="4" class="empty">لا معلمين بعد.</td></tr>');
    $$('[data-sub]').forEach((b) => {
      b.onclick = async () => {
        const rev = b.dataset.rev === '1';
        if (rev && !confirm('إلغاء هذا الاشتراك؟ تتوقف المادة في إضافة المعلم فورًا.')) return;
        try { await db.update('subscriptions', { revoked: rev }, { id: +b.dataset.sub }); renderTeachers(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
    $$('[data-grant]').forEach((b) => {
      b.onclick = () => { $('#grantUser').value = b.dataset.grant; setMsg($('#grantMsg')); $('#grantPanel').scrollIntoView({ behavior: 'smooth' }); $('#grantPlan').focus(); };
    });
    $$('[data-rename]').forEach((b) => {
      b.onclick = async () => {
        const t = D.teachers.find((x) => x.id === b.dataset.rename);
        const name = prompt('الاسم الجديد كما سيُطابق رموز التفعيل:', t.full_name || '');
        if (!name || !name.trim()) return;
        try { await db.update('profiles', { full_name: name.replace(/\s+/g, ' ').trim() }, { id: t.id }); A.toast('عُدّل الاسم.', 'ok'); renderTeachers(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
    $$('[data-reset]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('فصل كل أجهزة هذا المعلم؟ سيحتاج إلى فتح الموقع لربط الإضافة من جديد.')) return;
        try { const r = await db.rpc('admin_reset_devices', { p_user: b.dataset.reset }); A.toast(`فُصل ${toAr(r.count)} جهاز.`); renderTeachers(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
  }
  $('#tSearch').oninput = drawTeachers;

  // ================= الباقات والمحتوى =================
  function renderPackages() {
    $('#pkgGrade').innerHTML = A.GRADES.slice(1).map((g, i) => `<option value="${i + 1}">${g}</option>`).join('');
    $('#subjList').innerHTML = [...new Set([...Object.keys(SUBJECT_IDS), ...D.packages.map((p) => p.subject)])].map((s) => `<option value="${esc(s)}">`).join('');
    const cnt = (id, t) => D.content.find((c) => c.package_id === id && c.term === t);
    $('#pkgTable').innerHTML = `<tr><th>الباقة</th><th>الفصل الأول</th><th>الفصل الثاني</th><th></th></tr>` + (D.packages.length ? D.packages.map((p) => {
      const cell = (t) => { const c = cnt(p.id, t); return `${c ? `<b>${A.sessionsWord(c.sessions_count)}</b><br><small class="muted">${toAr(c.lessons_count)} درسًا، رُفع ${A.dateAr(c.updated_at.slice(0, 10))}</small><br>` : '<small class="muted">لم يُرفع</small><br>'}<button class="btn sm" data-up="${esc(p.id)}" data-term="${t}" type="button">${c ? 'استبدل' : 'ارفع'}</button>`; };
      return `<tr><td><b>${esc(p.title)}</b><br><small class="muted" dir="ltr">${esc(p.id)}</small>${p.active ? '' : ' <span class="chip off">مخفية</span>'}</td><td>${cell(1)}</td><td>${cell(2)}</td>
        <td><div class="inline-acts"><button class="btn ghost sm" data-toggle="${esc(p.id)}" type="button">${p.active ? 'إخفاء' : 'إظهار'}</button><button class="btn ghost sm danger" data-del="${esc(p.id)}" type="button">حذف</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">لا باقات بعد.</td></tr>');
    $$('[data-up]').forEach((b) => { b.onclick = () => { upTarget = { id: b.dataset.up, term: +b.dataset.term }; $('#pkgFile').value = ''; $('#pkgFile').click(); }; });
    $$('[data-toggle]').forEach((b) => {
      b.onclick = async () => { const p = D.packages.find((x) => x.id === b.dataset.toggle); try { await db.update('packages', { active: !p.active }, { id: p.id }); await loadAll(); renderPackages(); } catch (e) { A.toast(A.errText(e), 'bad'); } };
    });
    $$('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('حذف الباقة ومحتواها؟ لا يمكن حذف باقة لها اشتراكات أو رموز — أخفِها بدلًا من ذلك.')) return;
        try { await db.remove('packages', { id: b.dataset.del }); await loadAll(); renderPackages(); A.toast('حُذفت الباقة.'); }
        catch (e) { A.toast(/foreign key|violates/i.test(String(e.message)) ? 'للباقة اشتراكات أو رموز — أخفِها بدلًا من حذفها.' : A.errText(e), 'bad'); }
      };
    });
  }
  // اقتراح العنوان والرمز من المادة والصف
  const pf = $('#pkgForm');
  let idTouched = false, titleTouched = false;
  pf.pkg_id.oninput = () => { idTouched = true; };
  pf.pkg_title.oninput = () => { titleTouched = true; };
  function suggest() {
    const s = pf.subject.value.trim(), g = +pf.grade.value;
    if (!titleTouched && s) pf.pkg_title.value = `${s} — ${A.GRADES[g]}`;
    if (!idTouched && s) pf.pkg_id.value = `${SUBJECT_IDS[s] || 'sub'}-${g}`;
  }
  pf.subject.oninput = suggest; pf.grade.onchange = suggest;
  pf.onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('#pkgMsg');
    const row = { id: pf.pkg_id.value.trim().toLowerCase(), subject: pf.subject.value.trim(), grade: +pf.grade.value, title: pf.pkg_title.value.trim(), description: pf.description.value.trim() || null };
    if (!row.subject || !row.title) { setMsg(msg, 'bad', 'اكتب المادة والعنوان.'); return; }
    if (!/^[a-z0-9-]{2,30}$/.test(row.id)) { setMsg(msg, 'bad', 'الرمز الثابت: حروف إنجليزية صغيرة وأرقام وشرطة فقط.'); return; }
    if (D.packages.some((p) => p.id === row.id)) { setMsg(msg, 'bad', 'هذا الرمز مستعمل لباقة أخرى.'); return; }
    if (D.packages.some((p) => p.subject === row.subject && p.grade === row.grade)) { setMsg(msg, 'bad', 'لهذه المادة والصف باقة من قبل.'); return; }
    try { await db.insert('packages', row); setMsg(msg, 'ok', `أُضيفت «${esc(row.title)}». ارفع محتواها من الجدول.`); pf.reset(); idTouched = titleTouched = false; await loadAll(); renderPackages(); }
    catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };
  // رفع ملف المادة المصدَّر من «حاضر»
  let upTarget = null;
  $('#pkgFile').onchange = async () => {
    const file = $('#pkgFile').files[0];
    if (!file || !upTarget) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { A.toast('الملف ليس ملف JSON صالحًا.', 'bad'); return; }
    const pkg = data && data.package ? data.package : Array.isArray(data && data.packages) ? (data.packages.length === 1 ? data.packages[0] : null) : data;
    if (!pkg || !Array.isArray(pkg.lessons) || !pkg.lessons.length) { A.toast(Array.isArray(data && data.packages) ? 'هذا ملف نسخة احتياطية فيه أكثر من مادة — صدّر المادة وحدها من صفحتها في «حاضر».' : 'لم أجد حصصًا في الملف. صدّر المادة من صفحتها في «حاضر» ← «تصدير ملف».', 'bad'); return; }
    const noId = pkg.lessons.filter((l) => !l.id).length;
    if (noId) { A.toast(`${toAr(noId)} حصة بلا معرّف في الملف — أعد تصديره من «حاضر».`, 'bad'); return; }
    const lessons = new Set(pkg.lessons.map((l) => (l.unit || '') + '|' + (l.lesson || ''))).size;
    const noProc = pkg.lessons.filter((l) => !String(l.procedures || '').trim()).length;
    const noOut = pkg.lessons.filter((l) => !(Array.isArray(l.outcomes) ? l.outcomes.length : String(l.outcomes || '').trim())).length;
    const p = D.packages.find((x) => x.id === upTarget.id);
    const warn = [noProc ? `${A.sessionsWord(noProc)} بلا «سير الدرس»` : '', noOut ? `${A.sessionsWord(noOut)} بلا «المخرجات»` : ''].filter(Boolean).join('، ');
    if (!confirm(`رفع «${pkg.title || file.name}» إلى «${p.title}» — ${A.termName(upTarget.term)}:\n${A.sessionsWord(pkg.lessons.length)} في ${toAr(lessons)} درسًا.${warn ? '\nتنبيه: ' + warn + '.' : ''}\nيستبدل المحتوى الحالي لهذا الفصل. متابعة؟`)) return;
    try {
      const r = await db.rpc('admin_upload_content', { p_package: upTarget.id, p_term: upTarget.term, p_pkg: pkg });
      A.toast(`رُفع: ${A.sessionsWord(r.sessions)} في ${toAr(r.lessons)} درسًا.`, 'ok');
      await loadAll(); renderPackages();
    } catch (e) { A.toast(A.errText(e), 'bad'); }
  };

  // ================= الفصول =================
  function renderTerms() {
    const t0 = today();
    $('#termTable').innerHTML = `<tr><th>الفصل</th><th>البداية</th><th>النهاية</th><th></th></tr>` + (D.terms.length ? D.terms.map((t) => `<tr>
      <td><b>${esc(termLabel(t))}</b> ${t.starts_on <= t0 && t0 <= t.ends_on ? '<span class="chip ok">الحالي</span>' : t.ends_on < t0 ? '<span class="chip off">منتهٍ</span>' : '<span class="chip warn">قادم</span>'}</td>
      <td><input type="date" value="${t.starts_on}" data-tid="${t.id}" data-k="starts_on"></td><td><input type="date" value="${t.ends_on}" data-tid="${t.id}" data-k="ends_on"></td>
      <td><button class="btn sm" data-save="${t.id}" type="button">احفظ</button></td></tr>`).join('') : '<tr><td colspan="4" class="empty">لا فصول بعد.</td></tr>');
    $$('[data-save]').forEach((b) => {
      b.onclick = async () => {
        const id = +b.dataset.save;
        const v = (k) => $(`input[data-tid="${id}"][data-k="${k}"]`).value;
        if (v('ends_on') < v('starts_on')) { A.toast('النهاية قبل البداية.', 'bad'); return; }
        try { await db.update('terms', { starts_on: v('starts_on'), ends_on: v('ends_on') }, { id }); A.toast('حُفظت التواريخ. تسري على كل اشتراكات هذا الفصل.', 'ok'); await loadAll(); renderTerms(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
  }
  $('#termForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#termMsg');
    const row = { year: f.year.value.trim(), term: +f.term.value, starts_on: f.starts_on.value, ends_on: f.ends_on.value };
    if (!/^\d{4}\/\d{4}$/.test(row.year)) { setMsg(msg, 'bad', 'العام بصيغة 2026/2027.'); return; }
    if (!row.starts_on || !row.ends_on || row.ends_on < row.starts_on) { setMsg(msg, 'bad', 'حدد البداية والنهاية (النهاية بعد البداية).'); return; }
    try { await db.insert('terms', row); setMsg(msg, 'ok', 'أُضيف الفصل.'); f.reset(); await loadAll(); renderTerms(); }
    catch (err) { setMsg(msg, 'bad', /duplicate|unique/i.test(String(err.message)) ? 'هذا الفصل موجود من قبل — عدّل تواريخه من الجدول.' : esc(A.errText(err))); }
  };

  // ================= الإعدادات =================
  async function renderSettings() {
    const rows = await db.list('settings');
    const f = $('#setForm');
    rows.forEach((r) => { if (f[r.key]) f[r.key].value = r.value; });
  }
  $('#setForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#setMsg');
    const keys = ['site_name', 'whatsapp', 'extension_url', 'announcement', 'daily_limit', 'max_devices', 'price_term', 'price_year'];
    const vals = Object.fromEntries(keys.map((k) => [k, f[k].value.trim()]));
    for (const k of ['price_term', 'price_year']) {
      if (vals[k] && !A.priceNum(vals[k])) { setMsg(msg, 'bad', 'السعر رقم، مثل 5 أو 4.5'); return; }
      vals[k] = vals[k] ? String(A.priceNum(vals[k])) : '';
    }
    vals.whatsapp = vals.whatsapp.replace(/[^\d]/g, '');
    if (vals.whatsapp && vals.whatsapp.length < 10) { setMsg(msg, 'bad', 'رقم واتساب بالصيغة الدولية، مثل 9689xxxxxxx.'); return; }
    if (vals.extension_url && !/^https:\/\//.test(vals.extension_url)) { setMsg(msg, 'bad', 'رابط المتجر يبدأ بـ https://'); return; }
    try { await db.upsert('settings', keys.map((k) => ({ key: k, value: vals[k] }))); setMsg(msg, 'ok', 'حُفظت الإعدادات.'); } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };

  gate();
})();
