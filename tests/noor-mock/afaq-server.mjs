// afaq-server.mjs — mock of the Afaq (Supabase) backend the extension talks to (extension/remote.js).
// Listens on http://127.0.0.1:8765 (the URL in afaq-config.mock.js). Answers POST /rest/v1/rpc/<fn> and
// GET /rest/v1/settings (official holidays). State is reset per scenario with reset().
import http from 'node:http';

export function startAfaq(port = 8765) {
  let st;
  const reset = (o = {}) => {
    st = {
      pkg: o.pkg, active: o.trialLeft == null, left: o.trialLeft == null ? 0 : o.trialLeft, status: o.trialLeft == null ? 'active' : 'trial',
      holidays: o.holidays || '', calls: [], sessions: [], noor: [], mergeOnNoor: !!o.mergeOnNoor,
    };
    return st;
  };
  reset({});
  const sub = () => ({
    package_id: 'bio-9', title: 'الأحياء — التاسع', subject: 'الأحياء', grade: 9, shift: 'one', year: '2026/2027', term: 1, ends_on: '2027-01-21', updated: 1792000000, ready: true,
    ...(st.active ? {} : { trial: true, left: st.left }),
  });
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
      if (fn === 'ext_catalog') out = { ok: true, term: 1, trial: 3, packages: [{ id: 'bio-9', subject: 'الأحياء', grade: 9, title: 'الأحياء — التاسع', shift: 'one' }] };
      else if (fn === 'ext_start') out = { ok: true, token: 'b'.repeat(64), request: 1001, name: args.p_name || 'سالم علي' };
      else if (fn === 'ext_me') out = { ok: true, name: 'سالم علي', subs: [sub()], request: { id: 1001, status: st.active ? 'active' : st.status, shift: 'one', packages: ['bio-9'] }, whatsapp: '96876506037', trial_lessons: 3, trial_left: st.active ? null : st.left };
      else if (fn === 'ext_structure') out = { ok: true, pkg: JSON.parse(JSON.stringify(st.pkg)) };
      else if (fn === 'ext_pick') out = { ok: true, request: 1001 };
      else if (fn === 'ext_noor') { st.noor.push(args); if (st.mergeOnNoor && !st.active && args.p_noor) { st.active = true; st.status = 'active'; st.merged = (st.merged || 0) + 1; out = { ok: true, merged: true }; } else out = { ok: true }; }
      else if (fn === 'ext_set_ref') out = { ok: true };
      else if (fn === 'ext_referral') out = { ok: true, request: 1001, invited: 0 };
      else if (fn === 'ext_contact') { st.status = 'requested'; out = { ok: true, request: 1001, name: 'سالم علي', status: 'requested', packages: ['الأحياء — التاسع'], shift: 'one', whatsapp: '96876506037' }; }
      else if (fn === 'ext_session') {
        const l = (st.pkg.lessons || []).find((x) => x.id === args.p_lesson);
        st.sessions.push(args.p_lesson);
        if (!l) out = { ok: false, error: 'no_lesson' };
        else if (!st.active && st.left <= 0) out = { ok: false, error: 'trial_over' };
        else {
          if (!st.active) st.left--;
          const { id, ...content } = l;
          out = { ok: true, lesson: content, left: st.active ? null : st.left };
        }
      }
      res.writeHead(200, H);
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((ok, bad) => { srv.on('error', bad); srv.listen(port, '127.0.0.1', () => ok({ get st() { return st; }, reset, close: () => new Promise((r) => srv.close(r)) })); });
}
