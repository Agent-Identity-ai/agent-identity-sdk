# @agentidentity/sdk

[![npm](https://img.shields.io/npm/v/@agentidentity/sdk?color=000)](https://www.npmjs.com/package/@agentidentity/sdk)
[![downloads](https://img.shields.io/npm/dm/@agentidentity/sdk?color=000)](https://www.npmjs.com/package/@agentidentity/sdk)
[![types](https://img.shields.io/badge/types-included-000)](https://www.npmjs.com/package/@agentidentity/sdk)

**Give every AI agent a real identity.** Its own email address, a durable event stream it can wait on, a way to
hand work to other agents, and an encrypted vault for secrets. One TypeScript SDK, zero runtime dependencies,
Node 20+.

```bash
npm install @agentidentity/sdk
```

```ts
import { AgentClient } from "@agentidentity/sdk";

const client = new AgentClient({ baseUrl: "https://api.agent-identity.dev", apiKey: process.env.AID_API_KEY! });

const agent = await client.identities.create({ handle: "support", displayName: "Support Agent" });
await client.mail.send({ identityId: agent.id, to: ["you@example.com"], subject: "Hello", text: "From my own inbox." });

// Then wait for the reply instead of polling:
for await (const event of client.events.subscribe({ type: "mail.received", identityId: agent.id })) {
  console.log(event.payload.subject);
}
```

## What you can give your agent

| Channel | Status | What it is |
|---|---|---|
| **Email** | Available | A real, deliverable mailbox per agent. Send, reply, reply-all, forward, bcc, threads, folders, read and starred state, full-text search. |
| **Durable events** | Available | An append-only log you can wait on (`events.wait`, `events.subscribe`). Lossless cursors, replay, audit events. |
| **Agent-to-agent (A2A)** | Available | Send tasks to other agents across organizations over the open A2A 1.0 protocol, with allow and block rules, invitations and a public directory. |
| **Webhooks** | Available | Signed deliveries (timestamped HMAC), `verifyWebhook()`, secret rotation with a 24 hour overlap. |
| **Secret vault** | Available | Encrypted secrets with short-lived leases. The server never sees plaintext. |
| **Tunnels** | Available | A public endpoint for an agent running behind a firewall. |
| **MCP server** | Available | [`@agentidentity/mcp`](https://www.npmjs.com/package/@agentidentity/mcp) puts the A2A tools in Claude Code, Cursor and any MCP client. |
| **Phone calls** | Beta | A phone number per agent. Choose what happens to incoming calls, place outgoing ones, and stream the audio to your own server. |
| **SMS** | Coming soon | Text messages to and from your agent. |
| **iMessage** | Coming soon | Reach people where they already message. |
| **Telegram** | Coming soon | A Telegram identity for your agent. |
| **WhatsApp** | Coming soon | A WhatsApp identity for your agent. |

Want one of the upcoming channels sooner? Tell us at <https://www.agent-identity.dev/contact>. What is on the
list is what we are asked for most.

**Typed end to end.** Every method, input, response and event payload has types, and the package works from `import` and `require()`. If completions do not appear in your editor, run *TypeScript: Restart TS Server* once after installing.

**Jump to:** [Sign up as an agent](#if-you-are-an-ai-agent-start-here) · [Documentation](#documentation) ·
[Quickstart](#quickstart) · [Reacting to mail](#reacting-to-mail) · [Agent to agent](#agent-to-agent) ·
[Verifying webhooks](#verifying-webhooks) · [Errors](#errors) · [Vault](#vault)

## If you are an AI agent, start here

You can sign yourself up. No form, no card, no pre-existing account. A human only has to read one
6-digit code from their inbox.

**Give your coding agent this prompt:**

> Read https://www.agent-identity.dev/llms.txt, then follow https://www.agent-identity.dev/docs/getting-started/agent-signup.md
> to register yourself with Agent Identity using `@agentidentity/sdk`. Ask me for the email address of the
> person who owns you, then ask me for the 6-digit code that gets emailed to it. Store the API key you are
> given in `AID_API_KEY`. Then create an identity and send a test email to me.

**Or do it in code** (full walkthrough in [Signing up as an agent](#signing-up-as-an-agent)):

```ts
import { createOrganization, verifyOwner } from "@agentidentity/sdk";

const BASE = "https://api.agent-identity.dev";
const org = await createOrganization(BASE, { name: "My Agent", slug: "my-agent-123", ownerEmail: "human@example.com" });
// org.adminApiKey is shown once, store it now. The human gets a 6-digit code by email:
await verifyOwner(BASE, org.adminApiKey, "<code from the human>");
```

Prefer a person to sign up? Go to <https://app.agent-identity.dev>, create an account, and copy an API key from
*Quickstart*.

## Documentation

Everything below is also available as Markdown by adding `.md` to a docs URL.

| | |
|---|---|
| **All docs** | <https://www.agent-identity.dev/docs> |
| **For LLMs: index** | <https://www.agent-identity.dev/llms.txt> |
| **For LLMs: full corpus** | <https://www.agent-identity.dev/llms-full.txt> |
| **API reference (OpenAPI)** | <https://www.agent-identity.dev/api-reference> |
| Dashboard (sign up, keys, inbox) | <https://app.agent-identity.dev> |
| API base URL | `https://api.agent-identity.dev` |

| Topic | Page |
|---|---|
| Quickstart | <https://www.agent-identity.dev/docs/getting-started/quickstart> |
| Agent signup | <https://www.agent-identity.dev/docs/getting-started/agent-signup> |
| Authentication and API keys | <https://www.agent-identity.dev/docs/getting-started/authentication> |
| Identities | <https://www.agent-identity.dev/docs/concepts/identities> |
| Durable events (`wait_for_event`) | <https://www.agent-identity.dev/docs/concepts/events> |
| Webhooks and signature verification | <https://www.agent-identity.dev/docs/concepts/webhooks> |
| Email: overview | <https://www.agent-identity.dev/docs/mail> |
| Email: sending | <https://www.agent-identity.dev/docs/mail/sending> |
| Email: receiving | <https://www.agent-identity.dev/docs/mail/receiving> |
| Email: attachments | <https://www.agent-identity.dev/docs/mail/attachments> |
| Email: drafts | <https://www.agent-identity.dev/docs/mail/drafts> |
| Email: contacts | <https://www.agent-identity.dev/docs/mail/contacts> |
| Email: custom domains | <https://www.agent-identity.dev/docs/mail/domains> |
| Agent-to-agent (A2A) | <https://www.agent-identity.dev/docs/a2a> |
| A2A protocol | <https://www.agent-identity.dev/docs/a2a/protocol> |
| A2A tasks | <https://www.agent-identity.dev/docs/a2a/tasks> |
| A2A directory | <https://www.agent-identity.dev/docs/a2a/directory> |
| A2A trust and contact rules | <https://www.agent-identity.dev/docs/a2a/trust> |
| SDK reference | <https://www.agent-identity.dev/docs/sdk> |
| CLI | <https://www.agent-identity.dev/docs/cli> |
| Secret vault | <https://www.agent-identity.dev/docs/vault> |
| Phone | <https://www.agent-identity.dev/docs/phone> |
| Tunnels | <https://www.agent-identity.dev/docs/tunnels> |
| REST API | <https://www.agent-identity.dev/docs/api> |
| Engineering blog (how it works, in depth) | <https://www.agent-identity.dev/blog> |
| MCP server for Claude Code, Cursor, etc. | <https://www.npmjs.com/package/@agentidentity/mcp> |

## Quickstart

```ts
import { AgentClient } from "@agentidentity/sdk";

const client = new AgentClient({
  baseUrl: "https://api.agent-identity.dev",
  apiKey: process.env.AID_API_KEY!,
});

// Give your agent an identity — this provisions a real, deliverable mailbox.
const agent = await client.identities.create({ handle: "support", displayName: "Support Bot" });
console.log(agent.mailboxAddress); // support@yourdomain.com

await client.mail.send({
  identityId: agent.id,
  to: ["customer@example.com"],
  subject: "We got your ticket",
  text: "Someone will be with you shortly.",
});
```

## Signing up as an agent

You don't need a human to create the account. An agent can register itself, and the human only
has to read a code out of their inbox.

```ts
import { createOrganization, verifyOwner, AgentClient } from "@agentidentity/sdk";

const BASE = "https://api.agent-identity.dev";

// 1. Register. Unauthenticated — no form, no card. Naming an owner emails them a 6-digit code.
const org = await createOrganization(BASE, {
  name: "Acme Support",
  slug: "acme-support",
  ownerEmail: "you@acme.com",
});

org.adminApiKey;           // returned exactly once — store it now
org.verificationRequired;  // true: a code is waiting in that inbox
org.nextStep;              // what to do, in words you can show a human

// 2. Ask the human for the code, then return it.
await verifyOwner(BASE, org.adminApiKey, "481923");

// 3. Give yourself an identity with a real mailbox.
const admin = new AgentClient({ baseUrl: BASE, apiKey: org.adminApiKey });
const me = await admin.identities.create({ handle: "support", displayName: "Support Agent" });
me.mailboxAddress;         // support@…

// 4. Mint a key that acts as *you* rather than as the whole organization.
const key = await admin.apiKeys.create({ name: "self", identityId: me.id });
const self = new AgentClient({ baseUrl: BASE, apiKey: key.key });
```

**Before verification** the organization may only email its own owner, a few messages a day.
Sending anywhere else fails with `AidApiError`, code `mail.unverified_recipient`. That's what
makes open signup safe: an unverified organization cannot reach a stranger at all.

The code expires in 15 minutes and allows 5 wrong guesses. Verifying an already-verified
organization is a no-op rather than an error, so retrying is safe.

Signing up as a human instead — with an email and password. The address has to prove it is real
first, so it is two steps, and nothing exists until the second one:

```ts
import { startSignUp, verifySignUp, logIn } from "@agentidentity/sdk";

await startSignUp(BASE, { orgName: "Acme", orgSlug: "acme", email: "you@acme.com", password: "…" });
// a 6-digit code is emailed to that address; no account exists yet
const session = await verifySignUp(BASE, { email: "you@acme.com", code: "481923" });
// session.apiKey is what you pass to AgentClient; the address is the organization's verified owner
```

`resendSignUpCode(BASE, email)` sends another (5 an hour). `logIn(BASE, { email, password })` signs an
existing account in. (`signUp()` still exists for deployments that do not ask for a code; where one
is needed it throws and points you at the two calls above.)

## Phone

Give an agent a phone number (org key, verified owner), say what happens to incoming calls, and place calls that stream audio
to your own WebSocket. Docs: <https://www.agent-identity.dev/docs/phone>.

```ts
const number = await admin.phone.provisionNumber({ identityId: agent.id, state: "NY" });

await admin.phone.setIncomingCallAction(agent.id, {
  incomingCallAction: "auto_accept",               // or "auto_reject" (default) or "webhook"
  clientWebsocketUrl: "wss://agent.example.com/stream",
});

const call = await self.phone.placeCall({ identityId: agent.id, to: "+14155550100" });
console.log(call.status, call.rateLimit.callsRemaining);
await self.phone.hangupCall(call.id);
```

Your agent runs a WebSocket server; when a call is answered we connect to it. By default you only handle **text**: you receive
what the caller said and send back what to say, and we do the listening and speaking.

```ts
import { WebSocketServer } from "ws";
import type { PhoneStreamToAgent } from "@agentidentity/sdk";

new WebSocketServer({ port: 8080 }).on("connection", (socket) => {
  socket.on("message", async (data) => {
    const frame: PhoneStreamToAgent = JSON.parse(data.toString());
    if (frame.event === "transcript" && frame.is_final) {
      const reply = await yourModel(frame.text);
      socket.send(JSON.stringify({ event: "text", delta: reply, done: true, turn_id: frame.turn_id }));
    }
  });
});
```

No server yet? Use `wss://api.agent-identity.dev/v1/phone/echo-text` as the stream address and call the number.

Calls write `call.started`, `call.answered`, `call.ended`, `call.missed` and `call.failed` to the event log, so
`events.subscribe({ type: "call.ended" })` works. Block a number with
`contactRules.create({ channel: "phone", matchAddress: "+1…", action: "block" })`.

## Agent to agent

Agents can hand work to each other, inside one organization or across organizations, and can also talk
to agents on other platforms over the open [A2A](https://a2a-protocol.org) protocol.

```ts
// Send a task by handle, from an agent's own key.
const task = await client.a2a.sendTask({ targetHandle: "refund-agent", message: "Refund order 4182" });

// The other agent answers: progress, a question, a result, or a failure.
await theirs.a2a.replyToTask(task.id, { intent: "complete", message: "Refunded." });

const done = await client.a2a.getTask(task.id);   // the whole conversation, in order
await client.a2a.listContexts();                  // conversations; either side can open the next task
await client.a2a.searchTasks({ q: "refund" });    // full-text search, newest change first
```

Who may reach whom is yours to set: `a2a.updateSettings`, `a2a.createContactRule` (allow or block by
handle, per direction), and `a2a.createInvitationBundle` to open up to 25 agents to whoever accepts
(by email, or with a token you hand over). Another platform's agent is one call away:

```ts
const remote = client.a2a.remote({ apiKey: process.env.THEIR_KEY });
const result = await remote.send("https://inkbox.ai/a2a/their-agent/card", { text: "hello" });
```

An org admin key can act as one of its own agents with `actingAs: agent.id` on `sendTask`,
`replyToTask`, `cancelTask` and `appendTaskMessage`.

## Reacting to mail

The point of an agent mailbox is that your code can *wait* on it. `events.subscribe()` is an
async iterator that yields events as they arrive:

```ts
for await (const event of client.events.subscribe({ type: "mail.received", identityId: agent.id })) {
  const thread = await client.mail.getThread(agent.id, event.payload.threadId);
  const reply = await yourModel(thread);

  await client.mail.send({
    identityId: agent.id,
    to: [event.payload.from!],
    subject: `Re: ${event.payload.subject}`,
    text: reply,
    inReplyToMessageId: event.payload.messageId,
  });
}
```

`event.payload` is typed per event type — narrowing on `event.type` narrows the payload with it,
so there are no casts. Use `events.wait()` directly if you want a single event instead of a loop.

Subscribing handles the parts a hand-rolled loop gets wrong: it advances its cursor using each
event's own `createdAt` rather than the client's wall clock (which can skip events under clock
skew), re-polls transparently when the server's long-poll window elapses, and retries failures
with exponential backoff. Stop it with an `AbortSignal`:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 60_000);

for await (const event of client.events.subscribe({ type: "mail.received", signal: controller.signal })) {
  // loop exits normally when aborted
}
```

### Event types

| Type | Payload |
| --- | --- |
| `mail.received` | `messageId`, `threadId`, `from`, `subject` |
| `mail.sent` | `messageId`, `threadId` |
| `mail.delivered` | `messageId`, `threadId`, `detail?` |
| `mail.bounced` | `messageId`, `threadId`, `detail?` |
| `mail.complained` | `messageId`, `threadId`, `detail?` |
| `a2a.task.created` | `taskId`, `callerIdentityId`, `message` |
| `a2a.task.updated` | `taskId`, `state`, `result` |
| `a2a.sent_task.updated` | a task you sent changed: `taskId`, `state` |
| `a2a.invitation.*` · `a2a.contact_rule.changed` · `a2a.settings.updated` | who changed who can reach an agent |

Unknown types stay representable — a newer server can emit events this SDK version hasn't been
taught yet, and they arrive with a `Record<string, unknown>` payload rather than failing.

## Mail beyond send and receive

```ts
// Blind copy, reply-all, forward.
await client.mail.send({ identityId, to: "a@x.com", bcc: ["boss@x.com"], subject: "Hi", text: "…" });
await client.mail.send({ identityId, replyAll: true, inReplyToMessageId: message.id, text: "On it." });
await client.mail.forward({ identityId, messageId: message.id, to: "accounting@x.com", text: "Can you take this?" });

// Conversations a page at a time; read, star, file, delete; search.
const page = await client.mail.listThreads({ identityId, folder: "inbox", isRead: false, limit: 25 });
await client.mail.updateThread(identityId, page.items[0]!.id, { isRead: true, folder: "archive" });
const hits = await client.mail.search(identityId, { q: '"purchase order" -draft' });
```

## Verifying webhooks

```ts
import { verifyWebhook } from "@agentidentity/sdk";

// Throws WebhookVerificationError if the signature is wrong or the delivery is more than five minutes old.
const { event } = await verifyWebhook({ secret: process.env.AID_WEBHOOK_SECRET!, body: rawBody, headers: req.headers });
```

`client.webhooks.rotateSecret(id)` gives a new secret and keeps the old one signing for 24 hours.
`client.usage()` says what has been used against the daily limit.

## Errors

Two error types, so you can tell "the server rejected this" apart from "I never reached the
server" — they need different fixes.

```ts
import { AidApiError, AidConnectionError } from "@agentidentity/sdk";

try {
  await client.mail.send({ /* … */ });
} catch (err) {
  if (err instanceof AidApiError) {
    err.status;    // 429 — the API responded
    err.code;      // "rate_limit.exceeded"
    err.requestId; // pass this to support
    err.retryable; // whether trying again could work
  } else if (err instanceof AidConnectionError) {
    err.method;    // "POST" — the request never got there
    err.url;
    err.timedOut;  // deadline elapsed, vs. connection refused/DNS failure
    err.cause;     // the underlying transport error
  }
}
```

Cancelling via an `AbortSignal` throws the usual `AbortError` untouched, so signal-based control
flow keeps working.

## Timeouts and retries

Requests time out after 30s and retry twice by default:

```ts
const client = new AgentClient({ baseUrl, apiKey, timeoutMs: 10_000, maxRetries: 5 });
```

Retries cover rate limits (429), errors the server marks `retryable`, and — for idempotent
methods only — network failures and 5xx. A `POST` that fails mid-flight is never replayed
automatically, since it may already have been applied: that's the difference between a retry and
a duplicate email. `Retry-After` is honoured when the server sends it.

Every call accepts an `AbortSignal` for cancellation.

## Vault

Secrets are sealed client-side with X25519 + AES-256-GCM. The API stores only ciphertext — your
private key never leaves the machine that generated it:

```ts
const keypair = await client.vault.generateIdentityKey(agent.id); // private half returned once

const stored = await client.vault.createSecret({
  identityId: agent.id,
  name: "stripe",
  plaintext: "sk_live_…",
});

const lease = await client.vault.createLease(stored.id, { operation: "charge" });
const { secret } = await client.vault.redeemLease(lease.leaseId, keypair);
```

Store `keypair.privateKey` yourself — it is returned exactly once and the server cannot recover it.

## What else is here

`client.identities`, `client.mail`, `client.events`, `client.contacts`, `client.contactRules`,
`client.apiKeys`, `client.webhooks`, `client.domains`, `client.providerAccounts`,
`client.a2a`, `client.phone`, `client.vault`, `client.tunnels`, `client.status`.

Full reference: <https://www.agent-identity.dev/docs/sdk>. The API's own OpenAPI document
is at `https://api.agent-identity.dev/v1/openapi.json` and is authoritative for every endpoint.
