"""Проверка внутренних ссылок и файлов сайта: href/src в HTML, пути фото в данных."""
import json, os, re, sys, glob
from urllib.parse import urlparse
SITE = os.path.join(os.path.dirname(__file__), '..', 'site')
bad = []
for f in glob.glob(os.path.join(SITE, '*.html')):
    html = open(f, encoding='utf-8').read()
    for m in re.finditer(r'(?:href|src)="([^"#]+)', html):
        u = m.group(1)
        if u.startswith(('http:', 'https:', 'mailto:', 'tg:', 'data:', 'javascript:')) or '${' in u: continue
        p = urlparse(u).path
        if not p: continue
        if not os.path.exists(os.path.join(SITE, p)): bad.append((os.path.basename(f), u))
# js-модули: import-пути
for f in glob.glob(os.path.join(SITE, 'js', '**', '*.js'), recursive=True):
    for m in re.finditer(r"from\s+'(\.[^']+)'", open(f, encoding='utf-8').read()):
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), m.group(1)))): bad.append((f, m.group(1)))
    for m in re.finditer(r"'(assets/[^'$]+|img/[^'$]+)'", open(f, encoding='utf-8').read()):
        if not os.path.exists(os.path.join(SITE, m.group(1))): bad.append((f, m.group(1)))
idx = json.load(open(os.path.join(SITE, 'data', 'index.json'), encoding='utf-8'))
routes = idx['routes'] if isinstance(idx, dict) else idx
n = 0
for r in routes:
    d = json.load(open(os.path.join(SITE, 'data', 'r', r['id'] + '.json'), encoding='utf-8'))
    keys = [ph['k'] for ph in d.get('photos', [])] + ([d['cover']] if d.get('cover') else [])
    for k in keys:
        for suf in ('', '-s'):
            n += 1
            if not os.path.exists(os.path.join(SITE, 'img', 'photos', k + suf + '.webp')): bad.append((d['id'], k + suf))
    for g in d.get('guides', []):
        u = g.get('url') or g.get('href') or ''
        if u and not u.startswith('http') and not os.path.exists(os.path.join(SITE, u)): bad.append((d['id'], u))
print('photo refs checked', n)
for b in bad: print('BROKEN', *b)
print('OK' if not bad else f'{len(bad)} broken'); sys.exit(1 if bad else 0)
