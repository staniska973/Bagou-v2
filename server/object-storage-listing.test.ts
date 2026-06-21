// Ensure the private object dir is set before the service reads it. The real
// listUploadedAvatarPaths() calls getPrivateObjectDir(), which throws if unset.
process.env.PRIVATE_OBJECT_DIR = process.env.PRIVATE_OBJECT_DIR || "/test-bucket/.private";

import type { File } from "@google-cloud/storage";
import {
  ObjectStorageService,
  objectStorageClient,
} from "./replit_integrations/object_storage";

/**
 * Regression spec for ObjectStorageService.listUploadedAvatarPaths().
 *
 * No test runner is configured in this project, so this is a self-contained
 * assertion script runnable with: `tsx server/object-storage-listing.test.ts`.
 * It exits non-zero if any case fails so it can gate the behaviour against
 * regressions.
 *
 * The grace period that protects freshly uploaded avatars (see
 * avatar-reconciliation.ts) depends ENTIRELY on this method turning each
 * object's raw `metadata.timeCreated` into a correct Date — and yielding null
 * (not a bogus date) when that metadata is missing or malformed. The
 * reconciliation tests mock this method out, so without this spec the real
 * parsing logic has no coverage: if it silently regressed to always return
 * null, every recently uploaded photo would become eligible for deletion and
 * the upload-then-claim race would come back.
 *
 * The only mocked seam is the GCS listing call: `objectStorageClient.bucket()`
 * is stubbed to return a fake bucket whose `getFiles()` yields fake File
 * objects carrying the metadata shape the real method reads. All of the parsing
 * and filtering logic under test runs for real.
 */

const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR as string;
// parseObjectPath("/test-bucket/.private/") -> bucket "test-bucket", prefix ".private/"
const PRIVATE_PREFIX = PRIVATE_DIR.split("/").slice(2).join("/") + "/";
const UPLOADS_PREFIX = `${PRIVATE_PREFIX}uploads/`;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// ---- Mocked GCS seam -------------------------------------------------------

// A minimal stand-in for a GCS File: only the surface listUploadedAvatarPaths
// reads (`name` and `metadata.timeCreated`).
function makeFakeFile(name: string, timeCreated?: unknown): File {
  return {
    name,
    metadata: timeCreated === undefined ? {} : { timeCreated },
  } as unknown as File;
}

// `listedFiles` is the array the stubbed getFiles() returns; each case sets it.
let listedFiles: File[] = [];
let lastPrefix: string | undefined;

(objectStorageClient as any).bucket = (_name: string) => ({
  getFiles: async (opts?: { prefix?: string }) => {
    lastPrefix = opts?.prefix;
    return [listedFiles];
  },
});

// ---- Test cases ------------------------------------------------------------

async function run() {
  const service = new ObjectStorageService();

  // Case 1: a valid metadata.timeCreated string is parsed into a Date.
  {
    listedFiles = [
      makeFakeFile(`${UPLOADS_PREFIX}userA/avatar-1`, "2026-06-21T10:30:00.000Z"),
    ];
    const result = await service.listUploadedAvatarPaths();
    assert(result.length === 1, `expected 1 object, got ${result.length}`);
    assert(
      result[0].path === "/objects/uploads/userA/avatar-1",
      `path should be normalized, got ${result[0]?.path}`,
    );
    assert(
      result[0].timeCreated instanceof Date,
      "valid timeCreated should parse to a Date",
    );
    assert(
      result[0].timeCreated?.toISOString() === "2026-06-21T10:30:00.000Z",
      `parsed date should match the source string, got ${result[0].timeCreated?.toISOString()}`,
    );
    assert(
      lastPrefix === UPLOADS_PREFIX,
      `getFiles should be scoped to the uploads/ prefix, got ${lastPrefix}`,
    );
  }

  // Case 2: a missing timeCreated yields null (not a bogus date).
  {
    listedFiles = [makeFakeFile(`${UPLOADS_PREFIX}userB/avatar-2`)];
    const result = await service.listUploadedAvatarPaths();
    assert(result.length === 1, `expected 1 object, got ${result.length}`);
    assert(
      result[0].timeCreated === null,
      `missing timeCreated should be null, got ${String(result[0].timeCreated)}`,
    );
  }

  // Case 3: an invalid/malformed timeCreated yields null (NOT an Invalid Date).
  {
    listedFiles = [
      makeFakeFile(`${UPLOADS_PREFIX}userC/avatar-3`, "not-a-real-date"),
    ];
    const result = await service.listUploadedAvatarPaths();
    assert(result.length === 1, `expected 1 object, got ${result.length}`);
    assert(
      result[0].timeCreated === null,
      `malformed timeCreated should be null, got ${String(result[0].timeCreated)}`,
    );
  }

  // Case 4: the folder-placeholder object (name === uploads prefix) is filtered.
  {
    listedFiles = [
      makeFakeFile(UPLOADS_PREFIX, "2026-06-21T10:30:00.000Z"), // placeholder
      makeFakeFile(`${UPLOADS_PREFIX}userD/avatar-4`, "2026-06-21T10:30:00.000Z"),
    ];
    const result = await service.listUploadedAvatarPaths();
    assert(
      result.length === 1,
      `placeholder should be filtered, expected 1 object, got ${result.length}`,
    );
    assert(
      result[0].path === "/objects/uploads/userD/avatar-4",
      `surviving object should be the real upload, got ${result[0]?.path}`,
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} object-storage listing case(s) failed.`);
    process.exit(1);
  }
  console.log("object-storage-listing.test.ts: all assertions passed.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Unexpected error in object-storage listing test:", err);
  process.exit(1);
});
