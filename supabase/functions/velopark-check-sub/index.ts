// ============================================================
// Velopark — Edge Function «velopark-check-sub» ОДНИМ ФАЙЛОМ.
// Проверяет, подписан ли вошедший пользователь на Telegram-канал @velopark_kz.
//
// Supabase → Edge Functions → Deploy a new function → Via Editor:
//   имя функции: velopark-check-sub, вставьте весь этот файл в index.ts → Deploy.
//   «Verify JWT» можно выключить (как у telegram-auth): функция сама проверяет сессию.
// Секрет TELEGRAM_BOT_TOKEN уже есть в проекте (его использует telegram-auth) — второй раз задавать не нужно.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам. В репозиторий ключи НЕ попадают.
// Необязательно: VELOPARK_CHANNEL (по умолчанию @velopark_kz), ALLOWED_ORIGINS (через запятую).
//
// Бот @VeloMaster24bot должен быть администратором канала (без прав) — иначе Telegram
// не показывает ему подписчиков, и функция отвечает ошибкой bot_not_admin.
//
// Схема:
//  1) сайт после входа через Telegram шлёт POST с заголовком Authorization: Bearer <access_token>;
//  2) проверяем сессию (auth.getUser), берём tg_id из public.profiles;
//  3) Telegram Bot API getChatMember(chat_id=@velopark_kz, user_id=tg_id);
//  4) записываем результат в public.velopark_members (только эта функция может туда писать);
//  5) отвечаем {subscribed, status}. По этой таблице база разрешает или запрещает публикации.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHANNEL = Deno.env.get("VELOPARK_CHANNEL") ?? "@velopark_kz";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://avtomaster24bot-lab.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);

// ---------------- разбор ответа Telegram ----------------
export type MemberCheck =
  | { ok: true; subscribed: boolean; status: string }
  | { ok: false; error: string; retry_after?: number };

const SUBSCRIBED = new Set(["creator", "administrator", "member"]);

// Ответ getChatMember → подписан / не подписан / ошибка настройки
export function classifyTelegram(httpStatus: number, body: unknown): MemberCheck {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.ok === true && b.result && typeof b.result === "object") {
    const r = b.result as Record<string, unknown>;
    const status = String(r.status ?? "unknown");
    if (SUBSCRIBED.has(status)) return { ok: true, subscribed: true, status };
    if (status === "restricted") return { ok: true, subscribed: r.is_member === true, status };
    return { ok: true, subscribed: false, status }; // left, kicked
  }
  const code = Number(b.error_code ?? httpStatus);
  const d = String(b.description ?? "").toLowerCase();
  if (code === 401 || /unauthorized/.test(d)) return { ok: false, error: "bad_bot_token" };
  if (code === 429) {
    const p = (b.parameters ?? {}) as Record<string, unknown>;
    return { ok: false, error: "too_many_requests", retry_after: Number(p.retry_after ?? 30) };
  }
  if (/chat not found/.test(d)) return { ok: false, error: "channel_not_found" };
  // пользователь никогда не был в канале / неизвестен Telegram — значит, не подписан
  if (/user not found|participant_id_invalid|user_id_invalid|user_not_participant/.test(d)) {
    return { ok: true, subscribed: false, status: "left" };
  }
  // бот не в канале или не админ: Telegram не даёт смотреть подписчиков
  if (code === 403 || /member list is inaccessible|not a member|not enough rights|chat_admin_required|bot was kicked|have no rights/.test(d)) {
    return { ok: false, error: "bot_not_admin" };
  }
  return { ok: false, error: "telegram_error" };
}

export async function checkMembership(
  tgId: number, botToken: string, channel = CHANNEL, fetchFn: typeof fetch = fetch,
): Promise<MemberCheck> {
  if (!botToken) return { ok: false, error: "server_misconfigured" };
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(channel)}&user_id=${tgId}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    return classifyTelegram(r.status, body);
  } catch {
    return { ok: false, error: "telegram_unreachable" };
  } finally {
    clearTimeout(t);
  }
}

// ---------------- HTTP ----------------
function cors(origin: string | null): Record<string, string> {
  const allow = origin && (ALLOWED.includes("*") || ALLOWED.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

// не чаще 12 проверок в минуту на пользователя (в памяти инстанса)
const hits = new Map<string, { t: number; n: number }>();
function limited(key: string): boolean {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now - e.t > 60_000) { hits.set(key, { t: now, n: 1 }); return false; }
  e.n++;
  if (hits.size > 5000) hits.clear();
  return e.n > 12;
}

const ERR_STATUS: Record<string, number> = {
  bot_not_admin: 503, channel_not_found: 503, bad_bot_token: 503, server_misconfigured: 503,
  telegram_unreachable: 502, telegram_error: 502, too_many_requests: 429,
};

const admin = createClient(SUPABASE_URL || "http://127.0.0.1:9", SERVICE_KEY || "x", { auth: { persistSession: false, autoRefreshToken: false } });

export async function handler(req: Request, fetchFn: typeof fetch = fetch): Promise<Response> {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, h);

  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return json({ error: "no_session" }, 401, h);
  const { data: u, error: uErr } = await admin.auth.getUser(m[1].trim());
  if (uErr || !u?.user) return json({ error: "bad_session" }, 401, h);
  const uid = u.user.id;
  if (limited(uid)) return json({ error: "too_many_requests" }, 429, h);

  const { data: prof, error: pErr } = await admin.from("profiles").select("tg_id, is_admin, is_banned").eq("id", uid).maybeSingle();
  if (pErr) { console.error("profiles", pErr); return json({ error: "profile_failed" }, 500, h); }
  if (!prof?.tg_id) return json({ error: "no_profile" }, 404, h);
  if (prof.is_banned) return json({ error: "banned" }, 403, h);
  const isAdmin = prof.is_admin === true;

  const res = await checkMembership(Number(prof.tg_id), BOT_TOKEN, CHANNEL, fetchFn);
  if (!res.ok) {
    // ошибку настройки НЕ записываем в базу — уже проверенные подписчики не теряют доступ
    console.error("getChatMember", res.error);
    return json({ error: res.error, channel: CHANNEL, is_admin: isAdmin, retry_after: res.retry_after }, ERR_STATUS[res.error] ?? 502, h);
  }

  const { error: wErr } = await admin.from("velopark_members").upsert({
    user_id: uid, tg_id: prof.tg_id, subscribed: res.subscribed, status: res.status, checked_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (wErr) console.error("velopark_members", wErr); // например, SQL-миграция ещё не применена

  return json({ subscribed: res.subscribed, status: res.status, channel: CHANNEL, is_admin: isAdmin, stored: !wErr }, 200, h);
}

// Для локальных тестов: VELOPARK_CHECK_NO_SERVE=1
if (!Deno.env.get("VELOPARK_CHECK_NO_SERVE")) Deno.serve((req) => handler(req));
