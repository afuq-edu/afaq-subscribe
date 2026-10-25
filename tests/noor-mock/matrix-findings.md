## Findings history (hand-written, appended to the generated report)

The first full run on 4.10.3 (2026-10-20, 110 packages) found five extension bugs and one cosmetic issue; all are fixed in
4.10.4 and covered by the checks above. Kept here so a regression is recognised at once.

- **B1 — a date Noor rejects at save time pushed the rest of the term by weeks.** `shiftDate()` treated every other
  file-dated session as a fixed anchor, so the moved session jumped to the first free gap (often after the term end) and
  everything behind it followed. Now only dates fixed by the teacher or by an earlier move are anchors: the moved session
  takes the next class day and the following ones shift by one day until a gap absorbs the move (same as a holiday).
- **B2 — a lesson name repeated in several units: an existing prep was credited to the first same-named lesson, so the real
  one was saved again on a re-run.** `haveMap()` dealt the list rows out in tree order. It now uses the «(n)» suffix and the
  row's publish date (matched against the date «حاضر» saved that session on, then the file date) to find the right unit.
- **B3 — a Noor lesson name with a doubled space lost its «(n)» session suffix** (`applyTitleSuffix()` compared the raw form
  title with the whitespace-collapsed tree text). Compared after collapsing whitespace.
- **B4 — a lesson whose whole name is a stop word («بين») was never linked** (keyword similarity scored two identical names 0).
  Identical names after normalisation now score 1.
- **B5 — units that differ only by an ordinal («التعبير – الدرس الأول» / «… الثاني») never matched by name**, so half of
  grade-11 Arabic was skipped as «order-only links with mismatching units». Identical unit names are matched first, and a
  tie between similar names is broken by the ordinal words / digits.
- **B6 — a lesson that teaches HTML lost the tag names it mentions (grade-10 IT: «2. <img>: وسم إدراج الصور» was typed as
  «2. : وسم إدراج الصور»).** The text written into a plain Noor field was the copy sanitised for the rich editor (every
  `<img>`/`<input>`… removed), and the file text (`raw`) was built but never handed to `writeValue()`. A plain field now
  receives the file text with only real formatting markup flattened; the rich-editor copy stays sanitised. The content check
  compares «المفاهيم» in Noor with the same flattening of the file text.
- **B7 — (found by review, not by the matrix) with B6's targeted flattening only six entities were decoded**, so a converted
  file's `&deg;`, `&times;`, `&hellip;` or numeric `&#1575;` would have been typed into a plain field as literal entity text
  (the old DOM-based flattening decoded everything). All named and numeric entities are decoded again (DOMParser on the
  «<»-escaped text, so tag names stay literal); the harness mirrors it with jsdom.
- **N1 (cosmetic) — after the window was closed mid-run and the run resumed, the closing line counted only the sessions
  saved after the resume.** The resume now counts what this opening already saved.
- Date model: the extension lays the sessions out in the order of the official schedule (the file order, chronological),
  not lesson by lesson in tree order, so packages that interleave the sessions of different lessons (Quran units, poems)
  keep the schedule after a holiday/busy/rejected day. The expected-date check follows the same rule.

## 2026-10-25 — 4.10.10 (fewer periods than the plan, «خطة فصلية»)

- Full matrix 241 packages × term + pick with rotated faults: 10172 checks; oneper over all 241 (`--fault oneper --flows term`):
  5543 checks, 239 pass; physics 9 and 10 end beyond the term by design (every lesson is one session, nothing can share a
  prep) and the term-bounds check tolerates that only when nothing is mergeable and the late count is within the bound.
- **H1 (harness) — end-of-plan merges under holidays/busy/reject.** When a blocked day pushes the last sessions past the
  plan's last week, the extension joins the latest same-lesson pair into one prep «X (4 و 5)» so the plan still ends on
  time; the harness expanded such preps only for `oneper`, so 12 term flows failed on content/title/complete/order. Now every
  fault expands merged preps, a joined session is expected on its root's date (also in the within-lesson order check), and two
  checks make sure sessions share a prep only when needed and exactly as many as the overrun, each pair from one lesson.
  Re-run of the 12 packages: 275 checks, 0 failed. No extension change.
- Format check (tests/rich-format.mjs): 240 packages, 90335 fields, 12927 anchors, 0 bad. Release gate 14/14 on both zips.
