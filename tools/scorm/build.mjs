#!/usr/bin/env node
// درس تفاعلي (SCORM 1.2) لدرس من دروس الأنشطة: خمسة أسئلة اختيار من متعدد ثم شهادة باسم الطالب ومدرسته ومعلمه.
// الاستعمال: node tools/scorm/build.mjs --pkg ar-4 --n 4 [--teacher «اسم»] [--school «اسم»] [--out مجلد] [--cover]
//   --pkg/--n: ملف الأسئلة site/games/<pkg>/<n>.json (أسئلة mcq: الإجابة الصحيحة أولًا)
//   --cover: يرسم أيضًا صورة غلاف PNG لحقل «اختر صورة الغلاف» في نور
// الخرج: <out>/<pkg>-<n>.zip (imsmanifest.xml + index.html بخطوطه، يعمل بلا إنترنت)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const pkg = arg('pkg'), n = arg('n'), out = path.resolve(arg('out', '.'));
if (!pkg || !n) { console.error('الاستعمال: node tools/scorm/build.mjs --pkg ar-4 --n 4 [--teacher …] [--school …] [--out …] [--cover]'); process.exit(2); }
const G = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/games', pkg, n + '.json'), 'utf8'));

// خمسة أسئلة موزعة على بنك الدرس (مستويات مختلفة)، وإن نقص الاختيار من متعدد تُكمَّل من صح وخطأ
export function pickFive(g) {
  const m = (g.mcq || []).filter((x) => x && x.q && Array.isArray(x.o) && x.o.length >= 2);
  const out = [];
  if (m.length >= 5) { const step = m.length / 5; for (let k = 0; k < 5; k++) out.push(m[Math.floor(k * step)]); }
  else out.push(...m);
  for (const t of g.tf || []) { if (out.length >= 5) break; if (t && t.s) out.push({ q: 'هل العبارة صحيحة؟ ' + t.s, o: t.t ? ['صحيحة', 'خاطئة'] : ['خاطئة', 'صحيحة'], why: t.why || '' }); }
  return out.slice(0, 5).map((x) => ({ q: x.q, o: x.o, why: x.why || '' }));
}
const q = pickFive(G);
if (q.length < 5) { console.error(`${pkg}/${n}: ${q.length} أسئلة فقط`); process.exit(1); }

const font = (f) => fs.readFileSync(path.join(HERE, 'fonts', f)).toString('base64');
const data = { subject: G.subject, grade: G.grade, unit: G.unit || '', lesson: G.lesson, teacher: arg('teacher'), school: arg('school'), q };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8')
  .replace('__TITLE__', esc(G.lesson))
  .replace('__F_ALEX_AR__', font('alexandria-700-ar.woff2')).replace('__F_ALEX_LAT__', font('alexandria-700-lat.woff2'))
  .replace('__F_PLEX_AR__', font('plex-500-ar.woff2')).replace('__F_PLEX_LAT__', font('plex-500-lat.woff2'))
  .replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c'));

const id = `afaq-${pkg}-${n}`;
const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>${esc(G.lesson)}</title>
      <item identifier="item1" identifierref="res1" isvisible="true">
        <title>${esc(G.lesson)}</title>
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

// ---------- zip (تخزين بلا ضغط، يكفي لملف نصي صغير) ----------
const CRC = new Uint32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
export function zipStore(files) {
  const parts = [], central = []; let off = 0;
  const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF, dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const [name, content] of files) {
    const nb = Buffer.from(name, 'utf8'), db = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), c = crc32(db);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(dt, 10); h.writeUInt16LE(dd, 12); h.writeUInt32LE(c, 14); h.writeUInt32LE(db.length, 18); h.writeUInt32LE(db.length, 22); h.writeUInt16LE(nb.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nb, db);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt16LE(0x0800, 8); e.writeUInt16LE(0, 10); e.writeUInt16LE(dt, 12); e.writeUInt16LE(dd, 14); e.writeUInt32LE(c, 16); e.writeUInt32LE(db.length, 20); e.writeUInt32LE(db.length, 24); e.writeUInt16LE(nb.length, 28); e.writeUInt32LE(off, 42);
    central.push(e, nb);
    off += 30 + nb.length + db.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

fs.mkdirSync(out, { recursive: true });
const zipPath = path.join(out, `${pkg}-${n}.zip`);
fs.writeFileSync(zipPath, zipStore([['imsmanifest.xml', manifest], ['index.html', html]]));
fs.writeFileSync(path.join(out, `${pkg}-${n}.html`), html);   // للمعاينة خارج نور
console.log(`${zipPath} (${Math.round(fs.statSync(zipPath).size / 1024)} KB) — ${G.lesson}: ${q.length} أسئلة`);

if (has('cover')) {
  const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    @font-face { font-family: A; font-weight: 700; src: url(data:font/woff2;base64,${font('alexandria-700-ar.woff2')}); }
    @font-face { font-family: P; font-weight: 500; src: url(data:font/woff2;base64,${font('plex-500-ar.woff2')}); }
    body { margin: 0; width: 1200px; height: 675px; background: #13263F; color: #fff; font-family: A, Tahoma; display: flex; flex-direction: column; justify-content: center; padding: 0 90px; box-sizing: border-box; }
    .k { font: 500 34px P, Tahoma; color: #D99A2B; } h1 { font-size: 70px; line-height: 1.3; margin: 18px 0; } .s { font: 500 32px P, Tahoma; color: #C9D3DD; }
    .b { position: absolute; left: 90px; bottom: 70px; display: flex; gap: 14px; } .b i { width: 54px; height: 12px; border-radius: 8px; background: #D99A2B; display: block; }
  </style></head><body><div class="k">خمسة أسئلة وشهادة</div><h1>${esc(G.lesson)}</h1><div class="s">${esc(G.subject)} · ${esc(G.grade)}</div><div class="b"><i></i><i></i><i></i><i></i><i></i></div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const cp = path.join(out, `${pkg}-${n}-غلاف.png`); await p.screenshot({ path: cp }); await b.close();
  console.log(cp);
}
