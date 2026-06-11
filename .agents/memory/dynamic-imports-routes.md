---
name: Dynamic imports in Express route handlers
description: db, users, eq from drizzle-orm must be imported dynamically inside handlers to avoid circular deps at module load time.
---

## Rule
All direct database access in admin route handlers must use inline `await import(...)`:

```typescript
const { db: dbModule } = await import("./db");
const { users } = await import("@shared/schema");
const { eq } = await import("drizzle-orm");
```

**Why:** The server/routes.ts module is loaded before the database module completes initialization. Static imports at the top of routes.ts create circular dependency issues that silently fail (db is undefined).

**How to apply:** Any route that directly accesses the db (bypassing the storage abstraction) must use dynamic imports. Routes using `storage.*` methods are fine with static imports since storage handles db initialization internally.
