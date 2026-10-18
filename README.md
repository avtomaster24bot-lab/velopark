# Velopark — веломаршруты мира

Каталог и карта веломаршрутов мира: перевалы, многодневные маршруты вдоль рек, горы Алматы, озёра Бурабая. Велосипедисты добавляют свои маршруты (GPX или рисунок на карте) и рассказы. Всё проходит модерацию.

Сайт: https://avtomaster24bot-lab.github.io/velopark/

Это проект из одной семьи с [VeloMarket](https://avtomaster24bot-lab.github.io/velomarket/) и [Вело-вселенной](https://avtomaster24bot-lab.github.io/velo-universe/). У них общий вход через Telegram (@VeloMaster24bot) и общий профиль.

## Как устроено
- `site/` — статический сайт на GitHub Pages: HTML, модули ES, Leaflet и OpenStreetMap. Ключи API не нужны.
- `content/routes.py` — маршруты из каталога: факты, источники, описание, советы.
- `tools/geo.py` строит схематичную линию: OSRM на routing.openstreetmap.de, данные © OpenStreetMap, ODbL. Высоты берутся из Open-Meteo (Copernicus DEM).
- `tools/fetchphotos.py` скачивает фото с Wikimedia Commons, только со свободными лицензиями. Авторы указаны на странице «Фото и источники».
- `tools/build.py` собирает `site/data/*.json` и страницы из `tools/tpl/`.
- `tools/linkcheck.py` проверяет внутренние ссылки.
- `supabase/migrations/20261018000001_velopark.sql` — таблицы `vp_*`, RLS и хранилища `route-photos` и `route-gpx`.

Сборка: `python3 tools/geo.py && python3 tools/build.py && python3 tools/linkcheck.py`.

## Подключение базы (один раз)
1. Откройте файл миграции в виде raw: https://raw.githubusercontent.com/avtomaster24bot-lab/velopark/main/supabase/migrations/20261018000001_velopark.sql и скопируйте всё.
2. Supabase → SQL Editor → New query, вставьте текст, нажмите **Run**.
3. В результате должна появиться строка «Velopark: готово».

Миграцию можно запускать повторно. Таблицы VeloMarket она не меняет, только читает `profiles`. Модераторы — те же, у кого `profiles.is_admin = true`. Пока миграция не применена, сайт показывает только каталог.

## Данные и лицензии
- Линии маршрутов схематичные, для навигации они не годятся.
- Картографические данные © участники OpenStreetMap, ODbL.
- Профиль высот: Copernicus DEM через Open-Meteo, CC BY 4.0.
- Фото: Wikimedia Commons, авторы и лицензии указаны в `site/credits.html`.
- В базе хранится минимум личных данных: Telegram ID, имя и username из общего профиля.
