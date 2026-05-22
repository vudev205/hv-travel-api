# HV-Travel API Notes

Tai lieu nay tom tat cac endpoint chinh trong `hv-travel-api` phuc vu mobile app va cac client khac.

## Base routes

- `/api/tours`
- `/api/auth`
- `/api/favourites`
- `/api/bookings`
- `/api/payments`
- `/api/reviews`
- `/api/customers`
- `/api/chatbot`
- `/api/chat`
- `/api/ai`
- `/api/test`

## Tours

- `GET /api/tours/list`
  - Danh sach tour cho cac man can du lieu co ban.
  - Ho tro `limit`, `start`, `category`, `city`.
- `GET /api/tours/search`
  - Backend tour search voi Meilisearch lam search engine chinh va MongoDB lam fallback.
  - Ho tro `q`, `city`, `category`, `minPrice`, `maxPrice`, `minDurationDays`, `maxDurationDays`, `minRating`, `sort`, `start`, `limit`.
  - `sort` ho tro: `popular`, `price_asc`, `price_desc`, `rating`.
- `GET /api/tours/search/bootstrap`
  - Metadata khoi tao cho man hinh search.
  - Tra ve `categories` va `priceBounds`.
- `GET /api/tours/:id`
  - Chi tiet mot tour.

## Search config

Them cac bien moi truong sau vao backend:

```env
MEILISEARCH_ENABLED=false
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_API_KEY=
MEILISEARCH_INDEX=tours
```

## Reindex

Dung lenh sau de tao/cap nhat settings index va dong bo lai tat ca tour active:

```bash
npm run search:reindex
```

## Notes

- `GET /api/tours/search` va `GET /api/tours/search/bootstrap` deu duoc bao ve boi `customerAuth`.
- Khi Meilisearch khong kha dung hoac bi tat bang config, API se fallback ve truy van Mongo co ban.
- Sau khi tao review moi, backend se cap nhat lai document tour trong search index neu search dang bat.
