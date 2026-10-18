import * as api from '../api.js';
import { $, $$, layout, esc, params, TYPES, TYPE_COLOR, DIFF, SURF, seasonText, fmtKm, fmtM, card, bindFav, adHTML, galleryAd, toast, fmtDate, loginUrl, tgLink } from '../ui.js';
import { makeMap } from '../map.js';
import { renderProfile } from '../chart.js';
import { hav, toGPX } from '../gpx.js';
import { CONFIG } from '../config.js';
import { reportDialog, commentsBlock } from './shared.js';
const mePromise = layout();
const id = params().id || '';
const box = $('#route');
const r = await api.getRoute(id).catch(() => null);
if (!r) {
  box.innerHTML = `<div class="nf"><h1>Маршрут не найден</h1><p class="muted">Возможно, он ещё на модерации или был удалён.</p><p><a class="btn" href="routes.html">Все маршруты</a></p></div>`;
} else {
  await render();
}
async function render() {
  const ref = api.refOf(r.id);
  document.title = `${r.title} — Velopark`;
  document.querySelector('meta[name=description]')?.setAttribute('content', r.summary);
  const [fav, all] = await Promise.all([api.favorites(), api.allRoutes()]);
  const photos = r.ugc ? r.photos : r.photos.map((p) => ({ url: api.seedPhoto(p.k), cap: `Фото: ${p.author} · <a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.license)}</a>, Wikimedia Commons` }));
  const ad = galleryAd();
  if (!photos.length) photos.push({ url: `assets/ph/${r.types[0] || 'touring'}.svg`, cap: r.osm ? 'Фото пока нет. Есть своё? Расскажите о поездке — с фото.' : 'Фото пока нет' });
  const distTxt = r.dist != null ? `≈ ${fmtKm(r.dist)} км` : '—';
  const gainTxt = r.gain ? `≈ ${fmtM(r.gain)} м` : (r.gain_model ? `≈ ${fmtM(r.gain_model)} м` : '—');
  const gainNote = r.gain ? '' : (r.gain_model ? 'оценка по модели рельефа' : '');
  box.innerHTML = `
  <div class="r-head"><div class="crumbs"><a href="./">Главная</a> › <a href="routes.html">Маршруты</a> › <a href="routes.html?country=${encodeURIComponent(r.countries[0])}">${esc(r.countries[0])}</a>${r.reg ? ` › <a href="region.html?r=${encodeURIComponent(r.reg)}">${esc(r.rname || r.region)}</a>` : ''}</div>
    <h1>${esc(r.title)}</h1>
    <div class="r-badges">${r.diff !== 'na' ? `<span class="badge d-${r.diff}">${DIFF[r.diff]}</span>` : ''}${r.osm ? `<a class="badge" href="https://www.openstreetmap.org/relation/${r.osm}" target="_blank" rel="noopener">OSM ${r.osm}</a>` : ''}${r.types.map((t) => `<a class="badge" href="routes.html?type=${t}"><i class="dot" style="background:${TYPE_COLOR[t]}"></i> ${TYPES[t]}</a>`).join('')}<span class="badge">📍 ${esc(r.countries.join(' · '))}</span>${r.ugc ? `<span class="badge">✍ ${esc(r.author || 'Велосипедист')}</span>` : ''}</div>
    <p class="lead muted">${esc(r.summary)}</p>
    <div class="r-actions"><button class="btn btn-sm${fav.has(r.id) ? '' : ' btn-ghost'}" id="b-fav">${fav.has(r.id) ? '♥ В избранном' : '♡ В избранное'}</button>
      <button class="btn btn-sm btn-ghost" id="b-share">↗ Поделиться</button><button class="btn btn-sm btn-ghost" id="b-gpx">⬇ GPX${r.osm ? '' : ' (схема)'}</button>
      <a class="btn btn-sm btn-ghost" href="add.html?tab=story&route=${encodeURIComponent(ref)}">✍ Рассказать о поездке</a><button class="btn btn-sm btn-ghost" id="b-report">⚑ Пожаловаться</button></div></div>
  <div class="gallery" id="gal"><div class="slides">${photos.map((p) => `<div class="slide"><img src="${esc(p.url)}" alt="${esc(r.title)}" loading="lazy">${p.cap ? `<div class="cap">${p.cap}</div>` : ''}</div>`).join('')}
    <div class="slide ad"><a href="${esc(ad.href)}"${/^https?:/.test(ad.href) ? ' target="_blank" rel="noopener sponsored"' : ''}><img src="${esc(ad.img)}" alt="${esc(ad.alt)}" loading="lazy"></a><span class="adlbl">Реклама</span></div></div>
    <button class="nav prev" aria-label="Назад">‹</button><button class="nav next" aria-label="Вперёд">›</button><span class="count" id="gcount"></span></div>
  <div class="stats">
    <div class="stat"><small>Длина</small><b>${distTxt}</b><i>${r.dist_est ? 'оценка по схеме' : r.osm ? 'по геометрии OSM' : esc(r.ugc ? 'по треку автора' : '')}</i></div>
    <div class="stat"><small>Набор высоты</small><b>${gainTxt}</b><i>${gainNote}</i></div>
    <div class="stat"><small>Макс. высота</small><b>${r.ele_max != null ? '≈ ' + fmtM(r.ele_max) + ' м' : '—'}</b></div>
    <div class="stat"><small>Сложность</small><b>${DIFF[r.diff]}</b></div>
    <div class="stat"><small>Покрытие</small><b>${SURF[r.surface] || '—'}</b></div>
    <div class="stat"><small>Сезон</small><b>${seasonText(r.season)}</b></div></div>
  <div id="rmap" class="map map-route"></div>
  <div class="note">⚠️ <span>${r.osm ? `Линия — из OpenStreetMap (<a href="https://www.openstreetmap.org/relation/${r.osm}" target="_blank" rel="noopener">отношение ${r.osm}</a>), упрощена. Данные © участники OpenStreetMap, ODbL.` : r.ugc ? 'Линия упрощена по треку автора.' : 'Схематичная линия через известные опорные точки'+(r.line_mode === 'line' ? ' (прямыми отрезками)' : ', проложенная по дорогам OpenStreetMap')+'.'} Не для навигации: перед поездкой сверяйтесь с официальными картами и треками.</span></div>
  <div id="prof"></div>
  <div class="r-grid" style="margin-top:22px"><div>
    <section class="prose">${(r.desc || []).map((p) => `<p>${esc(p)}</p>`).join('')}
      ${r.dist_note ? `<p class="hint">📏 ${esc(r.dist_note)}${r.gain_note ? ' · ⛰ ' + esc(r.gain_note) : ''}</p>` : ''}</section>
    ${r.highlights?.length ? `<h2>Что посмотреть</h2><ul class="hl">${r.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    ${r.tips?.length ? `<h2>Советы</h2><ul class="tips prose">${r.tips.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    ${r.src?.length ? `<h2>Источники</h2><ul class="src">${r.src.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join('')}</ul>` : ''}
    <section id="stories-sec"></section>
    <section id="cmts"></section>
  </div><aside class="r-side">
    <div class="panel guides"><h3>Подготовка и ремонт в дороге</h3>${(r.guides?.length ? r.guides : defaultGuides()).map((g) => `<a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.t)}</a>`).join('')}<p class="hint">Инструкции — в <a href="${CONFIG.VELO_UNIVERSE}" target="_blank" rel="noopener">Вело-вселенной</a></p></div>
    <div class="ad-slot">${adHTML('side')}</div>
  </aside></div>
  <section class="sec"><h2>Рядом и похожие</h2><div class="near cards" id="near"></div></section>`;
  // галерея
  const sl = $('#gal .slides'), n = sl.children.length;
  const upd = () => { const i = Math.round(sl.scrollLeft / sl.clientWidth); $('#gcount').textContent = i >= n - 1 ? 'Реклама' : `${i + 1} / ${n - 1}`; };
  sl.addEventListener('scroll', () => requestAnimationFrame(upd)); upd();
  $('#gal .prev').onclick = () => sl.scrollBy({ left: -sl.clientWidth, behavior: 'smooth' });
  $('#gal .next').onclick = () => sl.scrollBy({ left: sl.clientWidth, behavior: 'smooth' });
  // кнопки
  $('#b-fav').onclick = async () => { const on = !fav.has(r.id); on ? fav.add(r.id) : fav.delete(r.id); await api.toggleFav(r.id, on); $('#b-fav').textContent = on ? '♥ В избранном' : '♡ В избранное'; $('#b-fav').classList.toggle('btn-ghost', !on); toast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); };
  $('#b-share').onclick = async () => { const u = location.href; try { if (navigator.share) await navigator.share({ title: r.title, url: u }); else { await navigator.clipboard.writeText(u); toast('Ссылка скопирована'); } } catch { /* */ } };
  $('#b-gpx').onclick = () => {
    const blob = new Blob([toGPX(r.title, [r.line, ...(r.segs || [])], r.osm ? `Velopark: линия из OpenStreetMap, relation ${r.osm}, упрощена. Data © OpenStreetMap contributors, ODbL.` : 'Velopark: схематичная линия, не для навигации. Данные © OpenStreetMap contributors (ODbL).')], { type: 'application/gpx+xml' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `velopark-${r.id}.gpx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#b-report').onclick = async () => reportDialog(ref, await mePromise);
  // карта
  const { L, map } = await makeMap($('#rmap'), { topo: r.types.some((t) => ['mtb', 'gravel', 'bikepacking'].includes(t)) });
  const all_lines = [r.line, ...(r.segs || [])];
  map.fitBounds(L.latLngBounds(all_lines.flat()), { padding: [24, 24] });
  for (const ln of all_lines) L.polyline(ln, { color: '#fff', weight: 9, opacity: 0.6 }).addTo(map);
  for (const ln of all_lines) L.polyline(ln, { color: '#0b6e5a', weight: 5, opacity: 0.9 }).addTo(map);
  const s = r.line[0], e = r.line[r.line.length - 1], loop = hav(s, e) < 1;
  L.circleMarker(s, { radius: 9, color: '#fff', weight: 3, fillColor: '#2b8a3e', fillOpacity: 1 }).addTo(map).bindTooltip(loop ? 'Старт и финиш' : 'Старт');
  if (!loop) L.circleMarker(e, { radius: 9, color: '#fff', weight: 3, fillColor: '#c8372d', fillOpacity: 1 }).addTo(map).bindTooltip('Финиш');
  (r.wp || []).forEach((w, i) => { if (i && i < r.wp.length - 1) L.circleMarker([w.lat, w.lon], { radius: 4, color: '#0b6e5a', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map).bindTooltip(esc(w.t), { className: 'wp-label', direction: 'top' }); });
  // профиль
  if (r.profile) {
    const cum = [0]; for (let i = 1; i < r.line.length; i++) cum.push(cum[i - 1] + hav(r.line[i - 1], r.line[i]));
    const maxP = r.profile[r.profile.length - 1][0]; let mk = null;
    $('#prof').className = 'profile';
    renderProfile($('#prof'), r.profile, { note: r.ugc ? 'Профиль по высотам из трека' : r.osm ? `Профиль — по модели рельефа Copernicus DEM (Open-Meteo) вдоль ${r.segs ? 'самого длинного участка' : 'линии'} OSM, приблизительный.` : 'Профиль — по модели рельефа Copernicus DEM (Open-Meteo) вдоль схематичной линии, приблизительный.',
      onHover: (km) => {
        if (km == null) { mk && mk.remove(); mk = null; return; }
        const d = (km / maxP) * cum[cum.length - 1]; let i = cum.findIndex((c) => c >= d); if (i < 1) i = 1;
        const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), p = [r.line[i - 1][0] + (r.line[i][0] - r.line[i - 1][0]) * t, r.line[i - 1][1] + (r.line[i][1] - r.line[i - 1][1]) * t];
        if (!mk) mk = L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: '#f28c28', fillOpacity: 1 }).addTo(map); else mk.setLatLng(p);
      } });
  } else if (r.osm) $('#prof').innerHTML = '<p class="hint">Профиль высот не показан: маршрут в OSM состоит из нескольких разрозненных участков.</p>';
  else if (!r.ugc) $('#prof').innerHTML = `<p class="hint">Профиль высот не показан: линия этого маршрута слишком схематичная, профиль по ней вводил бы в заблуждение.</p>`;
  // рядом
  const others = all.filter((x) => x.id !== r.id && x.start);
  const near = others.map((x) => ({ x, d: hav(x.start, r.line[0]) })).sort((a, b) => a.d - b.d);
  const pick = near.filter((o) => o.d < 1500).slice(0, 4).map((o) => o.x);
  for (const o of others) { if (pick.length >= 4) break; if (!pick.includes(o) && o.types.some((t) => r.types.includes(t))) pick.push(o); }
  $('#near').innerHTML = pick.map((x) => card(x, fav)).join(''); bindFav($('#near'), fav);
  // рассказы и комментарии
  const stories = await api.listStories({ route_ref: ref });
  $('#stories-sec').innerHTML = `<h2>Рассказы о поездках</h2>${stories.length ? stories.map((st) => `<a class="scard" href="story.html?id=${st.id}"><img src="${esc(api.photoUrl(st.cover_path))}" alt="" loading="lazy"><div class="bd"><h3>${esc(st.title)}</h3><p>${esc(st.body.slice(0, 200))}…</p><span class="hint">✍ ${esc(st.author_name || '')} · ${fmtDate(st.approved_at || st.created_at)}</span></div></a>`).join('') : '<p class="muted">Пока никто не рассказал об этом маршруте.</p>'}
    <p><a class="btn btn-ghost" href="add.html?tab=story&route=${encodeURIComponent(ref)}">✍ Рассказать о своей поездке</a></p>`;
  commentsBlock($('#cmts'), ref, await mePromise);
  api.view('route', r.dbid || 0);
}
function defaultGuides() {
  const V = CONFIG.VELO_UNIVERSE;
  return [{ url: V + 'guides/m-check/', t: 'М-проверка перед поездкой' }, { url: V + 'guides/puncture-patch/', t: 'Ремонт прокола в дороге' }, { url: V + 'trouble/', t: 'Что случилось? Поиск неисправности' }];
}
