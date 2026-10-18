"""Регион (admin_level 4) и район (6) по точкам маршрута через is_in Overpass. Запуск: osm_regions.py <worker> <nworkers>"""
import json, os, sys, time, urllib.request, urllib.parse
UA = 'Velopark/1.0 (+https://avtomaster24bot-lab.github.io/velopark/)'
SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
w, nw = int(sys.argv[1]), int(sys.argv[2])
P = json.load(open('cache/osm/proc.json')); OUT = f'cache/osm/regions-{w}.json'
done = {}
for f in ['cache/osm/regions.json'] + [f'cache/osm/regions-{i}.json' for i in range(nw)]:
    if os.path.exists(f): done.update(json.load(open(f)))
res = json.load(open(OUT)) if os.path.exists(OUT) else {}
todo = [(rid, i, v['samples'][i]) for rid, v in sorted(P.items()) if v['length_km'] >= 2 for i in (0, 2, 4) if len(v['samples']) > i and f'{rid}:{i}' not in done]
todo = todo[w::nw]; print('todo', len(todo), flush=True)
def q(query):
    for k in range(8):
        url = SERVERS[(w + k) % len(SERVERS)]
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=400) as r: return json.loads(r.read())
        except Exception as e: print('retry', url, str(e)[:80], flush=True); time.sleep(10 + 10 * k)
    raise SystemExit('fail')
for b in range(0, len(todo), 40):
    chunk = todo[b:b+40]; parts = ['[out:json][timeout:300];']
    for rid, i, (la, lo) in chunk:
        parts.append(f'make m k="{rid}:{i}";out;is_in({la},{lo})->.a;area.a[boundary=administrative][admin_level~"^(2|4|6)$"];out tags;')
    d = q(''.join(parts)); cur = None
    for e in d['elements']:
        if e['type'] == 'm': cur = e['tags']['k']; res[cur] = []
        elif cur:
            t = e['tags']; res[cur].append({'lvl': t.get('admin_level'), 'ru': t.get('name:ru') or t.get('name'), 'iso': t.get('ISO3166-2'), 'cc': t.get('ISO3166-1')})
    json.dump(res, open(OUT, 'w'), ensure_ascii=False); print('done', b + len(chunk), flush=True)
