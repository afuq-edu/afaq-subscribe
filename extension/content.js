// content.js — داخل صفحة «إضافة تحضير» في منصة نور:
// ١) زر صغير «افتح حاضر» يفتح نافذة «حاضر» الرئيسية (لا أداة مختصرة ثانية داخل الصفحة).
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

  // ---------- زر «افتح حاضر» الصغير ----------
  // أداة واحدة فقط: الزر يفتح نافذة «حاضر» الرئيسية (المعالج) نفسها، فلا نسختان مختلفتان.
  let host = null, root = null, fabOn = true;
  function mount() {
    if (host || !document.body || !alive()) return;
    host = document.createElement('div');
    host.id = 'hadir3-host';
    host.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483000;display:block;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .fab{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:6px;background:#0f766e;color:#fff;border-radius:999px;padding:6px 13px;font:800 13px Tajawal,'Segoe UI',Tahoma,sans-serif;cursor:pointer;box-shadow:0 6px 18px -6px rgba(15,118,110,.7);direction:rtl}
      .fab:hover{background:#0b5d57}
      .fab[hidden]{display:none}
      .toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#15803d;color:#fff;font:700 14px Tajawal,'Segoe UI',Tahoma,sans-serif;padding:11px 18px;border-radius:12px;box-shadow:0 10px 30px -8px rgba(0,0,0,.45);direction:rtl;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90vw}
      .toast.warn{background:#0f766e}
      .toast.show{opacity:1}
    </style>
    <button class="fab" type="button" title="افتح نافذة «حاضر»">افتح حاضر</button>
    <div class="toast"></div>`;
    const fab = root.querySelector('.fab');
    fab.hidden = !fabOn;
    fab.addEventListener('click', () => send({ type: 'hadirOpenWizard' }));
    (document.body || document.documentElement).appendChild(host);
  }
  function unmount() { if (host) { host.remove(); host = null; root = null; } }
  function toast(text, kind) {
    if (!root) mount();
    if (!root) return;
    const t = root.querySelector('.toast');
    t.textContent = text; t.className = 'toast show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => { t.className = 'toast'; }, 4500);
  }

  if (alive()) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'hadirToast') toast(msg.text, msg.kind);
      if (msg && msg.type === 'hadirOpenPanel') send({ type: 'hadirOpenWizard' });
    });
  }

  // يظهر الزر فقط في نموذج التحضير، وإذا لم يُعطَّل من الإعدادات (رسائل التقدّم تظهر في الحالتين)
  const sync = () => {
    if (prepForm()) mount(); else unmount();
    if (root) root.querySelector('.fab').hidden = !fabOn;
  };
  try {
    chrome.storage.local.get('settings').then((r) => { fabOn = !(r.settings && r.settings.fab === false); sync(); }).catch(() => {});
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.settings) { fabOn = !(ch.settings.newValue && ch.settings.newValue.fab === false); sync(); }
    });
  } catch (e) {}
  // النموذج قد يُبنى بعد تحميل الصفحة
  let tries = 0;
  const iv = setInterval(() => { tries++; if (host || tries > 20) { clearInterval(iv); return; } sync(); }, 500);
})();
