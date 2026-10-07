// بيئة اختبار: قاعدة PostgreSQL حقيقية (PGlite) بمخطط منصة أفق، وعميل يحاكي supabase-js، وخادم REST يحاكي PostgREST للإضافة
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import crypto from 'crypto';

export async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}', pw text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;`);
  await db.exec(fs.readFileSync(new URL('../site/supabase/schema.sql', import.meta.url), 'utf8'));
  // كل الوصول متسلسل (اتصال واحد): الدور والمستخدم لكل استعلام
  let chain = Promise.resolve();
  db.as = (role, uid, sql, params) => {
    const run = chain.then(async () => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
      try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
    });
    chain = run.catch(() => {});
    return run;
  };
  db.callRpc = async (role, uid, fn, args = {}) => {
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    const vals = keys.map((k) => (Array.isArray(args[k]) ? `{${args[k].join(',')}}` : args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
    const r = await db.as(role, uid, sql, vals);
    return r.rows[0].r;
  };
  return db;
}

// PostgREST يعيد التواريخ نصوصًا: date ← YYYY-MM-DD، timestamptz ← ISO
function wire(row, fields) {
  const out = {};
  for (const f of fields || []) {
    const v = row[f.name];
    out[f.name] = v instanceof Date ? (f.dataTypeID === 1082 ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : v.toISOString()) : v;
  }
  return out;
}

// ---------- عميل يحاكي supabase-js v2 (ما يستعمله الموقع فقط) ----------
export function fakeSupabase(db, store) {
  // store: جلسة مشتركة بين صفحات المتصفح نفسه (localStorage)
  const listeners = [];
  const err = (e) => ({ message: String(e && e.message || e) });
  const emit = (ev) => listeners.forEach((cb) => cb(ev, store.session));
  const role = () => (store.session ? 'authenticated' : 'anon');
  const uid = () => (store.session ? store.session.user.id : null);
  const auth = {
    async getSession() { return { data: { session: store.session } }; },
    onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    async signUp({ email, password, options }) {
      const id = crypto.randomUUID();
      try { await db.query('insert into auth.users (id, email, raw_user_meta_data, pw) values ($1,$2,$3,$4)', [id, email, JSON.stringify((options && options.data) || {}), password]); }
      catch (e) { return { data: {}, error: { message: 'User already registered' } }; }
      store.session = { user: { id, email } }; emit('SIGNED_IN');
      return { data: { session: store.session, user: store.session.user }, error: null };
    },
    async signInWithPassword({ email, password }) {
      const r = await db.query('select id from auth.users where email = $1 and pw = $2', [email, password]);
      if (!r.rows.length) return { data: {}, error: { message: 'Invalid login credentials' } };
      store.session = { user: { id: r.rows[0].id, email } }; emit('SIGNED_IN');
      return { data: { session: store.session }, error: null };
    },
    async signOut() { store.session = null; emit('SIGNED_OUT'); return { error: null }; },
    async resetPasswordForEmail() { return { error: null }; },
    async updateUser() { return { error: null }; },
  };
  function from(table) {
    const st = { op: 'select', cols: '*', where: [], order: [], limit: null, row: null, ret: false };
    const b = {
      select(cols) { if (st.op === 'select') st.cols = cols || '*'; else st.ret = true; return b; },
      eq(k, v) { st.where.push([k, v]); return b; },
      order(k, o) { st.order.push([k, !o || o.ascending !== false]); return b; },
      limit(n) { st.limit = n; return b; },
      insert(row) { st.op = 'insert'; st.row = row; return b; },
      upsert(rows) { st.op = 'upsert'; st.row = rows; return b; },
      update(patch) { st.op = 'update'; st.row = patch; return b; },
      delete() { st.op = 'delete'; return b; },
      then(res, rej) { return exec().then(res, rej); },
    };
    const val = (v) => (Array.isArray(v) ? `{${v.join(',')}}` : v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
    async function exec() {
      const p = [];
      const w = st.where.length ? ' where ' + st.where.map(([k, v]) => { p.push(v); return `${k} = $${p.length}`; }).join(' and ') : '';
      let sql;
      if (st.op === 'select') sql = `select ${st.cols} from public.${table}${w}${st.order.length ? ' order by ' + st.order.map(([k, a]) => `${k} ${a ? 'asc' : 'desc'} nulls last`).join(', ') : ''}${st.limit ? ' limit ' + st.limit : ''}`;
      else if (st.op === 'insert' || st.op === 'upsert') {
        const rows = [].concat(st.row), cols = Object.keys(rows[0]);
        const vals = rows.map((r) => '(' + cols.map((c) => { p.push(val(r[c])); return `$${p.length}`; }).join(',') + ')').join(',');
        const pk = { settings: 'key', packages: 'id', terms: 'id', profiles: 'id' }[table] || 'id';
        sql = `insert into public.${table} (${cols.join(',')}) values ${vals}` + (st.op === 'upsert' ? ` on conflict (${pk}) do update set ${cols.filter((c) => c !== pk).map((c) => `${c} = excluded.${c}`).join(', ')}` : '') + ' returning *';
      } else if (st.op === 'update') {
        const set = Object.keys(st.row).map((c) => { p.push(val(st.row[c])); return `${c} = $${p.length}`; }).join(', ');
        const w2 = ' where ' + st.where.map(([k, v]) => { p.push(v); return `${k} = $${p.length}`; }).join(' and ');
        sql = `update public.${table} set ${set}${w2} returning *`;
      } else sql = `delete from public.${table}${w}`;
      try { const r = await db.as(role(), uid(), sql, p); return { data: (r.rows || []).map((row) => wire(row, r.fields)), error: null }; }
      catch (e) { return { data: null, error: err(e) }; }
    }
    return b;
  }
  async function rpc(fn, args) {
    try { return { data: await db.callRpc(role(), uid(), fn, args || {}), error: null }; }
    catch (e) { return { data: null, error: err(e) }; }
  }
  return { auth, from, rpc };
}

// ---------- خادم يحاكي PostgREST لنداءات الإضافة (fetch) ----------
export function fakeFetch(db, state = {}) {
  return async (url, opts) => {
    if (state.offline) throw new TypeError('Failed to fetch');
    const m = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (!m) return { ok: false, status: 404, json: async () => ({}) };
    if (!/^ext_/.test(m[1])) return { ok: false, status: 401, json: async () => ({}) };
    try {
      const data = await db.callRpc('anon', null, m[1], JSON.parse(opts.body || '{}'));
      return { ok: true, status: 200, json: async () => data };
    } catch (e) { return { ok: false, status: 400, json: async () => ({ message: e.message }) }; }
  };
}

// ---------- chrome.storage.local في الذاكرة ----------
export function fakeChromeStorage() {
  const data = {};
  const pick = (keys) => { const out = {}; [].concat(keys == null ? Object.keys(data) : keys).forEach((k) => { if (k in data) out[k] = JSON.parse(JSON.stringify(data[k])); }); return out; };
  return {
    data,
    local: {
      get: async (k) => pick(k),
      set: async (o) => { Object.entries(o).forEach(([k, v]) => { data[k] = JSON.parse(JSON.stringify(v)); }); },
      remove: async (k) => { [].concat(k).forEach((x) => delete data[x]); },
    },
    session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    onChanged: { addListener() {} },
  };
}
