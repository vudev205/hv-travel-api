/**
 * Copy the current HV-Travel database into a local recommendation demo database.
 *
 * Safe defaults:
 * - DRY_RUN defaults to true.
 * - Target defaults to local MongoDB: mongodb://127.0.0.1:27017
 * - Target database defaults to HV-Travel-Recommendation-Demo.
 *
 * Preview:
 *   node scripts/recommendation-copy-db.js
 *
 * Write:
 *   $env:DRY_RUN="false"
 *   $env:CONFIRM_OVERWRITE="true"
 *   node scripts/recommendation-copy-db.js
 */

import dotenv from "dotenv/config";
import mongoose from "mongoose";

const DRY_RUN = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const SOURCE_MONGO_URI = process.env.SOURCE_MONGO_URI || process.env.MONGO_URI;
const SOURCE_DB_NAME = process.env.SOURCE_DB_NAME || "HV-Travel";
const TARGET_MONGO_URI = process.env.TARGET_MONGO_URI || "mongodb://127.0.0.1:27017";
const TARGET_DB_NAME = process.env.TARGET_DB_NAME || "HV-Travel-Recommendation-Demo";
const CONFIRM_OVERWRITE = String(process.env.CONFIRM_OVERWRITE ?? "false").toLowerCase() === "true";
const COLLECTION_FILTER = (process.env.COPY_COLLECTIONS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const BATCH_SIZE = 500;

async function connect(uri, dbName) {
  const connection = mongoose.createConnection(uri, { dbName });
  await connection.asPromise();
  return connection;
}

async function getCollections(db) {
  const collections = await db.listCollections().toArray();
  return collections
    .map((item) => item.name)
    .filter((name) => !name.startsWith("system."))
    .filter((name) => COLLECTION_FILTER.length === 0 || COLLECTION_FILTER.includes(name))
    .sort();
}

async function copyIndexes(sourceDb, targetDb, collectionName) {
  const indexes = await sourceDb.collection(collectionName).indexes();
  const customIndexes = indexes
    .filter((index) => index.name !== "_id_")
    .map((index) => {
      const { key, name, v, ns, ...options } = index;
      return { key, name, ...options };
    });

  if (customIndexes.length === 0) return 0;
  await targetDb.collection(collectionName).createIndexes(customIndexes);
  return customIndexes.length;
}

async function copyCollection(sourceDb, targetDb, collectionName) {
  const sourceCollection = sourceDb.collection(collectionName);
  const sourceCount = await sourceCollection.countDocuments({});
  const targetCollection = targetDb ? targetDb.collection(collectionName) : null;
  const targetCount = targetCollection ? await targetCollection.countDocuments({}).catch(() => 0) : null;

  if (DRY_RUN) {
    return { collectionName, sourceCount, targetCount, copied: 0, indexes: 0, skipped: true };
  }

  if (!targetCollection) {
    throw new Error("Target database is not connected");
  }

  if (targetCount > 0 && !CONFIRM_OVERWRITE) {
    throw new Error(
      `Target collection ${collectionName} already has ${targetCount} documents. Set CONFIRM_OVERWRITE=true to replace it.`
    );
  }

  if (targetCount > 0) {
    await targetCollection.deleteMany({});
  }

  let copied = 0;
  let batch = [];
  const cursor = sourceCollection.find({});

  for await (const document of cursor) {
    batch.push(document);
    if (batch.length >= BATCH_SIZE) {
      await targetCollection.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await targetCollection.insertMany(batch, { ordered: false });
    copied += batch.length;
  }

  const indexes = await copyIndexes(sourceDb, targetDb, collectionName);
  return { collectionName, sourceCount, targetCount, copied, indexes, skipped: false };
}

async function main() {
  if (!SOURCE_MONGO_URI) {
    throw new Error("Missing SOURCE_MONGO_URI or MONGO_URI");
  }

  const sourceConnection = await connect(SOURCE_MONGO_URI, SOURCE_DB_NAME);
  let targetConnection = null;

  try {
    targetConnection = await connect(TARGET_MONGO_URI, TARGET_DB_NAME);
  } catch (error) {
    if (!DRY_RUN) throw error;
    console.warn(`Target DB is not reachable in preview mode: ${error.message}`);
  }

  try {
    const sourceDb = sourceConnection.db;
    const targetDb = targetConnection?.db ?? null;
    const collections = await getCollections(sourceDb);
    const results = [];

    for (const collectionName of collections) {
      results.push(await copyCollection(sourceDb, targetDb, collectionName));
    }

    console.log(DRY_RUN ? "Recommendation DB copy preview completed" : "Recommendation DB copy completed");
    console.log(`Mode: ${DRY_RUN ? "DRY_RUN" : "WRITE"}`);
    console.log(`Source DB: ${SOURCE_DB_NAME}`);
    console.log(`Target DB: ${TARGET_DB_NAME}`);
    console.table(
      results.map((item) => ({
        collection: item.collectionName,
        source: item.sourceCount,
        targetBefore: item.targetCount,
        copied: item.copied,
        indexes: item.indexes,
        skipped: item.skipped,
      }))
    );
  } finally {
    await sourceConnection.close();
    if (targetConnection) {
      await targetConnection.close();
    }
  }
}

main().catch((error) => {
  console.error("Recommendation DB copy failed:", error);
  process.exit(1);
});
