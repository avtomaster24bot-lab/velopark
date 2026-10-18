import * as api from '../api.js';
import { $, $$, layout, esc, card, bindFav, toast, fmtDate, loginUrl } from '../ui.js';
import { checkSub, allowed, forgetSub, gateNoteHTML, bindGateNote } from '../membership.js';
const me = await layout();
const ST = { pending: 'На модерации', approved: 'Опубликовано', rejected: 'Отклонено', hidden: 'Скрыто' };
$$('.tab').forEach((b) => (b.onclick = () => { $$('.tab').forEach((x) => x.classList.toggle('on', x === b)); $('#pane-pubs').hidden = b.dataset.tab !== 'pubs'; $('#pane-fav').hidden = b.dataset.tab !== 'fav'; }));
if (location.hash === '#fav') $$('.tab')[1].click();
// избранное работает и без входа (хранится в браузере)
const [fav, all] = await Promise.all([api.favorites(), api.allRoutes()]);
const favList = all.filter((r) => fav.has(r.id));
$('#pane-fav').innerHTML = favList.length ? `<div class="cards">${favList.map((r) => card(r, fav)).join('')}</div>` : '<div class="empty">В избранном пока пусто. Нажимайте ♡ на карточках маршрутов.</div>';
bindFav($('#pane-fav'), fav);
if (!me) {
  $('#me-line').innerHTML = 'Вы не вошли. Избранное сохраняется в этом браузере.';
  $('#pane-pubs').innerHTML = `<div class="empty">Чтобы добавлять маршруты и рассказы, <a href="${loginUrl()}">войдите через Telegram</a>.</div>`;
} else {
  $('#me-line').innerHTML = `${esc(me.first_name || '')} · <button class="btn btn-sm btn-ghost" id="logout">Выйти</button>`;
  $('#logout').onclick = async () => { forgetSub(); await api.logout(); location.href = './'; };
  // подписка на канал — условие публикации
  const sub = await checkSub(me);
  if (!allowed(sub)) {
    $('#pane-pubs').insertAdjacentHTML('beforebegin', `<div id="my-gate">${gateNoteHTML('Подпишитесь, чтобы добавлять маршруты, рассказы и комментарии.')}</div>`);
    bindGateNote($('#my-gate'), me, () => location.reload());
  }
  if (!api.READY) $('#pane-pubs').innerHTML = '<div class="empty">Публикации появятся, когда администратор подключит базу Velopark.</div>';
  else {
    const { routes, stories } = await api.mine();
    const row = (kind, x) => `<div class="row-item" data-kind="${kind}" data-id="${kind === 'route' ? x.dbid : x.id}"><img src="${esc(kind === 'route' ? (x.coverUrl || 'assets/placeholder.svg') : api.photoUrl(x.cover_path))}" alt="">
      <div class="grow"><b>${esc(x.title)}</b><div class="hint">${kind === 'route' ? 'Маршрут' : 'Рассказ'} · ${fmtDate(x.created_at)}</div>${x.status === 'rejected' && x.reject_reason ? `<div class="reason">Причина: ${esc(x.reject_reason)}</div>` : ''}</div>
      <span class="badge st-${x.status}">${ST[x.status]}</span><a class="btn btn-sm btn-ghost" href="${kind === 'route' ? 'route.html?id=u' + x.dbid : 'story.html?id=' + x.id}">Открыть</a><button class="btn btn-sm btn-ghost" data-del>Удалить</button></div>`;
    $('#pane-pubs').innerHTML = (routes.length || stories.length) ? routes.map((x) => row('route', x)).join('') + stories.map((x) => row('story', x)).join('')
      : '<div class="empty">У вас пока нет публикаций. <a href="add.html">Добавить маршрут</a> или <a href="add.html?tab=story">рассказ</a>.</div>';
    $('#pane-pubs').onclick = async (e) => {
      if (!e.target.matches('[data-del]')) return; const it = e.target.closest('.row-item');
      if (!confirm('Удалить публикацию вместе с фото? Это нельзя отменить.')) return;
      try { if (it.dataset.kind === 'route') await api.deleteRoute(+it.dataset.id); else await api.deleteStory(+it.dataset.id); it.remove(); toast('Удалено'); } catch (er) { toast(er.message, 'err'); }
    };
  }
}
