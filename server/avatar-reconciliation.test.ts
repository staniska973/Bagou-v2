import { db } from "./db";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { reconcileOrphanedAvatars } from "./avatar-reconciliation";

/**
 * Regression spec for the orphaned-avatar reconciliation job. No test runner is
 * configured in this project, so this is a self-contained assertion script
 * runnable with: `tsx server/avatar-reconciliation.test.ts`. It exits non-zero
 * if any case fails so it can gate the behaviour against regressions.
 *
 * The real reconcile logic runs; only the two external seams are mocked:
 *   - `db.select(...).from(users)` is stubbed to return a chosen set of live
 *     `customImageUrl` values, so no Postgres is touched.
 *   - `ObjectStorageService.prototype.listUploadedAvatarPaths` and
 *     `deleteObjectEntity` are stubbed so no real bucket is touched; the second
 *     records which paths the job asked storage to remove.
 *
 * The guarantees asserted here:
 *   1. Objects that no longer back any live user's avatar are deleted.
 *   2. Objects still referenced by a live user are NEVER deleted.
 *   3. Full-URL `customImageUrl` values are normalized before comparison, so a
 *      stored avatar is matched even when the DB holds the storage.googleapis.com
 *      form.
 *   4. The job is idempotent: a second run with no orphans deletes nothing.
 *   5. A delete failure on one object does not abort the sweep; remaining
 *      orphans are still removed and `removed` reflects only the successes.
 */

const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "/test-bucket/.private";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// ---- Mocked seams ----------------------------------------------------------

// Stub db.select().from(users) -> [{ customImageUrl }, ...]
let liveRows: Array<{ customImageUrl: string | null }> = [];
(db as any).select = (_cols?: unknown) => ({
  from: async (_table: unknown) => liveRows,
});

let storedPaths: string[] = [];
ObjectStorageService.prototype.listUploadedAvatarPaths = async function () {
  return storedPaths.slice();
};

let deleteCalls: string[] = [];
let failDeleteFor: Set<string> = new Set();
ObjectStorageService.prototype.deleteObjectEntity = async function (
  objectPath: string,
) {
  deleteCalls.push(objectPath);
  if (failDeleteFor.has(objectPath)) {
    throw new Error("simulated storage outage");
  }
  return true;
};

// Keep the REAL normalization logic so case 3 exercises it for real.

function reset() {
  liveRows = [];
  storedPaths = [];
  deleteCalls = [];
  failDeleteFor = new Set();
}

async function run() {
  // Case 1 + 2: delete orphans, keep referenced objects.
  reset();
  const live = "/objects/uploads/userA/keep-1";
  const orphan = "/objects/uploads/userB/orphan-1";
  liveRows = [{ customImageUrl: live }];
  storedPaths = [live, orphan];
  let result = await reconcileOrphanedAvatars();
  assert(deleteCalls.includes(orphan), "orphan object should be deleted");
  assert(!deleteCalls.includes(live), "live-referenced object must NOT be deleted");
  assert(result.removed === 1, `removed should be 1, got ${result.removed}`);
  assert(result.orphans === 1, `orphans should be 1, got ${result.orphans}`);
  assert(result.scanned === 2, `scanned should be 2, got ${result.scanned}`);

  // Case 3: full-URL customImageUrl is normalized before comparison.
  reset();
  const storedEntity = "/objects/uploads/userC/avatar-9";
  const fullUrl = `https://storage.googleapis.com${PRIVATE_DIR}/uploads/userC/avatar-9?X-Goog-Signature=x`;
  liveRows = [{ customImageUrl: fullUrl }];
  storedPaths = [storedEntity];
  result = await reconcileOrphanedAvatars();
  assert(
    deleteCalls.length === 0,
    `full-URL avatar should be matched & kept, deleted ${deleteCalls.length}`,
  );
  assert(result.removed === 0, "nothing should be removed when all referenced");

  // Case 4: idempotent — re-run with no orphans deletes nothing.
  reset();
  liveRows = [{ customImageUrl: live }];
  storedPaths = [live];
  result = await reconcileOrphanedAvatars();
  assert(deleteCalls.length === 0, "idempotent run should delete nothing");
  assert(result.orphans === 0, "no orphans on a clean run");

  // Case 5: a delete failure does not abort the sweep.
  reset();
  const orphan1 = "/objects/uploads/userD/orphan-a";
  const orphan2 = "/objects/uploads/userD/orphan-b";
  liveRows = [];
  storedPaths = [orphan1, orphan2];
  failDeleteFor = new Set([orphan1]);
  result = await reconcileOrphanedAvatars();
  assert(
    deleteCalls.includes(orphan1) && deleteCalls.includes(orphan2),
    "both orphans should be attempted even when one fails",
  );
  assert(
    result.removed === 1,
    `removed should count only the success, got ${result.removed}`,
  );
  assert(result.orphans === 2, `orphans should be 2, got ${result.orphans}`);

  // Case 6: null customImageUrl values are ignored (treated as no avatar).
  reset();
  const onlyOrphan = "/objects/uploads/userE/orphan-x";
  liveRows = [{ customImageUrl: null }, { customImageUrl: null }];
  storedPaths = [onlyOrphan];
  result = await reconcileOrphanedAvatars();
  assert(deleteCalls.includes(onlyOrphan), "object should be orphan when no live avatars");
  assert(result.live === 0, `live should be 0 with all-null rows, got ${result.live}`);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("avatar-reconciliation.test.ts: all assertions passed.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Unexpected error in avatar-reconciliation test:", err);
  process.exit(1);
});
