#!/usr/bin/env node
// versions.mjs — أين وصلت كل نسخة من «حاضر»: المستودع، الموقع المنشور، متجر كروم، وأدنى نسخة يسمح لها الخادم بالتعبئة.
//
//   node tools/versions.mjs           # جدول + ما يجب فعله
//   node tools/versions.mjs --json    # النتيجة JSON (للأدوات الأخرى)
//
// يحتاج إنترنت (متجر كروم، GitHub Pages، Supabase بمفتاح anon العام من site/config.js — قراءة فقط). يعمل على حاسوب المالك،
// وفي GitHub Actions (سير العمل «حالة نسخ حاضر» في تبويب Actions). حاوية Claude السحابية لا تصل إلى هذه المواقع عادةً.
// القاعدة: لا تُرفع min_ext_version إلا بعد أن يعرض المتجر النسخة الجديدة (وإلا توقف المعلمون عن التعبئة).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_ID = 'dppamelcpolikjnkfajfpgpfbomklbha';
const STORE = `https://chromewebstore.google.com/detail/${STORE_ID}?hl=en`;
const SITE = 'https://afuq-edu.github.io/afaq-subscribe/hader-version.json';
const JSON_OUT = process.argv.includes('--json');

const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const get = async (url, headers = {}) => { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 afaq-versions', ...headers }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };

const out = { repo: JSON.parse(fs.readFileSync(path.join(REPO, 'extension/manifest.json'), 'utf8')).version, errors: {} };
const cfg = fs.readFileSync(path.join(REPO, 'site/config.js'), 'utf8');
const val = (k) => (cfg.match(new RegExp(k + "\\s*:\\s*['\"]([^'\"]*)['\"]")) || [])[1] || '';

await Promise.all([
  get(STORE).then((html) => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    out.store = (text.match(/\bVersion\s+(\d+(?:\.\d+){1,3})\b/) || html.match(/"version"\s*:\s*"(\d+(?:\.\d+){1,3})"/) || [])[1] || null;
    out.storeUpdated = (text.match(/\bUpdated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1] || null;
    if (!out.store) out.errors.store = 'لم يُعثر على رقم النسخة في صفحة المتجر';
  }).catch((e) => { out.errors.store = e.message; }),
  get(SITE + '?t=' + Date.now()).then((t) => { out.site = JSON.parse(t).version; }).catch((e) => { out.errors.site = e.message; }),
  (async () => {
    const url = val('SUPABASE_URL'), key = val('SUPABASE_ANON_KEY');
    const rows = JSON.parse(await get(`${url}/rest/v1/settings?select=key,value&key=in.(min_ext_version,extension_url)`, { apikey: key, authorization: 'Bearer ' + key }));
    for (const r of rows) out[r.key] = r.value;
  })().catch((e) => { out.errors.settings = e.message; }),
]);

if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
const row = (k, v, note = '') => console.log(`  ${k.padEnd(34)} ${String(v ?? '—').padEnd(10)} ${note}`);
console.log('نسخ «حاضر»');
row('المستودع (extension/manifest.json)', out.repo);
row('الموقع المنشور (hader-version.json)', out.site, out.errors.site ? `(تعذّر: ${out.errors.site})` : '');
row('متجر كروم', out.store, out.errors.store ? `(تعذّر: ${out.errors.store})` : out.storeUpdated ? `(حُدّث ${out.storeUpdated})` : '');
row('أدنى نسخة تعبّئ (min_ext_version)', out.min_ext_version, out.errors.settings ? `(تعذّر: ${out.errors.settings})` : '');

const todo = [];
if (out.store && cmp(out.repo, out.store) > 0) todo.push(`المتجر ما زال على ${out.store} والمستودع ${out.repo}: ارفع chrome-store/hader-store-${out.repo}.zip في لوحة مطوّري متجر كروم (إن لم يُرفع)، والمراجعة تأخذ ساعات إلى أيام.`);
if (out.store && cmp(out.store, out.repo) > 0) todo.push(`المتجر (${out.store}) أحدث من المستودع (${out.repo}): الإصدار المرفوع لم يُدمج في main بعد؟`);
if (out.site && cmp(out.site, out.repo) !== 0) todo.push(`الموقع المنشور يقول ${out.site} والمستودع ${out.repo}: نشر GitHub Pages لم يكتمل (تبويب Actions ← «نشر الموقع على GitHub Pages»).`);
if (out.store && out.min_ext_version && cmp(out.min_ext_version, out.store) > 0) todo.push(`تحذير: min_ext_version (${out.min_ext_version}) أعلى من نسخة المتجر (${out.store}) — لن يستطيع أي معلم التعبئة! أنزلها في لوحة الإدارة ← الإعدادات.`);
if (out.store && out.min_ext_version && cmp(out.min_ext_version, out.store) < 0) todo.push(`يمكن رفع min_ext_version من ${out.min_ext_version} إلى ${out.store} (لوحة الإدارة ← الإعدادات) متى طلب المالك إلزام المعلمين بالتحديث.`);
if (out.extension_url !== undefined && !/chromewebstore\.google\.com/.test(out.extension_url || '')) todo.push('رابط الإضافة في الإعدادات (extension_url) ليس رابط متجر كروم: صفحة التثبيت لن تعرض زر المتجر.');
const failed = Object.keys(out.errors).length;
console.log(todo.length ? '\nما يجب فعله:\n' + todo.map((t) => '  • ' + t).join('\n') : failed ? `\nتعذّر فحص ${failed} من 3 مصادر (لا إنترنت؟ شغّلها على حاسوبك أو من GitHub Actions).` : '\nكل النسخ متوافقة.');
process.exit(failed === 3 ? 1 : 0);
