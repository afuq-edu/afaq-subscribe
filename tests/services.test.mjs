// خدمات الاشتراك (hader-services.sql): تحضير · واجبات · غرف النقاش · فيديو · درس تفاعلي، أي مجموعة منها
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`create schema auth;
  create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, is_anonymous bool, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}', created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;`);
const R = (f) => fs.readFileSync(new URL('../site/supabase/' + f, import.meta.url), 'utf8');
await db.exec(R('schema.sql'));
for (const f of ['hader-noor-bind.sql','hader-min-version.sql','hader-audit-4104.sql','hader-admin-access.sql','hader-name-return.sql','hader-name-subs.sql','hader-open-access.sql','hader-noor-name.sql','hader-noor-home.sql','hader-name-add-now.sql','hader-services.sql','hader-services.sql']) { try { await db.exec(R(f)); } catch (e) { console.log('FAIL load', f, e.message); process.exit(1); } }
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


// ---------- الصيغة الموحّدة ----------
const norm = async (s) => (await one(`select public.svc_norm($1) as r`, [s])).r;
ok(await norm('prep') === 'prep' && await norm('hw') === 'hw' && await norm('both') === 'both' && await norm('all') === 'all', 'the old values and «all» stay as they are');
ok(await norm('hw,prep') === 'both', '«prep,hw» in any order is «both»');
ok(await norm('video,prep') === 'prep,video', 'a list is stored in one fixed order');
ok(await norm('scorm, rooms ,hw') === 'hw,rooms,scorm', 'spaces are ignored');
ok(await norm('prep,hw,rooms,video,scorm') === 'all' && await norm('both,rooms,video,scorm') === 'all', 'all five is «all»');
ok(await norm('') === null && await norm(null) === null && await norm('prep,xyz') === null && await norm('free') === null, 'empty or unknown is refused');
const has = async (s, k) => (await one(`select public.svc_has($1,$2) as r`, [s, k])).r;
ok(await has('both', 'hw') && await has('all', 'scorm') && await has('prep,video', 'video') && !(await has('prep,video', 'hw')) && !(await has('both', 'rooms')) && !(await has(null, 'prep')), 'svc_has reads every form');
let eC = null; try { await db.exec(`insert into public.name_subs (name, name_norm, plan, all_subjects, service, package_ids) values ('x y','x y','term',true,'video,prep','{}')`); } catch (e) { eC = e.message; }
ok(!!eC, 'the table refuses a list that is not in the fixed form', eC);

// ---------- المدير يسجّل اسمًا بخدمات مختارة ----------
let e0 = null; try { await add('سعيد حمد ناصر الريامي', ''); } catch (e) { e0 = e.message; }
ok(e0 && /خدمة واحدة/.test(e0), 'no service chosen is refused calmly', e0);
const a1 = await add('سعيد حمد ناصر الريامي', 'video,prep');
ok(a1 && a1.ok, 'admin adds a name with «تحضير + فيديو»', a1);
ok((await one(`select service from public.name_subs where id=$1`, [a1.id])).service === 'prep,video', 'it is stored in the fixed form');
const s1 = await start('سعيد حمد ناصر الريامي');
const n1 = await noor(s1.token, H('1'), 'سعيد حمد ناصر الريامي');
const U1 = await userOf(s1.token);
const subs1 = await q(`select distinct service from public.subscriptions where user_id=$1 and not revoked`, [U1]);
ok(subs1.length === 1 && subs1[0].service === 'prep,video', 'his subjects open with exactly these services', { n1, subs1 });
const me1 = (await one(`select public.ext_me($1) as r`, [s1.token])).r;
const svcOf = (me, id) => ((me.subs || me.packages || []).find((x) => (x.package_id || x.id) === id) || {}).service;
ok(JSON.stringify(me1).includes('"service": "prep,video"') || JSON.stringify(me1).includes('"service":"prep,video"'), '«حاضر» receives the services with the subject (ext_me)', me1);
const se1 = await sess(s1.token);
ok(se1 && se1.ok !== false && se1.error !== 'hw_only', 'prep content is served (the subscription includes prep)', se1);

// ---------- اشتراك بلا تحضير: محتوى التحضير محجوب ----------
const a2 = await add('ميمونة راشد سالم الحبسي', 'hw,video,scorm');
const s2 = await start('ميمونة راشد سالم الحبسي');
await noor(s2.token, H('2'), 'ميمونة راشد سالم الحبسي');
const se2 = await sess(s2.token);
ok(se2 && se2.ok === false && se2.error === 'hw_only', 'without «تحضير» the prep content is not served', se2);
const U2 = await userOf(s2.token);
ok((await one(`select public.sub_service($1,'p1',1::smallint) as r`, [U2])).r === 'hw,video,scorm', 'sub_service gives the list', null);

// ---------- المدير يغيّر خدمات اسم مسجَّل ----------
await asAdmin(true);
const ch = (await one(`select public.admin_name_sub_service($1,'all') as r`, [a2.id])).r;
await asAdmin(false);
ok(ch && ch.ok && ch.service === 'all' && ch.applied, 'admin changes a registered name to the full package', ch);
const subs2 = await q(`select distinct service from public.subscriptions where user_id=$1 and not revoked`, [U2]);
ok(subs2.length === 1 && subs2[0].service === 'all', 'the change reaches the teacher\'s subjects at once', subs2);
const se2b = await sess(s2.token);
ok(se2b && se2b.error !== 'hw_only', 'prep content is served after the change', se2b);
let eN = null; try { await q(`select public.admin_name_sub_service($1,'video')`, [a2.id]); } catch (e) { eN = e.message; }
ok(eN && /غير مسموح/.test(eN), 'only the admin changes services', eN);
await asAdmin(true);
let eE = null; try { await q(`select public.admin_name_sub_service($1,'nothing')`, [a2.id]); } catch (e) { eE = e.message; }
const ch2 = (await one(`select public.admin_name_sub_service($1,'rooms') as r`, [a1.id])).r;
const ss = (await one(`select public.admin_set_service($1, array['p1'], 'scorm,hw') as r`, [U1])).r;
await asAdmin(false);
ok(eE && /خدمة واحدة/.test(eE), 'an unknown service is refused', eE);
ok(ch2.service === 'rooms' && ss.ok, 'a single extra service and a per-subject change are accepted', { ch2, ss });
ok((await one(`select service from public.subscriptions where user_id=$1 and package_id='p1'`, [U1])).service === 'hw,scorm', 'per-subject service is stored in the fixed form');

// ---------- ما كان قبلُ يبقى ----------
const a3 = await add('خالد سيف حمد المعمري', 'both');
const s3 = await start('خالد سيف حمد المعمري');
await noor(s3.token, H('3'), 'خالد سيف حمد المعمري');
const U3 = await userOf(s3.token);
ok((await one(`select public.sub_service($1,'p1',1::smallint) as r`, [U3])).r === 'both', '«both» stays prep + homework only');
ok(!(await has('both', 'video')), '«both» does not open the new services by itself');
// طلب يُفعَّل من «الطلبات» بخدمات مختارة
const s4 = await start('نورة علي سعيد الشكيلي');
await noor(s4.token, H('4'), 'نورة علي سعيد الشكيلي');
const U4 = await userOf(s4.token);
await asAdmin(true);
const act = (await one(`select public.admin_request_activate((select id from public.ext_requests where user_id=$1),'rooms,prep,hw') as r`, [U4])).r;
await asAdmin(false);
const subs4 = await q(`select distinct service from public.subscriptions where user_id=$1 and not revoked`, [U4]);
ok(act && act.ok && subs4.length === 1 && subs4[0].service === 'prep,hw,rooms', 'a request is activated with a chosen set of services', { act, subs4 });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
