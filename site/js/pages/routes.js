import * as api from '../api.js';
import { $, $$, layout, card, bindFav, TYPES, TYPE_COLOR, DIFF, MONTHS_FULL, esc, coverOf, fmtKm, adHTML } from '../ui.js';
import { makeMap } from '../map.js';
layout();
const [all, fav] = await Promise.all([api.allRoutes(), api.favorites()]);
const f = $('#ff');
const countries = [...new Set(all.flatMap((r) => r.countries))].sort((a, b) => a.localeCompare(b, 'ru'));
f.country.innerHTML += countries.map((c) => `<option>${esc(c)}</option>`).join('');
f.month.innerHTML += MONTHS_FULL.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
$('#f-types').innerHTML = Object.entries(TYPES).map(([k, v]) => `<button type="button" class="chip" data-type="${k}" aria-pressed="false"><i class="dot" style="background:${TYPE_COLOR[k]}"></i>${v}</button>`).join('');
$('#f-diff').innerHTML = Object.entries(DIFF).map(([k, v]) => `<button type="button" class="chip" data-diff="${k}" aria-pressed="false">${v}</button>`).join('');
// состояние из URL
const st = Object.fromEntries(new URLSearchParams(location.search));
for (const k of ['q', 'country', 'dist', 'gain', 'surface', 'month', 'sort']) if (st[k] && f[k]) f[k].value = st[k];
const types = new Set((st.type || '').split(',').filter(Boolean)), diffs = new Set((st.diff || '').split(',').filter(Boolean));
const sync = () => { $$('[data-type]').forEach((b) => b.setAttribute('aria-pressed', types.has(b.dataset.type))); $$('[data-diff]').forEach((b) => b.setAttribute('aria-pressed', diffs.has(b.dataset.diff))); };
sync();
$('#f-types').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; types.has(b.dataset.type) ? types.delete(b.dataset.type) : types.add(b.dataset.type); sync(); run(); });
$('#f-diff').addEventListener('click', (e) => { const b = e.target.closest('[data-diff]'); if (!b) return; diffs.has(b.dataset.diff) ? diffs.delete(b.dataset.diff) : diffs.add(b.dataset.diff); sync(); run(); });
f.addEventListener('input', () => run()); f.addEventListener('submit', (e) => e.preventDefault());
$('#f-reset').onclick = () => { f.reset(); types.clear(); diffs.clear(); sync(); run(); };
$('#f-open').onclick = () => { $('#filters').classList.toggle('open'); $('#f-open').textContent = $('#filters').classList.contains('open') ? 'Показать результаты' : 'Фильтры'; };
const range = (v) => { if (!v) return null; const [a, b] = v.split('-'); return [a ? +a : -Infinity, b ? +b : Infinity]; };
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
function filter() {
  const q = norm(f.q.value.trim()); const dr = range(f.dist.value), gr = range(f.gain.value); const m = +f.month.value;
  let out = all.filter((r) => (!q || norm([r.title, r.region, r.summary, ...r.countries].join(' ')).includes(q))
    && (!f.country.value || r.countries.includes(f.country.value)) && (!types.size || r.types.some((t) => types.has(t))) && (!diffs.size || diffs.has(r.diff))
    && (!dr || (r.dist != null && r.dist >= dr[0] && r.dist < dr[1])) && (!gr || (r.gain != null && r.gain >= gr[0] && r.gain < gr[1]))
    && (!f.surface.value || r.surface === f.surface.value) && (!m || (r.season || []).includes(m)));
  const s = f.sort.value;
  if (s === 'dist_asc') out.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  if (s === 'dist_desc') out.sort((a, b) => (b.dist ?? -1) - (a.dist ?? -1));
  if (s === 'name') out.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  if (s === 'new') out.sort((a, b) => (b.ugc ? 1 : 0) - (a.ugc ? 1 : 0) || String(b.approved_at || '').localeCompare(String(a.approved_at || '')));
  return out;
}
const { L, map } = await makeMap($('#map'), { center: [35, 40], zoom: 2 });
const layer = L.featureGroup().addTo(map);
function draw(list) {
  layer.clearLayers();
  for (const r of list) {
    const col = TYPE_COLOR[r.types[0]] || '#0b6e5a';
    const pop = `<div class="lp"><img src="${esc(coverOf(r))}" alt=""><b>${esc(r.title)}</b>${esc(r.countries.join(', '))}${r.dist ? ` · ≈ ${fmtKm(r.dist)} км` : ''}<br><a href="route.html?id=${encodeURIComponent(r.id)}">Открыть маршрут →</a></div>`;
    if (r.ov) L.polyline(r.ov, { color: col, weight: 4, opacity: 0.85 }).bindPopup(pop).addTo(layer);
    if (r.start) L.circleMarker(r.start, { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 }).bindPopup(pop).addTo(layer);
  }
  if (list.length) map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 9 });
}
function run() {
  const list = filter();
  const word = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'маршрут' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'маршрута' : 'маршрутов');
  $('#count-line').textContent = `${list.length} ${word(list.length)}${list.length !== all.length ? ` из ${all.length}` : ''} · ${countries.length} стран`;
  const html = list.map((r) => card(r, fav));
  if (html.length > 6) html.splice(6, 0, `<div class="ad-card">${adHTML('wide')}</div>`);
  $('#list').innerHTML = html.join(''); $('#empty').hidden = !!list.length;
  draw(list);
  const p = new URLSearchParams();
  for (const k of ['q', 'country', 'dist', 'gain', 'surface', 'month', 'sort']) if (f[k].value) p.set(k, f[k].value);
  if (types.size) p.set('type', [...types].join(',')); if (diffs.size) p.set('diff', [...diffs].join(','));
  history.replaceState(null, '', '?' + p.toString() + location.hash);
}
bindFav($('#list'), fav);
$('#v-list').onclick = () => { $('#map').hidden = true; $('#v-list').setAttribute('aria-pressed', 'true'); $('#v-map').setAttribute('aria-pressed', 'false'); $('#v-list').classList.remove('btn-ghost'); $('#v-map').classList.add('btn-ghost'); };
$('#v-map').onclick = () => { $('#map').hidden = false; map.invalidateSize(); $('#v-map').setAttribute('aria-pressed', 'true'); $('#v-list').setAttribute('aria-pressed', 'false'); $('#v-map').classList.remove('btn-ghost'); $('#v-list').classList.add('btn-ghost'); };
run();
if (location.hash === '#map') $('#map').scrollIntoView({ block: 'center' });
