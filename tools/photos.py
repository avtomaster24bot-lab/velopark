# Поиск и загрузка фото с Wikimedia Commons (только свободные лицензии), запись авторов в content/credits.json
import json, os, re, sys, time, io, urllib.request, urllib.parse
from PIL import Image
sys.path.insert(0, 'content'); import routes
UA = {'User-Agent': 'VeloparkBuilder/1.0 (github.com/avtomaster24bot-lab/velopark)'}
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))
def clean(s): return re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', s or '')).strip()
OK = re.compile(r'^(CC BY(-SA)? [0-9.]+|CC0|Public domain|PD.*|CC BY-SA [0-9.]+ .*|CC BY [0-9.]+ .*)$', re.I)
def search(q, n=10):
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(dict(action='query', generator='search', gsrnamespace=6,
        gsrsearch=q + ' filetype:bitmap', gsrlimit=n, prop='imageinfo', iiprop='url|extmetadata|size|mime', iiurlwidth=1280, format='json'))
    j = get(u); out = []
    for p in sorted(j.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 99)):
        ii = (p.get('imageinfo') or [None])[0]
        if not ii or ii.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'): continue
        m = ii['extmetadata']; g = lambda x: clean(m.get(x, {}).get('value', ''))
        lic = g('LicenseShortName')
        if not OK.match(lic) or 'GFDL' in lic: continue
        if ii['width'] < 900 or ii['width'] < ii['height'] * 0.9: continue   # нужны горизонтальные
        out.append(dict(file=p['title'][5:], thumb=ii.get('thumburl') or ii['url'], author=g('Artist')[:200] or 'Unknown', license=lic,
                        license_url=g('LicenseUrl'), source=ii['descriptionurl'], desc=g('ImageDescription')[:300]))
    return out
if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'cand':   # кандидаты + контактный лист
        os.makedirs('cache/cand', exist_ok=True); allc = {}
        for rt in routes.R:
            seen = set(); c = []
            for q in rt['photo_q']:
                for x in search(q, 8):
                    if x['file'] in seen: continue
                    seen.add(x['file']); c.append(x)
                    if len(c) >= 6: break
                if len(c) >= 6: break
                time.sleep(0.3)
            allc[rt['slug']] = c; print(rt['slug'], len(c), flush=True)
        json.dump(allc, open('cache/cand.json', 'w'), ensure_ascii=False, indent=1)
