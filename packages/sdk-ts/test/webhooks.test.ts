import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook, WebhookVerificationError } from "../src/index.js";

const SECRET = "whsec_0123456789abcdef";
const NOW = Date.parse("2026-10-01T12:00:00Z");
const nowSeconds = NOW / 1000;

/** What the sender does, written out again here so the two are checked against the rule and not against each other. */
function deliver(body: string, options: { secrets?: string[]; requestId?: string; timestamp?: number } = {}) {
  const requestId = options.requestId ?? "delivery-1";
  const timestamp = options.timestamp ?? nowSeconds;
  const signed = `${requestId}.${timestamp}.${body}`;
  const signature = (options.secrets ?? [SECRET]).map((s) => `v1=${createHmac("sha256", s).update(signed).digest("hex")}`).join(",");
  return {
    body,
    headers: { "x-aid-request-id": requestId, "x-aid-timestamp": String(timestamp), "x-aid-signature": signature } as Record<string, string>,
  };
}

const BODY = JSON.stringify({ id: "evt_1", type: "mail.received", data: { messageId: "m1" } });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "accepted";
  } catch (error) {
    return error instanceof WebhookVerificationError ? error.code : `other: ${String(error)}`;
  }
}

describe("verifyWebhook", () => {
  it("accepts a genuine delivery and hands back the event, the delivery id and when it was made", async () => {
    const d = deliver(BODY);
    const out = await verifyWebhook<{ type: string }>({ secret: SECRET, ...d, now: NOW });
    expect(out.event.type).toBe("mail.received");
    expect(out.requestId).toBe("delivery-1");
    expect(out.timestamp.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("refuses a body changed by a single character, and a different secret", async () => {
    const d = deliver(BODY);
    expect(await code(verifyWebhook({ secret: SECRET, ...d, body: BODY.replace("m1", "m2"), now: NOW }))).toBe("signature_mismatch");
    expect(await code(verifyWebhook({ secret: "whsec_other", ...d, now: NOW }))).toBe("signature_mismatch");
  });

  it("refuses a header changed after signing: the request id and the timestamp are part of what is signed", async () => {
    const d = deliver(BODY);
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: { ...d.headers, "x-aid-request-id": "delivery-2" }, now: NOW }))).toBe("signature_mismatch");
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: { ...d.headers, "x-aid-timestamp": String(nowSeconds + 1) }, now: NOW }))).toBe("signature_mismatch");
  });

  it("refuses a stale delivery, which is what stops a captured one being replayed, and one from the future", async () => {
    const old = deliver(BODY, { timestamp: nowSeconds - 301 });
    expect(await code(verifyWebhook({ secret: SECRET, ...old, now: NOW }))).toBe("timestamp_out_of_tolerance");
    const edge = deliver(BODY, { timestamp: nowSeconds - 300 });
    expect(await code(verifyWebhook({ secret: SECRET, ...edge, now: NOW }))).toBe("accepted");
    const future = deliver(BODY, { timestamp: nowSeconds + 400 });
    expect(await code(verifyWebhook({ secret: SECRET, ...future, now: NOW }))).toBe("timestamp_out_of_tolerance");
    // The window can be widened or narrowed.
    expect(await code(verifyWebhook({ secret: SECRET, ...old, toleranceSeconds: 600, now: NOW }))).toBe("accepted");
    expect(await code(verifyWebhook({ secret: SECRET, ...deliver(BODY, { timestamp: nowSeconds - 10 }), toleranceSeconds: 5, now: NOW }))).toBe("timestamp_out_of_tolerance");
  });

  it("accepts either secret while one is being rotated out, because both sign", async () => {
    const d = deliver(BODY, { secrets: ["whsec_new", "whsec_old"] });
    expect(d.headers["x-aid-signature"]!.split(",")).toHaveLength(2);
    expect(await code(verifyWebhook({ secret: "whsec_new", ...d, now: NOW }))).toBe("accepted");
    expect(await code(verifyWebhook({ secret: "whsec_old", ...d, now: NOW }))).toBe("accepted");
    expect(await code(verifyWebhook({ secret: "whsec_neither", ...d, now: NOW }))).toBe("signature_mismatch");
  });

  it("says what is missing or malformed without mistaking it for a forgery", async () => {
    const d = deliver(BODY);
    for (const name of ["x-aid-request-id", "x-aid-timestamp", "x-aid-signature"]) {
      const { [name]: _removed, ...rest } = d.headers;
      expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: rest, now: NOW }))).toBe("missing_headers");
    }
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: { ...d.headers, "x-aid-timestamp": "yesterday" }, now: NOW }))).toBe("bad_timestamp");
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: { ...d.headers, "x-aid-signature": "v1=zzzz" }, now: NOW }))).toBe("signature_mismatch");
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: { ...d.headers, "x-aid-signature": "v2=abcd" }, now: NOW }))).toBe("signature_mismatch");
    expect(await code(verifyWebhook({ secret: SECRET, ...deliver("not json"), now: NOW }))).toBe("bad_body");
  });

  it("reads headers however the server hands them over, and the body as text or bytes", async () => {
    const d = deliver(BODY);
    const shouted = Object.fromEntries(Object.entries(d.headers).map(([k, v]) => [k.toUpperCase(), v]));
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: shouted, now: NOW }))).toBe("accepted");
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: new Headers(d.headers), now: NOW }))).toBe("accepted");
    expect(await code(verifyWebhook({ secret: SECRET, body: new TextEncoder().encode(d.body), headers: d.headers, now: NOW }))).toBe("accepted");
    expect(await code(verifyWebhook({ secret: SECRET, body: d.body, headers: { ...d.headers, "x-aid-signature": [d.headers["x-aid-signature"]!] as unknown as string }, now: NOW }))).toBe("accepted");
  });

  it("verifies non-ASCII bodies byte for byte", async () => {
    const body = JSON.stringify({ subject: "Zahlung fällig — 支払い 🚀" });
    expect(await code(verifyWebhook({ secret: SECRET, ...deliver(body), now: NOW }))).toBe("accepted");
  });
});
