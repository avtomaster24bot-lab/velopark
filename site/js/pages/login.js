import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, layout, params, toast } from '../ui.js';
import { checkSub, allowed, showGate } from '../membership.js';
const me = await layout();
const next = (() => { const n = params().next; if (!n) return 'my.html'; try { const u = new URL(n, location.href); if (u.origin !== location.origin || /login\.html$/.test(u.pathname)) return 'my.html'; return u.href; } catch { return 'my.html'; } })();
// после входа: проверяем подписку на канал. Подписчиков (и пока проверка не настроена — всех) пускаем дальше.
async function afterLogin(user, fresh) {
  $('#login-msg').textContent = 'Проверяем подписку на канал…';
  const r = await checkSub(user, { force: true });
  if (allowed(r)) { if (fresh) toast('Вы вошли!'); location.replace(next); return; }
  $('#login-msg').innerHTML = r.state === 'setup' ? 'Проверка подписки временно не работает — попробуйте позже.' : 'Вы вошли через Telegram, но ещё не подписаны на канал. Смотреть маршруты можно, а публиковать — после подписки.';
  const ok = await showGate(user);
  if (ok) { toast('Добро пожаловать в Velopark!'); location.replace(next); }
  else $('#login-msg').innerHTML = `<a class="btn btn-sm btn-ghost" href="./">На главную</a> <button class="btn btn-sm" id="sub-again">Я подписался — проверить</button>`, $('#sub-again').onclick = () => afterLogin(user, false);
}
if (me) { afterLogin(me, false); }
else if (!api.AUTH_OK) { $('#login-msg').textContent = 'Вход временно недоступен — попробуйте через несколько минут.'; }
else {
  window.onTelegramAuth = async (user) => {
    $('#login-msg').textContent = 'Проверяем вход…';
    try { await api.loginWithTelegram(user); const m = await api.getMe(); await afterLogin(m || { id: user.id }, true); } catch (e) { $('#login-msg').textContent = e.message; toast(e.message, 'err'); }
  };
  const s = document.createElement('script'); s.async = true; s.src = 'https://telegram.org/js/telegram-widget.js?22';
  Object.assign(s.dataset, { telegramLogin: CONFIG.TELEGRAM_BOT_USERNAME, size: 'large', radius: '12', userpic: 'false', onauth: 'onTelegramAuth(user)' });
  $('#tg-widget').append(s);
}
