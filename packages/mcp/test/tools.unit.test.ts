/**
 * Tests that need no server: the MCP tools run against an SDK client whose `fetch` is replaced. These are the tests a
 * contributor can run with nothing but `pnpm install`; `server.test.ts` exercises the same tools against a real API.
 */
import { AgentClient } from "@agentidentity/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createAidMcpServer } from "../src/server.js";

interface Seen {
  method: string;
  url: string;
  body: unknown;
}

async function connect(respond: (seen: Seen) => { status: number; body: unknown }) {
  const seen: Seen[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const record: Seen = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    seen.push(record);
    const out = respond(record);
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const agent = new AgentClient({ baseUrl: "https://api.test", apiKey: "aid_live_test", fetch: fakeFetch });
  const mcp = createAidMcpServer({ client: agent });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([mcp.connect(a), client.connect(b)]);
  return { client, seen };
}

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
const call = async (client: Client, name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })) as ToolResult;

describe("MCP tools without a server", () => {
  it("offers the agent-to-agent tools, each described and marked for what it does", async () => {
    const { client } = await connect(() => ({ status: 200, body: {} }));
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(15);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^a2a_/);
      expect(tool.description?.length ?? 0).toBeGreaterThan(20);
      expect(tool.annotations).toBeDefined();
    }
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["a2a_send_task", "a2a_get_task", "a2a_reply_to_task", "a2a_find_agents"]));
    // Reading tools say so, so a client can run them without asking.
    expect(tools.find((t) => t.name === "a2a_get_task")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "a2a_send_task")?.annotations?.readOnlyHint).toBe(false);
  });

  it("sends a task as the agent whose key it holds, and returns what a model needs", async () => {
    const { client, seen } = await connect(() => ({
      status: 201,
      body: {
        id: "task-1",
        context_id: "conv-1",
        target_identity_id: "t",
        caller_identity_id: "c",
        state: "submitted",
        message: "Refund order 4182",
        result: null,
        created_at: "2026-10-04T10:00:00Z",
        updated_at: "2026-10-04T10:00:00Z",
      },
    }));
    const result = await call(client, "a2a_send_task", { to_handle: "refund-agent", text: "Refund order 4182" });
    expect(result.isError).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", url: "https://api.test/v1/a2a/tasks" });
    expect(seen[0]!.body).toEqual({ target_handle: "refund-agent", message: "Refund order 4182" });
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ task_id: "task-1", conversation_id: "conv-1", state: "submitted" });
  });

  it("returns an API refusal as a tool error carrying the server's explanation, not as a crash", async () => {
    const { client } = await connect(() => ({
      status: 403,
      body: { error: { code: "auth.forbidden", message: "the target has not enabled Agent2Agent", retryable: false } },
    }));
    const result = await call(client, "a2a_send_task", { to_handle: "nobody", text: "hello" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("has not enabled Agent2Agent");
    expect(result.content[0]!.text).toContain("403");
  });

  it("refuses arguments that do not fit the tool's schema before calling the API", async () => {
    const { client, seen } = await connect(() => ({ status: 200, body: {} }));
    const result = await client.callTool({ name: "a2a_send_task", arguments: { to_handle: "", text: "" } }).catch((e: unknown) => e);
    const failed = result instanceof Error || (result as ToolResult).isError === true;
    expect(failed).toBe(true);
    expect(seen).toHaveLength(0);
  });
});
