// release-gate.mjs — must PASS before any «حاضر» store/release zip is handed over.
// Usage: node tests/release-gate.mjs <path-to-zip>        (exit code 0 = all checks passed)
//
// Why: 4.10.0 shipped with a dead toolbar icon — the manifest `commands` key was removed, so
// `chrome.commands` was undefined and background.js threw at top level (the service worker never
// registered). Every check below runs against the unzipped build, never against extension/.
//
// Env: GATE_KEEP=1 keeps the temp dirs · GATE_VERBOSE=1 streams the mock-Noor run output.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROMIUM = '/opt/pw-browsers/chromium';
const NOOR_RUN = path.join(HERE, 'noor-mock', 'run.mjs');
const NOOR_PKG = process.env.PKG || '/mnt/project-files/afaq-platform/preps/bio-9-t1.json';
const NOOR_SESSIONS = 4;   // a short full-term run: the first 4 sessions (2 lessons) of the package
const WIZARD_FIRST = 'ماذا تريد أن تحضّر؟';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error(`${what}: no answer within ${ms / 1000} s`)), ms))]);

// ---------- reporting ----------
const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok: !!ok });
  const d = String(detail || '').trim();
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${d ? (ok ? ' — ' + d.split('\n')[0] : '\n        ' + d.replace(/\n/g, '\n        ')) : ''}`);
  return !!ok;
}
const note = (s) => console.log(`      · ${s}`);
const fail = (id, name, why) => check(id, name, false, why);

const zipArg = process.argv[2];
if (!zipArg) { console.error('usage: node tests/release-gate.mjs <path-to-zip>'); process.exit(2); }
const ZIP = path.resolve(zipArg);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-gate-'));
const DIR = path.join(TMP, 'ext');   // the unpacked build under test
fs.mkdirSync(DIR);
console.log(`hadir release gate — ${ZIP}\n  unpacked into ${DIR}`);

// ---------- setup ----------
let manifest = null;
try {
  execFileSync('unzip', ['-q', ZIP, '-d', DIR], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  fail('0', 'zip extracts', String(e.stderr || e.message));
  finish();
}
const allFiles = (() => {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(DIR, p).split(path.sep).join('/')); } };
  walk(DIR);
  return out;
})();

// ---------- static checks ----------
// 1. manifest.json parses (and is at the zip root)
try {
  manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  check('1', 'manifest.json parses', manifest && manifest.manifest_version === 3, manifest.manifest_version === 3 ? `MV${manifest.manifest_version}, ${allFiles.length} files, key ${manifest.key ? 'present' : 'absent (store build)'}` : `manifest_version is ${manifest.manifest_version}, expected 3`);
} catch (e) {
  fail('1', 'manifest.json parses', fs.existsSync(path.join(DIR, 'manifest.json')) ? e.message : `no manifest.json at the zip root (files: ${allFiles.slice(0, 5).join(', ')}…)`);
  finish();
}

// 2. version matches the zip name
{
  const m = path.basename(ZIP).match(/-(\d+(?:\.\d+){1,3})\.zip$/);
  check('2', 'manifest version matches the zip name', m && m[1] === manifest.version,
    m ? (m[1] === manifest.version ? `v${manifest.version}` : `zip name says ${m[1]}, manifest.version is ${manifest.version}`) : `cannot read a version from «${path.basename(ZIP)}» (expected …-X.Y.Z.zip)`);
}

// 3. every file the manifest references exists
{
  const refs = [];   // [what, relPath, kind]
  const add = (what, p, kind = 'file') => { if (typeof p === 'string' && p) refs.push([what, p.replace(/^\//, ''), kind]); };
  const bg = manifest.background || {};
  if (!bg.service_worker) refs.push(['background.service_worker', '', 'missing-key']);
  add('background.service_worker', bg.service_worker);
  for (const [k, v] of Object.entries(manifest.icons || {})) add(`icons.${k}`, v, 'png');
  const act = manifest.action || {};
  if (typeof act.default_icon === 'string') add('action.default_icon', act.default_icon, 'png');
  else for (const [k, v] of Object.entries(act.default_icon || {})) add(`action.default_icon.${k}`, v, 'png');
  add('action.default_popup', act.default_popup);
  (manifest.content_scripts || []).forEach((cs, i) => { (cs.js || []).forEach((f) => add(`content_scripts[${i}].js`, f)); (cs.css || []).forEach((f) => add(`content_scripts[${i}].css`, f)); });
  (manifest.web_accessible_resources || []).forEach((w, i) => (w.resources || []).forEach((r) => add(`web_accessible_resources[${i}]`, r, /[*?]/.test(r) ? 'glob' : 'file')));
  add('options_page', manifest.options_page);
  add('options_ui.page', manifest.options_ui && manifest.options_ui.page);
  add('side_panel.default_path', manifest.side_panel && manifest.side_panel.default_path);
  if (manifest.default_locale) add('default_locale', `_locales/${manifest.default_locale}/messages.json`, 'json');
  const missing = [];
  for (const [what, p, kind] of refs) {
    if (kind === 'missing-key') { missing.push(`${what}: not set`); continue; }
    if (kind === 'glob') {
      const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.+^${}()|[\]\\?]/g, '\\$&')).join('[^/]*') + '$');
      if (!allFiles.some((f) => re.test(f))) missing.push(`${what}: «${p}» matches no file`);
      continue;
    }
    const abs = path.join(DIR, p);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { missing.push(`${what}: «${p}» does not exist`); continue; }
    const buf = fs.readFileSync(abs);
    if (kind === 'png' && !(buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))) missing.push(`${what}: «${p}» is not a PNG (${buf.length} bytes)`);
    if (kind === 'json') { try { JSON.parse(buf.toString('utf8')); } catch (e) { missing.push(`${what}: «${p}» is not valid JSON (${e.message})`); } }
  }
  // the scripts/styles the extension pages load (an HTML page with a missing script is as dead as a missing icon)
  for (const h of allFiles.filter((f) => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(DIR, h), 'utf8');
    for (const m of src.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
      if (/^(?:[a-z]+:)?\/\//i.test(m[1]) || /^(data|https?|mailto):/i.test(m[1])) continue;
      const p = path.posix.normalize(path.posix.join(path.posix.dirname(h), m[1]));
      if (!allFiles.includes(p)) missing.push(`${h}: loads «${m[1]}» which does not exist`);
    }
  }
  check('3', 'every file referenced by the manifest (and by the extension pages) exists', !missing.length, missing.length ? missing.join('\n') : `${refs.length} manifest references`);
}

// 4. every JS file passes `node --check` (ES modules checked as modules)
const jsFiles = allFiles.filter((f) => /\.(m?js)$/.test(f));
const importsOf = (src) => [...src.matchAll(/(?:^|[;\n}])\s*(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] || m[2] || m[3]);
const contentScripts = new Set((manifest.content_scripts || []).flatMap((c) => c.js || []).map((f) => f.replace(/^\//, '')));
const swFile = manifest.background && manifest.background.service_worker && manifest.background.service_worker.replace(/^\//, '');
const swIsModule = !!(manifest.background && manifest.background.type === 'module');
const modules = new Set();
const unresolved = [];
{
  const queue = [];
  if (swFile && swIsModule) queue.push(swFile);
  for (const h of allFiles.filter((f) => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(DIR, h), 'utf8');
    for (const m of src.matchAll(/<script\b([^>]*)>/gi)) {
      const s = m[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (s && /\btype\s*=\s*["']module["']/i.test(m[1])) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(h), s[1])));
    }
  }
  while (queue.length) {
    const f = queue.shift();
    if (modules.has(f) || !allFiles.includes(f)) continue;
    modules.add(f);
    for (const spec of importsOf(fs.readFileSync(path.join(DIR, f), 'utf8'))) {
      if (!/^\.{1,2}\/|^\//.test(spec)) { unresolved.push(`${f}: bare import «${spec}» cannot load in an extension`); continue; }
      const p = spec.startsWith('/') ? spec.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      if (!allFiles.includes(p)) unresolved.push(`${f}: imports «${spec}» which does not exist`);
      else queue.push(p);
    }
  }
}
{
  const ck = path.join(TMP, 'syntax');
  fs.mkdirSync(ck);
  const bad = [];
  let nMod = 0, nCls = 0;
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(DIR, f));
    // reached as a module, or not loaded by anything we know but written as one (top-level import/export)
    const asModule = (modules.has(f) || (!contentScripts.has(f) && f !== swFile && /^\s*(import|export)\s/m.test(src.toString('utf8')))) && !contentScripts.has(f);
    const tmp = path.join(ck, f.replace(/[\\/]/g, '__') + (asModule ? '.mjs' : '.cjs'));
    fs.writeFileSync(tmp, src);
    asModule ? nMod++ : nCls++;
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { bad.push(`${f} (${asModule ? 'module' : 'classic'}${contentScripts.has(f) ? ', content script' : ''}):\n  ` + String(e.stderr || e.message).split('\n').filter((l) => l.trim() && !/^Node\.js v/.test(l)).slice(0, 5).join('\n  ').replaceAll(tmp, f)); }
  }
  check('4', 'every JS file passes node --check', !bad.length, bad.length ? bad.join('\n') : `${nMod} modules, ${nCls} classic scripts`);
  check('4b', 'every relative import of every module resolves to a file in the zip', !unresolved.length, unresolved.length ? unresolved.join('\n') : `${modules.size} modules in the import graph`);
}

// 4c. chrome.* namespaces that need a permission / manifest key are granted (or the use is guarded)
{
  const perms = new Set([...(manifest.permissions || []), ...(manifest.optional_permissions || [])]);
  const NEED = {   // namespace → [what the manifest must have, test]
    commands: ['the «commands» key', () => !!manifest.commands], action: ['the «action» key', () => !!manifest.action],
    alarms: ['permission «alarms»'], storage: ['permission «storage»'], scripting: ['permission «scripting»'], contextMenus: ['permission «contextMenus»'],
    notifications: ['permission «notifications»'], sidePanel: ['permission «sidePanel»'], offscreen: ['permission «offscreen»'], downloads: ['permission «downloads»'],
    cookies: ['permission «cookies»'], webNavigation: ['permission «webNavigation»'], identity: ['permission «identity»'], tabGroups: ['permission «tabGroups»'],
    history: ['permission «history»'], bookmarks: ['permission «bookmarks»'], debugger: ['permission «debugger»'], idle: ['permission «idle»'], sessions: ['permission «sessions»'],
    declarativeNetRequest: ['permission «declarativeNetRequest»', () => perms.has('declarativeNetRequest') || perms.has('declarativeNetRequestWithHostAccess')],
    unlimitedStorage: null,
  };
  const CS_OK = new Set(['runtime', 'storage', 'i18n', 'dom', 'extension']);   // what a content script can see
  const bad = [];
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    const uses = [...src.matchAll(/\bchrome\.([A-Za-z]+)\b/g)];
    for (const ns of new Set(uses.map((m) => m[1]))) {
      // guarded: an explicit presence test anywhere in the file, or every use sits on a line inside `try {`
      const guarded = new RegExp(`if\\s*\\(\\s*!?\\s*chrome\\.${ns}\\b|chrome\\.${ns}\\s*&&|chrome\\.${ns}\\?\\.|typeof\\s+chrome\\.${ns}\\b|'${ns}'\\s+in\\s+chrome`).test(src)
        || uses.filter((m) => m[1] === ns).every((m) => /\btry\s*\{/.test(src.slice(src.lastIndexOf('\n', m.index) + 1, m.index)));
      if (contentScripts.has(f) && !CS_OK.has(ns) && !guarded) { bad.push(`${f} (content script): chrome.${ns} is undefined in content scripts`); continue; }
      const need = NEED[ns];
      if (!need) continue;
      const ok = need[1] ? need[1]() : perms.has(ns);
      if (!ok && !guarded) bad.push(`${f}: uses chrome.${ns} unguarded, but the manifest lacks ${need[0]} → chrome.${ns} is undefined at runtime`);
    }
  }
  check('4c', 'chrome.* APIs used are granted by the manifest (or guarded)', !bad.length, bad.join('\n'));
}

// ---------- runtime checks ----------
const extIdFromKey = (k) => crypto.createHash('sha256').update(Buffer.from(k, 'base64')).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
const extIdFromPath = (p) => crypto.createHash('sha256').update(Buffer.from(p, 'utf8')).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

// raw CDP over --remote-debugging-port (Playwright has no service-worker console API): attaches to every
// service worker of the extension, enables Runtime/Log (V8 replays what was already logged, so errors from
// the first start are seen too) and resumes workers that start later with waitForDebuggerOnStart.
async function cdpConnect(userDataDir, extHostRef) {
  const f = path.join(userDataDir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(f); i++) await sleep(100);
  const [port, p] = fs.readFileSync(f, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('CDP websocket failed')); });
  let n = 0;
  const pend = new Map();
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  // a worker restart keeps its DevTools target/session: each start shows up as a new execution context
  const st = { errors: [], consoleErrors: [], starts: 0, sessions: new Set(), last: null };
  const isOurs = (u) => String(u).startsWith('chrome-extension://') && (!extHostRef.id || new URL(u).host === extHostRef.id);
  ws.onmessage = async (m) => {
    const d = JSON.parse(m.data);
    if (d.id) { const q = pend.get(d.id); if (q) { pend.delete(d.id); d.error ? q.rej(new Error(d.error.message)) : q.res(d.result); } return; }
    const P = d.params || {};
    if (d.method === 'Target.attachedToTarget') {
      const t = P.targetInfo;
      if (t.type === 'service_worker' && isOurs(t.url)) {
        st.sessions.add(P.sessionId);
        st.last = P.sessionId;
        await send('Runtime.enable', {}, P.sessionId).catch(() => {});
        await send('Log.enable', {}, P.sessionId).catch(() => {});
      }
      if (P.waitingForDebugger) await send('Runtime.runIfWaitingForDebugger', {}, P.sessionId).catch(() => {});
      return;
    }
    if (!st.sessions.has(d.sessionId)) return;
    if (d.method === 'Runtime.executionContextCreated') { st.starts++; st.last = d.sessionId; return; }
    const tag = `start #${st.starts}`;
    if (d.method === 'Runtime.exceptionThrown') {
      const x = P.exceptionDetails || {};
      const desc = (x.exception && (x.exception.description || x.exception.value)) || x.text;
      st.errors.push(`${tag}: ${x.text && desc && !String(desc).startsWith(x.text) ? x.text + ' ' : ''}${desc}${x.url ? ` (${x.url.split('/').pop()}:${(x.lineNumber || 0) + 1})` : ''}`);
    } else if (d.method === 'Runtime.consoleAPICalled' && (P.type === 'error' || P.type === 'assert')) {
      st.consoleErrors.push(`${tag}: console.${P.type}: ${(P.args || []).map((a) => a.value !== undefined ? a.value : a.description).join(' ')}`);
    } else if (d.method === 'Log.entryAdded' && P.entry && P.entry.level === 'error' && P.entry.source !== 'network') {
      st.consoleErrors.push(`${tag}: [${P.entry.source}] ${P.entry.text}`);
    }
  };
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'service_worker' }] });
  // evaluate in the extension's current service worker (works across restarts, unlike a stale Playwright Worker)
  const evalSW = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, st.last);
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, st, evalSW, close: () => ws.close() };
}

async function launch(extDir, userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    headless: true, executablePath: CHROMIUM,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--headless=new', '--remote-debugging-port=0',
      // hermetic: no real network (the build talks to Supabase / GitHub Pages)
      '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    viewport: { width: 1000, height: 900 },
  });
}
// a service worker that really runs: its DevTools target exists, it answers an evaluate, and the extension's
// registration has an activated worker (a top-level throw leaves a target that never answers / no active worker)
async function waitSW(ctx, ms) {
  const end = Date.now() + ms;
  const ours = () => ctx.serviceWorkers().filter((w) => w.url().startsWith('chrome-extension://')).at(-1);
  let sw = ours() || await ctx.waitForEvent('serviceworker', { timeout: ms }).catch(() => null);
  if (!sw) return { sw: null, why: `no service worker appeared within ${ms / 1000} s` };
  // retry until the deadline: right after install the first worker version can still be settling
  let lastErr = '';
  for (;;) {
    sw = ours() || sw;
    try { if (await timeout(sw.evaluate('typeof chrome === "object" && !!chrome.runtime && chrome.runtime.id'), 3000, 'evaluate in the service worker')) break; lastErr = 'chrome.runtime is not available in the worker'; }
    catch (e) { lastErr = e.message.split('\n')[0]; }
    if (Date.now() > end) return { sw: null, url: sw.url(), why: `a service worker target appeared (${sw.url()}) but never became a working extension worker within ${ms / 1000} s (${lastErr}) — its script failed to evaluate` };
    await sleep(500);
  }
  const pg = await ctx.newPage();
  try {
    await pg.goto(`chrome-extension://${new URL(sw.url()).host}/manifest.json`, { timeout: 8000 });
    const state = await timeout(pg.evaluate(async () => { for (let i = 0; i < 40; i++) { const r = await navigator.serviceWorker.getRegistration('/'); if (r && r.active && r.active.state === 'activated') return 'activated'; await new Promise((x) => setTimeout(x, 100)); } const r = await navigator.serviceWorker.getRegistration('/'); return r ? (r.active ? r.active.state : 'no active worker') : 'no registration'; }), 8000, 'registration');
    if (state !== 'activated') return { sw: null, url: sw.url(), why: `service worker registration: ${state}` };
  } catch (e) { return { sw: null, url: sw.url(), why: e.message.split('\n')[0] }; }
  finally { await pg.close().catch(() => {}); }
  return { sw };
}
const wizardHead = async (pg, ms) => {
  try { await pg.waitForFunction((t) => (document.getElementById('wzHead') || {}).textContent === t, WIZARD_FIRST, { timeout: ms }); return WIZARD_FIRST; }
  catch (e) { return pg.evaluate(() => (document.getElementById('wzHead') || {}).textContent || document.body.innerText.slice(0, 120)).catch(() => '(page gone)'); }
};
const LISTENERS = '({ clicked: !!(chrome.action && chrome.action.onClicked.hasListeners()), message: chrome.runtime.onMessage.hasListeners(), installed: chrome.runtime.onInstalled.hasListeners() })';
const listenerState = (sw) => timeout(sw.evaluate(LISTENERS), 8000, 'evaluate').catch((e) => ({ error: e.message.split('\n')[0] }));

async function runtimePhase() {
  const ud = path.join(TMP, 'profile-a');
  const ref = { id: manifest.key ? extIdFromKey(manifest.key) : extIdFromPath(DIR) };
  const ctx = await launch(DIR, ud);
  let cdp = null;
  try {
    cdp = await cdpConnect(ud, ref).catch((e) => { note(`CDP unavailable: ${e.message}`); return null; });
    // 5. the service worker starts
    const { sw, why: swWhy, url: swUrl } = await waitSW(ctx, 15000);
    if (swUrl) ref.id = new URL(swUrl).host;
    if (!sw) {
      // diagnose: load the SW script as a module in an extension page to surface the error it throws
      let why = swWhy + '\n  (a top-level throw in the service worker script — e.g. chrome.commands undefined — kills the toolbar icon)';
      try {
        const pg = await ctx.newPage();
        await pg.goto(`chrome-extension://${ref.id}/manifest.json`, { timeout: 5000 });
        const err = await timeout(pg.evaluate((f) => import('/' + f).then(() => 'imports fine in a page', (e) => String(e && e.stack || e)), swFile), 8000, 'import');
        why += `\n  importing ${swFile} in an extension page: ${err.split('\n').slice(0, 3).join('\n  ')}`;
      } catch (e) { why += `\n  Chrome did not load the extension at all (${e.message.split('\n')[0]}) — a manifest error such as a missing icon or service worker file`; }
      fail('5', 'service worker starts', why);
      for (const [id, n] of [['6', 'no uncaught errors in the service worker at startup'], ['7', 'chrome.action.onClicked has listeners'], ['8', 'chrome.runtime.onMessage has listeners'], ['10', 'first install opens the wizard'], ['12', 'every extension page loads without uncaught errors']]) fail(id, n, 'skipped: the service worker did not start');
      return;
    }
    const id = new URL(sw.url()).host;
    ref.id = id;
    check('5', 'service worker starts', true, `${sw.url()}${manifest.key ? (id === extIdFromKey(manifest.key) ? ' (stable id from key)' : ' (id ≠ key id!)') : ' (no key: id discovered from the service worker URL)'}`);

    // 10. first install opens the wizard by itself (background.js: onInstalled reason «install» → semester.html)
    const bgSrc = swFile && fs.existsSync(path.join(DIR, swFile)) ? fs.readFileSync(path.join(DIR, swFile), 'utf8') : '';
    const opensOnInstall = /reason\s*===\s*['"]install['"][\s\S]{0,300}semester\.html/.test(bgSrc);
    {
      const end = Date.now() + 10000;
      let pg = null;
      while (Date.now() < end && !(pg = ctx.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/semester.html`)))) await sleep(200);
      if (!opensOnInstall) check('10', 'first install opens the wizard', !pg, pg ? 'opened, but background.js no longer says it should — update the gate' : 'not this build\'s behaviour (no onInstalled «install» → semester.html in the service worker)');
      else if (!pg) fail('10', 'first install opens the wizard', 'background.js opens semester.html on install, but no such page appeared within 10 s');
      else { const h = await wizardHead(pg, 15000); check('10', 'first install opens the wizard', h === WIZARD_FIRST, h === WIZARD_FIRST ? `semester.html shows «${h}»` : `semester.html opened but shows «${h}»`); }
    }

    // 7 / 8 on the first start
    const s1 = await listenerState(sw);
    // cold restart: stop the worker, wake it with a message, and watch it start from scratch (as Chrome does after ~30 s idle)
    let restarted = false, s2 = null;
    if (cdp) {
      await sleep(1500);
      const before = cdp.st.starts;
      const { targetInfos } = await cdp.send('Target.getTargets');
      for (const t of targetInfos.filter((t) => t.type === 'service_worker' && t.url.includes(id))) await cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
      await sleep(800);
      const pg = await ctx.newPage();
      await pg.goto(`chrome-extension://${id}/manifest.json`);
      await pg.evaluate(() => chrome.runtime.sendMessage({ type: 'gatePing' }).catch(() => {}));
      for (let i = 0; i < 50 && cdp.st.starts === before; i++) await sleep(100);
      restarted = cdp.st.starts > before;
      await sleep(2500);
      await pg.close().catch(() => {});
      s2 = restarted ? await timeout(cdp.evalSW(LISTENERS), 8000, 'evaluate').catch((e) => ({ error: e.message })) : { error: 'no service worker after the restart' };
    }
    // 6. no uncaught errors in the service worker console at startup (first start + cold restart)
    if (!cdp) fail('6', 'no uncaught errors in the service worker at startup', 'could not attach to the service worker console');
    else {
      const errs = [...new Set(cdp.st.errors)];
      check('6', 'no uncaught errors in the service worker at startup', !errs.length && restarted,
        errs.length ? errs.join('\n') : restarted ? `first start + cold restart clean (${cdp.st.starts} starts observed)` : 'the service worker did not come back after a restart');
      for (const c of [...new Set(cdp.st.consoleErrors)].slice(0, 8)) note(`console error (not uncaught, not failing): ${c}`);
    }
    const desc = (s) => s ? (s.error ? `error: ${s.error}` : JSON.stringify(s)) : '-';
    check('7', 'chrome.action.onClicked.hasListeners() is true', s1.clicked === true && (!s2 || s2.clicked === true), `first start ${desc(s1)}${s2 ? ', after restart ' + desc(s2) : ''}`);
    check('8', 'chrome.runtime.onMessage.hasListeners() is true', s1.message === true && (!s2 || s2.message === true), `first start ${desc(s1)}${s2 ? ', after restart ' + desc(s2) : ''}`);

    // 12. every extension page loads without an uncaught error (module link errors, missing exports, …)
    {
      const bad = [];
      const pages = allFiles.filter((f) => f.endsWith('.html'));
      for (const h of pages) {
        const pg = await ctx.newPage();
        const errs = [];
        pg.on('pageerror', (e) => errs.push(e.message));
        try { await pg.goto(`chrome-extension://${id}/${h}`, { timeout: 15000 }); await sleep(1500); } catch (e) { errs.push('load: ' + e.message.split('\n')[0]); }
        if (errs.length) bad.push(`${h}: ${errs.slice(0, 3).join(' | ')}`);
        await pg.close().catch(() => {});
      }
      check('12', 'every extension page loads without uncaught errors', !bad.length, bad.length ? bad.join('\n') : pages.join(', '));
    }
  } finally {
    if (cdp) cdp.close();
    await ctx.close().catch(() => {});
  }
}

// 9. the toolbar action opens the wizard: the registered onClicked listeners are called from the SW.
// Listeners registered with addListener cannot be reached from outside, so this phase runs a copy of the
// build whose service-worker entry first loads a 3-line recorder that wraps chrome.action.onClicked.addListener,
// then the build's own service worker, unchanged.
async function actionPhase() {
  const name = 'chrome.action click opens semester.html with «' + WIZARD_FIRST + '»';
  if (!swFile || !fs.existsSync(path.join(DIR, swFile))) return fail('9', name, 'no service worker file');
  const dir = path.join(TMP, 'ext-action');
  fs.cpSync(DIR, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '__gate_record.js'),
    "self.__gateClicked = [];\nconst __e = chrome.action && chrome.action.onClicked;\nif (__e) { const add = __e.addListener.bind(__e); __e.addListener = (f) => { self.__gateClicked.push(f); return add(f); }; }\n");
  fs.writeFileSync(path.join(dir, '__gate_entry.js'), swIsModule
    ? `import './__gate_record.js';\nimport './${swFile}';\n`
    : `importScripts('__gate_record.js', '${swFile}');\n`);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  m.background.service_worker = '__gate_entry.js';
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  const ctx = await launch(dir, path.join(TMP, 'profile-b'));
  try {
    const { sw, why } = await waitSW(ctx, 15000);
    if (!sw) return fail('9', name, 'the service worker did not start: ' + why);
    const id = new URL(sw.url()).host;
    // let the first-install window open, then close it so the click has to open a fresh one
    for (let i = 0; i < 30 && !ctx.pages().some((p) => p.url().includes('/semester.html')); i++) await sleep(200);
    await sleep(500);
    for (const p of ctx.pages()) if (p.url().includes('/semester.html')) await p.close().catch(() => {});
    await sleep(500);
    const opened = ctx.waitForEvent('page', { predicate: (p) => p.url().startsWith(`chrome-extension://${id}/semester.html`), timeout: 10000 }).catch(() => null);
    const n = await timeout(sw.evaluate(() => { const fs = self.__gateClicked || []; for (const f of fs) f({ id: -1, windowId: -1, index: 0, url: 'about:blank', active: true }); return fs.length; }), 8000, 'evaluate').catch((e) => 'error: ' + e.message);
    if (typeof n !== 'number' || n < 1) return fail('9', name, `no onClicked listener to call (${n})`);
    let pg = await opened;
    if (!pg) pg = ctx.pages().find((p) => p.url().startsWith(`chrome-extension://${id}/semester.html`));
    if (!pg) return fail('9', name, `called ${n} onClicked listener(s), but no semester.html page opened within 10 s`);
    const h = await wizardHead(pg, 15000);
    check('9', name, h === WIZARD_FIRST, h === WIZARD_FIRST ? `${n} listener(s) called → ${pg.url().split('/').pop()} shows «${h}»` : `semester.html opened but its first screen shows «${h}»`);
  } finally {
    await ctx.close().catch(() => {});
  }
}

// 11. one full-term run against the mock Noor (tests/noor-mock/run.mjs scenario 1), on this unzipped build
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function noorPhase() {
  const name = `full-term run against the mock Noor (${NOOR_SESSIONS} sessions, scenario 1)`;
  const dead = results.find((r) => r.id === '5' && !r.ok);
  if (dead) return fail('11', name, 'skipped: the service worker did not start (check 5), so the run cannot work');
  let pkgFile;
  try {
    const pkg = JSON.parse(fs.readFileSync(NOOR_PKG, 'utf8'));
    pkg.lessons = pkg.lessons.slice(0, NOOR_SESSIONS);
    pkgFile = path.join(TMP, 'noor-pkg.json');
    fs.writeFileSync(pkgFile, JSON.stringify(pkg));
  } catch (e) { return fail('11', name, `cannot read the package ${NOOR_PKG}: ${e.message}`); }
  const port = await freePort();
  const t0 = Date.now();
  const out = [];
  const code = await new Promise((res) => {
    const ch = spawn(process.execPath, [NOOR_RUN, '1'], { env: { ...process.env, EXT_DIR: DIR, AFAQ_PORT: String(port), PKG: pkgFile }, stdio: ['ignore', 'pipe', 'pipe'] });
    const on = (b) => { const s = b.toString(); out.push(s); if (process.env.GATE_VERBOSE) process.stdout.write(s.replace(/^/gm, '      | ')); };
    ch.stdout.on('data', on); ch.stderr.on('data', on);
    const timer = setTimeout(() => { out.push('\n(gate: killed after 5 min)'); ch.kill('SIGTERM'); }, 5 * 60000);
    ch.on('close', (c) => { clearTimeout(timer); res(c); });
  });
  const text = out.join('');
  const lines = text.split('\n');
  const passN = lines.filter((l) => /^\s+PASS\s/.test(l)).length;
  const fails = lines.filter((l) => /^\s+FAIL\s|harness error|timeout waiting/.test(l));
  check('11', name, code === 0, code === 0 ? `${passN} checks passed in ${Math.round((Date.now() - t0) / 1000)} s (mock Afaq on port ${port})`
    : `run.mjs exited ${code}\n${(fails.length ? fails : lines.slice(-15)).slice(0, 15).join('\n')}`);
}

function finish() {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${bad.length ? 'GATE FAILED' : 'GATE PASSED'} — ${results.length - bad.length}/${results.length} checks passed${bad.length ? ' · failed: ' + bad.map((r) => r.id).join(', ') : ''} — ${path.basename(ZIP)}`);
  if (!process.env.GATE_KEEP) fs.rmSync(TMP, { recursive: true, force: true });
  else console.log(`(kept ${TMP})`);
  process.exit(bad.length ? 1 : 0);
}

try { await runtimePhase(); } catch (e) { fail('5-8,10,12', 'runtime checks ran without a gate error', e.stack || e); }
try { await actionPhase(); } catch (e) { fail('9', 'action click check ran without a gate error', e.stack || e); }
try { await noorPhase(); } catch (e) { fail('11', 'mock Noor run ran without a gate error', e.stack || e); }
finish();
