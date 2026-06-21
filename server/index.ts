import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerStripeRoutes } from "./stripeRoutes";
import { initStripe } from "./stripeInit";
import { WebhookHandlers } from "./webhookHandlers";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Stripe webhook MUST be registered with a raw body parser BEFORE express.json,
// otherwise the signature verification fails (it needs the unparsed Buffer).
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Missing stripe-signature" });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error(
          "STRIPE WEBHOOK ERROR: req.body is not a Buffer. Ensure this route is " +
            "registered BEFORE express.json().",
        );
        return res.status(500).json({ error: "Webhook processing error" });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Webhook error:", error?.message || error);
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).substring(0, 200)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);
  registerStripeRoutes(app);

  await registerRoutes(httpServer, app);

  // Initialise Stripe sync (schema migrations, managed webhook, backfill).
  // Non-fatal: if Stripe isn't connected yet the app still runs on the free tier.
  initStripe().catch((err) =>
    console.error("Stripe initialisation skipped:", err?.message || err),
  );

  // Periodic safety net for orphaned avatar files. User-facing avatar cleanup is
  // best-effort, so a transient storage outage can leave files behind with no
  // retry; this sweep reconciles storage against live users and removes orphans.
  // Idempotent and non-fatal: failures are logged and retried on the next tick.
  const AVATAR_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const runAvatarReconcile = () =>
    import("./avatar-reconciliation")
      .then(({ reconcileOrphanedAvatars }) => reconcileOrphanedAvatars())
      .catch((err) =>
        console.error("Avatar reconciliation skipped:", err?.message || err),
      );
  setTimeout(runAvatarReconcile, 60 * 1000).unref();
  setInterval(runAvatarReconcile, AVATAR_RECONCILE_INTERVAL_MS).unref();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
