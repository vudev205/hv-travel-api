const FALLBACK_PRICE_MAX = 5000000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ALLOWED_SORTS = new Set(["popular", "price_asc", "price_desc", "rating"]);

export const TOUR_SEARCH_INDEX_SETTINGS = {
  searchableAttributes: [
    "name",
    "name_normalized",
    "destination_city",
    "destination_city_normalized",
    "destination_country",
    "destination_country_normalized",
    "category",
    "category_normalized",
    "description",
    "description_normalized",
    "schedule_titles",
    "schedule_titles_normalized",
    "schedule_activities",
    "schedule_activities_normalized",
  ],
  filterableAttributes: [
    "status",
    "is_deleted",
    "category",
    "destination_city",
    "destination_country",
    "duration_days",
    "rating",
    "display_price",
  ],
  sortableAttributes: ["display_price", "rating", "review_count", "discount_percent"],
};

const toNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clampMinZero = (value) => Math.max(0, value);

const roundUpToStep = (value, step) => Math.ceil(value / step) * step;

const roundUpPriceCeiling = (value) => {
  if (value <= 0) return FALLBACK_PRICE_MAX;
  if (value < 5000000) return roundUpToStep(value, 500000);
  if (value <= 20000000) return roundUpToStep(value, 1000000);
  return roundUpToStep(value, 5000000);
};

const getPriceStep = (maxPrice) => {
  if (maxPrice < 5000000) return 50000;
  if (maxPrice <= 20000000) return 100000;
  return 500000;
};

const escapeFilterValue = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

const safeTrim = (value) => String(value ?? "").trim();

const getDiscountPercent = (tour) => clampMinZero(toNumber(tour?.price?.discount ?? tour?.discount_percent, 0) || 0);

export const normalizeSearchText = (value) =>
  safeTrim(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ");

export const getTourDurationDays = (tour) => {
  const durationDays = toNumber(tour?.duration?.days ?? tour?.duration_days, null);
  if (durationDays !== null) return clampMinZero(durationDays);

  const match = String(tour?.duration?.text ?? "").match(/(\d+)/);
  return match ? clampMinZero(Number(match[1])) : 0;
};

export const getTourDisplayPrice = (tour) => {
  const adultPrice = clampMinZero(toNumber(tour?.price?.adult, 0) || 0);
  const discountPercent = getDiscountPercent(tour);
  return discountPercent > 0
    ? Math.round(adultPrice * (1 - discountPercent / 100))
    : adultPrice;
};

const buildNormalizedArray = (items) =>
  Array.isArray(items)
    ? items.map((item) => safeTrim(item)).filter(Boolean)
    : [];

export const mapTourToSearchDocument = (tour) => {
  const id = String(tour?.id ?? tour?._id ?? "");
  const name = safeTrim(tour?.name);
  const category = safeTrim(tour?.category);
  const destinationCity = safeTrim(tour?.destination?.city);
  const destinationCountry = safeTrim(tour?.destination?.country || "Việt Nam");
  const destinationRegion = safeTrim(tour?.destination?.region);
  const description = safeTrim(tour?.description);
  const durationDays = getTourDurationDays(tour);
  const durationNights = clampMinZero(toNumber(tour?.duration?.nights, 0) || 0);
  const durationText = safeTrim(tour?.duration?.text);
  const priceAdult = clampMinZero(toNumber(tour?.price?.adult, 0) || 0);
  const priceChild = clampMinZero(toNumber(tour?.price?.child, 0) || 0);
  const priceInfant = clampMinZero(toNumber(tour?.price?.infant, 0) || 0);
  const discountPercent = getDiscountPercent(tour);
  const reviewCount = clampMinZero(
    toNumber(tour?.review_count ?? tour?.reviewCount, 0) || 0
  );
  const rating = clampMinZero(toNumber(tour?.rating, 0) || 0);
  const currentParticipants = clampMinZero(
    toNumber(tour?.current_participants ?? tour?.currentParticipants, 0) || 0
  );
  const maxParticipants = clampMinZero(
    toNumber(tour?.max_participants ?? tour?.maxParticipants, 0) || 0
  );
  const scheduleTitles = Array.isArray(tour?.schedule)
    ? tour.schedule.map((item) => safeTrim(item?.title)).filter(Boolean)
    : [];
  const scheduleActivities = Array.isArray(tour?.schedule)
    ? tour.schedule.flatMap((item) => buildNormalizedArray(item?.activities))
    : [];

  return {
    id,
    name,
    name_normalized: normalizeSearchText(name),
    category,
    category_normalized: normalizeSearchText(category),
    destination: {
      city: destinationCity,
      country: destinationCountry,
      region: destinationRegion,
    },
    destination_city: destinationCity,
    destination_city_normalized: normalizeSearchText(destinationCity),
    destination_country: destinationCountry,
    destination_country_normalized: normalizeSearchText(destinationCountry),
    description,
    description_normalized: normalizeSearchText(description),
    images: Array.isArray(tour?.images) ? tour.images.filter(Boolean) : [],
    duration: {
      days: durationDays,
      nights: durationNights,
      text: durationText,
    },
    duration_days: durationDays,
    price: {
      adult: priceAdult,
      child: priceChild,
      infant: priceInfant,
      discount: discountPercent,
    },
    display_price: getTourDisplayPrice(tour),
    discount_percent: discountPercent,
    rating,
    review_count: reviewCount,
    current_participants: currentParticipants,
    max_participants: maxParticipants,
    status: safeTrim(tour?.status || "Active") || "Active",
    is_deleted: Boolean(tour?.is_deleted),
    schedule_titles: scheduleTitles,
    schedule_titles_normalized: scheduleTitles.map(normalizeSearchText),
    schedule_activities: scheduleActivities,
    schedule_activities_normalized: scheduleActivities.map(normalizeSearchText),
    start_dates: Array.isArray(tour?.start_dates) ? tour.start_dates : [],
  };
};

export const mapSearchDocumentToTour = (document) => ({
  id: String(document?.id ?? document?._id ?? ""),
  name: safeTrim(document?.name),
  category: safeTrim(document?.category),
  destination: {
    city: safeTrim(document?.destination?.city ?? document?.destination_city),
    country: safeTrim(
      document?.destination?.country ?? document?.destination_country ?? "Việt Nam"
    ),
    region: safeTrim(document?.destination?.region ?? ""),
  },
  description: safeTrim(document?.description),
  images: Array.isArray(document?.images) ? document.images.filter(Boolean) : [],
  duration: {
    days: getTourDurationDays(document),
    nights: clampMinZero(toNumber(document?.duration?.nights, 0) || 0),
    text: safeTrim(document?.duration?.text),
  },
  price: {
    adult: clampMinZero(toNumber(document?.price?.adult, 0) || 0),
    child: clampMinZero(toNumber(document?.price?.child, 0) || 0),
    infant: clampMinZero(toNumber(document?.price?.infant, 0) || 0),
    discount: getDiscountPercent(document),
  },
  rating: clampMinZero(toNumber(document?.rating, 0) || 0),
  review_count: clampMinZero(
    toNumber(document?.review_count ?? document?.reviewCount, 0) || 0
  ),
  max_participants: clampMinZero(
    toNumber(document?.max_participants ?? document?.maxParticipants, 0) || 0
  ),
  current_participants: clampMinZero(
    toNumber(document?.current_participants ?? document?.currentParticipants, 0) || 0
  ),
  status: safeTrim(document?.status || "Active") || "Active",
  start_dates: Array.isArray(document?.start_dates) ? document.start_dates : [],
});

export const parseTourSearchQuery = (query = {}) => {
  const sort = safeTrim(query.sort);
  return {
    q: safeTrim(query.q),
    city: safeTrim(query.city),
    category: safeTrim(query.category),
    minPrice: toNumber(query.minPrice, null),
    maxPrice: toNumber(query.maxPrice, null),
    minDurationDays: toNumber(query.minDurationDays, null),
    maxDurationDays: toNumber(query.maxDurationDays, null),
    minRating: toNumber(query.minRating, null),
    sort: ALLOWED_SORTS.has(sort) ? sort : "popular",
    start: clampMinZero(toNumber(query.start, 0) || 0),
    limit: Math.min(
      Math.max(toNumber(query.limit, DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    ),
  };
};

export const buildMeiliSearchRequest = (parsedQuery) => {
  const filters = ['status = "Active"', "is_deleted = false"];

  if (parsedQuery.city) {
    filters.push(`destination_city = "${escapeFilterValue(parsedQuery.city)}"`);
  }

  if (parsedQuery.category) {
    filters.push(`category = "${escapeFilterValue(parsedQuery.category)}"`);
  }

  if (parsedQuery.minPrice !== null) filters.push(`display_price >= ${parsedQuery.minPrice}`);
  if (parsedQuery.maxPrice !== null) filters.push(`display_price <= ${parsedQuery.maxPrice}`);
  if (parsedQuery.minDurationDays !== null) {
    filters.push(`duration_days >= ${parsedQuery.minDurationDays}`);
  }
  if (parsedQuery.maxDurationDays !== null) {
    filters.push(`duration_days <= ${parsedQuery.maxDurationDays}`);
  }
  if (parsedQuery.minRating !== null) filters.push(`rating >= ${parsedQuery.minRating}`);

  let sort;
  switch (parsedQuery.sort) {
    case "price_asc":
      sort = ["display_price:asc"];
      break;
    case "price_desc":
      sort = ["display_price:desc"];
      break;
    case "rating":
      sort = ["rating:desc", "review_count:desc"];
      break;
    case "popular":
    default:
      if (!parsedQuery.q) {
        sort = ["rating:desc", "review_count:desc", "discount_percent:desc"];
      }
      break;
  }

  return {
    q: parsedQuery.q,
    options: {
      filter: filters,
      sort,
      offset: parsedQuery.start,
      limit: parsedQuery.limit,
    },
  };
};

const computeRelevance = (document, normalizedQuery) => {
  if (!normalizedQuery) return 0;

  const name = document.name_normalized;
  const city = document.destination_city_normalized;
  const country = document.destination_country_normalized;
  const category = document.category_normalized;
  const description = document.description_normalized;
  let score = 0;

  if (name === normalizedQuery) score += 300;
  else if (name.startsWith(normalizedQuery)) score += 220;
  else if (name.includes(normalizedQuery)) score += 160;

  if (city === normalizedQuery) score += 140;
  else if (city.startsWith(normalizedQuery)) score += 100;
  else if (city.includes(normalizedQuery)) score += 70;

  if (country.includes(normalizedQuery)) score += 20;
  if (category.includes(normalizedQuery)) score += 60;
  if (description.includes(normalizedQuery)) score += 25;

  return score + document.rating * 10 + document.review_count / 100 + document.discount_percent / 10;
};

const matchesNumericFilters = (document, parsedQuery) => {
  if (parsedQuery.city) {
    const queryCity = normalizeSearchText(parsedQuery.city);
    if (document.destination_city_normalized !== queryCity) return false;
  }

  if (parsedQuery.category) {
    const queryCategory = normalizeSearchText(parsedQuery.category);
    if (document.category_normalized !== queryCategory) return false;
  }

  if (parsedQuery.minPrice !== null && document.display_price < parsedQuery.minPrice) return false;
  if (parsedQuery.maxPrice !== null && document.display_price > parsedQuery.maxPrice) return false;
  if (
    parsedQuery.minDurationDays !== null &&
    document.duration_days < parsedQuery.minDurationDays
  ) {
    return false;
  }
  if (
    parsedQuery.maxDurationDays !== null &&
    document.duration_days > parsedQuery.maxDurationDays
  ) {
    return false;
  }
  if (parsedQuery.minRating !== null && document.rating < parsedQuery.minRating) return false;

  return true;
};

const matchesTextQuery = (document, parsedQuery) => {
  if (!parsedQuery.q) return true;

  const normalizedQuery = normalizeSearchText(parsedQuery.q);
  const rawQuery = parsedQuery.q.toLowerCase();
  const rawFields = [
    document.name,
    document.destination_city,
    document.destination_country,
    document.category,
    document.description,
    ...(Array.isArray(document.schedule_titles) ? document.schedule_titles : []),
    ...(Array.isArray(document.schedule_activities) ? document.schedule_activities : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalizedFields = [
    document.name_normalized,
    document.destination_city_normalized,
    document.destination_country_normalized,
    document.category_normalized,
    document.description_normalized,
    ...(Array.isArray(document.schedule_titles_normalized)
      ? document.schedule_titles_normalized
      : []),
    ...(Array.isArray(document.schedule_activities_normalized)
      ? document.schedule_activities_normalized
      : []),
  ]
    .filter(Boolean)
    .join(" ");

  return rawFields.includes(rawQuery) || normalizedFields.includes(normalizedQuery);
};

const sortFallbackResults = (documents, parsedQuery) => {
  const normalizedQuery = normalizeSearchText(parsedQuery.q);
  const sorted = [...documents];

  switch (parsedQuery.sort) {
    case "price_asc":
      sorted.sort((a, b) => a.display_price - b.display_price);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.display_price - a.display_price);
      break;
    case "rating":
      sorted.sort(
        (a, b) =>
          b.rating - a.rating ||
          b.review_count - a.review_count ||
          b.discount_percent - a.discount_percent
      );
      break;
    case "popular":
    default:
      if (parsedQuery.q) {
        sorted.sort(
          (a, b) =>
            computeRelevance(b, normalizedQuery) - computeRelevance(a, normalizedQuery)
        );
      } else {
        sorted.sort(
          (a, b) =>
            b.rating - a.rating ||
            b.review_count - a.review_count ||
            b.discount_percent - a.discount_percent
        );
      }
      break;
  }

  return sorted;
};

export const searchToursWithMongoFallback = (tours, parsedQuery) => {
  const documents = tours
    .map(mapTourToSearchDocument)
    .filter((document) => document.status === "Active" && document.is_deleted !== true)
    .filter((document) => matchesNumericFilters(document, parsedQuery))
    .filter((document) => matchesTextQuery(document, parsedQuery));
  const sorted = sortFallbackResults(documents, parsedQuery);
  const paged = sorted.slice(parsedQuery.start, parsedQuery.start + parsedQuery.limit);

  return {
    count: paged.length,
    total: sorted.length,
    start: parsedQuery.start,
    limit: parsedQuery.limit,
    data: paged.map(mapSearchDocumentToTour),
  };
};

export const buildTourSearchBootstrap = (tours) => {
  const documents = tours
    .map(mapTourToSearchDocument)
    .filter((document) => document.status === "Active" && document.is_deleted !== true);
  const categories = Array.from(
    new Set(documents.map((document) => document.category).filter(Boolean))
  );
  const prices = documents
    .map((document) => document.display_price)
    .filter((price) => Number.isFinite(price) && price >= 0);

  if (!prices.length) {
    const sliderMaxPrice = FALLBACK_PRICE_MAX;
    return {
      categories,
      priceBounds: {
        minAvailablePrice: 0,
        maxAvailablePrice: sliderMaxPrice,
        sliderMaxPrice,
        step: getPriceStep(sliderMaxPrice),
        minGap: getPriceStep(sliderMaxPrice),
      },
    };
  }

  const minAvailablePrice = Math.min(...prices);
  const maxAvailablePrice = Math.max(...prices);
  const sliderMaxPrice = Math.max(roundUpPriceCeiling(maxAvailablePrice), minAvailablePrice);
  const step = getPriceStep(sliderMaxPrice);

  return {
    categories,
    priceBounds: {
      minAvailablePrice,
      maxAvailablePrice,
      sliderMaxPrice,
      step,
      minGap: step,
    },
  };
};
