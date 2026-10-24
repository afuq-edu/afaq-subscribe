// كل حقل نصي في كل باقة: كل سطر فقرة مستقلة في المحرر الغني، النص كما هو، وكل رابط قابل للنقر في سطره. تشغيل: node --max-old-space-size=3000 tests/rich-format.mjs
import fs from 'node:fs'; import path from 'node:path';
import { JSDOM } from 'jsdom';
const dom = new JSDOM(''); globalThis.DOMParser = dom.window.DOMParser; globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.chrome = { runtime: { getURL: (x) => x }, storage: { local: { get: async () => ({}), set: async () => {} } } };
const P = await import(new URL('../extension/packages.js', import.meta.url).href);
const src = fs.readFileSync(new URL('../extension/engine.js', import.meta.url), 'utf8');
const a = src.indexOf('  const parseInert'), b = src.indexOf('  function toDateInput');
const H = new Function(src.slice(a, b).replace(/^  const (SUPC|SUBC)[^\n]*\n/gm, '') + '\nreturn {richHtml, safeHtml, stripHtml};')();
const ROOT = process.env.PREPS || '/mnt/project-files/afaq-platform/preps';
let pk = 0, f = 0, bad = [], links = 0, sample;
const seen = new Set();
for (const d of fs.readdirSync(ROOT)) { const dd = path.join(ROOT, d); if (!fs.statSync(dd).isDirectory()) continue;
 for (const fn of fs.readdirSync(dd).filter((x) => x.endsWith('.json'))) {
  let x; try { x = JSON.parse(fs.readFileSync(path.join(dd, fn), 'utf8')); } catch { continue; }
  const pkg = x.package || x; if (!Array.isArray(pkg.lessons) || seen.has(pkg.id)) continue; seen.add(pkg.id); pk++;
  for (const l of pkg.lessons) { const items = P.buildItems(pkg, l);
   for (const it of items) { if (Array.isArray(it.value) || typeof it.value !== 'string' || !it.value.trim()) continue; f++;
    const html = H.safeHtml(H.richHtml(it.value)); const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
    const ps = [...doc.querySelectorAll('p,li,div')].filter((e) => e.textContent.trim());
    const rawLines = String(it.raw).split('\n').filter((s) => s.trim()).length;
    const want = new dom.window.DOMParser().parseFromString('<p>'+String(it.raw).replace(/<\/?(sup|sub|span)\b[^>]*>/g,'').replace(/</g,'&lt;')+'</p>','text/html').body.textContent.replace(/\s+/g,' ').trim(), got = [...doc.body.querySelectorAll('p')].map((p) => p.textContent).join('\n').replace(/\s+/g,' ').trim();
    const urls = (String(it.raw).replace(/"[^"]*"/g,'').match(/https?:\/\/[^\s<>"'«»]+/g) || []);
    const as = [...doc.querySelectorAll('a[href]')]; links += as.length;
    const why = [];
    if (want !== got) { let i=0; while (want[i]===got[i]) i++; why.push('text differs: ' + want.slice(i-20,i+40) + ' | ' + got.slice(i-20,i+40)); }
    if (rawLines > 1 && ps.length < rawLines) why.push(`lines ${rawLines} → blocks ${ps.length}`);
    for (const u of urls) { const t = u.replace(/[.,،؛:)\]]+$/, ''); const an = as.find((e) => e.getAttribute('href') === t); if (!an) why.push('no anchor ' + t); else if (an.parentElement.textContent.trim().replace(/[.,،؛:)\]]+$/,'') !== an.textContent.trim()) why.push('link glued: ' + an.parentElement.textContent.slice(0, 80)); }
    if (why.length) bad.push(`${pkg.id} ${l.title || ''} [${it.key}] ${why.join('; ')}`);
    if (it.key === 'concepts' && pkg.id === 'it-10-2' && /hgroup/.test(it.raw)) sample = html;
 }}}}
console.log({ packages: pk, fields: f, anchors: links, bad: bad.length }); console.log(bad.slice(0, 15).join('\n')); if (bad.length) process.exit(1);
