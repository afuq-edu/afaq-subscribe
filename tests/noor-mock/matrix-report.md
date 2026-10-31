# Matrix report — «حاضر» × mock Noor

Finished 2026-10-31T05:11:26.053Z · extension v4.10.19 · 240/240 packages · 480 flows · 11999 checks · **0 failed checks** in 0 flows · 4 notes (soft checks) · 129 min with 3 workers, timers ×20

Command: `node tests/noor-mock/matrix.mjs --jobs 3` · packages from `/tmp/claude-0/-home-claude-afaq-subscribe/99b10432-2852-5c19-9dd9-822fd8f005c4/scratchpad/preps-split2` (240 found; 0 non-package files skipped)

## Checks

Checks named «note — …» are soft: they are listed but never fail a flow.

| flow · check | pass | fail | failing packages |
|---|---:|---:|---|
| term · note — file order: no session published before an earlier entry of the file | 236 | 4 | ar-1, ar-1-2, ar-2, ar-4-2 |
| term · holidays: the settings holidays are known to the tool | 27 | 0 |  |
| term · start: the teacher confirms one start summary before the first prep | 240 | 0 |  |
| term · start: the summary is calm and offers «أختار الدروس بنفسي» | 240 | 0 |  |
| term · every prep has «تعميم» and «خطة فصلية» checked | 240 | 0 |  |
| term · finished: the run ended | 240 | 0 |  |
| term · finished: wizard shows success | 240 | 0 |  |
| term · shift: the «فترة واحدة» package was taken | 120 | 0 |  |
| term · noor tree: sent to the admin panel with all 36 Noor lessons | 4 | 0 |  |
| term · noor tree: every Noor lesson has a prep from the file | 240 | 0 |  |
| term · trace: every saved row carries the content of a session of this package | 240 | 0 |  |
| term · content: «المفاهيم» in Noor = the session's own text | 240 | 0 |  |
| term · course: every save in the right course card | 240 | 0 |  |
| term · own lesson: every row saved into its own session's Noor lesson | 240 | 0 |  |
| term · no duplicate: no session saved twice | 240 | 0 |  |
| term · title: Noor lesson name + «» for session n | 240 | 0 |  |
| term · weekdays: no publish date on Friday/Saturday | 240 | 0 |  |
| term · complete: every session of the 34 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · order: within a lesson, session k+1 strictly after session k | 240 | 0 |  |
| term · order: within a unit, lesson k+1 never starts before lesson k | 240 | 0 |  |
| term · term: every date within the term | 214 | 0 |  |
| term · blocked days: nothing on a holidays day | 27 | 0 |  |
| term · end of term: sessions share a prep only when the plan would otherwise pass the term end , and exactly as many | 214 | 0 |  |
| term · end of plan: a shared prep holds sessions of one lesson only | 214 | 0 |  |
| term · dates: no session before its week | 75 | 0 |  |
| term · dates: official date, or the next free school day when blocked | 81 | 0 |  |
| term · re-run: a second run adds nothing | 240 | 0 |  |
| term · re-run: ended | 240 | 0 |  |
| pick · pick list: each unit appears once | 480 | 0 |  |
| pick · pick list: every lesson listed once | 480 | 0 |  |
| pick · pick list: a clear date box for every session of a chosen lesson | 480 | 0 |  |
| pick · pick list: no suggested date | 480 | 0 |  |
| pick · pick list: after the first typed date the other 4 chosen sessions get consecutive class days | 52 | 0 |  |
| pick · pick screen: exactly the 5 chosen sessions with the typed dates | 52 | 0 |  |
| pick · finished: the run ended | 240 | 0 |  |
| pick · finished: wizard shows success | 240 | 0 |  |
| pick · pick: no start summary | 240 | 0 |  |
| pick · trace: every saved row carries the content of a session of this package | 240 | 0 |  |
| pick · content: «المفاهيم» in Noor = the session's own text | 240 | 0 |  |
| pick · course: every save in the right course card | 240 | 0 |  |
| pick · own lesson: every row saved into its own session's Noor lesson | 240 | 0 |  |
| pick · no duplicate: no session saved twice | 240 | 0 |  |
| pick · title: Noor lesson name + «» for session n | 240 | 0 |  |
| pick · weekdays: no publish date on Friday/Saturday | 240 | 0 |  |
| pick · selection: exactly the chosen sessions were saved | 240 | 0 |  |
| pick · dates: every pick saved on exactly the typed date | 240 | 0 |  |
| pick · re-run: the same pick again adds nothing | 240 | 0 |  |
| pick · re-run: ended | 240 | 0 |  |
| term · shift: the «فترتان» package was taken | 120 | 0 |  |
| term · dates: every session on its official date | 159 | 0 |  |
| pick · pick list: after the first typed date the other 3 chosen sessions get consecutive class days | 59 | 0 |  |
| pick · pick screen: exactly the 4 chosen sessions with the typed dates | 59 | 0 |  |
| term · noor tree: sent to the admin panel with all 16 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 14 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · blocked days: nothing on a busy day | 27 | 0 |  |
| term · busy: the existing preps are untouched | 27 | 0 |  |
| pick · pick list: after the first typed date the other 6 chosen sessions get consecutive class days | 28 | 0 |  |
| pick · pick screen: exactly the 7 chosen sessions with the typed dates | 28 | 0 |  |
| term · noor tree: sent to the admin panel with all 20 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 18 lessons with the same name in Noor was saved | 6 | 0 |  |
| pick · pick list: after the first typed date the other 5 chosen sessions get consecutive class days | 47 | 0 |  |
| pick · pick screen: exactly the 6 chosen sessions with the typed dates | 47 | 0 |  |
| term · blocked days: nothing on a reject day | 27 | 0 |  |
| term · noor tree: sent to the admin panel with all 51 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 49 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · oneper: nothing after the term end unless no two sessions of one lesson from today on could still share a prep | 26 | 0 |  |
| term · oneper: no more late preps than the overflow bound | 26 | 0 |  |
| term · term: every date within the term unless the plan cannot fit the periods at all | 26 | 0 |  |
| term · oneper: every prep on a day with a period | 26 | 0 |  |
| term · one prep per period | 26 | 0 |  |
| term · noor tree: sent to the admin panel with all 19 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 17 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · periods: one prep per period | 26 | 0 |  |
| term · periods: each Sunday holds one prep per session its week has, up to two | 26 | 0 |  |
| pick · pick list: after the first typed date the other 7 chosen sessions get consecutive class days | 11 | 0 |  |
| pick · pick screen: exactly the 8 chosen sessions with the typed dates | 11 | 0 |  |
| term · dates: no session before its official date | 165 | 0 |  |
| term · noor tree: sent to the admin panel with all 33 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 31 lessons with the same name in Noor was saved | 4 | 0 |  |
| pick · pick list: after the first typed date the other 2 chosen sessions get consecutive class days | 40 | 0 |  |
| pick · pick screen: exactly the 3 chosen sessions with the typed dates | 40 | 0 |  |
| term · noor tree: sent to the admin panel with all 72 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 70 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 52 Noor lessons | 5 | 0 |  |
| term · complete: every session of the 50 lessons with the same name in Noor was saved | 5 | 0 |  |
| term · noor tree: sent to the admin panel with all 58 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 56 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 10 Noor lessons | 12 | 0 |  |
| term · complete: every session of the 8 lessons with the same name in Noor was saved | 12 | 0 |  |
| term · noor tree: sent to the admin panel with all 55 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 53 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 9 Noor lessons | 10 | 0 |  |
| term · complete: every session of the 7 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · noor tree: sent to the admin panel with all 26 Noor lessons | 5 | 0 |  |
| term · complete: every session of the 30 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 25 Noor lessons | 12 | 0 |  |
| term · complete: every session of the 28 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 27 Noor lessons | 5 | 0 |  |
| term · complete: every session of the 25 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 24 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 24 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · noor tree: sent to the admin panel with all 28 Noor lessons | 13 | 0 |  |
| term · complete: every session of the 27 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · noor tree: sent to the admin panel with all 17 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 15 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 14 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 12 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 15 Noor lessons | 11 | 0 |  |
| term · complete: every session of the 13 lessons with the same name in Noor was saved | 11 | 0 |  |
| term · noor tree: sent to the admin panel with all 12 Noor lessons | 9 | 0 |  |
| term · complete: every session of the 10 lessons with the same name in Noor was saved | 9 | 0 |  |
| term · noor tree: sent to the admin panel with all 11 Noor lessons | 7 | 0 |  |
| term · complete: every session of the 9 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · noor tree: sent to the admin panel with all 32 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 23 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · noor tree: sent to the admin panel with all 13 Noor lessons | 14 | 0 |  |
| term · complete: every session of the 11 lessons with the same name in Noor was saved | 14 | 0 |  |
| term · noor tree: sent to the admin panel with all 22 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 20 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 22 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 8 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 6 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · noor tree: sent to the admin panel with all 3 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 2 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · noor tree: sent to the admin panel with all 4 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 3 lessons with the same name in Noor was saved | 8 | 0 |  |
| pick · pick list: after the first typed date the other 8 chosen sessions get consecutive class days | 3 | 0 |  |
| pick · pick screen: exactly the 9 chosen sessions with the typed dates | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 47 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 45 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 7 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 5 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 26 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · noor tree: sent to the admin panel with all 29 Noor lessons | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 31 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 29 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 37 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 35 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 42 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 40 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 23 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 21 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 84 Noor lessons | 1 | 0 |  |
| term · complete: every session of the 82 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · noor tree: sent to the admin panel with all 6 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 4 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · noor tree: sent to the admin panel with all 43 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 41 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 35 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 33 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 44 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 42 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 41 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 39 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 5 Noor lessons | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 60 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 58 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 50 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 48 lessons with the same name in Noor was saved | 2 | 0 |  |

## By fault

| fault | packages | flows failed (term) | flows failed (pick) |
|---|---:|---:|---:|
| none | 27 | 0 | 0 |
| holidays | 27 | 0 | 0 |
| busy | 27 | 0 | 0 |
| reject | 27 | 0 | 0 |
| netcut | 27 | 0 | 0 |
| close | 27 | 0 | 0 |
| yearend | 26 | 0 | 0 |
| twoper | 26 | 0 | 0 |
| oneper | 26 | 0 | 0 |

## Packages

| package | file | shift | sessions | fault | term (pass/checks) | pick (pass/checks) | secs |
|---|---|---|---:|---|---|---|---:|
| ar-1-2 | g1-5/ar-1-2-t1.json | two | 176 | none | ✓ 25/25 (1 note) | ✓ 24/24 | 159 |
| ar-1 | g1-5/ar-1-t1.json | one | 193 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 158 |
| ar-2-2 | g1-5/ar-2-2-t1.json | two | 176 | busy | ✓ 27/27 | ✓ 24/24 | 162 |
| ar-2 | g1-5/ar-2-t1.json | one | 193 | reject | ✓ 26/26 (1 note) | ✓ 24/24 | 165 |
| ar-3-2 | g1-5/ar-3-2-t1.json | two | 162 | netcut | ✓ 25/25 | ✓ 24/24 | 153 |
| ar-3 | g1-5/ar-3-t1.json | one | 179 | close | ✓ 25/25 | ✓ 24/24 | 152 |
| ar-4-2 | g1-5/ar-4-2-t1.json | two | 162 | yearend | ✓ 25/25 (1 note) | ✓ 24/24 | 149 |
| ar-4 | g1-5/ar-4-t1.json | one | 162 | twoper | ✓ 27/27 | ✓ 24/24 | 163 |
| ar-5-2 | g1-5/ar-5-2-t1.json | two | 99 | oneper | ✓ 27/27 | ✓ 24/24 | 134 |
| ar-5 | g1-5/ar-5-t1.json | one | 99 | none | ✓ 25/25 | ✓ 24/24 | 128 |
| en-1-2 | g1-5/en-1-2-t1.json | two | 111 | holidays | ✓ 27/27 | ✓ 24/24 | 128 |
| en-1 | g1-5/en-1-t1.json | one | 111 | busy | ✓ 27/27 | ✓ 24/24 | 128 |
| en-2-2 | g1-5/en-2-2-t1.json | two | 111 | reject | ✓ 26/26 | ✓ 24/24 | 124 |
| en-2 | g1-5/en-2-t1.json | one | 111 | netcut | ✓ 25/25 | ✓ 24/24 | 124 |
| en-3-2 | g1-5/en-3-2-t1.json | two | 97 | close | ✓ 25/25 | ✓ 24/24 | 148 |
| en-3 | g1-5/en-3-t1.json | one | 111 | yearend | ✓ 25/25 | ✓ 24/24 | 123 |
| en-4-2 | g1-5/en-4-2-t1.json | two | 98 | twoper | ✓ 27/27 | ✓ 24/24 | 120 |
| en-4 | g1-5/en-4-t1.json | one | 111 | oneper | ✓ 27/27 | ✓ 24/24 | 130 |
| en-5-2 | g1-5/en-5-2-t1.json | two | 85 | none | ✓ 25/25 | ✓ 24/24 | 115 |
| en-5 | g1-5/en-5-t1.json | one | 85 | holidays | ✓ 27/27 | ✓ 24/24 | 116 |
| ic-1-2 | g1-5/ic-1-2-t1.json | two | 17 | busy | ✓ 27/27 | ✓ 24/24 | 60 |
| ic-1 | g1-5/ic-1-t1.json | one | 17 | reject | ✓ 26/26 | ✓ 24/24 | 59 |
| ic-2-2 | g1-5/ic-2-2-t1.json | two | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 60 |
| ic-2 | g1-5/ic-2-t1.json | one | 17 | close | ✓ 25/25 | ✓ 24/24 | 64 |
| ic-3-2 | g1-5/ic-3-2-t1.json | two | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 57 |
| ic-3 | g1-5/ic-3-t1.json | one | 17 | twoper | ✓ 27/27 | ✓ 24/24 | 54 |
| ic-4-2 | g1-5/ic-4-2-t1.json | two | 17 | oneper | ✓ 27/27 | ✓ 24/24 | 53 |
| ic-4 | g1-5/ic-4-t1.json | one | 17 | none | ✓ 25/25 | ✓ 24/24 | 59 |
| is-1-2 | g1-5/is-1-2-t1.json | two | 51 | holidays | ✓ 27/27 | ✓ 24/24 | 86 |
| is-1 | g1-5/is-1-t1.json | one | 85 | busy | ✓ 27/27 | ✓ 24/24 | 112 |
| is-2-2 | g1-5/is-2-2-t1.json | two | 51 | reject | ✓ 26/26 | ✓ 24/24 | 86 |
| is-2 | g1-5/is-2-t1.json | one | 85 | netcut | ✓ 25/25 | ✓ 24/24 | 114 |
| is-3-2 | g1-5/is-3-2-t1.json | two | 85 | close | ✓ 25/25 | ✓ 24/24 | 114 |
| is-3 | g1-5/is-3-t1.json | one | 85 | yearend | ✓ 25/25 | ✓ 24/24 | 113 |
| is-4-2 | g1-5/is-4-2-t1.json | two | 85 | twoper | ✓ 27/27 | ✓ 24/24 | 108 |
| is-4 | g1-5/is-4-t1.json | one | 85 | oneper | ✓ 27/27 | ✓ 24/24 | 105 |
| is-5-2 | g1-5/is-5-2-t1.json | two | 60 | none | ✓ 25/25 | ✓ 24/24 | 90 |
| is-5 | g1-5/is-5-t1.json | one | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 100 |
| it-1-2 | g1-5/it-1-2-t1.json | two | 17 | busy | ✓ 27/27 | ✓ 24/24 | 57 |
| it-1 | g1-5/it-1-t1.json | one | 17 | reject | ✓ 26/26 | ✓ 24/24 | 59 |
| it-2-2 | g1-5/it-2-2-t1.json | two | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 56 |
| it-2 | g1-5/it-2-t1.json | one | 17 | close | ✓ 25/25 | ✓ 24/24 | 91 |
| it-3-2 | g1-5/it-3-2-t1.json | two | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 56 |
| it-3 | g1-5/it-3-t1.json | one | 34 | twoper | ✓ 27/27 | ✓ 24/24 | 68 |
| it-4-2 | g1-5/it-4-2-t1.json | two | 17 | oneper | ✓ 27/27 | ✓ 24/24 | 53 |
| it-4 | g1-5/it-4-t1.json | one | 34 | none | ✓ 25/25 | ✓ 24/24 | 71 |
| it-5-2 | g1-5/it-5-2-t1.json | two | 31 | holidays | ✓ 27/27 | ✓ 24/24 | 69 |
| it-5 | g1-5/it-5-t1.json | one | 31 | busy | ✓ 27/27 | ✓ 24/24 | 69 |
| ma-1-2 | g1-5/ma-1-2-t1.json | two | 102 | reject | ✓ 26/26 | ✓ 24/24 | 121 |
| ma-1 | g1-5/ma-1-t1.json | one | 119 | netcut | ✓ 25/25 | ✓ 24/24 | 124 |
| ma-2-2 | g1-5/ma-2-2-t1.json | two | 102 | close | ✓ 25/25 | ✓ 24/24 | 161 |
| ma-2 | g1-5/ma-2-t1.json | one | 119 | yearend | ✓ 25/25 | ✓ 24/24 | 121 |
| ma-3-2 | g1-5/ma-3-2-t1.json | two | 85 | twoper | ✓ 27/27 | ✓ 24/24 | 107 |
| ma-3 | g1-5/ma-3-t1.json | one | 102 | oneper | ✓ 27/27 | ✓ 24/24 | 124 |
| ma-4-2 | g1-5/ma-4-2-t1.json | two | 85 | none | ✓ 25/25 | ✓ 24/24 | 110 |
| ma-4 | g1-5/ma-4-t1.json | one | 102 | holidays | ✓ 27/27 | ✓ 24/24 | 122 |
| ma-5-2 | g1-5/ma-5-2-t1.json | two | 90 | busy | ✓ 27/27 | ✓ 24/24 | 112 |
| ma-5 | g1-5/ma-5-t1.json | one | 105 | reject | ✓ 26/26 | ✓ 24/24 | 118 |
| pe-1-2 | g1-5/pe-1-2-t1.json | two | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 58 |
| pe-1 | g1-5/pe-1-t1.json | one | 34 | close | ✓ 25/25 | ✓ 24/24 | 69 |
| pe-2-2 | g1-5/pe-2-2-t1.json | two | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 58 |
| pe-2 | g1-5/pe-2-t1.json | one | 34 | twoper | ✓ 27/27 | ✓ 24/24 | 65 |
| pe-3-2 | g1-5/pe-3-2-t1.json | two | 17 | oneper | ✓ 27/27 | ✓ 24/24 | 52 |
| pe-3 | g1-5/pe-3-t1.json | one | 34 | none | ✓ 25/25 | ✓ 24/24 | 68 |
| pe-4-2 | g1-5/pe-4-2-t1.json | two | 17 | holidays | ✓ 27/27 | ✓ 24/24 | 56 |
| pe-4 | g1-5/pe-4-t1.json | one | 34 | busy | ✓ 27/27 | ✓ 24/24 | 68 |
| pe-5-2 | g1-5/pe-5-2-t1.json | two | 15 | reject | ✓ 26/26 | ✓ 24/24 | 55 |
| pe-5 | g1-5/pe-5-t1.json | one | 30 | netcut | ✓ 25/25 | ✓ 24/24 | 68 |
| sc-1-2 | g1-5/sc-1-2-t1.json | two | 51 | close | ✓ 25/25 | ✓ 24/24 | 83 |
| sc-1 | g1-5/sc-1-t1.json | one | 51 | yearend | ✓ 25/25 | ✓ 24/24 | 83 |
| sc-2-2 | g1-5/sc-2-2-t1.json | two | 51 | twoper | ✓ 27/27 | ✓ 24/24 | 78 |
| sc-2 | g1-5/sc-2-t1.json | one | 51 | oneper | ✓ 27/27 | ✓ 24/24 | 72 |
| sc-3-2 | g1-5/sc-3-2-t1.json | two | 68 | none | ✓ 25/25 | ✓ 24/24 | 97 |
| sc-3 | g1-5/sc-3-t1.json | one | 68 | holidays | ✓ 27/27 | ✓ 24/24 | 100 |
| sc-4-2 | g1-5/sc-4-2-t1.json | two | 68 | busy | ✓ 27/27 | ✓ 24/24 | 99 |
| sc-4 | g1-5/sc-4-t1.json | one | 85 | reject | ✓ 26/26 | ✓ 24/24 | 112 |
| sc-5-2 | g1-5/sc-5-2-t1.json | two | 61 | netcut | ✓ 25/25 | ✓ 24/24 | 89 |
| sc-5 | g1-5/sc-5-t1.json | one | 76 | close | ✓ 25/25 | ✓ 24/24 | 133 |
| ss-5-2 | g1-5/ss-5-2-t1.json | two | 45 | yearend | ✓ 25/25 | ✓ 24/24 | 82 |
| ss-5 | g1-5/ss-5-t1.json | one | 60 | twoper | ✓ 27/27 | ✓ 24/24 | 91 |
| va-1-2 | g1-5/va-1-2-t1.json | two | 17 | oneper | ✓ 27/27 | ✓ 24/24 | 57 |
| va-1 | g1-5/va-1-t1.json | one | 17 | none | ✓ 25/25 | ✓ 24/24 | 61 |
| va-2-2 | g1-5/va-2-2-t1.json | two | 17 | holidays | ✓ 27/27 | ✓ 24/24 | 61 |
| va-2 | g1-5/va-2-t1.json | one | 17 | busy | ✓ 27/27 | ✓ 24/24 | 61 |
| va-3-2 | g1-5/va-3-2-t1.json | two | 17 | reject | ✓ 26/26 | ✓ 24/24 | 62 |
| va-3 | g1-5/va-3-t1.json | one | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 61 |
| va-4-2 | g1-5/va-4-2-t1.json | two | 17 | close | ✓ 25/25 | ✓ 24/24 | 61 |
| va-4 | g1-5/va-4-t1.json | one | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 60 |
| va-5-2 | g1-5/va-5-2-t1.json | two | 15 | twoper | ✓ 27/27 | ✓ 24/24 | 54 |
| va-5 | g1-5/va-5-t1.json | one | 15 | oneper | ✓ 27/27 | ✓ 24/24 | 55 |
| ar-11-2 | g11/ar-11-2-t1.json | two | 72 | none | ✓ 25/25 | ✓ 24/24 | 104 |
| ar-11 | g11/ar-11-t1.json | one | 85 | holidays | ✓ 27/27 | ✓ 24/24 | 116 |
| bi-11-2 | g11/bi-11-2-t1.json | two | 75 | busy | ✓ 27/27 | ✓ 24/24 | 105 |
| bi-11 | g11/bi-11-t1.json | one | 75 | reject | ✓ 26/26 | ✓ 24/24 | 105 |
| ch-11-2 | g11/ch-11-2-t1.json | two | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 101 |
| ch-11 | g11/ch-11-t1.json | one | 75 | close | ✓ 25/25 | ✓ 24/24 | 132 |
| en-11-2 | g11/en-11-2-t1.json | two | 58 | yearend | ✓ 25/25 | ✓ 24/24 | 129 |
| en-11 | g11/en-11-t1.json | one | 85 | twoper | ✓ 27/27 | ✓ 24/24 | 163 |
| es-11-2 | g11/es-11-2-t1.json | two | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 108 |
| es-11 | g11/es-11-t1.json | one | 75 | none | ✓ 25/25 | ✓ 24/24 | 105 |
| fa-11-2 | g11/fa-11-2-t1.json | two | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 105 |
| fa-11 | g11/fa-11-t1.json | one | 75 | busy | ✓ 27/27 | ✓ 24/24 | 104 |
| hc-11-2 | g11/hc-11-2-t1.json | two | 75 | reject | ✓ 26/26 | ✓ 24/24 | 105 |
| hc-11 | g11/hc-11-t1.json | one | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 107 |
| is-11-2 | g11/is-11-2-t1.json | two | 45 | close | ✓ 25/25 | ✓ 24/24 | 109 |
| is-11 | g11/is-11-t1.json | one | 60 | yearend | ✓ 25/25 | ✓ 24/24 | 89 |
| it-11-2 | g11/it-11-2-t1.json | two | 75 | twoper | ✓ 27/27 | ✓ 24/24 | 103 |
| it-11 | g11/it-11-t1.json | one | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 103 |
| ma-11-2 | g11/ma-11-2-t1.json | two | 75 | none | ✓ 25/25 | ✓ 24/24 | 157 |
| ma-11 | g11/ma-11-t1.json | one | 90 | holidays | ✓ 27/27 | ✓ 24/24 | 184 |
| mb-11-2 | g11/mb-11-2-t1.json | two | 75 | busy | ✓ 27/27 | ✓ 24/24 | 161 |
| mb-11 | g11/mb-11-t1.json | one | 90 | reject | ✓ 26/26 | ✓ 24/24 | 186 |
| ph-11-2 | g11/ph-11-2-t1.json | two | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 106 |
| ph-11 | g11/ph-11-t1.json | one | 75 | close | ✓ 25/25 | ✓ 24/24 | 107 |
| sp-11-2 | g11/sp-11-2-t1.json | two | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 104 |
| sp-11 | g11/sp-11-t1.json | one | 75 | twoper | ✓ 27/27 | ✓ 24/24 | 102 |
| wt-11-2 | g11/wt-11-2-t1.json | two | 30 | oneper | ✓ 27/27 | ✓ 24/24 | 61 |
| wt-11 | g11/wt-11-t1.json | one | 30 | none | ✓ 25/25 | ✓ 24/24 | 68 |
| ar-12-2 | g12/ar-12-2-t1.json | two | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 108 |
| ar-12 | g12/ar-12-t1.json | one | 88 | busy | ✓ 27/27 | ✓ 24/24 | 117 |
| bi-12-2 | g12/bi-12-2-t1.json | two | 75 | reject | ✓ 26/26 | ✓ 24/24 | 106 |
| bi-12 | g12/bi-12-t1.json | one | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 102 |
| ch-12-2 | g12/ch-12-2-t1.json | two | 75 | close | ✓ 25/25 | ✓ 24/24 | 135 |
| ch-12 | g12/ch-12-t1.json | one | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 106 |
| en-12-2 | g12/en-12-2-t1.json | two | 58 | twoper | ✓ 27/27 | ✓ 24/24 | 87 |
| en-12 | g12/en-12-t1.json | one | 85 | oneper | ✓ 27/27 | ✓ 24/24 | 116 |
| fa-12-2 | g12/fa-12-2-t1.json | two | 75 | none | ✓ 25/25 | ✓ 24/24 | 110 |
| fa-12 | g12/fa-12-t1.json | one | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 107 |
| is-12-2 | g12/is-12-2-t1.json | two | 45 | busy | ✓ 27/27 | ✓ 24/24 | 77 |
| is-12 | g12/is-12-t1.json | one | 60 | reject | ✓ 26/26 | ✓ 24/24 | 91 |
| it-12-2 | g12/it-12-2-t1.json | two | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 106 |
| it-12 | g12/it-12-t1.json | one | 75 | close | ✓ 25/25 | ✓ 24/24 | 109 |
| ma-12-2 | g12/ma-12-2-t1.json | two | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 106 |
| ma-12 | g12/ma-12-t1.json | one | 90 | twoper | ✓ 27/27 | ✓ 24/24 | 110 |
| mt-12-2 | g12/mt-12-2-t1.json | two | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 97 |
| mt-12 | g12/mt-12-t1.json | one | 90 | none | ✓ 25/25 | ✓ 24/24 | 114 |
| ph-12-2 | g12/ph-12-2-t1.json | two | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 99 |
| ph-12 | g12/ph-12-t1.json | one | 75 | busy | ✓ 27/27 | ✓ 24/24 | 100 |
| sp-12-2 | g12/sp-12-2-t1.json | two | 75 | reject | ✓ 26/26 | ✓ 24/24 | 102 |
| sp-12 | g12/sp-12-t1.json | one | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 102 |
| wt-12-2 | g12/wt-12-2-t1.json | two | 30 | close | ✓ 25/25 | ✓ 24/24 | 98 |
| wt-12 | g12/wt-12-t1.json | one | 30 | yearend | ✓ 25/25 | ✓ 24/24 | 68 |
| ar-10-2 | g6-10/ar-10-2-t1.json | two | 85 | twoper | ✓ 27/27 | ✓ 24/24 | 106 |
| ar-10 | g6-10/ar-10-t1.json | one | 99 | oneper | ✓ 27/27 | ✓ 24/24 | 126 |
| ar-6-2 | g6-10/ar-6-2-t1.json | two | 99 | none | ✓ 25/25 | ✓ 24/24 | 125 |
| ar-6 | g6-10/ar-6-t1.json | one | 99 | holidays | ✓ 27/27 | ✓ 24/24 | 125 |
| ar-7-2 | g6-10/ar-7-2-t1.json | two | 85 | busy | ✓ 27/27 | ✓ 24/24 | 114 |
| ar-7 | g6-10/ar-7-t1.json | one | 85 | reject | ✓ 26/26 | ✓ 24/24 | 114 |
| ar-8-2 | g6-10/ar-8-2-t1.json | two | 85 | netcut | ✓ 25/25 | ✓ 24/24 | 110 |
| ar-8 | g6-10/ar-8-t1.json | one | 85 | close | ✓ 25/25 | ✓ 24/24 | 148 |
| ar-9-2 | g6-10/ar-9-2-t1.json | two | 85 | yearend | ✓ 25/25 | ✓ 24/24 | 108 |
| ar-9 | g6-10/ar-9-t1.json | one | 99 | twoper | ✓ 27/27 | ✓ 24/24 | 120 |
| bi-10-2 | g6-10/bi-10-2-t1.json | two | 30 | oneper | ✓ 27/27 | ✓ 24/24 | 57 |
| bi-10 | g6-10/bi-10-t1.json | one | 45 | none | ✓ 25/25 | ✓ 24/24 | 79 |
| bi-9-2 | g6-10/bi-9-2-t1.json | two | 30 | holidays | ✓ 27/27 | ✓ 24/24 | 69 |
| bi-9 | g6-10/bi-9-t1.json | one | 45 | busy | ✓ 27/27 | ✓ 24/24 | 77 |
| ch-10-2 | g6-10/ch-10-2-t1.json | two | 30 | reject | ✓ 26/26 | ✓ 24/24 | 68 |
| ch-10 | g6-10/ch-10-t1.json | one | 45 | netcut | ✓ 25/25 | ✓ 24/24 | 77 |
| ch-9-2 | g6-10/ch-9-2-t1.json | two | 30 | close | ✓ 25/25 | ✓ 24/24 | 100 |
| ch-9 | g6-10/ch-9-t1.json | one | 45 | yearend | ✓ 25/25 | ✓ 24/24 | 81 |
| en-10-2 | g6-10/en-10-2-t1.json | two | 72 | twoper | ✓ 27/27 | ✓ 24/24 | 95 |
| en-10 | g6-10/en-10-t1.json | one | 72 | oneper | ✓ 27/27 | ✓ 24/24 | 99 |
| en-6-2 | g6-10/en-6-2-t1.json | two | 85 | none | ✓ 25/25 | ✓ 24/24 | 113 |
| en-6 | g6-10/en-6-t1.json | one | 85 | holidays | ✓ 27/27 | ✓ 24/24 | 112 |
| en-7-2 | g6-10/en-7-2-t1.json | two | 85 | busy | ✓ 27/27 | ✓ 24/24 | 173 |
| en-7 | g6-10/en-7-t1.json | one | 85 | reject | ✓ 26/26 | ✓ 24/24 | 174 |
| en-8-2 | g6-10/en-8-2-t1.json | two | 85 | netcut | ✓ 25/25 | ✓ 24/24 | 117 |
| en-8 | g6-10/en-8-t1.json | one | 85 | close | ✓ 25/25 | ✓ 24/24 | 144 |
| en-9-2 | g6-10/en-9-2-t1.json | two | 72 | yearend | ✓ 25/25 | ✓ 24/24 | 94 |
| en-9 | g6-10/en-9-t1.json | one | 72 | twoper | ✓ 27/27 | ✓ 24/24 | 93 |
| fa-10-2 | g6-10/fa-10-2-t1.json | two | 15 | oneper | ✓ 27/27 | ✓ 24/24 | 56 |
| fa-10 | g6-10/fa-10-t1.json | one | 15 | none | ✓ 25/25 | ✓ 24/24 | 58 |
| fa-9-2 | g6-10/fa-9-2-t1.json | two | 15 | holidays | ✓ 27/27 | ✓ 24/24 | 56 |
| fa-9 | g6-10/fa-9-t1.json | one | 15 | busy | ✓ 27/27 | ✓ 24/24 | 57 |
| is-10-2 | g6-10/is-10-2-t1.json | two | 60 | reject | ✓ 26/26 | ✓ 24/24 | 89 |
| is-10 | g6-10/is-10-t1.json | one | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 101 |
| is-6-2 | g6-10/is-6-2-t1.json | two | 60 | close | ✓ 25/25 | ✓ 24/24 | 121 |
| is-6 | g6-10/is-6-t1.json | one | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 102 |
| is-7-2 | g6-10/is-7-2-t1.json | two | 45 | twoper | ✓ 27/27 | ✓ 24/24 | 73 |
| is-7 | g6-10/is-7-t1.json | one | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 97 |
| is-8-2 | g6-10/is-8-2-t1.json | two | 45 | none | ✓ 25/25 | ✓ 24/24 | 81 |
| is-8 | g6-10/is-8-t1.json | one | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 101 |
| is-9-2 | g6-10/is-9-2-t1.json | two | 60 | busy | ✓ 27/27 | ✓ 24/24 | 89 |
| is-9 | g6-10/is-9-t1.json | one | 75 | reject | ✓ 26/26 | ✓ 24/24 | 100 |
| it-10-2 | g6-10/it-10-2-t1.json | two | 22 | netcut | ✓ 25/25 | ✓ 24/24 | 63 |
| it-10 | g6-10/it-10-t1.json | one | 22 | close | ✓ 25/25 | ✓ 24/24 | 65 |
| it-6-2 | g6-10/it-6-2-t1.json | two | 30 | yearend | ✓ 25/25 | ✓ 24/24 | 66 |
| it-6 | g6-10/it-6-t1.json | one | 30 | twoper | ✓ 27/27 | ✓ 24/24 | 62 |
| it-7-2 | g6-10/it-7-2-t1.json | two | 30 | oneper | ✓ 27/27 | ✓ 24/24 | 56 |
| it-7 | g6-10/it-7-t1.json | one | 30 | none | ✓ 25/25 | ✓ 24/24 | 65 |
| it-8-2 | g6-10/it-8-2-t1.json | two | 30 | holidays | ✓ 27/27 | ✓ 24/24 | 67 |
| it-8 | g6-10/it-8-t1.json | one | 30 | busy | ✓ 27/27 | ✓ 24/24 | 67 |
| it-9-2 | g6-10/it-9-2-t1.json | two | 30 | reject | ✓ 26/26 | ✓ 24/24 | 68 |
| it-9 | g6-10/it-9-t1.json | one | 30 | netcut | ✓ 25/25 | ✓ 24/24 | 68 |
| ma-10-2 | g6-10/ma-10-2-t1.json | two | 90 | close | ✓ 25/25 | ✓ 24/24 | 120 |
| ma-10 | g6-10/ma-10-t1.json | one | 90 | yearend | ✓ 25/25 | ✓ 24/24 | 115 |
| ma-6-2 | g6-10/ma-6-2-t1.json | two | 90 | twoper | ✓ 27/27 | ✓ 24/24 | 118 |
| ma-6 | g6-10/ma-6-t1.json | one | 105 | oneper | ✓ 27/27 | ✓ 24/24 | 131 |
| ma-7-2 | g6-10/ma-7-2-t1.json | two | 90 | none | ✓ 25/25 | ✓ 24/24 | 121 |
| ma-7 | g6-10/ma-7-t1.json | one | 105 | holidays | ✓ 27/27 | ✓ 24/24 | 125 |
| ma-8-2 | g6-10/ma-8-2-t1.json | two | 90 | busy | ✓ 27/27 | ✓ 24/24 | 180 |
| ma-8 | g6-10/ma-8-t1.json | one | 105 | reject | ✓ 26/26 | ✓ 24/24 | 190 |
| ma-9-2 | g6-10/ma-9-2-t1.json | two | 90 | netcut | ✓ 25/25 | ✓ 24/24 | 119 |
| ma-9 | g6-10/ma-9-t1.json | one | 90 | close | ✓ 25/25 | ✓ 24/24 | 142 |
| pe-6-2 | g6-10/pe-6-2-t1.json | two | 15 | yearend | ✓ 25/25 | ✓ 24/24 | 55 |
| pe-6 | g6-10/pe-6-t1.json | one | 30 | twoper | ✓ 27/27 | ✓ 24/24 | 64 |
| pe-7-2 | g6-10/pe-7-2-t1.json | two | 15 | oneper | ✓ 27/27 | ✓ 24/24 | 53 |
| pe-7 | g6-10/pe-7-t1.json | one | 30 | none | ✓ 25/25 | ✓ 24/24 | 67 |
| pe-8-2 | g6-10/pe-8-2-t1.json | two | 15 | holidays | ✓ 27/27 | ✓ 24/24 | 57 |
| pe-8 | g6-10/pe-8-t1.json | one | 30 | busy | ✓ 27/27 | ✓ 24/24 | 66 |
| ph-10-2 | g6-10/ph-10-2-t1.json | two | 30 | reject | ✓ 26/26 | ✓ 24/24 | 68 |
| ph-10 | g6-10/ph-10-t1.json | one | 45 | netcut | ✓ 25/25 | ✓ 24/24 | 77 |
| ph-9-2 | g6-10/ph-9-2-t1.json | two | 30 | close | ✓ 25/25 | ✓ 24/24 | 68 |
| ph-9 | g6-10/ph-9-t1.json | one | 45 | yearend | ✓ 25/25 | ✓ 24/24 | 77 |
| sc-6-2 | g6-10/sc-6-2-t1.json | two | 60 | twoper | ✓ 27/27 | ✓ 24/24 | 87 |
| sc-6 | g6-10/sc-6-t1.json | one | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 98 |
| sc-7-2 | g6-10/sc-7-2-t1.json | two | 91 | none | ✓ 25/25 | ✓ 24/24 | 115 |
| sc-7 | g6-10/sc-7-t1.json | one | 91 | holidays | ✓ 27/27 | ✓ 24/24 | 116 |
| sc-8-2 | g6-10/sc-8-2-t1.json | two | 90 | busy | ✓ 27/27 | ✓ 24/24 | 117 |
| sc-8 | g6-10/sc-8-t1.json | one | 90 | reject | ✓ 26/26 | ✓ 24/24 | 111 |
| sp-10-2 | g6-10/sp-10-2-t1.json | two | 15 | netcut | ✓ 25/25 | ✓ 24/24 | 56 |
| sp-10 | g6-10/sp-10-t1.json | one | 15 | close | ✓ 25/25 | ✓ 24/24 | 57 |
| sp-9-2 | g6-10/sp-9-2-t1.json | two | 15 | yearend | ✓ 25/25 | ✓ 24/24 | 55 |
| sp-9 | g6-10/sp-9-t1.json | one | 15 | twoper | ✓ 27/27 | ✓ 24/24 | 50 |
| ss-10-2 | g6-10/ss-10-2-t1.json | two | 32 | oneper | ✓ 27/27 | ✓ 24/24 | 63 |
| ss-10 | g6-10/ss-10-t1.json | one | 32 | none | ✓ 25/25 | ✓ 24/24 | 71 |
| ss-6-2 | g6-10/ss-6-2-t1.json | two | 45 | holidays | ✓ 27/27 | ✓ 24/24 | 82 |
| ss-6 | g6-10/ss-6-t1.json | one | 60 | busy | ✓ 27/27 | ✓ 24/24 | 94 |
| ss-7-2 | g6-10/ss-7-2-t1.json | two | 45 | reject | ✓ 26/26 | ✓ 24/24 | 84 |
| ss-7 | g6-10/ss-7-t1.json | one | 60 | netcut | ✓ 25/25 | ✓ 24/24 | 92 |
| ss-8-2 | g6-10/ss-8-2-t1.json | two | 45 | close | ✓ 25/25 | ✓ 24/24 | 113 |
| ss-8 | g6-10/ss-8-t1.json | one | 60 | yearend | ✓ 25/25 | ✓ 24/24 | 93 |
| ss-9-2 | g6-10/ss-9-2-t1.json | two | 30 | twoper | ✓ 27/27 | ✓ 24/24 | 68 |
| ss-9 | g6-10/ss-9-t1.json | one | 30 | oneper | ✓ 27/27 | ✓ 24/24 | 60 |
| va-6-2 | g6-10/va-6-2-t1.json | two | 15 | none | ✓ 25/25 | ✓ 24/24 | 60 |
| va-6 | g6-10/va-6-t1.json | one | 15 | holidays | ✓ 27/27 | ✓ 24/24 | 60 |
| va-7-2 | g6-10/va-7-2-t1.json | two | 15 | busy | ✓ 27/27 | ✓ 24/24 | 59 |
| va-7 | g6-10/va-7-t1.json | one | 15 | reject | ✓ 26/26 | ✓ 24/24 | 61 |
| va-8-2 | g6-10/va-8-2-t1.json | two | 15 | netcut | ✓ 25/25 | ✓ 24/24 | 59 |
| va-8 | g6-10/va-8-t1.json | one | 15 | close | ✓ 25/25 | ✓ 24/24 | 91 |

## Failures

None.

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
