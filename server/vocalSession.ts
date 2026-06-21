import { eq } from "drizzle-orm";
import { db } from "./db";
import { vocalSessions } from "@shared/schema";
import { signVocalSession, verifyVocalSession } from "./sessionToken";

/**
 * Stateful proof that a single vocal simulation was started (and metered) via
 * `/api/session/opening`. Each start is one `vocal_sessions` row; the dialogue
 * endpoint claims turns against it and closes it when the conversation ends.
 *
 * This is what actually prevents replay of the signed token: the signature only
 * proves "the server issued this session id", while the row's `status` proves
 * "that conversation is still going". Once closed, a replayed token is rejected,
 * so a free user can't reuse one charged start to run extra conversations.
 */

// Backstop against a client that keeps sending turns without ever concluding.
// Well above any admin-configured dialogue length (2–5) so retries are tolerated.
const SAFETY_TURN_CAP = 12;

export async function startVocalSession(userId: string, cardId: string): Promise<string> {
  const [row] = await db
    .insert(vocalSessions)
    .values({ userId, cardId })
    .returning({ id: vocalSessions.id });
  return signVocalSession({ sessionId: row.id, userId, cardId });
}

/**
 * Verifies the token and, atomically (row lock), claims the next turn of the
 * referenced session. Returns the session id and the new turn count, or `null`
 * if the token is invalid/expired, points at someone else's session, or the
 * conversation is already closed.
 */
export async function claimVocalTurn(
  token: unknown,
  ctx: { userId: string; cardId: string },
): Promise<{ sessionId: number; turnCount: number } | null> {
  const sessionId = verifyVocalSession(token, ctx);
  if (sessionId == null) return null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(vocalSessions)
      .where(eq(vocalSessions.id, sessionId))
      .for("update");

    if (!row || row.userId !== ctx.userId || row.cardId !== ctx.cardId) return null;
    if (row.status !== "open") return null;
    if (row.turnCount >= SAFETY_TURN_CAP) {
      await tx
        .update(vocalSessions)
        .set({ status: "closed" })
        .where(eq(vocalSessions.id, sessionId));
      return null;
    }

    const turnCount = row.turnCount + 1;
    await tx
      .update(vocalSessions)
      .set({ turnCount })
      .where(eq(vocalSessions.id, sessionId));
    return { sessionId, turnCount };
  });
}

export async function closeVocalSession(sessionId: number): Promise<void> {
  await db
    .update(vocalSessions)
    .set({ status: "closed" })
    .where(eq(vocalSessions.id, sessionId));
}
