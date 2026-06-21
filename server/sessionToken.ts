import crypto from "crypto";

/**
 * Stateless, signed token proving that a metered vocal session was started via
 * `/api/session/opening` (where the weekly `vocal_session` quota is charged).
 *
 * `/api/session/dialogue-turn` requires a valid token so an authenticated free
 * user can't call the continuation endpoint directly and consume roleplay AI
 * without spending their quota. Being HMAC-signed (not server state) it survives
 * a mid-session server restart without re-charging the user.
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
  userId: string;
  cardId: string;
  iat: number;
}

function hmac(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function signVocalSession(claims: { userId: string; cardId: string }): string {
  const payload: VocalSessionPayload = { ...claims, iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyVocalSession(
  token: unknown,
  expected: { userId: string; cardId: string },
): boolean {
  if (typeof token !== "string") return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;

  const expectedSig = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  let parsed: VocalSessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return false;
  }

  if (parsed.userId !== expected.userId) return false;
  if (parsed.cardId !== expected.cardId) return false;
  if (typeof parsed.iat !== "number") return false;
  const age = Date.now() - parsed.iat;
  if (age > MAX_AGE_MS || age < -CLOCK_SKEW_MS) return false; // expired or issued in the future
  return true;
}
