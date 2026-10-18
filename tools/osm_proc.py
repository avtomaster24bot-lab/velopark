"""Обработка велосипедных отношений OSM: сборка линий, длина, упрощение, точки для определения региона."""
import json, math, sys
def hav(a, b):
    R = 6371.0; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))
def rdp(pts, eps):
    if len(pts) < 3: return pts
    # итеративный RDP в метрах (локальная проекция)
    lat0 = math.radians(sum(p[0] for p in pts)/len(pts))
    xy = [(p[1]*111320*math.cos(lat0), p[0]*110540) for p in pts]
    keep = [False]*len(pts); keep[0] = keep[-1] = True; st = [(0, len(pts)-1)]
    while st:
        i, j = st.pop(); ax, ay = xy[i]; bx, by = xy[j]; dx, dy = bx-ax, by-ay; L = dx*dx+dy*dy; best, bi = -1, -1
        for k in range(i+1, j):
            px, py = xy[k]
            if L == 0: d = (px-ax)**2+(py-ay)**2
            else:
                t = max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/L)); d = (px-ax-t*dx)**2+(py-ay-t*dy)**2
            if d > best: best, bi = d, k
        if best > eps*eps: keep[bi] = True; st += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]
def chain(ways):
    """Склеивает пути в непрерывные отрезки (жадно по совпадающим концам)."""
    segs = [list(w) for w in ways if len(w) >= 2]; out = []
    def key(p): return (round(p[0], 6), round(p[1], 6))
    while segs:
        cur = segs.pop(0); changed = True
        while changed:
            changed = False
            for i, s in enumerate(segs):
                if key(s[0]) == key(cur[-1]): cur += s[1:]
                elif key(s[-1]) == key(cur[-1]): cur += s[::-1][1:]
                elif key(s[-1]) == key(cur[0]): cur = s[:-1] + cur
                elif key(s[0]) == key(cur[0]): cur = s[::-1][:-1] + cur
                else: continue
                segs.pop(i); changed = True; break
        out.append(cur)
    return out
def process(el):
    ways, seen = [], set()
    for m in el.get('members', []):
        if m['type'] != 'way' or 'geometry' not in m or m['ref'] in seen: continue
        if m.get('role') in ('platform', 'stop'): continue
        seen.add(m['ref']); ways.append([(g['lat'], g['lon']) for g in m['geometry'] if g])
    length = sum(hav(w[i], w[i+1]) for w in ways for i in range(len(w)-1))
    segs = chain(ways)
    segs.sort(key=lambda s: -len(s))
    eps = 8 if length < 20 else 15 if length < 80 else 30 if length < 300 else 60
    simp = [[[round(p[0], 5), round(p[1], 5)] for p in rdp(s, eps)] for s in segs]
    simp = [s for s in simp if len(s) >= 2]
    npts = sum(len(s) for s in simp)
    while npts > 2500:  # ограничение размера
        eps *= 1.6; simp = [[[round(p[0], 5), round(p[1], 5)] for p in rdp(s, eps)] for s in segs]; simp = [s for s in simp if len(s) >= 2]; npts = sum(len(s) for s in simp)
    allp = [p for s in segs for p in s]
    return {'length_km': round(length, 2), 'segs': simp, 'nseg': len(segs), 'npts_raw': len(allp),
            'samples': [allp[int(i*(len(allp)-1)/4)] for i in range(5)] if allp else []}
if __name__ == '__main__':
    out = {}
    for c in ('KZ', 'RU'):
        for el in json.load(open(f'cache/osm/geom-{c}.json'))['elements']:
            p = process(el); p['tags'] = el['tags']; p['cc'] = c; out[el['id']] = p
    json.dump(out, open('cache/osm/proc.json', 'w'))
    import collections
    L = [v['length_km'] for v in out.values()]
    print(len(out), 'under2km', sum(1 for x in L if x < 2), 'nogeom', sum(1 for v in out.values() if not v['segs']), 'pts', sum(sum(len(s) for s in v['segs']) for v in out.values()))
