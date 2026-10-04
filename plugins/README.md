# plugins

Ways to put the Agent Identity MCP server (`packages/mcp`) in front of an AI coding tool.

## Claude Code

```
/plugin marketplace add Agent-Identity-ai/agent-identity-sdk
/plugin install agent-identity@agent-identity
```

Claude Code asks for the agent's API key when the plugin is enabled and keeps it in secure storage. Use an **agent-scoped** key: the tools act as that one agent, and an organization key is refused.

Layout: `claude-code/.claude-plugin/plugin.json` (with `userConfig` for the key), `claude-code/.mcp.json` (the server), `claude-code/skills/agent-to-agent/SKILL.md` (when and how to use the tools). The marketplace file is `/.claude-plugin/marketplace.json`. Check it with `claude plugin validate ./plugins/claude-code` and `claude plugin validate .`.

## Cursor

Copy `cursor/.cursor/mcp.json` into a project's `.cursor/` (or merge it into `~/.cursor/mcp.json`), set `AID_API_KEY` in the environment Cursor starts from, and optionally copy `cursor/.cursor/rules/agent-identity.mdc`.

Both need `@agentidentity/mcp` to be published to npm.
