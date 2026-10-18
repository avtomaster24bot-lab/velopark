-- ============================================================================
-- Velopark — публиковать могут только подписчики Telegram-канала @velopark_kz.
-- ОДИН файл, можно запускать повторно. Supabase → SQL Editor → вставить всё → Run.
-- Сначала задеплойте функцию velopark-check-sub (она записывает результат проверки подписки).
--
-- Как работает:
--   * после входа через Telegram сайт вызывает функцию velopark-check-sub;
--   * функция спрашивает у Telegram (getChatMember), подписан ли человек на канал,
--     и записывает ответ в public.velopark_members (писать туда может ТОЛЬКО функция — ключом service_role);
--   * база разрешает добавлять маршруты, рассказы, фото, комментарии и жалобы только тем,
--     у кого subscribed = true и проверка была не раньше 30 дней назад (сайт перепроверяет при каждом входе);
--   * администраторы (profiles.is_admin) проходят без проверки.
-- Смотреть маршруты и рассказы по-прежнему могут все, без входа.
-- Персональные данные: хранится только Telegram ID (он уже есть в profiles) и отметка «подписан/нет».
-- Таблицы VeloMarket не изменяются.
-- ============================================================================

create table if not exists public.velopark_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tg_id      bigint not null,
  subscribed boolean not null default false,
  status     text check (char_length(status) <= 32),
  checked_at timestamptz not null default now()
);
alter table public.velopark_members add column if not exists status text;

alter table public.velopark_members enable row level security;
revoke all on public.velopark_members from anon, authenticated;
grant select on public.velopark_members to authenticated;
grant all on public.velopark_members to service_role;

-- человек видит только свою строку, админ — все; писать с сайта нельзя никому
drop policy if exists velopark_members_select on public.velopark_members;
create policy velopark_members_select on public.velopark_members for select to authenticated
  using (user_id = auth.uid() or public.vp_is_admin());

-- подписчик (проверен за последние 30 дней) или админ
create or replace function public.velopark_is_member(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and (
    exists (select 1 from public.velopark_members m
             where m.user_id = uid and m.subscribed and m.checked_at > now() - interval '30 days')
    or coalesce((select p.is_admin from public.profiles p where p.id = uid), false));
$$;
revoke all on function public.velopark_is_member(uuid) from public, anon;
grant execute on function public.velopark_is_member(uuid) to authenticated, service_role;

-- ---------- RLS: вставка только для подписчиков ----------
drop policy if exists vp_routes_insert on public.vp_routes;
create policy vp_routes_insert on public.vp_routes for insert to authenticated
  with check (user_id = auth.uid() and not public.vp_is_banned()
              and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));

drop policy if exists vp_stories_insert on public.vp_stories;
create policy vp_stories_insert on public.vp_stories for insert to authenticated
  with check (user_id = auth.uid() and not public.vp_is_banned()
              and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));

drop policy if exists vp_photos_insert on public.vp_photos;
create policy vp_photos_insert on public.vp_photos for insert to authenticated
  with check (user_id = auth.uid() and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));

drop policy if exists vp_comments_insert on public.vp_comments;
create policy vp_comments_insert on public.vp_comments for insert to authenticated
  with check (user_id = auth.uid() and not public.vp_is_banned()
              and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));

drop policy if exists vp_reports_insert on public.vp_reports;
create policy vp_reports_insert on public.vp_reports for insert to authenticated
  with check (user_id = auth.uid() and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));

-- хранилище: загружать фото и GPX могут только подписчики
drop policy if exists "vp photos insert own" on storage.objects;
create policy "vp photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'route-photos' and (storage.foldername(name))[1] = auth.uid()::text and not public.vp_is_banned()
              and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));
drop policy if exists "vp gpx insert own" on storage.objects;
create policy "vp gpx insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'route-gpx' and (storage.foldername(name))[1] = auth.uid()::text and not public.vp_is_banned()
              and (public.velopark_is_member(auth.uid()) or public.vp_is_admin()));

-- ---------- понятная ошибка + защита, если первый SQL-файл когда-нибудь запустят ещё раз ----------
-- (повторный запуск 20261018000001 вернул бы старые правила вставки; этот триггер он не трогает)
create or replace function public.velopark_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.vp_is_service() or public.vp_is_admin() then return new; end if;
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if not public.velopark_is_member(auth.uid()) then
    raise exception 'Публиковать могут только подписчики канала @velopark_kz. Подпишитесь и нажмите «Я подписался — проверить».'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists velopark_gate on public.vp_routes;
create trigger velopark_gate before insert on public.vp_routes for each row execute function public.velopark_gate();
drop trigger if exists velopark_gate on public.vp_stories;
create trigger velopark_gate before insert on public.vp_stories for each row execute function public.velopark_gate();
drop trigger if exists velopark_gate on public.vp_photos;
create trigger velopark_gate before insert on public.vp_photos for each row execute function public.velopark_gate();
drop trigger if exists velopark_gate on public.vp_comments;
create trigger velopark_gate before insert on public.vp_comments for each row execute function public.velopark_gate();
drop trigger if exists velopark_gate on public.vp_reports;
create trigger velopark_gate before insert on public.vp_reports for each row execute function public.velopark_gate();

-- Проверка: подписчиков пока 0 — это нормально, они появятся после первых входов.
select 'Velopark: вход только для подписчиков — готово' as status,
  (select count(*) from public.velopark_members where subscribed) as subscribers;
