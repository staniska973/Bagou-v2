export interface QuotaError {
  code: string;
  message: string;
}

const FALLBACK_MESSAGE =
  "Tu as atteint ta limite gratuite. Passe en Premium pour t'entraîner sans limite.";

/**
 * Detects a 402 "quota exceeded" error thrown by apiRequest. The error message
 * format is `${status}: ${responseBody}` (see lib/queryClient.ts), so we look for
 * the 402 prefix and parse the JSON body the backend sends. Returns null for any
 * other error so callers can keep their existing handling.
 */
export function parseQuotaError(error: unknown): QuotaError | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;
  if (!msg.startsWith("402:")) return null;

  const body = msg.slice(4).trim();
  try {
    const json = JSON.parse(body);
    if (json?.error === "quota_exceeded") {
      return {
        code: json.code ?? "QUOTA",
        message: json.message ?? FALLBACK_MESSAGE,
      };
    }
  } catch {
    /* body wasn't JSON — fall through to the generic quota error */
  }
  return { code: "QUOTA", message: FALLBACK_MESSAGE };
}
