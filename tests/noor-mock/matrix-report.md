# Matrix report — «حاضر» × mock Noor

In progress 2026-11-01T10:50:34.646Z · extension v4.10.23 · 152/245 packages · 304 flows · 7599 checks · **0 failed checks** in 0 flows · 41 notes (soft checks) · 92 min with 3 workers, timers ×20

Command: `node tests/noor-mock/matrix.mjs --jobs 3` · packages from `/mnt/project-files/afaq-platform/preps` (245 found; 75 non-package files skipped)

## Checks

Checks named «note — …» are soft: they are listed but never fail a flow.

| flow · check | pass | fail | failing packages |
|---|---:|---:|---|
| term · note — file order: no session published before an earlier entry of the file | 111 | 41 | ar-1-2, ar-1, ar-2-2, ar-2, ar-3-2, ar-3, ar-4-2, ar-4, ar-5-2, ar-5, en-2-2, en-2 … (+29) |
| term · start: the teacher confirms the two start alerts before the first prep | 152 | 0 |  |
| term · start: the alerts are calm and offer «أختار الدروس بنفسي» | 152 | 0 |  |
| term · every prep has «تعميم» and «خطة فصلية» checked | 152 | 0 |  |
| term · finished: the run ended | 152 | 0 |  |
| term · finished: wizard shows success | 152 | 0 |  |
| term · shift: the «فترة واحدة» package was taken | 76 | 0 |  |
| term · noor tree: sent to the admin panel with all 19 Noor lessons | 3 | 0 |  |
| term · noor tree: every Noor lesson has a prep from the file | 152 | 0 |  |
| term · trace: every saved row carries the content of a session of this package | 152 | 0 |  |
| term · content: «المفاهيم» in Noor = the session's own text | 152 | 0 |  |
| term · course: every save in the right course card | 152 | 0 |  |
| term · own lesson: every row saved into its own session's Noor lesson | 152 | 0 |  |
| term · no duplicate: no session saved twice | 152 | 0 |  |
| term · title: Noor lesson name + «» for session n | 152 | 0 |  |
| term · weekdays: no publish date on Friday/Saturday | 152 | 0 |  |
| term · complete: every session of the 17 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · order: within a lesson, session k+1 strictly after session k | 152 | 0 |  |
| term · order: within a unit, lesson k+1 never starts before lesson k | 152 | 0 |  |
| term · term: every date within the term | 136 | 0 |  |
| term · end of term: sessions share a prep only when the plan would otherwise pass the term end , and exactly as many | 136 | 0 |  |
| term · end of plan: a shared prep holds sessions of one lesson only | 136 | 0 |  |
| term · dates: no session before the plan's first week | 152 | 0 |  |
| term · dates: period after period from the first school day, in Noor tree order | 101 | 0 |  |
| term · re-run: a second run adds nothing | 152 | 0 |  |
| term · re-run: ended | 152 | 0 |  |
| pick · pick list: each unit appears once | 304 | 0 |  |
| pick · pick list: every lesson listed once | 304 | 0 |  |
| pick · pick list: a clear date box for every session of a chosen lesson | 304 | 0 |  |
| pick · pick list: no suggested date | 304 | 0 |  |
| pick · pick list: after the first typed date the other 3 chosen sessions get consecutive class days | 36 | 0 |  |
| pick · pick screen: exactly the 4 chosen sessions with the typed dates | 36 | 0 |  |
| pick · finished: the run ended | 152 | 0 |  |
| pick · finished: wizard shows success | 152 | 0 |  |
| pick · pick: no start summary | 152 | 0 |  |
| pick · trace: every saved row carries the content of a session of this package | 152 | 0 |  |
| pick · content: «المفاهيم» in Noor = the session's own text | 152 | 0 |  |
| pick · course: every save in the right course card | 152 | 0 |  |
| pick · own lesson: every row saved into its own session's Noor lesson | 152 | 0 |  |
| pick · no duplicate: no session saved twice | 152 | 0 |  |
| pick · title: Noor lesson name + «» for session n | 152 | 0 |  |
| pick · weekdays: no publish date on Friday/Saturday | 152 | 0 |  |
| pick · selection: exactly the chosen sessions were saved | 152 | 0 |  |
| pick · dates: every pick saved on exactly the typed date | 152 | 0 |  |
| pick · re-run: the same pick again adds nothing | 152 | 0 |  |
| pick · re-run: ended | 152 | 0 |  |
| term · holidays: the settings holidays are known to the tool | 17 | 0 |  |
| term · shift: the «فترتان» package was taken | 76 | 0 |  |
| term · noor tree: sent to the admin panel with all 36 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 34 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · blocked days: nothing on a holidays day | 17 | 0 |  |
| term · dates: period after period from the first school day in Noor tree order, the next free period when blocked | 51 | 0 |  |
| term · blocked days: nothing on a busy day | 17 | 0 |  |
| term · busy: the existing preps are untouched | 17 | 0 |  |
| pick · pick list: after the first typed date the other 4 chosen sessions get consecutive class days | 32 | 0 |  |
| pick · pick screen: exactly the 5 chosen sessions with the typed dates | 32 | 0 |  |
| term · noor tree: sent to the admin panel with all 16 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 14 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · blocked days: nothing on a reject day | 17 | 0 |  |
| pick · pick list: after the first typed date the other 6 chosen sessions get consecutive class days | 17 | 0 |  |
| pick · pick screen: exactly the 7 chosen sessions with the typed dates | 17 | 0 |  |
| pick · pick list: after the first typed date the other 5 chosen sessions get consecutive class days | 30 | 0 |  |
| pick · pick screen: exactly the 6 chosen sessions with the typed dates | 30 | 0 |  |
| term · noor tree: sent to the admin panel with all 20 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 18 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · periods: one prep per period | 17 | 0 |  |
| term · periods: each Sunday holds one prep per session its week has, up to two | 17 | 0 |  |
| term · oneper: nothing after the term end unless no two sessions of one lesson from today on could still share a prep | 16 | 0 |  |
| term · oneper: no more late preps than the overflow bound | 16 | 0 |  |
| term · term: every date within the term unless the plan cannot fit the periods at all | 16 | 0 |  |
| term · oneper: every prep on a day with a period | 16 | 0 |  |
| term · one prep per period | 16 | 0 |  |
| pick · pick list: after the first typed date the other 7 chosen sessions get consecutive class days | 5 | 0 |  |
| pick · pick screen: exactly the 8 chosen sessions with the typed dates | 5 | 0 |  |
| term · noor tree: sent to the admin panel with all 51 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 49 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 33 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 31 lessons with the same name in Noor was saved | 4 | 0 |  |
| pick · pick list: after the first typed date the other 2 chosen sessions get consecutive class days | 30 | 0 |  |
| pick · pick screen: exactly the 3 chosen sessions with the typed dates | 30 | 0 |  |
| term · noor tree: sent to the admin panel with all 72 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 70 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 52 Noor lessons | 5 | 0 |  |
| term · complete: every session of the 50 lessons with the same name in Noor was saved | 5 | 0 |  |
| term · noor tree: sent to the admin panel with all 58 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 56 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 10 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 8 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 55 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 53 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 9 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 7 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 26 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 30 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 25 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 28 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 27 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 25 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 24 Noor lessons | 8 | 0 |  |
| term · complete: every session of the 24 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 28 Noor lessons | 5 | 0 |  |
| term · complete: every session of the 27 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 17 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 15 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 14 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 12 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 12 Noor lessons | 7 | 0 |  |
| term · complete: every session of the 10 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · noor tree: sent to the admin panel with all 15 Noor lessons | 11 | 0 |  |
| term · complete: every session of the 13 lessons with the same name in Noor was saved | 11 | 0 |  |
| term · noor tree: sent to the admin panel with all 11 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 9 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 32 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 23 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 13 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 11 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 22 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 20 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 22 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · noor tree: sent to the admin panel with all 8 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 6 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 3 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 2 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 4 Noor lessons | 6 | 0 |  |
| term · complete: every session of the 3 lessons with the same name in Noor was saved | 6 | 0 |  |
| pick · pick list: after the first typed date the other 8 chosen sessions get consecutive class days | 2 | 0 |  |
| pick · pick screen: exactly the 9 chosen sessions with the typed dates | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 47 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 45 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 7 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 5 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 26 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 29 Noor lessons | 1 | 0 |  |
| term · noor tree: sent to the admin panel with all 31 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 29 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 37 Noor lessons | 4 | 0 |  |
| term · complete: every session of the 35 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · noor tree: sent to the admin panel with all 42 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 40 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 23 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 21 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 84 Noor lessons | 1 | 0 |  |
| term · complete: every session of the 82 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · noor tree: sent to the admin panel with all 6 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 4 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · noor tree: sent to the admin panel with all 43 Noor lessons | 3 | 0 |  |
| term · complete: every session of the 41 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · noor tree: sent to the admin panel with all 35 Noor lessons | 2 | 0 |  |
| term · complete: every session of the 33 lessons with the same name in Noor was saved | 2 | 0 |  |

## By fault

| fault | packages | flows failed (term) | flows failed (pick) |
|---|---:|---:|---:|
| none | 17 | 0 | 0 |
| holidays | 17 | 0 | 0 |
| busy | 17 | 0 | 0 |
| reject | 17 | 0 | 0 |
| netcut | 17 | 0 | 0 |
| close | 17 | 0 | 0 |
| yearend | 17 | 0 | 0 |
| twoper | 17 | 0 | 0 |
| oneper | 16 | 0 | 0 |

## Packages

| package | file | shift | sessions | fault | term (pass/checks) | pick (pass/checks) | secs |
|---|---|---|---:|---|---|---|---:|
| bio-9 | bio-9-t1.json | one | 45 | none | ✓ 25/25 | ✓ 24/24 | 91 |
| ar-1-2 | g1-5/ar-1-2-t1.json | two | 176 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 169 |
| ar-1 | g1-5/ar-1-t1.json | one | 193 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 174 |
| ar-2-2 | g1-5/ar-2-2-t1.json | two | 176 | reject | ✓ 26/26 (1 note) | ✓ 24/24 | 169 |
| ar-2 | g1-5/ar-2-t1.json | one | 193 | netcut | ✓ 25/25 (1 note) | ✓ 24/24 | 170 |
| ar-3-2 | g1-5/ar-3-2-t1.json | two | 162 | close | ✓ 25/25 (1 note) | ✓ 24/24 | 190 |
| ar-3 | g1-5/ar-3-t1.json | one | 179 | yearend | ✓ 25/25 (1 note) | ✓ 24/24 | 144 |
| ar-4-2 | g1-5/ar-4-2-t1.json | two | 162 | twoper | ✓ 27/27 (1 note) | ✓ 24/24 | 180 |
| ar-4 | g1-5/ar-4-t1.json | one | 162 | oneper | ✓ 27/27 (1 note) | ✓ 24/24 | 165 |
| ar-5-2 | g1-5/ar-5-2-t1.json | two | 99 | none | ✓ 25/25 (1 note) | ✓ 24/24 | 142 |
| ar-5 | g1-5/ar-5-t1.json | one | 99 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 142 |
| en-1-2 | g1-5/en-1-2-t1.json | two | 111 | busy | ✓ 27/27 | ✓ 24/24 | 145 |
| en-1 | g1-5/en-1-t1.json | one | 111 | reject | ✓ 26/26 | ✓ 24/24 | 144 |
| en-2-2 | g1-5/en-2-2-t1.json | two | 111 | netcut | ✓ 25/25 (1 note) | ✓ 24/24 | 136 |
| en-2 | g1-5/en-2-t1.json | one | 111 | close | ✓ 25/25 (1 note) | ✓ 24/24 | 167 |
| en-3-2 | g1-5/en-3-2-t1.json | two | 97 | yearend | ✓ 25/25 | ✓ 24/24 | 127 |
| en-3 | g1-5/en-3-t1.json | one | 111 | twoper | ✓ 27/27 | ✓ 24/24 | 147 |
| en-4-2 | g1-5/en-4-2-t1.json | two | 98 | oneper | ✓ 27/27 | ✓ 24/24 | 137 |
| en-4 | g1-5/en-4-t1.json | one | 111 | none | ✓ 25/25 | ✓ 24/24 | 140 |
| en-5-2 | g1-5/en-5-2-t1.json | two | 85 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 115 |
| en-5 | g1-5/en-5-t1.json | one | 85 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 115 |
| ic-1-2 | g1-5/ic-1-2-t1.json | two | 17 | reject | ✓ 26/26 | ✓ 24/24 | 61 |
| ic-1 | g1-5/ic-1-t1.json | one | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 60 |
| ic-2-2 | g1-5/ic-2-2-t1.json | two | 17 | close | ✓ 25/25 | ✓ 24/24 | 96 |
| ic-2 | g1-5/ic-2-t1.json | one | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 59 |
| ic-3-2 | g1-5/ic-3-2-t1.json | two | 17 | twoper | ✓ 27/27 | ✓ 24/24 | 55 |
| ic-3 | g1-5/ic-3-t1.json | one | 17 | oneper | ✓ 27/27 | ✓ 24/24 | 55 |
| ic-4-2 | g1-5/ic-4-2-t1.json | two | 17 | none | ✓ 25/25 | ✓ 24/24 | 59 |
| ic-4 | g1-5/ic-4-t1.json | one | 17 | holidays | ✓ 27/27 | ✓ 24/24 | 61 |
| is-1-2 | g1-5/is-1-2-t1.json | two | 51 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 90 |
| is-1 | g1-5/is-1-t1.json | one | 85 | reject | ✓ 26/26 (1 note) | ✓ 24/24 | 122 |
| is-2-2 | g1-5/is-2-2-t1.json | two | 51 | netcut | ✓ 25/25 (1 note) | ✓ 24/24 | 94 |
| is-2 | g1-5/is-2-t1.json | one | 85 | close | ✓ 25/25 (1 note) | ✓ 24/24 | 130 |
| is-3-2 | g1-5/is-3-2-t1.json | two | 85 | yearend | ✓ 25/25 (1 note) | ✓ 24/24 | 121 |
| is-3 | g1-5/is-3-t1.json | one | 85 | twoper | ✓ 27/27 (1 note) | ✓ 24/24 | 116 |
| is-4-2 | g1-5/is-4-2-t1.json | two | 85 | oneper | ✓ 27/27 (1 note) | ✓ 24/24 | 110 |
| is-4 | g1-5/is-4-t1.json | one | 85 | none | ✓ 25/25 (1 note) | ✓ 24/24 | 122 |
| is-5-2 | g1-5/is-5-2-t1.json | two | 60 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 98 |
| is-5 | g1-5/is-5-t1.json | one | 75 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 108 |
| it-1-2 | g1-5/it-1-2-t1.json | two | 17 | reject | ✓ 26/26 | ✓ 24/24 | 61 |
| it-1 | g1-5/it-1-t1.json | one | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 62 |
| it-2-2 | g1-5/it-2-2-t1.json | two | 17 | close | ✓ 25/25 | ✓ 24/24 | 60 |
| it-2 | g1-5/it-2-t1.json | one | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 61 |
| it-3-2 | g1-5/it-3-2-t1.json | two | 17 | twoper | ✓ 27/27 | ✓ 24/24 | 56 |
| it-3 | g1-5/it-3-t1.json | one | 34 | oneper | ✓ 27/27 | ✓ 24/24 | 61 |
| it-4-2 | g1-5/it-4-2-t1.json | two | 17 | none | ✓ 25/25 | ✓ 24/24 | 60 |
| it-4 | g1-5/it-4-t1.json | one | 34 | holidays | ✓ 27/27 | ✓ 24/24 | 73 |
| it-5-2 | g1-5/it-5-2-t1.json | two | 31 | busy | ✓ 27/27 | ✓ 24/24 | 72 |
| it-5 | g1-5/it-5-t1.json | one | 31 | reject | ✓ 26/26 | ✓ 24/24 | 73 |
| ma-1-2 | g1-5/ma-1-2-t1.json | two | 102 | netcut | ✓ 25/25 | ✓ 24/24 | 132 |
| ma-1 | g1-5/ma-1-t1.json | one | 119 | close | ✓ 25/25 | ✓ 24/24 | 175 |
| ma-2-2 | g1-5/ma-2-2-t1.json | two | 102 | yearend | ✓ 25/25 (1 note) | ✓ 24/24 | 132 |
| ma-2 | g1-5/ma-2-t1.json | one | 119 | twoper | ✓ 27/27 | ✓ 24/24 | 157 |
| ma-3-2 | g1-5/ma-3-2-t1.json | two | 85 | oneper | ✓ 27/27 | ✓ 24/24 | 117 |
| ma-3 | g1-5/ma-3-t1.json | one | 102 | none | ✓ 25/25 | ✓ 24/24 | 143 |
| ma-4-2 | g1-5/ma-4-2-t1.json | two | 85 | holidays | ✓ 27/27 | ✓ 24/24 | 127 |
| ma-4 | g1-5/ma-4-t1.json | one | 102 | busy | ✓ 27/27 | ✓ 24/24 | 140 |
| ma-5-2 | g1-5/ma-5-2-t1.json | two | 90 | reject | ✓ 26/26 | ✓ 24/24 | 125 |
| ma-5 | g1-5/ma-5-t1.json | one | 105 | netcut | ✓ 25/25 | ✓ 24/24 | 131 |
| pe-1-2 | g1-5/pe-1-2-t1.json | two | 17 | close | ✓ 25/25 | ✓ 24/24 | 94 |
| pe-1 | g1-5/pe-1-t1.json | one | 34 | yearend | ✓ 25/25 | ✓ 24/24 | 73 |
| pe-2-2 | g1-5/pe-2-2-t1.json | two | 17 | twoper | ✓ 27/27 | ✓ 24/24 | 55 |
| pe-2 | g1-5/pe-2-t1.json | one | 34 | oneper | ✓ 27/27 | ✓ 24/24 | 61 |
| pe-3-2 | g1-5/pe-3-2-t1.json | two | 17 | none | ✓ 25/25 | ✓ 24/24 | 59 |
| pe-3 | g1-5/pe-3-t1.json | one | 34 | holidays | ✓ 27/27 | ✓ 24/24 | 73 |
| pe-4-2 | g1-5/pe-4-2-t1.json | two | 17 | busy | ✓ 27/27 | ✓ 24/24 | 59 |
| pe-4 | g1-5/pe-4-t1.json | one | 34 | reject | ✓ 26/26 | ✓ 24/24 | 75 |
| pe-5-2 | g1-5/pe-5-2-t1.json | two | 15 | netcut | ✓ 25/25 (1 note) | ✓ 24/24 | 58 |
| pe-5 | g1-5/pe-5-t1.json | one | 30 | close | ✓ 25/25 (1 note) | ✓ 24/24 | 81 |
| sc-1-2 | g1-5/sc-1-2-t1.json | two | 51 | yearend | ✓ 25/25 | ✓ 24/24 | 90 |
| sc-1 | g1-5/sc-1-t1.json | one | 51 | twoper | ✓ 27/27 | ✓ 24/24 | 87 |
| sc-2-2 | g1-5/sc-2-2-t1.json | two | 51 | oneper | ✓ 27/27 | ✓ 24/24 | 78 |
| sc-2 | g1-5/sc-2-t1.json | one | 51 | none | ✓ 25/25 | ✓ 24/24 | 90 |
| sc-3-2 | g1-5/sc-3-2-t1.json | two | 68 | holidays | ✓ 27/27 | ✓ 24/24 | 109 |
| sc-3 | g1-5/sc-3-t1.json | one | 68 | busy | ✓ 27/27 | ✓ 24/24 | 110 |
| sc-4-2 | g1-5/sc-4-2-t1.json | two | 68 | reject | ✓ 26/26 | ✓ 24/24 | 106 |
| sc-4 | g1-5/sc-4-t1.json | one | 85 | netcut | ✓ 25/25 | ✓ 24/24 | 121 |
| sc-5-2 | g1-5/sc-5-2-t1.json | two | 61 | close | ✓ 25/25 | ✓ 24/24 | 98 |
| sc-5 | g1-5/sc-5-t1.json | one | 76 | yearend | ✓ 25/25 | ✓ 24/24 | 109 |
| ss-5-2 | g1-5/ss-5-2-t1.json | two | 45 | twoper | ✓ 27/27 | ✓ 24/24 | 83 |
| ss-5 | g1-5/ss-5-t1.json | one | 60 | oneper | ✓ 27/27 | ✓ 24/24 | 96 |
| va-1-2 | g1-5/va-1-2-t1.json | two | 17 | none | ✓ 25/25 | ✓ 24/24 | 64 |
| va-1 | g1-5/va-1-t1.json | one | 17 | holidays | ✓ 27/27 | ✓ 24/24 | 64 |
| va-2-2 | g1-5/va-2-2-t1.json | two | 17 | busy | ✓ 27/27 | ✓ 24/24 | 65 |
| va-2 | g1-5/va-2-t1.json | one | 17 | reject | ✓ 26/26 | ✓ 24/24 | 65 |
| va-3-2 | g1-5/va-3-2-t1.json | two | 17 | netcut | ✓ 25/25 | ✓ 24/24 | 65 |
| va-3 | g1-5/va-3-t1.json | one | 17 | close | ✓ 25/25 | ✓ 24/24 | 64 |
| va-4-2 | g1-5/va-4-2-t1.json | two | 17 | yearend | ✓ 25/25 | ✓ 24/24 | 63 |
| va-4 | g1-5/va-4-t1.json | one | 17 | twoper | ✓ 27/27 | ✓ 24/24 | 58 |
| va-5-2 | g1-5/va-5-2-t1.json | two | 15 | oneper | ✓ 27/27 | ✓ 24/24 | 56 |
| va-5 | g1-5/va-5-t1.json | one | 15 | none | ✓ 25/25 | ✓ 24/24 | 61 |
| ar-11-2 | g11/ar-11-2-t1.json | two | 72 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 111 |
| ar-11 | g11/ar-11-t1.json | one | 85 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 124 |
| bi-11-2 | g11/bi-11-2-t1.json | two | 75 | reject | ✓ 26/26 | ✓ 24/24 | 115 |
| bi-11 | g11/bi-11-t1.json | one | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 112 |
| ch-11-2 | g11/ch-11-2-t1.json | two | 75 | close | ✓ 25/25 | ✓ 24/24 | 112 |
| ch-11 | g11/ch-11-t1.json | one | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 112 |
| en-11-2 | g11/en-11-2-t1.json | two | 58 | twoper | ✓ 27/27 | ✓ 24/24 | 141 |
| en-11 | g11/en-11-t1.json | one | 85 | oneper | ✓ 27/27 | ✓ 24/24 | 188 |
| es-11-2 | g11/es-11-2-t1.json | two | 75 | none | ✓ 25/25 | ✓ 24/24 | 128 |
| es-11 | g11/es-11-t1.json | one | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 121 |
| fa-11-2 | g11/fa-11-2-t1.json | two | 75 | busy | ✓ 27/27 | ✓ 24/24 | 117 |
| fa-11 | g11/fa-11-t1.json | one | 75 | reject | ✓ 26/26 | ✓ 24/24 | 118 |
| hc-11-2 | g11/hc-11-2-t1.json | two | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 118 |
| hc-11 | g11/hc-11-t1.json | one | 75 | close | ✓ 25/25 | ✓ 24/24 | 158 |
| is-11-2 | g11/is-11-2-t1.json | two | 45 | yearend | ✓ 25/25 | ✓ 24/24 | 87 |
| is-11 | g11/is-11-t1.json | one | 60 | twoper | ✓ 27/27 | ✓ 24/24 | 91 |
| it-11-2 | g11/it-11-2-t1.json | two | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 113 |
| it-11 | g11/it-11-t1.json | one | 75 | none | ✓ 25/25 | ✓ 24/24 | 117 |
| ma-11-2 | g11/ma-11-2-t1.json | two | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 165 |
| ma-11 | g11/ma-11-t1.json | one | 90 | busy | ✓ 27/27 | ✓ 24/24 | 192 |
| mb-11-2 | g11/mb-11-2-t1.json | two | 75 | reject | ✓ 26/26 | ✓ 24/24 | 169 |
| mb-11 | g11/mb-11-t1.json | one | 90 | netcut | ✓ 25/25 | ✓ 24/24 | 197 |
| ph-11-2 | g11/ph-11-2-t1.json | two | 75 | close | ✓ 25/25 | ✓ 24/24 | 140 |
| ph-11 | g11/ph-11-t1.json | one | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 113 |
| sp-11-2 | g11/sp-11-2-t1.json | two | 75 | twoper | ✓ 27/27 | ✓ 24/24 | 107 |
| sp-11 | g11/sp-11-t1.json | one | 75 | oneper | ✓ 27/27 | ✓ 24/24 | 108 |
| wt-11-2 | g11/wt-11-2-t1.json | two | 30 | none | ✓ 25/25 | ✓ 24/24 | 75 |
| wt-11 | g11/wt-11-t1.json | one | 30 | holidays | ✓ 27/27 | ✓ 24/24 | 73 |
| ar-12-2 | g12/ar-12-2-t1.json | two | 75 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 111 |
| ar-12 | g12/ar-12-t1.json | one | 88 | reject | ✓ 26/26 (1 note) | ✓ 24/24 | 121 |
| bi-12-2 | g12/bi-12-2-t1.json | two | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 109 |
| bi-12 | g12/bi-12-t1.json | one | 75 | close | ✓ 25/25 | ✓ 24/24 | 112 |
| ch-12-2 | g12/ch-12-2-t1.json | two | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 111 |
| ch-12 | g12/ch-12-t1.json | one | 75 | twoper | ✓ 27/27 | ✓ 24/24 | 106 |
| en-12-2 | g12/en-12-2-t1.json | two | 58 | oneper | ✓ 27/27 (1 note) | ✓ 24/24 | 94 |
| en-12 | g12/en-12-t1.json | one | 85 | none | ✓ 25/25 (1 note) | ✓ 24/24 | 121 |
| fa-12-2 | g12/fa-12-2-t1.json | two | 75 | holidays | ✓ 27/27 | ✓ 24/24 | 116 |
| fa-12 | g12/fa-12-t1.json | one | 75 | busy | ✓ 27/27 | ✓ 24/24 | 112 |
| is-12-2 | g12/is-12-2-t1.json | two | 45 | reject | ✓ 26/26 (1 note) | ✓ 24/24 | 83 |
| is-12 | g12/is-12-t1.json | one | 60 | netcut | ✓ 25/25 (1 note) | ✓ 24/24 | 96 |
| it-12-2 | g12/it-12-2-t1.json | two | 75 | close | ✓ 25/25 | ✓ 24/24 | 147 |
| it-12 | g12/it-12-t1.json | one | 75 | yearend | ✓ 25/25 | ✓ 24/24 | 114 |
| ma-12-2 | g12/ma-12-2-t1.json | two | 75 | twoper | ✓ 27/27 | ✓ 24/24 | 110 |
| ma-12 | g12/ma-12-t1.json | one | 90 | oneper | ✓ 27/27 | ✓ 24/24 | 124 |
| mt-12-2 | g12/mt-12-2-t1.json | two | 75 | none | ✓ 25/25 | ✓ 24/24 | 110 |
| mt-12 | g12/mt-12-t1.json | one | 90 | holidays | ✓ 27/27 | ✓ 24/24 | 125 |
| ph-12-2 | g12/ph-12-2-t1.json | two | 75 | busy | ✓ 27/27 | ✓ 24/24 | 113 |
| ph-12 | g12/ph-12-t1.json | one | 75 | reject | ✓ 26/26 | ✓ 24/24 | 113 |
| sp-12-2 | g12/sp-12-2-t1.json | two | 75 | netcut | ✓ 25/25 | ✓ 24/24 | 112 |
| sp-12 | g12/sp-12-t1.json | one | 75 | close | ✓ 25/25 | ✓ 24/24 | 110 |
| wt-12-2 | g12/wt-12-2-t1.json | two | 30 | yearend | ✓ 25/25 | ✓ 24/24 | 74 |
| wt-12 | g12/wt-12-t1.json | one | 30 | twoper | ✓ 27/27 | ✓ 24/24 | 70 |
| ar-10-2 | g6-10/ar-10-2-t1.json | two | 85 | oneper | ✓ 27/27 | ✓ 24/24 | 121 |
| ar-10 | g6-10/ar-10-t1.json | one | 99 | none | ✓ 25/25 | ✓ 24/24 | 140 |
| ar-6-2 | g6-10/ar-6-2-t1.json | two | 99 | holidays | ✓ 27/27 (1 note) | ✓ 24/24 | 139 |
| ar-6 | g6-10/ar-6-t1.json | one | 99 | busy | ✓ 27/27 (1 note) | ✓ 24/24 | 136 |
| ar-7-2 | g6-10/ar-7-2-t1.json | two | 85 | reject | ✓ 26/26 (1 note) | ✓ 24/24 | 128 |
| ar-7 | g6-10/ar-7-t1.json | one | 85 | netcut | ✓ 25/25 (1 note) | ✓ 24/24 | 127 |
| ar-8-2 | g6-10/ar-8-2-t1.json | two | 85 | close | ✓ 25/25 (1 note) | ✓ 24/24 | 127 |
| ar-8 | g6-10/ar-8-t1.json | one | 85 | yearend | ✓ 25/25 (1 note) | ✓ 24/24 | 125 |
| ar-9-2 | g6-10/ar-9-2-t1.json | two | 85 | twoper | ✓ 27/27 | ✓ 24/24 | 125 |

## Failures

None.
## Skipped files

- g1-5-report.md: not a .json file
- g11-report.md: not a .json file
- g12-report.md: not a .json file
- g6-10-report.md: not a .json file
- hader-preps-4.10.19-every-period.zip: not a .json file
- hader-preps-en-9-fix.zip: not a .json file
- hader-preps-every-lesson-fix.zip: not a .json file
- hader-preps-g1-5-t1.zip: not a .json file
- hader-preps-g11-t1.zip: not a .json file
- hader-preps-g12-t1.zip: not a .json file
- hader-preps-g6-10-t1.zip: not a .json file
- hader-preps-it-2-fix.zip: not a .json file
- hader-preps-ls-9-10-t1.zip: not a .json file
- hader-preps-relink-fix.zip: not a .json file
- old-2026-10-25/hader-preps-g1-5-t1.zip: not a .json file
- old-2026-10-25/hader-preps-g11-t1.zip: not a .json file
- old-2026-10-25/hader-preps-g12-t1.zip: not a .json file
- old-2026-10-25/hader-preps-g6-10-t1.zip: not a .json file
- old-2026-10-31/hader-preps-g1-5-t1.zip: not a .json file
- old-2026-10-31/hader-preps-g11-t1.zip: not a .json file
- old-2026-10-31/hader-preps-g12-t1.zip: not a .json file
- old-2026-10-31/hader-preps-g6-10-t1.zip: not a .json file
- old-it-2/hader-preps-g1-5-t1.before-it2.zip: not a .json file
- fix-en-9/en-9-2-t1.json: duplicate id en-9-2 (tested from g6-10/en-9-2-t1.json)
- fix-en-9/en-9-t1.json: duplicate id en-9 (tested from g6-10/en-9-t1.json)
- fix-it-2/it-2-2-t1.json: duplicate id it-2-2 (tested from g1-5/it-2-2-t1.json)
- fix-it-2/it-2-t1.json: duplicate id it-2 (tested from g1-5/it-2-t1.json)
- fix-relink/ar-1-2-t1.json: duplicate id ar-1-2 (tested from g1-5/ar-1-2-t1.json)
- fix-relink/ar-1-t1.json: duplicate id ar-1 (tested from g1-5/ar-1-t1.json)
- fix-relink/ar-2-2-t1.json: duplicate id ar-2-2 (tested from g1-5/ar-2-2-t1.json)
- fix-relink/ar-2-t1.json: duplicate id ar-2 (tested from g1-5/ar-2-t1.json)
- fix-relink/ar-3-2-t1.json: duplicate id ar-3-2 (tested from g1-5/ar-3-2-t1.json)
- fix-relink/ar-5-2-t1.json: duplicate id ar-5-2 (tested from g1-5/ar-5-2-t1.json)
- fix-relink/ar-5-t1.json: duplicate id ar-5 (tested from g1-5/ar-5-t1.json)
- fix-relink/ar-6-2-t1.json: duplicate id ar-6-2 (tested from g6-10/ar-6-2-t1.json)
- fix-relink/ar-6-t1.json: duplicate id ar-6 (tested from g6-10/ar-6-t1.json)
- fix-relink/ar-7-2-t1.json: duplicate id ar-7-2 (tested from g6-10/ar-7-2-t1.json)
- fix-relink/ar-7-t1.json: duplicate id ar-7 (tested from g6-10/ar-7-t1.json)
- fix-relink/en-2-2-t1.json: duplicate id en-2-2 (tested from g1-5/en-2-2-t1.json)
- fix-relink/en-2-t1.json: duplicate id en-2 (tested from g1-5/en-2-t1.json)
- fix-relink/en-5-2-t1.json: duplicate id en-5-2 (tested from g1-5/en-5-2-t1.json)
- fix-relink/en-5-t1.json: duplicate id en-5 (tested from g1-5/en-5-t1.json)
- fix-relink/en-6-2-t1.json: duplicate id en-6-2 (tested from g6-10/en-6-2-t1.json)
- fix-relink/en-6-t1.json: duplicate id en-6 (tested from g6-10/en-6-t1.json)
- fix-relink/en-7-2-t1.json: duplicate id en-7-2 (tested from g6-10/en-7-2-t1.json)
- fix-relink/en-7-t1.json: duplicate id en-7 (tested from g6-10/en-7-t1.json)
- fix-relink/ma-2-2-t1.json: duplicate id ma-2-2 (tested from g1-5/ma-2-2-t1.json)
- fix-relink/ma-7-t1.json: duplicate id ma-7 (tested from g6-10/ma-7-t1.json)
- ls-new/ls-10-t1.json: duplicate id ls-10 (tested from g6-10/ls-10-t1.json)
- ls-new/ls-9-t1.json: duplicate id ls-9 (tested from g6-10/ls-9-t1.json)
- old-before-relink/ar-1-2-t1.json: duplicate id ar-1-2 (tested from g1-5/ar-1-2-t1.json)
- old-before-relink/ar-1-t1.json: duplicate id ar-1 (tested from g1-5/ar-1-t1.json)
- old-before-relink/ar-2-2-t1.json: duplicate id ar-2-2 (tested from g1-5/ar-2-2-t1.json)
- old-before-relink/ar-2-t1.json: duplicate id ar-2 (tested from g1-5/ar-2-t1.json)
- old-before-relink/ar-3-2-t1.json: duplicate id ar-3-2 (tested from g1-5/ar-3-2-t1.json)
- old-before-relink/ar-5-2-t1.json: duplicate id ar-5-2 (tested from g1-5/ar-5-2-t1.json)
- old-before-relink/ar-5-t1.json: duplicate id ar-5 (tested from g1-5/ar-5-t1.json)
- old-before-relink/ar-6-2-t1.json: duplicate id ar-6-2 (tested from g6-10/ar-6-2-t1.json)
- old-before-relink/ar-6-t1.json: duplicate id ar-6 (tested from g6-10/ar-6-t1.json)
- old-before-relink/ar-7-2-t1.json: duplicate id ar-7-2 (tested from g6-10/ar-7-2-t1.json)
- old-before-relink/ar-7-t1.json: duplicate id ar-7 (tested from g6-10/ar-7-t1.json)
- old-before-relink/en-2-2-t1.json: duplicate id en-2-2 (tested from g1-5/en-2-2-t1.json)
- old-before-relink/en-2-t1.json: duplicate id en-2 (tested from g1-5/en-2-t1.json)
- old-before-relink/en-5-2-t1.json: duplicate id en-5-2 (tested from g1-5/en-5-2-t1.json)
- old-before-relink/en-5-t1.json: duplicate id en-5 (tested from g1-5/en-5-t1.json)
- old-before-relink/en-6-2-t1.json: duplicate id en-6-2 (tested from g6-10/en-6-2-t1.json)
- old-before-relink/en-6-t1.json: duplicate id en-6 (tested from g6-10/en-6-t1.json)
- old-before-relink/en-7-2-t1.json: duplicate id en-7-2 (tested from g6-10/en-7-2-t1.json)
- old-before-relink/en-7-t1.json: duplicate id en-7 (tested from g6-10/en-7-t1.json)
- old-before-relink/ma-2-2-t1.json: duplicate id ma-2-2 (tested from g1-5/ma-2-2-t1.json)
- old-before-relink/ma-7-t1.json: duplicate id ma-7 (tested from g6-10/ma-7-t1.json)
- old-en-9/en-9-2-t1.json: duplicate id en-9-2 (tested from g6-10/en-9-2-t1.json)
- old-en-9/en-9-t1.json: duplicate id en-9 (tested from g6-10/en-9-t1.json)
- old-it-2/it-2-2-t1.json: duplicate id it-2-2 (tested from g1-5/it-2-2-t1.json)
- old-it-2/it-2-t1.json: duplicate id it-2 (tested from g1-5/it-2-t1.json)


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
