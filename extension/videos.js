// فيديو لكل درس في «مكتبة الفيديو» بنور (المالك 2026-11-14): «الفديو يكون بالاضافة من روابط اليوتيوب المتعلقه بعنوان الدرس
// اذا لم تجد عنوان مناسب لا تعمل فديو لذلك الدرس». يبحث «حاضر» في يوتيوب من متصفح المعلم (إذن youtube.com يطلبه مرة واحدة
// حين يختار المعلم الفيديو)، ويأخذ لكل درس فيديو واحدًا عنوانه قريب من اسم الدرس، لا مقطعًا قصيرًا ولا طويلًا جدًا.
// نور: /teacher/attachments/index/BVideo/cid:<رقم> ← «رفع ملف فيديو جديد» upload/BVideo/cid/tid/tuid (نموذج #AttachmentUploadForm)

export const YT_ORIGIN = 'https://www.youtube.com/*';
export const VID_MIN_S = 60, VID_MAX_S = 25 * 60;

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// كلمات لا تميّز درسًا من درس
const GENERIC0 = ['درس', 'الدرس', 'دروس', 'وحده', 'الوحده', 'الفصل', 'فصل', 'مراجعه', 'تابع', 'جزء', 'الجزء', 'اول', 'الاول', 'ثاني', 'الثاني',
  'lesson', 'lessons', 'unit', 'part', 'review', 'the', 'and', 'of', 'a', 'an', 'to', 'in', 'on', 'for', 'with', 'my', 'your', 'من', 'في', 'على', 'الي', 'الى', 'عن', 'و', 'مع', 'ما', 'هو', 'هي', 'او', 'ثم', 'كيف', 'ماذا', 'لماذا'];
const GENERIC = new Set(GENERIC0.map((w) => norm(w)));
const stem = (w) => (w.length > 4 ? w.replace(/^(?:وال|بال|كال|فال|لل|ال)/, '') : w);
export function keyWords(s) {
  return [...new Set(norm(s).split(' ').filter((w) => w && !/^\d+$/.test(w) && !GENERIC.has(w) && w.length >= 2).map(stem))];
}
// اسم الدرس كما في شجرة نور بلا «Unit1: …:» ولا «الدرس الأول:» — ما يبقى هو موضوعه
export function lessonTopic(text) {
  return String(text || '').split(/[:：]/).map((x) => x.trim()).filter(Boolean).filter((x) => !/^(?:unit|lesson|الوحده|الوحدة|الدرس)\s*\S{0,12}$/i.test(x)).pop() || String(text || '');
}
// كم من كلمات الدرس في عنوان الفيديو (٠..١)، وعدد ما وُجد
export function titleScore(lesson, title) {
  const want = keyWords(lesson);
  if (!want.length) return { s: 0, n: 0, of: 0 };
  const have = new Set(keyWords(title));
  const hit = want.filter((w) => have.has(w) || [...have].some((h) => h.length >= 4 && w.length >= 4 && (h.startsWith(w) || w.startsWith(h))));
  return { s: hit.length / want.length, n: hit.length, of: want.length };
}
// «مناسب»: كلمات الدرس كلها في العنوان إن كانت كلمة أو اثنتين، وإلا ثلثاها على الأقل ولا أقل من كلمتين
export function fits(lesson, title) {
  const r = titleScore(lesson, title);
  if (!r.of) return false;
  return r.of <= 2 ? r.n === r.of && keyWords(lesson).some((w) => w.length >= 3) : r.n >= 2 && r.s >= 0.66;
}
const secs = (t) => String(t || '').split(':').reduce((a, x) => a * 60 + (+x || 0), 0);
// نتائج صفحة بحث يوتيوب (ytInitialData): [{ id, title, secs, channel }] — بلا Shorts ولا بث مباشر
export function parseResults(html) {
  const m = String(html || '').match(/ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!m) return [];
  let d; try { d = JSON.parse(m[1]); } catch (e) { return []; }
  const out = [];
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 40) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
    if (o.reelShelfRenderer || o.shortsLockupViewModel) return;
    const v = o.videoRenderer;
    if (v && v.videoId) {
      const title = ((v.title && (v.title.runs || []).map((r) => r.text).join('')) || (v.title && v.title.simpleText) || '').trim();
      const len = v.lengthText && (v.lengthText.simpleText || ((v.lengthText.accessibility || {}).accessibilityData || {}).label);
      const live = (v.badges || []).some((b) => /LIVE/.test(JSON.stringify(b))) || !len;
      const url = (((v.navigationEndpoint || {}).commandMetadata || {}).webCommandMetadata || {}).url || '';
      if (!live && !/\/shorts\//.test(url)) out.push({ id: v.videoId, title, secs: secs(v.lengthText && v.lengthText.simpleText), channel: ((v.ownerText || {}).runs || [{}])[0].text || '' });
      return;
    }
    for (const k in o) walk(o[k], depth + 1);
  };
  walk(d);
  return out;
}
export const ytUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
// أفضل فيديو لدرس من نتائج البحث، أو null إن لم يُناسبه عنوان
export function pickVideo(lesson, results, hint = '') {
  const ok = results.filter((v) => v.secs >= VID_MIN_S && v.secs <= VID_MAX_S && fits(lesson, v.title));
  // الأقرب لاسم الدرس أولًا، ثم ما يذكر المادة أو الصف (أقرب لدروس المنهج)
  const bonus = (t) => keyWords(hint).filter((w) => keyWords(t).includes(w)).length;
  ok.sort((a, b) => titleScore(lesson, b.title).s - titleScore(lesson, a.title).s || bonus(b.title) - bonus(a.title));
  return ok[0] || null;
}
export async function ytSearch(q, base = 'https://www.youtube.com/') {
  try {
    const r = await fetch(`${base}results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D&hl=ar`, { credentials: 'omit' });
    if (!r.ok) return null;
    return parseResults(await r.text());
  } catch (e) { return null; }
}

// ———— دوال تُنفَّذ في صفحة نور (MAIN world) ————

// مكتبة الفيديو: رابط «رفع ملف فيديو جديد» وعناوين ما فيها (من جدولها)
export async function vidLibRead() {
  const up = document.querySelector('#uploadAttachmentBtn, a[href*="/attachments/upload/BVideo/"]');
  const titles = new Set();
  document.querySelectorAll('table tbody tr td').forEach((td) => { const t = td.textContent.replace(/\s+/g, ' ').trim(); if (t) titles.add(t); });
  try {
    const u = new URL(location.href); u.search = '?start=0&page=1&length=1000&draw=1';
    const r = await fetch(u.href, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
    const j = await r.json();
    (j.data || []).forEach((row) => (Array.isArray(row) ? row : Object.values(row)).forEach((c) => { const d = document.createElement('div'); d.innerHTML = String(c == null ? '' : c); const t = d.textContent.replace(/\s+/g, ' ').trim(); if (t) titles.add(t); }));
  } catch (e) {}
  return { ok: !!up, upload: up ? up.href : '', titles: [...titles], url: location.href };
}
// «إضافة فيديو جديد»: العنوان واللغة ورابط يوتيوب وتاريخ النشر والدرس وكل شعب المادة، ثم «رفع»
export function vidFill(op) {
  const f = document.querySelector('#AttachmentUploadForm');
  if (!f) return { ok: false, err: 'noform', url: location.href };
  const $q = (s) => f.querySelector(s) || document.querySelector(s);
  const set = (el, v) => { if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const jq = window.jQuery;
  set($q('#attach_title'), op.title);
  set($q('#AttachmentComments'), op.comments || '');
  const lang = $q('#AttachmentLanguageId'); if (lang) { lang.value = op.lang; if (jq) jq(lang).trigger('chosen:updated').trigger('change'); }
  const yt = $q('#YoutubeUrl'); if (!yt) return { ok: false, err: 'noyoutube' };
  set(yt, op.url); try { yt.dispatchEvent(new Event('paste', { bubbles: true })); } catch (e) {}
  const pd = $q('#publish_date'); if (!pd) return { ok: false, err: 'nodate' }; set(pd, op.publish);
  // الدرس في شجرة نور: «الوحدة: الدرس»
  const ls = $q('#lesson_title');
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  let lessonId = '';
  if (ls) {
    const opts = [...ls.options];
    const o = opts.find((x) => clean(x.textContent) === clean(op.match)) || opts.find((x) => clean(x.textContent).endsWith(': ' + clean(op.lesson))) || opts.find((x) => clean(x.textContent) === clean(op.lesson));
    if (o) { o.selected = true; lessonId = o.value; if (jq) jq(ls).trigger('chosen:updated'); }
  }
  // كل شعب المادة (نشر لفصول)
  const secBtn = document.querySelector('#publish_to_sections'); if (secBtn) try { secBtn.click(); } catch (e) {}
  const pv = $q('#publish_to_val'); if (pv) pv.value = '0';
  const boxes = [...f.querySelectorAll('input[type=checkbox][name^="data[Lecture][checkbox]"]')];
  boxes.forEach((cb) => { cb.checked = true; });
  if (!boxes.length) return { ok: false, err: 'nosections' };
  const btn = $q('#submission_button');
  if (btn) btn.removeAttribute('disabled');
  setTimeout(() => { if (btn) btn.click(); else HTMLFormElement.prototype.submit.call(f); }, 80);
  return { ok: true, lessonId, sections: boxes.length };
}
