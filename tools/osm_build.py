"""OSM → данные сайта: site/data/osm/idx-*.json, site/data/osm/r/osm-<id>.json. Высоты — Open-Meteo (Copernicus DEM)."""
import json, glob, os, re, sys, time, math, collections, urllib.request, urllib.parse
sys.path.insert(0, 'content'); sys.path.insert(0, 'tools')
import regions as RG
from osm_proc import hav
P = json.load(open('cache/osm/proc.json'))
REG = {}
for f in ['cache/osm/regions.json'] + glob.glob('cache/osm/regions-*.json'): REG.update(json.load(open(f)))
CC_NAME = {'KZ': 'Казахстан', 'RU': 'Россия', 'EE': 'Эстония', 'LT': 'Литва', 'PL': 'Польша', 'UA': 'Украина'}
KZN = {c: n for c, n, _ in RG.KZ}
os.makedirs('site/data/osm/r', exist_ok=True); os.makedirs('cache/osm/ele', exist_ok=True)
def ele(key, line):
    f = f'cache/osm/ele/{key}.json'
    if os.path.exists(f): return json.load(open(f))
    L = sum(hav(line[i], line[i+1]) for i in range(len(line)-1)); n = 80 if L > 5 else 40
    cum = [0]
    for i in range(1, len(line)): cum.append(cum[-1] + hav(line[i-1], line[i]))
    samp = []; k = 0
    for i in range(n):
        d = L * i / (n - 1)
        while k < len(cum) - 2 and cum[k+1] < d: k += 1
        t = (d - cum[k]) / ((cum[k+1] - cum[k]) or 1)
        samp.append((d, line[k][0] + (line[k+1][0] - line[k][0]) * t, line[k][1] + (line[k+1][1] - line[k][1]) * t))
    u = 'https://api.open-meteo.com/v1/elevation?' + urllib.parse.urlencode({'latitude': ','.join(f'{s[1]:.5f}' for s in samp), 'longitude': ','.join(f'{s[2]:.5f}' for s in samp)})
    for t in range(4):
        try:
            j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'Velopark/1.0'}), timeout=60).read()); break
        except Exception as e: print('ele retry', e, file=sys.stderr); time.sleep(20 * (t + 1))
    else: return None
    prof = [[round(s[0], 2), round(e)] for s, e in zip(samp, j['elevation'])]
    json.dump(prof, open(f, 'w')); time.sleep(0.4); return prof
def place(rid):
    pts = [REG.get(f'{rid}:{i}') for i in range(5)]; pts = [p for p in pts if p is not None]
    ccs, r4, r6 = collections.Counter(), collections.Counter(), collections.Counter()
    for p in pts:
        cc = next((x['cc'] for x in p if x['lvl'] == '2' and x.get('cc')), None)
        l4 = [x for x in p if x['lvl'] == '4']
        if any(x['iso'] == 'UA-43' or (x['ru'] or '').startswith('Республика Крым') or 'Севастоп' in (x['ru'] or '') for x in l4): cc = 'CRIMEA'
        ccs[cc] += 1
        for x in l4:
            if x['iso'] and x['iso'] != 'UA-43': r4[(cc, x['iso'])] += 1
            elif cc == 'CRIMEA' and x['iso'] is None: r4[(cc, 'CRIMEA')] += 1
        for x in p:
            if x['lvl'] == '6' and x['ru']: r6[(cc, x['ru'])] += 1
    return ccs, r4, r6, len(pts)
def kind(tags, reg):
    if tags.get('route') == 'mtb': t = ['mtb']
    elif tags.get('network') in ('icn', 'ncn'): t = ['touring']
    elif reg in RG.CITY or (tags.get('network') == 'lcn' and reg in RG.CITY): t = ['city']
    else: t = ['touring']
    s = tags.get('surface', '')
    if s in ('gravel', 'fine_gravel', 'compacted', 'unpaved') and 'mtb' not in t: t.append('gravel')
    return t
def diff(tags):
    for k in ('mtb:scale', 'mtb:scale:imba'):
        v = re.match(r'\d', tags.get(k, '') or '')
        if v:
            n = int(v.group(0))
            return 'easy' if n <= 1 else 'medium' if n == 2 else 'hard' if n == 3 else 'extreme'
    return 'na'
def surf(tags):
    s = tags.get('surface', '')
    return 'asphalt' if s in ('asphalt', 'paved', 'concrete') else 'gravel' if s in ('gravel', 'fine_gravel', 'compacted') else 'dirt' if s in ('dirt', 'ground', 'unpaved', 'earth') else 'na'
NET = {'icn': 'международная сеть', 'ncn': 'национальная сеть', 'rcn': 'региональная сеть', 'lcn': 'местная сеть'}
items, seen, skipped = [], {}, collections.Counter()
for rid, v in sorted(P.items(), key=lambda t: int(t[0])):
    tags = v['tags']; L = v['length_km']
    if L < 2: skipped['короче 2 км'] += 1; continue
    ccs, r4, r6, n = place(rid)
    if not n: skipped['нет данных о регионе'] += 1; continue
    main_cc, cnt = ccs.most_common(1)[0]
    home = sum(c for k, c in ccs.items() if k in ('KZ', 'RU', 'CRIMEA'))
    if home / n < 0.4: skipped['в основном за пределами KZ/RU'] += 1; continue
    if main_cc not in ('KZ', 'RU', 'CRIMEA'): main_cc = 'RU' if ccs['RU'] >= ccs['KZ'] else 'KZ'
    regs = [k[1] for k, _ in r4.most_common() if k[0] == main_cc]
    reg = regs[0] if regs else None
    if main_cc == 'CRIMEA': reg = 'CRIMEA'; rname = 'Крым'; fd = None; country = 'Крым'
    elif main_cc == 'RU':
        code = (reg or '').replace('RU-', ''); rname, fd = RG.RU.get(code, (None, None)); country = 'Россия'
    else: rname = KZN.get(reg); fd = None; country = 'Казахстан'
    if not rname: skipped['регион не определён'] += 1; continue
    dist6 = [k[1] for k, _ in r6.most_common() if k[0] == main_cc]
    name = tags.get('name:ru') or tags.get('name')
    unnamed = not name
    if unnamed:
        if L < 5 and not tags.get('ref'): skipped['без названия и короче 5 км'] += 1; continue
        name = f"Без названия в OSM: {dist6[0] if dist6 else rname}" + (f" ({tags['ref']})" if tags.get('ref') else '')
    segs = v['segs']; main = segs[0]
    start = main[0]
    key = (re.sub(r'\W+', '', name.lower()), round(L))
    if key in seen and hav(seen[key], start) < 3: skipped['дубликат'] += 1; continue
    seen[key] = start
    others = [CC_NAME.get(k, k) for k, _ in ccs.most_common() if k not in (main_cc, None, 'CRIMEA')]
    mlen = sum(hav(main[i], main[i+1]) for i in range(len(main)-1))
    prof = ele(rid, main) if mlen >= 0.7 * L and mlen >= 2 else None
    gain = sum(max(0, prof[i][1] - prof[i-1][1]) for i in range(1, len(prof))) if prof else None
    types = kind(tags, reg)
    net = NET.get(tags.get('network'), '')
    summ = f"Велосипедный маршрут из OpenStreetMap: {rname}{', ' + dist6[0] if dist6 and dist6[0] != rname else ''}. Длина по геометрии OSM ≈ {round(L) if L >= 20 else round(L, 1)} км" + (f"; {net}" if net else '') + '.'
    it = dict(id=f'osm-{rid}', title=name, countries=[country] + others, region=rname, district=dist6[0] if dist6 else None, reg=reg, fd=fd,
              types=types, diff=diff(tags), surface=surf(tags), season=[], dist=round(L) if L >= 20 else round(L, 1), dist_est=False, gain=None,
              ele_max=max(p[1] for p in prof) if prof else None, summary=summ, start=start, cover=None, nph=0, osm=int(rid), unnamed=unnamed)
    if tags.get('ref'): it['ref'] = tags['ref']
    desc = []
    for k in ('description:ru', 'description', 'note:ru'):
        if tags.get(k): desc.append(tags[k]); break
    if tags.get('from') and tags.get('to'): desc.append(f"Направление в OSM: {tags['from']} → {tags['to']}.")
    if tags.get('operator'): desc.append(f"Оператор/организатор (по данным OSM): {tags['operator']}.")
    if tags.get('distance'): desc.append(f"Длина, указанная в теге distance: {tags['distance']} км.")
    if unnamed: desc.append('У маршрута нет названия в OpenStreetMap — оно составлено по району. Если знаете название, добавьте его в OSM.')
    desc.append(f"Линия собрана из {v['nseg']} {'участка' if v['nseg'] == 1 else 'участков'} отношения OSM и упрощена для сайта. Перед поездкой сверяйтесь с картой: данные OSM редактируются участниками и могут быть неполными.")
    src = [dict(t=f'OpenStreetMap: отношение {rid}', url=f'https://www.openstreetmap.org/relation/{rid}')]
    if tags.get('website'): src.append(dict(t='Сайт маршрута (тег website)', url=tags['website']))
    if tags.get('wikipedia'):
        lang, _, title = tags['wikipedia'].partition(':'); src.append(dict(t=f'Википедия: {title}', url=f'https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}'))
    full = dict(it, desc=desc, highlights=[], tips=[], dist_note='Длина посчитана по геометрии отношения OpenStreetMap', gain_note=None, src=src, wp=[],
                line=main, segs=segs[1:] if len(segs) > 1 else None, line_mode='osm', line_km=round(L, 1), profile=prof,
                ele_min=min(p[1] for p in prof) if prof else None, gain_model=round(gain) if gain is not None else None, photos=[], guides=[],
                tags={k: tags[k] for k in ('route', 'network', 'ref', 'operator', 'surface', 'mtb:scale', 'distance', 'roundtrip') if k in tags})
    json.dump(full, open(f"site/data/osm/r/{it['id']}.json", 'w'), ensure_ascii=False, separators=(',', ':'))
    it['ov'] = None; items.append(it)
for c, fn in (('Казахстан', 'kz'), ('Россия', 'ru'), ('Крым', 'crimea')):
    lst = [dict((k, v) for k, v in it.items() if v not in (None, False, [], '') and k != 'summary') for it in items if it['countries'][0] == c]
    json.dump(lst, open(f'site/data/osm/idx-{fn}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(items, open('cache/osm/items.json', 'w'), ensure_ascii=False)
print('kept', len(items), collections.Counter(i['countries'][0] for i in items), dict(skipped))
