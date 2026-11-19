// ui-icons.js — أيقونات واجهة «حاضر» الجديدة (المالك 2026-11-19): بلاطة كحلية بحافة ذهبية وفيها رسم خطي أبيض وذهبي.
// لا نصوص فيها: إضافتها إلى زر لا تغيّر نصه.
const P = {
  // طرق العمل
  pick: '<path d="M4 6.5l1.6 1.6L8.5 5"/><path d="M11.5 6.5H20"/><path class="g" d="M4 12.5l1.6 1.6L8.5 11"/><path d="M11.5 12.5H20"/><path d="M4.5 18.5h3M11.5 18.5H20"/>',
  term: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path class="g" d="M8 14.5l2.5 2.5 5-5"/>',
  // الخدمات
  prep: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/><path class="g" d="M9 12.5h7M9 16h5"/>',
  hw: '<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3h6v1.5"/><path class="g" d="M8.5 13l2.3 2.3 4.7-4.7"/>',
  rooms: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v4a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5z"/><path class="g" d="M19.8 10.5V15a2 2 0 0 1-2 2v2.5L14.5 17H11"/>',
  video: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path class="g f" d="M10 9.2v5.6l5-2.8z"/>',
  scorm: '<path class="g" d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5 6.9 19.2l1-5.7-4.1-4 5.7-.8z"/>',
  // نوع المدرسة
  one: '<circle class="g" cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  two: '<circle cx="8" cy="8.5" r="3"/><path d="M8 2.8v1.2M8 13v1.2M2.3 8.5h1.2M12.5 8.5h1.2"/><path class="g" d="M20.5 15A5.5 5.5 0 1 1 14 9.2 4.4 4.4 0 0 0 20.5 15z"/>',
  // المواد
  math: '<path d="M5.5 7.5h5M8 5v5"/><path d="M14 7.5h4.5"/><path d="M6 15.5l4 4M10 15.5l-4 4"/><path class="g" d="M14 16h4.5M14 19h4.5"/>',
  sci: '<path d="M9.5 3.5h5M10.5 3.5V9l-5 9a2 2 0 0 0 1.8 3h9.4a2 2 0 0 0 1.8-3l-5-9V3.5"/><path class="g" d="M7.8 15.5h8.4"/>',
  bio: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 13 14 19 5 19z"/><path class="g" d="M5 19l8.5-8.5"/>',
  chem: '<path d="M9 3.5h6M10 3.5v6l-4.5 8.5A2 2 0 0 0 7.3 21h9.4a2 2 0 0 0 1.8-3L14 9.5v-6"/><circle class="g f" cx="10.5" cy="16.5" r="1"/><circle class="g f" cx="13.8" cy="14" r=".9"/>',
  phys: '<ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/><circle class="g f" cx="12" cy="12" r="1.5"/>',
  isl: '<path d="M16.5 15.5A7 7 0 1 1 12 4a5.6 5.6 0 0 0 4.5 11.5z"/><path class="g" d="M17 5.5l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L14 7.7l2.1-.3z"/>',
  soc: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path class="g" d="M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
  it: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/><path class="g" d="M9.5 8.5l-2 2 2 2M14.5 8.5l2 2-2 2"/>',
  art: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.5 0 2-1 1.5-2.2-.6-1.4.3-2.8 2-2.8H18a2.5 2.5 0 0 0 2.5-2.5c0-5-3.8-9.5-8.5-9.5z"/><circle class="g f" cx="8" cy="10.5" r="1.1"/><circle class="g f" cx="12" cy="7.5" r="1.1"/><circle class="g f" cx="16" cy="10.5" r="1.1"/>',
  sport: '<circle cx="12" cy="12" r="8.5"/><path class="g" d="M12 7.5l4 3-1.5 4.5h-5L8 10.5z"/>',
  life: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/><path class="g" d="M9 11.5l2.2 2.2 4-4"/>',
  home: '<path d="M4 11.5L12 4l8 7.5"/><path d="M6.5 10v10h11V10"/><path class="g" d="M10 20v-5.5h4V20"/>',
  book: '<path d="M12 7c-2.5-1.8-5.5-2.2-8.5-1.8v13c3-.4 6 0 8.5 1.8 2.5-1.8 5.5-2.2 8.5-1.8v-13c-3-.4-6 0-8.5 1.8z"/><path class="g" d="M12 7v13"/>',
};
const T = { ar: 'ض', en: 'Aa' };   // مادتا اللغة: حرف بدل الرسم

const SUBJ = [[/عربي/, 'ar'], [/إنجليزي|انجليزي|English/i, 'en'], [/رياضيات/, 'math'], [/أحياء|احياء|بيئي/, 'bio'], [/كيمياء/, 'chem'], [/فيزياء/, 'phys'], [/علوم/, 'sci'],
  [/إسلامي|اسلامي/, 'isl'], [/اجتماعي|مواطنة|وطني/, 'soc'], [/تقنية|حاسوب/, 'it'], [/فنون|تشكيلي|موسيق/, 'art'], [/بدني|رياض[ةه]/, 'sport'], [/حياتي/, 'life']];
export const subjectIcon = (name) => { const s = String(name || ''); const hit = SUBJ.find(([re]) => re.test(s)); return hit ? hit[1] : 'book'; };

// بلاطة أيقونة: مفتاح من الجدول، أو «#٩» لرقم الصف
export function tile(key) {
  if (!key) return '';
  const k = String(key);
  if (k[0] === '#') return `<i class="ui-ic num" aria-hidden="true">${k.slice(1)}</i>`;
  if (T[k]) return `<i class="ui-ic num" aria-hidden="true" lang="${k}">${T[k]}</i>`;
  return P[k] ? `<i class="ui-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[k]}</svg></i>` : '';
}
