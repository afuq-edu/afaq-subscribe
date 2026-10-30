#!/usr/bin/env node
// bump.mjs — يرفع رقم إصدار «حاضر» في extension/manifest.json (السطر وحده، دون إعادة تنسيق الملف).
//
//   node tools/bump.mjs              # الرقم الأخير +1: 4.10.18 → 4.10.19
//   node tools/bump.mjs 4.11.0       # رقم محدد (يجب أن يكون أعلى من الحالي — متجر كروم يرفض رقمًا أقل أو مساويًا)
//   node tools/bump.mjs --check      # يطبع الرقم الحالي والتالي فقط
//
// لا يبني zip ولا يدمج شيئًا: بعده شغّل الاختبارات المطلوبة ثم tests/build-release.sh <الرقم> (أو tools/suite.mjs --version <الرقم>).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../extension/manifest.json');
const src = fs.readFileSync(FILE, 'utf8');
const cur = JSON.parse(src).version;
const arg = process.argv[2] || 'patch';
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const next = /^\d+(\.\d+){1,3}$/.test(arg) ? arg : cur.replace(/(\d+)$/, (n) => String(+n + 1));
if (arg === '--check') { console.log(`الحالي ${cur} · التالي ${cur.replace(/(\d+)$/, (n) => String(+n + 1))}`); process.exit(0); }
if (!/^\d+(\.\d+){1,3}$/.test(next) || next.split('.').some((n) => +n > 65535)) { console.error(`«${arg}» ليس رقم إصدار صالحًا لكروم (حتى 4 أرقام، كل منها ≤ 65535)`); process.exit(2); }
if (cmp(next, cur) <= 0) { console.error(`${next} ليس أعلى من الإصدار الحالي ${cur}`); process.exit(1); }
const out = src.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`);
fs.writeFileSync(FILE, out);
if (JSON.parse(out).version !== next) { fs.writeFileSync(FILE, src); console.error('فشل التعديل، أُعيد الملف كما كان'); process.exit(1); }
console.log(`«حاضر» ${cur} → ${next}`);
console.log(`التالي: node tools/suite.mjs --tier full --version ${next}   (أو short لتعديل الواجهة والنصوص فقط)`);
