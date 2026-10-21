// timescale.js — TEST COPY ONLY (matrix.mjs): makes the extension's and the mock pages' timers run faster.
// Short delays (sleeps, polling, back-off steps, count-downs) are divided by __SCALE__; long ones (>= __FLOOR__ ms — these are
// timeouts: «wait at most 25 s for the table», «30 s for the navigation») are divided too but never drop below __FLOOR__ ms,
// so a slow page under parallel load is not mistaken for a failure. Date.now() is NOT changed (date logic stays real).
// Injected by matrix.mjs into: semester.html (first <script>), background.js / content.js / noorlist.js (prepended),
// and every mock Noor page (Playwright addInitScript). Idempotent.
// __FAST_CLOCK__ (mock Noor pages only, never the extension's pages): Date.now() also advances K× faster, so the engine's
// real-time idle guard (engine.js expand(): «Date.now() - t0 > 700») passes without a real 700 ms wait. The mock pages
// themselves never read the clock; publish dates are computed in the extension's own pages, whose clock stays real.
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : self;
  if (g.__hadirTimeScale) return;
  const K = __SCALE__, FLOOR = __FLOOR__;
  g.__hadirTimeScale = K;
  if (!(K > 1)) return;
  const st = g.setTimeout.bind(g), si = g.setInterval.bind(g);
  const f = (d) => { d = Number(d) || 0; if (d <= 0) return d; return d >= FLOOR ? Math.max(FLOOR, d / K) : d / K; };
  g.setTimeout = function (fn, d, ...a) { return st(fn, f(d), ...a); };
  g.setInterval = function (fn, d, ...a) { return si(fn, f(d), ...a); };
  if (__FAST_CLOCK__) { const now0 = Date.now(), real = Date.now.bind(Date); Date.now = () => now0 + (real() - now0) * K; }
})();
