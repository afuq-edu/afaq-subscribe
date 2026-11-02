// مفتاح «فتح مؤقت بلا تفعيل» (hader-open-access.sql): PGlite مع schema.sql وملفات نور
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`create schema auth;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, is_anonymous bool, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}', created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;`);
const R = (f) => fs.readFileSync(new URL('../site/supabase/' + f, import.meta.url), 'utf8');
await db.exec(R('schema.sql'));
for (const f of ['hader-noor-bind.sql','hader-min-version.sql','hader-audit-4104.sql','hader-admin-access.sql','hader-name-return.sql','hader-name-subs.sql','hader-open-access.sql']) { try { await db.exec(R(f)); } catch (e) { console.log('FAIL load', f, e.message); process.exit(1); } }
let pass=0, fail=0; const ok=(c,n,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,JSON.stringify(x));} };
const q = async (s, p) => (await db.query(s, p)).rows;
const lessons = JSON.stringify({ lessons: ['L1','L2','L3','L4','L5','L6'].map((id) => ({ id, procedures: 'x' })) });
await db.exec(`insert into public.packages (id, title, grade, subject, active) values ('p1','x',5,'s',true);
  insert into public.terms (year, term, starts_on, ends_on) values ('2026/2027', 1, current_date - 60, current_date + 60);
  insert into public.package_content (package_id, term, pkg) values ('p1', 1, '${lessons}'::jsonb);`);
const start = async (name) => (await q(`select public.ext_start($1,'', 'one', array['p1'], 'Chrome') as r`, [name]))[0].r;
const sess = async (tok, l, ver = '4.10.28') => (await q(`select public.ext_session($1,'p1',1::smallint,$2,$3) as r`, [tok, l, ver]))[0].r;
const setOpen = (v) => db.exec(`update public.settings set value='${v}' where key='open_access'`);
ok((await q(`select public.open_access() as o`))[0].o === false, 'default is closed');
await db.exec(`update public.settings set value='4.10.6' where key='min_ext_version'`);
const t = await start('معلم اول تجربة هنا');
// مغلق: التجربة تنتهي بعد ٣ دروس، والنسخة القديمة ترفض
for (const l of ['L1','L2','L3']) await sess(t.token, l);
const over = await sess(t.token, 'L4');
ok(!over.ok && over.error === 'trial_over', 'closed: the 4th lesson stops at the end of the trial', over);
const oldv = await sess(t.token, 'L1', '4.9.0');
ok(!oldv.ok && oldv.error === 'old_version', 'closed: an old version is refused', oldv);
const me0 = (await q(`select public.ext_me($1) as r`, [t.token]))[0].r;
ok(me0.request.status !== 'active' && me0.subs.every((x) => x.trial), 'closed: ext_me shows trial and not active', me0.request);
// مفتوح
await setOpen('on');
const s4 = await sess(t.token, 'L4');
ok(s4.ok, 'open: the lesson after the trial cap is served', s4);
ok((await sess(t.token, 'L5', '4.9.0')).ok, 'open: an old version fills too');
ok((await sess(t.token, 'L5', '1.0')).ok, 'open: a very old version fills');
ok((await q(`select public.ext_session($1,'p1',1::smallint,'L5') as r`, [t.token]))[0].r.ok, 'open: the 4-argument form (oldest versions) is served');
const me1 = (await q(`select public.ext_me($1) as r`, [t.token]))[0].r;
ok(me1.request.status === 'active' && me1.subs.length === 1 && !me1.subs[0].trial, 'open: ext_me shows an active subscription, no trial flag', JSON.stringify(me1.request) + JSON.stringify(me1.subs));
// حساب نور بغير الاسم لا ينتظر
const nr = (await q(`select public.ext_noor($1,$2,$3) as r`, [t.token, 'a'.repeat(64), 'خالد علي سالم البلوشي']))[0].r;
ok(nr.ok, 'open: a different Noor account name does not wait', nr);
ok((await sess(t.token, 'L1')).ok, 'open: filling works with that Noor account');
// حد التسجيل اليومي للشبكة
for (let i = 0; i < 8; i++) await start('معلم رقم ' + i + ' عادي جدا');
const many = await start('معلم اخر جديد جدا');
ok(many.ok, 'open: the daily sign-up limit per network does not block', many);
// مفتوح لا يتخطى رمز الجهاز
const bad = await sess('nope', 'L1');
ok(!bad.ok && bad.error === 'unlinked', 'open: an unknown device token is still refused', bad);
// إغلاق: يعود كل شيء
await setOpen('off');
const back = await sess(t.token, 'L6');
ok(!back.ok && back.error === 'trial_over', 'closed again: the trial cap is back', back);
ok((await sess(t.token, 'L1', '4.9.0')).error === 'old_version', 'closed again: old versions are refused again');
const nr2 = (await q(`select public.ext_noor($1,$2,$3) as r`, [t.token, 'b'.repeat(64), 'خالد علي سالم البلوشي']))[0].r;
ok(!nr2.ok && nr2.error === 'noor_wait', 'closed again: the Noor-name wait is back', nr2);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
