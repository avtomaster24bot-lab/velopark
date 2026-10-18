import * as api from '../api.js';
import { $, layout, esc, params, fmtDate, adHTML } from '../ui.js';
import { reportDialog, commentsBlock } from './shared.js';
const meP = layout();
const s = await api.getStory(params().id).catch(() => null);
const box = $('#story');
if (!s) box.innerHTML = `<div class="nf"><h1>Рассказ не найден</h1><p class="muted">Возможно, он ещё на модерации.</p><p><a class="btn" href="stories.html">Все рассказы</a></p></div>`;
else {
  document.title = `${s.title} — Velopark`;
  const all = await api.allRoutes(); const r = s.route_ref ? all.find((x) => api.refOf(x.id) === s.route_ref) : null;
  const photos = (s.vp_photos || []).sort((a, b) => a.position - b.position);
  box.innerHTML = `<div class="r-head"><div class="crumbs"><a href="stories.html">Рассказы</a></div><h1>${esc(s.title)}</h1>
    <p class="muted">✍ ${esc(s.author_name || 'Велосипедист')} · ${fmtDate(s.approved_at || s.created_at)}${s.status !== 'approved' ? ` · <span class="badge st-${s.status}">${s.status === 'pending' ? 'На модерации' : s.status === 'rejected' ? 'Отклонено' : 'Скрыто'}</span>` : ''}</p>
    ${r ? `<p><a class="badge" href="route.html?id=${encodeURIComponent(r.id)}">🗺 Маршрут: ${esc(r.title)}</a></p>` : ''}</div>
    ${photos[0] ? `<img src="${esc(api.photoUrl(photos[0].path))}" alt="" style="width:100%;border-radius:16px;max-height:520px;object-fit:cover">` : ''}
    <div class="story-body prose">${esc(s.body)}</div>
    ${photos.length > 1 ? `<div class="sphotos">${photos.slice(1).map((p) => `<a href="${esc(api.photoUrl(p.path))}" target="_blank"><img src="${esc(api.photoUrl(p.path))}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
    <p><button class="btn btn-sm btn-ghost" id="rep">⚑ Пожаловаться</button></p>
    <div class="ad-slot">${adHTML('wide')}</div><section id="cmts"></section>`;
  const me = await meP;
  $('#rep').onclick = () => reportDialog('st:' + s.id, me);
  commentsBlock($('#cmts'), 'st:' + s.id, me);
  api.view('story', s.id);
}
