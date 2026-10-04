/**
 * Checking that a webhook delivery really came from Agent Identity, and is fresh.
 *
 * Every delivery carries three headers: `x-aid-request-id`, `x-aid-timestamp` (Unix seconds) and `x-aid-signature`
 * (`v1=<hex>`, or several separated by commas while a secret is being rotated). The signature is HMAC-SHA256 of
 * `<request id>.<timestamp>.<raw body>`. Verify against the **raw** bytes you received, before parsing them: a body
 * parsed and written out again is not the same bytes.
 */

export type WebhookVerificationErrorCode =
  | "missing_headers"
  | "bad_timestamp"
  | "timestamp_out_of_tolerance"
  | "signature_mismatch"
  | "bad_body";

export class WebhookVerificationError extends Error {
  constructor(
    readonly code: WebhookVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export interface VerifyWebhookInput {
  /** The signing secret (`whsec_…`) shown when the webhook was created or its secret rotated. */
  secret: string;
  /** The request body exactly as received. */
  body: string | Uint8Array;
  /** The request headers. Names are matched without regard to case. */
  headers: Record<string, string | string[] | undefined> | Headers;
  /** How far the timestamp may be from now, in seconds, before the delivery is refused as stale. Default 300. */
  toleranceSeconds?: number;
  /** Replace the clock, for tests. Milliseconds since the epoch. */
  now?: number;
}

export interface VerifiedWebhook<T = unknown> {
  /** The delivery's own id: the same on every retry, so use it to ignore a delivery you already handled. */
  requestId: string;
  /** When this attempt was made. */
  timestamp: Date;
  /** The parsed body. */
  event: T;
}

function headerValue(headers: VerifyWebhookInput["headers"], name: string): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) ?? undefined;
  const record = headers as Record<string, string | string[] | undefined>;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === name) {
      const value = record[key];
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * Verifies a delivery and returns what it carried. Throws {@link WebhookVerificationError} for anything wrong, and
 * never tells a forger which part was: a bad signature and a wrong secret look the same.
 *
 * ```ts
 * const { event } = await verifyWebhook({ secret: process.env.AID_WEBHOOK_SECRET!, body: rawBody, headers: req.headers });
 * ```
 */
export async function verifyWebhook<T = unknown>(input: VerifyWebhookInput): Promise<VerifiedWebhook<T>> {
  const requestId = headerValue(input.headers, "x-aid-request-id");
  const timestampHeader = headerValue(input.headers, "x-aid-timestamp");
  const signatureHeader = headerValue(input.headers, "x-aid-signature");
  if (!requestId || !timestampHeader || !signatureHeader) {
    throw new WebhookVerificationError(
      "missing_headers",
      "a delivery carries x-aid-request-id, x-aid-timestamp and x-aid-signature; one of them is missing",
    );
  }

  if (!/^\d{1,12}$/.test(timestampHeader)) {
    throw new WebhookVerificationError("bad_timestamp", "x-aid-timestamp is not a Unix time in seconds");
  }
  const timestamp = Number(timestampHeader);
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    throw new WebhookVerificationError(
      "timestamp_out_of_tolerance",
      `the delivery is ${Math.abs(nowSeconds - timestamp)}s away from now, more than the ${tolerance}s allowed`,
    );
  }

  const bodyBytes = typeof input.body === "string" ? new TextEncoder().encode(input.body) : input.body;
  const prefix = new TextEncoder().encode(`${requestId}.${timestampHeader}.`);
  const signed = new Uint8Array(prefix.length + bodyBytes.length);
  signed.set(prefix, 0);
  signed.set(bodyBytes, prefix.length);

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "verify",
  ]);
  const candidates = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => hexToBytes(part.slice(3)))
    .filter((bytes): bytes is Uint8Array => bytes !== null);

  let ok = false;
  // `subtle.verify` compares in constant time. Every candidate is tried, so a rotation in progress costs nothing extra
  // to a receiver that holds the old secret or the new one.
  for (const candidate of candidates) {
    if (await crypto.subtle.verify("HMAC", key, candidate as BufferSource, signed as BufferSource)) ok = true;
  }
  if (!ok) throw new WebhookVerificationError("signature_mismatch", "the signature does not match this secret and body");

  let event: T;
  try {
    event = JSON.parse(typeof input.body === "string" ? input.body : new TextDecoder().decode(input.body)) as T;
  } catch {
    throw new WebhookVerificationError("bad_body", "the body is signed correctly but is not JSON");
  }
  return { requestId, timestamp: new Date(timestamp * 1000), event };
}
