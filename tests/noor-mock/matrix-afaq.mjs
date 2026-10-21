// matrix-afaq.mjs — mock Afaq (Supabase) backend for matrix.mjs: like afaq-server.mjs (used by run.mjs), but serves many packages.
// Listens on http://127.0.0.1:<port> (port 0 = a free port; matrix.mjs writes the URL into the temp copy's afaq-config.js).
// reset({ pkgs, catalog, meta, tag }): packages by catalog id ({ id: pkg }), the catalog entries, per-id subscription meta
//   ({ id: { title, subject, grade, shift, ends_on } }); subscriptions follow ext_start / ext_pick. tag(id) → text appended to
//   «المفاهيم» of every session served, so each Noor row can be traced back to its own file session.
//   Answers POST /rest/v1/rpc/<fn> and GET /rest/v1/settings (official holidays, st.holidays).
import http from 'node:http';

export function startAfaq(port = 0) {
  let st;
  const reset = (o = {}) => {
    st = {
      pkg: o.pkg, pkgs: o.pkgs || null, catalog: o.catalog || null, meta: o.meta || {}, tag: o.tag || null, picked: [],
      active: o.trialLeft == null, left: o.trialLeft == null ? 0 : o.trialLeft, status: o.trialLeft == null ? 'active' : 'trial',
      holidays: o.holidays || '', calls: [], sessions: [], noor: [], shiftAsked: [],
    };
    return st;
  };
  reset({});
  const trial = () => (st.active ? {} : { trial: true, left: st.left });
  const sub = () => ({
    package_id: 'bio-9', title: 'الأحياء — التاسع', subject: 'الأحياء', grade: 9, shift: 'one', year: '2026/2027', term: 1, ends_on: '2027-01-21', updated: 1792000000, ready: true,
    ...trial(),
  });
  const subs = () => {
    if (!st.pkgs) return [sub()];
    return st.picked.filter((id) => st.pkgs[id]).map((id) => {
      const m = st.meta[id] || {};
      return { package_id: id, title: m.title || id, subject: m.subject, grade: m.grade, shift: m.shift || 'one', year: '2026/2027', term: 1, ends_on: m.ends_on || '2027-01-21', updated: 1792000000, ready: true, ...trial() };
    });
  };
  const pkgOf = (id) => (st.pkgs ? st.pkgs[id] : st.pkg);
  const pick = (ids) => { (ids || []).forEach((id) => { if (!st.picked.includes(id)) st.picked.push(id); }); };
  const srv = http.createServer((q, res) => {
    let d = '';
    q.on('data', (c) => { d += c; });
    q.on('end', () => {
      const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Content-Type': 'application/json' };
      if (q.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
      const path = q.url.split('?')[0];
      if (/\/rest\/v1\/settings$/.test(path)) { res.writeHead(200, H); return res.end(JSON.stringify([{ value: st.holidays }])); }
      if (/hader-version\.json$/.test(path)) { res.writeHead(200, H); return res.end(JSON.stringify({ version: '0.0.1' })); }
      const fn = path.split('/').pop();
      let args = {};
      try { args = JSON.parse(d || '{}'); } catch (e) {}
      st.calls.push(fn);
      let out = { ok: false, error: 'server' };
      if (fn === 'ext_catalog') out = { ok: true, term: 1, trial: 3, packages: st.catalog || [{ id: 'bio-9', subject: 'الأحياء', grade: 9, title: 'الأحياء — التاسع', shift: 'one' }] };
      else if (fn === 'ext_start') { pick(args.p_packages); st.shiftAsked.push(args.p_shift); out = { ok: true, token: 'b'.repeat(64), request: 1001, name: args.p_name || 'سالم علي' }; }
      else if (fn === 'ext_me') out = { ok: true, name: 'سالم علي', subs: subs(), request: { id: 1001, status: st.active ? 'active' : st.status, shift: 'one', packages: st.pkgs ? st.picked.slice() : ['bio-9'] }, whatsapp: '96876506037', trial_lessons: 3, trial_left: st.active ? null : st.left };
      else if (fn === 'ext_structure') { const p = pkgOf(args.p_package); out = p ? { ok: true, pkg: JSON.parse(JSON.stringify(p)) } : { ok: false, error: 'packages' }; }
      else if (fn === 'ext_pick') { pick(args.p_packages); st.shiftAsked.push(args.p_shift); out = { ok: true, request: 1001 }; }
      else if (fn === 'ext_noor') { st.noor.push(args); out = { ok: true }; }
      else if (fn === 'ext_set_ref') out = { ok: true };
      else if (fn === 'ext_referral') out = { ok: true, request: 1001, invited: 0 };
      else if (fn === 'ext_contact') { st.status = 'requested'; out = { ok: true, request: 1001, name: 'سالم علي', status: 'requested', packages: ['الأحياء — التاسع'], shift: 'one', whatsapp: '96876506037' }; }
      else if (fn === 'ext_session') {
        const p = pkgOf(args.p_package) || st.pkg || {};
        const l = (p.lessons || []).find((x) => x.id === args.p_lesson);
        st.sessions.push(args.p_lesson);
        if (!l) out = { ok: false, error: 'no_lesson' };
        else if (!st.active && st.left <= 0) out = { ok: false, error: 'trial_over' };
        else {
          if (!st.active) st.left--;
          const { id, ...content } = l;
          if (st.tag) content.concepts = String(content.concepts || '') + st.tag(id);
          out = { ok: true, lesson: content, left: st.active ? null : st.left };
        }
      }
      res.writeHead(200, H);
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((ok, bad) => { srv.on('error', bad); srv.listen(port, '127.0.0.1', () => ok({ get st() { return st; }, port: srv.address().port, reset, close: () => new Promise((r) => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(r); }) })); });
}
