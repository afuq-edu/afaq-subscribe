// app.js — موقع منصة أفق: الصفحة الرئيسية، الحساب، لوحة المعلم، وربط إضافة «حاضر»
(function () {
  const A = window.Afaq;
  const { $, $$, esc, toAr, db } = A;
  const VIEWS = ['setup', 'home', 'login', 'register', 'forgot', 'newpass', 'dash'];
  const S = { session: null, profile: null, settings: null, catalog: [], subs: [], picked: new Set(), plan: 'term', recovering: false, autoLinked: false };
  const PICKS_KEY = 'afaqPicks';

  // ================= التنقل =================
  function show(v) { VIEWS.forEach((x) => { const el = $('#view-' + x); if (el) el.hidden = x !== v; }); }
  function setMsg(el, kind, html) { el.hidden = !html; el.className = 'msg ' + (kind || ''); el.innerHTML = html || ''; }
  function focusFirst(view) { const i = $('#view-' + view + ' input'); if (i) setTimeout(() => i.focus(), 30); }
  async function route() {
    if (!db.ready) { show('setup'); return; }
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (S.recovering) { show('newpass'); focusFirst('newpass'); return; }
    if (['login', 'register', 'forgot'].includes(h)) {
      if (S.session && h !== 'forgot') { location.hash = '#dashboard'; return; }
      show(h); window.scrollTo(0, 0); focusFirst(h); return;
    }
    if (h === 'newpass') { show(S.session ? 'newpass' : 'login'); return; }
    if (h === 'dashboard') {
      if (!S.session) { location.hash = '#login'; return; }
      show('dash'); window.scrollTo(0, 0); renderDash(); return;
    }
    show('home');
    if (h) { const el = document.getElementById(h); if (el) el.scrollIntoView(); } else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  function renderNav() {
    const on = !!S.session;
    $('#navLogin').hidden = on;
    $('#navDash').hidden = !on;
    $('#navAdmin').hidden = !(S.profile && S.profile.is_admin);
    const cta = $('#heroCta');
    cta.textContent = on ? 'افتح حسابك' : 'أنشئ حسابك';
    cta.href = on ? '#dashboard' : '#register';
  }

  // ================= الأفق: حصص الفصل تُحفظ واحدة بعد أخرى =================
  function drawHorizon() {
    const box = $('#horizon');
    if (!box) return;
    const N = 56, y = 112, x0 = 955, x1 = 150;
    let ticks = '';
    for (let i = 0; i < N; i++) {
      const x = x0 - (i * (x0 - x1)) / (N - 1);
      ticks += `<rect class="tick" x="${(x - 3).toFixed(1)}" y="${y - 30}" width="6" height="24" rx="3"/>`;
    }
    box.innerHTML = `<svg viewBox="0 0 1000 160" aria-hidden="true">
      <line class="hline" x1="20" y1="${y}" x2="985" y2="${y}"/>
      <path class="sun" d="M30 ${y} a44 44 0 0 1 88 0 z"/>
      <line class="ray" x1="74" y1="${y - 58}" x2="74" y2="${y - 70}"/>
      <line class="ray" x1="38" y1="${y - 44}" x2="29" y2="${y - 53}"/>
      <line class="ray" x1="110" y1="${y - 44}" x2="119" y2="${y - 53}"/>
      ${ticks}
      <text class="lbl" x="${x0}" y="${y + 30}" text-anchor="middle">بداية الفصل</text>
      <text class="lbl" x="74" y="${y + 30}" text-anchor="middle">نهاية الفصل</text>
      <text class="count" id="hzCount" x="${x0}" y="${y - 46}" text-anchor="end"></text>
    </svg>`;
    const rects = $$('.tick', box), count = $('#hzCount', box);
    const label = (k) => (k >= N ? `اكتمل الفصل: حُفظت ${A.sessionsWord(N)}` : `حُفظت ${A.sessionsWord(k)}`);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { rects.forEach((r) => r.classList.add('on')); count.textContent = label(N); return; }
    let k = 0;
    count.textContent = 'تُحفظ الحصص…';
    setTimeout(function step() {
      if (k >= N) return;
      rects[k].classList.add('on'); k++;
      count.textContent = label(k);
      setTimeout(step, k < 6 ? 140 : 42);
    }, 600);
  }

  // ================= الباقات والطلب عبر واتساب =================
  const guessTerm = () => { const m = new Date().getMonth() + 1; return m >= 2 && m <= 6 ? 2 : 1; };
  async function loadCatalog() {
    const box = $('#catalog');
    try { S.catalog = await db.rpc('catalog'); } catch (e) { box.innerHTML = `<p class="msg bad">${esc(A.errText(e))}</p>`; return; }
    if (!S.catalog.length) { box.innerHTML = '<div class="empty"><b>تُضاف الباقات قريبًا</b>تواصل معنا عبر واتساب لمعرفة المواد المتاحة.</div>'; return; }
    const bySubject = new Map();
    S.catalog.forEach((p) => { if (!bySubject.has(p.subject)) bySubject.set(p.subject, []); bySubject.get(p.subject).push(p); });
    box.innerHTML = [...bySubject].map(([subj, list]) => `<div class="subject"><h3>${esc(subj)}</h3><div class="grades">${
      list.sort((a, b) => a.grade - b.grade).map((p) => {
        const ready = (p.terms || []).map((t) => t.term);
        const t = ready.length ? 'جاهز: ' + ready.map((n) => 'ف' + toAr(n)).join(' و') : 'قيد الإعداد';
        return `<button type="button" class="grade" data-id="${esc(p.id)}" aria-pressed="${S.picked.has(p.id)}" title="${esc(p.title)}">${esc(A.GRADES[p.grade] || p.grade)}<span class="t ${ready.length ? '' : 'none'}">${t}</span></button>`;
      }).join('')}</div></div>`).join('');
    $$('.grade', box).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        if (S.picked.has(id)) S.picked.delete(id); else S.picked.add(id);
        b.setAttribute('aria-pressed', S.picked.has(id));
        renderBasket();
      };
    });
    renderBasket();
  }
  // خطط الاشتراك: فصلي أو سنوي، بسعر الباقة الواحدة من الإعدادات
  function renderPlans() {
    const st = S.settings || {};
    const pt = A.priceNum(st.price_term), py = A.priceNum(st.price_year);
    $('#priceTerm').innerHTML = pt ? `${A.money(pt)} <small>للباقة</small>` : '';
    $('#priceYear').innerHTML = py ? `${A.money(py)} <small>للباقة</small>` : '';
    const save = pt && py && py < pt * 2 ? pt * 2 - py : 0;
    $('#saveYear').hidden = !save;
    $('#saveYear').textContent = save ? `توفّر ${A.money(save)} عن فصلين منفصلين` : '';
    $$('.plan').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.plan === S.plan); });
  }
  $$('.plan').forEach((b) => { b.onclick = () => { S.plan = b.dataset.plan; renderPlans(); renderBasket(); }; });
  function planPrice(plan) { const st = S.settings || {}; return A.priceNum(plan === 'year' ? st.price_year : st.price_term); }
  function pickedTitles() { return [...S.picked].map((id) => (S.catalog.find((p) => p.id === id) || {}).title).filter(Boolean); }
  function renderBasket() {
    const n = S.picked.size;
    $('#basket').hidden = !n;
    if (!n) return;
    $('#basketWhat').innerHTML = `<b>${A.planName(S.plan)}</b> — ${n === 1 ? 'باقة واحدة' : n === 2 ? 'باقتان' : toAr(n) + ' باقات'}: ${esc(pickedTitles().join('، '))}`;
    $('#basketTermWrap').hidden = S.plan === 'year';
    const price = planPrice(S.plan);
    $('#basketTotal').hidden = !price;
    $('#basketTotal').textContent = price ? 'المجموع: ' + A.money(price * n) : '';
  }
  function requestText(titles, term, plan) {
    const p = S.profile || {};
    const email = S.session && S.session.user ? S.session.user.email : '';
    const price = planPrice(plan);
    return ['السلام عليكم، أرغب في الاشتراك في منصة أفق التعليمية.', `الاسم: ${p.full_name || ''}`, p.phone ? `الهاتف: ${p.phone}` : '', email ? `البريد المسجّل: ${email}` : '',
      `نوع الاشتراك: ${plan === 'year' ? 'سنوي (الفصلان الأول والثاني)' : 'فصلي'}`,
      `الباقات (${titles.length}):`, ...titles.map((t) => `- ${t}`), plan === 'year' ? '' : `الفصل: ${A.termName(term)}`,
      price ? `المجموع: ${A.money(price * titles.length)}` : ''].filter(Boolean).join('\n');
  }
  async function sendRequest(titles, term, plan) {
    const st = await A.settings();
    if (!st.whatsapp) { A.toast('لم يُضبط رقم واتساب المنصة بعد.', 'bad'); return; }
    window.open(A.waLink(st.whatsapp, requestText(titles, term, plan)), '_blank', 'noopener');
  }
  $('#basketTerm').value = String(guessTerm());
  $('#basketSend').onclick = async () => {
    const term = +$('#basketTerm').value;
    if (!S.session) {
      // الرمز يُصدر باسم المعلم: الحساب أولًا، ثم يُرسل الطلب من لوحة المعلم
      sessionStorage.setItem(PICKS_KEY, JSON.stringify({ ids: [...S.picked], term, plan: S.plan }));
      A.toast('أنشئ حسابك أولًا ليصدر الرمز باسمك، ثم أرسل طلبك من حسابك.');
      location.hash = '#register';
      return;
    }
    sendRequest(pickedTitles(), term, S.plan);
  };

  // ================= الحساب =================
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#loginMsg'), btn = $('button[type=submit]', f);
    setMsg(msg);
    btn.disabled = true;
    try {
      const { error } = await db.client.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) throw error;
      location.hash = '#dashboard';
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
    btn.disabled = false;
  };
  $('#regForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#regMsg'), btn = $('button[type=submit]', f);
    const name = f.full_name.value.replace(/\s+/g, ' ').trim();
    if (name.split(' ').length < 3) { setMsg(msg, 'bad', 'اكتب اسمك الثلاثي على الأقل، كما تريده في رمز التفعيل.'); f.full_name.focus(); return; }
    if (!/^\+?[\d\s]{8,15}$/.test(f.phone.value.trim())) { setMsg(msg, 'bad', 'اكتب رقم هاتف صحيحًا (واتساب).'); f.phone.focus(); return; }
    if (!f.email.value.includes('@')) { setMsg(msg, 'bad', 'اكتب بريدًا إلكترونيًا صحيحًا.'); f.email.focus(); return; }
    if (f.password.value.length < 6) { setMsg(msg, 'bad', 'كلمة المرور ستة أحرف على الأقل.'); f.password.focus(); return; }
    setMsg(msg);
    btn.disabled = true;
    try {
      const { data, error } = await db.client.auth.signUp({
        email: f.email.value.trim(), password: f.password.value,
        options: { data: { full_name: name, phone: f.phone.value.trim(), school: f.school.value.trim() }, emailRedirectTo: location.origin + location.pathname + '#dashboard' },
      });
      if (error) throw error;
      if (data.session) location.hash = '#dashboard';
      else { setMsg(msg, 'ok', `أرسلنا رسالة تأكيد إلى <b dir="ltr">${esc(f.email.value.trim())}</b>. افتحها واضغط رابط التأكيد، ثم سجّل الدخول.`); f.reset(); }
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
    btn.disabled = false;
  };
  $('#forgotForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#forgotMsg');
    try {
      const { error } = await db.client.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      setMsg(msg, 'ok', 'إن كان البريد مسجّلًا فسيصلك رابط خلال دقائق.');
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };
  $('#newpassForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#newpassMsg');
    if (f.password.value.length < 6) { setMsg(msg, 'bad', 'كلمة المرور ستة أحرف على الأقل.'); return; }
    try {
      const { error } = await db.client.auth.updateUser({ password: f.password.value });
      if (error) throw error;
      S.recovering = false;
      A.toast('حُفظت كلمة المرور الجديدة.', 'ok');
      location.hash = '#dashboard';
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
  };
  $('#logout').onclick = async () => {
    await db.client.auth.signOut();
    location.hash = '#';
  };

  // ================= لوحة المعلم =================
  async function loadProfile() {
    if (!S.session) { S.profile = null; return; }
    try { S.profile = (await db.list('profiles', { eq: { id: S.session.user.id } }))[0] || null; } catch (e) { S.profile = null; }
  }
  async function renderDash() {
    if (!S.profile) await loadProfile();
    const p = S.profile || {};
    $('#hello').textContent = 'أهلًا، ' + ((p.full_name || '').split(' ')[0] || 'بك');
    $('#whoEmail').textContent = S.session.user.email;
    $('#pName').textContent = p.full_name || '—';
    $('#pPhone').textContent = p.phone || '—';
    $('#pSchool').textContent = p.school || '—';
    // طلب محفوظ من قبل التسجيل؟
    let pend = null;
    try { pend = JSON.parse(sessionStorage.getItem(PICKS_KEY) || 'null'); } catch (e) {}
    const notice = $('#dashNotice');
    if (pend && pend.ids && pend.ids.length) {
      if (!S.catalog.length) { try { S.catalog = await db.rpc('catalog'); } catch (e) {} }
      const titles = pend.ids.map((id) => (S.catalog.find((x) => x.id === id) || {}).title).filter(Boolean);
      notice.hidden = !titles.length;
      notice.className = 'msg ok';
      notice.innerHTML = `طلبك جاهز: ${esc(titles.join('، '))} — ${pend.plan === 'year' ? 'اشتراك سنوي' : 'اشتراك فصلي، ' + A.termName(pend.term)}. <button class="btn wa sm" id="sendPend" type="button">أرسله عبر واتساب</button>`;
      const b = $('#sendPend');
      if (b) b.onclick = () => { sendRequest(titles, pend.term, pend.plan || 'term'); sessionStorage.removeItem(PICKS_KEY); notice.hidden = true; };
    } else notice.hidden = true;
    await Promise.all([renderSubs(), renderDevices()]);
    renderExt(true);
  }

  async function renderSubs() {
    const box = $('#subs');
    try { S.subs = await db.rpc('my_subscriptions'); } catch (e) { box.innerHTML = `<p class="msg bad">${esc(A.errText(e))}</p>`; return; }
    $('#nameLock').textContent = S.subs.length ? 'اسمك مرتبط برموز التفعيل، ولتعديله تواصل مع منصة أفق.' : '';
    if (!S.subs.length) {
      box.innerHTML = '<div class="empty"><b>لا اشتراكات بعد</b>اختر باقاتك واطلب رمز التفعيل عبر واتساب، ثم فعّله من هنا.</div>';
      return;
    }
    const today = new Date();
    box.innerHTML = S.subs.map((s) => {
      const st = s.revoked ? ['off', 'ملغى'] : !s.active ? ['off', 'منتهٍ'] : !s.ready ? ['warn', 'فعّال، والتحاضير قيد الإعداد'] : ['ok', 'فعّال'];
      const a = new Date(s.starts_on + 'T00:00'), b = new Date(s.ends_on + 'T23:59');
      const pct = Math.max(0, Math.min(100, ((today - a) / (b - a)) * 100));
      return `<div class="sub">
        <div class="head"><b>${esc(s.title)}</b><span class="muted small">${A.termName(s.term)} ${esc(toAr(s.year))}</span>${s.plan === 'year' ? '<span class="chip year">سنوي</span>' : ''}<span class="chip ${st[0]}">${st[1]}</span></div>
        <div class="termbar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i><b style="right:${pct.toFixed(1)}%"></b></div>
        <div class="meta"><span>${s.active ? 'ينتهي ' + A.dateAr(s.ends_on) : 'انتهى ' + A.dateAr(s.ends_on)}</span><span>${s.active ? 'باقٍ ' + A.daysWord(s.days_left) : ''}${s.active && s.sessions ? ' — ' + A.sessionsWord(s.sessions) : ''}</span></div>
      </div>`;
    }).join('');
  }

  const CODE_ERR = {
    invalid: 'هذا الرمز غير صحيح. تأكد من كتابته كما وصلك.',
    revoked: 'هذا الرمز أُلغي. تواصل مع منصة أفق.',
    used: 'هذا الرمز مستعمل في حساب آخر.',
    expired: 'انتهت مدة هذا الرمز (الفصل أو العام الذي صدر له).',
    too_many: 'محاولات خاطئة كثيرة. أعد المحاولة بعد ساعة.',
    login: 'سجّل الدخول أولًا.',
  };
  $('#codeForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#codeMsg'), btn = $('button', f);
    const code = f.code.value.trim();
    if (!code) { f.code.focus(); return; }
    btn.disabled = true;
    try {
      const r = await db.rpc('redeem_code', { p_code: code });
      if (r.ok) {
        setMsg(msg, 'ok', `✓ فُعّل ${r.plan === 'year' ? 'اشتراكك السنوي' : 'اشتراكك'} في: ${esc(r.packages.join('، '))}، حتى ${A.dateAr(r.ends_on)}.`);
        f.reset();
        await renderSubs();
        const p = await A.ext.ping();
        if (p && p.linked) { const s = await A.ext.sync(); if (s && s.ok) A.toast('حُدّثت المواد في الإضافة.', 'ok'); }
        renderExt(true);
      } else if (r.error === 'name') {
        setMsg(msg, 'bad', `هذا الرمز صادر باسم «${esc(r.code_name)}»، واسم حسابك «${esc(r.account_name)}». إن كان الاسمان لك فتواصل مع منصة أفق لتصحيحه.`);
      } else setMsg(msg, 'bad', esc(CODE_ERR[r.error] || 'تعذّر التفعيل.'));
    } catch (err) { setMsg(msg, 'bad', esc(A.errText(err))); }
    btn.disabled = false;
  };

  async function renderDevices() {
    const ul = $('#devices');
    let list = [];
    try { list = (await db.list('devices', { select: 'id,label,created_at,last_seen,revoked_at', eq: { user_id: S.session.user.id }, order: [['last_seen', false]] })).filter((d) => !d.revoked_at); } catch (e) {}
    const st = await A.settings();
    $('#devHint').textContent = `يمكن ربط ${+st.max_devices === 1 ? 'جهاز واحد' : +st.max_devices === 2 ? 'جهازين' : toAr(st.max_devices) + ' أجهزة'} بحسابك؛ ربط جهاز زائد يفصل أقدمها.`;
    if (!list.length) { ul.innerHTML = '<li><span class="muted">لا أجهزة مرتبطة بعد.</span></li>'; return; }
    ul.innerHTML = list.map((d) => `<li><span>${esc(d.label || 'جهاز')}<br><small class="muted">آخر استخدام ${A.dateAr((d.last_seen || d.created_at || '').slice(0, 10))}</small></span><button class="btn ghost sm" data-unlink="${esc(d.id)}" type="button">فصل</button></li>`).join('');
    $$('[data-unlink]', ul).forEach((b) => {
      b.onclick = async () => {
        if (!confirm('فصل هذا الجهاز؟ لن تعمل الإضافة عليه حتى تربطها من جديد.')) return;
        try { await db.rpc('unlink_device', { p_id: b.dataset.unlink }); A.toast('فُصل الجهاز.'); renderDevices(); renderExt(false); } catch (e) { A.toast(A.errText(e), 'bad'); }
      };
    });
  }

  // ================= الإضافة =================
  const sameName = (a, b) => String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();
  async function renderExt(auto) {
    const box = $('#extState');
    const st = await A.settings();
    if (!A.ext.supported()) {
      box.innerHTML = '<div class="state"><span class="dot warn"></span><div>افتح الموقع من متصفح <b>كروم</b> أو <b>إيدج</b> على الحاسوب لتعمل الأداة.</div></div>';
      return;
    }
    const p = await A.ext.ping();
    if (!p) {
      box.innerHTML = `<div class="state"><span class="dot"></span><div><b>الإضافة غير مثبتة في هذا المتصفح.</b><br><span class="muted small">ثبّتها مرة واحدة من متجر كروم، ثم ارجع إلى هذه الصفحة.</span></div></div>
        <div class="inline-acts">${st.extension_url ? `<a class="btn primary" href="${esc(st.extension_url)}" target="_blank" rel="noopener">ثبّت «حاضر» من المتجر</a>` : ''}<button class="btn" id="extRecheck" type="button">ثبّتُّها، أعد الفحص</button></div>`;
      $('#extRecheck').onclick = () => renderExt(true);
      return;
    }
    const mine = p.linked && sameName(p.name, S.profile && S.profile.full_name);
    const activeSubs = S.subs.filter((s) => s.active).length;
    if (!mine) {
      // فتح الموقع يكفي: تُربط الإضافة بالحساب تلقائيًا مرة واحدة إن كان للمعلم اشتراك فعّال
      if (auto && activeSubs && !S.autoLinked) { S.autoLinked = true; await linkExt(); return; }
      box.innerHTML = `<div class="state"><span class="dot warn"></span><div><b>الإضافة مثبتة${p.linked ? ' ومرتبطة بحساب آخر' : ' وغير مرتبطة بحسابك'}.</b><br><span class="muted small">${activeSubs ? 'اربطها لتصلها موادك.' : 'فعّل اشتراكك أولًا، ثم اربطها.'}</span></div></div>
        <div class="inline-acts"><button class="btn primary" id="extLink" type="button">اربط الإضافة بحسابي</button></div>`;
      $('#extLink').onclick = linkExt;
      return;
    }
    const n = p.packages || 0;
    box.innerHTML = `<div class="state"><span class="dot ok"></span><div><b>الإضافة مرتبطة بحسابك وجاهزة.</b><br><span class="muted small">${n ? `فيها ${n === 1 ? 'باقة واحدة' : n === 2 ? 'باقتان' : toAr(n) + ' باقات'} من اشتراكك.` : 'لا باقات جاهزة فيها بعد.'} افتح منصة نور واضغط «حاضر» ثم «تحضير فصل كامل».</span></div></div>
      <div class="inline-acts"><a class="btn primary" href="https://lms.moe.gov.om/teacher" target="_blank" rel="noopener">افتح منصة نور</a><button class="btn" id="extSync" type="button">حدّث المواد</button></div>`;
    $('#extSync').onclick = async () => {
      const r = await A.ext.sync();
      if (r && r.ok) { A.toast('حُدّثت المواد في الإضافة.', 'ok'); renderExt(false); }
      else A.toast(extErr(r), 'bad');
    };
  }
  function extErr(r) {
    const e = r && r.error;
    return e === 'unlinked' ? 'فُصلت الإضافة عن حسابك — اربطها من جديد.' : e === 'network' ? 'تعذّر اتصال الإضافة بالخادم.' : 'تعذّر التحديث، أعد المحاولة.';
  }
  async function linkExt() {
    const box = $('#extState');
    box.innerHTML = '<p class="muted">أربط الإضافة بحسابك…</p>';
    try {
      const r = await db.rpc('link_device', { p_label: A.deviceLabel() });
      const res = await A.ext.link(r.token, S.profile.full_name);
      if (!res || !res.ok) { A.toast(res ? extErr(res) : 'لم تردّ الإضافة. أعد تحميل الصفحة.', 'bad'); }
      else A.toast(r.dropped ? 'رُبطت الإضافة، وفُصل جهاز أقدم.' : 'رُبطت الإضافة بحسابك.', 'ok');
    } catch (e) { A.toast(A.errText(e), 'bad'); }
    await renderDevices();
    renderExt(false);
  }

  // ================= البداية =================
  async function boot() {
    drawHorizon();
    if (!db.ready) { route(); return; }
    const st = await A.settings();
    S.settings = st;
    if (st.site_name) { $('#siteName').textContent = st.site_name; $('#footName').textContent = st.site_name; }
    if (st.announcement) { $('#announce').hidden = false; $('#announce').textContent = st.announcement; }
    if (st.whatsapp) { const w = $('#footWa'); w.hidden = false; w.href = A.waLink(st.whatsapp, 'السلام عليكم، لدي استفسار عن منصة أفق التعليمية.'); w.target = '_blank'; w.rel = 'noopener'; }
    try { const pend = JSON.parse(sessionStorage.getItem(PICKS_KEY) || 'null'); if (pend) { pend.ids.forEach((id) => S.picked.add(id)); $('#basketTerm').value = String(pend.term); if (pend.plan) S.plan = pend.plan; } } catch (e) {}
    renderPlans();
    const { data } = await db.client.auth.getSession();
    S.session = data.session;
    await loadProfile();
    renderNav();
    db.client.auth.onAuthStateChange(async (ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { S.recovering = true; S.session = session; route(); return; }
      const changed = (S.session && S.session.user.id) !== (session && session.user.id);
      S.session = session;
      if (changed) { S.profile = null; await loadProfile(); renderNav(); route(); }
    });
    route();
    loadCatalog();
  }
  boot();
})();
