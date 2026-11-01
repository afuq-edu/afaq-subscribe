// run.mjs — end-to-end harness for the «حاضر» extension against a mock Noor LMS + mock Afaq backend.
// Usage: node tests/noor-mock/run.mjs [scenario numbers…]   (default: all)   env: HEADFUL=1, KEEP=1 (keep temp dir), SHOTS=dir
// Exits non-zero if any assertion fails. Never modifies extension/ — it runs a temp copy with a mock afaq-config.js.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNoor, treeFromPackage } from './noor-mock.mjs';
import { startAfaq } from './afaq-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const PKG_FILE = process.env.PKG || '/mnt/project-files/afaq-platform/preps/bio-9-t1.json';
// EXT_DIR=<dir>: test another unpacked build (e.g. an unzipped release) instead of extension/ · AFAQ_PORT=<n>: mock Afaq port (default 8765)
const EXT_SRC = process.env.EXT_DIR ? path.resolve(process.env.EXT_DIR) : path.join(REPO, 'extension');
const AFAQ_PORT = Number(process.env.AFAQ_PORT) || 8765;
const SHOTS = process.env.SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// ---------- the extension under test: a temp copy with the mock backend config ----------
function prepareExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-noor-mock-'));
  fs.cpSync(EXT_SRC, dir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'afaq-config.mock.js'), path.join(dir, 'afaq-config.js'));
  if (AFAQ_PORT !== 8765) { const f = path.join(dir, 'afaq-config.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replaceAll('127.0.0.1:8765', '127.0.0.1:' + AFAQ_PORT)); }
  if (process.env.TRACE_SAVE) {   // diagnostics only: log what saveNow sees (in the temp copy, never in extension/)
    const f = path.join(dir, 'semester.js');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('const v = judgeSave(al, formUrl);', "const v = judgeSave(al, formUrl); logLine('info', 'TRACE saveNow navigated=' + navigated + ' v=' + v + ' al=' + JSON.stringify(al) + ' form=' + formUrl + ' err=' + await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', func: () => location.href }).then((r) => JSON.stringify(r)).catch((e) => String(e)));"));
  }
  return dir;
}

// ---------- package helpers ----------
const BASE = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
BASE.lessons.forEach((l) => { l.pubDate = l.pubDate || l.publishDate; });
let PKG, S;   // the package of the running scenario (usePkg)
function usePkg(p) { PKG = p; S = Object.fromEntries(PKG.lessons.map((l, i) => [l.id, Object.assign(l, { idx: i })])); return p; }
usePkg(BASE);
// a smaller synthetic package derived from the real one: keep some sessions, rename lessons, add sessions
function derivePkg({ keep, rename = {}, add = [] }) {
  const p = JSON.parse(JSON.stringify(BASE));
  p.lessons = p.lessons.filter((l) => keep.includes(l.id));
  p.lessons.forEach((l) => { if (rename[l.lesson]) l.lesson = rename[l.lesson]; });
  for (const a of add) { const i = p.lessons.findIndex((l) => l.id === a.after); p.lessons.splice(i + 1, 0, Object.assign(JSON.parse(JSON.stringify(BASE.lessons[0])), a.lesson)); }
  p.lessons.forEach((l) => { delete l.idx; });
  return p;
}
const groupOf = (l) => PKG.lessons.filter((x) => x.unit === l.unit && x.lesson === l.lesson);
const sessNo = (l) => groupOf(l).findIndex((x) => x.id === l.id) + 1;
const sid = (n) => 'bio-9-t1-' + String(n).padStart(3, '0');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => sid(a + i));
const nodeFor = (tree, l) => { for (const u of tree.terms[0].units) for (const n of u.lessons) if (u.text === l.unit && n.fileLesson === l.lesson) return { ...n, unit: u.text }; return null; };
const titleFor = (tree, l) => { const n = nodeFor(tree, l); const k = sessNo(l); return n.text + (k > 1 ? ` (${k})` : ''); };
// Noor adds « (j)» itself to the j-th prep of one lesson on one date: the tool then sends the bare name when j is the session number
// («X» → «X (2)»), else its own «(n)» stays and Noor's follows («X (5) (2)»)
const withDayRank = (want, base, j) => (!j || j < 2 ? want : want === `${base} (${j})` ? want : `${want} (${j})`);
const existingFor = (tree, ids, extra = {}) => ids.map((id) => ({ title: titleFor(tree, S[id]), publishDate: S[id].pubDate, nodeId: nodeFor(tree, S[id]).nodeId, ...extra }));
const CALM_BAD_RE = /خطأ|فشل|تعذّر|غير موجود|لم أستطع|✗/;
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// the teacher's class days as the tool takes them without a Noor timetable: the weekdays of the plan's dates
const classDaysOf = (pkg) => new Set(pkg.lessons.map((l) => l.pubDate || l.publishDate).filter(Boolean).map((d) => new Date(d + 'T12:00').getDay()));
const nextClassDays = (from, n, days) => { const out = []; for (let d = from; out.length < n;) { d = addDaysIso(d, 1); if (days.has(new Date(d + 'T12:00').getDay())) out.push(d); } return out; };
// the package's lessons in file order, each with its sessions (as the wizard groups them)
const lessonGroups = (p) => { const m = new Map(); p.lessons.forEach((l) => { const k = l.unit + '|' + l.lesson; if (!m.has(k)) m.set(k, { key: k, sessions: [] }); m.get(k).sessions.push(l); }); return [...m.values()]; };
const sessionOfRow = (r) => PKG.lessons.find((l) => norm(l.concepts) === norm(r.concepts)) || null;

// ---------- reporting ----------
const results = [];
let cur = null;
function check(ok, what, detail = '') {
  cur.checks.push({ ok: !!ok, what });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail ? '\n        ' + String(detail).replace(/\n/g, '\n        ') : ''}`);
  return !!ok;
}
const fmtRows = (rows) => rows.map((r) => { const l = sessionOfRow(r); return `#${r.post} ${l ? l.id.slice(-3) : '???'} «${r.title}» node=${r.nodeText} [${r.unit}] date=${r.publishDate}`; }).join('\n');

// ---------- common assertions on what Noor received ----------
function assertRows(name, rows, tree, { expectIds, dates, preexisting = [], sameDay = false }) {
  const unknown = rows.filter((r) => !sessionOfRow(r));
  check(!unknown.length, `${name}: every saved row carries the content of a session from the file`, fmtRows(unknown));
  const byId = new Map();
  rows.forEach((r) => { const l = sessionOfRow(r); if (l) byId.set(l.id, (byId.get(l.id) || []).concat(r)); });
  const dups = [...byId].filter(([, v]) => v.length > 1);
  check(!dups.length, `${name}: no session saved twice`, dups.map(([k, v]) => `${k}: ${v.length}×\n${fmtRows(v)}`).join('\n'));
  const titleDup = Object.entries(rows.concat(preexisting).reduce((m, r) => { const k = (r.lessonId || r.nodeId || '') + '|' + r.title; m[k] = (m[k] || 0) + 1; return m; }, {})).filter(([, n]) => n > 1);
  check(!titleDup.length, `${name}: no duplicate prep titles in the Noor list (per Noor lesson)`, titleDup.map(([t, n]) => `«${t}» ×${n}`).join('\n'));
  const pre = new Set(preexisting.map((r) => (r.nodeId || '') + '|' + r.title));
  const resaved = rows.filter((r) => pre.has(r.lessonId + '|' + r.title));
  check(!resaved.length, `${name}: nothing already in Noor was saved again`, fmtRows(resaved));
  if (expectIds) {
    const got = [...byId.keys()].sort(), want = expectIds.slice().sort();
    check(JSON.stringify(got) === JSON.stringify(want), `${name}: exactly the expected sessions were saved (${want.length})`,
      `missing: ${want.filter((x) => !got.includes(x)).join(', ') || '-'}\nextra: ${got.filter((x) => !want.includes(x)).join(', ') || '-'}`);
  }
  const wrong = rows.filter((r) => { const l = sessionOfRow(r); if (!l) return false; const n = nodeFor(tree, l); return !n || r.lessonId !== n.nodeId; });
  check(!wrong.length, `${name}: every session went into its own Noor lesson (tree node)`, wrong.map((r) => { const l = sessionOfRow(r); const n = l && nodeFor(tree, l); return `${l.id} «${l.lesson}» → saved in «${r.nodeText}» [${r.unit}] (expected «${n ? n.text : 'none'}» [${n ? n.unit : ''}])`; }).join('\n'));
  const wantTitle = (r, l) => withDayRank(titleFor(tree, l), nodeFor(tree, l).text, r.dayRank);
  const badTitle = rows.filter((r) => { const l = sessionOfRow(r); return l && nodeFor(tree, l) && r.title !== wantTitle(r, l); });
  check(!badTitle.length, `${name}: titles use the Noor lesson name + «(n)» for session n (Noor numbers a second prep of one lesson on one day)`, badTitle.map((r) => `${sessionOfRow(r).id}: «${r.title}» expected «${wantTitle(r, sessionOfRow(r))}»`).join('\n'));
  if (dates) {
    const off = rows.filter((r) => { const l = sessionOfRow(r); return l && dates[l.id] && r.publishDate !== dates[l.id]; });
    check(!off.length, `${name}: publish dates as expected`, off.map((r) => `${sessionOfRow(r).id}: got ${r.publishDate}, expected ${dates[sessionOfRow(r).id]}`).join('\n'));
  }
  // chronological: curriculum order ⇒ strictly increasing publish dates (new rows and rows that were already in Noor)
  const all = rows.map((r) => ({ l: sessionOfRow(r), d: r.publishDate })).filter((x) => x.l)
    .concat(preexisting.map((p) => ({ l: PKG.lessons.find((x) => x.pubDate === p.publishDate && titleFor(tree, x) === p.title), d: p.publishDate })).filter((x) => x.l));
  all.sort((a, b) => a.l.idx - b.l.idx);
  const flips = [];
  for (let i = 1; i < all.length; i++) if (!(all[i].d > all[i - 1].d || (sameDay && all[i].d === all[i - 1].d))) flips.push(`${all[i - 1].l.id}@${all[i - 1].d} then ${all[i].l.id}@${all[i].d}`);
  check(!flips.length, `${name}: dates follow curriculum order (no order flip${sameDay ? '' : ', no shared date'})`, flips.join('\n'));
  if (sameDay) {
    // a shared date only on different periods: no period of a section holds two preps
    const used = new Map(), clash = [];
    rows.forEach((r) => (r.slots || []).forEach((x) => { const k = r.publishDate + '|' + x; if (used.has(k)) clash.push(`${k}: ${used.get(k)} and ${sessionOfRow(r) && sessionOfRow(r).id}`); else used.set(k, sessionOfRow(r) && sessionOfRow(r).id); }));
    check(!clash.length, `${name}: one prep per period (no period used twice)`, clash.join('\n'));
  }
  const wkend = rows.filter((r) => [5, 6].includes(new Date(r.publishDate + 'T12:00').getDay()));
  check(!wkend.length, `${name}: no publish date on Friday/Saturday`, fmtRows(wkend));
}

// ---------- browser + wizard driving ----------
const FIXED_NOW = '2026-09-05';   // the wizard's «today» (?now=): the day before the plan starts, unless a scenario says otherwise
const GAMES = 'https://games.test/';   // homework files (five questions per lesson), served by launch()
// cont: Noor already holds preps of this subject made by an earlier «تحضير الفصل كاملًا» on this device (?cont=1, test only) —
// the run continues it; without it the tool refuses a full term over existing preps (owner 2026-11-01, scenario 20)
async function launch(extDir, noor, { now = FIXED_NOW, cont = noor.st.rows.some((r) => r.preexisting) } = {}) {
  const ctx = await chromium.launchPersistentContext('', {
    headless: !process.env.HEADFUL, executablePath: '/opt/pw-browsers/chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, ...(process.env.HEADFUL ? [] : ['--headless=new'])],
    viewport: { width: 1100, height: 900 },
  });
  await ctx.route('https://lms.moe.gov.om/**', (r) => noor.handle(r).catch((e) => { console.log('    route error', e.message); return r.abort().catch(() => {}); }));
  // homework files (?games=): <key>.json with five questions for every lesson of the running package (from a real file)
  await ctx.route(GAMES + '**', (r) => {
    const src = Object.values(JSON.parse(fs.readFileSync(path.join(REPO, 'site/homework/en-5.json'), 'utf8')).lessons);
    const lessons = Object.fromEntries(lessonGroups(PKG).map((g, i) => [g.sessions[0].lesson, src[i % src.length]]));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ key: 'test', lessons }) });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  await sleep(1500);
  for (const p of ctx.pages()) if (p.url().includes('semester.html')) await p.close().catch(() => {});   // the window opened on install
  const errs = [];
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(`chrome-extension://${id}/semester.html?debug=1&now=${now}${cont ? '&cont=1' : ''}&games=${encodeURIComponent(GAMES)}`);
  return { ctx, sw, pg, id, errs };
}
const card = async (pg, t) => { await pg.locator('.wz-card:not([disabled])', { hasText: t }).first().click({ timeout: 20000 }); await sleep(500); };
async function wizardTo(pg, mode, { name = true, grade = 'الصف التاسع', subject = 'الأحياء', shift = 'فترة واحدة', hw = false } = {}) {
  // each step only if the run has not started yet (once linked, a «من حسابك في نور» shortcut can skip steps)
  const started = () => pg.evaluate(() => document.body.classList.contains('wiz-run') || !!document.getElementById('wzName')).catch(() => false);
  const step = async (sel, t) => { if (await started()) return; await pg.locator(sel, { hasText: t }).first().click({ timeout: 20000 }); await sleep(600); };
  // «أضف واجبًا لكل درس» (4.10.24, ticked by default): the older scenarios run without homework
  if (!(await started())) await pg.evaluate((on) => { const c = document.getElementById('wzHw'); if (c && c.checked !== on) c.click(); }, !!hw).catch(() => {});
  await step('.wz-card:not([disabled])', mode === 'pick' ? 'أختار الدروس بنفسي' : mode === 'hw' ? 'الواجبات فقط' : 'تحضير الفصل كاملًا');
  await step('.wz-cards.grid3 .wz-card', grade);
  await step('.wz-card:not([disabled])', subject);
  await step('.wz-card:not([disabled])', shift);
  if (!name) return;
  await pg.fill('#wzName', 'سالم علي', { timeout: 15000 });
  await pg.click('#wzNameGo');
}
// «open the tool again»: reload semester.html (fresh local record, as on every open) and run the full term again
async function rerun(b, label, wz = {}) {
  await b.pg.reload();
  await sleep(4000);
  const wizShown = await b.pg.evaluate(() => !document.getElementById('wizCard').hidden && !document.body.classList.contains('wiz-run'));
  if (wizShown) await wizardTo(b.pg, 'term', { ...wz, name: false });   // already linked: no name screen
  else console.log('    (the page resumed an unfinished run by itself)');
  return waitDone(b.pg, 10 * 60000, label);
}
async function ui(pg) {
  return pg.evaluate(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
    const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
    return { head: t('nowHead'), text: t('nowText'), stop: vis('stopBtn'), again: vis('wzAgain'), wiz: vis('wizCard'), wzHead: t('wzHead'), wzBody: t('wzBody'), run: document.body.classList.contains('wiz-run') };
  });
}
// the full-term start summary (4.10.19): kept on the page object for the checks, then confirmed as a teacher does
async function confirmStart(pg) {
  const sm = await pg.evaluate(() => {
    const acts = document.getElementById('nowActs'), card = document.getElementById('nowCard');
    const go = acts && !acts.hidden && card && !card.hidden && !document.getElementById('nowBox').closest('[hidden]') && acts.querySelector('button[data-act="go"]');
    if (!go) return null;
    const r = { head: (document.getElementById('nowHead') || {}).textContent || '', text: (document.getElementById('nowText') || {}).innerText || '', go: go.textContent.trim(), pick: !!acts.querySelector('button[data-act="pick"]') };
    go.click();
    return r;
  }).catch(() => null);
  if (sm) { (pg.__summaries = pg.__summaries || []).push(sm); if (process.env.VERBOSE) console.log('    summary:', sm.head, '|', sm.text.replace(/\n/g, ' / ')); }
}
async function waitDone(pg, ms, label) {
  const end = Date.now() + ms;
  let last = '', stable = 0, s = null;
  while (Date.now() < end) {
    await confirmStart(pg);
    s = await ui(pg).catch(() => null);
    if (s) {
      const sig = JSON.stringify(s);
      if (sig !== last) { last = sig; stable = 0; if (process.env.VERBOSE) console.log('    ui:', s.head, '|', s.text.slice(0, 80)); } else stable++;
      const fin = (s.again && !s.stop && !/أكملها الآن|أكمل التحضير/.test(s.head)) || (s.wiz && /انتهت تجربتك|تفعيل اشتراكك/.test(s.wzHead));
      if (fin && stable >= 2) return s;
    }
    await sleep(1500);
  }
  console.log(`    (timeout waiting for ${label}; last ui: ${JSON.stringify(s)})`);
  return Object.assign(s || {}, { timeout: true });
}
async function dumpLog(pg) { return pg.evaluate(() => (window.__hadirSem ? window.__hadirSem.log : [])).catch(() => []); }

// ---------- scenarios ----------
const SC = {};
const T = (n, title, fn) => { SC[n] = { title, fn }; };

T(1, 'Full term, official dates, empty Noor', async (env) => {
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 25 * 60000, 'full term');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(rows.every((r) => r.cid === 'BIO9'), 'all saves in the right course card (الأحياء — التاسع)', rows.filter((r) => r.cid !== 'BIO9').map((r) => r.cid).join(','));
  assertRows('S1', rows, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  check(rows.every((r) => r.timeslots > 0 && r.objectives > 0 && r.global && r.semesterPlan), 'every row has classes, outcomes, «تعميم» and «خطة فصلية» checked');
  check(rows.every((r) => r.concepts && r.procedures), 'content (concepts / procedures) filled in every row');
  return b;
});

T(2, 'Noor rejects dates (used/holiday): at typing time and at save time', async (env) => {
  const tree = treeFromPackage(PKG);
  // empty Noor: since 4.10.20 a full term over another run's preps does not start, and lessons go period after period
  const pre = [];
  const noor = env.noor({ tree, existing: pre, rejectAtFill: ['2026-09-14'], rejectAtSave: ['2026-09-21'] });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 12 * 60000, 'term with rejected dates');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard finishes with success', `${s.head} | ${s.text}`);
  // period after period (Sun/Mon/Tue): 14/9 refused while typing and 21/9 refused at save are skipped, the rest follow in order
  const keep = Object.fromEntries(['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-13', '2026-09-15', '2026-09-20', '2026-09-22', '2026-09-27', '2026-09-28'].map((d, i) => [sid(i + 1), d]));
  assertRows('S2', rows, tree, { expectIds: range(1, 45), dates: keep, preexisting: pre });
  const d = (n) => (rows.find((r) => sessionOfRow(r) && sessionOfRow(r).id === sid(n)) || {}).publishDate;
  check(!rows.some((r) => r.publishDate === '2026-09-14' || r.publishDate === '2026-09-21'), 'nothing saved on the refused 14/9 and 21/9', fmtRows(rows));
  check(noor.st.posts.some((p) => p.date === '2026-09-21'), 'Noor refused one save on 21/9 (save-time refusal exercised)');
  console.log(`    observed moves: 005→${d(5)} 006→${d(6)} 008→${d(8)} 009→${d(9)}`);
  return b;
});

T(3, 'Noor already has some preps (incl. «(2)»/«(3)» suffixes): they are not re-saved', async (env) => {
  const tree = treeFromPackage(PKG);
  // the teacher entered the first ones late (created after their publish date) — a realistic Noor list
  const pre = existingFor(tree, [sid(1), sid(2), sid(4), sid(12)], { created: '2026-09-28 08:00' }).concat(existingFor(tree, range(18, 45)));
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 12 * 60000, 'term with existing preps');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard finishes with success', `${s.head} | ${s.text}`);
  const want = [3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17].map(sid);
  assertRows('S3', rows, tree, { expectIds: want, dates: Object.fromEntries(want.map((id) => [id, S[id].pubDate])), preexisting: pre });
  return b;
});

T(4, 'Save result unknown (form returned / connection drop / not saved): no duplicate rows', async (env) => {
  const tree = treeFromPackage(PKG);
  const pre = existingFor(tree, range(10, 45));
  // POST #2: saved but the form comes back with no message · #5: saved but connection reset · #7: NOT saved, form back with no message
  const noor = env.noor({ tree, existing: pre, ambiguous: { 2: 'form', 5: 'abort', 7: 'form-nosave' } });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 15 * 60000, 'term with unknown save results');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  console.log('    posts:', noor.st.posts.map((p) => `${p.n}:${p.outcome}`).join(' '));
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard finishes with success', `${s.head} | ${s.text}`);
  assertRows('S4', rows, tree, { expectIds: range(1, 9), dates: Object.fromEntries(range(1, 9).map((id) => [id, S[id].pubDate])), preexisting: pre });
  return b;
});

T(5, 'Pick mode: chosen lessons/sessions on chosen dates', async (env) => {
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'pick');
  await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
  // typed dates on the teacher's class days (the mock's periods = Sun/Mon/Tue); a typed day without a period is moved (scenario 20)
  const want = { [sid(9)]: '2026-10-27', [sid(10)]: '2026-11-02', [sid(12)]: '2026-11-03' };
  const keyOf = (l) => l.unit + '|' + l.lesson;
  const clickK = (k) => b.pg.evaluate((k) => { const cb = [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k); cb.click(); }, k);
  await clickK(keyOf(S[sid(9)])); await sleep(400);
  await clickK(keyOf(S[sid(10)])); await sleep(400);
  await b.pg.evaluate((id) => document.querySelector(`input[data-s="${id}"]`).click(), sid(11)); await sleep(400);   // drop session 2 of «الانتشار»
  for (const [id, d] of Object.entries(want)) {
    await b.pg.evaluate(([id, d]) => { const el = document.querySelector(`input[data-d="${id}"]`); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, d]);
  }
  await sleep(300);
  const shown = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.dataset.d + '=' + x.value));
  check(shown.length === 3, `lessons screen holds exactly 3 dated sessions (${shown.join(', ')})`);
  await b.pg.click('#wzLessGo');
  const s = await waitDone(b.pg, 8 * 60000, 'pick mode');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard finishes with success', `${s.head} | ${s.text}`);
  assertRows('S5', rows, tree, { expectIds: Object.keys(want), dates: want });
  return b;
});

T(6, 'Noor tree: duplicate lesson names in other units + one renamed lesson', async (env) => {
  const tree = treeFromPackage(PKG, {
    rename: { '3-1 مم يتكون جسمك؟': 'مكونات جسم الإنسان' },
    extra: [{ unit: 'الوحدة الرابعة: التغذية في الإنسان', text: 'الانتشار', at: 0 }, { unit: 'الوحدة الأولى: الخلايا', text: 'الأسموزية', at: 3 }],
  });
  const todo = range(10, 18);
  const pre = existingFor(tree, PKG.lessons.map((l) => l.id).filter((id) => !todo.includes(id)));
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 12 * 60000, 'tree with duplicates');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  const decoys = new Set(tree.terms[0].units.flatMap((u) => u.lessons.filter((l) => l.decoy).map((l) => l.nodeId)));
  check(!rows.some((r) => decoys.has(r.lessonId)), 'nothing saved into the same-named decoy lessons of other units', fmtRows(rows.filter((r) => decoys.has(r.lessonId))));
  const r18 = rows.filter((r) => sessionOfRow(r) && sessionOfRow(r).id === sid(18));
  console.log(`    renamed lesson «3-1 مم يتكون جسمك؟» → ${r18.length ? 'saved into «' + r18[0].nodeText + '»' : 'skipped (not linked)'}`);
  check(/تمت التعبئة بنجاح|نُشر/.test(s.head), 'wizard finishes', `${s.head} | ${s.text}`);
  assertRows('S6', rows, tree, { expectIds: r18.length ? todo : range(10, 17), dates: Object.fromEntries(todo.map((id) => [id, S[id].pubDate])), preexisting: pre });
  return b;
});

T(7, 'No free trial (owner 2026-11-01): a new teacher\'s request waits for the admin — nothing is saved, the activation screen asks to contact the admin; after activation the full term starts by itself', async (env) => {
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, trialLeft: 3 });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 6 * 60000, 'waiting for activation');
  check(s.wiz && /تفعيل اشتراكك/.test(s.wzHead), 'activation screen «تفعيل اشتراكك» is shown at once', JSON.stringify(s));
  check(noor.st.rows.filter((r) => !r.preexisting).length === 0, 'nothing saved before the admin activates (no free sessions)', fmtRows(noor.st.rows));
  check(env.afaq.st.left === 3, `no trial session was used (left ${env.afaq.st.left})`);
  check(env.afaq.st.calls.includes('ext_contact'), 'request marked «بانتظار التفعيل» (ext_contact called)');
  check(s.wiz && /يكمل التحضير وحده/.test(s.wzBody || s.text || ''), 'the screen says the preparation starts by itself after activation', JSON.stringify(s));
  check(s.wiz && !/مجان|تجرب/.test((s.wzHead || '') + (s.wzBody || '')), 'no free-trial wording', JSON.stringify(s));
  // the admin activates the request: the run starts by itself (no button), with the same choices
  env.afaq.st.active = true; env.afaq.st.status = 'active';
  const t0 = Date.now();
  let left = null;
  while (Date.now() - t0 < 90000) { const u = await ui(b.pg).catch(() => null); if (u && !(u.wiz && /تفعيل اشتراكك/.test(u.wzHead))) { left = u; break; } await sleep(1500); }
  check(!!left, 'activation is picked up without any click (the screen closes by itself)');
  const s2 = await waitDone(b.pg, 10 * 60000, 'after activation');
  check(/تمت التعبئة بنجاح|نُشر/.test(s2.head), 'run finishes after activation', `${s2.head} | ${s2.text}`);
  const rows2 = noor.st.rows.filter((r) => !r.preexisting);
  assertRows('S7', rows2, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  return b;
});

T(8, 'Lesson names ending in «(1)»/«(2)» («الجمع (1)», «الجمع (2)»); a re-run adds nothing', async (env) => {
  usePkg(derivePkg({ keep: range(1, 9), rename: { '1-1 خصائص الكائنات الحية': 'الجمع (1)', '1-2 الخلايا': 'الجمع (2)' } }));
  const tree = treeFromPackage(PKG, { keepNumbers: true });
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 10 * 60000, 'first run');
  check(/تمت التعبئة بنجاح/.test(s.head), 'first run finishes with success', `${s.head} | ${s.text}`);
  const dates = Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate]));
  assertRows('S8 run 1', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: range(1, 9), dates });
  const n1 = noor.st.rows.length;
  const s2 = await rerun(b, 'second run');
  console.log(`    second run: ${s2.head} | ${s2.text}`);
  check(noor.st.rows.length === n1, `second run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  assertRows('S8 after re-run', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: range(1, 9), dates });
  return b;
});

T(9, 'Same lesson name in two units: unit 1 is in Noor, unit 2 still filled once; a re-run adds nothing', async (env) => {
  const rev = (n, after, date) => ({ after, lesson: { id: 'rev-' + n, unit: n === 1 ? 'الوحدة الأولى: الخلايا' : 'الوحدة الثانية: انتقال المواد من الخلايا وإليها', lesson: 'مراجعة الوحدة',
    title: 'الحصة الأولى: مراجعة الوحدة ' + n, publishDate: date, pubDate: date, concepts: 'مفاهيم مراجعة الوحدة رقم ' + n } });
  // review sessions dated right after the unit's last session (prep files fill each week from Sunday without gaps; the
  // week's sessions go on the teacher's first free periods of that week)
  usePkg(derivePkg({ keep: range(1, 17), add: [rev(1, sid(9), '2026-09-23'), rev(2, sid(17), '2026-10-13')] }));
  const tree = treeFromPackage(PKG);
  const pre = existingFor(tree, PKG.lessons.map((l) => l.id).filter((id) => id !== 'rev-2' && id !== sid(16) && id !== sid(17)));
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 10 * 60000, 'first run');
  check(/تمت التعبئة بنجاح/.test(s.head), 'first run finishes with success', `${s.head} | ${s.text}`);
  const want = [sid(16), sid(17), 'rev-2'];
  // the teacher's own earlier term run (4.10.23): what is left follows the last prep already in Noor, period after period
  // on the class days — a free period before it never takes a later lesson
  const nd = nextClassDays(pre.map((x) => x.publishDate).sort().pop(), want.length, classDaysOf(PKG));
  const dates = Object.fromEntries(want.map((id, i) => [id, nd[i]]));
  assertRows('S9 run 1', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: want, dates, preexisting: pre });
  const n1 = noor.st.rows.length;
  const s2 = await rerun(b, 'second run');
  console.log(`    second run: ${s2.head} | ${s2.text}`);
  check(noor.st.rows.length === n1, `second run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

T(10, 'Empty course, first save response lost (connection drop after the click): no duplicate, also after the auto re-run and a manual re-run', async (env) => {
  usePkg(derivePkg({ keep: range(1, 9) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree, ambiguous: { 1: 'abort' } });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 10 * 60000, 'first run (+auto re-run)');
  console.log(`    first run: ${s.head} | ${s.text}`);
  console.log('    posts:', noor.st.posts.map((p) => `${p.n}:${p.outcome}`).join(' '));
  const dates = Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate]));
  assertRows('S10 run 1', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: range(1, 9), dates });
  const n1 = noor.st.rows.length;
  const s2 = await rerun(b, 'manual re-run');
  console.log(`    re-run: ${s2.head} | ${s2.text}`);
  check(noor.st.rows.length === n1, `manual re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

// sections with different periods on a day (owner 2026-11-01, «تسلسل لكل شعبة»): each section takes the lessons in order on its
// OWN periods, period after period from the first school day; one prep holds the sections that reached the same session on
// the same day. Checks, per section: every session once, in order, on exactly the next periods of its timetable; no period
// used twice; no prep on a day without a period of its sections
function checkPerSection(name, rows, periods) {
  const secOfSlot = (x) => String(x).split('|')[0];
  const sessOf = (r) => PKG.lessons.find((l) => norm(r.concepts).includes(norm(l.concepts)));
  const secs = [...new Set(Object.values(periods).flatMap((v) => v.map(([sec]) => sec)))].sort();
  const day1 = PKG.lessons.map((l) => l.pubDate).sort()[0];
  const want = (sec, n) => { const out = []; for (let d = day1; out.length < n; d = addDaysIso(d, 1)) { const wd = new Date(d + 'T12:00').getDay(); const c = (periods[wd] || []).filter(([x]) => x === sec).reduce((a, [, k]) => a + k, 0); for (let i = 0; i < c && out.length < n; i++) out.push(d); } return out; };
  const bad = [], orphan = rows.filter((r) => !sessOf(r));
  check(!orphan.length, `${name}: every prep carries a session of the plan`, orphan.map((r) => r.title).join(' | '));
  for (const sec of secs) {
    const mine = rows.filter((r) => (r.slots || []).some((x) => secOfSlot(x) === sec)).map((r) => ({ r, l: sessOf(r) })).filter((x) => x.l);
    const ids = mine.map((x) => x.l.id);
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    const missing = PKG.lessons.filter((l) => !ids.includes(l.id)).map((l) => l.id);
    if (dupIds.length || missing.length) bad.push(`section ${sec}: missing ${missing.join(',')} twice ${dupIds.join(',')}`);
    const ord = mine.slice().sort((x, y) => x.l.idx - y.l.idx).map((x) => x.r.publishDate);
    const exp = want(sec, ord.length);
    if (JSON.stringify(ord) !== JSON.stringify(exp)) bad.push(`section ${sec}: got ${ord.join(' ')}\n  want ${exp.join(' ')}`);
  }
  check(!bad.length, `${name}: every section gets every session once, in order, on exactly its next periods (${secs.join(', ')})`, bad.join('\n'));
  const seen = new Map(), clash = [];
  rows.forEach((r) => (r.slots || []).forEach((x) => { const k = r.publishDate + '|' + x; if (seen.has(k)) clash.push(k); seen.set(k, 1); }));
  check(!clash.length, `${name}: no period holds two preps`, clash.join(', '));
  check(rows.every((r) => !r.sectionOnly && (r.slots || []).length), `${name}: every prep on a period (no section-only prep)`, rows.filter((r) => r.sectionOnly).map((r) => r.publishDate).join(', '));
  const byKey = rows.reduce((m, r) => { const l = sessOf(r); if (l) { const k = l.id + '|' + r.publishDate; m[k] = (m[k] || 0) + 1; } return m; }, {});
  check(Object.values(byKey).every((n) => n === 1), `${name}: one prep per session and day (sections that reached it together share it)`, JSON.stringify(Object.entries(byKey).filter(([, n]) => n > 1)));
}

// two periods of the same section on one day (real Noor 2026-10-24: «تقنية المعلومات - التاسع - 1 -  الحصة 7» and «… الحصة 8»;
// a period that already has a prep on that date is disabled, or hidden). Timetable: Sun section 1 ×2 + section 2 ×1 · Tue both ×1 ·
// Wed section 1 ×1 · Mon/Thu none — section 1 has 4 periods a week, section 2 two: each goes its own pace
for (const [n, mode] of [[11, 'disable'], [12, 'hide']]) T(n, `Sections with different periods (section 1 twice on Sunday and on Wednesday, section 2 once; taken period ${mode === 'disable' ? 'disabled' : 'hidden'}): each section takes the lessons in order on its own periods, no duplicates`, async (env) => {
  usePkg(derivePkg({ keep: range(1, 18) }));
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['1', 2], ['2', 1]], 1: [], 2: [['1', 1], ['2', 1]], 3: [['1', 1]], 4: [] };
  const noor = env.noor({ tree, periods, takenSlots: mode });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 30 * 60000, 'per-section term');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  checkPerSection(`S${n}`, rows, periods);
  check(!noor.st.posts.some((p) => /date-dup/.test(p.outcome || '')), 'Noor never refused a save as a duplicate period', noor.st.posts.filter((p) => /dup/.test(p.outcome || '')).map((p) => p.date).join(', '));
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run');
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

// real Noor 2026-10-25 (owner's page): every period box sits inside ONE big <label> around the whole list, so the nearest
// label of a box holds the text of all four periods. Timetable: Sun section 4 ×2 + sections 5 and 6 ×1 · Tue sections 4, 5, 6 ×1
T(17, 'Three sections, section 4 twice on Sunday (real Noor wraps all period boxes in one label): each section on its own periods in order — sections 5 and 6 share their preps, section 4 goes faster', async (env) => {
  usePkg(derivePkg({ keep: range(1, 18) }));
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['4', 2], ['5', 1], ['6', 1]], 1: [], 2: [['4', 1], ['5', 1], ['6', 1]], 3: [], 4: [] };
  const noor = env.noor({ tree, periods, takenSlots: 'disable' });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 30 * 60000, 'three sections term');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  checkPerSection('S17', rows, periods);
  const secs = (r) => [...new Set((r.slots || []).map((x) => String(x).split('|')[0]))].sort().join(',');
  check(rows.every((r) => secs(r) !== '5' && secs(r) !== '6'), 'sections 5 and 6 (same periods) always share a prep', rows.filter((r) => secs(r) === '5' || secs(r) === '6').map((r) => r.publishDate + ' ' + secs(r)).join(', '));
  check(!noor.st.posts.some((p) => /date-dup/.test(p.outcome || '')), 'Noor never refused a save as a duplicate period');
  return b;
});

for (const [n, left] of [[13, 0], [14, 2]]) T(n, `Reinstall: a new trial request (${left} free sessions left) on the Noor account of a paid subscriber with the same name → the subscription comes back by itself, the whole term is filled, no pay screen`, async (env) => {
  usePkg(derivePkg({ keep: range(1, 9) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, trialLeft: left, mergeOnNoor: true });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 10 * 60000, 'reinstall reclaim');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح» (not the pay screen)', `${s.head} | ${s.wzHead || ''} | ${s.text}`);
  check(env.afaq.st.merged >= 1, 'the server merged this device back into the subscription (ext_noor → merged)', env.afaq.st.calls.join(' '));
  check(!env.afaq.st.calls.includes('ext_contact'), 'no activation request was sent (ext_contact not called)');
  check(env.afaq.st.left === left, `no free trial session was used (left ${left} → ${env.afaq.st.left})`);
  assertRows(`S${n}`, rows, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  return b;
});

T(15, 'Fewer periods than the plan (2 a week for 3 sessions a week): every session gets its own prep on the teacher\'s periods, in order, going on past the plan\'s last week while the term has room (nothing shared), a re-run adds nothing', async (env) => {
  usePkg(derivePkg({ keep: range(1, 18) }));
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['1', 1], ['2', 1]], 1: [], 2: [['1', 1], ['2', 1]], 3: [], 4: [] };
  const noor = env.noor({ tree, periods });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'fewer periods');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const sums = b.pg.__summaries || [];
  check(sums.length === 2 && sums.every((x) => x.pick) && /تأكد أنه لا توجد عندك/.test(sums[0].text) && /أول يوم دراسي/.test(sums[1].text) && /أنشر ١٨ تحضيرًا/.test(sums[1].text), 'two calm start alerts, confirmed once each («تأكد أنه لا توجد عندك…», then «ستبدأ التحاضير من … أول يوم دراسي … أنشر ١٨ تحضيرًا», both with «أختار الدروس بنفسي»)', JSON.stringify(sums));
  check(rows.length === PKG.lessons.length, `one prep per session (${rows.length} preps for ${PKG.lessons.length} sessions)`, rows.map((r) => r.title).join(' | '));
  check(rows.every((r) => !/\(\d+(?: و \d+)+\)$/.test(r.title)), 'no shared prep «(n و m)» while the term has periods left', rows.map((r) => r.title).join(' | '));
  check(rows.every((r) => r.publishDate <= '2027-01-21'), 'nothing after the term end (21 January)', rows.filter((r) => r.publishDate > '2027-01-21').map((r) => r.publishDate).join(', '));
  check(rows.every((r) => [0, 2].includes(new Date(r.publishDate + 'T12:00').getDay())), 'every prep on a day with periods (Sun/Tue)', rows.map((r) => r.publishDate).join(', '));
  const order = PKG.lessons.map((l) => { const r = rows.find((x) => norm(x.concepts).includes(norm(l.concepts))); return r ? r.publishDate : ''; });
  check(order.every((d, i) => d && (!i || d > order[i - 1])), 'the sessions follow the plan order, one period after another', order.join(', '));
  const byDay = rows.reduce((m, r) => { m[r.publishDate] = (m[r.publishDate] || 0) + 1; return m; }, {});
  check(Object.values(byDay).every((n) => n === 1), 'one prep per day (one period per section)', JSON.stringify(byDay));
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run');
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

T(16, 'Late start (today 6 December) on a Noor that REFUSES past dates: the full term starts on the first school day or not at all — Noor refuses the first date once, nothing is saved, and the teacher is calmly sent to «أختار الدروس بنفسي»', async (env) => {
  usePkg(derivePkg({ keep: range(1, 30) }));
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['1', 1], ['2', 1]], 1: [], 2: [['1', 1], ['2', 1]], 3: [], 4: [] };
  const today = '2026-12-06';
  const noor = env.noor({ tree, periods, noPast: today });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: today });
  await wizardTo(b.pg, 'term');
  // the two start alerts, then the calm stop card after Noor refuses the first (past) date
  let stop = null;
  for (let i = 0; i < 400 && !stop; i++) {
    await confirmStart(b.pg);
    stop = await b.pg.evaluate(() => { const a = document.getElementById('nowActs'), c = document.getElementById('nowCard'); const p = a && !a.hidden && c && !c.hidden && a.querySelector('button[data-act="pick"]'); return p && !a.querySelector('button[data-act="go"]') ? { head: document.getElementById('nowHead').textContent, text: document.getElementById('nowText').innerText } : null; }).catch(() => null);
    if (!stop) await sleep(1000);
  }
  const sums = b.pg.__summaries || [];
  check(sums.length === 2 && /أول يوم دراسي/.test(sums[1].text), 'two start alerts; the second says the preps start on the first school day', JSON.stringify(sums));
  check(!!stop && /تاريخ مضى/.test(stop.text) && /أول يوم دراسي/.test(stop.text), 'after Noor refuses the past date: one calm card that sends the teacher to «أختار الدروس بنفسي»', JSON.stringify(stop));
  check(!!stop && !/خطأ|فشل|تعذّر|غير موجود|ناقص|مشكلة/.test(stop.head + stop.text), 'no error wording', JSON.stringify(stop));
  const refused = noor.st.posts.filter((x) => x.outcome === 'date-past').length;
  check(refused === 1, `Noor was asked for a past date once only (${refused})`, '');
  check(noor.st.rows.filter((r) => !r.preexisting).length === 0, 'nothing saved: no prep out of the plan dates', fmtRows(noor.st.rows));
  if (stop) {
    await b.pg.evaluate(() => document.querySelector('#nowActs button[data-act="pick"]').click());
    const onLessons = await b.pg.waitForSelector('input[data-k]', { timeout: 60000 }).then(() => true).catch(() => false);
    check(onLessons, '«أختار الدروس بنفسي» opens the lessons screen of the same subject', '');
  }
  return b;
});

T(20, 'Noor already has preps of this subject (lessons 1–2 and 5–6 done, 3–4 not, today mid-October): the full term does not start; one calm card counts what is in Noor and offers only «أختار الدروس بنفسي», which opens the lessons screen with nothing saved', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const g = lessonGroups(PKG);
  const doneIds = [0, 1, 4, 5].flatMap((k) => g[k].sessions.map((l) => l.id));
  const pre = existingFor(tree, doneIds);
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-10-11', cont: false });
  await wizardTo(b.pg, 'term');
  // wait for the summary and read it without confirming
  let sm = null;
  for (let i = 0; i < 240 && !sm; i++) {
    sm = await b.pg.evaluate(() => { const a = document.getElementById('nowActs'); const p = a && !a.hidden && a.querySelector('button[data-act="pick"]'); return p ? { head: document.getElementById('nowHead').textContent, text: document.getElementById('nowText').innerText, primary: p.classList.contains('primary'), go: !!a.querySelector('button[data-act="go"]') } : null; }).catch(() => null);
    if (!sm) await sleep(1000);
  }
  check(!!sm, 'the term run stops on a start summary before any prep', '');
  if (sm) {
    check(new RegExp(`وجدت في نور ${toAr(doneIds.length)}`).test(sm.text), `the summary counts the ${doneIds.length} preps already in Noor`, sm.text);
    check(/اختر الدروس التي تريدها بنفسك/.test(sm.text) && sm.primary && !sm.go, 'it calmly offers only «أختار الدروس بنفسي» (no way to start the full term)', JSON.stringify(sm));
    check(!/خطأ|فشل|تعذّر|غير موجود|ناقص|مشكلة/.test(sm.head + sm.text), 'no error wording', sm.head + ' | ' + sm.text);
  }
  check(noor.st.rows.filter((r) => !r.preexisting).length === 0, 'nothing saved before the teacher answers', '');
  await b.pg.evaluate(() => document.querySelector('#nowActs button[data-act="pick"]').click());
  await sleep(3000);
  const onLessons = await b.pg.waitForSelector('input[data-k]', { timeout: 30000 }).then(() => true).catch(() => false);
  check(onLessons, '«أختار الدروس بنفسي» opens the lessons screen of the same subject', '');
  check(noor.st.rows.filter((r) => !r.preexisting).length === 0, 'still nothing saved', '');
  // pick mode: one typed date gives the next chosen sessions consecutive class days (only the chosen ones)
  if (onLessons) {
    const keyOf = (l) => l.unit + '|' + l.lesson;
    await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k).click(), keyOf(g[2].sessions[0])); await sleep(400);
    await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k).click(), keyOf(g[3].sessions[0])); await sleep(400);
    const ids = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.dataset.d));
    const empty0 = await b.pg.$$eval('input[data-d]', (a) => a.every((x) => !x.value));
    check(empty0, 'the date boxes start empty (no suggested date)', '');
    // a day after every prep already in Noor (one period a day: a day holding a prep has no free period left)
    let d0 = addDaysIso(pre.map((x) => x.publishDate).sort().pop(), 1); while (new Date(d0 + 'T12:00').getDay() > 4) d0 = addDaysIso(d0, 1);
    await b.pg.evaluate(([id, d]) => { const el = document.querySelector(`input[data-d="${id}"]`); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); }, [ids[0], d0]);
    await sleep(300);
    const vals = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.value));
    const want = []; for (let d = d0; want.length < ids.length; d = addDaysIso(d, 1)) if (new Date(d + 'T12:00').getDay() <= 4) want.push(d);
    check(JSON.stringify(vals) === JSON.stringify(want), `one typed date fills the other ${ids.length - 1} chosen sessions with the next class days`, `got ${vals.join(', ')}\nwant ${want.join(', ')}`);
    const others = await b.pg.$$eval('input[data-d]', (a) => a.length);
    check(others === ids.length, 'only the chosen lessons have date boxes', String(others));
    await b.pg.click('#wzLessGo');
    const s = await waitDone(b.pg, 10 * 60000, 'pick after advice');
    const rows = noor.st.rows.filter((r) => !r.preexisting);
    check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
    // saved on the teacher's real periods (the mock's class days = the plan's weekdays): a derived date with no period moves
    // to the next period and the chosen sessions after it follow in order (no session jumps past a later one)
    const wds = new Set(PKG.lessons.map((l) => new Date(l.pubDate + 'T12:00').getDay()));
    const wantP = []; for (let d = d0; wantP.length < ids.length; d = addDaysIso(d, 1)) if (wds.has(new Date(d + 'T12:00').getDay())) wantP.push(d);
    const order = PKG.lessons.map((l) => l.id);
    const got = rows.slice().sort((x, y) => order.indexOf(sessionOfRow(x).id) - order.indexOf(sessionOfRow(y).id)).map((r) => r.publishDate);
    check(rows.length === ids.length && JSON.stringify(got) === JSON.stringify(wantP), 'the chosen sessions are saved in order on the next class periods from the typed date', `got ${got.join(', ')}\nwant ${wantP.join(', ')}`);
    check(!(b.pg.__summaries || []).length, 'pick mode asks nothing before saving', JSON.stringify(b.pg.__summaries || []));
  }
  return b;
});

T(21, 'Late start on a Noor that accepts past dates (today 1 November, empty Noor): after the two start alerts every session is published on its plan date from the first school day (6 September), in order, one prep per session; a re-run adds nothing', async (env) => {
  usePkg(derivePkg({ keep: range(1, 18) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-11-01' });
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'late start, past dates accepted');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const sums = b.pg.__summaries || [];
  check(sums.length === 2 && /تأكد أنه لا توجد عندك/.test(sums[0].text) && /أول يوم دراسي/.test(sums[1].text) && /اختيار الدروس بنفسك أفضل/.test(sums[1].text), 'alert 1: make sure there are no earlier preps; alert 2: the preps start on the first school day, else picking is better', JSON.stringify(sums));
  check(sums.every((x) => x.pick && !/خطأ|فشل|تعذّر|غير موجود|ناقص|مشكلة/.test(x.head + x.text)), 'both alerts are calm and offer «أختار الدروس بنفسي»', JSON.stringify(sums));
  assertRows('S21', rows, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run');
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

T(18, 'Slow Noor tree on a new device (only the first unit shows lessons): the tool takes the same subject\'s tree saved on the site from other teachers, and every session still gets its prep', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const t1 = tree.terms[0];
  check(t1.units.length > 1, `the package spans more than one unit (${t1.units.length})`);
  const noor = env.noor({ tree, partialForms: 1 });
  env.afaq.reset({ pkg: PKG, serverTree: t1.units.flatMap((u) => u.lessons.map((l) => ({ u: u.text, t: l.text }))) });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'slow tree');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(noor.st.formRenders >= 2 && env.afaq.st.calls.includes('ext_tree_get'), `the first tree read was partial and the site tree was asked for (form pages ${noor.st.formRenders})`, env.afaq.st.calls.join(','));
  assertRows('S18', rows, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  check(!env.afaq.st.trees.length, 'the site tree is not sent back to the site as if read from Noor', JSON.stringify(env.afaq.st.trees.map((t) => t.lessons.length)));
  return b;
});

// real Noor 2026-10-27 (owner's report, Islamic grade 6 «فترتان», tree read from Noor): units «الوحدة (1)…(4)» where the file says
// «الوحدة الأولى…الرابعة», and the recitation unit is ONE Noor lesson «سورتي المدثر والمزمل» for the file's two surahs.
// 4.10.13 saved only the 8 «المدثر» sessions (every other lesson linked «by unit number only» and dropped). Start from that state.
const IS6_TREE = [['مقرر التلاوة والحفظ', ['سورتي المدثر والمزمل']],
  ['الوحدة (1)', ['مخارج الحروف', 'سورة البقرة (183 - 185', 'ثواب العمل الصالح (حديث)', 'من دلائل وحدانية الله تعالى', 'أنواع الصيام', 'التخطيط للهجرة النبوية', 'من آداب الأسواق']],
  ['الوحدة (2)', ['مقدمة في أحكام النون الساكنة والتنوين', 'سورة المدثر 11 -27', 'أترك ما لا يعنيني (حديث)', 'معجزات الرسل عليهم السلام', 'زكاة الفطر', 'الهجرة المباركة', 'الاعتدال منهجي في الحياة']],
  ['الوحدة (3)', ['الإظهار الحلقي في أحكام النون الساكنة والتنوين', 'سورة الحجرات ( 10 -13 )', 'من فضائل الأعمال ( حديث)', 'الله الحليم', 'من أحكام صلاة الجمعة', 'بناء المسجد', 'ألتزم الحق']],
  ['الوحدة (4)', ['الإدغام في النون الساكنة والتنوين', 'سورة المزمل (20)', 'هجر المسلم حرام (حديث)', 'القرأن الكريم معجزة خالدة', 'الإستدراك في الصلاة', 'الصحابي عبدالله بن عمر رضي الله عنه']]];
T(19, 'Real Noor tree of Islamic grade 6: units «الوحدة (1)» vs the file\'s «الوحدة الأولى», and one Noor lesson for the two recitation surahs — every lesson of the term gets its preps (8 recitation preps already in Noor from 4.10.13)', async (env) => {
  const file = JSON.parse(fs.readFileSync('/mnt/project-files/afaq-platform/preps/g6-10/is-6-2-t1.json', 'utf8'));
  // sessions of one lesson share their «المفاهيم» in this file: tag each so a saved row maps back to ITS session
  file.lessons.forEach((l) => { l.pubDate = l.pubDate || l.publishDate; l.concepts = `${l.concepts || ''} (${l.id})`; });
  usePkg(file);
  // file units in order ↔ Noor units in order; lessons by position inside the unit; the recitation unit's lessons all on its one Noor lesson
  const fUnits = [];
  PKG.lessons.forEach((l) => { let u = fUnits.find((x) => x.name === l.unit); if (!u) fUnits.push(u = { name: l.unit, lessons: [] }); if (!u.lessons.includes(l.lesson)) u.lessons.push(l.lesson); });
  check(fUnits.length === IS6_TREE.length && fUnits.every((u, i) => i === 0 || u.lessons.length === IS6_TREE[i][1].length), 'the file\'s units line up with the real Noor tree', fUnits.map((u) => `${u.name}:${u.lessons.length}`).join(' | '));
  let nid = 5000;
  const units = IS6_TREE.map(([text, ls], ui) => ({ text, lessons: ls.map((t, k) => ({ text: t, nodeId: String(++nid), fileLesson: ui === 0 ? null : fUnits[ui].lessons[k] })) }));
  const tree = { book: 'التربية الإسلامية - الصف السادس', terms: [{ text: 'الفصل الدراسي الأول', units }, { text: 'الفصل الدراسي الثاني', units: [{ text: 'الوحدة (5)', lessons: [{ text: 'مخارج الحروف', nodeId: '7001' }] }] }] };
  const recite = units[0].lessons[0];
  const nodeOfL = (l) => (l.unit === fUnits[0].name ? recite : units.flatMap((u) => u.lessons).find((n) => n.fileLesson === l.lesson && units.find((u) => u.lessons.includes(n)).text === units[fUnits.findIndex((u) => u.name === l.unit)].text));
  const reciteSes = PKG.lessons.filter((l) => l.unit === fUnits[0].name);
  const titleOfL = (l) => { const n = nodeOfL(l); const list = n === recite ? reciteSes : PKG.lessons.filter((x) => x.unit === l.unit && x.lesson === l.lesson); const k = list.indexOf(l) + 1; return n.text + (k > 1 ? ` (${k})` : ''); };
  // the teacher's own earlier full-term run (4.10.20+): its first 8 preps (the recitation lesson, first in the Noor tree) on the
  // first 8 class periods from the first school day
  const days = classDaysOf(PKG);
  const preDays = nextClassDays('2026-09-05', 8, days);
  const pre = reciteSes.slice(0, 8).map((l, i) => ({ cid: 'IS6', title: titleOfL(l), publishDate: preDays[i], nodeId: recite.nodeId, created: '2026-10-27 08:00' }));
  const courses = [{ cid: 'IS6', title: 'التربية الإسلامية', level: 'الصف السادس', subject: 'التربية الإسلامية', grade: 'السادس', tree },
    { cid: 'IS7', title: 'التربية الإسلامية', level: 'الصف السابع', subject: 'التربية الإسلامية', grade: 'السابع', tree }];
  const noor = env.noor({ tree, courses, existing: pre });
  env.afaq.reset({ pkg: PKG, offer: { id: 'is-6-2', subject: 'التربية الإسلامية', grade: 6, title: 'التربية الإسلامية — السادس', shift: 'two' } });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', { grade: 'الصف السادس', subject: 'التربية الإسلامية', shift: 'فترتان' });
  const s = await waitDone(b.pg, 30 * 60000, 'islamic 6 real tree');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(rows.every((r) => r.cid === 'IS6'), 'every save in the right course card (التربية الإسلامية — السادس)', rows.filter((r) => r.cid !== 'IS6').map((r) => r.cid).join(','));
  const want = PKG.lessons.filter((l) => !reciteSes.slice(0, 8).includes(l));
  const got = new Map();
  rows.forEach((r) => { const l = sessionOfRow(r); if (l) got.set(l.id, (got.get(l.id) || []).concat(r)); });
  check(rows.every((r) => sessionOfRow(r)), 'every saved row carries the content of a session from the file', fmtRows(rows.filter((r) => !sessionOfRow(r))));
  const missing = want.filter((l) => !got.has(l.id));
  check(!missing.length, `every session not yet in Noor was saved (${want.length})`, missing.map((l) => `${l.id} «${l.lesson}»`).join('\n'));
  const again = reciteSes.slice(0, 8).filter((l) => got.has(l.id));
  check(!again.length, 'the 8 recitation preps already in Noor were not saved again', again.map((l) => l.id).join(', '));
  const twice = [...got].filter(([, v]) => v.length > 1);
  check(!twice.length, 'no session saved twice', twice.map(([k, v]) => `${k} ×${v.length}`).join(', '));
  const wrongNode = rows.filter((r) => { const l = sessionOfRow(r); return l && r.lessonId !== nodeOfL(l).nodeId; });
  check(!wrongNode.length, 'every session went into its own Noor lesson (both surahs into «سورتي المدثر والمزمل»)', wrongNode.map((r) => { const l = sessionOfRow(r); return `${l.id} «${l.lesson}» → «${r.nodeText}» (expected «${nodeOfL(l).text}»)`; }).join('\n'));
  const badTitle = rows.filter((r) => { const l = sessionOfRow(r); return l && norm(r.title) !== norm(withDayRank(titleOfL(l), nodeOfL(l).text, r.dayRank)); });
  check(!badTitle.length, 'titles: Noor lesson name + «(n)», the recitation lesson numbered on from «(9)»', badTitle.map((r) => `${sessionOfRow(r).id}: «${r.title}» expected «${titleOfL(sessionOfRow(r))}»`).join('\n'));
  // the rest continues after the last prep in Noor, period after period, in Noor tree order (the recitation lesson first)
  const order = reciteSes.slice(8).concat(PKG.lessons.filter((l) => !reciteSes.includes(l)));
  const nd = nextClassDays(preDays[7], order.length, days);
  const expD = new Map(order.map((l, i) => [l.id, nd[i]]));
  const off = rows.filter((r) => { const l = sessionOfRow(r); return l && r.publishDate !== expD.get(l.id); });
  check(!off.length, 'dates: the rest follows the last prep in Noor, period after period in Noor tree order', off.slice(0, 12).map((r) => `${sessionOfRow(r).id}: ${r.publishDate} expected ${expD.get(sessionOfRow(r).id)}`).join('\n'));
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run', { grade: 'الصف السادس', subject: 'التربية الإسلامية', shift: 'فترتان' });
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

// ---------- homework (4.10.24, owner 2026-11-01): five questions per lesson in «المهام الإلكترونية» ----------
const hwChecks = (noor, tree, want, { pubOf, label = '' }) => {
  const hws = noor.st.homeworks;
  const errs = noor.st.hwPosts.filter((x) => !/^ok/.test(x.outcome));
  check(!errs.length, `${label}every homework form Noor received was valid (create + bulk questions)`, errs.map((x) => `${x.kind} ${x.aid || ''}: ${x.outcome}`).join('\n'));
  const byTitle = new Map();
  hws.forEach((h) => byTitle.set(h.title, (byTitle.get(h.title) || []).concat(h)));
  const dup = [...byTitle].filter(([, v]) => v.length > 1);
  check(!dup.length, `${label}one homework per lesson (no duplicate)`, dup.map(([t, v]) => `«${t}» ×${v.length}`).join('\n'));
  const missing = want.filter((w) => !byTitle.has('واجب: ' + w.node.text));
  check(!missing.length && hws.length === want.length, `${label}a homework for each lesson (${want.length}), titled «واجب: <Noor lesson>»`, `got ${hws.length}: ${hws.map((h) => h.title).join(' | ')}\nmissing: ${missing.map((w) => w.node.text).join(' | ')}`);
  const bad = [];
  for (const w of want) {
    const h = (byTitle.get('واجب: ' + w.node.text) || [])[0];
    if (!h) continue;
    const prep = noor.st.rows.find((r) => r.id === h.prepId);
    const why = [];
    if (!prep || prep.lessonId !== w.node.nodeId) why.push(`prep ${h.prepId} → ${prep ? prep.nodeText : 'none'}`);
    if (prep && w.prepId && prep.id !== w.prepId) why.push(`prep ${prep.id} expected ${w.prepId} (the lesson's first prep)`);
    if (!h.lessons.includes(w.node.nodeId)) why.push(`lessons ${h.lessons.join(',')}`);
    const d = pubOf(w);
    if (h.publish !== `${d} 07:00:00`) why.push(`publish ${h.publish} expected ${d} 07:00:00`);
    if (h.due !== `${addDaysIso(d, 3)} 07:00:00` || h.cutoff !== `${addDaysIso(d, 5)} 07:00:00`) why.push(`due ${h.due} cutoff ${h.cutoff}`);
    if (h.view !== 'view_answers_after_cutoff') why.push(`view ${h.view}`);
    if (h.lectures.length !== 2) why.push(`sections ${h.lectures.join(',')}`);
    const types = h.qs.map((q) => q.type).join(',');
    if (h.qs.length !== 5 || types !== 'mcq,tfq,mcq,tfq,mcq' || h.qs.some((q) => q.mark !== 2)) why.push(`questions ${h.qs.length} [${types}] marks ${h.qs.map((q) => q.mark).join(',')}`);
    if (why.length) bad.push(`«${w.node.text}»: ${why.join('; ')}`);
  }
  check(!bad.length, `${label}each homework: its lesson's prep + Noor lesson, published on the prep's date (due +3, late +5 days, answers after the late date), both sections, 5 questions (3 MCQ + 2 T/F, 2 marks each)`, bad.join('\n'));
};

T(22, 'Full term with «أضف واجبًا لكل درس»: every lesson gets one homework of five questions on its first prep, and a re-run adds none', async (env) => {
  usePkg(derivePkg({ keep: range(1, 9) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', { hw: true });
  const s = await waitDone(b.pg, 25 * 60000, 'full term + homework');
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  assertRows('term+homework', rows, tree, { expectIds: PKG.lessons.map((l) => l.id) });
  const want = lessonGroups(PKG).map((g) => { const l = g.sessions[0]; const r = rows.find((x) => sessionOfRow(x) === l); return { node: nodeFor(tree, l), prepId: r && r.id, date: r && r.publishDate }; });
  hwChecks(noor, tree, want, { pubOf: (w) => w.date });
  const log = (await dumpLog(b.pg)).join('\n');
  check(!/واجب لم يُضف/.test(log), 'no homework line the teacher could read as a problem', log.split('\n').filter((x) => /واجب/.test(x)).join('\n'));
  const n1 = noor.st.homeworks.length, r1 = noor.st.rows.length;
  await b.pg.reload(); await sleep(4000);
  await wizardTo(b.pg, 'term', { hw: true, name: false });
  await waitDone(b.pg, 10 * 60000, 're-run');
  check(noor.st.homeworks.length === n1 && noor.st.rows.length === r1, `re-run adds no prep and no homework (homeworks ${n1} → ${noor.st.homeworks.length}, preps ${r1} → ${noor.st.rows.length})`);
  return b;
});

T(23, '«الواجبات فقط»: preps already in Noor (made by the teacher) — a homework for each lesson whose first prep is today or later, with that prep\'s date; no prep saved, nothing for past lessons', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  const tree = treeFromPackage(PKG);
  const groups = lessonGroups(PKG);
  // «today» = the first day of the third lesson: lessons 1–2 are past, the rest still to come
  const now = groups[2].sessions[0].pubDate;
  const noor = env.noor({ tree, existing: existingFor(tree, PKG.lessons.map((l) => l.id)) });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now, cont: false });
  await wizardTo(b.pg, 'hw');
  const s = await waitDone(b.pg, 15 * 60000, 'homework only');
  const added = noor.st.rows.filter((r) => !r.preexisting);
  check(!added.length && !noor.st.posts.length, `no prep saved (${noor.st.posts.length} prep posts)`, fmtRows(added));
  const want = groups.filter((g) => g.sessions[0].pubDate >= now).map((g) => { const l = g.sessions[0]; const node = nodeFor(tree, l); const r = noor.st.rows.find((x) => x.preexisting && x.lessonId === node.nodeId && x.title === node.text); return { node, prepId: r && r.id, date: l.pubDate }; });
  hwChecks(noor, tree, want, { pubOf: (w) => w.date });
  check(new RegExp(`أضفت ${toAr(want.length)} واجب`).test(s.head) || (want.length === 1 && /واجبًا واحدًا/.test(s.head)) || (want.length === 2 && /أضفت واجبين/.test(s.head)), `the wizard says how many homeworks were added («أضفت ${toAr(want.length)} واجبات»)`, `${s.head} | ${s.text}`);
  check(!CALM_BAD_RE.test(s.head + ' ' + s.text), 'calm wording (no error words)', `${s.head} | ${s.text}`);
  return b;
});

// ---------- main ----------
const want = process.argv.slice(2).map(Number).filter(Boolean);
const list = Object.keys(SC).map(Number).filter((n) => !want.length || want.includes(n));
const extDir = prepareExtension();
const afaq = await startAfaq(AFAQ_PORT);
console.log(`hadir noor-mock harness — extension v${JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8')).version}, package ${PKG.id} (${PKG.lessons.length} sessions)`);
for (const n of list) {
  cur = { n, title: SC[n].title, checks: [] };
  usePkg(BASE);
  results.push(cur);
  console.log(`\n=== Scenario ${n}: ${SC[n].title}`);
  const t0 = Date.now();
  let b = null;
  // the teacher's timetable by default: two sections with one period on each weekday the scenario's plan uses (Sun/Mon/Tue for
  // the base package), so «period after period from the first school day» (4.10.20) lands every session on its plan date
  const planDays = () => { const w = new Set(PKG.lessons.map((l) => new Date(l.pubDate + 'T12:00').getDay())); return Object.fromEntries([0, 1, 2, 3, 4].map((d) => [d, w.has(d) ? [['1', 1], ['2', 1]] : []])); };
  const env = { afaq, noor: (cfg) => (env.noorInst = createNoor(Object.assign({ pkg: PKG, periods: planDays() }, cfg))), launch: async (noor, o) => (b = await launch(extDir, noor, o)) };
  try {
    await SC[n].fn(env);
  } catch (e) {
    check(false, 'scenario ran without a harness error', e.stack || e);
  }
  if (b) {
    if (SHOTS) await b.pg.screenshot({ path: path.join(SHOTS, `s${n}.png`), fullPage: true }).catch(() => {});
    if (cur.checks.some((c) => !c.ok) || process.env.VERBOSE) {
      const log = await dumpLog(b.pg);
      console.log('    --- extension run log (last 40) ---\n    ' + log.slice(-40).join('\n    '));
      if (env.noorInst) console.log('    --- noor posts ---\n    ' + env.noorInst.st.posts.map((p) => `#${p.n} ${p.date} «${p.title}» → ${p.outcome}`).join('\n    '));
      if (env.noorInst && process.env.VERBOSE) console.log('    --- noor requests ---\n    ' + env.noorInst.st.events.join('\n    '));
    }
    if (b.errs.length) console.log('    page errors:', b.errs.slice(0, 5));
    await b.ctx.close().catch(() => {});
  }
  cur.secs = Math.round((Date.now() - t0) / 1000);
  console.log(`  (${cur.secs}s)`);
}
await afaq.close();
if (!process.env.KEEP) fs.rmSync(extDir, { recursive: true, force: true });
console.log('\n=== Summary');
let failed = 0;
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok).length;
  if (bad || !r.checks.length) failed++;
  console.log(`${bad || !r.checks.length ? 'FAIL' : 'PASS'}  Scenario ${r.n}: ${r.title} — ${r.checks.length - bad}/${r.checks.length} checks (${r.secs}s)`);
}
console.log(failed ? `\n${failed} scenario(s) failed` : '\nall scenarios passed');
process.exit(failed ? 1 : 0);
