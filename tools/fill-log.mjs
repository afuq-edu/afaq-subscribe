#!/usr/bin/env node
// fill-log.mjs — يحلّل «سجل التعبئة» (جدول fill_log) لمعلم واحد ويستخرج المشاكل منه بدل قراءته سطرًا سطرًا.
//
//   node tools/fill-log.mjs log.json              # ملخص كل تشغيلة + المشاكل
//   node tools/fill-log.mjs log.json -v           # وكل سطر في كل تشغيلة
//   node tools/fill-log.mjs log.json --run <id>   # تشغيلة واحدة بكل أسطرها
//   pbpaste | node tools/fill-log.mjs -           # من الحافظة / stdin
//
// المدخل: مصفوفة JSON من أسطر السجل، كما ينسخها زر «نسخ للتحليل» في لوحة الإدارة تحت «سجل التعبئة»، أو كما يرجعها
// admin_fill_log(<رقم الطلب>) أو select * from fill_log (الحقول: run_id, mode, ver, package_id, term, lesson_id, lesson_title,
// noor_lesson, noor_unit, pub_date, moved_from, status, note, client_at, at). يُقبل أيضًا {rows:[…]} أو سطر JSON لكل صف.
//
// ما يكشفه: حصة حُفظت مرتين (في التشغيلة نفسها أو في تشغيلتين — احتمال تكرار في نور)، حصص غير مؤكدة أو لم تُحفظ مع سببها،
// تشغيلة بدأت ولم تنته، تاريخ نشر يوم جمعة/سبت، حصة تاريخها قبل حصة سبقتها في الملف، حصة محفوظة بلا درس نور، الحصص المزحزحة.
// يخرج بالرمز 1 إن وُجدت مشكلة تستحق النظر (تكرار، فشل، ترتيب، عطلة).
import fs from 'node:fs';

const argv = process.argv.slice(2);
const VERB = argv.includes('-v');
const ri = argv.indexOf('--run');
const RUN = ri >= 0 ? argv[ri + 1] : '';
const input = argv.find((a, i) => (a === '-' || !a.startsWith('-')) && !(ri >= 0 && i === ri + 1));
if (!input) { console.error('usage: node tools/fill-log.mjs <log.json | -> [-v] [--run <run_id>]'); process.exit(2); }

const raw = fs.readFileSync(input === '-' ? 0 : input, 'utf8').trim();
let rows;
try { const j = JSON.parse(raw); rows = Array.isArray(j) ? j : (j.rows || j.data || j.admin_fill_log || []); }
catch (e) { rows = raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
if (rows.length === 1 && Array.isArray(rows[0].admin_fill_log)) rows = rows[0].admin_fill_log;   // ناتج execute_sql لـ select admin_fill_log(…)
if (!rows.length) { console.log('السجل فارغ.'); process.exit(0); }

const FINAL = { saved: 'حُفظت', unconfirmed: 'غير مؤكدة', failed: 'لم تُحفظ', skipped: 'تُخطّيت' };
const MODE = { pick: 'حصص مختارة', term: 'الفصل كاملًا' };
const DAY = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const when = (x) => x.client_at || x.at || '';
const short = (iso) => String(iso || '').replace('T', ' ').slice(0, 16);
const d10 = (x) => (x ? String(x).slice(0, 10) : '');
const name = (x) => x.lesson_title || x.lesson_id || '—';

const runs = new Map();
for (const x of rows) { const k = x.run_id || '#' + (x.id ?? runs.size); if (!runs.has(k)) runs.set(k, []); runs.get(k).push(x); }
for (const list of runs.values()) list.sort((a, b) => String(when(a)).localeCompare(String(when(b))) || (a.id || 0) - (b.id || 0));
const order = [...runs.entries()].sort((a, b) => String(when(a[1][0])).localeCompare(String(when(b[1][0]))));

let problems = 0;
const savedIn = new Map();   // package|lesson_id → [run keys] (كل الحصص المحفوظة عبر التشغيلات)
const P = (s) => { problems++; console.log(`    ✗ ${s}`); };

console.log(`سجل التعبئة — ${rows.length} سطرًا في ${runs.size} تشغيلة (${short(when(order[0][1][0]))} ← ${short(when(order[order.length - 1][1].slice(-1)[0]))})`);
for (const [key, list] of order) {
  if (RUN && key !== RUN) continue;
  const f = list.find((x) => x.package_id) || list[0];
  // الحكم لآخر سطر نهائي لكل حصة في التشغيلة (كما تعرضه لوحة الإدارة)، وما قبله يُذكر فقط إن كان حفظًا ثانيًا
  const last = new Map(), savedRows = new Map();
  for (const x of list) {
    if (!FINAL[x.status] || !x.lesson_id) continue;
    last.set(x.lesson_id, x);
    if (x.status === 'saved') { if (!savedRows.has(x.lesson_id)) savedRows.set(x.lesson_id, []); savedRows.get(x.lesson_id).push(x); }
  }
  const finals = [...last.values()];
  const cnt = Object.keys(FINAL).map((s) => [s, finals.filter((x) => x.status === s).length]).filter(([, n]) => n);
  console.log(`\n▸ تشغيلة ${key} · ${short(when(list[0]))} · «حاضر» ${f.ver || '؟'} · ${f.title || f.package_id || '؟'}${f.term ? ` ف${f.term}` : ''} · ${MODE[f.mode] || f.mode || '؟'}`);
  console.log(`    ${cnt.map(([s, n]) => `${n} ${FINAL[s]}`).join(' · ') || 'لا حصص'}${list.some((x) => x.status === 'end') ? '' : ' · لم تنته (أُغلقت أو انقطعت قبل «انتهى»)'}`);
  const end = list.filter((x) => x.status === 'end').pop(); if (end && end.note) console.log(`    انتهت: ${end.note}`);
  const st = list.find((x) => x.status === 'start'); if (st && st.note) console.log(`    البداية: ${st.note}`);

  for (const [id, xs] of savedRows) {
    if (xs.length > 1) P(`«${name(xs[0])}» حُفظت ${xs.length} مرات في هذه التشغيلة (${xs.map((x) => d10(x.pub_date)).join('، ')}) — افحص تكرارها في نور`);
    const k = (f.package_id || '') + '|' + id; if (!savedIn.has(k)) savedIn.set(k, []); savedIn.get(k).push({ run: key, x: xs[0] });
  }
  for (const x of finals) {
    if (x.status === 'failed') P(`لم تُحفظ: «${name(x)}»${x.pub_date ? ` (${d10(x.pub_date)})` : ''} — ${x.note || 'بلا سبب'}`);
    if (x.status === 'unconfirmed') P(`غير مؤكدة: «${name(x)}»${x.pub_date ? ` (${d10(x.pub_date)})` : ''} — ${x.note || 'لم يُقرأ الحفظ من قائمة نور'}`);
    if (x.status === 'saved' && !x.noor_lesson) P(`«${name(x)}» محفوظة ولا درس نور مسجّل لها`);
    if (x.pub_date) { const wd = new Date(d10(x.pub_date) + 'T00:00:00Z').getUTCDay(); if (wd === 5 || wd === 6) P(`«${name(x)}» نُشرت يوم ${DAY[wd]} ${d10(x.pub_date)}`); }
  }
  // ترتيب الملف: معرّفات الحصص (…-t1-001) متصاعدة، فتاريخ حصة لاحقة لا يسبق تاريخ حصة قبلها
  const dated = finals.filter((x) => x.status === 'saved' && x.pub_date && x.lesson_id).sort((a, b) => String(a.lesson_id).localeCompare(String(b.lesson_id), 'en', { numeric: true }));
  for (let i = 1; i < dated.length; i++) if (d10(dated[i].pub_date) < d10(dated[i - 1].pub_date)) P(`ترتيب: «${name(dated[i])}» (${d10(dated[i].pub_date)}) قبل «${name(dated[i - 1])}» (${d10(dated[i - 1].pub_date)}) وهي بعدها في الملف`);
  const moved = finals.filter((x) => x.moved_from && x.pub_date);
  if (moved.length) console.log(`    زُحزحت ${moved.length}: ${moved.slice(0, 6).map((x) => `«${name(x)}» ${d10(x.moved_from)}→${d10(x.pub_date)}`).join('، ')}${moved.length > 6 ? '، …' : ''}`);
  const skipped = finals.filter((x) => x.status === 'skipped');
  if (skipped.length) {
    const why = new Map(); skipped.forEach((x) => why.set(x.note || 'بلا سبب', (why.get(x.note || 'بلا سبب') || 0) + 1));
    console.log(`    تُخطّيت ${skipped.length}: ${[...why].map(([w, n]) => `${n}× ${w}`).join(' · ')}`);
  }
  if (VERB || RUN) for (const x of list) console.log(`      ${short(when(x)).slice(11)} ${String(x.status).padEnd(11)} ${name(x)}${x.noor_lesson ? ' → ' + x.noor_lesson : ''}${x.pub_date ? ' · ' + d10(x.pub_date) : ''}${x.moved_from ? ' (كان ' + d10(x.moved_from) + ')' : ''}${x.note ? ' · ' + x.note : ''}`);
}
if (!RUN) {
  const across = [...savedIn.values()].filter((v) => new Set(v.map((y) => y.run)).size > 1);
  if (across.length) {
    console.log('\n▸ حصص حُفظت في أكثر من تشغيلة (إعادة تشغيل كان يجب ألا تضيف شيئًا — افحصها في نور):');
    across.slice(0, 20).forEach((v) => P(`«${name(v[0].x)}» في ${v.length} تشغيلات: ${v.map((y) => d10(y.x.pub_date) || '؟').join('، ')}`));
    if (across.length > 20) console.log(`    … و${across.length - 20} أخرى`);
  }
}
console.log(`\n${problems ? `${problems} مشكلة تستحق النظر` : 'لا مشاكل في السجل'}`);
process.exit(problems ? 1 : 0);
