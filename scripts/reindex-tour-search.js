import "dotenv/config";

import connectDB from "../config/db.js";
import { reindexAllToursInSearchIndex } from "../utils/tourSearchIndex.js";

async function main() {
  await connectDB();
  const result = await reindexAllToursInSearchIndex();
  console.log(
    `[tour-search] Indexed ${result.indexedCount} active tours into "${result.indexUid}".`
  );
}

main().catch((error) => {
  console.error("[tour-search] Reindex failed:", error);
  process.exitCode = 1;
});
