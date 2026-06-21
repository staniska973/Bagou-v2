import { Readable } from "stream";
import type { Response } from "express";
import { File } from "@google-cloud/storage";
import { ObjectStorageService } from "./replit_integrations/object_storage";

/**
 * Regression spec for the cache-header side of object serving.
 *
 * No test runner is configured in this project, so this is a self-contained
 * assertion script runnable with: `tsx server/object-cache-headers.test.ts`. It
 * exits non-zero if any case fails, so it can gate the flow against regressions.
 *
 * Unlike object-serving-acl.test.ts (which mocks downloadObject to focus on the
 * access decision), this exercises the REAL `downloadObject` so the actual
 * Cache-Control logic is covered. A private object must respond with a
 * `Cache-Control` containing `private` so shared caches / CDNs never store it
 * and hand it to the wrong user; a public object must respond with `public` so
 * avatars cache well.
 *
 * The only mocked seams are the two GCS surfaces downloadObject touches:
 *   - file.getMetadata(): returns contentType/size plus the ACL JSON in the
 *     custom metadata key (mirrors how a real object carries its ACL policy).
 *   - file.createReadStream(): returns an in-memory Readable so the response can
 *     complete without hitting the network.
 */

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

const OWNER = "owner-user";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// A minimal stand-in for a GCS File: only the surface downloadObject reads.
function makeFakeFile(visibility: "public" | "private"): File {
  return {
    name: "fake-object",
    async getMetadata() {
      return [
        {
          contentType: "image/png",
          size: "3",
          metadata: {
            [ACL_POLICY_METADATA_KEY]: JSON.stringify({
              owner: OWNER,
              visibility,
            }),
          },
        },
      ];
    },
    createReadStream() {
      return Readable.from([Buffer.from("img")]);
    },
  } as unknown as File;
}

// A minimal stand-in for an Express Response that captures the headers set and
// resolves once the streamed body has been fully written.
function makeFakeResponse(): { res: Response; headers: Record<string, string>; done: Promise<void> } {
  const headers: Record<string, string> = {};
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const res = {
    headersSent: false,
    set(obj: Record<string, string>) {
      Object.assign(headers, obj);
      return this;
    },
    status() {
      return this;
    },
    json() {
      resolveDone();
      return this;
    },
    // downloadObject does `stream.pipe(res)`, so res must be a writable sink.
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return false;
    },
    write() {
      return true;
    },
    end() {
      this.headersSent = true;
      resolveDone();
      return this;
    },
  } as unknown as Response;
  return { res, headers, done };
}

async function run() {
  const service = new ObjectStorageService();

  // 1. A PRIVATE object must never be cached by shared proxies/CDNs.
  {
    const { res, headers, done } = makeFakeResponse();
    await service.downloadObject(makeFakeFile("private"), res);
    await done;
    const cacheControl = headers["Cache-Control"] || "";
    assert(
      /\bprivate\b/.test(cacheControl),
      `private object Cache-Control should contain "private", got "${cacheControl}"`,
    );
    assert(
      !/\bpublic\b/.test(cacheControl),
      `private object Cache-Control should NOT contain "public", got "${cacheControl}"`,
    );
  }

  // 2. A PUBLIC object should be cacheable (avatars cache well).
  {
    const { res, headers, done } = makeFakeResponse();
    await service.downloadObject(makeFakeFile("public"), res);
    await done;
    const cacheControl = headers["Cache-Control"] || "";
    assert(
      /\bpublic\b/.test(cacheControl),
      `public object Cache-Control should contain "public", got "${cacheControl}"`,
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} object cache-header case(s) failed.`);
    process.exit(1);
  }
  console.log("Object cache-header spec passed: all cases green.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Object cache-header spec crashed:", err);
  process.exit(1);
});
