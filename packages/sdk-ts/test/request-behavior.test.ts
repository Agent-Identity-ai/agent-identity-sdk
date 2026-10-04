import { describe, expect, it, vi } from "vitest";
import { AgentClient, AidApiError, AidConnectionError } from "../src/index.js";

const baseUrl = "https://api.example.test";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("request transport", () => {
  it("surfaces an unreachable host as AidConnectionError, naming the method and URL", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 0 });

    const err = await client.identities.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AidConnectionError);
    expect((err as AidConnectionError).method).toBe("GET");
    expect((err as AidConnectionError).url).toBe(`${baseUrl}/v1/identities`);
    expect((err as AidConnectionError).timedOut).toBe(false);
  });

  it("surfaces a non-2xx response as AidApiError carrying the wire fields", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { code: "auth.unauthorized", message: "Missing or invalid API key" } }),
    ) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 0 });

    const err = await client.identities.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AidApiError);
    expect((err as AidApiError).status).toBe(401);
    expect((err as AidApiError).code).toBe("auth.unauthorized");
  });

  // The dashboard hands in a `fetch` that calls Next's redirect() on a 401, and redirect()
  // signals by throwing. If the SDK wrapped or retried that, a dead session would surface as a
  // connection error instead of sending the user to /login.
  it("passes an error thrown by a caller-supplied fetch through untouched", async () => {
    class RedirectSignal extends Error {}
    const fetchImpl = vi.fn(async () => {
      throw new RedirectSignal("NEXT_REDIRECT");
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 3 });

    const err = await client.identities.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectSignal);
    expect(err).not.toBeInstanceOf(AidConnectionError);
    // and it must not have been retried — control flow is not a transient failure
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("retry policy", () => {
  it("retries a 429 and returns the eventual success", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(429, { error: { code: "rate_limit.exceeded" } }, { "retry-after": "0" })
        : jsonResponse(200, []);
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 2 });

    await expect(client.identities.list()).resolves.toEqual([]);
    expect(calls).toBe(2);
  });

  it("does not retry a network failure on POST, since the request may already have been applied", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 3 });

    await expect(
      client.mail.send({ identityId: "id_1", to: ["a@example.com"] }),
    ).rejects.toBeInstanceOf(AidConnectionError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a network failure on GET, which is safe to replay", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("fetch failed");
      return jsonResponse(200, []);
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 3 });

    await expect(client.identities.list()).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it("does not retry a 400, which repeating cannot fix", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, { error: { code: "validation.invalid_request" } }),
    ) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl, apiKey: "k", fetch: fetchImpl, maxRetries: 3 });

    await expect(client.identities.list()).rejects.toBeInstanceOf(AidApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
