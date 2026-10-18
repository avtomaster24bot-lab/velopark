import * as api from '../api.js';
import { $, esc, toast, fmtDate, loginUrl } from '../ui.js';
import { checkSub, allowed, requireSub, gateNoteHTML, bindGateNote } from '../membership.js';
const REASONS = { wrong: 'Неверная или устаревшая информация', danger: 'Опасно, закрыто, запрещено', spam: 'Спам или реклама', rude: 'Оскорбления', copyright: 'Чужие фото или текст', personal: 'Личные данные', other: 'Другое' };
export function reportDialog(target, me) {
  if (!api.READY) { toast('Жалобы заработают после настройки базы. Пока можно написать в поддержку.'); return; }
  if (!me) { location.href = loginUrl(); return; }
  requireSub(me).then((ok) => ok && openReport(target));
}
function openReport(target) {
  const d = document.createElement('dialog'); d.className = 'panel';
  d.innerHTML = `<form method="dialog" class="form"><h3>Пожаловаться</h3>${Object.entries(REASONS).map(([k, v], i) => `<label class="chk"><input type="radio" name="reason" value="${k}" ${i ? '' : 'checked'}> ${v}</label>`).join('')}
    <label class="fl" style="margin-top:10px">Комментарий<textarea name="comment" maxlength="1000" rows="3"></textarea></label>
    <div style="display:flex;gap:8px"><button class="btn" value="ok">Отправить</button><button class="btn btn-ghost" value="cancel">Отмена</button></div></form>`;
  document.body.append(d); d.showModal();
  d.addEventListener('close', async () => {
    if (d.returnValue === 'ok') { const f = d.querySelector('form'); try { await api.report(target, f.reason.value, f.comment.value.trim()); toast('Спасибо! Модератор проверит.'); } catch (e) { toast(e.message, 'err'); } }
    d.remove();
  });
}
export async function commentsBlock(el, target, me) {
  if (!api.READY) return;
  const [list, sub] = await Promise.all([api.comments(target), me ? checkSub(me) : null]);
  const canPost = me && allowed(sub);
  el.innerHTML = `<div class="comments"><h2>Комментарии <span class="muted">${list.length || ''}</span></h2><div id="clist">${list.map(row).join('') || '<p class="muted" id="c-empty">Комментариев пока нет.</p>'}</div>
    ${me && !canPost ? `<div id="c-gate">${gateNoteHTML('Комментировать могут только подписчики нашего Telegram-канала.')}</div>` : ''}${canPost ? `<form class="cform" id="cform"><textarea name="body" maxlength="2000" placeholder="Вопрос или совет по маршруту" required minlength="2"></textarea><button class="btn">Отправить</button></form><p class="hint">Не пишите телефон и личные данные. Комментарии видны всем.</p>` : me ? '' : `<p><a href="${loginUrl()}">Войдите через Telegram</a>, чтобы оставить комментарий.</p>`}</div>`;
  if (me && !canPost) bindGateNote(el.querySelector('#c-gate'), me, () => location.reload());
  function row(c) {
    return `<div class="cmt" data-id="${c.id}"><b>${esc(c.author_name || 'Велосипедист')}</b><time>${fmtDate(c.created_at)}</time>${c.status === 'hidden' ? ' <span class="badge st-hidden">скрыт</span>' : ''}<p>${esc(c.body)}</p>
      ${me && c.user_id === me.id ? '<button class="lnk" data-del>Удалить</button>' : me ? '<button class="lnk" data-rep>Пожаловаться</button>' : ''}</div>`;
  }
  el.querySelector('#cform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const body = f.body.value.trim(); if (body.length < 2) return;
    f.querySelector('button').disabled = true;
    try { const c = await api.addComment(target, body); $('#c-empty')?.remove(); $('#clist').insertAdjacentHTML('beforeend', row({ ...c, user_id: me.id })); f.reset(); }
    catch (er) { toast(er.message, 'err'); } finally { f.querySelector('button').disabled = false; }
  });
  el.addEventListener('click', async (e) => {
    const c = e.target.closest('.cmt'); if (!c) return;
    if (e.target.matches('[data-del]') && confirm('Удалить комментарий?')) { try { await api.deleteComment(+c.dataset.id); c.remove(); } catch (er) { toast(er.message, 'err'); } }
    if (e.target.matches('[data-rep]')) reportDialog('c:' + c.dataset.id, me);
  });
}
