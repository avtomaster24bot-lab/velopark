import { CONFIG } from './config.js';
import * as api from './api.js';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const params = () => Object.fromEntries(new URLSearchParams(location.search));
export const TYPES = { road: 'Шоссе', mtb: 'MTB', gravel: 'Гравий', city: 'Город', touring: 'Туринг', bikepacking: 'Байкпакинг', family: 'Семейный' };
export const TYPE_ICON = { road: '🚴', mtb: '🚵', gravel: '🪨', city: '🏙', touring: '🧳', bikepacking: '⛺', family: '👨‍👩‍👧' };
export const TYPE_COLOR = { road: '#d9480f', mtb: '#7b2cbf', gravel: '#a0522d', city: '#1971c2', touring: '#0b6e5a', bikepacking: '#2b8a3e', family: '#e6a700' };
export const DIFF = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', extreme: 'Экстрим', na: 'Не указана' };
export const SURF = { asphalt: 'Асфальт', gravel: 'Гравий', dirt: 'Грунт, тропы', mixed: 'Смешанное', na: 'Нет данных' };
export const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const COUNTRIES = ['Казахстан', 'Россия', 'Кыргызстан', 'Узбекистан', 'Таджикистан', 'Туркменистан', 'Беларусь', 'Армения', 'Грузия', 'Азербайджан', 'Монголия', 'Китай',
  'Турция', 'Германия', 'Австрия', 'Швейцария', 'Франция', 'Италия', 'Испания', 'Португалия', 'Нидерланды', 'Бельгия', 'Польша', 'Чехия', 'Словакия', 'Венгрия', 'Словения', 'Хорватия',
  'Сербия', 'Болгария', 'Румыния', 'Греция', 'Норвегия', 'Швеция', 'Финляндия', 'Дания', 'Исландия', 'Великобритания', 'Ирландия', 'Литва', 'Латвия', 'Эстония', 'Украина', 'Молдова',
  'Израиль', 'ОАЭ', 'Иран', 'Индия', 'Непал', 'Пакистан', 'Таиланд', 'Вьетнам', 'Лаос', 'Камбоджа', 'Малайзия', 'Индонезия', 'Япония', 'Южная Корея', 'Тайвань', 'Филиппины',
  'США', 'Канада', 'Мексика', 'Куба', 'Колумбия', 'Перу', 'Боливия', 'Чили', 'Аргентина', 'Бразилия', 'Марокко', 'Египет', 'Кения', 'Танзания', 'ЮАР', 'Австралия', 'Новая Зеландия', 'Другая страна'];
export const fmtKm = (v) => (v == null ? '—' : (v >= 100 ? Math.round(v).toLocaleString('ru-RU') : (Math.round(v * 10) / 10).toLocaleString('ru-RU')));
export const fmtM = (v) => (v == null ? '—' : Math.round(v).toLocaleString('ru-RU'));
export const fmtDate = (s) => new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
export const tgLink = (text) => `https://t.me/${CONFIG.SUPPORT_TELEGRAM}?text=${encodeURIComponent(text)}`;
export function seasonText(s) {
  if (!s || !s.length) return '—'; if (s.length === 12) return 'круглый год';
  const set = new Set(s); const prev = (m) => (m === 1 ? 12 : m - 1), next = (m) => (m === 12 ? 1 : m + 1);
  const starts = s.filter((m) => !set.has(prev(m)));
  if (starts.length === 1) { const a = starts[0]; let b = a; while (set.has(next(b))) b = next(b); return a === b ? MONTHS_FULL[a - 1] : `${MONTHS[a - 1]}–${MONTHS[b - 1]}`; }
  return s.map((x) => MONTHS[x - 1]).join(', ');
}
let tmr; export function toast(msg, kind) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.className = 'toast' + (kind ? ' ' + kind : ''); t.hidden = false; clearTimeout(tmr); tmr = setTimeout(() => (t.hidden = true), 3800); }
export function coverOf(r, small = true) { return r.coverUrl || (r.cover ? api.seedPhoto(r.cover, small) : `assets/ph/${(r.types || [])[0] || 'touring'}.svg`); }
export function card(r, fav) {
  const href = `route.html?id=${encodeURIComponent(r.id)}`;
  const km = r.dist != null ? `≈ ${fmtKm(r.dist)} км` : '';
  return `<a class="card" href="${href}"><div class="ph"><img src="${esc(coverOf(r))}" alt="" loading="lazy">
    ${r.diff && r.diff !== 'na' ? `<span class="tag badge d-${r.diff}">${DIFF[r.diff] || ''}</span>` : ''}${r.ugc ? '<span class="ugc badge">от пользователя</span>' : r.osm ? '<span class="ugc badge osm">OSM</span>' : ''}
    ${fav ? `<button class="fav${fav.has(r.id) ? ' on' : ''}" data-fav="${esc(r.id)}" aria-label="В избранное" title="В избранное">${fav.has(r.id) ? '♥' : '♡'}</button>` : ''}</div>
    <div class="bd"><h3>${esc(r.title)}</h3><div class="meta"><span>📍 ${esc(r.rname || (r.osm ? r.region : '') || r.countries.join(', '))}</span>${km ? `<span>↔ ${km}</span>` : ''}${r.gain ? `<span>⛰ ≈ ${fmtM(r.gain)} м</span>` : ''}</div>
    <p class="sum">${esc(r.summary)}</p><div class="meta">${r.types.map((t) => `<span><i class="dot" style="background:${TYPE_COLOR[t]}"></i> ${TYPES[t]}</span>`).join('')}</div></div></a>`;
}
export function bindFav(root, fav) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return; e.preventDefault(); e.stopPropagation();
    const id = b.dataset.fav, on = !fav.has(id); on ? fav.add(id) : fav.delete(id);
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((x) => { x.classList.toggle('on', on); x.textContent = on ? '♥' : '♡'; });
    try { await api.toggleFav(id, on); toast(on ? 'Добавлено в избранное' : 'Убрано из избранного'); } catch (er) { toast(er.message, 'err'); }
  });
}
// ---------------------------------------------------------------- реклама
let adN = Math.floor(Math.random() * 100);
export function adHTML(kind) {
  const list = CONFIG.ADS[kind] || []; if (!list.length) return '';
  const a = list[adN++ % list.length]; const ext = /^https?:/.test(a.href);
  return `<a class="ad" href="${esc(a.href)}"${ext ? ' target="_blank" rel="noopener sponsored"' : ''}><img src="${esc(a.img)}" alt="${esc(a.alt)}" loading="lazy"><span class="adlbl">Реклама</span></a>
    <div class="ad-order"><a class="js-order-ad" href="${tgLink(CONFIG.AD_ORDER_TEXT)}" target="_blank" rel="noopener">Заказать рекламу</a></div>`;
}
export function galleryAd() { const list = CONFIG.ADS.gallery; return list[adN++ % list.length]; }
function fillAds() { $$('.ad-slot[data-ad]').forEach((s) => { if (!s.innerHTML.trim()) s.innerHTML = adHTML(s.dataset.ad); }); }
// ---------------------------------------------------------------- шапка
export async function layout() {
  $('#menu')?.addEventListener('click', () => $('#nav').classList.toggle('open'));
  $$('#nav a').forEach((a) => a.addEventListener('click', () => $('#nav').classList.remove('open')));
  $$('.js-order-ad').forEach((a) => { a.href = tgLink(CONFIG.AD_ORDER_TEXT); a.target = '_blank'; a.rel = 'noopener'; });
  $$('.js-support').forEach((a) => { a.href = tgLink(CONFIG.SUPPORT_TEXT); a.target = '_blank'; a.rel = 'noopener'; });
  fillAds();
  const me = await api.getMe();
  const box = $('#userbox');
  if (box) {
    if (me) {
      box.innerHTML = `${me.is_admin ? '<a class="btn btn-sm btn-ghost" href="admin.html">Модерация</a>' : ''}<a class="ubtn" href="my.html" title="Мой кабинет"><span class="ava">${esc((me.first_name || 'В')[0].toUpperCase())}</span><span class="hide-s">${esc(me.first_name || 'Кабинет')}</span></a>`;
    } else box.innerHTML = `<a class="btn btn-sm btn-ghost" href="login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}">Войти</a>`;
  }
  return me;
}
export function loginUrl() { return `login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`; }
