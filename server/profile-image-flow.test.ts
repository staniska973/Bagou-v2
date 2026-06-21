import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { authStorage } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerRoutes } from "./routes";

/**
 * Regression spec for the profile-photo upload flow. No test runner is
 * configured in this project, so this is a self-contained assertion script
 * runnable with: `tsx server/profile-image-flow.test.ts`. It exits non-zero if
 * any case fails, so it can gate the flow against regressions.
 *
 * It boots a real Express app and exercises the REAL route handlers over HTTP:
 *   - POST /api/uploads/request-url        (authenticated presigned-URL request)
 *   - PUT  /api/account/profile-image      (persist / claim / clear avatar)
 *
 * Object storage (GCS) and the user DB are the only mocked seams: we patch the
 * ObjectStorageService prototype + the authStorage singleton so no network/DB
 * is touched, while the real routing, auth guard, path-normalization, ownership
 * check and ACL wiring all run for real. Passport is stubbed via a tiny
 * middleware so the real `isAuthenticated` guard runs against a known state.
 */

const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR || "/test-bucket/.private";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// The display fallback used by the client (settings.tsx / home.tsx): a
// user-uploaded avatar takes precedence, otherwise the OAuth profile image.
const resolveAvatar = (u: any): string | undefined =>
  u?.customImageUrl || u?.profileImageUrl || undefined;

// ---- Mocked backends -------------------------------------------------------

// Keep the real path-normalization logic; only stub the seams that hit GCS/DB.
const realNormalize = ObjectStorageService.prototype.normalizeObjectEntityPath;

function buildGcsUploadUrl(ownerId: string | undefined, id: string): string {
  const prefix = ownerId ? `uploads/${encodeURIComponent(ownerId)}` : "uploads";
  // PRIVATE_DIR starts with "/", giving a realistic storage.googleapis.com URL.
  return `https://storage.googleapis.com${PRIVATE_DIR}/${prefix}/${id}?X-Goog-Signature=fake`;
}

const aclCalls: Array<{ rawPath: string; acl: any }> = [];
const deleteCalls: string[] = [];
let uploadCounter = 0;

ObjectStorageService.prototype.getObjectEntityUploadURL = async function (
  ownerId?: string,
) {
  uploadCounter += 1;
  return buildGcsUploadUrl(ownerId, `gen-${uploadCounter}`);
};

ObjectStorageService.prototype.trySetObjectEntityAclPolicy = async function (
  rawPath: string,
  acl: any,
) {
  aclCalls.push({ rawPath, acl });
  // Real persist would set GCS metadata; here just return the normalized path.
  return realNormalize.call(this, rawPath);
};

ObjectStorageService.prototype.deleteObjectEntity = async function (
  path: string,
) {
  deleteCalls.push(path);
  return true;
};

// In-memory user record standing in for the users table.
const TEST_USER = "user-123";
const fakeDb: Record<string, any> = {
  [TEST_USER]: {
    id: TEST_USER,
    customImageUrl: null,
    profileImageUrl: "https://oauth.example/avatar.png",
  },
};

authStorage.getUser = async (id: string) => fakeDb[id];
authStorage.updateCustomImage = async (id: string, url: string | null) => {
  if (!fakeDb[id]) return undefined;
  fakeDb[id] = { ...fakeDb[id], customImageUrl: url };
  return fakeDb[id];
};

// ---- App wiring ------------------------------------------------------------

async function buildApp() {
  const app = express();
  app.use(express.json());

  // Stub passport state so the REAL isAuthenticated guard runs faithfully.
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
  await registerRoutes(server, app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

type Resp = { status: number; json: any };
async function call(
  base: string,
  method: string,
  path: string,
  opts: { user?: string; body?: any } = {},
): Promise<Resp> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.user) headers["x-test-user"] = opts.user;
  const res = await fetch(base + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

// ---- Test cases ------------------------------------------------------------

async function run() {
  const { server, base } = await buildApp();
  const ownedPrefix = `/objects/uploads/${encodeURIComponent(TEST_USER)}/`;

  try {
    // 1. request-url requires auth.
    {
      const r = await call(base, "POST", "/api/uploads/request-url", {
        body: { name: "pic.jpg" },
      });
      assert(r.status === 401, `request-url unauth should be 401, got ${r.status}`);
    }

    // 2. request-url validates the required name field.
    {
      const r = await call(base, "POST", "/api/uploads/request-url", {
        user: TEST_USER,
        body: {},
      });
      assert(r.status === 400, `request-url missing name should be 400, got ${r.status}`);
    }

    // 3. request-url (authed) returns a presigned URL + a path namespaced under
    //    the requesting user, normalized to /objects/uploads/<user>/...
    let issuedPath = "";
    {
      const r = await call(base, "POST", "/api/uploads/request-url", {
        user: TEST_USER,
        body: { name: "pic.jpg", size: 100, contentType: "image/jpeg" },
      });
      assert(r.status === 200, `request-url authed should be 200, got ${r.status}`);
      assert(
        typeof r.json?.uploadURL === "string" &&
          r.json.uploadURL.startsWith("https://storage.googleapis.com/"),
        "request-url should return a storage.googleapis.com uploadURL",
      );
      assert(
        typeof r.json?.objectPath === "string" &&
          r.json.objectPath.startsWith(ownedPrefix),
        `objectPath should be namespaced under the user, got ${r.json?.objectPath}`,
      );
      issuedPath = r.json?.objectPath || "";
    }

    // 4. profile-image persist requires auth.
    {
      const r = await call(base, "PUT", "/api/account/profile-image", {
        body: { imageUrl: buildGcsUploadUrl(TEST_USER, "x") },
      });
      assert(r.status === 401, `profile-image unauth should be 401, got ${r.status}`);
    }

    // 5. Cannot claim an object outside the caller's namespace (ACL takeover).
    {
      const r = await call(base, "PUT", "/api/account/profile-image", {
        user: TEST_USER,
        body: { imageUrl: "/objects/uploads/someone-else/evil" },
      });
      assert(r.status === 403, `claiming other-user object should be 403, got ${r.status}`);
      assert(
        aclCalls.length === 0,
        "no ACL should be set when claim is rejected",
      );
    }

    // 6. Persist a freshly-uploaded avatar: path normalized from the GCS URL,
    //    ACL set to public+owner, customImageUrl stored.
    const img1Url = buildGcsUploadUrl(TEST_USER, "img1");
    const img1Path = `${ownedPrefix}img1`;
    {
      const r = await call(base, "PUT", "/api/account/profile-image", {
        user: TEST_USER,
        body: { imageUrl: img1Url },
      });
      assert(r.status === 200, `persist should be 200, got ${r.status}`);
      assert(
        r.json?.customImageUrl === img1Path,
        `stored customImageUrl should be normalized path, got ${r.json?.customImageUrl}`,
      );
      const lastAcl = aclCalls[aclCalls.length - 1];
      assert(
        lastAcl?.acl?.owner === TEST_USER && lastAcl?.acl?.visibility === "public",
        "ACL should be { owner: <user>, visibility: public }",
      );
      // Fallback now resolves to the uploaded avatar, not the OAuth image.
      assert(
        resolveAvatar(r.json) === img1Path,
        "resolveAvatar should prefer customImageUrl after upload",
      );
    }

    // 7. Re-upload replaces the avatar and deletes the previous object.
    const img2Url = buildGcsUploadUrl(TEST_USER, "img2");
    const img2Path = `${ownedPrefix}img2`;
    {
      deleteCalls.length = 0;
      const r = await call(base, "PUT", "/api/account/profile-image", {
        user: TEST_USER,
        body: { imageUrl: img2Url },
      });
      assert(r.status === 200, `re-upload should be 200, got ${r.status}`);
      assert(
        r.json?.customImageUrl === img2Path,
        `re-upload should store new path, got ${r.json?.customImageUrl}`,
      );
      assert(
        deleteCalls.includes(img1Path),
        `re-upload should delete the previous object ${img1Path}, deletes=${JSON.stringify(deleteCalls)}`,
      );
    }

    // 8. Clearing the photo (empty imageUrl) nulls customImageUrl, deletes the
    //    stored object, and falls back to the OAuth profile image.
    {
      deleteCalls.length = 0;
      const r = await call(base, "PUT", "/api/account/profile-image", {
        user: TEST_USER,
        body: { imageUrl: "" },
      });
      assert(r.status === 200, `clear should be 200, got ${r.status}`);
      assert(
        r.json?.customImageUrl === null,
        `clear should null customImageUrl, got ${r.json?.customImageUrl}`,
      );
      assert(
        deleteCalls.includes(img2Path),
        `clear should delete the stored object ${img2Path}, deletes=${JSON.stringify(deleteCalls)}`,
      );
      assert(
        resolveAvatar(r.json) === "https://oauth.example/avatar.png",
        "resolveAvatar should fall back to profileImageUrl after clearing",
      );
    }

    // Sanity: the issued upload path and the claim namespace agree.
    assert(
      issuedPath.startsWith(ownedPrefix),
      "issued upload path and claim namespace should agree",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (failures > 0) {
    console.error(`\n${failures} profile-image flow case(s) failed.`);
    process.exit(1);
  }
  console.log("Profile-image flow spec passed: all cases green.");
  // Routes register background timers/handles; exit explicitly so the script
  // doesn't hang after a successful run.
  process.exit(0);
}

run().catch((err) => {
  console.error("Profile-image flow spec crashed:", err);
  process.exit(1);
});
