// matrix.mjs — MATRIX mode of the mock-Noor harness: every prep package × { full term, pick } × rotated faults.
//
//   node tests/noor-mock/matrix.mjs [--sample N] [--only id,id|substring] [--jobs N] [--flows term,pick] [--faults a,b] [--fault x] [--seed S] [--merge [--resume]]
//
// For each package file in $PREPS (default /mnt/project-files/afaq-platform/preps, *.json one level deep; non-package files skipped):
//   - a mock Noor tree from the package's own unit/lesson names (most exactly the same, leading «1-1» numbers stripped like Noor,
//     2 lessons renamed slightly, «(n)» suffixes and names repeated across units kept as in the file, a decoy term 2),
//     three course cards (own + same subject in another grade + another subject in the same grade);
//   - flow «term»: «تحضير الفصل كاملًا» then a reload + second run that must add nothing;
//   - flow «pick»: «أختار الدروس بنفسي» with 3 random lessons (some sessions unticked) and typed dates, then a second identical run;
//   - one fault per package, rotated: none · holidays (extension settings) · busy (existing prep on a date) · reject (date rejected
//     at save) · netcut (connection drops right after the save click) · close (Noor tab / «حاضر» window closed mid-run, then resume)
//     · yearend (package dates shifted so the term runs Dec → Jan; pick dates typed around the new year).
// Each file is one shift variant (*-2-t1.json = «فترتان»), so both shifts are covered by running every file.
// Every saved Noor row is traced to its file session by a tag the mock backend appends to «المفاهيم».
// Time is accelerated in the TEST COPY ONLY (timescale.js; TIME_SCALE, default 20). extension/ is never modified.
// Ports: AFAQ_PORT = base port of the mock backends (worker w uses AFAQ_PORT+w; default: free ports). Noor itself is not a port:
// it is served through Playwright context.route (NOOR_PORT is accepted and ignored). 8765 is never used unless asked for.
// Output: tests/noor-mock/matrix-report.md + matrix-report.json (override with REPORT=<path without extension>).
import { JSDOM } from 'jsdom';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createNoor, stripNo } from './noor-mock.mjs';
import { startAfaq } from './matrix-afaq.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const EXT_SRC = process.env.EXT_DIR ? path.resolve(process.env.EXT_DIR) : path.join(REPO, 'extension');
const PREPS = process.env.PREPS || '/mnt/project-files/afaq-platform/preps';
const REPORT = process.env.REPORT || path.join(HERE, 'matrix-report');
const SCALE = Number(process.env.TIME_SCALE || 20);
const FLOOR = Number(process.env.TIME_FLOOR || 4000);
const VERBOSE = !!process.env.VERBOSE;

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : dflt; };
const SAMPLE = opt('sample', 0) ? +opt('sample') : 0;
const ONLY = opt('only', '') ? String(opt('only')).split(',').map((s) => s.trim()).filter(Boolean) : [];
const JOBS = Math.max(1, +opt('jobs', Math.max(1, Math.min(4, os.cpus().length))));
const FLOWS = String(opt('flows', 'term,pick')).split(',');
const FAULTS = ['none', 'holidays', 'busy', 'reject', 'netcut', 'close', 'yearend'];
const ONLY_FAULTS = opt('faults', '') ? String(opt('faults')).split(',') : null;   // keep only the packages whose rotated fault is one of these
const FORCE_FAULT = opt('fault', '') ? String(opt('fault')) : '';                     // give every selected package this fault instead of the rotated one
const SEED = String(opt('seed', 'hadir'));
const MERGE = !!opt('merge', false);   // keep the previous report's results for the packages not run this time (re-run a few packages after a fix)
const RESUME = !!opt('resume', false);  // with --merge: skip the packages the previous report already holds (continue an interrupted run)
if (process.env.AFAQ_PORT && +process.env.AFAQ_PORT === 8765) console.log('warning: AFAQ_PORT=8765 is used by another test');

// ---------- small helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// the extension turns a text field's markup into plain text before typing it into Noor (engine.js stripHtml): paired formatting
// tags (<span class="m">…</span>, <b>…</b>) drop to their text, <sup>/<sub> become superscript/subscript characters, entities are
// decoded, and a lone tag such as «الوسم <meta>» (an HTML lesson) stays literal. `plain` is that same transform for the
// expected side; the Noor side is compared as typed (whitespace-normalised only). Packages with markup: bi-11, ch-11, ph-11, it-10, ma-7.
const SUPC = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '(': '⁽', ')': '⁾', n: 'ⁿ', ' ': ' ' };
const SUBC = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '(': '₍', ')': '₎', ' ': ' ' };
const arDigit = (c) => { const i = '٠١٢٣٤٥٦٧٨٩'.indexOf(c); return i >= 0 ? String(i) : c; };
const scriptize = (t, map) => { const cs = [...t].map(arDigit); return cs.every((c) => map[c] != null) ? cs.map((c) => map[c]).join('') : t; };
const plain = (html) => {
  let s = String(html || '');
  const blocky = /<\/(p|div|li|h\d|tr)>/i.test(s) && !/<(meta|head|html|body|title)\b/i.test(s);
  if (blocky) s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<\/?(p|div|li|ul|ol|table|tbody|thead|tr|td|th|h\d|blockquote|section|article)\b[^<>]*>/gi, '');
  for (let i = 0; i < 6; i++) s = s.replace(/<(span|b|i|u|strong|em|font|mark|small|big|code|a)\b[^<>]*>([^<]*)<\/\1>/gi, '$2');
  s = s.replace(/<sup>([^<]*)<\/sup>/gi, (m, t) => scriptize(t, SUPC)).replace(/<sub>([^<]*)<\/sub>/gi, (m, t) => scriptize(t, SUBC));
  s = decodeEntities(s).replace(/ /g, ' ');
  return norm(s);
};
// every named/numeric entity decoded, tags kept literal — the same rule as engine.js decodeEntities (DOMParser on the «<»-escaped text)
const JSD = new JSDOM('');
function decodeEntities(s) {
  if (!/&#?[a-z0-9]+;/i.test(s)) return s;
  return new JSD.window.DOMParser().parseFromString(s.replace(/</g, '&lt;'), 'text/html').body.textContent;
}
const GRADES = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
const D = (s) => new Date(s + 'T12:00:00Z');
const isoOf = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const wday = (s) => D(s).getUTCDay();
const isSchool = (s) => wday(s) <= 4;   // Sunday … Thursday
const nextSchool = (s, incl) => { let x = incl ? s : addDays(s, 1); while (!isSchool(x)) x = addDays(x, 1); return x; };
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(seed); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickN = (r, arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
const TAG = (id) => ` [[trace:${id}]]`;
const tagOf = (concepts) => { const m = String(concepts || '').match(/\[\[trace:([^\]]+)\]\]/); return m ? m[1] : null; };
const untag = (concepts) => String(concepts || '').replace(/\s*\[\[trace:[^\]]+\]\]/g, '');

// ---------- the packages ----------
function listPackages() {
  const files = [], skipped = [];
  const visit = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 1) visit(f, depth + 1); continue; }
      if (!/\.json$/i.test(e.name)) { skipped.push({ file: path.relative(PREPS, f), why: 'not a .json file' }); continue; }
      let p = null;
      try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { skipped.push({ file: path.relative(PREPS, f), why: 'invalid JSON' }); continue; }
      const g = typeof p.gradeNum === 'number' ? p.gradeNum : 0;
      if (!p || !p.id || !Array.isArray(p.lessons) || !p.lessons.length || !p.subject || !(g >= 1 && g <= 12)) { skipped.push({ file: path.relative(PREPS, f), why: 'not a prep package' }); continue; }
      if (/الثاني/.test(p.term || '')) { skipped.push({ file: path.relative(PREPS, f), why: 'term 2 package' }); continue; }
      files.push({ file: f, rel: path.relative(PREPS, f), id: p.id, subject: p.subject, grade: g, shift: p.shift === 'two' ? 'two' : 'one', n: p.lessons.length });
    }
  };
  visit(PREPS, 0);
  // a backup or corrected copy of a package with the same id (old-en-9/, fix-en-9/…): only the grade folder's copy is tested
  const byId = new Map();
  const rank = (f) => (/^g\d/.test(f.rel) ? 0 : /\//.test(f.rel) ? 2 : 1);
  for (const f of files) { const cur = byId.get(f.id); if (!cur || rank(f) < rank(cur)) byId.set(f.id, f); }
  for (const f of files) if (byId.get(f.id) !== f) skipped.push({ file: f.rel, why: `duplicate id ${f.id} (tested from ${byId.get(f.id).rel})` });
  return { files: files.filter((f) => byId.get(f.id) === f), skipped };
}
// the extension flips «lesson-unit» numbering («2-1 القلب» → «1-2 القلب», match.js fixPairOrder) when it loads a package, and the
// wizard's pick screen keys (data-k) use the flipped names — the harness uses the extension's own function so the keys agree
const { fixPairOrder } = await import(pathToFileURL(path.join(EXT_SRC, 'match.js')).href);
const loadPkg = (f) => { const p = JSON.parse(fs.readFileSync(f, 'utf8')); p.lessons.forEach((l) => { l.pubDate = l.pubDate || l.publishDate; }); fixPairOrder(p.lessons); return p; };
function groupsOf(pkg) {
  const m = new Map();
  pkg.lessons.forEach((l, i) => { const k = (l.unit || '') + '|' + (l.lesson || ''); if (!m.has(k)) m.set(k, { key: k, unit: l.unit || '', lesson: l.lesson || '', sessions: [] }); m.get(k).sessions.push(Object.assign(l, { idx: i })); });
  return [...m.values()];
}

// ---------- the Noor tree: the package's own names, with realistic variations ----------
const AR = /[ء-ي]/;
const RENAMES = [
  ['hamza', (t) => (/[أإآ]/.test(t) ? t.replace(/[أإآ]/, 'ا') : null)],
  ['taa', (t) => (/ة(?=\s|$)/.test(t) ? t.replace(/ة(?=\s|$)/, 'ه') : null)],
  ['article', (t) => { const w = t.split(' '); for (let i = w.length - 1; i >= 0; i--) if (/^ال[ء-ي]{3,}/.test(w[i])) { w[i] = w[i].slice(2); return w.join(' '); } for (let i = w.length - 1; i >= 0; i--) if (/^[ء-ي]{3,}$/.test(w[i]) && !/^ال/.test(w[i])) { w[i] = 'ال' + w[i]; return w.join(' '); } return null; }],
  ['case', (t) => (!AR.test(t) && /[a-z]/i.test(t) ? (t === t.toLowerCase() ? t.toUpperCase() : t.toLowerCase()) : null)],
  ['spacing', (t) => (/ /.test(t) ? t.replace(' ', '  ') + ' ' : null)],
];
function buildTree(pkg, r, gradeName) {
  const groups = groupsOf(pkg);
  const nameCount = groups.reduce((m, g) => m.set(g.lesson, (m.get(g.lesson) || 0) + 1), new Map());
  // two lessons renamed slightly (not those repeated across units, not «(n)»-suffixed ones: they stay exactly as in the file)
  const cand = groups.filter((g) => nameCount.get(g.lesson) === 1 && !/\(\s*\d+\s*\)\s*$/.test(g.lesson) && stripNo(g.lesson).length >= 6);
  const renamed = new Map();
  // the first renamed lesson: hamza → taa → article → case → spacing (whichever applies); the second starts at «article»;
  // every fifth package gets the double/trailing-space variant on its second lesson
  pickN(r, cand, groups.length >= 6 ? 2 : 1).forEach((g, k) => {
    const base = stripNo(g.lesson);
    const order = k === 0 ? RENAMES : hash(pkg.id) % 5 === 0 ? RENAMES.slice(4).concat(RENAMES.slice(0, 4)) : RENAMES.slice(2).concat(RENAMES.slice(0, 2));
    for (const [how, fn] of order) { const t = fn(base); if (t && t !== base) { renamed.set(g.key, { text: t, how }); break; } }
  });
  const units = [];
  let nid = 5000;
  const nodeOf = new Map();
  for (const g of groups) {
    let u = units.find((x) => x.text === g.unit);
    if (!u) { u = { text: g.unit, lessons: [] }; units.push(u); }
    const rn = renamed.get(g.key);
    const n = { text: rn ? rn.text : stripNo(g.lesson), nodeId: String(++nid), fileLesson: g.lesson, renamed: rn ? rn.how : '' };
    u.lessons.push(n);
    nodeOf.set(g.key, Object.assign({ unit: u.text }, n));
  }
  // term 2: other units — one of them reuses a term-1 lesson name (must never receive a term-1 prep)
  const reuse = groups[Math.floor(r() * groups.length)];
  const t2 = [
    { text: 'الوحدة الأولى (الفصل الثاني)', lessons: [{ text: stripNo(reuse.lesson), nodeId: '7001' }, { text: 'درس من الفصل الثاني', nodeId: '7002' }] },
    { text: 'الوحدة الثانية (الفصل الثاني)', lessons: [{ text: 'مراجعة عامة للفصل الثاني', nodeId: '7003' }] },
  ];
  // the lessons in Noor-tree order (unit by unit) — the order the extension lays the dates out in and keeps («لا يُنشر درس سابق بعد درس لاحق»)
  const treeGroups = units.flatMap((u) => u.lessons.map((n) => groups.find((g) => g.unit === u.text && g.lesson === n.fileLesson)));
  return { tree: { book: `${pkg.subject} - ${gradeName}`, terms: [{ text: 'الفصل الدراسي الأول', units }, { text: 'الفصل الدراسي الثاني', units: t2 }] }, nodeOf, renamed, groups, treeGroups };
}
const titleFor = (nodeOf, l, groups) => { const g = groups.find((x) => x.key === (l.unit || '') + '|' + (l.lesson || '')); const k = g.sessions.indexOf(l) + 1; const n = nodeOf.get(g.key); return n.text + (k > 1 ? ` (${k})` : ''); };

// ---------- expected dates (full term) — the rule the extension documents for «حسب النشرة الرسمية» (semester.js assignDates,
// dates.js layoutDates): sessions are laid out in the order of the official schedule (the file order, which is chronological —
// also where the sessions of different lessons interleave, as in the Quran units), each on its official date, unless that day
// is blocked (holiday / busy / rejected / already taken): then the next free school day; a session is never published on or
// before the previous one of the schedule (so a moved session pushes the following ones until a gap absorbs the shift). ----------
function expectDates(groups, saved, blocked) {
  const out = {};
  const used = new Set(blocked);
  let last = null;
  for (const g of groups) for (const s of g.sessions) {
    if (!saved.has(s.id)) continue;
    const plan = s.pubDate;
    let at = plan;
    if (last && plan >= last.plan && at <= last.date) at = nextSchool(last.date, false);
    let d = nextSchool(at, true);
    for (let i = 0; i < 300 && used.has(d); i++) d = nextSchool(d, false);
    out[s.id] = d; used.add(d); last = { plan, date: d };
  }
  return out;
}

// ---------- the extension under test: one temp copy per worker (mock backend port + accelerated timers) ----------
function prepareExtension(port, w) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hadir-matrix-w${w}-`));
  fs.cpSync(EXT_SRC, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'afaq-config.js'), fs.readFileSync(path.join(HERE, 'afaq-config.mock.js'), 'utf8').replaceAll('127.0.0.1:8765', '127.0.0.1:' + port));
  const shim = timeShim();
  fs.writeFileSync(path.join(dir, 'timescale.js'), shim);
  const sem = path.join(dir, 'semester.html');
  fs.writeFileSync(sem, fs.readFileSync(sem, 'utf8').replace(/<script\b/, '<script src="timescale.js"></script>\n<script'));
  for (const f of ['content.js', 'noorlist.js']) { const p = path.join(dir, f); if (fs.existsSync(p)) fs.writeFileSync(p, shim + '\n' + fs.readFileSync(p, 'utf8')); }
  const bg = path.join(dir, 'background.js');
  fs.writeFileSync(bg, "import './timescale.js';\n" + fs.readFileSync(bg, 'utf8'));
  if (process.env.TRACE_EXEC) {   // diagnostics: time every engine call / navigation (console of the tool page)
    const pk = path.join(dir, 'packages.js');
    fs.writeFileSync(pk, fs.readFileSync(pk, 'utf8').replace('async function execNoor(tabId, action, payload) {\n', "async function execNoor(tabId, action, payload) {\n  const __t = performance.now(); try { return await execNoor0(tabId, action, payload); } finally { console.log('[exec] ' + action + ' ' + (payload && payload.op || '') + ' ' + Math.round(performance.now() - __t) + 'ms'); }\n}\nasync function execNoor0(tabId, action, payload) {\n"));
    const sm = path.join(dir, 'semester.js');
    fs.writeFileSync(sm, fs.readFileSync(sm, 'utf8').replace('async function nav(url) {\n', "async function nav(url) {\n  const __t = performance.now(); try { return await nav0(url); } finally { console.log('[nav] ' + url.slice(-40) + ' ' + Math.round(performance.now() - __t) + 'ms'); }\n}\nasync function nav0(url) {\n").replace('function setBox(kind, head, text, buttons = []) {\n', "function setBox(kind, head, text, buttons = []) {\n  console.log('[box] ' + head);\n"));
  }
  return dir;
}
const timeShim = (fastClock = false) => fs.readFileSync(path.join(HERE, 'timescale.js'), 'utf8').replaceAll('__SCALE__', String(SCALE)).replaceAll('__FLOOR__', String(FLOOR)).replaceAll('__FAST_CLOCK__', fastClock ? 'true' : 'false');

// ---------- browser + wizard ----------
async function launch(extDir, noor, { settings } = {}) {
  const ctx = await chromium.launchPersistentContext('', {
    headless: !process.env.HEADFUL, executablePath: '/opt/pw-browsers/chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, ...(process.env.HEADFUL ? [] : ['--headless=new'])],
    viewport: { width: 1100, height: 900 },
  });
  await ctx.addInitScript({ content: timeShim(true) });   // mock Noor pages (the extension's own pages are not affected: init scripts do not run in chrome-extension:// pages)
  await ctx.route('https://lms.moe.gov.om/**', (r) => noor.handle(r).catch((e) => { if (VERBOSE) console.log('    route error', e.message); return r.abort().catch(() => {}); }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  const id = sw.url().split('/')[2];
  await sleep(1200);
  if (settings) await sw.evaluate(async (s) => { const r = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, r.settings || {}, s) }); }, settings);
  for (const p of ctx.pages()) if (p.url().includes('semester.html')) await p.close().catch(() => {});
  const b = { ctx, sw, id, errs: [], pg: null };
  await openTool(b);
  return b;
}
async function openTool(b) {
  b.pg = await b.ctx.newPage();
  b.pg.on('pageerror', (e) => b.errs.push(e.message));
  if (process.env.TRACE_EXEC) b.pg.on('console', (m) => { const t = m.text(); if (/^\[(exec|nav|box)\]/.test(t)) console.log(`    ${new Date().toISOString().slice(14, 23)} ${t}`); });
  await b.pg.goto(`chrome-extension://${b.id}/semester.html?debug=1`);
}
async function clickCard(pg, text, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await pg.evaluate((t) => {
      const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const c = [...document.querySelectorAll('#wzBody .wz-card:not([disabled])')].find((x) => n((x.querySelector('b') || x).textContent) === t);
      if (!c) return false; c.click(); return true;
    }, text).catch(() => false);
    if (ok) { await sleep(400); return true; }
    await sleep(250);
  }
  throw new Error(`wizard card «${text}» not found`);
}
const started = (pg) => pg.evaluate(() => document.body.classList.contains('wiz-run') || !!document.getElementById('wzName') || !!document.querySelector('input[data-k]')).catch(() => false);
async function wizardTo(pg, job, mode, { name = true } = {}) {
  const step = async (t) => { if (await started(pg)) return; await clickCard(pg, t); };
  await step(mode === 'pick' ? 'أختار الدروس بنفسي' : 'تحضير الفصل كاملًا');
  await step('الصف ' + GRADES[job.grade - 1]);
  await step(job.subject);
  await step(job.shift === 'two' ? 'فترتان' : 'فترة واحدة');
  if (!name) return;
  if (await pg.evaluate(() => !!document.getElementById('wzName')).catch(() => false)) {
    await pg.fill('#wzName', 'سالم علي', { timeout: 15000 });
    await pg.click('#wzNameGo');
  }
}
async function ui(pg) {
  return pg.evaluate(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
    return { head: t('nowHead'), text: t('nowText'), stop: vis('stopBtn'), again: vis('wzAgain'), resume: vis('wzResume'), wiz: vis('wizCard'), wzHead: t('wzHead'), run: document.body.classList.contains('wiz-run'), msg: t('topMsg') };
  });
}
// wait for the wizard's final state; tick(b) is called every poll (fault injection mid-run)
async function waitDone(b, ms, tick) {
  const end = Date.now() + ms;
  let last = '', stable = 0, s = null;
  while (Date.now() < end) {
    if (tick) await tick(b);
    s = await ui(b.pg).catch(() => null);
    if (s) {
      const sig = JSON.stringify(s);
      if (sig !== last) { last = sig; stable = 0; if (VERBOSE) console.log(`    [${new Date().toISOString().slice(11, 19)}] ui: ${s.head} | ${s.text.slice(0, 90)}`); } else stable++;
      const fin = (s.again && !s.stop && !/أكملها الآن|أكمل التحضير/.test(s.head)) || (s.wiz && /انتهت تجربتك/.test(s.wzHead));
      if (fin && stable >= 2) return s;
    }
    await sleep(500);
  }
  return Object.assign(s || {}, { timeout: true });
}
const OK_HEAD = /تمت التعبئة بنجاح|موجودة في نور|لا شيء ناقص|مكتمل/;
// the wizard's final state; «أكمل الباقي» is pressed (up to twice) if sessions are left — what a teacher does
async function waitFinal(b, ms, tick, note) {
  let s = null;
  for (let k = 0; k <= 2; k++) {
    s = await waitDone(b, ms, tick);
    if (s.timeout || OK_HEAD.test(s.head) || !s.resume) return s;
    note.resumes = (note.resumes || 0) + 1;
    await b.pg.click('#wzResume').catch(() => {});
    await sleep(800);
  }
  return s;
}
const dumpLog = (pg) => pg.evaluate(() => (window.__hadirSem ? window.__hadirSem.log : [])).catch(() => []);

// ---------- one flow ----------
function newFlow(job, flow) { return { pkg: job.id, flow, fault: job.fault, checks: [], info: {}, secs: 0 }; }
function check(F, ok, name, detail = '', soft = false) { F.checks.push({ ok: !!ok, name, ...(soft ? { soft: true } : {}), ...(ok ? {} : { detail: String(detail).slice(0, 4000) }) }); return !!ok; }
const failedChecks = (f) => f.checks.filter((c) => !c.ok && !c.soft);   // soft checks are notes: they never fail a flow
const fmtRow = (r, sess) => `#${r.post} ${sess ? sess.id : '???'} «${r.title}» node=${r.nodeText} [${r.unit}] date=${r.publishDate}`;

function setupJob(job) {
  const pkg = loadPkg(job.file);
  const r = rng(SEED + '|' + job.id);
  let endsOn = '2027-01-21';
  if (job.fault === 'yearend') {
    // shift the whole package by whole weeks so its last session falls between 8 and 14 January (term: autumn → January)
    const max = pkg.lessons.map((l) => l.pubDate).sort().pop();
    const weeks = Math.floor((D('2027-01-14') - D(max)) / (7 * 864e5));
    pkg.lessons.forEach((l) => { l.pubDate = l.publishDate = addDays(l.pubDate, 7 * weeks); });
    job.shiftWeeks = weeks;
  }
  const gradeName = GRADES[job.grade - 1];
  const T = buildTree(pkg, r, gradeName);
  const other = job.grade === 12 ? 11 : job.grade + 1;
  const otherSubject = ['المهارات الحياتية', 'التربية الموسيقية'].find((s) => !s.includes(pkg.subject) && !pkg.subject.includes(s));
  const cid = 'K' + String(hash(job.id) % 100000);
  const courses = (tree) => [
    { cid, title: pkg.subject, level: 'الصف ' + gradeName, subject: pkg.subject, grade: gradeName, tree },
    { cid: cid + 'X', title: pkg.subject, level: 'الصف ' + GRADES[other - 1], subject: pkg.subject, grade: GRADES[other - 1], tree },
    { cid: cid + 'Y', title: otherSubject, level: 'الصف ' + gradeName, subject: otherSubject, grade: gradeName, tree },
  ];
  // the other shift variant of the same subject/grade is in the catalog too: the wizard must take the one asked for
  const sib = /-2$/.test(job.id) ? job.id.replace(/-2$/, '') : job.id + '-2';
  const sibFile = path.join(path.dirname(job.file), path.basename(job.file).replace(job.id, sib));
  const pkgs = { [job.id]: pkg };
  const catalog = [{ id: job.id, subject: pkg.subject, grade: job.grade, title: pkg.title || pkg.subject, shift: job.shift }];
  const meta = { [job.id]: { title: pkg.title || pkg.subject, subject: pkg.subject, grade: job.grade, shift: job.shift, ends_on: endsOn } };
  if (fs.existsSync(sibFile)) {
    try { const sp = loadPkg(sibFile); if (sp.id === sib && sp.subject === pkg.subject) { pkgs[sib] = sp; catalog.push({ id: sib, subject: sp.subject, grade: job.grade, title: sp.title || sp.subject, shift: sp.shift === 'two' ? 'two' : 'one' }); meta[sib] = { title: sp.title || sp.subject, subject: sp.subject, grade: job.grade, shift: sp.shift === 'two' ? 'two' : 'one', ends_on: endsOn }; } } catch (e) {}
  }
  return { pkg, r, T, cid, courses, pkgs, catalog, meta, endsOn, sib: pkgs[sib] ? sib : null };
}

// common row checks
function traceRows(F, J, rows) {
  const byId = new Map(J.pkg.lessons.map((l) => [l.id, l]));
  const unknown = rows.filter((r) => !byId.has(tagOf(r.concepts)));
  check(F, !unknown.length, 'trace: every saved row carries the content of a session of this package', unknown.map((r) => fmtRow(r)).join('\n'));
  const badContent = rows.filter((r) => { const l = byId.get(tagOf(r.concepts)); return l && norm(untag(r.concepts)) !== plain(l.concepts); });
  check(F, !badContent.length, 'content: «المفاهيم» in Noor = the session\'s own text (markup turned into plain text)', badContent.slice(0, 5).map((r) => { const l = byId.get(tagOf(r.concepts)); const a = norm(untag(r.concepts)), b = plain(l.concepts); let i = 0; while (i < a.length && a[i] === b[i]) i++; return `${l.id}: differ at ${i}: got «…${a.slice(Math.max(0, i - 40), i + 80)}» expected «…${b.slice(Math.max(0, i - 40), i + 80)}»`; }).join('\n'));
  check(F, rows.every((r) => r.cid === J.cid), 'course: every save in the right course card', rows.filter((r) => r.cid !== J.cid).map((r) => r.cid + ' ' + fmtRow(r, byId.get(tagOf(r.concepts)))).join('\n'));
  const wrong = rows.filter((r) => { const l = byId.get(tagOf(r.concepts)); if (!l) return false; const n = J.T.nodeOf.get((l.unit || '') + '|' + (l.lesson || '')); return !n || r.lessonId !== n.nodeId; });
  check(F, !wrong.length, 'own lesson: every row saved into its own session\'s Noor lesson (unit + lesson node)', wrong.map((r) => { const l = byId.get(tagOf(r.concepts)); const n = J.T.nodeOf.get((l.unit || '') + '|' + (l.lesson || '')); return `${l.id} «${l.unit} / ${l.lesson}» → saved in «${r.nodeText}» [${r.unit}] (expected «${n ? n.text : '-'}» [${n ? n.unit : ''}])`; }).join('\n'));
  const cnt = new Map();
  rows.forEach((r) => { const id = tagOf(r.concepts); if (id) cnt.set(id, (cnt.get(id) || []).concat(r)); });
  const dups = [...cnt].filter(([, v]) => v.length > 1);
  check(F, !dups.length, 'no duplicate: no session saved twice', dups.map(([k, v]) => `${k} ×${v.length}:\n  ` + v.map((r) => fmtRow(r, byId.get(k))).join('\n  ')).join('\n'));
  const badTitle = rows.filter((r) => { const l = byId.get(tagOf(r.concepts)); return l && norm(r.title) !== norm(titleFor(J.T.nodeOf, l, J.T.groups)); });   // whitespace-insensitive: Noor trims the title
  check(F, !badTitle.length, 'title: Noor lesson name + «(n)» for session n', badTitle.slice(0, 8).map((r) => { const l = byId.get(tagOf(r.concepts)); return `${l.id}: «${r.title}» expected «${titleFor(J.T.nodeOf, l, J.T.groups)}»`; }).join('\n'));
  const wk = rows.filter((r) => !isSchool(r.publishDate));
  check(F, !wk.length, 'weekdays: no publish date on Friday/Saturday', wk.map((r) => fmtRow(r, byId.get(tagOf(r.concepts)))).join('\n'));
  return { byId, cnt };
}

async function flowTerm(job, J, W) {
  const F = newFlow(job, 'term');
  const t0 = Date.now();
  const n = J.pkg.lessons.length;
  const at = (q) => J.pkg.lessons[Math.min(n - 1, Math.max(1, Math.floor(n * q)))].pubDate;
  const cfg = { pkg: J.pkg, courses: J.courses(J.T.tree) };
  const blocked = new Set();
  let settings = null;
  if (job.fault === 'holidays') { const h = [at(0.3), at(0.55), nextSchool(at(0.55), false)]; h.forEach((d) => blocked.add(d)); settings = { holidays: h.join('\n') }; F.info.holidays = h; }
  if (job.fault === 'busy') { const b2 = [at(0.35), at(0.7)]; b2.forEach((d) => blocked.add(d)); cfg.existing = [{ cid: J.cid, title: 'نشاط إثرائي', publishDate: b2[0] }, { cid: J.cid, title: 'اختبار قصير', publishDate: b2[1] }]; F.info.busy = b2; }
  if (job.fault === 'reject') { const rj = [at(0.4), at(0.75)]; rj.forEach((d) => blocked.add(d)); cfg.rejectAtSave = rj; F.info.rejectAtSave = rj; }
  if (job.fault === 'netcut') { cfg.ambiguous = { 2: 'abort', [Math.max(3, Math.floor(n / 2))]: 'abort' }; F.info.netcutPosts = Object.keys(cfg.ambiguous).map(Number); }
  const noor = createNoor(cfg);
  W.afaq.reset({ pkgs: J.pkgs, catalog: J.catalog, meta: J.meta, tag: TAG });
  const b = await launch(W.extDir, noor, { settings });
  let tick = null;
  if (job.fault === 'close') {
    const variant = hash(job.id) % 2 ? 'window' : 'tab';
    const after = Math.max(2, Math.floor(n * 0.3));
    F.info.close = { variant, afterSaves: after };
    let done = false;
    tick = async (bb) => {
      if (done || noor.st.rows.filter((x) => !x.preexisting).length < after) return;
      done = true;
      if (variant === 'tab') {
        for (const p of bb.ctx.pages()) if (/lms\.moe\.gov\.om/.test(p.url())) await p.close().catch(() => {});
        F.info.close.closedAt = noor.st.rows.length;
      } else {
        await bb.pg.close().catch(() => {});
        F.info.close.closedAt = noor.st.rows.length;
        await sleep(16000);   // the run lock of the closed window expires after 15 s (real time)
        await openTool(bb);
        await sleep(4000);
        if (!(await bb.pg.evaluate(() => document.body.classList.contains('wiz-run')).catch(() => false))) {
          F.info.close.resumed = 'manual (wizard again)';
          await wizardTo(bb.pg, job, 'term', { name: false });
        } else F.info.close.resumed = 'by itself (offerResume)';
      }
    };
  }
  try {
    await wizardTo(b.pg, job, 'term');
    if (settings) {
      const hs = await b.pg.evaluate(() => (window.__hadirSem ? window.__hadirSem.holidays() : null)).catch(() => null);
      check(F, hs && settings.holidays.split('\n').every((d) => hs.includes(d)), 'holidays: the settings holidays are known to the tool', JSON.stringify(hs));
    }
    const s = await waitFinal(b, 120000 + n * 12000, tick, F.info);
    F.info.final = `${s.head} | ${s.text}`.slice(0, 300);
    const rows = noor.st.rows.filter((x) => !x.preexisting);
    F.info.saved = rows.length; F.info.posts = noor.st.posts.length;
    check(F, !s.timeout, 'finished: the run ended (no timeout)', JSON.stringify(s));
    check(F, OK_HEAD.test(s.head), 'finished: wizard shows success', `${s.head} | ${s.text}`);
    check(F, W.afaq.st.picked.includes(job.id) && !(J.sib && W.afaq.st.picked.includes(J.sib)), `shift: the «${job.shift === 'two' ? 'فترتان' : 'فترة واحدة'}» package was taken (${job.id})`, `picked: ${W.afaq.st.picked.join(', ')}`);
    const { byId, cnt } = traceRows(F, J, rows);
    // completeness: every session of every lesson whose Noor name is not renamed
    const exactMiss = J.pkg.lessons.filter((l) => !cnt.has(l.id) && !J.T.renamed.has((l.unit || '') + '|' + (l.lesson || '')));
    check(F, !exactMiss.length, `complete: every session of the ${J.T.groups.length - J.T.renamed.size} lessons with the same name in Noor was saved`, `${exactMiss.length} missing: ` + exactMiss.slice(0, 12).map((l) => `${l.id} «${l.lesson}»`).join(', '));
    const ren = [...J.T.renamed].map(([k, v]) => { const g = J.T.groups.find((x) => x.key === k); return { lesson: g.lesson, noor: v.text, how: v.how, sessions: g.sessions.length, saved: g.sessions.filter((l) => cnt.has(l.id)).length }; });
    F.info.renamed = ren;
    // order + term + dates
    const saved = J.pkg.lessons.filter((l) => cnt.has(l.id)).map((l) => ({ l, d: cnt.get(l.id)[0].publishDate }));
    const dOf = Object.fromEntries(saved.map((x) => [x.l.id, x.d]));
    const flipsIn = [];
    J.T.groups.forEach((g) => { const ss = g.sessions.filter((l) => dOf[l.id]); for (let i = 1; i < ss.length; i++) if (!(dOf[ss[i].id] > dOf[ss[i - 1].id])) flipsIn.push(`«${g.lesson}»: session ${i} ${ss[i - 1].id}@${dOf[ss[i - 1].id]} then session ${i + 1} ${ss[i].id}@${dOf[ss[i].id]}`); });
    check(F, !flipsIn.length, 'order: within a lesson, session k+1 strictly after session k', flipsIn.slice(0, 10).join('\n'));
    // lesson order = Noor-tree order (unit by unit); within a unit the lessons follow each other, so lesson k+1 never starts before lesson k
    const flipsLess = [];
    J.T.tree.terms[0].units.forEach((u) => {
      const firsts = u.lessons.map((n) => J.T.groups.find((g) => g.unit === u.text && g.lesson === n.fileLesson)).map((g) => g.sessions.find((l) => dOf[l.id])).filter(Boolean);
      firsts.forEach((a, i) => { if (i && !(dOf[a.id] > dOf[firsts[i - 1].id])) flipsLess.push(`[${u.text}] lesson «${firsts[i - 1].lesson}» starts ${dOf[firsts[i - 1].id]}, the next lesson «${a.lesson}» starts ${dOf[a.id]}`); });
    });
    check(F, !flipsLess.length, 'order: within a unit, lesson k+1 never starts before lesson k', flipsLess.slice(0, 10).join('\n'));
    const flips = [];
    for (let i = 1; i < saved.length; i++) if (!(saved[i].d > saved[i - 1].d)) flips.push(`${saved[i - 1].l.id} «${saved[i - 1].l.lesson}»@${saved[i - 1].d} then ${saved[i].l.id} «${saved[i].l.lesson}»@${saved[i].d}`);
    check(F, !flips.length, 'note — file order: no session published before an earlier entry of the file (sessions of different lessons interleaved in the file may swap by a day after a move)', flips.slice(0, 10).join('\n'), true);
    const t1 = J.pkg.lessons.map((l) => l.pubDate).sort()[0];
    const out = saved.filter((x) => x.d < t1 || x.d > J.endsOn);
    check(F, !out.length, `term: every date within the term (${t1} … ${J.endsOn})`, out.slice(0, 10).map((x) => `${x.l.id}@${x.d}`).join('\n'));
    const onBlocked = saved.filter((x) => blocked.has(x.d));
    if (blocked.size) check(F, !onBlocked.length, `blocked days: nothing on a ${job.fault} day (${[...blocked].join(', ')})`, onBlocked.map((x) => `${x.l.id}@${x.d}`).join('\n'));
    const exp = expectDates([{ sessions: J.pkg.lessons }], new Set(saved.map((x) => x.l.id)), blocked);   // file order = official schedule
    const early = saved.filter((x) => x.d < x.l.pubDate);
    check(F, !early.length, 'dates: no session before its official date', early.slice(0, 10).map((x) => `${x.l.id}: ${x.d} < ${x.l.pubDate}`).join('\n'));
    const off = saved.filter((x) => x.d !== exp[x.l.id]);
    check(F, !off.length, blocked.size ? 'dates: official date, or the next free school day when blocked (later sessions follow)' : 'dates: every session on its official date', `${off.length} differ: ` + off.slice(0, 10).map((x) => `${x.l.id}: got ${x.d}, expected ${exp[x.l.id]} (file ${x.l.pubDate})`).join('\n'));
    if (job.fault === 'busy') check(F, cfg.existing.every((e) => noor.st.rows.filter((x) => x.preexisting && x.publishDate === e.publishDate).length === 1), 'busy: the existing preps are untouched');
    // second run (reload): nothing added
    const n1 = noor.st.rows.length;
    await b.pg.reload();
    await sleep(2500);
    if (!(await started(b.pg))) await wizardTo(b.pg, job, 'term', { name: false });
    else F.info.rerunResumedItself = true;
    const s2 = await waitFinal(b, 120000 + n * 3000, null, F.info);
    F.info.rerun = `${s2.head} | ${s2.text}`.slice(0, 200);
    check(F, noor.st.rows.length === n1, `re-run: a second run adds nothing (rows ${n1} → ${noor.st.rows.length})`, noor.st.rows.slice(n1).map((r) => fmtRow(r, byId.get(tagOf(r.concepts)))).join('\n'));
    check(F, !s2.timeout, 're-run: ended (no timeout)', JSON.stringify(s2));
  } catch (e) {
    check(F, false, 'harness: flow ran without a harness error', e.stack || e);
  }
  await finishFlow(F, b, noor, t0);
  return F;
}

async function flowPick(job, J, W) {
  const F = newFlow(job, 'pick');
  const t0 = Date.now();
  const r = rng(SEED + '|pick|' + job.id);
  const cfg = { pkg: J.pkg, courses: J.courses(J.T.tree) };
  const blocked = new Set();
  let settings = null;
  const n = J.pkg.lessons.length;
  const at = (q) => J.pkg.lessons[Math.min(n - 1, Math.floor(n * q))].pubDate;
  if (job.fault === 'holidays') { const h = [at(0.2), at(0.5), at(0.8)]; h.forEach((d) => blocked.add(d)); settings = { holidays: h.join('\n') }; F.info.holidays = h; }
  if (job.fault === 'busy') { const b2 = [at(0.3), at(0.6)]; b2.forEach((d) => blocked.add(d)); cfg.existing = [{ cid: J.cid, title: 'نشاط إثرائي', publishDate: b2[0] }, { cid: J.cid, title: 'اختبار قصير', publishDate: b2[1] }]; F.info.busy = b2; }
  if (job.fault === 'netcut') { cfg.ambiguous = { 1: 'abort' }; F.info.netcutPosts = [1]; }
  // 3 random lessons; in a lesson with several sessions keep a random 1–3 of them (not always the first)
  const gs = pickN(r, J.T.groups, 3).sort((a, b) => a.sessions[0].idx - b.sessions[0].idx);
  const chosen = [];
  gs.forEach((g) => { const k = g.sessions.length === 1 ? 1 : 1 + Math.floor(r() * Math.min(3, g.sessions.length)); pickN(r, g.sessions, k).sort((a, b) => a.idx - b.idx).forEach((l) => chosen.push(l)); });
  // typed dates: distinct school days inside the term (around the new year for «yearend»), never a holiday / busy day, ascending
  const t1 = J.pkg.lessons.map((l) => l.pubDate).sort()[0];
  const [from, to] = job.fault === 'yearend' ? ['2026-12-20', '2027-01-14'] : [t1, J.endsOn];
  const pool = [];
  for (let d = nextSchool(from, true); d <= to; d = nextSchool(d, false)) if (!blocked.has(d)) pool.push(d);
  const typed = pickN(r, pool, chosen.length).sort();
  const want = Object.fromEntries(chosen.map((l, i) => [l.id, typed[i]]));
  F.info.chosen = chosen.map((l) => `${l.id}@${want[l.id]}`);
  if (job.fault === 'close') F.info.close = { variant: 'tab', afterSaves: 1 };
  const noor = createNoor(cfg);
  W.afaq.reset({ pkgs: J.pkgs, catalog: J.catalog, meta: J.meta, tag: TAG });
  const b = await launch(W.extDir, noor, { settings });
  let closed = false;
  const tick = job.fault === 'close' && chosen.length > 1 ? async (bb) => {
    if (closed || noor.st.rows.filter((x) => !x.preexisting).length < 1) return;
    closed = true;
    for (const p of bb.ctx.pages()) if (/lms\.moe\.gov\.om/.test(p.url())) await p.close().catch(() => {});
  } : null;
  const select = async () => {
    await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
    // every unit is one block in the pick list, with all its lessons, whatever the file order (the ministry plan interleaves units)
    const heads = await b.pg.evaluate(() => [...document.querySelectorAll('.wz-unit')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    check(F, new Set(heads).size === heads.length && heads.length > 0, `pick list: each unit appears once (${heads.length} units)`, 'headings: ' + heads.join(' | '));
    const keys = await b.pg.evaluate(() => [...document.querySelectorAll('input[data-k]')].map((x) => x.dataset.k));
    const allG = J.T.groups;
    check(F, allG.every((g) => keys.includes(g.key)) && keys.length === allG.length, `pick list: every lesson listed once (${allG.length} lessons)`, `listed ${keys.length}; missing: ` + allG.filter((g) => !keys.includes(g.key)).map((g) => g.lesson).slice(0, 5).join(' | '));
    for (const g of gs) {
      await b.pg.evaluate((k) => { const cb = [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k); if (cb && !cb.checked) cb.click(); }, g.key);
      await sleep(250);
      if (g === gs[0]) {
        // every chosen session shows a clear, empty date box (no suggested date; the teacher types it)
        const boxes = await b.pg.evaluate((ids) => ids.map((id) => { const el = [...document.querySelectorAll('input[data-d]')].find((x) => x.dataset.d === id); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), v: el.value }; }), g.sessions.map((l) => l.id));
        check(F, boxes.every((x) => x && x.w >= 120 && x.h >= 24), `pick list: a clear date box for every session of a chosen lesson (${g.sessions.length === 1 ? 'one session' : 'several sessions'})`, JSON.stringify(boxes));
        check(F, boxes.every((x) => x && x.v === ''), 'pick list: no suggested date (boxes start empty)', JSON.stringify(boxes));
      }
      for (const l of g.sessions) if (!want[l.id] && g.sessions.length > 1) { await b.pg.evaluate((id) => { const cb = [...document.querySelectorAll('input[data-s]')].find((x) => x.dataset.s === id); if (cb && cb.checked) cb.click(); }, l.id); await sleep(150); }
    }
    for (const [id, d] of Object.entries(want)) await b.pg.evaluate(([id, d]) => { const el = [...document.querySelectorAll('input[data-d]')].find((x) => x.dataset.d === id); if (el) { el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); } }, [id, d]);
    await sleep(300);
    const shown = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => [x.dataset.d, x.value]));
    return Object.fromEntries(shown);
  };
  try {
    await wizardTo(b.pg, job, 'pick');
    const shown = await select();
    const same = Object.keys(want).length === Object.keys(shown).length && Object.entries(want).every(([id, d]) => shown[id] === d);
    check(F, same, `pick screen: exactly the ${chosen.length} chosen sessions with the typed dates`, `want ${JSON.stringify(want)}\nshown ${JSON.stringify(shown)}`);
    await b.pg.click('#wzLessGo');
    const s = await waitFinal(b, 90000 + chosen.length * 15000, tick, F.info);
    F.info.final = `${s.head} | ${s.text}`.slice(0, 300);
    const rows = noor.st.rows.filter((x) => !x.preexisting);
    F.info.saved = rows.length; F.info.posts = noor.st.posts.length;
    check(F, !s.timeout, 'finished: the run ended (no timeout)', JSON.stringify(s));
    check(F, OK_HEAD.test(s.head), 'finished: wizard shows success', `${s.head} | ${s.text}`);
    const { byId, cnt } = traceRows(F, J, rows);
    const got = [...cnt.keys()].sort(), exp = Object.keys(want).sort();
    // a renamed lesson may be left out (unsure link) — then the tool must say so; anything else must be saved
    const renamedOut = exp.filter((id) => !got.includes(id) && J.T.renamed.has((byId.get(id).unit || '') + '|' + (byId.get(id).lesson || '')));
    F.info.renamedNotFilled = renamedOut;
    const missing = exp.filter((id) => !got.includes(id) && !renamedOut.includes(id)), extra = got.filter((id) => !exp.includes(id));
    check(F, !missing.length && !extra.length, `selection: exactly the chosen sessions were saved (${exp.length})`, `missing: ${missing.join(', ') || '-'}\nextra: ${extra.join(', ') || '-'}`);
    const off = rows.filter((x) => { const id = tagOf(x.concepts); return want[id] && x.publishDate !== want[id]; });
    check(F, !off.length, 'dates: every pick saved on exactly the typed date', off.map((x) => { const id = tagOf(x.concepts); return `${id}: got ${x.publishDate}, typed ${want[id]}`; }).join('\n'));
    // second identical run: nothing added
    const n1 = noor.st.rows.length;
    await b.pg.reload();
    await sleep(2500);
    if (!(await started(b.pg))) await wizardTo(b.pg, job, 'pick', { name: false });
    if (await b.pg.evaluate(() => !!document.querySelector('input[data-k]')).catch(() => false)) {
      await select();
      await b.pg.click('#wzLessGo');
    } else F.info.rerunNoLessonsScreen = true;
    const s2 = await waitFinal(b, 90000, null, F.info);
    F.info.rerun = `${s2.head} | ${s2.text}`.slice(0, 200);
    check(F, noor.st.rows.length === n1, `re-run: the same pick again adds nothing (rows ${n1} → ${noor.st.rows.length})`, noor.st.rows.slice(n1).map((x) => fmtRow(x, byId.get(tagOf(x.concepts)))).join('\n'));
    check(F, !s2.timeout, 're-run: ended (no timeout)', JSON.stringify(s2));
  } catch (e) {
    check(F, false, 'harness: flow ran without a harness error', e.stack || e);
  }
  await finishFlow(F, b, noor, t0);
  return F;
}

async function finishFlow(F, b, noor, t0) {
  if (b) {
    if (failedChecks(F).length) {
      F.log = (await dumpLog(b.pg)).slice(-60);
      F.posts = noor.st.posts.map((p) => `#${p.n} ${p.date} «${p.title}» lesson=${p.lessonId} → ${p.outcome}`);
      if (process.env.SHOTS) await b.pg.screenshot({ path: path.join(process.env.SHOTS, `${F.pkg}-${F.flow}.png`), fullPage: true }).catch(() => {});
    }
    if (b.errs.length) F.pageErrors = b.errs.slice(0, 5);
    await b.ctx.close().catch(() => {});
  }
  F.secs = Math.round((Date.now() - t0) / 1000);
}

// ---------- main ----------
const { files, skipped } = listPackages();
if (FORCE_FAULT && !FAULTS.includes(FORCE_FAULT)) { console.log(`unknown fault «${FORCE_FAULT}» — one of ${FAULTS.join(', ')}`); process.exit(2); }
let jobs = files.map((f, i) => Object.assign(f, { i, fault: FORCE_FAULT || FAULTS[i % FAULTS.length] }));
if (ONLY.length) jobs = jobs.filter((j) => ONLY.some((o) => j.id === o || j.rel.includes(o)));
if (ONLY_FAULTS) jobs = jobs.filter((j) => ONLY_FAULTS.includes(j.fault));
if (SAMPLE && SAMPLE < jobs.length) { const r = rng(SEED + '|sample'); jobs = pickN(r, jobs, SAMPLE).sort((a, b) => a.i - b.i); }
const T0 = Date.now();
const previous = [];   // --merge: results of the earlier run for the packages not in this run
if (MERGE && fs.existsSync(REPORT + '.json')) {
  let prevAll = [];
  try { prevAll = JSON.parse(fs.readFileSync(REPORT + '.json', 'utf8')).results || []; } catch (e) {}
  if (RESUME) { const done = new Set(prevAll.map((r) => r.pkg)); jobs = jobs.filter((j) => !done.has(j.id)); }
  const ids = new Set(jobs.map((j) => j.id));
  prevAll.forEach((r) => { if (!ids.has(r.pkg)) previous.push(r); });
}
console.log(`hadir matrix — ${files.length} packages found (${skipped.length} other files skipped), running ${jobs.length} × [${FLOWS.join(', ')}] with ${JOBS} workers, time ×${SCALE}`);
const RESULTS = [];
const queue = jobs.slice();
let doneN = 0;
async function worker(w) {
  const afaq = await startAfaq(process.env.AFAQ_PORT ? +process.env.AFAQ_PORT + w : 0);
  const extDir = prepareExtension(afaq.port, w);
  const W = { afaq, extDir };
  while (queue.length) {
    const job = queue.shift();
    const t0 = Date.now();
    const res = { pkg: job.id, file: job.rel, subject: job.subject, grade: job.grade, shift: job.shift, sessions: job.n, fault: job.fault, flows: [] };
    // a browser killed from outside (another test's pkill, a crash) is not an extension bug: the package is run once more
    const killed = (f) => f.checks.some((c) => !c.ok && /has been closed|Target crashed|browserContext\.|Protocol error|Execution context was destroyed|serviceworker/i.test(c.detail || ''));
    for (let round = 0; round < 2; round++) {
      res.flows = [];
      try {
        const J = setupJob(job);
        res.tree = { lessons: J.T.groups.length, renamed: [...J.T.renamed].map(([k, v]) => `${k.split('|')[1]} → ${v.text} (${v.how})`), shiftWeeks: job.shiftWeeks || 0 };
        if (FLOWS.includes('term')) res.flows.push(await flowTerm(job, J, W));
        if (FLOWS.includes('pick')) res.flows.push(await flowPick(job, J, W));
      } catch (e) {
        res.flows.push({ pkg: job.id, flow: 'setup', fault: job.fault, checks: [{ ok: false, name: 'harness: package set up', detail: String(e.stack || e) }], info: {}, secs: 0 });
      }
      if (!res.flows.some(killed)) break;
      res.retried = (res.retried || 0) + 1;
      console.log(`      (${job.id}: the browser died during the run — running the package again)`);
      await sleep(3000);
    }
    res.secs = Math.round((Date.now() - t0) / 1000);
    RESULTS.push(res);
    doneN++;
    const sum = res.flows.map((f) => `${f.flow} ${f.checks.filter((c) => !c.soft && c.ok).length}/${f.checks.filter((c) => !c.soft).length}`).join(' · ');
    const bad = res.flows.some((f) => failedChecks(f).length);
    console.log(`${bad ? 'FAIL' : 'PASS'} [${doneN}/${jobs.length}] ${job.id} (${job.shift}, ${job.n} sessions, fault=${job.fault}) ${sum} (${res.secs}s)`);
    if (bad) res.flows.forEach((f) => failedChecks(f).forEach((c) => console.log(`      ${f.flow}: ${c.name}${c.detail ? ' — ' + c.detail.split('\n')[0].slice(0, 160) : ''}`)));
    writeReport(false);
  }
  await afaq.close();
  if (!process.env.KEEP) fs.rmSync(extDir, { recursive: true, force: true });
}

function writeReport(final) {
  const secs = Math.round((Date.now() - T0) / 1000);
  const results = previous.concat(RESULTS);
  const all = results.flatMap((r) => r.flows);
  const nChecks = all.reduce((a, f) => a + f.checks.filter((c) => !c.soft).length, 0), nFail = all.reduce((a, f) => a + failedChecks(f).length, 0);
  const nNotes = all.reduce((a, f) => a + f.checks.filter((c) => !c.ok && c.soft).length, 0);
  const flowsFailed = all.filter((f) => failedChecks(f).length).length;
  const json = { at: new Date().toISOString(), final, secs, timeScale: SCALE, jobs: JOBS, seed: SEED, extension: JSON.parse(fs.readFileSync(path.join(EXT_SRC, 'manifest.json'), 'utf8')).version,
    packagesFound: files.length, skippedFiles: skipped, packagesRun: results.length, packagesPlanned: jobs.length + previous.length, merged: previous.length, flows: all.length, flowsFailed, checks: nChecks, checksFailed: nFail, notes: nNotes, results };
  fs.writeFileSync(REPORT + '.json', JSON.stringify(json, null, 1));
  const L = [];
  L.push('# Matrix report — «حاضر» × mock Noor', '');
  L.push(`${final ? 'Finished' : 'In progress'} ${json.at} · extension v${json.extension} · ${results.length}/${jobs.length + previous.length} packages · ${all.length} flows · ${nChecks} checks · **${nFail} failed checks** in ${flowsFailed} flows · ${nNotes} notes (soft checks) · ${Math.round(secs / 60)} min with ${JOBS} workers, timers ×${SCALE}`, '');
  L.push(`Command: \`node tests/noor-mock/matrix.mjs ${argv.join(' ')}\`${previous.length ? ` (merged with the previous report for ${previous.length} packages)` : ''} · packages from \`${PREPS}\` (${files.length} found; ${skipped.length} non-package files skipped)`, '');
  // per check
  const byCheck = new Map();
  all.forEach((f) => f.checks.forEach((c) => { const k = f.flow + ' · ' + c.name.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim(); const v = byCheck.get(k) || { pass: 0, fail: 0, pkgs: [] }; if (c.ok) v.pass++; else { v.fail++; v.pkgs.push(f.pkg); } byCheck.set(k, v); }));
  L.push('## Checks', '', 'Checks named «note — …» are soft: they are listed but never fail a flow.', '', '| flow · check | pass | fail | failing packages |', '|---|---:|---:|---|');
  [...byCheck].sort((a, b) => b[1].fail - a[1].fail).forEach(([k, v]) => L.push(`| ${k} | ${v.pass} | ${v.fail} | ${v.pkgs.slice(0, 12).join(', ')}${v.pkgs.length > 12 ? ` … (+${v.pkgs.length - 12})` : ''} |`));
  // per fault
  L.push('', '## By fault', '', '| fault | packages | flows failed (term) | flows failed (pick) |', '|---|---:|---:|---:|');
  FAULTS.forEach((ft) => { const rs = results.filter((r) => r.fault === ft); if (!rs.length) return; const ff = (fl) => rs.filter((r) => r.flows.some((f) => f.flow === fl && failedChecks(f).length)).length; L.push(`| ${ft} | ${rs.length} | ${ff('term')} | ${ff('pick')} |`); });
  // per package
  L.push('', '## Packages', '', '| package | file | shift | sessions | fault | term (pass/checks) | pick (pass/checks) | secs |', '|---|---|---|---:|---|---|---|---:|');
  results.slice().sort((a, b) => a.file.localeCompare(b.file)).forEach((r) => {
    const fl = (n) => { const f = r.flows.find((x) => x.flow === n); if (!f) return '-'; const hard = f.checks.filter((c) => !c.soft); const ok = hard.filter((c) => c.ok).length; const notes = f.checks.filter((c) => c.soft && !c.ok).length; return `${ok === hard.length ? '✓' : '✗'} ${ok}/${hard.length}${notes ? ` (${notes} note)` : ''}`; };
    L.push(`| ${r.pkg} | ${r.file} | ${r.shift} | ${r.sessions} | ${r.fault} | ${fl('term')} | ${fl('pick')} | ${r.secs} |`);
  });
  // failures
  L.push('', '## Failures', '');
  const fails = results.flatMap((r) => r.flows.filter((f) => failedChecks(f).length).map((f) => ({ r, f })));
  if (!fails.length) L.push('None.');
  fails.forEach(({ r, f }) => {
    L.push(`### ${r.pkg} — ${f.flow} (fault: ${r.fault}, ${r.sessions} sessions, ${r.shift})`, '');
    if (Object.keys(f.info || {}).length) L.push('```', JSON.stringify(f.info, null, 0).slice(0, 1500), '```');
    f.checks.filter((c) => !c.ok).forEach((c) => L.push(`- **${c.name}**${c.soft ? ' (note)' : ''}`, c.detail ? '  ```\n  ' + c.detail.split('\n').slice(0, 14).join('\n  ') + '\n  ```' : ''));
    if (f.log && f.log.length) L.push('  <details><summary>extension log (last lines)</summary>', '', '  ```', '  ' + f.log.slice(-25).join('\n  '), '  ```', '  </details>');
    if (f.posts && f.posts.length) L.push('  <details><summary>Noor POSTs</summary>', '', '  ```', '  ' + f.posts.slice(-40).join('\n  '), '  ```', '  </details>');
    L.push('');
  });
  if (skipped.length) L.push('## Skipped files', '', skipped.map((s) => `- ${s.file}: ${s.why}`).join('\n'), '');
  // hand-written analysis of the failures (extension bugs with code locations) kept beside the generated report
  const findings = path.join(HERE, 'matrix-findings.md');
  if (fs.existsSync(findings)) L.push('', fs.readFileSync(findings, 'utf8'));
  fs.writeFileSync(REPORT + '.md', L.join('\n'));
  return json;
}

await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, (_, w) => worker(w)));
const J = writeReport(true);
console.log(`\n=== Matrix: ${J.packagesRun} packages · ${J.flows} flows · ${J.checks} checks · ${J.checksFailed} failed (${J.flowsFailed} flows) · ${Math.round(J.secs / 60)} min`);
console.log(`report: ${path.relative(REPO, REPORT)}.md / .json`);
process.exit(J.checksFailed ? 1 : 0);
