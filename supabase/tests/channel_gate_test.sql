-- Локальный тест 20261018000002_channel_gate.sql (чистый PostgreSQL + имитация Supabase).
-- Запуск: bash supabase/tests/run_gate_test.sh
\set ON_ERROR_STOP on
\set A '\'aaaaaaaa-0000-0000-0000-00000000000a\''
\set B '\'bbbbbbbb-0000-0000-0000-00000000000b\''
\set C '\'cccccccc-0000-0000-0000-00000000000c\''
\set M '\'99999999-0000-0000-0000-000000000099\''
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;
grant execute on function pg_temp.check(boolean,text) to public;
insert into auth.users (id, email) values (:A,'tg1@t'),(:B,'tg2@t'),(:C,'tg3@t'),(:M,'tg9@t');
insert into public.profiles (id, tg_id, first_name, is_admin) values (:A,1001,'Подписчик',false),(:B,1002,'Не подписан',false),(:C,1003,'Старый',false),(:M,1009,'Админ',true);
-- «функция» (service_role) записывает результаты проверки
set role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', false);
insert into public.velopark_members (user_id, tg_id, subscribed, status) values (:A,1001,true,'member'),(:B,1002,false,'left');
insert into public.velopark_members (user_id, tg_id, subscribed, status, checked_at) values (:C,1003,true,'member', now() - interval '31 days');
reset role; select set_config('request.jwt.claims', '', false);

-- A: подписчик — может всё
set role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);
select pg_temp.check(public.velopark_is_member(auth.uid()), 'A: подписчик');
insert into public.vp_routes (title, description, types, country, geometry) values ('Тест A','Описание маршрута длиной больше двадцати символов', '{road}', 'Казахстан', '[[43,76],[43.1,76.1]]');
insert into public.vp_comments (target, body) values ('s:medeu-shymbulak', 'Отличный маршрут');
insert into storage.objects (bucket_id, name) values ('route-photos', 'aaaaaaaa-0000-0000-0000-00000000000a/r1/1.webp');
insert into public.vp_photos (route_id, path) select id, 'aaaaaaaa-0000-0000-0000-00000000000a/r1/1.webp' from public.vp_routes limit 1;
select pg_temp.check((select count(*) from public.velopark_members) = 1, 'A видит только свою строку velopark_members');
do $$ begin update public.velopark_members set subscribed = true where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'; raise exception 'FAIL: update прошёл';
exception when insufficient_privilege then raise notice 'ok: писать в velopark_members с сайта нельзя'; end $$;

-- B: не подписан
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
select pg_temp.check(not public.velopark_is_member(auth.uid()), 'B: не подписчик');
do $$ begin insert into public.vp_routes (title, description, types, country, geometry) values ('Тест B','Описание маршрута длиной больше двадцати символов', '{road}', 'Казахстан', '[[43,76],[43.1,76.1]]'); raise exception 'FAIL: маршрут B';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: B не может добавить маршрут (%)', left(sqlerrm, 70); end $$;
do $$ begin insert into public.vp_stories (title, body) values ('Рассказ', repeat('текст ', 20)); raise exception 'FAIL: рассказ B';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: B не может добавить рассказ'; end $$;
do $$ begin insert into public.vp_comments (target, body) values ('s:medeu-shymbulak', 'спам'); raise exception 'FAIL: коммент B';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: B не может комментировать'; end $$;
do $$ begin insert into public.vp_reports (target, reason) values ('s:medeu-shymbulak', 'spam'); raise exception 'FAIL: жалоба B';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: B не может жаловаться'; end $$;
do $$ begin insert into storage.objects (bucket_id, name) values ('route-photos', 'bbbbbbbb-0000-0000-0000-00000000000b/r9/1.webp'); raise exception 'FAIL: фото B';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: B не может загрузить фото'; end $$;
do $$ begin insert into public.velopark_members (user_id, tg_id, subscribed) values ('bbbbbbbb-0000-0000-0000-00000000000b', 1002, true); raise exception 'FAIL: самозапись';
exception when insufficient_privilege then raise notice 'ok: B не может сам отметить себя подписчиком'; end $$;
select pg_temp.check((select count(*) from public.vp_routes where status = 'approved') = 0 and (select count(*) from public.vp_comments) = 1, 'B видит каталог (чтение открыто)');

-- C: проверка старше 30 дней
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"cccccccc-0000-0000-0000-00000000000c"}', false);
select pg_temp.check(not public.velopark_is_member(auth.uid()), 'C: проверка устарела (>30 дней) — нужна повторная');

-- M: админ без записи в velopark_members
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"99999999-0000-0000-0000-000000000099"}', false);
select pg_temp.check(public.velopark_is_member(auth.uid()), 'админ проходит без подписки');
insert into public.vp_stories (title, body) values ('Рассказ админа', repeat('текст ', 20));
select pg_temp.check((select count(*) from public.velopark_members) = 3, 'админ видит все строки');

-- anon: смотреть может, функцию проверки вызвать не может
reset role; set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.check((select count(*) from public.vp_comments) = 1, 'гость читает комментарии');
do $$ begin perform public.velopark_is_member('aaaaaaaa-0000-0000-0000-00000000000a'); raise exception 'FAIL: anon вызвал функцию';
exception when insufficient_privilege then raise notice 'ok: гость не может проверять чужую подписку'; end $$;
reset role;
select 'ALL OK';
