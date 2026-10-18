# Сборка Velopark: data/*.json из content/routes.py + кэша геометрии, HTML-страницы из шаблона, sitemap.
import json, os, re, sys, math, html, datetime
sys.path.insert(0, 'content'); import importlib, routes; importlib.reload(routes)
import regions as RG
sys.path.insert(0, 'tools'); from geo import hav
SITE = 'site'; BASE = 'https://avtomaster24bot-lab.github.io/velopark/'
VU = 'https://avtomaster24bot-lab.github.io/velo-universe/'; VU_LOCAL = '/workspace/velouniverse/site/'
V = datetime.datetime.utcnow().strftime('%Y%m%d%H%M')
cred = json.load(open('content/credits.json'))
os.makedirs(f'{SITE}/data/r', exist_ok=True)

def vu_title(key):
    p = VU_LOCAL + key.strip('/') + '/index.html'
    if not os.path.exists(p): raise SystemExit(f'Нет страницы Вело-вселенной: {key}')
    t = re.search(r'<title>(.*?)</title>', open(p, encoding='utf-8').read()).group(1)
    return html.unescape(t.split(' — Вело-вселенная')[0].strip())
def vu_key(k): return k if '/' in k or k in ('calc', 'maintenance', 'trouble', 'compat') else 'guides/' + k

REGMAP = {'chuysky-trakt': 'RU-AL', 'medeu-shymbulak': 'KZ-75', 'big-almaty-lake': 'KZ-19', 'charyn-kolsai': 'KZ-19', 'burabay': 'KZ-11'}
KZN = {c: n for c, n, _ in RG.KZ}
def reg_info(code):
    if not code: return None, None
    if code.startswith('KZ-'): return KZN[code], None
    n, fd = RG.RU[code[3:]]; return n, fd
index = []
for rt in routes.R:
    g = json.load(open(f'cache/geo/{rt["slug"]}.json'))
    mode = 'line' if rt.get('mode') == 'line' else g['mode']
    photos = [dict(k=k, w=v['w'], h=v['h']) for k, v in sorted(cred.items()) if v['route'] == rt['slug']]
    guides = []
    for k in rt.get('guides', []) + ['trouble']:
        kk = vu_key(k)
        if kk not in [x['k'] for x in guides]: guides.append(dict(k=kk, t=vu_title(kk), url=VU + kk.strip('/') + '/'))
    line = g['line']
    # обзорная линия для общей карты (≤ 60 точек)
    step = max(1, len(line) // 60); ov = line[::step] + ([line[-1]] if line[::step][-1] != line[-1] else [])
    dist = rt.get('dist'); dist_est = round(g['len_km']) if g['len_km'] >= 20 else round(g['len_km'], 1)
    show_profile = mode in ('bike', 'track') or (mode == 'mixed' and g.get('routed', 0) >= 0.85)
    item = dict(id=rt['slug'], title=rt['title'], countries=rt['countries'], region=rt['region'], types=rt['types'], diff=rt['diff'],
                surface=rt['surface'], season=rt['season'], dist=dist if dist else dist_est, dist_est=not bool(dist),
                gain=rt.get('gain'), ele_max=round(g['ele_max']) if show_profile else None,
                summary=rt['summary'], start=line[0], ov=ov, cover=photos[0]['k'] if photos else None, nph=len(photos))
    code = rt.get('reg') or REGMAP.get(rt['slug'])
    if code: item.update(reg=code, rname=reg_info(code)[0], fd=reg_info(code)[1])
    if rt.get('regs'): item['regs'] = rt['regs']
    index.append(item)
    full = dict(item, desc=rt['desc'], highlights=rt['highlights'], tips=rt['tips'], dist_note=rt['dist_note'], gain_note=rt.get('gain_note'),
                src=[dict(t=a, url=b) for a, b in rt['src']], wp=[dict(lat=a, lon=b, t=c) for a, b, c in rt['wp']],
                line=line, line_mode=mode, line_src=rt.get('line_src'), line_km=g['len_km'], profile=g['profile'] if show_profile else None,
                ele_min=round(g['ele_min']) if show_profile else None, gain_model=g['gain_model'] if show_profile else None,
                photos=[dict(p, author=cred[p['k']]['author'], license=cred[p['k']]['license'], source=cred[p['k']]['source']) for p in photos],
                guides=guides)
    del full['ov']
    json.dump(full, open(f'{SITE}/data/r/{rt["slug"]}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(index, open(f'{SITE}/data/index.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump([dict(k=k, **{x: v[x] for x in ('route', 'file', 'author', 'license', 'license_url', 'source')}) for k, v in sorted(cred.items())],
          open(f'{SITE}/data/credits.json', 'w'), ensure_ascii=False, separators=(',', ':'))
OSM = json.load(open('cache/osm/items.json'))
for it in OSM: it['rname'] = it['region']
ALL = index + OSM
countries = sorted({c for r in ALL for c in r['countries']})
stats = dict(routes=len(ALL), countries=len(countries), photos=len(cred), osm=len(OSM), curated=len(index))
# индекс регионов: Казахстан → области; Россия → федеральные округа → регионы; Крым — отдельно
os.makedirs(f'{SITE}/data/reg', exist_ok=True)
def lite(r):
    d = {k: r.get(k) for k in ('id', 'title', 'countries', 'region', 'district', 'types', 'diff', 'dist', 'dist_est', 'gain', 'start', 'cover', 'osm', 'unnamed')}
    return {k: v for k, v in d.items() if v not in (None, False, [], '')}
byreg = {}
for r in ALL:
    for c in (r.get('regs') or ([r['reg']] if r.get('reg') else [])): byreg.setdefault(c, []).append(r)
def ov_of(r):
    if r.get('ov'): return r['ov']
    f = json.load(open(f"{SITE}/data/osm/r/{r['id']}.json")); ln = f['line']; st = max(1, len(ln) // 40)
    return ln[::st] + ([ln[-1]] if ln[::st][-1] != ln[-1] else [])
REGIONS = {'kz': [], 'ru': [], 'crimea': None}
for code, name, kind in RG.KZ:
    lst = byreg.get(code, []); REGIONS['kz'].append(dict(code=code, name=name, kind=kind, n=len(lst), osm=sum(1 for x in lst if x.get('osm'))))
for fd, fdn in RG.FD.items():
    regs = []
    for c, (n, f) in RG.RU.items():
        if f != fd: continue
        lst = byreg.get('RU-' + c, []); regs.append(dict(code='RU-' + c, name=n, n=len(lst), osm=sum(1 for x in lst if x.get('osm'))))
    regs.sort(key=lambda x: (-x['n'], x['name']))
    REGIONS['ru'].append(dict(fd=fd, name=fdn + ' федеральный округ', n=sum(x['n'] for x in regs), regions=regs))
REGIONS['crimea'] = dict(code='CRIMEA', name='Крым', n=len(byreg.get('CRIMEA', [])))
for code, lst in byreg.items():
    name = reg_info(code)[0] if code != 'CRIMEA' else 'Крым'
    json.dump(dict(code=code, name=name, fd=reg_info(code)[1] if code != 'CRIMEA' else None,
                   routes=[dict(lite(r), ov=ov_of(r)) for r in sorted(lst, key=lambda r: (r.get('unnamed', False), -(r.get('dist') or 0)))]),
              open(f'{SITE}/data/reg/{code}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(REGIONS, open(f'{SITE}/data/regions.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(stats, open(f'{SITE}/data/stats.json', 'w'))
print('regions KZ:', {x['name']: x['n'] for x in REGIONS['kz']})
print('RU FD:', {x['fd']: x['n'] for x in REGIONS['ru']}, 'Crimea', REGIONS['crimea']['n'])

# ---------------------------------------------------------------- HTML
NAV = [('routes.html', 'Маршруты'), ('regions.html', 'Регионы'), ('stories.html', 'Рассказы'), ('add.html', '+ Добавить')]
def page(fn, title, desc, body, js=None, cls='', leaflet=False, og_img='img/og.jpg'):
    full_title = title if 'Velopark' in title else f'{title} — Velopark'
    lf = ('<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">' if leaflet else '')
    out = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{html.escape(full_title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="#0b6e5a">
<meta property="og:type" content="website"><meta property="og:site_name" content="Velopark">
<meta property="og:title" content="{html.escape(full_title)}"><meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="{BASE}{og_img}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap&subset=cyrillic" rel="stylesheet">
{lf}<link rel="stylesheet" href="css/style.css?v={V}">
</head>
<body class="{cls}">
<header class="top"><div class="wrap topin">
<a class="logo" href="./"><img src="assets/logo.svg" alt="" width="34" height="34"><span>Velo<b>park</b></span></a>
<nav class="mainnav" id="nav">{''.join(f'<a href="{h}"{" class=\"cta\"" if h=="add.html" else ""}>{t}</a>' for h, t in NAV)}</nav>
<div class="topr" id="userbox"><a class="btn btn-sm btn-ghost" href="login.html">Войти</a></div>
<button class="iconbtn" id="menu" aria-label="Меню">☰</button>
</div></header>
<main id="app">
{body}
</main>
<footer class="foot"><div class="wrap">
<div class="fgrid">
<div><a class="logo" href="./"><img src="assets/logo.svg" alt="" width="30" height="30"><span>Velo<b>park</b></span></a>
<p>Веломаршруты всего мира: каталог, карта, рассказы и маршруты от велосипедистов. Каждая публикация проходит модерацию.</p></div>
<div><b>Разделы</b><a href="routes.html">Все маршруты</a><a href="regions.html">По регионам</a><a href="stories.html">Рассказы</a><a href="add.html">Добавить маршрут</a><a href="my.html">Мой кабинет</a></div>
<div><b>Информация</b><a href="rules.html">Правила и данные</a><a href="credits.html">Фото и источники</a><a href="advertise.html">Реклама на сайте</a></div>
<div><b>Наши проекты</b><a href="https://avtomaster24bot-lab.github.io/velomarket/">VeloMarket — объявления</a><a href="{VU}">Вело-вселенная — веломастерская</a><a href="https://avtomaster24bot-lab.github.io/velopark-panasonic/">Velopark.kz — японские велосипеды</a></div>
</div>
<p class="small">Линии маршрутов — схематичные, не для навигации. Картографические данные и линии маршрутов из OSM — Данные © участники <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ODbL; профиль высот — Copernicus DEM через <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0). Фото — Wikimedia Commons, авторы указаны на странице <a href="credits.html">«Фото и источники»</a>.</p>
</div></footer>
<div id="toast" class="toast" hidden></div>
{f'<script type="module" src="js/pages/{js}.js?v={V}"></script>' if js else '<script type="module" src="js/pages/static.js?v=' + V + '"></script>'}
</body>
</html>
'''
    open(f'{SITE}/{fn}', 'w', encoding='utf-8').write(out)

T = {k: open(f'tools/tpl/{k}.html', encoding='utf-8').read() for k in [f[:-5] for f in os.listdir('tools/tpl') if f.endswith('.html')]}
def fill(s): return s.replace('{{N_ROUTES}}', str(stats['routes'])).replace('{{N_COUNTRIES}}', str(stats['countries'])).replace('{{N_PHOTOS}}', str(stats['photos'])).replace('{{VU}}', VU).replace('{{N_OSM}}', str(stats['osm']))
page('index.html', 'Velopark — веломаршруты всего мира', f'Каталог веломаршрутов мира на карте: {stats["routes"]} маршрутов в {stats["countries"]} странах, от Дуная и Памира до Медеу и Бурабая. Добавляйте свои маршруты и рассказы.', fill(T['home']), 'home', 'home', True)
page('routes.html', 'Все веломаршруты на карте', 'Поиск веломаршрутов по стране, типу (шоссе, MTB, гравий, туринг, байкпакинг, семейный), сложности, длине, набору высоты и сезону.', fill(T['routes']), 'routes', 'catalog', True)
page('route.html', 'Маршрут', 'Веломаршрут: карта, профиль высот, описание, советы и рассказы велосипедистов.', fill(T['route']), 'route', 'routepage', True)
page('stories.html', 'Рассказы о велопоездках', 'Истории велосипедистов о поездках и маршрутах со всего мира.', fill(T['stories']), 'stories', 'stories')
page('story.html', 'Рассказ', 'Рассказ о велопоездке.', fill(T['story']), 'story', 'storypage')
page('add.html', 'Добавить маршрут или рассказ', 'Добавьте свой веломаршрут (GPX или нарисуйте на карте) или расскажите о поездке. Публикация после модерации.', fill(T['add']), 'add', 'addpage', True)
page('my.html', 'Мой кабинет', 'Мои маршруты, рассказы и избранное.', fill(T['my']), 'my', 'mypage')
page('admin.html', 'Модерация', 'Модерация маршрутов и рассказов Velopark.', fill(T['admin']), 'admin', 'adminpage', True)
page('login.html', 'Вход через Telegram', 'Вход на Velopark через Telegram — без телефона и паролей.', fill(T['login']), 'login', 'login')
page('rules.html', 'Правила и персональные данные', 'Правила публикации маршрутов и рассказов, модерация, персональные данные.', fill(T['rules']), None, 'rules')
page('credits.html', 'Фото и источники', 'Авторы и лицензии фотографий, источники данных и карт.', fill(T['credits']), 'credits', 'credits')
page('advertise.html', 'Реклама на Velopark', 'Реклама для веломагазинов, прокатов, туроператоров и гостиниц на Velopark.', fill(T['advertise']), None, 'advertise')
def reg_html():
    out = ['<div class="wrap"><div class="page-h"><h1>Маршруты по регионам</h1><p class="muted">Казахстан — по областям и городам республиканского значения, Россия — по федеральным округам и регионам. В каталоге — маршруты из открытых источников и из OpenStreetMap.</p></div>']
    def li(x): return f'<a class="reg{" zero" if not x["n"] else ""}" href="region.html?r={x["code"]}"><span>{html.escape(x["name"])}</span><b>{x["n"]}</b></a>'
    out.append('<section class="sec" id="kz"><h2>🇰🇿 Казахстан</h2><div class="regs">' + ''.join(li(x) for x in REGIONS['kz']) + '</div></section>')
    out.append('<section class="sec" id="ru"><h2>🇷🇺 Россия</h2>')
    for f in REGIONS['ru']:
        nz = [x for x in f['regions'] if x['n']]; z = [x for x in f['regions'] if not x['n']]
        out.append(f'<h3 class="fd">{html.escape(f["name"])} <span class="muted">· {f["n"]}</span></h3><div class="regs">' + ''.join(li(x) for x in nz) + '</div>')
        if z: out.append('<p class="hint">Пока нет маршрутов: ' + ', '.join(f'<a href="region.html?r={x["code"]}">{html.escape(x["name"])}</a>' for x in z) + '. <a href="add.html">Добавьте свой</a>.</p>')
    out.append('</section>')
    if REGIONS['crimea']['n']: out.append(f'<section class="sec"><h2>Крым</h2><p class="hint">Статус территории оспаривается; маршруты показаны отдельно, по данным OpenStreetMap.</p><div class="regs">{li(REGIONS["crimea"])}</div></section>')
    out.append('</div>'); return ''.join(out)
page('regions.html', 'Веломаршруты по регионам', 'Веломаршруты Казахстана по областям и России по федеральным округам и регионам: карта, длина, источники.', reg_html(), None, 'regions')
page('region.html', 'Регион', 'Веломаршруты региона на карте и списком.', fill(T['region']), 'region', 'regionpage', True)
page('404.html', 'Страница не найдена', 'Страница не найдена.', fill(T['404']), None, 'nf')
# sitemap
urls = ['', 'regions.html'] + [f'region.html?r={c}' for c in byreg] + ['routes.html', 'stories.html', 'add.html', 'rules.html', 'credits.html', 'advertise.html'] + [f'route.html?id={r["id"]}' for r in ALL]
open(f'{SITE}/sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{html.escape(BASE + u)}</loc></url>\n' for u in urls) + '</urlset>\n')
open(f'{SITE}/robots.txt', 'w').write(f'User-agent: *\nDisallow: /admin.html\nSitemap: {BASE}sitemap.xml\n')
print(stats, 'countries:', ', '.join(countries))
