// اختبار قاعدة البيانات على PostgreSQL حقيقي (PGlite) بمحاكاة بيئة Supabase: auth.uid() والأدوار anon/authenticated
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra) : ''); } };

// --- بيئة Supabase المصغّرة ---
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(fs.readFileSync(new URL('../site/supabase/schema.sql', import.meta.url), 'utf8'));
// تنفيذ ثانٍ: يجب أن يمر دون أخطاء
await db.exec(fs.readFileSync(new URL('../site/supabase/schema.sql', import.meta.url), 'utf8'));
ok(true, 'المخطط يُنفَّذ مرتين دون خطأ');

// تنفيذ بصلاحية دور ومستخدم
async function as(role, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
const rpc = async (role, uid, fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await as(role, uid, `select public.${fn}(${ph}) as r`, args);
  return r.rows[0].r;
};
const tryq = async (f) => { try { return { res: await f() }; } catch (e) { return { err: e.message }; } };

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const T1 = '00000000-0000-0000-0000-0000000000b1';   // عيسى بن محمد الحارثي
const T2 = '00000000-0000-0000-0000-0000000000b2';   // معلم آخر
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
  ($1, 'admin@x', '{"full_name":"مدير المنصة"}'),
  ($2, 't1@x', '{"full_name":"عيسى بن محمد الحارثي","phone":"9xx"}'),
  ($3, 't2@x', '{"full_name":"سالم علي"}')`, [ADMIN, T1, T2]);
ok((await db.query('select count(*)::int n from public.profiles')).rows[0].n === 3, 'إنشاء ملفات المعلمين تلقائيًا عند التسجيل');
await db.query(`update public.profiles set is_admin = true where id = $1`, [ADMIN]);   // من محرر SQL

console.log('\n— الإعداد من لوحة المدير');
// المدير ينشئ الباقات والفصل عبر RLS
await as('authenticated', ADMIN, `insert into public.packages (id, subject, grade, title) values
  ('en-1','اللغة الإنجليزية',1,'اللغة الإنجليزية — الأول'), ('en-2','اللغة الإنجليزية',2,'اللغة الإنجليزية — الثاني'),
  ('ma-5','الرياضيات',5,'الرياضيات — الخامس')`);
await as('authenticated', ADMIN, `insert into public.terms (year, term, starts_on, ends_on) values
  ('2026/2027', 1, current_date - 40, current_date + 60), ('2025/2026', 2, current_date - 300, current_date - 10)`);
const termNow = (await db.query(`select id from public.terms where year='2026/2027'`)).rows[0].id;
const termOld = (await db.query(`select id from public.terms where year='2025/2026'`)).rows[0].id;
ok(true, 'المدير ينشئ الباقات والفصول');
const notAdmin = await tryq(() => as('authenticated', T1, `insert into public.packages (id, subject, grade, title) values ('x','x',1,'x')`));
ok(!!notAdmin.err, 'المعلم لا يستطيع إنشاء باقة', notAdmin);

// رفع محتوى: حصتان لدرس واحد + حصة
const pkgFile = { id: 'local-en1', title: 'English 1', subject: 'اللغة الإنجليزية', grade: 'الأول', lessons: [
  { id: 's1', unit: 'Unit 1', lesson: 'Lesson 1', title: 'الحصة 1', outcomes: ['مخرج'], procedures: '<p>سير الدرس الأول</p>', notes: 'ملاحظة', levels: ['أ'] },
  { id: 's2', unit: 'Unit 1', lesson: 'Lesson 1', title: 'الحصة 2', procedures: '<p>سير الدرس الثاني</p>' },
  { id: 's3', unit: 'Unit 1', lesson: 'Lesson 2', title: 'الحصة 1', procedures: '<p>ثالث</p>', proceduresOther: 'سرّي' },
] };
const up = await rpc('authenticated', ADMIN, 'admin_upload_content', ['en-1', 1, JSON.stringify(pkgFile)]);
ok(up.ok && up.lessons === 2 && up.sessions === 3, 'رفع محتوى الباقة وحساب الدروس (٢) والحصص (٣)', up);
const upBad = await tryq(() => rpc('authenticated', T1, 'admin_upload_content', ['en-1', 1, JSON.stringify(pkgFile)]));
ok(!!upBad.err, 'المعلم لا يستطيع رفع محتوى');

// الكتالوج للعامة
const cat = await rpc('anon', null, 'catalog');
ok(cat.length === 3 && cat.find((p) => p.id === 'en-1').terms[0].sessions === 3, 'الكتالوج متاح للزوار ويُظهر الجاهز');

// قراءة المحتوى مباشرة ممنوعة
const raw1 = await as('anon', null, 'select * from public.package_content');
const raw2 = await as('authenticated', T1, 'select * from public.package_content');
ok(raw1.rows.length === 0 && raw2.rows.length === 0, 'لا أحد غير المدير يقرأ جدول المحتوى مباشرة');
const codesPeek = await as('authenticated', T1, 'select * from public.activation_codes');
ok(codesPeek.rows.length === 0, 'المعلم لا يرى رموز التفعيل');

console.log('\n— رموز التفعيل');
const iss = await rpc('authenticated', ADMIN, 'admin_issue_code', ['عيسى محمد الحارثي', '9xx', termNow, '{en-1,en-2}', 'واتساب', 1]);
const code = iss.codes[0];
ok(/^AFQ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), 'صيغة الرمز ' + code);
const iss2 = await tryq(() => rpc('authenticated', T1, 'admin_issue_code', ['x', '', termNow, '{en-1}', null, 1]));
ok(!!iss2.err, 'المعلم لا يستطيع إصدار رمز');

let r = await rpc('authenticated', T2, 'redeem_code', [code]);
ok(!r.ok && r.error === 'name', 'رمز باسم معلم آخر يُرفض لغيره', r);
r = await rpc('authenticated', T1, 'redeem_code', ['afq ' + code.slice(4).toLowerCase().replace('-', ' ')]);
ok(r.ok && r.packages.length === 2, 'تفعيل بالاسم (مع «بن» وكتابة الرمز بأحرف صغيرة ومسافات)', r);
r = await rpc('authenticated', T1, 'redeem_code', [code]);
ok(r.ok, 'تفعيل الرمز نفسه مرة ثانية لصاحبه لا يضر');
r = await rpc('authenticated', T2, 'redeem_code', [code]);
ok(!r.ok && (r.error === 'used' || r.error === 'name'), 'رمز مستعمل لا يُستعمل لغير صاحبه', r);
r = await rpc('authenticated', T1, 'redeem_code', ['AFQ-ZZZZ-ZZZZ']);
ok(!r.ok && r.error === 'invalid', 'رمز غير موجود');
const oldCode = (await rpc('authenticated', ADMIN, 'admin_issue_code', ['عيسى الحارثي', '', termOld, '{ma-5}', null, 1])).codes[0];
r = await rpc('authenticated', T1, 'redeem_code', [oldCode]);
ok(!r.ok && r.error === 'expired', 'رمز فصل منتهٍ يُرفض', r);

// أسماء: مطابقات ذكية وصارمة
const nm = async (a, b) => (await db.query('select public.names_match($1,$2) m', [a, b])).rows[0].m;
ok(await nm('عيسى بن محمد الحارثي', 'عيسي محمد الحارثى'), 'الاسم: الهمزات والياء و«بن» و«ال»');
ok(await nm('عبد الله سالم', 'عبدالله سالم'), 'الاسم: «عبد الله» = «عبدالله»');
ok(!(await nm('محمد سالم', 'محمد علي')), 'الاسم: شخصان مختلفان');
ok(!(await nm('محمد', 'محمد علي الهنائي')), 'الاسم: الاسم الأول وحده لا يكفي');
ok(!(await nm('علي محمد', 'محمد علي')), 'الاسم: الاسم الأول يجب أن يتطابق');

// تغيير الاسم بعد التفعيل ممنوع، ورفع الصلاحية ممنوع
const ren = await tryq(() => as('authenticated', T1, `update public.profiles set full_name = 'سالم علي' where id = $1`, [T1]));
ok(!!ren.err, 'المعلم لا يغيّر اسمه بعد التفعيل');
const esc = await tryq(() => as('authenticated', T2, `update public.profiles set is_admin = true where id = $1`, [T2]));
ok(!!esc.err || !(await db.query('select is_admin from public.profiles where id=$1', [T2])).rows[0].is_admin, 'المعلم لا يجعل نفسه مديرًا');
const peek = await as('authenticated', T2, 'select id from public.profiles');
ok(peek.rows.length === 1, 'المعلم لا يرى إلا ملفه');

const subs = await rpc('authenticated', T1, 'my_subscriptions');
ok(subs.length === 2 && subs.every((s) => s.active) && subs.find((s) => s.package_id === 'en-1').ready && !subs.find((s) => s.package_id === 'en-2').ready, 'اشتراكاتي: فعّالة، ومعرفة الجاهز منها', subs);

console.log('\n— الإضافة (برمز الجهاز)');
const lk = await rpc('authenticated', T1, 'link_device', ['Chrome — Mac']);
const tok = lk.token;
ok(lk.ok && tok.length === 64, 'ربط جهاز يعيد رمزًا سريًا');
const stored = (await db.query('select token_hash from public.devices where user_id = $1', [T1])).rows[0].token_hash;
ok(stored !== tok && stored.length === 64, 'الرمز لا يُحفظ إلا مُجزّأً');

let me = await rpc('anon', null, 'ext_me', [tok]);
ok(me.ok && me.subs.length === 2 && me.name.includes('عيسى'), 'الإضافة تعرف المعلم واشتراكاته', me);
ok((await rpc('anon', null, 'ext_me', ['bad'])).error === 'unlinked', 'رمز جهاز خاطئ يُرفض');

const st = await rpc('anon', null, 'ext_structure', [tok, 'en-1', 1]);
const sl = st.pkg.lessons;
ok(st.ok && sl.length === 3 && sl[0].id === 's1' && sl[0].unit === 'Unit 1' && sl[1].title === 'الحصة 2', 'الهيكل: الوحدات والدروس والحصص بترتيبها');
ok(sl.every((l) => !('procedures' in l) && !('outcomes' in l) && !('notes' in l) && !('proceduresOther' in l)), 'الهيكل خالٍ من محتوى البنود');
ok((await rpc('anon', null, 'ext_structure', [tok, 'ma-5', 1])).error === 'expired', 'باقة غير مشترك فيها: لا هيكل');
ok((await rpc('anon', null, 'ext_structure', [tok, 'en-2', 1])).error === 'not_ready', 'باقة مشترك فيها ولم يُرفع محتواها: «لم تجهز»');

const s1 = await rpc('anon', null, 'ext_session', [tok, 'en-1', 1, 's1']);
ok(s1.ok && s1.lesson.outcomes[0] === 'مخرج' && s1.lesson.procedures.startsWith('<p>سير الدرس الأول</p>'), 'محتوى الحصة يُسلَّم للمشترك');
ok(/⁠[​‌]{24}⁠$/.test(s1.lesson.procedures), 'علامة مائية خفية في آخر «سير الدرس»');
const wmOther = (await db.query('select public.watermark($1) w', [T2])).rows[0].w;
ok(!s1.lesson.procedures.endsWith(wmOther), 'العلامة تختلف من معلم لآخر');
ok((await rpc('anon', null, 'ext_session', [tok, 'en-1', 1, 'nope'])).error === 'no_lesson', 'حصة غير موجودة');

// الحد اليومي: إعادة نفس الحصة لا تُحتسب
await db.query(`update public.settings set value = '2' where key = 'daily_limit'`);
await rpc('anon', null, 'ext_session', [tok, 'en-1', 1, 's1']);
await rpc('anon', null, 'ext_session', [tok, 'en-1', 1, 's1']);
ok((await rpc('anon', null, 'ext_session', [tok, 'en-1', 1, 's2'])).ok, 'الحد اليومي: إعادة المحاولة لا تُحتسب');
const lim = await rpc('anon', null, 'ext_session', [tok, 'en-1', 1, 's3']);
ok(!lim.ok && lim.error === 'limit', 'الحد اليومي يوقف الحصة الزائدة', lim);
await db.query(`update public.settings set value = '200' where key = 'daily_limit'`);

// حد الأجهزة: الجهاز الثالث يفصل الأقدم
const lk2 = await rpc('authenticated', T1, 'link_device', ['Edge']);
await db.query(`update public.devices set last_seen = now() - interval '1 day' where token_hash = encode(sha256(convert_to($1,'UTF8')),'hex')`, [tok]);
const lk3 = await rpc('authenticated', T1, 'link_device', ['Chrome — مدرسة']);
ok(lk3.dropped === 1 && (await rpc('anon', null, 'ext_me', [tok])).error === 'unlinked' && (await rpc('anon', null, 'ext_me', [lk2.token])).ok, 'حد الأجهزة (٢): ربط جهاز ثالث يفصل الأقدم');

// انتهاء الفصل: الاشتراك يتوقف وحده
await db.query(`update public.terms set ends_on = current_date - 1 where id = $1`, [termNow]);
me = await rpc('anon', null, 'ext_me', [lk3.token]);
ok(me.ok && me.subs.length === 0, 'بعد نهاية الفصل: لا اشتراكات فعالة');
ok((await rpc('anon', null, 'ext_session', [lk3.token, 'en-1', 1, 's1'])).error === 'expired', 'بعد نهاية الفصل: لا محتوى');
ok(!(await rpc('authenticated', T1, 'my_subscriptions'))[0].active, 'لوحة المعلم تُظهر الاشتراك منتهيًا');
await db.query(`update public.terms set ends_on = current_date + 60 where id = $1`, [termNow]);

// إلغاء اشتراك من المدير
await as('authenticated', ADMIN, `update public.subscriptions set revoked = true where user_id = $1 and package_id = 'en-1'`, [T1]);
ok((await rpc('anon', null, 'ext_session', [lk3.token, 'en-1', 1, 's1'])).error === 'expired', 'إلغاء المدير للاشتراك يوقف المحتوى فورًا');

// حماية التخمين
for (let i = 0; i < 10; i++) await rpc('authenticated', T2, 'redeem_code', ['AFQ-AAAA-AAA' + 'B']);
ok((await rpc('authenticated', T2, 'redeem_code', ['AFQ-AAAA-AAAB'])).error === 'too_many', 'بعد ١٠ محاولات خاطئة في ساعة: إيقاف مؤقت');

// الزائر لا يستدعي دوال المعلم والمدير
const anonRedeem = await tryq(() => rpc('anon', null, 'redeem_code', [code]));
const anonAdmin = await tryq(() => rpc('anon', null, 'admin_teachers'));
ok(!!anonRedeem.err && !!anonAdmin.err, 'الزائر لا يستدعي دوال المعلم والمدير');
const tch = await rpc('authenticated', ADMIN, 'admin_teachers');
ok(tch.length === 3 && tch.find((t) => t.id === T1).devices === 2, 'لوحة المدير: المعلمون وأجهزتهم');

console.log('\n— الاشتراك السنوي');
const T3 = '00000000-0000-0000-0000-0000000000b3';
const T4 = '00000000-0000-0000-0000-0000000000b4';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 't3@x', '{"full_name":"مريم سعيد البوسعيدي"}'), ($2, 't4@x', '{"full_name":"خالد ناصر الشكيلي"}')`, [T3, T4]);
const yr = await rpc('authenticated', ADMIN, 'admin_issue_code', ['مريم سعيد البوسعيدي', '', termNow, '{en-1,ma-5}', null, 1, 'year']);
const yrCode = (await db.query('select plan from public.activation_codes where code = $1', [yr.codes[0]])).rows[0];
ok(yr.ok && yrCode.plan === 'year', 'إصدار رمز سنوي');
const badPlan = await tryq(() => rpc('authenticated', ADMIN, 'admin_issue_code', ['مريم سعيد', '', termNow, '{en-1}', null, 1, 'month']));
ok(!!badPlan.err, 'نوع اشتراك غير معروف يُرفض');
r = await rpc('authenticated', T3, 'redeem_code', [yr.codes[0]]);
ok(r.ok && r.plan === 'year', 'تفعيل الرمز السنوي', r);
let ys = await rpc('authenticated', T3, 'my_subscriptions');
ok(ys.length === 2 && ys.every((s) => s.plan === 'year' && s.term === 1 && s.active), 'قبل إضافة الفصل الثاني: اشتراك الفصل الأول فعّال', ys);
// المدير يضيف الفصل الثاني من العام نفسه ← يحصل عليه المشترك السنوي تلقائيًا
await as('authenticated', ADMIN, `insert into public.terms (year, term, starts_on, ends_on) values ('2026/2027', 2, current_date + 61, current_date + 160)`);
const term2 = (await db.query(`select id from public.terms where year='2026/2027' and term=2`)).rows[0].id;
ys = await rpc('authenticated', T3, 'my_subscriptions');
ok(ys.length === 4 && ys.filter((s) => s.term === 2).length === 2 && ys.every((s) => s.plan === 'year'), 'إضافة الفصل الثاني تمدّ الاشتراك السنوي تلقائيًا', ys);
const t1subs = (await rpc('authenticated', T1, 'my_subscriptions')).filter((s) => s.term === 2);
ok(t1subs.length === 0, 'المشترك الفصلي لا يحصل على الفصل الثاني');
// رمز سنوي يُصدر بعد وجود الفصلين ← يغطي الفصلين مباشرة
const yr2 = await rpc('authenticated', ADMIN, 'admin_issue_code', ['خالد ناصر الشكيلي', '', term2, '{en-2}', null, 1, 'year']);
r = await rpc('authenticated', T4, 'redeem_code', [yr2.codes[0]]);
const t4 = await rpc('authenticated', T4, 'my_subscriptions');
ok(r.ok && t4.length === 2 && new Set(t4.map((s) => s.term)).size === 2, 'رمز سنوي بعد وجود الفصلين يغطيهما', t4);
ok(r.ends_on === (await db.query(`select (current_date + 160)::text d`)).rows[0].d, 'الرمز السنوي ينتهي بنهاية الفصل الثاني', r);
// الفصل الأول انتهى والسنوي ما زال صالحًا للفصل الثاني
const yr3 = await rpc('authenticated', ADMIN, 'admin_issue_code', ['خالد ناصر الشكيلي', '', termNow, '{ma-5}', null, 1, 'year']);
await db.query(`update public.terms set ends_on = current_date - 1 where id = $1`, [termNow]);
r = await rpc('authenticated', T4, 'redeem_code', [yr3.codes[0]]);
ok(r.ok, 'الرمز السنوي يُفعَّل بعد نهاية الفصل الأول (ما دام الفصل الثاني لم ينته)', r);
const trm = await rpc('authenticated', ADMIN, 'admin_issue_code', ['خالد ناصر الشكيلي', '', termNow, '{ma-5}', null, 1]);
r = await rpc('authenticated', T4, 'redeem_code', [trm.codes[0]]);
ok(!r.ok && r.error === 'expired', 'أما الرمز الفصلي لفصل منتهٍ فيُرفض', r);
await db.query(`update public.terms set ends_on = current_date + 60 where id = $1`, [termNow]);

console.log('\n— إنشاء اشتراك مباشرة من المدير');
const g = await rpc('authenticated', ADMIN, 'admin_grant', [T2, 'year', termNow, '{ma-5}']);
const t2s = await rpc('authenticated', T2, 'my_subscriptions');
ok(g.ok && g.count === 2 && t2s.length === 2 && t2s.every((s) => s.plan === 'year'), 'المدير ينشئ اشتراكًا سنويًا لمعلم مسجّل', t2s);
const g2 = await rpc('authenticated', ADMIN, 'admin_grant', [T2, 'term', termNow, '{en-2}']);
ok(g2.ok && g2.count === 1, 'المدير ينشئ اشتراكًا فصليًا', g2);
const gBad = await tryq(() => rpc('authenticated', T2, 'admin_grant', [T2, 'year', termNow, '{en-1}']));
ok(!!gBad.err, 'المعلم لا ينشئ اشتراكًا لنفسه');
const tchY = await rpc('authenticated', ADMIN, 'admin_teachers');
ok(tchY.find((t) => t.id === T2).subs.some((s) => s.plan === 'year'), 'لوحة المدير تعرض نوع الاشتراك');

console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
