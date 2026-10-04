# Agent Identity SDK

Open-source client libraries for [Agent Identity](https://www.agent-identity.dev): give every AI agent a real identity. Its own email address, a durable event stream, a phone number, agent-to-agent messaging, and an encrypted vault.

The hosted service is not in this repository. This is everything you install and run in your own code.

| Package | What it is | Install |
|---|---|---|
| [`packages/sdk-ts`](packages/sdk-ts) | TypeScript SDK (`@agentidentity/sdk`). Zero runtime dependencies, ESM and CommonJS, fully typed. | `npm install @agentidentity/sdk` |
| [`packages/mcp`](packages/mcp) | MCP server (`@agentidentity/mcp`): the agent-to-agent tools for Claude Code, Cursor and any MCP client. | `npx @agentidentity/mcp` |
| [`plugins`](plugins) | Claude Code and Cursor plugins that put the MCP server in front of your editor. | see [`plugins/README.md`](plugins/README.md) |
| [`examples`](examples) | Small working agents built on the SDK. | |

## Quickstart

```ts
import { AgentClient } from "@agentidentity/sdk";

const client = new AgentClient({ baseUrl: "https://api.agent-identity.dev", apiKey: process.env.AID_API_KEY! });

const agent = await client.identities.create({ handle: "support", displayName: "Support Agent" });
await client.mail.send({ identityId: agent.id, to: ["you@example.com"], subject: "Hello", text: "From my own inbox." });
```

Get an API key at <https://app.agent-identity.dev>, or let your agent sign itself up: see the [docs](https://www.agent-identity.dev/docs). Coding agents can read <https://www.agent-identity.dev/llms.txt>.

## Documentation

- Docs: <https://www.agent-identity.dev/docs>
- SDK reference: <https://www.agent-identity.dev/docs/sdk>
- Blog: <https://www.agent-identity.dev/blog>

## Contributing

Bug reports, fixes and examples are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a security problem, see [SECURITY.md](SECURITY.md); please do not open a public issue for it.

## License

[MIT](LICENSE)
