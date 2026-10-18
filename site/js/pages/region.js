import * as api from '../api.js';
import { $, layout, card, bindFav, TYPES, TYPE_COLOR, esc, coverOf, fmtKm, params } from '../ui.js';
import { makeMap, clusterGroup } from '../map.js';
layout();
const code = params().r || '';
const FDN = { 'ЦФО': 'Центральный федеральный округ', 'СЗФО': 'Северо-Западный федеральный округ', 'ЮФО': 'Южный федеральный округ', 'СКФО': 'Северо-Кавказский федеральный округ', 'ПФО': 'Приволжский федеральный округ', 'УФО': 'Уральский федеральный округ', 'СФО': 'Сибирский федеральный округ', 'ДФО': 'Дальневосточный федеральный округ' };
const [reg, regions, all, fav] = await Promise.all([api.regionData(code), fetch('data/regions.json').then((r) => r.json()), api.allRoutes(), api.favorites()]);
// название региона берём из справочника, даже если маршрутов пока нет
let name = reg?.name, fd = reg?.fd;
if (!name) { const k = regions.kz.find((x) => x.code === code); if (k) name = k.name; for (const f of regions.ru) { const x = f.regions.find((y) => y.code === code); if (x) { name = x.name; fd = f.fd; } } }
if (!name) { $('#reg-title').textContent = 'Регион не найден'; $('#reg-sub').innerHTML = '<a href="regions.html">Все регионы</a>'; throw new Error('no region'); }
document.title = `Веломаршруты: ${name} — Velopark`;
$('#reg-title').textContent = `Веломаршруты: ${name}`;
$('#crumb-fd').textContent = code.startsWith('KZ') ? 'Казахстан' : code === 'CRIMEA' ? 'Крым' : `Россия · ${FDN[fd] || ''}`;
// полные карточки — из общего каталога (там есть обложки и описания), линии — из файла региона
const byId = new Map(all.map((r) => [r.id, r]));
const list = (reg?.routes || []).map((x) => ({ ...x, ...(byId.get(x.id) || {}), ov: x.ov }));
const nOsm = list.filter((r) => r.osm).length;
$('#reg-sub').textContent = list.length ? `${list.length} ${list.length % 10 === 1 && list.length % 100 !== 11 ? 'маршрут' : 'маршрутов'}${nOsm ? ` · из них ${nOsm} из OpenStreetMap` : ''}` : 'Пока нет маршрутов';
$('#reg-note').innerHTML = nOsm ? 'Линии маршрутов OSM — Данные © участники <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, ODbL. Остальные линии — схематичные, по опорным точкам.' : '';
const types = [...new Set(list.flatMap((r) => r.types))];
$('#reg-types').innerHTML = types.map((t) => `<a class="chip" href="routes.html?reg=${encodeURIComponent(code)}&country=${encodeURIComponent(list[0].countries[0])}&type=${t}"><i class="dot" style="background:${TYPE_COLOR[t]}"></i> ${TYPES[t]} ${list.filter((r) => r.types.includes(t)).length}</a>`).join('');
$('#list').innerHTML = list.map((r) => card(r, fav)).join(''); bindFav($('#list'), fav);
$('#empty').hidden = !!list.length;
if (!list.length) { $('#rmap').hidden = true; } else {
  const { L, map } = await makeMap($('#rmap'));
  const lines = L.featureGroup().addTo(map), pins = (await clusterGroup(L)).addTo(map);
  for (const r of list) {
    const col = TYPE_COLOR[r.types[0]] || '#0b6e5a';
    const pop = `<div class="lp"><img src="${esc(coverOf(r))}" alt=""><b>${esc(r.title)}</b>${r.dist ? `≈ ${fmtKm(r.dist)} км` : ''}<br><a href="route.html?id=${encodeURIComponent(r.id)}">Открыть маршрут →</a></div>`;
    if (r.ov) L.polyline(r.ov, { color: col, weight: 4, opacity: 0.85 }).bindPopup(pop).addTo(lines);
    if (r.start) pins.addLayer(L.circleMarker(r.start, { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 }).bindPopup(pop));
  }
  const bb = L.latLngBounds([]); if (lines.getLayers().length) bb.extend(lines.getBounds()); if (pins.getLayers().length) bb.extend(pins.getBounds());
  if (bb.isValid()) map.fitBounds(bb, { padding: [24, 24], maxZoom: 12 });
}
