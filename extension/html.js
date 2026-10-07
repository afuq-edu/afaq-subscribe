// html.js — قراءة التحضير من ملفات HTML:
//  • صفحة عادية أو ملف Word محفوظ «صفحة ويب» (.htm) أو صفحة ويب في ملف واحد (.mht)
//  • ملف تحضير تفاعلي يعرض التحضير بالأزرار (المدمج/المنفصل) والتحضير محفوظ داخل شيفرة الصفحة
// لا يُنفَّذ أي شيء من الملف: الصفحة تُقرأ مستندًا خاملًا (DOMParser)، وبيانات الشيفرة يقرؤها قارئ نصي
// يفهم الكائنات والمصفوفات والنصوص فقط (بلا eval). الناتج نص بصيغة «حاضر» يمر بمحلل التحضير نفسه.
import { parsePlanBest, planScore, isStructural, isSessionLine, sectionOf, RE_UNIT, RE_LESSON, RE_SESSION } from './parse.js';

const ORD_F = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
const deDia = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '');
const normA = (s) => deDia(s).replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
const squash = (s) => String(s || '').replace(/[\s ​-‏‪-‮⁦-⁩﻿]+/g, ' ').trim();
const toArDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
// أزرار وواجهة لا تُعدّ محتوى: «📋 نسخ» · «تم النسخ ✓» · «التالي ←»
const UI_NOISE = /^[\p{Extended_Pictographic}\s✓✔←→⟵⟶«»()]*(نسخ|انسخ|نسخ البند|نسخ الحقل|تم النسخ|انقر للنسخ|اضغط للنسخ|انقر لنسخ|اضغط لنسخ|انقر للنسخ الكامل|copy|copied|التالي|السابق|طباعة|print)[\s\p{Extended_Pictographic}!.✓✔←→⟵⟶«»()]*$/iu;
const isNoise = (t) => t.length <= 60 && UI_NOISE.test(t);

// ===================== ١) فك ترميز الملف =====================
function bytesToLatin1(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return s;
}
const latin1ToBytes = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; };
function decodeAs(u8, cs) {
  try { return new TextDecoder(String(cs || 'utf-8').trim().toLowerCase()).decode(u8); } catch (e) { return null; }
}
function qpDecode(s) {
  const t = s.replace(/=\r?\n/g, '');
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c === 61 && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; } else out.push(c & 0xff);
  }
  return new Uint8Array(out);
}
function b64Bytes(s) {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ''));
  return latin1ToBytes(bin);
}
// ملف «صفحة ويب، ملف واحد» (.mht/.mhtml): نأخذ جزء text/html
function mhtmlToHtml(u8) {
  const raw = bytesToLatin1(u8);
  const bm = raw.match(/boundary\s*=\s*"?([^";\r\n]+)"?/i);
  const parts = bm ? raw.split('--' + bm[1].trim()) : [raw];
  for (const p of parts) {
    const sep = p.search(/\r?\n\r?\n/);
    if (sep < 0) continue;
    const hdr = p.slice(0, sep);
    if (!/content-type:\s*text\/html/i.test(hdr)) continue;
    const body = p.slice(sep).replace(/^\r?\n\r?\n/, '');
    const enc = (hdr.match(/content-transfer-encoding:\s*([\w-]+)/i) || [])[1] || '';
    const cs = (hdr.match(/charset\s*=\s*"?([\w-]+)/i) || [])[1] || 'utf-8';
    const bytes = /quoted-printable/i.test(enc) ? qpDecode(body) : /base64/i.test(enc) ? b64Bytes(body) : latin1ToBytes(body);
    return decodeAs(bytes, cs) || new TextDecoder('utf-8').decode(bytes);
  }
  throw new Error('لم أجد صفحة HTML داخل ملف ‎.mht');
}
// النص من البايتات: علامة BOM، ثم ترميز الصفحة المعلن (ملفات Word العربية غالبًا windows-1256)، ثم UTF-8
export function decodeHtmlBytes(u8, name = '') {
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  // UTF-16 بلا BOM: نصف البايتات أصفار
  const probe = u8.subarray(0, 2000);
  let zEven = 0, zOdd = 0;
  for (let i = 0; i < probe.length; i++) if (!probe[i]) { if (i % 2) zOdd++; else zEven++; }
  if (probe.length > 40 && zOdd > probe.length / 4) return new TextDecoder('utf-16le').decode(u8);
  if (probe.length > 40 && zEven > probe.length / 4) return new TextDecoder('utf-16be').decode(u8);
  const head = bytesToLatin1(u8.subarray(0, 8192));
  if (/\.mht(ml)?$/i.test(name) || /^\s*(MIME-Version:|From:|Subject:|Content-Type:\s*multipart\/related)/im.test(head.slice(0, 1500))) {
    if (/multipart\/related|boundary=/i.test(head)) return mhtmlToHtml(u8);
  }
  const cs = (head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i) || [])[1];
  if (cs && !/^utf-?8$/i.test(cs)) { const t = decodeAs(u8, cs); if (t != null) return t; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('windows-1256').decode(u8); }
}

// ===================== ٢) نص الصفحة الظاهر =====================
const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'math', 'button', 'select', 'option', 'optgroup', 'datalist', 'input', 'textarea',
  'nav', 'iframe', 'frame', 'object', 'embed', 'canvas', 'video', 'audio', 'img', 'picture', 'source', 'head', 'meta', 'link', 'title', 'xml', 'base']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'center', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'header', 'hgroup', 'li', 'main', 'menu', 'ol', 'p', 'pre', 'section', 'summary', 'ul', 'caption',
  'legend', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'output', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table']);
const LABEL_TAGS = new Set(['dt', 'th', 'legend', 'summary', 'caption', 'label']);
const LABEL_CLASS = /(^|[\s_-])(title|label|head|header|heading|name|caption|field-?name|field-?title|key)([\s_-]|$)|عنوان/i;

function textOf(el) {
  let s = '';
  const w = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) s += c.nodeValue;
      else if (c.nodeType === 1 && !SKIP.has(c.localName)) {
        if (BLOCK.has(c.localName) || c.localName === 'br') s += ' ';
        w(c.localName === 'template' && c.content ? c.content : c);
      }
    }
  };
  w(el);
  return squash(s);
}
// عنوان بنية: «# الوحدة…» «## الدرس…/الحصة…» «### اسم البند» — أو null
// heading: عنوان حقيقي (h1–h6). عنوان الحصة خارج العناوين يبقى سطرًا عاديًا (قد يكون جزء حصة داخل بند في التحضير المدمج)
function structLine(t, heading = false) {
  if (!t || t.length > 110) return null;
  if (RE_UNIT.test(t)) return '# ' + t;
  if (RE_LESSON.test(t)) return '## ' + t;
  if (RE_SESSION.test(t)) return heading ? '## ' + t : t;
  if (t.length <= 100 && sectionOf(t, true)) return '### ' + t;
  return null;
}
function isLabelEl(el, t) {
  if (!t || t.length > 110 || !structLine(t)) return false;
  if (LABEL_TAGS.has(el.localName)) return true;
  if (LABEL_CLASS.test((el.getAttribute('class') || '') + ' ' + (el.getAttribute('id') || ''))) return true;
  const bold = Array.from(el.querySelectorAll('b,strong')).map(textOf).join(' ');
  return !!bold && bold.replace(/[\s:：.]/g, '') === t.replace(/[\s:：.]/g, '');
}

// أسطر نصية من شجرة HTML: العناوين «#»، القوائم «- / ١.»، الجداول «البند ثم محتواه» أو «خلية — خلية»
// plain: لمحتوى بند واحد (لا عناوين بنية)
export function domLines(root, plain = false) {
  const out = [];
  let buf = '';
  const flush = () => { const t = squash(buf); buf = ''; if (t && !isNoise(t)) out.push(t); };
  const table = (t) => {
    for (const tr of Array.from(t.rows || [])) {
      const cells = Array.from(tr.cells || []);
      const parts = cells.map((c) => domLines(c, plain)).filter((a) => a.length);
      if (!parts.length) continue;
      const first = parts[0].join(' ');
      const lab = !plain && parts.length >= 2 ? structLine(first.replace(/^#+\s*/, '')) : null;
      if (lab) {
        out.push(lab);
        // صف «البند | محتواه»: المحتوى للبند نفسه حتى لو بدأ سطر منه باسم بند آخر
        const own = lab.startsWith('### ');
        parts.slice(1).forEach((a) => a.forEach((l) => out.push(own && isStructural(l) && !isSessionLine(l) ? '> ' + l.replace(/^#+\s*/, '') : l)));
        continue;
      }
      if (cells.length >= 2 && cells.every((c) => c.localName === 'th')) continue;   // صف عناوين الأعمدة
      if (parts.length >= 2 && parts.every((a) => a.length === 1)) { out.push(parts.map((a) => a[0].replace(/^#+\s*/, '')).join(' — ')); continue; }
      parts.forEach((a) => out.push(...a));
    }
  };
  const walk = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { buf += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.localName;
      if (SKIP.has(tag)) continue;
      if (tag === 'template') { if (c.content) { flush(); walk(c.content); flush(); } continue; }
      if (tag === 'br' || tag === 'hr') { flush(); continue; }
      if (/^h[1-6]$/.test(tag)) {
        flush();
        const t = textOf(c);
        if (t && !isNoise(t)) out.push(plain ? t : (structLine(t, true) || '#'.repeat(+tag[1]) + ' ' + t));
        continue;
      }
      if (tag === 'table') { flush(); table(c); continue; }
      if (tag === 'li') {
        flush();
        const at = out.length;
        walk(c); flush();
        if (out.length > at) {
          const p = c.parentElement;
          let mark = '- ';
          if (p && p.localName === 'ol') {
            const sibs = Array.from(p.children).filter((x) => x.localName === 'li');
            mark = toArDigits((parseInt(p.getAttribute('start'), 10) || 1) + sibs.indexOf(c)) + '. ';
          }
          out[at] = mark + out[at].replace(/^[-•▪◦·]\s*/, '');
        }
        continue;
      }
      if (BLOCK.has(tag) || tag.includes('-')) {
        flush();
        if (!plain && (c.textContent || '').length <= 400) {
          const t = textOf(c);
          if (isLabelEl(c, t)) { out.push(structLine(t)); continue; }
        }
        walk(c); flush();
        continue;
      }
      walk(c);
    }
  };
  walk(root);
  flush();
  return out;
}

// ===================== ٣) بيانات التحضير داخل شيفرة الصفحة =====================
const FAIL = new Error('literal');
const tick = (b, n = 1) => { if ((b.left -= n) < 0) throw FAIL; };

function skipStr(src, i, b) {
  const q = src[i++];
  const n = src.length;
  while (i < n) {
    tick(b);
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) return i + 1;
    if (q === '`' && c === '$' && src[i + 1] === '{') { i = skipTpl(src, i + 2, b); continue; }
    if (q !== '`' && c === '\n') return i;
    i++;
  }
  return n;
}
function skipTpl(src, i, b) {   // بعد «${» حتى «}» المقابلة
  let depth = 1;
  const n = src.length;
  while (i < n) {
    tick(b);
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipStr(src, i, b); continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
    i++;
  }
  return n;
}
function skipRegex(src, i, b) {
  let j = i + 1, cls = false;
  const n = Math.min(src.length, i + 300);   // تعبير نمطي أطول من ذلك ليس تعبيرًا نمطيًا
  if (b) tick(b, Math.min(300, src.length - i));
  while (j < n) {
    const c = src[j];
    if (c === '\n') return i + 1;
    if (c === '\\') { j += 2; continue; }
    if (cls) { if (c === ']') cls = false; } else if (c === '[') cls = true;
    else if (c === '/') { j++; while (j < n && /[a-z]/i.test(src[j])) j++; return j; }
    j++;
  }
  return i + 1;
}
const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^',
  'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'yield', 'await', 'void', 'delete', 'new', 'throw']);
const LIT_PREV = new Set(['=', '(', ',', ':', '[', '?', '|', '&', '>', 'return', 'default', 'yield', 'await']);
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'yield', 'await', 'void', 'delete', 'new', 'throw', 'default']);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// قارئ متسامح لقيمة حرفية في JavaScript (كائن/مصفوفة/نص/رقم) — ما سوى ذلك (دوال، متغيرات) يُتخطّى
function literalAt(src, start, b) {
  let i = start;
  const n = src.length;
  const ws = () => {
    for (;;) {
      tick(b);
      if (i >= n) return;
      const c = src.charCodeAt(i);
      if (c === 32 || (c >= 9 && c <= 13) || c === 0xA0 || c === 0xFEFF || c === 0x2028 || c === 0x2029) { i++; continue; }
      if (c === 47) {
        const d = src.charCodeAt(i + 1);
        if (d === 47) { const e = src.indexOf('\n', i + 2); i = e < 0 ? n : e + 1; continue; }
        if (d === 42) { const e = src.indexOf('*/', i + 2); if (e < 0) throw FAIL; i = e + 2; continue; }
      }
      return;
    }
  };
  const escape = () => {
    const c = src[i + 1];
    i += 2;
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': case 'b': case 'f': case 'v': case '0': return '';
      case 'x': { const h = parseInt(src.substr(i, 2), 16); i += 2; return isNaN(h) ? '' : String.fromCharCode(h); }
      case 'u': {
        if (src[i] === '{') {
          const e = src.indexOf('}', i);
          if (e < 0) throw FAIL;
          const cp = parseInt(src.slice(i + 1, e), 16);
          i = e + 1;
          return cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : '';
        }
        const h = parseInt(src.substr(i, 4), 16); i += 4; return isNaN(h) ? '' : String.fromCharCode(h);
      }
      case '\r': if (src[i] === '\n') i++; return '';
      case '\n': case ' ': case ' ': case undefined: return '';
      default: return c;
    }
  };
  const str = () => {
    const q = src[i++];
    let out = '';
    while (i < n) {
      const c = src[i];
      if (c === q) { i++; return out; }
      if (c === '\\') { out += escape(); tick(b); continue; }
      if (q !== '`' && (c === '\n' || c === '\r')) throw FAIL;
      if (q === '`' && c === '$' && src[i + 1] === '{') { i = skipTpl(src, i + 2, b); continue; }
      let j = i + 1;
      while (j < n) { const d = src[j]; if (d === q || d === '\\' || (q !== '`' && (d === '\n' || d === '\r')) || (q === '`' && d === '$')) break; j++; }
      tick(b, j - i);
      out += src.slice(i, j);
      i = j;
    }
    throw FAIL;
  };
  const skipBalanced = () => {
    let depth = 0;
    while (i < n) {
      tick(b);
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') { i = skipStr(src, i, b); continue; }
      if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if ((c === ')' || c === ']' || c === '}') && --depth === 0) { i++; return; }
      i++;
    }
    throw FAIL;
  };
  // تعبير غير حرفي (دالة، متغير، استدعاء…): يُتخطّى حتى الفاصل التالي في المستوى نفسه
  const skipExpr = () => {
    let depth = 0, prev = '(';
    const from = i;
    while (i < n) {
      tick(b);
      const c = src[i];
      if (c === '"' || c === "'" || c === '`') { i = skipStr(src, i, b); prev = 'a'; continue; }
      if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '/' && REGEX_PREV.has(prev)) { i = skipRegex(src, i, b); prev = 'a'; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
      else if ((c === ',' || c === ';') && depth === 0) break;
      if (c > ' ') prev = /[\w$\u0080-￿]/.test(c) ? 'a' : c;
      i++;
    }
    if (i === from) throw FAIL;
  };
  const NUM = /^[-+]?(?:0[xX][\da-fA-F_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][-+]?\d+)?)/;
  const WORD = /^(?:true|false|null|undefined)(?![\w$])/;
  const tail = (v) => {
    ws();
    const c = src[i];
    if (c === undefined || c === ',' || c === '}' || c === ']' || c === ')' || c === ';') return v;
    if (c === '+' && typeof v === 'string') {
      i++; ws();
      const d = src[i];
      if (d === '"' || d === "'" || d === '`') return tail(v + str());
    }
    skipExpr();   // ‎.join('') / ‎.trim() / ? : …
    return v;
  };
  const value = (depth) => {
    if (depth > 64) throw FAIL;
    ws();
    const c = src[i];
    if (c === undefined) throw FAIL;
    if (c === '{') return tail(obj(depth));
    if (c === '[') return tail(arr(depth));
    if (c === '"' || c === "'" || c === '`') return tail(str());
    const head = src.slice(i, i + 64);
    const m = NUM.exec(head);
    if (m && m[0] !== '+' && m[0] !== '-') { i += m[0].length; return tail(Number(m[0].replace(/_/g, ''))); }
    const w = WORD.exec(head);
    if (w) { i += w[0].length; return tail(w[0] === 'true' ? true : w[0] === 'false' ? false : null); }
    skipExpr();
    return null;
  };
  const KEY = /^[^\s:,(){}\[\]'"`;=]+/;
  const obj = (depth) => {
    i++;
    const o = {};
    for (;;) {
      ws();
      const c = src[i];
      if (c === '}') { i++; return o; }
      if (c === undefined) throw FAIL;
      if (c === ',') { i++; continue; }
      if (src.startsWith('...', i)) {
        i += 3;
        const v = value(depth + 1);
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (!UNSAFE_KEYS.has(k)) o[k] = x;
      } else {
        let key = null;
        if (c === '"' || c === "'" || c === '`') key = str();
        else if (c === '[') skipBalanced();   // مفتاح محسوب
        else { const m = KEY.exec(src.slice(i, i + 256)); if (!m) throw FAIL; key = m[0]; i += key.length; }
        ws();
        const d = src[i];
        if (d === ':') { i++; const v = value(depth + 1); if (key != null && !UNSAFE_KEYS.has(key)) o[key] = v; }
        else if (d === '(') { skipBalanced(); ws(); if (src[i] === '{') skipBalanced(); }   // دالة في الكائن
        else if (d !== ',' && d !== '}') skipExpr();   // get x() {…} وغيرها
      }
      ws();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === '}') { i++; return o; }
      throw FAIL;
    }
  };
  const arr = (depth) => {
    i++;
    const a = [];
    for (;;) {
      ws();
      const c = src[i];
      if (c === ']') { i++; return a; }
      if (c === undefined) throw FAIL;
      if (c === ',') { i++; continue; }
      if (src.startsWith('...', i)) { i += 3; const v = value(depth + 1); if (Array.isArray(v)) a.push(...v); }
      else a.push(value(depth + 1));
      if (a.length > 200000) throw FAIL;
      ws();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') { i++; return a; }
      throw FAIL;
    }
  };
  const c0 = src[start];
  const v = c0 === '{' ? obj(0) : c0 === '[' ? arr(0) : (c0 === '"' || c0 === "'" || c0 === '`') ? str() : null;
  return { value: v, end: i };
}

// نص طويل يحمل JSON: JSON.parse('…') أو atob('…')
function embedded(src, i, b, out) {
  let s;
  try { s = literalAt(src, i, b).value; } catch (e) { return; }
  if (typeof s !== 'string' || s.length < 200) return;
  let t = s.trim();
  if (!/^[[{]/.test(t) && /^[A-Za-z0-9+/=\s]{200,}$/.test(t)) {
    try { t = new TextDecoder('utf-8').decode(b64Bytes(t)).trim(); } catch (e) { return; }
  }
  if (!/^[[{]/.test(t)) return;
  try { out.push(JSON.parse(t)); } catch (e) {}
}

// كل القيم الحرفية الكبيرة في شيفرة: بعد = ( , : [ return …
function literalsIn(src, b, out) {
  const n = src.length;
  let i = 0, prev = ';';
  while (i < n && b.left > 0) {
    b.left--;
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let e;
      try { e = skipStr(src, i, b); } catch (x) { return; }
      if (e - i > 200) embedded(src, i, b, out);
      i = e; prev = 'a';
      continue;
    }
    if (c === '/' && REGEX_PREV.has(prev)) { try { i = skipRegex(src, i, b); } catch (x) { return; } prev = 'a'; continue; }
    if ((c === '{' || c === '[') && LIT_PREV.has(prev)) {
      let r = null;
      try { r = literalAt(src, i, b); } catch (x) { r = null; }
      if (r && r.value && typeof r.value === 'object') { if (r.end - i >= 80) out.push(r.value); i = r.end; prev = 'a'; continue; }
      if (b.left <= 0) return;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const w = src.slice(i, j);
      prev = KEYWORDS.has(w) ? w : 'a';
      i = j;
      continue;
    }
    prev = c > '~' ? 'a' : c;
    i++;
  }
}

// القيم المرشحة في المستند: <script> (JSON أو JavaScript)، ونصوص JSON في عناصر أو سمات
function candidates(doc) {
  const out = [];
  let total = 150e6;   // حد كلي، ولكل <script> حده (شيفرة بطيئة لا تمنع قراءة غيرها)
  for (const s of Array.from(doc.querySelectorAll('script'))) {
    if (s.getAttribute('src')) continue;
    const type = (s.getAttribute('type') || '').toLowerCase().trim();
    const code = s.textContent || '';
    if (!code.trim() || code.length > 40e6) continue;
    if (/json/.test(type)) { try { out.push(JSON.parse(code)); continue; } catch (e) { /* JSON متسامح */ } }
    else if (type && !/javascript|ecmascript|module|babel|jsx|text\/plain/.test(type)) continue;
    const b = { left: Math.min(30e6, total) };
    const start = b.left;
    literalsIn(code, b, out);
    total -= start - Math.max(0, b.left);
    if (total <= 0) break;
  }
  const jsonish = (t) => { const x = String(t || '').trim(); if (x.length < 200 || !/^[[{]/.test(x)) return; try { out.push(JSON.parse(x)); } catch (e) {} };
  doc.querySelectorAll('textarea, pre, code, template').forEach((el) => jsonish(el.localName === 'template' ? (el.content && el.content.textContent) : el.textContent));
  doc.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes || [])) if (a.value.length >= 200) jsonish(a.value); });
  return out;
}

// ===================== ٤) من البيانات إلى دروس وحصص =====================
const normKey = (k) => normA(String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ')).replace(/\s+/g, ' ').trim();
const FIELD_KEYS = [
  ['formative', /formative|تكويني/],
  ['summative', /summative|closure|closing|plenary|wrap ?up|ختامي/],
  ['levels', /^(levels?|cognitive levels?|blooms?|bloom levels?|thinking levels?|المستوي|المستويات|مستوي|مستويات التفكير|المستوي المعرفي)$/],
  ['outcomes', /outcome|objective|^goals?$|^aims?$|مخرجات|اهداف|^هدف|نواتج/],
  ['strategies', /strateg|teaching methods?|^methods?$|استراتيج|طرائق|طرق التدريس/],
  ['resources', /resource|material|teaching aids|^aids$|^tools$|^sources$|مصادر|وسائل|^الادوات$|^ادوات$/],
  ['concepts', /concept|vocab|key ?words?|key terms|^terms$|مفاهيم|مصطلحات|مفردات/],
  ['intro', /intro|warm ?up|starter|hook|prior|lead ?in|تهيئه|تمهيد|قبلي/],
  ['procedures', /procedur|activit|^steps$|lesson (flow|steps)|teaching steps|سير|اجراءات|انشطه/],
  ['homework', /homework|assignment|واجب/],
  ['notes', /^notes?$|remarks|guidance|study plan|weekly plan|parents? notes|ملاحظات|ارشادات|توجيهات/],
  ['formative', /^(assessment|evaluation|التقويم|تقويم)$/],
];
const fieldCache = new Map();
function fieldKind(k) {
  const key = String(k);
  if (fieldCache.has(key)) return fieldCache.get(key);
  const nk = normKey(key);
  let r = null;
  if (nk && nk.length <= 80) for (const [kind, re] of FIELD_KEYS) if (re.test(nk)) { r = kind; break; }
  if (!r && nk.length <= 80) r = sectionOf(key);   // تسميات عربية كاملة مثل «ملاحظات ضمن خطة الدراسة…»
  if (r === 'support') r = 'procedures';
  if (fieldCache.size < 5000) fieldCache.set(key, r);
  return r;
}
const T_SESSION = /^(session|session title|session name|period|class title|الحصه|حصه|عنوان الحصه)$/;
const T_LESSON = /^(lesson|lesson title|lesson name|topic|الدرس|درس|عنوان الدرس|الموضوع)$/;
const T_UNIT = /^(unit|unit title|unit name|chapter|module|theme|domain|الوحده|وحده|عنوان الوحده|المجال)$/;
const T_GENERIC = /^(title|name|label|heading|caption|header|عنوان|العنوان|الاسم)$/;
const META_KEY = /^(id|uid|key|color|colour|icon|emoji|type|kind|class|cls|order|index|idx|slug|bg|style|image|img|src|url|href|link|lang|dir|ref|code|tag|tags|created|updated|num|no|number)$/;
const isTitleKey = (k) => { const nk = normKey(k); return T_SESSION.test(nk) || T_LESSON.test(nk) || T_UNIT.test(nk) || T_GENERIC.test(nk); };

function titlesOf(node) {
  const t = { session: null, lesson: null, unit: null, generic: null };
  const nums = {};
  for (const [k, v] of Object.entries(node)) {
    const nk = normKey(k);
    const s = typeof v === 'string' ? squash(v.replace(/<[^<>]*>/g, ' ')) : typeof v === 'number' && isFinite(v) ? v : null;
    if (s == null || s === '' || (typeof s === 'string' && s.length > 200)) continue;
    const lv = T_SESSION.test(nk) ? 'session' : T_LESSON.test(nk) ? 'lesson' : T_UNIT.test(nk) ? 'unit' : T_GENERIC.test(nk) ? 'generic' : null;
    if (!lv) continue;
    if (typeof s === 'number') { if (lv !== 'generic') nums[lv] ??= s; continue; }
    t[lv] ??= s;
  }
  // رقم من البيانات نفسها (lesson: 7) مع عنوانها: «الدرس 7: …»
  const word = { session: (n) => 'الحصة ' + (ORD_F[n - 1] || n), lesson: (n) => 'الدرس ' + n, unit: (n) => 'الوحدة ' + n };
  for (const lv of ['session', 'lesson', 'unit']) {
    if (nums[lv] == null || t[lv] != null) continue;
    if (t.generic != null) { t[lv] = word[lv](nums[lv]) + ': ' + t.generic; t.generic = null; }
    else t[lv] = word[lv](nums[lv]);
  }
  return t;
}
// مفتاح يصلح عنوانًا: «الدرس الأول: …» «الحصة الثانية» «الوحدة الأولى» فقط
// (مفاتيح مثل «المدمج» و«المنفصل» أو lesson1 ليست عناوين، ولا نخترع رقم درس من اسم مفتاح)
function keyTitle(k) {
  const s = squash(k);
  if (!s || s.length > 150 || !/\s/.test(s)) return null;   // «lesson1» معرّف لا عنوان
  return RE_UNIT.test(s) || RE_LESSON.test(s) || RE_SESSION.test(s) ? s : null;
}

// رقم الحصة من تسميتها: «الحصة الثانية» «session 2» «s2» «2»
const ORD_NUM = [['الاولي', 1], ['الاول', 1], ['الثانيه', 2], ['الثاني', 2], ['الثالثه', 3], ['الثالث', 3], ['الرابعه', 4], ['الرابع', 4], ['الخامسه', 5], ['الخامس', 5],
  ['السادسه', 6], ['السادس', 6], ['السابعه', 7], ['السابع', 7], ['الثامنه', 8], ['الثامن', 8], ['التاسعه', 9], ['التاسع', 9], ['العاشره', 10], ['العاشر', 10]];
function sessionNum(label) {
  const s = normA(String(label)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  let m = s.match(/^(?:الحصه|حصه|session|period|class|s|p)[\s_-]*(\d{1,2})\b/);
  if (m) return +m[1];
  m = s.match(/^(?:الحصه|حصه)\s+(\S+)/);
  if (m) { const o = ORD_NUM.find(([w]) => m[1] === w); if (o) return o[1]; }
  if (/^\d{1,2}$/.test(s)) return +s;
  return null;
}
const sessionLabel = (k) => (/^(الحصة|الحصه)/.test(normA(k)) ? squash(k) : 'الحصة ' + (ORD_F[(sessionNum(k) || 1) - 1] || sessionNum(k)));

function fieldMap(node) {
  const best = {};
  for (const [k, v] of Object.entries(node)) {
    if (v == null || v === '' || isTitleKey(k)) continue;
    const kind = fieldKind(k);
    if (!kind) continue;
    const len = flat(v).length;
    if (!best[kind] || len > best[kind].len) best[kind] = { v, len };
  }
  return Object.fromEntries(Object.entries(best).map(([k, x]) => [k, x.v]));
}
// نص مسطّح (للقياس فقط)
function flat(v, d = 0) {
  if (v == null || d > 6) return '';
  if (typeof v === 'string') return v.replace(/<[^<>]*>/g, ' ').trim();
  if (typeof v !== 'object') return String(v);
  const parts = [];
  let total = 0;
  for (const x of Array.isArray(v) ? v : Object.values(v)) {
    const t = flat(x, d + 1);
    if (t) { parts.push(t); total += t.length; if (total > 4000) break; }
  }
  return parts.join(' ');
}
const CORE = ['outcomes', 'procedures', 'formative', 'summative', 'concepts', 'intro', 'strategies'];
function sessionLike(fm) {
  const kinds = Object.keys(fm);
  const core = kinds.filter((k) => CORE.includes(k)).length;
  if (!((kinds.length >= 4 && core >= 2) || (kinds.length >= 3 && kinds.includes('outcomes') && core >= 2))) return false;
  let labels = 0, filled = 0, total = 0;
  for (const [kind, v] of Object.entries(fm)) {
    const t = flat(v);
    if (typeof v === 'string' && v.length < 70 && fieldKind(v) === kind) labels++;   // خريطة أسماء البنود لا محتوى
    if (t.trim()) filled++;
    total += t.length;
  }
  if (labels >= Math.max(2, kinds.length / 2)) return false;
  return filled >= 2 && total >= 30;
}
// [{label:'المخرجات', content:…}, …] ← {outcomes: …}
function pairsToFields(arr) {
  if (arr.length < 3 || arr.length > 40 || !arr.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return null;
  const out = {};
  for (const it of arr) {
    let kind = null, labelKey = null;
    for (const [k, v] of Object.entries(it)) {
      if (typeof v !== 'string' || v.length > 150) continue;
      if (!/^(label|name|title|key|field|id|type|heading|caption|البند|العنوان|الاسم)$/.test(normKey(k))) continue;
      const fk = fieldKind(v);
      if (fk) { kind = fk; labelKey = k; break; }
    }
    if (!kind || kind in out) continue;
    const rest = Object.entries(it).filter(([k]) => k !== labelKey && !META_KEY.test(normKey(k)) && !/^(label|name|title|heading|caption|icon|emoji|color)$/.test(normKey(k)));
    const vals = rest.map(([, v]) => v).filter((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
    if (vals.length) out[kind] = vals.length === 1 ? vals[0] : vals;
  }
  return Object.keys(out).length >= 3 ? out : null;
}
// بنود الدرس مقسّمة على الحصص (التحضير المدمج): {"الحصة الأولى": …} أو [{session:"الحصة الأولى", …}]
function perSession(v) {
  const m = new Map();
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const ents = Object.entries(v);
    if (ents.length < 2 || !ents.every(([k]) => sessionNum(k) != null)) return null;
    ents.forEach(([k, x]) => m.set(sessionNum(k), { label: sessionLabel(k), value: x }));
  } else if (Array.isArray(v) && v.length >= 2 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
    for (const x of v) {
      const t = titlesOf(x);
      const lab = t.session || (t.generic && sessionNum(t.generic) != null ? t.generic : null);
      const num = lab == null ? null : typeof lab === 'number' ? lab : sessionNum(lab);
      if (num == null) return null;
      const rest = Object.fromEntries(Object.entries(x).filter(([k]) => !isTitleKey(k) && !META_KEY.test(normKey(k))));
      const vals = Object.values(rest);
      m.set(num, { label: typeof lab === 'string' && /^(الحصة|الحصه)/.test(normA(lab)) ? lab : 'الحصة ' + (ORD_F[num - 1] || num), value: vals.length === 1 ? vals[0] : rest });
    }
  } else return null;
  return m.size >= 2 ? m : null;
}
function splitMerged(fm) {
  const per = {};
  for (const [kind, v] of Object.entries(fm)) { const m = perSession(v); if (m) per[kind] = m; }
  if (Object.keys(per).length < 2) return null;
  const nums = [...new Set(Object.values(per).flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  return nums.map((num) => {
    const fields = {};
    let label = null;
    for (const [kind, v] of Object.entries(fm)) {
      if (per[kind]) { const x = per[kind].get(num); if (x) { fields[kind] = x.value; label = label || x.label; } }
      else fields[kind] = v;   // بند غير مقسّم: لكل الحصص
    }
    return { title: label || 'الحصة ' + (ORD_F[num - 1] || num), fields };
  });
}

const rec = (fields, extra) => Object.assign({ fields, title: null, lesson: null, unit: null, up: 0, inArray: false }, extra || {});
function assign(x, s, atSession) {
  if (s == null || s === '') return;
  s = String(s);
  if (RE_UNIT.test(s)) { x.unit ??= s; return; }
  if (RE_LESSON.test(s)) { x.lesson ??= s; return; }
  if (RE_SESSION.test(s)) { if (x.title == null && x.up <= 1) x.title = s; return; }
  if (atSession && x.title == null) { x.title = s; return; }
  if (x.lesson == null) x.lesson = s;
  else if (x.unit == null) x.unit = s;
}
function applyTitles(recs, t) {
  for (const x of recs) {
    if (t.session != null && x.up <= 1 && x.title == null) x.title = String(t.session);
    if (t.lesson != null) x.lesson ??= String(t.lesson);
    if (t.unit != null) x.unit ??= String(t.unit);
    if (t.generic != null) assign(x, t.generic, x.up === 0);
  }
}
function walk(node, depth, st) {
  if (!node || typeof node !== 'object' || depth > 40 || ++st.nodes > 400000) return [];
  if (Array.isArray(node)) {
    const pf = pairsToFields(node);
    if (pf && sessionLike(pf)) return [rec(pf, { inArray: true })];
    const out = [];
    for (const x of node) {
      if (!x || typeof x !== 'object') continue;
      const r = walk(x, depth + 1, st);
      r.forEach((y) => { if (y.up === 0) y.inArray = true; });
      out.push(...r);
    }
    return out;
  }
  const pos = positionalFields(node, st);
  const fm = pos ? pos.fm : fieldMap(node);
  const t = titlesOf(node);
  if (pos && sessionLike(fm)) {   // حصة بنودها قائمة نصوص بترتيب نور (مثل f:[…])
    const r = rec(fm, { topic: pos.topic });
    applyTitles([r], t);
    if (r.title == null && pos.topic) r.title = pos.topic;
    return [r];
  }
  const groups = [];
  for (const [k, v] of Object.entries(node)) {
    if (!v || typeof v !== 'object' || fieldKind(k)) continue;
    const r = walk(v, depth + 1, st);
    if (r.length) groups.push({ k, r });
  }
  if (groups.length) {
    const wrapper = groups.length === 1 && groups[0].r.length === 1 && groups[0].r[0].up === 0 && !groups[0].r[0].inArray;
    for (const g of groups) {
      const kt = keyTitle(g.k);
      for (const x of g.r) {
        if (kt) assign(x, kt, x.up === 0);
        if (!wrapper) x.up++;
        x.inArray = false;
      }
    }
    const kids = groups.flatMap((g) => g.r);
    // بنود على مستوى الدرس (مثل المصادر) تُكمل ما ينقص حصصه
    if (Object.keys(fm).length) kids.forEach((x) => { if (x.up <= 1) for (const [kind, v] of Object.entries(fm)) if (!(kind in x.fields)) x.fields[kind] = v; });
    applyTitles(kids, t);
    return kids;
  }
  if (!sessionLike(fm)) return [];
  const parts = splitMerged(fm);
  if (parts) {
    const recs = parts.map((p) => rec(p.fields, { title: p.title, up: 1 }));
    applyTitles(recs, t);
    return recs;
  }
  const r = rec(fm);
  applyTitles([r], t);
  return [r];
}


// بنود نور العشرة بترتيبها (حين تُحفظ قائمةً بلا أسماء)
const NOOR_ORDER = ['outcomes', 'levels', 'strategies', 'resources', 'concepts', 'intro', 'procedures', 'formative', 'summative', 'notes'];
// قائمة أسماء بنود في الشيفرة (مثل F=["المخرجات التعليمية", …]) ← أنواعها بالترتيب
function labelKinds(v) {
  if (!Array.isArray(v) || v.length < 6 || v.length > 14 || !v.every((x) => typeof x === 'string' && x.length < 90)) return null;
  const kinds = v.map((x) => fieldKind(x));
  return kinds.filter(Boolean).length >= 6 ? kinds : null;
}
// كائن فيه قائمة نصوص هي بنود الحصة بالترتيب، ونص قصير هو محور الحصة
function positionalFields(node, st) {
  for (const [k, v] of Object.entries(node)) {
    if (!Array.isArray(v) || v.length < 8 || v.length > 14 || !v.every((x) => typeof x === 'string')) continue;
    const kinds = (st.labels || []).find((x) => x.length === v.length) || (v.length === 10 ? NOOR_ORDER : null);
    if (!kinds) continue;
    if (v.filter((x) => x.trim()).length < 4 || v.join('').length < 60) continue;
    const fm = {};
    v.forEach((x, i) => { const kind = kinds[i]; if (kind && x.trim() && !(kind in fm)) fm[kind] = x; });
    let topic = null;
    for (const [k2, v2] of Object.entries(node)) {
      if (k2 === k || typeof v2 !== 'string' || !v2.trim() || v2.length > 150 || META_KEY.test(normKey(k2))) continue;
      if (/^(الاسبوع|اسبوع|week)/.test(normA(v2.trim()))) continue;   // الأسبوع ليس محور الحصة
      topic = squash(v2); break;
    }
    return { fm, topic };
  }
  return null;
}

// «التحضير المدمج»: نموذج واحد لكل درس — كل بند يجمع الحصص تحت «الحصة 1: محورها»، والقوائم (المستوى، الاستراتيجيات، المصادر) تُجمع بلا تكرار
const LIST_KINDS = ['levels', 'strategies', 'resources'];
export function mergeRecords(recs) {
  const out = [], groups = new Map();
  for (const r of recs) {
    if (r.lesson == null) { out.push(r); continue; }
    const key = (r.unit || '') + '|' + r.lesson;
    let g = groups.get(key);
    if (!g) { g = { unit: r.unit, lesson: r.lesson, list: [] }; groups.set(key, g); out.push(g); }
    g.list.push(r);
  }
  return out.map((g) => {
    if (!g.list) return g;
    const fields = {};
    for (const kind of ORDER) {
      if (LIST_KINDS.includes(kind)) {
        const seen = [];
        g.list.forEach((r) => { if (kind in r.fields) linesOf(kind, r.fields[kind]).map(squash).forEach((l) => { if (l && !seen.includes(l)) seen.push(l); }); });
        if (seen.length) fields[kind] = seen.join('\n');
        continue;
      }
      const parts = [];
      g.list.forEach((r, k) => {
        if (!(kind in r.fields)) return;
        const ls = linesOf(kind, r.fields[kind]).map(squash).filter(Boolean);
        if (!ls.length) return;
        const topic = r.topic || (r.title ? squash(String(r.title).replace(/^(الحصة|الحصه)\s+\S+\s*[:：\-–—]?\s*/, '')) : '');
        parts.push('**الحصة ' + (k + 1) + (topic ? ': ' + topic : '') + '**', ...ls);
      });
      if (parts.length) fields[kind] = parts.join('\n');
    }
    return rec(fields, { unit: g.unit, lesson: g.lesson, merged: g.list.length });
  });
}

// ===================== ٥) من الحصص إلى نص «حاضر» =====================
const ORDER = ['outcomes', 'levels', 'strategies', 'resources', 'concepts', 'intro', 'procedures', 'formative', 'summative', 'homework', 'notes'];
const LABELS = {
  outcomes: 'المخرجات التعليمية', levels: 'المستوى', strategies: 'الاستراتيجيات', resources: 'المصادر التعليمية', concepts: 'المفاهيم',
  intro: 'التهيئة', procedures: 'إجراءات سير الدرس', formative: 'التقويم التكويني', summative: 'التقويم الختامي', homework: 'الواجب', notes: 'ملاحظات',
};
const K_BODY = /^(text|content|value|body|html|desc|description|details|activity|step|action|task|statement|question|q|prompt|item|outcome|objective|goal|concept|term|word|نص|النص|المحتوي|السؤال|النشاط|الوصف|المفهوم|المخرج|الهدف|الاجراء)$/;
const K_LABEL = /^(title|name|label|heading|عنوان|العنوان|الاسم)$/;
const K_TIME = /^(time|duration|minutes?|mins?|الزمن|المده|الوقت|دقائق)$/;
const K_LEVEL = /^(level|bloom|cognitive|cognitive level|thinking level|المستوي|مستوي|المستوي المعرفي|مستوي التفكير)$/;
const K_DEF = /^(def|definition|meaning|explanation|التعريف|المعني|الشرح)$/;
const K_ANSWER = /^(answer|answers|ans|correct|correct answer|solution|model answer|الاجابه|الحل|الاجابه النموذجيه)$/;
const K_OPTIONS = /^(options|choices|alternatives|البدائل|الخيارات)$/;

function textLines(s) {
  const t = String(s ?? '');
  if (/<[a-z][^<>]*>/i.test(t)) return domLines(new DOMParser().parseFromString('<body>' + t, 'text/html').body, true);
  return t.split(/\r?\n/).map(squash).filter(Boolean);
}
function itemLines(kind, x, depth) {
  if (x == null || depth > 8) return [];
  if (typeof x !== 'object') return textLines(String(x));
  if (Array.isArray(x)) return linesOf(kind, x, depth);
  const ents = Object.entries(x).filter(([k]) => !META_KEY.test(normKey(k)));
  const get = (re) => { const e = ents.find(([k, v]) => re.test(normKey(k)) && v != null && v !== '' && typeof v !== 'object'); return e ? squash(String(e[1])) : ''; };
  const label = get(K_LABEL), body = get(K_BODY), time = get(K_TIME), level = get(K_LEVEL), def = get(K_DEF);
  let line = label && body ? `${label}: ${body}` : (body || label);
  if (def) line = line ? `${line}: ${def}` : def;
  if (!line) {
    line = ents.filter(([k, v]) => typeof v === 'string' && v.trim() && ![K_TIME, K_LEVEL, K_ANSWER, K_OPTIONS, K_DEF].some((re) => re.test(normKey(k))))
      .map(([, v]) => squash(v)).join(' — ');
  }
  const opts = ents.find(([k, v]) => K_OPTIONS.test(normKey(k)) && Array.isArray(v));
  if (opts) line += (line ? ' — ' : '') + opts[1].map((o) => (o && typeof o === 'object' ? flat(o) : String(o ?? ''))).filter(Boolean).join(' / ');
  if (time) line = `(${/^\d+$/.test(time) ? toArDigits(time) + ' د' : time}) ${line}`;
  if (level) line += kind === 'outcomes' ? ` — المستوى: ${level}` : ` (${level})`;
  const out = line ? textLines(line) : [];
  for (const [k, v] of ents) {
    const nk = normKey(k);
    if (v && typeof v === 'object' && !K_OPTIONS.test(nk) && !K_ANSWER.test(nk)) out.push(...linesOf(kind, v, depth + 1).map((l) => '- ' + l.replace(/^[-•]\s*/, '')));
  }
  return out;
}
function linesOf(kind, v, depth = 0) {
  if (v == null || depth > 8) return [];
  if (typeof v === 'string') return textLines(v);
  if (typeof v !== 'object') return [String(v)];
  if (!Array.isArray(v)) return itemLines(kind, v, depth + 1);
  const out = [];
  const numbered = kind === 'outcomes' || kind === 'formative' || kind === 'summative';
  let n = 0;
  for (const x of v) {
    const ls = itemLines(kind, x, depth + 1);
    if (!ls.length) continue;
    n++;
    const first = ls[0].replace(/^\s*([-•▪◦·]|\d+[.)-]|[٠-٩]+[.)-])\s*/, '');
    out.push(numbered ? toArDigits(n) + '. ' + first : kind === 'concepts' ? '- ' + first : ls[0]);
    out.push(...ls.slice(1));
  }
  return out;
}
const RE_ORD_ONLY = /^(الأول[ىى]?|الاول[ىى]?|الثاني[ةه]?|الثالث[ةه]?|الرابع[ةه]?|الخامس[ةه]?|السادس[ةه]?|السابع[ةه]?|الثامن[ةه]?|التاسع[ةه]?|العاشر[ةه]?|\d+|[٠-٩]+)$/;
function sessionHeading(title, pos) {
  const ord = 'الحصة ' + (ORD_F[pos] || toArDigits(pos + 1));
  const t = squash(title);
  if (!t) return ord;
  if (RE_SESSION.test(t)) return t;
  if (RE_ORD_ONLY.test(t)) return 'الحصة ' + t;
  return ord + ': ' + t;
}
export function recordsToText(recs) {
  const lines = [];
  let pu = null, pl = null;
  const pos = new Map();
  for (const r of recs) {
    const unit = squash(r.unit), lesson = squash(r.lesson);
    if (unit && unit !== pu) { lines.push('# ' + (RE_UNIT.test(unit) ? unit : 'الوحدة: ' + unit)); pu = unit; pl = null; }
    if (lesson !== pl) { lines.push('## ' + (lesson ? (RE_LESSON.test(lesson) ? lesson : 'الدرس: ' + lesson) : 'الدرس: الدرس')); pl = lesson; }
    const key = unit + '|' + lesson;
    const p = pos.get(key) || 0;
    pos.set(key, p + 1);
    lines.push('## ' + (r.merged ? 'الحصة: تحضير مدمج — ' + (r.merged === 1 ? 'حصة واحدة' : r.merged === 2 ? 'حصتان' : toArDigits(r.merged) + (r.merged <= 10 ? ' حصص' : ' حصة')) : sessionHeading(r.title, p)));
    for (const kind of ORDER) {
      if (!(kind in r.fields)) continue;
      const ls = linesOf(kind, r.fields[kind]).map(squash).filter((l) => l && !isNoise(l));
      if (!ls.length) continue;
      lines.push('### ' + LABELS[kind]);
      ls.forEach((l) => lines.push(isStructural(l) ? '> ' + l : l));
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function dataRecords(doc) {
  const roots = candidates(doc);
  const st = { nodes: 0, labels: roots.map(labelKinds).filter(Boolean) };
  const out = [];
  const seen = new Set();
  const at = new Map();
  for (const root of roots) {
    for (const r of walk(root, 0, st)) {
      // خطة لكل درس بلا حصص: عنوانها عنوان الدرس لا الحصة
      if (r.lesson == null && r.title != null && !RE_SESSION.test(r.title) && !RE_ORD_ONLY.test(squash(r.title))) { r.lesson = r.title; r.title = null; }
      const sig = [r.unit, r.lesson, r.title, flat(r.fields).slice(0, 400)].join('|');
      if (seen.has(sig)) continue;
      seen.add(sig);
      // الحصة نفسها بصيغتين في البيانات (مثل المدمج والمنفصل): تبقى الأوفى
      if (r.lesson != null && r.title != null) {
        const key = [r.unit, r.lesson, r.title].join('|');
        const i = at.get(key);
        if (i != null) { if (Object.keys(r.fields).length > Object.keys(out[i].fields).length) out[i] = r; continue; }
        at.set(key, out.length);
      }
      out.push(r);
      if (out.length >= 3000) return out;
    }
  }
  return out;
}

// ===================== ٦) الواجهة =====================
// المادة والصف من عنوان الصفحة أو اسم الملف (اقتراح فقط)
const SUBJECTS = [
  [/هذا وطني/, 'هذا وطني'], [/الهويه والمواطنه/, 'الهوية والمواطنة'], [/المهارات الحياتيه/, 'المهارات الحياتية'], [/فيزياء|physics/i, 'الفيزياء'],
  [/كيمياء|chemistry/i, 'الكيمياء'], [/احياء|biology/i, 'الأحياء'], [/تقنيه المعلومات|\bict\b/i, 'تقنية المعلومات'],
  [/دراسات اجتماعيه|الدراسات الاجتماعيه|الاجتماعيات/, 'الدراسات الاجتماعية'], [/الرياضيات المتقدمه/, 'الرياضيات المتقدمة'], [/الرياضيات الاساسيه/, 'الرياضيات الأساسية'], [/رياضيات|\bmaths?\b/i, 'الرياضيات'],
  [/لغتي|اللغه العربيه|لغه عربيه/, 'اللغة العربية'], [/انجليزي|انجليزيه|english/i, 'اللغة الإنجليزية'],
  [/التربيه الاسلاميه|تربيه اسلاميه|ديني/, 'التربية الإسلامية'], [/العلوم|علوم|science/i, 'العلوم'],
];
const GRADE_WORDS = [['الحادي عشر', 11], ['الثاني عشر', 12], ['الاول', 1], ['الثاني', 2], ['الثالث', 3], ['الرابع', 4], ['الخامس', 5], ['السادس', 6], ['السابع', 7], ['الثامن', 8], ['التاسع', 9], ['العاشر', 10]];
export function guessMeta(doc, name = '') {
  const h1 = doc && doc.querySelector('h1');
  const src = normA([doc && doc.title, h1 && textOf(h1), String(name).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')].filter(Boolean).join(' | '))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const sub = SUBJECTS.find(([re]) => re.test(src));
  let grade = null;
  const m = src.match(/الصف\s*(الحادي عشر|الثاني عشر|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|\d{1,2})/) || src.match(/grade\s*(\d{1,2})/i);
  if (m) { const w = GRADE_WORDS.find(([x]) => x === m[1]); grade = w ? w[1] : +m[1]; }
  return { subject: sub ? sub[1] : '', gradeNum: grade >= 1 && grade <= 12 ? grade : null };
}

// قراءة نص HTML: نص الصفحة الظاهر، وبيانات التحضير داخل شيفرتها — ويُختار الأوفر
// opts.merged: تحضير مدمج (نموذج واحد لكل درس) بدل نموذج لكل حصة
export function planFromHtml(html, name = '', opts = {}) {
  if (html.length > 80e6) throw new Error('الملف كبير جدًا');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageText = domLines(doc.body || doc.documentElement).join('\n');
  let recs = dataRecords(doc);
  const per = new Map();
  recs.forEach((r) => { if (r.lesson != null) { const k = (r.unit || '') + '|' + r.lesson; per.set(k, (per.get(k) || 0) + 1); } });
  const canMerge = [...per.values()].some((n) => n > 1);
  if (opts && opts.merged && canMerge) recs = mergeRecords(recs);
  const dataText = recs.length ? recordsToText(recs) : '';
  const a = pageText ? parsePlanBest(pageText) : [];
  const b = dataText ? parsePlanBest(dataText) : [];
  const useData = b.length > 0 && planScore(b) >= planScore(a);
  return { text: useData ? dataText : pageText, sessions: useData ? b : a, source: useData ? 'data' : 'page', meta: guessMeta(doc, name), canMerge: useData && canMerge };
}
export async function readHtmlText(file) {
  if (file.size > 80e6) throw new Error('الملف كبير جدًا (أكثر من ٨٠ ميجابايت)');
  return decodeHtmlBytes(new Uint8Array(await file.arrayBuffer()), file.name || '');
}
export async function readHtmlPlan(file, opts) {
  return planFromHtml(await readHtmlText(file), file.name || '', opts);
}
export const isHtmlFile = (f) => /\.(html?|xhtml|mht|mhtml)$/i.test(f.name || '') || /html|mhtml|message\/rfc822/i.test(f.type || '');
