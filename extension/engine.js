// engine.js — محرك الالتقاط والتعبئة.
// تُمرَّر الدالة hadirEngine كاملة إلى chrome.scripting.executeScript وتعمل داخل الصفحة
// (العالم الرئيسي MAIN) في كل إطار، لذلك يجب أن تبقى مكتفية بذاتها دون أي مراجع خارجية.

export function hadirEngine(action, payload) {
  payload = payload || {};
  const TOP = window;

  // ---------- أدوات عامة ----------
  const isBlankHref = (h) => !h || h === 'about:blank' || h === 'about:srcdoc' || h.startsWith('javascript:');
  // الإطارات الفارغة (about:blank) يتولاها الإطار الأب لأنه يصل إليها مباشرة
  // (الإطار المكتوب بـ document.write يرث عنوان الأب، لذا نفحص سمة src في عنصر الإطار نفسه)
  try {
    const fe = window !== window.top ? window.frameElement : null;
    if (fe && (isBlankHref((fe.getAttribute('src') || '').trim()) || fe.hasAttribute('srcdoc') || isBlankHref(location.href))) {
      return { skipFrame: true };
    }
  } catch (e) { /* إطار من أصل مختلف */ }

  const clean = (s) => (s || '')
    .replace(/[‎‏]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s*:：\-–]+|[\s*:：\-–]+$/g, '')
    .trim()
    .slice(0, 140);

  const stableId = (id) => (id && !/\d{3,}|^(mat-|ng-|ember|react|:r|__|cdk-|mui-|select2-)|[a-f0-9]{8,}|[-_][a-z0-9]{6,}-[a-z0-9]{4,}/i.test(id)) ? id : '';
  const stableName = (n) => (n && !/\d{4,}|[a-f0-9]{10,}/i.test(n)) ? n : '';

  const normPath = () => {
    try {
      if (window === window.top) return 'top';
      return location.pathname.replace(/\d+/g, '#');
    } catch (e) { return 'frame'; }
  };

  const winOf = (el) => (el && el.ownerDocument && el.ownerDocument.defaultView) || TOP;

  const isRendered = (el) => {
    try {
      if (!el.isConnected) return false;
      const w = winOf(el);
      const cs = w.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return el.getClientRects().length > 0;
    } catch (e) { return false; }
  };

  // ---------- محررات النصوص الغنية ----------
  function tinyFor(el) {
    try {
      const w = winOf(el);
      if (el.tagName === 'TEXTAREA' && el.id && w.tinymce && w.tinymce.get) {
        const ed = w.tinymce.get(el.id);
        if (ed && ed.getContent) return ed;
      }
    } catch (e) {}
    return null;
  }
  function ck4For(el) {
    try {
      const w = winOf(el);
      if (el.tagName === 'TEXTAREA' && w.CKEDITOR && w.CKEDITOR.instances) {
        for (const k in w.CKEDITOR.instances) {
          const ed = w.CKEDITOR.instances[k];
          if (ed && ed.element && ed.element.$ === el) return ed;
        }
        if (el.id && w.CKEDITOR.instances[el.id]) return w.CKEDITOR.instances[el.id];
        if (el.name && w.CKEDITOR.instances[el.name]) return w.CKEDITOR.instances[el.name];
      }
    } catch (e) {}
    return null;
  }
  const ck5For = (el) => (el && el.ckeditorInstance && el.ckeditorInstance.getData) ? el.ckeditorInstance : null;
  function quillFor(el) {
    try {
      const c = el.closest && el.closest('.ql-container');
      if (c && c.__quill) return c.__quill;
    } catch (e) {}
    return null;
  }
  function apiEditor(el) {
    const t = tinyFor(el); if (t) return { type: 'tiny', ed: t };
    const c = ck4For(el); if (c) return { type: 'ck4', ed: c };
    return null;
  }

  // إطارات محرري TinyMCE وCKEditor4 تُعالج عبر واجهة المحرر فنتجاهلها
  function isApiEditorFrame(f) {
    try {
      const w = winOf(f);
      if (f.id && /_ifr$/.test(f.id) && w.tinymce && w.tinymce.get && w.tinymce.get(f.id.slice(0, -4))) return true;
      if (f.classList.contains('cke_wysiwyg_frame') && w.CKEDITOR) return true;
    } catch (e) {}
    return false;
  }

  // هل هذا الحقل المخفي هو المصدر الخفي لمحرر مرئي بجانبه (CKEditor5 / Summernote / Quill)؟
  function isShadowSource(el) {
    if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return false;
    if (isRendered(el)) return false;
    const n = el.nextElementSibling;
    if (!n) return false;
    return !!(n.matches && (n.matches('.ck-editor, .ck, .note-editor, .ql-container, .ql-toolbar, .jodit, .fr-box, .tox, .cke, .mce-tinymce, .trumbowyg-box') ||
      n.querySelector && n.querySelector('[contenteditable="true"]')));
  }

  // ---------- جمع المستندات (الإطار + الإطارات الفارغة داخله) ----------
  function collectDocs(doc, key, out, depth) {
    out.push({ doc, key });
    if (depth > 5) return;
    let frames = [];
    try { frames = Array.from(doc.querySelectorAll('iframe, frame')); } catch (e) {}
    frames.forEach((f, i) => {
      let cd = null;
      try { cd = f.contentDocument; } catch (e) {}
      if (!cd) return;
      const src = (f.getAttribute('src') || '').trim();
      const blank = isBlankHref(src) || f.hasAttribute('srcdoc');
      if (!blank) return; // الإطار ذو العنوان يحصل على نسخة مستقلة من المحرك
      if (isApiEditorFrame(f)) return;
      collectDocs(cd, key + '>' + i, out, depth + 1);
    });
  }

  // ---------- التسميات ----------
  function textWithout(container, el) {
    try {
      const c = container.cloneNode(true);
      c.querySelectorAll('input,select,textarea,button,script,style,[contenteditable]').forEach((n) => n.remove());
      return clean(c.textContent);
    } catch (e) { return ''; }
  }

  function labelOf(el, host) {
    const target = host || el;
    const doc = target.ownerDocument;
    const get = (a) => (target.getAttribute && target.getAttribute(a)) || '';
    const aria = get('aria-label'); if (clean(aria)) return clean(aria);
    const lb = get('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => { const n = doc.getElementById(id); return n ? n.textContent : ''; }).join(' ');
      if (clean(t)) return clean(t);
    }
    if (target.id) {
      try {
        const l = doc.querySelector('label[for="' + CSS.escape(target.id) + '"]');
        if (l) { const t = textWithout(l, target); if (t) return t; }
      } catch (e) {}
    }
    const pl = target.closest && target.closest('label');
    if (pl) { const t = textWithout(pl, target); if (t) return t; }

    // خانة جدول: الخلية السابقة في نفس الصف ثم رأس العمود
    const td = target.closest && target.closest('td');
    if (td) {
      let rowLabel = '';
      let p = td.previousElementSibling;
      while (p) {
        if (!p.querySelector('input,select,textarea,[contenteditable="true"]')) {
          const t = clean(p.textContent); if (t) { rowLabel = t; break; }
        }
        p = p.previousElementSibling;
      }
      let colLabel = '';
      const table = td.closest('table');
      const tr = td.parentElement;
      if (table && tr) {
        const idx = Array.from(tr.children).indexOf(td);
        const head = table.querySelector('thead tr') || table.querySelector('tr');
        if (head && head !== tr && head.children[idx] && !head.children[idx].querySelector('input,select,textarea')) {
          colLabel = clean(head.children[idx].textContent);
        }
      }
      const own = textWithout(td, target);
      if (own && own.length <= 60) return own;
      if (rowLabel && colLabel) return clean(rowLabel + ' — ' + colLabel);
      if (rowLabel || colLabel) return rowLabel || colLabel;
    }

    // النص السابق للحقل صعودًا في الشجرة
    let node = target;
    for (let depth = 0; depth < 5 && node; depth++) {
      let s = node.previousElementSibling;
      let steps = 0;
      while (s && steps < 4) {
        if (s.matches('script,style,br,hr')) { s = s.previousElementSibling; continue; }
        if (s.matches('input,select,textarea,button') || s.querySelector('input,select,textarea,[contenteditable="true"]')) {
          s = null; break;
        }
        const t = clean(s.textContent);
        if (t) return t;
        s = s.previousElementSibling; steps++;
      }
      // نص مباشر داخل الأب قبل الحقل
      const parent = node.parentElement;
      if (parent) {
        let txt = '';
        for (const ch of parent.childNodes) {
          if (ch === node) break;
          if (ch.nodeType === 3) txt += ch.textContent;
        }
        if (clean(txt)) return clean(txt);
      }
      node = parent;
      if (!node || node.tagName === 'FORM' || node.tagName === 'BODY') break;
    }
    const ph = get('placeholder') || get('data-placeholder'); if (clean(ph)) return clean(ph);
    const title = get('title'); if (clean(title)) return clean(title);
    const nm = get('name'); if (clean(nm)) return clean(nm);
    return '';
  }

  // ---------- تعداد الحقول ----------
  const SKIP_TYPES = /^(hidden|password|file|submit|button|reset|image|search|color|range)$/i;
  const RICH_SEL = '[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]';

  function kindOf(el) {
    const tag = el.tagName;
    if (tag === 'SELECT') return 'select';
    if (tag === 'TEXTAREA') return apiEditor(el) ? 'rich' : 'text';
    if (tag === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'check';
      if (t === 'radio') return 'radio';
      return 'text';
    }
    return 'rich';
  }

  function enumerate(doc, key) {
    const els = [];
    let list = [];
    try { list = Array.from(doc.querySelectorAll('input, textarea, select, ' + RICH_SEL)); } catch (e) {}
    const body = doc.body;
    if (body && (doc.designMode === 'on' || body.isContentEditable) && !list.includes(body)) list.unshift(body);

    for (const el of list) {
      if (el.disabled) continue;
      if (el.tagName === 'INPUT' && SKIP_TYPES.test(el.type || '')) continue;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') {
        // عنصر قابل للتحرير: نأخذ الأبعد فقط
        const p = el.parentElement;
        if (el !== body && p && p.isContentEditable) continue;
        if (el.closest && el.closest('.tox, .mce-tinymce, .cke') && !ck5For(el)) continue;
      }
      if (isShadowSource(el) && !apiEditor(el)) continue;
      // حقول البحث العامة في الترويسة
      if (el.tagName === 'INPUT' && /search|بحث/i.test((el.name || '') + ' ' + (el.placeholder || '') + ' ' + (el.id || '')) && !el.closest('form[method="post" i]')) continue;
      els.push(el);
    }

    const counters = {};
    const totals = {};
    const group = (k) => (k === 'text' || k === 'rich') ? 'txt' : k;
    const items = els.map((el) => {
      const kind = kindOf(el);
      const g = group(kind);
      counters[g] = (counters[g] || 0);
      const idx = counters[g]++;
      let host = null;
      if (el === body && doc.defaultView && doc.defaultView.frameElement) {
        try { host = doc.defaultView.frameElement; } catch (e) {}
      }
      return {
        el, kind, g, idx, frame: key,
        tag: el.tagName.toLowerCase(),
        type: el.tagName === 'INPUT' ? (el.type || 'text').toLowerCase() : '',
        elId: stableId(el.id || (host && host.id) || ''),
        name: stableName(el.getAttribute('name') || ''),
        ph: clean(el.getAttribute('placeholder') || ''),
        rv: (kind === 'radio' || kind === 'check') ? (el.value || '') : '',
        host,
      };
    });
    items.forEach((it) => { totals[it.g] = counters[it.g]; });
    items.forEach((it) => { it.total = totals[it.g]; });
    return items;
  }

  // ---------- قراءة القيم ----------
  function htmlOfRich(el) {
    const api = apiEditor(el);
    try {
      if (api && api.type === 'tiny') return api.ed.getContent();
      if (api && api.type === 'ck4') return api.ed.getData();
    } catch (e) {}
    const c5 = ck5For(el); if (c5) { try { return c5.getData(); } catch (e) {} }
    return el.innerHTML;
  }

  function readValue(it) {
    const el = it.el;
    switch (it.kind) {
      case 'text': return el.value || '';
      case 'rich': return htmlOfRich(el) || '';
      case 'select': {
        const opts = Array.from(el.options || []);
        if (el.multiple) return opts.filter((o) => o.selected).map((o) => ({ v: o.value, t: clean(o.textContent) }));
        const o = opts[el.selectedIndex];
        return o ? { v: o.value, t: clean(o.textContent), i: el.selectedIndex } : null;
      }
      case 'check': return !!el.checked;
      case 'radio': return !!el.checked;
    }
    return '';
  }

  const richIsEmpty = (html) => {
    if (!html) return true;
    if (/<(img|table|iframe|video|hr)\b/i.test(html)) return false;
    return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;| |​/g, '').trim();
  };

  function isEmptyValue(it, v) {
    switch (it.kind) {
      case 'text': return !String(v || '').trim();
      case 'rich': return richIsEmpty(v);
      case 'select':
        if (Array.isArray(v)) return v.length === 0;
        return !v || (!v.v && (v.i === 0 || v.i === -1 || v.i === undefined)) || (v.i === 0 && /^(اختر|--|-|select|choose|\.\.\.)/i.test(v.t || ''));
      case 'check': return false;
      case 'radio': return !v;
    }
    return true;
  }

  // ---------- كتابة القيم ----------
  function fire(el, type, Ctor) {
    const w = winOf(el);
    let ev;
    try {
      const C = (Ctor && w[Ctor]) || w.Event;
      ev = new C(type, { bubbles: true, cancelable: true });
    } catch (e) { ev = new w.Event(type, { bubbles: true }); }
    el.dispatchEvent(ev);
  }

  function setNative(el, v) {
    const w = winOf(el);
    const P = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(P, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
  }

  function jqRefresh(el) {
    try {
      const w = winOf(el);
      const $ = w.jQuery || w.$;
      if ($ && $.fn) {
        const $el = $(el);
        if ($.fn.selectpicker && $el.data && $el.data('selectpicker')) $el.selectpicker('refresh');
        if ($.fn.trigger) $el.trigger('change.select2');
        if ($.fn.trigger && ((($el.hasClass && $el.hasClass('chosen-select')) || ($el.data && $el.data('chosen'))) || el.nextElementSibling && /chosen-container/.test(el.nextElementSibling.className || ''))) {
          $el.trigger('chosen:updated');
          $el.trigger('change');
        }
      }
    } catch (e) {}
  }

  // تحليل HTML في مستند خامل (DOMParser): لا تُنفَّذ سكربتات ولا تُحمَّل صور
  const parseInert = (html) => new DOMParser().parseFromString(String(html || ''), 'text/html');
  const stripHtml = (html) => {
    const b = parseInert(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n')).body;
    return (b ? b.textContent : '').replace(/\n{3,}/g, '\n\n').trim();
  };
  // تنظيف أي HTML قبل كتابته في الصفحة (قد يأتي من ملف تحاضير مشارَك)
  const DROP_TAGS = /^(SCRIPT|STYLE|IFRAME|FRAME|FRAMESET|OBJECT|EMBED|APPLET|LINK|META|BASE|NOSCRIPT|TEMPLATE|SVG|MATH|FORM|INPUT|BUTTON|TEXTAREA|SELECT|OPTION|VIDEO|AUDIO|SOURCE|TRACK|CANVAS|IMG|PICTURE|PORTAL|DIALOG)$/i;
  const safeHtml = (html) => {
    try {
      const doc = parseInert(html);
      doc.body.querySelectorAll('*').forEach((el) => {
        if (DROP_TAGS.test(el.tagName)) { el.remove(); return; }
        for (const a of Array.from(el.attributes)) {
          const n = a.name.toLowerCase();
          const keep = (n === 'href' && el.tagName === 'A' && /^\s*(https?:|mailto:)/i.test(a.value)) || n === 'target' || n === 'dir';
          if (!keep) el.removeAttribute(a.name);
        }
        if (el.tagName === 'A' && el.getAttribute('target')) el.setAttribute('rel', 'noopener');
      });
      return doc.body.innerHTML;
    } catch (e) { return String(html || '').replace(/</g, '&lt;'); }
  };
  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const looksHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(String(s));
  const textToHtml = (s) => String(s).split(/\n/).map((l) => '<p>' + (escapeHtml(l) || '<br>') + '</p>').join('');

  function toDateInput(v, type) {
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m && type === 'date') return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if (type === 'datetime-local' && m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') + 'T08:00';
    return s;
  }

  function currentIsFilled(it) {
    return !isEmptyValue(it, readValue(it)) && !(it.kind === 'check');
  }

  function writeValue(it, f) {
    const el = it.el;
    let v = f.value;
    if (it.kind === 'text') {
      if (f.kind === 'rich' || looksHtml(v) && f.kind !== 'text') v = stripHtml(v);
      if (it.type === 'date' || it.type === 'datetime-local') v = toDateInput(v, it.type);
      else if (el.tagName === 'INPUT') v = String(v).replace(/\s*\n+\s*/g, ' — ');   // حقل سطر واحد
      fire(el, 'focus', 'FocusEvent');
      setNative(el, String(v));
      fire(el, 'input', 'InputEvent');
      fire(el, 'change');
      fire(el, 'keyup', 'KeyboardEvent');
      fire(el, 'blur', 'FocusEvent');
      return String(el.value) === String(v) || it.type === 'date';
    }
    if (it.kind === 'rich') {
      const html = safeHtml((f.kind === 'text' && !looksHtml(v)) ? textToHtml(v) : String(v));
      const api = apiEditor(el);
      if (api && api.type === 'tiny') {
        api.ed.setContent(html);
        try { api.ed.save && api.ed.save(); api.ed.fire && api.ed.fire('change'); api.ed.setDirty && api.ed.setDirty(true); } catch (e) {}
        fire(el, 'change');
        return true;
      }
      if (api && api.type === 'ck4') {
        api.ed.setData(html);
        try { api.ed.updateElement && api.ed.updateElement(); api.ed.fire && api.ed.fire('change'); } catch (e) {}
        return true;
      }
      const c5 = ck5For(el);
      if (c5) { c5.setData(html); try { c5.updateSourceElement && c5.updateSourceElement(); } catch (e) {} return true; }
      const q = quillFor(el);
      if (q && q.clipboard) {
        try { q.setContents([]); q.clipboard.dangerouslyPasteHTML(0, html); return true; } catch (e) {}
      }
      if (el.getAttribute && el.getAttribute('contenteditable') === 'plaintext-only') el.textContent = stripHtml(html);
      else el.innerHTML = html;
      fire(el, 'input', 'InputEvent');
      fire(el, 'change');
      fire(el, 'keyup', 'KeyboardEvent');
      fire(el, 'blur', 'FocusEvent');
      // مزامنة الحقل المصدر المخفي (Summernote وأمثاله)
      let n = el;
      for (let i = 0; i < 5 && n; i++) {
        const prev = n.previousElementSibling;
        if (prev && prev.tagName === 'TEXTAREA' && !isRendered(prev)) {
          setNative(prev, html); fire(prev, 'input'); fire(prev, 'change');
          break;
        }
        n = n.parentElement;
      }
      return true;
    }
    if (it.kind === 'select') {
      const opts = Array.from(el.options || []);
      const find = (val) => {
        if (!val) return null;
        return opts.find((o) => val.v !== '' && o.value === val.v && clean(o.textContent) === val.t) ||
          opts.find((o) => clean(o.textContent) === val.t) ||
          opts.find((o) => val.v !== '' && o.value === val.v) ||
          (val.t && opts.find((o) => clean(o.textContent).includes(val.t) || (clean(o.textContent) && val.t.includes(clean(o.textContent)))));
      };
      if (el.multiple) {
        const want = Array.isArray(v) ? v : [v];
        const hits = want.map(find).filter(Boolean);
        opts.forEach((o) => { o.selected = hits.includes(o); });
        fire(el, 'input'); fire(el, 'change'); jqRefresh(el);
        return hits.length > 0;
      }
      const o = find(v);
      if (!o) return false;
      setNative(el, o.value);
      o.selected = true;
      fire(el, 'input'); fire(el, 'change'); fire(el, 'blur', 'FocusEvent');
      jqRefresh(el);
      return true;
    }
    if (it.kind === 'check' || it.kind === 'radio') {
      const want = !!v;
      if (el.checked !== want) {
        try { el.click(); } catch (e) {}
        if (el.checked !== want) { el.checked = want; fire(el, 'input'); fire(el, 'change'); }
      }
      return el.checked === want;
    }
    return false;
  }

  function flash(it) {
    let t = it.el;
    try {
      const api = apiEditor(t);
      if (api && api.type === 'tiny' && api.ed.getContainer) t = api.ed.getContainer();
      else if (api && api.type === 'ck4' && api.ed.container) t = api.ed.container.$;
      else if (it.host) t = it.host;
      else if (!isRendered(t) && t.nextElementSibling) t = t.nextElementSibling;
      if (!t || !t.style) return;
      const old = t.style.outline, oldOff = t.style.outlineOffset, oldTr = t.style.transition;
      t.style.transition = 'outline-color .4s';
      t.style.outline = '3px solid #16a34a';
      t.style.outlineOffset = '2px';
      setTimeout(() => { t.style.outline = old; t.style.outlineOffset = oldOff; t.style.transition = oldTr; }, 2600);
    } catch (e) {}
  }

  // ---------- المطابقة ----------
  function score(f, c) {
    const fg = (f.kind === 'text' || f.kind === 'rich') ? 'txt' : f.kind;
    if (fg !== c.g) return -1;
    let s = 0;
    if (f.elId && c.elId && f.elId === c.elId) s += 100;
    if (f.name && c.name && f.name === c.name) {
      s += 60;
      if (f.kind === 'radio' || f.kind === 'check') s += (f.rv === c.rv ? 40 : -80);
    }
    if (f.label && c.label) {
      if (f.label === c.label) s += 50;
      else if (f.label.length > 3 && c.label.length > 3 && (f.label.includes(c.label) || c.label.includes(f.label))) s += 20;
    }
    if (f.ph && c.ph && f.ph === c.ph) s += 20;
    if (f.idx === c.idx) s += (f.total === c.total ? 25 : 8);
    if (f.kind !== c.kind) s -= 10;
    if (f.type && c.type && f.type !== c.type) s -= 15;
    return s;
  }

  // ---------- الأوامر ----------
  const docs = [];
  collectDocs(document, normPath(), docs, 0);
  const frames = docs.map((d) => d.key);

  if (action === 'scan') {
    let count = 0, filled = 0;
    for (const d of docs) {
      const items = enumerate(d.doc, d.key);
      count += items.length;
      items.forEach((it) => { if (it.kind !== 'check' && !isEmptyValue(it, readValue(it))) filled++; });
    }
    return { frames, count, filled, title: document.title, url: location.href };
  }

  if (action === 'capture') {
    const fields = [];
    for (const d of docs) {
      const items = enumerate(d.doc, d.key);
      for (const it of items) {
        const value = readValue(it);
        if (isEmptyValue(it, value)) continue;
        if (it.kind === 'check' && !payload.includeUnchecked && !value) continue;
        fields.push({
          kind: it.kind, tag: it.tag, type: it.type, elId: it.elId, name: it.name,
          label: labelOf(it.el, it.host), ph: it.ph, rv: it.rv,
          idx: it.idx, total: it.total, frame: it.frame, value,
        });
        if (payload.flash) flash(it);
      }
    }
    return { frames, fields, title: document.title, url: location.href };
  }

  if (action === 'fill') {
    const all = (payload.fields || []).filter((f) => f.enabled !== false);
    const filled = [], skipped = [], failed = [];
    for (const d of docs) {
      const mine = all.filter((f) => payload.anyFrame || f.frame === d.key);
      if (!mine.length) continue;
      const cands = enumerate(d.doc, d.key);
      cands.forEach((c) => { c.label = labelOf(c.el, c.host); });
      const pairs = [];
      for (const f of mine) {
        for (const c of cands) {
          const s = score(f, c);
          if (s >= 25) pairs.push({ f, c, s });
        }
      }
      pairs.sort((a, b) => b.s - a.s || Math.abs(a.f.idx - a.c.idx) - Math.abs(b.f.idx - b.c.idx));
      const usedF = new Set(), usedC = new Set();
      for (const p of pairs) {
        if (usedF.has(p.f.fid) || usedC.has(p.c.el)) continue;
        usedF.add(p.f.fid); usedC.add(p.c.el);
        if (payload.skipFilled && currentIsFilled(p.c)) { skipped.push(p.f.fid); continue; }
        let ok = false;
        try { ok = writeValue(p.c, p.f); } catch (e) { ok = false; }
        if (ok) { filled.push(p.f.fid); flash(p.c); } else failed.push(p.f.fid);
      }
    }
    return { frames, filled, skipped, failed };
  }

  // =====================================================================
  // وضع منصة نور: إيجاد كل بند بعنوانه ثم تعبئة الحقل الذي يليه
  // =====================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // انتظار حدث في الصفحة بدل مدة ثابتة: يكتمل فور تحقق الشرط (check)،
  // ومع quiet ينتظر حتى تهدأ التغييرات (مثل قائمة تُحمَّل عناصرها تباعًا).
  // poll: فحص دوري أيضًا لما لا يغيّر الصفحة (مثل قيمة خانة تُكتب بالبرمجة)
  const waitDom = (root, check, opts) => new Promise((res) => {
    const { timeout = 4000, quiet = 0, poll = 0 } = opts || {};
    let done = false, qt = null, iv = null, mo = null;
    const finish = (v) => {
      if (done) return; done = true;
      if (mo) mo.disconnect(); clearTimeout(tt); clearTimeout(qt); clearInterval(iv); res(v);
    };
    const test = (fromPoll) => {
      let v = false;
      try { v = check(); } catch (e) {}
      if (!v) { clearTimeout(qt); qt = null; return; }
      if (!quiet) { finish(v); return; }
      if (fromPoll && qt) return;   // الفحص الدوري لا يعيد عدّاد الهدوء — التغييرات وحدها تعيده
      clearTimeout(qt);
      qt = setTimeout(() => { let w = v; try { w = check() || v; } catch (e) {} finish(w); }, quiet);
    };
    try { mo = new MutationObserver(() => test(false)); mo.observe(root || document, { childList: true, subtree: true, attributes: true }); } catch (e) {}
    if (poll) iv = setInterval(() => test(true), poll);
    const tt = setTimeout(() => { let v = false; try { v = check(); } catch (e) {} finish(v); }, timeout);
    test();
  });
  const nrm = (s) => String(s || '').normalize('NFKC')
    // الحركات والتطويل والمحارف الخفية تُحذف (لا تُستبدل بمسافة) حتى يطابق «التذكُّر» كلمة «التذكر»
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u061C\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[()[\]«»"'.,،:؛\-–_/\\|*]+/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  const core = (s) => nrm(s).split(' ').map((w) => w.replace(/^(وال|بال|كال|فال|ال)(?=..)/, '')).join(' ');
  const before = (a, b) => a !== b && !!(a.compareDocumentPosition(b) & 4); // a قبل b
  const REGION_SEL = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

  function regionItems(doc) {
    const out = [];
    let list = [];
    try { list = Array.from(doc.querySelectorAll(REGION_SEL + ', iframe')); } catch (e) {}
    for (const el of list) {
      if (el.tagName === 'IFRAME') {
        let cd = null; try { cd = el.contentDocument; } catch (e) {}
        if (!cd || !cd.body || isApiEditorFrame(el)) continue;
        if (cd.designMode === 'on' || cd.body.isContentEditable) out.push({ el: cd.body, pos: el });
        continue;
      }
      if (el.disabled) continue;
      if (el.tagName === 'INPUT' && /^(hidden|checkbox|radio|button|submit|reset|file|image|color|range)$/i.test(el.type || '')) continue;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') {
        const p = el.parentElement; if (p && p.isContentEditable) continue;
      }
      out.push({ el, pos: el });
    }
    return out;
  }

  function labelNodes(doc) {
    const out = [];
    if (!doc.body) return out;
    const all = doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,label,legend,span,div,p,strong,b,td,th,dt,small,mat-label');
    for (const el of all) {
      if (el.closest('[contenteditable="true"],[contenteditable=""],select,option,[role="listbox"],[role="option"],script,style,noscript')) continue;
      if (el.querySelector(REGION_SEL + ',iframe')) continue;
      const raw = el.textContent || '';
      if (raw.length > 170) continue;
      const t = nrm(raw);
      if (!t || t.length > 120) continue;
      if (Array.from(el.children).some((c) => nrm(c.textContent) === t)) continue;
      if (!isRendered(el)) continue;
      out.push({ el, t });
    }
    return out;
  }

  function locate(doc, items) {
    const labels = labelNodes(doc);
    const found = {};
    let last = null;
    for (const it of items) {
      const keys = (it.match || []).map(nrm).filter(Boolean);
      const cands = labels.filter((l) => keys.some((k) => l.t.includes(k)));
      if (!cands.length) continue;
      const rank = (l) => (keys.some((k) => l.t === k) ? 0 : keys.some((k) => l.t.startsWith(k)) ? 1 : 2) * 1000 + l.t.length;
      const after = last ? cands.filter((l) => before(last, l.el)) : cands;
      const pool = (after.length ? after : cands).slice();
      pool.sort((a, b) => rank(a) - rank(b) || (before(a.el, b.el) ? -1 : 1));
      found[it.key] = pool[0].el;
      last = pool[0].el;
    }
    return found;
  }

  function regionFor(labelEl, found, items) {
    const others = Object.values(found).filter((e) => e !== labelEl && before(labelEl, e));
    let next = null;
    others.forEach((e) => { if (!next || before(e, next)) next = e; });
    const all = items.filter((r) => before(labelEl, r.pos) && (!next || before(r.pos, next)));
    return next ? all : all.slice(0, 4);
  }

  function looksPicker(el) {
    if (el.tagName !== 'INPUT') return false;
    const attrs = ['role', 'aria-autocomplete', 'aria-haspopup', 'aria-expanded', 'aria-controls', 'list'].some((a) => el.hasAttribute(a));
    if (attrs || /^(search)$/i.test(el.type)) return true;
    let n = el;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
      if (/select|tag|chip|choice|multi|autocomplete|combo|dropdown|token/i.test(String(n.className || ''))) return true;
    }
    return false;
  }

  function pickTarget(region, mode) {
    const shown = (r) => isRendered(r.pos);
    const sel = region.find((r) => r.el.tagName === 'SELECT');
    const inputs = region.filter((r) => r.el.tagName === 'INPUT' && shown(r));
    if (mode === 'pick' || mode === 'auto') {
      if (sel) return { how: 'select', el: sel.el };
      const pk = inputs.find((r) => looksPicker(r.el));
      if (pk) return { how: 'type', el: pk.el };
      if (mode === 'pick' && inputs[0]) return { how: 'type', el: inputs[0].el };
    }
    const api = region.find((r) => r.el.tagName === 'TEXTAREA' && apiEditor(r.el));
    if (api) return { how: 'rich', el: api.el };
    const ce = region.find((r) => r.el.tagName !== 'INPUT' && r.el.tagName !== 'TEXTAREA' && r.el.tagName !== 'SELECT' && shown(r));
    if (ce) return { how: 'rich', el: ce.el, host: ce.pos !== ce.el ? ce.pos : null };
    const ta = region.find((r) => r.el.tagName === 'TEXTAREA' && shown(r));
    if (ta) return { how: 'text', el: ta.el };
    if (inputs[0]) return { how: 'text', el: inputs[0].el };
    if (sel) return { how: 'select', el: sel.el };
    return null;
  }

  function bestIn(list, v) {
    const want = core(v);
    let best = null, bs = 0;
    for (const x of list) {
      const c = core(x.t);
      if (!c) continue;
      let s = 0;
      if (c === want) s = 3;
      else if (want.length >= 3 && c.length >= 3 && (c.includes(want) || want.includes(c))) s = 1;
      if (s > bs) { bs = s; best = x; }
    }
    return best;
  }

  function pickSelect(sel, values, replace, fillTo) {
    const opts = Array.from(sel.options).map((o) => ({ o, t: o.textContent }));
    const hits = [], miss = [], added = [];
    values.forEach((v) => { const b = bestIn(opts, v); if (b && !hits.includes(b.o)) hits.push(b.o); else if (!b) miss.push(v); });
    // إكمال العدد المطلوب (مثل ثلاثة مستويات) من الخيارات المتاحة إن لم تطابق كلها
    if (fillTo && sel.multiple && hits.length < fillTo) {
      for (const o of sel.options) {
        if (hits.length >= fillTo) break;
        if (hits.includes(o) || !o.value || /^(أخرى|اخرى|اختر|--)/.test(clean(o.textContent))) continue;
        hits.push(o); added.push(clean(o.textContent));
      }
    }
    if (sel.multiple) {
      Array.from(sel.options).forEach((o) => { if (hits.includes(o)) o.selected = true; else if (replace) o.selected = false; });
    } else if (hits[0]) {
      setNative(sel, hits[0].value); hits[0].selected = true;
    }
    fire(sel, 'input'); fire(sel, 'change'); jqRefresh(sel);
    return { hits: hits.length, miss: added.length ? [] : miss, replaced: added.length ? miss : [], added, already: 0 };
  }

  function fireMouse(el, type) {
    const w = winOf(el);
    let ev;
    try {
      const C = type.startsWith('pointer') && w.PointerEvent ? w.PointerEvent : w.MouseEvent;
      ev = new C(type, { bubbles: true, cancelable: true, view: w, button: 0 });
    } catch (e) { ev = new w.Event(type, { bubbles: true }); }
    el.dispatchEvent(ev);
  }
  function fireKey(el, key) {
    const w = winOf(el);
    ['keydown', 'keyup'].forEach((t) => {
      try { el.dispatchEvent(new w.KeyboardEvent(t, { key, code: key, bubbles: true, cancelable: true })); } catch (e) {}
    });
  }

  const OPTION_LIKE = '[role="option"], li, .dropdown-item, .select2-results__option, .ng-option, .mat-option, .mat-mdc-option, [class*="option"], [class*="item"]';
  function optionCandidates(doc, v, labelEl) {
    const want = core(v);
    const out = [];
    const nodes = doc.querySelectorAll('[role="option"], li, a, div, span, p, label, button');
    for (const n of nodes) {
      const raw = n.textContent || '';
      if (raw.length > 140) continue;
      if (n.children.length && Array.from(n.children).some((c) => nrm(c.textContent) === nrm(raw))) continue;
      if (n.closest('[contenteditable="true"],[contenteditable=""],textarea,select,script,style')) continue;
      if (labelEl && (labelEl === n || labelEl.contains(n))) continue;
      const c = core(raw);
      if (!c) continue;
      let s = -1;
      if (c === want) s = 3;
      else if (want.length >= 4 && c.length >= 4 && (c.includes(want) || want.includes(c))) s = 1;
      if (s < 0 || !isRendered(n)) continue;
      const cls = String(n.className || '') + ' ' + String((n.parentElement && n.parentElement.className) || '');
      if (/tag|chip|badge|selection__choice|token|pill|ng-value/i.test(cls)) continue;
      const opt = n.closest('[role="option"], li') || n;
      if (opt.matches(OPTION_LIKE)) s += 1;
      out.push({ n: opt, s });
    }
    return out;
  }

  function fieldBox(input, labelEl) {
    let n = input;
    for (let i = 0; i < 6 && n.parentElement; i++) {
      if (n.parentElement.contains(labelEl)) break;
      n = n.parentElement;
    }
    return n;
  }

  // عند فتح نافذة الإضافة لا تكون الصفحة هي المركَّز عليها، فلا تُطلق أحداث التركيز تلقائيًا — نطلقها يدويًا
  function focusHard(el) {
    const doc = el.ownerDocument, w = winOf(el);
    try { el.focus({ preventScroll: true }); } catch (e) {}
    if (!doc.hasFocus()) {
      try { el.dispatchEvent(new w.FocusEvent('focus', { bubbles: false })); el.dispatchEvent(new w.FocusEvent('focusin', { bubbles: true })); } catch (e) {}
    }
  }
  function blurHard(el) {
    const doc = el.ownerDocument, w = winOf(el);
    const had = doc.hasFocus();
    try { el.blur(); } catch (e) {}
    if (!had) {
      try { el.dispatchEvent(new w.FocusEvent('blur', { bubbles: false })); el.dispatchEvent(new w.FocusEvent('focusout', { bubbles: true })); } catch (e) {}
    }
  }

  async function typePick(input, values, labelEl) {
    const doc = input.ownerDocument;
    const box = fieldBox(input, labelEl);
    const res = { hits: 0, miss: [], already: 0 };
    for (const v of values) {
      const want = core(v);
      // هل هو مختار مسبقًا (يظهر كوسم داخل الحقل)؟
      const chips = Array.from(box.querySelectorAll('*')).filter((n) => !n.children.length && core(n.textContent) === want && isRendered(n) &&
        !n.closest('[role="option"], [role="listbox"], .dropdown-menu, [class*="dropdown"], [class*="option"], [class*="menu"], [class*="panel"]'));
      if (chips.length) { res.already++; continue; }
      // إغلاق القائمة السابقة ثم إعادة فتحها لكل خيار
      if (doc.activeElement === input) { blurHard(input); await sleep(180); }
      const pre = new Set(optionCandidates(doc, v, labelEl).map((x) => x.n));
      try { input.scrollIntoView({ block: 'center' }); } catch (e) {}
      focusHard(input);
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => fireMouse(input, t));
      await sleep(150);
      const query = String(v).replace(/[()]/g, ' ').split(/[\s/]+/).filter(Boolean).slice(0, 2).join(' ');
      setNative(input, query);
      fire(input, 'input', 'InputEvent');
      fireKey(input, query.slice(-1));
      let pick = null;
      for (let i = 0; i < 10 && !pick; i++) {
        await sleep(150);
        const c = optionCandidates(doc, v, labelEl).filter((x) => !box.contains(x.n) || x.n.matches('[role="option"]'))
          .filter((x) => !pre.has(x.n) || x.n.matches(OPTION_LIKE));
        c.sort((a, b) => b.s - a.s);
        pick = c[0] && c[0].n;
      }
      if (!pick) {
        setNative(input, ''); fire(input, 'input', 'InputEvent');
        await sleep(300);
        const c = optionCandidates(doc, v, labelEl).filter((x) => !pre.has(x.n) && !box.contains(x.n));
        c.sort((a, b) => b.s - a.s);
        pick = c[0] && c[0].n;
      }
      if (!pick) { res.miss.push(v); setNative(input, ''); fire(input, 'input', 'InputEvent'); continue; }
      try { pick.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => fireMouse(pick, t));
      await sleep(250);
      if (input.value) { setNative(input, ''); fire(input, 'input', 'InputEvent'); }
      fireKey(input, 'Escape');
      await sleep(120);
      res.hits++;
    }
    fireKey(input, 'Escape');
    blurHard(input);
    return res;
  }

  // مربعات الاختيار الواقعة بين عنوان البند والعنوان التالي (مثل قائمة المخرجات التعليمية)
  function checksFor(doc, labelEl, found) {
    const others = Object.values(found).filter((e) => e !== labelEl && before(labelEl, e));
    let next = null;
    others.forEach((e) => { if (!next || before(e, next)) next = e; });
    const inRange = (el) => before(labelEl, el) && (!next || before(el, next));
    const natives = Array.from(doc.querySelectorAll('input[type="checkbox"]')).filter((el) => !el.disabled && inRange(el));
    const roles = Array.from(doc.querySelectorAll('[role="checkbox"]')).filter((el) => inRange(el) && !el.querySelector('input[type="checkbox"]') && !natives.some((n) => el.contains(n) || n.contains(el)));
    return natives.concat(roles);
  }
  const isChecked = (el) => el.tagName === 'INPUT' ? el.checked : el.getAttribute('aria-checked') === 'true';
  async function checkOne(el) {
    if (isChecked(el)) return true;
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    if (el.tagName === 'INPUT') {
      const lbl = el.closest('label') || (el.id && el.ownerDocument.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
      if (!isRendered(el) && lbl && isRendered(lbl)) lbl.click(); else el.click();
      await sleep(40);
      if (!el.checked) { el.checked = true; fire(el, 'input'); fire(el, 'change'); }
    } else {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((t) => fireMouse(el, t));
      el.click();
      await sleep(40);
    }
    return isChecked(el);
  }

  function describe(el) {
    const chain = [];
    let n = el.parentElement;
    for (let i = 0; i < 3 && n; i++, n = n.parentElement) chain.push(n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).trim().split(/\s+/).slice(0, 3).join('.') : ''));
    const api = apiEditor(el);
    return {
      tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id || '', name: el.getAttribute('name') || '',
      cls: String(el.className || '').slice(0, 80), role: el.getAttribute('role') || '',
      aria: ['aria-autocomplete', 'aria-haspopup', 'aria-expanded'].filter((a) => el.hasAttribute(a)).join(','),
      ce: el.isContentEditable || false, vis: isRendered(el), api: api ? api.type : (ck5For(el) ? 'ck5' : ''),
      multiple: !!el.multiple, opts: el.options ? el.options.length : 0, ph: el.getAttribute('placeholder') || '', parents: chain.join(' > '),
    };
  }

  // ---------- تاريخ النشر ----------
  const PUB_SEL = 'input[name*="publish_date"], input.pubDateClass, input[id^="publishdate"], input[placeholder*="تاريخ النشر"]';
  function fmtDate(d, fmt) {
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yy = String(d.getFullYear());
    return String(fmt || 'yyyy-mm-dd').toLowerCase().replace(/yyyy|yy/, yy).replace('mm', mm).replace('dd', dd);
  }
  function setPublishDates(doc, iso, opts) {
    // إغلاق أي رسالة سابقة من نور (مثل: التاريخ مستخدم) قبل كتابة تاريخ جديد
    try { doc.querySelectorAll('.swal2-popup .swal2-confirm').forEach((b) => { if (isRendered(b)) b.click(); }); } catch (e) {}
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d, 8, 0, 0);
    const allPub = Array.from(doc.querySelectorAll(PUB_SEL)).filter((el) => !el.disabled && el.type !== 'hidden');
    // الصفوف المخفية قوالب احتياطية في نور (حتى ٢٠ صفًا) — لا نلمس إلا الظاهرة
    let inputs = allPub.filter((el) => isRendered(el));
    if (!inputs.length) inputs = allPub.slice(0, 1);
    if (!opts.allRows) inputs = inputs.slice(0, 1);
    const out = [];
    for (const el of inputs) {
      const w = winOf(el);
      const $ = w.jQuery;
      let method = 'text';
      try {
        if ($ && $.fn && $.fn.datepicker && $(el).hasClass('hasDatepicker')) {
          $(el).datepicker('setDate', date); method = 'jquery-ui';
          // setDate لا يستدعي onSelect، والموقع قد يعتمد عليه لتحميل الحصص — نستدعيه كما لو اختاره المستخدم
          try {
            const onSel = $(el).datepicker('option', 'onSelect');
            if (typeof onSel === 'function') onSel.call(el, el.value, $.datepicker._getInst ? $.datepicker._getInst(el) : null);
          } catch (e) {}
        }
        else if ($ && $(el).data && $(el).data('datepicker') && typeof $(el).data('datepicker').update === 'function') { $(el).datepicker('update', date); method = 'bootstrap'; }
        else if ($ && $(el).data && $(el).data('daterangepicker')) { const p = $(el).data('daterangepicker'); p.setStartDate(date); p.setEndDate(date); method = 'daterangepicker'; }
        else if ($ && $(el).data && $(el).data('DateTimePicker')) { $(el).data('DateTimePicker').date(date); method = 'datetimepicker'; }
        else if (el._flatpickr) { el._flatpickr.setDate(date, true); method = 'flatpickr'; }
        else if (el.type === 'date') { setNative(el, iso); method = 'native'; }
        else {
          const fmt = el.getAttribute('data-date-format') || el.getAttribute('data-format') || opts.format || 'yyyy-mm-dd';
          setNative(el, fmtDate(date, fmt)); method = 'text:' + fmt;
        }
      } catch (e) { setNative(el, fmtDate(date, opts.format)); method = 'fallback'; }
      if (!el.value) setNative(el, fmtDate(date, opts.format));
      fire(el, 'input', 'InputEvent'); fire(el, 'change'); fire(el, 'blur', 'FocusEvent');
      try { if ($) $(el).trigger('change'); } catch (e) {}
      out.push({ value: el.value, method });
      flash({ el });
    }
    return out;
  }

  if (action === 'setPublishDate') {
    const all = [];
    for (const d of docs) all.push(...setPublishDates(d.doc, payload.date, payload));
    return { frames, dates: all };
  }

  // ---------- تقرير الصفحة الكامل (للتشخيص) ----------
  if (action === 'pageReport') {
    const out = { url: location.href, title: document.title, frames, forms: [], controls: [], buttons: [], alerts: [], lib: {} };
    try {
      const $ = window.jQuery;
      out.lib = {
        jquery: $ && $.fn ? $.fn.jquery : '', uiDatepicker: !!($ && $.datepicker),
        uiFormat: $ && $.datepicker && $.datepicker._defaults ? $.datepicker._defaults.dateFormat : '',
        bsDatepicker: !!($ && $.fn && $.fn.datepicker && $.fn.datepicker.defaults), chosen: !!($ && $.fn && $.fn.chosen),
        ckeditor: window.CKEDITOR ? Object.keys(window.CKEDITOR.instances || {}) : [],
      };
    } catch (e) {}
    for (const d of docs) {
      d.doc.querySelectorAll('form').forEach((f) => out.forms.push({ id: f.id, cls: String(f.className || ''), action: f.getAttribute('action') || '', method: f.getAttribute('method') || '' }));
      d.doc.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.type === 'hidden' && !/token|key|_method|lesson|course|unit|class|section|week/i.test(el.name || '')) return;
        const r = {
          tag: el.tagName.toLowerCase(), type: el.type || '', name: el.getAttribute('name') || '', id: el.id || '',
          cls: String(el.className || '').slice(0, 80), ph: el.getAttribute('placeholder') || '', label: labelOf(el).slice(0, 80),
          vis: isRendered(el), ro: !!el.readOnly, dis: !!el.disabled,
        };
        if (el.tagName === 'SELECT') {
          r.opts = Array.from(el.options).slice(0, 40).map((o) => clean(o.textContent));
          r.sel = Array.from(el.selectedOptions || []).map((o) => clean(o.textContent));
        } else if (el.type === 'checkbox' || el.type === 'radio') r.checked = el.checked;
        else r.value = String(el.value || '').slice(0, 60);
        const data = {};
        for (const a of el.attributes) if (a.name.startsWith('data-')) data[a.name] = a.value.slice(0, 40);
        if (Object.keys(data).length) r.data = data;
        out.controls.push(r);
      });
      d.doc.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn').forEach((b) => {
        if (!isRendered(b)) return;
        out.buttons.push({ tag: b.tagName.toLowerCase(), type: b.type || '', text: clean(b.textContent || b.value).slice(0, 40), id: b.id || '', cls: String(b.className || '').slice(0, 60), form: b.form ? (b.form.id || b.form.className || 'form') : '' });
      });
      d.doc.querySelectorAll('.alert, .message, .error-message, .flash, #flashMessage, .invalid-feedback, .help-block, .toast, .swal2-popup').forEach((a) => {
        if (isRendered(a) && clean(a.textContent)) out.alerts.push({ cls: String(a.className || '').slice(0, 50), text: clean(a.textContent).slice(0, 120) });
      });
    }
    return out;
  }

  // ---------- الجاهزية والحفظ والتحقق من الأخطاء ----------
  if (action === 'ready') {
    const keys = payload.keys || [];
    let ck = true;
    try { if (window.CKEDITOR) ck = Object.values(window.CKEDITOR.instances || {}).every((i) => i.status === 'ready'); } catch (e) {}
    let found = 0;
    for (const d of docs) found = Math.max(found, Object.keys(locate(d.doc, keys)).length);
    return { frames, ready: document.readyState === 'complete' && ck, found, url: location.href };
  }

  // رسالة حقيقية فيها كلمات (لا علامة «*» الإلزامية ولا رموز)
  const isWords = (t) => /[؀-ۿa-z]{3}/i.test(t || '');
  const alertsNow = () => {
    const errs = [], oks = [];
    for (const d of docs) {
      d.doc.querySelectorAll('.swal2-popup.swal2-icon-error, .swal2-popup.swal2-icon-warning').forEach((a) => {
        const t = clean((a.querySelector('.swal2-title') || {}).textContent + ' ' + (a.querySelector('.swal2-html-container, .swal2-content') || {}).textContent);
        if (t && isRendered(a)) errs.push(t);
      });
      d.doc.querySelectorAll('.alert-danger, .alert-error, .error-message, .error, .has-error .help-block, .invalid-feedback, .text-danger, #flashMessage.error, .message.error, .toast-error').forEach((a) => {
        if (a.closest('label, h1, h2, h3, h4, option, .swal2-popup')) return; // علامات الحقول الإلزامية وعناوين البنود ليست أخطاء
        const t = clean(a.textContent); if (t && isWords(t) && isRendered(a) && t.length < 300) errs.push(t);
      });
      d.doc.querySelectorAll('.alert-success, .message.success, #flashMessage, .flash-success, .swal2-success, .swal2-icon-success, .toast-success, .alert-info').forEach((a) => {
        const box = a.closest('.swal2-popup') || a;
        const t = clean(box.textContent); if (t && isWords(t) && isRendered(box) && t.length < 300 && !errs.includes(t)) oks.push(t);
      });
    }
    return { errs: [...new Set(errs)].slice(0, 6), oks: [...new Set(oks)].slice(0, 4) };
  };

  if (action === 'noorTitle') {
    for (const d of docs) {
      const el = d.doc.querySelector('#PreparationTitle, input[name="data[Preparation][title]"]');
      if (el && el.value) return { frames, title: el.value };
    }
    return { frames, title: '' };
  }

  if (action === 'checkErrors') {
    // login: صفحة دخول (انتهت الجلسة) · form: الصفحة نموذج تحضير من جديد
    let login = false, form = false;
    for (const d of docs) {
      if (d.doc.querySelector('input[type="password"]')) login = true;
      if (d.doc.querySelector('#PreparationTitle, [name^="data[Preparation]"]')) form = true;
    }
    return Object.assign({ frames, url: location.href, login, form }, alertsNow());
  }

  // معلومات سريعة عن الصفحة: هل هي نموذج تحضير في نور؟ وما عنوان الدرس؟
  if (action === 'context') {
    const keys = payload.keys || [];
    let found = 0, title = '';
    for (const d of docs) {
      found = Math.max(found, Object.keys(locate(d.doc, keys)).length);
      const el = d.doc.querySelector('#PreparationTitle, input[name="data[Preparation][title]"]');
      if (el && el.value && !title) title = el.value;
    }
    let ck = true;
    try { if (window.CKEDITOR) ck = Object.values(window.CKEDITOR.instances || {}).every((i) => i.status === 'ready'); } catch (e) {}
    // علامة تتركها التعبئة على الصفحة: أي حصة عُبّئت في هذه النسخة من النموذج
    let mark = null;
    for (const d of docs) {
      const a = d.doc.documentElement && d.doc.documentElement.getAttribute('data-hadir-filled');
      if (a) { try { mark = JSON.parse(a); } catch (e) {} break; }
    }
    return { frames, found, title, mark, tree: !!document.getElementById('jstree_node_tree'), ready: document.readyState === 'complete' && ck, url: location.href };
  }

  if (action === 'saveForm') {
    try { if (window.CKEDITOR) Object.values(window.CKEDITOR.instances || {}).forEach((i) => i.updateElement && i.updateElement()); } catch (e) {}
    const words = payload.words || ['حفظ', 'حفظ التحضير', 'save'];
    let btn = null;
    for (const d of docs) {
      const all = Array.from(d.doc.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'))
        .filter((b) => isRendered(b) && words.some((w) => nrm(b.textContent || b.value) === nrm(w)) && !b.closest('.swal2-popup, .modal'));
      const cands = all.filter((b) => !b.disabled && !b.classList.contains('disabled'));
      if (!cands.length && all.length) return { frames, clicked: false, disabled: true };
      cands.sort((a, b) => (b.type === 'submit') - (a.type === 'submit'));
      if (cands[0]) { btn = cands[0]; break; }
    }
    if (!btn) return { frames, clicked: false };
    try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
    setTimeout(() => btn.click(), 50);
    return { frames, clicked: true, text: clean(btn.textContent || btn.value) };
  }

  // ---------- شجرة الدروس في نور (jstree): صفحة «إضافة تحضير» تفتح بلا درس، ويُختار من الشجرة ----------
  // op: state | units (فتح الفصول وإرجاع الوحدات) | lessons (فتح وحدات محددة وإرجاع دروسها) | select | title
  if (action === 'noorTree') {
    if (window !== window.top) return { frames, skipFrame: true };
    const tree = document.getElementById('jstree_node_tree');
    const titleEl = document.querySelector('#PreparationTitle, input[name="data[Preparation][title]"]');
    const lidEl = document.getElementById('lesson-id');
    if (!tree) return { frames, tree: false, title: titleEl ? titleEl.value : '' };
    const txt = (li) => { const a = li && li.querySelector(':scope > a.jstree-anchor'); return a ? a.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const lvl = (li) => {
      const a = li.querySelector(':scope > a.jstree-anchor');
      const n = a && +a.getAttribute('aria-level');
      if (n) return n;
      let k = 0; for (let p = li; p && p !== tree; p = p.parentElement) if (p.matches && p.matches('li.jstree-node')) k++;
      return k;
    };
    const byId = (id) => (id ? document.getElementById(id) : null);
    const kids = (li) => (li ? Array.from(li.querySelectorAll(':scope > ul > li.jstree-node')) : []);
    const nodes = (level) => Array.from(tree.querySelectorAll('li.jstree-node')).filter((li) => lvl(li) === level);
    const inst = () => { try { return window.jQuery && window.jQuery(tree).jstree && window.jQuery(tree).jstree(true); } catch (e) { return null; } };
    const state = () => {
      const sel = tree.querySelector('a.jstree-anchor[aria-selected="true"], a.jstree-clicked');
      const li = sel && sel.closest('li.jstree-node');
      const lid = lidEl ? String(lidEl.value || '') : '';
      const title = titleEl ? String(titleEl.value || '').trim() : '';
      return { frames, tree: true, title, lessonId: lid, selected: li ? { id: li.id, nodeId: li.getAttribute('node_id') || '', text: txt(li), level: lvl(li) } : null,
        hasLesson: !!title && (!lidEl || (lid && lid !== '0')), url: location.href };
    };
    // فتح عقدة: إن لم تُحمَّل أبناؤها بعد نضغطها كما يفعل المعلم (نور تجلب الأبناء عند الاختيار) وننتظر ظهورهم
    async function expand(id) {
      const li = byId(id);
      if (!li) return [];
      if (kids(li).length) {
        if (!li.classList.contains('jstree-open')) { try { const t = inst(); if (t) t.open_node(id); } catch (e) {} }
        return kids(byId(id));
      }
      // أبناء محمّلة لكن العقدة مطويّة (jstree يحذفهم من الصفحة عند الطي): نفتحها بدل الضغط
      const t = inst();
      let model = null;
      try { model = t && t.get_node(id); } catch (e) {}
      if (model && model.children && model.children.length) {
        try { t.open_node(id); } catch (e) {}
        await waitDom(tree, () => kids(byId(id)).length > 0, { timeout: 3000 });
        if (kids(byId(id)).length) return kids(byId(id));
      }
      const a = li.querySelector(':scope > a.jstree-anchor');
      if (!a) return [];
      // الضغط على عقدة مختارة أصلًا لا يطلق «الاختيار» فلا تُجلب أبناؤها — نلغي اختيارها أولًا
      if (a.getAttribute('aria-selected') === 'true' || a.classList.contains('jstree-clicked')) { try { if (t) t.deselect_node(id); } catch (e) {} }
      a.click();
      const t0 = Date.now();
      const idle = () => { try { return Date.now() - t0 > 700 && window.jQuery && window.jQuery.active === 0; } catch (e) { return false; } };
      await waitDom(tree, () => kids(byId(id)).length > 0 || idle(), { timeout: 6000, quiet: 300, poll: 150 });
      const now = byId(id);
      if (now && kids(now).length && !now.classList.contains('jstree-open')) { try { const t = inst(); if (t) t.open_node(id); } catch (e) {} }
      return kids(byId(id));
    }
    const LESSON = +payload.lessonLevel || 4, UNIT = LESSON - 1, TERM = LESSON - 2;
    const lessonsUnder = (uli) => kids(uli).map((li) => ({ id: li.id, nodeId: li.getAttribute('node_id') || '', text: txt(li), unit: txt(uli), unitId: uli.id }));
    return (async () => {
      const op = payload.op || 'state';
      if (op === 'state') return state();
      // نور تحذف أبناء الوحدات الأخرى (وتعيد إنشاءها بمعرّفات جديدة) كلما اخترت وحدة أو فصلًا،
      // لذلك نتعامل مع العقد بنصوصها: الفصل ← الوحدة ← الدرس، ونعيد فتح الطريق إليها عند الحاجة
      const termByText = (t) => nodes(TERM).find((li) => txt(li) === t) || null;
      const unitByText = (u, term) => nodes(UNIT).find((li) => txt(li) === u && (!term || txt(li.parentElement && li.parentElement.closest('li.jstree-node')) === term)) || null;
      async function openUnit(u) {
        let li = (u.id && byId(u.id) && txt(byId(u.id)) === u.text) ? byId(u.id) : unitByText(u.text, u.term);
        if (!li && u.term) { const t = termByText(u.term); if (t) { await expand(t.id); li = unitByText(u.text, u.term); } }
        if (!li) { for (const t of nodes(TERM)) { if (!kids(t).length) await expand(t.id); li = unitByText(u.text); if (li) break; } }
        if (!li) return null;
        await expand(li.id);
        return unitByText(u.text, u.term) || li;
      }
      if (op === 'terms') {
        // أسماء الفصول الدراسية دون فتحها — الشجرة قد تُجلب بعد النموذج، أو يكون «الكتاب» مطويًا
        if (!nodes(TERM).length) {
          await waitDom(tree, () => nodes(TERM).length > 0, { timeout: 8000, quiet: 200 });
          if (!nodes(TERM).length) for (const root of nodes(TERM - 1)) await expand(root.id);
          if (!nodes(TERM).length) await waitDom(tree, () => nodes(TERM).length > 0, { timeout: 6000, quiet: 200 });
        }
        return Object.assign(state(), { terms: nodes(TERM).map((t) => txt(t)) });
      }
      if (op === 'units') {
        // الفصول الدراسية تُفتح بالترتيب لتظهر وحداتها — ونتوقف حين تظهر الوحدة المطلوبة برقمها
        const uNo = (t) => {
          const s = String(t || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).toLowerCase();
          const m = s.match(/(?:^|[^a-z])unit\s*(\d+)|(?:الوحدة|وحدة)\s*(\d+)/);
          if (m) return +(m[1] || m[2]);
          return /(welcome|starter|hello)\s+unit/.test(s) ? 0 : null;
        };
        const want = payload.unitNo;
        const units = [];
        const collect = () => nodes(UNIT).forEach((u) => {
          const term = txt(u.parentElement && u.parentElement.closest('li.jstree-node'));
          if (!units.some((x) => x.text === txt(u) && x.term === term)) units.push({ id: u.id, text: txt(u), term });
        });
        collect();
        for (const t of nodes(TERM)) {
          if (want != null && units.some((u) => uNo(u.text) === want)) break;
          if (!kids(byId(t.id)).length) await expand(t.id);
          collect();
        }
        return Object.assign(state(), { units });
      }
      if (op === 'lessons') {
        const out = [];
        for (const u of payload.units || []) {
          const li = await openUnit(u);
          if (li) out.push(...lessonsUnder(li).map((x) => Object.assign(x, { term: u.term || '' })));
        }
        return Object.assign(state(), { lessons: out });
      }
      if (op === 'allLessons') {
        // كل دروس الفصل (أو الفصول المطلوبة) بالترتيب — لمطابقة الدروس بترتيبها حين لا تكفي الأسماء
        const out = [];
        const terms = nodes(TERM).map((t) => txt(t)).filter((t) => !payload.terms || payload.terms.includes(t));
        for (const term of terms) {
          const t = termByText(term);
          if (!t) continue;
          if (!kids(t).length) await expand(t.id);
          const units = nodes(UNIT).filter((u) => txt(u.parentElement && u.parentElement.closest('li.jstree-node')) === term).map((u) => txt(u));
          for (const unit of units) {
            const li = await openUnit({ text: unit, term });
            if (li) lessonsUnder(li).forEach((x) => out.push({ text: x.text, unit, term }));
          }
        }
        return Object.assign(state(), { lessons: out });
      }
      if (op === 'select') {
        // الدرس بنصّه داخل وحدته (قد تكون أُغلقت أو أُعيد إنشاؤها منذ قرأناها)
        const findLesson = () => {
          const byIdLi = payload.id && byId(payload.id);
          if (byIdLi && txt(byIdLi) === payload.text) return byIdLi;
          return nodes(LESSON).find((li) => txt(li) === payload.text && (!payload.unit || txt(li.parentElement && li.parentElement.closest('li.jstree-node')) === payload.unit)) || null;
        };
        let li = findLesson();
        if (!li && payload.unit) { await openUnit({ text: payload.unit, term: payload.term }); li = findLesson(); }
        const a = li && li.querySelector(':scope > a.jstree-anchor');
        if (!a) return Object.assign(state(), { ok: false, why: 'gone' });
        const want = li.getAttribute('node_id') || '';
        const done = () => { const s = state(); return s.title && (!want || !lidEl || s.lessonId === want); };
        try { a.scrollIntoView({ block: 'center' }); } catch (e) {}
        a.click();
        // العنوان ورقم الدرس يُكتبان فورًا، والمخرجات تُجلب من نور بعدها
        await waitDom(document.body, done, { timeout: 4000, poll: 100 });
        // احتياط: الاختيار ببرمجة الشجرة نفسها (يطلق حدث الاختيار الذي تستمع له نور)
        if (!done()) {
          try { const t = inst(); if (t) { t.deselect_all(); t.select_node(li.id); } } catch (e) {}
          await waitDom(document.body, done, { timeout: 3000, poll: 100 });
        }
        const box = document.getElementById('criteria-checkbox');
        if (box && done()) await waitDom(box, () => box.querySelectorAll('input[type="checkbox"]').length > 0, { timeout: 5000, quiet: 300 });
        const s = state();
        return Object.assign(s, { ok: done(), outcomes: box ? box.querySelectorAll('input[type="checkbox"]').length : -1 });
      }
      if (op === 'title') {
        if (!titleEl) return Object.assign(state(), { ok: false });
        const v = String(payload.value || '');
        try {
          const proto = Object.getPrototypeOf(titleEl);
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(titleEl, v); else titleEl.value = v;
        } catch (e) { titleEl.value = v; }
        titleEl.dispatchEvent(new Event('input', { bubbles: true }));
        titleEl.dispatchEvent(new Event('change', { bubbles: true }));
        return Object.assign(state(), { ok: titleEl.value === v });
      }
      return state();
    })();
  }

  if (action === 'noor' || action === 'noorDiag') {
    const items = payload.items || [];
    // انتظار استقرار خيارات قائمة (قد تُحمَّل من الخادم بعد تحديد المخرجات، مثل قائمة المستوى)
    // (يكتمل حين تهدأ التغييرات نصف ثانية بعد ظهور الخيارات، أو حين تُستبدل القائمة بعنصر جديد)
    async function settleOptions(sel, maxMs) {
      const doc = sel.ownerDocument;
      await waitDom(doc.body || doc, () => !sel.isConnected || (sel.options && sel.options.length > 0), { timeout: maxMs || 2500, quiet: 500 });
    }
    return (async () => {
      const results = {};
      let outcomesChanged = false, settledOnce = false;
      for (const d of docs) {
        const found = locate(d.doc, items);
        if (!Object.keys(found).length) continue;
        const fillables = regionItems(d.doc);
        for (const it of items) {
          if (results[it.key] && results[it.key].status === 'ok') continue;
          const labelEl = found[it.key];
          if (!labelEl) { results[it.key] = results[it.key] || { status: 'nolabel' }; continue; }
          let region = regionFor(labelEl, found, fillables);
          if (action === 'noorDiag') {
            const cks = checksFor(d.doc, labelEl, found);
            results[it.key] = { label: clean(labelEl.textContent), labelTag: labelEl.tagName.toLowerCase(), checkboxes: cks.length, checkboxSample: cks.slice(0, 2).map(describe), fields: region.map((r) => describe(r.el)) };
            continue;
          }
          if (it.mode === 'checkall') {
            const cks = checksFor(d.doc, labelEl, found);
            if (cks.length) {
              let hits = 0, already = 0;
              for (const c of cks) {
                if (isChecked(c)) { already++; continue; }
                if (await checkOne(c)) hits++;
              }
              const okAll = hits + already === cks.length;
              if (hits > 0) outcomesChanged = true;
              results[it.key] = { status: okAll ? 'ok' : 'partial', how: 'checks', hits, already, total: cks.length };
              continue;
            }
            // لا توجد مربعات: نكتب المخرجات نصًا في الخانة إن وُجدت
          }
          let tgt = pickTarget(region, it.mode === 'checkall' ? 'text' : it.mode);
          // بعد تحديد المخرجات قد تُعاد قائمة المستوى من الخادم: ننتظرها مرة واحدة فقط (القوائم الأخرى ثابتة)
          if (tgt && tgt.how === 'select' && outcomesChanged && (!settledOnce || !(tgt.el.options && tgt.el.options.length))) {
            settledOnce = true;
            await settleOptions(tgt.el);
            if (!tgt.el.isConnected) {
              // استُبدلت القائمة بعنصر جديد بعد التحميل — نعيد تحديدها
              const found2 = locate(d.doc, items);
              const lab2 = found2[it.key];
              if (lab2) { region = regionFor(lab2, found2, regionItems(d.doc)); tgt = pickTarget(region, it.mode) || tgt; }
            }
          }
          if (!tgt) { results[it.key] = { status: 'notarget', label: clean(labelEl.textContent) }; continue; }
          const values = Array.isArray(it.value) ? it.value : [it.value];
          try {
            if (tgt.how === 'select' || tgt.how === 'type') {
              if (!values.length) { results[it.key] = { status: 'ok', how: tgt.how, hits: 0 }; continue; }
              const vals = it.other ? values.concat(['أخرى']) : values;
              const r = tgt.how === 'select' ? pickSelect(tgt.el, vals, !payload.skipFilled, it.fillTo) : await typePick(tgt.el, vals, labelEl);
              // نص «أخرى» (مثل: الإستراتيجيات الأخرى) في الخانة التي تظهر بعد اختيارها
              let otherOk = null;
              if (it.other) {
                await sleep(200);
                const oi = region.map((x) => x.el).find((el) => el.tagName === 'INPUT' && /other|أخرى|الاخرى/i.test((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('placeholder') || '')));
                if (oi) { setNative(oi, it.other); fire(oi, 'input', 'InputEvent'); fire(oi, 'change'); fire(oi, 'blur', 'FocusEvent'); otherOk = true; } else otherOk = false;
              }
              results[it.key] = { status: r.miss.length || otherOk === false ? (r.hits || r.already ? 'partial' : 'miss') : 'ok', how: tgt.how, hits: r.hits, already: r.already, miss: r.miss, added: r.added, replaced: r.replaced, other: otherOk };
              flash({ el: tgt.el, host: null });
            } else {
              const kind = tgt.how === 'rich' ? 'rich' : 'text';
              const target = { el: tgt.el, kind, type: tgt.el.type ? String(tgt.el.type).toLowerCase() : '', host: tgt.host };
              if (payload.skipFilled && currentIsFilled(target)) { results[it.key] = { status: 'skip', how: tgt.how }; continue; }
              const v = Array.isArray(it.value) ? it.value.join('، ') : it.value;
              const ok = writeValue(target, { kind: Array.isArray(it.value) ? 'text' : 'rich', value: v });
              results[it.key] = { status: ok ? 'ok' : 'fail', how: tgt.how };
              flash(target);
            }
          } catch (e) {
            results[it.key] = { status: 'fail', error: String(e && e.message || e) };
          }
        }
      }
      if (action === 'noor' && payload.publishDate) {
        const ds = [];
        for (const d of docs) ds.push(...setPublishDates(d.doc, payload.publishDate, payload));
        results.publish = ds.length
          ? { status: ds.every((x) => x.value) ? 'ok' : 'fail', how: 'date', values: ds.map((x) => x.value), method: ds[0].method }
          : { status: 'nolabel' };
        // رسالة رفض التاريخ (إن ظهرت) تأتي بعد لحظات من كتابته
        await waitDom(document.body, () => alertsNow().errs.length > 0, { timeout: 400 });
        const al = alertsNow();
        if (al.errs.length) results.publish = Object.assign(results.publish, { status: 'fail', error: al.errs.join(' | ') });
      }
      // أسبوع العمل: نختار الأسبوع الذي يقع فيه تاريخ النشر إن كان «لا شيء»
      if (action === 'noor' && payload.publishDate && payload.setWeek !== false) {
        for (const d of docs) {
          const pubs = Array.from(d.doc.querySelectorAll(PUB_SEL)).filter((el) => isRendered(el));
          for (const pi of pubs) {
            const m = (pi.id || '').match(/(\d+)$/) || (pi.name || '').match(/date(\d+)/);
            const ws = m ? (d.doc.getElementById('week_id-' + m[1]) || d.doc.querySelector('select[name*="date' + m[1] + '][week_id]"]')) : null;
            if (!ws) continue;
            const opt = Array.from(ws.options).find((o) => {
              const ds = (o.textContent.match(/\d{4}-\d{2}-\d{2}/g) || []);
              return ds.length >= 2 && ds[0] <= payload.publishDate && payload.publishDate <= ds[1];
            });
            if (!opt) continue;
            setNative(ws, opt.value); opt.selected = true;
            fire(ws, 'change'); jqRefresh(ws);
            const styled = ws.nextElementSibling;
            if (styled && /select-styled|select-selected/.test(styled.className || '')) styled.textContent = opt.textContent.trim();
            results.week = { status: 'ok', how: 'week', values: [clean(opt.textContent)] };
          }
        }
      }
      // الصفوف/الحصص (lecture_timeslots): قد تُحمَّل بعد اختيار التاريخ — ننتظر استقرارها ثم نحدد الظاهرة كلها
      if (action === 'noor' && payload.checkTimeslots) {
        const findSlots = () => {
          const out = [];
          for (const d of docs) {
            d.doc.querySelectorAll('input[type="checkbox"].lecture_timeslots, input[type="checkbox"][name*="[timeslot]"]').forEach((el) => {
              if (el.disabled) return;
              const lbl = el.closest('label');
              if (isRendered(el) || (lbl && isRendered(lbl))) out.push(el);
            });
          }
          return out;
        };
        // تُحمَّل من نور بعد التاريخ: ننتظر ظهورها ثم هدوء القائمة (لا مدة ثابتة)
        let slots = await waitDom(document.body, () => { const s = findSlots(); return s.length ? s : false; }, { timeout: 3500, quiet: 300 });
        slots = slots || findSlots();
        if (!slots.length) results.timeslots = { status: 'nolabel' };
        else {
          let hits = 0, already = 0;
          for (const c of slots) { if (c.checked) { already++; continue; } if (await checkOne(c)) hits++; }
          results.timeslots = { status: hits + already === slots.length ? 'ok' : 'partial', how: 'checks', hits, already, total: slots.length };
        }
      }
      // خيارات يجب أن تكون محددة دائمًا (مثل: تعميم التحضير على كافة الجداول)
      if (action === 'noor' && (payload.ensureChecks || []).length) {
        for (const phrase of payload.ensureChecks) {
          const want = nrm(phrase);
          let hit = null;
          for (const d of docs) {
            const boxes = Array.from(d.doc.querySelectorAll('input[type="checkbox"]')).filter((el) => !el.disabled);
            hit = boxes.find((el) => {
              const lbl = el.closest('label') || (el.id && d.doc.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
              const t = nrm(lbl ? lbl.textContent : labelOf(el));
              return t && t.includes(want);
            });
            if (hit) break;
          }
          const key = 'check:' + phrase;
          if (!hit) { results[key] = { status: 'nolabel' }; continue; }
          const was = hit.checked;
          const ok = await checkOne(hit);
          results[key] = { status: ok ? 'ok' : 'fail', how: 'check', already: was ? 1 : 0 };
        }
      }
      // فحص قبل الحفظ: ما الذي سترفضه نور أو يبقي زر «حفظ» معطّلًا؟
      if (action === 'noor' && payload.preflight !== false) {
        const miss = [];
        let saw = false, saveBtn = null;
        for (const d of docs) {
          const doc = d.doc;
          const t = doc.querySelector('#PreparationTitle, input[name="data[Preparation][title]"]');
          if (!t) continue;
          saw = true;
          const lid = doc.getElementById('lesson-id');
          const hasTree = !!doc.getElementById('jstree_node_tree');
          let tv = String(t.value || '').trim();
          try { const w = doc.defaultView; const ck = w.CKEDITOR && w.CKEDITOR.instances && w.CKEDITOR.instances[t.id]; if (ck) tv = tv || String(ck.getData() || '').replace(/<[^>]+>/g, '').trim(); } catch (e) {}
          if (!tv || (hasTree && lid && (!lid.value || lid.value === '0'))) miss.push(hasTree ? 'الدرس — اختره من شجرة الدروس في نور' : 'العنوان');
          const crit = Array.from(doc.querySelectorAll('input[type="checkbox"][name^="Preparation[criteria]"], input[type="checkbox"][name="data[Preparation][objectives][]"]')).filter((c) => !c.disabled);
          if (crit.length && !crit.some((c) => c.checked)) miss.push('المخرجات التعليمية');
          const pubs = Array.from(doc.querySelectorAll(PUB_SEL)).filter((el) => isRendered(el) || /(^|-)1$/.test(el.id || ''));
          const pub = pubs[0];
          if (pub && !String(pub.value || '').trim()) miss.push('تاريخ النشر');
          const slots = Array.from(doc.querySelectorAll('input[type="checkbox"].lecture_timeslots')).filter((el) => {
            if (el.disabled) return false; const lbl = el.closest('label'); return isRendered(el) || (lbl && isRendered(lbl));
          });
          if (pub && pub.value && slots.length && !slots.some((c) => c.checked)) miss.push('الصفوف (الحصص)');
          saveBtn = saveBtn || Array.from(doc.querySelectorAll('button, input[type="submit"]')).find((b) => isRendered(b) && nrm(b.textContent || b.value) === nrm('حفظ') && !b.closest('.swal2-popup, .modal'));
        }
        if (saw) {
          // زر «حفظ» في نور يُفعَّل بعد لحظات من اكتمال الشروط
          if (!miss.length && saveBtn && saveBtn.disabled) await waitDom(saveBtn.ownerDocument.body, () => !saveBtn.disabled, { timeout: 1500, poll: 150 });
          if (!miss.length && saveBtn && saveBtn.disabled) miss.push('زر «حفظ» في نور ما زال معطّلًا — راجع البنود الإلزامية');
          results.preflight = { status: miss.length ? 'miss' : 'ok', missing: [...new Set(miss)] };
        }
      }
      // علامة على الصفحة بالحصة التي عُبّئت (ليُعرف عند الضغط على «حفظ» أي حصة حُفظت)
      if (action === 'noor' && payload.mark && Object.values(results).some((r) => r && (r.status === 'ok' || r.status === 'partial'))) {
        for (const d of docs) {
          try { if (Object.keys(locate(d.doc, items)).length) d.doc.documentElement.setAttribute('data-hadir-filled', JSON.stringify(payload.mark)); } catch (e) {}
        }
      }
      return { frames, results, url: location.href };
    })();
  }

  return { frames, error: 'unknown action' };
}
