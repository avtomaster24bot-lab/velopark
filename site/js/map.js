// Карта: Leaflet + плитки OpenStreetMap / OpenTopoMap (без ключей API)
let LP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!LP) LP = new Promise((res, rej) => {
    if (!document.querySelector('link[href*="leaflet.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.append(l); }
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => res(window.L); s.onerror = () => rej(new Error('Карта не загрузилась'));
    document.head.append(s);
  });
  return LP;
}
let CP = null;
// Кластеры маркеров (Leaflet.markercluster) — для больших наборов точек
export function loadCluster() {
  if (window.L && window.L.markerClusterGroup) return Promise.resolve(window.L);
  if (!CP) CP = loadLeaflet().then((L) => new Promise((res) => {
    for (const h of ['MarkerCluster.css', 'MarkerCluster.Default.css']) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://unpkg.com/leaflet.markercluster@1.5.3/dist/${h}`; document.head.append(l); }
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
    s.onload = () => res(L); s.onerror = () => res(L); document.head.append(s);
  }));
  return CP;
}
export async function clusterGroup(L) {
  await loadCluster();
  return L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true, chunkedLoading: true }) : L.featureGroup();
}
export async function makeMap(el, opts = {}) {
  const L = await loadLeaflet();
  const map = L.map(el, { worldCopyJump: true, scrollWheelZoom: opts.scroll ?? false, zoomControl: true, attributionControl: true, minZoom: 2, ...opts });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | стиль © <a href="https://opentopomap.org">OpenTopoMap</a> (CC BY-SA)' });
  (opts.topo ? topo : osm).addTo(map);
  L.control.layers({ 'Карта OSM': osm, 'Рельеф (OpenTopoMap)': topo }, null, { position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  // колесо мыши — только после клика по карте (чтобы не мешать прокрутке страницы)
  if (!opts.scroll) { map.once('focus', () => map.scrollWheelZoom.enable()); el.addEventListener('click', () => map.scrollWheelZoom.enable(), { once: true }); }
  if (opts.guard !== false && matchMedia('(pointer: coarse)').matches) touchGuard(L, map, el);
  return { L, map };
}
// Сенсорные экраны: пока карта не активирована, она не двигается и не мешает листать страницу.
function touchGuard(L, map, el) {
  map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable(); if (map.tap) map.tap.disable();
  el.style.touchAction = 'pan-y';
  const ov = document.createElement('button'); ov.type = 'button'; ov.className = 'map-guard'; ov.innerHTML = '<span>👆 Нажмите, чтобы двигать карту</span>';
  const done = document.createElement('button'); done.type = 'button'; done.className = 'map-done'; done.textContent = 'Готово ✓'; done.hidden = true;
  el.append(ov, done);
  const on = () => { map.dragging.enable(); map.touchZoom.enable(); map.doubleClickZoom.enable(); if (map.tap) map.tap.enable(); el.style.touchAction = 'none'; ov.hidden = true; done.hidden = false; };
  const off = () => { map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable(); if (map.tap) map.tap.disable(); el.style.touchAction = 'pan-y'; ov.hidden = false; done.hidden = true; };
  L.DomEvent.disableClickPropagation(ov); L.DomEvent.disableClickPropagation(done);
  ov.addEventListener('click', on); done.addEventListener('click', off);
  // ушли с карты (прокрутили страницу дальше) — снова выключаем
  new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting) off(); }), { threshold: 0.15 }).observe(el);
}
