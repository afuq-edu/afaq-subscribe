// يفحص ملفات أنشطة الدروس: node tools/games/check.mjs site/games/<pkg> [...]
// يطبع سطرًا لكل ملف فيه مشكلة، ويخرج بـ 1 إن وُجدت مشكلات.
import fs from 'node:fs';
import path from 'node:path';

const LV = ['التذكر', 'التطبيق', 'التحليل'];
const HUNT_MAX = 24;
const str = (s) => typeof s === 'string' && s.trim().length > 0;
const uniq = (a) => new Set(a.map((x) => x.trim())).size === a.length;

export function check(G) {
  const e = [];
  for (const k of ['subject', 'grade', 'lesson']) if (!str(G[k])) e.push('missing ' + k);
  if (!Array.isArray(G.outcomes) || G.outcomes.length < 1 || G.outcomes.length > 3 || !G.outcomes.every(str)) e.push('outcomes: 1–3 strings');
  const ten = (k) => Array.isArray(G[k]) && G[k].length === 10 || (e.push(k + ': need exactly 10'), false);
  if (ten('tf')) {
    G.tf.forEach((x, i) => { if (!str(x.s) || typeof x.t !== 'boolean' || !str(x.why)) e.push('tf[' + i + '] needs s, t (true/false), why'); });
    const t = G.tf.filter((x) => x.t === true).length;
    if (t < 3 || t > 7) e.push('tf: ' + t + ' true of 10, keep 3–7');
  }
  if (ten('boxes')) G.boxes.forEach((x, i) => { if (!str(x.q) || !Array.isArray(x.o) || x.o.length !== 3 || !x.o.every(str) || !uniq(x.o) || !str(x.why)) e.push('boxes[' + i + '] needs q, 3 distinct o, why'); });
  if (ten('mcq')) G.mcq.forEach((x, i) => { if (!str(x.q) || !Array.isArray(x.o) || x.o.length !== 4 || !x.o.every(str) || !uniq(x.o) || !str(x.why) || !LV.includes(x.lv)) e.push('mcq[' + i + '] needs q, 4 distinct o, why, lv in ' + LV.join('/')); });
  if (G.hunt !== undefined && ten('hunt')) G.hunt.forEach((x, i) => {
    if (!str(x.q) || !str(x.a) || !Array.isArray(x.d) || x.d.length !== 3 || !x.d.every(str) || !uniq([x.a, ...x.d])) e.push('hunt[' + i + '] needs q, a, 3 distinct d');
    else for (const w of [x.a, ...x.d]) if ([...w].length > HUNT_MAX) e.push('hunt[' + i + '] "' + w + '" longer than ' + HUNT_MAX);
  });
  const qs = [...(G.tf || []).map((x) => x.s), ...(G.boxes || []).map((x) => x.q), ...(G.mcq || []).map((x) => x.q)].filter(str).map((s) => s.trim());
  if (qs.length !== new Set(qs).size) e.push('a question is repeated');
  return e;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  let bad = 0, ok = 0, missing = 0;
  for (const dir of process.argv.slice(2)) {
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    for (const [name, n] of Object.entries(idx)) {
      const f = path.join(dir, n + '.json');
      if (!fs.existsSync(f)) { missing++; console.log(f + ': missing (' + name + ')'); continue; }
      let G, e;
      try { G = JSON.parse(fs.readFileSync(f, 'utf8')); e = check(G); } catch (x) { e = ['invalid JSON: ' + x.message]; }
      if (G && G.lesson !== name) e.push('lesson must be exactly "' + name + '"');
      if (e.length) { bad++; console.log(f + ': ' + e.join('; ')); } else ok++;
    }
  }
  console.log(ok + ' ok, ' + bad + ' with problems, ' + missing + ' missing');
  process.exit(bad || missing ? 1 : 0);
}
