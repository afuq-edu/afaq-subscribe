// يبني مرفقَي الدرس: صفحة النشاط واللعبة (HTML مستقلة) وملف PDF للملخص والامتحان
// node tools/attach/build.mjs <pkg> <n> <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const [pkg, n, outDir] = process.argv.slice(2);
if (!pkg || !n || !outDir) { console.error('usage: build.mjs <pkg> <n> <outDir>'); process.exit(1); }

const game = JSON.parse(fs.readFileSync(path.join(root, 'site/games', pkg, `${n}.json`), 'utf8'));
const extra = JSON.parse(fs.readFileSync(path.join(here, 'lessons', pkg, `${n}.json`), 'utf8'));
const S = extra.summary;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = `${pkg}-${n}`;
fs.mkdirSync(outDir, { recursive: true });

// ---------- صفحة النشاط واللعبة ----------
const data = {
  pkg, n: +n, subject: 'English', grade: 'Grade 5', unit: game.unit, lesson: game.lesson,
  banner: Object.values(extra.pics || {}).slice(0, 6).join(''),
  pics: extra.pics, picQs: extra.picQs, pairs: S.pairs, tf: game.tf, boxes: game.boxes, hunt: game.hunt, mcq: game.mcq,
};
const tpl = fs.readFileSync(path.join(here, 'activity.tpl.html'), 'utf8');
const html = tpl.replace('__TITLE__', esc(`${game.lesson} – Activity & Game`)).replace('__DATA__', JSON.stringify(data).replace(/</g, '\\u003c'));
const htmlOut = path.join(outDir, `${slug}-activity.html`);
fs.writeFileSync(htmlOut, html);

// ---------- ملف PDF ----------
const pic = (w) => (extra.pics && extra.pics[w]) || '';
const head = (title) => `<header><div class="brand">Afaq ✦</div><div class="meta">Grade 5 · English · ${esc(game.unit)}</div></header>
  <div class="lesson">${esc(game.lesson)}</div><h1>${title}</h1>`;
const summary = `<section class="page">${head('Lesson summary')}
  <div class="goals"><h2>🎯 I can…</h2><ul>${S.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
  <h2>🧑‍🤝‍🧑 Twelve personality adjectives</h2>
  <div class="cards">${S.pairs.flat().map((w) => `<div class="cardw"><div class="em">${pic(w)}</div><b>${esc(w)}</b><span>${esc(S.defs[w] || '')}</span></div>`).join('')}</div>
  <div class="two">
    <div class="box"><h2>↔️ Opposites</h2>${S.pairs.map(([a, b]) => `<div class="pair"><span class="w neg">${pic(a)} ${esc(a)}</span><svg width="70" height="16" viewBox="0 0 70 16"><path d="M8 8H62M8 8l7-6M8 8l7 6M62 8l-7-6M62 8l-7 6" stroke="#6c4cf5" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg><span class="w pos">${pic(b)} ${esc(b)}</span></div>`).join('')}</div>
    <div class="box"><h2>🧱 The prefix un-</h2><p>${esc(S.prefix.note)}</p>
      ${S.prefix.items.map(([a, b]) => `<div class="eq"><span class="blk un">un-</span>+<span class="blk">${esc(a)}</span>=<span class="blk res">${esc(b)}</span></div>`).join('')}
      <p class="small">${esc(S.prefix.other)}</p>
      <h2 style="margin-top:12px">💬 Talk about jobs</h2><div class="rule">${esc(S.structure.rule)}</div>
      ${S.structure.examples.map((e, i) => `<div class="bubble"><span>${i ? '🍽️' : '🩺'}</span>${esc(e)}</div>`).join('')}
    </div>
  </div>
  <div class="tip">💡 <b>Tip:</b> ${esc(S.tip)}</div>
</section>`;

const L = 'abcdefghij';
let qn = 0;
const total = extra.exam.reduce((s, q) => s + q.marks, 0);
const qh = (q) => `<div class="qh"><span class="qn">${++qn}</span><span class="qt">${esc(q.title)}</span><span class="mk">${q.marks} mark${q.marks > 1 ? 's' : ''}</span></div>`;
const exQ = (q, key) => {
  if (q.type === 'pics') return `<div class="q">${qh(q)}<div class="picrow">${q.items.map((it, i) => `<div class="picq"><div class="em big">${it.pic}</div><div class="ch">${it.o.map((o, k) => `<span class="${key && k === it.a ? 'circ' : ''}">${esc(o)}</span>`).join(' / ')}</div></div>`).join('')}</div></div>`;
  if (q.type === 'match') return `<div class="q">${qh(q)}<div class="matchq">${q.left.map((w, i) => `<div class="mrow"><span class="ml">${i + 1}. ${esc(w)}</span><span class="dot">●</span><span class="gap">${key ? `→ ${L[q.key[i]]}` : ''}</span><span class="dot">●</span><span class="mr">${L[i]}. ${esc(q.right[i])}</span></div>`).join('')}</div></div>`;
  if (q.type === 'tf') return `<div class="q">${qh(q)}${q.items.map((it, i) => `<div class="tfrow"><span>${L[i]}. ${esc(it.s)}</span><span class="tbox">${key ? (it.t ? '✓' : '✗') : ''}</span></div>`).join('')}</div>`;
  if (q.type === 'mcq') return `<div class="q">${qh(q)}<div class="mcqg">${q.items.map((it, i) => `<div class="mcq"><div>${L[i]}. ${esc(it.q)}</div><div class="mo">${it.o.map((o, k) => `<span class="${key && k === it.a ? 'circ' : ''}">${'ABC'[k]}) ${esc(o)}</span>`).join('')}</div></div>`).join('')}</div></div>`;
  if (q.type === 'prefix') return `<div class="q">${qh(q)}<div class="picrow">${q.items.map(([a, b]) => `<div class="eq"><span class="blk un">un-</span>+<span class="blk">${esc(a)}</span>=<span class="blk ans">${key ? esc(b) : ''}</span></div>`).join('')}</div></div>`;
  if (q.type === 'write') return `<div class="q">${qh(q)}<div class="write"><span class="em">👩‍🏫</span>${esc(q.s)}</div>${key ? `<div class="small">${esc(q.a)}</div>` : ''}</div>`;
  return '';
};
const exam = (key) => { qn = 0; return `<section class="page">${head(key ? 'Exam – answer key (for the teacher)' : 'Lesson exam')}
  <div class="info"><span>Name: <i></i></span><span>Class: <i class="s"></i></span><span class="tot">Mark: ____ / ${total}</span></div>
  ${extra.exam.map((q) => exQ(q, key)).join('')}
  <div class="good">🌟 Well done! Check your answers before you finish.</div></section>`; };

const css = `@page{size:A4;margin:12mm}
*{box-sizing:border-box}body{margin:0;font-family:Inter,"Liberation Sans",Arial,"Noto Color Emoji",sans-serif;color:#1f1a3d;font-size:12.5px}
.page{page-break-after:always}.page:last-child{page-break-after:auto}
header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #6c4cf5;padding-bottom:6px}
.brand{font-weight:800;color:#6c4cf5;font-size:16px}.meta{color:#6b6590;font-weight:600}
.lesson{color:#6b6590;margin-top:8px;font-weight:600}
h1{font-size:24px;margin:2px 0 10px;color:#3b2a8f}h2{font-size:15px;margin:10px 0 6px;color:#3b2a8f}
.em{font-family:"Noto Color Emoji";}
.goals{background:#f3f0ff;border-radius:12px;padding:6px 14px}.goals ul{margin:4px 0 6px;padding-left:18px}.goals li{margin:3px 0}
.cards{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}
.cardw{border:1.5px solid #e6e1fb;border-radius:12px;padding:7px 5px;text-align:center;background:#fffdf7}
.cardw .em{font-size:30px}.cardw b{display:block;font-size:13px;margin:2px 0}.cardw span{display:block;color:#6b6590;font-size:10px;line-height:1.25}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}
.box{border:1.5px solid #e6e1fb;border-radius:14px;padding:4px 12px 10px}
.pair{display:flex;align-items:center;gap:4px;margin:6px 0}.w{flex:1;padding:5px 8px;border-radius:9px;font-weight:700}.w.neg{background:#ffe4e6}.w.pos{background:#dcfce7;text-align:right}
.eq{display:flex;align-items:center;gap:6px;margin:6px 0;font-weight:800;font-size:14px}
.blk{border:2px solid #6c4cf5;border-radius:8px;padding:4px 9px;min-width:40px;text-align:center}.blk.un{background:#6c4cf5;color:#fff}.blk.res{background:#dcfce7;border-color:#16a34a}.blk.ans{min-width:120px;height:28px;border-style:dashed}
.small{color:#6b6590;font-size:11.5px}.rule{background:#fff7d6;border-left:5px solid #f5b301;padding:6px 10px;border-radius:8px;font-weight:800}
.bubble{display:flex;gap:8px;align-items:center;background:#eef6ff;border-radius:14px;padding:6px 10px;margin:6px 0}.bubble span{font-family:"Noto Color Emoji";font-size:20px}
.tip{margin-top:12px;background:#fff7d6;border-radius:12px;padding:9px 14px;font-size:13.5px}
.info{display:flex;gap:16px;align-items:flex-end;margin-bottom:8px;font-weight:700}.info i{display:inline-block;width:210px;border-bottom:1.5px solid #1f1a3d}.info i.s{width:70px}.tot{margin-left:auto;background:#f3f0ff;padding:6px 12px;border-radius:10px}
.q{border:1.5px solid #e6e1fb;border-radius:14px;padding:8px 12px;margin:8px 0;page-break-inside:avoid}
.qh{display:flex;align-items:center;gap:8px;margin-bottom:6px}.qn{background:#6c4cf5;color:#fff;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:800}.qt{font-weight:800;font-size:13.5px}.mk{margin-left:auto;color:#6c4cf5;font-weight:700;font-size:11.5px;border:1.5px solid #6c4cf5;border-radius:99px;padding:1px 8px}
.picrow{display:flex;gap:10px;justify-content:space-around;flex-wrap:wrap}.picq{text-align:center}.em.big{font-size:44px}.ch{font-weight:700;font-size:13px}
.circ{border:2px solid #e11d48;border-radius:99px;padding:0 5px}
.matchq{display:grid;gap:5px}.mrow{display:grid;grid-template-columns:150px 16px 1fr 16px 160px;align-items:center;font-weight:700}.mrow .dot{color:#6c4cf5}.gap{text-align:center;color:#e11d48}
.tfrow{display:flex;justify-content:space-between;align-items:center;margin:5px 0}.tbox{width:30px;height:24px;border:2px solid #6c4cf5;border-radius:6px;text-align:center;color:#e11d48;font-weight:800}
.mcqg{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}.mo{display:flex;gap:10px;margin-top:3px;font-weight:600;flex-wrap:wrap}
.write{display:flex;gap:8px;align-items:center;font-size:13.5px;font-weight:600}.write .em{font-size:28px}
.good{text-align:center;margin-top:10px;color:#6b6590;font-weight:700}`;
const doc = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const pdfOut = path.join(outDir, `${slug}-summary-exam.pdf`);
const keyOut = path.join(outDir, `${slug}-exam-key.pdf`);
await page.setContent(doc(summary + exam(false)), { waitUntil: 'load' });
await page.pdf({ path: pdfOut, format: 'A4', printBackground: true });
await page.setContent(doc(exam(true)), { waitUntil: 'load' });
await page.pdf({ path: keyOut, format: 'A4', printBackground: true });
await browser.close();
console.log(JSON.stringify({ html: htmlOut, pdf: pdfOut, key: keyOut, total }));
