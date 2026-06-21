import crypto from "crypto";

/**
 * Signed token identifying the specific metered vocal session started via
 * `/api/session/opening` (where the weekly `vocal_session` quota is charged).
 *
 * The token carries the `vocal_sessions` row id and is HMAC-signed so the client
 * can't forge or point it at another session. `/api/session/dialogue-turn`
 * verifies the signature and then claims a turn against that row (see
 * `vocalSession.ts`), which is what actually prevents replay: once the row's
 * conversation closes, the token is dead, so a free user can't reuse one charged
 * start to run extra conversations.
 */

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  // Fail fast: an empty key would silently produce forgeable tokens.
  throw new Error("SESSION_SECRET is required to sign vocal-session tokens");
}

// A vocal session is short; a token is only good for an hour.
const MAX_AGE_MS = 60 * 60 * 1000;
// Tolerate a little clock skew on the issued-at check.
const CLOCK_SKEW_MS = 60 * 1000;

interface VocalSessionPayload {
  sessionId: number;
  userId: string;
  cardId: string;
  iat: number;
}

function hmac(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function signVocalSession(claims: {
  sessionId: number;
  userId: string;
  cardId: string;
}): string {
  const payload: VocalSessionPayload = { ...claims, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

/**
 * Returns the signed session id when the token is valid for this user+card and
 * not expired, otherwise `null`. The caller still has to load the matching
 * `vocal_sessions` row to confirm it's open — the signature alone doesn't prove
 * the conversation is still claimable.
 */
export function verifyVocalSession(
  token: unknown,
  expected: { userId: string; cardId: string },
): number | null {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expectedSig = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let parsed: VocalSessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }

  if (parsed.userId !== expected.userId) return null;
  if (parsed.cardId !== expected.cardId) return null;
  if (typeof parsed.sessionId !== "number" || !Number.isInteger(parsed.sessionId)) return null;
  if (typeof parsed.iat !== "number") return null;
  const age = Date.now() - parsed.iat;
  if (age > MAX_AGE_MS || age < -CLOCK_SKEW_MS) return null; // expired or issued in the future
  return parsed.sessionId;
}
