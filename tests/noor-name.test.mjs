// التفعيل باسم حساب نور (hader-noor-name.sql): PGlite مع schema.sql وملفات نور
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`create schema auth;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, is_anonymous bool, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}', created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;`);
const R = (f) => fs.readFileSync(new URL('../site/supabase/' + f, import.meta.url), 'utf8');
await db.exec(R('schema.sql'));
for (const f of ['hader-noor-bind.sql','hader-min-version.sql','hader-audit-4104.sql','hader-admin-access.sql','hader-name-return.sql','hader-name-subs.sql','hader-open-access.sql','hader-noor-name.sql','hader-noor-home.sql']) { try { await db.exec(R(f)); } catch (e) { console.log('FAIL load', f, e.message); process.exit(1); } }
let pass=0, fail=0; const ok=(c,n,x)=>{ if(c){pass++;console.log('  ✓',n);} else {fail++;console.log('  ✗',n,JSON.stringify(x));} };
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const lessons = JSON.stringify({ lessons: ['L1','L2','L3'].map((id) => ({ id, procedures: 'x' })) });
await db.exec(`insert into public.packages (id, title, grade, subject, active) values ('p1','x',5,'s',true),('p2','y',6,'t',true);
  insert into public.terms (year, term, starts_on, ends_on) values ('2026/2027', 1, current_date - 60, current_date + 60);
  insert into public.package_content (package_id, term, pkg) values ('p1', 1, '${lessons}'::jsonb), ('p2', 1, '${lessons}'::jsonb);
  insert into public.settings (key, value) values ('trial_lessons', '0') on conflict (key) do update set value = '0';
  update public.settings set value = 'off' where key = 'open_access';`);
const ADM = '00000000-0000-0000-0000-0000000000aa';
await db.exec(`insert into auth.users (id, aud, role, is_anonymous, raw_user_meta_data, created_at, updated_at) values ('${ADM}','authenticated','authenticated',false,'{}',now(),now());
  insert into public.profiles (id, full_name, is_admin) values ('${ADM}','مدير',true) on conflict (id) do update set is_admin = true;`);
const asAdmin = (on) => db.exec(`select set_config('request.jwt.claim.sub','${on ? ADM : ''}', false)`);
const add = async (name, svc = 'both', plan = 'term') => { await asAdmin(true); try { return (await one(`select public.admin_name_sub_add($1,$2,false,'{}'::text[],$3,null) as r`, [name, plan, svc])).r; } finally { await asAdmin(false); } };
const start = async (name, pk = ['p1']) => (await one(`select public.ext_start($1,'', 'one', $2::text[], 'Chrome') as r`, [name, pk])).r;
const noor = async (tok, hash, name) => (await one(`select public.ext_noor($1,$2,$3) as r`, [tok, hash, name])).r;
const sess = async (tok, pk = 'p1', l = 'L1') => (await one(`select public.ext_session($1,$2,1::smallint,$3,'4.10.33') as r`, [tok, pk, l])).r;
const userOf = async (tok) => (await one(`select user_id from public.ext_device($1)`, [tok])).user_id;
const H = (c) => c.repeat(64);

// ---------- المطابقة الذكية ----------
const m = async (a, b) => (await one(`select public.noor_name_match($1,$2) as r`, [a, b])).r;
ok(await m('أحمد سالم علي الهنائي', 'احمد سالم على الهنائى'), 'hamza / alef maqsura / ya differences do not matter');
ok(await m('عائشة سعيد خلفان', 'عايشه سعيد خلفان'), 'ئ/ي and ة/ه do not matter');
ok(await m('عيسى بن سعيد بن محمد الحارثي', 'عيسى سعيد محمد الحارثي'), '«بن» is ignored');
ok(await m('عبد الله سالم آل سعيد', 'عبدالله سالم السعيد'), '«عبد ال…» spacing and «آل/ال» do not matter');
ok(await m('داوود سالم الرواحي', 'داود سالم رواحي'), '«داوود/داود» and the «ال» of the family name do not matter');
ok(!(await m('أحمد سالم علي', 'أحمد سالم علي الهنائي')), 'a different number of words does not match');
ok(!(await m('أحمد سالم علي الهنائي', 'محمد سالم علي الهنائي')), 'a different first name does not match');
ok(!(await m('حسين علي سالم', 'حسن علي سالم')), 'حسين ≠ حسن');
ok(!(await m('سالم علي حمد', 'سالم حمد علي')), 'word order matters');
ok(!(await m('أحمد', 'أحمد')), 'one word is not enough');

// ---------- المدير يسجّل الاسم ----------
let e1 = null; try { await add('أحمد'); } catch (e) { e1 = e.message; }
ok(e1 && /كما يظهر/.test(e1), 'a one-word name is refused', e1);
const a1 = await add('أحمد سالم علي الهنائي', 'both');
ok(a1.ok && !a1.applied, 'admin adds a three/four-word name with no subjects', a1);
let e2 = null; try { await add('احمد سالم على الهنائى'); } catch (e) { e2 = e.message; }
ok(e2 && /ينتظر/.test(e2), 'the same name in another spelling cannot be added twice while waiting', e2);

// ---------- معلم غير مسجّل: لا يعمل ----------
const x = await start('خالد علي سالم البلوشي');
const nx = await noor(x.token, H('c'), 'خالد علي سالم البلوشي');
ok(nx.ok && !nx.merged, 'an unregistered teacher opening Noor is not activated', nx);
const sx = await sess(x.token);
ok(!sx.ok && sx.error === 'trial_over', 'an unregistered teacher cannot fill (no trial)', sx);

// ---------- المعلم المسجّل: يكتب أي اسم في «حاضر»، يفتح نور باسمه → يتفعّل لكل المواد ----------
const t = await start('أبو سالم', ['p1']);
const T = await userOf(t.token);
ok(!t.returned, 'the typed name no longer takes the entry', t);
const n1 = await noor(t.token, H('a'), 'أحمد بن سالم بن علي الهنائى');
ok(n1.ok && n1.merged, 'Noor account with the registered name → activated at once', n1);
const subs = (await q(`select package_id, service from public.subscriptions where user_id=$1 and not revoked order by 1`, [T]));
ok(subs.map((s) => s.package_id).join() === 'p1,p2', 'all subjects granted (Noor courses decide what he fills)', subs);
ok((await sess(t.token, 'p2')).ok, 'he fills a subject he did not choose at start too');
ok((await one(`select noor_hash, noor_name from public.noor_bind where user_id=$1`, [T])).noor_hash === H('a'), 'his Noor account is bound');
ok((await one(`select claimed_user from public.name_subs where id=$1`, [a1.id])).claimed_user === T, 'the entry is taken by him');
const n1b = await noor(t.token, H('a'), 'أحمد بن سالم بن علي الهنائى');
ok(n1b.ok && !n1b.merged, 'later checks are quiet (no repeated activation)', n1b);

// ---------- حساب نور آخر على الجهاز نفسه ----------
const n2 = await noor(t.token, H('d'), 'سعيد خلفان راشد العامري');
ok(!n2.ok && n2.error === 'noor_wait', 'another Noor account on his device waits', n2);
ok(!(await sess(t.token)).ok, 'and nothing is filled for it');
await noor(t.token, H('a'), 'أحمد سالم علي الهنائي');

// ---------- إعادة التثبيت: يعود لحسابه ----------
const t2 = await start('أي اسم', ['p1']);
const n3 = await noor(t2.token, H('a'), 'أحمد سالم علي الهنائي');
ok(n3.ok && n3.merged && (await userOf(t2.token)) === T, 'reinstall → the device goes back to his account', n3);
ok((await sess(t2.token)).ok, 'and fills');

// ---------- شخص آخر بالاسم نفسه وحساب نور آخر ----------
const z = await start('أحمد سالم علي الهنائي', ['p1']);
const nz = await noor(z.token, H('e'), 'أحمد سالم علي الهنائي');
ok(!nz.merged && !(await sess(z.token)).ok, 'the same name on a different Noor account fills nothing', nz);
ok((await one(`select noor_hash from public.noor_bind where user_id=$1`, [T])).noor_hash === H('a'), 'and his binding stays on his own Noor account');

// ---------- معلم فتح نور قبل أن يُسجَّل، ثم سجّله المدير ----------
const w = await start('زهرة', ['p1']);
const W = await userOf(w.token);
const nw = await noor(w.token, H('f'), 'زهرة سالم محمد الحجري');
ok(!nw.merged, 'before registration: not active', nw);
const a2 = await add('زهره سالم محمد الحجرى', 'prep');
ok(a2.ok && a2.applied, 'admin adds the name → the waiting teacher is activated now', a2);
ok((await sess(w.token)).ok, 'and fills at once');
ok((await one(`select noor_hash from public.noor_bind where user_id=$1`, [W])).noor_hash === H('f'), 'bound to the Noor account she opened');
ok((await one(`select service from public.subscriptions where user_id=$1 limit 1`, [W])).service === 'prep', 'the chosen service is kept');

// ---------- الفصل التالي: القيد الفصلي ينتهي، و«جدّد» يعيده ----------
await db.exec(`update public.terms set ends_on = current_date - 1, starts_on = current_date - 120;
  insert into public.terms (year, term, starts_on, ends_on) values ('2026/2027', 2, current_date, current_date + 90);`);
await db.exec(`insert into public.package_content (package_id, term, pkg) values ('p1', 2, '${lessons}'::jsonb)`);
const n5 = await noor(t2.token, H('a'), 'أحمد سالم علي الهنائي');
ok(n5.ok && !n5.merged, 'a term entry does not renew itself in the next term', n5);
await asAdmin(true);
const list = (await one(`select public.admin_name_subs() as r`)).r;
const ent = list.find((r) => r.id === a1.id);
ok(ent && ent.live === false && ent.noor_name, 'admin list shows the entry as ended, with the Noor name', ent);
await q(`select public.admin_name_sub_renew($1)`, [a1.id]);
await asAdmin(false);
const s6 = (await one(`select public.ext_session($1,'p1',2::smallint,'L1','4.10.33') as r`, [t2.token])).r;
ok(s6.ok, '«جدّد» → active again in the new term', s6);

// ---------- المدير ----------
let eAnon = null; try { await q(`select public.admin_name_sub_renew(1)`); } catch (e) { eAnon = e.message; }
ok(eAnon && /غير مسموح/.test(eAnon), 'non-admins cannot renew', eAnon);

// ---------- 4.10.36: الاسم من صفحة نور، وحدّ الشبكة لا يوقف اسمًا مسجّلًا (hader-noor-home.sql) ----------
await db.exec(`update public.ext_requests set created_at = now() - interval '2 days'`);
for (let i = 0; i < 6; i++) await start('معلم تجربة رقم ' + 'ابجدهو'[i]);
const tooMany = await start('شخص غير مسجل هنا');
ok(tooMany && tooMany.error === 'too_many', 'an unregistered name still meets the network daily limit', tooMany);
const reg = await add('زينب خالد سعيد المعمري');
ok(reg && reg.ok, 'admin registers a name', reg);
const st = await start('زينب خالد سعيد المعمري');
ok(st && st.ok && st.token, 'a registered name is never stopped by the network daily limit', st);
const nsRow = await one(`select claimed_user from public.name_subs where name = 'زينب خالد سعيد المعمري' and hidden_at is null`);
ok(nsRow && !nsRow.claimed_user, 'the name sent by the tool does not claim the entry by itself (the Noor account does)', nsRow);
const mz = await noor(st.token, H('7'), 'زينب خالد سعيد المعمري');
ok(mz && mz.merged, 'the Noor account with that name opens the subscription at once (merged)', mz);
const subsZ = await q(`select package_id from public.subscriptions where user_id = $1 and not revoked`, [await userOf(st.token)]);
ok(subsZ.length >= 2, `all subjects are opened for that teacher (${subsZ.length})`, subsZ);

// ---------- «فعّل» على طلب: كل مواد المعلم ونوع الاشتراك، باسم حساب نور ----------
await db.exec(`update public.ext_requests set created_at = now() - interval '2 days'`);
const st2 = await start('سلمى ناصر حمد الريامي');
ok(st2 && st2.ok, 'an unregistered teacher sends her name (request waits)', st2);
await noor(st2.token, H('8'), 'سلمى ناصر حمد الريامي');
const rq2 = (await one(`select id from public.ext_requests where user_id = $1`, [await userOf(st2.token)])).id;
let eAct = null; try { await q(`select public.admin_request_activate($1,'both')`, [rq2]); } catch (e) { eAct = e.message; }
ok(eAct && /غير مسموح/.test(eAct), 'non-admins cannot activate a request', eAct);
await asAdmin(true); const act = (await one(`select public.admin_request_activate($1,'prep') as r`, [rq2])).r; await asAdmin(false);
ok(act && act.ok && act.name === 'سلمى ناصر حمد الريامي', 'admin «فعّل» registers her Noor name', act);
const subs2 = await q(`select package_id, service from public.subscriptions where user_id = $1 and not revoked`, [await userOf(st2.token)]);
ok(subs2.length >= 2 && subs2.every((x) => x.service === 'prep'), `all her subjects open with the chosen service (${subs2.length}, ${[...new Set(subs2.map((x) => x.service))]})`, subs2);
const rs2 = await one(`select status from public.ext_requests where id = $1`, [rq2]);
ok(rs2.status === 'active', 'her request shows active', rs2);
const nz2 = await noor(st2.token, H('8'), 'سلمى ناصر حمد الريامي');
ok(nz2 && nz2.ok !== false, 'her own Noor account keeps working', nz2);
const nz3 = await noor(st2.token, H('9'), 'شخص آخر تماما هنا');
ok(nz3 && nz3.ok === false, 'another Noor account on her device is not served', nz3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
