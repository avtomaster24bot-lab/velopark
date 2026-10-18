"""Геокодирование опорных точек через Nominatim (1 запрос/с, кэш)."""
import json, os, sys, time, urllib.request, urllib.parse
C = 'cache/geocode.json'; cache = json.load(open(C)) if os.path.exists(C) else {}
def gc(q, cc='kz'):
    k = cc + '|' + q
    if k not in cache:
        u = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'jsonv2', 'limit': 3, 'countrycodes': cc, 'accept-language': 'ru'})
        req = urllib.request.Request(u, headers={'User-Agent': 'Velopark/1.0 (+https://avtomaster24bot-lab.github.io/velopark/)'})
        cache[k] = json.loads(urllib.request.urlopen(req, timeout=30).read()); time.sleep(1.1)
        json.dump(cache, open(C, 'w'), ensure_ascii=False)
    return cache[k]
if __name__ == '__main__':
    cc = sys.argv[1]
    for q in sys.argv[2:]:
        res = gc(q, cc)
        print(q, '→', ' | '.join(f"{float(x['lat']):.4f},{float(x['lon']):.4f} {x['type']} {x['display_name'][:70]}" for x in res[:2]) or 'НЕТ')
