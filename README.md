# Radio Store

Интернет-магазин радиодеталей: каталог, корзина, заказы, оплата-счета, блог/новости,
админ-панель и мобильный клиент. Бэкенд на Go + PostgreSQL, витрина на Next.js
(App Router, SSR/ISR), админка на React + Vite, мобильное приложение на Flutter.

> Документ описывает состояние проекта после итераций по фотографиям товаров, SEO,
> миграции витрины на Next.js, контактам заказов, счетам, блогу и favicon.
> Ограничения и непройденные шаги отмечены в разделе «Известные ограничения».

---

## Стек

| Слой | Технологии |
| --- | --- |
| Backend API | Go 1.22+, `net/http` (ServeMux с паттернами), `pgx/v5`, PostgreSQL |
| База данных | PostgreSQL 16 (Docker Compose) |
| Витрина | Next.js 15 (App Router), React 19, TypeScript, `next/image` |
| Админка | React + Vite + TypeScript |
| Мобильный клиент | Flutter (Dart) |
| Хранение файлов | Локальный диск (`backend/uploads/`), отдача через собственные handlers |
| Почта (счета) | `net/smtp` + `crypto/tls` (stdlib), STARTTLS / implicit TLS |

---

## Возможности

### Каталог и товары

- Категории (с поддержкой вложенности через `parent_id`), товары с характеристиками в JSON.
- Фотографии товаров: загрузка в админке, хранение на диске, отдача по HTTP,
  флаг «главное фото», превью в каталоге и галерея на странице товара.
- Поиск по названию / SKU / производителю, фильтр по категории, пагинация.
- Остатки на складе (`stock`), активация/деактивация товара.

### Витрина (Next.js)

- Нормальные SEO-адреса: `/`, `/catalog`, `/category/[slug]`, `/product/[id]`,
  `/blog`, `/blog/[slug]`, `/search`, `/cart`, `/login`, `/orders`, `/orders/[id]`.
- SSR/ISR: HTML товаров, категорий и статей отдаётся сервером — поисковик видит
  контент без выполнения JS (`revalidate` 60–300 с).
- Динамические `<title>`, `<meta description>`, canonical, OpenGraph на каждой странице.
- Структурированные данные JSON-LD: `Product` + `Offer`, `BreadcrumbList`, `ItemList`,
  `WebSite` + `SearchAction`, `Blog` + `BlogPosting`.
- `robots.txt` и `sitemap.xml` через встроенные конвенции App Router
  (`app/robots.ts`, `app/sitemap.ts`); корзина/вход/заказы/поиск закрыты от индексации.
- Человекочитаемые подписи характеристик радиодеталей (маппинг ключей `attributes`).
- Оптимизация LCP: `priority` только для первых 4 карточек в сетке и для главного
  фото в галерее (см. «Заметки по производительности»).

### Корзина и заказы

- Корзина на сервере (авторизованный пользователь), изменение количества, удаление.
- Оформление заказа в транзакции с блокировкой строк (`FOR UPDATE`), snapshot товаров
  в `order_items` и списанием остатков.
- Контакты заказчика (email для документов + телефон) фиксируются в заказе как снимок.
- Фото товаров в корзине и в составе заказа подтягиваются актуальные (батч-запрос).

### Счета (инвойсы)

- Создание счёта по заказу в статусе `processing` из админки.
- Просмотр счёта как HTML-документа с кнопкой «Печать / Сохранить в PDF»
  (PDF получается через диалог печати браузера — серверный PDF не реализован).
- Отправка счёта на email заказчика через SMTP; статус `draft → sent`.

### Блог / новости

- Статьи в Markdown с обложкой, автором, кратким описанием, публикацией/черновиком.
- Безопасный рендер Markdown в React-узлы **без** `dangerouslySetInnerHTML`.
- Управление из админки: список, создание, редактирование, публикация/снятие,
  загрузка обложки, удаление.
- Страницы `/blog` и `/blog/[slug]` на витрине с SSR/ISR и JSON-LD.

### Админ-панель

- Вкладки: Товары (с фото), Категории, Заказы (со статусами, контактами и счетами),
  Блог, Пользователи.
- Русские подписи статусов заказов при сохранении английских значений в API.
- Счётчик новых заказов в реальном времени (polling).

### Мобильный клиент (Flutter)

- Каталог, карточка товара с галереей, корзина, заказы, авторизация.
- Превью фото в каталоге и галерея в карточке.

---

## Структура проекта

```text
radio-store/
├── docker-compose.yml              # PostgreSQL
├── .env.example                    # шаблон переменных окружения
│
├── backend/
│   ├── cmd/api/main.go             # точка входа, graceful shutdown
│   ├── internal/
│   │   ├── config/config.go        # Config + SMTPConfig
│   │   ├── db/                     # пул pgx
│   │   ├── models/models.go        # доменные типы (Product, Order, BlogPost, ...)
│   │   └── http/                   # HTTP-слой
│   │       ├── server.go           # маршрутизация, CORS, логирование, recover
│   │       ├── media.go            # отдача фото товаров (/media/products/*)
│   │       ├── seo.go              # /robots.txt, /sitemap.xml (для бэк-домена)
│   │       ├── product_images_batch.go  # GET /api/v1/products/images
│   │       ├── admin_images.go     # CRUD фото товаров
│   │       ├── orders.go           # создание/список/деталь заказа (+ контакты)
│   │       ├── admin_order_contacts.go  # GET /api/v1/admin/orders/contacts
│   │       ├── invoices.go         # счета: создание/список/отправка/просмотр
│   │       ├── blog_public.go      # GET /api/v1/blog/posts[/{slug}]
│   │       └── blog_admin.go       # CRUD блога + обложки + /media/blog/*
│   └── migrations/                 # SQL-миграции (см. раздел «Миграции»)
│
├── storefront-next/               # витрина на Next.js App Router
│   ├── app/
│   │   ├── layout.tsx              # корневой layout, metadata, импорты CSS
│   │   ├── page.tsx                # главная
│   │   ├── globals.css             # базовые стили + ритм отступов
│   │   ├── blog-styles.css         # стили блога и типографика markdown
│   │   ├── icon.svg                # favicon (конвенция Next)
│   │   ├── apple-icon.png          # touch-icon iOS (генерируется скриптом)
│   │   ├── robots.ts               # robots.txt
│   │   ├── sitemap.ts              # sitemap.xml
│   │   ├── catalog/page.tsx
│   │   ├── category/[slug]/page.tsx
│   │   ├── product/[id]/page.tsx
│   │   ├── blog/page.tsx
│   │   ├── blog/[slug]/page.tsx
│   │   ├── search/page.tsx
│   │   ├── cart/page.tsx
│   │   ├── login/page.tsx
│   │   └── orders/[id]/page.tsx
│   ├── components/                 # Header, Footer, ProductCard/Grid, Gallery,
│   │                               # BuyPanel, CartView, OrdersList, OrderDetails,
│   │                               # AuthForm, Breadcrumbs, JsonLd, BlogCard, ...
│   ├── lib/
│   │   ├── api.ts                  # серверные + клиентские запросы
│   │   ├── types.ts                # TS-типы домена
│   │   ├── auth-context.tsx        # клиентский провайдер авторизации/корзины
│   │   ├── format.ts               # цены, даты, статусы, инициалы
│   │   ├── attributes.ts           # маппинг характеристик
│   │   ├── seo.ts                  # построение Metadata/canonical/OG
│   │   └── markdown.tsx            # безопасный рендер Markdown → React-узлы
│   ├── scripts/gen-apple-icon.mjs  # растеризация icon.svg → apple-icon.png
│   ├── types/css.d.ts              # shim для глобальных CSS-импортов (TS 5.6+)
│   ├── next-env.d.ts               # типы Next (генерируется, в .gitignore)
│   └── next.config.mjs             # devIndicators:false, images.remotePatterns
│
├── frontend/                       # админка на React + Vite
│   ├── index.html                  # <link rel="icon" href="/favicon.svg">
│   ├── public/favicon.svg          # иконка админки
│   └── src/
│       ├── App.tsx                 # вкладки, OrdersTab с счетами/контактами
│       ├── BlogTab.tsx             # управление статьями
│       ├── api.ts                  # клиент API (+ multipart, text-запросы)
│       ├── types.ts                # TS-типы
│       ├── styles.css              # базовые стили админки
│       └── blog.css                # стили формы блога
│
├── storefront/                     # старая SPA-витрина (Vite+React), оставлена
│   └── ...                         # до полного перехода можно удалить
│
└── radio_store_mobile/             # Flutter-клиент
    └── lib/                        # api.dart, models.dart, screens/, utils.dart
```

---

## Требования

- Go 1.22+ (нужны паттерны `net/http` и `slog`).
- Node.js 18+ и npm.
- Docker + Docker Compose (для PostgreSQL).
- Flutter SDK (для мобильного клиента).
- PostgreSQL доступен через `docker compose` (или свой экземпляр).

---

## Быстрый старт

### 1. База данных

```bash
docker compose up -d postgres
```

Дождись готовности PostgreSQL (в логах `database system is ready to accept connections`).

### 2. Миграции

Применять строго по порядку. Базовая схема (`0001`) создаёт таблицы товаров,
категорий, пользователей, корзины, заказов и `product_images`.

```bash
# 0001 — базовая схема (если ещё не применена)
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/0001_init.up.sql

# 0002 — is_primary + индексы для product_images
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/0002_product_images.up.sql

# 0003 — контакты заказчика в orders
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/0003_order_contacts.up.sql

# 0004 — таблица order_invoices (счета)
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/0004_order_invoices.up.sql

# 0005 — таблица blog_posts (блог)
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/0005_blog_posts.up.sql
```

Опционально — посев демо-статьи в блог (идемпотентно, `ON CONFLICT DO NOTHING`):

```bash
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/seed_blog_esp32s3.up.sql
```

### 3. Backend API

```bash
cd backend
cp ../.env.example .env        # при необходимости отредактируй SMTP_*
go build ./...
go run ./cmd/api
```

API поднимется на `http://localhost:8080`. Каталог загрузок создаётся автоматически
(`UPLOAD_DIR`, по умолчанию `./uploads`).

### 4. Витрина (Next.js)

```bash
cd storefront-next
cp .env.example .env.local
npm install
npm run dev
```

Витрина на `http://localhost:3000`.

> Favicon Apple (iOS) генерируется один раз из `app/icon.svg`:
>
> ```bash
> cd storefront-next
> npm i -D @resvg/resvg-js
> node scripts/gen-apple-icon.mjs
> npm rm @resvg/resvg-js
> ```
>
> Результат — `app/apple-icon.png`, Next подключает его по конвенции автоматически.

### 5. Админка (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Админка на `http://localhost:5173`. Убедись, что в `index.html` стоит
`<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.

### 6. Мобильный клиент (Flutter)

```bash
cd radio_store_mobile
flutter pub get
flutter run
```

---

## Переменные окружения

### Backend (`backend/.env`)

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://app:app@localhost:5432/radio_store?sslmode=disable` | Строка подключения PostgreSQL |
| `HTTP_ADDR` | `:8080` | Адрес и порт HTTP-сервера |
| `AUTH_JWT_SECRET` | `dev-secret-change-me` | Секрет подписи JWT (**в проде обязателен свой длинный**) |
| `UPLOAD_DIR` | `./uploads` | Каталог загруженных изображений |
| `SMTP_HOST` | *(пусто)* | Хост SMTP. Пусто → отправка счетов недоступна |
| `SMTP_PORT` | `587` | Порт SMTP (587 = STARTTLS, 465 = implicit TLS) |
| `SMTP_USERNAME` | *(пусто)* | Логин SMTP |
| `SMTP_PASSWORD` | *(пусто)* | Пароль/прикладной пароль SMTP |
| `SMTP_FROM` | *(пусто)* | Address From (если пусто — берётся из `SMTP_USERNAME`) |
| `SMTP_FROM_NAME` | `Radio Store` | Отображаемое имя отправителя |

### Витрина (`storefront-next/.env.local`)

| Переменная | Назначение |
| --- | --- |
| `INTERNAL_API_URL` | Внутренний URL бэкенда для серверных запросов (SSR/ISR/sitemap), напр. `http://localhost:8080` или `http://backend:8080` в Docker |
| `NEXT_PUBLIC_API_URL` | Публичный URL бэкенда для клиентских запросов из браузера |
| `NEXT_PUBLIC_SITE_URL` | Канонический URL витрины для canonical/OG/sitemap/robots |

### Админка (`frontend/.env`)

| Переменная | Назначение |
| --- | --- |
| `VITE_API_URL` | URL бэкенда (по умолчанию `http://localhost:8080`) |

---

## Миграции

| Файл | Что делает |
| --- | --- |
| `0001_init` | Базовая схема: `categories`, `products`, `users`, `cart_items`, `stock`, `orders`, `order_items`, `product_images` |
| `0002_product_images` | `is_primary` в `product_images`, частичный уникальный индекс «одно главное фото на товар», индексы по `product_id` и `(product_id, position)` |
| `0003_order_contacts` | `customer_email`, `customer_phone` в `orders` (nullable — старые заказы и Flutter-клиент не ломаются) |
| `0004_order_invoices` | Таблица `order_invoices` (номер, сумма, валюта, статус `draft/sent`, `issued_at`, `sent_at`) + индекс по `order_id` |
| `0005_blog_posts` | Таблица `blog_posts` (slug уникальный, title, excerpt, body, cover_image_url, author, is_published, published_at) + индекс публикации |
| `seed_blog_esp32s3` | Посев демо-статьи про ESP32-S3 (данные, не схема; идемпотентно) |

Откат каждой миграции — парный `*.down.sql` (кроме seed: удаление строкой
`DELETE FROM blog_posts WHERE slug = 'esp32-s3';`).

---

## API

Все эндпоинты — под `/api/v1`, кроме служебных (`/healthz`, `/robots.txt`,
`/sitemap.xml`, `/media/*`). Ответы — JSON; ошибки — `{"error": "..."}`.

### Публичные

- `GET /healthz`
- `GET /robots.txt`, `GET /sitemap.xml` — для случая, когда бэк и витрина на одном домене
- `GET /media/products/{filename}` — фото товаров
- `GET /media/blog/{filename}` — обложки статей
- `GET /api/v1/categories`
- `GET /api/v1/products?category_id=&search=&limit=&offset=`
- `GET /api/v1/products/images?ids=1,2,3` — батч главных фото (для корзины/заказа)
- `GET /api/v1/products/{id}`
- `GET /api/v1/blog/posts?limit=&offset=` — только опубликованные
- `GET /api/v1/blog/posts/{slug}` — только опубликованные

### Авторизация и клиент

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- `GET /api/v1/cart`, `POST /api/v1/cart/items`,
  `PATCH /api/v1/cart/items/{product_id}`, `DELETE /api/v1/cart/items/{product_id}`
- `POST /api/v1/orders` (принимает `shipping_address`, `comment`,
  `customer_email`, `customer_phone`), `GET /api/v1/orders`, `GET /api/v1/orders/{id}`

### Админ (`role=admin`, заголовок `Authorization: Bearer <jwt>`)

- Товары: `GET/POST /api/v1/admin/products`, `PATCH /api/v1/admin/products/{id}`,
  `PATCH /api/v1/admin/products/{id}/stock`
- Фото товаров: `GET/POST /api/v1/admin/products/{id}/images`,
  `DELETE /api/v1/admin/products/{id}/images/{imageId}`,
  `PATCH /api/v1/admin/products/{id}/images/{imageId}/primary`
- Категории: `GET/POST /api/v1/admin/categories`, `PATCH/DELETE /api/v1/admin/categories/{id}`
- Заказы: `GET /api/v1/admin/orders`, `GET /api/v1/admin/orders/new-count`,
  `GET /api/v1/admin/orders/contacts?ids=...`, `PATCH /api/v1/admin/orders/{id}/status`
- Счета: `POST /api/v1/admin/orders/{id}/invoices`,
  `GET /api/v1/admin/invoices?order_ids=...`,
  `POST /api/v1/admin/invoices/{id}/send`,
  `GET /api/v1/admin/invoices/{id}/view` (HTML)
- Блог: `GET/POST /api/v1/admin/blog/posts`,
  `PATCH/DELETE /api/v1/admin/blog/posts/{id}`,
  `POST /api/v1/admin/blog/posts/{id}/cover` (multipart)
- Пользователи: `GET /api/v1/admin/users?limit=&offset=&search=`,
  `GET /api/v1/admin/users/{id}`

---

## Фотографии товаров и обложки блога

- Загрузка — multipart, валидация реального MIME-типа по содержимому
  (`http.DetectContentType`), лимит 5 МиБ.
- Имя файла генерирует сервер (`crypto/rand`, 32 hex + расширение) — пользовательское
  имя не используется, path traversal исключён.
- Отдача — собственными handlers со строгой регуляркой по имени; листинг директорий
  невозможен; `Cache-Control: public, max-age=31536000, immutable`.
- Главное фото — флаг `is_primary` с частичным уникальным индексом (одно на товар).
- Хранение — локальный диск `uploads/products/` и `uploads/blog/` (в `.gitignore`).
  Для прода монтируй как volume или переведи на S3/MinIO (см. «Известные ограничения»).

---

## Блог и Markdown

Тело статьи хранится как Markdown и рендерится на витрине
`storefront-next/lib/markdown.tsx`, который возвращает **React-узлы**.
`dangerouslySetInnerHTML`/`innerHTML` не используются — любой текст попадает в дерево
как children, React экранирует сам, а `href`/`src` проходят валидацию протокола
(`isSafeUrl` блокирует `javascript:`, `data:` и т.п.). Поэтому stored-XSS через статью
невозможен по конструкции.

Поддерживаемое подмножество Markdown:

- заголовки `#`..`######`;
- абзацы;
- плоские списки `ul` (`-`/`*`/`+`) и `ol` (`1.`/`1)`) **без вложенности**;
- цитаты `>`;
- горизонтальный разделитель `---` / `***` / `___`;
- fenced-блоки кода ` ``` `;
- inline: `**жирный**`, `*курсив*` / `_курсив_`, `` `код` ``,
  `[ссылка](url)`, `![картинка](url)`.

**Не поддерживается (осознанно):** таблицы/GFM, вложенные списки, сноски,
вставка сырого HTML. Это компромисс ради обозримого и безопасного парсера.
Для таблиц/вложенности нужен переход на `react-markdown` + `remark-gfm` — отдельный шаг.

Обложка загружается в режиме редактирования статьи (после сохранения), хранится в
`uploads/blog/`, отдаётся по `/media/blog/{filename}`.

---

## Счета (инвойсы) и email

- Счёт создаётся по заказу в статусе `processing`; номер `INV-<orderID>-<NNN>`.
- Просмотр — HTML-документ с реквизитами, позициями и кнопкой
  «Печать / Сохранить в PDF» (`window.print()`). **Серверный PDF не реализован.**
- Отправка — `net/smtp` + `crypto/tls` (stdlib): STARTTLS на 587, implicit TLS на 465.
  Письмо уходит HTML-телом, без вложения.
- Статус `draft → sent` меняется атомарным `UPDATE ... WHERE status='draft'`
  (защита от двойной отправки). Если SMTP не настроен — возвращается понятная ошибка,
  счёт остаётся `draft` (ложного `sent` нет).
- Реквизиты продавца в `invoices.go` — **заглушки** (`invoiceSellerName/INN/KPP/Bank/Addr`),
  заменить на реальные (idealно вынести в конфиг/БД).

---

## Контакты заказов

- `customer_email`, `customer_phone` — снимок в строке `orders` (nullable).
- Валидация на бэкенде перед транзакцией: email через `net/mail.ParseAddress`
  (сохраняется нормализованный адрес), телефон по количеству цифр 6–15.
- Пустая строка → `NULL` (мягкая валидация: не ломает клиентов, которые контакты
  не шлют, например текущий Flutter). Непустая невалидная → `400`.
- Витрина (Next) требует email/телефон на клиенте и показывает их в деталях заказа.
- Админка показывает контакты в колонке «Контакты» и в деталях заказа
  (через батч-эндпоинт + fallback из `listOrders`).

---

## Витрина: SEO и производительность

- **Адреса и рендеринг.**商品/категории/статьи имеют собственные URL и отдаются
  сервером (SSR/ISR) — поисковик видит контент без JS.
- **Мета-теги.** Уникальные `title`/`description`/canonical/OG на каждой странице;
  SKU/артикул включены в title/H1/description и JSON-LD товара.
- **Структурированные данные.** `Product`+`Offer` (с `availability` InStock/OutOfStock),
  `BreadcrumbList`, `ItemList` для категорий, `WebSite`+`SearchAction`, `Blog`+`BlogPosting`.
- **robots/sitemap.** Через конвенции App Router (`app/robots.ts`, `app/sitemap.ts`);
  корзина/вход/заказы/поиск — `noindex`. Дополнительно бэк отдаёт `/robots.txt` и
  `/sitemap.xml` для случая одного домена.
- **Фильтры/поиск.** Страница поиска закрыта от индексации (`noindex,follow`);
  фасеты при появлении должны получать canonical на чистую категорию.
- **LCP.** `priority` (в Next 15) ставится только первым 4 карточкам в сетке
  (`ProductGrid`) и главному фото в галерее — массовый `priority` ухудшил бы LCP.
  На Next 16 `priority` заменять на `preload` (см. «Известные ограничения»).
- **Отступы/ритм.** Вертикальный ритм задан в `globals.css` (`.main` padding,
  `.main section + section`, margin у `.breadcrumbs`), чтобы контент не лип к
  sticky-шапке и футеру.
- **Dev-индикатор.** В `next.config.mjs` стоит `devIndicators: false` — скрывает
  кружок «N» в dev. Строковое значение `'hidden'` валидно только в новых сборках;
  в Next 15 схема принимает объект или `false`, иначе опция игнорируется и
  появляется warning `Invalid next.config.mjs options detected`.
- **TypeScript 5.6+.** Для глобальных CSS-импортов (`import './globals.css'`)
  добавлены `next-env.d.ts` и `types/css.d.ts` (shim `declare module '*.css'`),
  иначе редактор показывает TS2882. На сборку `dev` это не влияет (SWC не делает
  type-check), но `npm run build` гоняет `tsc`.

---

## Админка: статусы заказов

Отображаемые подписи статусов — русские (`Новый`, `В обработке`, `Оплачен`,
`Отправлен`, `Завершён`, `Отменён`), но **`value` у `<option>` остаётся английским**
(`new`, `processing`, ...), потому что бэкенд валидирует статус по английскому белому
списку и вернёт `400` на русский. Селекту задан `minWidth`, чтобы «В обработке» не
обрезалось.

---

## Favicon

- Витрина: `storefront-next/app/icon.svg` — Next подключает по конвенции автоматически
  (править `layout.tsx`/`next.config.mjs` не нужно). Apple touch icon —
  `app/apple-icon.png`, генерируется `scripts/gen-apple-icon.mjs` из того же SVG
  (`@resvg/resvg-js`, dev-зависимость на один прогон).
- Админка: `frontend/public/favicon.svg` + строка `<link rel="icon"
  type="image/svg+xml" href="/favicon.svg" />` в `frontend/index.html`.
- Дизайн: монограмма «RS» белым на фирменном градиенте `#0b5cff → #7a5cff`
  (как `.logo-mark`), скругление, глянцевый блик. SVG резок на любом DPI;
  настоящий `.ico` не обязателен (современные браузеры принимают SVG).

---

## Заметки по безопасности

- JWT-секрет в проде обязан быть своим длинным значением (`AUTH_JWT_SECRET`).
- Загрузка изображений: валидация реального MIME, серверная генерация имени,
  лимит размера, строгая регулярка при отдаче, отсутствие листинга директорий.
- Блог: рендер Markdown в React-узлы без `innerHTML`, валидация `href`/`src`
  (`isSafeUrl`) — stored-XSS через статью невозможен по конструкции.
- Счета: атомарная смена статуса, таймаут SMTP, отсутствие ложного `sent`.
- Контакты: нормализация email, проверка телефона; снимок в заказе не «плывёт»
  при смене email в аккаунте.
- Авторизация витрины/админки сейчас на `localStorage` + Bearer — для прода
  рекомендуется перевести на httpOnly-cookie и серверную сессию (CSRF/XSS).
- Пароли — только хеш (bcrypt/argon2 в слое авторизации), plaintext не хранится.

---

## Известные ограничения и роадмап

Сознательно **не** сделано (отмечено честно, чтобы не вводить в заблуждение):

- **Серверный PDF счетов.** Сейчас PDF — через печать браузера из HTML.
  Для настоящего PDF нужен `gofpdf`/`chromedp` и вложение в письмо.
- **Очередь писем с exactly-once.** Отправка синхронная; при редком падении
  `UPDATE` после отправки теоретически возможен дубль письма. Для гарантии нужна
  таблица `email_outbox` + воркер.
- **GFM-таблицы / вложенные списки / предпросмотр Markdown в админке.** Парсер —
  подмножество; предпросмотра нет (админ смотрит результат на витрине).
- **Flutter: контакты и блог.** Мобильный клиент не обновлялся под email/телефон
  в заказе и не имеет раздела блога — бэк принимает пустые контакты как `NULL`,
  поэтому заказы из Flutter создаются без ошибок, но без контактов.
- **S3/MinIO и миниатюры.** Хранение — локальный диск; превью в заказе/корзине
  грузят главное фото в натуральную ширину (Next оптимизирует по `sizes`).
  Для лёгких превью — генерация вариантов на бэке или image-CDN.
- **Иерархия URL категорий и фасеты.** `parent_id` в БД есть, но URL плоские
  (`/category/[slug]`); фильтры/фасеты ещё не введены (при вводе — canonical/noindex).
- **Next 16.** `priority` → `preload`; при обновлении заменить в `ProductGrid`/
  `ProductGallery`. `devIndicators` в новых сборках допускает строковые значения.
- **Реквизиты продавца** в `invoices.go` — заглушки.

Планируемые улучшения по запросу: серверный PDF, очередь писем, S3/миниатюры,
GFM-рендер, категории/теги блога, иерархия URL категорий, фильтры с SEO-поведением,
Flutter-контакты и блог, отзыв/рейтинг с `aggregateRating`.

---

## Проверка работоспособности

### Backend

```bash
cd backend && go build ./... && go vet ./...
go run ./cmd/api
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/robots.txt
curl -s http://localhost:8080/sitemap.xml
```

### Витрина (SSR без JS)

```bash
# товар и категория — название/SKU/цена должны быть в HTML
curl -s http://localhost:3000/product/1 | grep -i "SKU\|price\|<h1"
curl -s http://localhost:3000/category/rezistory | grep -i "SKU"
# блог
curl -s http://localhost:3000/blog/esp32-s3 | grep -i "ESP32-S3\|Xtensa"
# robots/sitemap/JSON-LD
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/sitemap.xml | grep -i "/blog/\|/product/"
curl -s http://localhost:3000/product/1 | grep -o 'application/ld+json'
```

### Батч-эндпоинты

```bash
curl -s "http://localhost:8080/api/v1/products/images?ids=1,2"
# контакты (нужен admin-токен)
curl -s "http://localhost:8080/api/v1/admin/orders/contacts?ids=3,4" -H "Authorization: Bearer <token>"
```

### Счета

1. В админке переведи заказ в `processing` → колонка «Счёт» покажет «Создать счёт».
2. Создай счёт → бейдж «черновик»; «Просмотр» откроет HTML с кнопкой печати.
3. «Отправить счёт»: при настроенном SMTP — бейдж «отправлен», иначе понятная ошибка
   и счёт остаётся «черновик».

```bash
docker compose exec -T postgres psql -U app -d radio_store -c \
  "SELECT id, order_id, number, status, sent_at FROM order_invoices ORDER BY id DESC LIMIT 5;"
```

### Контакты заказа

```bash
docker compose exec -T postgres psql -U app -d radio_store -c \
  "SELECT id, customer_email, customer_phone FROM orders ORDER BY id DESC LIMIT 1;"
```

---

## Полезные команды

```bash
# Пересобрать и перезапустить всё (пример для dev-машины)
docker compose up -d postgres
(cd backend && go run ./cmd/api) &
(cd storefront-next && npm run dev) &
(cd frontend && npm run dev) &

# Прод-сборка витрины
cd storefront-next && npm run build && npm start

# Откат миграции (пример)
docker compose exec -T postgres psql -U app -d radio_store < backend/migrations/0005_blog_posts.down.sql
```

---

## Лицензия и автор

Внутренний проект. Реквизиты продавца, SMTP-данные и `AUTH_JWT_SECRET` перед
выкатом в прод заменить на боевые.
