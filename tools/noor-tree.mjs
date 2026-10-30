#!/usr/bin/env node
// noor-tree.mjs — يضيف شجرات نور الحقيقية (جدول noor_trees) إلى tests/noor-mock/real-trees/trees.json التي تُختبر عليها «حاضر».
//
//   node tools/noor-tree.mjs trees-export.json            # يعرض الجديد والمتغير فقط (لا يكتب شيئًا)
//   node tools/noor-tree.mjs trees-export.json --write    # يكتبها في trees.json
//   node tools/noor-tree.mjs trees-export.json --write --alias   # ويجعل الفترة الأخرى (en-2 ↔ en-2-2) تستعمل الشجرة نفسها إن لم تكن لها شجرة
//   pbpaste | node tools/noor-tree.mjs - --write
//
// المدخل: مصفوفة صفوف noor_trees فيها package_id و lessons ([{u,t,f,n}]) و term و seen و last_at — كما ينسخها زر
// «نسخ كل الشجرات للاختبارات» في لوحة الإدارة ← «شجرات نور»، أو ناتج:
//   select id, package_id, term, term_text, seen, last_at, ver, lessons from noor_trees order by last_at desc;
// لكل مادة تُختار الشجرة الأكثر رؤية (ثم الأحدث) كما تفعل ext_tree_get. الفصل الأول فقط افتراضيًا (--term 2 للثاني).
// بعد الكتابة: شغّل الفحص دون متصفح ثم الاختبار في المتصفح على المواد الجديدة (يطبع الأمرين).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TREES = path.join(REPO, 'tests/noor-mock/real-trees/trees.json');
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write'), ALIAS = argv.includes('--alias');
const ti = argv.indexOf('--term');
const TERM = ti >= 0 ? +argv[ti + 1] : 1;
const input = argv.find((a, i) => (a === '-' || !a.startsWith('-')) && !(ti >= 0 && i === ti + 1));
if (!input) { console.error('usage: node tools/noor-tree.mjs <export.json | -> [--write] [--alias] [--term N]'); process.exit(2); }

let rows = JSON.parse(fs.readFileSync(input === '-' ? 0 : input, 'utf8'));
if (!Array.isArray(rows)) rows = rows.rows || rows.data || [];
rows = rows.filter((r) => r && r.package_id && Array.isArray(r.lessons) && r.lessons.length && (r.term == null || +r.term === TERM));

// أفضل شجرة لكل مادة: الأكثر رؤية ثم الأحدث
const best = new Map(), count = new Map();
for (const r of rows) {
  count.set(r.package_id, (count.get(r.package_id) || 0) + 1);
  const b = best.get(r.package_id);
  if (!b || (r.seen || 1) > (b.seen || 1) || ((r.seen || 1) === (b.seen || 1) && String(r.last_at || '') > String(b.last_at || ''))) best.set(r.package_id, r);
}

const T = JSON.parse(fs.readFileSync(TREES, 'utf8'));
const resolve = (id) => { let t = T[id]; if (typeof t === 'string') t = T[t]; return Array.isArray(t) ? t : null; };
const key = (t) => t.map(([u, l]) => u + '|' + l).join('\n');
const added = [], changed = [], same = [];
for (const [id, r] of [...best].sort((a, b) => a[0].localeCompare(b[0]))) {
  const tree = r.lessons.map((x) => [String(x.u || ''), String(x.t || '')]).filter(([, l]) => l.trim());
  const old = resolve(id);
  const units = new Set(tree.map(([u]) => u)).size, orphans = r.lessons.filter((x) => !x.f).length;
  const info = `${tree.length} درسًا في ${units} وحدة · بلا تحضير ${orphans} · رآها ${r.seen || 1}${count.get(id) > 1 ? ` · ${count.get(id)} نسخ مختلفة من المدارس` : ''}`;
  if (!old) { added.push(id); console.log(`+ ${id.padEnd(8)} جديدة: ${info}`); }
  else if (key(old) !== key(tree)) {
    const o = new Set(old.map(([u, l]) => u + '|' + l)), n = new Set(tree.map(([u, l]) => u + '|' + l));
    const gone = [...o].filter((x) => !n.has(x)), plus = [...n].filter((x) => !o.has(x));
    changed.push(id);
    console.log(`~ ${id.padEnd(8)} تغيّرت: ${info} · +${plus.length} −${gone.length}${typeof T[id] === 'string' ? ` (كانت تحيل إلى ${T[id]})` : ''}`);
    plus.slice(0, 4).forEach((x) => console.log(`      + ${x.replace('|', ' » ')}`));
    gone.slice(0, 4).forEach((x) => console.log(`      − ${x.replace('|', ' » ')}`));
  } else { same.push(id); continue; }
  if (WRITE) T[id] = tree;
}
const aliases = [];
if (ALIAS) for (const id of [...added, ...changed]) {
  const other = /-2$/.test(id) ? id.replace(/-2$/, '') : id + '-2';
  if (!(other in T)) { aliases.push(`${other} → ${id}`); if (WRITE) T[other] = id; }
}
aliases.forEach((a) => console.log(`= ${a} (الفترة الأخرى تستعمل الشجرة نفسها)`));
console.log(`\n${best.size} مادة في المدخل: ${added.length} جديدة · ${changed.length} تغيّرت · ${same.length} كما هي`);
if (!added.length && !changed.length && !aliases.length) process.exit(0);
if (!WRITE) { console.log('لم يُكتب شيء. أضف --write لكتابتها في tests/noor-mock/real-trees/trees.json'); process.exit(0); }
const today = new Date().toISOString().slice(0, 10);
T._note = String(T._note || '').replace(/(, updated \d{4}-\d{2}-\d{2})?\)/, `, updated ${today})`);
fs.writeFileSync(TREES, JSON.stringify(T));
const ids = [...added, ...changed];
console.log(`كُتبت في ${path.relative(REPO, TREES)}. التالي:`);
console.log('  node tests/noor-mock/real-trees/align.mjs                 # دون متصفح: كل حصة لها درس، وكل درس نور له حصة');
console.log(`  REAL_TREES=tests/noor-mock/real-trees/trees.json REPORT=/tmp/real node tests/noor-mock/matrix.mjs --fault none --jobs 3 --only ${ids.map((x) => x + '-t1').join(',')}`);
