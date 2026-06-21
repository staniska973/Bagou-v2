import express from "express";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { authStorage } from "./replit_integrations/auth";
import { __setStripeClientFactoryForTests } from "./stripeClient";
import { db } from "./db";
import { users, userProfiles, usageEvents, vocalSessions } from "@shared/schema";
import { registerRoutes } from "./routes";

/**
 * Regression spec for DELETE /api/account — specifically the financially risky
 * paid-user branch. No test runner is configured in this project, so this is a
 * self-contained assertion script runnable with:
 *   `tsx server/account-deletion.test.ts`
 * It exits non-zero if any case fails so it can gate the flow against
 * regressions.
 *
 * It boots a real Express app and exercises the REAL DELETE /api/account
 * handler over HTTP. Only the external seams are mocked:
 *   - Stripe: via the `__setStripeClientFactoryForTests` injection hook, so no
 *     connector lookup or network call happens.
 *   - The user lookup (`authStorage.getUser`) and the local-delete transaction
 *     (`db.transaction`) are stubbed so no real DB is touched.
 * The real routing, auth guard, Stripe-cancel ordering and 502 abort all run.
 *
 * The two behaviours the route guarantees and we assert here:
 *   1. Any still-billable Stripe subscription is cancelled BEFORE a single local
 *      row is removed.
 *   2. If the Stripe cancel call throws, the route returns 502 and deletes
 *      NOTHING locally (no transaction, so the user keeps their account + portal
 *      access instead of being wiped while still billed).
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

// ---- Mocked backends -------------------------------------------------------

// In-memory user records standing in for the users table. Each test uses its
// own user id so cases never bleed into one another.
const fakeUsers: Record<string, any> = {};
authStorage.getUser = async (id: string) => fakeUsers[id];

// Map the real schema table objects to readable names so we can assert exactly
// which tables the local-delete transaction touched and in what order.
const tableNames = new Map<unknown, string>([
  [userProfiles, "userProfiles"],
  [usageEvents, "usageEvents"],
  [vocalSessions, "vocalSessions"],
  [users, "users"],
]);

// A shared, ordered event log lets us prove the Stripe cancel happens strictly
// before any local delete. Both the fake Stripe client and the fake DB
// transaction push into it.
type Event =
  | { kind: "cancel"; subId: string }
  | { kind: "tx-start" }
  | { kind: "delete"; table: string };
let events: Event[] = [];

// Fake DB transaction: records each delete (table + ordering) without touching
// Postgres. Mirrors drizzle's `tx.delete(table).where(cond)` thenable shape.
(db as any).transaction = async (cb: (tx: any) => Promise<unknown>) => {
  events.push({ kind: "tx-start" });
  const tx = {
    delete: (table: unknown) => ({
      where: async (_cond: unknown) => {
        events.push({ kind: "delete", table: tableNames.get(table) ?? "unknown" });
      },
    }),
  };
  return cb(tx);
};

// Build a fake Stripe client whose subscription list / cancel behaviour is
// configured per test via the closure below.
let currentSubs: Array<{ id: string; status: string }> = [];
let cancelShouldThrow = false;
const cancelledIds: string[] = [];

const fakeStripe = {
  subscriptions: {
    list: async (_params: any) => ({ data: currentSubs }),
    cancel: async (id: string) => {
      if (cancelShouldThrow) {
        throw new Error("simulated Stripe outage");
      }
      events.push({ kind: "cancel", subId: id });
      cancelledIds.push(id);
      return { id, status: "canceled" };
    },
  },
};
__setStripeClientFactoryForTests(async () => fakeStripe as any);

// ---- App wiring ------------------------------------------------------------

async function buildApp() {
  const app = express();
  app.use(express.json());

  // Stub passport state so the REAL isAuthenticated guard runs faithfully and
  // the route's `req.logout` / `req.session.destroy` calls have something to
  // call. `x-test-user` present => authenticated as that user.
  app.use((req: any, _res, next) => {
    const u = req.headers["x-test-user"];
    if (u) {
      req.user = {
        claims: { sub: String(u) },
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      req.isAuthenticated = () => true;
      req.logout = (cb: (err?: any) => void) => cb();
      req.session = { destroy: (cb: (err?: any) => void) => cb() };
    } else {
      req.user = undefined;
      req.isAuthenticated = () => false;
    }
    next();
  });

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
  opts: { user?: string } = {},
): Promise<Resp> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.user) headers["x-test-user"] = opts.user;
  const res = await fetch(base + path, { method, headers });
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

  try {
    // 0. Unauthenticated deletion is rejected (sanity: guard is wired).
    {
      events = [];
      const r = await call(base, "DELETE", "/api/account");
      assert(r.status === 401, `unauth delete should be 401, got ${r.status}`);
      assert(events.length === 0, "unauth delete must not touch Stripe or DB");
    }

    // 1. Paid user, mixed subscription statuses: only still-billable ones are
    //    cancelled, and every cancel happens BEFORE any local delete.
    {
      const userId = "paid-user-1";
      fakeUsers[userId] = {
        id: userId,
        stripeCustomerId: "cus_paid_1",
        customImageUrl: null,
      };
      currentSubs = [
        { id: "sub_active", status: "active" },
        { id: "sub_trialing", status: "trialing" },
        { id: "sub_canceled", status: "canceled" }, // already dead — skip
        { id: "sub_pastdue", status: "past_due" },
      ];
      cancelShouldThrow = false;
      cancelledIds.length = 0;
      events = [];

      const r = await call(base, "DELETE", "/api/account", { user: userId });
      assert(r.status === 200, `paid delete should be 200, got ${r.status}`);

      // Only billable statuses cancelled; the already-canceled sub is left alone.
      assert(
        cancelledIds.includes("sub_active") &&
          cancelledIds.includes("sub_trialing") &&
          cancelledIds.includes("sub_pastdue"),
        `billable subs should all be cancelled, got ${JSON.stringify(cancelledIds)}`,
      );
      assert(
        !cancelledIds.includes("sub_canceled"),
        "already-canceled sub must not be cancelled again",
      );

      // ORDERING: every cancel event precedes the transaction start and every
      // local delete. This is the core guarantee of the route.
      const firstDeleteIdx = events.findIndex(
        (e) => e.kind === "tx-start" || e.kind === "delete",
      );
      const lastCancelIdx =
        events.map((e) => e.kind).lastIndexOf("cancel");
      assert(
        firstDeleteIdx > -1 && lastCancelIdx > -1 && lastCancelIdx < firstDeleteIdx,
        `all cancels must precede local deletes; events=${JSON.stringify(events.map((e) => e.kind))}`,
      );

      // All four user-scoped tables were cleared in the transaction.
      const deletedTables = events
        .filter((e): e is { kind: "delete"; table: string } => e.kind === "delete")
        .map((e) => e.table);
      for (const t of ["userProfiles", "usageEvents", "vocalSessions", "users"]) {
        assert(
          deletedTables.includes(t),
          `local delete should clear ${t}, got ${JSON.stringify(deletedTables)}`,
        );
      }
    }

    // 2. Failure path: the Stripe cancel call throws => 502 and NOTHING is
    //    deleted locally (no transaction even starts).
    {
      const userId = "paid-user-2";
      fakeUsers[userId] = {
        id: userId,
        stripeCustomerId: "cus_paid_2",
        customImageUrl: null,
      };
      currentSubs = [{ id: "sub_boom", status: "active" }];
      cancelShouldThrow = true;
      cancelledIds.length = 0;
      events = [];

      const r = await call(base, "DELETE", "/api/account", { user: userId });
      assert(r.status === 502, `Stripe-failure delete should be 502, got ${r.status}`);
      assert(
        events.every((e) => e.kind !== "delete" && e.kind !== "tx-start"),
        `502 abort must delete nothing locally; events=${JSON.stringify(events.map((e) => e.kind))}`,
      );
      assert(
        cancelledIds.length === 0,
        "no subscription should be recorded as cancelled when Stripe throws",
      );
    }

    // 3. Free user (no Stripe customer): Stripe is skipped entirely and the
    //    local delete still runs. Confirms the paid-path guard didn't break the
    //    free path.
    {
      const userId = "free-user-1";
      fakeUsers[userId] = { id: userId, stripeCustomerId: null, customImageUrl: null };
      cancelShouldThrow = false;
      cancelledIds.length = 0;
      events = [];

      const r = await call(base, "DELETE", "/api/account", { user: userId });
      assert(r.status === 200, `free delete should be 200, got ${r.status}`);
      assert(
        events.every((e) => e.kind !== "cancel"),
        "free user must not hit Stripe cancel",
      );
      const deletedTables = events
        .filter((e): e is { kind: "delete"; table: string } => e.kind === "delete")
        .map((e) => e.table);
      assert(
        deletedTables.includes("users") && deletedTables.includes("userProfiles"),
        `free delete should still clear local rows, got ${JSON.stringify(deletedTables)}`,
      );
    }
  } finally {
    __setStripeClientFactoryForTests(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (failures > 0) {
    console.error(`\n${failures} account-deletion case(s) failed.`);
    process.exit(1);
  }
  console.log("Account-deletion spec passed: all cases green.");
  // Routes register background timers/handles; exit explicitly so the script
  // doesn't hang after a successful run.
  process.exit(0);
}

run().catch((err) => {
  console.error("Account-deletion spec crashed:", err);
  process.exit(1);
});
