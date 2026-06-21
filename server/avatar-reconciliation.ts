import { db } from "./db";
import { users } from "@shared/models/auth";
import { ObjectStorageService } from "./replit_integrations/object_storage";

export interface AvatarReconcileResult {
  scanned: number;
  live: number;
  orphans: number;
  removed: number;
  skippedRecent: number;
}

export interface ReconcileOptions {
  // Objects whose storage `timeCreated` is newer than this many milliseconds are
  // left alone, even if no live user references them. This closes the race where
  // a file is uploaded via the presigned URL but the claim step
  // (PUT /api/account/profile-image) hasn't completed yet — without it the sweep
  // could delete a brand-new, about-to-be-claimed avatar.
  gracePeriodMs?: number;
  // Injectable clock for testing.
  now?: () => number;
  // When true, report what would be removed without deleting anything. Lets
  // admins preview the impact before committing to an irreversible sweep.
  dryRun?: boolean;
}

// Default grace period: ignore objects younger than one hour. Overridable per
// call, or via the AVATAR_RECONCILE_GRACE_MS env var (milliseconds).
export const DEFAULT_AVATAR_GRACE_PERIOD_MS = 60 * 60 * 1000;

function resolveGracePeriodMs(explicit?: number): number {
  if (typeof explicit === "number" && explicit >= 0) {
    return explicit;
  }
  const fromEnv = Number(process.env.AVATAR_RECONCILE_GRACE_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return fromEnv;
  }
  return DEFAULT_AVATAR_GRACE_PERIOD_MS;
}

// Reconciles uploaded avatar objects in object storage against the avatars that
// live users still reference. Avatar cleanup on the user-facing paths (account
// deletion, photo replace/clear) is intentionally best-effort, so a transient
// storage outage can permanently orphan a file with no retry. This job is the
// safety net: it lists every object under `uploads/<userId>/`, compares it
// against the current set of `customImageUrl` values, and deletes only objects
// that no longer back any live user.
//
// It is idempotent (re-running with no new orphans removes nothing) and never
// deletes an object that is still referenced by a current user.
export async function reconcileOrphanedAvatars(
  options: ReconcileOptions = {},
): Promise<AvatarReconcileResult> {
  const objectStorageService = new ObjectStorageService();
  const gracePeriodMs = resolveGracePeriodMs(options.gracePeriodMs);
  const nowMs = (options.now ?? Date.now)();

  // Build the set of avatar paths still in use, normalized to the same
  // `/objects/...` form the storage listing returns so comparison is exact.
  const rows = await db
    .select({ customImageUrl: users.customImageUrl })
    .from(users);
  const liveAvatars = new Set<string>();
  for (const row of rows) {
    if (row.customImageUrl) {
      liveAvatars.add(
        objectStorageService.normalizeObjectEntityPath(row.customImageUrl),
      );
    }
  }

  const storedAvatars = await objectStorageService.listUploadedAvatarPaths();
  const orphans = storedAvatars.filter(
    (obj) => !liveAvatars.has(obj.path),
  );

  let removed = 0;
  let skippedRecent = 0;
  for (const obj of orphans) {
    // Skip objects that were created within the grace period: they may be a
    // freshly uploaded avatar whose claim step hasn't completed yet. A null
    // creation time means storage didn't report one, so we treat the age as
    // unknown and fall through to deletion (the object is still an orphan).
    if (
      gracePeriodMs > 0 &&
      obj.timeCreated &&
      nowMs - obj.timeCreated.getTime() < gracePeriodMs
    ) {
      skippedRecent += 1;
      continue;
    }
    // Dry run: count what would be removed without touching storage.
    if (options.dryRun) {
      removed += 1;
      continue;
    }
    try {
      const deleted = await objectStorageService.deleteObjectEntity(obj.path);
      if (deleted) {
        removed += 1;
      }
    } catch (err) {
      // Log and continue: one stubborn object should not abort the whole sweep,
      // and the next run will retry it (idempotent).
      console.error(
        `[avatar-reconcile] failed to delete orphaned avatar ${obj.path}:`,
        err,
      );
    }
  }

  const result: AvatarReconcileResult = {
    scanned: storedAvatars.length,
    live: liveAvatars.size,
    orphans: orphans.length,
    removed,
    skippedRecent,
  };
  console.log(
    `[avatar-reconcile]${options.dryRun ? " (dry-run)" : ""} ` +
      `scanned=${result.scanned} live=${result.live} ` +
      `orphans=${result.orphans} ` +
      `${options.dryRun ? "wouldRemove" : "removed"}=${result.removed} ` +
      `skippedRecent=${result.skippedRecent}`,
  );
  return result;
}
