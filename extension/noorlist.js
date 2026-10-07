// noorlist.js — صفحة «التحاضير» في منصة نور: يقرأ قائمة ما حضّرته فعلًا
// ويرسلها إلى «حاضر» ليعلّم الحصص المطابقة «محفوظة» (حتى لو حضّرتها يدويًا أو من جهاز آخر)،
// فلا تُقترح مرة أخرى وتُنبَّه إن فتحت درسًا محضّرًا مسبقًا. لا يُرسل شيء خارج جهازك.
(() => {
  if (window.top !== window || window.__hadirList) return;
  window.__hadirList = true;
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const tx = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  function read() {
    const rows = [];
    document.querySelectorAll('table tbody tr').forEach((tr) => {
      const t = tr.querySelector('.title-text');
      if (!t) return;
      const tds = Array.from(tr.querySelectorAll(':scope > td'));
      const link = tr.querySelector('[data-prep-id]');
      const edit = tr.querySelector('a[href*="edit_preparation/"]');
      const created = tds.map(tx).find((x) => /^\d{4}-\d{2}-\d{2}/.test(x)) || '';
      const anyLink = tr.querySelector('a[href*="cid:"]');
      rows.push({
        title: tx(t), subject: tx(tds[1]), grade: tx(tds[2]), created: created.slice(0, 10),
        cid: anyLink ? ((anyLink.getAttribute('href').match(/cid:([A-Za-z0-9_-]+)/) || [])[1] || '') : '',
        id: link ? link.getAttribute('data-prep-id') : (edit ? (edit.getAttribute('href').match(/edit_preparation\/([^/]+)/) || [])[1] || '' : ''),
      });
    });
    return rows;
  }
  let last = '', timer = null;
  function send() {
    if (!alive()) return;
    const rows = read();
    const sig = rows.map((r) => r.id + r.title).join('|');
    if (!rows.length || sig === last) return;
    last = sig;
    try { const p = chrome.runtime.sendMessage({ type: 'hadirNoorList', rows, url: location.href }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  // الجدول يُبنى بعد التحميل، ويتغيّر مع التصفح بين الصفحات والبحث
  try { new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(send, 600); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  setTimeout(send, 700);
})();
