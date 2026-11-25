/**
 * Automated MongoDB Backup Script (HV-Travel API)
 * - Exports every non-system collection using MongoDB EJSON (preserves ObjectId, Date, Decimal128)
 * - Compresses snapshot with gzip (.json.gz) + writes SHA-256 integrity checksum (.sha256)
 * - Enforces retention cleanup (keeps newest N backups, default 14)
 *
 * Usage:
 *   npm run db:backup
 *   BACKUP_DIR="D:/HVTravelBackups" BACKUP_RETENTION=30 node scripts/backup-db.js
 */

import dotenv from "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { EJSON } from "bson";

const gzipAsync = promisify(zlib.gzip);

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "HV-Travel";
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
const RETENTION_COUNT = Math.max(1, parseInt(process.env.BACKUP_RETENTION || "14", 10));

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "_" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "_UTC"
  );
}

async function runBackup() {
  if (!MONGO_URI) {
    throw new Error("Missing MONGO_URI environment variable.");
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const conn = await mongoose.createConnection(MONGO_URI, { dbName: DB_NAME }).asPromise();
  try {
    const db = conn.db;
    const collections = (await db.listCollections().toArray())
      .map((c) => c.name)
      .filter((name) => !name.startsWith("system."))
      .sort();

    const snapshot = {
      version: 1,
      database: DB_NAME,
      createdAtUtc: new Date().toISOString(),
      collections: {},
    };

    let totalDocuments = 0;

    for (const name of collections) {
      const col = db.collection(name);
      const docs = await col.find({}).toArray();
      const rawIndexes = await col.indexes();
      const customIndexes = rawIndexes.filter((idx) => idx.name !== "_id_");

      snapshot.collections[name] = {
        count: docs.length,
        indexes: customIndexes,
        documents: docs,
      };
      totalDocuments += docs.length;
      console.log(`  [OK] ${name}: ${docs.length} documents, ${customIndexes.length} custom indexes`);
    }

    const serialized = EJSON.stringify(snapshot, { relaxed: false });
    const compressed = await gzipAsync(Buffer.from(serialized, "utf8"), { level: 9 });
    const checksum = crypto.createHash("sha256").update(compressed).digest("hex");

    const fileName = `hvtravel_api_backup_${formatTimestamp(new Date())}.ejson.gz`;
    const filePath = path.join(BACKUP_DIR, fileName);

    await fs.writeFile(filePath, compressed);
    await fs.writeFile(`${filePath}.sha256`, `${checksum}  ${fileName}\n`, "utf8");

    console.log(`\n[BACKUP SUCCESS]`);
    console.log(`  File     : ${filePath}`);
    console.log(`  Size     : ${(compressed.length / 1024).toFixed(1)} KB`);
    console.log(`  Total    : ${collections.length} collections, ${totalDocuments} documents`);
    console.log(`  SHA-256  : ${checksum}`);

    // Retention policy cleanup
    const entries = await fs.readdir(BACKUP_DIR);
    const backups = entries
      .filter((f) => f.startsWith("hvtravel_api_backup_") && f.endsWith(".ejson.gz"))
      .sort()
      .reverse();

    const stale = backups.slice(RETENTION_COUNT);
    for (const oldFile of stale) {
      await fs.rm(path.join(BACKUP_DIR, oldFile), { force: true });
      await fs.rm(path.join(BACKUP_DIR, `${oldFile}.sha256`), { force: true });
      console.log(`  [RETENTION] Removed old backup: ${oldFile}`);
    }
  } finally {
    await conn.close();
  }
}

runBackup().catch((err) => {
  console.error("[BACKUP FAILED]", err.message);
  process.exit(1);
});
