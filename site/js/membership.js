// Вход в Velopark — только для подписчиков Telegram-канала @velopark_kz.
// После входа через Telegram сайт вызывает Edge Function velopark-check-sub: она спрашивает у Telegram,
// подписан ли человек, и записывает ответ в базу. Публиковать (маршруты, рассказы, фото, комментарии,
// жалобы) база разрешает только подписчикам; смотреть сайт может любой.
// Если функция ещё не задеплоена — сайт пускает всех (чтобы ничего не сломалось), админ видит подсказку.
import { CONFIG } from './config.js';
import * as api from './api.js';

export const CHANNEL = (CONFIG.TELEGRAM_CHANNEL || 'velopark_kz').replace(/^@/, '');
export const CHANNEL_URL = `https://t.me/${CHANNEL}`;
const FN_URL = `${CONFIG.SUPABASE_URL}/functions/v1/velopark-check-sub`;
const KEY = 'velopark-sub-v1';
const FRESH_MS = 12 * 3600 * 1000; // подтверждённую подписку перепроверяем раз в 12 часов (и при каждом входе)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const readCache = (uid) => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.uid === uid ? c : null; } catch { return null; } };
const writeCache = (uid, ok) => { try { localStorage.setItem(KEY, JSON.stringify({ uid, ok, t: Date.now() })); } catch { /* */ } };
export const forgetSub = () => { try { localStorage.removeItem(KEY); } catch { /* */ } };

const SETUP_ERRORS = new Set(['bot_not_admin', 'channel_not_found', 'bad_bot_token', 'server_misconfigured']);

// state: 'ok' — подписан (или админ) · 'no' — не подписан · 'unconfigured' — функция не задеплоена (пускаем)
//        'setup' — ошибка настройки (бот не админ и т.п.) · 'error' — временная ошибка
async function callFn() {
  const s = await api.client();
  const { data: { session } } = await s.auth.getSession();
  if (!session) return { state: 'error', error: 'no_session' };
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 12000);
  let r;
  try {
    r = await fetch(FN_URL, { method: 'POST', signal: ctrl.signal, headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
  } catch (e) {
    // функция не задеплоена: шлюз Supabase отвечает 404 без CORS-заголовков → браузер видит сетевую ошибку
    return navigator.onLine === false ? { state: 'error', error: 'offline' } : { state: 'unconfigured', error: 'not_deployed' };
  } finally { clearTimeout(tm); }
  const j = await r.json().catch(() => ({}));
  if (r.ok && typeof j.subscribed === 'boolean') return { state: j.subscribed ? 'ok' : 'no', status: j.status, stored: j.stored };
  if (r.status === 404 && !j.error) return { state: 'unconfigured', error: 'not_deployed' };
  if (SETUP_ERRORS.has(j.error)) return { state: 'setup', error: j.error };
  return { state: 'error', error: j.error || `http_${r.status}` };
}

let memo = null;
// Проверить подписку. force — спросить Telegram заново (при входе и по кнопке «Я подписался»).
export async function checkSub(me, { force = false } = {}) {
  if (!me) return { state: 'no_login' };
  const c = readCache(me.id);
  if (!force) {
    if (memo && memo.uid === me.id) return memo.res;
    if (c && c.ok && Date.now() - c.t < FRESH_MS) return { state: 'ok', cached: true };
  }
  let res = await callFn();
  if (res.state === 'ok') writeCache(me.id, true);
  else if (res.state === 'no') forgetSub();
  else if ((res.state === 'setup' || res.state === 'error') && c && c.ok && Date.now() - c.t < 30 * 86400 * 1000) {
    res = { ...res, state: 'ok', degraded: true }; // Telegram/настройка временно не отвечает — недавно подтверждённый подписчик не теряет доступ
  }
  if (me.is_admin && res.state !== 'ok') res = { ...res, state: 'ok', admin: true, real: res.state };
  if (res.state !== 'error') memo = { uid: me.id, res };
  if (me.is_admin) adminNotice(res);
  return res;
}
export const allowed = (res) => res && (res.state === 'ok' || res.state === 'unconfigured');

// ---------------------------------------------------------------- подсказка админу
function adminNotice(res) {
  const err = res.real === 'unconfigured' || res.state === 'unconfigured' ? 'not_deployed' : (res.error || '');
  const msg = {
    not_deployed: 'Проверка подписки на канал ещё не настроена: задеплойте Edge Function <b>velopark-check-sub</b> в Supabase. Пока все вошедшие могут публиковать.',
    bot_not_admin: `Бот @${esc(CONFIG.TELEGRAM_BOT_USERNAME)} не администратор канала <b>@${esc(CHANNEL)}</b> — Telegram не даёт ему видеть подписчиков. Добавьте бота в администраторы канала (права можно все снять).`,
    channel_not_found: `Telegram не нашёл канал <b>@${esc(CHANNEL)}</b>. Проверьте адрес канала и что бот в нём администратор.`,
    bad_bot_token: 'Секрет TELEGRAM_BOT_TOKEN в Supabase неверный — Telegram его не принял.',
    server_misconfigured: 'В Supabase не задан секрет TELEGRAM_BOT_TOKEN (Edge Functions → Secrets).',
  }[err];
  if (!msg || document.getElementById('sub-admin-note')) return;
  injectCss();
  const d = document.createElement('div'); d.id = 'sub-admin-note'; d.className = 'sub-admin';
  d.innerHTML = `<span>🛠 <b>Только для админа.</b> ${msg}</span><button aria-label="Скрыть">✕</button>`;
  d.querySelector('button').onclick = () => d.remove();
  document.body.append(d);
}

// ---------------------------------------------------------------- окно «только для подписчиков»
function injectCss() {
  if (document.getElementById('sub-css')) return;
  const st = document.createElement('style'); st.id = 'sub-css';
  st.textContent = `
.subgate{border:0;padding:0;border-radius:20px;max-width:440px;width:calc(100% - 28px);box-shadow:0 20px 60px rgba(10,40,30,.3)}
.subgate::backdrop{background:rgba(12,30,25,.55);backdrop-filter:blur(2px)}
.subgate .sg{padding:26px 22px 20px;text-align:center;outline:none}
.subgate .sg-ico{width:64px;height:64px;border-radius:50%;background:#229ed9;display:grid;place-items:center;margin:0 auto 12px}
.subgate h2{font-size:21px;line-height:1.25;margin:0 0 10px}
.subgate p{color:var(--ink2);font-size:15px;line-height:1.5;margin:0 0 10px}
.subgate ol{text-align:left;color:var(--ink2);font-size:14.5px;line-height:1.5;margin:6px 0 16px;padding-left:22px}
.subgate .sg-btns{display:flex;flex-direction:column;gap:10px}
.subgate .sg-btns .btn{width:100%}
.subgate .sg-msg{min-height:20px;font-size:14px;margin:10px 0 0;color:var(--mute)}.subgate .sg-msg.err{color:var(--red)}
.subgate .sg-close{background:none;border:0;color:var(--mute);font:600 14px var(--font);margin-top:8px;cursor:pointer;padding:6px}
.sub-admin{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;gap:10px;align-items:flex-start;max-width:720px;margin:0 auto;background:#fff8e6;border:1px solid #f6dfa4;color:#6b5200;border-radius:12px;padding:12px 14px;font-size:14px;box-shadow:0 8px 30px rgba(0,0,0,.15)}
.sub-admin span{flex:1}.sub-admin button{background:none;border:0;font-size:16px;cursor:pointer;color:#6b5200}
.subnote .btn{margin:8px 8px 0 0}`;
  document.head.append(st);
}
const TG_ICON = '<svg width="34" height="34" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M9.8 15.6 9.4 20c.6 0 .9-.3 1.2-.6l2.9-2.7 6 4.4c1.1.6 1.9.3 2.2-1L24 3.6c.4-1.6-.6-2.3-1.6-1.9L1 10.1c-1.5.6-1.5 1.4-.3 1.8l5.6 1.7L19.4 5.4c.6-.4 1.2-.2.7.2"/></svg>';

// Показать окно. Возвращает Promise<boolean>: true — подписка подтверждена, false — закрыли.
export function showGate(me, { reason } = {}) {
  injectCss();
  document.querySelector('dialog.subgate')?.remove();
  const d = document.createElement('dialog'); d.className = 'subgate';
  d.innerHTML = `<div class="sg" tabindex="-1" autofocus>
    <div class="sg-ico">${TG_ICON}</div>
    <h2>Вход в Velopark — только для подписчиков канала @${esc(CHANNEL)}</h2>
    <p>${reason ? esc(reason) + ' ' : ''}Смотреть маршруты может каждый, а добавлять маршруты, рассказы и комментарии — только подписчики нашего Telegram-канала. Так мы защищаемся от спама и ботов.</p>
    <ol><li>Нажмите «Подписаться на канал» — откроется Telegram.</li><li>Нажмите в канале «Подписаться» (Join).</li><li>Вернитесь сюда и нажмите «Я подписался — проверить».</li></ol>
    <div class="sg-btns">
      <a class="btn btn-lg btn-tg" href="${CHANNEL_URL}" target="_blank" rel="noopener">Подписаться на канал</a>
      <button class="btn btn-lg btn-ghost" data-check>Я подписался — проверить</button>
    </div>
    <p class="sg-msg" role="status"></p>
    <button class="sg-close" data-close>Пока просто посмотреть сайт</button>
  </div>`;
  document.body.append(d);
  d.showModal(); d.querySelector('.sg').focus();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; d.close(); d.remove(); resolve(v); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
    d.querySelector('[data-close]').onclick = () => finish(false);
    const msg = d.querySelector('.sg-msg'); const btn = d.querySelector('[data-check]');
    btn.onclick = async () => {
      btn.disabled = true; msg.className = 'sg-msg'; msg.textContent = 'Проверяем подписку…';
      const r = me ? await checkSub(me, { force: true }) : { state: 'no_login' };
      btn.disabled = false;
      if (allowed(r)) { msg.textContent = 'Готово! Подписка подтверждена.'; setTimeout(() => finish(true), 600); return; }
      msg.className = 'sg-msg err';
      msg.textContent = r.state === 'no' ? 'Пока не видим подписку. Подпишитесь на канал и нажмите ещё раз (иногда Telegram обновляется несколько секунд).'
        : r.state === 'setup' ? 'Проверка подписки временно не работает — администратор уже в курсе. Попробуйте позже.'
          : r.state === 'no_login' ? 'Сначала войдите через Telegram.' : 'Не удалось проверить — проверьте интернет и нажмите ещё раз.';
    };
  });
}

// Плашка для страниц с формами (вместо формы / над формой)
export function gateNoteHTML(text = 'Добавлять маршруты, рассказы и комментарии могут только подписчики нашего Telegram-канала.') {
  injectCss();
  return `<div class="note subnote">📣 <span><b>Только для подписчиков канала @${esc(CHANNEL)}.</b> ${esc(text)}<br>
    <a class="btn btn-sm btn-tg" href="${CHANNEL_URL}" target="_blank" rel="noopener">Подписаться на канал</a><button class="btn btn-sm btn-ghost" data-subcheck>Я подписался — проверить</button></span></div>`;
}
// Подключить кнопку «проверить» в плашке; onOk вызывается после подтверждения
export function bindGateNote(root, me, onOk) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-subcheck]'); if (!b) return;
    b.disabled = true; const t = b.textContent; b.textContent = 'Проверяем…';
    const r = await checkSub(me, { force: true });
    b.disabled = false; b.textContent = t;
    if (allowed(r)) onOk(); else showGate(me).then((ok) => ok && onOk());
  });
}
// Требовать подписку перед действием: true — можно, false — показали окно и человек его закрыл
export async function requireSub(me) {
  const r = await checkSub(me);
  if (allowed(r)) return true;
  return showGate(me);
}
