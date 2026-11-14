#!/usr/bin/env node
// صفحة مراجعة: تحضير مادة عربية موزعًا على المهارات كما تكتبه «حاضر» في نور عند اختيار «تحضير لكل مهارة».
// الاستعمال: node tools/skill-preview.mjs <ملف الباقة.json> <ملف الخرج.html>
// المحتوى من دوال الإضافة نفسها (lessonSkills / joinRuns / joinLessons) فلا يختلف عمّا يُحفظ في نور.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.chrome = { runtime: { getManifest: () => ({ version: '0' }) }, storage: { local: { get: async () => ({}), set: async () => {} } } };
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const P = await import(pathToFileURL(path.join(ROOT, 'extension', 'packages.js')).href);

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('الاستعمال: node tools/skill-preview.mjs <ملف الباقة.json> <ملف الخرج.html>'); process.exit(2); }
const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));
pkg.id = String(pkg.id || '').replace(/-t\d+$/, '');
if (!P.isArabicPkg(pkg)) { console.error('ليست مادة لغة عربية: ' + pkg.id); process.exit(2); }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>');
const list = (v) => (Array.isArray(v) ? v.join('، ') : String(v || ''));
const bare = (t) => String(t || '').replace(/^\s*الحصة\s+[^:：]{1,24}[:：]\s*/, '').trim();
const FIELDS = [
  ['outcomes', 'المخرجات التعليمية'], ['levels', 'المستوى'], ['strategies', 'الاستراتيجيات'], ['resources', 'المصادر التعليمية'],
  ['concepts', 'المفاهيم'], ['intro', 'التهيئة'], ['procedures', 'إجراءات سير الدرس'], ['formative', 'التقويم التكويني'], ['summative', 'التقويم الختامي'], ['notes', 'ملاحظات'],
];
const SKILL_CLASS = { 'التحدث': 'k1', 'الاستماع': 'k2', 'القراءة': 'k3', 'الأنماط اللغوية': 'k4', 'الإملاء': 'k5', 'الخط': 'k6', 'التعبير': 'k7', 'الكتابة': 'k7', 'المراجعة والتقويم': 'k8' };

const skills = P.lessonSkills(pkg);
let preps = 0, sessions = 0;
const count = {};
const body = [];
let unit = null;
for (const g of P.lessonGroups(pkg)) {
  if (g.unit !== unit) { unit = g.unit; body.push(`<h2>${esc(unit || '')}</h2>`); }
  const runs = P.joinRuns(pkg, g.sessions, skills);
  body.push(`<section class="lesson"><h3>${esc(g.lesson)} <span class="n">${g.sessions.length} حصة · ${runs.length} تحضير</span></h3>`);
  for (const r of runs) {
    const ns = r.ls.map((l) => g.sessions.indexOf(l) + 1);
    const one = r.ls.length > 1 ? P.joinLessons(r.ls[0], r.ls.slice(1), { skill: true }) : r.ls[0];
    const tag = P.skillTag(r.skill), suffix = ns.length > 1 ? ` (${ns.join(' و ')})` : ns[0] > 1 ? ` (${ns[0]})` : '';
    preps++; sessions += r.ls.length; count[r.skill || 'بلا مهارة ظاهرة'] = (count[r.skill || 'بلا مهارة ظاهرة'] || 0) + 1;
    body.push(`<details class="prep ${SKILL_CLASS[r.skill] || 'k0'}"><summary><span class="skill">${esc(r.skill || 'تحضير')}</span>`
      + `<span class="title">${esc(tag + g.lesson + suffix)}</span><span class="n">${r.ls.length === 1 ? 'حصة واحدة' : r.ls.length === 2 ? 'حصتان' : r.ls.length + ' حصص'}</span>`
      + `<ul class="topics">${r.ls.map((l, i) => `<li><b>${ns[i]}</b> ${esc(bare(l.title))}</li>`).join('')}</ul></summary>`
      + `<table>${FIELDS.map(([k, name]) => { const v = k === 'strategies' || k === 'resources' ? [list(one[k]), one[k + 'Other']].filter(Boolean).join('، ') : list(one[k]); return v ? `<tr><th>${name}</th><td>${text(v)}</td></tr>` : ''; }).join('')}</table></details>`);
  }
  body.push('</section>');
}

const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pkg.title || pkg.subject)} — حسب المهارة</title>
<style>
  :root { --ink: #1c2530; --mute: #5d6b7a; --line: #dfe5ec; --bg: #f6f8fa; --card: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.75 "Noto Naskh Arabic", "Geeza Pro", "Segoe UI", Tahoma, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .lead { color: var(--mute); margin: 0 0 16px; }
  .sum { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px; padding: 0; list-style: none; }
  .sum li { background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 2px 12px; font-size: 14px; }
  h2 { font-size: 20px; margin: 36px 0 8px; padding-bottom: 6px; border-bottom: 2px solid var(--ink); }
  .lesson { margin: 18px 0; }
  h3 { font-size: 17px; margin: 0 0 8px; }
  .n { color: var(--mute); font-size: 13px; font-weight: 400; margin-inline-start: 8px; white-space: nowrap; }
  .prep { background: var(--card); border: 1px solid var(--line); border-inline-start: 6px solid var(--k); border-radius: 8px; margin: 6px 0; }
  .prep summary { cursor: pointer; padding: 8px 12px; list-style: none; }
  .prep summary::-webkit-details-marker { display: none; }
  .skill { display: inline-block; background: var(--k); color: #fff; border-radius: 6px; padding: 0 10px; font-size: 14px; margin-inline-end: 8px; }
  .title { font-weight: 700; }
  .topics { margin: 4px 0 0; padding: 0; list-style: none; color: var(--mute); font-size: 14px; }
  .topics b { display: inline-block; min-width: 1.6em; color: var(--ink); }
  table { width: 100%; border-collapse: collapse; border-top: 1px solid var(--line); }
  th, td { text-align: start; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 15px; }
  th { width: 150px; background: var(--bg); font-weight: 700; }
  td { overflow-wrap: anywhere; }
  .k0 { --k: #6b7785; } .k1 { --k: #b4532a; } .k2 { --k: #8a5a9b; } .k3 { --k: #1f6f8b; } .k4 { --k: #2e7d4f; }
  .k5 { --k: #a13d63; } .k6 { --k: #8a6d1d; } .k7 { --k: #3b5ba9; } .k8 { --k: #55616e; }
  @media (max-width: 640px) { th { width: 96px; } th, td { padding: 6px 8px; } }
  @media print { details.prep { break-inside: avoid; } body { background: #fff; } }
</style></head><body><main>
<h1>${esc(pkg.title || pkg.subject)} — التحضير حسب المهارة</h1>
<p class="lead">كل سطر ملوّن تحضير واحد يُحفظ في نور باسم المهارة واسم الدرس، وتحته حصصه. انقر السطر لترى بنود التحضير كما تُكتب في نور.</p>
<ul class="sum"><li>${preps} تحضيرًا لـ ${sessions} حصة</li>${Object.entries(count).map(([k, n]) => `<li>${esc(k)}: ${n}</li>`).join('')}</ul>
${body.join('\n')}
</main></body></html>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${pkg.id}: ${preps} تحضيرًا لـ ${sessions} حصة ← ${out} (${Math.round(html.length / 1024)} KB)`);
