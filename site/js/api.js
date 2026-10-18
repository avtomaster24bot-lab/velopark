// Слой данных Velopark: каталог из статических JSON + публикации пользователей из Supabase.
// Пока SQL-миграция не применена, сайт работает только с каталогом (без ошибок).
import { CONFIG } from './config.js';
import { profileFromPts, statsFromPts } from './gpx.js';

const HAS_KEYS = /^https:\/\/.+/.test(CONFIG.SUPABASE_URL || '') && !!CONFIG.SUPABASE_ANON_KEY;
const H = { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` };
async function probe(path) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 7000);
  try { const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, { headers: H, signal: ctrl.signal }); return r.ok; }
  catch { return false; } finally { clearTimeout(t); }
}
async function backend() {
  if (!HAS_KEYS) return { db: false, auth: false };
  const key = 'velopark-backend-v1';
  try { const c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < 60000) return c.v; } catch { /* */ }
  const [db, auth] = await Promise.all([probe('vp_routes?select=id&limit=1'), probe('known_brands?select=id&limit=1')]);
  const v = { db, auth };
  try { sessionStorage.setItem(key, JSON.stringify({ v, t: Date.now() })); } catch { /* */ }
  return v;
}
const B = await backend();
export const READY = B.db;          // таблицы Velopark созданы
export const AUTH_OK = B.auth;      // вход через Telegram работает (таблица profiles VeloMarket)
export const SETUP_PENDING = HAS_KEYS && !B.db;
export const isDemo = () => !READY && new URLSearchParams(location.search).has('demo');

let sb = null;
export async function client() {
  if (sb) return sb;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  // storageKey общий с VeloMarket: вошли там — вошли и здесь (один домен github.io)
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'velomarket-auth' } });
  return sb;
}
function human(e) {
  const m = e?.message || String(e);
  if (/JWT|session/i.test(m)) return 'Сессия истекла — войдите снова';
  if (/row-level security|permission denied|42501/i.test(m)) return 'Недостаточно прав для этого действия';
  if (/duplicate key.*vp_reports/i.test(m)) return 'Вы уже отправляли жалобу';
  if (/Payload too large|exceeded the maximum/i.test(m)) return 'Файл слишком большой';
  return m;
}
function must({ data, error }) { if (error) throw new Error(human(error)); return data; }
export function photoUrl(path, bucket = 'route-photos') {
  if (!path) return 'assets/placeholder.svg';
  if (/^(https?:|assets\/|img\/|data:|blob:)/.test(path)) return path;
  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

// ------------------------------------------------------------------ вход
let meP = null;
export function getMe() { if (!meP) meP = loadMe().catch(() => null); return meP; }
async function loadMe() {
  if (!AUTH_OK) return null;
  const s = await client();
  const { data: { session } } = await s.auth.getSession();
  if (!session) return null;
  const { data, error, status } = await s.from('profiles').select('id,username,first_name,is_admin,is_banned').eq('id', session.user.id).maybeSingle();
  if (error) {
    if (status === 401 || /JWT|token/i.test(error.message)) { await s.auth.signOut({ scope: 'local' }).catch(() => {}); return null; }
    return { id: session.user.id, first_name: 'Велосипедист', is_admin: false };
  }
  return data || { id: session.user.id, first_name: 'Велосипедист', is_admin: false };
}
export async function loginWithTelegram(tgUser) {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/telegram-auth`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(tgUser) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const map = { invalid_hash: 'Подпись Telegram не прошла проверку', auth_expired: 'Данные входа устарели, попробуйте ещё раз', too_many_requests: 'Слишком много попыток, подождите минуту', banned: 'Аккаунт заблокирован' };
    throw new Error(map[j.error] || `Ошибка входа (${j.error || r.status})`);
  }
  const s = await client();
  const { error } = await s.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
  if (error) throw new Error(human(error));
  meP = null; return j.user;
}
export async function logout() {
  meP = null; const s = await client();
  await s.auth.signOut({ scope: 'local' }).catch(() => {});
}

// ------------------------------------------------------------------ каталог (статический)
let idxP = null;
export function seedIndex() { if (!idxP) idxP = fetch('data/index.json').then((r) => r.json()); return idxP; }
export async function seedRoute(slug) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const r = await fetch(`data/r/${slug}.json`); return r.ok ? r.json() : null;
}
export const seedPhoto = (k, small) => `img/photos/${k}${small ? '-s' : ''}.webp`;

// ------------------------------------------------------------------ маршруты пользователей
const LIST_F = 'id,title,types,difficulty,country,region,distance_km,elevation_gain_m,ele_max,surface,season,start_lat,start_lon,cover_path,author_name,description,approved_at,created_at,status,reject_reason,views,user_id';
function fromDb(r) {
  return { id: 'u' + r.id, dbid: r.id, ugc: true, title: r.title, countries: [r.country], region: r.region || '', types: r.types || [], diff: r.difficulty,
    surface: r.surface, season: r.season || [], dist: r.distance_km != null ? Number(r.distance_km) : null, gain: r.elevation_gain_m, ele_max: r.ele_max,
    summary: (r.description || '').slice(0, 180), start: r.start_lat != null ? [r.start_lat, r.start_lon] : null, coverUrl: r.cover_path ? photoUrl(r.cover_path) : null,
    author: r.author_name, status: r.status, reject_reason: r.reject_reason, created_at: r.created_at, approved_at: r.approved_at, user_id: r.user_id, views: r.views };
}
export async function userRoutes() {
  if (!READY) return isDemo() ? demoRoutes() : [];
  try { const s = await client(); return must(await s.from('vp_routes').select(LIST_F).eq('status', 'approved').order('approved_at', { ascending: false }).limit(500)).map(fromDb); }
  catch { return []; }
}
export async function allRoutes() { const [a, b] = await Promise.all([seedIndex(), userRoutes()]); return [...a, ...b]; }
export async function getRoute(id) {
  if (/^u\d+$/.test(id)) {
    if (!READY) return isDemo() ? (await demoFull()) : null;
    const s = await client();
    const r = must(await s.from('vp_routes').select('*, vp_photos(path,position)').eq('id', +id.slice(1)).maybeSingle());
    if (!r) return null;
    return dbFull(r);
  }
  return seedRoute(id);
}
export function dbFull(r) {
  const base = fromDb(r);
  const pts = (r.geometry || []).map((p) => [p[0], p[1], p[2] ?? null]);
  const st = statsFromPts(pts);
  return { ...base, desc: (r.description || '').split(/\n{2,}/), highlights: (r.highlights || '').split('\n').map((x) => x.trim()).filter(Boolean),
    tips: (r.tips || '').split('\n').map((x) => x.trim()).filter(Boolean), line: pts.map((p) => [p[0], p[1]]), line_mode: 'user', line_km: st.km,
    profile: r.has_ele ? profileFromPts(pts) : null, ele_min: r.ele_min, ele_max: r.ele_max, gain_model: null,
    photos: (r.vp_photos || []).sort((a, b) => a.position - b.position).map((p) => ({ url: photoUrl(p.path) })),
    wp: [], src: [], guides: [], dist_note: null, gain_note: null };
}
export async function createRoute(row, photos, gpxFile) {
  const s = await client(); const me = await getMe(); if (!me) throw new Error('Нужно войти');
  const r = must(await s.from('vp_routes').insert(row).select('id').single());
  const paths = [];
  for (let i = 0; i < photos.length; i++) {
    const p = `${me.id}/r${r.id}/${i + 1}-${uuid().slice(0, 8)}.${photos[i].ext}`;
    must(await s.storage.from('route-photos').upload(p, photos[i].blob, { contentType: photos[i].blob.type, upsert: false }));
    must(await s.from('vp_photos').insert({ route_id: r.id, path: p, position: i }));
    paths.push(p);
  }
  let gpx_path = null;
  if (gpxFile) {
    gpx_path = `${me.id}/r${r.id}/track.gpx`;
    const { error } = await s.storage.from('route-gpx').upload(gpx_path, gpxFile, { contentType: 'application/gpx+xml', upsert: true });
    if (error) gpx_path = null;
  }
  if (paths.length || gpx_path) must(await s.from('vp_routes').update({ cover_path: paths[0] || null, gpx_path }).eq('id', r.id));
  return r.id;
}
export async function deleteRoute(id) {
  const s = await client();
  const ph = must(await s.from('vp_photos').select('path').eq('route_id', id));
  if (ph.length) await s.storage.from('route-photos').remove(ph.map((x) => x.path));
  const r = must(await s.from('vp_routes').select('gpx_path').eq('id', id).maybeSingle());
  if (r?.gpx_path) await s.storage.from('route-gpx').remove([r.gpx_path]);
  must(await s.from('vp_routes').delete().eq('id', id));
}

// ------------------------------------------------------------------ рассказы
const ST_F = 'id,title,body,route_ref,cover_path,author_name,status,reject_reason,created_at,approved_at,views,user_id';
export async function listStories({ route_ref, limit = 60 } = {}) {
  if (!READY) return isDemo() ? demoStories() : [];
  try {
    const s = await client(); let q = s.from('vp_stories').select(ST_F).eq('status', 'approved');
    if (route_ref) q = q.eq('route_ref', route_ref);
    return must(await q.order('approved_at', { ascending: false }).limit(limit));
  } catch { return []; }
}
export async function getStory(id) {
  if (!READY) return isDemo() ? demoStories()[0] : null;
  const s = await client();
  return must(await s.from('vp_stories').select(ST_F + ', vp_photos(path,position)').eq('id', +id).maybeSingle());
}
export async function createStory(row, photos) {
  const s = await client(); const me = await getMe(); if (!me) throw new Error('Нужно войти');
  const r = must(await s.from('vp_stories').insert(row).select('id').single());
  const paths = [];
  for (let i = 0; i < photos.length; i++) {
    const p = `${me.id}/s${r.id}/${i + 1}-${uuid().slice(0, 8)}.${photos[i].ext}`;
    must(await s.storage.from('route-photos').upload(p, photos[i].blob, { contentType: photos[i].blob.type }));
    must(await s.from('vp_photos').insert({ story_id: r.id, path: p, position: i }));
    paths.push(p);
  }
  if (paths.length) must(await s.from('vp_stories').update({ cover_path: paths[0] }).eq('id', r.id));
  return r.id;
}
export async function deleteStory(id) {
  const s = await client();
  const ph = must(await s.from('vp_photos').select('path').eq('story_id', id));
  if (ph.length) await s.storage.from('route-photos').remove(ph.map((x) => x.path));
  must(await s.from('vp_stories').delete().eq('id', id));
}
export async function view(kind, id) {
  if (!READY) return; const k = `vp-v-${kind}-${id}`; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1');
  try { await (await client()).rpc('vp_view', { p_kind: kind, p_id: +id }); } catch { /* */ }
}

// ------------------------------------------------------------------ мои публикации
export async function mine() {
  const me = await getMe(); if (!me || !READY) return { routes: [], stories: [] };
  const s = await client();
  const [r, st] = await Promise.all([
    s.from('vp_routes').select(LIST_F).eq('user_id', me.id).order('created_at', { ascending: false }),
    s.from('vp_stories').select(ST_F).eq('user_id', me.id).order('created_at', { ascending: false })]);
  return { routes: must(r).map(fromDb), stories: must(st) };
}

// ------------------------------------------------------------------ избранное (в базе для вошедших, иначе — в браузере)
const LKEY = 'velopark-fav';
const local = () => new Set(JSON.parse(localStorage.getItem(LKEY) || '[]'));
const refOf = (id) => (/^u\d+$/.test(id) ? 'u:' + id.slice(1) : 's:' + id);
const idOf = (ref) => (ref.startsWith('u:') ? 'u' + ref.slice(2) : ref.slice(2));
export async function favorites() {
  const me = await getMe(); const set = local();
  if (me && READY) {
    try { const s = await client(); must(await s.from('vp_favorites').select('route_ref')).forEach((x) => set.add(idOf(x.route_ref))); } catch { /* */ }
  }
  return set;
}
export async function toggleFav(id, on) {
  const set = local(); on ? set.add(id) : set.delete(id); localStorage.setItem(LKEY, JSON.stringify([...set]));
  const me = await getMe();
  if (me && READY) {
    const s = await client();
    if (on) await s.from('vp_favorites').upsert({ user_id: me.id, route_ref: refOf(id) });
    else await s.from('vp_favorites').delete().eq('route_ref', refOf(id));
  }
  return on;
}
export { refOf, idOf };

// ------------------------------------------------------------------ комментарии и жалобы
export async function comments(target) {
  if (!READY) return [];
  try { const s = await client(); return must(await s.from('vp_comments').select('id,body,author_name,created_at,user_id,status').eq('target', target).order('created_at').limit(300)); }
  catch { return []; }
}
export async function addComment(target, body) { const s = await client(); return must(await s.from('vp_comments').insert({ target, body }).select('id,body,author_name,created_at,user_id').single()); }
export async function deleteComment(id) { const s = await client(); must(await s.from('vp_comments').delete().eq('id', id)); }
export async function report(target, reason, comment) { const s = await client(); must(await s.from('vp_reports').insert({ target, reason, comment: comment || null })); }

// ------------------------------------------------------------------ модерация
export async function adminQueue(kind) {
  const s = await client();
  if (kind === 'routes') return must(await s.from('vp_routes').select('*, vp_photos(path,position)').eq('status', 'pending').order('created_at').limit(50));
  if (kind === 'stories') return must(await s.from('vp_stories').select(ST_F + ', vp_photos(path,position)').eq('status', 'pending').order('created_at').limit(50));
  if (kind === 'reports') return must(await s.from('vp_reports').select('*').eq('status', 'open').order('created_at').limit(100));
  if (kind === 'comments') return must(await s.from('vp_comments').select('*').order('created_at', { ascending: false }).limit(100));
  return [];
}
export async function adminCounts() {
  const s = await client(); const c = async (t, f) => (await s.from(t).select('id', { count: 'exact', head: true }).eq(f[0], f[1])).count || 0;
  const [r, st, rep] = await Promise.all([c('vp_routes', ['status', 'pending']), c('vp_stories', ['status', 'pending']), c('vp_reports', ['status', 'open'])]);
  return { routes: r, stories: st, reports: rep };
}
export async function setStatus(kind, id, status, reason) {
  const s = await client(); const t = kind === 'routes' ? 'vp_routes' : 'vp_stories';
  must(await s.from(t).update({ status, reject_reason: status === 'rejected' ? (reason || 'Не соответствует правилам') : null }).eq('id', id));
}
export async function closeReport(id) { const s = await client(); must(await s.from('vp_reports').update({ status: 'closed' }).eq('id', id)); }
export async function setCommentStatus(id, status) { const s = await client(); must(await s.from('vp_comments').update({ status }).eq('id', id)); }

// ------------------------------------------------------------------ демо (?demo=1, только пока база не настроена) — для предпросмотра админки
function demoRoutes() {
  return [{ id: 'u1', dbid: 1, ugc: true, title: 'Пример: Конаев — южный берег Капшагая', countries: ['Казахстан'], region: 'Алматинская область', types: ['gravel', 'touring'], diff: 'medium', surface: 'mixed',
    season: [4, 5, 9, 10], dist: 42, gain: 410, summary: 'Демонстрационная публикация — так будут выглядеть маршруты пользователей.', start: [43.86, 77.08], coverUrl: 'img/photos/charyn-kolsai-3-s.webp',
    author: 'Алексей', status: 'pending', created_at: new Date().toISOString() }];
}
async function demoFull() {
  const pts = [[43.860, 77.080], [43.800, 77.180], [43.760, 77.350], [43.750, 77.550]];
  return { ...demoRoutes()[0], desc: ['Демонстрационный маршрут: так выглядит публикация пользователя после модерации.'], highlights: ['Вид на водохранилище', 'Степь Или'], tips: ['Возьмите много воды'],
    line: pts, line_mode: 'user', line_km: 42, profile: null, photos: [{ url: 'img/photos/charyn-kolsai-3.webp' }], wp: [], src: [], guides: [] };
}
function demoStories() {
  return [{ id: 1, title: 'Пример рассказа: три дня до Кольсая', body: 'Демонстрационный рассказ. Здесь велосипедисты рассказывают, как проехали маршрут: погода, дорога, где ночевали, что пригодилось в пути и что бы сделали иначе.',
    route_ref: 's:charyn-kolsai', cover_path: 'img/photos/charyn-kolsai-2.webp', author_name: 'Мария', status: 'pending', created_at: new Date().toISOString() }];
}
export async function demoQueue(kind) {
  if (kind === 'routes') { const f = await demoFull(); return [{ id: 1, title: f.title, description: f.desc[0] + ' Старт в Конаеве, дальше грунтовка вдоль берега.', types: f.types, difficulty: f.diff, country: 'Казахстан', region: f.region,
    distance_km: 42, elevation_gain_m: 410, surface: 'mixed', season: f.season, highlights: 'Вид на водохранилище', tips: 'Возьмите много воды', geometry: f.line, author_name: 'Алексей', created_at: new Date().toISOString(),
    vp_photos: [{ path: 'img/photos/charyn-kolsai-3-s.webp' }, { path: 'img/photos/charyn-kolsai-1-s.webp' }] }]; }
  if (kind === 'stories') return demoStories().map((x) => ({ ...x, vp_photos: [{ path: 'img/photos/charyn-kolsai-2-s.webp' }] }));
  if (kind === 'reports') return [{ id: 1, target: 's:medeu-shymbulak', reason: 'wrong', comment: 'Пример жалобы: изменились правила проезда', created_at: new Date().toISOString() }];
  return [];
}
