import { describe, expect, it, vi } from "vitest";
import {
  A2AClientError,
  A2AHttpError,
  A2ARemoteClient,
  A2ARpcError,
  AgentClient,
  authHeadersFor,
  isInterruptedTaskState,
  isTerminalTaskState,
  jsonRpcInterfaceOf,
  taskText,
  type AgentCard,
  type RemoteTask,
} from "../src/index.js";

const CARD_URL = "https://agent.example.test/a2a/helper/card";
const RPC_URL = "https://agent.example.test/a2a/helper";

const card = (over: Partial<AgentCard> = {}): AgentCard => ({
  name: "@helper",
  description: "d",
  supportedInterfaces: [{ url: RPC_URL, protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
  version: "1.0.0",
  capabilities: {},
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [],
  securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: "Bearer" } } },
  securityRequirements: [{ schemes: { bearer: { list: [] } } }],
  ...over,
});
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const task = (state: string, extra: Partial<RemoteTask> = {}): RemoteTask => ({ id: "t1", contextId: "c1", status: { state: state as any }, ...extra });
const rpcOk = (result: unknown) => json(200, { jsonrpc: "2.0", id: "1", result });

/** A fetch that answers the card, then whatever `answers` say for each JSON-RPC call, and records the calls. */
function fakeAgent(agentCard: AgentCard, answers: Array<(body: any, req: RequestInit) => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit; body?: any }> = [];
  let i = 0;
  const impl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url === CARD_URL) return json(200, agentCard);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body });
    const answer = answers[Math.min(i++, answers.length - 1)]!;
    return answer(body, init);
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}
const headerOf = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe("choosing how to call an agent", () => {
  it("uses the first JSON-RPC interface that speaks 1.x, in the order the card gives", () => {
    const c = card({
      supportedInterfaces: [
        { url: "https://x/rest", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" },
        { url: "https://x/old", protocolBinding: "JSONRPC", protocolVersion: "0.3" },
        { url: "https://x/rpc", protocolBinding: "jsonrpc", protocolVersion: "1.0" },
        { url: "https://x/rpc2", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
      ],
    });
    expect(jsonRpcInterfaceOf(c).url).toBe("https://x/rpc");
  });

  it("says plainly when there is nothing it can call", () => {
    const c = card({ supportedInterfaces: [{ url: "https://x/g", protocolBinding: "GRPC", protocolVersion: "1.0" }] });
    expect(() => jsonRpcInterfaceOf(c)).toThrow(/no JSON-RPC 1\.x interface.*GRPC 1\.0/);
    expect(() => jsonRpcInterfaceOf(card({ supportedInterfaces: [] }))).toThrow(/offers: none/);
  });
});

describe("authenticating the way the card says", () => {
  it("sends a Bearer key as Authorization", () => {
    expect(authHeadersFor(card(), "k1")).toEqual({ authorization: "Bearer k1" });
  });

  it("sends an API key in the header the card names", () => {
    const c = card({
      securitySchemes: { key: { apiKeySecurityScheme: { location: "header", name: "X-Api-Key" } } },
      securityRequirements: [{ schemes: { key: { list: [] } } }],
    });
    expect(authHeadersFor(c, "k2")).toEqual({ "X-Api-Key": "k2" });
  });

  it("follows the first requirement when a card offers several schemes", () => {
    const c = card({
      securitySchemes: {
        bearer: { httpAuthSecurityScheme: { scheme: "Bearer" } },
        key: { apiKeySecurityScheme: { location: "header", name: "X-Api-Key" } },
      },
      securityRequirements: [{ schemes: { key: { list: [] } } }, { schemes: { bearer: { list: [] } } }],
    });
    expect(authHeadersFor(c, "k")).toEqual({ "X-Api-Key": "k" });
  });

  it("sends nothing without a key, and falls back to Bearer for a card that says nothing usable", () => {
    expect(authHeadersFor(card(), undefined)).toEqual({});
    expect(authHeadersFor(card({ securitySchemes: undefined, securityRequirements: undefined }), "k")).toEqual({ authorization: "Bearer k" });
    const cookieOnly = card({
      securitySchemes: { c: { apiKeySecurityScheme: { location: "cookie", name: "sid" } } },
      securityRequirements: [{ schemes: { c: { list: [] } } }],
    });
    expect(authHeadersFor(cookieOnly, "k")).toEqual({ authorization: "Bearer k" });
  });
});

describe("sending", () => {
  it("reads the card once, then makes the JSON-RPC call with the right headers and body", async () => {
    const agent = fakeAgent(card(), [() => rpcOk({ task: task("TASK_STATE_WORKING") })]);
    const remote = new A2ARemoteClient({ apiKey: "secret", fetch: agent.fetch });
    const out = await remote.send(CARD_URL, { text: "hello", contextId: "c9", returnImmediately: true, historyLength: 2 });
    await remote.send(CARD_URL, { text: "again" });

    expect(out.kind).toBe("task");
    const [first] = agent.calls;
    expect(first!.url).toBe(RPC_URL);
    expect(first!.init.method).toBe("POST");
    expect(headerOf(first!.init, "authorization")).toBe("Bearer secret");
    expect(headerOf(first!.init, "a2a-version")).toBe("1.0");
    expect(headerOf(first!.init, "content-type")).toBe("application/json");
    expect(first!.body).toMatchObject({
      jsonrpc: "2.0",
      method: "SendMessage",
      params: {
        message: { role: "ROLE_USER", parts: [{ text: "hello" }], contextId: "c9" },
        configuration: { returnImmediately: true, historyLength: 2 },
      },
    });
    expect(typeof first!.body.params.message.messageId).toBe("string");
    // Two sends, one card fetch.
    expect((agent.fetch as any).mock.calls.filter(([u]: [string]) => u === CARD_URL)).toHaveLength(1);
  });

  it("gives every message its own id unless told which one to use", async () => {
    const agent = fakeAgent(card(), [() => rpcOk({ task: task("TASK_STATE_WORKING") })]);
    const remote = new A2ARemoteClient({ fetch: agent.fetch });
    await remote.send(CARD_URL, { text: "a" });
    await remote.send(CARD_URL, { text: "b" });
    await remote.send(CARD_URL, { text: "c", messageId: "mine" });
    const ids = agent.calls.map((c) => c.body.params.message.messageId);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[2]).toBe("mine");
  });

  it("carries structured parts and continues a task", async () => {
    const agent = fakeAgent(card(), [() => rpcOk({ task: task("TASK_STATE_WORKING") })]);
    await new A2ARemoteClient({ fetch: agent.fetch }).send(CARD_URL, { parts: [{ text: "x" }, { data: { a: 1 } }], taskId: "t1" });
    expect(agent.calls[0]!.body.params.message).toMatchObject({ taskId: "t1", parts: [{ text: "x" }, { data: { a: 1 } }] });
  });

  it("returns a direct message answer as a message", async () => {
    const agent = fakeAgent(card(), [
      () => rpcOk({ message: { messageId: "m", role: "ROLE_AGENT", parts: [{ text: "hi back" }] } }),
    ]);
    const out = await new A2ARemoteClient({ fetch: agent.fetch }).send(CARD_URL, { text: "hi" });
    expect(out.kind).toBe("message");
    expect(out.kind === "message" && taskText(out.message)).toBe("hi back");
  });

  it("can be given a card it already holds, without fetching", async () => {
    const agent = fakeAgent(card(), [() => rpcOk({ task: task("TASK_STATE_COMPLETED") })]);
    await new A2ARemoteClient({ fetch: agent.fetch }).send(card(), { text: "x" });
    expect((agent.fetch as any).mock.calls.filter(([u]: [string]) => u === CARD_URL)).toHaveLength(0);
  });

  it("sends a different key to each origin when given a function", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string, init: RequestInit = {}) => {
      if (String(input).endsWith("/card")) return json(200, card({ supportedInterfaces: [{ url: String(input).replace("/card", ""), protocolBinding: "JSONRPC", protocolVersion: "1.0" }] }));
      seen.push(`${new URL(String(input)).origin} ${headerOf(init, "authorization") ?? "none"}`);
      return rpcOk({ task: task("TASK_STATE_COMPLETED") });
    }) as unknown as typeof fetch;
    const remote = new A2ARemoteClient({ fetch: fetchImpl, apiKey: (origin) => (origin === "https://mine.test" ? "mine" : undefined) });
    await remote.send("https://mine.test/a2a/a/card", { text: "x" });
    await remote.send("https://theirs.test/a2a/b/card", { text: "x" });
    expect(seen).toEqual(["https://mine.test Bearer mine", "https://theirs.test none"]);
  });
});

describe("errors", () => {
  it("turns a JSON-RPC error into a typed error carrying its code and data", async () => {
    const agent = fakeAgent(card(), [() => json(200, { jsonrpc: "2.0", id: "1", error: { code: -32001, message: "task not found", data: { x: 1 } } })]);
    const err = await new A2ARemoteClient({ fetch: agent.fetch }).get(CARD_URL, "nope").catch((e) => e);
    expect(err).toBeInstanceOf(A2ARpcError);
    expect(err).toBeInstanceOf(A2AClientError);
    expect(err).toMatchObject({ code: -32001, name: "TaskNotFoundError", message: "task not found", data: { x: 1 } });
  });

  it("names every code the spec defines", async () => {
    const names: Record<number, string> = {
      [-32002]: "TaskNotCancelableError", [-32003]: "PushNotificationNotSupportedError", [-32004]: "UnsupportedOperationError",
      [-32005]: "ContentTypeNotSupportedError", [-32009]: "VersionNotSupportedError", [-32602]: "InvalidParamsError", [-32700]: "ParseError",
    };
    for (const [code, name] of Object.entries(names)) {
      expect(new A2ARpcError(Number(code), "m").name).toBe(name);
    }
    expect(new A2ARpcError(-31999, "m").name).toBe("A2ARpcError");
  });

  it("turns an HTTP refusal into an error that carries the status, the body and Retry-After", async () => {
    const agent = fakeAgent(card(), [() => json(429, { error: { code: "rate_limit.exceeded", message: "slow down" } }, { "retry-after": "7" })]);
    const err = await new A2ARemoteClient({ fetch: agent.fetch }).send(CARD_URL, { text: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(A2AHttpError);
    expect(err).toMatchObject({ status: 429, retryAfterSeconds: 7 });
    expect(err.message).toMatch(/429.*slow down/);
    const denied = fakeAgent(card(), [() => json(403, { error: { code: "auth.forbidden", message: "no" } })]);
    expect(await new A2ARemoteClient({ fetch: denied.fetch }).send(CARD_URL, { text: "x" }).catch((e) => e)).toMatchObject({ status: 403 });
  });

  it("does not repeat a SendMessage that failed, since it may have been applied", async () => {
    const agent = fakeAgent(card(), [() => json(503, { error: { message: "down" } }), () => rpcOk({ task: task("TASK_STATE_WORKING") })]);
    await expect(new A2ARemoteClient({ fetch: agent.fetch }).send(CARD_URL, { text: "x" })).rejects.toBeInstanceOf(A2AHttpError);
    expect(agent.calls).toHaveLength(1);
  });

  it("does repeat a read, a cancel or a list that hit a passing fault", async () => {
    const agent = fakeAgent(card(), [() => json(503, {}), () => json(502, {}), () => rpcOk(task("TASK_STATE_WORKING"))]);
    const got = await new A2ARemoteClient({ fetch: agent.fetch }).get(CARD_URL, "t1");
    expect(got.status.state).toBe("TASK_STATE_WORKING");
    expect(agent.calls).toHaveLength(3);
    // ...but not a fault that will not pass.
    const notFound = fakeAgent(card(), [() => json(200, { jsonrpc: "2.0", id: "1", error: { code: -32001, message: "gone" } }), () => rpcOk(task("TASK_STATE_WORKING"))]);
    await expect(new A2ARemoteClient({ fetch: notFound.fetch }).get(CARD_URL, "t1")).rejects.toBeInstanceOf(A2ARpcError);
    expect(notFound.calls).toHaveLength(1);
  });

  it("gives up on a card that is not a card, is missing, or does not answer in time", async () => {
    const notACard = (async () => json(200, { hello: "world" })) as unknown as typeof fetch;
    await expect(new A2ARemoteClient({ fetch: notACard }).fetchCard("https://x.test/card")).rejects.toThrow(/not an A2A agent card/);
    const missing = (async () => json(404, { error: { message: "no such agent" } })) as unknown as typeof fetch;
    await expect(new A2ARemoteClient({ fetch: missing }).fetchCard("https://x.test/card")).rejects.toMatchObject({ status: 404 });
    const hangs = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(new A2ARemoteClient({ fetch: hangs, timeoutMs: 30 }).fetchCard("https://x.test/card")).rejects.toThrow(/no answer.*30ms/);
  });

  it("refuses a card that is absurdly large", async () => {
    const huge = (async () => new Response("x".repeat(1_100_000), { status: 200 })) as unknown as typeof fetch;
    await expect(new A2ARemoteClient({ fetch: huge }).fetchCard("https://x.test/card")).rejects.toThrow(/larger than/);
  });
});

describe("waiting", () => {
  it("polls until the task finishes, and looks less often as it goes", async () => {
    const agent = fakeAgent(card(), [
      () => rpcOk(task("TASK_STATE_SUBMITTED")),
      () => rpcOk(task("TASK_STATE_WORKING")),
      () => rpcOk(task("TASK_STATE_COMPLETED", { artifacts: [{ artifactId: "a", parts: [{ text: "the answer" }] }] })),
    ]);
    const { task: done, timedOut } = await new A2ARemoteClient({ fetch: agent.fetch }).wait(CARD_URL, "t1", { pollIntervalMs: 5 });
    expect(timedOut).toBe(false);
    expect(done.status.state).toBe("TASK_STATE_COMPLETED");
    expect(taskText(done)).toBe("the answer");
    expect(agent.calls.map((c) => c.body.method)).toEqual(["GetTask", "GetTask", "GetTask"]);
  });

  it("stops when the agent needs something from the caller", async () => {
    const agent = fakeAgent(card(), [() => rpcOk(task("TASK_STATE_WORKING")), () => rpcOk(task("TASK_STATE_INPUT_REQUIRED"))]);
    const { task: asked } = await new A2ARemoteClient({ fetch: agent.fetch }).wait(CARD_URL, "t1", { pollIntervalMs: 5 });
    expect(asked.status.state).toBe("TASK_STATE_INPUT_REQUIRED");
  });

  it("returns what it last saw, marked as timed out, rather than throwing", async () => {
    const agent = fakeAgent(card(), [() => rpcOk(task("TASK_STATE_WORKING"))]);
    const started = Date.now();
    const out = await new A2ARemoteClient({ fetch: agent.fetch }).wait(CARD_URL, "t1", { timeoutMs: 60, pollIntervalMs: 10 });
    expect(out.timedOut).toBe(true);
    expect(out.task.status.state).toBe("TASK_STATE_WORKING");
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("can be cancelled by an abort signal", async () => {
    const agent = fakeAgent(card(), [() => rpcOk(task("TASK_STATE_WORKING"))]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const out = await new A2ARemoteClient({ fetch: agent.fetch }).wait(CARD_URL, "t1", { timeoutMs: 10_000, pollIntervalMs: 10, signal: controller.signal });
    expect(out.timedOut).toBe(false);
    expect(out.task.status.state).toBe("TASK_STATE_WORKING");
  });
});

describe("list and cancel", () => {
  it("sends only the filters it was given, and turns a Date into RFC 3339", async () => {
    const agent = fakeAgent(card(), [() => rpcOk({ tasks: [], nextPageToken: "", pageSize: 50, totalSize: 0 })]);
    const remote = new A2ARemoteClient({ fetch: agent.fetch });
    await remote.list(CARD_URL, {});
    await remote.list(CARD_URL, { status: "TASK_STATE_COMPLETED", pageSize: 5, pageToken: "p", statusTimestampAfter: new Date("2026-01-02T03:04:05Z") });
    expect(agent.calls[0]!.body.params).toEqual({});
    expect(agent.calls[1]!.body.params).toEqual({ status: "TASK_STATE_COMPLETED", pageSize: 5, pageToken: "p", statusTimestampAfter: "2026-01-02T03:04:05.000Z" });
    await remote.cancel(CARD_URL, "t1").catch(() => {});
    expect(agent.calls[2]!.body).toMatchObject({ method: "CancelTask", params: { id: "t1" } });
  });
});

describe("cancelling twice", () => {
  const notCancelable = () => json(200, { jsonrpc: "2.0", id: "1", error: { code: -32002, message: "Task cannot be canceled" } });

  it("treats 'already canceled' as the answer, so a retry after a lost reply is not a failure", async () => {
    const agent = fakeAgent(card(), [notCancelable, () => rpcOk(task("TASK_STATE_CANCELED"))]);
    const remote = new A2ARemoteClient({ fetch: agent.fetch });
    const out = await remote.cancel(CARD_URL, "t1");
    expect(out.status.state).toBe("TASK_STATE_CANCELED");
    expect(agent.calls.map((c) => c.body.method)).toEqual(["CancelTask", "GetTask"]);
  });

  it("still raises the error when the task is not canceled, for example because it already completed", async () => {
    const agent = fakeAgent(card(), [notCancelable, () => rpcOk(task("TASK_STATE_COMPLETED"))]);
    const remote = new A2ARemoteClient({ fetch: agent.fetch });
    await expect(remote.cancel(CARD_URL, "t1")).rejects.toMatchObject({ code: -32002 });
  });
});

describe("state helpers", () => {
  it("tell finished from waiting-on-you", () => {
    for (const s of ["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED"]) {
      expect(isTerminalTaskState(s)).toBe(true);
      expect(isInterruptedTaskState(s)).toBe(false);
    }
    for (const s of ["TASK_STATE_INPUT_REQUIRED", "TASK_STATE_AUTH_REQUIRED"]) expect(isInterruptedTaskState(s)).toBe(true);
    for (const s of ["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING"]) {
      expect(isTerminalTaskState(s)).toBe(false);
      expect(isInterruptedTaskState(s)).toBe(false);
    }
  });

  it("read the words of a task: the result when done, the question when asked", () => {
    const msg = (text: string) => ({ messageId: "m", role: "ROLE_AGENT" as const, parts: [{ text }, { data: { skip: true } }] });
    expect(taskText(task("TASK_STATE_INPUT_REQUIRED", { status: { state: "TASK_STATE_INPUT_REQUIRED", message: msg("which region?") } }))).toBe("which region?");
    expect(taskText(task("TASK_STATE_COMPLETED", { artifacts: [{ artifactId: "a", parts: [{ text: "42" }] }], status: { state: "TASK_STATE_COMPLETED", message: msg("done") } }))).toBe("42");
    expect(taskText(task("TASK_STATE_SUBMITTED"))).toBe("");
    expect(taskText(msg("line one"))).toBe("line one");
  });
});

describe("AgentClient.a2a.remote", () => {
  it("sends the platform key to the platform's own origin — and to no one else", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith("/card")) return json(200, card({ supportedInterfaces: [{ url: url.replace("/card", ""), protocolBinding: "JSONRPC", protocolVersion: "1.0" }] }));
      seen.push(`${new URL(url).host} ${headerOf(init, "authorization") ?? "none"}`);
      return rpcOk({ task: task("TASK_STATE_COMPLETED") });
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl: "https://api.mine.test", apiKey: "aid_live_mine", fetch: fetchImpl });
    const remote = client.a2a.remote();
    await remote.send("https://api.mine.test/a2a/x/card", { text: "hi" });
    await remote.send("https://api.theirs.test/a2a/y/card", { text: "hi" });
    expect(seen).toEqual(["api.mine.test Bearer aid_live_mine", "api.theirs.test none"]);
  });

  it("uses an explicit key everywhere it is told to", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      if (url.endsWith("/card")) return json(200, card({ supportedInterfaces: [{ url: url.replace("/card", ""), protocolBinding: "JSONRPC", protocolVersion: "1.0" }] }));
      seen.push(headerOf(init, "authorization") ?? "none");
      return rpcOk({ task: task("TASK_STATE_COMPLETED") });
    }) as unknown as typeof fetch;
    const client = new AgentClient({ baseUrl: "https://api.mine.test", apiKey: "aid_live_mine", fetch: fetchImpl });
    await client.a2a.remote({ apiKey: "vendor-key" }).send("https://api.theirs.test/a2a/y/card", { text: "hi" });
    expect(seen).toEqual(["Bearer vendor-key"]);
  });
});
