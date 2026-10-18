// ============================================================
//  НАСТРОЙКИ VELOPARK — меняйте только этот файл
// ============================================================
// Здесь только ПУБЛИЧНЫЕ значения. service_role и токен бота сюда НЕ вставлять никогда!
// База — тот же проект Supabase, что у VeloMarket (общий вход через Telegram).
export const CONFIG = {
  SITE_NAME: 'Velopark',
  SUPABASE_URL: 'https://wzhwnffdylhkmapijkrn.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6aHduZmZkeWxoa21hcGlqa3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDg3NjEsImV4cCI6MjA5MTkyNDc2MX0.G7Ieq0C-FECBFaC5y5ks5tv5KApUqY_S7pH-P8sHXCs', // anon (публичный)
  TELEGRAM_BOT_USERNAME: 'VeloMaster24bot',
  // Чат менеджера для рекламы и поддержки. На сайте ник не показывается — только кнопки.
  SUPPORT_TELEGRAM: 'GrifRift555',
  AD_ORDER_TEXT: 'Здравствуйте! Хочу заказать рекламу на сайте Velopark.',
  SUPPORT_TEXT: 'Здравствуйте! Вопрос по сайту Velopark.',
  VELO_UNIVERSE: 'https://avtomaster24bot-lab.github.io/velo-universe/',
  VELOMARKET: 'https://avtomaster24bot-lab.github.io/velomarket/',
  MAX_ROUTE_PHOTOS: 8,
  MAX_STORY_PHOTOS: 6,
  MAX_GPX_POINTS: 2000,
  // Рекламные места. own: true — наши проекты (показываются, пока нет платной рекламы).
  // Чтобы поставить платный баннер: добавьте объект { img, href, alt } в нужный список (картинку — в assets/ads/).
  ADS: {
    wide: [
      { img: 'assets/ads/velomarket-wide.svg', href: 'https://avtomaster24bot-lab.github.io/velomarket/', alt: 'VeloMarket — велосипеды и запчасти оригинальных брендов', own: true },
      { img: 'assets/ads/universe-wide.svg', href: 'https://avtomaster24bot-lab.github.io/velo-universe/', alt: 'Вело-вселенная — виртуальная веломастерская', own: true },
      { img: 'assets/ads/checklist-wide.svg', href: 'https://avtomaster24bot-lab.github.io/bike-checklist/', alt: 'Чек-лист покупки б/у велосипеда', own: true },
      { img: 'assets/ads/your-ad-wide.svg', href: 'advertise.html', alt: 'Здесь может быть ваша реклама', own: true, order: true },
    ],
    side: [
      { img: 'assets/ads/universe-side.svg', href: 'https://avtomaster24bot-lab.github.io/velo-universe/', alt: 'Вело-вселенная — инструкции по ремонту', own: true },
      { img: 'assets/ads/your-ad-side.svg', href: 'advertise.html', alt: 'Здесь может быть ваша реклама', own: true, order: true },
    ],
    gallery: [
      { img: 'assets/ads/velomarket-gallery.svg', href: 'https://avtomaster24bot-lab.github.io/velomarket/', alt: 'VeloMarket — объявления о велосипедах', own: true },
      { img: 'assets/ads/your-ad-gallery.svg', href: 'advertise.html', alt: 'Здесь может быть ваша реклама', own: true, order: true },
    ],
  },
};
