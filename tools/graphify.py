#!/usr/bin/env python3
"""graphify.py — خريطة مرئية لمستودع منصة أفق في صفحة HTML واحدة مستقلة (RTL، فاتح وداكن، الهاتف).

الاستعمال:
    python3 tools/graphify.py [-o OUT.html] [--root REPO]

بلا مكتبات خارجية. الملفات المحسوبة هي ملفات git (git ls-files) إن توفر git، وإلا كل الملفات عدا .git وnode_modules.
أقسام الشجرة تؤخذ من جدول «المجلد | ما هو | أين يعمل» في README.md، وما لا يصفه الدليل يظهر في فرع مستقل.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone

MB = 1024 ** 2
GB = 1024 ** 3
# حدود المساحة المعروفة. site/ يُنشر كما هو على GitHub Pages (الحد 1 GB للموقع المنشور).
LIMITS = {'site': (1 * GB, 'من حد GitHub Pages <bdi dir="ltr">1 GB</bdi>')}
REPO_LIMIT = (1 * GB, 'الحجم الموصى به لمستودع GitHub <bdi dir="ltr">1 GB</bdi>')
FILE_WARN, FILE_BLOCK = 50 * MB, 100 * MB   # GitHub: تحذير عند 50 MB ورفض عند 100 MB للملف
SCRIPT_EXT = {'.py', '.mjs', '.js', '.sh', '.sql', '.yml', '.yaml'}
LIST_CAP = 40   # أقصى عدد ملفات يُعرض داخل مجلد واحد في الشجرة


# ---------------- جمع البيانات ----------------
def list_files(root):
    try:
        out = subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, check=True).stdout
        files = [f for f in out.decode('utf-8').split('\0') if f]
        if files:
            return [f for f in files if os.path.isfile(os.path.join(root, f))], 'git ls-files'
    except (OSError, subprocess.CalledProcessError):
        pass
    files = []
    for d, dirs, names in os.walk(root):
        dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules')]
        files += [os.path.relpath(os.path.join(d, n), root) for n in names]
    return files, 'كل الملفات'


def dir_size(path):
    total = 0
    for d, _, names in os.walk(path):
        for n in names:
            try:
                total += os.lstat(os.path.join(d, n)).st_size
            except OSError:
                pass
    return total


def readme_sections(root):
    """صفوف الجدول الأول في README.md الذي أول عمود فيه مسار بين `…`."""
    p = os.path.join(root, 'README.md')
    if not os.path.isfile(p):
        return []
    rows = []
    for line in open(p, encoding='utf-8'):
        m = re.match(r'\s*\|\s*`([^`]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|', line)
        if m:
            rows.append({'path': m.group(1).strip().rstrip('/'), 'what': m.group(2).strip(), 'where': m.group(3).strip()})
        elif rows and not line.strip().startswith('|'):
            break
    return rows


def first_line(path):
    """السطر الأول من شرح الملف: docstring في Python، أو أول تعليق ذي معنى، أو name: في yml."""
    ext = os.path.splitext(path)[1]
    try:
        text = open(path, encoding='utf-8', errors='replace').read(6000)
    except OSError:
        return ''
    if ext == '.py':
        m = re.search(r'^\s*(?:#.*\n|\s*\n)*[rRuU]?("""|\'\'\')\s*(.+)', text)
        if m:
            return m.group(2).strip().strip('"\'')
    if ext in ('.yml', '.yaml'):
        m = re.search(r'^name:\s*(.+)$', text, re.M)
        return m.group(1).strip() if m else ''
    for raw in text.splitlines()[:15]:
        s = raw.strip()
        if not s or s.startswith('#!'):
            continue
        m = re.match(r'^(?://+|#+|--+|/\*+|\*+)\s*(.*?)\s*(?:\*/)?$', s)
        if not m:
            break
        body = m.group(1).strip().strip('-=* ').strip()
        if body and re.search(r'\w', body) and not re.fullmatch(r'[=\-*#_ ]+', body):
            return body
    return ''


def human(n):
    for unit, size in (('GB', GB), ('MB', MB), ('KB', 1024)):
        if n >= size:
            return f'{n / size:.1f} {unit}'
    return f'{n} B'


def natural(s):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]


def hs(n):
    return f'<bdi dir="ltr">{human(n)}</bdi>'


def level(pct):
    return 'ok' if pct < 70 else ('warn' if pct <= 90 else 'bad')


def gather(root):
    files, source = list_files(root)
    sizes = {}
    for f in files:
        try:
            sizes[f] = os.path.getsize(os.path.join(root, f))
        except OSError:
            sizes[f] = 0
    dirs = set()
    for f in files:
        parts = f.split('/')[:-1]
        for i in range(1, len(parts) + 1):
            dirs.add('/'.join(parts[:i]))
    total = sum(sizes.values())

    # أعداد خاصة بهذا المشروع
    stats = {}
    man = os.path.join(root, 'extension/manifest.json')
    if os.path.isfile(man):
        try:
            stats['ext_version'] = json.load(open(man, encoding='utf-8')).get('version', '')
        except ValueError:
            pass
    games = defaultdict(lambda: {'lessons': 0, 'size': 0})
    for f in files:
        m = re.match(r'site/games/([^/]+)/(\d+)\.json$', f)
        if m:
            games[m.group(1)]['lessons'] += 1
            games[m.group(1)]['size'] += sizes[f]
    subjects = {}
    for pkg in games:
        p = os.path.join(root, 'site/games', pkg, '1.json')
        try:
            d = json.load(open(p, encoding='utf-8'))
            games[pkg]['subject'], games[pkg]['grade'] = d.get('subject', ''), d.get('grade', '')
            subjects.setdefault(pkg.split('-')[0], d.get('subject', ''))
        except (OSError, ValueError):
            games[pkg]['subject'] = games[pkg]['grade'] = ''
    stats['games'] = dict(games)
    stats['subjects'] = subjects
    trees = os.path.join(root, 'tests/noor-mock/real-trees/trees.json')
    if os.path.isfile(trees):
        try:
            stats['trees'] = sorted(k for k in json.load(open(trees, encoding='utf-8')) if not k.startswith('_'))
        except ValueError:
            stats['trees'] = []
    stats['sql'] = [f for f in files if f.startswith('site/supabase/') and f.endswith('.sql')]
    stats['pages'] = [f for f in files if re.match(r'site/[^/]+\.html$', f)]
    stats['ext_js'] = [f for f in files if re.match(r'extension/[^/]+\.js$', f)]
    stats['tests'] = [f for f in files if f.startswith('tests/') and os.path.splitext(f)[1] in ('.mjs', '.js', '.sh')]

    git_size = dir_size(os.path.join(root, '.git')) if os.path.isdir(os.path.join(root, '.git')) else 0
    return {'root': root, 'files': files, 'sizes': sizes, 'dirs': dirs, 'total': total,
            'source': source, 'stats': stats, 'git_size': git_size, 'sections': readme_sections(root)}


# ---------------- الملاحظات ----------------
def findings(D, scripts, tops):
    out = []   # (level, text-html)
    files, sizes = D['files'], D['sizes']
    for name, size, limit, label in tops:
        if limit:
            pct = size / limit[0] * 100
            if pct >= 70:
                out.append(('bad' if pct > 90 else 'warn', f'{code(name + "/")} يستعمل <bdi dir="ltr">{pct:.0f}%</bdi> {limit[1]}.'))
    for f in files:
        if sizes[f] >= FILE_BLOCK:
            out.append(('bad', f'{code(f)} حجمه {human(sizes[f])}: GitHub يرفض الملف فوق 100 MB.'))
        elif sizes[f] >= FILE_WARN:
            out.append(('warn', f'{code(f)} حجمه {human(sizes[f])}: GitHub يحذّر من الملف فوق 50 MB.'))
    repo = D['total'] + D['git_size']
    if repo >= 0.7 * REPO_LIMIT[0]:
        out.append(('warn', f'المستودع مع تاريخه {hs(repo)} من {REPO_LIMIT[1]}.'))
    described = {s['path'].split('/')[0] for s in D['sections']}
    if D['sections']:
        extra = sorted(t for t, *_ in tops if t not in described and t != '.')
        if extra:
            out.append(('info', 'مجلدات لا يصفها جدول الأقسام في README.md: ' + '، '.join(code(t + '/') for t in extra) + '.'))
        for s in D['sections']:
            if not os.path.exists(os.path.join(D['root'], s['path'])):
                out.append(('warn', f'README.md يذكر {code(s["path"])} وهو غير موجود.'))
    else:
        out.append(('info', 'لا يوجد في README.md جدول يصف أقسام المشروع، فالشجرة مبنية على المجلدات مباشرة.'))
    nodoc = [s['path'] for s in scripts if not s['doc']]
    if nodoc:
        out.append(('info', f'{len(nodoc)} سكربت بلا سطر شرح في أوله: ' + '، '.join(code(p) for p in nodoc[:8]) + ('…' if len(nodoc) > 8 else '') + '.'))
    empty = [f for f in files if sizes[f] == 0 and os.path.basename(f) not in ('.nojekyll', '.gitkeep')]
    if empty:
        out.append(('info', 'ملفات فارغة: ' + '، '.join(code(f) for f in empty[:8]) + '.'))
    games = D['stats'].get('games', {})
    if games:
        no_index = [p for p in games if f'site/games/{p}/index.json' not in sizes]
        if no_index:
            out.append(('warn', 'باقات أنشطة بلا index.json: ' + '، '.join(code(p) for p in sorted(no_index)) + '.'))
        no_subj = [p for p, g in games.items() if not g.get('subject')]
        if no_subj:
            out.append(('info', 'باقات أنشطة لم يُقرأ اسم مادتها: ' + '، '.join(code(p) for p in sorted(no_subj)) + '.'))
    return out


# ---------------- HTML ----------------
def esc(s):
    return html.escape(str(s), quote=True)


def code(p):
    return f'<code dir="ltr">{esc(p)}</code>'


def build_tree(D):
    """شجرة: dict اسم → dict، والملفات في المفتاح الخاص None."""
    tree = {}
    for f in D['files']:
        node = tree
        parts = f.split('/')
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node.setdefault(None, []).append(parts[-1])
    return tree


def subtree_stats(node, prefix, D, memo):
    if prefix in memo:
        return memo[prefix]
    n_files, size = 0, 0
    for f in node.get(None, []):
        n_files += 1
        size += D['sizes'][prefix + f]
    for k, v in node.items():
        if k is not None:
            a, b = subtree_stats(v, prefix + k + '/', D, memo)
            n_files, size = n_files + a, size + b
    memo[prefix] = (n_files, size)
    return memo[prefix]


def render_node(name, node, prefix, D, memo, notes, depth, open_=False):
    path = prefix + name + '/'
    n_files, size = subtree_stats(node, path, D, memo)
    subdirs = sorted((k for k in node if k is not None), key=natural)
    files = sorted(node.get(None, []))
    label = notes.get(path.rstrip('/'), '')
    g = D['stats'].get('games', {}).get(name) if prefix == 'site/games/' else None
    if g and g.get('subject'):
        label = f'{g["subject"]} — {g["grade"]}'
    count = f'{n_files} ملف' + (f' · {len(subdirs)} مجلد' if subdirs else '')
    head = (f'<summary><span class="nm" dir="ltr">{esc(name)}/</span>'
            f'{f"<span class=lbl>{esc(label)}</span>" if label else ""}'
            f'<span class="meta">{count} · {hs(size)}</span></summary>')
    body = []
    for k in subdirs:
        body.append(render_node(k, node[k], path, D, memo, notes, depth + 1))
    shown = files[:LIST_CAP]
    if shown:
        items = []
        for f in shown:
            fp = path + f
            note = notes.get(fp, '')
            items.append(f'<li><span dir="ltr">{esc(f)}</span>'
                         f'{f"<span class=lbl>{esc(note)}</span>" if note else ""}'
                         f'<span class="meta">{hs(D["sizes"][fp])}</span></li>')
        if len(files) > LIST_CAP:
            rest = files[LIST_CAP:]
            items.append(f'<li class="more">و{len(rest)} ملفًا آخر ({hs(sum(D["sizes"][path + f] for f in rest))})</li>')
        body.append('<ul class="files">' + ''.join(items) + '</ul>')
    return f'<details{" open" if open_ else ""}>{head}<div class="kids">{"".join(body)}</div></details>'


def render(D):
    root = D['root']
    st = D['stats']
    tree = build_tree(D)
    memo = {}
    tops_names = sorted(k for k in tree if k is not None)

    # أحجام المجلدات الرئيسية: الجذر، ثم مجلدات المستوى الثاني تحت site لأنه الأكبر والمحدود
    tops = []
    for t in tops_names:
        n, size = subtree_stats(tree[t], t + '/', D, memo)
        tops.append((t, size, LIMITS.get(t), None))
    root_files = tree.get(None, [])
    bars = []
    for name, size, limit, _ in sorted(tops, key=lambda x: -x[1]):
        if limit:
            pct, basis = size / limit[0] * 100, limit[1]
        else:
            pct, basis = (size / D['total'] * 100 if D['total'] else 0), 'من حجم المشروع كله'
        bars.append((name + '/', size, pct, basis))
    sub_bars = []
    for big in ('site',):
        if big in tree:
            lim = LIMITS.get(big)
            for k in sorted((k for k in tree[big] if k is not None), key=lambda k: -subtree_stats(tree[big][k], f'{big}/{k}/', D, memo)[1]):
                size = subtree_stats(tree[big][k], f'{big}/{k}/', D, memo)[1]
                pct = size / lim[0] * 100 if lim else size / D['total'] * 100
                sub_bars.append((f'{big}/{k}/', size, pct, lim[1] if lim else 'من حجم المشروع كله'))

    # السكربتات
    scripts = []
    for f in sorted(D['files']):
        ext = os.path.splitext(f)[1]
        if ext not in SCRIPT_EXT or f.startswith('site/games/'):
            continue
        if ext in ('.yml', '.yaml') and not f.startswith('.github/'):
            continue
        doc = first_line(os.path.join(root, f))
        base = os.path.basename(f)
        doc = re.sub(r'^' + re.escape(base) + r'\s*[—:-]\s*', '', doc)
        doc = re.sub(r'^' + re.escape(os.path.splitext(base)[0]) + r'\s*[—:-]\s*', '', doc)
        scripts.append({'path': f, 'doc': doc, 'size': D['sizes'][f], 'top': f.split('/')[0]})

    # أنواع الملفات
    types = defaultdict(lambda: [0, 0])
    for f in D['files']:
        ext = os.path.splitext(f)[1].lower() or os.path.basename(f)
        types[ext][0] += 1
        types[ext][1] += D['sizes'][f]

    notes = {}
    for s in D['sections']:
        notes[s['path']] = s['what'] + (f' · {s["where"]}' if s['where'] else '')
    for s in scripts:
        if s['doc']:
            notes.setdefault(s['path'], s['doc'])

    finds = findings(D, scripts, tops)

    # ---- بطاقات الأرقام
    games = st.get('games', {})
    cards = [
        ('الملفات', f'{len(D["files"]):,}', f'محسوبة من <bdi dir="ltr">{esc(D["source"])}</bdi>'),
        ('المجلدات', f'{len(D["dirs"]):,}', ''),
        ('الحجم الكلي', human(D['total']), f'مع تاريخ git {hs(D["total"] + D["git_size"])}'),
    ]
    if 'site' in tree:
        s = subtree_stats(tree['site'], 'site/', D, memo)[1]
        cards.append(('الموقع المنشور', human(s), f'<bdi dir="ltr">{s / GB * 100:.1f}%</bdi> من حد GitHub Pages ‏1 GB'))
    if st.get('ext_version'):
        cards.append(('إصدار «حاضر»', st['ext_version'], f'{len(st["ext_js"])} ملف JavaScript في الإضافة'))
    if games:
        cards.append(('أنشطة الدروس', f'{sum(g["lessons"] for g in games.values()):,}', f'في {len(games)} باقة'))
        cards.append(('المواد', str(len({g.get("subject") for g in games.values() if g.get("subject")})), 'لها أنشطة دروس'))
    if 'trees' in st:
        cards.append(('شجرات نور الحقيقية', str(len(st['trees'])), 'في اختبارات الإصدار'))
    if st['sql']:
        cards.append(('ملفات قاعدة البيانات', str(len(st['sql'])), 'SQL في <code dir="ltr">site/supabase/</code>'))
    if st['pages']:
        cards.append(('صفحات الموقع', str(len(st['pages'])), 'HTML في <code dir="ltr">site/</code>'))
    if st['tests']:
        cards.append(('سكربتات الاختبار', str(len(st['tests'])), 'في <code dir="ltr">tests/</code>'))

    def bar_rows(rows):
        out = []
        for name, size, pct, basis in rows:
            w = max(min(pct, 100), 0.6)
            out.append(f'<div class="bar"><div class="bl"><span dir="ltr" class="nm">{esc(name)}</span>'
                       f'<span class="meta">{hs(size)} · <bdi dir="ltr">{pct:.1f}%</bdi> {basis}</span></div>'
                       f'<div class="track"><div class="fill {level(pct)}" style="width:{w:.2f}%"></div></div></div>')
        return ''.join(out)

    # ---- الشجرة: أقسام README أولًا
    described, sec_html = set(), []
    order = []
    for s in D['sections']:
        top = s['path'].split('/')[0]
        if top in tree and top not in order:
            order.append(top)
    rest = [t for t in tops_names if t not in order]
    for t in order:
        sec_html.append(render_node(t, tree[t], '', D, memo, notes, 0, open_=True))
    if rest:
        inner = ''.join(render_node(t, tree[t], '', D, memo, notes, 1) for t in rest)
        title = 'غير موصوفة في README.md' if D['sections'] else 'المجلدات'
        sec_html.append(f'<details open><summary><span class="grp">{title}</span><span class="meta">{len(rest)} مجلد</span></summary><div class="kids">{inner}</div></details>')
    if root_files:
        items = ''.join(f'<li><span dir="ltr">{esc(f)}</span><span class="meta">{hs(D["sizes"][f])}</span></li>' for f in sorted(root_files))
        sec_html.append(f'<details><summary><span class="grp">ملفات الجذر</span><span class="meta">{len(root_files)} ملف</span></summary><div class="kids"><ul class="files">{items}</ul></div></details>')

    # ---- جداول
    script_rows = ''.join(
        f'<tr><td>{code(s["path"])}</td><td>{esc(s["doc"]) if s["doc"] else "<span class=muted>بلا شرح</span>"}</td><td class="num">{human(s["size"])}</td></tr>'
        for s in scripts)
    type_rows = ''.join(
        f'<tr><td>{code(ext)}</td><td class="num">{n:,}</td><td class="num">{human(sz)}</td><td class="num">{sz / D["total"] * 100 if D["total"] else 0:.1f}%</td></tr>'
        for ext, (n, sz) in sorted(types.items(), key=lambda x: -x[1][1]))
    games_rows = ''
    if games:
        by_subj = defaultdict(lambda: [0, 0, 0, []])
        for p, g in games.items():
            k = g.get('subject') or p.split('-')[0]
            by_subj[k][0] += 1
            by_subj[k][1] += g['lessons']
            by_subj[k][2] += g['size']
            by_subj[k][3].append(p)
        games_rows = ''.join(
            f'<tr><td>{esc(k)}</td><td class="num">{a}</td><td class="num">{b:,}</td><td class="num">{human(c)}</td>'
            f'<td dir="ltr" class="ids">{esc(" ".join(sorted(ps, key=lambda x: (x.split("-")[0], int(re.sub(r"\D", "", x) or 0)))))}</td></tr>'
            for k, (a, b, c, ps) in sorted(by_subj.items(), key=lambda x: -x[1][1]))
    largest = sorted(D['files'], key=lambda f: -D['sizes'][f])[:10]
    largest_rows = ''.join(f'<tr><td>{code(f)}</td><td class="num">{human(D["sizes"][f])}</td></tr>' for f in largest)
    find_html = ''.join(f'<li class="{lv}">{t}</li>' for lv, t in finds) or '<li class="ok">لا ملاحظات.</li>'

    repo_name = os.path.basename(os.path.abspath(root))
    try:
        rev = subprocess.run(['git', '-C', root, 'log', '-1', '--format=%h · %cs'], capture_output=True, text=True).stdout.strip()
    except OSError:
        rev = ''
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    return TEMPLATE.format(
        repo=esc(repo_name), rev=esc(rev), now=now,
        cards=''.join(f'<div class="card"><div class="k">{esc(a)}</div><div class="v" dir="ltr">{esc(b)}</div><div class="s">{c}</div></div>' for a, b, c in cards),
        bars=bar_rows(bars), sub_bars=bar_rows(sub_bars),
        finds=find_html, tree=''.join(sec_html),
        scripts=script_rows, n_scripts=len(scripts), types=type_rows, n_types=len(types),
        games_block=(GAMES_BLOCK.format(rows=games_rows) if games_rows else ''),
        largest=largest_rows)


GAMES_BLOCK = '''<section><h2>أنشطة الدروس حسب المادة</h2>
<p class="muted">من <code dir="ltr">site/games/&lt;باقة&gt;/&lt;رقم&gt;.json</code>، واسم المادة من أول درس في الباقة.</p>
<div class="tw"><table class="stack"><thead><tr><th>المادة</th><th>باقات</th><th>دروس</th><th>الحجم</th><th>الباقات</th></tr></thead><tbody>{rows}</tbody></table></div></section>'''

TEMPLATE = '''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>خريطة المشروع</title>
<style>
:root{{--bg:#f7f7f5;--panel:#fff;--ink:#1d1f23;--muted:#666b73;--line:#e3e3df;--track:#ececE8;--ok:#2e9e5b;--warn:#e08a1e;--bad:#d23c3c;--accent:#2563eb;--code:#f0f0ec}}
@media (prefers-color-scheme:dark){{:root{{--bg:#15171a;--panel:#1e2125;--ink:#e8e9eb;--muted:#9aa0a8;--line:#2e3238;--track:#2a2e33;--ok:#3fbf73;--warn:#f0a040;--bad:#f06060;--accent:#6ea8ff;--code:#2a2e33}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif}}
main{{max-width:1100px;margin:0 auto;padding:20px 16px 48px}}
h1{{font-size:1.5rem;margin:0 0 4px}} h2{{font-size:1.15rem;margin:0 0 12px}}
.muted,.meta{{color:var(--muted)}} .meta{{font-size:.85em;white-space:nowrap}}
section{{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:16px;min-width:0}}
code{{background:var(--code);border-radius:4px;padding:0 4px;font-size:.9em;unicode-bidi:isolate;overflow-wrap:anywhere}}
.cards{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:16px}}
.card{{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px}}
.card .k{{color:var(--muted);font-size:.85em}} .card .v{{font-size:1.5rem;font-weight:700;text-align:right}} .card .s{{color:var(--muted);font-size:.78em}}
.bar{{margin:10px 0}} .bl{{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}}
.bl .nm{{font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace}}
.track{{height:10px;background:var(--track);border-radius:6px;overflow:hidden;margin-top:4px}}
.fill{{height:100%;border-radius:6px}} .fill.ok{{background:var(--ok)}} .fill.warn{{background:var(--warn)}} .fill.bad{{background:var(--bad)}}
.legend{{display:flex;gap:14px;flex-wrap:wrap;font-size:.85em;color:var(--muted)}} .legend i{{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:4px}}
details{{margin:2px 0}} summary{{cursor:pointer;padding:4px 6px;border-radius:6px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;list-style:none}}
summary::-webkit-details-marker{{display:none}}
summary::before{{content:"◂";color:var(--muted);transition:transform .15s;display:inline-block}} details[open]>summary::before{{transform:rotate(-90deg)}}
summary:hover{{background:var(--track)}}
summary .grp{{font-weight:600}} summary .nm{{font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace}} .lbl{{color:var(--accent);font-size:.88em}}
.kids{{border-inline-start:1px dashed var(--line);margin-inline-start:10px;padding-inline-start:10px}}
ul.files{{list-style:none;margin:4px 0;padding:0}} ul.files li{{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;padding:1px 6px;font-size:.9em}}
ul.files li>span:first-child{{font-family:ui-monospace,Menlo,Consolas,monospace;word-break:break-all}} ul.files li.more{{color:var(--muted)}}
.tw{{overflow-x:auto;max-width:100%}}
table{{border-collapse:collapse;width:100%;font-size:.9em}} th,td{{padding:6px 8px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}}
th{{color:var(--muted);font-weight:600}} td.num{{text-align:left;white-space:nowrap;direction:ltr}} td.ids{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85em;min-width:160px}}
ul.finds{{margin:0;padding-inline-start:20px}} ul.finds li{{margin:4px 0}} ul.finds li::marker{{font-size:1.2em}}
ul.finds li.bad::marker{{color:var(--bad)}} ul.finds li.warn::marker{{color:var(--warn)}} ul.finds li.ok::marker{{color:var(--ok)}} ul.finds li.info::marker{{color:var(--accent)}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:16px}} .grid2>section{{margin-top:0}}
@media (max-width:720px){{.grid2{{grid-template-columns:1fr}} table.stack thead{{display:none}} table.stack tr{{display:block;border-bottom:1px solid var(--line);padding:6px 0}} table.stack td{{display:block;border:0;padding:2px 4px}} table.stack td.num{{display:inline-block;color:var(--muted)}} table.stack td:first-child{{font-weight:600}} h1{{font-size:1.3rem}} .card .v{{font-size:1.25rem}}}}
</style>
</head>
<body><main>
<h1>خريطة المشروع <span dir="ltr">{repo}</span></h1>
<div class="muted">آخر تعديل <span dir="ltr">{rev}</span> · أُنشئت <span dir="ltr">{now}</span></div>
<div class="cards">{cards}</div>

<section><h2>ملاحظات</h2><ul class="finds">{finds}</ul></section>

<section><h2>حجم المجلدات الرئيسية</h2>
<div class="legend"><span><i style="background:var(--ok)"></i>تحت <bdi dir="ltr">70%</bdi></span><span><i style="background:var(--warn)"></i><bdi dir="ltr">70–90%</bdi></span><span><i style="background:var(--bad)"></i>فوق <bdi dir="ltr">90%</bdi></span>
<span>النسبة من حد المساحة إن وُجد، وإلا من حجم المشروع كله.</span></div>
{bars}
<h2 style="margin-top:18px">داخل <span dir="ltr">site/</span> (الموقع المنشور)</h2>
{sub_bars}
</section>

<section><h2>بنية المشروع</h2>
<p class="muted">الأقسام من جدول README.md. اضغط أي فرع لفتحه أو إغلاقه.</p>
{tree}
</section>

<section><h2>السكربتات والأدوات ({n_scripts})</h2>
<div class="tw"><table class="stack"><thead><tr><th>الملف</th><th>الشرح (السطر الأول)</th><th>الحجم</th></tr></thead><tbody>{scripts}</tbody></table></div></section>

{games_block}

<div class="grid2">
<section><h2>أنواع الملفات ({n_types})</h2>
<div class="tw"><table><thead><tr><th>النوع</th><th>العدد</th><th>الحجم</th><th>النسبة</th></tr></thead><tbody>{types}</tbody></table></div></section>
<section><h2>أكبر الملفات</h2>
<div class="tw"><table><thead><tr><th>الملف</th><th>الحجم</th></tr></thead><tbody>{largest}</tbody></table></div></section>
</div>
</main></body></html>
'''


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description='خريطة مرئية للمشروع في صفحة HTML واحدة')
    ap.add_argument('--root', default=os.path.dirname(here), help='جذر المستودع (الافتراضي: المجلد فوق tools/)')
    ap.add_argument('-o', '--out', help='ملف الإخراج (الافتراضي: مجلد مؤقت خارج المستودع)')
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    out = args.out or os.path.join(tempfile.mkdtemp(prefix='graphify-'), 'project-map.html')
    if os.path.abspath(out).startswith(root + os.sep):
        sys.exit('اكتب الصفحة خارج المستودع: ' + out)
    D = gather(root)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(render(D))
    print(out)


if __name__ == '__main__':
    main()
