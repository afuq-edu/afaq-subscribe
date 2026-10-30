#!/usr/bin/env node
// suite.mjs — يشغّل اختبارات الإصدار بالترتيب ويطبع سطر الخلاصة الذي يُرسل مع كل zip، مثل:
//   rich 0, matrix 240/240 (11051), oneper 240/240, real 35/35 (1447), scenarios 19/19, gate 14/14
//
//   node tools/suite.mjs --tier full  --version 4.10.19   # تعديل منطق التعبئة/التواريخ/المطابقة/الحفظ (ساعات)
//   node tools/suite.mjs --tier short --version 4.10.19   # تعديل نصوص أو شاشات أو مسار المعالج فقط (~40 دقيقة)
//   node tools/suite.mjs --tier full                      # دون بناء zip ولا بوابة (للتحقق أثناء العمل)
//   node tools/suite.mjs --steps doctor,align,rich        # خطوات بعينها (السريعة: doctor, align, rich, preps)
//   node tools/suite.mjs --tier full --logs /path/dir     # مكان السجلات (الافتراضي مجلد مؤقت يُطبع مساره)
//
// الخطوات (بالترتيب، واحدة بعد أخرى — لا تشغّل اختبارين بالمتصفح معًا على هذا الجهاز):
//   doctor     tools/doctor.mjs (ثوانٍ)
//   preps      tools/prep-check.mjs على كل الباقات (ثوانٍ)
//   align      tests/noor-mock/real-trees/align.mjs — كل حصة لها درس في كل شجرة نور حقيقية، دون متصفح (ثوانٍ)
//   rich       tests/rich-format.mjs — تنسيق كل حقل كما يُكتب في نور (دقائق)
//   scenarios  tests/noor-mock/run.mjs — السيناريوهات كاملة (~30 دقيقة)
//   matrix     tests/noor-mock/matrix.mjs — كل الباقات (full) أو عينة 24 (short)
//   oneper     matrix --fault oneper --flows term — حصص أقل من الخطة (full فقط، ~75 دقيقة)
//   real       matrix على شجرات نور الحقيقية --fault none (full فقط)
//   gate       tests/build-release.sh <version> — يبني zipين ويجرّبهما (فقط مع --version وبعد نجاح كل ما قبله)
// قاعدة الإصدار: لا يُسلَّم zip إلا بعد نجاح كل الخطوات، ومعه سطر الخلاصة.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const TIER = opt('tier', 'full');
const VERSION = opt('version', '');
const LOGS = path.resolve(opt('logs', fs.mkdtempSync(path.join(os.tmpdir(), 'hader-suite-'))));
const JOBS = opt('jobs', '3');
const VERB = argv.includes('-v');
fs.mkdirSync(LOGS, { recursive: true });
if (!['full', 'short'].includes(TIER)) { console.error('--tier full أو short'); process.exit(2); }
const manifestV = JSON.parse(fs.readFileSync(path.join(REPO, 'extension/manifest.json'), 'utf8')).version;
if (VERSION && VERSION !== manifestV) { console.error(`--version ${VERSION} لكن extension/manifest.json يقول ${manifestV}: شغّل node tools/bump.mjs ${VERSION} أولًا`); process.exit(2); }

const count = (s, re) => (s.match(re) || []).length;
const matrixSum = (name) => (o) => {
  const pass = count(o, /^PASS \[/gm), fail = count(o, /^FAIL \[/gm), m = o.match(/=== Matrix: (\d+) packages · \d+ flows · (\d+) checks · (\d+) failed/);
  return { ok: !!m && +m[3] === 0 && fail === 0, text: `${name} ${pass}/${pass + fail}${m ? ` (${m[2]})` : ''}` };
};
const node = (...a) => [process.execPath, a];
const STEPS = {
  doctor: { cmd: node('tools/doctor.mjs', '--quiet'), sum: (o, rc) => ({ ok: rc === 0, text: `doctor ${rc === 0 ? 'ok' : 'FAIL'}` }) },
  preps: { cmd: node('tools/prep-check.mjs'), sum: (o, rc) => ({ ok: rc === 0, text: `preps ${(o.match(/— (\d+) باقة/) || [])[1] || '?'}${rc ? ' FAIL' : ''}` }) },
  align: {
    cmd: node('tests/noor-mock/real-trees/align.mjs'),
    sum: (o, rc) => {
      // مادة لها في _gaps دروس ملف بلا درس في نور (معروفة، تحتاج محتوى لا كودًا) لا تُعدّ فاشلة إن نقصت حصصها
      const gaps = JSON.parse(fs.readFileSync(path.join(REPO, 'tests/noor-mock/real-trees/trees.json'), 'utf8'))._gaps || {};
      const ls = o.split('\n').filter((l) => /sessions \d+\/\d+/.test(l));
      let known = 0;
      const full = ls.filter((l) => {
        const m = l.match(/^(\S+)\s+sessions (\d+)\/(\d+)/);
        if (/MISMATCH/.test(l)) return false;
        if (m[2] === m[3]) return true;
        if (gaps[m[1]] && gaps[m[1]].file) { known++; return true; }
        return false;
      }).length;
      return { ok: rc === 0 && ls.length > 0 && full === ls.length, text: `align ${full}/${ls.length}${known ? ` (${known} known gaps)` : ''}` };
    },
  },
  rich: { cmd: [process.execPath, ['--max-old-space-size=3000', 'tests/rich-format.mjs']], sum: (o, rc) => { const b = (o.match(/bad: (\d+)/) || [])[1]; return { ok: rc === 0 && b === '0', text: `rich ${b ?? '?'}` }; } },
  scenarios: {
    cmd: node('tests/noor-mock/run.mjs'),
    sum: (o, rc) => { const p = count(o, /^PASS {2}Scenario/gm), f = count(o, /^FAIL {2}Scenario/gm); return { ok: rc === 0 && p > 0 && !f, text: `scenarios ${p}/${p + f}` }; },
  },
  matrix: { cmd: node('tests/noor-mock/matrix.mjs', '--jobs', JOBS, ...(TIER === 'short' ? ['--sample', '24'] : [])), env: TIER === 'short' ? { REPORT: path.join(LOGS, 'matrix-report') } : {}, sum: matrixSum('matrix') },
  oneper: { cmd: node('tests/noor-mock/matrix.mjs', '--jobs', JOBS, '--fault', 'oneper', '--flows', 'term'), env: { REPORT: path.join(LOGS, 'oneper-report') }, sum: matrixSum('oneper') },
  real: { cmd: node('tests/noor-mock/matrix.mjs', '--jobs', JOBS, '--fault', 'none'), env: { REAL_TREES: path.join(REPO, 'tests/noor-mock/real-trees/trees.json'), REPORT: path.join(LOGS, 'real-report') }, sum: matrixSum('real') },
  gate: {
    cmd: ['bash', ['tests/build-release.sh', VERSION]],
    sum: (o, rc) => { const g = [...o.matchAll(/GATE PASSED — (\d+)\/(\d+)/g)]; return { ok: rc === 0 && g.length === 2, text: `gate ${g.length === 2 ? `${g[0][1]}/${g[0][2]}` : 'FAIL'}` }; },
  },
};
const order = opt('steps', '') ? opt('steps').split(',') :
  TIER === 'full' ? ['doctor', 'align', 'rich', 'matrix', 'oneper', 'real', 'scenarios', ...(VERSION ? ['gate'] : [])]
    : ['doctor', 'align', 'scenarios', 'matrix', ...(VERSION ? ['gate'] : [])];
const unknown = order.filter((s) => !STEPS[s]);
if (unknown.length) { console.error(`خطوات غير معروفة: ${unknown.join(', ')} — المتاح: ${Object.keys(STEPS).join(', ')}`); process.exit(2); }
if (order.includes('gate') && !VERSION) { console.error('خطوة gate تحتاج --version'); process.exit(2); }

const run = (name, [cmd, args], env = {}) => new Promise((res) => {
  const log = fs.createWriteStream(path.join(LOGS, name + '.log'));
  let out = '';
  const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env } });
  const on = (d) => { out += d; log.write(d); if (VERB) process.stdout.write(d); };
  p.stdout.on('data', on); p.stderr.on('data', on);
  p.on('close', (rc) => { log.end(); res({ out, rc }); });
});

const fmt = (ms) => { const m = Math.round(ms / 60000); return m ? `${m} min` : `${Math.round(ms / 1000)}s`; };
console.log(`«حاضر» ${manifestV} — اختبارات ${TIER === 'full' ? 'كاملة' : 'قصيرة'}: ${order.join(' → ')}\nالسجلات: ${LOGS}`);
const T0 = Date.now(), results = [];
let failed = false;
for (const name of order) {
  if (name === 'gate' && failed) { results.push({ name, ok: false, text: 'gate skipped' }); console.log('  ✗ gate — لم تُشغَّل: خطوة سابقة فشلت (لا zip)'); continue; }
  const t = Date.now();
  process.stdout.write(`  … ${name}`);
  const { out, rc } = await run(name, STEPS[name].cmd, STEPS[name].env);
  const s = STEPS[name].sum(out, rc);
  results.push({ name, ...s });
  if (!s.ok) failed = true;
  process.stdout.write(`\r  ${s.ok ? '✓' : '✗'} ${s.text} (${fmt(Date.now() - t)})${s.ok ? '' : ` — ${path.join(LOGS, name + '.log')}`}\n`);
}
const line = results.filter((r) => r.name !== 'doctor').map((r) => r.text).join(', ');
const verdict = failed ? `SUITE FAILED — ${line}` : `SUITE PASSED — ${line}`;
fs.writeFileSync(path.join(LOGS, 'summary.txt'), verdict + '\n');
console.log(`\n${verdict} (${fmt(Date.now() - T0)})`);
if (VERSION && !failed) console.log(`الملفان: /mnt/project-files/afaq-platform/chrome-store/hader-store-${VERSION}.zip و release/hader-extension-${VERSION}.zip`);
process.exit(failed ? 1 : 0);
