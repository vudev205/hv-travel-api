/**
 * Emergency MongoDB Restore Script (HV-Travel API)
 * - Verifies SHA-256 checksum before touching database
 * - Defaults to DRY-RUN mode so you cannot accidentally overwrite production data
 * - Automatically skips overwriting AuditLogs unless --include-audit is specified
 *
 * Usage:
 *   Preview (Dry-Run):
 *     node scripts/restore-db.js --file backups/hvtravel_api_backup_XXXX.ejson.gz
 *
 *   Actual Restore:
 *     node scripts/restore-db.js --file backups/hvtravel_api_backup_XXXX.ejson.gz --confirm
 */

import dotenv from "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { EJSON } from "bson";

const gunzipAsync = promisify(zlib.gunzip);

function parseArgs(argv) {
  const args = { file: null, confirm: false, includeAudit: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) {
      args.file = argv[++i];
    } else if (argv[i] === "--confirm") {
      args.confirm = true;
    } else if (argv[i] === "--include-audit") {
      args.includeAudit = true;
    }
  }
  return args;
}

async function runRestore() {
  const { file, confirm, includeAudit } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("Usage: node scripts/restore-db.js --file <backup.ejson.gz> [--confirm]");
    process.exit(1);
  }

  const MONGO_URI = process.env.MONGO_URI;
  const DB_NAME = process.env.MONGO_DB_NAME || "HV-Travel";
  if (!MONGO_URI) throw new Error("Missing MONGO_URI environment variable.");

  const filePath = path.resolve(file);
  const compressed = await fs.readFile(filePath);
  const actualSha = crypto.createHash("sha256").update(compressed).digest("hex");

  // Verify SHA-256 sidecar if present
  try {
    const expectedLine = (await fs.readFile(`${filePath}.sha256`, "utf8")).trim();
    const expectedSha = expectedLine.split(/\s+/)[0];
    if (expectedSha.toLowerCase() !== actualSha.toLowerCase()) {
      throw new Error(`SHA-256 mismatch! Expected ${expectedSha}, got ${actualSha}. Restore aborted.`);
    }
    console.log(`[VERIFY] SHA-256 checksum verified: ${actualSha}`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.warn("[WARN] No .sha256 checksum sidecar found. Proceeding with caution.");
  }

  const rawJson = (await gunzipAsync(compressed)).toString("utf8");
  const snapshot = EJSON.parse(rawJson, { relaxed: false });
  const collectionNames = Object.keys(snapshot.collections || {});

  console.log(`\nSnapshot created : ${snapshot.createdAtUtc}`);
  console.log(`Source database  : ${snapshot.database}`);
  console.log(`Target database  : ${DB_NAME}`);
  console.log(`Collections      : ${collectionNames.length}`);
  console.log(`Mode             : ${confirm ? "LIVE RESTORE (OVERWRITE)" : "DRY-RUN (preview only)"}\n`);

  for (const name of collectionNames) {
    const entry = snapshot.collections[name];
    console.log(`  - ${name}: ${entry.count} documents, ${(entry.indexes || []).length} indexes`);
  }

  if (!confirm) {
    console.log("\n[DRY-RUN COMPLETE] No database changes were made. Re-run with --confirm to execute restore.");
    return;
  }

  const conn = await mongoose.createConnection(MONGO_URI, { dbName: DB_NAME }).asPromise();
  try {
    const db = conn.db;
    let restoredDocs = 0;

    for (const name of collectionNames) {
      if (!includeAudit && name.toLowerCase() === "auditlogs") {
        console.log(`  [SKIP] Preserving existing AuditLogs collection`);
        continue;
      }

      const entry = snapshot.collections[name];
      const col = db.collection(name);
      await col.deleteMany({});

      const docs = entry.documents || [];
      const BATCH_SIZE = 500;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        await col.insertMany(docs.slice(i, i + BATCH_SIZE), { ordered: false });
      }
      restoredDocs += docs.length;

      for (const idx of entry.indexes || []) {
        try {
          const { key, v, ns, ...options } = idx;
          await col.createIndex(key, options);
        } catch {
          // Ignore equivalent existing index
        }
      }
      console.log(`  [RESTORED] ${name}: ${docs.length} documents`);
    }

    console.log(`\n[RESTORE SUCCESS] Restored ${restoredDocs} documents into '${DB_NAME}'.`);
  } finally {
    await conn.close();
  }
}

runRestore().catch((err) => {
  console.error("[RESTORE FAILED]", err.message);
  process.exit(1);
});
