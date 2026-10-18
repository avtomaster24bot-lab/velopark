// GPX: разбор в браузере, упрощение, длина, набор высоты, профиль, экспорт
const R = 6371;
export function hav(a, b) {
  const t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function parseGPX(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Файл не похож на GPX');
  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
  if (!nodes.length) nodes = [...doc.getElementsByTagName('wpt')];
  const pts = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute('lat')), lon = parseFloat(n.getAttribute('lon'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const e = n.getElementsByTagName('ele')[0]; const ele = e ? parseFloat(e.textContent) : null;
    pts.push([lat, lon, isFinite(ele) ? ele : null]);
  }
  if (pts.length < 2) throw new Error('В файле нет трека (точек trkpt/rtept)');
  const name = doc.querySelector('trk > name, rte > name, metadata > name')?.textContent?.trim() || '';
  return { name, pts, hasEle: pts.filter((p) => p[2] != null).length > pts.length * 0.8 };
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; if (d > best) { best = d; bi = i; }
    }
    if (best > eps * eps) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export function simplify(pts, maxN = 2000) {
  let eps = 0.00001, out = rdp(pts, eps);
  while (out.length > maxN) { eps *= 1.7; out = rdp(pts, eps); }
  return out;
}
export function statsFromPts(pts) {
  let km = 0, gain = 0, loss = 0, min = Infinity, max = -Infinity, last = null;
  for (let i = 0; i < pts.length; i++) {
    if (i) km += hav(pts[i - 1], pts[i]);
    const e = pts[i][2];
    if (e != null) {
      min = Math.min(min, e); max = Math.max(max, e);
      if (last == null) last = e;
      else if (e - last >= 4) { gain += e - last; last = e; }   // порог 4 м гасит шум GPS
      else if (last - e >= 4) { loss += last - e; last = e; }
    }
  }
  return { km, gain: Math.round(gain), loss: Math.round(loss), min: isFinite(min) ? Math.round(min) : null, max: isFinite(max) ? Math.round(max) : null };
}
export function profileFromPts(pts, n = 300) {
  const out = []; let km = 0; const step = Math.max(1, Math.floor(pts.length / n));
  for (let i = 0; i < pts.length; i++) {
    if (i) km += hav(pts[i - 1], pts[i]);
    if ((i % step === 0 || i === pts.length - 1) && pts[i][2] != null) out.push([+km.toFixed(2), Math.round(pts[i][2])]);
  }
  return out.length > 1 ? out : null;
}
export function toGPX(name, line, note) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Velopark" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${esc(name)}</name><desc>${esc(note)}</desc></metadata>\n<trk><name>${esc(name)}</name><trkseg>\n` +
    line.map((p) => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('\n') + '\n</trkseg></trk>\n</gpx>\n';
}
// Высоты по модели рельефа (Open-Meteo, Copernicus DEM) для нарисованной линии
export async function demElevations(pts, n = 100) {
  const total = pts.reduce((s, p, i) => s + (i ? hav(pts[i - 1], p) : 0), 0);
  const samp = []; let k = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const d = (total * i) / (n - 1);
    while (k < pts.length - 2 && acc + hav(pts[k], pts[k + 1]) < d) { acc += hav(pts[k], pts[k + 1]); k++; }
    const seg = hav(pts[k], pts[k + 1]) || 1, t = Math.min(1, (d - acc) / seg);
    samp.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
  }
  const u = `https://api.open-meteo.com/v1/elevation?latitude=${samp.map((p) => p[0].toFixed(5)).join(',')}&longitude=${samp.map((p) => p[1].toFixed(5)).join(',')}`;
  const j = await (await fetch(u)).json();
  if (!j.elevation) throw new Error('Не удалось получить высоты');
  return samp.map((p, i) => [+p[0].toFixed(5), +p[1].toFixed(5), Math.round(j.elevation[i])]);
}
// Привязка нарисованной линии к дорогам (OSRM, профиль велосипеда, данные OSM)
export async function snapToRoads(points) {
  const c = points.map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(';');
  const j = await (await fetch(`https://routing.openstreetmap.de/routed-bike/route/v1/driving/${c}?overview=full&geometries=geojson`)).json();
  if (j.code !== 'Ok') throw new Error('Не удалось проложить по дорогам — линия останется прямой');
  return j.routes[0].geometry.coordinates.map((x) => [x[1], x[0]]);
}
