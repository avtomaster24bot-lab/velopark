import * as api from '../api.js';
import { $, layout, esc, fmtDate } from '../ui.js';
layout();
const [list, all] = await Promise.all([api.listStories({ limit: 100 }), api.allRoutes()]);
const title = (ref) => { if (!ref) return ''; const r = all.find((x) => api.refOf(x.id) === ref); return r ? r.title : ''; };
$('#stories').innerHTML = list.length ? list.map((s) => `<a class="scard" href="story.html?id=${s.id}"><img src="${esc(api.photoUrl(s.cover_path))}" alt="" loading="lazy"><div class="bd"><h3>${esc(s.title)}</h3>
  ${title(s.route_ref) ? `<span class="badge">🗺 ${esc(title(s.route_ref))}</span>` : ''}<p>${esc(s.body.slice(0, 240))}…</p><span class="hint">✍ ${esc(s.author_name || '')} · ${fmtDate(s.approved_at || s.created_at)}</span></div></a>`).join('')
  : `<div class="empty">Рассказов пока нет. Проехали интересный маршрут? <a href="add.html?tab=story">Расскажите первым!</a></div>`;
