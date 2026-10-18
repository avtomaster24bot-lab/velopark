import json, io, os, re, time, urllib.request, urllib.parse
from PIL import Image
UA = {'User-Agent': 'VeloparkBuilder/1.0 (github.com/avtomaster24bot-lab/velopark)'}
def clean(s): return re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', s or '')).strip()
c = json.load(open('cache/cand.json')); P = json.load(open('cache/picks.json'))
P['great-divide'] = ['Bikepacking through Great Divide Basin, Wyoming, USA.jpg', 'Lightning and hail storm in the Great Divide Basin.jpg']
P['sun-moon-lake'] = [0, 'Overlooking Sun Moon Lake with Ita Thao in the distance.jpg']
P['camino-frances'] = [1, 'Palloza en O Cebreiro (Lugo).JPG']
os.makedirs('site/img/photos', exist_ok=True)
cred = json.load(open('content/credits.json')) if os.path.exists('content/credits.json') else {}
for slug, items in P.items():
    for n, it in enumerate(items):
        key = f'{slug}-{n+1}'
        if key in cred and os.path.exists(f'site/img/photos/{key}.webp'): continue
        title = c[slug][it]['file'] if isinstance(it, int) else it
        u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(dict(action='query', titles='File:' + title, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=1400, format='json'))
        p = list(json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA)))['query']['pages'].values())[0]
        if 'imageinfo' not in p: print('MISSING', key, title); continue
        ii = p['imageinfo'][0]; m = ii['extmetadata']; g = lambda x: clean(m.get(x, {}).get('value', ''))
        lic = g('LicenseShortName')
        if 'GFDL' in lic or not re.search(r'CC|Public domain|PD', lic): print('SKIP', key, lic); continue
        data = urllib.request.urlopen(urllib.request.Request(ii.get('thumburl') or ii['url'], headers=UA), timeout=90).read()
        im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((1400, 1000))
        im.save(f'site/img/photos/{key}.webp', 'WEBP', quality=76)
        t = im.copy(); t.thumbnail((560, 400)); t.save(f'site/img/photos/{key}-s.webp', 'WEBP', quality=72)
        cred[key] = dict(route=slug, file=title, author=g('Artist')[:200] or 'Unknown', license=lic, license_url=g('LicenseUrl'),
                         source=ii['descriptionurl'], w=im.width, h=im.height, desc=g('ImageDescription')[:240])
        print(key, lic, im.size, flush=True); time.sleep(0.4)
json.dump(cred, open('content/credits.json', 'w'), ensure_ascii=False, indent=1)
print(len(cred))
