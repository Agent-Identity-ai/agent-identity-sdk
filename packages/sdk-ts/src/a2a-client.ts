import type { AgentCard, AgentCardSecurityScheme } from "./client.js";

/**
 * A client for calling other agents over the A2A 1.0 protocol — ours, another vendor's, anyone's.
 *
 * It reads the agent's card, uses the JSON-RPC interface the card offers, and authenticates the way
 * the card says (a Bearer key, or an API-key header), so the same code works against any agent that
 * publishes a card. Nothing here is specific to this platform.
 *
 * ```ts
 * const remote = new A2ARemoteClient({ apiKey: process.env.THEIR_KEY });
 * const result = await remote.send("https://api.example.com/a2a/support/card", { text: "Refund order 4182" });
 * if (result.kind === "task") {
 *   const { task } = await remote.wait("https://api.example.com/a2a/support/card", result.task.id);
 *   console.log(taskText(task));
 * }
 * ```
 */

export type RemoteTaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_AUTH_REQUIRED"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_UNSPECIFIED";

/** One piece of a message. Exactly one of `text`, `data`, `raw` or `url` is present. */
export interface RemotePart {
  text?: string;
  data?: unknown;
  /** File bytes, base64. */
  raw?: string;
  url?: string;
  mediaType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

export interface RemoteMessage {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: "ROLE_USER" | "ROLE_AGENT" | "ROLE_UNSPECIFIED";
  parts: RemotePart[];
  metadata?: Record<string, unknown>;
}

export interface RemoteArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: RemotePart[];
}

export interface RemoteTask {
  id: string;
  contextId?: string;
  status: { state: RemoteTaskState; message?: RemoteMessage; timestamp?: string };
  artifacts?: RemoteArtifact[];
  history?: RemoteMessage[];
  metadata?: Record<string, unknown>;
}

export type RemoteSendResult = { kind: "task"; task: RemoteTask } | { kind: "message"; message: RemoteMessage };

export interface RemoteTaskList {
  tasks: RemoteTask[];
  /** Empty when there is no further page. */
  nextPageToken: string;
  pageSize: number;
  totalSize: number;
}

export type RemoteSendInput = ({ text: string; parts?: never } | { parts: RemotePart[]; text?: never }) & {
  /** Continue an existing conversation: a new task in the same context. */
  contextId?: string;
  /** Continue an existing task — for example to answer a question it asked. */
  taskId?: string;
  /** A stable id for this message. Sending the same one again is safe: the agent treats it as a retry. */
  messageId?: string;
  /** Do not wait for the task to finish or need input; return as soon as it exists. */
  returnImmediately?: boolean;
  /** How many of the most recent messages to include in the returned task. `0` for none. */
  historyLength?: number;
  acceptedOutputModes?: string[];
};

export interface RemoteListInput {
  contextId?: string;
  status?: RemoteTaskState;
  pageSize?: number;
  pageToken?: string;
  historyLength?: number;
  /** Only tasks whose status changed after this moment. */
  statusTimestampAfter?: Date | string;
  includeArtifacts?: boolean;
}

export interface A2AClientOptions {
  /**
   * The credential for the agents you call, sent the way each agent's card asks for it — as
   * `Authorization: Bearer …` or in whichever header its API-key scheme names. Leave it out to call an
   * agent that needs none.
   *
   * A string is sent to every agent you call, so use it when you are calling one vendor. A function is
   * asked, for each call, for the credential to use at that origin (`https://api.example.com`), and
   * can return `undefined` to send none — the way to hold several.
   */
  apiKey?: string | ((origin: string) => string | undefined);
  /** Replace the global `fetch`, for tests or a proxy. */
  fetch?: typeof fetch;
  /** Per-request deadline in milliseconds. Default 60s — longer than a server's own wait for a task. */
  timeoutMs?: number;
  /** The A2A version to speak. Default `1.0`. */
  version?: string;
}

/** Something went wrong calling an agent. */
export class A2AClientError extends Error {}

/** The agent answered with a JSON-RPC error. */
export class A2ARpcError extends A2AClientError {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = RPC_ERROR_NAMES[code] ?? "A2ARpcError";
  }
}

/** The agent answered with an HTTP error before any JSON-RPC was involved: no key, not allowed, no such
 *  agent, too large, rate limited. */
export class A2AHttpError extends A2AClientError {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
    /** Seconds to wait before trying again, when the agent said so. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "A2AHttpError";
  }
}

const RPC_ERROR_NAMES: Record<number, string> = {
  [-32700]: "ParseError",
  [-32600]: "InvalidRequestError",
  [-32601]: "MethodNotFoundError",
  [-32602]: "InvalidParamsError",
  [-32603]: "InternalError",
  [-32001]: "TaskNotFoundError",
  [-32002]: "TaskNotCancelableError",
  [-32003]: "PushNotificationNotSupportedError",
  [-32004]: "UnsupportedOperationError",
  [-32005]: "ContentTypeNotSupportedError",
  [-32006]: "InvalidAgentResponseError",
  [-32007]: "ExtendedAgentCardNotConfiguredError",
  [-32008]: "ExtensionSupportRequiredError",
  [-32009]: "VersionNotSupportedError",
};

const TERMINAL = new Set<string>(["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED"]);
const INTERRUPTED = new Set<string>(["TASK_STATE_INPUT_REQUIRED", "TASK_STATE_AUTH_REQUIRED"]);

/** Has the task finished for good? */
export function isTerminalTaskState(state: string): boolean {
  return TERMINAL.has(state);
}

/** Is the task waiting on the caller — for an answer, or for authorisation? */
export function isInterruptedTaskState(state: string): boolean {
  return INTERRUPTED.has(state);
}

/** The words of a message, or of a task's latest reply or result: its text parts, joined by newlines. */
export function taskText(source: RemoteTask | RemoteMessage): string {
  const parts = (() => {
    if ("parts" in source) return source.parts;
    const artifact = source.artifacts?.at(-1);
    if (source.status.state === "TASK_STATE_COMPLETED" && artifact) return artifact.parts;
    return source.status.message?.parts ?? artifact?.parts ?? [];
  })();
  return parts.flatMap((part) => (typeof part.text === "string" ? [part.text] : [])).join("\n");
}

/** The headers that authenticate to this agent, following what its card advertises. */
export function authHeadersFor(card: AgentCard, apiKey: string | undefined): Record<string, string> {
  if (!apiKey) return {};
  const schemes = card.securitySchemes ?? {};
  const required = card.securityRequirements?.[0]?.schemes;
  const names = required ? Object.keys(required) : Object.keys(schemes);
  for (const name of names) {
    const scheme: AgentCardSecurityScheme | undefined = schemes[name];
    if (!scheme) continue;
    if ("apiKeySecurityScheme" in scheme && scheme.apiKeySecurityScheme.location === "header") {
      return { [scheme.apiKeySecurityScheme.name]: apiKey };
    }
    if ("httpAuthSecurityScheme" in scheme && scheme.httpAuthSecurityScheme.scheme.toLowerCase() === "bearer") {
      return { authorization: `Bearer ${apiKey}` };
    }
  }
  // A card that says nothing usable about authentication: a Bearer key is by far the commonest.
  return { authorization: `Bearer ${apiKey}` };
}

/** The JSON-RPC interface to call, from a card: the first one it lists that speaks 1.x. */
export function jsonRpcInterfaceOf(card: AgentCard): { url: string; protocolVersion: string } {
  const offered = card.supportedInterfaces ?? [];
  const match = offered.find(
    (candidate) => candidate.protocolBinding.toUpperCase() === "JSONRPC" && /^1(\.|$)/.test(candidate.protocolVersion),
  );
  if (!match) {
    const list = offered.map((candidate) => `${candidate.protocolBinding} ${candidate.protocolVersion}`).join(", ") || "none";
    throw new A2AClientError(`${card.name} offers no JSON-RPC 1.x interface to call (it offers: ${list})`);
  }
  return match;
}

const MAX_CARD_BYTES = 1_048_576;

export type A2ATarget = string | AgentCard;

export class A2ARemoteClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly version: string;
  private readonly apiKey: A2AClientOptions["apiKey"];
  private readonly cards = new Map<string, AgentCard>();
  private nextRequestId = 1;

  constructor(options: A2AClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.version = options.version ?? "1.0";
  }

  /** Reads an agent's card from its URL (for us, `…/a2a/<handle>/card`). Cards are kept for the life of
   *  this client, so calling the same agent repeatedly reads it once. */
  async fetchCard(url: string): Promise<AgentCard> {
    const known = this.cards.get(url);
    if (known) return known;
    const res = await this.fetchWithDeadline(url, { headers: { accept: "application/json" } });
    const text = await res.text();
    if (text.length > MAX_CARD_BYTES) throw new A2AClientError(`the card at ${url} is larger than ${MAX_CARD_BYTES} bytes`);
    if (!res.ok) throw new A2AHttpError(res.status, `could not read the agent card at ${url} (HTTP ${res.status})`, safeJson(text));
    const card = safeJson(text) as AgentCard | undefined;
    if (!card || typeof card !== "object" || typeof card.name !== "string" || !Array.isArray(card.supportedInterfaces)) {
      throw new A2AClientError(`the document at ${url} is not an A2A agent card`);
    }
    this.cards.set(url, card);
    return card;
  }

  /** Sends a message: starts a task, or with `taskId` continues one. By default it waits, as the
   *  protocol says, until the task finishes or needs something from you. */
  async send(target: A2ATarget, input: RemoteSendInput): Promise<RemoteSendResult> {
    const parts: RemotePart[] = input.parts ?? [{ text: input.text! }];
    const configuration: Record<string, unknown> = {};
    if (input.returnImmediately !== undefined) configuration.returnImmediately = input.returnImmediately;
    if (input.historyLength !== undefined) configuration.historyLength = input.historyLength;
    if (input.acceptedOutputModes !== undefined) configuration.acceptedOutputModes = input.acceptedOutputModes;
    const result = (await this.call(target, "SendMessage", {
      message: {
        // Reused on a retry so the agent can tell it is the same message, not a second one.
        messageId: input.messageId ?? crypto.randomUUID(),
        role: "ROLE_USER",
        parts,
        ...(input.contextId !== undefined ? { contextId: input.contextId } : {}),
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      },
      ...(Object.keys(configuration).length > 0 ? { configuration } : {}),
    })) as { task?: RemoteTask; message?: RemoteMessage };
    if (result?.task) return { kind: "task", task: result.task };
    if (result?.message) return { kind: "message", message: result.message };
    throw new A2AClientError("the agent's answer to SendMessage held neither a task nor a message");
  }

  async get(target: A2ATarget, taskId: string, options: { historyLength?: number } = {}): Promise<RemoteTask> {
    return (await this.call(
      target,
      "GetTask",
      { id: taskId, ...(options.historyLength !== undefined ? { historyLength: options.historyLength } : {}) },
      { retry: true },
    )) as RemoteTask;
  }

  async list(target: A2ATarget, input: RemoteListInput = {}): Promise<RemoteTaskList> {
    const after = input.statusTimestampAfter instanceof Date ? input.statusTimestampAfter.toISOString() : input.statusTimestampAfter;
    return (await this.call(
      target,
      "ListTasks",
      {
        ...(input.contextId !== undefined ? { contextId: input.contextId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
        ...(input.pageToken !== undefined ? { pageToken: input.pageToken } : {}),
        ...(input.historyLength !== undefined ? { historyLength: input.historyLength } : {}),
        ...(after !== undefined ? { statusTimestampAfter: after } : {}),
        ...(input.includeArtifacts !== undefined ? { includeArtifacts: input.includeArtifacts } : {}),
      },
      { retry: true },
    )) as RemoteTaskList;
  }

  /**
   * Withdraws a task. Asking again is fine: an agent answers a cancel of a task that is already canceled with
   * TaskNotCancelableError (the A2A spec, and Inkbox), which would make a retry after a lost reply look like a
   * failure. So when that comes back, the task is read and, if it is canceled, returned as the answer.
   */
  async cancel(target: A2ATarget, taskId: string): Promise<RemoteTask> {
    try {
      return (await this.call(target, "CancelTask", { id: taskId }, { retry: true })) as RemoteTask;
    } catch (error) {
      if (error instanceof A2ARpcError && error.code === -32002) {
        const task = await this.get(target, taskId);
        if (task.status.state === "TASK_STATE_CANCELED") return task;
      }
      throw error;
    }
  }

  /**
   * Polls until the task finishes or is waiting on you, or until `timeoutMs` (default 5 minutes)
   * passes, whichever is first. Use it after `send` with `returnImmediately`, or when a blocking send
   * came back before the work was done. A timeout is not an error: `timedOut` says so, and the task
   * is the latest state seen.
   */
  async wait(
    target: A2ATarget,
    taskId: string,
    options: { timeoutMs?: number; pollIntervalMs?: number; signal?: AbortSignal } = {},
  ): Promise<{ task: RemoteTask; timedOut: boolean }> {
    const deadline = Date.now() + (options.timeoutMs ?? 300_000);
    let interval = options.pollIntervalMs ?? 500;
    let task = await this.get(target, taskId);
    while (!isTerminalTaskState(task.status.state) && !isInterruptedTaskState(task.status.state)) {
      if (Date.now() >= deadline) return { task, timedOut: true };
      if (options.signal?.aborted) return { task, timedOut: false };
      await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), options.signal);
      // Look a little less often the longer it takes, up to every five seconds.
      interval = Math.min(Math.round(interval * 1.5), 5_000);
      task = await this.get(target, taskId);
    }
    return { task, timedOut: false };
  }

  // --- plumbing ---------------------------------------------------------------------------------

  private async resolve(target: A2ATarget): Promise<{ card: AgentCard; url: string; version: string }> {
    const card = typeof target === "string" ? await this.fetchCard(target) : target;
    const { url } = jsonRpcInterfaceOf(card);
    return { card, url, version: this.version };
  }

  private async call(target: A2ATarget, method: string, params: unknown, options: { retry?: boolean } = {}): Promise<unknown> {
    const { card, url, version } = await this.resolve(target);
    const attempts = options.retry ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.callOnce(card, url, version, method, params);
      } catch (error) {
        lastError = error;
        // Only what is safe to repeat, and only for a fault that may pass: the network, a 5xx, a 429.
        const transient =
          !(error instanceof A2AClientError) ||
          (error instanceof A2AHttpError && (error.status >= 500 || error.status === 429));
        if (!options.retry || !transient || attempt === attempts) break;
        const wait = error instanceof A2AHttpError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 200 * attempt;
        await sleep(Math.min(wait, 10_000));
      }
    }
    throw lastError;
  }

  private async callOnce(card: AgentCard, url: string, version: string, method: string, params: unknown): Promise<unknown> {
    const id = String(this.nextRequestId++);
    const res = await this.fetchWithDeadline(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "a2a-version": version,
        ...authHeadersFor(card, typeof this.apiKey === "function" ? this.apiKey(new URL(url).origin) : this.apiKey),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const text = await res.text();
    const body = safeJson(text) as { result?: unknown; error?: { code: number; message: string; data?: unknown } } | undefined;
    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const detail = (body as { error?: { message?: string } } | undefined)?.error?.message;
      throw new A2AHttpError(
        res.status,
        `${card.name} answered ${method} with HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        body ?? text,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    if (!body || typeof body !== "object") throw new A2AClientError(`${card.name} answered ${method} with something that is not JSON`);
    if (body.error) throw new A2ARpcError(body.error.code, body.error.message, body.error.data);
    return body.result;
  }

  private async fetchWithDeadline(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = this.timeoutMs > 0 ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new A2AClientError(`no answer from ${url} within ${this.timeoutMs}ms`);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
