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
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
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
async function launch(extDir, noor, { now = FIXED_NOW } = {}) {
  const ctx = await chromium.launchPersistentContext('', {
    headless: !process.env.HEADFUL, executablePath: '/opt/pw-browsers/chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, ...(process.env.HEADFUL ? [] : ['--headless=new'])],
    viewport: { width: 1100, height: 900 },
  });
  await ctx.route('https://lms.moe.gov.om/**', (r) => noor.handle(r).catch((e) => { console.log('    route error', e.message); return r.abort().catch(() => {}); }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  await sleep(1500);
  for (const p of ctx.pages()) if (p.url().includes('semester.html')) await p.close().catch(() => {});   // the window opened on install
  const errs = [];
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(`chrome-extension://${id}/semester.html?debug=1&now=${now}`);
  return { ctx, sw, pg, id, errs };
}
const card = async (pg, t) => { await pg.locator('.wz-card:not([disabled])', { hasText: t }).first().click({ timeout: 20000 }); await sleep(500); };
async function wizardTo(pg, mode, { name = true, grade = 'الصف التاسع', subject = 'الأحياء', shift = 'فترة واحدة' } = {}) {
  // each step only if the run has not started yet (once linked, a «من حسابك في نور» shortcut can skip steps)
  const started = () => pg.evaluate(() => document.body.classList.contains('wiz-run') || !!document.getElementById('wzName')).catch(() => false);
  const step = async (sel, t) => { if (await started()) return; await pg.locator(sel, { hasText: t }).first().click({ timeout: 20000 }); await sleep(600); };
  await step('.wz-card:not([disabled])', mode === 'pick' ? 'أختار الدروس بنفسي' : 'تحضير الفصل كاملًا');
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
      const fin = (s.again && !s.stop && !/أكملها الآن|أكمل التحضير/.test(s.head)) || (s.wiz && /انتهت تجربتك/.test(s.wzHead));
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
  const pre = existingFor(tree, range(10, 45));
  const noor = env.noor({ tree, existing: pre, rejectAtFill: ['2026-09-14'], rejectAtSave: ['2026-09-21'] });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 12 * 60000, 'term with rejected dates');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard finishes with success', `${s.head} | ${s.text}`);
  const keep = { [sid(1)]: '2026-09-06', [sid(2)]: '2026-09-07', [sid(3)]: '2026-09-08', [sid(4)]: '2026-09-13', [sid(7)]: '2026-09-20' };
  assertRows('S2', rows, tree, { expectIds: range(1, 9), dates: keep, preexisting: pre });
  const d = (n) => (rows.find((r) => sessionOfRow(r) && sessionOfRow(r).id === sid(n)) || {}).publishDate;
  check(d(5) && d(5) !== '2026-09-14', `session 005 moved off the rejected 2026-09-14 (got ${d(5)})`);
  check(d(8) && d(8) !== '2026-09-21', `session 008 moved off the save-rejected 2026-09-21 (got ${d(8)})`);
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
  const want = { [sid(9)]: '2026-10-29', [sid(10)]: '2026-11-02', [sid(12)]: '2026-11-04' };
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

T(7, 'Trial cap: 2 free sessions left → only 2 saved, then the pay screen; after activation the run continues by itself', async (env) => {
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, trialLeft: 2 });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 6 * 60000, 'trial cap');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(s.wiz && /انتهت تجربتك المجانية/.test(s.wzHead), 'pay screen «انتهت تجربتك المجانية» is shown', JSON.stringify(s));
  assertRows('S7', rows, tree, { expectIds: [sid(1), sid(2)], dates: { [sid(1)]: S[sid(1)].pubDate, [sid(2)]: S[sid(2)].pubDate } });
  check(env.afaq.st.calls.includes('ext_contact'), 'request marked «بانتظار التفعيل» (ext_contact called)');
  check(s.wiz && /يكمل التحضير وحده/.test(s.wzBody || s.text || ''), 'pay screen says the preparation continues by itself after activation', JSON.stringify(s));
  // the admin activates the request: the run continues by itself (no button), with the same choices, nothing saved twice
  env.afaq.st.active = true; env.afaq.st.status = 'active';
  const t0 = Date.now();
  let left = null;
  while (Date.now() - t0 < 90000) { const u = await ui(b.pg).catch(() => null); if (u && !(u.wiz && /انتهت تجربتك/.test(u.wzHead))) { left = u; break; } await sleep(1500); }
  check(!!left, 'activation is picked up without any click (pay screen closes by itself)');
  const s2 = await waitDone(b.pg, 10 * 60000, 'after activation');
  check(/تمت التعبئة بنجاح|نُشر/.test(s2.head), 'run finishes after activation', `${s2.head} | ${s2.text}`);
  const rows2 = noor.st.rows.filter((r) => !r.preexisting);
  assertRows('S7b', rows2, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
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
  const dates = Object.fromEntries(want.map((id) => [id, S[id].pubDate]));
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

// two periods of the same section on one day (real Noor 2026-10-24: «تقنية المعلومات - التاسع - 1 -  الحصة 7» and «… الحصة 8»;
// a period that already has a prep on that date is disabled, or hidden): one prep per period, each week's sessions on the
// teacher's real periods of that week. Timetable: Sun section 1 ×2 + section 2 ×1 · Tue both ×1 · Wed section 1 ×1 · Mon/Thu none
for (const [n, mode] of [[11, 'disable'], [12, 'hide']]) T(n, `Two periods of one section on Sunday (taken period ${mode === 'disable' ? 'disabled' : 'hidden'}): a prep for each period, each week on its real periods, no duplicates`, async (env) => {
  usePkg(derivePkg({ keep: range(1, 18) }));
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['1', 2], ['2', 1]], 1: [], 2: [['1', 1], ['2', 1]], 3: [['1', 1]], 4: [] };
  const noor = env.noor({ tree, periods, takenSlots: mode });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'two-period term');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  // file: 3 sessions a week dated Sun, Mon, Tue → teacher: Sun (period 1), Sun (period 2), Tue
  const exp = {};
  PKG.lessons.forEach((l, i) => { const ws = new Date(l.pubDate + 'T12:00'); ws.setDate(ws.getDate() - ws.getDay()); const d = new Date(ws); d.setDate(d.getDate() + (i % 3 === 2 ? 2 : 0)); exp[l.id] = d.toISOString().slice(0, 10); });
  assertRows(`S${n}`, rows, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: exp, sameDay: true });
  const sun = rows.filter((r) => new Date(r.publishDate + 'T12:00').getDay() === 0);
  const byDay = sun.reduce((m, r) => { (m[r.publishDate] = m[r.publishDate] || []).push(r); return m; }, {});
  check(Object.values(byDay).every((v) => v.length === 2), 'every Sunday has two preps (one per period of section 1)', JSON.stringify(Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, v.map((r) => (r.slots || []).join('+'))]))));
  check(Object.values(byDay).every((v) => v.some((r) => (r.slots || []).length === 2) && v.some((r) => (r.slots || []).join() === '1|2')), 'first Sunday prep: section 1 period 1 + section 2; second: section 1 period 2 only', JSON.stringify(Object.values(byDay).map((v) => v.map((r) => r.slots))));
  check(rows.every((r) => !r.sectionOnly && (r.slots || []).length), 'no prep on a day without periods (Mon/Thu)', rows.filter((r) => r.sectionOnly).map((r) => r.publishDate).join(', '));
  check(!noor.st.posts.some((p) => /date-dup/.test(p.outcome || '')), 'Noor never refused a save as a duplicate period', noor.st.posts.filter((p) => /dup/.test(p.outcome || '')).map((p) => p.date).join(', '));
  const n1 = noor.st.rows.length;
  const s2 = await rerun(b, 'manual re-run');
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

// real Noor 2026-10-25 (owner's page): every period box sits inside ONE big <label> around the whole list, so the nearest
// label of a box holds the text of all four periods; 4.10.10 read them as one section with four periods → four preps on
// that day, one period each. Timetable: Sun section 4 ×2 + sections 5 and 6 ×1 · Tue sections 4, 5, 6 ×1 · other days none
T(17, 'Three sections on Sunday, one of them with two periods (real Noor wraps all period boxes in one label): two preps that day — sections 4+5+6, then section 4 again', async (env) => {
  usePkg(derivePkg({ keep: range(1, 18) }));
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['4', 2], ['5', 1], ['6', 1]], 1: [], 2: [['4', 1], ['5', 1], ['6', 1]], 3: [], 4: [] };
  const noor = env.noor({ tree, periods, takenSlots: 'disable' });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'three sections term');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const secs = (r) => [...new Set((r.slots || []).map((x) => String(x).split('|')[0]))].sort().join(',');
  const byDay = rows.reduce((m, r) => { (m[r.publishDate] = m[r.publishDate] || []).push(r); return m; }, {});
  const sundays = Object.entries(byDay).filter(([d]) => new Date(d + 'T12:00').getDay() === 0);
  const show = JSON.stringify(Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, v.map((r) => (r.slots || []).join('+'))])));
  check(sundays.length && sundays.every(([, v]) => v.length === 2), 'every Sunday has exactly two preps (not one per period box)', show);
  check(sundays.every(([, v]) => v.some((r) => secs(r) === '4,5,6' && (r.slots || []).length === 3) && v.some((r) => secs(r) === '4' && (r.slots || []).length === 1)), 'first Sunday prep: sections 4, 5 and 6 together; second: section 4 only', show);
  check(Object.entries(byDay).filter(([d]) => new Date(d + 'T12:00').getDay() === 2).every(([, v]) => v.length === 1 && secs(v[0]) === '4,5,6'), 'every Tuesday: one prep for sections 4, 5 and 6', show);
  check(rows.length === PKG.lessons.length, `every session in its own prep (${rows.length} preps for ${PKG.lessons.length} sessions)`);
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
  check(sums.length === 1 && sums[0].pick && /أنشر ١٨ تحضيرًا/.test(sums[0].text), 'one calm start summary, confirmed once («أنشر ١٨ تحضيرًا …», with «أختار الدروس بنفسي»)', JSON.stringify(sums));
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

T(16, 'Late start (today 6 December, the whole plan has passed, 2 periods a week): the missed sessions are published from today first, in order; sessions of the SAME lesson share a prep only as far as needed to end by the term end, different lessons never', async (env) => {
  usePkg(derivePkg({ keep: range(1, 30) }));   // 10 weeks × 3 sessions, the last one in November
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['1', 1], ['2', 1]], 1: [], 2: [['1', 1], ['2', 1]], 3: [], 4: [] };
  const today = '2026-12-06';   // a Sunday; until 21 January: 7 weeks × 2 periods = 14 preps for 30 sessions
  const noor = env.noor({ tree, periods, noPast: today });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: today });
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'late start');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const sums = b.pg.__summaries || [];
  check(sums.length === 1 && /فات|فات موعدها/.test(sums[0].text) && /الدرس نفسه/.test(sums[0].text), 'the start summary says calmly that the missed sessions go first from today and some sessions of one lesson share a prep', JSON.stringify(sums));
  check(rows.every((r) => r.publishDate >= today), 'no prep before today', rows.filter((r) => r.publishDate < today).map((r) => r.publishDate + ' ' + r.title).join(', '));
  check(rows.every((r) => r.publishDate <= '2027-01-21'), 'nothing after the term end (21 January)', rows.filter((r) => r.publishDate > '2027-01-21').map((r) => r.publishDate + ' ' + r.title).join(', '));
  check(rows.every((r) => [0, 2].includes(new Date(r.publishDate + 'T12:00').getDay())), 'every prep on a day with periods (Sun/Tue)', rows.map((r) => r.publishDate).join(', '));
  const cover = new Map();
  rows.forEach((r) => PKG.lessons.forEach((l) => { if (norm(r.concepts).includes(norm(l.concepts))) cover.set(l.id, (cover.get(l.id) || []).concat(r)); }));
  const missing = PKG.lessons.filter((l) => !cover.has(l.id)).map((l) => l.id), twice = [...cover].filter(([, v]) => v.length > 1).map(([k]) => k);
  check(!missing.length, 'every session of the plan is in a prep', missing.join(', '));
  check(!twice.length, 'no session in two preps', twice.join(', '));
  const lessonsOf = (r) => new Set(PKG.lessons.filter((l) => (cover.get(l.id) || []).includes(r)).map((l) => l.unit + '|' + l.lesson));
  const mixed = rows.filter((r) => lessonsOf(r).size > 1);
  check(!mixed.length, 'a shared prep never holds two different lessons', mixed.map((r) => r.title).join(' | '));
  const first = PKG.lessons.map((l) => (cover.get(l.id) || [{}])[0].publishDate || '');
  check(first.every((d, i) => !i || d >= first[i - 1]), 'the plan order is kept from today on', first.join(', '));
  const extra = rows.reduce((a, r) => { const m = r.title.match(/\((\d+(?: و \d+)+)\)$/); return a + (m ? m[1].split(' و ').length - 1 : 0); }, 0);
  check(extra === PKG.lessons.length - rows.length, `shared preps carry «(n و m)» for every extra session (${extra})`, rows.map((r) => r.title).join(' | '));
  const byDay = rows.reduce((m, r) => { m[r.publishDate] = (m[r.publishDate] || 0) + 1; return m; }, {});
  check(Object.values(byDay).every((n) => n === 1), 'one prep per day (one period per section)', JSON.stringify(byDay));
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run');
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});

T(20, 'Noor already has preps out of the plan order (lessons 1–2 and 5–6 done, 3–4 not, today mid-October): the start summary counts what is in Noor and calmly advises «أختار الدروس بنفسي»; choosing it opens the lessons screen with nothing saved', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const g = lessonGroups(PKG);
  const doneIds = [0, 1, 4, 5].flatMap((k) => g[k].sessions.map((l) => l.id));
  const pre = existingFor(tree, doneIds);
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-10-11' });
  await wizardTo(b.pg, 'term');
  // wait for the summary and read it without confirming
  let sm = null;
  for (let i = 0; i < 240 && !sm; i++) {
    sm = await b.pg.evaluate(() => { const a = document.getElementById('nowActs'); const p = a && !a.hidden && a.querySelector('button[data-act="pick"]'); return p ? { head: document.getElementById('nowHead').textContent, text: document.getElementById('nowText').innerText, primary: p.classList.contains('primary') } : null; }).catch(() => null);
    if (!sm) await sleep(1000);
  }
  check(!!sm, 'the term run stops on a start summary before any prep', '');
  if (sm) {
    check(new RegExp(`وجدت في نور ${toAr(doneIds.length)}`).test(sm.text), `the summary counts the ${doneIds.length} preps already in Noor`, sm.text);
    check(/الأنسب/.test(sm.text) && sm.primary, 'it calmly advises «أختار الدروس بنفسي» (the highlighted button)', JSON.stringify(sm));
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
    const got = rows.map((r) => r.publishDate).sort();
    check(rows.length === ids.length && JSON.stringify(got) === JSON.stringify(want), 'the chosen sessions are saved on those consecutive days', got.join(', '));
    check(!(b.pg.__summaries || []).length, 'pick mode asks nothing before saving', JSON.stringify(b.pg.__summaries || []));
  }
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
  const pre = reciteSes.slice(0, 8).map((l) => ({ cid: 'IS6', title: titleOfL(l), publishDate: l.pubDate, nodeId: recite.nodeId, created: '2026-10-27 08:00' }));
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
  const off = rows.filter((r) => { const l = sessionOfRow(r); return l && r.publishDate !== l.pubDate; });
  check(!off.length, 'publish dates as in the file', off.map((r) => `${sessionOfRow(r).id}: ${r.publishDate} expected ${sessionOfRow(r).pubDate}`).join('\n'));
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run', { grade: 'الصف السادس', subject: 'التربية الإسلامية', shift: 'فترتان' });
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
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
  const env = { afaq, noor: (cfg) => (env.noorInst = createNoor(Object.assign({ pkg: PKG }, cfg))), launch: async (noor, o) => (b = await launch(extDir, noor, o)) };
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
