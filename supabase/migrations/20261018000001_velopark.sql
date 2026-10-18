-- ============================================================================
-- Velopark — веломаршруты и рассказы. ОДИН файл, можно запускать повторно.
-- Supabase → SQL Editor → New query → вставить всё → Run.
-- Использует ту же базу, что VeloMarket: таблицу public.profiles (вход через Telegram).
-- Таблицы VeloMarket НЕ изменяются. Все новые объекты начинаются с vp_.
-- Персональные данные: храним только то, что уже есть в profiles (Telegram ID, имя, username);
-- в публикациях показывается только имя автора. Телефон не собирается.
-- ============================================================================

-- ---------- служебные функции ----------
create or replace function public.vp_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;
create or replace function public.vp_is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_banned from public.profiles p where p.id = auth.uid()), false);
$$;
create or replace function public.vp_is_service()
returns boolean language sql stable as $$
  -- служебный доступ: ключ service_role или SQL Editor (нет JWT и не через API).
  -- current_user здесь использовать нельзя: внутри security definer он всегда владелец функции.
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                  nullif(current_setting('request.jwt.claim.role', true), '')) = 'service_role'
      or (coalesce(nullif(current_setting('request.jwt.claims', true), ''), nullif(current_setting('request.jwt.claim.role', true), '')) is null
          and session_user not in ('authenticator', 'anon', 'authenticated'));
$$;

-- ---------- маршруты ----------
create table if not exists public.vp_routes (
  id              bigserial primary key,
  user_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name     text,
  title           text not null check (char_length(title) between 3 and 120),
  description     text not null check (char_length(description) between 20 and 8000),
  types           text[] not null default '{}' check (cardinality(types) between 1 and 4
                    and types <@ array['road','mtb','gravel','city','touring','bikepacking','family']),
  difficulty      text not null default 'medium' check (difficulty in ('easy','medium','hard','extreme')),
  country         text not null check (char_length(country) between 2 and 60),
  region          text check (char_length(region) <= 120),
  distance_km     numeric(8,1) check (distance_km between 0 and 30000),
  elevation_gain_m integer check (elevation_gain_m between 0 and 200000),
  ele_min         integer, ele_max integer,
  surface         text check (surface in ('asphalt','gravel','dirt','mixed')),
  season          smallint[] check (season <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  highlights      text check (char_length(highlights) <= 2000),
  tips            text check (char_length(tips) <= 4000),
  geometry        jsonb not null check (jsonb_typeof(geometry) = 'array' and jsonb_array_length(geometry) between 2 and 3000),
  has_ele         boolean not null default false,
  start_lat       double precision check (start_lat between -90 and 90),
  start_lon       double precision check (start_lon between -180 and 180),
  gpx_path        text,
  cover_path      text,
  status          text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
  reject_reason   text check (char_length(reject_reason) <= 500),
  views           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  approved_at     timestamptz
);
create index if not exists vp_routes_status_idx on public.vp_routes (status, approved_at desc);
create index if not exists vp_routes_user_idx on public.vp_routes (user_id);
create index if not exists vp_routes_country_idx on public.vp_routes (country);

-- ---------- рассказы ----------
create table if not exists public.vp_stories (
  id            bigserial primary key,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name   text,
  route_ref     text check (route_ref ~ '^(s:[a-z0-9-]{2,60}|u:[0-9]{1,12})$'),
  title         text not null check (char_length(title) between 3 and 140),
  body          text not null check (char_length(body) between 50 and 20000),
  cover_path    text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
  reject_reason text check (char_length(reject_reason) <= 500),
  views         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  approved_at   timestamptz
);
create index if not exists vp_stories_status_idx on public.vp_stories (status, approved_at desc);
create index if not exists vp_stories_route_idx on public.vp_stories (route_ref);
create index if not exists vp_stories_user_idx on public.vp_stories (user_id);

-- ---------- фото маршрутов и рассказов ----------
create table if not exists public.vp_photos (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  route_id   bigint references public.vp_routes(id) on delete cascade,
  story_id   bigint references public.vp_stories(id) on delete cascade,
  path       text not null check (char_length(path) <= 300),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  check ((route_id is null) <> (story_id is null))
);
create index if not exists vp_photos_route_idx on public.vp_photos (route_id);
create index if not exists vp_photos_story_idx on public.vp_photos (story_id);

-- ---------- избранное (s:<slug> — маршрут из каталога, u:<id> — маршрут пользователя) ----------
create table if not exists public.vp_favorites (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  route_ref  text not null check (route_ref ~ '^(s:[a-z0-9-]{2,60}|u:[0-9]{1,12})$'),
  created_at timestamptz not null default now(),
  primary key (user_id, route_ref)
);

-- ---------- комментарии (публикуются сразу, админ может скрыть; есть кнопка «Пожаловаться») ----------
create table if not exists public.vp_comments (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_name text,
  target      text not null check (target ~ '^(s:[a-z0-9-]{2,60}|u:[0-9]{1,12}|st:[0-9]{1,12})$'),
  body        text not null check (char_length(body) between 2 and 2000),
  status      text not null default 'approved' check (status in ('approved','hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists vp_comments_target_idx on public.vp_comments (target, created_at);

-- ---------- жалобы ----------
create table if not exists public.vp_reports (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target     text not null check (target ~ '^(s:[a-z0-9-]{2,60}|u:[0-9]{1,12}|st:[0-9]{1,12}|c:[0-9]{1,12})$'),
  reason     text not null check (reason in ('wrong','danger','spam','rude','copyright','personal','other')),
  comment    text check (char_length(comment) <= 1000),
  status     text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  unique (user_id, target)
);

-- ============================================================================
-- Триггеры: автор, статус, защита от изменения чужих полей, лимиты от спама
-- ============================================================================
create or replace function public.vp_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.vp_pub_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adm boolean := public.vp_is_admin() or public.vp_is_service();
  n int;
begin
  if tg_op = 'INSERT' then
    if not adm then
      new.user_id := auth.uid();
      if new.user_id is null then raise exception 'Нужно войти'; end if;
      if public.vp_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
      new.status := 'pending'; new.reject_reason := null; new.approved_at := null; new.views := 0;
      -- не больше 10 публикаций каждого вида в сутки от одного человека
      execute format('select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 day''', tg_table_name)
        into n using new.user_id;
      if n >= 10 then raise exception 'Слишком много публикаций за сутки — попробуйте завтра'; end if;
    end if;
    select coalesce(nullif(p.first_name, ''), 'Велосипедист') into new.author_name from public.profiles p where p.id = new.user_id;
  else
    if not adm then
      if old.user_id <> auth.uid() then raise exception 'Недостаточно прав'; end if;
      new.user_id := old.user_id; new.author_name := old.author_name; new.views := old.views;
      new.approved_at := old.approved_at; new.created_at := old.created_at;
      -- любое изменение владельцем отправляет публикацию на повторную модерацию
      new.status := 'pending'; new.reject_reason := null;
    else
      if new.status = 'approved' and (old.status is distinct from 'approved') then new.approved_at := now(); end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists vp_routes_guard on public.vp_routes;
create trigger vp_routes_guard before insert or update on public.vp_routes for each row execute function public.vp_pub_guard();
drop trigger if exists vp_routes_touch on public.vp_routes;
create trigger vp_routes_touch before update on public.vp_routes for each row execute function public.vp_touch();
drop trigger if exists vp_stories_guard on public.vp_stories;
create trigger vp_stories_guard before insert or update on public.vp_stories for each row execute function public.vp_pub_guard();
drop trigger if exists vp_stories_touch on public.vp_stories;
create trigger vp_stories_touch before update on public.vp_stories for each row execute function public.vp_touch();

create or replace function public.vp_comment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; adm boolean := public.vp_is_admin() or public.vp_is_service();
begin
  if tg_op = 'INSERT' then
    if not adm then
      new.user_id := auth.uid(); new.status := 'approved';
      if new.user_id is null then raise exception 'Нужно войти'; end if;
      if public.vp_is_banned() then raise exception 'Аккаунт заблокирован'; end if;
      select count(*) into n from public.vp_comments where user_id = new.user_id and created_at > now() - interval '1 day';
      if n >= 30 then raise exception 'Слишком много комментариев за сутки'; end if;
    end if;
    select coalesce(nullif(p.first_name, ''), 'Велосипедист') into new.author_name from public.profiles p where p.id = new.user_id;
  elsif not adm then
    raise exception 'Изменять комментарии может только модератор';
  end if;
  return new;
end $$;
drop trigger if exists vp_comments_guard on public.vp_comments;
create trigger vp_comments_guard before insert or update on public.vp_comments for each row execute function public.vp_comment_guard();

-- проверка лимита после всей команды: защищает и от вставки пачкой в одном запросе
create or replace function public.vp_rate_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int := coalesce(nullif(tg_argv[0], '')::int, 10);
begin
  if public.vp_is_admin() or public.vp_is_service() or auth.uid() is null then return null; end if;
  execute format('select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 day''', tg_table_name)
    into n using auth.uid();
  if n > lim then raise exception 'Слишком много публикаций за сутки — попробуйте завтра'; end if;
  return null;
end $$;
drop trigger if exists vp_routes_rate on public.vp_routes;
create trigger vp_routes_rate after insert on public.vp_routes for each statement execute function public.vp_rate_check('10');
drop trigger if exists vp_stories_rate on public.vp_stories;
create trigger vp_stories_rate after insert on public.vp_stories for each statement execute function public.vp_rate_check('10');
drop trigger if exists vp_comments_rate on public.vp_comments;
create trigger vp_comments_rate after insert on public.vp_comments for each statement execute function public.vp_rate_check('30');

create or replace function public.vp_photo_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; n int;
begin
  if public.vp_is_admin() or public.vp_is_service() then return new; end if;
  new.user_id := auth.uid();
  if new.route_id is not null then select user_id into owner from public.vp_routes where id = new.route_id;
     select count(*) into n from public.vp_photos where route_id = new.route_id;
  else select user_id into owner from public.vp_stories where id = new.story_id;
     select count(*) into n from public.vp_photos where story_id = new.story_id;
  end if;
  if owner is distinct from auth.uid() then raise exception 'Фото можно добавлять только к своей публикации'; end if;
  if n >= 10 then raise exception 'Не больше 10 фото'; end if;
  if split_part(new.path, '/', 1) <> auth.uid()::text then raise exception 'Неверный путь к фото'; end if;
  return new;
end $$;
drop trigger if exists vp_photos_guard on public.vp_photos;
create trigger vp_photos_guard before insert on public.vp_photos for each row execute function public.vp_photo_guard();

-- просмотры (без прав на запись в таблицу)
create or replace function public.vp_view(p_kind text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'route' then update public.vp_routes set views = views + 1 where id = p_id and status = 'approved';
  elsif p_kind = 'story' then update public.vp_stories set views = views + 1 where id = p_id and status = 'approved'; end if;
end $$;
grant execute on function public.vp_view(text, bigint) to anon, authenticated;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.vp_routes    enable row level security;
alter table public.vp_stories   enable row level security;
alter table public.vp_photos    enable row level security;
alter table public.vp_favorites enable row level security;
alter table public.vp_comments  enable row level security;
alter table public.vp_reports   enable row level security;

grant select on public.vp_routes, public.vp_stories, public.vp_photos, public.vp_comments to anon, authenticated;
grant insert, update, delete on public.vp_routes, public.vp_stories, public.vp_photos, public.vp_favorites, public.vp_comments, public.vp_reports to authenticated;
grant select on public.vp_favorites, public.vp_reports to authenticated;
grant usage, select on sequence public.vp_routes_id_seq, public.vp_stories_id_seq, public.vp_photos_id_seq, public.vp_comments_id_seq, public.vp_reports_id_seq to authenticated;
grant all on public.vp_routes, public.vp_stories, public.vp_photos, public.vp_favorites, public.vp_comments, public.vp_reports to service_role;
grant usage, select on sequence public.vp_routes_id_seq, public.vp_stories_id_seq, public.vp_photos_id_seq, public.vp_comments_id_seq, public.vp_reports_id_seq to service_role;

-- маршруты
drop policy if exists vp_routes_select on public.vp_routes;
create policy vp_routes_select on public.vp_routes for select
  using (status = 'approved' or user_id = auth.uid() or public.vp_is_admin());
drop policy if exists vp_routes_insert on public.vp_routes;
create policy vp_routes_insert on public.vp_routes for insert to authenticated
  with check (user_id = auth.uid() and not public.vp_is_banned());
drop policy if exists vp_routes_update on public.vp_routes;
create policy vp_routes_update on public.vp_routes for update to authenticated
  using (user_id = auth.uid() or public.vp_is_admin());
drop policy if exists vp_routes_delete on public.vp_routes;
create policy vp_routes_delete on public.vp_routes for delete to authenticated
  using (user_id = auth.uid() or public.vp_is_admin());

-- рассказы
drop policy if exists vp_stories_select on public.vp_stories;
create policy vp_stories_select on public.vp_stories for select
  using (status = 'approved' or user_id = auth.uid() or public.vp_is_admin());
drop policy if exists vp_stories_insert on public.vp_stories;
create policy vp_stories_insert on public.vp_stories for insert to authenticated
  with check (user_id = auth.uid() and not public.vp_is_banned());
drop policy if exists vp_stories_update on public.vp_stories;
create policy vp_stories_update on public.vp_stories for update to authenticated
  using (user_id = auth.uid() or public.vp_is_admin());
drop policy if exists vp_stories_delete on public.vp_stories;
create policy vp_stories_delete on public.vp_stories for delete to authenticated
  using (user_id = auth.uid() or public.vp_is_admin());

-- фото: видны, если видна сама публикация
drop policy if exists vp_photos_select on public.vp_photos;
create policy vp_photos_select on public.vp_photos for select using (
  user_id = auth.uid() or public.vp_is_admin()
  or exists (select 1 from public.vp_routes r where r.id = route_id and r.status = 'approved')
  or exists (select 1 from public.vp_stories s where s.id = story_id and s.status = 'approved'));
drop policy if exists vp_photos_insert on public.vp_photos;
create policy vp_photos_insert on public.vp_photos for insert to authenticated with check (user_id = auth.uid());
drop policy if exists vp_photos_delete on public.vp_photos;
create policy vp_photos_delete on public.vp_photos for delete to authenticated using (user_id = auth.uid() or public.vp_is_admin());

-- избранное: только своё
drop policy if exists vp_fav_all on public.vp_favorites;
create policy vp_fav_all on public.vp_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- комментарии
drop policy if exists vp_comments_select on public.vp_comments;
create policy vp_comments_select on public.vp_comments for select
  using (status = 'approved' or user_id = auth.uid() or public.vp_is_admin());
drop policy if exists vp_comments_insert on public.vp_comments;
create policy vp_comments_insert on public.vp_comments for insert to authenticated
  with check (user_id = auth.uid() and not public.vp_is_banned());
drop policy if exists vp_comments_update on public.vp_comments;
create policy vp_comments_update on public.vp_comments for update to authenticated using (public.vp_is_admin());
drop policy if exists vp_comments_delete on public.vp_comments;
create policy vp_comments_delete on public.vp_comments for delete to authenticated
  using (user_id = auth.uid() or public.vp_is_admin());

-- жалобы: отправить может любой вошедший, читать — автор жалобы и админ
drop policy if exists vp_reports_insert on public.vp_reports;
create policy vp_reports_insert on public.vp_reports for insert to authenticated with check (user_id = auth.uid());
drop policy if exists vp_reports_select on public.vp_reports;
create policy vp_reports_select on public.vp_reports for select to authenticated using (user_id = auth.uid() or public.vp_is_admin());
drop policy if exists vp_reports_update on public.vp_reports;
create policy vp_reports_update on public.vp_reports for update to authenticated using (public.vp_is_admin());
drop policy if exists vp_reports_delete on public.vp_reports;
create policy vp_reports_delete on public.vp_reports for delete to authenticated using (public.vp_is_admin());

-- ============================================================================
-- Хранилище: route-photos (публичное, фото), route-gpx (приватное, исходные GPX — видят автор и модератор)
-- Путь: <user_id>/<route_or_story>/<файл>
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('route-photos', 'route-photos', true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('route-gpx',    'route-gpx',    false, 5242880, array['application/gpx+xml','application/xml','text/xml','application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vp photos insert own" on storage.objects;
create policy "vp photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'route-photos' and (storage.foldername(name))[1] = auth.uid()::text and not public.vp_is_banned());
drop policy if exists "vp photos select own" on storage.objects;
create policy "vp photos select own" on storage.objects for select to authenticated
  using (bucket_id = 'route-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.vp_is_admin()));
drop policy if exists "vp photos delete own" on storage.objects;
create policy "vp photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'route-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.vp_is_admin()));

drop policy if exists "vp gpx insert own" on storage.objects;
create policy "vp gpx insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'route-gpx' and (storage.foldername(name))[1] = auth.uid()::text and not public.vp_is_banned());
drop policy if exists "vp gpx select own or admin" on storage.objects;
create policy "vp gpx select own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'route-gpx' and ((storage.foldername(name))[1] = auth.uid()::text or public.vp_is_admin()));
drop policy if exists "vp gpx delete own or admin" on storage.objects;
create policy "vp gpx delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'route-gpx' and ((storage.foldername(name))[1] = auth.uid()::text or public.vp_is_admin()));

-- Проверка: должно вернуть строку с нулями (публикаций ещё нет) — это нормально.
select 'Velopark: готово' as status,
  (select count(*) from public.vp_routes)  as routes,
  (select count(*) from public.vp_stories) as stories,
  (select count(*) from storage.buckets where id in ('route-photos','route-gpx')) as buckets;
