#!/usr/bin/env node
// doctor.mjs — فحص سريع للمستودع كله في ثوانٍ، دون شبكة ودون متصفح: يلتقط الأخطاء التي تكسر «حاضر» أو الموقع قبل أي اختبار طويل.
//
//   node tools/doctor.mjs            # كل الفحوص
//   node tools/doctor.mjs --quiet    # الأخطاء والتحذيرات وسطر الخلاصة فقط
//
// الفحوص: صياغة كل ملف JavaScript (الإضافة، الموقع، الاختبارات، الأدوات) · manifest.json (الإصدار، كل ملف يشير إليه موجود،
// key للنسخة غير المضغوطة، رابط الموقع في externally_connectable) · ملفات <script>/<link> في صفحات HTML · تطابق إعدادات Supabase
// بين الموقع والإضافة ومعرّفَي الإضافة · كل دالة RPC وجدول يناديهما الموقع أو الإضافة معرّفان في site/supabase/*.sql ·
// صحة ملفات JSON (أنشطة الدروس، شجرات نور الحقيقية و_gaps) · كل مسار في جدول الأقسام في README.md موجود.
// يخرج بالرمز 1 إن وُجد خطأ (التحذيرات لا تُفشل). لا يعدّل أي ملف.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');
const rel = (p) => path.relative(REPO, p);
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(REPO, p));

let errors = 0, warnings = 0, oks = 0;
const ok = (msg) => { oks++; if (!QUIET) console.log(`  ✓ ${msg}`); };
const bad = (msg) => { errors++; console.log(`  ✗ ${msg}`); };
const warn = (msg) => { warnings++; console.log(`  ! ${msg}`); };
const section = (t) => { if (!QUIET) console.log(`\n— ${t}`); };

function walk(dir, test, out = []) {
  const abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || (dir === 'tests' && e.name === 'ext')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out); else if (test(p)) out.push(p);
  }
  return out;
}

// ---------- 1. صياغة JavaScript ----------
// كل ملف يُفحص بـ node --check كوحدة (import/export) ثم كسكربت عادي؛ يُعدّ خطأً فقط إن فشل الاثنان.
async function checkSyntax() {
  section('صياغة ملفات JavaScript');
  const files = [...walk('extension', (p) => p.endsWith('.js')), ...walk('site', (p) => /\.(m?js)$/.test(p) && !p.startsWith('site/games')),
    ...walk('tests', (p) => /\.m?js$/.test(p)), ...walk('tools', (p) => /\.m?js$/.test(p))];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afaq-doctor-'));
  const check = (file) => new Promise((res) => {
    const p = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; }); p.on('close', (code) => res(code === 0 ? '' : err));
  });
  const one = async (f) => {
    const src = fs.readFileSync(path.join(REPO, f));
    const base = path.join(tmp, f.replace(/[\\/]/g, '__'));
    fs.writeFileSync(base + '.mjs', src); fs.writeFileSync(base + '.cjs', src);
    const e1 = await check(base + '.mjs'); if (!e1) return null;
    const e2 = await check(base + '.cjs'); if (!e2) return null;
    const line = (e1.split('\n').find((l) => /SyntaxError/.test(l)) || e1.split('\n')[0] || '').trim();
    const where = (e1.match(/:(\d+)\n/) || [])[1];
    return `${f}${where ? ':' + where : ''} — ${line}`;
  };
  const fails = [];
  for (let i = 0; i < files.length; i += 8) (await Promise.all(files.slice(i, i + 8).map(one))).forEach((x) => x && fails.push(x));
  fs.rmSync(tmp, { recursive: true, force: true });
  fails.forEach(bad);
  if (!fails.length) ok(`${files.length} ملفًا بلا أخطاء صياغة`);
}

// ---------- 2. manifest.json ----------
function checkManifest() {
  section('extension/manifest.json');
  let m;
  try { m = JSON.parse(read('extension/manifest.json')); } catch (e) { bad(`manifest.json ليس JSON صالحًا: ${e.message}`); return null; }
  if (!/^\d+(\.\d+){1,3}$/.test(m.version || '')) bad(`الإصدار «${m.version}» ليس بصيغة أرقام مثل 4.10.18`); else ok(`الإصدار ${m.version}`);
  if (m.manifest_version !== 3) bad('manifest_version ليس 3');
  const refs = new Set();
  Object.values(m.icons || {}).forEach((x) => refs.add(x));
  Object.values((m.action || {}).default_icon || {}).forEach((x) => refs.add(x));
  if (m.action && m.action.default_popup) refs.add(m.action.default_popup);
  if (m.background && m.background.service_worker) refs.add(m.background.service_worker);
  if (m.options_page) refs.add(m.options_page);
  (m.content_scripts || []).forEach((c) => [...(c.js || []), ...(c.css || [])].forEach((x) => refs.add(x)));
  (m.web_accessible_resources || []).forEach((w) => (w.resources || []).forEach((x) => refs.add(x)));
  const missing = [];
  for (const r of refs) {
    if (r.includes('*')) { const dir = r.replace(/\/?\*.*$/, ''); if (!exists(path.join('extension', dir))) missing.push(r); continue; }
    if (!exists(path.join('extension', r))) missing.push(r);
  }
  missing.forEach((r) => bad(`manifest يشير إلى ملف غير موجود: extension/${r}`));
  if (!missing.length) ok(`كل الملفات التي يشير إليها (${refs.size}) موجودة`);
  if (m.key) ok('فيه "key" (معرّف ثابت للنسخة غير المضغوطة؛ build-release.sh يحذفه من نسخة المتجر)');
  else warn('لا "key" فيه: النسخة غير المضغوطة ستأخذ معرّفًا آخر غير lakfolcghlefjickbdenpoodilponbkp');
  const ec = ((m.externally_connectable || {}).matches || []).join(' ');
  if (!/afuq-edu\.github\.io\/afaq-subscribe/.test(ec)) bad('externally_connectable لا يسمح لموقع https://afuq-edu.github.io/afaq-subscribe/ بمراسلة الإضافة');
  else ok('externally_connectable يسمح لموقع المنصة');
  return m;
}

// ---------- 3. صفحات HTML: الملفات المحلية التي تحمّلها ----------
function checkHtml() {
  section('صفحات HTML (السكربتات والأنماط المحلية)');
  let n = 0;
  for (const f of [...walk('extension', (p) => p.endsWith('.html')), ...walk('site', (p) => p.endsWith('.html') && !p.startsWith('site/games'))]) {
    const html = fs.readFileSync(path.join(REPO, f), 'utf8');
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi), ...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css[^"']*)["']/gi)].map((x) => x[1]);
    for (const s of srcs) {
      if (/^(https?:)?\/\//.test(s) || s.startsWith('data:')) continue;
      n++;
      const target = path.join(path.dirname(f), s.split(/[?#]/)[0]);
      if (!exists(target)) bad(`${f} يحمّل ${s} وهو غير موجود`);
    }
  }
  ok(`${n} ملفًا محليًا تحمّله الصفحات`);
}

// ---------- 4. الإعدادات بين الموقع والإضافة ----------
function checkConfig() {
  section('إعدادات Supabase ومعرّف الإضافة');
  const site = read('site/config.js'), ext = read('extension/afaq-config.js');
  const val = (src, k) => (src.match(new RegExp(k + "\\s*:\\s*['\"]([^'\"]*)['\"]")) || [])[1] || '';
  const u1 = val(site, 'SUPABASE_URL'), u2 = val(ext, 'SUPABASE_URL');
  const k1 = val(site, 'SUPABASE_ANON_KEY'), k2 = val(ext, 'SUPABASE_ANON_KEY');
  if (!u1 || !u2) bad('SUPABASE_URL فارغ في site/config.js أو extension/afaq-config.js');
  else if (u1 !== u2) bad(`SUPABASE_URL مختلف: الموقع ${u1} · الإضافة ${u2}`); else ok(`SUPABASE_URL واحد في الاثنين (${u1})`);
  if (k1 !== k2) bad('SUPABASE_ANON_KEY مختلف بين الموقع والإضافة'); else ok('SUPABASE_ANON_KEY واحد في الاثنين');
  if (/service_role/.test(Buffer.from((k1.split('.')[1] || ''), 'base64').toString())) bad('المفتاح في الإعدادات مفتاح service_role! ضع مفتاح anon فقط');
  const ids = [...(site.match(/EXTENSION_ID\s*:\s*\[([^\]]*)\]/) || ['', ''])[1].matchAll(/['"]([a-p]{32})['"]/g)].map((x) => x[1]);
  if (!ids.includes('dppamelcpolikjnkfajfpgpfbomklbha')) bad('EXTENSION_ID في site/config.js لا يحوي معرّف المتجر dppamelcpolikjnkfajfpgpfbomklbha');
  else ok(`EXTENSION_ID: ${ids.join('، ')}`);
  if (!/afuq-edu\.github\.io\/afaq-subscribe\//.test(val(ext, 'SITE_URL'))) warn(`SITE_URL في الإضافة «${val(ext, 'SITE_URL')}» ليس رابط الموقع المنشور`);
}

// ---------- 5. RPC والجداول: كل ما يناديه الموقع والإضافة معرّف في SQL ----------
function checkRpc() {
  section('دوال RPC والجداول (site/supabase/*.sql)');
  const sql = walk('site/supabase', (p) => p.endsWith('.sql')).map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n')
    .replace(/^\s*--.*$/gm, '');
  const fns = new Set([...sql.matchAll(/function\s+public\.([a-z_0-9]+)\s*\(/gi)].map((x) => x[1].toLowerCase()));
  const tables = new Set([...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)].map((x) => x[1].toLowerCase()));
  const callers = [...walk('extension', (p) => p.endsWith('.js')), ...walk('site', (p) => /\.(js|html)$/.test(p) && !p.startsWith('site/games'))];
  const missFn = new Map(), missT = new Map();
  let nf = 0, nt = 0;
  for (const f of callers) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    for (const [, fn] of src.matchAll(/\brpc\(\s*['"]([a-z_0-9]+)['"]/g)) { nf++; if (!fns.has(fn)) missFn.set(fn, f); }
    for (const [, t] of src.matchAll(/\b(?:db\.(?:list|insert|upsert|update|remove)|\.from)\(\s*['"]([a-z_0-9]+)['"]/g)) { nt++; if (!tables.has(t)) missT.set(t, f); }
  }
  missFn.forEach((f, fn) => bad(`${f} ينادي الدالة ${fn} ولا تعريف لها في site/supabase/*.sql`));
  missT.forEach((f, t) => bad(`${f} يقرأ الجدول ${t} ولا تعريف له في site/supabase/*.sql`));
  if (!missFn.size) ok(`${nf} نداء RPC، كلها معرّفة (${fns.size} دالة في SQL)`);
  if (!missT.size) ok(`${nt} وصولًا إلى جداول، كلها معرّفة (${tables.size} جدولًا)`);
}

// ---------- 6. ملفات JSON ----------
function checkJson() {
  section('ملفات JSON');
  const files = [...walk('site', (p) => p.endsWith('.json')), ...walk('extension', (p) => p.endsWith('.json')), ...walk('tests', (p) => p.endsWith('.json') && !p.endsWith('matrix-report.json'))];
  let broken = 0;
  for (const f of files) { try { JSON.parse(fs.readFileSync(path.join(REPO, f), 'utf8')); } catch (e) { broken++; bad(`${f}: ${e.message}`); } }
  if (!broken) ok(`${files.length} ملف JSON صالح`);
  // شجرات نور الحقيقية: [[الوحدة، الدرس], …] أو اسم شجرة أخرى (نفس الشجرة لمادتين)، و_gaps لمواد موجودة فقط
  const tf = 'tests/noor-mock/real-trees/trees.json';
  if (!exists(tf)) return;
  let T; try { T = JSON.parse(read(tf)); } catch (e) { return; }
  const ids = Object.keys(T).filter((k) => k[0] !== '_');
  let badT = 0;
  for (const id of ids) {
    const t = T[id];
    if (typeof t === 'string') { if (!Array.isArray(T[t])) { badT++; bad(`${tf}: ${id} يحيل إلى «${t}» وليست شجرة`); } continue; }
    // أسماء مكررة في الوحدة نفسها («تطبيقات») حقيقية في نور فلا تُعدّ خطأ
    if (!Array.isArray(t) || !t.length || !t.every((x) => Array.isArray(x) && x.length === 2 && typeof x[1] === 'string' && x[1].trim())) { badT++; bad(`${tf}: ${id} ليست قائمة [الوحدة، الدرس] صالحة`); }
  }
  Object.keys(T._gaps || {}).filter((k) => k[0] !== '_' && !(k in T)).forEach((k) => warn(`${tf}: _gaps.${k} لمادة لا شجرة لها`));
  if (!badT) ok(`${ids.length} شجرة نور حقيقية بصيغة صحيحة`);
}

// ---------- 7. جدول الأقسام في README.md ----------
function checkReadme() {
  section('README.md');
  const md = read('README.md');
  const paths = [...md.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((x) => x[1]);
  const miss = paths.filter((p) => !exists(p.replace(/\/$/, '')));
  miss.forEach((p) => warn(`README.md يذكر ${p} وهو غير موجود`));
  if (!miss.length) ok(`${paths.length} مسارًا في جدول الأقسام، كلها موجودة`);
}

const t0 = Date.now();
console.log('afaq doctor — فحص سريع للمستودع');
await checkSyntax();
const m = checkManifest();
checkHtml();
checkConfig();
checkRpc();
checkJson();
checkReadme();
console.log(`\n${errors ? 'DOCTOR FAILED' : 'DOCTOR OK'} — ${oks} سليم · ${errors} خطأ · ${warnings} تحذير · «حاضر» ${m ? m.version : '؟'} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(errors ? 1 : 0);
