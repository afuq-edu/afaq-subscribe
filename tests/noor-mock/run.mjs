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
function assertRows(name, rows, tree, { expectIds, dates, preexisting = [], sameDay = false, maxJoins = 0 }) {
  // a joined prep «X (n و m)» of one Noor lesson (4.10.29: when Noor has fewer free periods than the plan, sessions of the SAME lesson
  // share a prep so the plan still ends in its last week): it stands for sessions n, m of that lesson; allowed only up to maxJoins
  const joinedOf = (r) => { const m = r.title.match(/ \((\d+(?: و \d+)+)\)$/); if (!m) return null; const ns = m[1].split(' و ').map(Number);
    const ls = PKG.lessons.filter((l) => { const n = nodeFor(tree, l); return n && n.nodeId === r.lessonId && ns.includes(sessNo(l)); }); return ls.length === ns.length ? ls : null; };
  const joined = rows.filter((r) => !sessionOfRow(r) && joinedOf(r));
  check(joined.length <= maxJoins, `${name}: same-lesson joined preps «(n و m)» only where the plan overruns (${joined.length} ≤ ${maxJoins})`, joined.map((r) => `«${r.title}» date=${r.publishDate}`).join('\n'));
  const jIds = new Set(joined.flatMap((r) => joinedOf(r).map((l) => l.id)));
  const unknown = rows.filter((r) => !sessionOfRow(r) && !joinedOf(r));
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
    const got = [...new Set([...byId.keys(), ...jIds])].sort(), want = expectIds.slice().sort();
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
  const all = rows.flatMap((r) => (sessionOfRow(r) ? [sessionOfRow(r)] : joinedOf(r) ? joinedOf(r).slice(0, 1) : []).map((l) => ({ l, d: r.publishDate })))
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
const GAMES = 'https://games.test/';
const YT = 'https://yt.test/';   // YouTube search (?yt=): results built from the query, see launch()   // homework files (five questions per lesson), served by launch()
// cont: Noor already holds preps of this subject made by an earlier «تحضير الفصل كاملًا» on this device (?cont=1, test only) —
// the run continues it; without it the tool refuses a full term over existing preps (owner 2026-11-01, scenario 20)
async function launch(extDir, noor, { now = FIXED_NOW, cont = noor.st.rows.some((r) => r.preexisting) } = {}) {
  const ctx = await chromium.launchPersistentContext('', {
    headless: !process.env.HEADFUL, executablePath: '/opt/pw-browsers/chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, ...(process.env.HEADFUL ? [] : ['--headless=new'])],
    viewport: { width: 1100, height: 900 },
  });
  await ctx.route('https://lms.moe.gov.om/**', (r) => noor.handle(r).catch((e) => { console.log('    route error', e.message); return r.abort().catch(() => {}); }));
  // homework files (?games=): <key>.json with five questions for every session of the running package (from a real file):
  // lessons = the first session's set, sessions = one more set for each further session (4.10.37: a homework per session)
  await ctx.route(GAMES + '**', (r) => {
    // lesson activities (site/games/<pkg>/<n>.json): the real file
    // games/<key>/index.json and <n>.json; a key with no folder in site/games (the test package «bio-9») reads the real biology 9 activities
    const gdir = (k) => (fs.existsSync(path.join(REPO, 'site/games', k)) ? k : 'bi-9');
    // its units.json then lists the test package's own lessons (units and names as in PKG) on the biology 9 activity files, in order
    const gi = r.request().url().match(/\/([a-z0-9-]+)\/(index|units)\.json$/);
    if (gi) {
      const real = gdir(gi[1]) === gi[1];
      const body = real ? fs.readFileSync(path.join(REPO, 'site/games', gi[1], gi[2] + '.json'), 'utf8')
        : gi[2] === 'units' ? JSON.stringify(lessonGroups(PKG).map((g, i) => [g.sessions[0].unit, g.sessions[0].lesson, i + 1])) : JSON.stringify(Object.fromEntries(lessonGroups(PKG).map((g, i) => [g.sessions[0].lesson, i + 1])));
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    }
    const gm = r.request().url().match(/\/([a-z0-9-]+)\/(\d+)\.json$/);
    if (gm) { const f = path.join(REPO, 'site/games', gdir(gm[1]), gm[2] + '.json'); return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f, 'utf8') }) : r.fulfill({ status: 404, body: '' }); }
    const src = Object.values(JSON.parse(fs.readFileSync(path.join(REPO, 'site/homework/en-5.json'), 'utf8')).lessons);
    const gs = lessonGroups(PKG);
    const lessons = Object.fromEntries(gs.map((g, i) => [g.sessions[0].lesson, src[i % src.length]]));
    const sessions = Object.fromEntries(gs.filter((g) => g.sessions.length > 1).map((g, i) => [g.sessions[0].lesson, g.sessions.slice(1).map((_, j) => src[(i * 7 + j + 1 + gs.length) % src.length])]));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ key: 'test', lessons, sessions }) });
  });
  // YouTube search: for a query «<topic> <subject> <grade>» — a fitting video «<topic> - شرح …» (5 min), a Short with the same title,
  // a 2-hour live with the same title and an unrelated video; queries containing «انتشار» get only unrelated videos (no fitting title)
  await ctx.route(YT + '**', (r) => {
    const q = new URL(r.request().url()).searchParams.get('search_query') || '';
    const topic = q.replace(/\s*الأحياء.*$/, '').trim();
    const vr = (id, title, len, url = '/watch?v=' + id) => ({ videoRenderer: { videoId: id, title: { runs: [{ text: title }] }, lengthText: len ? { simpleText: len } : undefined, navigationEndpoint: { commandMetadata: { webCommandMetadata: { url } } }, ownerText: { runs: [{ text: 'قناة' }] } } });
    const id = (k) => (k + Buffer.from(topic).toString('hex')).replace(/[^a-z0-9]/gi, '').slice(0, 11).padEnd(11, 'x');
    const items = /انتشار/.test(q) ? [vr(id('u'), 'رحلة إلى البحر كرتون', '7:10')]
      : [vr(id('s'), topic + ' #shorts', '0:40', '/shorts/' + id('s')), vr(id('l'), topic + ' بث', '2:05:00'), vr(id('u'), 'أغنية الأطفال', '3:00'), vr(id('g'), topic + ' - شرح درس الأحياء الصف التاسع', '5:12')];
    const data = { contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: items } }] } } } } };
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: `<html><body><script>var ytInitialData = ${JSON.stringify(data)};</script></body></html>` });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  await sleep(1500);
  for (const p of ctx.pages()) if (p.url().includes('semester.html')) await p.close().catch(() => {});   // the window opened on install
  const errs = [];
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(`chrome-extension://${id}/semester.html?debug=1&now=${now}${cont ? '&cont=1' : ''}&games=${encodeURIComponent(GAMES)}&yt=${encodeURIComponent(YT)}`);
  return { ctx, sw, pg, id, errs };
}
const card = async (pg, t) => { await pg.locator('.wz-card:not([disabled])', { hasText: t }).first().click({ timeout: 20000 }); await sleep(500); };
// the service choice on the first wizard screen (not part of a run once it has started)
async function svcPick(pg, k, started) {
  // 4.10.48: the services are ticked one by one (any combination). k: 'prep' · 'both' (prep + homework) · 'hw' · 'rooms' · 'video' ·
  // 'scorm' · or a list such as 'prep,hw,rooms' — exactly these end up ticked
  const want = (k === 'both' ? 'prep,hw' : k).split(',');
  if (started && (await started())) return;
  await pg.waitForSelector('.wz-seg-b[data-svc]', { timeout: 20000 }).catch(() => {});
  if (started && (await started())) return;
  for (let i = 0; i < 6; i++) {
    const done = await pg.evaluate((want) => {
      const bs = [...document.querySelectorAll('.wz-seg-b[data-svc]')];
      if (!bs.length) return true;
      const off = bs.find((b) => want.includes(b.dataset.svc) && !b.classList.contains('on') && !b.disabled);
      const extra = bs.find((b) => !want.includes(b.dataset.svc) && b.classList.contains('on'));
      const b = off || extra;   // tick what is wanted first, so the list is never empty
      if (b) b.click();
      return !b;
    }, want).catch(() => true);
    await sleep(250);
    if (done) break;
  }
}
// 4.10.36: the name step reads the teacher's name from Noor by itself (owner 2026-11-03); typing it is only the fallback
async function nameStep(pg) {
  const onName = () => pg.evaluate(() => /حسابك في نور/.test((document.getElementById('wzHead') || {}).textContent || '') && !document.body.classList.contains('wiz-run')).catch(() => false);
  for (const t0 = Date.now(); Date.now() - t0 < 30000 && (await onName());) await new Promise((r) => setTimeout(r, 1000));
  if (await onName()) {
    await pg.evaluate(() => { const d = document.getElementById('wzSelf'); if (d) d.open = true; }).catch(() => {});
    await pg.fill('#wzName', 'سالم علي', { timeout: 15000 });
    await pg.click('#wzNameGo');
  }
}
async function wizardTo(pg, mode, { name = true, grade = 'الصف التاسع', subject = 'الأحياء', shift = 'فترة واحدة', hw = false, style = 'session', hwPer = '' } = {}) {
  // each step only if the run has not started yet (once linked, a «من حسابك في نور» shortcut can skip steps)
  const started = () => pg.evaluate(() => document.body.classList.contains('wiz-run') || !!document.getElementById('wzName')).catch(() => false);
  const step = async (sel, t) => { if (await started()) return; await pg.locator(sel, { hasText: t }).first().click({ timeout: 20000 }); await sleep(600); };
  // «أضف واجبًا لكل درس» (4.10.24, ticked by default): the older scenarios run without homework
  // 4.10.28: three explicit choices at the top: تحضير · تحضير مع واجبات · واجبات فقط
  await svcPick(pg, mode === 'hw' ? 'hw' : hw ? 'both' : 'prep', started);
  // 4.10.51 (owner 2026-11-17): «واجب لكل حصة» (default) or «واجب لكل عنوان»
  if (hwPer && !(await started())) { await pg.click(`#wzHwPer [data-hper="${hwPer}"]`, { timeout: 20000 }); await sleep(400); }
  await step('.wz-card:not([disabled])', mode === 'pick' || mode === 'hw' ? 'أختار الدروس بنفسي' : 'تحضير الفصل كاملًا');
  await step('.wz-cards.grid3 .wz-card', grade);
  await step('.wz-card:not([disabled])', subject);
  await step('.wz-card:not([disabled])', shift);
  if (name) await nameStep(pg);
  if (mode === 'term' && /العربية/.test(subject)) await styleStep(pg, style);
}
// 4.10.41: an Arabic subject in the full term asks once for the prep style — «تحضير لكل حصة» (as before) or «تحضير لكل مهارة»
async function styleStep(pg, style = 'session') {
  const at = () => pg.evaluate(() => (document.body.classList.contains('wiz-run') ? 'run' : /شكل تحضير/.test((document.getElementById('wzHead') || {}).textContent || '') ? 'style' : '')).catch(() => '');
  for (const t0 = Date.now(); Date.now() - t0 < 60000;) {
    const w = await at();
    if (w === 'run') return;
    if (w === 'style') { await pg.locator('.wz-card', { hasText: style === 'skill' ? 'تحضير لكل مهارة' : 'تحضير لكل حصة' }).first().click({ timeout: 20000 }); await sleep(600); return; }
    await sleep(500);
  }
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
  // two refused days push two sessions past the plan's last week: at most two same-lesson joins keep the plan inside it (4.10.29)
  assertRows('S2', rows, tree, { expectIds: range(1, 45), dates: keep, preexisting: pre, maxJoins: 2 });
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
  check(s.wiz && /صفحتها الرئيسية/.test(s.wzBody || s.text || ''), 'the screen tells the teacher to keep Noor\'s home page open (the name is read there)', JSON.stringify(s));
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

T(15, 'Fewer periods than the plan (2 a week for 3 sessions a week): sessions of the same lesson share one prep «(2 و 3)» so the plan ends in its last week (owner 2026-11-02), a re-run adds nothing', async (env) => {
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
  check(sums.length === 2 && sums.every((x) => x.pick) && /تأكد أنه لا توجد عندك/.test(sums[0].text) && /أول يوم دراسي/.test(sums[1].text) && /أنشر ١٢ تحضيرًا \(١٨ حصة\)/.test(sums[1].text) && /فجمعت/.test(sums[1].text), 'two calm start alerts, confirmed once each («تأكد أنه لا توجد عندك…», then «ستبدأ التحاضير من … أول يوم دراسي … أنشر ١٢ تحضيرًا (١٨ حصة)», both with «أختار الدروس بنفسي»)', JSON.stringify(sums));
  const lastFile = PKG.lessons.map((l) => l.pubDate).sort().pop();
  const end = new Date(lastFile + 'T12:00'); end.setDate(end.getDate() + (4 - end.getDay())); const endIso = end.toISOString().slice(0, 10);
  check(rows.every((r) => r.publishDate <= endIso), `no prep after the plan's last week (${endIso})`, rows.filter((r) => r.publishDate > endIso).map((r) => r.publishDate + ' ' + r.title).join(', '));
  const cover = new Map();
  rows.forEach((r) => PKG.lessons.forEach((l) => { if (norm(r.concepts).includes(norm(l.concepts))) cover.set(l.id, (cover.get(l.id) || []).concat(r.title)); }));
  const missing = PKG.lessons.filter((l) => !cover.has(l.id)).map((l) => l.id), twice = [...cover].filter(([, v]) => v.length > 1).map(([k]) => k);
  check(!missing.length, 'every session of the plan is in a prep in Noor', missing.join(', '));
  check(!twice.length, 'no session in two preps', twice.join(', '));
  const extra = rows.reduce((a, r) => { const m = r.title.match(/\((\d+(?: و \d+)+)\)$/); return a + (m ? m[1].split(' و ').length - 1 : 0); }, 0);
  check(extra === PKG.lessons.length - rows.length && extra > 0, `shared preps carry «(n و m)» in the title for every extra session (${extra})`, rows.map((r) => r.title).join(' | '));
  check(rows.every((r) => [0, 2].includes(new Date(r.publishDate + 'T12:00').getDay())), 'every prep on a day with periods (Sun/Tue)', rows.map((r) => r.publishDate).join(', '));
  const order = PKG.lessons.map((l) => { const r = rows.find((x) => norm(x.concepts).includes(norm(l.concepts))); return r ? r.publishDate : ''; });
  check(order.every((d, i) => d && (!i || d >= order[i - 1])), 'the sessions follow the plan order', order.join(', '));
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

T(26, 'Noor already has preps and the teacher wants a fresh start: «أمسح تحاضير هذه المادة من نور وأبدأ الفصل» asks twice, deletes only this subject\'s preps in Noor, then the full term runs from the first school day; declining at the second card deletes nothing', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const g = lessonGroups(PKG);
  const doneIds = [0, 1, 4, 5].flatMap((k) => g[k].sessions.map((l) => l.id));
  const pre = existingFor(tree, doneIds);
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-10-11', cont: false });
  await wizardTo(b.pg, 'term');
  const card = async (act) => { for (let i = 0; i < 60; i++) { const t = await b.pg.evaluate((a) => { const e = document.querySelector(`#nowActs button[data-act="${a}"]`); const acts = document.getElementById('nowActs'); return e && acts && !acts.hidden ? document.getElementById('nowText').innerText : null; }, act).catch(() => null); if (t) return t; await sleep(1000); } return null; };
  const press = (act) => b.pg.evaluate((a) => document.querySelector(`#nowActs button[data-act="${a}"]`).click(), act);
  const t1 = await card('wipe');
  check(!!t1 && /وجدت في نور/.test(t1), 'the block card offers «أمسح تحاضير هذه المادة من نور وأبدأ الفصل» next to «أختار الدروس بنفسي»', String(t1));
  const n0 = noor.st.rows.length;
  await press('wipe');
  const t2 = await card('wipe2');
  check(!!t2 && new RegExp(toAr(n0)).test(t2) && /لا يمكن التراجع/.test(t2), `the second card names the count (${n0}) and says it cannot be undone`, String(t2));
  check(noor.st.rows.length === n0 && !(noor.st.deleted || []).length, 'nothing deleted before the second confirmation', `${noor.st.rows.length}/${n0}`);
  await press('wipe2');
  const s = await waitDone(b.pg, 20 * 60000, 'wipe then term');
  check(/تمت التعبئة بنجاح/.test(s.head), 'after the wipe the full term runs to «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check((noor.st.deleted || []).length === n0 && noor.st.rows.every((r) => !r.preexisting), `all ${n0} old preps were deleted (${(noor.st.deleted || []).length})`, '');
  const rows = noor.st.rows;
  check(rows.length === PKG.lessons.length, `the whole plan (${PKG.lessons.length} sessions) is published after the wipe`, `rows ${rows.length}`);
  const sums = b.pg.__summaries || [];
  check(sums.length >= 1 && /أول يوم دراسي/.test(sums[sums.length - 1].text) && !/خطأ|فشل|تعذّر/.test(sums.map((x) => x.text).join(' ')), 'the start summary after the wipe is calm and says the preps begin on the first school day', JSON.stringify(sums));
  return b;
});

T(27, 'Declining at the second card: «لا، أختار الدروس بنفسي» deletes nothing and opens the lessons screen', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const g = lessonGroups(PKG);
  const pre = existingFor(tree, [0, 1, 4, 5].flatMap((k) => g[k].sessions.map((l) => l.id)));
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-10-11', cont: false });
  await wizardTo(b.pg, 'term');
  const card = async (act) => { for (let i = 0; i < 240; i++) { const t = await b.pg.evaluate((a) => { const e = document.querySelector(`#nowActs button[data-act="${a}"]`); const acts = document.getElementById('nowActs'); return e && acts && !acts.hidden ? 1 : 0; }, act).catch(() => 0); if (t) return true; await sleep(1000); } return false; };
  const press = (act) => b.pg.evaluate((a) => document.querySelector(`#nowActs button[data-act="${a}"]`).click(), act);
  const n0 = noor.st.rows.length;
  check(await card('wipe'), 'the block card shows the wipe button', '');
  await press('wipe');
  check(await card('wipe2'), 'the second confirmation card appears', '');
  await press('pick');
  const onLessons = await b.pg.waitForSelector('input[data-k]', { timeout: 30000 }).then(() => true).catch(() => false);
  check(onLessons, '«أختار الدروس بنفسي» opens the lessons screen', '');
  check(noor.st.rows.length === n0 && !(noor.st.deleted || []).length, 'nothing deleted', `${noor.st.rows.length}/${n0}`);
  return b;
});

T(28, 'The whole subject is already in Noor (the owner\'s screenshot): the full term no longer just says «موجودة في نور» — the same card offers «أمسح تحاضير هذه المادة…»; «حسنًا» keeps everything, the wipe (two confirmations) republishes the whole plan', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const pre = existingFor(tree, PKG.lessons.map((l) => l.id));
  const noor = env.noor({ tree, existing: pre });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-10-11', cont: false });
  await wizardTo(b.pg, 'term');
  const card = async (act) => { for (let i = 0; i < 60; i++) { const t = await b.pg.evaluate((a) => { const e = document.querySelector(`#nowActs button[data-act="${a}"]`); const acts = document.getElementById('nowActs'); return e && acts && !acts.hidden ? document.getElementById('nowText').innerText : null; }, act).catch(() => null); if (t) return t; await sleep(1000); } return null; };
  const press = (act) => b.pg.evaluate((a) => document.querySelector(`#nowActs button[data-act="${a}"]`).click(), act);
  const t1 = await card('wipe');
  check(!!t1 && /وجدت في نور/.test(t1) && /كلها فيها/.test(t1), 'a card appears (not just «موجودة في نور») with the wipe button', String(t1));
  check(!!(await b.pg.evaluate(() => document.querySelector('#nowActs button[data-act="ok"]'))), 'it also has a neutral «حسنًا»', '');
  const n0 = noor.st.rows.length;
  await press('wipe');
  const t2 = await card('wipe2');
  check(!!t2 && new RegExp(toAr(n0)).test(t2) && /لا يمكن التراجع/.test(t2), `the second card names the count (${n0})`, String(t2));
  check(noor.st.rows.length === n0, 'nothing deleted yet', '');
  await press('wipe2');
  const s = await waitDone(b.pg, 25 * 60000, 'wipe all then term');
  check(/تمت التعبئة بنجاح/.test(s.head), 'after the wipe the full term runs to «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check((noor.st.deleted || []).length === n0 && noor.st.rows.every((r) => !r.preexisting), `all ${n0} old preps deleted`, String((noor.st.deleted || []).length));
  check(noor.st.rows.length === PKG.lessons.length, `the whole plan (${PKG.lessons.length}) is published again`, `rows ${noor.st.rows.length}`);
  return b;
});

T(29, 'The whole subject is already in Noor and the teacher presses «حسنًا»: nothing is deleted and the usual «هذه الحصص موجودة في نور» ending shows', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree, existing: existingFor(tree, PKG.lessons.map((l) => l.id)) });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now: '2026-10-11', cont: false });
  await wizardTo(b.pg, 'term');
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { ok = await b.pg.evaluate(() => { const e = document.querySelector('#nowActs button[data-act="ok"]'); const a = document.getElementById('nowActs'); if (e && a && !a.hidden) { e.click(); return true; } return false; }).catch(() => false); if (!ok) await sleep(1000); }
  check(ok, 'the card appears with «حسنًا»', '');
  const s = await waitDone(b.pg, 40000, 'ok');
  check(/موجودة في نور|لا شيء ناقص|مكتمل/.test(s.head + s.text), 'the usual ending shows', `${s.head} | ${s.text}`);
  check(!(noor.st.deleted || []).length && noor.st.rows.every((r) => r.preexisting), 'nothing deleted or added', '');
  return b;
});

T(30, 'Pick mode near the term end (owner 2026-11-03): one typed date gives the chosen sessions consecutive class days; a session that would land after the term end (21 Jan) joins the nearest earlier session of the same lesson «(n و m)», so no prep is after the term', async (env) => {
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'pick');
  await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
  const g = lessonGroups(PKG).find((x) => x.sessions.length >= 4);
  check(!!g, 'the package has a lesson with 4+ sessions', '');
  if (!g) return b;
  const keyOf = (l) => l.unit + '|' + l.lesson;
  await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k).click(), keyOf(g.sessions[0])); await sleep(400);
  const ids = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.dataset.d));
  await b.pg.evaluate(([id, d]) => { const el = document.querySelector(`input[data-d="${id}"]`); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); }, [ids[0], '2027-01-17']);
  await sleep(300);
  const vals = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.value));
  check(vals.length === g.sessions.length && vals[vals.length - 1] >= '2027-01-20', `the derived dates run up to the term end, the last ones on days without a period (Wed/Thu) that move past it at save (${vals.join(', ')})`, '');
  await b.pg.click('#wzLessGo');
  const s = await waitDone(b.pg, 10 * 60000, 'pick near term end');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(rows.length && rows.every((r) => r.publishDate <= '2027-01-21'), 'no prep after the term end', rows.map((r) => r.publishDate + ' ' + r.title).join(' | '));
  const cover = new Map();
  rows.forEach((r) => g.sessions.forEach((l) => { if (norm(r.concepts).includes(norm(l.concepts))) cover.set(l.id, (cover.get(l.id) || 0) + 1); }));
  check(g.sessions.every((l) => cover.get(l.id) === 1), `every chosen session (${g.sessions.length}) is in exactly one prep`, JSON.stringify([...cover]));
  check(rows.some((r) => /\(\d+(?: و \d+)+\)$/.test(r.title)), 'the joined prep carries «(n و m)» in its title', rows.map((r) => r.title).join(' | '));
  return b;
});

// owner 2026-11-14: in «أختار الدروس بنفسي» the teacher chooses «كل حصة في تحضير» (as before) or «حصص الدرس في تحضير واحد»
T(37, 'Pick mode, «حصص الدرس في تحضير واحد» (owner 2026-11-14): the chosen sessions of a lesson are saved in ONE prep on one date «(n و m)» (five sessions → 3 + 2), different lessons never share a prep, a joined prep takes both periods of a section that has two that day, and a later separate run sees the joined sessions as already in Noor', async (env) => {
  const tree = treeFromPackage(PKG);
  const periods = { 0: [['1', 2], ['2', 1]], 1: [['1', 1], ['2', 1]], 2: [['1', 1], ['2', 1]], 3: [], 4: [] };
  const noor = env.noor({ tree, periods });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'pick');
  await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
  const keyOf = (l) => l.unit + '|' + l.lesson;
  const clickK = (k) => b.pg.evaluate((k) => { const cb = [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k); cb.click(); }, k);
  const typeD = (id, d) => b.pg.evaluate(([id, d]) => { const el = document.querySelector(`input[data-d="${id}"]`); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, d]);
  const boxes = () => b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.dataset.d + '=' + x.value));
  check(await b.pg.$$eval('#wzJoin .wz-seg-b.on', (a) => a.length === 1 && a[0].dataset.j === '0'), 'the lessons screen opens on «كل حصة في تحضير» (as before)', '');
  await clickK(keyOf(S[sid(4)])); await sleep(300);    // «1-2 الخلايا»: five sessions
  await clickK(keyOf(S[sid(9)])); await sleep(300);    // «1-3»: one session
  await clickK(keyOf(S[sid(10)])); await sleep(300);   // «2-1 الانتشار»: three sessions
  await b.pg.evaluate((id) => document.querySelector(`input[data-s="${id}"]`).click(), sid(12)); await sleep(300);   // without its third session
  check((await boxes()).length === 8, 'separate: a date box for each of the 8 chosen sessions', (await boxes()).join(', '));
  await b.pg.click('#wzJoin [data-j="true"]'); await sleep(400);
  const heads = [sid(4), sid(7), sid(9), sid(10)];
  check(JSON.stringify((await boxes()).map((x) => x.split('=')[0])) === JSON.stringify(heads), 'joined: one date box for each prep — «الخلايا» 3 + 2, «1-3» alone, «الانتشار» 1 و 2', (await boxes()).join(', '));
  await typeD(sid(4), '2026-12-06'); await sleep(300);
  check(JSON.stringify((await boxes()).map((x) => x.split('=')[1]).slice(0, 3)) === JSON.stringify(['2026-12-06', '2026-12-07', '2026-12-08']), 'one typed date: the next preps take the next class days, a day each', (await boxes()).join(', '));
  await typeD(sid(10), '2026-12-13'); await sleep(300);
  await b.pg.click('#wzLessGo');
  const s = await waitDone(b.pg, 10 * 60000, 'pick joined');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const nt = (id) => nodeFor(tree, S[id]).text;
  const want = [
    { ids: [4, 5, 6], title: `${nt(sid(4))} (1 و 2 و 3)`, date: '2026-12-06', slots: ['1|1', '1|2', '2|4'] },
    { ids: [7, 8], title: `${nt(sid(4))} (4 و 5)`, date: '2026-12-07', slots: ['1|1', '2|3'] },
    { ids: [9], title: nt(sid(9)), date: '2026-12-08', slots: ['1|1', '2|3'] },
    { ids: [10, 11], title: `${nt(sid(10))} (1 و 2)`, date: '2026-12-13', slots: ['1|1', '1|2', '2|4'] },
  ];
  check(rows.length === want.length, `exactly ${want.length} preps for the 8 chosen sessions (${rows.length})`, fmtRows(rows));
  for (const w of want) {
    const r = rows.find((x) => x.title === w.title);
    check(!!r, `prep «${w.title}» saved`, rows.map((x) => x.title).join(' | '));
    if (!r) continue;
    check(r.publishDate === w.date, `«${w.title}» on ${w.date}`, r.publishDate);
    check(w.ids.every((n) => norm(r.concepts).includes(norm(S[sid(n)].concepts))), `«${w.title}» holds the content of its ${w.ids.length} session(s)`, r.concepts.slice(0, 200));
    check(JSON.stringify((r.slots || []).slice().sort()) === JSON.stringify(w.slots), `«${w.title}» takes periods ${w.slots.join(', ')}`, JSON.stringify(r.slots));
  }
  check(!rows.some((r) => norm(r.concepts).includes(norm(S[sid(12)].concepts)) && !norm(S[sid(10)].concepts).includes(norm(S[sid(12)].concepts))), 'the unticked third session of «الانتشار» is in no prep', '');
  // a later run, separate again: sessions 1 and 2 of «الانتشار» are in Noor inside «(1 و 2)» — only the third is saved
  const n1 = noor.st.rows.length;
  await b.pg.reload(); await sleep(4000);
  await wizardTo(b.pg, 'pick', { name: false });
  await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
  check(await b.pg.$$eval('#wzJoin .wz-seg-b.on', (a) => a.length === 1 && a[0].dataset.j === 'true'), 'the choice «حصص الدرس في تحضير واحد» is remembered on the next open', '');
  await b.pg.click('#wzJoin [data-j="0"]'); await sleep(400);
  await clickK(keyOf(S[sid(10)])); await sleep(300);
  await typeD(sid(10), '2026-12-14'); await typeD(sid(11), '2026-12-15'); await typeD(sid(12), '2026-12-20'); await sleep(300);
  await b.pg.click('#wzLessGo');
  const s2 = await waitDone(b.pg, 8 * 60000, 'separate run after the joined one');
  const more = noor.st.rows.slice(n1);
  console.log(`    second run: ${s2.head} | ${s2.text}`);
  check(more.length === 1 && more[0].title === `${nt(sid(10))} (3)` && more[0].publishDate === '2026-12-20', 'the separate run saves only session 3 of «الانتشار» — 1 و 2 are already in Noor', fmtRows(more));
  return b;
});

// owner 2026-11-14: Arabic subjects — «تحضير لكل مهارة»: the consecutive sessions of one skill inside a lesson share a prep
T(38, 'Arabic grade 4, pick mode, «تحضير لكل مهارة» (owner 2026-11-14): the 20 sessions of a reading lesson are saved as one prep per skill in order — التحدث · القراءة (2–9) · الأنماط اللغوية · الإملاء · الخط · التعبير · القراءة · المراجعة — each on its own day, every session once', async (env) => {
  const file = JSON.parse(fs.readFileSync('/mnt/project-files/afaq-platform/preps/g1-5/ar-4-t1.json', 'utf8'));
  file.lessons = file.lessons.slice(0, 41);   // the review lesson, listening, the visual document, the first reading lesson, the poem
  file.lessons.forEach((l) => { l.pubDate = l.pubDate || l.publishDate; l.concepts = `${l.concepts || ''} (${l.id})`; });
  usePkg(file);
  const tree = treeFromPackage(PKG, { keepNumbers: true });
  const courses = [{ cid: 'AR4', title: 'اللغة العربية', level: 'الصف الرابع', subject: 'اللغة العربية', grade: 'الرابع', tree }];
  const periods = { 0: [['1', 1]], 1: [['1', 1]], 2: [['1', 1]], 3: [['1', 1]], 4: [['1', 1]] };
  const noor = env.noor({ tree, courses, periods });
  env.afaq.reset({ pkg: PKG, offer: { id: PKG.id, subject: 'اللغة العربية', grade: 4, title: 'اللغة العربية — الرابع', shift: 'one' } });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'pick', { grade: 'الصف الرابع', subject: 'اللغة العربية', shift: 'فترة واحدة' });
  await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
  const g = lessonGroups(PKG).find((x) => x.sessions.length === 20);
  check(!!g, 'the file has the 20-session reading lesson', '');
  if (!g) return b;
  check(await b.pg.$eval('#wzJoin [data-j="true"]', (x) => x.textContent.trim() === 'تحضير لكل مهارة'), 'an Arabic subject offers «تحضير لكل مهارة»', '');
  await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k).click(), g.key); await sleep(400);
  await b.pg.click('#wzJoin [data-j="true"]'); await sleep(400);
  const runs = [[1], [2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12], [13, 14, 15], [16], [17, 18], [19], [20]];
  const labels = await b.pg.$$eval('.wz-j span', (a) => a.map((x) => x.textContent.trim()));
  const boxIds = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.dataset.d));
  check(JSON.stringify(boxIds) === JSON.stringify(runs.map((r) => g.sessions[r[0] - 1].id)), 'one date box per skill prep, in the lesson\'s order', labels.join(' | '));
  check(['التحدث', 'القراءة', 'الأنماط اللغوية', 'الإملاء', 'الخط', 'التعبير', 'القراءة', 'المراجعة والتقويم'].every((k, i) => (labels[i] || '').startsWith(k)), 'each box names its skill', labels.join(' | '));
  await b.pg.evaluate(([id, d]) => { const el = document.querySelector(`input[data-d="${id}"]`); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); }, [boxIds[0], '2026-12-06']);
  await sleep(300);
  const shown = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.value));
  check(shown.every((x) => /^\d{4}-\d\d-\d\d$/.test(x)) && new Set(shown).size === runs.length && shown.join() === shown.slice().sort().join(), 'one typed date: each following skill prep on the next class day', shown.join(', '));
  await b.pg.click('#wzLessGo');
  const s = await waitDone(b.pg, 15 * 60000, 'arabic by skill');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(rows.length === runs.length, `exactly ${runs.length} preps for the 20 sessions (${rows.length})`, fmtRows(rows));
  const node = nodeFor(tree, g.sessions[0]).text;
  runs.forEach((r, i) => {
    const sk = ['التحدث', 'القراءة', 'الأنماط اللغوية', 'الإملاء', 'الخط', 'التعبير', 'القراءة', ''][i];
    const title = (sk ? `مهارة ${sk}: ` : '') + (r.length > 1 ? `${node} (${r.join(' و ')})` : r[0] > 1 ? `${node} (${r[0]})` : node);
    const row = rows.find((x) => x.title === title);
    check(!!row, `prep «${title.slice(-34)}» saved`, rows.map((x) => x.title).join(' | '));
    if (!row) return;
    check(row.publishDate === shown[i], `…on ${shown[i]}`, row.publishDate);
    check(r.every((n) => row.concepts.includes(`(${g.sessions[n - 1].id})`)) && g.sessions.filter((l, k) => !r.includes(k + 1)).every((l) => !row.concepts.includes(`(${l.id})`)), `…with the content of sessions ${r.join(', ')} only`, row.concepts.slice(0, 300));
  });
  return b;
});

// «تحضير لكل مهارة» in the full term (owner 2026-11-14, Arabic subjects): the consecutive sessions of one skill in a lesson are ONE
// prep on the date of the first of them; every session still keeps its own period of the timetable (so the term keeps its pace),
// and the prep covers the periods of its sessions that fall on its own day. Expected rows are computed per section from the
// timetable: each session takes the section's next period; a prep holds the sections whose first session of the group fell on
// the same day
async function arabic4(n = 41) {
  const file = JSON.parse(fs.readFileSync('/mnt/project-files/afaq-platform/preps/g1-5/ar-4-t1.json', 'utf8'));
  file.lessons = file.lessons.slice(0, n);
  file.lessons.forEach((l) => { l.pubDate = l.pubDate || l.publishDate; l.concepts = `${l.concepts || ''} (${l.id})`; });
  usePkg(file);
  globalThis.chrome = globalThis.chrome || { storage: { local: { get: async () => ({}), set: async () => {} } }, runtime: {} };
  const { joinRuns } = await import(path.join(REPO, 'extension/packages.js'));
  const tree = treeFromPackage(PKG, { keepNumbers: true });
  const courses = [{ cid: 'AR4', title: 'اللغة العربية', level: 'الصف الرابع', subject: 'اللغة العربية', grade: 'الرابع', tree }];
  const offer = { id: PKG.id, subject: 'اللغة العربية', grade: 4, title: 'اللغة العربية — الرابع', shift: 'one' };
  const runs = lessonGroups(PKG).flatMap((g) => joinRuns(PKG, g.sessions).map((r) => ({ g, ls: r.ls, skill: r.skill })));
  return { tree, courses, offer, runs, wz: { grade: 'الصف الرابع', subject: 'اللغة العربية', shift: 'فترة واحدة', style: 'skill' } };
}
// 4.10.41: in «تحضير لكل مهارة» the prep title starts with its skill — «مهارة الإملاء: الدرس … (13 و 14 و 15)» (review preps: no skill name)
const TAGGED = ['التحدث', 'الاستماع', 'القراءة', 'الأنماط اللغوية', 'الإملاء', 'الخط', 'التعبير', 'الكتابة'];
function skillWant(A, periods) {
  const secs = [...new Set(Object.values(periods).flatMap((v) => v.map(([sec]) => sec)))].sort();
  const day1 = PKG.lessons.map((l) => l.pubDate).sort()[0];
  const at = {};
  for (const sec of secs) {
    at[sec] = {};
    let d = day1, used = 0;
    const cap = (iso) => (periods[new Date(iso + 'T12:00').getDay()] || []).filter(([x]) => x === sec).reduce((a, [, k]) => a + k, 0);
    for (const l of PKG.lessons) { for (let i = 0; i < 400 && used >= cap(d); i++) { d = addDaysIso(d, 1); used = 0; } at[sec][l.id] = d; used++; }
  }
  const want = [];
  for (const r of A.runs) {
    const byD = {};
    secs.forEach((sec) => { const d = at[sec][r.ls[0].id]; (byD[d] = byD[d] || []).push(sec); });
    const ns = r.ls.map((l) => r.g.sessions.indexOf(l) + 1), node = nodeFor(A.tree, r.ls[0]).text;
    // the periods of the prep: for each of its sections, the periods (by their order in the day) of its sessions that fall on its day
    const rank = (sec, l, d) => PKG.lessons.filter((x) => at[sec][x.id] === d).indexOf(l) + 1;
    // the mock numbers a day's periods section after section, leaving one number between sections (noor-mock.mjs)
    const p0 = (sec, d) => { let n = 1; for (const [x, k] of periods[new Date(d + 'T12:00').getDay()] || []) { if (x === sec) return n; n += k + 1; } return n; };
    const tag = TAGGED.includes(r.skill) ? `مهارة ${r.skill}: ` : '';
    for (const [d, ss] of Object.entries(byD)) want.push({ title: tag + (ns.length > 1 ? `${node} (${ns.join(' و ')})` : ns[0] > 1 ? `${node} (${ns[0]})` : node), date: d, ids: r.ls.map((l) => l.id),
      slots: ss.flatMap((sec) => r.ls.filter((l) => at[sec][l.id] === d).map((l) => `${sec}|${p0(sec, d) + rank(sec, l, d) - 1}`)) });
  }
  return want;
}
function checkSkillTerm(name, rows, A, periods) {
  const want = skillWant(A, periods);
  const sig = (t, d, sl) => `${t} @${d} periods ${sl.map(String).sort().join(' ')}`;
  // Noor adds « (j)» itself to the j-th prep of one lesson on one date (the tool sends the bare name when j is the session number)
  const sent = (r) => { const j = r.dayRank, suf = ` (${j})`; return !j || j < 2 || r.title.replace(/^مهارة [^:]+: /, '') === r.nodeText + suf || !r.title.endsWith(suf) ? r.title : r.title.slice(0, -suf.length); };
  const got = rows.map((r) => sig(sent(r), r.publishDate, r.slots || [])).sort();
  const exp = want.map((w) => sig(w.title, w.date, w.slots)).sort();
  const miss = exp.filter((x) => !got.includes(x)), extra = got.filter((x) => !exp.includes(x));
  check(rows.length === want.length, `${name}: ${want.length} preps for the ${PKG.lessons.length} sessions (${rows.length})`, '');
  check(!miss.length && !extra.length, `${name}: a prep per skill group on the date of its first session, on exactly the periods of its sessions of that day (per section); every session keeps its own period`, `missing:\n${miss.slice(0, 12).join('\n')}\nextra:\n${extra.slice(0, 12).join('\n')}`);
  const bad = want.filter((w) => { const rs = rows.filter((r) => r.publishDate === w.date && w.ids.every((id) => r.concepts.includes(`(${id})`))); return rs.length !== 1 || PKG.lessons.some((l) => !w.ids.includes(l.id) && rs[0].concepts.includes(`(${l.id})`)); });
  check(!bad.length, `${name}: each prep holds the content of exactly its sessions`, bad.slice(0, 8).map((w) => `${w.title} @${w.date}`).join('\n'));
  const seen = new Map(), clash = [];
  rows.forEach((r) => (r.slots || []).forEach((x) => { const k = r.publishDate + '|' + x; if (seen.has(k)) clash.push(k); seen.set(k, 1); }));
  check(!clash.length, `${name}: no period holds two preps`, clash.join(', '));
  return want;
}
T(39, 'Arabic grade 4, full term, «تحضير لكل مهارة» (owner 2026-11-14): two sections with the same timetable (two periods a day: the ten sessions a week of the plan): a prep per skill group in tree order, each on the date of its first session, the 20-session reading lesson = 8 preps; the wizard asks the style once; a re-run adds nothing', async (env) => {
  const A = await arabic4();
  const periods = Object.fromEntries([0, 1, 2, 3, 4].map((d) => [d, [['1', 2], ['2', 2]]]));
  const noor = env.noor({ tree: A.tree, courses: A.courses, periods });
  env.afaq.reset({ pkg: PKG, offer: A.offer });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', A.wz);
  const s = await waitDone(b.pg, 25 * 60000, 'arabic term by skill');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(!CALM_BAD_RE.test(`${s.head} ${s.text}`), 'the ending is calm', `${s.head} | ${s.text}`);
  checkSkillTerm('S39', rows, A, periods);
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run', A.wz);
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});
T(40, 'Arabic grade 4, full term, «تحضير لكل مهارة», sections with DIFFERENT periods (ten a week each: section 1 three on Sunday and one on Thursday, section 2 two a day): each section keeps its own sequence period after period; a skill prep is saved for the sections whose group starts on the same day', async (env) => {
  const A = await arabic4();
  const periods = { 0: [['1', 3], ['2', 2]], 1: [['1', 2], ['2', 2]], 2: [['1', 2], ['2', 2]], 3: [['1', 2], ['2', 2]], 4: [['1', 1], ['2', 2]] };
  const noor = env.noor({ tree: A.tree, courses: A.courses, periods });
  env.afaq.reset({ pkg: PKG, offer: A.offer });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', A.wz);
  const s = await waitDone(b.pg, 40 * 60000, 'arabic term by skill, per section');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  checkSkillTerm('S40', rows, A, periods);
  const n1 = noor.st.rows.length;
  await rerun(b, 'manual re-run', A.wz);
  check(noor.st.rows.length === n1, `re-run adds nothing (rows ${n1} → ${noor.st.rows.length})`, fmtRows(noor.st.rows.slice(n1)));
  return b;
});
T(41, 'Arabic grade 4, full term, «تحضير لكل مهارة», the tool is closed after a few preps and opened again (fresh local record): the term continues, and the periods of the sessions inside the preps already in Noor stay theirs — the final dates are those of an uninterrupted run', async (env) => {
  const A = await arabic4();
  const periods = Object.fromEntries([0, 1, 2, 3, 4].map((d) => [d, [['1', 2]]]));
  const noor = env.noor({ tree: A.tree, courses: A.courses, periods });
  env.afaq.reset({ pkg: PKG, offer: A.offer });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', A.wz);
  for (const t0 = Date.now(); Date.now() - t0 < 10 * 60000 && noor.st.rows.length < 5;) { await confirmStart(b.pg); await sleep(700); }
  const cut = noor.st.rows.length;
  check(cut >= 5, `the tool is closed after ${cut} preps`, '');
  await b.pg.evaluate(() => chrome.storage.local.remove('semesterRun')).catch(() => {});   // closed for good: no unfinished run to resume
  const s = await rerun(b, 'opened again', A.wz);
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح|موجودة في نور/.test(s.head), 'the second opening finishes the term', `${s.head} | ${s.text}`);
  checkSkillTerm('S41', rows, A, periods);
  return b;
});

// owner 2026-11-03: a teacher registered by name stayed «waiting» because Noor was open on a page other than the home page (the name
// is in the home page's welcome), so «حاضر» never read her Noor account and the server could not match her name
T(31, 'Activation by the Noor name: Noor is open on a course page (no name there) — the tool opens Noor\'s home page itself, reads the name, the server activates by it and the full term runs; the waiting screen tells the teacher to keep Noor\'s home page open', async (env) => {
  usePkg(derivePkg({ keep: range(1, 6) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree, whoHomeOnly: true });
  env.afaq.reset({ pkg: PKG, trialLeft: 0, mergeOnNoor: true, mergeNeedsName: true });
  const b = await env.launch(noor);
  const np = await b.ctx.newPage();
  await np.goto('https://lms.moe.gov.om/teacher/courses/preparations_index/cid:BIO9').catch(() => {});
  await b.pg.bringToFront();
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 10 * 60000, 'activation by the Noor name');
  const named = env.afaq.st.noor.filter((a) => a.p_name);
  check(named.length >= 1 && named.every((a) => a.p_name === 'سالم علي'), `the tool sent the Noor name read from the home page (${named.length} calls with a name)`, JSON.stringify(env.afaq.st.noor));
  check(env.afaq.st.merged >= 1, 'the server activated the subscription by the Noor name (ext_noor → merged)', env.afaq.st.calls.join(' '));
  // the name is only on the home page here, so a call carrying it means the tool read Noor's home page
  check(/https:\/\/lms\.moe\.gov\.om\/teacher\/courses\/preparations_index/.test(np.url()) || np.isClosed(), 'the teacher\'s own Noor tab was not taken over', np.isClosed() ? 'closed' : np.url());
  check(/تمت التعبئة بنجاح/.test(s.head), 'the full term runs after the activation', `${s.head} | ${s.wzHead || ''} | ${s.text}`);
  assertRows('S31', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  return b;
});

// owner 2026-11-03: no typing, no waiting — the name comes from Noor's home page; a name the admin has not registered yet shows the
// contact screen with that name, and once the admin registers it the subscription opens and the term runs by itself
T(32, 'Name from Noor, not registered yet: no name to type — the request carries the Noor name, the waiting screen shows it; when the admin registers the name the term starts by itself', async (env) => {
  usePkg(derivePkg({ keep: range(1, 6) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree, whoHomeOnly: true });
  env.afaq.reset({ pkg: PKG, trialLeft: 0, mergeOnNoor: false, mergeNeedsName: true });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 6 * 60000, 'name not registered');
  check(env.afaq.st.startName === 'سالم علي', `the request carries the name read from Noor («${env.afaq.st.startName}»), nothing typed`);
  check(s.wiz && /تفعيل اشتراكك/.test(s.wzHead) && /سالم علي/.test(s.wzBody || ''), 'the waiting screen shows the teacher\'s Noor name', JSON.stringify(s));
  check(noor.st.rows.filter((r) => !r.preexisting).length === 0, 'nothing saved before the name is registered');
  env.afaq.st.mergeOnNoor = true;   // the admin adds the name in «المسجّلون بالاسم»
  for (const t0 = Date.now(); Date.now() - t0 < 90000;) { const u = await ui(b.pg).catch(() => null); if (u && !(u.wiz && /تفعيل اشتراكك/.test(u.wzHead))) break; await sleep(1500); }
  const s2 = await waitDone(b.pg, 10 * 60000, 'after the name is registered');
  check(env.afaq.st.merged >= 1, 'the subscription opened by the Noor name (ext_noor → merged)', env.afaq.st.calls.join(' '));
  check(/تمت التعبئة بنجاح/.test(s2.head), 'the full term runs by itself after the name is registered', `${s2.head} | ${s2.wzHead || ''} | ${s2.text}`);
  assertRows('S32', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
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

// real 2026-11-08 (owner's report, Islamic grade 10): the site held a tree a grade-11 teacher read under the grade-10 subject (29 other
// lessons). The grade-10 teacher's full Noor tree (fewer lessons) looked «partial» next to it, so 4.10.37 took the site tree, matched
// nothing and ended at once with nothing saved, every run.
T(33, 'The site holds a bigger tree of another book for this subject: the teacher\'s full Noor tree is used (not the site\'s), every session gets its prep, and the real tree is sent to the site', async (env) => {
  usePkg(derivePkg({ keep: range(1, 24) }));
  const tree = treeFromPackage(PKG);
  const n = tree.terms[0].units.reduce((a, u) => a + u.lessons.length, 0);
  const other = Array.from({ length: n * 2 + 5 }, (_, i) => ({ u: `الوحدة (${1 + Math.floor(i / 5)})`, t: `درس من كتاب آخر رقم ${i + 1}` }));
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, serverTree: other });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 20 * 60000, 'other site tree');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(env.afaq.st.calls.includes('ext_tree_get'), 'the site tree was asked for (the live tree has fewer lessons)', env.afaq.st.calls.join(','));
  assertRows('S33', rows, tree, { expectIds: PKG.lessons.map((l) => l.id), dates: Object.fromEntries(PKG.lessons.map((l) => [l.id, l.pubDate])) });
  check(env.afaq.st.trees.length === 1 && env.afaq.st.trees[0].lessons.length === n, `the teacher's real Noor tree (${n} lessons) is sent to the site`, JSON.stringify(env.afaq.st.trees.map((t) => t.lessons.length)));
  return b;
});

T(35, 'The «إضافة تحضير» page never finishes loading (a picture on it hangs) but its fields and editors are ready: the tool fills anyway instead of stopping with «تعذّر فتح نموذج إضافة تحضير», and every session is saved', async (env) => {
  usePkg(derivePkg({ keep: range(1, 4) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree, hangForm: true });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 25 * 60000, 'full term, form page never complete');
  check((noor.st.hung || 0) > 0, `the form page really kept loading (${noor.st.hung || 0} hung requests)`);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح» (not «تعذّر فتح نموذج»)', `${s.head} | ${s.text}`);
  assertRows('form never complete', noor.st.rows.filter((r) => !r.preexisting), tree, { expectIds: PKG.lessons.map((l) => l.id) });
  return b;
});

T(36, 'Noor\'s home page opens but shows no course cards (one teacher, 2026-11-11): the run ends calmly with nothing saved, and what the tool saw on that page goes to the admin\'s fill log only — never onto the teacher\'s screen', async (env) => {
  usePkg(derivePkg({ keep: range(1, 3) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree, noCards: true });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  const s = await waitDone(b.pg, 25 * 60000, 'full term, no course cards on the home page');
  const seen = await b.pg.evaluate(() => document.body.innerText);
  check(!noor.st.rows.filter((r) => !r.preexisting).length, 'nothing was saved in Noor');
  check(!/home a=|cid=\d|box=\d/.test(seen), 'the page summary is not shown to the teacher', (seen.match(/.{0,40}home a=.{0,60}/) || [''])[0]);
  let rows = [];
  for (let i = 0; i < 40 && !rows.some((r) => r.status === 'end'); i++) { rows = env.afaq.st.logRows || []; await sleep(500); }
  const st = rows.find((r) => r.status === 'start') || {}, en = rows.find((r) => r.status === 'end') || {};
  check(/بطاقات المواد/.test(en.note || ''), 'the fill log\'s end row says why the run stopped', `${s.head} | ${en.note}`);
  check(/home a=\d+ cid=1 prep=0 box=0 /.test(st.note || '') && /\/teacher\/courses\/view\/cid:\*/.test(st.note || '') && /\/teacher\/messages\/index\/#/.test(st.note || ''), 'the start row carries what the home page held: link counts and link shapes without ids', st.note);
  check((st.note || '').length <= 300 && !/XYZ9/.test(st.note || ''), 'the summary fits the log and carries no course id', st.note);
  return b;
});

T(34, 'Noor\'s clock is ahead of the teacher\'s computer (or another time zone): a homework whose computed publish time Noor sees as past is published at Noor\'s own suggested time instead, due and late dates moved with it, and every saved prep still gets its homework', async (env) => {
  usePkg(derivePkg({ keep: range(1, 5) }));
  const tree = treeFromPackage(PKG);
  const hwNow = '2027-06-01 10:00';   // after every date of the term: every publish time the tool computes is «in the past» for Noor
  const noor = env.noor({ tree, hwNow });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', { hw: true });
  const s = await waitDone(b.pg, 25 * 60000, 'full term + homework, Noor clock ahead');
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  assertRows('term+homework (Noor clock ahead)', rows, tree, { expectIds: PKG.lessons.map((l) => l.id) });
  const errs = noor.st.hwPosts.filter((x) => !/^ok/.test(x.outcome));
  check(!errs.length, 'Noor refused no homework («تاريخ النشر يجب ألا يكون في الماضي» never came back)', errs.map((x) => `${x.kind} ${x.aid || ''}: ${x.outcome}`).join('\n'));
  const want = rows.map((r) => sessionOfRow(r)).filter(Boolean).map((l) => hwWant(tree, l));
  const titles = new Set(noor.st.homeworks.map((h) => h.title));
  const missing = want.filter((w) => !titles.has(w.title));
  check(!missing.length && noor.st.homeworks.length === want.length, `a homework for each saved prep (${want.length})`, `got ${noor.st.homeworks.length}; missing: ${missing.map((w) => w.title).join(' | ')}`);
  const t = (x) => Date.parse(String(x).slice(0, 16).replace(' ', 'T') + 'Z');
  const bad = noor.st.homeworks.filter((h) => !(h.publish.slice(0, 16) >= hwNow && t(h.publish) - t(hwNow) <= 30 * 60000 && t(h.due) - t(h.publish) === 3 * 86400000 && t(h.cutoff) - t(h.publish) === 5 * 86400000));
  check(!bad.length, 'each homework published within half an hour after Noor\'s «now» (its suggestion + 5 minutes), due 3 days and late 5 days after the publish time', bad.map((h) => `«${h.title}»: ${h.publish} / ${h.due} / ${h.cutoff}`).join('\n'));
  const log = (await dumpLog(b.pg)).join('\n');
  check(!/واجب لم يُضف/.test(log), 'no homework line the teacher could read as a problem', log.split('\n').filter((x) => /واجب/.test(x)).join('\n'));
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
  check(!dup.length, `${label}one homework per session (no duplicate)`, dup.map(([t, v]) => `«${t}» ×${v.length}`).join('\n'));
  const missing = want.filter((w) => !byTitle.has(w.title));
  check(!missing.length && hws.length === want.length, `${label}a homework for each saved prep (${want.length}), titled «واجب: <Noor lesson>» and «… — الحصة الثانية»…`, `got ${hws.length}: ${hws.map((h) => h.title).join(' | ')}\nmissing: ${missing.map((w) => w.title).join(' | ')}`);
  // each session's homework has its own questions (the file gives every session a set)
  const same = want.filter((w) => w.m > 1).filter((w) => { const a = (byTitle.get(w.title) || [])[0], b = (byTitle.get(w.first) || [])[0]; return a && b && JSON.stringify(a.qs.map((q) => q.text)) === JSON.stringify(b.qs.map((q) => q.text)); });
  check(!same.length, `${label}a later session's homework has other questions than the lesson's first`, same.map((w) => w.title).join(' | '));
  const bad = [];
  for (const w of want) {
    const h = (byTitle.get(w.title) || [])[0];
    if (!h) continue;
    const prep = noor.st.rows.find((r) => r.id === h.prepId);
    const why = [];
    if (!prep || prep.lessonId !== w.node.nodeId) why.push(`prep ${h.prepId} → ${prep ? prep.nodeText : 'none'}`);
    if (prep && w.prepId && prep.id !== w.prepId) why.push(`prep ${prep.id} expected ${w.prepId} (this session's prep)`);
    if (!h.lessons.includes(w.node.nodeId)) why.push(`lessons ${h.lessons.join(',')}`);
    const d = pubOf(w);
    if (h.publish !== `${d} 07:00:00`) why.push(`publish ${h.publish} expected ${d} 07:00:00`);
    if (h.due !== `${addDaysIso(d, 3)} 07:00:00` || h.cutoff !== `${addDaysIso(d, 5)} 07:00:00`) why.push(`due ${h.due} cutoff ${h.cutoff}`);
    if (h.view !== 'view_answers_after_cutoff') why.push(`view ${h.view}`);
    if (h.lectures.length !== 2) why.push(`sections ${h.lectures.join(',')}`);
    const types = h.qs.map((q) => q.type).join(',');
    if (h.qs.length !== 5 || types !== 'mcq,mcq,mcq,mcq,mcq' || h.qs.some((q) => q.mark !== 10)) why.push(`questions ${h.qs.length} [${types}] marks ${h.qs.map((q) => q.mark).join(',')}`);
    if (why.length) bad.push(`«${w.title}»: ${why.join('; ')}`);
  }
  const pos = new Set(hws.flatMap((h) => h.qs.filter((q) => q.options && q.options.length > 2).map((q) => q.correct)));
  check(pos.size >= 2, `${label}the right answer is not always the same choice (positions used: ${[...pos].sort().join(',')})`, '');
  check(!bad.length, `${label}each homework: its lesson's prep + Noor lesson, published on the prep's date (due +3, late +5 days, answers after the late date), both sections, 5 multiple-choice questions (true/false as two choices), 1 mark each`, bad.join('\n'));
};

// title of a session's homework (as the tool writes it): the lesson's first session «واجب: <Noor lesson>», then «… — الحصة الثانية»…
const HW_ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
const hwTitleOf = (node, m) => 'واجب: ' + node.text + (m > 1 ? ' — الحصة ' + (HW_ORD[m - 1] || String(m).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])) : '');
const hwWant = (tree, l, extra) => {
  const node = nodeFor(tree, l), g = lessonGroups(PKG).find((x) => x.sessions.some((y) => y.id === l.id));
  const m = g ? g.sessions.findIndex((y) => y.id === l.id) + 1 : 1;
  return Object.assign({ node, m, title: hwTitleOf(node, m), first: hwTitleOf(node, 1) }, extra);
};
T(22, 'Full term with «أضف واجبًا لكل درس»: every saved prep (session) gets its own homework of five questions, and a re-run adds none', async (env) => {
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
  const want = rows.map((r) => sessionOfRow(r)).filter(Boolean).map((l) => { const r = rows.find((x) => sessionOfRow(x) === l); return hwWant(tree, l, { prepId: r.id, date: r.publishDate }); });
  check(want.length > lessonGroups(PKG).length, `the package has lessons of several sessions (${want.length} preps for ${lessonGroups(PKG).length} lessons)`);
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

T(48, 'Full term with homework «واجب لكل عنوان» (owner 2026-11-17): ONE homework per Noor lesson, linked to its first saved prep and published on that date, titled «واجب: <Noor lesson>» with no session number; a re-run adds none', async (env) => {
  usePkg(derivePkg({ keep: range(1, 9) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', { hw: true, hwPer: 'lesson' });
  const s = await waitDone(b.pg, 25 * 60000, 'full term + homework per lesson');
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const rows = noor.st.rows.filter((r) => !r.preexisting).slice().sort((a, b) => a.publishDate.localeCompare(b.publishDate) || a.id - b.id);
  assertRows('term+homework per lesson', rows, tree, { expectIds: PKG.lessons.map((l) => l.id) });
  const want = [], seen = new Set();
  rows.forEach((r) => { const l = sessionOfRow(r); if (!l) return; const node = nodeFor(tree, l); if (seen.has(node.nodeId)) return; seen.add(node.nodeId); want.push({ node, m: 1, title: hwTitleOf(node, 1), first: hwTitleOf(node, 1), prepId: r.id, date: r.publishDate }); });
  check(rows.length > want.length, `the package has lessons of several sessions (${rows.length} preps for ${want.length} Noor lessons)`);
  hwChecks(noor, tree, want, { pubOf: (w) => w.date });
  check(!noor.st.homeworks.some((h) => /الحصة/.test(h.title)), 'no homework title carries a session number', noor.st.homeworks.map((h) => h.title).join(' | '));
  const n1 = noor.st.homeworks.length, r1 = noor.st.rows.length;
  await b.pg.reload(); await sleep(4000);
  await wizardTo(b.pg, 'term', { hw: true, name: false });
  await waitDone(b.pg, 10 * 60000, 're-run');
  check(noor.st.homeworks.length === n1 && noor.st.rows.length === r1, `re-run adds no prep and no homework (homeworks ${n1} → ${noor.st.homeworks.length}, preps ${r1} → ${noor.st.rows.length})`);
  return b;
});

T(49, '«الواجبات فقط» with «واجب لكل عنوان»: choosing a lesson gives ONE publish box and ONE due box (no per-session boxes), one homework per lesson with the lesson\'s first questions, no session number in the title', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  const tree = treeFromPackage(PKG);
  const groups = lessonGroups(PKG);
  const now = groups[0].sessions[0].pubDate;
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now, cont: false });
  const lessons = groups.filter((g) => g.sessions.length > 1).slice(0, 2).concat(groups.filter((g) => g.sessions.length === 1).slice(0, 1));
  check(lessons.length === 3, 'two multi-session lessons and a one-session lesson', lessons.map((g) => g.sessions.length).join(','));
  await wizardTo(b.pg, 'hw', { hwPer: 'lesson' });
  await b.pg.waitForSelector('input[data-hk]', { timeout: 60000 });
  const on = await b.pg.$$eval('#wzHwPer .wz-seg-b.on', (a) => a.map((x) => x.dataset.hper));
  check(on.join() === 'lesson', '«واجب لكل عنوان» is selected on the homework screen too', on.join());
  for (const g of lessons) { await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-hk]')].find((c) => c.dataset.hk === k).click(), g.key); await sleep(300); }
  const hs = await b.pg.evaluate(() => document.querySelectorAll('input[data-hs]').length);
  const hp = await b.pg.$$eval('input[data-hp]', (a) => a.map((x) => x.dataset.hp));
  check(hs === 0 && JSON.stringify(hp) === JSON.stringify(lessons.map((g) => g.sessions[0].id)), 'one publish box per chosen lesson, no session checkboxes', `${hs} session boxes · ${hp.join(', ')}`);
  const pubs = lessons.map((g, i) => addDaysIso(now, 4 + i * 7));
  for (let i = 0; i < lessons.length; i++) {
    await b.pg.evaluate(([k, v]) => { const d = document.querySelector(`input[data-hp="${CSS.escape(k)}"]`); d.value = v; d.dispatchEvent(new Event('change')); }, [lessons[i].sessions[0].id, pubs[i]]);
  }
  await b.pg.click('#wzHwGo');
  const s = await waitDone(b.pg, 15 * 60000, 'homework per lesson');
  const hws = noor.st.homeworks;
  check(hws.length === lessons.length, `one homework per chosen lesson (${lessons.length})`, hws.map((h) => h.title).join(' | '));
  const bad = [];
  lessons.forEach((g, i) => {
    const node = nodeFor(tree, g.sessions[0]), t = hwTitleOf(node, 1), h = hws.find((y) => y.title === t);
    if (!h) { bad.push(`«${t}»: none`); return; }
    if (h.publish !== `${pubs[i]} 07:00:00`) bad.push(`«${t}»: publish ${h.publish}`);
    if (h.qs.length !== 5) bad.push(`«${t}»: ${h.qs.length} questions`);
  });
  check(!bad.length, 'each: «واجب: <Noor lesson>», the typed date, five questions', bad.join('\n'));
  check(!noor.st.rows.some((r) => !r.preexisting), 'no prep saved');
  check(!CALM_BAD_RE.test(s.head + ' ' + s.text), 'calm wording', `${s.head} | ${s.text}`);
  return b;
});

T(23, '«الواجبات فقط»: the teacher picks sessions and types a publish date and a due date for each — a homework per chosen session, linked to the Noor lesson only (no prep), no prep saved; a re-run with the same sessions adds none', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  const tree = treeFromPackage(PKG);
  const groups = lessonGroups(PKG);
  const now = groups[0].sessions[0].pubDate;
  const noor = env.noor({ tree, existing: existingFor(tree, PKG.lessons.slice(0, 3).map((l) => l.id)) });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now, cont: false });
  // three lessons: every session of each gets its own homework, except the last session of the first multi-session lesson,
  // which the teacher unticks; sessions with both dates, and some with the publish date only (due → 3 days later)
  const lessons = [groups[1], groups[3], groups[2]];
  const multi = lessons.find((g) => g.sessions.length > 1);
  check(!!multi, 'a chosen lesson has several sessions', lessons.map((g) => g.sessions.length).join(','));
  const drop = multi ? multi.sessions[multi.sessions.length - 1].id : '';
  const picks = [];
  lessons.forEach((g, gi) => g.sessions.forEach((l, k) => { if (l.id === drop) return; const pub = addDaysIso(now, 4 + gi * 7 + k); picks.push({ g, l, pub, due: (gi + k) % 2 ? '' : addDaysIso(pub, gi === 2 ? 0 : 4) }); }));
  const pickAndGo = async (first) => {
    await b.pg.waitForSelector('input[data-hk]', { timeout: 60000 });
    const boxes = await b.pg.evaluate(() => [...document.querySelectorAll('.wz-date')].length);
    check(boxes === 0, `${first ? '' : 're-run: '}no date box before a lesson is chosen (no suggested date)`, `${boxes} boxes`);
    for (const g of lessons) { await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-hk]')].find((c) => c.dataset.hk === k).click(), g.key); await sleep(300); }
    const nAll = lessons.reduce((a, g) => a + g.sessions.length, 0);
    const pre = await b.pg.evaluate(() => [...document.querySelectorAll('input[data-hp],input[data-hd]')].map((d) => d.value));
    check(pre.length === nAll * 2 && pre.every((v) => !v), `${first ? '' : 're-run: '}choosing a lesson chooses all its sessions, each with an empty publish box and an empty due box`, `${pre.length} boxes for ${nAll} sessions: ${JSON.stringify(pre)}`);
    if (drop) { await b.pg.evaluate((id) => document.querySelector(`input[data-hs="${CSS.escape(id)}"]`).click(), drop); await sleep(300); }
    const after = await b.pg.evaluate(() => document.querySelectorAll('input[data-hp]').length);
    check(after === picks.length, `${first ? '' : 're-run: '}an unticked session loses its date boxes (${picks.length} left)`, `${after}`);
    for (const x of picks) {
      await b.pg.evaluate(({ k, pub, due }) => {
        const set = (sel, v) => { const d = document.querySelector(sel); d.value = v; d.dispatchEvent(new Event('change')); };
        set(`input[data-hp="${CSS.escape(k)}"]`, pub); if (due) set(`input[data-hd="${CSS.escape(k)}"]`, due);
      }, { k: x.l.id, pub: x.pub, due: x.due });
    }
    await b.pg.click('#wzHwGo');
    return waitDone(b.pg, 15 * 60000, 'homework only');
  };
  await wizardTo(b.pg, 'hw');
  const s = await pickAndGo(true);
  const added = noor.st.rows.filter((r) => !r.preexisting);
  check(!added.length && !noor.st.posts.length, `no prep saved (${noor.st.posts.length} prep posts)`, fmtRows(added));
  const errs = noor.st.hwPosts.filter((x) => !/^ok/.test(x.outcome));
  check(!errs.length, 'every homework form Noor received was valid (create + bulk questions)', errs.map((x) => `${x.kind} ${x.aid || ''}: ${x.outcome}`).join('\n'));
  const hws = noor.st.homeworks;
  check(hws.length === picks.length, `a homework for each chosen session only (${picks.length})`, hws.map((h) => h.title).join(' | '));
  const bad = [];
  for (const x of picks) {
    const w = hwWant(tree, x.l), node = w.node;
    const h = hws.find((y) => y.title === w.title);
    if (!h) { bad.push(`«${w.title}»: none`); continue; }
    const why = [];
    if (h.prepId) why.push(`prep ${h.prepId} (expected none)`);
    if (h.lessons.join() !== node.nodeId) why.push(`lessons ${h.lessons.join(',')} expected ${node.nodeId}`);
    if (h.publish !== `${x.pub} 07:00:00`) why.push(`publish ${h.publish}`);
    const due = x.due ? `${x.due} 23:59:00` : `${addDaysIso(x.pub, 3)} 07:00:00`;
    const cut = x.due ? `${addDaysIso(x.due, 2)} 23:59:00` : `${addDaysIso(x.pub, 5)} 07:00:00`;
    if (h.due !== due || h.cutoff !== cut) why.push(`due ${h.due} cutoff ${h.cutoff} expected ${due} / ${cut}`);
    if (h.view !== 'view_answers_after_cutoff') why.push(`view ${h.view}`);
    if (h.lectures.length !== 2) why.push(`sections ${h.lectures.join(',')}`);
    const types = h.qs.map((q) => q.type).join(',');
    if (h.qs.length !== 5 || types !== 'mcq,mcq,mcq,mcq,mcq' || h.qs.some((q) => q.mark !== 10)) why.push(`questions ${h.qs.length} [${types}]`);
    if (why.length) bad.push(`«${w.title}»: ${why.join('; ')}`);
  }
  const qsOf = (t) => JSON.stringify(((hws.find((y) => y.title === t) || {}).qs || []).map((q) => q.text));
  const same = picks.map((x) => hwWant(tree, x.l)).filter((w) => w.m > 1 && qsOf(w.title) === qsOf(w.first));
  check(!same.length, 'a later session\'s homework has other questions than the lesson\'s first', same.map((w) => w.title).join(' | '));
  check(!bad.length, 'each homework: its Noor lesson only (no prep), the typed publish date (07:00) and due date (end of day; empty → +3 days), late +2 days, both sections, 5 multiple-choice questions (true/false as two choices), 1 mark each', bad.join('\n'));
  const nAr = String(picks.length).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  check(new RegExp(`أضفت ${nAr} واجب`).test(s.head), `the wizard says how many homeworks were added («أضفت ${nAr} واجبات»)`, `${s.head} | ${s.text}`);
  check(!CALM_BAD_RE.test(s.head + ' ' + s.text), 'calm wording (no error words)', `${s.head} | ${s.text}`);
  // the teacher opens the tool again and picks the same lessons: Noor already has them → nothing new
  await b.pg.reload(); await sleep(4000);
  await wizardTo(b.pg, 'hw', { name: false });
  const s2 = await pickAndGo(false);
  check(noor.st.homeworks.length === picks.length, `re-run adds no homework (${picks.length} → ${noor.st.homeworks.length})`, `${s2.head} | ${s2.text}`);
  check(!CALM_BAD_RE.test(s2.head + ' ' + s2.text), 're-run: calm wording', `${s2.head} | ${s2.text}`);
  return b;
});

// ---------- «غرف النقاش» (المالك 2026-11-14): غرفة لكل وحدة، وفيها موضوع لكل درس ----------
// قائمة اختيار الوحدات (الغرف) أو الدروس (الفيديو): يضع علامة على الكل إلا ما في except، ثم يضغط زر البدء
const tickAll = async (pg, attr, go, except = []) => {
  await pg.waitForSelector(`input[${attr}]`, { timeout: 60000 });
  const n = await pg.locator(`input[${attr}]`).count();
  for (let i = 0; i < n; i++) {
    const cb = pg.locator(`input[${attr}]`).nth(i);
    const t = String(await cb.evaluate((x) => x.closest('label').textContent)).trim();
    if (except.some((e) => t.includes(e))) continue;
    if (!(await cb.isChecked())) { await cb.check(); await sleep(150); }
  }
  await pg.click(go); await sleep(600);
  return n;
};
T(42, '«غرف النقاش»: a room for each unit of the Noor tree (title «<unit> — <subject> <grade>», ≤ 50 chars), shared with every student of the subject\'s sections only, holding a topic for each lesson (its activity link and two discussion questions when the lesson has an activity); a room already in Noor is reused and gets only its missing topics; a re-run adds nothing; no prep, no homework', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  // lesson content does not reach the extension before a fill: the activity is found through the site's games/<key>/index.json
  const tree = treeFromPackage(PKG);
  const units = tree.terms[0].units.filter((u) => u.lessons.length);
  const now = lessonGroups(PKG)[0].sessions[0].pubDate;
  // the teacher already made the first unit's room with one topic in it
  const u0 = units[0];
  const t0 = `${u0.text} — الأحياء التاسع`.length <= 50 ? `${u0.text} — الأحياء التاسع` : null;
  const noor = env.noor({ tree, rooms: t0 ? [{ title: t0, topics: [{ title: u0.lessons[0].text, html: '<p>موضوعي</p>' }] }] : [] });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now, cont: false });
  await svcPick(b.pg, 'rooms');
  await card(b.pg, 'غرفة لكل وحدة');
  await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }); await sleep(600);
  await card(b.pg, 'الأحياء'); await card(b.pg, 'فترة واحدة');
  await nameStep(b.pg);
  // المعلم يختار الوحدات: كلها إلا الأخيرة
  const uLast = units[units.length - 1];
  const nU = await tickAll(b.pg, 'data-ru', '#wzRoomGo', [uLast.text]);
  check(units.length >= 2 && nU === units.length, `the teacher picks the units: one box per unit (${nU} / ${units.length})`, '');
  const s = await waitDone(b.pg, 15 * 60000, 'rooms');
  const errs = noor.st.roomPosts.filter((x) => x.outcome !== 'ok');
  check(!errs.length, 'every room and topic form Noor received was valid', errs.map((x) => `${x.kind}: ${x.outcome}`).join('\n'));
  const rooms = noor.st.rooms;
  check(rooms.length === units.length - 1 && !rooms.some((r) => r.title.startsWith(uLast.text.slice(0, 20))), `one room per chosen unit only (${units.length - 1}), none for the unit left unticked`, rooms.map((r) => r.title).join(' | '));
  check(rooms.every((r) => r.title.length <= 50 && /الأحياء/.test(r.title)), 'each room title ≤ 50 chars and names the subject', rooms.map((r) => `${r.title.length} ${r.title}`).join(' | '));
  const made = rooms.filter((r) => r.students);
  check(made.every((r) => r.lectures.length === 2 && r.lectures.every((x) => /^الأحياء - التاسع - /.test(x)) && r.students === 4), 'a new room is shared with the two sections of this subject and grade (all their students) and no other course', made.map((r) => `${r.title}: ${r.lectures.join(',')} · ${r.students}`).join(' | '));
  const bad = [];
  units.slice(0, -1).forEach((u) => {
    const r = rooms.find((x) => x.title.startsWith(u.text.slice(0, 20)));
    if (!r) { bad.push(`${u.text}: no room`); return; }
    const want = [...new Set(u.lessons.map((l) => l.text))];
    const got = r.topics.map((t) => t.title);
    if (want.some((t) => !got.includes(t)) || got.length !== new Set(got).size) bad.push(`${u.text}: topics ${got.join(' / ')} want ${want.join(' / ')}`);
  });
  check(!bad.length, 'every lesson of the unit has exactly one topic in its room (the existing topic is not repeated)', bad.join('\n'));
  const mine = rooms.flatMap((r) => r.topics).filter((t) => t.html !== '<p>موضوعي</p>');
  const withLink = mine.filter((t) => /play\.html\?d=[a-z0-9-]+\/\d+/.test(t.html));
  check(mine.length >= 2 && withLink.length === mine.length && !mine.some((t) => /اكتب هنا ما تعلمته/.test(t.html)) && withLink.every((t) => /سؤال للنقاش/.test(t.html) && /شهادتك/.test(t.html) && /نتيجتك/.test(t.html) && /<a href="https:\/\/afuq-edu\.github\.io\/afaq-subscribe\/play\.html\?d=[a-z0-9-]+\/\d+(&amp;t=[^"]+)?"/.test(t.html)), `every topic «حاضر» adds has its lesson's activity as a clickable link (found through the site's activity index; with the teacher's name when known), the certificate and result steps and a discussion question; no generic placeholder text (${withLink.length}/${mine.length})`, mine.map((t) => t.title + ': ' + t.html.slice(0, 200)).join('\n'));
  check(!noor.st.posts.length && !noor.st.homeworks.length, 'no prep and no homework', `${noor.st.posts.length} / ${noor.st.homeworks.length}`);
  check(/غرف|غرفة|انتهى/.test(s.head) && !CALM_BAD_RE.test(s.head + ' ' + s.text), 'a calm closing line', `${s.head} | ${s.text}`);
  const n1 = rooms.length, k1 = rooms.reduce((a, r) => a + r.topics.length, 0);
  await b.pg.reload(); await sleep(4000);
  await svcPick(b.pg, 'rooms');
  await card(b.pg, 'غرفة لكل وحدة');
  await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }).catch(() => {}); await sleep(600);
  await card(b.pg, 'الأحياء').catch(() => {}); await card(b.pg, 'فترة واحدة').catch(() => {});
  await tickAll(b.pg, 'data-ru', '#wzRoomGo');
  const s2 = await waitDone(b.pg, 15 * 60000, 'rooms again');
  const k2 = noor.st.rooms.reduce((a, r) => a + r.topics.length, 0);
  const rl = noor.st.rooms.find((r) => r.title.startsWith(uLast.text.slice(0, 20)));
  const wantL = new Set(uLast.lessons.map((l) => l.text)).size;
  check(noor.st.rooms.length === n1 + 1 && rl && rl.topics.length === wantL && k2 === k1 + wantL, `second run with every unit: only the missing unit's room is added with its ${wantL} topics; the earlier rooms get nothing new (${n1} rooms, ${k1} topics before)`, `${noor.st.rooms.length} rooms, ${k2} topics | ${s2.head}`);
  return b;
});

// ---------- «فيديو لكل درس» (المالك 2026-11-14): من يوتيوب بعنوان قريب من اسم الدرس، وإلا فلا فيديو ----------
T(43, '«فيديو لكل درس»: for each Noor lesson a YouTube video whose title is close to the lesson name (not a Short, not a 2-hour live, not an unrelated video), in «مكتبة الفيديو» linked to that lesson and both sections; a lesson with no fitting title gets no video; a video already in the library is not repeated; a re-run adds nothing; no prep, no homework, calm wording', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  const tree = treeFromPackage(PKG);
  const lessonsT = tree.terms[0].units.flatMap((u) => u.lessons.map((l) => ({ u, l })));
  const now = lessonGroups(PKG)[0].sessions[0].pubDate;
  const first = lessonsT[0];
  const noor = env.noor({ tree, videos: [{ title: 'فيديو: ' + first.l.text, url: 'https://www.youtube.com/watch?v=already0001', lang: '2', publish: '2026-09-01 07:00:00' }] });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now, cont: false });
  await svcPick(b.pg, 'video');
  await card(b.pg, 'فيديو لكل درس');
  await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }); await sleep(600);
  await card(b.pg, 'الأحياء'); await card(b.pg, 'فترة واحدة');
  await nameStep(b.pg);
  // المعلم يختار الدروس: كلها إلا درسًا له عنوان مناسب
  const skip = lessonsT.filter((x) => x !== first && !/انتشار/.test(x.l.text)).pop();
  const nL = await tickAll(b.pg, 'data-vk', '#wzVidGo', [skip.l.text]);
  check(nL >= lessonsT.length - 1, `the teacher picks the lessons: one box per lesson (${nL})`, '');
  const s = await waitDone(b.pg, 15 * 60000, 'videos');
  const errs = noor.st.vidPosts.filter((x) => x.outcome !== 'ok');
  check(!errs.length, 'every video form Noor received was valid', errs.map((x) => x.outcome).join('\n'));
  const vids = noor.st.videos;
  const noFit = lessonsT.filter((x) => /انتشار/.test(x.l.text));
  const want = lessonsT.filter((x) => x !== first && x !== skip && !noFit.includes(x));
  check(!vids.some((y) => y.title === 'فيديو: ' + skip.l.text), 'a lesson the teacher did not tick gets no video', skip.l.text);
  check(noFit.length >= 1 && want.length >= 1, `the test tree has lessons with and without a fitting title (${want.length} / ${noFit.length})`, lessonsT.map((x) => x.l.text).join(' | '));
  const bad = [];
  want.forEach((x) => {
    const v = vids.find((y) => y.title === 'فيديو: ' + x.l.text);
    if (!v) { bad.push(`${x.l.text}: none`); return; }
    const why = [];
    if (!/^https:\/\/www\.youtube\.com\/watch\?v=g/.test(v.url)) why.push('url ' + v.url + ' (not the fitting video)');
    if (v.lessons.join() !== String(x.l.nodeId)) why.push(`lessons ${v.lessons.join(',')} expected ${x.l.nodeId}`);
    if (v.lectures.length !== 2) why.push('sections ' + v.lectures.join(','));
    if (v.lang !== '2') why.push('lang ' + v.lang);
    if (!v.publish.startsWith(now)) why.push('publish ' + v.publish);
    if (why.length) bad.push(`${x.l.text}: ${why.join('; ')}`);
  });
  check(!bad.length, 'each lesson with a fitting title: one video (the fitting one: no Short, no live, no unrelated), linked to its Noor lesson, both sections, Arabic, published today', bad.join('\n'));
  check(noFit.every((x) => !vids.some((y) => y.title === 'فيديو: ' + x.l.text)), 'a lesson with no fitting YouTube title gets no video', noFit.map((x) => x.l.text).join(' | '));
  check(vids.filter((y) => y.title === 'فيديو: ' + first.l.text).length === 1, 'the video already in the library is not added again', '');
  check(!noor.st.posts.length && !noor.st.homeworks.length && !noor.st.rooms.length, 'no prep, no homework, no room', '');
  const nAr = String(want.length).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  check(new RegExp(want.length === 1 ? 'فيديو واحد' : want.length === 2 ? 'فيديوين' : nAr).test(s.head) && !CALM_BAD_RE.test(s.head + ' ' + s.text), `the closing line says how many videos were added (${nAr}) calmly`, `${s.head} | ${s.text}`);
  const n1 = vids.length;
  await b.pg.reload(); await sleep(4000);
  await svcPick(b.pg, 'video');
  await card(b.pg, 'فيديو لكل درس');
  await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }).catch(() => {}); await sleep(600);
  await card(b.pg, 'الأحياء').catch(() => {}); await card(b.pg, 'فترة واحدة').catch(() => {});
  await tickAll(b.pg, 'data-vk', '#wzVidGo');
  const s2 = await waitDone(b.pg, 15 * 60000, 'videos again');
  check(noor.st.videos.length === n1 + 1 && noor.st.videos.some((y) => y.title === 'فيديو: ' + skip.l.text) && !CALM_BAD_RE.test(s2.head + ' ' + s2.text), `second run with every lesson: only the lesson left out before gets its video (${n1} → ${n1 + 1})`, `${noor.st.videos.length} | ${s2.head} | ${s2.text}`);
  return b;
});

T(44, '«درس تفاعلي»: for each lesson the teacher ticks, a SCORM 1.2 zip (imsmanifest + index.html built from the lesson\'s activities) uploaded to «مكتبة الدروس التفاعلية» as type Scorm, linked to its Noor lesson, both sections and all their students; the library is reached through its encoded link; an unticked lesson gets none; one already in the library is not repeated; a second run with every lesson adds only the missing one; no prep, no homework, calm wording', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  const tree = treeFromPackage(PKG);
  const lessonsT = tree.terms[0].units.flatMap((u) => u.lessons.map((l) => ({ u, l })));
  const now = lessonGroups(PKG)[0].sessions[0].pubDate;
  const first = lessonsT[0];
  const noor = env.noor({ tree, scorms: [{ title: 'درس تفاعلي: ' + first.l.text, lang: '2', type: '1', publish: '2026-09-01 07:00:00' }] });
  env.afaq.reset({ pkg: PKG });
  const b = await env.launch(noor, { now, cont: false });
  await svcPick(b.pg, 'scorm');
  await card(b.pg, 'درس تفاعلي لكل درس');
  await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }); await sleep(600);
  await card(b.pg, 'الأحياء'); await card(b.pg, 'فترة واحدة');
  await nameStep(b.pg);
  const skip = lessonsT[lessonsT.length - 1];
  const nL = await tickAll(b.pg, 'data-vk', '#wzVidGo', [skip.l.text]);
  check(nL >= lessonsT.length - 1, `the teacher picks the lessons: one box per lesson (${nL})`, '');
  const s = await waitDone(b.pg, 15 * 60000, 'scorm');
  const errs = noor.st.scPosts.filter((x) => x.outcome !== 'ok');
  check(!errs.length, 'every SCORM form Noor received was valid (title, Scorm type, zip with imsmanifest.xml and index.html, publish date, language, sections and students)', errs.map((x) => x.outcome).join('\n'));
  const sc = noor.st.scorms;
  const want = lessonsT.filter((x) => x !== first && x !== skip);
  check(want.length >= 1, `the test tree has lessons to add (${want.length})`, '');
  const bad = [];
  want.forEach((x) => {
    const v = sc.filter((y) => y.title === 'درس تفاعلي: ' + x.l.text);
    if (v.length !== 1) { bad.push(`${x.l.text}: ${v.length}`); return; }
    const why = [], y = v[0];
    if (y.lessons.join() !== String(x.l.nodeId)) why.push(`lessons ${y.lessons.join(',')} expected ${x.l.nodeId}`);
    if (y.lectures.length !== 2 || y.students !== 4) why.push(`sections ${y.lectures.join(',')} students ${y.students}`);
    if (y.lang !== '2') why.push('lang ' + y.lang);
    if (!y.publish.startsWith(now)) why.push('publish ' + y.publish);
    if (!/\.zip$/.test(y.file) || y.size < 50000) why.push(`file ${y.file} ${y.size}`);
    if (why.length) bad.push(`${x.l.text}: ${why.join('; ')}`);
  });
  check(!bad.length, 'each ticked lesson: one SCORM lesson (a real zip with its fonts), linked to its Noor lesson, both sections with all students, Arabic, published today', bad.join('\n'));
  check(!sc.some((y) => y.title === 'درس تفاعلي: ' + skip.l.text), 'a lesson the teacher did not tick gets no SCORM lesson', skip.l.text);
  check(sc.filter((y) => y.title === 'درس تفاعلي: ' + first.l.text).length === 1, 'the lesson already in the library is not added again', '');
  check(!noor.st.posts.length && !noor.st.homeworks.length && !noor.st.rooms.length && !noor.st.videos.length, 'no prep, no homework, no room, no video', '');
  check(/أضفت/.test(s.head) && !CALM_BAD_RE.test(s.head + ' ' + s.text), 'a calm closing line that says what was added', `${s.head} | ${s.text}`);
  const n1 = sc.length;
  await b.pg.reload(); await sleep(4000);
  await svcPick(b.pg, 'scorm');
  await card(b.pg, 'درس تفاعلي لكل درس');
  await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }).catch(() => {}); await sleep(600);
  await card(b.pg, 'الأحياء').catch(() => {}); await card(b.pg, 'فترة واحدة').catch(() => {});
  await tickAll(b.pg, 'data-vk', '#wzVidGo');
  const s2 = await waitDone(b.pg, 15 * 60000, 'scorm again');
  check(noor.st.scorms.length === n1 + 1 && noor.st.scorms.some((y) => y.title === 'درس تفاعلي: ' + skip.l.text) && !CALM_BAD_RE.test(s2.head + ' ' + s2.text), `second run with every lesson: only the lesson left out before is added (${n1} → ${n1 + 1})`, `${noor.st.scorms.length} | ${s2.head} | ${s2.text}`);
  return b;
});

// ---------- نوع الخدمة في الاشتراك (المالك 2026-11-02): تحضير فقط · واجب فقط ----------
const cardState = (pg, text) => pg.evaluate((t) => { const c = [...document.querySelectorAll('.wz-card')].find((x) => x.textContent.includes(t)); return c ? { found: true, disabled: c.disabled } : { found: false }; }, text);
const clickCard = async (pg, sel, t) => { await pg.locator(sel, { hasText: t }).first().click({ timeout: 20000 }); await sleep(600); };

T(24, 'Subscription «تحضير فقط»: the term runs with the homework box ticked and adds NO homework; afterwards «واجبات» cannot be ticked', async (env) => {
  usePkg(derivePkg({ keep: range(1, 6) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, service: 'prep' });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term', { hw: true });
  const s = await waitDone(b.pg, 25 * 60000, 'term, prep-only subscription');
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(rows.length >= PKG.lessons.length, `the preps were saved (${rows.length})`, '');
  check(noor.st.homeworks.length === 0 && noor.st.hwPosts.length === 0, `no homework added although the box was ticked (${noor.st.homeworks.length})`, noor.st.homeworks.map((h) => h.title).join(' | '));
  // 4.10.48: the services are ticked on the first screen; one outside the subscription cannot be ticked
  await b.pg.reload(); await sleep(4000);
  await b.pg.waitForSelector('.wz-seg-b[data-svc]', { timeout: 20000 });
  const st = await b.pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wz-seg-b[data-svc]')].map((x) => [x.dataset.svc, { off: x.disabled, on: x.classList.contains('on'), title: x.title }])));
  check(st.hw.off && !st.hw.on && !st.prep.off && st.prep.on && /اشتراكك/.test(st.hw.title), 'after the run «واجبات» cannot be ticked (not in the subscription) and «تحضير» stays', JSON.stringify(st));
  const txt = await b.pg.evaluate(() => document.getElementById('wzBody').textContent);
  check(!/خطأ|فشل|غير موجود/.test(txt), 'no error-like wording on the screen', txt.slice(0, 160));
  return b;
});

T(25, 'Subscription «واجبات فقط»: a prep mode sends the teacher back calmly (nothing saved) with «واجبات» ticked for him; the subject is then selectable', async (env) => {
  usePkg(derivePkg({ keep: range(1, 6) }));
  const tree = treeFromPackage(PKG);
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, service: 'hw' });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'term');
  await sleep(6000);
  const u = await ui(b.pg);
  check(!noor.st.rows.filter((r) => !r.preexisting).length && !noor.st.posts.length, 'no prep was saved', '');
  check(u.wiz && /ماذا تريد/.test(u.wzHead), 'the teacher is back at the choice screen (prep is not part of his subscription)', `${u.wzHead} | ${u.wzBody}`.slice(0, 200));
  const msg = await b.pg.evaluate(() => document.getElementById('wzMsg').textContent);
  check(/يشمل: واجبات/.test(msg) && !/خطأ|فشل|غير موجود|لم أجد/.test(msg), 'a calm note says what the subscription covers', msg);
  const sv = await b.pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wz-seg-b[data-svc]')].map((x) => [x.dataset.svc, { off: x.disabled, on: x.classList.contains('on') }])));
  check(sv.hw.on && !sv.hw.off && sv.prep.off && !sv.prep.on && sv.video.off, '«واجبات» is ticked for him and the services outside the subscription cannot be ticked', JSON.stringify(sv));
  await clickCard(b.pg, '.wz-card:not([disabled])', 'أختار الدروس بنفسي');
  await clickCard(b.pg, '.wz-cards.grid3 .wz-card', 'الصف التاسع');
  const st = await cardState(b.pg, 'الأحياء');
  check(st.found && !st.disabled, 'with «واجبات» the subject is selectable', JSON.stringify(st));
  return b;
});

// ---------- أكثر من خدمة في تشغيل واحد (المالك 2026-11-14) وخدمات الاشتراك من الموقع ----------
const svcState = (pg) => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wz-seg-b[data-svc]')].map((x) => [x.dataset.svc, { off: x.disabled, on: x.classList.contains('on') }])));
const waitHead = async (pg, re, ms = 30000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (re.test(await pg.evaluate(() => (document.getElementById('wzHead') || {}).textContent || '').catch(() => ''))) return true; await sleep(400); } return false; };
const extrasCounts = (noor) => ({ rows: noor.st.rows.filter((r) => !r.preexisting).length, hw: noor.st.homeworks.length, rooms: noor.st.rooms.length, topics: noor.st.rooms.reduce((a, r) => a + r.topics.length, 0), videos: noor.st.videos.length, scorms: noor.st.scorms.length });

T(45, 'One run, every service (4.10.48): the teacher ticks تحضير + واجبات + غرف النقاش + فيديو + درس تفاعلي, picks the units and lessons once, and «تحضير الفصل كاملًا» then does the preps and homework, then the rooms, the videos and the SCORM lessons in the same run; the closing line names what else was done; a re-run adds nothing', async (env) => {
  usePkg(derivePkg({ keep: range(1, 8) }));
  const tree = treeFromPackage(PKG);
  const units = tree.terms[0].units.filter((u) => u.lessons.length);
  const lessonsT = units.flatMap((u) => u.lessons.map((l) => ({ u, l })));
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, service: 'all' });
  const b = await env.launch(noor);
  const skipV = lessonsT[lessonsT.length - 1], skipS = lessonsT[0];
  const flow = async (first) => {
    await svcPick(b.pg, 'prep,hw,rooms,video,scorm');
    if (first) {
      const st = await svcState(b.pg);
      check(['prep', 'hw', 'rooms', 'video', 'scorm'].every((k) => st[k] && st[k].on && !st[k].off), 'the five services are ticked together on the first screen', JSON.stringify(st));
      const plus = await b.pg.evaluate(() => (document.getElementById('wzPlus') || {}).textContent || '');
      check(/غرف/.test(plus) && /فيديو/.test(plus) && /تفاعلي/.test(plus), 'the first screen says what else is done in the same run', plus);
    }
    await clickCard(b.pg, '.wz-card:not([disabled])', 'تحضير الفصل كاملًا');
    await b.pg.locator('.wz-cards.grid3 .wz-card', { hasText: 'الصف التاسع' }).first().click({ timeout: 20000 }).catch(() => {}); await sleep(600);
    await card(b.pg, 'الأحياء').catch(() => {}); await card(b.pg, 'فترة واحدة').catch(() => {});
    if (first) await nameStep(b.pg);
    const h1 = await waitHead(b.pg, /وحدات غرف النقاش/);
    const nU = await tickAll(b.pg, 'data-ru', '#wzRoomGo');
    const h2 = await waitHead(b.pg, /دروس الفيديو/);
    const nV = await tickAll(b.pg, 'data-vk', '#wzVidGo', [skipV.l.text]);
    const h3 = await waitHead(b.pg, /الدرس التفاعلي/);
    const nS = await tickAll(b.pg, 'data-vk', '#wzVidGo', [skipS.l.text]);
    if (first) check(h1 && h2 && h3 && nU === units.length && nV >= lessonsT.length - 1 && nS >= lessonsT.length - 1, `the choices come one after the other, each named: room units (${nU}), video lessons (${nV}), SCORM lessons (${nS})`, `${h1} ${h2} ${h3}`);
    return waitDone(b.pg, 40 * 60000, first ? 'every service in one run' : 'every service again');
  };
  const s = await flow(true);
  const c = extrasCounts(noor);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(c.rows >= PKG.lessons.length, `the preps were saved (${c.rows})`, '');
  const hwErr = noor.st.hwPosts.filter((x) => !/^ok/.test(x.outcome));
  check(c.hw >= lessonGroups(PKG).length && !hwErr.length, `the homework was added with the preps (${c.hw})`, hwErr.map((x) => x.outcome).join('\n'));
  const rErr = noor.st.roomPosts.filter((x) => x.outcome !== 'ok');
  check(c.rooms === units.length && c.topics >= units.length && !rErr.length, `a room for each unit with its lesson topics (${c.rooms} rooms, ${c.topics} topics)`, rErr.map((x) => x.outcome).join('\n'));
  const vErr = noor.st.vidPosts.filter((x) => x.outcome !== 'ok');
  check(c.videos >= 1 && !vErr.length && !noor.st.videos.some((y) => y.title === 'فيديو: ' + skipV.l.text), `videos for the ticked lessons only (${c.videos})`, vErr.map((x) => x.outcome).join('\n'));
  const sErr = noor.st.scPosts.filter((x) => x.outcome !== 'ok');
  check(c.scorms === lessonsT.length - 1 && !sErr.length && !noor.st.scorms.some((y) => y.title === 'درس تفاعلي: ' + skipS.l.text), `a SCORM lesson for each ticked lesson only (${c.scorms} / ${lessonsT.length - 1})`, sErr.map((x) => x.outcome).join('\n'));
  check(/ومعه:/.test(s.text) && /غرف/.test(s.text) && /فيديو/.test(s.text) && !CALM_BAD_RE.test(s.head + ' ' + s.text), 'the closing line names what else was done, calmly', `${s.head} | ${s.text}`);
  await b.pg.reload(); await sleep(4000);
  const wizShown = await b.pg.evaluate(() => !document.getElementById('wizCard').hidden && !document.body.classList.contains('wiz-run'));
  const s2 = wizShown ? await flow(false) : await waitDone(b.pg, 20 * 60000, 'every service again (resumed)');
  const c2 = extrasCounts(noor);
  check(JSON.stringify(c2) === JSON.stringify(c), 're-run with the same choices adds nothing in any service', `${JSON.stringify(c)} → ${JSON.stringify(c2)}`);
  check(!CALM_BAD_RE.test(s2.head + ' ' + s2.text), 're-run: calm wording', `${s2.head} | ${s2.text}`);
  return b;
});

T(46, 'Subscription «واجبات + فيديو» set from the site: the teacher picks homework lessons then video lessons, and one run adds both; no prep, no room, no SCORM lesson; afterwards only these two can be ticked', async (env) => {
  usePkg(derivePkg({ keep: range(1, 12) }));
  const tree = treeFromPackage(PKG);
  const groups = lessonGroups(PKG);
  const lessonsT = tree.terms[0].units.flatMap((u) => u.lessons.map((l) => ({ u, l })));
  const now = groups[0].sessions[0].pubDate;
  const noor = env.noor({ tree });
  env.afaq.reset({ pkg: PKG, service: 'hw,video' });
  const b = await env.launch(noor, { now, cont: false });
  await svcPick(b.pg, 'hw,video');
  await clickCard(b.pg, '.wz-card:not([disabled])', 'أختار الدروس بنفسي');
  await clickCard(b.pg, '.wz-cards.grid3 .wz-card', 'الصف التاسع');
  await card(b.pg, 'الأحياء'); await card(b.pg, 'فترة واحدة');
  await nameStep(b.pg);
  const g = groups[1];
  await b.pg.waitForSelector('input[data-hk]', { timeout: 60000 });
  await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-hk]')].find((x) => x.dataset.hk === k).click(), g.key); await sleep(300);
  for (const [i, l] of g.sessions.entries()) {
    await b.pg.evaluate(({ k, pub }) => { const d = document.querySelector(`input[data-hp="${CSS.escape(k)}"]`); d.value = pub; d.dispatchEvent(new Event('change')); }, { k: l.id, pub: addDaysIso(now, 4 + i) });
  }
  const goT = await b.pg.evaluate(() => document.getElementById('wzHwGo').textContent.trim());
  check(/التالي/.test(goT), 'the homework list leads to the next choice («التالي»), not to a start', goT);
  await b.pg.click('#wzHwGo'); await sleep(600);
  const hv = await waitHead(b.pg, /دروس الفيديو/);
  const skip = lessonsT.filter((x) => !/انتشار/.test(x.l.text)).pop();
  await tickAll(b.pg, 'data-vk', '#wzVidGo', [skip.l.text]);
  const s = await waitDone(b.pg, 20 * 60000, 'homework + video');
  check(hv, 'then the video lessons are chosen', '');
  const hwErr = noor.st.hwPosts.filter((x) => !/^ok/.test(x.outcome));
  check(noor.st.homeworks.length === g.sessions.length && !hwErr.length, `a homework for each chosen session (${g.sessions.length})`, `${noor.st.homeworks.length} | ${hwErr.map((x) => x.outcome).join(' / ')}`);
  const vErr = noor.st.vidPosts.filter((x) => x.outcome !== 'ok');
  check(noor.st.videos.length >= 1 && !vErr.length && !noor.st.videos.some((y) => y.title === 'فيديو: ' + skip.l.text), `videos for the ticked lessons in the same run (${noor.st.videos.length})`, vErr.map((x) => x.outcome).join('\n'));
  check(!noor.st.posts.length && !noor.st.rows.filter((r) => !r.preexisting).length && !noor.st.rooms.length && !noor.st.scorms.length, 'no prep, no room, no SCORM lesson', `${noor.st.posts.length} / ${noor.st.rooms.length} / ${noor.st.scorms.length}`);
  check(/واجب/.test(s.head) && /ومعه:/.test(s.text) && /فيديو/.test(s.text) && !CALM_BAD_RE.test(s.head + ' ' + s.text), 'the closing line: the homework added, and with it the videos', `${s.head} | ${s.text}`);
  // the device now knows the subscription: on the next open the services outside it cannot be ticked
  await b.pg.reload(); await sleep(4000);
  await b.pg.waitForSelector('.wz-seg-b[data-svc]', { timeout: 20000 });
  const st = await svcState(b.pg);
  check(st.prep.off && st.rooms.off && st.scorm.off && !st.hw.off && !st.video.off && st.hw.on && st.video.on, 'on the next open the services outside the subscription cannot be ticked (تحضير، غرف النقاش، درس تفاعلي); واجبات and فيديو stay ticked', JSON.stringify(st));
  const txt0 = await b.pg.evaluate(() => document.getElementById('wzBody').textContent);
  check(!CALM_BAD_RE.test(txt0), 'the first screen stays calm', txt0.slice(0, 200));
  return b;
});

T(47, 'Arabic grade 4, pick mode, three choices (owner 2026-11-15 «لم اجد ان ادمج تحضيرين في يوم واحد»): كل حصة في تحضير · حصص الدرس في تحضير واحد · تحضير لكل مهارة; «حصص الدرس في تحضير واحد» joins the chosen sessions of the lesson whatever their skill (4 at most), one date per prep, no skill name in the title', async (env) => {
  const file = JSON.parse(fs.readFileSync('/mnt/project-files/afaq-platform/preps/g1-5/ar-4-t1.json', 'utf8'));
  file.lessons = file.lessons.slice(0, 41);
  file.lessons.forEach((l) => { l.pubDate = l.pubDate || l.publishDate; l.concepts = `${l.concepts || ''} (${l.id})`; });
  usePkg(file);
  const tree = treeFromPackage(PKG, { keepNumbers: true });
  const courses = [{ cid: 'AR4', title: 'اللغة العربية', level: 'الصف الرابع', subject: 'اللغة العربية', grade: 'الرابع', tree }];
  const periods = { 0: [['1', 1]], 1: [['1', 1]], 2: [['1', 1]], 3: [['1', 1]], 4: [['1', 1]] };
  const noor = env.noor({ tree, courses, periods });
  env.afaq.reset({ pkg: PKG, offer: { id: PKG.id, subject: 'اللغة العربية', grade: 4, title: 'اللغة العربية — الرابع', shift: 'one' } });
  const b = await env.launch(noor);
  await wizardTo(b.pg, 'pick', { grade: 'الصف الرابع', subject: 'اللغة العربية', shift: 'فترة واحدة' });
  await b.pg.waitForSelector('input[data-k]', { timeout: 30000 });
  const g = lessonGroups(PKG).find((x) => x.sessions.length === 20);
  check(!!g, 'the file has the 20-session reading lesson', '');
  if (!g) return b;
  const seg = await b.pg.$$eval('#wzJoin .wz-seg-b', (a) => a.map((x) => x.dataset.j + '=' + x.textContent.trim()));
  check(JSON.stringify(seg) === JSON.stringify(['0=كل حصة في تحضير', 'lesson=حصص الدرس في تحضير واحد', 'true=تحضير لكل مهارة']), 'an Arabic subject offers the three choices', seg.join(' | '));
  await b.pg.evaluate((k) => [...document.querySelectorAll('input[data-k]')].find((x) => x.dataset.k === k).click(), g.key); await sleep(400);
  // only sessions 1–6 (التحدث + five reading sessions): untick 7–20
  for (const l of g.sessions.slice(6)) await b.pg.evaluate((id) => document.querySelector(`input[data-s="${CSS.escape(id)}"]`).click(), l.id);
  await sleep(300);
  await b.pg.click('#wzJoin [data-j="lesson"]'); await sleep(400);
  const on = await b.pg.$$eval('#wzJoin .wz-seg-b.on', (a) => a.map((x) => x.dataset.j));
  check(on.join() === 'lesson', '«حصص الدرس في تحضير واحد» is selected', on.join());
  const runs = [[1, 2, 3], [4, 5, 6]];
  const boxIds = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.dataset.d));
  check(JSON.stringify(boxIds) === JSON.stringify(runs.map((r) => g.sessions[r[0] - 1].id)), 'six chosen sessions → two preps of three (speaking and reading together), one date box each', boxIds.join(', '));
  await b.pg.evaluate(([id, d]) => { const el = document.querySelector(`input[data-d="${id}"]`); el.value = d; el.dispatchEvent(new Event('change', { bubbles: true })); }, [boxIds[0], '2026-12-06']);
  await sleep(300);
  const shown = await b.pg.$$eval('input[data-d]', (a) => a.map((x) => x.value));
  check(shown.join() === '2026-12-06,2026-12-07', 'one typed date: the second prep on the next class day', shown.join(', '));
  await b.pg.click('#wzLessGo');
  const s = await waitDone(b.pg, 15 * 60000, 'arabic lesson join');
  const rows = noor.st.rows.filter((r) => !r.preexisting);
  check(/تمت التعبئة بنجاح/.test(s.head), 'wizard shows «تمت التعبئة بنجاح»', `${s.head} | ${s.text}`);
  check(rows.length === runs.length, `exactly ${runs.length} preps for the 6 sessions (${rows.length})`, fmtRows(rows));
  const node = nodeFor(tree, g.sessions[0]).text;
  runs.forEach((r, i) => {
    const title = `${node} (${r.join(' و ')})`;
    const row = rows.find((x) => x.title === title);
    check(!!row, `prep «${title.slice(-30)}» saved, with no skill name`, rows.map((x) => x.title).join(' | '));
    if (!row) return;
    check(row.publishDate === shown[i], `…on ${shown[i]}`, row.publishDate);
    check(r.every((n) => row.concepts.includes(`(${g.sessions[n - 1].id})`)), '…holding the content of its three sessions', row.concepts.slice(0, 160));
  });
  check(!rows.some((x) => /مهارة/.test(x.title)), 'no title carries «مهارة»', rows.map((x) => x.title).join(' | '));
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
