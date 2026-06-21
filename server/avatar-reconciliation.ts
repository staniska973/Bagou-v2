import { db } from "./db";
import { users } from "@shared/models/auth";
import { ObjectStorageService } from "./replit_integrations/object_storage";

export interface AvatarReconcileResult {
  scanned: number;
  live: number;
  orphans: number;
  removed: number;
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
export async function reconcileOrphanedAvatars(): Promise<AvatarReconcileResult> {
  const objectStorageService = new ObjectStorageService();

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
  const orphans = storedAvatars.filter((path) => !liveAvatars.has(path));

  let removed = 0;
  for (const path of orphans) {
    try {
      const deleted = await objectStorageService.deleteObjectEntity(path);
      if (deleted) {
        removed += 1;
      }
    } catch (err) {
      // Log and continue: one stubborn object should not abort the whole sweep,
      // and the next run will retry it (idempotent).
      console.error(
        `[avatar-reconcile] failed to delete orphaned avatar ${path}:`,
        err,
      );
    }
  }

  const result: AvatarReconcileResult = {
    scanned: storedAvatars.length,
    live: liveAvatars.size,
    orphans: orphans.length,
    removed,
  };
  console.log(
    `[avatar-reconcile] scanned=${result.scanned} live=${result.live} ` +
      `orphans=${result.orphans} removed=${result.removed}`,
  );
  return result;
}
