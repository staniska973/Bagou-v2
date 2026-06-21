import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean } from "drizzle-orm/pg-core";

export const authSessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // User-uploaded avatar (object storage path, e.g. /objects/uploads/<id>).
  // Takes precedence over the OAuth profileImageUrl when set.
  customImageUrl: varchar("custom_image_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Manual admin override (comp/grant), independent of Stripe.
  subscriptionStatus: varchar("subscription_status").notNull().default("none"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  // Link to Stripe. Stripe remains the source of truth for paid status; we only
  // store the ids here and read the synced `stripe` schema for live status.
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
