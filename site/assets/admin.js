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
    ({ home: renderHome, stats: renderStats, requests: renderRequests, teachers: renderTeachers, packages: renderPackages, terms: renderTerms, settings: renderSettings })[t]();
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
  // حساب المدير: يربط «حاضر» في هذا المتصفح بحساب المدير، فتُفتح فيه كل المواد
  $('#ownerLink').onclick = async () => {
    const b = $('#ownerLink');
    if (!(await A.ext.ping())) { A.toast('لم أجد «حاضر» في هذا المتصفح. ثبّتها من صفحة «تثبيت الإضافة»، ثم اضغط الزر من جديد.', 'bad'); return; }
    b.disabled = true;
    try {
      const r = await db.rpc('link_device', { p_label: A.deviceLabel() });
      const res = await A.ext.link(r.token, 'المدير');
      if (res && res.ok) A.toast('تم. افتح «حاضر» واختر أي صف ومادة.', 'ok');
      else A.toast('رُبطت «حاضر» بحسابك. افتحها واختر أي صف ومادة.', 'ok');
    } catch (e) { A.toast(A.errText(e), 'bad'); }
    b.disabled = false;
  };
  async function renderHome() {
    let teachers = [], usage = [];
    try { [teachers, usage] = await Promise.all([db.rpc('admin_teachers'), db.list('usage_log', { select: 'user_id,at', order: [['at', false]], limit: 5000 })]); } catch (e) { A.toast(A.errText(e), 'bad'); }
    D.teachers = teachers;
    const activeSubs = teachers.reduce((n, t) => n + t.subs.filter((s) => s.active).length, 0);
    const activeTeachers = teachers.filter((t) => t.subs.some((s) => s.active)).length;
    const day = Date.now() - 864e5;
    const today24 = usage.filter((u) => new Date(u.at).getTime() > day).length;
    const cur = currentTerm();
    $('#stats').innerHTML = [
      [toAr(teachers.length), 'معلم مسجّل'], [toAr(activeTeachers), 'معلم مشترك الآن'], [toAr(activeSubs), 'اشتراك فعّال'],
      [toAr(teachers.reduce((n, t) => n + t.subs.filter((s) => s.active && s.plan === 'year').length, 0)), 'منها سنوي'],
      [toAr(today24), 'حصة سُلّمت في ٢٤ ساعة'],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    const st = await A.settings();
    const hints = [];
    try { D.requests = await db.rpc('admin_requests'); } catch (e) { D.requests = null; }
    reqBadge();
    if (D.requests && D.requests.some((r) => r.status === 'requested')) hints.push(`${toAr(D.requests.filter((r) => r.status === 'requested').length)} طلب بانتظار التفعيل في «طلبات حاضر».`);
    if (!D.terms.length) hints.push('أضف الفصل الدراسي الحالي من «الفصول».');
    else if (!cur || cur.ends_on < today()) hints.push('لا فصل حالي أو قادم — أضف الفصل التالي من «الفصول».');
    if (!D.packages.length) hints.push('أضف الباقات من «الباقات والتحاضير».');
    else if (!D.content.length) hints.push('ارفع محتوى التحاضير للباقات من «الباقات والتحاضير».');
    if (!st.whatsapp) hints.push('اكتب رقم واتساب المنصة من «الإعدادات».');
    if (!/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//.test(st.extension_url || '')) hints.push('اكتب رابط الإضافة في متجر كروم من «الإعدادات».');
    setMsg($('#setupHints'), 'warn', hints.length ? '<b>لإكمال الإعداد:</b><br>' + hints.map(esc).join('<br>') : '');
  }

  // ================= الإحصاءات =================
  const waPhone = (p) => { const x = String(p || '').replace(/[^\d]/g, '').replace(/^0+/, ''); return x.length === 8 ? '968' + x : x; };
  async function renderStats() {
    let reqs = [], teachers = [], st = {};
    try { [reqs, teachers, st] = await Promise.all([db.rpc('admin_requests'), db.rpc('admin_teachers').catch(() => []), A.settings()]); } catch (e) { A.toast(A.errText(e), 'bad'); }
    D.requests = reqs; reqBadge();
    const lim = +st.trial_lessons || 3;
    const live = reqs.filter((r) => r.status !== 'cancelled');
    const by = (s) => live.filter((r) => r.status === s).length;
    const active = by('active');
    const pct = live.length ? Math.round((active / live.length) * 100) : 0;
    $('#stStats').innerHTML = [
      [toAr(Math.max(teachers.filter((t) => !t.is_admin).length, live.length)), 'معلم مسجّل'],
      [toAr(by('trial')), 'يجرّب الآن'], [toAr(by('requested')), 'بانتظار التفعيل'], [toAr(active), 'اشترك من الإضافة'],
      [toAr(pct) + '٪', 'نسبة من اشترك بعد التجربة'], [toAr(live.filter((r) => r.referred_by).length), 'جاء بدعوة زميل'],
    ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
    // المواد: كم معلمًا اختارها، وكم اشترك فيها، وكم أنهى تجربتها
    // التجربة ٣ حصص للمعلم في كل المواد معًا: أنهاها من بلغ مجموع ما استعمله الحد
    const usedAll = (r) => r.packages.filter((p) => !p.active).reduce((n, p) => n + (p.used || 0), 0);
    const subj = new Map();
    live.forEach((r) => r.packages.forEach((p) => {
      const x = subj.get(p.id) || { title: p.title, n: 0, act: 0, done: 0 };
      x.n++; if (p.active) x.act++; else if (p.used && usedAll(r) >= lim) x.done++;
      subj.set(p.id, x);
    }));
    const rows = [...subj.values()].sort((a, b) => b.n - a.n || b.act - a.act);
    $('#stSubjects').innerHTML = '<tr><th>المادة</th><th>اختارها</th><th>اشترك</th><th>أنهى التجربة ولم يشترك</th></tr>' + (rows.length
      ? rows.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td>${toAr(x.n)}</td><td>${toAr(x.act)}</td><td>${toAr(x.done)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">لا طلبات بعد.</td></tr>');
    // أنهوا التجربة ولم يشتركوا
    const stopped = live.filter((r) => r.status !== 'active' && usedAll(r) >= lim)
      .sort((a, b) => String(b.last_seen || b.created_at).localeCompare(String(a.last_seen || a.created_at)));
    $('#stStopped').innerHTML = '<tr><th>الطلب</th><th>المعلم</th><th>المواد</th><th>آخر نشاط</th><th></th></tr>' + (stopped.length
      ? stopped.map((r) => `<tr><td><b>${toAr(r.id)}</b></td><td><b>${esc(r.name || '—')}</b>${r.phone ? `<br><small class="muted" dir="ltr">${esc(r.phone)}</small>` : ''}</td>
        <td>${r.packages.filter((p) => !p.active && p.used).map((p) => `<span class="tag">${esc(p.title)}</span>`).join(' ')}</td>
        <td><small class="muted">${esc(ago(r.last_seen || r.created_at))}</small>${r.status === 'requested' ? '<br><span class="chip bad">راسلك</span>' : ''}</td>
        <td>${r.phone ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${esc(A.waLink(waPhone(r.phone), `السلام عليكم أ. ${r.name}، جرّبت «حاضر» في ${r.packages.filter((p) => !p.active).map((p) => p.title).join('، ')}. هل تحب أن أفعّل لك الاشتراك لتكمل تحضير الفصل؟ رقم طلبك ${r.id}.`))}">تابِع على واتساب</a>` : '<small class="muted">بلا هاتف</small>'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">لا أحد حتى الآن.</td></tr>');
    // الدعوات
    const inv = live.filter((r) => r.invited > 0).sort((a, b) => b.invited_active - a.invited_active || b.invited - a.invited);
    $('#stRefNote').textContent = `خصم الدعوة الحالي: ${st.referral_discount || 'غير محدد'} (من «الإعدادات») — لصاحب الدعوة ولزميله عند اشتراك الزميل.`;
    $('#stRefs').innerHTML = '<tr><th>صاحب الدعوة</th><th>دعا</th><th>اشترك منهم</th><th>خصم مستحق</th></tr>' + (inv.length
      ? inv.map((r) => `<tr><td><b>${esc(r.name)}</b> <small class="muted">طلب ${toAr(r.id)}</small></td><td>${toAr(r.invited)}</td><td>${toAr(r.invited_active)}</td><td>${r.invited_active ? `<span class="chip ok">${toAr(r.invited_active)} × ${esc(st.referral_discount || '')}</span>` : '<span class="muted small">—</span>'}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">لا دعوات بعد.</td></tr>');
  }

  // ================= طلبات «حاضر» =================
  const SHIFT_AR = { one: 'فترة واحدة', two: 'فترتان' };
  const REQ_ST = { trial: ['warn', 'يجرّب'], requested: ['bad', 'بانتظار التفعيل'], active: ['ok', 'مفعّل'], cancelled: ['off', 'ملغى'] };
  function reqBadge() {
    const n = (D.requests || []).filter((r) => r.status === 'requested' || r.status === 'trial' || r.noor_wait).length;
    $('#reqBadge').hidden = !n; $('#reqBadge').textContent = toAr(n);
  }
  async function renderRequests() {
    try { D.requests = await db.rpc('admin_requests'); } catch (e) { D.requests = []; A.toast(/admin_requests|function/i.test(String(e.message)) ? 'طلبات «حاضر» غير مفعّلة في قاعدة البيانات بعد (hader-direct.sql).' : A.errText(e), 'bad'); }
    reqBadge();
    drawRequests();
  }
  const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 2 ? 'الآن' : m < 60 ? `قبل ${toAr(m)} دقيقة` : m < 1440 ? `قبل ${toAr(Math.round(m / 60))} ساعة` : A.dateAr(iso.slice(0, 10)); };
  function drawRequests() {
    const q = $('#reqSearch').value.trim().toLowerCase(), f = $('#reqFilter').value;
    const list = (D.requests || []).filter((r) => (f === 'all' || (f === 'open' ? ['trial', 'requested'].includes(r.status) || !!r.noor_wait : r.status === f))
      && (!q || String(r.id).includes(q) || (r.name || '').toLowerCase().includes(q) || (r.phone || '').includes(q)));
    $('#reqTable').innerHTML = `<tr><th>الطلب</th><th>المعلم</th><th>المواد (حصص التجربة)</th><th>الحالة</th><th></th></tr>` + (list.length ? list.map((r) => {
      const [cls, lbl] = REQ_ST[r.status] || ['', r.status];
      const pend = r.packages.filter((p) => !p.active);
      // جهاز جديد أو إعادة تثبيت = طلب جديد بالاسم نفسه؛ نُظهر ذلك ليقرّر المدير
      const nm = (r.name || '').replace(/\s+/g, ' ').trim(), prev = nm ? (D.requests || []).filter((x) => x.id !== r.id && x.status === 'active' && (x.name || '').replace(/\s+/g, ' ').trim() === nm).length : 0;
      return `<tr><td><b style="font-size:18px">${toAr(r.id)}</b><br><small class="muted">${esc(ago(r.requested_at || r.created_at))}</small></td>
        <td><b>${esc(r.name || '—')}</b>${r.noor_name ? `<br><small class="muted">حساب نور: ${esc(r.noor_name)}</small>` : ''}${r.noor_wait ? `<br><span class="chip bad" title="اسم حساب نور يختلف عن اسم المعلم المسجّل، والتعبئة متوقفة حتى تسمح">يطلب حساب نور: ${esc(r.noor_wait)}</span>` : ''}${prev ? `<br><span class="chip warn" title="على الأغلب جهاز جديد أو إعادة تثبيت">مُفعَّل له من قبل (${toAr(prev)})</span>` : ''}${r.phone ? `<br><small class="muted" dir="ltr">${esc(r.phone)}</small>` : ''}${r.referred_by ? `<br><span class="chip ok" title="خصم الدعوة له ولصاحب الدعوة عند الاشتراك">مدعو من ${esc(r.ref_name || '')} (${toAr(r.referred_by)})</span>` : ''}${r.invited ? `<br><span class="chip">دعا ${toAr(r.invited)} · اشترك ${toAr(r.invited_active)}</span>` : ''}<br><small class="muted">${esc(SHIFT_AR[r.shift] || '')}${r.devices ? ` · ${toAr(r.devices)} جهاز` : ''}${r.last_seen ? ` · آخر نشاط ${esc(ago(r.last_seen))}` : ''}</small></td>
        <td>${r.packages.map((p) => `<div style="margin-bottom:3px"><span class="tag">${esc(p.title)}</span> ${p.active ? '<span class="chip ok">مشترك</span>' : `<small class="muted">${A.sessionsWord(p.used)}</small>`}</div>`).join('') || '<span class="muted small">—</span>'}</td>
        <td><span class="chip ${cls}">${lbl}</span></td>
        <td><div class="inline-acts">
          ${pend.length && r.status !== 'cancelled' ? `<button class="btn sm primary" data-act="${r.id}" type="button">فعّل</button>` : ''}
          ${r.phone ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${esc(A.waLink(r.phone.replace(/^0+/, '').length === 8 ? '968' + r.phone.replace(/^0+/, '') : r.phone, `السلام عليكم أ. ${r.name}، بخصوص طلبك رقم ${r.id} في «حاضر».`))}">واتساب</a>` : ''}
          <button class="btn ghost sm" data-unl="${r.id}" type="button" title="يصفّر محاولات التسجيل اليوم لجهاز هذا الطلب وشبكته">تصفير المحاولات</button>
          ${r.noor_wait ? `<button class="btn sm primary" data-noorok="${r.id}" type="button" title="يصير حساب نور هذا هو حساب اشتراك المعلم">اسمح بحساب نور</button>` : ''}
          ${r.noor_name ? `<button class="btn ghost sm" data-noor="${r.id}" type="button" title="غيّر المعلم حسابه في نور: يُربط بأول حساب نور باسمه يُعبَّأ له">فكّ ربط نور</button>` : ''}
          ${r.status === 'cancelled' ? `<button class="btn ghost sm" data-rst="${r.id}" data-to="trial" type="button">استعادة</button>` : `<button class="btn ghost sm danger" data-rst="${r.id}" data-to="cancelled" type="button">إلغاء</button>`}
        </div></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty">لا طلبات هنا.</td></tr>');
    $$('[data-act]').forEach((b) => {
      b.onclick = async () => {
        const r = D.requests.find((x) => x.id === +b.dataset.act);
        b.disabled = true;
        // ضغطة واحدة: اشتراك فصل كامل في مواد الطلب، وتفتح في إضافة المعلم وحدها
        try { await db.rpc('admin_activate_request', { p_id: r.id, p_plan: 'term', p_package_ids: null }); A.toast(`فُعّل اشتراك ${r.name || 'المعلم'} لهذا الفصل.`, 'ok'); renderRequests(); } catch (e) { b.disabled = false; A.toast(A.errText(e), 'bad'); }
      };
    });
    $$('[data-noor]').forEach((b) => {
      b.onclick = async () => {
        try { await db.rpc('admin_noor_reset', { p_id: +b.dataset.noor }); A.toast('فُكّ الربط، ويُربط بأول حساب نور باسم المعلم يُعبَّأ له.', 'ok'); renderRequests(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
    $$('[data-noorok]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try { await db.rpc('admin_noor_allow', { p_id: +b.dataset.noorok }); A.toast('سُمح بحساب نور، وتكمل إضافة المعلم التعبئة وحدها.', 'ok'); renderRequests(); } catch (e) { b.disabled = false; A.toast(A.errText(e), 'bad'); }
      };
    });
    $$('[data-unl]').forEach((b) => {
      b.onclick = async () => {
        try { await db.rpc('admin_unlock_network', { p_id: +b.dataset.unl }); A.toast('صُفّرت المحاولات، ويمكن التسجيل من هذا الجهاز الآن.', 'ok'); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
    $$('[data-rst]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.to === 'cancelled' && !confirm('إلغاء الطلب؟ تتوقف تجربته المجانية (ولا تُلغى اشتراكاته المفعّلة).')) return;
        try { await db.rpc('admin_set_request', { p_id: +b.dataset.rst, p_status: b.dataset.to }); renderRequests(); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
  }
  $('#reqSearch').oninput = drawRequests;
  $('#reqFilter').onchange = drawRequests;
  setInterval(() => { if (!$('[data-pane="requests"]').hidden) renderRequests(); }, 60000);

  // ================= أدوات مشتركة =================
  function pkgPicker(box, selected) {
    const by = new Map();
    // مربع واحد لكل مادة وصف: الاشتراك يشمل الفترة الواحدة والفترتين معًا (تُضاف الأخرى في القاعدة تلقائيًا)
    const seen = new Set();
    D.packages.filter((p) => p.active).sort((a, b) => (a.shift === 'two') - (b.shift === 'two')).forEach((p) => {
      const k = p.subject + '|' + p.grade; if (seen.has(k)) return; seen.add(k);
      if (!by.has(p.subject)) by.set(p.subject, []); by.get(p.subject).push(p);
    });
    box.innerHTML = by.size ? [...by].map(([s, list]) => `<div class="subj"><b>${esc(s)}</b>${list.map((p) => `<label><input type="checkbox" value="${esc(p.id)}" ${selected && selected.includes(p.id) ? 'checked' : ''}>${esc(A.GRADES[p.grade] || p.grade)}</label>`).join('')}</div>`).join('')
      : '<p class="muted small">أضف الباقات أولًا.</p>';
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); A.toast('نُسخت الرسالة.', 'ok'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); A.toast('نُسخت الرسالة.', 'ok'); }
  }
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
      const sh = p.shift || 'both';
      return `<tr><td><b>${esc(p.title)}</b><br><small class="muted" dir="ltr">${esc(p.id)}</small>${p.active ? '' : ' <span class="chip off">مخفية</span>'}<br><select class="sm" data-shift="${esc(p.id)}" title="نوع المدرسة" style="margin-top:4px;max-width:170px">${[['both', 'كل المدارس'], ['one', 'فترة واحدة (٤٠ د)'], ['two', 'فترتان (٣٥ د)']].map(([v, l]) => `<option value="${v}" ${v === sh ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td>${cell(1)}</td><td>${cell(2)}</td>
        <td><div class="inline-acts"><button class="btn ghost sm" data-toggle="${esc(p.id)}" type="button">${p.active ? 'إخفاء' : 'إظهار'}</button><button class="btn ghost sm danger" data-del="${esc(p.id)}" type="button">حذف</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">لا باقات بعد.</td></tr>');
    $$('[data-shift]').forEach((sel) => {
      sel.onchange = async () => { try { await db.update('packages', { shift: sel.value }, { id: sel.dataset.shift }); A.toast('حُفظ نوع المدرسة.', 'ok'); await loadAll(); } catch (e) { A.toast(A.errText(e), 'bad'); renderPackages(); } };
    });
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
    const row = { id: pf.pkg_id.value.trim().toLowerCase(), subject: pf.subject.value.trim(), grade: +pf.grade.value, title: pf.pkg_title.value.trim(), description: pf.description.value.trim() || null, shift: pf.shift.value || 'both' };
    if (!row.subject || !row.title) { setMsg(msg, 'bad', 'اكتب المادة والعنوان.'); return; }
    if (!/^[a-z0-9-]{2,30}$/.test(row.id)) { setMsg(msg, 'bad', 'الرمز الثابت: حروف إنجليزية صغيرة وأرقام وشرطة فقط.'); return; }
    if (D.packages.some((p) => p.id === row.id)) { setMsg(msg, 'bad', 'هذا الرمز مستعمل لباقة أخرى.'); return; }
    if (D.packages.some((p) => p.subject === row.subject && p.grade === row.grade && ((p.shift || 'both') === 'both' || row.shift === 'both' || p.shift === row.shift))) { setMsg(msg, 'bad', 'لهذه المادة والصف باقة من قبل لنفس نوع المدرسة (غيّر «نوع المدرسة» في الباقة الموجودة من الجدول أولًا).'); return; }
    try { await db.insert('packages', row); setMsg(msg, 'ok', `أُضيفت «${esc(row.title)}». ارفع محتواها من الجدول.`); pf.reset(); idTouched = titleTouched = false; await loadAll(); renderPackages(); }
    catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };
  // فك ملف ‎.hadir‎ المشفّر — الخوارزمية نفسها في extension/packages.js (PBKDF2-SHA256 ‏150000 ← AES-GCM 256)
  const isHadirEncrypted = (x) => !!(x && x.app === 'hadir' && x.type === 'package' && x.data && x.salt && x.iv);
  async function decryptHadir(file, password) {
    const unb64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password).normalize('NFKC').trim()), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(file.salt), iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  // رفع ملف المادة المصدَّر من «حاضر»
  let upTarget = null;
  $('#pkgFile').onchange = async () => {
    const file = $('#pkgFile').files[0];
    if (!file || !upTarget) return;
    let data;
    $('#pkgFile').value = '';   // ليُقبل الملف نفسه مرة أخرى (بعد كلمة سر خاطئة مثلًا)
    try { data = JSON.parse(await file.text()); } catch (e) { A.toast('الملف ليس ملف حاضر (.hadir) ولا JSON صالحًا.', 'bad'); return; }
    // ملف ‎.hadir‎: مشفّر بكلمة سر (يُفك هنا في المتصفح كما تفعل «حاضر») أو غير مشفّر
    if (isHadirEncrypted(data)) {
      const pw = prompt(`«${(data.meta && data.meta.title) || file.name}» محمي بكلمة سر. اكتب كلمة السر التي صُدّر بها:`);
      if (pw == null) return;
      try { data = await decryptHadir(data, pw); } catch (e) { A.toast('كلمة السر غير صحيحة، أو الملف تالف.', 'bad'); return; }
    }
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

  // رفع دفعة: ملف ‎.zip‎ أو عدة ملفات ‎.json‎، كل ملف مادة كاملة فيها id وsubject وgradeNum وshift وterm
  async function unzip(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
    let e = buf.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('ملف ‎.zip‎ تالف');
    const out = [];
    for (let i = 0, p = dv.getUint32(e + 16, true), n = dv.getUint16(e + 10, true); i < n; i++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      if (!/\.json$/i.test(name) || /(^|\/)\./.test(name)) continue;
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = buf.subarray(start, start + size);
      const data = method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      out.push({ name: name.split('/').pop(), text: new TextDecoder().decode(data) });
    }
    return out;
  }
  $('#bulkBtn').onclick = () => { $('#bulkFile').value = ''; $('#bulkFile').click(); };
  $('#bulkFile').onchange = async () => {
    const msg = $('#bulkMsg'), btn = $('#bulkBtn');
    const picked = [...$('#bulkFile').files];
    if (!picked.length) return;
    let files = [];
    try { for (const f of picked) files.push(...(/\.zip$/i.test(f.name) ? await unzip(f) : [{ name: f.name, text: await f.text() }])); }
    catch (e) { setMsg(msg, 'bad', 'تعذّر فتح الملف: ' + esc(e.message || e)); return; }
    const items = [], bad = [];
    for (const f of files) {
      let p; try { p = JSON.parse(f.text); } catch (e) { bad.push(f.name + ': ليس JSON'); continue; }
      const term = /الثاني/.test(String(p.term || '')) || +p.term === 2 ? 2 : 1;
      if (!p || !/^[a-z0-9-]{2,30}$/.test(String(p.id || '')) || !p.subject || !(+p.gradeNum >= 1 && +p.gradeNum <= 12) || !['one', 'two'].includes(p.shift) || !Array.isArray(p.lessons) || !p.lessons.length || p.lessons.some((l) => !l.id)) { bad.push(f.name + ': ينقصه رمز الباقة أو المادة أو الصف أو نوع المدرسة أو الحصص'); continue; }
      items.push({ name: f.name, pkg: p, term });
    }
    if (!items.length) { setMsg(msg, 'bad', 'لا ملفات صالحة.' + (bad.length ? '<br>' + bad.map(esc).join('<br>') : '')); return; }
    const isNew = items.filter((x) => !D.packages.some((p) => p.id === x.pkg.id)).length;
    if (!confirm(`رفع ${toAr(items.length)} ملفًا: ${toAr(items.length - isNew)} باقة موجودة يُستبدل محتواها، و${toAr(isNew)} باقة جديدة.${bad.length ? `\nسيُتجاوز ${toAr(bad.length)} ملفًا غير صالح.` : ''}\nمتابعة؟`)) return;
    btn.disabled = true;
    const done = [], fail = [...bad];
    for (const [i, x] of items.entries()) {
      const p = x.pkg, ex = D.packages.find((k) => k.id === p.id);
      setMsg(msg, '', `جارٍ الرفع ${toAr(i + 1)} من ${toAr(items.length)}: ${esc(p.title || p.id)}…`);
      try {
        const sh = p.shift === 'two' ? ' (فترتان)' : p.shift === 'one' ? ' (فترة واحدة)' : '';
        const title = (p.title || `${p.subject} — ${A.GRADES[+p.gradeNum]}`).replace(/\s*\((?:فترتان|فترة واحدة)\)$/, '') + sh;
        if (ex) { if (ex.shift !== p.shift) await db.update('packages', { shift: p.shift }, { id: p.id }); }
        else { await db.insert('packages', { id: p.id, subject: p.subject, grade: +p.gradeNum, title, shift: p.shift }); D.packages.push({ id: p.id, subject: p.subject, grade: +p.gradeNum, title, shift: p.shift, active: true }); }
        const r = await db.rpc('admin_upload_content', { p_package: p.id, p_term: x.term, p_pkg: p });
        done.push(`${p.id}: ${A.sessionsWord(r.sessions)}`);
      } catch (e) { fail.push(`${x.name}: ${A.errText(e)}`); }
    }
    // من اشترك في باقة صارت «فترة واحدة» يحصل على نسختها «فترتان» أيضًا (إلا معلم الفترة الواحدة)
    let copied = 0;
    try { copied = (await db.rpc('admin_copy_shift_subs', {})).subs || 0; } catch (e) { fail.push('نقل الاشتراكات إلى باقات الفترتين: ' + A.errText(e)); }
    btn.disabled = false;
    setMsg(msg, fail.length ? 'bad' : 'ok', `رُفع ${toAr(done.length)} من ${toAr(items.length)}.` + (copied ? ` وأُضيف ${toAr(copied)} اشتراكًا في باقات «فترتان» لمشتركي الباقات القديمة.` : '') + (fail.length ? '<br>لم يُرفع:<br>' + fail.map(esc).join('<br>') : ''));
    await loadAll(); renderPackages();
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
    const keys = ['site_name', 'whatsapp', 'extension_url', 'announcement', 'daily_limit', 'max_devices', 'price_term', 'price_year', 'holidays', 'referral_discount', 'youtube_url', 'min_ext_version'];
    const vals = Object.fromEntries(keys.map((k) => [k, f[k].value.trim()]));
    for (const k of ['price_term', 'price_year']) {
      if (vals[k] && !A.priceNum(vals[k])) { setMsg(msg, 'bad', 'السعر رقم، مثل 5 أو 4.5'); return; }
      vals[k] = vals[k] ? String(A.priceNum(vals[k])) : '';
    }
    vals.whatsapp = vals.whatsapp.replace(/[^\d]/g, '').replace(/^00/, '');   // wa.me لا يقبل 00 قبل رمز الدولة
    if (vals.whatsapp && vals.whatsapp.length < 10) { setMsg(msg, 'bad', 'رقم واتساب بالصيغة الدولية، مثل 9689xxxxxxx.'); return; }
    if (vals.min_ext_version && !/^\d+(\.\d+)*$/.test(vals.min_ext_version)) { setMsg(msg, 'bad', 'رقم النسخة مثل 4.9.18'); return; }
    vals.youtube_url = (vals.youtube_url || '').trim();
    if (vals.youtube_url && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(vals.youtube_url)) { setMsg(msg, 'bad', 'ضع رابط فيديو من يوتيوب يبدأ بـ https://youtu.be/ أو https://www.youtube.com/'); return; }
    if (vals.extension_url && !/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)\//.test(vals.extension_url)) { setMsg(msg, 'bad', 'ضع رابط صفحة الإضافة في متجر كروم (chromewebstore.google.com)، أو اتركه فارغًا ما دامت الإضافة لم تُنشر.'); return; }
    try { await db.upsert('settings', keys.map((k) => ({ key: k, value: vals[k] }))); setMsg(msg, 'ok', 'حُفظت الإعدادات.'); } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };

  gate();
})();
