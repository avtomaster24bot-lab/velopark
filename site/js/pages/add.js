import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, $$, layout, esc, params, TYPES, MONTHS, COUNTRIES, toast, fmtKm, fmtM, loginUrl } from '../ui.js';
import { makeMap } from '../map.js';
import { parseGPX, simplify, statsFromPts, profileFromPts, demElevations, snapToRoads } from '../gpx.js';
import { renderProfile } from '../chart.js';
import { compressImage } from '../image.js';
import { checkSub, allowed, showGate, gateNoteHTML, bindGateNote } from '../membership.js';
const me = await layout();
const P = params();
// ---------------------------------------------------------------- вкладки
let mapRef = null;
const show = (t) => { $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); $('#f-route').hidden = t !== 'route'; $('#f-story').hidden = t !== 'story'; if (t === 'route') setTimeout(() => mapRef?.invalidateSize(), 50); };
$$('.tab').forEach((b) => (b.onclick = () => show(b.dataset.tab)));
// ---------------------------------------------------------------- состояние входа и базы
let canSubmit = true;
if (!api.READY) {
  canSubmit = false;
  $('#add-notice').innerHTML = `<div class="note">🛠 <span><b>Публикация скоро заработает.</b> Сейчас администратор подключает базу данных. Вы уже можете попробовать: загрузите GPX или нарисуйте маршрут — увидите, как он ляжет на карту и какой получится профиль.</span></div>`;
} else if (!me) {
  canSubmit = false;
  $('#add-notice').innerHTML = `<div class="note">🔑 <span>Чтобы отправить маршрут или рассказ, <a href="${loginUrl()}"><b>войдите через Telegram</b></a> — это быстро, без телефона и паролей.</span></div>`;
} else if (me.is_banned) { canSubmit = false; $('#add-notice').innerHTML = '<div class="note">⛔ Аккаунт заблокирован.</div>'; }
// вход в Velopark — только для подписчиков Telegram-канала (смотреть и пробовать форму можно всем)
let subBlocked = false;
if (canSubmit) {
  const sub = await checkSub(me);
  if (!allowed(sub)) {
    canSubmit = false; subBlocked = true;
    $('#add-notice').innerHTML = gateNoteHTML('Подпишитесь — и сможете отправлять маршруты и рассказы. Форму можно заполнять уже сейчас.');
    const unlock = () => { canSubmit = true; subBlocked = false; $('#add-notice').innerHTML = ''; for (const b of [$('#r-submit'), $('#s-submit')]) { b.disabled = false; b.title = ''; } };
    bindGateNote($('#add-notice'), me, unlock);
    showGate(me).then((ok) => ok && unlock());
  }
}
for (const b of [$('#r-submit'), $('#s-submit')]) if (!canSubmit) { b.disabled = true; b.title = subBlocked ? 'Только для подписчиков канала' : 'Сначала войдите'; }
// ---------------------------------------------------------------- поля
const fr = $('#f-route'), fs = $('#f-story');
const types = new Set(); const months = new Set();
$('#a-types').innerHTML = Object.entries(TYPES).map(([k, v]) => `<button type="button" class="chip" data-type="${k}" aria-pressed="false">${v}</button>`).join('');
$('#a-types').onclick = (e) => { const b = e.target.closest('[data-type]'); if (!b) return; const k = b.dataset.type; if (types.has(k)) types.delete(k); else if (types.size < 4) types.add(k); else toast('Не больше 4 типов'); b.setAttribute('aria-pressed', types.has(k)); };
$('#a-months').innerHTML = MONTHS.map((m, i) => `<button type="button" class="chip" data-m="${i + 1}" aria-pressed="false">${m}</button>`).join('');
$('#a-months').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; const k = +b.dataset.m; months.has(k) ? months.delete(k) : months.add(k); b.setAttribute('aria-pressed', months.has(k)); };
fr.country.innerHTML = '<option value="">— выберите —</option>' + COUNTRIES.map((c) => `<option>${esc(c)}</option>`).join('');
// ---------------------------------------------------------------- карта и линия
const { L, map } = await makeMap($('#add-map'), { center: [43.24, 76.9], zoom: 6, scroll: true }); mapRef = map;
let geom = null;      // [[lat, lon, ele|null]]
let gpxFile = null, drawPts = [], drawLayer = L.layerGroup().addTo(map), lineLayer = null, mode = 'gpx';
function setGeom(pts, { fit = true } = {}) {
  geom = pts;
  lineLayer && lineLayer.remove();
  if (!pts || pts.length < 2) { $('#geo-stats').innerHTML = ''; $('#add-profile').innerHTML = ''; $('#add-profile').className = ''; return; }
  lineLayer = L.polyline(pts.map((p) => [p[0], p[1]]), { color: '#0b6e5a', weight: 5 }).addTo(map);
  if (fit) map.fitBounds(lineLayer.getBounds(), { padding: [20, 20] });
  const st = statsFromPts(pts), hasEle = pts.filter((p) => p[2] != null).length > pts.length * 0.8;
  $('#geo-stats').innerHTML = `<span>↔ ${fmtKm(st.km)} км</span>${hasEle ? `<span>⛰ +${fmtM(st.gain)} м</span><span>▲ ${fmtM(st.max)} м</span>` : '<span>высот нет</span>'}<span>${pts.length} точек</span>`;
  const prof = hasEle ? profileFromPts(pts) : null;
  if (prof) { $('#add-profile').className = 'profile'; renderProfile($('#add-profile'), prof, { note: mode === 'draw' ? 'Высоты — по модели рельефа (Open-Meteo)' : 'Высоты из GPX' }); } else { $('#add-profile').innerHTML = ''; $('#add-profile').className = ''; }
}
$$('[data-geo]').forEach((b) => (b.onclick = () => {
  mode = b.dataset.geo; $$('[data-geo]').forEach((x) => x.classList.toggle('btn-ghost', x !== b));
  $('#geo-gpx').hidden = mode !== 'gpx'; $('#geo-draw').hidden = mode !== 'draw';
  if (mode === 'draw') { gpxFile = null; setGeom(null); redraw(); toast('Нажимайте на карту, чтобы ставить точки'); } else { drawPts = []; drawLayer.clearLayers(); setGeom(null); }
}));
async function loadGpx(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('GPX больше 5 МБ', 'err'); return; }
  try {
    const g = parseGPX(await file.text());
    const pts = simplify(g.pts, CONFIG.MAX_GPX_POINTS).map((p) => [+p[0].toFixed(5), +p[1].toFixed(5), p[2] != null ? Math.round(p[2]) : null]);
    gpxFile = file; setGeom(pts);
    if (!fr.title.value && g.name) fr.title.value = g.name.slice(0, 120);
    toast(pts.length < g.pts.length ? `Трек загружен: ${g.pts.length} точек, упрощено до ${pts.length}` : `Трек загружен: ${pts.length} точек`);
  } catch (e) { toast(e.message, 'err'); }
}
$('#gpx').onchange = (e) => loadGpx(e.target.files[0]);
const drop = $('#geo-gpx .drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); loadGpx(e.dataTransfer.files[0]); });
// рисование
let tmr = null, seq = 0;
map.on('click', (e) => { if (mode !== 'draw') return; drawPts.push([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]); redraw(); });
$('#d-undo').onclick = () => { drawPts.pop(); redraw(); };
$('#d-clear').onclick = () => { drawPts = []; redraw(); };
$('#d-snap').onchange = () => redraw();
function redraw() {
  drawLayer.clearLayers();
  drawPts.forEach((p, i) => L.circleMarker(p, { radius: 6, color: '#fff', weight: 2, fillColor: i ? '#0b6e5a' : '#2b8a3e', fillOpacity: 1 }).addTo(drawLayer));
  if (drawPts.length < 2) { setGeom(null); return; }
  setGeom(drawPts.map((p) => [p[0], p[1], null]), { fit: false });
  clearTimeout(tmr); const my = ++seq;
  tmr = setTimeout(async () => {
    let line = drawPts.map((p) => [p[0], p[1]]);
    if ($('#d-snap').checked && drawPts.length <= 60) { try { line = await snapToRoads(drawPts); } catch (e) { toast(e.message); } }
    if (my !== seq) return;
    line = simplify(line, CONFIG.MAX_GPX_POINTS);
    let pts = line.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5), null]);
    try { const ele = await demElevations(line, 100); if (my !== seq) return; pts = densifyWithEle(pts, ele); } catch { /* без высот */ }
    setGeom(pts, { fit: false });
  }, 700);
}
// высоты модели — на 100 опорных точках; для каждой точки линии берём ближайшую опорную
function densifyWithEle(pts, ele) { return pts.map((p) => { let best = ele[0], bd = 1e9; for (const e of ele) { const d = (e[0] - p[0]) ** 2 + (e[1] - p[1]) ** 2; if (d < bd) { bd = d; best = e; } } return [p[0], p[1], best[2]]; }); }
// ---------------------------------------------------------------- фото
function photoPicker(input, thumbs, max) {
  const list = [];
  input.onchange = async () => {
    for (const f of [...input.files]) {
      if (list.length >= max) { toast(`Не больше ${max} фото`); break; }
      try { const c = await compressImage(f); c.url = URL.createObjectURL(c.blob); list.push(c); } catch (e) { toast(e.message, 'err'); }
    }
    input.value = ''; paint();
  };
  const paint = () => { thumbs.innerHTML = list.map((c, i) => `<div class="t"><img src="${c.url}" alt=""><button type="button" class="x" data-i="${i}" aria-label="Убрать">×</button></div>`).join(''); };
  thumbs.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { list.splice(+b.dataset.i, 1); paint(); } };
  return list;
}
const rPhotos = photoPicker($('#r-photos'), $('#r-thumbs'), CONFIG.MAX_ROUTE_PHOTOS);
const sPhotos = photoPicker($('#s-photos'), $('#s-thumbs'), CONFIG.MAX_STORY_PHOTOS);
// ---------------------------------------------------------------- отправка маршрута
const msg = (el, t, ok) => { el.textContent = t; el.className = 'form-msg ' + (ok ? 'ok' : 'err'); };
fr.onsubmit = async (e) => {
  e.preventDefault(); const m = $('#r-msg');
  if (!canSubmit) return msg(m, subBlocked ? 'Только для подписчиков канала @velopark_kz' : api.READY ? 'Сначала войдите через Telegram' : 'Публикация ещё не включена');
  if (!geom || geom.length < 2) return msg(m, 'Добавьте линию маршрута: GPX или нарисуйте на карте');
  if (fr.title.value.trim().length < 3) return msg(m, 'Укажите название');
  if (!types.size) return msg(m, 'Выберите хотя бы один тип');
  if (!fr.country.value) return msg(m, 'Выберите страну');
  if (fr.description.value.trim().length < 20) return msg(m, 'Описание — хотя бы 20 знаков');
  if (!fr.agree.checked) return msg(m, 'Подтвердите согласие с правилами');
  const st = statsFromPts(geom), hasEle = geom.filter((p) => p[2] != null).length > geom.length * 0.8;
  const row = { title: fr.title.value.trim(), description: fr.description.value.trim(), types: [...types], difficulty: fr.difficulty.value, country: fr.country.value,
    region: fr.region.value.trim() || null, distance_km: Math.round(st.km * 10) / 10, elevation_gain_m: hasEle ? st.gain : null, ele_min: hasEle ? st.min : null, ele_max: hasEle ? st.max : null,
    surface: fr.surface.value, season: [...months].sort((a, b) => a - b), highlights: fr.highlights.value.trim() || null, tips: fr.tips.value.trim() || null,
    geometry: geom.map((p) => (p[2] != null ? p : [p[0], p[1]])), has_ele: hasEle, start_lat: geom[0][0], start_lon: geom[0][1] };
  $('#r-submit').disabled = true; msg(m, 'Отправляем…', true);
  try {
    const id = await api.createRoute(row, rPhotos, gpxFile);
    fr.innerHTML = `<h2>Спасибо! Маршрут отправлен на модерацию ✅</h2><p>Обычно проверка занимает до суток. Статус видно в <a href="my.html">кабинете</a>; после одобрения маршрут появится в каталоге: <a href="route.html?id=u${id}">ссылка на маршрут</a>.</p><p><a class="btn" href="add.html">Добавить ещё</a> <a class="btn btn-ghost" href="add.html?tab=story&route=u:${id}">Рассказать об этой поездке</a></p>`;
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (er) { msg(m, er.message); $('#r-submit').disabled = false; }
};
// ---------------------------------------------------------------- рассказ
const all = await api.allRoutes();
fs.route_ref.innerHTML += all.slice().sort((a, b) => a.title.localeCompare(b.title, 'ru')).map((r) => `<option value="${esc(api.refOf(r.id))}">${esc(r.title)}</option>`).join('');
if (P.route) fs.route_ref.value = P.route;
fs.onsubmit = async (e) => {
  e.preventDefault(); const m = $('#s-msg');
  if (!canSubmit) return msg(m, subBlocked ? 'Только для подписчиков канала @velopark_kz' : api.READY ? 'Сначала войдите через Telegram' : 'Публикация ещё не включена');
  if (fs.title.value.trim().length < 3) return msg(m, 'Укажите заголовок');
  if (fs.body.value.trim().length < 50) return msg(m, 'Рассказ — хотя бы 50 знаков');
  if (!fs.agree.checked) return msg(m, 'Подтвердите согласие с правилами');
  $('#s-submit').disabled = true; msg(m, 'Отправляем…', true);
  try {
    const id = await api.createStory({ title: fs.title.value.trim(), body: fs.body.value.trim(), route_ref: fs.route_ref.value || null }, sPhotos);
    fs.innerHTML = `<h2>Спасибо! Рассказ отправлен на модерацию ✅</h2><p>Статус — в <a href="my.html">кабинете</a>. После одобрения: <a href="story.html?id=${id}">ссылка на рассказ</a>.</p>`;
  } catch (er) { msg(m, er.message); $('#s-submit').disabled = false; }
};
show(P.tab === 'story' ? 'story' : 'route');
