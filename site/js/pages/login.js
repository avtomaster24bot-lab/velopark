import * as api from '../api.js';
import { CONFIG } from '../config.js';
import { $, layout, params, toast } from '../ui.js';
const me = await layout();
const next = (() => { const n = params().next; if (!n) return 'my.html'; try { const u = new URL(n, location.href); if (u.origin !== location.origin || /login\.html$/.test(u.pathname)) return 'my.html'; return u.href; } catch { return 'my.html'; } })();
if (me) { location.replace(next); }
else if (!api.AUTH_OK) { $('#login-msg').textContent = 'Вход временно недоступен — попробуйте через несколько минут.'; }
else {
  window.onTelegramAuth = async (user) => {
    $('#login-msg').textContent = 'Проверяем вход…';
    try { await api.loginWithTelegram(user); toast('Вы вошли!'); location.replace(next); } catch (e) { $('#login-msg').textContent = e.message; toast(e.message, 'err'); }
  };
  const s = document.createElement('script'); s.async = true; s.src = 'https://telegram.org/js/telegram-widget.js?22';
  Object.assign(s.dataset, { telegramLogin: CONFIG.TELEGRAM_BOT_USERNAME, size: 'large', radius: '12', userpic: 'false', onauth: 'onTelegramAuth(user)' });
  $('#tg-widget').append(s);
}
