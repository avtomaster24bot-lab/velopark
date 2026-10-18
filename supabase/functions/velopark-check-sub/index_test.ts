// Локальные тесты: deno test -A supabase/functions/velopark-check-sub/index_test.ts
// Telegram и Supabase подменены — сеть и настоящие ключи не нужны.
import { assert, assertEquals } from "jsr:@std/assert@1";
Deno.env.set("VELOPARK_CHECK_NO_SERVE", "1");
Deno.env.set("TELEGRAM_BOT_TOKEN", "123:TEST");
Deno.env.set("SUPABASE_URL", "http://supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test");
const mod = await import("./index.ts");
const ORIGIN = "https://avtomaster24bot-lab.github.io";

Deno.test("classify: участники канала", () => {
  for (const s of ["member", "administrator", "creator"]) {
    assertEquals(mod.classifyTelegram(200, { ok: true, result: { status: s } }), { ok: true, subscribed: true, status: s });
  }
  assertEquals(mod.classifyTelegram(200, { ok: true, result: { status: "restricted", is_member: true } }).ok && true, true);
  assertEquals(mod.classifyTelegram(200, { ok: true, result: { status: "restricted", is_member: true } }), { ok: true, subscribed: true, status: "restricted" });
  assertEquals(mod.classifyTelegram(200, { ok: true, result: { status: "restricted", is_member: false } }), { ok: true, subscribed: false, status: "restricted" });
  assertEquals(mod.classifyTelegram(200, { ok: true, result: { status: "left" } }), { ok: true, subscribed: false, status: "left" });
  assertEquals(mod.classifyTelegram(200, { ok: true, result: { status: "kicked" } }), { ok: true, subscribed: false, status: "kicked" });
});
Deno.test("classify: ошибки Telegram", () => {
  const e = (code: number, d: string) => mod.classifyTelegram(code, { ok: false, error_code: code, description: d });
  assertEquals(e(400, "Bad Request: member list is inaccessible"), { ok: false, error: "bot_not_admin" });
  assertEquals(e(403, "Forbidden: bot is not a member of the channel chat"), { ok: false, error: "bot_not_admin" });
  assertEquals(e(400, "Bad Request: CHAT_ADMIN_REQUIRED"), { ok: false, error: "bot_not_admin" });
  assertEquals(e(400, "Bad Request: chat not found"), { ok: false, error: "channel_not_found" });
  assertEquals(e(400, "Bad Request: user not found"), { ok: true, subscribed: false, status: "left" });
  assertEquals(e(400, "Bad Request: PARTICIPANT_ID_INVALID"), { ok: true, subscribed: false, status: "left" });
  assertEquals(e(401, "Unauthorized"), { ok: false, error: "bad_bot_token" });
  assertEquals(mod.classifyTelegram(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 } }), { ok: false, error: "too_many_requests", retry_after: 7 });
  assertEquals(e(500, "Internal"), { ok: false, error: "telegram_error" });
  assertEquals(mod.classifyTelegram(502, "<html>"), { ok: false, error: "telegram_error" });
});
Deno.test("checkMembership: правильный запрос к Bot API", async () => {
  let url = "";
  const f = ((u: string) => { url = u; return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { status: "member" } }))); }) as unknown as typeof fetch;
  const r = await mod.checkMembership(555, "123:TEST", "@velopark_kz", f);
  assertEquals(r, { ok: true, subscribed: true, status: "member" });
  assertEquals(url, "https://api.telegram.org/bot123:TEST/getChatMember?chat_id=%40velopark_kz&user_id=555");
  assertEquals(await mod.checkMembership(1, "", "@x", f), { ok: false, error: "server_misconfigured" });
  const broken = (() => Promise.reject(new Error("net"))) as unknown as typeof fetch;
  assertEquals(await mod.checkMembership(1, "t", "@x", broken), { ok: false, error: "telegram_unreachable" });
});

// ---- имитация Supabase (auth + REST) через глобальный fetch ----
type Prof = { tg_id: number; is_admin: boolean; is_banned: boolean } | null;
let prof: Prof = null; let upserts: unknown[] = []; let upsertFails = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const u = new URL(req.url);
  if (u.host !== "supabase.test") return realFetch(input, init);
  if (u.pathname === "/auth/v1/user") {
    return req.headers.get("authorization") === "Bearer good-token"
      ? new Response(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated" }), { status: 200 })
      : new Response(JSON.stringify({ code: 401, msg: "invalid JWT" }), { status: 401 });
  }
  if (u.pathname === "/rest/v1/profiles") return new Response(JSON.stringify(prof ? [prof] : []), { status: 200 });
  if (u.pathname === "/rest/v1/velopark_members") {
    if (upsertFails) return new Response(JSON.stringify({ code: "42P01", message: 'relation "public.velopark_members" does not exist' }), { status: 404 });
    upserts.push(await req.json()); return new Response(null, { status: 201 });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;
const tg = (body: unknown, status = 200) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
const post = (token?: string) => new Request("http://x/", { method: "POST", headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) } });

Deno.test({ name: "HTTP: CORS, метод, сессия", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const o = await mod.handler(new Request("http://x/", { method: "OPTIONS", headers: { origin: ORIGIN } }));
  assertEquals(o.headers.get("access-control-allow-origin"), ORIGIN); await o.text();
  const evil = await mod.handler(new Request("http://x/", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assertEquals(evil.headers.get("access-control-allow-origin"), ORIGIN); await evil.text();
  const g = await mod.handler(new Request("http://x/", { method: "GET" })); assertEquals(g.status, 405); await g.text();
  const n = await mod.handler(post()); assertEquals(n.status, 401); assertEquals((await n.json()).error, "no_session");
  const b = await mod.handler(post("bad")); assertEquals(b.status, 401); assertEquals((await b.json()).error, "bad_session");
} });
Deno.test({ name: "HTTP: подписан → запись в velopark_members", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  prof = { tg_id: 777, is_admin: false, is_banned: false }; upserts = []; upsertFails = false;
  const r = await mod.handler(post("good-token"), tg({ ok: true, result: { status: "member" } }));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals([j.subscribed, j.status, j.stored, j.channel], [true, "member", true, "@velopark_kz"]);
  assertEquals(upserts.length, 1);
  const row = (upserts[0] as Record<string, unknown>[])[0] ?? upserts[0];
  assertEquals((row as Record<string, unknown>).subscribed, true);
  assertEquals((row as Record<string, unknown>).tg_id, 777);
} });
Deno.test({ name: "HTTP: не подписан → subscribed false", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  prof = { tg_id: 778, is_admin: false, is_banned: false }; upserts = [];
  const r = await mod.handler(post("good-token"), tg({ ok: true, result: { status: "left" } }));
  const j = await r.json(); assertEquals([r.status, j.subscribed, j.status], [200, false, "left"]); assertEquals(upserts.length, 1);
} });
Deno.test({ name: "HTTP: бот не админ → bot_not_admin, база не трогается", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  prof = { tg_id: 779, is_admin: true, is_banned: false }; upserts = [];
  const r = await mod.handler(post("good-token"), tg({ ok: false, error_code: 400, description: "Bad Request: member list is inaccessible" }, 400));
  const j = await r.json(); assertEquals([r.status, j.error, j.is_admin], [503, "bot_not_admin", true]); assertEquals(upserts.length, 0);
} });
Deno.test({ name: "HTTP: нет профиля / бан / таблица не создана", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  prof = null;
  const a = await mod.handler(post("good-token"), tg({ ok: true, result: { status: "member" } })); assertEquals(a.status, 404); await a.text();
  prof = { tg_id: 780, is_admin: false, is_banned: true };
  const b = await mod.handler(post("good-token"), tg({ ok: true, result: { status: "member" } })); assertEquals(b.status, 403); await b.text();
  prof = { tg_id: 781, is_admin: false, is_banned: false }; upsertFails = true;
  const c = await mod.handler(post("good-token"), tg({ ok: true, result: { status: "member" } }));
  const j = await c.json(); assertEquals([c.status, j.subscribed, j.stored], [200, true, false]); upsertFails = false;
  assert(true);
} });
