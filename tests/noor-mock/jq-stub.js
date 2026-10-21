// jq-stub.js — a tiny stand-in for jQuery + DataTables on the mock Noor «تحضير الدروس» page.
// Implements only what the extension calls (semester.js readAllPrepTitles):
//   $.fn.dataTable.isDataTable(el), $(el).DataTable(), dt.page.info(), dt.page.len(n).draw(),
//   dt.one('draw', fn), dt.cells(null, 0).render('display').toArray()
// Rows are drawn asynchronously (like a server-side DataTable) and only the current page is in the DOM.
(function () {
  const tables = new WeakMap();
  function DT(el, opts) {
    this.el = el;
    this.rows = (opts && opts.data) || [];
    this.len = (opts && opts.pageLength) || 10;
    this.handlers = {};
    this.drawDelay = (opts && opts.drawDelay) || 150;
    const self = this;
    this.page = {
      info: () => ({ recordsTotal: self.rows.length, recordsDisplay: self.rows.length, length: self.len, page: 0, start: 0, end: Math.min(self.len, self.rows.length) }),
      len: (n) => { self.len = n; return { draw: () => self.draw() }; },
    };
    this._render();
  }
  DT.prototype._render = function () {
    const tb = this.el.querySelector('tbody');
    const shown = this.len === -1 ? this.rows : this.rows.slice(0, this.len);
    tb.innerHTML = shown.length ? shown.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('')
      : '<tr><td class="dataTables_empty" colspan="6">لا توجد بيانات</td></tr>';
    const info = document.getElementById(this.el.id + '_info');
    if (info) info.textContent = `عرض 1 إلى ${shown.length} من أصل ${this.rows.length} مدخل`;
  };
  DT.prototype.draw = function () {
    setTimeout(() => {
      this._render();
      const hs = this.handlers.draw || [];
      this.handlers.draw = [];
      hs.forEach((f) => { try { f(); } catch (e) {} });
    }, this.drawDelay);
    return this;
  };
  DT.prototype.one = function (ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; };
  DT.prototype.cells = function (rowSel, col) {
    const vals = this.rows.map((r) => r[col]);
    return { render: () => ({ toArray: () => vals.slice() }) };
  };
  function jq(sel) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    return {
      DataTable(opts) {
        if (!el) return null;
        if (!tables.has(el)) tables.set(el, new DT(el, opts));
        return tables.get(el);
      },
    };
  }
  jq.fn = { jquery: '0.0-stub', dataTable: { isDataTable: (el) => tables.has(el) } };
  jq.active = 0;
  window.jQuery = window.$ = jq;
})();
