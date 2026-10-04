# support-desk

A real, three-agent customer support desk built entirely on `@agentidentity/sdk` — no access to the
platform's internals, exactly like any external customer would build it. This exists to
stress-test the platform end to end: identities, real inbound/outbound mail, `wait_for_event`,
A2A trust + tasks, and the zero-knowledge vault, all exercised by a genuinely useful bot rather
than a synthetic test.

## How it works

- **`support` (frontdesk)** has the public mailbox. It watches `mail.received` via
  `wait_for_event`, classifies each email with OpenAI as `billing`, `tech`, or `general`, and
  either replies itself (`general`) or routes it to a specialist as an A2A task.
- **`billing-specialist`** / **`tech-specialist`** watch `a2a.task.created` for tasks addressed to
  them, lease and redeem their own OpenAI key from the vault, draft a reply, and mark the task
  `completed` with the draft as the result.
- Frontdesk watches `a2a.task.updated` for completions and sends the specialist's draft back to
  the customer in the original thread.

Each of the three agents holds its own OpenAI API key as a vault secret, encrypted to its own
keypair — the API server never sees the key in plaintext, only the ciphertext envelope. A
specialist redeems a fresh lease per task rather than keeping the key in memory.

## Setup

1. `cp .env.example .env` and fill in:
   - `ADMIN_API_KEY` — an org-admin key (`aid org create`, or the dashboard).
   - `OPENAI_API_KEY` — stored into the vault at bootstrap, not read directly afterward.
   - `PUBLIC_API_URL` if not running the platform's API on `localhost:8080`.
2. `pnpm bootstrap` — creates the three identities, their agent-scoped API keys, their vault
   keypairs (generated locally, never sent to the server), the `openai-api-key` vault secret for
   each. Agents in one organization reach each other without any rules. Writes everything (except the
   OpenAI key, which only ever lives in the vault) to `.state.json`.
3. In three separate terminals:
   ```
   pnpm --filter support-desk frontdesk
   pnpm --filter support-desk billing
   pnpm --filter support-desk tech
   ```
4. Email the frontdesk's mailbox address (printed by `bootstrap`) — a real inbound message on the
   org's configured domain will route through the whole flow above.

## Re-running

`bootstrap` isn't idempotent — running it again creates a second set of identities. Delete
`.state.json` and re-run to start over, or write a teardown script if you want one (not included).
