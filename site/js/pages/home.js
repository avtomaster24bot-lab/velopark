import * as api from '../api.js';
import { $, layout, card, bindFav, TYPES, TYPE_ICON, TYPE_COLOR, esc, coverOf, fmtKm } from '../ui.js';
import { makeMap } from '../map.js';
layout();
const [all, fav] = await Promise.all([api.allRoutes(), api.favorites()]);
const seed = all.filter((r) => !r.ugc), ugc = all.filter((r) => r.ugc);
$('#type-chips').innerHTML = Object.entries(TYPES).map(([k, v]) => `<a class="chip" href="routes.html?type=${k}"><span>${TYPE_ICON[k]}</span> ${v} <span class="muted">${all.filter((r) => r.types.includes(k)).length}</span></a>`).join('');
const pick = (ids) => ids.map((id) => seed.find((r) => r.id === id)).filter(Boolean);
$('#kz').innerHTML = seed.filter((r) => r.countries.includes('Казахстан')).map((r) => card(r, fav)).join('');
$('#climbs').innerHTML = pick(['stelvio-prato', 'alpe-dhuez', 'mont-ventoux-bedoin', 'col-du-tourmalet']).map((r) => card(r, fav)).join('');
$('#epic').innerHTML = pick(['pamir-highway', 'great-divide', 'carretera-austral', 'pacific-coast']).map((r) => card(r, fav)).join('');
$('#family').innerHTML = pick(['danube-passau-vienna', 'loire-a-velo', 'shimanami-kaido', 'otago-rail-trail']).map((r) => card(r, fav)).join('');
bindFav(document.body, fav);
// маршруты и рассказы пользователей
const stories = await api.listStories({ limit: 4 });
if (!ugc.length && !stories.length) {
  $('#ugc').innerHTML = `<div class="empty" style="grid-column:1/-1">Здесь появятся маршруты и рассказы велосипедистов. <a href="add.html">Станьте первым!</a></div>`;
} else {
  $('#ugc').innerHTML = ugc.slice(0, 4).map((r) => card(r, fav)).join('') + stories.map((s) => `<a class="card" href="story.html?id=${s.id}"><div class="ph"><img src="${esc(api.photoUrl(s.cover_path))}" alt="" loading="lazy"><span class="tag badge">Рассказ</span></div><div class="bd"><h3>${esc(s.title)}</h3><p class="sum">${esc(s.body.slice(0, 160))}</p><div class="meta">✍ ${esc(s.author_name || '')}</div></div></a>`).join('');
}
// карта
const { L, map } = await makeMap($('#home-map'), { center: [35, 40], zoom: 2 });
const group = L.featureGroup().addTo(map);
for (const r of all) {
  const col = TYPE_COLOR[r.types[0]] || '#0b6e5a';
  const pop = `<div class="lp"><img src="${esc(coverOf(r))}" alt=""><b>${esc(r.title)}</b>${esc(r.countries.join(', '))}${r.dist ? ` · ≈ ${fmtKm(r.dist)} км` : ''}<br><a href="route.html?id=${encodeURIComponent(r.id)}">Открыть маршрут →</a></div>`;
  if (r.ov) L.polyline(r.ov, { color: col, weight: 4, opacity: 0.85 }).bindPopup(pop).addTo(group);
  if (r.start) L.circleMarker(r.start, { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 }).bindPopup(pop).addTo(group);
}
if (all.length) map.fitBounds(group.getBounds(), { padding: [20, 20] });
