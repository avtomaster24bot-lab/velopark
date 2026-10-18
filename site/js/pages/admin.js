import * as api from '../api.js';
import { $, $$, layout, esc, TYPES, DIFF, SURF, seasonText, fmtKm, fmtDate, toast, loginUrl } from '../ui.js';
import { makeMap } from '../map.js';
const me = await layout();
const DEMO = !api.READY;
const SQL_URL = 'https://raw.githubusercontent.com/avtomaster24bot-lab/velopark/main/supabase/migrations/20261018000001_velopark.sql';
const REASONS = { wrong: 'Неверная информация', danger: 'Опасно / закрыто', spam: 'Спам', rude: 'Оскорбления', copyright: 'Чужие фото/текст', personal: 'Личные данные', other: 'Другое' };
if (DEMO) {
  $('#adm-line').innerHTML = `<div class="demo-flag">База Velopark ещё не подключена. Откройте <a href="${SQL_URL}" target="_blank">SQL-миграцию</a>, скопируйте всё, вставьте в Supabase → SQL Editor и нажмите Run. Ниже — пример того, как будет выглядеть модерация.</div>`;
} else if (!me) { $('#adm').innerHTML = `<div class="empty"><a href="${loginUrl()}">Войдите</a> аккаунтом администратора.</div>`; throw new Error('stop'); }
else if (!me.is_admin) { $('#adm').innerHTML = '<div class="empty">Нет прав администратора. Права выдаются в Supabase: profiles.is_admin = true.</div>'; throw new Error('stop'); }
else $('#adm-line').textContent = `Администратор: ${me.first_name || ''}`;
const q = (k) => (DEMO ? api.demoQueue(k) : api.adminQueue(k));
async function counts() {
  const c = DEMO ? { routes: 1, stories: 1, reports: 1 } : await api.adminCounts();
  for (const k of ['routes', 'stories', 'reports']) $('#c-' + k).textContent = c[k] || '';
}
const maps = [];
async function tab(t) {
  $$('#adm-tabs .tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  maps.splice(0).forEach((m) => m.remove());
  const box = $('#adm'); box.innerHTML = '<div class="skeleton">Загрузка…</div>';
  const list = await q(t).catch((e) => { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return null; }); if (!list) return;
  if (!list.length) { box.innerHTML = '<div class="empty">Очередь пуста 🎉</div>'; return; }
  if (t === 'routes') {
    box.innerHTML = list.map((r) => `<div class="mod" data-id="${r.id}"><div><div class="map" id="am-${r.id}"></div><div class="mph">${(r.vp_photos || []).map((p) => `<a href="${esc(api.photoUrl(p.path))}" target="_blank"><img src="${esc(api.photoUrl(p.path))}" alt=""></a>`).join('')}</div></div>
      <div>${DEMO ? '<span class="badge st-pending">Пример</span> ' : ''}<h3>${esc(r.title)}</h3><p class="hint">✍ ${esc(r.author_name || '')} · ${fmtDate(r.created_at)} · ${esc(r.country)}${r.region ? ', ' + esc(r.region) : ''}</p>
      <p><b>${(r.types || []).map((x) => TYPES[x]).join(', ')}</b> · ${DIFF[r.difficulty]} · ${SURF[r.surface] || ''} · ≈ ${fmtKm(r.distance_km)} км${r.elevation_gain_m ? ` · +${r.elevation_gain_m} м` : ''} · сезон: ${seasonText(r.season)}</p>
      <p style="white-space:pre-wrap">${esc(r.description)}</p>${r.highlights ? `<p><b>Посмотреть:</b> ${esc(r.highlights)}</p>` : ''}${r.tips ? `<p><b>Советы:</b> ${esc(r.tips)}</p>` : ''}
      <div class="acts"><button class="btn btn-sm" data-act="approved">✓ Одобрить</button><input placeholder="Причина отказа (увидит автор)" maxlength="500"><button class="btn btn-sm btn-red" data-act="rejected">Отклонить</button><a class="btn btn-sm btn-ghost" href="route.html?id=u${r.id}" target="_blank">Открыть</a></div></div></div>`).join('');
    for (const r of list) {
      const { L, map } = await makeMap($('#am-' + r.id), {}); maps.push(map);
      const pl = L.polyline((r.geometry || []).map((p) => [p[0], p[1]]), { color: '#0b6e5a', weight: 4 }).addTo(map); map.fitBounds(pl.getBounds(), { padding: [10, 10] });
    }
  } else if (t === 'stories') {
    box.innerHTML = list.map((s) => `<div class="mod" data-id="${s.id}"><div class="mph">${(s.vp_photos || []).map((p) => `<a href="${esc(api.photoUrl(p.path))}" target="_blank"><img src="${esc(api.photoUrl(p.path))}" alt=""></a>`).join('') || '<span class="hint">без фото</span>'}</div>
      <div>${DEMO ? '<span class="badge st-pending">Пример</span> ' : ''}<h3>${esc(s.title)}</h3><p class="hint">✍ ${esc(s.author_name || '')} · ${fmtDate(s.created_at)}${s.route_ref ? ' · маршрут ' + esc(s.route_ref) : ''}</p><p style="white-space:pre-wrap">${esc(s.body)}</p>
      <div class="acts"><button class="btn btn-sm" data-act="approved">✓ Одобрить</button><input placeholder="Причина отказа" maxlength="500"><button class="btn btn-sm btn-red" data-act="rejected">Отклонить</button></div></div></div>`).join('');
  } else if (t === 'reports') {
    const link = (tg) => tg.startsWith('s:') ? `route.html?id=${tg.slice(2)}` : tg.startsWith('u:') ? `route.html?id=u${tg.slice(2)}` : tg.startsWith('st:') ? `story.html?id=${tg.slice(3)}` : null;
    box.innerHTML = list.map((r) => `<div class="row-item" data-id="${r.id}"><div class="grow"><b>${REASONS[r.reason] || r.reason}</b> — ${link(r.target) ? `<a href="${link(r.target)}" target="_blank">${esc(r.target)}</a>` : `комментарий ${esc(r.target)}`}<div class="hint">${fmtDate(r.created_at)}${r.comment ? ' · ' + esc(r.comment) : ''}</div></div>
      ${r.target.startsWith('c:') ? '<button class="btn btn-sm btn-red" data-hidec>Скрыть комментарий</button>' : ''}<button class="btn btn-sm btn-ghost" data-close>Закрыть жалобу</button></div>`).join('');
  } else if (t === 'comments') {
    box.innerHTML = list.map((c) => `<div class="row-item" data-id="${c.id}"><div class="grow"><b>${esc(c.author_name || '')}</b> <span class="hint">${fmtDate(c.created_at)} · ${esc(c.target)}</span><p style="margin:.3em 0;white-space:pre-wrap">${esc(c.body)}</p></div>
      <span class="badge st-${c.status === 'hidden' ? 'hidden' : 'approved'}">${c.status === 'hidden' ? 'Скрыт' : 'Виден'}</span><button class="btn btn-sm btn-ghost" data-toggle="${c.status === 'hidden' ? 'approved' : 'hidden'}">${c.status === 'hidden' ? 'Показать' : 'Скрыть'}</button></div>`).join('');
  }
  box.onclick = async (e) => {
    const it = e.target.closest('[data-id]'); if (!it) return; const id = +it.dataset.id;
    if (DEMO && e.target.closest('button')) { toast('Это пример — модерация заработает после SQL-миграции'); return; }
    try {
      const act = e.target.dataset.act;
      if (act) { const reason = it.querySelector('input')?.value.trim(); if (act === 'rejected' && !reason) { toast('Укажите причину отказа', 'err'); return; } await api.setStatus(t, id, act, reason); it.remove(); toast(act === 'approved' ? 'Опубликовано' : 'Отклонено'); counts(); }
      if (e.target.matches('[data-close]')) { await api.closeReport(id); it.remove(); counts(); }
      if (e.target.matches('[data-hidec]')) { const rep = list.find((x) => x.id === id); await api.setCommentStatus(+rep.target.slice(2), 'hidden'); await api.closeReport(id); it.remove(); toast('Комментарий скрыт'); counts(); }
      if (e.target.dataset.toggle) { await api.setCommentStatus(id, e.target.dataset.toggle); tab('comments'); }
    } catch (er) { toast(er.message, 'err'); }
  };
}
$$('#adm-tabs .tab').forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
counts(); tab('routes');
