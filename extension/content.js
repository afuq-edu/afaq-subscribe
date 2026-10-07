// content.js — داخل صفحة «إضافة تحضير» في منصة نور:
// ١) زر «حاضر» العائم: يفتح نافذة الإضافة داخل الصفحة نفسها، فتبقى مفتوحة وأنت تراجع النموذج.
// ٢) اكتشاف الحفظ: عند الضغط على «حفظ» في نور يُبلَّغ «حاضر» ليسجّل الحصة «محفوظة» بعد نجاح الحفظ.
(() => {
  if (window.top !== window) return;
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  // نسخة سابقة ما زالت تعمل في هذه الصفحة؟ (بعد تحديث الإضافة تصبح النسخة القديمة معطّلة)
  try { if (window.__hadir3Alive && window.__hadir3Alive()) return; } catch (e) {}
  window.__hadir3Alive = alive;
  ['hadir-fab', 'hadir3-host'].forEach((id) => { const el = document.getElementById(id); if (el) el.remove(); });

  const send = (msg) => { if (!alive()) return; try { const p = chrome.runtime.sendMessage(msg); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  const prepForm = () => {
    const t = document.querySelector('#PreparationTitle, input[name="data[Preparation][title]"], [name^="data[Preparation]"]');
    return document.querySelector('#add_preparation_form') || (t && t.form) || null;
  };

  // ---------- اكتشاف الحفظ ----------
  const normDate = (v) => {
    const s = String(v || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  };
  const visible = (el) => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const pubValue = () => {
    const els = Array.from(document.querySelectorAll('input[id^="publishdate"], input[name*="publish_date"], input.pubDateClass'));
    const el = els.find((x) => x.value && visible(x)) || els.find((x) => x.value);
    return el ? el.value : '';
  };
  // نص رسالة نور (العنوان والمحتوى، دون الأزرار)
  const swalText = (el) => {
    const part = (s) => { const x = el.querySelector(s); return x ? x.textContent.replace(/\s+/g, ' ').trim() : ''; };
    return [part('.swal2-title'), part('.swal2-html-container, .swal2-content')].filter(Boolean).join(' — ') || (el.textContent || '').replace(/\s+/g, ' ').trim();
  };
  let lastSent = 0;
  const OK_SEL = '.swal2-popup.swal2-icon-success, .swal2-icon.swal2-success, .toast-success, .alert-success, .noty_type__success, .jq-toast-single.jq-has-icon.jq-icon-success';
  function watchResult() {
    let n = 0;
    const BAD_SEL = '.swal2-popup.swal2-icon-error';
    // رسائل كانت ظاهرة قبل الحفظ لا تُحتسب نتيجةً له
    const before = new Set(Array.from(document.querySelectorAll(OK_SEL)).filter(visible));
    const beforeBad = new Set(Array.from(document.querySelectorAll(BAD_SEL)).filter(visible));
    const iv = setInterval(() => {
      n++;
      if (!alive()) { clearInterval(iv); return; }
      const ok = Array.from(document.querySelectorAll(OK_SEL)).find((el) => visible(el) && !before.has(el));
      const bad = Array.from(document.querySelectorAll(BAD_SEL)).find((el) => visible(el) && !beforeBad.has(el));
      if (ok) { clearInterval(iv); send({ type: 'hadirSaved' }); }
      else if (bad) { clearInterval(iv); lastSent = 0; send({ type: 'hadirSubmitFailed', text: swalText(bad).slice(0, 200) }); }
      else if (n > 60) clearInterval(iv);
    }, 500);
  }
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || !f.querySelector('#PreparationTitle, [name^="data[Preparation]"]')) return;
    if (Date.now() - lastSent < 3000) return;
    lastSent = Date.now();
    let mark = null;
    try { mark = JSON.parse(document.documentElement.getAttribute('data-hadir-filled') || 'null'); } catch (err) {}
    const t = document.querySelector('#PreparationTitle, input[name="data[Preparation][title]"]');
    send({ type: 'hadirSubmitting', mark, date: normDate(pubValue()), title: t ? t.value : '' });
    watchResult();
  }, true);

  // ---------- الزر العائم والنافذة داخل الصفحة ----------
  let host = null, root = null;
  const url = (p) => chrome.runtime.getURL(p);
  function mount() {
    if (host || !document.body || !alive()) return;
    host = document.createElement('div');
    host.id = 'hadir3-host';
    host.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483000;display:block;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .fab{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:7px;background:#0f766e;color:#fff;border-radius:999px;padding:8px 16px 8px 10px;font:800 14px Tajawal,'Segoe UI',Tahoma,sans-serif;cursor:pointer;box-shadow:0 8px 22px -6px rgba(15,118,110,.65);direction:rtl;transition:background .15s}
      .fab:hover{background:#0b5d57}
      .fab.open{background:#16302b}
      .fab .ico{width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.18);display:grid;place-items:center}
      .fb{direction:rtl;font:500 13.5px/1.7 Tajawal,'Segoe UI',Tahoma,sans-serif;color:#16302b;padding:16px;display:grid;gap:10px}
      .fb b{font-size:15px}
      .fb button{all:unset;box-sizing:border-box;text-align:center;background:#0f766e;color:#fff;border-radius:11px;padding:10px 14px;font-weight:800;cursor:pointer}
      .fb button:hover{background:#0b5d57}
      .fb small{color:#4a5e59}
      .panel{position:absolute;left:0;bottom:50px;width:410px;max-width:calc(100vw - 32px);height:420px;border-radius:16px;overflow:hidden;box-shadow:0 24px 54px -14px rgba(0,0,0,.5);border:1px solid rgba(0,0,0,.1);background:#f4f1ea;display:none}
      .panel.show{display:block}
      iframe{border:0;width:100%;height:100%;display:block}
      .toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#15803d;color:#fff;font:700 14px Tajawal,'Segoe UI',Tahoma,sans-serif;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px -8px rgba(0,0,0,.45);direction:rtl;opacity:0;transition:opacity .25s;pointer-events:none;max-width:80vw}
      .toast.warn{background:#b45309}
      .toast.show{opacity:1}
      .tag{all:unset;position:absolute;left:0;bottom:52px;box-sizing:border-box;direction:rtl;white-space:nowrap;max-width:min(380px,calc(100vw - 32px));overflow:hidden;text-overflow:ellipsis;cursor:pointer;border-radius:11px;padding:6px 12px;font:800 12.5px Tajawal,'Segoe UI',Tahoma,sans-serif;background:#e3f4e8;color:#15803d;border:1.5px solid #15803d;box-shadow:0 8px 22px -10px rgba(0,0,0,.35)}
      .tag.warn{background:#fcefdc;color:#b45309;border-color:#b45309}
      .tag.info{background:#dff1ee;color:#0f766e;border-color:#0f766e}
      .tag[hidden],.panel.show ~ .tag{display:none}
    </style>
    <div class="panel"><iframe title="حاضر" allow="clipboard-write"></iframe></div>
    <button class="tag" type="button" hidden></button>
    <button class="fab" type="button" title="حاضر — تعبئة التحضير (${/Mac/i.test(navigator.platform || navigator.userAgent) ? '⌥ Option + ⇧ Shift + H' : 'Alt+Shift+H'})"><i class="ico"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg></i><span>حاضر</span></button>
    <div class="toast"></div>`;
    const fab = root.querySelector('.fab');
    fab.addEventListener('click', toggle);
    root.querySelector('.tag').addEventListener('click', open);
    (document.body || document.documentElement).appendChild(host);
    setTimeout(refreshTag, 600);
  }

  // التوافق فور فتح النموذج: هل الدرس المفتوح في نور يطابق حصة في مكتبتك؟
  let autoOpened = false;
  function refreshTag() {
    if (!root || !alive()) return;
    try { const p = chrome.runtime.sendMessage({ type: 'hadirMatch' }); if (p && p.then) p.then(renderTag).catch(() => {}); } catch (e) {}
  }
  function renderTag(m) {
    if (!root) return;
    const tag = root.querySelector('.tag');
    if (!m || !m.ok || m.empty || m.batch) { tag.hidden = true; return; }   // أثناء «عدة حصص» تكفي رسائل الشريط العلوي
    const when = m.date ? ' · ' + m.date : '';
    if (m.how === 'nomatch') { tag.className = 'tag warn'; tag.textContent = '⚠ لم يتوافق تلقائيًا — اضغط لتأكد من التوافق'; }
    else if (m.filledHere) { tag.className = 'tag info'; tag.textContent = '• عُبّئت هنا: ' + m.session; }
    else if (m.savedBefore) { tag.className = 'tag warn'; tag.textContent = '⚠ متوافق — لكنها محفوظة في نور سابقًا: ' + m.session; }
    else if (m.how === 'auto' || m.how === 'manual') { tag.className = 'tag'; tag.textContent = '✓ متوافق: ' + m.session + when; }
    // لا عنوان درس في الصفحة للتحقق منه: اقتراح فقط، لا «متوافق»
    else { tag.className = 'tag info'; tag.textContent = (m.how === 'chain' ? 'التالية في خطتك: ' : 'المقترحة: ') + m.session + when; }
    tag.title = m.lesson ? 'الدرس: ' + m.lesson : '';
    tag.hidden = false;
    if (m.autoOpen && !autoOpened) { autoOpened = true; open(); }
  }
  function unmount() { if (host) { host.remove(); host = null; root = null; } }
  function panelEls() { return root ? { panel: root.querySelector('.panel'), frame: root.querySelector('iframe'), fab: root.querySelector('.fab') } : {}; }
  let frameAlive = false, aliveTimer = null;
  function fallback() {
    // لم تُحمَّل النافذة داخل الصفحة (قد تمنعها سياسة أمان الموقع): بديل مختصر
    const { panel } = panelEls();
    if (!panel || frameAlive) return;
    panel.style.height = 'auto';
    panel.innerHTML = `<div class="fb"><b>تعذّر فتح نافذة «حاضر» داخل هذه الصفحة</b>
      <button type="button" data-q>⚡ تعبئة سريعة بالحصة والتاريخ المقترحين</button>
      <small>أو افتح «حاضر» من أيقونة الإضافة في شريط كروم لاختيار الدرس والحصة والتاريخ بنفسك.</small></div>`;
    panel.querySelector('[data-q]').onclick = () => { send({ type: 'hadirQuickFill' }); close(); toast('جارٍ التعبئة…'); };
  }
  function open() {
    const { panel, frame, fab } = panelEls();
    if (!panel) return;
    if (!alive()) { unmount(); return; }
    if (frame && !frame.getAttribute('src')) {
      frame.src = url('popup.html?embed=1');
      clearTimeout(aliveTimer);
      aliveTimer = setTimeout(fallback, 6000);
    } else if (frame) { try { frame.contentWindow.postMessage({ hadir: 'refresh' }, '*'); } catch (e) {} }
    panel.classList.add('show'); fab.classList.add('open');
    fab.querySelector('span').textContent = 'إغلاق';
  }
  function close() {
    const { panel, fab } = panelEls();
    if (!panel) return;
    panel.classList.remove('show'); fab.classList.remove('open');
    fab.querySelector('span').textContent = 'حاضر';
  }
  function toggle() { const { panel } = panelEls(); if (panel && panel.classList.contains('show')) close(); else open(); }
  function toast(text, kind) {
    if (!root) return;
    const t = root.querySelector('.toast');
    t.textContent = text; t.className = 'toast show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, 4500);
  }

  window.addEventListener('message', (e) => {
    const { frame } = panelEls();
    if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
    frameAlive = true; clearTimeout(aliveTimer);
    if (e.data.hadir === 'close') close();
    if (e.data.hadir === 'height') {
      const { panel } = panelEls();
      const h = Math.max(160, Math.min(Number(e.data.h) || 400, window.innerHeight - 90));
      panel.style.height = h + 'px';
    }
  });

  if (alive()) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'hadirToast') toast(msg.text, msg.kind);
      if (msg && msg.type === 'hadirOpenPanel') open();
    });
  }

  // يظهر الزر فقط في نموذج التحضير، وإذا لم يُعطَّل من الإعدادات
  let fabOn = true;
  const sync = () => { if (fabOn && prepForm()) mount(); else unmount(); };
  try {
    chrome.storage.local.get('settings').then((r) => { fabOn = !(r.settings && r.settings.fab === false); sync(); }).catch(() => {});
    let tagT = null;
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.settings) { fabOn = !(ch.settings.newValue && ch.settings.newValue.fab === false); sync(); }
      if (ch.pkgState || ch.picks || ch.packages) { clearTimeout(tagT); tagT = setTimeout(refreshTag, 800); }
    });
  } catch (e) {}
  // اختيار الدرس من شجرة نور (بيد المعلم أو بالإضافة) يغيّر العنوان دون حدث — نراقبه لتحديث شارة التوافق
  let lastTitle = null, titleT = null;
  setInterval(() => {
    if (!root || !alive()) return;
    const t = document.querySelector('#PreparationTitle, input[name="data[Preparation][title]"]');
    const v = t ? t.value : '';
    if (lastTitle === null) { lastTitle = v; return; }
    if (v !== lastTitle) { lastTitle = v; clearTimeout(titleT); titleT = setTimeout(refreshTag, 400); }
  }, 700);
  // النموذج قد يُبنى بعد تحميل الصفحة
  let tries = 0;
  const iv = setInterval(() => { tries++; if (host || tries > 20) { clearInterval(iv); return; } sync(); }, 500);
})();
