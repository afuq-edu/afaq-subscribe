// offline: run alignGroups of a semester.js copy on real Noor trees (no browser)
import fs from 'node:fs';
// node tests/noor-mock/real-trees/align.mjs [extDir=extension] [trees.json] [prepsDir]   (V=1: every lesson and every Noor lesson left without a prep)
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const [extDir = path.resolve(here, '../../../extension'), treesFile = here + '/trees.json', prepsDir = process.env.PREPS || '/mnt/project-files/afaq-platform/preps'] = process.argv.slice(2).map((x) => path.resolve(x));
const src = fs.readFileSync(extDir + '/semester.js', 'utf8').split('\n');
const a = src.findIndex((l) => l.startsWith('const toLat ='));
const b = src.findIndex((l) => l.startsWith('async function buildPlan'));
const body = src.slice(a, b).join('\n');
const mod = `import { kwNorm, ordinalOf, stripSessionSuffix, lessonNum, lessonGroups } from '${extDir}/packages.js';
import { unitNum, bestTreeLesson, closestTreeLesson, kwScore, titleSim, swappedPair, nameOnly, keywords } from '${extDir}/match.js';
const toAr = (n) => String(n);
${body}
const splitG = typeof splitByParts === 'function' ? splitByParts : (g) => g;
const unsure = typeof unsureLinks === 'function' ? unsureLinks : () => [];
export { alignGroups, lessonGroups, splitG, unsure };`;
const f = extDir + '/__align.mjs'; fs.writeFileSync(f, mod);
globalThis.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } }, runtime: { onMessage: { addListener() {} } } };
const { alignGroups, lessonGroups, splitG, unsure } = await import(f);
fs.unlinkSync(f);
const trees = JSON.parse(fs.readFileSync(treesFile, 'utf8'));
const files = []; for (const d of fs.readdirSync(prepsDir).filter((x) => /^g\d/.test(x))) { const p = prepsDir + '/' + d; if (fs.statSync(p).isDirectory()) for (const x of fs.readdirSync(p)) if (x.endsWith('-t1.json')) files.push(p + '/' + x); }
const bad = [];
for (const id of Object.keys(trees).filter((k) => k[0] !== '_')) {
  let t = trees[id]; if (typeof t === 'string') t = trees[t];
  const file = files.find((x) => x.endsWith('/' + id + '-t1.json')); if (!file) continue;
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nodes = t.map(([u, x], i) => ({ id: 'n' + i, unit: u, text: x }));
  const groups = splitG(lessonGroups(pkg), nodes);
  const res = alignGroups(groups, nodes, new Map());
  // as the wizard does before filling: weak links whose name/number does not confirm them are dropped (safeLinks), and with
  // unit names unlike Noor's every order/number link is dropped (autoResolve)
  const mism0 = res.unitsNamed >= 2 && res.unitsByName / res.unitsNamed < 0.5;
  const rows = groups.map((g, i) => ({ group: g, node: res[i].node, how: res[i].how, shared: res[i].shared, i }));
  const gone = new Set(unsure(rows).map((r) => r.i));
  if (mism0) rows.forEach((r) => { if (r.node && (r.how === 'order' || r.how === 'number')) gone.add(r.i); });
  gone.forEach((i) => { res[i] = Object.assign({}, res[i], { node: null, why: 'استُبعد قبل التعبئة: ' + res[i].how + ' لم يتأكد' }); });
  const ses = groups.reduce((s, g) => s + g.sessions.length, 0);
  const extra = new Set(((trees._gaps || {})[id] || {}).file || []); // file lessons the real Noor tree does not have: left out silently, the only tolerated gap
  const linked = groups.reduce((s, g, i) => s + (res[i].node || extra.has(g.lesson) ? g.sessions.length : 0), 0);
  const usedN = new Set(res.filter((r) => r.node).map((r) => r.node.id));
  const weak = res.filter((r) => r.node && (r.how === 'order' || r.how === 'number')).length;
  const mism = res.unitsNamed >= 2 && res.unitsByName / res.unitsNamed < 0.5;
  console.log(`${id.padEnd(7)} sessions ${linked}/${ses}  noor ${usedN.size}/${nodes.length}  weak ${weak}${mism ? ' MISMATCH' : ''}`);
  if (linked < ses || usedN.size < nodes.length) bad.push(id);
  if (process.env.V) groups.forEach((g, i) => console.log('   ', res[i].node ? `${res[i].how}${res[i].joined ? '+join' : ''} → ${res[i].node.text}` : `✗ ${res[i].why.slice(0, 60)}`, ' ⟵ ', g.lesson));
  if (process.env.V) nodes.filter((n) => !usedN.has(n.id)).forEach((n) => console.log('    orphan noor:', n.unit, '»', n.text));
}
// every session of the file must reach Noor and every Noor lesson must get its own prep: anything less fails
console.log(bad.length ? `INCOMPLETE ${bad.length}: ${bad.join(' ')}` : 'ALL COMPLETE');
process.exitCode = bad.length ? 1 : 0;
