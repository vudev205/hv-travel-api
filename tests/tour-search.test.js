import test from "node:test";
import assert from "node:assert/strict";

import tourRouter from "../routes/tour.routes.js";
import {
  buildMeiliSearchRequest,
  buildTourSearchBootstrap,
  mapTourToSearchDocument,
  parseTourSearchQuery,
  searchToursWithMongoFallback,
} from "../utils/tourSearch.js";

function findRoute(pathname, method) {
  return tourRouter.stack.find(
    (layer) =>
      layer.route?.path === pathname &&
      layer.route.methods?.[method.toLowerCase()] === true
  );
}

const sampleTours = [
  {
    _id: "tour-1",
    name: "Hạ Long Premium",
    category: "Biển",
    destination: { city: "Hạ Long", country: "Việt Nam", region: "North" },
    description: "Du thuyền ngắm vịnh và nghỉ dưỡng cao cấp",
    images: ["https://example.com/halong.jpg"],
    duration: { days: 3, nights: 2, text: "3 ngày 2 đêm" },
    price: { adult: 3200000, child: 2100000, infant: 600000, discount: 10 },
    rating: 4.8,
    review_count: 152,
    current_participants: 10,
    max_participants: 24,
    status: "Active",
    is_deleted: false,
    schedule: [
      { day: 1, title: "Khởi hành", activities: ["du thuyền", "ăn tối"] },
    ],
    start_dates: [],
  },
  {
    _id: "tour-2",
    name: "Huế Heritage",
    category: "Văn hóa",
    destination: { city: "Huế", country: "Việt Nam", region: "Central" },
    description: "Khám phá di sản cung đình và ẩm thực cố đô",
    images: ["https://example.com/hue.jpg"],
    duration: { days: 4, nights: 3, text: "4 ngày 3 đêm" },
    price: { adult: 4100000, child: 2600000, infant: 900000, discount: 15 },
    rating: 4.9,
    review_count: 220,
    current_participants: 6,
    max_participants: 20,
    status: "Active",
    is_deleted: false,
    schedule: [
      { day: 1, title: "Đại Nội", activities: ["tham quan", "ẩm thực"] },
    ],
    start_dates: [],
  },
  {
    _id: "tour-3",
    name: "Sa Pa Adventure",
    category: "Núi",
    destination: { city: "Sa Pa", country: "Việt Nam", region: "North" },
    description: "Leo núi và trekking bản làng",
    images: ["https://example.com/sapa.jpg"],
    duration: { days: 2, nights: 1, text: "2 ngày 1 đêm" },
    price: { adult: 2800000, child: 1800000, infant: 500000, discount: 0 },
    rating: 4.6,
    review_count: 99,
    current_participants: 4,
    max_participants: 18,
    status: "Inactive",
    is_deleted: false,
    schedule: [
      { day: 1, title: "Fansipan", activities: ["trekking"] },
    ],
    start_dates: [],
  },
];

test("tour routes add protected search endpoints before :id detail route", () => {
  const searchRoute = findRoute("/search", "get");
  const bootstrapRoute = findRoute("/search/bootstrap", "get");
  const detailRouteIndex = tourRouter.stack.findIndex((layer) => layer.route?.path === "/:id");
  const searchRouteIndex = tourRouter.stack.findIndex((layer) => layer.route?.path === "/search");
  const bootstrapRouteIndex = tourRouter.stack.findIndex(
    (layer) => layer.route?.path === "/search/bootstrap"
  );

  assert.ok(searchRoute);
  assert.ok(bootstrapRoute);
  assert.ok(searchRoute.route.stack.some((layer) => layer.name === "customerAuth"));
  assert.ok(bootstrapRoute.route.stack.some((layer) => layer.name === "customerAuth"));
  assert.ok(searchRouteIndex > -1 && searchRouteIndex < detailRouteIndex);
  assert.ok(bootstrapRouteIndex > -1 && bootstrapRouteIndex < detailRouteIndex);
});

test("parseTourSearchQuery clamps pagination and defaults unsupported sort to popular", () => {
  const parsed = parseTourSearchQuery({
    q: "  ha long  ",
    minPrice: "1000000",
    maxPrice: "4500000",
    minDurationDays: "2",
    maxDurationDays: "5",
    minRating: "4.5",
    sort: "unknown",
    start: "-4",
    limit: "500",
  });

  assert.deepEqual(parsed, {
    q: "ha long",
    city: "",
    category: "",
    minPrice: 1000000,
    maxPrice: 4500000,
    minDurationDays: 2,
    maxDurationDays: 5,
    minRating: 4.5,
    sort: "popular",
    start: 0,
    limit: 50,
  });
});

test("buildMeiliSearchRequest preserves relevance for q+popular and uses explicit sort otherwise", () => {
  const qSearch = buildMeiliSearchRequest(
    parseTourSearchQuery({
      q: "ha long",
      city: "Hạ Long",
      category: "Biển",
      minPrice: "2000000",
      maxPrice: "4000000",
      minDurationDays: "2",
      maxDurationDays: "4",
      minRating: "4",
      sort: "popular",
      limit: "10",
    })
  );

  assert.equal(qSearch.q, "ha long");
  assert.deepEqual(qSearch.options.filter, [
    'status = "Active"',
    "is_deleted = false",
    'destination_city = "Hạ Long"',
    'category = "Biển"',
    "display_price >= 2000000",
    "display_price <= 4000000",
    "duration_days >= 2",
    "duration_days <= 4",
    "rating >= 4",
  ]);
  assert.equal(qSearch.options.sort, undefined);
  assert.equal(qSearch.options.limit, 10);

  const popularWithoutQuery = buildMeiliSearchRequest(
    parseTourSearchQuery({ sort: "popular", limit: "4" })
  );

  assert.deepEqual(popularWithoutQuery.options.sort, [
    "rating:desc",
    "review_count:desc",
    "discount_percent:desc",
  ]);
});

test("mapTourToSearchDocument flattens tour fields and adds normalized search keys", () => {
  const document = mapTourToSearchDocument(sampleTours[0]);

  assert.equal(document.id, "tour-1");
  assert.equal(document.name_normalized, "ha long premium");
  assert.equal(document.destination_city_normalized, "ha long");
  assert.equal(document.category_normalized, "bien");
  assert.equal(document.duration_days, 3);
  assert.equal(document.discount_percent, 10);
  assert.equal(document.display_price, 2880000);
  assert.deepEqual(document.schedule_titles, ["Khởi hành"]);
});

test("buildTourSearchBootstrap returns unique categories and price bounds from active tours", () => {
  const bootstrap = buildTourSearchBootstrap(sampleTours);

  assert.deepEqual(bootstrap.categories, ["Biển", "Văn hóa"]);
  assert.deepEqual(bootstrap.priceBounds, {
    minAvailablePrice: 2880000,
    maxAvailablePrice: 3485000,
    sliderMaxPrice: 3500000,
    step: 50000,
    minGap: 50000,
  });
});

test("searchToursWithMongoFallback matches accentless queries and applies sorting/pagination", () => {
  const result = searchToursWithMongoFallback(
    sampleTours,
    parseTourSearchQuery({
      q: "ha long",
      sort: "popular",
      start: "0",
      limit: "10",
    })
  );

  assert.equal(result.total, 1);
  assert.equal(result.count, 1);
  assert.equal(result.data[0].id, "tour-1");
  assert.equal(result.data[0].destination.city, "Hạ Long");

  const sorted = searchToursWithMongoFallback(
    sampleTours,
    parseTourSearchQuery({
      minRating: "4.7",
      sort: "price_desc",
      start: "0",
      limit: "1",
    })
  );

  assert.equal(sorted.total, 2);
  assert.equal(sorted.count, 1);
  assert.equal(sorted.data[0].id, "tour-2");
});
