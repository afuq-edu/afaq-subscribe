// align.js — ربط دروس مكتبتك (مجموعات: وحدة/درس) بعقد شجرة نور للفصل — منطق خالص بلا DOM (قابل للاختبار)
// ١) اختياراتك السابقة ٢) ترقيم «الدرس n من M» ٣) الوحدة باسمها ثم برقمها في الكتاب، والدرس داخلها: بالاسم نفسه حرفيًا أولًا،
// ثم التقريبي للمتبقّي (رقم الدرس فيصل بمخطط ترقيم كل جانب) ٤) الترتيب حين يتساوى العدد في المقطع نفسه.
// ما لا يمكن ربطه بأمان يُعلَّم للمراجعة (تربطه أنت من القائمة ويُحفظ اختيارك) — لا تخمين.
import { unitNum, bestTreeLesson, kwScore, kwNorm, numberScheme, lessonNumber, ordinalOf } from './match.js';

const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const toLat = (x) => String(x || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
// اسم الوحدة دون «الوحدة N:» في أوله إن تلاه اسم إنجليزي — رقمٌ لترتيب الملف، لا رقم الوحدة في الكتاب
// («الوحدة 2: Unit 1 – Talent show» ← «Unit 1 – Talent show»). في المواد العربية يبقى كما هو («الوحدة 2: الطعام»)
export const unitName = (t) => {
  const x = toLat(t).trim();
  const rest = x.replace(/^(?:ال)?وحد[ةه]\s*\d+\s*[:：\-–—]?\s*/, '');
  return rest !== x && /[a-z]/i.test(rest) ? rest.trim() : x;
};
function bookNo(t) {
  const n = unitName(t);
  const m = kwNorm(n).match(/(?:^|[^a-z])unit\s*(\d+)/);
  if (m) return +m[1];
  const u = unitNum(n);
  if (u != null) return u;
  return /[a-z]/i.test(n) && n !== toLat(t).trim() ? null : unitNum(t);
}
const digitsOf = (t) => new Set((unitName(t).match(/\d+/g) || []).map(Number));
export function alignGroups(groups, nodes, known) {
  const res = groups.map(() => ({ node: null, how: '', why: '' }));
  const used = new Set();
  const put = (gi, node, how) => { res[gi] = { node, how, why: '' }; used.add(node.id); };
  const fail = (gi, why) => { if (!res[gi].node) res[gi].why = why; };
  const ords = groups.map((g) => ordinalOf({ lesson: g.lesson }));
  if (ords.some(Boolean) && ords.every(Boolean)) {
    // أسماء ترتيبية: الرقم موضع الدرس بين دروس الفصل كلها
    const of = ords[0].of;
    if (ords.every((o) => o.of === of) && of === nodes.length) { groups.forEach((g, gi) => { const n = nodes[ords[gi].n - 1]; if (n && !used.has(n.id)) put(gi, n, 'ordinal'); else fail(gi, n ? 'رقمه مكرر في ملفك' : 'رقمه أكبر من عدد دروس الفصل'); }); return res; }
    if (groups.length === nodes.length) { groups.forEach((g, gi) => put(gi, nodes[gi], 'order')); return res; }
    groups.forEach((g, gi) => fail(gi, `دروس ملفك مرقّمة من ${toAr(of)} وشجرة الفصل فيها ${toAr(nodes.length)} درسًا`));
    return res;
  }
  // سبب عدم الربط — صادقًا: درس نور الأقرب أخذه درس آخر من ملفك (مع اسمه)، أو لا مقابل له في وحدته بنور، أو اختلاف العدد
  const whyMiss = (gi, fullPool, a, b) => {
    const m = bestTreeLesson(fullPool, { unit: unitName(groups[gi].unit), lesson: groups[gi].lesson });
    if (m && used.has(m.node.id)) {
      const oj = res.findIndex((r, j) => j !== gi && r.node && r.node.id === m.node.id);
      const other = oj >= 0 ? groups[oj] : null;
      if (other && kwNorm(other.lesson) === kwNorm(groups[gi].lesson)) return `مكرر في ملفك — «${m.node.text}» مربوط بدرس قبله بالاسم نفسه`;
      return other ? `أقرب درس له في نور «${m.node.text}» مربوط بـ«${other.lesson}» من ملفك — راجع أيهما الصحيح` : `أقرب درس له في نور «${m.node.text}» مربوط بدرس آخر`;
    }
    const u = fullPool[0] ? fullPool[0].unit : '';
    if (!b) return u ? `لا يقابله درس في «${u}» بنور` : 'لا دروس متاحة له في الشجرة';
    return `عدد الدروس هنا لا يتساوى (${toAr(a)} في ملفك و${toAr(b)} في نور)`;
  };
  // ربط دروس مقطع من ملفك (وحدة غالبًا) بعقد مقطع من الشجرة — المراحل:
  // ١) اختياراتك السابقة ٢) الاسم نفسه حرفيًا — بأي ترتيب، فهو أقوى دليل ٣) التقريبي للمتبقّي فقط بين العقد المتبقية
  // (رقم الدرس فيصل، بمخطط ترقيم كل جانب: «1- 5» = الدرس ٥) ٤) ما بقي بالترتيب داخل المقاطع بين المراسي إن تساوى العدد ولم يناقض الرقم.
  // لا قيد «العقدة التالية فقط» في التقريبي: فخطأ واحد كان يسحب ما بعده (1-5 يأخذ عقدة 1-6 فيسقط 1-6 وما بعده).
  function alignRange(gisIn, fullPool, unitHow) {
    if (!gisIn.length) return;
    const gScheme = numberScheme(gisIn.map((gi) => groups[gi].lesson));
    const tScheme = numberScheme(fullPool.map((n) => n.text));
    const gNum = (gi) => lessonNumber(groups[gi].lesson, gScheme);
    const nNum = (n) => lessonNumber(n.text, tScheme);
    // الربط بالترتيب لا يناقض رقم الدرس: «Lesson 10» لا يُربط بـ«Graded readers» ولا بـ«Lesson9»
    const numOk = (gi, node) => { const a = gNum(gi); return a == null || nNum(node) === a; };
    // دروس الوحدة بأرقامها إن كانت كلها مرقّمة (ترتيب ملفك قد يختلف)، وإلا بترتيب الملف
    const nums = gisIn.map(gNum);
    const gis = nums.every((x) => x != null) ? gisIn.slice().sort((x, y) => gNum(x) - gNum(y) || x - y) : gisIn;
    const pool = fullPool.filter((n) => !used.has(n.id));
    if (!pool.length) { gis.forEach((gi) => fail(gi, whyMiss(gi, fullPool, gis.length, 0))); return; }
    const anc = new Map(), how = new Map(), takenN = new Set();
    const free = () => pool.filter((n) => !takenN.has(n.id));
    const setAnc = (gi, node, h) => { anc.set(gi, pool.indexOf(node)); how.set(gi, h); takenN.add(node.id); };
    // ١) اختياراتك السابقة
    gis.forEach((gi) => { const kn = known.get(gi); if (kn && pool.includes(kn) && !takenN.has(kn.id)) setAnc(gi, kn, 'pick'); });
    // ٢) الاسم نفسه حرفيًا (أو دون ترقيمه)
    gis.forEach((gi) => {
      if (anc.has(gi)) return;
      const g = groups[gi];
      const m = bestTreeLesson(free(), { unit: unitName(g.unit), lesson: g.lesson }, { exactOnly: true, num: gNum(gi), nodeNum: nNum });
      if (m) setAnc(gi, m.node, 'exact');
    });
    // ٣) التقريبي للمتبقّي
    gis.forEach((gi) => {
      if (anc.has(gi)) return;
      const g = groups[gi];
      const m = bestTreeLesson(free(), { unit: unitName(g.unit), lesson: g.lesson }, { num: gNum(gi), nodeNum: nNum });
      if (m) setAnc(gi, m.node, unitHow === 'number' ? 'number' : 'name');
    });
    anc.forEach((pi, gi) => put(gi, pool[pi], how.get(gi)));
    const restG = gis.filter((gi) => !anc.has(gi));
    if (!restG.length) return;
    // ٤) ما بقي بالترتيب: مقاطع بين المراسي إن كانت المراسي بترتيب الشجرة، وإلا المتبقّي كله مقطعًا واحدًا
    const ancList = gis.map((gi, k) => (anc.has(gi) ? [k, anc.get(gi)] : null)).filter(Boolean);
    const monotonic = ancList.every((b, i) => !i || b[1] > ancList[i - 1][1]);
    const segs = [];
    if (monotonic) {
      const bounds = [[-1, -1]].concat(ancList, [[gis.length, pool.length]]);
      for (let i = 0; i + 1 < bounds.length; i++) {
        const gg = gis.slice(bounds[i][0] + 1, bounds[i + 1][0]), nn = pool.slice(bounds[i][1] + 1, bounds[i + 1][1]).filter((n) => !takenN.has(n.id));
        if (gg.length) segs.push([gg, nn]);
      }
    } else segs.push([restG, pool.filter((n) => !takenN.has(n.id))]);
    segs.forEach(([gg, nn]) => {
      if (gg.length === nn.length && gg.every((gi, j) => numOk(gi, nn[j]))) { gg.forEach((gi, j) => { put(gi, nn[j], 'order'); takenN.add(nn[j].id); }); return; }
      gg.forEach((gi, j) => {
        // العدد متساوٍ لكن رقم الدرس يخالف مقابله بالترتيب: نقوله بوضوح بدل «العدد لا يتساوى»
        if (gg.length === nn.length && !numOk(gi, nn[j])) { fail(gi, `رقمه في ملفك ${toAr(gNum(gi))} ومقابله بالترتيب في نور «${nn[j].text}» رقمه ${toAr(nNum(nn[j]) ?? '؟')} — راجعه`); return; }
        fail(gi, whyMiss(gi, fullPool, gg.length, nn.length));
      });
    });
  }
  const unitsOf = (arr, key) => { const m = new Map(); arr.forEach((x, i) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }); return m; };
  const gUnits = unitsOf(groups, (g) => g.unit || '');
  if (gUnits.size === 1 && gUnits.has('')) { alignRange(groups.map((_, i) => i), nodes, 'name'); return res; }
  const tList = [...unitsOf(nodes, (n) => n.unit || '').entries()].map(([k, idx]) => ({ k, idx, text: k, no: bookNo(k) }));
  const taken = new Set(), leftovers = [], pairs = [];
  let byName = 0, named = 0;
  [...gUnits.entries()].forEach(([gu, gis], ui) => {
    let t = null, how = 'name';
    // الوحدة التي فيها اختيارك السابق لأحد دروسها
    const kt = gis.map((gi) => known.get(gi)).filter(Boolean).map((n) => tList.find((x) => x.idx.some((i) => nodes[i] === n))).find(Boolean);
    if (kt) { t = kt; how = 'pick'; }
    // بالاسم (دون أرقام الملف)، ثم رقم الوحدة في الكتاب للتمييز بين المتساويين (Learning Club 1 / 2)
    if (/[a-z\u0621-\u064a]{3,}/i.test(unitName(gu).replace(/\b(?:unit|lesson)\b/gi, ''))) named++;
    if (!t) {
      const sc = tList.map((x) => ({ x, v: kwScore(unitName(gu), unitName(x.text)) })).filter((y) => y.v >= 0.5).sort((p, q) => q.v - p.v);
      if (sc.length) {
        let top = sc.filter((y) => y.v === sc[0].v);
        if (top.length > 1) { const dg = digitsOf(gu); const byD = top.filter((y) => [...digitsOf(y.x.text)].some((d) => dg.has(d))); if (byD.length === 1) top = byD; }
        if (top.length === 1) { t = top[0].x; byName++; }
      }
    }
    if (!t) { const no = bookNo(gu); if (no != null) { const c = tList.filter((x) => x.no === no); if (c.length === 1) { t = c[0]; how = 'number'; } } }
    if (!t && gUnits.size === tList.length && !taken.has(tList[ui].k)) { t = tList[ui]; how = 'number'; }   // العدد نفسه من الوحدات: بالترتيب
    if (!t) { leftovers.push(...gis); return; }
    taken.add(t.k);
    pairs.push({ gis, t, how, ui });
  });
  // الوحدات المؤكدة بالاسم أو باختيارك تأخذ دروسها أولًا، ثم المربوطة برقمها فقط (كعناوين فرعية في ملفك تحمل «Unit 4»)
  const rank = { pick: 0, name: 1, number: 2 };
  pairs.sort((x, y) => rank[x.how] - rank[y.how] || x.ui - y.ui).forEach((p) => alignRange(p.gis, p.t.idx.map((i) => nodes[i]), p.how));
  if (leftovers.length) alignRange(leftovers.sort((x, y) => x - y), nodes, 'order');
  res.unitsByName = byName; res.unitsNamed = named;
  return res;
}
