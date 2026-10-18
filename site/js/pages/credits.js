import { $, layout, esc } from '../ui.js';
layout();
const [cred, idx] = await Promise.all([fetch('data/credits.json').then((r) => r.json()), fetch('data/index.json').then((r) => r.json())]);
const t = Object.fromEntries(idx.map((r) => [r.id, r.title]));
$('#credits').innerHTML = cred.map((c) => `<figure><img src="img/photos/${c.k}-s.webp" alt="" loading="lazy"><figcaption><a href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.file)}</a><br>Автор: ${esc(c.author)} · ${c.license_url ? `<a href="${esc(c.license_url)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}<br>Маршрут: <a href="route.html?id=${c.route}">${esc(t[c.route] || c.route)}</a> · фото уменьшено</figcaption></figure>`).join('');
