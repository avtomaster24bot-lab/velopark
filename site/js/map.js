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
  return { L, map };
}
