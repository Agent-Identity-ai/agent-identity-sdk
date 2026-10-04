# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Email **security@agent-identity.dev** with:

- what the problem is and where (package and version, or the file),
- steps to reproduce,
- what an attacker could do with it.

You will get an acknowledgement within 3 working days and a fuller answer within 10. We will tell you when it is fixed and, if you like, credit you.

## Scope

In scope: the code in this repository (`@agentidentity/sdk`, `@agentidentity/mcp`, the plugins, the examples), including how they handle API keys, webhook signature checks and secrets.

Out of scope here: the hosted service. Report problems with the service to the same address and we will handle them there.

## Good practice for users

- Keep API keys out of source control and out of prompts. Use environment variables.
- Use an **agent-scoped** key for an agent, not an organization key.
- Verify every webhook with `verifyWebhook()` against the raw request body.
- Update to the latest version; security fixes are released as patch versions.

## Supported versions

Only the latest published version of each package receives fixes.
