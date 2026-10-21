# Noor mock — end-to-end harness for «حاضر»

Drives the real extension wizard (`extension/semester.html`) in Chromium against a **mock Noor LMS**
(`https://lms.moe.gov.om/**`, served with Playwright `context.route`) and a **mock Afaq backend**
(`http://127.0.0.1:8765`), then checks exactly which preps Noor received.

```
node tests/noor-mock/run.mjs          # all scenarios
node tests/noor-mock/run.mjs 1 5      # only scenarios 1 and 5
```

Exit code is non-zero when any check fails. Each check prints `PASS`/`FAIL`, then a summary per scenario.
Scenario 1 (45 saves) takes roughly 8–10 minutes; the others take 1–3 minutes each.

Requirements (already in this container): Chromium at `/opt/pw-browsers/chromium`, Playwright at
`/opt/node22/lib/node_modules/playwright`, the package `/mnt/project-files/afaq-platform/preps/bio-9-t1.json`
(override with `PKG=`). Port 8765 must be free. No network access needed.

Env: `VERBOSE=1` (UI progress, extension log, Noor requests) · `HEADFUL=1` · `SHOTS=<dir>` (final screenshot
per scenario) · `KEEP=1` (keep the temp extension copy) · `TRACE_SAVE=1` (adds a diagnostic log line to the
temp copy of `semester.js` after each save).
`EXT_DIR=<dir>` runs another unpacked build (e.g. an unzipped release zip) instead of `extension/` · `AFAQ_PORT=<n>`
runs the mock Afaq backend on another port (default 8765; the temp copy's `afaq-config.js` is rewritten to match).
`tests/release-gate.mjs` uses both.

## How it works

- `run.mjs` copies `extension/` to a temp dir and replaces `afaq-config.js` with `afaq-config.mock.js`
  (nothing under `extension/` is modified), launches Chromium with `--load-extension`, opens
  `semester.html?debug=1` and clicks through the wizard («تحضير الفصل كاملًا» / «أختار الدروس بنفسي» →
  «الصف التاسع» → «الأحياء» → «فترة واحدة» → name). The extension opens and drives the Noor tab itself.
  The run is finished when the wizard shows its final state (`#nowHead`, «رجوع للبداية» button) or the pay screen.
- `afaq-server.mjs` answers the RPCs in `extension/remote.js` (`ext_catalog`, `ext_start`, `ext_me`,
  `ext_structure` → the package, `ext_session` → the session content, `ext_noor`, `ext_contact`, …) and
  counts free trial sessions.
- `noor-mock.mjs` is a stateful Noor: home page course cards (الأحياء التاسع + decoys: الأحياء العاشر,
  الكيمياء التاسع), the «تحضير الدروس» list (`#preparations_grid` with `jq-stub.js`, a minimal jQuery
  DataTable: 10 rows per page, async redraw), and the «إضافة تحضير» form: lazy jstree (terms → units →
  lessons; opening a unit drops the other units' lessons like Noor does), `#PreparationTitle`/`#lesson-id`,
  outcomes checkboxes loaded after choosing a lesson, publish date, class checkboxes loaded after the date,
  «تعميم» checkbox, field labels, «حفظ». A POST validates the form, enforces one prep per publish date per
  course, then adds a row `{title, lessonId, nodeText, unit, publishDate, concepts, …}` and returns the list
  page with a success popup (Playwright cannot fulfil a POST navigation with a 3xx).
  Options per scenario: pre-existing rows, dates rejected while typing (swal «التاريخ مستخدم من قبل») or at
  save, ambiguous save results (`form` = saved but the form comes back silently, `abort` = saved but the
  connection drops, `form-nosave`), renamed / duplicate lessons in the tree.
- Rows are mapped back to file sessions by their «المفاهيم» text (unique per session), so a session saved into
  the wrong lesson, on the wrong date, twice, or out of order is detected.

## Scenarios

1. Full term, official dates, empty Noor — 45 sessions, each once, own lesson, file date, chronological.
2. Noor rejects 2026-09-14 while typing and 2026-09-21 at save (sessions 10–45 already in Noor): the
   session moves to a later free day and the following ones stay after it.
3. Noor already has sessions 1, 2 («(2)»), 4, 12 («(3)») and 18–45: none of them is saved again; the rest on
   their file dates.
4. Unknown save results on POST #2, #5, #7: no duplicate rows, every session ends up saved once.
5. Pick mode: lesson 1-3 + sessions 1 and 3 of «2-1 الانتشار», dates typed in the lessons screen.
6. Tree with same-named decoy lessons in other units and one renamed lesson: nothing in a wrong lesson.
7. Trial with 2 sessions left: exactly 2 saved, then the pay screen.
8. Lesson names that end in «(1)»/«(2)» («الجمع (1)» with 3 sessions, «الجمع (2)» with 5): saved once each
   («الجمع (1) (2)» for session 2); re-opening the tool and running again adds nothing.
9. The same lesson name («مراجعة الوحدة») in two units: unit 1's copy is in Noor, unit 2's is still filled once;
   a re-run adds nothing.
10. Empty course, the response to the first save is lost (connection drop after the click): no duplicate after
    the automatic re-run, nor after a manual re-run.

Scenarios 8–10 use smaller packages derived from the real file (unit 1, or units 1–2 plus a review lesson).
A «re-run» reloads `semester.html` (which clears the local record, as every open does) and runs the term again.

## Matrix mode — every package × full term × pick × faults

```
node tests/noor-mock/matrix.mjs                       # all 241 packages (grades 1–12, both shifts), 4 workers
node tests/noor-mock/matrix.mjs --sample 20           # a deterministic random sample (--seed changes it)
node tests/noor-mock/matrix.mjs --only bi-9,ma-1-2    # package ids (or substrings of the file path)
node tests/noor-mock/matrix.mjs --jobs 2 --flows term --faults netcut,close   # only the packages whose rotated fault is one of these
node tests/noor-mock/matrix.mjs --only bi-9 --fault reject                   # force one fault on the selected packages
node tests/noor-mock/matrix.mjs --only ar-2-2,ar-5 --merge                   # re-run a few packages into the existing report
```

`matrix.mjs` lists `/mnt/project-files/afaq-platform/preps/` (override `PREPS=`), skips non-package files, and for each
`*.json` package (every file is one shift variant: `*-2-t1.json` = «فترتان») runs on its own browser context:

- a mock Noor built from the package's own unit/lesson names: most lesson names exactly as in the file (leading «1-1»
  numbers stripped like Noor), two lessons renamed slightly (hamza / taa marbuta / article / spacing / case), «(n)»-suffixed
  names and names repeated across units kept as they are, a decoy term 2 that reuses one term-1 lesson name, and three
  course cards (own, same subject other grade, other subject same grade). The sibling shift variant is in the catalog too.
- flow **term** («تحضير الفصل كاملًا»), then a reload and a second run that must add nothing;
- flow **pick** («أختار الدروس بنفسي»): 3 random lessons (1–3 random sessions each) with typed dates, then the same pick again;
- one fault per package, rotated over the file list so each fault hits ~34 packages: `none` · `holidays` (3 term days in
  the extension settings) · `busy` (an existing prep on 2 dates) · `reject` (Noor rejects 2 dates at save) · `netcut`
  (the connection drops right after the save click, posts #2 and #n/2) · `close` (the Noor tab, or the whole «حاضر» window,
  closed after ~30 % of the saves; the run must resume) · `yearend` (package dates shifted by whole weeks so the term ends
  8–14 January; pick dates typed around the new year).

Checks per flow (every saved row is traced to its file session by a `[[trace:id]]` tag the mock backend appends to
«المفاهيم»): content and lesson node of every row, right course card, no session twice, titles with «(n)», no Friday/Saturday,
every same-named lesson complete, schedule order (session k+1 strictly after k), dates inside the term, official date or the
next free school day when blocked (later sessions follow), nothing on a holiday/busy/rejected day, pick dates exactly as
typed, and the re-run adds nothing.

Speed: the temp copy gets `timescale.js` (semester.html, background.js, content.js, noorlist.js) and the mock pages get it
as an init script: `setTimeout`/`setInterval` delays ÷ `TIME_SCALE` (default 20; delays ≥ `TIME_FLOOR` ms, i.e. timeouts,
never drop below 4 s). In the mock Noor pages only, `Date.now()` also runs ×20 (the engine's real-time idle guard).
`extension/` is never modified. A browser killed from outside (another test's `pkill`) makes the package run again.

Ports: the mock backend takes a free port per worker (or `AFAQ_PORT`+worker); Noor is served through `context.route`
(no port). Env: `TIME_SCALE`, `TIME_FLOOR`, `REPORT=<path without extension>`, `EXT_DIR`, `VERBOSE=1` (UI transitions),
`TRACE_EXEC=1` (timing of every engine call), `SHOTS=<dir>`, `KEEP=1`, `HEADFUL=1`.

Output: `matrix-report.md` (checks table, per-fault and per-package tables, every failure with the extension log and the
Noor POSTs) and `matrix-report.json`; the console prints one line per package. Exit code 1 when any check fails.
A full run (241 packages, 482 flows) takes about an hour with 4 workers.
