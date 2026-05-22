import { Meilisearch } from "meilisearch";
import Tour from "../models/Tour.js";
import {
  TOUR_SEARCH_INDEX_SETTINGS,
  buildMeiliSearchRequest,
  mapTourToSearchDocument,
} from "./tourSearch.js";

let cachedClient;
let cachedClientKey = "";

const isTrue = (value) => String(value ?? "").trim().toLowerCase() === "true";

export const isTourSearchEnabled = () => isTrue(process.env.MEILISEARCH_ENABLED);

export const getTourSearchIndexUid = () => process.env.MEILISEARCH_INDEX || "tours";

export const getTourSearchClient = () => {
  const host = String(process.env.MEILISEARCH_HOST ?? "").trim();
  const apiKey = String(process.env.MEILISEARCH_API_KEY ?? "").trim();
  const cacheKey = `${host}::${apiKey}`;

  if (!host) {
    throw new Error("Missing MEILISEARCH_HOST");
  }

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new Meilisearch({ host, apiKey: apiKey || undefined });
    cachedClientKey = cacheKey;
  }

  return cachedClient;
};

export const getTourSearchIndex = () =>
  getTourSearchClient().index(getTourSearchIndexUid());

const waitForTask = async (task) => {
  if (!task?.taskUid) return task;
  return getTourSearchClient().tasks.waitForTask(task.taskUid);
};

const ensureTourSearchIndex = async () => {
  const client = getTourSearchClient();
  const indexUid = getTourSearchIndexUid();

  try {
    await client.getRawIndex(indexUid);
  } catch (error) {
    if (error?.code !== "index_not_found" && error?.status !== 404) {
      throw error;
    }

    await waitForTask(await client.createIndex(indexUid, { primaryKey: "id" }));
  }

  return client.index(indexUid);
};

export const configureTourSearchIndex = async () => {
  const index = await ensureTourSearchIndex();

  await waitForTask(
    await index.updateSearchableAttributes(TOUR_SEARCH_INDEX_SETTINGS.searchableAttributes)
  );
  await waitForTask(
    await index.updateFilterableAttributes(TOUR_SEARCH_INDEX_SETTINGS.filterableAttributes)
  );
  await waitForTask(
    await index.updateSortableAttributes(TOUR_SEARCH_INDEX_SETTINGS.sortableAttributes)
  );

  return index;
};

export const upsertToursInSearchIndex = async (tours) => {
  if (!Array.isArray(tours) || tours.length === 0) return false;

  const index = await configureTourSearchIndex();
  const documents = tours.map(mapTourToSearchDocument);
  await waitForTask(await index.addDocuments(documents, { primaryKey: "id" }));
  return true;
};

export const searchToursWithMeili = async (parsedQuery) => {
  const index = await configureTourSearchIndex();
  const request = buildMeiliSearchRequest(parsedQuery);
  return index.search(request.q, request.options);
};

export const loadActiveToursForIndexing = () =>
  Tour.find({
    status: "Active",
    is_deleted: { $ne: true },
  }).lean();

export const reindexAllToursInSearchIndex = async () => {
  const tours = await loadActiveToursForIndexing();
  const index = await configureTourSearchIndex();

  await waitForTask(await index.deleteAllDocuments());
  if (tours.length > 0) {
    await waitForTask(
      await index.addDocuments(tours.map(mapTourToSearchDocument), { primaryKey: "id" })
    );
  }

  return { indexedCount: tours.length, indexUid: getTourSearchIndexUid() };
};
