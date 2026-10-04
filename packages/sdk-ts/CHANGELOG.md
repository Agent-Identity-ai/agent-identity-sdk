# Changelog

## 0.5.0

Phone: text mode.

**Added**
- Text mode is the default on a call's stream: your agent receives `transcript` events (what the caller said, with partial
  results) and `barge_in`, and replies with `text` that we speak. Both sides are written to the call's transcript. Raw audio
  is opt-in through the handshake headers `X-Use-AID-Speech-To-Text: false` and `X-Use-AID-Text-To-Speech: false`.
- `setIncomingCallAction` takes `voice` and `language`; `IncomingCallActionSettings` returns them. Changing only the
  action keeps the saved addresses, voice and language.
- Types for the stream: `PhoneStreamToAgent`, `PhoneStreamFromAgent`, `PhoneCallContext`.
- Test agents: `wss://api.agent-identity.dev/v1/phone/echo-text` (says back what you said) and `/v1/phone/echo` (plays your voice back).

**Changed**
- A stream that used to receive raw audio by default now receives text unless it sets the two headers above to `false`.

## 0.4.0

Phone (beta).

**Added**
- `client.phone`: `provisionNumber`, `listNumbers`, `getNumber`, `assignNumber`, `releaseNumber`; `getIncomingCallAction` and
  `setIncomingCallAction` (`auto_reject`, `auto_accept`, `webhook`); `placeCall` (returns the organization's rolling 24 hour
  `rateLimit`), `listCalls`, `getCall`, `hangupCall`; `listTranscript` and `appendTranscript`.
- Events `call.started`, `call.answered`, `call.ended`, `call.missed`, `call.failed`.
- `contactRules.create({ channel: "phone", ... })` blocks a phone number for calls in both directions.

## 0.3.3

The package now works from both `import` and `require()`, each with its own type declarations, so editor
completions work in CommonJS projects and under every TypeScript `moduleResolution` setting (it was ESM only).
The README says so, and tells you to restart the TS server if completions do not appear right after installing.

## 0.3.2

Documentation only: a channel table in the README (what is available, what is coming soon) and a link to the
engineering blog.

## 0.3.1

Documentation only: an agent signup prompt at the top of the README, full links to every docs page and `llms.txt`.

## 0.3.0

Agent-to-agent, plus a safer signup.

**Added**
- Mail: `bcc` and `replyAll` on `mail.send`, `mail.forward`; `listThreads` / `iterateThreads` (folders, read state,
  stars, date range with a time zone, cursor paging), `listFolders`, `updateMessage`, `updateThread`, `deleteMessage`,
  `deleteThread`, `search` and `searchOrganization`; `MailMessage.bcc`, `isRead`, `isStarred`; `getThread(…, { markRead })`.
- `verifyWebhook()`: checks a delivery's timestamped signature in constant time and refuses a stale one. Webhooks now
  carry `x-aid-request-id`, `x-aid-timestamp` and `x-aid-signature`; `x-aid-signature-256` is still sent.
  `webhooks.rotateSecret()` keeps the old secret signing for 24 hours. New events: `mail.failed`, `mail.forwarded`, and
  audit events (`api_key.*`, `identity.*`, `webhook.*`); `events.list({ types })` filters by name or family.
- `client.usage()`: email sent today against the limit, when it resets, and agents against the cap.
- `client.a2a`: tasks, replies, cancel, conversations (`listContexts`, `getContext`), full-text search
  (`searchTasks`, `searchMessages`), settings, contact rules, agent cards, the public directory, and
  invitations (`createInvitationBundle`, `previewInvitation`, `acceptInvitationByToken`).
- `client.a2a.remote()` / `A2ARemoteClient`: call any A2A 1.0 agent from its card URL, following the
  credential scheme the card declares (`Authorization: Bearer` or `X-API-Key`).
- `actingAs` on `sendTask`, `replyToTask`, `cancelTask` and `appendTaskMessage`, so an org admin key can act
  as one of its own agents.
- `startSignUp`, `verifySignUp`, `resendSignUpCode`: sign up with an emailed 6-digit code.
- Typed `a2a.*` events, including `a2a.sent_task.updated`.

**Changed**
- `signUp()` throws where the deployment requires the emailed code (the hosted API does), since there is no
  session yet. Use `startSignUp` and `verifySignUp`. This is the one behaviour change to plan for.
- `A2AClient.cancel()` returns the task when it was already canceled, instead of raising
  `TaskNotCancelableError`, so a retried cancel is not a failure.

**Deprecated** (still work): `createTrustRule`, `listTrustRules`, `setEnabled`, `setSkills`, `setListed`,
`updateTask`. Use `a2a.updateSettings`, `a2a.createContactRule` and `a2a.replyToTask`.

## 0.2.0

Mail, durable events and the vault.
