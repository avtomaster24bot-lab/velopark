#!/usr/bin/env bash
# Локальная проверка миграций Velopark (без Supabase): имитация auth/storage + profiles VeloMarket.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=velopark_gate_test
SHIM=/workspace/bikemarket/tests/local_shim.sql
sudo -u postgres dropdb --if-exists $DB
sudo -u postgres createdb $DB
run() { sudo -u postgres env PGOPTIONS="-c client_min_messages=warning" psql -q -v ON_ERROR_STOP=1 -d $DB "$@"; }
run -f "$SHIM"
run -c "create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, tg_id bigint not null unique, username text, first_name text, is_admin boolean not null default false, is_banned boolean not null default false); grant select on public.profiles to anon, authenticated;"
for f in supabase/migrations/*.sql; do echo "== $f"; run -f "$f" >/dev/null; done
for f in supabase/migrations/*.sql; do run -f "$f" >/dev/null; done; echo "== повторный запуск OK"
# даже если первый файл запустят ещё раз ПОСЛЕ второго — триггер-шлагбаум остаётся
run -f supabase/migrations/20261018000001_velopark.sql >/dev/null
run -c "insert into auth.users (id,email) values ('dddddddd-0000-0000-0000-00000000000d','x@t'); insert into public.profiles (id,tg_id) values ('dddddddd-0000-0000-0000-00000000000d', 5555);"
if run -c "set role authenticated; select set_config('request.jwt.claims','{\"role\":\"authenticated\",\"sub\":\"dddddddd-0000-0000-0000-00000000000d\"}',false); insert into public.vp_comments (target, body) values ('s:x1','test');" >/dev/null 2>&1; then echo "FAIL: после повторного 0001 шлагбаум пропал"; exit 1; fi
echo "== 0001 после 0002: таблицы по-прежнему закрыты для неподписчиков (триггер) OK"
run -c "delete from public.profiles where tg_id=5555; delete from auth.users where email='x@t';"
run -f supabase/migrations/20261018000002_channel_gate.sql >/dev/null
sudo -u postgres psql -q -t -A -v ON_ERROR_STOP=1 -d $DB -f supabase/tests/channel_gate_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /' | grep -vE '^$|^ *$'
