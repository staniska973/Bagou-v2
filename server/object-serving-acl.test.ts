import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import type { Response } from "express";
import { File } from "@google-cloud/storage";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./replit_integrations/object_storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

/**
 * Regression spec for the object-SERVING side: GET /objects/*objectPath.
 *
 * No test runner is configured in this project, so this is a self-contained
 * assertion script runnable with: `tsx server/object-serving-acl.test.ts`. It
 * exits non-zero if any case fails, so it can gate the flow against regressions.
 *
 * It boots a real Express app and exercises the REAL route handler over HTTP,
 * running the REAL ACL decision logic (canAccessObjectEntity -> canAccessObject
 * -> getObjectAclPolicy). The only mocked seams are the two that touch GCS:
 *   - getObjectEntityFile: resolves a path to a fake File carrying an ACL in its
 *     metadata (mirrors how a real object stores its ACL policy), or throws
 *     ObjectNotFoundError for unknown paths.
 *   - downloadObject: stands in for the GCS stream; writes a 200 with the body
 *     so a granted read is observable without hitting the network.
 *
 * What this proves:
 *   - A public object is readable (200) by anonymous AND by any user.
 *   - A private object returns 401 for anonymous, 403 for a non-owner.
 *   - The owner of a private object can read it (200).
 *
 * Passport is stubbed via a tiny middleware so the real `req.user` shape drives
 * the route: `x-test-user` present => authenticated as that user, else anonymous.
 */

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

const OWNER = "owner-user";
const OTHER = "other-user";

const PUBLIC_PATH = "/objects/public/avatar.png";
const PRIVATE_PATH = `/objects/uploads/${encodeURIComponent(OWNER)}/secret`;

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// ---- Mocked GCS seams ------------------------------------------------------

// A minimal stand-in for a GCS File: only the surface the real ACL logic reads.
// getObjectAclPolicy() calls file.getMetadata() and parses the ACL JSON from the
// custom metadata key, exactly as a real object would carry it.
function makeFakeFile(acl: {
  owner: string;
  visibility: "public" | "private";
}): File {
  return {
    name: "fake-object",
    async getMetadata() {
      return [
        {
          contentType: "image/png",
          size: "3",
          metadata: { [ACL_POLICY_METADATA_KEY]: JSON.stringify(acl) },
        },
      ];
    },
  } as unknown as File;
}

const OBJECTS: Record<string, File> = {
  [PUBLIC_PATH]: makeFakeFile({ owner: OWNER, visibility: "public" }),
  [PRIVATE_PATH]: makeFakeFile({ owner: OWNER, visibility: "private" }),
};

ObjectStorageService.prototype.getObjectEntityFile = async function (
  objectPath: string,
) {
  const file = OBJECTS[objectPath];
  if (!file) {
    throw new ObjectNotFoundError();
  }
  return file;
};

// Stand in for the GCS stream: if the route reaches here, access was granted.
ObjectStorageService.prototype.downloadObject = async function (
  _file: File,
  res: Response,
) {
  res.status(200).send("img");
};

// ---- App wiring ------------------------------------------------------------

async function buildApp() {
  const app = express();
  app.use(express.json());

  // Stub passport state so the REAL route reads a faithful req.user.
  // `x-test-user` present => authenticated as that user, otherwise anonymous.
  app.use((req: any, _res, next) => {
    const u = req.headers["x-test-user"];
    if (u) {
      req.user = {
        claims: { sub: String(u) },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      req.isAuthenticated = () => true;
    } else {
      req.user = undefined;
      req.isAuthenticated = () => false;
    }
    next();
  });

  registerObjectStorageRoutes(app);
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

type Resp = { status: number; text: string };
async function get(
  base: string,
  path: string,
  opts: { user?: string } = {},
): Promise<Resp> {
  const headers: Record<string, string> = {};
  if (opts.user) headers["x-test-user"] = opts.user;
  const res = await fetch(base + path, { method: "GET", headers });
  const text = await res.text();
  return { status: res.status, text };
}

// ---- Test cases ------------------------------------------------------------

async function run() {
  const { server, base } = await buildApp();

  try {
    // 1. Public object is readable by an anonymous caller.
    {
      const r = await get(base, PUBLIC_PATH);
      assert(r.status === 200, `public anon read should be 200, got ${r.status}`);
    }

    // 2. Public object is readable by any authenticated user (non-owner).
    {
      const r = await get(base, PUBLIC_PATH, { user: OTHER });
      assert(
        r.status === 200,
        `public authed read should be 200, got ${r.status}`,
      );
    }

    // 3. Private object denies an anonymous caller with 401 (not authenticated).
    {
      const r = await get(base, PRIVATE_PATH);
      assert(
        r.status === 401,
        `private anon read should be 401, got ${r.status}`,
      );
    }

    // 4. Private object denies an authenticated-but-unauthorized user with 403.
    {
      const r = await get(base, PRIVATE_PATH, { user: OTHER });
      assert(
        r.status === 403,
        `private non-owner read should be 403, got ${r.status}`,
      );
    }

    // 5. The owner of a private object can read it (200).
    {
      const r = await get(base, PRIVATE_PATH, { user: OWNER });
      assert(
        r.status === 200,
        `private owner read should be 200, got ${r.status}`,
      );
    }

    // 6. Sanity: an unknown object path surfaces as 404, not a leak/500.
    {
      const r = await get(base, "/objects/does/not/exist", { user: OWNER });
      assert(
        r.status === 404,
        `missing object should be 404, got ${r.status}`,
      );
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (failures > 0) {
    console.error(`\n${failures} object-serving ACL case(s) failed.`);
    process.exit(1);
  }
  console.log("Object-serving ACL spec passed: all cases green.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Object-serving ACL spec crashed:", err);
  process.exit(1);
});
