# Matrix report — «حاضر» × mock Noor

Finished 2026-10-21T00:34:50.063Z · extension v4.10.4 · 241/241 packages · 482 flows · 7886 checks · **3 failed checks** in 3 flows · 0 notes (soft checks) · 103 min with 3 workers, timers ×20

Command: `node tests/noor-mock/matrix.mjs --jobs 3` · packages from `/mnt/project-files/afaq-platform/preps` (241 found; 8 non-package files skipped)

## Checks

Checks named «note — …» are soft: they are listed but never fail a flow.

| flow · check | pass | fail | failing packages |
|---|---:|---:|---|
| term · content: «المفاهيم» in Noor = the session's own text | 238 | 3 | it-10-2, it-10, ma-7 |
| term · finished: the run ended | 241 | 0 |  |
| term · finished: wizard shows success | 241 | 0 |  |
| term · shift: the «فترة واحدة» package was taken | 121 | 0 |  |
| term · trace: every saved row carries the content of a session of this package | 241 | 0 |  |
| term · course: every save in the right course card | 241 | 0 |  |
| term · own lesson: every row saved into its own session's Noor lesson | 241 | 0 |  |
| term · no duplicate: no session saved twice | 241 | 0 |  |
| term · title: Noor lesson name + «» for session n | 241 | 0 |  |
| term · weekdays: no publish date on Friday/Saturday | 241 | 0 |  |
| term · complete: every session of the 17 lessons with the same name in Noor was saved | 9 | 0 |  |
| term · order: within a lesson, session k+1 strictly after session k | 241 | 0 |  |
| term · order: within a unit, lesson k+1 never starts before lesson k | 241 | 0 |  |
| term · note — file order: no session published before an earlier entry of the file | 241 | 0 |  |
| term · term: every date within the term | 241 | 0 |  |
| term · dates: no session before its official date | 241 | 0 |  |
| term · dates: every session on its official date | 137 | 0 |  |
| term · re-run: a second run adds nothing | 241 | 0 |  |
| term · re-run: ended | 241 | 0 |  |
| pick · pick screen: exactly the 4 chosen sessions with the typed dates | 64 | 0 |  |
| pick · finished: the run ended | 241 | 0 |  |
| pick · finished: wizard shows success | 241 | 0 |  |
| pick · trace: every saved row carries the content of a session of this package | 241 | 0 |  |
| pick · content: «المفاهيم» in Noor = the session's own text | 241 | 0 |  |
| pick · course: every save in the right course card | 241 | 0 |  |
| pick · own lesson: every row saved into its own session's Noor lesson | 241 | 0 |  |
| pick · no duplicate: no session saved twice | 241 | 0 |  |
| pick · title: Noor lesson name + «» for session n | 241 | 0 |  |
| pick · weekdays: no publish date on Friday/Saturday | 241 | 0 |  |
| pick · selection: exactly the chosen sessions were saved | 241 | 0 |  |
| pick · dates: every pick saved on exactly the typed date | 241 | 0 |  |
| pick · re-run: the same pick again adds nothing | 241 | 0 |  |
| pick · re-run: ended | 241 | 0 |  |
| term · holidays: the settings holidays are known to the tool | 35 | 0 |  |
| term · shift: the «فترتان» package was taken | 120 | 0 |  |
| term · complete: every session of the 32 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · blocked days: nothing on a holidays day | 35 | 0 |  |
| term · dates: official date, or the next free school day when blocked | 104 | 0 |  |
| term · complete: every session of the 33 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · blocked days: nothing on a busy day | 35 | 0 |  |
| term · busy: the existing preps are untouched | 35 | 0 |  |
| pick · pick screen: exactly the 3 chosen sessions with the typed dates | 46 | 0 |  |
| term · complete: every session of the 13 lessons with the same name in Noor was saved | 13 | 0 |  |
| term · blocked days: nothing on a reject day | 34 | 0 |  |
| pick · pick screen: exactly the 5 chosen sessions with the typed dates | 56 | 0 |  |
| term · complete: every session of the 16 lessons with the same name in Noor was saved | 2 | 0 |  |
| pick · pick screen: exactly the 7 chosen sessions with the typed dates | 24 | 0 |  |
| pick · pick screen: exactly the 6 chosen sessions with the typed dates | 39 | 0 |  |
| term · complete: every session of the 43 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 31 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 62 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 50 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 52 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 8 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · complete: every session of the 7 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · complete: every session of the 30 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 28 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 25 lessons with the same name in Noor was saved | 4 | 0 |  |
| pick · pick screen: exactly the 8 chosen sessions with the typed dates | 10 | 0 |  |
| term · complete: every session of the 24 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · complete: every session of the 27 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · complete: every session of the 15 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 12 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 10 lessons with the same name in Noor was saved | 9 | 0 |  |
| term · complete: every session of the 9 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · complete: every session of the 11 lessons with the same name in Noor was saved | 16 | 0 |  |
| term · complete: every session of the 47 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 34 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 23 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · complete: every session of the 14 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 20 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 21 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · complete: every session of the 6 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · complete: every session of the 2 lessons with the same name in Noor was saved | 8 | 0 |  |
| term · complete: every session of the 3 lessons with the same name in Noor was saved | 8 | 0 |  |
| pick · pick screen: exactly the 9 chosen sessions with the typed dates | 2 | 0 |  |
| term · complete: every session of the 45 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 22 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 18 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 5 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 26 lessons with the same name in Noor was saved | 7 | 0 |  |
| term · complete: every session of the 29 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 35 lessons with the same name in Noor was saved | 4 | 0 |  |
| term · complete: every session of the 37 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 36 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 56 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 70 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 4 lessons with the same name in Noor was saved | 10 | 0 |  |
| term · complete: every session of the 44 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 40 lessons with the same name in Noor was saved | 6 | 0 |  |
| term · complete: every session of the 41 lessons with the same name in Noor was saved | 3 | 0 |  |
| term · complete: every session of the 38 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 42 lessons with the same name in Noor was saved | 1 | 0 |  |
| term · complete: every session of the 54 lessons with the same name in Noor was saved | 2 | 0 |  |
| term · complete: every session of the 46 lessons with the same name in Noor was saved | 2 | 0 |  |

## By fault

| fault | packages | flows failed (term) | flows failed (pick) |
|---|---:|---:|---:|
| none | 35 | 0 | 0 |
| holidays | 35 | 0 | 0 |
| busy | 35 | 0 | 0 |
| reject | 34 | 1 | 0 |
| netcut | 34 | 2 | 0 |
| close | 34 | 0 | 0 |
| yearend | 34 | 0 | 0 |

## Packages

| package | file | shift | sessions | fault | term (pass/checks) | pick (pass/checks) | secs |
|---|---|---|---:|---|---|---|---:|
| bio-9 | bio-9-t1.json | one | 45 | none | ✓ 18/18 | ✓ 14/14 | 65 |
| ar-1-2 | g1-5/ar-1-2-t1.json | two | 82 | holidays | ✓ 20/20 | ✓ 14/14 | 104 |
| ar-1 | g1-5/ar-1-t1.json | one | 82 | busy | ✓ 20/20 | ✓ 14/14 | 104 |
| ar-2-2 | g1-5/ar-2-2-t1.json | two | 82 | reject | ✓ 19/19 | ✓ 14/14 | 108 |
| ar-2 | g1-5/ar-2-t1.json | one | 82 | netcut | ✓ 18/18 | ✓ 14/14 | 107 |
| ar-3-2 | g1-5/ar-3-2-t1.json | two | 82 | close | ✓ 18/18 | ✓ 14/14 | 125 |
| ar-3 | g1-5/ar-3-t1.json | one | 82 | yearend | ✓ 18/18 | ✓ 14/14 | 97 |
| ar-4-2 | g1-5/ar-4-2-t1.json | two | 82 | none | ✓ 18/18 | ✓ 14/14 | 103 |
| ar-4 | g1-5/ar-4-t1.json | one | 82 | holidays | ✓ 20/20 | ✓ 14/14 | 102 |
| ar-5-2 | g1-5/ar-5-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 87 |
| ar-5 | g1-5/ar-5-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 88 |
| en-1-2 | g1-5/en-1-2-t1.json | two | 83 | netcut | ✓ 18/18 | ✓ 14/14 | 97 |
| en-1 | g1-5/en-1-t1.json | one | 83 | close | ✓ 18/18 | ✓ 14/14 | 95 |
| en-2-2 | g1-5/en-2-2-t1.json | two | 83 | yearend | ✓ 18/18 | ✓ 14/14 | 96 |
| en-2 | g1-5/en-2-t1.json | one | 83 | none | ✓ 18/18 | ✓ 14/14 | 97 |
| en-3-2 | g1-5/en-3-2-t1.json | two | 83 | holidays | ✓ 20/20 | ✓ 14/14 | 95 |
| en-3 | g1-5/en-3-t1.json | one | 83 | busy | ✓ 20/20 | ✓ 14/14 | 96 |
| en-4-2 | g1-5/en-4-2-t1.json | two | 83 | reject | ✓ 19/19 | ✓ 14/14 | 98 |
| en-4 | g1-5/en-4-t1.json | one | 83 | netcut | ✓ 18/18 | ✓ 14/14 | 99 |
| en-5-2 | g1-5/en-5-2-t1.json | two | 73 | close | ✓ 18/18 | ✓ 14/14 | 103 |
| en-5 | g1-5/en-5-t1.json | one | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 85 |
| ic-1-2 | g1-5/ic-1-2-t1.json | two | 17 | none | ✓ 18/18 | ✓ 14/14 | 42 |
| ic-1 | g1-5/ic-1-t1.json | one | 17 | holidays | ✓ 20/20 | ✓ 14/14 | 41 |
| ic-2-2 | g1-5/ic-2-2-t1.json | two | 17 | busy | ✓ 20/20 | ✓ 14/14 | 40 |
| ic-2 | g1-5/ic-2-t1.json | one | 17 | reject | ✓ 19/19 | ✓ 14/14 | 43 |
| ic-3-2 | g1-5/ic-3-2-t1.json | two | 17 | netcut | ✓ 18/18 | ✓ 14/14 | 41 |
| ic-3 | g1-5/ic-3-t1.json | one | 17 | close | ✓ 18/18 | ✓ 14/14 | 58 |
| ic-4-2 | g1-5/ic-4-2-t1.json | two | 17 | yearend | ✓ 18/18 | ✓ 14/14 | 41 |
| ic-4 | g1-5/ic-4-t1.json | one | 17 | none | ✓ 18/18 | ✓ 14/14 | 43 |
| is-1-2 | g1-5/is-1-2-t1.json | two | 51 | holidays | ✓ 20/20 | ✓ 14/14 | 73 |
| is-1 | g1-5/is-1-t1.json | one | 82 | busy | ✓ 20/20 | ✓ 14/14 | 97 |
| is-2-2 | g1-5/is-2-2-t1.json | two | 51 | reject | ✓ 19/19 | ✓ 14/14 | 75 |
| is-2 | g1-5/is-2-t1.json | one | 82 | netcut | ✓ 18/18 | ✓ 14/14 | 99 |
| is-3-2 | g1-5/is-3-2-t1.json | two | 82 | close | ✓ 18/18 | ✓ 14/14 | 98 |
| is-3 | g1-5/is-3-t1.json | one | 82 | yearend | ✓ 18/18 | ✓ 14/14 | 96 |
| is-4-2 | g1-5/is-4-2-t1.json | two | 82 | none | ✓ 18/18 | ✓ 14/14 | 96 |
| is-4 | g1-5/is-4-t1.json | one | 82 | holidays | ✓ 20/20 | ✓ 14/14 | 99 |
| is-5-2 | g1-5/is-5-2-t1.json | two | 59 | busy | ✓ 20/20 | ✓ 14/14 | 78 |
| is-5 | g1-5/is-5-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 87 |
| it-1-2 | g1-5/it-1-2-t1.json | two | 17 | netcut | ✓ 18/18 | ✓ 14/14 | 42 |
| it-1 | g1-5/it-1-t1.json | one | 17 | close | ✓ 18/18 | ✓ 14/14 | 43 |
| it-2-2 | g1-5/it-2-2-t1.json | two | 17 | yearend | ✓ 18/18 | ✓ 14/14 | 42 |
| it-2 | g1-5/it-2-t1.json | one | 17 | none | ✓ 18/18 | ✓ 14/14 | 41 |
| it-3-2 | g1-5/it-3-2-t1.json | two | 17 | holidays | ✓ 20/20 | ✓ 14/14 | 42 |
| it-3 | g1-5/it-3-t1.json | one | 34 | busy | ✓ 20/20 | ✓ 14/14 | 57 |
| it-4-2 | g1-5/it-4-2-t1.json | two | 17 | reject | ✓ 19/19 | ✓ 14/14 | 42 |
| it-4 | g1-5/it-4-t1.json | one | 34 | netcut | ✓ 18/18 | ✓ 14/14 | 54 |
| it-5-2 | g1-5/it-5-2-t1.json | two | 30 | close | ✓ 18/18 | ✓ 14/14 | 71 |
| it-5 | g1-5/it-5-t1.json | one | 30 | yearend | ✓ 18/18 | ✓ 14/14 | 50 |
| ma-1-2 | g1-5/ma-1-2-t1.json | two | 82 | none | ✓ 18/18 | ✓ 14/14 | 97 |
| ma-1 | g1-5/ma-1-t1.json | one | 82 | holidays | ✓ 20/20 | ✓ 14/14 | 100 |
| ma-2-2 | g1-5/ma-2-2-t1.json | two | 82 | busy | ✓ 20/20 | ✓ 14/14 | 102 |
| ma-2 | g1-5/ma-2-t1.json | one | 82 | reject | ✓ 19/19 | ✓ 14/14 | 100 |
| ma-3-2 | g1-5/ma-3-2-t1.json | two | 82 | netcut | ✓ 18/18 | ✓ 14/14 | 98 |
| ma-3 | g1-5/ma-3-t1.json | one | 82 | close | ✓ 18/18 | ✓ 14/14 | 119 |
| ma-4-2 | g1-5/ma-4-2-t1.json | two | 82 | yearend | ✓ 18/18 | ✓ 14/14 | 99 |
| ma-4 | g1-5/ma-4-t1.json | one | 82 | none | ✓ 18/18 | ✓ 14/14 | 99 |
| ma-5-2 | g1-5/ma-5-2-t1.json | two | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 87 |
| ma-5 | g1-5/ma-5-t1.json | one | 73 | busy | ✓ 20/20 | ✓ 14/14 | 86 |
| pe-1-2 | g1-5/pe-1-2-t1.json | two | 17 | reject | ✓ 19/19 | ✓ 14/14 | 44 |
| pe-1 | g1-5/pe-1-t1.json | one | 34 | netcut | ✓ 18/18 | ✓ 14/14 | 55 |
| pe-2-2 | g1-5/pe-2-2-t1.json | two | 17 | close | ✓ 18/18 | ✓ 14/14 | 43 |
| pe-2 | g1-5/pe-2-t1.json | one | 34 | yearend | ✓ 18/18 | ✓ 14/14 | 55 |
| pe-3-2 | g1-5/pe-3-2-t1.json | two | 17 | none | ✓ 18/18 | ✓ 14/14 | 41 |
| pe-3 | g1-5/pe-3-t1.json | one | 34 | holidays | ✓ 20/20 | ✓ 14/14 | 53 |
| pe-4-2 | g1-5/pe-4-2-t1.json | two | 17 | busy | ✓ 20/20 | ✓ 14/14 | 42 |
| pe-4 | g1-5/pe-4-t1.json | one | 34 | reject | ✓ 19/19 | ✓ 14/14 | 55 |
| pe-5-2 | g1-5/pe-5-2-t1.json | two | 15 | netcut | ✓ 18/18 | ✓ 14/14 | 40 |
| pe-5 | g1-5/pe-5-t1.json | one | 30 | close | ✓ 18/18 | ✓ 14/14 | 53 |
| sc-1-2 | g1-5/sc-1-2-t1.json | two | 51 | yearend | ✓ 18/18 | ✓ 14/14 | 67 |
| sc-1 | g1-5/sc-1-t1.json | one | 51 | none | ✓ 18/18 | ✓ 14/14 | 68 |
| sc-2-2 | g1-5/sc-2-2-t1.json | two | 51 | holidays | ✓ 20/20 | ✓ 14/14 | 66 |
| sc-2 | g1-5/sc-2-t1.json | one | 51 | busy | ✓ 20/20 | ✓ 14/14 | 69 |
| sc-3-2 | g1-5/sc-3-2-t1.json | two | 67 | reject | ✓ 19/19 | ✓ 14/14 | 83 |
| sc-3 | g1-5/sc-3-t1.json | one | 67 | netcut | ✓ 18/18 | ✓ 14/14 | 85 |
| sc-4-2 | g1-5/sc-4-2-t1.json | two | 67 | close | ✓ 18/18 | ✓ 14/14 | 100 |
| sc-4 | g1-5/sc-4-t1.json | one | 82 | yearend | ✓ 18/18 | ✓ 14/14 | 93 |
| sc-5-2 | g1-5/sc-5-2-t1.json | two | 59 | none | ✓ 18/18 | ✓ 14/14 | 72 |
| sc-5 | g1-5/sc-5-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 84 |
| ss-5-2 | g1-5/ss-5-2-t1.json | two | 45 | busy | ✓ 20/20 | ✓ 14/14 | 67 |
| ss-5 | g1-5/ss-5-t1.json | one | 59 | reject | ✓ 19/19 | ✓ 14/14 | 80 |
| va-1-2 | g1-5/va-1-2-t1.json | two | 17 | netcut | ✓ 18/18 | ✓ 14/14 | 47 |
| va-1 | g1-5/va-1-t1.json | one | 17 | close | ✓ 18/18 | ✓ 14/14 | 47 |
| va-2-2 | g1-5/va-2-2-t1.json | two | 17 | yearend | ✓ 18/18 | ✓ 14/14 | 46 |
| va-2 | g1-5/va-2-t1.json | one | 17 | none | ✓ 18/18 | ✓ 14/14 | 46 |
| va-3-2 | g1-5/va-3-2-t1.json | two | 17 | holidays | ✓ 20/20 | ✓ 14/14 | 45 |
| va-3 | g1-5/va-3-t1.json | one | 17 | busy | ✓ 20/20 | ✓ 14/14 | 44 |
| va-4-2 | g1-5/va-4-2-t1.json | two | 17 | reject | ✓ 19/19 | ✓ 14/14 | 45 |
| va-4 | g1-5/va-4-t1.json | one | 17 | netcut | ✓ 18/18 | ✓ 14/14 | 44 |
| va-5-2 | g1-5/va-5-2-t1.json | two | 15 | close | ✓ 18/18 | ✓ 14/14 | 61 |
| va-5 | g1-5/va-5-t1.json | one | 15 | yearend | ✓ 18/18 | ✓ 14/14 | 42 |
| ar-11-2 | g11/ar-11-2-t1.json | two | 72 | none | ✓ 18/18 | ✓ 14/14 | 85 |
| ar-11 | g11/ar-11-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 88 |
| bi-11-2 | g11/bi-11-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 88 |
| bi-11 | g11/bi-11-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 86 |
| ch-11-2 | g11/ch-11-2-t1.json | two | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 86 |
| ch-11 | g11/ch-11-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 105 |
| en-11-2 | g11/en-11-2-t1.json | two | 58 | yearend | ✓ 18/18 | ✓ 14/14 | 119 |
| en-11 | g11/en-11-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 142 |
| es-11-2 | g11/es-11-2-t1.json | two | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 100 |
| es-11 | g11/es-11-t1.json | one | 73 | busy | ✓ 20/20 | ✓ 14/14 | 94 |
| fa-11-2 | g11/fa-11-2-t1.json | two | 73 | reject | ✓ 19/19 | ✓ 14/14 | 94 |
| fa-11 | g11/fa-11-t1.json | one | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 93 |
| hc-11-2 | g11/hc-11-2-t1.json | two | 73 | close | ✓ 18/18 | ✓ 14/14 | 93 |
| hc-11 | g11/hc-11-t1.json | one | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 95 |
| is-11-2 | g11/is-11-2-t1.json | two | 45 | none | ✓ 18/18 | ✓ 14/14 | 65 |
| is-11 | g11/is-11-t1.json | one | 59 | holidays | ✓ 20/20 | ✓ 14/14 | 76 |
| it-11-2 | g11/it-11-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 94 |
| it-11 | g11/it-11-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 96 |
| ma-11-2 | g11/ma-11-2-t1.json | two | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 140 |
| ma-11 | g11/ma-11-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 138 |
| mb-11-2 | g11/mb-11-2-t1.json | two | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 137 |
| mb-11 | g11/mb-11-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 141 |
| ph-11-2 | g11/ph-11-2-t1.json | two | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 89 |
| ph-11 | g11/ph-11-t1.json | one | 73 | busy | ✓ 20/20 | ✓ 14/14 | 90 |
| sp-11-2 | g11/sp-11-2-t1.json | two | 73 | reject | ✓ 19/19 | ✓ 14/14 | 92 |
| sp-11 | g11/sp-11-t1.json | one | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 93 |
| wt-11-2 | g11/wt-11-2-t1.json | two | 30 | close | ✓ 18/18 | ✓ 14/14 | 60 |
| wt-11 | g11/wt-11-t1.json | one | 30 | yearend | ✓ 18/18 | ✓ 14/14 | 54 |
| ar-12-2 | g12/ar-12-2-t1.json | two | 72 | none | ✓ 18/18 | ✓ 14/14 | 86 |
| ar-12 | g12/ar-12-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 90 |
| bi-12-2 | g12/bi-12-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 86 |
| bi-12 | g12/bi-12-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 89 |
| ch-12-2 | g12/ch-12-2-t1.json | two | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 91 |
| ch-12 | g12/ch-12-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 91 |
| en-12-2 | g12/en-12-2-t1.json | two | 58 | yearend | ✓ 18/18 | ✓ 14/14 | 76 |
| en-12 | g12/en-12-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 90 |
| fa-12-2 | g12/fa-12-2-t1.json | two | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 93 |
| fa-12 | g12/fa-12-t1.json | one | 73 | busy | ✓ 20/20 | ✓ 14/14 | 89 |
| is-12-2 | g12/is-12-2-t1.json | two | 45 | reject | ✓ 19/19 | ✓ 14/14 | 65 |
| is-12 | g12/is-12-t1.json | one | 59 | netcut | ✓ 18/18 | ✓ 14/14 | 75 |
| it-12-2 | g12/it-12-2-t1.json | two | 73 | close | ✓ 18/18 | ✓ 14/14 | 110 |
| it-12 | g12/it-12-t1.json | one | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 90 |
| ma-12-2 | g12/ma-12-2-t1.json | two | 73 | none | ✓ 18/18 | ✓ 14/14 | 88 |
| ma-12 | g12/ma-12-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 90 |
| mt-12-2 | g12/mt-12-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 87 |
| mt-12 | g12/mt-12-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 90 |
| ph-12-2 | g12/ph-12-2-t1.json | two | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 86 |
| ph-12 | g12/ph-12-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 108 |
| sp-12-2 | g12/sp-12-2-t1.json | two | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 87 |
| sp-12 | g12/sp-12-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 87 |
| wt-12-2 | g12/wt-12-2-t1.json | two | 30 | holidays | ✓ 20/20 | ✓ 14/14 | 57 |
| wt-12 | g12/wt-12-t1.json | one | 30 | busy | ✓ 20/20 | ✓ 14/14 | 57 |
| ar-10-2 | g6-10/ar-10-2-t1.json | two | 73 | reject | ✓ 19/19 | ✓ 14/14 | 97 |
| ar-10 | g6-10/ar-10-t1.json | one | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 97 |
| ar-6-2 | g6-10/ar-6-2-t1.json | two | 73 | close | ✓ 18/18 | ✓ 14/14 | 95 |
| ar-6 | g6-10/ar-6-t1.json | one | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 93 |
| ar-7-2 | g6-10/ar-7-2-t1.json | two | 73 | none | ✓ 18/18 | ✓ 14/14 | 91 |
| ar-7 | g6-10/ar-7-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 93 |
| ar-8-2 | g6-10/ar-8-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 93 |
| ar-8 | g6-10/ar-8-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 93 |
| ar-9-2 | g6-10/ar-9-2-t1.json | two | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 93 |
| ar-9 | g6-10/ar-9-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 93 |
| bi-10-2 | g6-10/bi-10-2-t1.json | two | 30 | yearend | ✓ 18/18 | ✓ 14/14 | 54 |
| bi-10 | g6-10/bi-10-t1.json | one | 45 | none | ✓ 18/18 | ✓ 14/14 | 67 |
| bi-9-2 | g6-10/bi-9-2-t1.json | two | 30 | holidays | ✓ 20/20 | ✓ 14/14 | 55 |
| bi-9 | g6-10/bi-9-t1.json | one | 45 | busy | ✓ 20/20 | ✓ 14/14 | 64 |
| ch-10-2 | g6-10/ch-10-2-t1.json | two | 30 | reject | ✓ 19/19 | ✓ 14/14 | 53 |
| ch-10 | g6-10/ch-10-t1.json | one | 45 | netcut | ✓ 18/18 | ✓ 14/14 | 63 |
| ch-9-2 | g6-10/ch-9-2-t1.json | two | 30 | close | ✓ 18/18 | ✓ 14/14 | 70 |
| ch-9 | g6-10/ch-9-t1.json | one | 45 | yearend | ✓ 18/18 | ✓ 14/14 | 64 |
| en-10-2 | g6-10/en-10-2-t1.json | two | 72 | none | ✓ 18/18 | ✓ 14/14 | 83 |
| en-10 | g6-10/en-10-t1.json | one | 72 | holidays | ✓ 20/20 | ✓ 14/14 | 86 |
| en-6-2 | g6-10/en-6-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 86 |
| en-6 | g6-10/en-6-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 88 |
| en-7-2 | g6-10/en-7-2-t1.json | two | 73 | netcut | ✓ 18/18 | ✓ 14/14 | 139 |
| en-7 | g6-10/en-7-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 144 |
| en-8-2 | g6-10/en-8-2-t1.json | two | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 88 |
| en-8 | g6-10/en-8-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 88 |
| en-9-2 | g6-10/en-9-2-t1.json | two | 72 | holidays | ✓ 20/20 | ✓ 14/14 | 85 |
| en-9 | g6-10/en-9-t1.json | one | 72 | busy | ✓ 20/20 | ✓ 14/14 | 86 |
| fa-10-2 | g6-10/fa-10-2-t1.json | two | 15 | reject | ✓ 19/19 | ✓ 14/14 | 43 |
| fa-10 | g6-10/fa-10-t1.json | one | 15 | netcut | ✓ 18/18 | ✓ 14/14 | 42 |
| fa-9-2 | g6-10/fa-9-2-t1.json | two | 15 | close | ✓ 18/18 | ✓ 14/14 | 65 |
| fa-9 | g6-10/fa-9-t1.json | one | 15 | yearend | ✓ 18/18 | ✓ 14/14 | 42 |
| is-10-2 | g6-10/is-10-2-t1.json | two | 59 | none | ✓ 18/18 | ✓ 14/14 | 75 |
| is-10 | g6-10/is-10-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 86 |
| is-6-2 | g6-10/is-6-2-t1.json | two | 59 | busy | ✓ 20/20 | ✓ 14/14 | 76 |
| is-6 | g6-10/is-6-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 88 |
| is-7-2 | g6-10/is-7-2-t1.json | two | 45 | netcut | ✓ 18/18 | ✓ 14/14 | 64 |
| is-7 | g6-10/is-7-t1.json | one | 73 | close | ✓ 18/18 | ✓ 14/14 | 105 |
| is-8-2 | g6-10/is-8-2-t1.json | two | 45 | yearend | ✓ 18/18 | ✓ 14/14 | 66 |
| is-8 | g6-10/is-8-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 84 |
| is-9-2 | g6-10/is-9-2-t1.json | two | 59 | holidays | ✓ 20/20 | ✓ 14/14 | 73 |
| is-9 | g6-10/is-9-t1.json | one | 73 | busy | ✓ 20/20 | ✓ 14/14 | 84 |
| it-10-2 | g6-10/it-10-2-t1.json | two | 22 | reject | ✗ 18/19 | ✓ 14/14 | 47 |
| it-10 | g6-10/it-10-t1.json | one | 22 | netcut | ✗ 17/18 | ✓ 14/14 | 48 |
| it-6-2 | g6-10/it-6-2-t1.json | two | 30 | close | ✓ 18/18 | ✓ 14/14 | 54 |
| it-6 | g6-10/it-6-t1.json | one | 30 | yearend | ✓ 18/18 | ✓ 14/14 | 52 |
| it-7-2 | g6-10/it-7-2-t1.json | two | 30 | none | ✓ 18/18 | ✓ 14/14 | 53 |
| it-7 | g6-10/it-7-t1.json | one | 30 | holidays | ✓ 20/20 | ✓ 14/14 | 50 |
| it-8-2 | g6-10/it-8-2-t1.json | two | 30 | busy | ✓ 20/20 | ✓ 14/14 | 52 |
| it-8 | g6-10/it-8-t1.json | one | 30 | reject | ✓ 19/19 | ✓ 14/14 | 54 |
| it-9-2 | g6-10/it-9-2-t1.json | two | 30 | netcut | ✓ 18/18 | ✓ 14/14 | 53 |
| it-9 | g6-10/it-9-t1.json | one | 30 | close | ✓ 18/18 | ✓ 14/14 | 53 |
| ma-10-2 | g6-10/ma-10-2-t1.json | two | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 87 |
| ma-10 | g6-10/ma-10-t1.json | one | 73 | none | ✓ 18/18 | ✓ 14/14 | 89 |
| ma-6-2 | g6-10/ma-6-2-t1.json | two | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 88 |
| ma-6 | g6-10/ma-6-t1.json | one | 73 | busy | ✓ 20/20 | ✓ 14/14 | 90 |
| ma-7-2 | g6-10/ma-7-2-t1.json | two | 73 | reject | ✓ 19/19 | ✓ 14/14 | 89 |
| ma-7 | g6-10/ma-7-t1.json | one | 73 | netcut | ✗ 17/18 | ✓ 14/14 | 88 |
| ma-8-2 | g6-10/ma-8-2-t1.json | two | 73 | close | ✓ 18/18 | ✓ 14/14 | 156 |
| ma-8 | g6-10/ma-8-t1.json | one | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 133 |
| ma-9-2 | g6-10/ma-9-2-t1.json | two | 73 | none | ✓ 18/18 | ✓ 14/14 | 85 |
| ma-9 | g6-10/ma-9-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 84 |
| pe-6-2 | g6-10/pe-6-2-t1.json | two | 15 | busy | ✓ 20/20 | ✓ 14/14 | 40 |
| pe-6 | g6-10/pe-6-t1.json | one | 30 | reject | ✓ 19/19 | ✓ 14/14 | 52 |
| pe-7-2 | g6-10/pe-7-2-t1.json | two | 15 | netcut | ✓ 18/18 | ✓ 14/14 | 42 |
| pe-7 | g6-10/pe-7-t1.json | one | 30 | close | ✓ 18/18 | ✓ 14/14 | 55 |
| pe-8-2 | g6-10/pe-8-2-t1.json | two | 15 | yearend | ✓ 18/18 | ✓ 14/14 | 41 |
| pe-8 | g6-10/pe-8-t1.json | one | 30 | none | ✓ 18/18 | ✓ 14/14 | 52 |
| ph-10-2 | g6-10/ph-10-2-t1.json | two | 30 | holidays | ✓ 20/20 | ✓ 14/14 | 53 |
| ph-10 | g6-10/ph-10-t1.json | one | 45 | busy | ✓ 20/20 | ✓ 14/14 | 61 |
| ph-9-2 | g6-10/ph-9-2-t1.json | two | 30 | reject | ✓ 19/19 | ✓ 14/14 | 52 |
| ph-9 | g6-10/ph-9-t1.json | one | 45 | netcut | ✓ 18/18 | ✓ 14/14 | 62 |
| sc-6-2 | g6-10/sc-6-2-t1.json | two | 59 | close | ✓ 18/18 | ✓ 14/14 | 94 |
| sc-6 | g6-10/sc-6-t1.json | one | 73 | yearend | ✓ 18/18 | ✓ 14/14 | 87 |
| sc-7-2 | g6-10/sc-7-2-t1.json | two | 73 | none | ✓ 18/18 | ✓ 14/14 | 86 |
| sc-7 | g6-10/sc-7-t1.json | one | 73 | holidays | ✓ 20/20 | ✓ 14/14 | 89 |
| sc-8-2 | g6-10/sc-8-2-t1.json | two | 73 | busy | ✓ 20/20 | ✓ 14/14 | 90 |
| sc-8 | g6-10/sc-8-t1.json | one | 73 | reject | ✓ 19/19 | ✓ 14/14 | 90 |
| sp-10-2 | g6-10/sp-10-2-t1.json | two | 15 | netcut | ✓ 18/18 | ✓ 14/14 | 42 |
| sp-10 | g6-10/sp-10-t1.json | one | 15 | close | ✓ 18/18 | ✓ 14/14 | 46 |
| sp-9-2 | g6-10/sp-9-2-t1.json | two | 15 | yearend | ✓ 18/18 | ✓ 14/14 | 39 |
| sp-9 | g6-10/sp-9-t1.json | one | 15 | none | ✓ 18/18 | ✓ 14/14 | 40 |
| ss-10-2 | g6-10/ss-10-2-t1.json | two | 30 | holidays | ✓ 20/20 | ✓ 14/14 | 52 |
| ss-10 | g6-10/ss-10-t1.json | one | 30 | busy | ✓ 20/20 | ✓ 14/14 | 52 |
| ss-6-2 | g6-10/ss-6-2-t1.json | two | 45 | reject | ✓ 19/19 | ✓ 14/14 | 66 |
| ss-6 | g6-10/ss-6-t1.json | one | 59 | netcut | ✓ 18/18 | ✓ 14/14 | 79 |
| ss-7-2 | g6-10/ss-7-2-t1.json | two | 45 | close | ✓ 18/18 | ✓ 14/14 | 77 |
| ss-7 | g6-10/ss-7-t1.json | one | 59 | yearend | ✓ 18/18 | ✓ 14/14 | 78 |
| ss-8-2 | g6-10/ss-8-2-t1.json | two | 45 | none | ✓ 18/18 | ✓ 14/14 | 68 |
| ss-8 | g6-10/ss-8-t1.json | one | 59 | holidays | ✓ 20/20 | ✓ 14/14 | 78 |
| ss-9-2 | g6-10/ss-9-2-t1.json | two | 30 | busy | ✓ 20/20 | ✓ 14/14 | 55 |
| ss-9 | g6-10/ss-9-t1.json | one | 30 | reject | ✓ 19/19 | ✓ 14/14 | 54 |
| va-6-2 | g6-10/va-6-2-t1.json | two | 15 | netcut | ✓ 18/18 | ✓ 14/14 | 44 |
| va-6 | g6-10/va-6-t1.json | one | 15 | close | ✓ 18/18 | ✓ 14/14 | 66 |
| va-7-2 | g6-10/va-7-2-t1.json | two | 15 | yearend | ✓ 18/18 | ✓ 14/14 | 44 |
| va-7 | g6-10/va-7-t1.json | one | 15 | none | ✓ 18/18 | ✓ 14/14 | 43 |
| va-8-2 | g6-10/va-8-2-t1.json | two | 15 | holidays | ✓ 20/20 | ✓ 14/14 | 40 |
| va-8 | g6-10/va-8-t1.json | one | 15 | busy | ✓ 20/20 | ✓ 14/14 | 41 |

## Failures

### it-10-2 — term (fault: reject, 22 sessions, two)

```
{"rejectAtSave":["2026-10-11","2026-11-16"],"final":"✓ تمت التعبئة بنجاح | نُشر ٢٢ حصة من الأحد ٦ سبتمبر إلى الأحد ١٣ ديسمبر.","saved":22,"posts":24,"renamed":[{"lesson":"مقدمة في تصميم مواقع الويب","noor":"مقدمه في تصميم مواقع الويب","how":"taa","sessions":2,"saved":2},{"lesson":"المشروع (تصميم مواقع الويب)","noor":"المشروع (تصميم مواقع ويب)","how":"article","sessions":2,"saved":2}],"rerun":"✓ هذه الحصص موجودة في نور | "}
```
- **content: «المفاهيم» in Noor = the session's own text (HTML stripped)**
  ```
  it-10-2-t1-013: got «1. رأس الصفحة (Header): يُستخدم لإضافة وصف ومعلومات عن موقع الويب تظهر للزوار في نتائج البحث. 2. تذييل الصفحة (Footer): » expected «1. رأس الصفحة (Header): يُستخدم لإضافة وصف ومعلومات عن موقع الويب تظهر للزوار في نتائج البحث. 2. تذييل الصفحة (Footer): »
  ```
  <details><summary>extension log (last lines)</summary>

  ```
  [info] بطاقة المادة (اختيارك السابق): «تقنية المعلومات — الصف العاشر»
  [info] التواريخ: كما في ملف المادة (٢٢ حصة لها تاريخ) — وما بلا تاريخ يتبع ما قبله
  [info] قائمة التحاضير في نور: ٢٢ تحضيرًا.
  [info] شجرة نور — الفصل «الفصل الدراسي الأول»: ١ وحدة و٦ درسًا: الوحدة الأولى: تصميم مواقع الويب (٦)
  [ok] ✔ مكتمل: كل حصص «تقنية المعلومات — العاشر — الفصل الأول» مُدخلة في نور (٢٢ من ٢٢)
  ```
  </details>
  <details><summary>Noor POSTs</summary>

  ```
  #1 2026-09-06 «مقدمه في تصميم مواقع الويب» lesson=5001 → saved
  #2 2026-09-07 «مقدمه في تصميم مواقع الويب (2)» lesson=5001 → saved
  #3 2026-09-13 «تصميم موقع ويب» lesson=5002 → saved
  #4 2026-09-20 «تصميم موقع ويب (2)» lesson=5002 → saved
  #5 2026-09-21 «تصميم موقع ويب (3)» lesson=5002 → saved
  #6 2026-09-27 «تصميم موقع ويب (4)» lesson=5002 → saved
  #7 2026-10-04 «تصميم موقع ويب (5)» lesson=5002 → saved
  #8 2026-10-05 «تصميم موقع ويب (6)» lesson=5002 → saved
  #9 2026-10-11 «التعامل مع عناصر HTML» lesson=5003 → date-rejected
  #10 2026-10-12 «التعامل مع عناصر HTML» lesson=5003 → saved
  #11 2026-10-18 «التعامل مع عناصر HTML (2)» lesson=5003 → saved
  #12 2026-10-19 «التعامل مع عناصر HTML (3)» lesson=5003 → saved
  #13 2026-10-25 «التعامل مع عناصر HTML (4)» lesson=5003 → saved
  #14 2026-11-01 «التعامل مع عناصر HTML (5)» lesson=5003 → saved
  #15 2026-11-02 «التعامل مع عناصر HTML (6)» lesson=5003 → saved
  #16 2026-11-08 «تحسين مظهر صفحات الويب» lesson=5004 → saved
  #17 2026-11-15 «تحسين مظهر صفحات الويب (2)» lesson=5004 → saved
  #18 2026-11-16 «تحسين مظهر صفحات الويب (3)» lesson=5004 → date-rejected
  #19 2026-11-17 «تحسين مظهر صفحات الويب (3)» lesson=5004 → saved
  #20 2026-11-22 «تحسين مظهر صفحات الويب (4)» lesson=5004 → saved
  #21 2026-11-29 «نشر موقع الويب» lesson=5005 → saved
  #22 2026-11-30 «نشر موقع الويب (2)» lesson=5005 → saved
  #23 2026-12-06 «المشروع (تصميم مواقع ويب)» lesson=5006 → saved
  #24 2026-12-13 «المشروع (تصميم مواقع ويب) (2)» lesson=5006 → saved
  ```
  </details>

### it-10 — term (fault: netcut, 22 sessions, one)

```
{"netcutPosts":[2,11],"final":"✓ تمت التعبئة بنجاح | نُشر ٢٢ حصة من الأحد ٦ سبتمبر إلى الأحد ١٣ ديسمبر.","saved":22,"posts":22,"renamed":[{"lesson":"تصميم موقع ويب","noor":"تصميم موقع الويب","how":"article","sessions":6,"saved":6},{"lesson":"نشر موقع الويب","noor":"نشر موقع ويب","how":"article","sessions":2,"saved":2}],"rerun":"✓ هذه الحصص موجودة في نور | "}
```
- **content: «المفاهيم» in Noor = the session's own text (HTML stripped)**
  ```
  it-10-t1-013: got «1. رأس الصفحة (Header): يُستخدم لإضافة وصف ومعلومات عن موقع الويب تظهر للزوار في نتائج البحث. 2. تذييل الصفحة (Footer): » expected «1. رأس الصفحة (Header): يُستخدم لإضافة وصف ومعلومات عن موقع الويب تظهر للزوار في نتائج البحث. 2. تذييل الصفحة (Footer): »
  ```
  <details><summary>extension log (last lines)</summary>

  ```
  [info] بطاقة المادة (اختيارك السابق): «تقنية المعلومات — الصف العاشر»
  [info] التواريخ: كما في ملف المادة (٢٢ حصة لها تاريخ) — وما بلا تاريخ يتبع ما قبله
  [info] قائمة التحاضير في نور: ٢٢ تحضيرًا.
  [info] شجرة نور — الفصل «الفصل الدراسي الأول»: ١ وحدة و٦ درسًا: الوحدة الأولى: تصميم مواقع الويب (٦)
  [ok] ✔ مكتمل: كل حصص «تقنية المعلومات — العاشر — الفصل الأول» مُدخلة في نور (٢٢ من ٢٢)
  ```
  </details>
  <details><summary>Noor POSTs</summary>

  ```
  #1 2026-09-06 «مقدمة في تصميم مواقع الويب» lesson=5001 → saved
  #2 2026-09-07 «مقدمة في تصميم مواقع الويب (2)» lesson=5001 → saved-abort
  #3 2026-09-13 «تصميم موقع الويب» lesson=5002 → saved
  #4 2026-09-20 «تصميم موقع الويب (2)» lesson=5002 → saved
  #5 2026-09-21 «تصميم موقع الويب (3)» lesson=5002 → saved
  #6 2026-09-27 «تصميم موقع الويب (4)» lesson=5002 → saved
  #7 2026-10-04 «تصميم موقع الويب (5)» lesson=5002 → saved
  #8 2026-10-05 «تصميم موقع الويب (6)» lesson=5002 → saved
  #9 2026-10-11 «التعامل مع عناصر HTML» lesson=5003 → saved
  #10 2026-10-18 «التعامل مع عناصر HTML (2)» lesson=5003 → saved
  #11 2026-10-19 «التعامل مع عناصر HTML (3)» lesson=5003 → saved-abort
  #12 2026-10-25 «التعامل مع عناصر HTML (4)» lesson=5003 → saved
  #13 2026-11-01 «التعامل مع عناصر HTML (5)» lesson=5003 → saved
  #14 2026-11-02 «التعامل مع عناصر HTML (6)» lesson=5003 → saved
  #15 2026-11-08 «تحسين مظهر صفحات الويب» lesson=5004 → saved
  #16 2026-11-15 «تحسين مظهر صفحات الويب (2)» lesson=5004 → saved
  #17 2026-11-16 «تحسين مظهر صفحات الويب (3)» lesson=5004 → saved
  #18 2026-11-22 «تحسين مظهر صفحات الويب (4)» lesson=5004 → saved
  #19 2026-11-29 «نشر موقع ويب» lesson=5005 → saved
  #20 2026-11-30 «نشر موقع ويب (2)» lesson=5005 → saved
  #21 2026-12-06 «المشروع (تصميم مواقع الويب)» lesson=5006 → saved
  #22 2026-12-13 «المشروع (تصميم مواقع الويب) (2)» lesson=5006 → saved
  ```
  </details>

### ma-7 — term (fault: netcut, 73 sessions, one)

```
{"netcutPosts":[2,36],"final":"✓ تمت التعبئة بنجاح | نُشر ٧٣ حصة من الأحد ٦ سبتمبر إلى الخميس ١٧ ديسمبر.","saved":73,"posts":73,"renamed":[{"lesson":"التقريب","noor":"تقريب","how":"article","sessions":1,"saved":1},{"lesson":"مساحة المستطيل ومحيطه","noor":"مساحة  المستطيل ومحيطه ","how":"spacing","sessions":2,"saved":2}],"rerun":"✓ هذه الحصص موجودة في نور | "}
```
- **content: «المفاهيم» in Noor = the session's own text (HTML stripped)**
  ```
  ma-7-t1-022: got «الحصة الأولى: تطبيقات الترتيب واستخدام الرموز = و ≠ و الرمز ≠ المساواة الترتيب القياس الحصة الثانية: تقريب الأعداد إلى أ» expected «الحصة الأولى: تطبيقات الترتيب واستخدام الرموز = و ≠ و < و > الرمز ≠ المساواة الترتيب القياس الحصة الثانية: تقريب الأعداد»
  ```
  <details><summary>extension log (last lines)</summary>

  ```
  [info] بطاقة المادة (اختيارك السابق): «الرياضيات — الصف السابع»
  [info] التواريخ: كما في ملف المادة (٧٣ حصة لها تاريخ) — وما بلا تاريخ يتبع ما قبله
  [info] قائمة التحاضير في نور: ٧٣ تحضيرًا.
  [info] شجرة نور — الفصل «الفصل الدراسي الأول»: ٨ وحدة و٤٣ درسًا: الوحدة الأولى: الأعداد الصحيحة والقوى والجذور (٦)، الوحدة الثانية: العبارات الجبرية والمعادلات والصيغ (٥)، الوحدة الثالثة: القيمة المكانية والترتيب والتقريب (٨)، الوحدة الرابعة: الطول والكتلة والسعة (٢)، الوحدة الخامسة: الزوايا (٤)، الوحدة السادسة: الكسور (1) (٨)، الوحدة السابعة: المساحة والمحيط (٦)، الوحدة الثامنة: النسب المئوية (٤)
  [ok] ✔ مكتمل: كل حصص «الرياضيات — السابع — الفصل الأول» مُدخلة في نور (٧٣ من ٧٣)
  ```
  </details>
  <details><summary>Noor POSTs</summary>

  ```
  #34 2026-10-21 «التعرّف على وحدات القياس» lesson=5020 → saved
  #35 2026-10-22 «اختيار وحدات القياس المناسبة» lesson=5021 → saved
  #36 2026-10-25 «تسمية الزوايا وتقديرها» lesson=5022 → saved-abort
  #37 2026-10-26 «قياسات الزوايا» lesson=5023 → saved
  #38 2026-10-27 «حل مسائل الزوايا» lesson=5024 → saved
  #39 2026-10-28 «الخطوط المتوازية» lesson=5025 → saved
  #40 2026-10-29 «الخطوط المتوازية (2)» lesson=5025 → saved
  #41 2026-11-01 «تبسيط الكسور» lesson=5026 → saved
  #42 2026-11-02 «مقارنة الكسور» lesson=5027 → saved
  #43 2026-11-03 «الكسور غير الاعتيادية والأعداد الكسرية» lesson=5028 → saved
  #44 2026-11-04 «جمع الكسور وطرحها» lesson=5029 → saved
  #45 2026-11-05 «جمع الكسور وطرحها (2)» lesson=5029 → saved
  #46 2026-11-08 «استخدام الكسور مع الكميات» lesson=5030 → saved
  #47 2026-11-09 «تحويل الكسور إلى كسور عشرية» lesson=5031 → saved
  #48 2026-11-10 «ترتيب الكسور» lesson=5032 → saved
  #49 2026-11-11 «ترتيب الكسور (2)» lesson=5032 → saved
  #50 2026-11-12 «حساب الباقي» lesson=5033 → saved
  #51 2026-11-15 «التحويل بين وحدات قياس المساحة» lesson=5034 → saved
  #52 2026-11-16 «مساحة  المستطيل ومحيطه» lesson=5035 → saved
  #53 2026-11-17 «مساحة المستطيل ومحيطه (2)» lesson=5035 → saved
  #54 2026-11-18 «مساحة المثلث» lesson=5036 → saved
  #55 2026-11-19 «مساحة المثلث (2)» lesson=5036 → saved
  #56 2026-11-22 «مساحة متوازي الأضلاع ومساحة شبه المنحرف» lesson=5037 → saved
  #57 2026-11-23 «مساحة الدائرة ومحيطها» lesson=5038 → saved
  #58 2026-11-24 «مساحة الدائرة ومحيطها (2)» lesson=5038 → saved
  #59 2026-11-29 «مساحة الأشكال المركبة» lesson=5039 → saved
  #60 2026-11-30 «مساحة الأشكال المركبة (2)» lesson=5039 → saved
  #61 2026-12-01 «النسب المئوية البسيطة» lesson=5040 → saved
  #62 2026-12-02 «النسب المئوية البسيطة (2)» lesson=5040 → saved
  #63 2026-12-03 «النسب المئوية البسيطة (3)» lesson=5040 → saved
  #64 2026-12-06 «حساب الكسور والكسور العشرية والنسب المئوية المتكافئة» lesson=5041 → saved
  #65 2026-12-07 «حساب الكسور والكسور العشرية والنسب المئوية المتكافئة (2)» lesson=5041 → saved
  #66 2026-12-08 «حساب النسب المئوية من الكميات» lesson=5042 → saved
  #67 2026-12-09 «حساب النسب المئوية من الكميات (2)» lesson=5042 → saved
  #68 2026-12-10 «حساب النسب المئوية من الكميات (3)» lesson=5042 → saved
  #69 2026-12-13 «تطبيقات على النسب المئوية» lesson=5043 → saved
  #70 2026-12-14 «تطبيقات على النسب المئوية (2)» lesson=5043 → saved
  #71 2026-12-15 «تطبيقات على النسب المئوية (3)» lesson=5043 → saved
  #72 2026-12-16 «تطبيقات على النسب المئوية (4)» lesson=5043 → saved
  #73 2026-12-17 «تطبيقات على النسب المئوية (5)» lesson=5043 → saved
  ```
  </details>

## Skipped files

- g1-5-report.md: not a .json file
- g11-report.md: not a .json file
- g12-report.md: not a .json file
- g6-10-report.md: not a .json file
- hader-preps-g1-5-t1.zip: not a .json file
- hader-preps-g11-t1.zip: not a .json file
- hader-preps-g12-t1.zip: not a .json file
- hader-preps-g6-10-t1.zip: not a .json file


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
- **N1 (cosmetic) — after the window was closed mid-run and the run resumed, the closing line counted only the sessions
  saved after the resume.** The resume now counts what this opening already saved.
- Date model: the extension lays the sessions out in the order of the official schedule (the file order, chronological),
  not lesson by lesson in tree order, so packages that interleave the sessions of different lessons (Quran units, poems)
  keep the schedule after a holiday/busy/rejected day. The expected-date check follows the same rule.
