# Строит схематичные линии маршрутов (OSRM bike по данным OSM, ODbL) и профиль высот (Open-Meteo / Copernicus DEM).
import json, math, os, sys, time, urllib.request, urllib.parse
sys.path.insert(0, 'content'); import routes
UA = {'User-Agent': 'VeloparkBuilder/1.0 (github.com/avtomaster24bot-lab/velopark)'}
os.makedirs('cache/geo', exist_ok=True)
def get(u, tries=3):
    for i in range(tries):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90))
        except Exception as e: err = e; time.sleep(2 + 3 * i)
    raise err
def hav(a, b):
    R = 6371.0; la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))
def length(pts): return sum(hav(pts[i], pts[i+1]) for i in range(len(pts)-1))
def rdp(pts, eps):
    if len(pts) < 3: return pts
    # итеративный RDP в градусах (достаточно для схемы)
    keep = [False]*len(pts); keep[0] = keep[-1] = True; st = [(0, len(pts)-1)]
    while st:
        a, b = st.pop(); ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx-ax, by-ay; L = dx*dx+dy*dy
        best, bi = -1, -1
        for i in range(a+1, b):
            px, py = pts[i]
            if L == 0: d = (px-ax)**2+(py-ay)**2
            else:
                t = max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/L)); d = (px-ax-t*dx)**2+(py-ay-t*dy)**2
            if d > best: best, bi = d, i
        if best > eps*eps: keep[bi] = True; st += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]
def densify(wp, step_km=2):
    out = []
    for i in range(len(wp)-1):
        a, b = wp[i], wp[i+1]; n = max(1, int(hav(a, b)/step_km))
        for j in range(n): out.append((a[0]+(b[0]-a[0])*j/n, a[1]+(b[1]-a[1])*j/n))
    out.append(wp[-1]); return out
def osrm(wp, prof='bike'):
    coords = ';'.join(f'{lon},{lat}' for lat, lon in wp)
    u = f'https://routing.openstreetmap.de/routed-{prof}/route/v1/driving/{coords}?overview=full&geometries=geojson&continue_straight=false'
    j = get(u)
    if j.get('code') != 'Ok': raise RuntimeError(j.get('code'))
    return [(c[1], c[0]) for c in j['routes'][0]['geometry']['coordinates']]
def build(rt, force=False):
    f = f'cache/geo/{rt["slug"]}.json'
    if os.path.exists(f) and not force: return json.load(open(f))
    wp = [(a, b) for a, b, _ in rt['wp']]; mode = rt.get('mode', 'bike'); note = ''
    pts = None
    routed_share = 0
    if mode == 'bike':
        try:
            pts = osrm(wp); straight = length(wp)
            off = rt.get('dist')
            if off and 0.6*off <= length(pts) <= 1.6*off: pass
            elif length(pts) > max(2.2*straight, straight + 10): note = 'osrm-long'; pts = None
            else: routed_share = 1
        except Exception as e: note = f'osrm-fail {e}'
        if pts is None:   # по отрезкам: где маршрут не строится — прямая
            pts = []; ok_km = 0; tot = 0
            for i in range(len(wp)-1):
                a, b = wp[i], wp[i+1]; st = hav(a, b); seg = None
                try:
                    seg = osrm([a, b])
                    if length(seg) > max(2.2*st, st + 10): seg = None
                except Exception: seg = None
                if not seg and rt.get('car_ok', True):
                    try:
                        seg = osrm([a, b], 'car')
                        if length(seg) > max(2.2*st, st + 10): seg = None
                    except Exception: seg = None
                time.sleep(0.4)
                if seg: ok_km += length(seg)
                else: seg = densify([a, b], 1.0)
                tot += length(seg); pts += seg if not pts else seg[1:]
            routed_share = ok_km / tot if tot else 0
            note += f' legs routed={routed_share:.2f}'
            mode = 'bike' if routed_share > 0.97 else 'mixed'
    if pts is None: pts = densify(wp, 1.0); mode = 'line'
    full_len = length(pts)
    eps = 0.00008 if full_len < 60 else 0.0003 if full_len < 400 else 0.001 if full_len < 2000 else 0.003
    simp = rdp(pts, eps)
    while len(simp) > 900: eps *= 1.6; simp = rdp(pts, eps)
    # профиль высот: равномерные точки по длине
    n = 120 if full_len > 200 else 80
    cum = [0];
    for i in range(1, len(pts)): cum.append(cum[-1]+hav(pts[i-1], pts[i]))
    samp = []; k = 0
    for i in range(n):
        d = full_len*i/(n-1)
        while k < len(cum)-2 and cum[k+1] < d: k += 1
        seg = cum[k+1]-cum[k] or 1; t = (d-cum[k])/seg
        samp.append((d, pts[k][0]+(pts[k+1][0]-pts[k][0])*t, pts[k][1]+(pts[k+1][1]-pts[k][1])*t))
    ele = []
    for i in range(0, n, 100):
        ch = samp[i:i+100]
        j = get('https://api.open-meteo.com/v1/elevation?' + urllib.parse.urlencode({'latitude': ','.join(f'{p[1]:.5f}' for p in ch), 'longitude': ','.join(f'{p[2]:.5f}' for p in ch)}))
        ele += j['elevation']; time.sleep(0.5)
    prof = [[round(s[0], 2), round(e)] for s, e in zip(samp, ele)]
    gain = sum(max(0, prof[i][1]-prof[i-1][1]) for i in range(1, len(prof)))
    out = dict(mode=mode, routed=round(routed_share, 2), note=note, len_km=round(full_len, 1), line=[[round(a, 5), round(b, 5)] for a, b in simp],
               profile=prof, ele_min=min(ele), ele_max=max(ele), gain_model=round(gain))
    json.dump(out, open(f, 'w')); time.sleep(1)
    return out
if __name__ == '__main__':
    only = sys.argv[1:]
    for rt in routes.R:
        if only and rt['slug'] not in only: continue
        g = build(rt, force=bool(only))
        off = rt.get('dist')
        print(f"{rt['slug']:24} {g['mode']:5} {g['len_km']:8} off={off} ratio={(g['len_km']/off if off else 0):.2f} pts={len(g['line'])} ele={g['ele_min']}-{g['ele_max']} gain~{g['gain_model']} {g['note']}", flush=True)
