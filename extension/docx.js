// docx.js — قراءة نص ملف Word (.docx) داخل المتصفح دون مكتبات خارجية.
// ملف docx أرشيف ZIP؛ نقرأ منه word/document.xml ونفك ضغطه بـ DecompressionStream المدمج في كروم،
// ثم نحوّل العناوين إلى «#» والجداول إلى أسطر (خلية العنوان ثم محتواها) ليفهمها محلل التحضير.

import { sectionOf, isStructural, isSessionLine } from './parse.js';

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function unzipText(buf, want) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('الملف ليس بصيغة Word الحديثة (.docx)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const out = {};
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), cmtLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;
    if (!want(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const data = u8.subarray(start, start + csize);
    const raw = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
    if (raw) out[name] = dec.decode(raw);
  }
  return out;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const kids = (el, name) => Array.from(el.childNodes).filter((c) => c.nodeType === 1 && c.localName === name);
const kid = (el, name) => kids(el, name)[0] || null;
const val = (el) => (el ? (el.getAttributeNS(W, 'val') || el.getAttribute('w:val') || '') : '');

export async function docxToText(buf) {
  const files = await unzipText(buf, (n) => n === 'word/document.xml' || n === 'word/styles.xml');
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('لم أجد نص المستند داخل الملف — تأكد أنه ملف Word ‎(.docx)');
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');

  // أنماط العناوين (Heading 1..6 / Title) ← مستوى العنوان
  const headingOf = {};
  if (files['word/styles.xml']) {
    const sd = parse(files['word/styles.xml']);
    for (const st of Array.from(sd.getElementsByTagNameNS(W, 'style'))) {
      const id = st.getAttributeNS(W, 'styleId') || st.getAttribute('w:styleId') || '';
      const name = val(kid(st, 'name'));
      const m = name.match(/heading\s*(\d)/i);
      const pPr = kid(st, 'pPr');
      const ol = pPr && kid(pPr, 'outlineLvl');
      if (m) headingOf[id] = +m[1];
      else if (/^title$/i.test(name)) headingOf[id] = 1;
      else if (ol && /^\d$/.test(val(ol)) && +val(ol) < 6) headingOf[id] = +val(ol) + 1;
    }
  }

  const lines = [];
  function runText(p) {
    let s = '';
    const walk = (n) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 't') s += c.textContent;
        else if (ln === 'tab') s += ' ';
        else if (ln === 'br' || ln === 'cr') s += '\n';
        else if (ln === 'pPr' || ln === 'rPr' || ln === 'instrText' || ln === 'delText' || ln === 'del') continue;
        else walk(c);
      }
    };
    walk(p);
    return s.replace(/ /g, ' ');
  }
  function level(p) {
    const pPr = kid(p, 'pPr');
    if (!pPr) return 0;
    const ps = kid(pPr, 'pStyle');
    if (ps) {
      const id = val(ps);
      if (headingOf[id]) return headingOf[id];
      const m = id.match(/^heading\s*(\d)$/i) || id.match(/^(\d)$/);
      if (m) return +m[1];
    }
    const ol = kid(pPr, 'outlineLvl');
    if (ol && /^\d$/.test(val(ol)) && +val(ol) < 6) return +val(ol) + 1;
    return 0;
  }
  const isList = (p) => { const pPr = kid(p, 'pPr'); return !!(pPr && kid(pPr, 'numPr')); };

  function para(p, into) {
    const t = runText(p);
    if (!t.trim()) { into.push(''); return; }
    const lv = level(p);
    if (lv) into.push('#'.repeat(Math.min(lv, 6)) + ' ' + t.trim().replace(/\n+/g, ' '));
    else if (isList(p)) into.push('- ' + t.trim());
    else t.split('\n').forEach((x) => into.push(x));
  }
  function block(el, into) {
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 'p') para(c, into);
      else if (c.localName === 'tbl') table(c, into);
      else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) block(sc, into); }
    }
  }
  function table(tbl, into) {
    for (const tr of kids(tbl, 'tr')) {
      const cells = kids(tr, 'tc').map((tc) => { const a = []; block(tc, a); return a.map((x) => x.trim()).filter(Boolean); }).filter((c) => c.length);
      if (!cells.length) continue;
      // صف «البند | المحتوى»: خلية العنوان تصبح سطر عنوان، ثم محتوى باقي الخلايا
      // (إن كانت الخلية اسم بند فمحتواها له حتى لو بدأ سطر منه باسم بند آخر: «> »)
      if (cells.length >= 2 && cells[0].join(' ').length <= 45) {
        const head = cells[0].join(' ');
        const own = !!sectionOf(head, true);
        into.push(own ? '### ' + head.replace(/^#+\s*/, '') : head);
        // (سطر «الحصة الأولى: …» داخل الخلية لا يُحمى: قد يكون جزء حصة في التحضير المدمج)
        cells.slice(1).forEach((c) => c.forEach((x) => into.push(own && isStructural(x) && !isSessionLine(x) ? '> ' + x.replace(/^#+\s*/, '') : x)));
      } else cells.forEach((c) => c.forEach((x) => into.push(x)));
      into.push('');
    }
  }

  const doc = parse(xml);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('المستند فارغ');
  block(body, lines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
