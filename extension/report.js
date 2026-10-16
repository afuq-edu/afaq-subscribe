// report.js — تقرير المعلم بعد كل تحضير: ما نُشر في نور وتواريخه، وما بقي ليُكمَل (قابل للطباعة)
import { dayLabel, isIso } from './packages.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const countWord = (n) => (n === 1 ? 'حصة واحدة' : n === 2 ? 'حصتان' : n <= 10 ? toAr(n) + ' حصص' : toAr(n) + ' حصة');
const SHIFT = { one: 'فترة واحدة', two: 'فترتان' };
const when = (t) => new Date(t).toLocaleString('ar-OM', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });

function render(r) {
  if (!r) { $('rp').innerHTML = '<p class="rp-empty">لا تقارير بعد — يظهر هنا تقرير كل تحضير بعد انتهائه.</p>'; return; }
  const saved = r.saved.slice().sort((a, b) => String(a.d).localeCompare(String(b.d)));
  const ds = saved.map((x) => x.d).filter(isIso);
  const range = ds.length ? (ds[0] === ds[ds.length - 1] ? ` يوم ${dayLabel(ds[0])}` : ` من ${dayLabel(ds[0])} إلى ${dayLabel(ds[ds.length - 1])}`) : '';
  const sure = r.verify === 'ok' || r.verify === 'loose';
  const parts = [saved.length ? `نُشر ${countWord(saved.length)}${range}${sure ? '، وتأكدت منها كلها في نور' : ''}.` : 'لم يُنشر شيء جديد في هذا التحضير.',
    r.had ? `وكان في نور من قبل ${countWord(r.had)} لم تتكرر.` : ''].filter(Boolean).join(' ');
  $('rp').innerHTML = `<div class="rp-card"><h2>${esc(r.title || r.subject)}${r.grade && !String(r.title || '').includes(r.grade) ? ' — ' + esc(r.grade) : ''}</h2>
      <p class="rp-meta">${[SHIFT[r.shift] || '', when(r.at)].filter(Boolean).map(esc).join(' · ')}</p>
      <p class="rp-sum">${esc(parts)}</p></div>
    ${saved.length ? `<div class="rp-card"><table class="rp"><thead><tr><th>#</th><th>الدرس في نور</th><th>الحصة</th><th>تاريخ النشر</th></tr></thead><tbody>
      ${saved.map((x, i) => `<tr><td class="n">${toAr(i + 1)}</td><td>${esc(x.lesson)}</td><td>${esc(x.s)}</td><td class="d">${isIso(x.d) ? esc(dayLabel(x.d)) : ''}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    ${r.left && r.left.length ? `<div class="rp-card"><h2>تُكمَل في المرة القادمة</h2><p class="rp-meta">اضغط «أكمل الباقي» في نافذة «حاضر» فتُنشر هذه الحصص دون تكرار ما نُشر.</p>
      <table class="rp"><tbody>${r.left.map((x, i) => `<tr><td class="n">${toAr(i + 1)}</td><td>${esc(x.lesson)}</td><td>${esc(x.s)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

(async () => {
  const all = (await chrome.storage.local.get('hadirReports')).hadirReports || [];
  $('rpSel').innerHTML = all.map((r, i) => `<option value="${i}">${esc(r.title || r.subject)} — ${esc(new Date(r.at).toLocaleDateString('ar-OM', { day: 'numeric', month: 'long' }))}</option>`).join('');
  $('rpSel').hidden = all.length < 2;
  $('rpSel').onchange = () => render(all[+$('rpSel').value]);
  $('rpPrint').onclick = () => window.print();
  render(all[0]);
})();
