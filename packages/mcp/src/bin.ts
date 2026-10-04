#!/usr/bin/env node
import { AgentClient } from "@agentidentity/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAidMcpServer } from "./server.js";

const DEFAULT_BASE_URL = "https://api.agent-identity.dev";

async function main(): Promise<void> {
  const apiKey = process.env.AID_API_KEY;
  if (!apiKey) {
    console.error("aid-mcp: set AID_API_KEY to an agent-scoped API key (and AID_BASE_URL if you are not using the hosted API).");
    process.exit(1);
  }

  let remoteKeys: Record<string, string> | undefined;
  if (process.env.AID_REMOTE_KEYS) {
    try {
      remoteKeys = JSON.parse(process.env.AID_REMOTE_KEYS) as Record<string, string>;
    } catch {
      console.error('aid-mcp: AID_REMOTE_KEYS must be JSON like {"https://a2a.example.com":"key"}.');
      process.exit(1);
    }
  }

  const client = new AgentClient({ baseUrl: process.env.AID_BASE_URL ?? DEFAULT_BASE_URL, apiKey });
  const me = await client.whoami();
  if (me.actorType !== "agent") {
    console.error("aid-mcp: AID_API_KEY is an organization key. Use an agent-scoped key: the tools act as one agent.");
    process.exit(1);
  }

  const server = createAidMcpServer({ client, ...(remoteKeys !== undefined ? { remoteKeys } : {}) });
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; anything for a person goes to stderr.
  console.error(`aid-mcp: acting as agent ${me.actorId} in ${me.orgName}`);
}

main().catch((error: unknown) => {
  console.error(`aid-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
