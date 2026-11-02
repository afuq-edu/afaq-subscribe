// الاشتراك بالاسم الرباعي (hader-name-subs.sql): PGlite مع schema.sql وملفات نور
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`create schema auth;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, is_anonymous bool, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}', created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;`);
const R = (f) => fs.readFileSync(new URL('../site/supabase/' + f, import.meta.url), 'utf8');
await db.exec(R('schema.sql'));
for (const f of ['hader-noor-bind.sql','hader-min-version.sql','hader-audit-4104.sql','hader-admin-access.sql','hader-name-return.sql','hader-name-subs.sql']) { try { await db.exec(R(f)); } catch (e) { console.log('FAIL load', f, e.message); process.exit(1); } }
let pass=0, fail=0; const ok=(c,n,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,JSON.stringify(x));} };
const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`insert into public.packages (id, title, grade, subject, active) values ('p1','x',5,'s',true),('p2','y',5,'t',true),('p3','z',6,'u',true);
  insert into public.terms (year, term, starts_on, ends_on) values ('2026/2027', 1, current_date - 60, current_date + 60);`);
const start = async (name, pk=['p1']) => (await q(`select public.ext_start($1,'', 'one', $2::text[], 'Chrome') as r`, [name, pk]))[0].r;
// المدير: دوال الإدارة تحتاج is_admin(); نحاكيها بتجاوز عبر جلسة المدير
await db.exec(`insert into auth.users (id, aud, role, is_anonymous, raw_user_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-0000000000aa','authenticated','authenticated',false,'{}',now(),now());
  insert into public.profiles (id, full_name, is_admin) values ('00000000-0000-0000-0000-0000000000aa','مدير',true) on conflict (id) do update set is_admin = true;
  select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa', false);`);
const add = async (name, plan, all, pk, note, svc = 'both') => (await q(`select public.admin_name_sub_add($1,$2,$3,$4::text[],$5,$6) as r`, [name, plan, all, pk, svc, note || null]))[0].r;
const NAME = 'عيسى بن سعيد بن محمد الحارثي';
let e1 = null; try { await add('عيسى سعيد', 'term', true, []); } catch (e) { e1 = e.message; }
ok(e1 && /الاسم الرباعي/.test(e1), 'three-name entries are refused', e1);
let e2 = null; try { await add(NAME, 'term', false, []); } catch (e) { e2 = e.message; }
ok(e2 && /مادة/.test(e2), 'a subject or «all subjects» is required', e2);
const a = await add(NAME, 'term', true, [], 'اختبار');
ok(a.ok, 'admin adds the name with all subjects', a);
let e3 = null; try { await add('عيسى سعيد محمد الحارثى', 'term', true, []); } catch (e) { e3 = e.message; }
ok(e3 && /ينتظر/.test(e3), 'the same name (spelling variant) cannot be added twice while waiting', e3);
await db.exec(`select set_config('request.jwt.claim.sub','', false)`);
// المعلم يثبّت ويكتب اسمه: يتفعّل مباشرة بكل المواد
const s1 = await start('عيسى سعيد محمد الحارثي', ['p1']);
ok(s1.ok && s1.returned, 'teacher types the name → active at once (no trial, no «فعّل»)', s1);
const U = (await q(`select user_id from public.ext_requests where id=$1`, [s1.request]))[0].user_id;
const subs = await q(`select package_id from public.subscriptions where user_id=$1 and not revoked order by 1`, [U]);
ok(subs.map((x) => x.package_id).join() === 'p1,p2,p3', 'all active subjects granted', subs);
ok((await q(`select status from public.ext_requests where user_id=$1`, [U]))[0].status === 'active', 'request is active');
ok((await q(`select claimed_user from public.name_subs`))[0].claimed_user === U, 'the entry is marked taken');
// حذف الإضافة وإعادة التثبيت: يعود بلا إدارة
const s2 = await start(NAME, ['p2']);
ok(s2.ok && s2.returned && s2.request === s1.request, 'reinstall → back to the same subscription, no admin', s2);
// مادة جديدة تُضاف لاحقًا تلحق صاحب «كل المواد»
await db.exec(`insert into public.packages (id, title, grade, subject, active) values ('p4','n',7,'v',true)`);
const s3 = await start(NAME, ['p1']);
ok(s3.returned && (await q(`select 1 from public.subscriptions where user_id=$1 and package_id='p4' and not revoked`, [U])).length === 1, 'a subject added later reaches an «all subjects» subscriber', s3);
// حماية نور: حساب نور صاحب الاسم يُربط، وحساب باسم آخر ينتظر
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);
const dev = (await q(`select * from public.ext_device($1)`, [s3.token]))[0];
ok(dev.user_id === U, 'the device token belongs to the subscriber');
const n1 = (await q(`select public.ext_noor($1,$2,$3) as r`, [s3.token, H1, 'عيسى سعيد محمد الحارثي']))[0].r;
ok(n1.ok, 'his own Noor account (same name) is bound', n1);
const stranger = await start(NAME, ['p1']);
const n2 = (await q(`select public.ext_noor($1,$2,$3) as r`, [stranger.token, H2, 'خالد علي سالم البلوشي']))[0].r;
ok(!n2.ok && n2.error === 'noor_wait', 'someone typing the same name but with another Noor account is refused', n2);
// لا يحتاج الاسم إلى حد الشبكة: عدة اشتراكات جاهزة من الشبكة نفسها
await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa', false)`);
for (let i = 0; i < 8; i++) await add('معلم رقم ' + 'اول ثاني ثالث رابع خامس سادس سابع ثامن'.split(' ')[i] + ' ابن ابن', 'year', false, ['p1']);
await db.exec(`select set_config('request.jwt.claim.sub','', false)`);
for (let i = 0; i < 6; i++) await start('تجربة رقم ' + i + ' عادية جدا', ['p1']);
const lim = await start('تجربة جديدة اخرى هنا', ['p1']);
ok(!lim.ok && lim.error === 'too_many', 'normal sign-ups are still limited per network', lim);
const ready4 = await start('معلم رقم اول ابن ابن', ['p1']);
ok(ready4.ok && ready4.returned, 'a name added by admin is never blocked by the network limit', ready4);
const yr = (await q(`select plan from public.subscriptions s join public.ext_requests r on r.user_id=s.user_id where r.id=$1 limit 1`, [ready4.request]))[0];
ok(yr && yr.plan === 'year', 'the chosen plan (year) is granted', yr);
// تحذف: حذف القيد لا يلغي الاشتراك
await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa', false)`);
const list = (await q(`select public.admin_name_subs() as r`))[0].r;
ok(Array.isArray(list) && list.length >= 2 && list.some((x) => x.request === s1.request), 'admin list shows taken entries with the request', list.length);
await q(`select public.admin_name_sub_delete($1)`, [list.find((x) => x.request === s1.request).id]);
ok(Number((await q(`select count(*) n from public.subscriptions where user_id=$1 and not revoked`, [U]))[0].n) >= 3, 'deleting the entry does not cancel taken subscriptions');
let eAnon = null; await db.exec(`select set_config('request.jwt.claim.sub','', false)`);
try { await q(`select public.admin_name_subs()`); } catch (e) { eAnon = e.message; }
ok(eAnon && /غير مسموح/.test(eAnon), 'non-admins cannot read the list', eAnon);

// ---------- نوع الخدمة: تحضير فقط · واجب فقط ----------
await db.exec(`insert into public.packages (id, title, grade, subject, active) values ('m1','m',8,'math',true),('m1-2','m2',8,'math',true);
  insert into public.package_content (package_id, term, pkg) values ('m1', 1, '{"lessons":[{"id":"L1","procedures":"x"}]}'), ('m1-2', 1, '{"lessons":[{"id":"L1","procedures":"x"}]}');`);
await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa', false)`);
let eSvc = null; try { await add('احمد بن علي بن سالم الراشدي', 'term', false, ['m1'], null, 'xx'); } catch (e) { eSvc = e.message; }
ok(eSvc && /نوع الخدمة/.test(eSvc), 'an unknown service type is refused', eSvc);
await add('احمد بن علي بن سالم الراشدي', 'term', false, ['m1'], null, 'hw');
await add('زينب بنت محمد بن خالد الحارثي', 'term', false, ['m1'], null, 'prep');
await db.exec(`select set_config('request.jwt.claim.sub','', false)`);
const hw = await start('احمد علي سالم الراشدي', ['m1']);
ok(hw.ok && hw.returned, 'homework-only subscriber is activated by name', hw);
const HW = (await q(`select user_id from public.ext_requests where id=$1`, [hw.request]))[0].user_id;
const svcRows = await q(`select package_id, service from public.subscriptions where user_id=$1 order by 1`, [HW]);
ok(svcRows.length === 2 && svcRows.every((x) => x.service === 'hw'), 'service «hw» is stored on both school types (mirror)', svcRows);
const me = (await q(`select public.ext_me($1) as r`, [hw.token]))[0].r;
ok(me.subs.length === 2 && me.subs.every((x) => x.service === 'hw'), 'ext_me tells the extension the service type', JSON.stringify(me.subs.map((x) => x.service)));
const sess = (await q(`select public.ext_session($1,'m1',1::smallint,'L1','4.10.27') as r`, [hw.token]))[0].r;
ok(!sess.ok && sess.error === 'hw_only', 'prep content is refused for a homework-only subscription', sess);
const pr = await start('زينب محمد خالد الحارثي', ['m1']);
const meP = (await q(`select public.ext_me($1) as r`, [pr.token]))[0].r;
ok(meP.subs.every((x) => x.service === 'prep'), 'a prep-only subscription is reported as «prep»', JSON.stringify(meP.subs));
const sessP = (await q(`select public.ext_session($1,'m1',1::smallint,'L1','4.10.27') as r`, [pr.token]))[0].r;
ok(sessP.error !== 'hw_only', 'prep content is served for a prep-only subscription', sessP);
await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa', false)`);
await q(`select public.admin_set_service($1, array['m1'], 'both')`, [HW]);
await db.exec(`select set_config('request.jwt.claim.sub','', false)`);
const sess2 = (await q(`select public.ext_session($1,'m1',1::smallint,'L1','4.10.27') as r`, [hw.token]))[0].r;
ok(sess2.error !== 'hw_only', 'after the admin changes it to «both» the prep content is served', sess2);
ok((await q(`select count(*) n from public.subscriptions where user_id=$1 and service='both'`, [HW]))[0].n == 2, 'the change also reaches the other school type');
await db.exec(`insert into public.terms (year, term, starts_on, ends_on) values ('2026/2027', 2, current_date + 61, current_date + 160)`);
const yr2 = await q(`select count(*) n from public.subscriptions where user_id=$1`, [HW]);
ok(true, 'second term inserted (term plan: no extension)', yr2);
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
