import { db } from "./db";
import {
  ObjectStorageService,
  UploadedAvatarObject,
} from "./replit_integrations/object_storage";
import {
  reconcileOrphanedAvatars,
  DEFAULT_AVATAR_GRACE_PERIOD_MS,
} from "./avatar-reconciliation";

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
 *   6. Objects newer than the grace period are skipped (never deleted) even when
 *      they are orphans, closing the upload-then-claim race; objects older than
 *      the grace period, and those with an unknown (null) creation time, are
 *      still deleted.
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

// `storedObjects` holds the full {path,timeCreated} shape the real method now
// returns. `storedPaths` is a convenience setter used by the older cases that
// don't care about age: assigning it backfills `storedObjects` with a
// creation time well past any grace period so those objects are eligible for
// deletion.
let storedObjects: UploadedAvatarObject[] = [];
function setStoredPaths(paths: string[]) {
  const ancient = new Date(0); // 1970 — far older than any grace period
  storedObjects = paths.map((path) => ({ path, timeCreated: ancient }));
}
ObjectStorageService.prototype.listUploadedAvatarPaths = async function () {
  return storedObjects.slice();
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
  setStoredPaths([]);
  deleteCalls = [];
  failDeleteFor = new Set();
}

async function run() {
  // Case 1 + 2: delete orphans, keep referenced objects.
  reset();
  const live = "/objects/uploads/userA/keep-1";
  const orphan = "/objects/uploads/userB/orphan-1";
  liveRows = [{ customImageUrl: live }];
  setStoredPaths([live, orphan]);
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
  setStoredPaths([storedEntity]);
  result = await reconcileOrphanedAvatars();
  assert(
    deleteCalls.length === 0,
    `full-URL avatar should be matched & kept, deleted ${deleteCalls.length}`,
  );
  assert(result.removed === 0, "nothing should be removed when all referenced");

  // Case 4: idempotent — re-run with no orphans deletes nothing.
  reset();
  liveRows = [{ customImageUrl: live }];
  setStoredPaths([live]);
  result = await reconcileOrphanedAvatars();
  assert(deleteCalls.length === 0, "idempotent run should delete nothing");
  assert(result.orphans === 0, "no orphans on a clean run");

  // Case 5: a delete failure does not abort the sweep.
  reset();
  const orphan1 = "/objects/uploads/userD/orphan-a";
  const orphan2 = "/objects/uploads/userD/orphan-b";
  liveRows = [];
  setStoredPaths([orphan1, orphan2]);
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
  setStoredPaths([onlyOrphan]);
  result = await reconcileOrphanedAvatars();
  assert(deleteCalls.includes(onlyOrphan), "object should be orphan when no live avatars");
  assert(result.live === 0, `live should be 0 with all-null rows, got ${result.live}`);

  // Case 7: an orphan newer than the grace period is skipped, while an older
  // orphan in the same sweep is still deleted. Uses a fixed `now` so the test
  // is deterministic.
  reset();
  const NOW = 10_000_000_000_000; // fixed clock
  const fresh = "/objects/uploads/userF/just-uploaded";
  const old = "/objects/uploads/userF/long-ago";
  liveRows = [];
  storedObjects = [
    // 1 minute old — inside the 1-hour default grace period.
    { path: fresh, timeCreated: new Date(NOW - 60 * 1000) },
    // 2 hours old — well outside the grace period.
    { path: old, timeCreated: new Date(NOW - 2 * 60 * 60 * 1000) },
  ];
  result = await reconcileOrphanedAvatars({ now: () => NOW });
  assert(
    !deleteCalls.includes(fresh),
    "freshly uploaded orphan must NOT be deleted within the grace period",
  );
  assert(deleteCalls.includes(old), "old orphan should still be deleted");
  assert(
    result.skippedRecent === 1,
    `skippedRecent should be 1, got ${result.skippedRecent}`,
  );
  assert(result.removed === 1, `removed should be 1, got ${result.removed}`);
  assert(result.orphans === 2, `orphans should be 2, got ${result.orphans}`);

  // Case 8: an object whose creation time is unknown (null) is treated as an
  // ordinary orphan and deleted — we don't let missing metadata block cleanup.
  reset();
  const unknownAge = "/objects/uploads/userG/no-metadata";
  liveRows = [];
  storedObjects = [{ path: unknownAge, timeCreated: null }];
  result = await reconcileOrphanedAvatars({ now: () => NOW });
  assert(
    deleteCalls.includes(unknownAge),
    "orphan with unknown creation time should be deleted",
  );
  assert(result.skippedRecent === 0, "nothing should be skipped for null time");

  // Case 9: an explicit gracePeriodMs override is honored over the default.
  reset();
  const recentlyUploaded = "/objects/uploads/userH/recent";
  liveRows = [];
  storedObjects = [
    { path: recentlyUploaded, timeCreated: new Date(NOW - 30 * 60 * 1000) }, // 30 min old
  ];
  // With a 1-hour grace period this would be skipped; force a tiny grace period
  // so it becomes eligible for deletion.
  result = await reconcileOrphanedAvatars({
    now: () => NOW,
    gracePeriodMs: 1000,
  });
  assert(
    deleteCalls.includes(recentlyUploaded),
    "override grace period should make a 30-min-old orphan deletable",
  );
  assert(
    DEFAULT_AVATAR_GRACE_PERIOD_MS === 60 * 60 * 1000,
    "default grace period should be one hour",
  );

  // Case 10: dry-run preview NEVER deletes. This is the core guard behind the
  // admin confirmation/preview flow: { dryRun: true } must report what WOULD be
  // removed (the orphan count) without calling deleteObjectEntity at all.
  reset();
  const dryLive = "/objects/uploads/userI/keep";
  const dryOrphan1 = "/objects/uploads/userI/orphan-1";
  const dryOrphan2 = "/objects/uploads/userI/orphan-2";
  liveRows = [{ customImageUrl: dryLive }];
  setStoredPaths([dryLive, dryOrphan1, dryOrphan2]);
  result = await reconcileOrphanedAvatars({ dryRun: true });
  assert(
    deleteCalls.length === 0,
    `dry-run must NOT delete anything, got ${deleteCalls.length} delete call(s)`,
  );
  assert(
    result.removed === 2,
    `dry-run removed should report would-remove count (2), got ${result.removed}`,
  );
  assert(result.orphans === 2, `dry-run orphans should be 2, got ${result.orphans}`);
  assert(result.scanned === 3, `dry-run scanned should be 3, got ${result.scanned}`);
  assert(result.live === 1, `dry-run live should be 1, got ${result.live}`);

  // Case 11: dry-run still honors the grace period — a freshly uploaded orphan
  // is counted as skippedRecent (not as would-remove) and nothing is deleted.
  reset();
  const dryFresh = "/objects/uploads/userJ/just-uploaded";
  const dryOld = "/objects/uploads/userJ/long-ago";
  liveRows = [];
  storedObjects = [
    { path: dryFresh, timeCreated: new Date(NOW - 60 * 1000) }, // 1 min old
    { path: dryOld, timeCreated: new Date(NOW - 2 * 60 * 60 * 1000) }, // 2h old
  ];
  result = await reconcileOrphanedAvatars({ dryRun: true, now: () => NOW });
  assert(
    deleteCalls.length === 0,
    `dry-run with grace period must NOT delete, got ${deleteCalls.length}`,
  );
  assert(
    result.skippedRecent === 1,
    `dry-run skippedRecent should be 1, got ${result.skippedRecent}`,
  );
  assert(
    result.removed === 1,
    `dry-run should report only the old orphan as would-remove (1), got ${result.removed}`,
  );

  // Case 12: { dryRun: false } performs deletion exactly as the default does —
  // the preview flag is the only thing gating the irreversible delete.
  reset();
  const wetOrphan = "/objects/uploads/userK/orphan";
  liveRows = [];
  setStoredPaths([wetOrphan]);
  result = await reconcileOrphanedAvatars({ dryRun: false });
  assert(
    deleteCalls.includes(wetOrphan),
    "dryRun:false must actually delete the orphan",
  );
  assert(
    result.removed === 1,
    `dryRun:false removed should be 1, got ${result.removed}`,
  );

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
