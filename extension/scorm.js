// درس تفاعلي (SCORM 1.2) لكل درس في «مكتبة الدروس التفاعلية» بنور (المالك 2026-11-14): خمسة أسئلة من أنشطة الدرس، ثم شهادة
// باسم الطالب (يقرؤه من نور) ومدرسته ومعلمه ونتيجته، مع زر لتحميلها. يُبنى الملف في «حاضر» نفسها من scorm/template.html وخطوطه
// (الملفات نفسها التي يبني منها tools/scorm/build.mjs)، ويُرفع بنموذج نور «رفع درس تفاعلي جديد» (#AttachmentUploadForm، النوع Scorm).
// نور: /teacher/attachments/index/Scorm/cid:…/tid:… ← #uploadAttachmentBtn ← upload/Scorm/cid/tid/tuid

// خمسة أسئلة موزعة على بنك الدرس (مستويات مختلفة)، وإن نقص الاختيار من متعدد تُكمَّل من صح وخطأ
export function pickFive(g) {
  const m = ((g && g.mcq) || []).filter((x) => x && x.q && Array.isArray(x.o) && x.o.length >= 2);
  const out = [];
  if (m.length >= 5) { const step = m.length / 5; for (let k = 0; k < 5; k++) out.push(m[Math.floor(k * step)]); } else out.push(...m);
  for (const t of (g && g.tf) || []) { if (out.length >= 5) break; if (t && t.s) out.push({ q: 'هل العبارة صحيحة؟ ' + t.s, o: t.t ? ['صحيحة', 'خاطئة'] : ['خاطئة', 'صحيحة'], why: t.why || '' }); }
  return out.slice(0, 5).map((x) => ({ q: x.q, o: x.o, why: x.why || '' }));
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function scormManifest(id, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${esc(id)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>${esc(title)}</title>
      <item identifier="item1" identifierref="res1" isvisible="true">
        <title>${esc(title)}</title>
        <adlcp:masteryscore>60</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>
`;
}
// zip بلا ضغط (تخزين) — يكفي لملفين نصيين
const CRC = new Uint32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zipStore(files, now = new Date()) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF, dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const [name, content] of files) {
    const nb = enc.encode(name), db = typeof content === 'string' ? enc.encode(content) : content, c = crc32(db);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, c, true); h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(10, 0, true); e.setUint16(12, dt, true); e.setUint16(14, dd, true);
    e.setUint32(16, c, true); e.setUint32(20, db.length, true); e.setUint32(24, db.length, true); e.setUint16(28, nb.length, true); e.setUint32(42, off, true);
    central.push(new Uint8Array(e.buffer), nb);
    off += 30 + nb.length + db.length;
  }
  const cdLen = central.reduce((a, x) => a + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, x) => a + x.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
export function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

// القالب والخطوط من ملفات «حاضر» نفسها (مرة واحدة لكل فتح)
let assets = null;
async function loadAssets(base) {
  if (assets) return assets;
  const get = async (p) => { const r = await fetch(base + p); if (!r.ok) throw new Error(p); return r; };
  const font = async (f) => toB64(new Uint8Array(await (await get('scorm/fonts/' + f)).arrayBuffer()));
  const [tpl, a1, a2, p1, p2] = await Promise.all([get('scorm/template.html').then((r) => r.text()), font('alexandria-700-ar.woff2'), font('alexandria-700-lat.woff2'), font('plex-500-ar.woff2'), font('plex-500-lat.woff2')]);
  assets = { tpl, a1, a2, p1, p2 };
  return assets;
}
// ملف الدرس: zip فيه imsmanifest.xml وindex.html (يعمل بلا إنترنت). null إن قلّت أسئلة الدرس عن خمسة
export async function buildScorm(game, { id, teacher = '', school = '', base = '' } = {}) {
  const q = pickFive(game);
  if (q.length < 5) return null;
  const A = await loadAssets(base);
  const data = { subject: game.subject || '', grade: game.grade || '', unit: game.unit || '', lesson: game.lesson || '', teacher, school, q };
  const html = A.tpl.replace('__TITLE__', esc(game.lesson || ''))
    .replace('__F_ALEX_AR__', A.a1).replace('__F_ALEX_LAT__', A.a2).replace('__F_PLEX_AR__', A.p1).replace('__F_PLEX_LAT__', A.p2)
    .replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c'));
  return zipStore([['imsmanifest.xml', scormManifest(id || 'afaq-lesson', game.lesson || '')], ['index.html', html]]);
}

// ———— دوال تُنفَّذ في صفحة نور (MAIN world) ————

// «رفع درس تفاعلي جديد»: العنوان واللغة ونوع Scorm والملف وتاريخ النشر والدرس وكل شعب المادة وطلبتها، ثم «رفع»
export function scormFill(op) {
  const f = document.querySelector('#AttachmentUploadForm');
  if (!f) return { ok: false, err: 'noform', url: location.href };
  const $q = (s) => f.querySelector(s) || document.querySelector(s);
  const set = (el, v) => { if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const jq = window.jQuery;
  const t = $q('#attach_title'); if (!t) return { ok: false, err: 'notitle' };
  set(t, op.title);
  set($q('#AttachmentComments'), op.comments || '');
  const lang = $q('#AttachmentLanguageId'); if (lang) { lang.value = op.lang; if (jq) jq(lang).trigger('chosen:updated').trigger('change'); }
  const ty = $q('#AttachmentInteractiveLessonType1'); if (!ty) return { ok: false, err: 'notype' };
  if (!ty.checked) ty.click();
  ty.checked = true;
  const fi = $q('#ScormFiles, input[type=file][name="data[UploadedFile][file][]"]'); if (!fi) return { ok: false, err: 'nofile' };
  const bin = atob(op.b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  try { const dt = new DataTransfer(); dt.items.add(new File([u8], op.fileName, { type: 'application/zip' })); fi.files = dt.files; } catch (e) { return { ok: false, err: 'filedt' }; }
  fi.dispatchEvent(new Event('change', { bubbles: true }));
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
  // كل شعب المادة وطلبتها
  const pv = $q('#publish_to_val'); if (pv) pv.value = '0';
  const secs = [...f.querySelectorAll('input.sections_checkbox, input[type=checkbox][name^="data[Lecture][checkbox]"]')];
  [...f.querySelectorAll('input.stages_checkbox, input.levels_checkbox')].concat(secs).forEach((cb) => { cb.checked = true; });
  let students = 0;
  f.querySelectorAll('input[type=checkbox][name^="data[User][selected_students]"]').forEach((cb) => { cb.checked = true; students++; });
  if (!secs.length) return { ok: false, err: 'nosections' };
  try { if (typeof window.getFormsForSelectedStudents === 'function') window.getFormsForSelectedStudents(); } catch (e) {}
  const btn = $q('#submission_button');
  if (btn) btn.removeAttribute('disabled');
  setTimeout(() => { if (btn) btn.click(); else HTMLFormElement.prototype.submit.call(f); }, 120);
  return { ok: true, lessonId, sections: secs.length, students };
}
