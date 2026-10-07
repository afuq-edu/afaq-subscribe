// common.js — مشترك بين الموقع ولوحة الإدارة: الاتصال بـSupabase، أدوات العرض، والتواصل مع إضافة «حاضر»
(function () {
  const CFG = window.AFAQ_CONFIG || {};
  const configured = CFG.SUPABASE_URL && !/YOUR-PROJECT/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(CFG.SUPABASE_ANON_KEY);
  const sb = configured && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const GRADES = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const termName = (t) => (+t === 1 ? 'الفصل الأول' : 'الفصل الثاني');
  const planName = (p) => (p === 'year' ? 'اشتراك سنوي' : 'اشتراك فصلي');
  // السعر بالريال العماني: «٥ ر.ع.»، و«٤٫٥ ر.ع.»
  const priceNum = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };
  const money = (n) => toAr(String(Math.round(n * 1000) / 1000)).replace('.', '٫') + ' ر.ع.';
  const dateAr = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${toAr(d)} ${MONTHS[m - 1]} ${toAr(y)}`; };
  const daysWord = (n) => (n === 0 ? 'ينتهي اليوم' : n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${toAr(n)} أيام` : `${toAr(n)} يومًا`);
  const sessionsWord = (n) => (n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n <= 10 ? `${toAr(n)} حصص` : `${toAr(n)} حصة`);

  function toast(text, kind) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.className = 'toast show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, 4200);
  }

  // أخطاء Supabase بلغة المستخدم
  function errText(e) {
    const m = String((e && (e.message || e.error_description || e.error)) || e || '');
    if (/Invalid login credentials/i.test(m)) return 'البريد أو كلمة المرور غير صحيحة.';
    if (/Email not confirmed/i.test(m)) return 'أكّد بريدك الإلكتروني أولًا من الرسالة التي وصلتك.';
    if (/User already registered|already been registered/i.test(m)) return 'هذا البريد مسجّل من قبل — سجّل الدخول بدلًا من ذلك.';
    if (/Password should be at least/i.test(m)) return 'كلمة المرور قصيرة — ستة أحرف على الأقل.';
    if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة متتالية — انتظر دقيقة ثم أعد المحاولة.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'تعذّر الاتصال بالخادم — تحقق من الإنترنت.';
    if (/[؀-ۿ]/.test(m)) return m;
    return 'حدث خطأ: ' + m;
  }

  // طبقة البيانات (كل الوصول إلى Supabase يمر من هنا)
  const db = {
    ready: !!sb,
    client: sb,
    async rpc(fn, args) { const { data, error } = await sb.rpc(fn, args || {}); if (error) throw error; return data; },
    async list(table, opts = {}) {
      let q = sb.from(table).select(opts.select || '*');
      if (opts.eq) Object.entries(opts.eq).forEach(([k, v]) => { q = q.eq(k, v); });
      (opts.order || []).forEach(([col, asc]) => { q = q.order(col, { ascending: asc !== false }); });
      if (opts.limit) q = q.limit(opts.limit);
      const { data, error } = await q; if (error) throw error; return data || [];
    },
    async insert(table, row) { const { data, error } = await sb.from(table).insert(row).select(); if (error) throw error; return data; },
    async upsert(table, rows) { const { data, error } = await sb.from(table).upsert(rows).select(); if (error) throw error; return data; },
    async update(table, patch, match) {
      let q = sb.from(table).update(patch); Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      const { data, error } = await q.select(); if (error) throw error; return data;
    },
    async remove(table, match) {
      let q = sb.from(table).delete(); Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      const { error } = await q; if (error) throw error;
    },
  };

  // الإعدادات العامة (اسم الموقع، واتساب، رابط الإضافة، إعلان)
  let settingsCache = null;
  async function settings() {
    if (settingsCache) return settingsCache;
    const out = { site_name: 'منصة أفق التعليمية', whatsapp: '', extension_url: '', announcement: '', max_devices: '2', price_term: '', price_year: '' };
    try { (await db.list('settings')).forEach((r) => { out[r.key] = r.value; }); } catch (e) {}
    settingsCache = out;
    return out;
  }
  const waLink = (number, text) => `https://wa.me/${String(number || '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;

  // ---------- جسر إضافة «حاضر» (externally_connectable) ----------
  // EXTENSION_ID نص أو قائمة (نسخة المتجر ونسخة التجربة): أول إضافة مثبّتة تردّ هي المعتمدة
  const extIds = [].concat(CFG.EXTENSION_ID || []).filter((x) => x && !/YOUR-EXT/.test(x));
  let extId = null;
  async function extSend(msg, timeout = 2500) {
    if (extId) return extSendTo(extId, msg, timeout);
    for (const id of extIds) {
      const r = await extSendTo(id, msg, timeout);
      if (r) { extId = id; return r; }
    }
    return null;
  }
  function extSendTo(id, msg, timeout) {
    return new Promise((res) => {
      const rt = window.chrome && window.chrome.runtime;
      if (!id || !rt || !rt.sendMessage) { res(null); return; }
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res(null); } }, timeout);
      try {
        rt.sendMessage(id, msg, (reply) => {
          if (done) return; done = true; clearTimeout(t);
          void (rt.lastError);   // الإضافة غير مثبتة
          res(reply || null);
        });
      } catch (e) { done = true; clearTimeout(t); res(null); }
    });
  }
  const ext = {
    ping: () => extSend({ type: 'afaqPing' }),
    link: (token, name) => extSend({ type: 'afaqLink', token, name }, 20000),
    sync: () => extSend({ type: 'afaqSync' }, 20000),
    unlink: () => extSend({ type: 'afaqUnlink' }),
    supported: () => !!(window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) || /Chrome|Edg\//.test(navigator.userAgent),
  };
  function deviceLabel() {
    const ua = navigator.userAgent;
    const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : 'متصفح';
    const os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : '';
    return [b, os].filter(Boolean).join(' — ');
  }

  window.Afaq = { CFG, configured, sb, db, $, $$, esc, toAr, GRADES, termName, planName, priceNum, money, dateAr, daysWord, sessionsWord, toast, errText, settings, waLink, ext, deviceLabel };
})();
