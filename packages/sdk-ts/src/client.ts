import { generateVaultKeypair, vaultDecrypt, vaultEncrypt } from "./vault-crypto.js";
import type { VaultCiphertext, VaultKeypair } from "./vault-crypto.js";
export type { VaultCiphertext, VaultKeypair } from "./vault-crypto.js";
import { AidApiError, AidConnectionError } from "./errors.js";
import { A2ARemoteClient, type A2AClientOptions } from "./a2a-client.js";

export { AidApiError, AidConnectionError } from "./errors.js";

export interface AgentClientOptions {
  /** Base URL of the API, e.g. `https://api.agent-identity.dev`. No trailing slash needed. */
  baseUrl: string;
  /** An org-admin or agent-scoped API key. */
  apiKey: string;
  /** Override the global `fetch` — useful for tests, proxies, or custom agents. */
  fetch?: typeof fetch;
  /**
   * Per-attempt request deadline in milliseconds. Defaults to 30s. Set `0` to disable.
   * The long-polling `events.wait`/`events.subscribe` calls set their own, longer, deadline.
   */
  timeoutMs?: number;
  /**
   * How many times to retry a failed request. Defaults to 2 (three attempts total).
   *
   * Retries apply to rate limits (429), errors the server flags `retryable`, and — for
   * idempotent methods only — network failures and 5xx. A `POST` that fails mid-flight is
   * never replayed automatically, since it may already have been applied.
   */
  maxRetries?: number;
}

export interface CreateIdentityInput {
  handle: string;
  displayName: string;
}

export interface IdentitySummary {
  id: string;
  handle: string;
  status: string;
  mailboxAddress: string;
  vaultPublicKey: string | null;
}

export interface IdentityDetail {
  id: string;
  handle: string;
  displayName: string;
  status: string;
  vaultPublicKey: string | null;
}

export interface AttachmentInput {
  filename: string;
  contentType: string;
  content: Uint8Array;
  contentId?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  contentId: string | null;
}

export interface SendMailInput {
  identityId: string;
  /** Required, unless `replyAll` works the recipients out from the message it answers. */
  to?: string | string[];
  cc?: string[];
  /** Blind copies: delivered, but named in no header anyone receives. Only your own copy lists them. */
  bcc?: string[];
  /** With `inReplyToMessageId`: answer everyone on it. Anything in `to` / `cc` is added. */
  replyAll?: boolean;
  subject?: string;
  text?: string;
  html?: string;
  inReplyToMessageId?: string;
  attachments?: AttachmentInput[];
  idempotencyKey?: string;
}

export interface MailParticipant {
  address: string;
  name: string | null;
}

export interface MailMessage {
  id: string;
  threadId: string;
  direction: string;
  status: string;
  lastError: string | null;
  providerMessageId: string | null;
  from: MailParticipant[];
  to: MailParticipant[];
  cc: MailParticipant[];
  /** Blind copies. Only on a message you sent; always empty on anything you received. */
  bcc: MailParticipant[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  folder: string | null;
  /** Your mark on your own copy. What you send starts read; what you receive starts unread. */
  isRead: boolean;
  isStarred: boolean;
  createdAt: string;
}

export type MailFolderName = "inbox" | "sent" | "drafts" | "spam" | "archive" | "blocked";
/** Where a person can file mail. The other folders are decided by what the mail is. */
export type MovableMailFolder = "inbox" | "archive" | "spam";

export interface MailThreadSummary {
  id: string;
  subject: string | null;
  /** Messages of this conversation in the folder asked about. */
  messageCount: number;
  unreadCount: number;
  starred: boolean;
  lastMessageAt: string;
  latestMessageId: string;
  latestFrom: MailParticipant[];
  /** The start of the latest message, for a list. */
  latestSnippet: string;
  hasAttachments: boolean;
}

export interface ListMailThreadsInput {
  identityId: string;
  /** Default: everything except spam, blocked and drafts. */
  folder?: MailFolderName | "all";
  /** `false`: only conversations with something unread. */
  isRead?: boolean;
  starred?: boolean;
  /** RFC 3339, or a date-time with no offset read in `tz`. */
  startDatetime?: string;
  endDatetime?: string;
  /** An IANA zone such as `Europe/Tallinn`. */
  tz?: string;
  /** 1 to 100, default 50. */
  limit?: number;
  cursor?: string;
}

export interface MailFolderCount {
  folder: MailFolderName;
  threads: number;
  messages: number;
  unread: number;
}

export interface SearchMailInput {
  /** Whole words in any case. Several words means all of them; `"in quotes"` is a phrase; `-word` excludes. */
  q: string;
  /** 1 to 100, default 20. */
  limit?: number;
  /** Spam and blocked mail are left out unless asked for. */
  includeSpam?: boolean;
}

export interface MailSearchHit {
  messageId: string;
  threadId: string;
  /** Whose mailbox, on an organization-wide search. */
  identityId: string | null;
  folder: string;
  subject: string | null;
  from: MailParticipant[];
  snippet: string;
  at: string;
  rank: number;
}

export interface ForwardMailInput {
  identityId: string;
  messageId: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  /** Written above the forwarded message. */
  text?: string;
  idempotencyKey?: string;
}

export interface DraftMailInput {
  identityId: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  text?: string;
  html?: string;
  inReplyToMessageId?: string;
  attachments?: AttachmentInput[];
}

export interface MailThread {
  id: string;
  subject: string | null;
  messages: MailMessage[];
}

export interface WaitForEventInput<T extends AidEventType | string = string> {
  /** The event type to wait for, e.g. `"mail.received"`. */
  type: T;
  identityId?: string;
  aggregateType?: string;
  aggregateId?: string;
  filter?: { threadId?: string };
  since?: Date | string;
  timeoutMs?: number;
}

/** The agent on the other end of an A2A event, with its organization — enough to act on without a
 *  second lookup. */
export interface A2AInvitationEventPayload {
  invitationId: string;
  change: "created" | "accepted" | "declined" | "revoked";
  status: string;
  fromIdentityId: string;
  fromHandle: string;
  toIdentityId: string;
  toHandle: string;
  actor: A2AEventActor;
}

/** Who made a change: an org key (`user`) or an agent acting for itself (`agent`). */
export interface A2AEventActor {
  type: "user" | "agent";
  id: string;
}

export interface A2AEventParticipant {
  identityId: string;
  organizationId: string;
  handle: string;
}

/**
 * Payload shape for each event type the platform emits, keyed by `type`.
 *
 * This is the discriminant for {@link AidEvent}: narrowing on `event.type` narrows
 * `event.payload` with it, so you never have to cast.
 *
 * ```ts
 * if (event.type === "mail.received") {
 *   event.payload.subject; // string | null — checked, not asserted
 * }
 * ```
 */
export interface AidEventPayloadMap {
  /** A message was accepted by the provider for delivery. */
  "mail.sent": { messageId: string; threadId: string };
  /** Inbound mail landed in an identity's mailbox. */
  "mail.received": {
    messageId: string;
    threadId: string;
    from: string | null;
    subject: string | null;
  };
  /** The provider confirmed delivery to the recipient's server. */
  "mail.delivered": { messageId: string; threadId: string; detail?: string };
  /** The recipient's server rejected the message. `detail` carries the provider's reason. */
  "mail.bounced": { messageId: string; threadId: string; detail?: string };
  /** The recipient marked the message as spam. */
  "mail.complained": { messageId: string; threadId: string; detail?: string };
  /** A send failed: the provider refused it, or could not be reached. `detail` says why. */
  "mail.failed": { messageId: string; threadId: string; detail?: string };
  /** A message was forwarded. `messageId` is the new one; `forwardedMessageId` is the one that was sent on. */
  "mail.forwarded": { messageId: string; threadId: string; forwardedMessageId: string };
  /** Another agent opened a task against one of your identities. Delivered to the worker. */
  "a2a.task.created": {
    taskId: string;
    contextId: string;
    state: string;
    callerIdentityId: string;
    caller: A2AEventParticipant;
    /** The request as plain text; `parts` carries the structured form. */
    message: string;
    /** The id the sender gave the request for safe retries, or null. */
    messageId: string | null;
    parts: A2APart[];
  };
  /** The agent that opened a task added a message to it — often the answer to a question the worker
   *  asked. Delivered to the worker, alongside the state the task is now in. */
  "a2a.task.message": {
    taskId: string;
    contextId: string;
    state: string;
    caller: A2AEventParticipant;
    messageId: string | null;
    parts: A2APart[];
  };
  /** The agent that sent a task withdrew it. Delivered to the worker, which should stop. */
  "a2a.task.canceled": {
    taskId: string;
    contextId: string;
    state: string;
    callerIdentityId: string;
    caller: A2AEventParticipant;
  };
  /** A task you sent moved: the worker replied, so the state, result and the reply itself are here.
   *  This is the event to wait on from the sending side. */
  "a2a.sent_task.updated": {
    taskId: string;
    contextId: string;
    state: string;
    result: string | null;
    worker: A2AEventParticipant;
    /** The reply's id, or null when the move carried no message. */
    messageId: string | null;
    parts: A2APart[];
  };
  /** The original name for `a2a.sent_task.updated`, kept with its original, smaller shape. */
  "a2a.task.updated": { taskId: string; contextId: string; state: string; result: string | null };
  /** Audit: a rule about who may reach an agent was created, changed or removed. Written to the log
   *  of the organization that owns the agent. A save that changes nothing writes nothing. */
  "a2a.contact_rule.changed": {
    change: "created" | "updated" | "deleted";
    ruleId: string;
    identityId: string;
    handle: string;
    action: A2ARuleAction;
    direction: A2ARuleDirection;
    /** What it was before, for an update. */
    previous?: { action: A2ARuleAction; direction?: A2ARuleDirection };
    actor: A2AEventActor;
    /** Set when the rule was written on someone's behalf: `invitation:<id>` or `trust_rule`. */
    via?: string;
  };
  /** Audit: an agent's A2A settings changed. Only the fields that actually changed appear. */
  "a2a.settings.updated": {
    identityId: string;
    changes: Partial<Record<"enabled" | "publiclyDiscoverable" | "allowPublicEgress" | "filterMode" | "skills", { from: unknown; to: unknown }>>;
    actor: A2AEventActor;
  };
  /** Audit: an invitation between two agents. Both organizations keep a record of it. */
  "a2a.invitation.created": A2AInvitationEventPayload;
  "a2a.invitation.accepted": A2AInvitationEventPayload;
  "a2a.invitation.declined": A2AInvitationEventPayload;
  "a2a.invitation.revoked": A2AInvitationEventPayload;
}

/** Every event type with a known payload shape. */
export type AidEventType = keyof AidEventPayloadMap;

interface AidEventBase {
  id: string;
  identityId: string | null;
  aggregateType: string | null;
  aggregateId: string | null;
  createdAt: string;
}

/** An event of one specific known type, with its payload narrowed to match. */
export interface KnownAidEvent<T extends AidEventType = AidEventType> extends AidEventBase {
  type: T;
  payload: AidEventPayloadMap[T];
}

/**
 * An event whose `type` this SDK version doesn't know about yet. Servers may emit new event
 * types before the SDK is updated, so this stays open rather than making a newer server's
 * events unrepresentable — but the payload is unknown until you check it.
 */
export interface UnknownAidEvent extends AidEventBase {
  type: Exclude<string, AidEventType>;
  payload: Record<string, unknown>;
}

/**
 * An event read from the event log. Discriminated on `type`: comparing against a known type
 * narrows `payload` to the matching shape in {@link AidEventPayloadMap}.
 */
export type AidEvent = { [T in AidEventType]: KnownAidEvent<T> }[AidEventType] | UnknownAidEvent;

/** The result of {@link AgentClient.events.wait}, narrowed to the type you waited for. */
export interface WaitForEventResult<T extends AidEventType | string = string> {
  event: (T extends AidEventType ? KnownAidEvent<T> : AidEvent) | null;
  /** True when the server's long-poll window elapsed with no matching event. */
  timedOut: boolean;
}

/** Options for {@link AgentClient.events.subscribe}. */
export interface SubscribeInput<T extends AidEventType | string = string>
  extends Omit<WaitForEventInput<T>, "timeoutMs"> {
  /**
   * How long each underlying long-poll waits before the server reports a timeout and the
   * iterator quietly re-polls. Lower values mean more requests, not missed events.
   * Defaults to 25s.
   */
  pollTimeoutMs?: number;
  /** Stops the iterator. The `for await` loop exits normally rather than throwing. */
  signal?: AbortSignal;
  /**
   * Called when a poll fails, before the iterator backs off and retries. Return `false` to
   * stop instead of retrying. Without a handler, transient failures are retried forever.
   */
  onError?: (error: unknown, attempt: number) => boolean | void;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  /**
   * The human who owns this organization. Naming one emails them a six-digit code; returning it
   * through {@link verifyOwner} lifts the restrictions an unverified organization runs under.
   *
   * Without it the organization stays unverified: a few messages a day, and no way to prove a
   * human is behind it.
   */
  ownerEmail?: string;
}

export interface OrganizationBootstrap {
  id: string;
  slug: string;
  name: string;
  /** Returned exactly once. There is no endpoint that will show it again. */
  adminApiKey: string;
  ownerEmail: string | null;
  /** True when a code has been emailed and the organization is waiting for it. */
  verificationRequired: boolean;
  /** What to do next, in words you can act on or show to a human. */
  nextStep: string;
}

export interface WhoAmI {
  actorType: string;
  actorId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
}

export interface Usage {
  /** A human has proved they are behind the organization. Until then the limits are the low ones. */
  verified: boolean;
  mail: {
    /** Messages sent so far in the current UTC day. Refused sends are not counted. */
    sentToday: number;
    dailyLimit: number;
    remaining: number;
    /** When the count starts again: 00:00 UTC. */
    resetsAt: string;
    /** Until verified, email can go only to this address. Null once it is verified. */
    ownerAddressOnly: string | null;
  };
  identities: { count: number; limit: number };
}

export interface ApiKeySummary {
  id: string;
  identityId: string | null;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  identityId?: string;
}

export interface CreatedApiKey {
  id: string;
  key: string;
  keyPrefix: string;
}

export interface WebhookEndpoint {
  id: string;
  identityId: string | null;
  url: string;
  /** Empty = every event type. Non-empty = only these types are delivered here. */
  eventTypes: string[];
  status: string;
  createdAt: string;
}

export interface CreateWebhookEndpointInput {
  url: string;
  /** Scope delivery to one identity's events only — omit for org-wide. */
  identityId?: string;
  /** Only deliver these event types — omit (or empty) for every event type. */
  eventTypes?: string[];
}

export interface CreatedWebhookEndpoint {
  id: string;
  identityId: string | null;
  url: string;
  secret: string;
  eventTypes: string[];
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  attemptCount: number;
  status: string;
  nextAttemptAt: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  eventCreatedAt: string;
}

export interface VaultSecretSummary {
  id: string;
  identityId: string;
  name: string;
  version: number;
  status: string;
  createdAt: string;
}

export interface CreateVaultSecretInput {
  name: string;
  identityId: string;
  plaintext: string;
}

export interface CreateLeaseInput {
  operation: string;
  ttlSeconds?: number;
  identityId?: string;
}

export interface CreatedLease {
  leaseId: string;
  operation: string;
  expiresAt: string;
}

export interface ContactEmail {
  value: string;
  label: string | null;
}
export interface ContactPhone {
  value: string;
  label: string | null;
}
export interface ContactWebsite {
  value: string;
  label: string | null;
}
export interface ContactAddress {
  label: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}
export interface ContactDate {
  label: string | null;
  date: string;
}
export interface ContactCustomField {
  label: string;
  value: string;
}

export interface Contact {
  id: string;
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  emails: ContactEmail[];
  phones: ContactPhone[];
  websites: ContactWebsite[];
  addresses: ContactAddress[];
  dates: ContactDate[];
  customFields: ContactCustomField[];
  notes: string | null;
  status: "suggested" | "saved";
  sourceIdentityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWriteInput {
  prefix?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  displayName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  emails?: ContactEmail[];
  phones?: ContactPhone[];
  websites?: ContactWebsite[];
  addresses?: ContactAddress[];
  dates?: ContactDate[];
  customFields?: ContactCustomField[];
  notes?: string | null;
}

export type CreateContactInput = ContactWriteInput;
export type UpdateContactInput = ContactWriteInput;

export interface ContactRule {
  id: string;
  identityId: string | null;
  channel: string;
  matchAddress: string;
  action: "allow" | "block";
  createdAt: string;
}

export interface CreateContactRuleInput {
  identityId?: string;
  /** What the rule is about. Default `email`. A `phone` rule matches one E.164 number and blocks calls to and from it. */
  channel?: "email" | "phone";
  matchAddress: string;
  action: "allow" | "block";
}

// ── Phone ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type IncomingCallAction = "auto_reject" | "auto_accept" | "webhook";

export interface PhoneNumber {
  id: string;
  /** The agent the number is for. Null while it is held but not assigned. */
  identityId: string | null;
  /** E.164, such as `+14155550100`. */
  number: string;
  provider: string;
  status: string;
  createdAt: string;
}

/** A number in the carrier account that no agent has yet. */
export interface CarrierNumber {
  number: string;
  /** False when it does not point at this server's voice application, so calls to it would not arrive. */
  ready: boolean;
}

export interface ProvisionPhoneNumberInput {
  identityId: string;
  /** A number already in the carrier account (E.164). It is attached to the agent and nothing is bought. */
  number?: string;
  /** US state, such as `NY`. */
  state?: string;
  /** Default `auto_reject`: incoming calls are refused until you choose. */
  incomingCallAction?: IncomingCallAction;
  clientWebsocketUrl?: string;
  incomingCallWebhookUrl?: string;
}

export interface IncomingCallActionSettings {
  identityId: string;
  incomingCallAction: IncomingCallAction;
  /** The `wss://` URL the call's audio is streamed to when the call is answered. */
  clientWebsocketUrl: string | null;
  /** The `https://` URL asked what to do with an incoming call. */
  incomingCallWebhookUrl: string | null;
  /** How the agent sounds in text mode, such as `AWS.Polly.Joanna-Neural`. Null means the server's default. */
  voice: string | null;
  /** BCP-47, such as `en-US`. Null means the server's default. */
  language: string | null;
  /** Verifies the incoming-call webhook (`x-aid-signature`) and the media connection. Present for the `webhook` action. */
  signingSecret: string | null;
}

export interface SetIncomingCallActionInput {
  incomingCallAction: IncomingCallAction;
  clientWebsocketUrl?: string | null;
  incomingCallWebhookUrl?: string | null;
  /** How the agent sounds in text mode: `<Provider>.<Voice>`. Left out means unchanged; null returns to the default. */
  voice?: string | null;
  /** BCP-47, for speaking and listening. Left out means unchanged; null returns to the default. */
  language?: string | null;
}

export type CallStatus = "initiated" | "answered" | "ended";

export interface Call {
  id: string;
  identityId: string | null;
  direction: "incoming" | "outgoing";
  from: string | null;
  to: string | null;
  status: CallStatus;
  mode: "client_websocket";
  clientWebsocketUrl: string | null;
  /** `local`: our side ended it. `remote`: the other party. `rejected`: refused before connecting. `failed`: never connected. */
  hangupReason: "local" | "remote" | "rejected" | "failed" | null;
  hangupCause: string | null;
  durationSeconds: number | null;
  /** Refused because the caller is blocked. Only org keys see these. */
  isBlocked: boolean;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

/** The organization's use over a rolling 24 hours, returned with every placed call. */
export interface CallRateLimit {
  callsUsed: number;
  callsRemaining: number;
  callsLimit: number;
  minutesUsed: number;
  minutesRemaining: number;
  minutesLimit: number;
}

export interface PlacedCall extends Call {
  rateLimit: CallRateLimit;
}

export interface PlaceCallInput {
  identityId: string;
  /** E.164. */
  to: string;
  /** One of the agent's numbers. Default: its number. */
  from?: string;
  /** `wss://`. Default: the agent's incoming call setting. */
  clientWebsocketUrl?: string;
  idempotencyKey?: string;
}

export interface ListCallsInput {
  identityId: string;
  limit?: number;
  offset?: number;
  isBlocked?: boolean;
  /** RFC 3339 with an offset. */
  startDatetime?: string;
  endDatetime?: string;
}

export interface TranscriptSegment {
  seq: number;
  /** `remote` is the other party, `local` is the agent. */
  party: "local" | "remote" | "system";
  text: string;
  /** Milliseconds from the start of the call. */
  tsMs: number;
}

export interface TranscriptSegmentInput {
  party: "local" | "remote" | "system";
  text: string;
  tsMs?: number;
}

export interface A2ATrustRule {
  id: string;
  identityId: string;
  peerIdentityId: string;
  createdAt: string;
}

export interface CreateA2ATrustRuleInput {
  identityId: string;
  peerIdentityId: string;
}

/** A2A task lifecycle state — matches the real Agent2Agent protocol's state machine. */
export type A2ATaskState =
  | "submitted"
  | "working"
  | "input_required"
  | "auth_required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected";

/** A page of results. Pass `nextCursor` back, with the same filters, for the next page; `null` means that
 *  was the last. Paging is by cursor, so what changes while you page is never skipped or repeated. */
export interface A2APage<T> {
  items: T[];
  nextCursor: string | null;
}

/** A task as a listing shows it: no messages, but who sent it and who it went to. */
export type A2ATaskListing = Omit<A2ATask, "messages"> & {
  /** The handle of the agent that sent the task. */
  callerHandle: string;
  /** The handle of the agent it was sent to. */
  targetHandle: string;
};

/** A message as a search shows it, with the task it belongs to. */
export interface A2AMessageListing extends A2AMessage {
  taskId: string;
  contextId: string;
  taskState: A2ATaskState;
  callerHandle: string;
  targetHandle: string;
}

/** Which of an agent's tasks: those sent to it, those it sent, or both. */
export type A2ADirection = "inbound" | "outbound" | "both";

export interface SearchA2ATasksInput {
  /** The agent whose tasks to search. Required with an org key; an agent key searches its own. */
  identityId?: string;
  /** `inbound`: sent to the agent. `outbound`: sent by it. `both` (default): either. */
  direction?: A2ADirection;
  /** Who sent the task, and who it was sent to, by handle. */
  requesterHandle?: string;
  workerHandle?: string;
  state?: A2ATaskState;
  /** One conversation. */
  contextId?: string;
  /** Words to find anywhere in the task's messages — the request, replies, structured data. Whole words, any
   *  case; several words means all of them; `"in quotes"` means that phrase. */
  q?: string;
  /** Only tasks that changed after this moment. */
  since?: Date | string;
  /** 1–100, default 50. */
  limit?: number;
  cursor?: string;
}

export interface SearchA2AMessagesInput {
  identityId?: string;
  direction?: A2ADirection;
  /** `caller` wrote it as the sender; `agent` as the worker. */
  role?: "caller" | "agent";
  taskId?: string;
  contextId?: string;
  q?: string;
  since?: Date | string;
  limit?: number;
  cursor?: string;
}

/** One entry of a directory. */
export interface A2ADirectoryAgent {
  handle: string;
  displayName: string;
  skills: A2ASkill[];
  /** Read the card here, and from it how to call the agent. */
  cardUrl: string;
  /** `public`: in the public directory. `organization`: visible only inside its own organization. */
  visibility: "public" | "organization";
  /** Only in the organization directory. */
  identityId?: string;
}

export interface A2ADirectoryQuery {
  /** Words to find in a handle, display name or skill: 1–100 characters. Any case; spacing is ignored. */
  q?: string;
  /** 1–100, default 50. */
  limit?: number;
  /** The `nextCursor` of the previous page. Only valid for the same directory and the same `q`. */
  cursor?: string;
}

/** One piece of a message: plain text, or any JSON value. */
export type A2APart = { text: string } | { data: unknown };

export interface A2AMessage {
  id: string;
  /** The id the sender gave it (for safe retries), or null. */
  messageId: string | null;
  /** `caller` wrote it as the agent that opened the task; `agent` as the worker. */
  role: "caller" | "agent";
  parts: A2APart[];
  createdAt: string;
}

export interface A2ATask {
  id: string;
  /** The conversation this task belongs to — see {@link A2AContext}. */
  contextId: string;
  targetIdentityId: string;
  callerIdentityId: string;
  state: A2ATaskState;
  /** The opening request as plain text (structured parts are rendered as JSON). */
  message: string;
  /** The worker's latest result text, if any. */
  result: string | null;
  createdAt: string;
  updatedAt: string;
  /** The full conversation, oldest first. Present when you fetch or change a single task
   *  (`sendTask`, `getTask`, `updateTask`, `appendTaskMessage`), left out of `listTasks`. */
  messages?: A2AMessage[];
}

/** A durable conversation between exactly two agents. Many independent tasks can live in one, and
 *  either agent can open the next — in either direction. */
export interface A2AContext {
  id: string;
  name: string;
  openedByIdentityId: string;
  peerIdentityId: string;
  createdAt: string;
  updatedAt: string;
}

export interface A2AContextSummary extends A2AContext {
  taskCount: number;
}

export interface A2AContextDetail extends A2AContext {
  tasks: A2ATask[];
}

/** What to say: `message` (plain text) or `parts` (text and/or JSON) — exactly one of the two. */
export type A2AContent =
  | { message: string; parts?: never }
  | { parts: A2APart[]; message?: never };

/** What a worker means by a reply. Each implies one state: `progress` → `working` (repeatable),
 *  `ask_caller` → `input_required`, `complete` → `completed`, `fail` → `failed`. */
export type A2AReplyIntent = "progress" | "ask_caller" | "complete" | "fail";

/** With an org admin key: act as this one of the organization's agents. An agent key needs no such thing. */
export interface ActingAs {
  actingAs?: string;
}

export type ReplyToA2ATaskInput = A2AContent & ActingAs & {
  intent: A2AReplyIntent;
  /** A stable id for this reply. Sending it again changes nothing and returns the task as it is —
   *  even if the task has finished in the meantime — so it is safe to retry after a timeout. */
  messageId?: string;
};

export interface AppendA2AMessageOptions extends ActingAs {
  /** A stable id for this request. Sending it again is a no-op that returns the task as it is. */
  messageId?: string;
}

/**
 * Address the target by `targetHandle` (with or without a leading `@`; handles are globally
 * unique) or by `targetIdentityId` — exactly one of the two.
 */
export type SendA2ATaskInput = A2AContent &
  ActingAs &
  (
    | { targetIdentityId: string; targetHandle?: never }
    | { targetHandle: string; targetIdentityId?: never }
  ) & {
    /** Continue an existing conversation instead of opening one. Either agent in it may do this,
     *  including the one that did not open it. The target must be the other participant. */
    contextId?: string;
    /** A stable id for this request. Sending it again returns the task already created rather
     *  than a second one, so it is safe to retry after a timeout. */
    messageId?: string;
  };

export interface UpdateA2ATaskInput {
  state: A2ATaskState;
  result?: string;
}

/** One thing an agent says it can do. On the card, and what an owner writes with
 *  {@link AgentClient.a2a}`.updateSettings`. */
export interface A2ASkill {
  /** Unique within the agent: lowercase letters, numbers, and single `-` `_` `.` separators. */
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

/** A skill as an owner writes it: `tags` and `examples` may be left out. */
export type A2ASkillInput = Pick<A2ASkill, "id" | "name" | "description"> & Partial<Pick<A2ASkill, "tags" | "examples">>;

/** A2A 1.0 `SecurityScheme`, in its JSON form: an object with exactly one of these keys. */
export type AgentCardSecurityScheme =
  | { apiKeySecurityScheme: { description?: string; location: "query" | "header" | "cookie"; name: string } }
  | { httpAuthSecurityScheme: { description?: string; scheme: string; bearerFormat?: string } };

/**
 * An agent's public card — the A2A 1.0 `AgentCard`. Read it before deciding to call an agent:
 * `supportedInterfaces` says where and how (most preferred first), `securitySchemes` how to
 * authenticate, and `skills` what it does.
 */
export interface AgentCard {
  /** `@handle`. */
  name: string;
  description: string;
  /** Most preferred first. Ours is `AGENT-IDENTITY`, an open-form binding name of our own; the
   *  A2A-defined ones are `JSONRPC`, `GRPC` and `HTTP+JSON`. */
  supportedInterfaces: { url: string; protocolBinding: string; protocolVersion: string; tenant?: string }[];
  /** The platform the agent runs on. */
  provider?: { url: string; organization: string };
  version: string;
  documentationUrl?: string;
  capabilities: { streaming?: boolean; pushNotifications?: boolean; extendedAgentCard?: boolean };
  securitySchemes?: Record<string, AgentCardSecurityScheme>;
  securityRequirements?: { schemes: Record<string, { list: string[] }> }[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: (Omit<A2ASkill, "examples"> & { examples?: string[] })[];
  iconUrl?: string;
}

export type A2ARuleAction = "allow" | "block";
/** From the rule owner's side: `inbound` = tasks it receives from that peer, `outbound` = tasks it
 *  sends to that peer, `both` = either. A rule for the exact direction beats a `both` rule. */
export type A2ARuleDirection = "inbound" | "outbound" | "both";
/** What an agent does with a private cross-organization call that no rule mentions: `whitelist`
 *  refuses it, `blacklist` accepts it. */
export type A2AFilterMode = "whitelist" | "blacklist";

/** A rule an agent's owner wrote about one peer. See {@link AgentClient.a2a}. */
export interface A2AContactRule {
  id: string;
  /** The agent that owns the rule. */
  identityId: string;
  /** The peer it is about, lowercased and without `@`. */
  handle: string;
  action: A2ARuleAction;
  direction: A2ARuleDirection;
  createdAt: string;
  updatedAt: string;
}

export interface CreateA2AContactRuleInput {
  /** The agent the rule belongs to. */
  identityId: string;
  /** The peer, by handle, with or without `@`. It need not exist yet or be in your organization. */
  handle: string;
  action: A2ARuleAction;
  /** Defaults to `both`. */
  direction?: A2ARuleDirection;
}

export interface A2ASettings {
  identityId: string;
  enabled: boolean;
  /** Listed in the public directory, and open to calls from any agent with `allowPublicEgress`. */
  publiclyDiscoverable: boolean;
  /** May call publicly discoverable agents in other organizations without a rule. */
  allowPublicEgress: boolean;
  filterMode: A2AFilterMode;
  /** What the owner wrote. Empty means none set: the card then shows one general skill. */
  skills: A2ASkill[];
}

export interface UpdateA2ASettingsInput {
  enabled?: boolean;
  /** Skills to advertise — at most 32, ids unique, each needs a `name` and `description`. `null`
   *  clears them, so the card falls back to its single general skill. */
  skills?: A2ASkillInput[] | null;
  /** Org key only. */
  publiclyDiscoverable?: boolean;
  allowPublicEgress?: boolean;
  /** Org key only. */
  filterMode?: A2AFilterMode;
}

export interface A2AAgentOverview {
  identityId: string;
  handle: string;
  enabled: boolean;
  skills: string[];
  listed: boolean;
  allowPublicEgress: boolean;
  filterMode: A2AFilterMode;
  inboundTasks: number;
  outboundTasks: number;
}

export interface A2ADirectoryEntry {
  identityId: string;
  handle: string;
  orgName: string;
  skills: string[];
}

export type A2AInvitationStatus = "pending" | "awaiting_verification" | "accepted" | "declined" | "revoked" | "expired";

export interface A2AInvitationPeer {
  identityId: string;
  handle: string;
}

export interface A2AInvitation {
  id: string;
  /** The first of the issuer's agents it opens. */
  fromIdentityId: string;
  /** Who it is for (pairwise form) or who accepted it. Null while an open one waits. */
  toIdentityId: string | null;
  acceptedByIdentityId: string | null;
  status: A2AInvitationStatus;
  message: string | null;
  /** Only on invitations you sent. */
  recipientEmail: string | null;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface A2AInvitationWithContext extends A2AInvitation {
  fromHandle: string;
  toHandle: string | null;
  direction: "sent" | "received";
  /** Every issuer agent it opens. */
  peers: A2AInvitationPeer[];
}

/** The original form: one of your agents and one named agent. */
export interface CreateA2AInvitationInput {
  fromIdentityId: string;
  toIdentityId: string;
  message?: string;
}

/** Opens up to 25 of your agents to whichever agent accepts. */
export interface CreateA2AInvitationBundleInput {
  peerIdentityIds: string[];
  /** Email the invitation. Leave out to get the token back, once, to hand over yourself. */
  recipientEmail?: string;
  /** 1 hour to 30 days. Default 168 (7 days). */
  expiresInHours?: number;
  message?: string;
}

export interface CreatedA2AInvitation extends A2AInvitation {
  peers?: A2AInvitationPeer[];
  /** Shown once, only for an invitation with no `recipientEmail`. Whoever holds it can accept. */
  invitationToken?: string;
  invitationUrl?: string;
  /** Instructions to give the receiving agent, token included. */
  agentHandoffPrompt?: string;
}

export interface A2AInvitationPreview {
  status: A2AInvitationStatus;
  /** Only while it is still open. */
  issuerName?: string;
  message?: string | null;
  peers?: Array<{ handle: string; displayName: string }>;
  expiresAt?: string;
  emailBound?: boolean;
}

export interface AcceptedA2AInvitation {
  invitation: A2AInvitation;
  connectedTo: A2AInvitationPeer[];
}

export interface DomainVerification {
  recordType: "TXT";
  recordName: string;
  recordValue: string;
}

export interface Domain {
  id: string;
  domain: string;
  status: "pending" | "verified";
  verification: DomainVerification;
  verifiedAt: string | null;
  createdAt: string;
}

export interface DeliverabilityRecord {
  purpose: "spf" | "dkim" | "dmarc";
  recordType: "TXT";
  recordName: string;
  recordValue: string | null;
  note: string;
}

export interface DeliverabilityGuidance {
  providerKind: string;
  records: DeliverabilityRecord[];
}

export interface ProviderAccount {
  id: string;
  kind: string;
  status: "active" | "disabled";
  createdAt: string;
}

export interface CreateProviderAccountInput {
  kind: string;
  config: Record<string, unknown>;
}

export interface ProviderHealth {
  healthy: boolean;
  detail: string | null;
  source: "custom" | "default";
}

export interface IdentitySuspension {
  id: string;
  identityId: string;
  reason: string;
  suspendedBy: string;
  suspendedAt: string;
  reinstatedAt: string | null;
  reinstatedBy: string | null;
}

export interface VaultLease {
  id: string;
  secretId: string;
  secretName: string;
  identityId: string;
  identityHandle: string;
  operation: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface Tunnel {
  id: string;
  identityId: string;
  hostname: string;
  status: string;
  connected: boolean;
  edgeUrl: string;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  createdAt: string;
}

export interface CreateTunnelInput {
  hostname?: string;
}

export async function createOrganization(
  baseUrl: string,
  input: CreateOrganizationInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OrganizationBootstrap> {
  const body = await sendRequest(fetchImpl, baseUrl, "POST", "/v1/organizations", {
    body: {
      name: input.name,
      slug: input.slug,
      ...(input.ownerEmail !== undefined ? { owner_email: input.ownerEmail } : {}),
    },
  });
  const b = body as {
    id: string;
    slug: string;
    name: string;
    admin_api_key: string;
    owner_email: string | null;
    verification_required: boolean;
    next_step: string;
  };
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    adminApiKey: b.admin_api_key,
    ownerEmail: b.owner_email ?? null,
    verificationRequired: Boolean(b.verification_required),
    nextStep: b.next_step ?? "",
  };
}

/**
 * Completes signup by returning the six-digit code emailed to the organization's owner.
 *
 * Until this succeeds the organization may only email that owner, and only a few times a day.
 * Any key belonging to the organization can call it — the secret is the code, which reaches the
 * human's inbox, so the agent that started the flow can also finish it.
 *
 * ```ts
 * const org = await createOrganization(baseUrl, { name, slug, ownerEmail: "you@example.com" });
 * // ask the human for the code that just arrived, then:
 * await verifyOwner(baseUrl, org.adminApiKey, code);
 * ```
 */
export async function verifyOwner(
  baseUrl: string,
  apiKey: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ verified: true; orgId: string }> {
  const body = await sendRequest(fetchImpl, baseUrl, "POST", "/v1/auth/verify", {
    headers: { authorization: `Bearer ${apiKey}` },
    body: { code },
  });
  const b = body as { verified: true; org_id: string };
  return { verified: true, orgId: b.org_id };
}

export interface SignUpInput {
  orgName: string;
  orgSlug: string;
  email: string;
  password: string;
}

export interface LogInInput {
  email: string;
  password: string;
}

export interface AuthSession {
  apiKey: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
}

function toAuthSession(body: unknown): AuthSession {
  const b = body as { api_key: string; org_id: string; org_name: string; org_slug: string };
  return { apiKey: b.api_key, orgId: b.org_id, orgName: b.org_name, orgSlug: b.org_slug };
}

/** A signup that is waiting for the code emailed to its address. Nothing exists yet: no account, no organization, no key. */
export interface PendingSignUp {
  email: string;
  expiresInMinutes: number;
}

export type StartedSignUp =
  | ({ verificationRequired: true } & PendingSignUp)
  /** Where verification is switched off the account exists straight away. */
  | { verificationRequired: false; session: AuthSession };

/**
 * Starts signing up. On a deployment that verifies addresses (the hosted one does) this emails a 6-digit code and
 * creates nothing: finish with {@link verifySignUp}. Elsewhere it creates the account and returns the session.
 */
export async function startSignUp(
  baseUrl: string,
  input: SignUpInput,
  fetchImpl: typeof fetch = fetch,
): Promise<StartedSignUp> {
  const body = await sendRequest(fetchImpl, baseUrl, "POST", "/v1/auth/signup", {
    body: { org_name: input.orgName, org_slug: input.orgSlug, email: input.email, password: input.password },
  });
  const b = body as { status?: string; email?: string; expires_in_minutes?: number };
  if (b.status === "verification_required") {
    return { verificationRequired: true, email: b.email!, expiresInMinutes: b.expires_in_minutes! };
  }
  return { verificationRequired: false, session: toAuthSession(body) };
}

/** Finishes a signup with the code emailed to the address. Five wrong guesses burn the code. */
export async function verifySignUp(
  baseUrl: string,
  input: { email: string; code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AuthSession> {
  const body = await sendRequest(fetchImpl, baseUrl, "POST", "/v1/auth/signup/verify", {
    body: { email: input.email, code: input.code },
  });
  return toAuthSession(body);
}

/** Emails a fresh code for a signup that is waiting. At most 5 an hour per address. */
export async function resendSignUpCode(
  baseUrl: string,
  email: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PendingSignUp> {
  const body = (await sendRequest(fetchImpl, baseUrl, "POST", "/v1/auth/signup/resend", { body: { email } })) as {
    email: string;
    expires_in_minutes: number;
  };
  return { email: body.email, expiresInMinutes: body.expires_in_minutes };
}

/**
 * Signs up and returns the session. Throws when the deployment asks for the emailed code first, since there is no
 * session yet: use {@link startSignUp} and {@link verifySignUp} instead.
 */
export async function signUp(
  baseUrl: string,
  input: SignUpInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthSession> {
  const started = await startSignUp(baseUrl, input, fetchImpl);
  if (started.verificationRequired) {
    throw new Error(
      `${started.email} has to be verified first: a code was emailed to it. Finish with verifySignUp(baseUrl, { email, code }).`,
    );
  }
  return started.session;
}

export async function logIn(
  baseUrl: string,
  input: LogInInput,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthSession> {
  const body = await sendRequest(fetchImpl, baseUrl, "POST", "/v1/auth/login", {
    body: { email: input.email, password: input.password },
  });
  return toAuthSession(body);
}

/** Resolves after `ms`, or as soon as `signal` aborts (whichever comes first). */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class AgentClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  readonly identities: {
    create(input: CreateIdentityInput): Promise<IdentitySummary>;
    list(): Promise<IdentitySummary[]>;
    get(id: string): Promise<IdentityDetail>;
    suspend(id: string, reason: string): Promise<void>;
    reinstate(id: string): Promise<void>;
    listSuspensions(): Promise<IdentitySuspension[]>;
  };
  readonly mail: {
    send(input: SendMailInput): Promise<MailMessage>;
    /** Sends a message on as a new conversation: the original is quoted below, its attachments go with it, and
     *  its own bcc is never shown. */
    forward(input: ForwardMailInput): Promise<MailMessage>;
    listMessages(identityId: string): Promise<MailMessage[]>;
    /** One conversation. With `markRead` opening it reads it; what comes back is how it was before. */
    getThread(identityId: string, threadId: string, options?: { markRead?: boolean }): Promise<MailThread>;
    /** Conversations, most recently active first, a page at a time. */
    listThreads(input: ListMailThreadsInput): Promise<A2APage<MailThreadSummary>>;
    /** Every conversation matching, following the cursors for you. */
    iterateThreads(input: Omit<ListMailThreadsInput, "cursor">): AsyncGenerator<MailThreadSummary, void, undefined>;
    /** What is in each folder, and how much of it is unread. */
    listFolders(identityId: string): Promise<MailFolderCount[]>;
    /** Read, star or file one message. */
    updateMessage(
      identityId: string,
      messageId: string,
      patch: { isRead?: boolean; isStarred?: boolean; folder?: MovableMailFolder },
    ): Promise<MailMessage>;
    /** Mark a whole conversation read or unread, or move all of it. Returns how many messages changed. */
    updateThread(
      identityId: string,
      threadId: string,
      patch: { isRead?: boolean; folder?: MovableMailFolder },
    ): Promise<{ changed: number }>;
    /** Deletes one message for good, and its attachments. The conversation goes with its last message. */
    deleteMessage(identityId: string, messageId: string): Promise<void>;
    /** Deletes a conversation for good: every message in it and every attachment. */
    deleteThread(identityId: string, threadId: string): Promise<void>;
    /** Full-text search of one mailbox: subject, body and every address. Best match first, then newest. */
    search(identityId: string, input: SearchMailInput): Promise<MailSearchHit[]>;
    /** The same search across every mailbox in the organization. Org admin only. */
    searchOrganization(input: SearchMailInput): Promise<MailSearchHit[]>;
    saveDraft(input: DraftMailInput): Promise<MailMessage>;
    listDrafts(identityId: string): Promise<MailMessage[]>;
    updateDraft(identityId: string, messageId: string, input: Omit<DraftMailInput, "identityId" | "inReplyToMessageId">): Promise<MailMessage>;
    deleteDraft(identityId: string, messageId: string): Promise<void>;
    sendDraft(identityId: string, messageId: string): Promise<MailMessage>;
    markSpam(identityId: string, messageId: string): Promise<MailMessage>;
    unmarkSpam(identityId: string, messageId: string): Promise<MailMessage>;
    listAttachments(identityId: string, messageId: string): Promise<Attachment[]>;
    downloadAttachment(
      identityId: string,
      messageId: string,
      attachmentId: string,
    ): Promise<{ contentType: string; filename: string; bytes: Uint8Array }>;
  };
  readonly events: {
    /**
     * Long-polls for the next event of `type`, resolving as soon as one arrives or when the
     * server's window elapses (`timedOut: true`). Narrows the payload when `type` is a known
     * event type.
     *
     * Prefer {@link AgentClient.events.subscribe} for a continuous loop — it handles the
     * cursor and retries for you.
     */
    wait<T extends AidEventType | string = string>(
      input: WaitForEventInput<T>,
      options?: { signal?: AbortSignal },
    ): Promise<WaitForEventResult<T>>;
    /**
     * Yields matching events continuously, as an async iterator.
     *
     * Handles the three things a hand-written `wait` loop gets wrong: it advances the cursor
     * using each event's own `createdAt` (not the client's wall clock, which can skip events
     * and is vulnerable to clock skew), it re-polls transparently on timeout, and it retries
     * failures with exponential backoff.
     *
     * ```ts
     * for await (const event of client.events.subscribe({ type: "mail.received", identityId })) {
     *   await handle(event.payload.messageId); // payload is typed
     * }
     * ```
     */
    subscribe<T extends AidEventType | string = string>(
      input: SubscribeInput<T>,
    ): AsyncIterableIterator<T extends AidEventType ? KnownAidEvent<T> : AidEvent>;
    /** Reads recent events newest-first. `before` takes an ISO timestamp for paging back. */
    list(options?: { limit?: number; before?: string; types?: string[] }): Promise<AidEvent[]>;
    /** Re-delivers an event to its webhook endpoints. */
    replay(id: string): Promise<{ id: string; replayed: true }>;
  };
  readonly apiKeys: {
    list(): Promise<ApiKeySummary[]>;
    create(input: CreateApiKeyInput): Promise<CreatedApiKey>;
    revoke(id: string): Promise<ApiKeySummary>;
  };
  readonly webhooks: {
    list(): Promise<WebhookEndpoint[]>;
    create(input: CreateWebhookEndpointInput): Promise<CreatedWebhookEndpoint>;
    /** Gives the webhook a new signing secret, shown once. The old one keeps signing for 24 hours too, so a
     *  receiver can switch without losing a delivery. */
    rotateSecret(id: string): Promise<{ id: string; secret: string; previousSecretValidUntil: string }>;
    listDeliveries(options?: { limit?: number; before?: string }): Promise<WebhookDelivery[]>;
  };
  readonly vault: {
    /** Generates an X25519 keypair locally (never sent to the server), registers the public half
     *  against the identity, and returns both — the private half is returned exactly once and
     *  must be stored by the caller (e.g. as that agent's own env var/config secret). Zero
     *  knowledge starts here: the API server never sees a private key. */
    generateIdentityKey(identityId: string): Promise<VaultKeypair>;
    listSecrets(): Promise<VaultSecretSummary[]>;
    /** Encrypts `plaintext` locally against the target identity's registered vault public key
     *  (ECIES over X25519) before it ever reaches the network — the server only stores/forwards
     *  the resulting ciphertext envelope. */
    createSecret(input: CreateVaultSecretInput): Promise<VaultSecretSummary>;
    /** Only the owning identity can rotate its own secret — it's the only party with the private
     *  key to decrypt the current envelope and re-encrypt under a fresh ephemeral key. Requires
     *  that identity's own keypair (from `generateIdentityKey`). */
    rotateSecret(secretId: string, keypair: VaultKeypair): Promise<VaultSecretSummary>;
    createLease(secretId: string, input: CreateLeaseInput): Promise<CreatedLease>;
    /** Redeems the lease and decrypts the envelope locally using the owning identity's private
     *  key — the server never decrypts anything. */
    redeemLease(leaseId: string, keypair: VaultKeypair): Promise<{ secret: string }>;
    listLeases(options?: { limit?: number }): Promise<VaultLease[]>;
  };
  readonly tunnels: {
    create(identityId: string, input?: CreateTunnelInput): Promise<Tunnel>;
    list(identityId: string): Promise<Tunnel[]>;
    get(tunnelId: string): Promise<Tunnel>;
  };
  readonly phone: {
    /** Buy a number and give it to an agent. Spends money: org key and a verified owner. One number per agent. */
    provisionNumber(input: ProvisionPhoneNumberInput): Promise<PhoneNumber>;
    listNumbers(): Promise<PhoneNumber[]>;
    /** Numbers already in the carrier account that no agent has yet. Org key only. */
    listCarrierNumbers(): Promise<CarrierNumber[]>;
    getNumber(id: string): Promise<PhoneNumber>;
    /** Move a number to another agent, or detach it with `null`. */
    assignNumber(id: string, identityId: string | null): Promise<PhoneNumber>;
    /** Give the number back to the carrier. Irreversible. */
    releaseNumber(id: string): Promise<void>;
    getIncomingCallAction(identityId: string): Promise<IncomingCallActionSettings>;
    /**
     * What happens to a call that arrives on the agent's number: `auto_reject`, `auto_accept` (answer and stream audio to
     * `clientWebsocketUrl`), or `webhook` (ask `incomingCallWebhookUrl`; reply `{"action":"answer"|"reject"}`).
     */
    setIncomingCallAction(identityId: string, input: SetIncomingCallActionInput): Promise<IncomingCallActionSettings>;
    /** Place a call. Needs a verified owner. 429 when a daily quota or the live-call limit is reached. */
    placeCall(input: PlaceCallInput): Promise<PlacedCall>;
    listCalls(input: ListCallsInput): Promise<Call[]>;
    getCall(id: string): Promise<Call>;
    /** End a call from outside it. Safe to repeat. */
    hangupCall(id: string): Promise<Call>;
    listTranscript(callId: string): Promise<TranscriptSegment[]>;
    /** Write what was heard (`remote`) and said (`local`). Audio is not transcribed for you. */
    appendTranscript(callId: string, segments: TranscriptSegmentInput[]): Promise<TranscriptSegment[]>;
  };
  readonly contacts: {
    create(input: CreateContactInput): Promise<Contact>;
    list(options?: { status?: "suggested" | "saved" }): Promise<Contact[]>;
    get(id: string): Promise<Contact>;
    update(id: string, input: UpdateContactInput): Promise<Contact>;
    delete(id: string): Promise<void>;
    approve(id: string): Promise<Contact>;
    reject(id: string): Promise<void>;
  };
  readonly contactRules: {
    create(input: CreateContactRuleInput): Promise<ContactRule>;
    list(): Promise<ContactRule[]>;
    delete(id: string): Promise<void>;
  };
  readonly a2a: {
    /**
     * Say who may send tasks to an agent, or whom it may send tasks to. Org key only; an agent can
     * read its own with {@link listContactRules}.
     *
     * A call has a requester and a worker, and both ends must agree. In order:
     *   1. Both agents must have A2A enabled.
     *   2. An explicit `block` from either side refuses the call, beating everything below.
     *   3. Agents in the same organization connect with no rule at all.
     *   4. A worker that is `publiclyDiscoverable` takes calls from any agent with
     *      `allowPublicEgress` — no rule needed.
     *   5. Otherwise it is a private cross-organization call: each side needs an `allow` rule, or
     *      no rule at all if its `filterMode` is `blacklist`.
     *
     * Saving a rule for the same agent, peer and direction changes the existing one.
     */
    createContactRule(input: CreateA2AContactRuleInput): Promise<A2AContactRule>;
    /** An org key lists the organization's rules (or one agent's); an agent key lists its own. */
    listContactRules(identityId?: string): Promise<A2AContactRule[]>;
    updateContactRule(id: string, patch: { action?: A2ARuleAction; direction?: A2ARuleDirection }): Promise<A2AContactRule>;
    deleteContactRule(id: string): Promise<void>;
    /** An agent's A2A settings — the org admin's, or the agent's own. */
    getSettings(identityId: string): Promise<A2ASettings>;
    /** Change settings. An agent key can change its own `enabled`, `allowPublicEgress` and
     *  `skills`; `publiclyDiscoverable` and `filterMode` — who can reach it — need the org key. */
    updateSettings(identityId: string, patch: UpdateA2ASettingsInput): Promise<A2ASettings>;
    /** @deprecated Use {@link createContactRule}. Writes "allow inbound from that peer" (and the
     *  matching outbound allow on the peer). Agents in one organization no longer need it. */
    createTrustRule(input: CreateA2ATrustRuleInput): Promise<A2ATrustRule>;
    /** @deprecated Use {@link listContactRules}. */
    listTrustRules(): Promise<A2ATrustRule[]>;
    /** @deprecated Use {@link deleteContactRule}. Removing a trust rule does not block anything —
     *  write a `block` rule for that. */
    deleteTrustRule(id: string): Promise<void>;
    /** Must be called with an agent-scoped key. Refused (403) unless both agents have A2A enabled and
     *  the call is admitted — see {@link createContactRule} for the order.
     *
     *  Two more limits apply to sending, both reported as an `AidApiError`:
     *  - `org.not_verified` (403): an organization whose owner has not been verified can only send to
     *    agents in its own organization. Verify with `verifyOwner`.
     *  - `rate_limit.exceeded` (429, `retryable`): per agent (30/minute), per pair of agents
     *    (60/hour) and per organization across organizations (300/hour). The client waits out
     *    `Retry-After` and retries for you. Repeated `messageId`s and refused requests are free. */
    sendTask(input: SendA2ATaskInput): Promise<A2ATask>;
    getTask(id: string): Promise<A2ATask>;
    /** @deprecated Returns every task, unfiltered and unpaged. Use {@link searchTasks}. */
    listTasks(identityId: string): Promise<A2ATask[]>;
    /**
     * The tasks an agent takes part in, most recently changed first, a page at a time. `direction`
     * splits the ones it sent from the ones sent to it. Both agents' handles come with each task.
     */
    searchTasks(input?: SearchA2ATasksInput): Promise<A2APage<A2ATaskListing>>;
    /** Every task matching, following the cursors for you: `for await (const task of a2a.iterateTasks({ q }))`. */
    iterateTasks(input?: Omit<SearchA2ATasksInput, "cursor">): AsyncGenerator<A2ATaskListing, void, undefined>;
    /** Individual messages across the agent's tasks, newest first, a page at a time. */
    searchMessages(input?: SearchA2AMessagesInput): Promise<A2APage<A2AMessageListing>>;
    iterateMessages(input?: Omit<SearchA2AMessagesInput, "cursor">): AsyncGenerator<A2AMessageListing, void, undefined>;
    /**
     * The public directory: every agent that is enabled and publicly discoverable, by handle. It names no
     * organization or owner. Needs no key; the key this client holds is not required for it.
     */
    directory(query?: A2ADirectoryQuery): Promise<A2APage<A2ADirectoryAgent>>;
    iterateDirectory(query?: Omit<A2ADirectoryQuery, "cursor">): AsyncGenerator<A2ADirectoryAgent, void, undefined>;
    /** Every A2A-enabled agent in your own organization, public or not. Each says whether it is also public. */
    orgDirectory(query?: A2ADirectoryQuery): Promise<A2APage<A2ADirectoryAgent>>;
    iterateOrgDirectory(query?: Omit<A2ADirectoryQuery, "cursor">): AsyncGenerator<A2ADirectoryAgent, void, undefined>;
    /** The worker answers a task: report `progress`, `ask_caller` a question, `complete` it, or
     *  `fail` it. The intent implies the state, and the reply is recorded as an agent message and as
     *  the task's `result`. Only the agent the task was sent to can call it; a finished task rejects
     *  with a 409 (`a2a.task_terminal`). The sender is told via `a2a.task.updated`. */
    replyToTask(taskId: string, input: ReplyToA2ATaskInput): Promise<A2ATask>;
    /** The agent that opened a task withdraws it. Repeating a cancel succeeds; a task that finished
     *  any other way rejects with a 409. The worker is told via `a2a.task.canceled`. */
    cancelTask(taskId: string, options?: ActingAs): Promise<A2ATask>;
    /** @deprecated Use {@link replyToTask}, which says what happened and validates the move.
     *  Still works: only the target identity's own key can move a task's state. */
    updateTask(id: string, input: UpdateA2ATaskInput): Promise<A2ATask>;
    /** Adds a message to a task you opened that is still open — answering a question the worker
     *  asked, or adding detail. Only the agent that opened the task can; a task waiting in
     *  `input_required` goes back to `working`. */
    appendTaskMessage(taskId: string, content: A2AContent & AppendA2AMessageOptions): Promise<A2ATask>;
    /** Conversations an agent takes part in, most recently active first. With an agent key this
     *  is your own; with an org key pass the identity. */
    listContexts(identityId?: string): Promise<A2AContextSummary[]>;
    /** One conversation with its tasks (without their messages — fetch a task for those). */
    getContext(id: string): Promise<A2AContextDetail>;
    /** Either participant can rename a context: 1–5 words, at most 80 characters. */
    renameContext(id: string, name: string): Promise<A2AContext>;
    /**
     * A client for calling agents over the A2A 1.0 protocol — agents on this platform or anyone's. It
     * reads each agent's card and follows it, so the same code reaches another vendor's agent.
     *
     * With no `apiKey` it authenticates with this client's own key, but **only to this platform's own
     * origin**: pointed at anyone else's card it sends nothing, rather than hand your key to a stranger.
     * For another vendor's agent, pass that vendor's key: `remote({ apiKey })`.
     */
    remote(options?: Omit<A2AClientOptions, "fetch">): A2ARemoteClient;
    /** Publicly reachable, no auth — same as any real A2A server's well-known agent-card. */
    getAgentCard(identityId: string): Promise<AgentCard>;
    /** The same card by handle — the URL you give another agent is `<baseUrl>/a2a/<handle>/card`.
     *  Rejects with a 404 for a handle that doesn't exist or hasn't enabled A2A. */
    getAgentCardByHandle(handle: string): Promise<AgentCard>;
    /** The card an agent would publish, for its owner (org key) or the agent itself. Unlike the
     *  public card it works while A2A is off, so you can check it before switching on. */
    previewAgentCard(identityId: string): Promise<AgentCard>;
    /** Every agent in the organization with its A2A settings and handle. Org key only. */
    listSettings(): Promise<Array<A2ASettings & { handle: string }>>;
    /** Org-admin only — every identity, its enable state, advertised skills, and task counts. */
    listAgentOverviews(): Promise<A2AAgentOverview[]>;
    /** @deprecated Use {@link updateSettings}. Org-admin only. An identity must be enabled before it
     *  can send OR receive tasks. */
    setEnabled(identityId: string, enabled: boolean): Promise<void>;
    /** @deprecated Use {@link updateSettings} with full `skills`. Sets skills from plain names; each
     *  becomes a skill whose description is its name. Org-admin only. */
    setSkills(identityId: string, skills: string[]): Promise<void>;
    /** @deprecated Use {@link updateSettings} with `publiclyDiscoverable`. Org-admin only. Lists the
     *  identity in the public directory **and opens it to tasks from any agent with
     *  `allowPublicEgress`**, no rule needed — being listed is being callable. */
    setListed(identityId: string, listed: boolean): Promise<void>;
    /** Any authenticated actor, any org — searches identities that opted into the directory
     *  (enabled + listed) by handle substring. */
    searchDirectory(query?: string): Promise<A2ADirectoryEntry[]>;
    /** Org-admin only. Invites another identity — same org or a different one entirely — to a
     *  mutual trust relationship. Nothing is trusted until the invited org's admin accepts. */
    createInvitation(input: CreateA2AInvitationInput): Promise<A2AInvitation>;
    /** Org-admin only. Opens 1–25 of your agents to whichever agent accepts, in both directions.
     *  With `recipientEmail` we email a link; without it the result carries `invitationToken` once. */
    createInvitationBundle(input: CreateA2AInvitationBundleInput): Promise<CreatedA2AInvitation>;
    /** What a token offers and who sent it. No account needed; changes nothing. */
    previewInvitation(token: string): Promise<A2AInvitationPreview>;
    /** Accept with a token. An agent key accepts for itself; an org key must pass `identityId`.
     *  A used, declined, revoked or expired invitation is a 409. */
    acceptInvitationByToken(token: string, identityId?: string): Promise<AcceptedA2AInvitation>;
    /** Refuse with a token. No account needed; repeating it is fine. */
    declineInvitationByToken(token: string): Promise<A2AInvitation>;
    /** Org-admin only — invitations sent or received by any of this org's identities. */
    listInvitations(): Promise<A2AInvitationWithContext[]>;
    /** Only the invited identity's own org admin can accept — creates mutual trust rules in both
     *  directions atomically. */
    acceptInvitation(id: string): Promise<A2AInvitation>;
    /** Only the invited identity's own org admin can decline. */
    declineInvitation(id: string): Promise<A2AInvitation>;
    /** Only the inviting identity's own org admin can revoke, and only while still pending. */
    revokeInvitation(id: string): Promise<A2AInvitation>;
  };
  readonly domains: {
    add(domain: string): Promise<Domain>;
    list(): Promise<Domain[]>;
    verify(id: string): Promise<Domain>;
    delete(id: string): Promise<void>;
    deliverability(id: string): Promise<DeliverabilityGuidance>;
  };
  readonly providerAccounts: {
    create(input: CreateProviderAccountInput): Promise<ProviderAccount>;
    list(): Promise<ProviderAccount[]>;
    delete(id: string): Promise<void>;
  };
  readonly providers: {
    health(): Promise<ProviderHealth>;
  };
  /** Liveness and readiness probes. Unauthenticated on the server, but exposed here so callers
   *  can reuse one configured client rather than hand-rolling a fetch. */
  readonly status: {
    /** Resolves if the API process is up. Does not check its dependencies. */
    health(): Promise<{ status: string }>;
    /** Resolves only if the API can reach its database. Throws {@link AidApiError} (503) if not. */
    ready(): Promise<{ status: string }>;
  };

  constructor(options: AgentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;

    this.identities = {
      create: async (input) =>
        toIdentitySummary(
          await this.request("POST", "/v1/identities", {
            body: { handle: input.handle, display_name: input.displayName },
          }),
        ),
      list: async () => {
        const body = await this.request("GET", "/v1/identities");
        return (body as unknown[]).map(toIdentitySummary);
      },
      get: async (id) => toIdentityDetail(await this.request("GET", `/v1/identities/${encodeURIComponent(id)}`)),
      suspend: async (id, reason) => {
        await this.request("POST", `/v1/identities/${encodeURIComponent(id)}/suspend`, { body: { reason } });
      },
      reinstate: async (id) => {
        await this.request("POST", `/v1/identities/${encodeURIComponent(id)}/reinstate`);
      },
      listSuspensions: async () => {
        const body = await this.request("GET", "/v1/identities/suspensions");
        return (body as unknown[]).map(toIdentitySuspension);
      },
    };

    this.mail = {
      send: async (input) => {
        const headers: Record<string, string> = {};
        if (input.idempotencyKey !== undefined) headers["idempotency-key"] = input.idempotencyKey;
        const body = await this.request(
          "POST",
          `/v1/identities/${encodeURIComponent(input.identityId)}/mail/send`,
          {
            headers,
            body: {
              to: input.to === undefined ? [] : Array.isArray(input.to) ? input.to : [input.to],
              ...(input.cc !== undefined ? { cc: input.cc } : {}),
              ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
              ...(input.replyAll !== undefined ? { reply_all: input.replyAll } : {}),
              ...(input.subject !== undefined ? { subject: input.subject } : {}),
              ...(input.text !== undefined ? { text: input.text } : {}),
              ...(input.html !== undefined ? { html: input.html } : {}),
              ...(input.inReplyToMessageId !== undefined
                ? { in_reply_to_message_id: input.inReplyToMessageId }
                : {}),
              ...(toAttachmentInputs(input.attachments) !== undefined
                ? { attachments: toAttachmentInputs(input.attachments) }
                : {}),
            },
          },
        );
        return toMailMessage(body);
      },
      forward: async (input) => {
        const headers: Record<string, string> = {};
        if (input.idempotencyKey !== undefined) headers["idempotency-key"] = input.idempotencyKey;
        return toMailMessage(
          await this.request(
            "POST",
            `/v1/identities/${encodeURIComponent(input.identityId)}/mail/messages/${encodeURIComponent(input.messageId)}/forward`,
            {
              headers,
              body: {
                to: Array.isArray(input.to) ? input.to : [input.to],
                ...(input.cc !== undefined ? { cc: input.cc } : {}),
                ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
                ...(input.text !== undefined ? { text: input.text } : {}),
              },
            },
          ),
        );
      },
      listMessages: async (identityId) => {
        const body = await this.request(
          "GET",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/messages`,
        );
        return (body as unknown[]).map(toMailMessage);
      },
      getThread: async (identityId, threadId, options) =>
        toMailThread(
          await this.request(
            "GET",
            `/v1/identities/${encodeURIComponent(identityId)}/mail/threads/${encodeURIComponent(threadId)}${
              options?.markRead ? "?mark_read=true" : ""
            }`,
          ),
        ),
      listThreads: async (input) => {
        const params = new URLSearchParams();
        if (input.folder !== undefined) params.set("folder", input.folder);
        if (input.isRead !== undefined) params.set("is_read", String(input.isRead));
        if (input.starred !== undefined) params.set("starred", String(input.starred));
        if (input.startDatetime !== undefined) params.set("start_datetime", input.startDatetime);
        if (input.endDatetime !== undefined) params.set("end_datetime", input.endDatetime);
        if (input.tz !== undefined) params.set("tz", input.tz);
        if (input.limit !== undefined) params.set("limit", String(input.limit));
        if (input.cursor !== undefined) params.set("cursor", input.cursor);
        const qs = params.toString();
        const body = (await this.request(
          "GET",
          `/v1/identities/${encodeURIComponent(input.identityId)}/mail/threads${qs ? `?${qs}` : ""}`,
        )) as { items: unknown[]; next_cursor: string | null };
        return { items: body.items.map(toMailThreadSummary), nextCursor: body.next_cursor };
      },
      iterateThreads: (input) => pages((cursor) => this.mail.listThreads({ ...input, ...(cursor ? { cursor } : {}) })),
      listFolders: async (identityId) =>
        ((await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/mail/folders`)) as MailFolderCount[]).map(
          (f) => ({ folder: f.folder, threads: f.threads, messages: f.messages, unread: f.unread }),
        ),
      updateMessage: async (identityId, messageId, patch) =>
        toMailMessage(
          await this.request(
            "PATCH",
            `/v1/identities/${encodeURIComponent(identityId)}/mail/messages/${encodeURIComponent(messageId)}`,
            {
              body: {
                ...(patch.isRead !== undefined ? { is_read: patch.isRead } : {}),
                ...(patch.isStarred !== undefined ? { is_starred: patch.isStarred } : {}),
                ...(patch.folder !== undefined ? { folder: patch.folder } : {}),
              },
            },
          ),
        ),
      updateThread: async (identityId, threadId, patch) =>
        (await this.request(
          "PATCH",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/threads/${encodeURIComponent(threadId)}`,
          {
            body: {
              ...(patch.isRead !== undefined ? { is_read: patch.isRead } : {}),
              ...(patch.folder !== undefined ? { folder: patch.folder } : {}),
            },
          },
        )) as { changed: number },
      deleteMessage: async (identityId, messageId) => {
        await this.request(
          "DELETE",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/messages/${encodeURIComponent(messageId)}`,
        );
      },
      deleteThread: async (identityId, threadId) => {
        await this.request(
          "DELETE",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/threads/${encodeURIComponent(threadId)}`,
        );
      },
      search: async (identityId, input) =>
        ((await this.request(
          "GET",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/search?${searchParams(input)}`,
        )) as unknown[]).map(toMailSearchHit),
      searchOrganization: async (input) =>
        ((await this.request("GET", `/v1/mail/search?${searchParams(input)}`)) as unknown[]).map(toMailSearchHit),
      saveDraft: async (input) =>
        toMailMessage(
          await this.request("POST", `/v1/identities/${encodeURIComponent(input.identityId)}/mail/drafts`, {
            body: {
              ...(input.to !== undefined ? { to: input.to } : {}),
              ...(input.cc !== undefined ? { cc: input.cc } : {}),
              ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
              ...(input.subject !== undefined ? { subject: input.subject } : {}),
              ...(input.text !== undefined ? { text: input.text } : {}),
              ...(input.html !== undefined ? { html: input.html } : {}),
              ...(input.inReplyToMessageId !== undefined
                ? { in_reply_to_message_id: input.inReplyToMessageId }
                : {}),
              ...(toAttachmentInputs(input.attachments) !== undefined
                ? { attachments: toAttachmentInputs(input.attachments) }
                : {}),
            },
          }),
        ),
      listDrafts: async (identityId) => {
        const body = await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/mail/drafts`);
        return (body as unknown[]).map(toMailMessage);
      },
      updateDraft: async (identityId, messageId, input) =>
        toMailMessage(
          await this.request(
            "PATCH",
            `/v1/identities/${encodeURIComponent(identityId)}/mail/drafts/${encodeURIComponent(messageId)}`,
            {
              body: {
                ...(input.to !== undefined ? { to: input.to } : {}),
                ...(input.cc !== undefined ? { cc: input.cc } : {}),
                ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
                ...(input.subject !== undefined ? { subject: input.subject } : {}),
                ...(input.text !== undefined ? { text: input.text } : {}),
                ...(input.html !== undefined ? { html: input.html } : {}),
                ...(toAttachmentInputs(input.attachments) !== undefined
                  ? { attachments: toAttachmentInputs(input.attachments) }
                  : {}),
              },
            },
          ),
        ),
      deleteDraft: async (identityId, messageId) => {
        await this.request(
          "DELETE",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/drafts/${encodeURIComponent(messageId)}`,
        );
      },
      sendDraft: async (identityId, messageId) =>
        toMailMessage(
          await this.request(
            "POST",
            `/v1/identities/${encodeURIComponent(identityId)}/mail/drafts/${encodeURIComponent(messageId)}/send`,
          ),
        ),
      markSpam: async (identityId, messageId) =>
        toMailMessage(
          await this.request(
            "POST",
            `/v1/identities/${encodeURIComponent(identityId)}/mail/messages/${encodeURIComponent(messageId)}/mark-spam`,
          ),
        ),
      unmarkSpam: async (identityId, messageId) =>
        toMailMessage(
          await this.request(
            "POST",
            `/v1/identities/${encodeURIComponent(identityId)}/mail/messages/${encodeURIComponent(messageId)}/unmark-spam`,
          ),
        ),
      listAttachments: async (identityId, messageId) => {
        const body = await this.request(
          "GET",
          `/v1/identities/${encodeURIComponent(identityId)}/mail/messages/${encodeURIComponent(messageId)}/attachments`,
        );
        return (body as unknown[]).map(toAttachment);
      },
      downloadAttachment: async (identityId, messageId, attachmentId) => {
        const url = `${this.baseUrl.replace(/\/$/, "")}/v1/identities/${encodeURIComponent(identityId)}/mail/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/download`;
        const res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${this.apiKey}` } });
        if (!res.ok) {
          const text = await res.text().catch(() => undefined);
          let data: unknown;
          try {
            data = text ? JSON.parse(text) : undefined;
          } catch {
            data = text;
          }
          throw new AidApiError(res.status, data);
        }
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        const disposition = res.headers.get("content-disposition") ?? "";
        const filenameMatch = /filename="([^"]*)"/.exec(disposition);
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { contentType, filename: filenameMatch?.[1] ?? "attachment", bytes };
      },
    };

    this.events = {
      wait: async (input, options) => {
        const params = new URLSearchParams({ type: input.type });
        if (input.identityId !== undefined) params.set("identity_id", input.identityId);
        if (input.aggregateType !== undefined) params.set("aggregate_type", input.aggregateType);
        if (input.aggregateId !== undefined) params.set("aggregate_id", input.aggregateId);
        if (input.filter?.threadId !== undefined) params.set("thread_id", input.filter.threadId);
        if (input.since !== undefined) {
          params.set("since", input.since instanceof Date ? input.since.toISOString() : input.since);
        }
        if (input.timeoutMs !== undefined) params.set("timeout_ms", String(input.timeoutMs));
        // This endpoint deliberately holds the connection open, so the client's normal request
        // deadline would abort a perfectly healthy long-poll. Allow the server's own window
        // plus a margin for travel, and fall back to a generous default when unspecified.
        const pollWindowMs = (input.timeoutMs ?? 25_000) + 10_000;
        // `T` only narrows payload types for callers; the decoded shape is the same either
        // way, so the assertion is confined to this one line rather than leaking to callers.
        return toWaitForEventResult(
          await this.request("GET", `/v1/events/wait?${params.toString()}`, {
            timeoutMs: pollWindowMs,
            ...(options?.signal !== undefined ? { signal: options.signal } : {}),
          }),
        ) as WaitForEventResult<never>;
      },
      subscribe: (input) => {
        // Cursor discipline is the whole point of this helper. A hand-written loop typically
        // does `since = new Date()` after each wait returns, which (a) uses the *client's*
        // clock against server-assigned timestamps, so skew silently skips events, and (b)
        // covers the gap between the event's own createdAt and the reset. Advancing strictly
        // to the last delivered event's createdAt has neither problem.
        // `wait` is an arrow bound to the client, so detaching it here is safe and avoids
        // aliasing `this` into the iterator object below.
        const waitForEvent = this.events.wait;
        const pollTimeoutMs = input.pollTimeoutMs ?? 25_000;
        let cursor: string | undefined =
          input.since === undefined
            ? undefined
            : input.since instanceof Date
              ? input.since.toISOString()
              : input.since;
        let attempt = 0;
        let done = false;

        const iterator: AsyncIterableIterator<never> = {
          [Symbol.asyncIterator]() {
            return iterator;
          },
          async next() {
            for (;;) {
              if (done || input.signal?.aborted) return { done: true, value: undefined };
              try {
                const result = await waitForEvent(
                  {
                    ...input,
                    timeoutMs: pollTimeoutMs,
                    ...(cursor !== undefined ? { since: cursor } : {}),
                  } as WaitForEventInput<string>,
                  ...(input.signal !== undefined ? [{ signal: input.signal }] : []),
                );
                attempt = 0;
                if (result.timedOut || !result.event) continue;
                cursor = result.event.createdAt;
                return { done: false, value: result.event as never };
              } catch (err) {
                if (input.signal?.aborted) return { done: true, value: undefined };
                attempt += 1;
                if (input.onError?.(err, attempt) === false) {
                  done = true;
                  return { done: true, value: undefined };
                }
                // Exponential backoff, capped — a server restart shouldn't become a hot loop.
                const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
                await sleep(delay, input.signal);
              }
            }
          },
          async return() {
            done = true;
            return { done: true, value: undefined };
          },
        };
        return iterator as AsyncIterableIterator<never>;
      },
      list: async (options) => {
        const params = new URLSearchParams();
        if (options?.limit !== undefined) params.set("limit", String(options.limit));
        if (options?.before !== undefined) params.set("before", options.before);
        if (options?.types?.length) params.set("types", options.types.join(","));
        const query = params.toString();
        const body = await this.request("GET", `/v1/events${query ? `?${query}` : ""}`);
        return (body as unknown[]).map(toEvent);
      },
      replay: async (id) => {
        const body = await this.request("POST", `/v1/events/${encodeURIComponent(id)}/replay`);
        return body as { id: string; replayed: true };
      },
    };

    this.apiKeys = {
      list: async () => {
        const body = await this.request("GET", "/v1/api-keys");
        return (body as unknown[]).map(toApiKeySummary);
      },
      create: async (input) =>
        toCreatedApiKey(
          await this.request("POST", "/v1/api-keys", {
            body: {
              name: input.name,
              ...(input.identityId !== undefined ? { identity_id: input.identityId } : {}),
            },
          }),
        ),
      revoke: async (id) =>
        toApiKeySummary(await this.request("POST", `/v1/api-keys/${encodeURIComponent(id)}/revoke`)),
    };

    this.webhooks = {
      list: async () => {
        const body = await this.request("GET", "/v1/webhooks");
        return (body as unknown[]).map(toWebhookEndpoint);
      },
      rotateSecret: async (id) => {
        const b = (await this.request("POST", `/v1/webhooks/${encodeURIComponent(id)}/rotate-secret`)) as {
          id: string;
          secret: string;
          previous_secret_valid_until: string;
        };
        return { id: b.id, secret: b.secret, previousSecretValidUntil: b.previous_secret_valid_until };
      },
      create: async (input) =>
        toCreatedWebhookEndpoint(
          await this.request("POST", "/v1/webhooks", {
            body: {
              url: input.url,
              ...(input.identityId !== undefined ? { identity_id: input.identityId } : {}),
              ...(input.eventTypes !== undefined ? { event_types: input.eventTypes } : {}),
            },
          }),
        ),
      listDeliveries: async (options) => {
        const params = new URLSearchParams();
        if (options?.limit !== undefined) params.set("limit", String(options.limit));
        if (options?.before !== undefined) params.set("before", options.before);
        const query = params.toString();
        const body = await this.request("GET", `/v1/webhooks/deliveries${query ? `?${query}` : ""}`);
        return (body as unknown[]).map(toWebhookDelivery);
      },
    };

    this.vault = {
      generateIdentityKey: async (identityId) => {
        const keypair = generateVaultKeypair();
        await this.request("PUT", `/v1/identities/${encodeURIComponent(identityId)}/vault-key`, {
          body: { public_key: keypair.publicKey },
        });
        return keypair;
      },
      listSecrets: async () => {
        const body = await this.request("GET", "/v1/vault/secrets");
        return (body as unknown[]).map(toVaultSecretSummary);
      },
      createSecret: async (input) => {
        const identity = await this.identities.get(input.identityId);
        if (!identity.vaultPublicKey) {
          throw new Error(
            `identity ${input.identityId} has no vault key registered — call vault.generateIdentityKey() first`,
          );
        }
        const envelope = vaultEncrypt(Buffer.from(input.plaintext, "utf8"), identity.vaultPublicKey);
        return toVaultSecretSummary(
          await this.request("POST", "/v1/vault/secrets", {
            body: {
              name: input.name,
              identity_id: input.identityId,
              ciphertext: envelope.ciphertext,
              ephemeral_public_key: envelope.ephemeralPublicKey,
            },
          }),
        );
      },
      rotateSecret: async (secretId, keypair) => {
        const current = await this.request("GET", `/v1/vault/secrets/${encodeURIComponent(secretId)}/envelope`);
        const envelope = toVaultEnvelope(current);
        const plaintext = vaultDecrypt(envelope, keypair.publicKey, keypair.privateKey);
        const fresh = vaultEncrypt(plaintext, keypair.publicKey);
        return toVaultSecretSummary(
          await this.request("POST", `/v1/vault/secrets/${encodeURIComponent(secretId)}/rotate`, {
            body: { ciphertext: fresh.ciphertext, ephemeral_public_key: fresh.ephemeralPublicKey },
          }),
        );
      },
      createLease: async (secretId, input) =>
        toCreatedLease(
          await this.request("POST", `/v1/vault/secrets/${encodeURIComponent(secretId)}/lease`, {
            body: {
              operation: input.operation,
              ...(input.ttlSeconds !== undefined ? { ttl_seconds: input.ttlSeconds } : {}),
              ...(input.identityId !== undefined ? { identity_id: input.identityId } : {}),
            },
          }),
        ),
      redeemLease: async (leaseId, keypair) => {
        const body = await this.request("POST", `/v1/vault/leases/${encodeURIComponent(leaseId)}/redeem`);
        const envelope = toVaultEnvelope(body);
        const plaintext = vaultDecrypt(envelope, keypair.publicKey, keypair.privateKey);
        return { secret: plaintext.toString("utf8") };
      },
      listLeases: async (options) => {
        const params = new URLSearchParams();
        if (options?.limit !== undefined) params.set("limit", String(options.limit));
        const query = params.toString();
        const body = await this.request("GET", `/v1/vault/leases${query ? `?${query}` : ""}`);
        return (body as unknown[]).map(toVaultLease);
      },
    };

    this.tunnels = {
      create: async (identityId, input) =>
        toTunnel(
          await this.request("POST", `/v1/identities/${encodeURIComponent(identityId)}/tunnels`, {
            body: { ...(input?.hostname !== undefined ? { hostname: input.hostname } : {}) },
          }),
        ),
      list: async (identityId) => {
        const body = await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/tunnels`);
        return (body as unknown[]).map(toTunnel);
      },
      get: async (tunnelId) => toTunnel(await this.request("GET", `/v1/tunnels/${encodeURIComponent(tunnelId)}`)),
    };

    this.contacts = {
      create: async (input) =>
        toContact(await this.request("POST", "/v1/contacts", { body: fromContactInput(input) })),
      list: async (options) => {
        const query = options?.status ? `?status=${encodeURIComponent(options.status)}` : "";
        const body = await this.request("GET", `/v1/contacts${query}`);
        return (body as unknown[]).map(toContact);
      },
      get: async (id) => toContact(await this.request("GET", `/v1/contacts/${encodeURIComponent(id)}`)),
      update: async (id, input) =>
        toContact(
          await this.request("PATCH", `/v1/contacts/${encodeURIComponent(id)}`, { body: fromContactInput(input) }),
        ),
      delete: async (id) => {
        await this.request("DELETE", `/v1/contacts/${encodeURIComponent(id)}`);
      },
      approve: async (id) => toContact(await this.request("POST", `/v1/contacts/${encodeURIComponent(id)}/approve`)),
      reject: async (id) => {
        await this.request("POST", `/v1/contacts/${encodeURIComponent(id)}/reject`);
      },
    };

    this.phone = {
      provisionNumber: async (input) =>
        toPhoneNumber(
          await this.request("POST", "/v1/phone/numbers", {
            body: {
              identity_id: input.identityId,
              ...(input.number !== undefined ? { number: input.number } : {}),
              ...(input.state !== undefined ? { state: input.state } : {}),
              ...(input.incomingCallAction !== undefined ? { incoming_call_action: input.incomingCallAction } : {}),
              ...(input.clientWebsocketUrl !== undefined ? { client_websocket_url: input.clientWebsocketUrl } : {}),
              ...(input.incomingCallWebhookUrl !== undefined ? { incoming_call_webhook_url: input.incomingCallWebhookUrl } : {}),
            },
          }),
        ),
      listNumbers: async () => ((await this.request("GET", "/v1/phone/numbers")) as unknown[]).map(toPhoneNumber),
      listCarrierNumbers: async () =>
        ((await this.request("GET", "/v1/phone/carrier-numbers")) as { number: string; ready: boolean }[]).map((n) => ({
          number: n.number,
          ready: n.ready,
        })),
      getNumber: async (id) => toPhoneNumber(await this.request("GET", `/v1/phone/numbers/${encodeURIComponent(id)}`)),
      assignNumber: async (id, identityId) =>
        toPhoneNumber(
          await this.request("PATCH", `/v1/phone/numbers/${encodeURIComponent(id)}`, { body: { identity_id: identityId } }),
        ),
      releaseNumber: async (id) => {
        await this.request("DELETE", `/v1/phone/numbers/${encodeURIComponent(id)}`);
      },
      getIncomingCallAction: async (identityId) =>
        toIncomingCallActionSettings(
          await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/incoming-call-action`),
        ),
      setIncomingCallAction: async (identityId, input) =>
        toIncomingCallActionSettings(
          await this.request("PUT", `/v1/identities/${encodeURIComponent(identityId)}/incoming-call-action`, {
            body: {
              incoming_call_action: input.incomingCallAction,
              ...(input.clientWebsocketUrl !== undefined ? { client_websocket_url: input.clientWebsocketUrl } : {}),
              ...(input.incomingCallWebhookUrl !== undefined ? { incoming_call_webhook_url: input.incomingCallWebhookUrl } : {}),
              ...(input.voice !== undefined ? { voice: input.voice } : {}),
              ...(input.language !== undefined ? { language: input.language } : {}),
            },
          }),
        ),
      placeCall: async (input) => {
        const headers: Record<string, string> = {};
        if (input.idempotencyKey !== undefined) headers["idempotency-key"] = input.idempotencyKey;
        const body = (await this.request("POST", `/v1/identities/${encodeURIComponent(input.identityId)}/calls`, {
          headers,
          body: {
            to: input.to,
            ...(input.from !== undefined ? { from: input.from } : {}),
            ...(input.clientWebsocketUrl !== undefined ? { client_websocket_url: input.clientWebsocketUrl } : {}),
          },
        })) as Record<string, unknown>;
        return { ...toCall(body), rateLimit: toCallRateLimit(body.rate_limit) };
      },
      listCalls: async (input) => {
        const params = new URLSearchParams();
        if (input.limit !== undefined) params.set("limit", String(input.limit));
        if (input.offset !== undefined) params.set("offset", String(input.offset));
        if (input.isBlocked !== undefined) params.set("is_blocked", String(input.isBlocked));
        if (input.startDatetime !== undefined) params.set("start_datetime", input.startDatetime);
        if (input.endDatetime !== undefined) params.set("end_datetime", input.endDatetime);
        const query = params.toString();
        const body = await this.request(
          "GET",
          `/v1/identities/${encodeURIComponent(input.identityId)}/calls${query ? `?${query}` : ""}`,
        );
        return (body as unknown[]).map(toCall);
      },
      getCall: async (id) => toCall(await this.request("GET", `/v1/calls/${encodeURIComponent(id)}`)),
      hangupCall: async (id) => toCall(await this.request("POST", `/v1/calls/${encodeURIComponent(id)}/hangup`)),
      listTranscript: async (callId) =>
        ((await this.request("GET", `/v1/calls/${encodeURIComponent(callId)}/transcripts`)) as unknown[]).map(toTranscriptSegment),
      appendTranscript: async (callId, segments) =>
        (
          (await this.request("POST", `/v1/calls/${encodeURIComponent(callId)}/transcripts`, {
            body: {
              segments: segments.map((s) => ({ party: s.party, text: s.text, ...(s.tsMs !== undefined ? { ts_ms: s.tsMs } : {}) })),
            },
          })) as unknown[]
        ).map(toTranscriptSegment),
    };

    this.contactRules = {
      create: async (input) =>
        toContactRule(
          await this.request("POST", "/v1/contact-rules", {
            body: {
              ...(input.identityId !== undefined ? { identity_id: input.identityId } : {}),
              ...(input.channel !== undefined ? { channel: input.channel } : {}),
              match_address: input.matchAddress,
              action: input.action,
            },
          }),
        ),
      list: async () => {
        const body = await this.request("GET", "/v1/contact-rules");
        return (body as unknown[]).map(toContactRule);
      },
      delete: async (id) => {
        await this.request("DELETE", `/v1/contact-rules/${encodeURIComponent(id)}`);
      },
    };

    this.a2a = {
      createTrustRule: async (input) =>
        toA2ATrustRule(
          await this.request("POST", "/v1/a2a/trust-rules", {
            body: { identity_id: input.identityId, peer_identity_id: input.peerIdentityId },
          }),
        ),
      listTrustRules: async () => {
        const body = await this.request("GET", "/v1/a2a/trust-rules");
        return (body as unknown[]).map(toA2ATrustRule);
      },
      deleteTrustRule: async (id) => {
        await this.request("DELETE", `/v1/a2a/trust-rules/${encodeURIComponent(id)}`);
      },
      sendTask: async (input) =>
        toA2ATask(
          await this.request("POST", "/v1/a2a/tasks", {
            body: {
              ...(input.targetIdentityId !== undefined ? { target_identity_id: input.targetIdentityId } : {}),
              ...(input.targetHandle !== undefined ? { target_handle: input.targetHandle } : {}),
              ...(input.message !== undefined ? { message: input.message } : {}),
              ...(input.parts !== undefined ? { parts: input.parts } : {}),
              ...(input.contextId !== undefined ? { context_id: input.contextId } : {}),
              ...(input.messageId !== undefined ? { message_id: input.messageId } : {}),
            },
            ...actingHeader(input.actingAs),
          }),
        ),
      getTask: async (id) => toA2ATask(await this.request("GET", `/v1/a2a/tasks/${encodeURIComponent(id)}`)),
      replyToTask: async (taskId, input) =>
        toA2ATask(
          await this.request("POST", `/v1/a2a/tasks/${encodeURIComponent(taskId)}/reply`, {
            body: {
              intent: input.intent,
              ...(input.message !== undefined ? { message: input.message } : {}),
              ...(input.parts !== undefined ? { parts: input.parts } : {}),
              ...(input.messageId !== undefined ? { message_id: input.messageId } : {}),
            },
            ...actingHeader(input.actingAs),
          }),
        ),
      cancelTask: async (taskId, options) =>
        toA2ATask(
          await this.request("POST", `/v1/a2a/tasks/${encodeURIComponent(taskId)}/cancel`, {
            ...actingHeader(options?.actingAs),
          }),
        ),
      appendTaskMessage: async (taskId, content) =>
        toA2ATask(
          await this.request("POST", `/v1/a2a/tasks/${encodeURIComponent(taskId)}/messages`, {
            body: {
              ...(content.message !== undefined ? { message: content.message } : {}),
              ...(content.parts !== undefined ? { parts: content.parts } : {}),
              ...(content.messageId !== undefined ? { message_id: content.messageId } : {}),
            },
            ...actingHeader(content.actingAs),
          }),
        ),
      listContexts: async (identityId) => {
        const query = identityId !== undefined ? `?identity_id=${encodeURIComponent(identityId)}` : "";
        const body = await this.request("GET", `/v1/a2a/contexts${query}`);
        return (body as unknown[]).map((row) => ({
          ...toA2AContext(row),
          taskCount: (row as { task_count: number }).task_count,
        }));
      },
      getContext: async (id) => {
        const body = await this.request("GET", `/v1/a2a/contexts/${encodeURIComponent(id)}`);
        return { ...toA2AContext(body), tasks: (body as { tasks: unknown[] }).tasks.map(toA2ATask) };
      },
      renameContext: async (id, name) =>
        toA2AContext(await this.request("PATCH", `/v1/a2a/contexts/${encodeURIComponent(id)}`, { body: { name } })),
      listTasks: async (identityId) => {
        const body = await this.request("GET", `/v1/a2a/tasks?identity_id=${encodeURIComponent(identityId)}`);
        return (body as unknown[]).map(toA2ATask);
      },
      updateTask: async (id, input) =>
        toA2ATask(
          await this.request("PATCH", `/v1/a2a/tasks/${encodeURIComponent(id)}`, {
            body: { state: input.state, ...(input.result !== undefined ? { result: input.result } : {}) },
          }),
        ),
      getAgentCard: async (identityId) =>
        toAgentCard(
          await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/a2a/agent-card.json`),
        ),
      remote: (options = {}) => {
        const ownOrigin = new URL(this.baseUrl).origin;
        return new A2ARemoteClient({
          fetch: this.fetchImpl,
          ...options,
          apiKey: options.apiKey ?? ((origin) => (origin === ownOrigin ? this.apiKey : undefined)),
        });
      },
      previewAgentCard: async (identityId) =>
        toAgentCard(await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/a2a/card`)),
      listSettings: async () =>
        ((await this.request("GET", "/v1/identities/a2a/settings")) as Array<{ handle: string }>).map((entry) => ({
          ...toA2ASettings(entry),
          handle: entry.handle,
        })),
      getAgentCardByHandle: async (handle) =>
        toAgentCard(
          await this.request("GET", `/a2a/${encodeURIComponent(handle.replace(/^@/, ""))}/card`),
        ),
      listAgentOverviews: async () => {
        const body = await this.request("GET", "/v1/a2a/agents");
        return (body as unknown[]).map(toA2AAgentOverview);
      },
      setEnabled: async (identityId, enabled) => {
        await this.request("POST", `/v1/identities/${encodeURIComponent(identityId)}/a2a/enabled`, {
          body: { enabled },
        });
      },
      setSkills: async (identityId, skills) => {
        await this.request("PUT", `/v1/identities/${encodeURIComponent(identityId)}/a2a/skills`, {
          body: { skills },
        });
      },
      createContactRule: async (input) =>
        toA2AContactRule(
          await this.request("POST", "/v1/a2a/contact-rules", {
            body: {
              identity_id: input.identityId,
              handle: input.handle,
              action: input.action,
              ...(input.direction !== undefined ? { direction: input.direction } : {}),
            },
          }),
        ),
      listContactRules: async (identityId) => {
        const query = identityId !== undefined ? `?identity_id=${encodeURIComponent(identityId)}` : "";
        return ((await this.request("GET", `/v1/a2a/contact-rules${query}`)) as unknown[]).map(toA2AContactRule);
      },
      updateContactRule: async (id, patch) =>
        toA2AContactRule(
          await this.request("PATCH", `/v1/a2a/contact-rules/${encodeURIComponent(id)}`, {
            body: {
              ...(patch.action !== undefined ? { action: patch.action } : {}),
              ...(patch.direction !== undefined ? { direction: patch.direction } : {}),
            },
          }),
        ),
      deleteContactRule: async (id) => {
        await this.request("DELETE", `/v1/a2a/contact-rules/${encodeURIComponent(id)}`);
      },
      getSettings: async (identityId) =>
        toA2ASettings(await this.request("GET", `/v1/identities/${encodeURIComponent(identityId)}/a2a/settings`)),
      updateSettings: async (identityId, patch) =>
        toA2ASettings(
          await this.request("PUT", `/v1/identities/${encodeURIComponent(identityId)}/a2a/settings`, {
            body: {
              ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
              ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
              ...(patch.publiclyDiscoverable !== undefined ? { publicly_discoverable: patch.publiclyDiscoverable } : {}),
              ...(patch.allowPublicEgress !== undefined ? { allow_public_egress: patch.allowPublicEgress } : {}),
              ...(patch.filterMode !== undefined ? { filter_mode: patch.filterMode } : {}),
            },
          }),
        ),
      setListed: async (identityId, listed) => {
        await this.request("PUT", `/v1/identities/${encodeURIComponent(identityId)}/a2a/listed`, {
          body: { listed },
        });
      },
      searchTasks: async (input = {}) => {
        const body = (await this.request("GET", `/v1/a2a/tasks/search${listQuery({
          identity_id: input.identityId,
          direction: input.direction,
          requester_handle: input.requesterHandle,
          worker_handle: input.workerHandle,
          state: input.state,
          context_id: input.contextId,
          q: input.q,
          since: input.since instanceof Date ? input.since.toISOString() : input.since,
          limit: input.limit,
          cursor: input.cursor,
        })}`)) as { items: unknown[]; next_cursor: string | null };
        return { items: body.items.map(toA2ATaskListing), nextCursor: body.next_cursor };
      },
      iterateTasks: (input = {}) => pages((cursor) => this.a2a.searchTasks({ ...input, ...(cursor ? { cursor } : {}) })),
      searchMessages: async (input = {}) => {
        const body = (await this.request("GET", `/v1/a2a/messages${listQuery({
          identity_id: input.identityId,
          direction: input.direction,
          role: input.role,
          task_id: input.taskId,
          context_id: input.contextId,
          q: input.q,
          since: input.since instanceof Date ? input.since.toISOString() : input.since,
          limit: input.limit,
          cursor: input.cursor,
        })}`)) as { items: unknown[]; next_cursor: string | null };
        return { items: body.items.map(toA2AMessageListing), nextCursor: body.next_cursor };
      },
      iterateMessages: (input = {}) => pages((cursor) => this.a2a.searchMessages({ ...input, ...(cursor ? { cursor } : {}) })),
      directory: async (query = {}) => {
        const body = (await this.request("GET", `/a2a/directory${listQuery({ q: query.q, limit: query.limit, cursor: query.cursor })}`)) as {
          items: unknown[];
          next_cursor: string | null;
        };
        return { items: body.items.map(toA2ADirectoryAgent), nextCursor: body.next_cursor };
      },
      iterateDirectory: (query = {}) => pages((cursor) => this.a2a.directory({ ...query, ...(cursor ? { cursor } : {}) })),
      orgDirectory: async (query = {}) => {
        const body = (await this.request("GET", `/v1/a2a/org-directory${listQuery({ q: query.q, limit: query.limit, cursor: query.cursor })}`)) as {
          items: unknown[];
          next_cursor: string | null;
        };
        return { items: body.items.map(toA2ADirectoryAgent), nextCursor: body.next_cursor };
      },
      iterateOrgDirectory: (query = {}) => pages((cursor) => this.a2a.orgDirectory({ ...query, ...(cursor ? { cursor } : {}) })),
      searchDirectory: async (query) => {
        const params = new URLSearchParams();
        if (query !== undefined) params.set("q", query);
        const qs = params.toString();
        const body = await this.request("GET", `/v1/a2a/directory${qs ? `?${qs}` : ""}`);
        return (body as unknown[]).map(toA2ADirectoryEntry);
      },
      createInvitation: async (input) =>
        toA2AInvitation(
          await this.request("POST", "/v1/a2a/invitations", {
            body: {
              from_identity_id: input.fromIdentityId,
              to_identity_id: input.toIdentityId,
              ...(input.message !== undefined ? { message: input.message } : {}),
            },
          }),
        ),
      createInvitationBundle: async (input) => {
        const body = (await this.request("POST", "/v1/a2a/invitations", {
          body: {
            peer_identity_ids: input.peerIdentityIds,
            ...(input.recipientEmail !== undefined ? { recipient_email: input.recipientEmail } : {}),
            ...(input.expiresInHours !== undefined ? { expires_in_hours: input.expiresInHours } : {}),
            ...(input.message !== undefined ? { message: input.message } : {}),
          },
        })) as {
          peers?: Array<{ identity_id: string; handle: string }>;
          invitation_token?: string;
          invitation_url?: string;
          agent_handoff_prompt?: string;
        };
        return {
          ...toA2AInvitation(body),
          ...(body.peers ? { peers: body.peers.map(toA2AInvitationPeer) } : {}),
          ...(body.invitation_token !== undefined ? { invitationToken: body.invitation_token } : {}),
          ...(body.invitation_url !== undefined ? { invitationUrl: body.invitation_url } : {}),
          ...(body.agent_handoff_prompt !== undefined ? { agentHandoffPrompt: body.agent_handoff_prompt } : {}),
        };
      },
      previewInvitation: async (token) => {
        const b = (await this.request("POST", "/v1/a2a/invitations/preview", {
          body: { invitation_token: token },
        })) as {
          status: A2AInvitationStatus;
          issuer_name?: string;
          message?: string | null;
          peers?: Array<{ handle: string; display_name: string }>;
          expires_at?: string;
          email_bound?: boolean;
        };
        return {
          status: b.status,
          ...(b.issuer_name !== undefined ? { issuerName: b.issuer_name } : {}),
          ...(b.message !== undefined ? { message: b.message } : {}),
          ...(b.peers ? { peers: b.peers.map((p) => ({ handle: p.handle, displayName: p.display_name })) } : {}),
          ...(b.expires_at !== undefined ? { expiresAt: b.expires_at } : {}),
          ...(b.email_bound !== undefined ? { emailBound: b.email_bound } : {}),
        };
      },
      acceptInvitationByToken: async (token, identityId) => {
        const b = (await this.request("POST", "/v1/a2a/invitations/accept", {
          body: { invitation_token: token, ...(identityId !== undefined ? { identity_id: identityId } : {}) },
        })) as { invitation: unknown; connected_to: Array<{ identity_id: string; handle: string }> };
        return { invitation: toA2AInvitation(b.invitation), connectedTo: b.connected_to.map(toA2AInvitationPeer) };
      },
      declineInvitationByToken: async (token) =>
        toA2AInvitation(await this.request("POST", "/v1/a2a/invitations/decline", { body: { invitation_token: token } })),
      listInvitations: async () => {
        const body = await this.request("GET", "/v1/a2a/invitations");
        return (body as unknown[]).map(toA2AInvitationWithContext);
      },
      acceptInvitation: async (id) =>
        toA2AInvitation(await this.request("POST", `/v1/a2a/invitations/${encodeURIComponent(id)}/accept`)),
      declineInvitation: async (id) =>
        toA2AInvitation(await this.request("POST", `/v1/a2a/invitations/${encodeURIComponent(id)}/decline`)),
      revokeInvitation: async (id) =>
        toA2AInvitation(await this.request("POST", `/v1/a2a/invitations/${encodeURIComponent(id)}/revoke`)),
    };

    this.domains = {
      add: async (domain) => toDomain(await this.request("POST", "/v1/domains", { body: { domain } })),
      list: async () => {
        const body = await this.request("GET", "/v1/domains");
        return (body as unknown[]).map(toDomain);
      },
      verify: async (id) => toDomain(await this.request("POST", `/v1/domains/${encodeURIComponent(id)}/verify`)),
      delete: async (id) => {
        await this.request("DELETE", `/v1/domains/${encodeURIComponent(id)}`);
      },
      deliverability: async (id) =>
        toDeliverabilityGuidance(
          await this.request("GET", `/v1/domains/${encodeURIComponent(id)}/deliverability`),
        ),
    };

    this.status = {
      health: async () => (await this.request("GET", "/v1/health")) as { status: string },
      ready: async () => (await this.request("GET", "/v1/ready")) as { status: string },
    };

    this.providerAccounts = {
      create: async (input) =>
        toProviderAccount(
          await this.request("POST", "/v1/provider-accounts", {
            body: { kind: input.kind, config: input.config },
          }),
        ),
      list: async () => {
        const body = await this.request("GET", "/v1/provider-accounts");
        return (body as unknown[]).map(toProviderAccount);
      },
      delete: async (id) => {
        await this.request("DELETE", `/v1/provider-accounts/${encodeURIComponent(id)}`);
      },
    };

    this.providers = {
      health: async () => toProviderHealth(await this.request("GET", "/v1/providers/health")),
    };
  }

  /** What this organization has used and what it may use: email sent today against the daily limit, and how many
   *  agents it has against its cap. */
  async usage(): Promise<Usage> {
    const b = (await this.request("GET", "/v1/usage")) as {
      verified: boolean;
      mail: { sent_today: number; daily_limit: number; remaining: number; resets_at: string; owner_address_only: string | null };
      identities: { count: number; limit: number };
    };
    return {
      verified: b.verified,
      mail: {
        sentToday: b.mail.sent_today,
        dailyLimit: b.mail.daily_limit,
        remaining: b.mail.remaining,
        resetsAt: b.mail.resets_at,
        ownerAddressOnly: b.mail.owner_address_only,
      },
      identities: b.identities,
    };
  }

  async whoami(): Promise<WhoAmI> {
    return toWhoAmI(await this.request("GET", "/v1/me"));
  }

  /** Attaches a real email+password login to the org this API key belongs to — for orgs
   *  bootstrapped the old way (a raw admin key, no account behind it). Org-admin key only. */
  async claimAccount(input: { email: string; password: string }): Promise<AuthSession> {
    return toAuthSession(
      await this.request("POST", "/v1/auth/claim", { body: { email: input.email, password: input.password } }),
    );
  }

  private async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    return sendRequest(this.fetchImpl, this.baseUrl, method, path, {
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      ...options,
      headers: { authorization: `Bearer ${this.apiKey}`, ...options.headers },
    });
  }
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Per-attempt deadline. `0` disables it (used by the long-polling wait endpoint). */
  timeoutMs?: number;
  maxRetries?: number;
}

/** Methods safe to replay after a network failure, since repeating them can't create duplicates. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);

/**
 * Whether a failed attempt is worth repeating.
 *
 * A network-level failure on a non-idempotent method is deliberately *not* retried: the request
 * may well have been applied before the connection dropped, and replaying it would send the mail
 * twice. Explicit backpressure (429) and the server's own `retryable` flag are honoured for every
 * method, because those mean the request demonstrably was not processed.
 */
function isRetryable(method: string, error: unknown): boolean {
  if (error instanceof AidApiError) {
    if (error.status === 429) return true;
    if (error.retryable) return true;
    if (error.status >= 500 && IDEMPOTENT_METHODS.has(method)) return true;
    return false;
  }
  if (error instanceof AidConnectionError) return IDEMPOTENT_METHODS.has(method);
  // Anything else came from a caller-supplied `fetch`, not from the transport — including
  // framework control flow such as Next.js `redirect()`, which works by throwing. Retrying or
  // rewriting those would break the caller's own semantics, so they pass straight through.
  return false;
}

/** Honours `Retry-After` when the server sends one, else exponential backoff with jitter. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  }
  const base = Math.min(250 * 2 ** attempt, 8_000);
  return base + Math.random() * base * 0.25;
}

async function sendRequest(
  fetchImpl: typeof fetch,
  baseUrl: string,
  method: string,
  path: string,
  options: RequestOptions,
): Promise<unknown> {
  const headers: Record<string, string> = { ...options.headers };
  let payload: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  const maxRetries = options.maxRetries ?? 0;
  const timeoutMs = options.timeoutMs ?? 0;
  let lastRetryAfter: string | null = null;

  for (let attempt = 0; ; attempt++) {
    // A per-attempt deadline, combined with the caller's own signal so either can cancel. Without
    // this a stalled connection hangs the caller forever.
    const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
    const signals = [options.signal, timeoutSignal].filter((s): s is AbortSignal => s !== undefined);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

    try {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method,
        headers,
        ...(payload !== undefined ? { body: payload } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
      const text = await res.text();

      let data: unknown;
      try {
        data = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        // A SyntaxError, matching what JSON.parse itself raises — and distinguishable from a
        // transport failure, since this response demonstrably came back from the API.
        throw new SyntaxError(
          `unexpected non-JSON response (status ${res.status}): ${text.slice(0, 200)}`,
        );
      }

      if (!res.ok) {
        lastRetryAfter = res.headers.get("retry-after");
        throw new AidApiError(res.status, data);
      }
      return data;
    } catch (raw) {
      // The caller cancelled: surface that untouched, so `err.name === "AbortError"` and any
      // signal-based control flow still works the way callers expect.
      if (options.signal?.aborted) throw raw;

      // Only genuine transport failures get rewritten: `fetch` rejects with a TypeError when it
      // cannot reach the host, and our own deadline shows up as an abort. Everything else —
      // an AidApiError, a parse failure, or whatever a caller-supplied `fetch` chose to throw
      // (Next.js `redirect()`, for one) — is passed through exactly as it was raised.
      const timedOut = timeoutSignal?.aborted ?? false;
      const err =
        raw instanceof TypeError || timedOut
          ? new AidConnectionError(method, `${baseUrl.replace(/\/$/, "")}${path}`, raw, timedOut)
          : raw;

      if (attempt >= maxRetries || !isRetryable(method, err)) throw err;
      await sleep(backoffMs(attempt, lastRetryAfter), options.signal);
      lastRetryAfter = null;
    }
  }
}

function toAttachmentInputs(inputs: AttachmentInput[] | undefined) {
  if (!inputs?.length) return undefined;
  return inputs.map((a) => ({
    filename: a.filename,
    content_type: a.contentType,
    content_base64: Buffer.from(a.content).toString("base64"),
    ...(a.contentId !== undefined ? { content_id: a.contentId } : {}),
  }));
}

function toAttachment(body: unknown): Attachment {
  const b = body as {
    id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    sha256: string;
    content_id: string | null;
  };
  return {
    id: b.id,
    filename: b.filename,
    contentType: b.content_type,
    sizeBytes: b.size_bytes,
    sha256: b.sha256,
    contentId: b.content_id,
  };
}

function toIdentitySummary(body: unknown): IdentitySummary {
  const b = body as {
    id: string;
    handle: string;
    status: string;
    mailbox_address: string;
    vault_public_key: string | null;
  };
  return {
    id: b.id,
    handle: b.handle,
    status: b.status,
    mailboxAddress: b.mailbox_address,
    vaultPublicKey: b.vault_public_key,
  };
}

function toIdentityDetail(body: unknown): IdentityDetail {
  const b = body as {
    id: string;
    handle: string;
    display_name: string;
    status: string;
    vault_public_key: string | null;
  };
  return {
    id: b.id,
    handle: b.handle,
    displayName: b.display_name,
    status: b.status,
    vaultPublicKey: b.vault_public_key,
  };
}

function toMailMessage(body: unknown): MailMessage {
  const b = body as {
    id: string;
    thread_id: string;
    direction: string;
    status: string;
    last_error: string | null;
    provider_message_id: string | null;
    from: { address: string; name: string | null }[];
    to: { address: string; name: string | null }[];
    cc: { address: string; name: string | null }[];
    bcc?: { address: string; name: string | null }[];
    subject: string | null;
    text_body: string | null;
    html_body: string | null;
    folder: string | null;
    is_read?: boolean;
    is_starred?: boolean;
    created_at: string;
  };
  return {
    id: b.id,
    threadId: b.thread_id,
    direction: b.direction,
    status: b.status,
    lastError: b.last_error ?? null,
    providerMessageId: b.provider_message_id,
    from: b.from,
    to: b.to,
    cc: b.cc,
    bcc: b.bcc ?? [],
    subject: b.subject,
    textBody: b.text_body,
    htmlBody: b.html_body,
    folder: b.folder,
    isRead: b.is_read ?? false,
    isStarred: b.is_starred ?? false,
    createdAt: b.created_at,
  };
}

function searchParams(input: SearchMailInput): string {
  const params = new URLSearchParams({ q: input.q });
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.includeSpam) params.set("include_spam", "true");
  return params.toString();
}

function toMailThreadSummary(body: unknown): MailThreadSummary {
  const b = body as {
    id: string;
    subject: string | null;
    message_count: number;
    unread_count: number;
    starred: boolean;
    last_message_at: string;
    latest_message_id: string;
    latest_from: { address: string; name: string | null }[];
    latest_snippet: string;
    has_attachments: boolean;
  };
  return {
    id: b.id,
    subject: b.subject,
    messageCount: b.message_count,
    unreadCount: b.unread_count,
    starred: b.starred,
    lastMessageAt: b.last_message_at,
    latestMessageId: b.latest_message_id,
    latestFrom: b.latest_from,
    latestSnippet: b.latest_snippet,
    hasAttachments: b.has_attachments,
  };
}

function toMailSearchHit(body: unknown): MailSearchHit {
  const b = body as {
    message_id: string;
    thread_id: string;
    identity_id: string | null;
    folder: string;
    subject: string | null;
    from: { address: string; name: string | null }[];
    snippet: string;
    at: string;
    rank: number;
  };
  return {
    messageId: b.message_id,
    threadId: b.thread_id,
    identityId: b.identity_id,
    folder: b.folder,
    subject: b.subject,
    from: b.from,
    snippet: b.snippet,
    at: b.at,
    rank: b.rank,
  };
}

function toMailThread(body: unknown): MailThread {
  const b = body as { id: string; subject: string | null; messages: unknown[] };
  return { id: b.id, subject: b.subject, messages: b.messages.map(toMailMessage) };
}

function toWhoAmI(body: unknown): WhoAmI {
  const b = body as { actor_type: string; actor_id: string; org_id: string; org_slug: string; org_name: string };
  return { actorType: b.actor_type, actorId: b.actor_id, orgId: b.org_id, orgSlug: b.org_slug, orgName: b.org_name };
}

function toApiKeySummary(body: unknown): ApiKeySummary {
  const b = body as {
    id: string;
    identity_id: string | null;
    name: string;
    key_prefix: string;
    scopes: string[];
    revoked_at: string | null;
    created_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    name: b.name,
    keyPrefix: b.key_prefix,
    scopes: b.scopes,
    revokedAt: b.revoked_at,
    createdAt: b.created_at,
  };
}

function toPhoneNumber(body: unknown): PhoneNumber {
  const b = body as Record<string, unknown>;
  return {
    id: b.id as string,
    identityId: (b.identity_id as string | null) ?? null,
    number: b.number as string,
    provider: b.provider as string,
    status: b.status as string,
    createdAt: b.created_at as string,
  };
}

function toIncomingCallActionSettings(body: unknown): IncomingCallActionSettings {
  const b = body as Record<string, unknown>;
  return {
    identityId: b.identity_id as string,
    incomingCallAction: b.incoming_call_action as IncomingCallAction,
    clientWebsocketUrl: (b.client_websocket_url as string | null) ?? null,
    incomingCallWebhookUrl: (b.incoming_call_webhook_url as string | null) ?? null,
    voice: (b.voice as string | null) ?? null,
    language: (b.language as string | null) ?? null,
    signingSecret: (b.signing_secret as string | null) ?? null,
  };
}

function toCall(body: unknown): Call {
  const b = body as Record<string, unknown>;
  return {
    id: b.id as string,
    identityId: (b.identity_id as string | null) ?? null,
    direction: b.direction as Call["direction"],
    from: (b.from as string | null) ?? null,
    to: (b.to as string | null) ?? null,
    status: b.status as CallStatus,
    mode: "client_websocket",
    clientWebsocketUrl: (b.client_websocket_url as string | null) ?? null,
    hangupReason: (b.hangup_reason as Call["hangupReason"]) ?? null,
    hangupCause: (b.hangup_cause as string | null) ?? null,
    durationSeconds: (b.duration_seconds as number | null) ?? null,
    isBlocked: b.is_blocked === true,
    startedAt: b.started_at as string,
    answeredAt: (b.answered_at as string | null) ?? null,
    endedAt: (b.ended_at as string | null) ?? null,
  };
}

function toCallRateLimit(body: unknown): CallRateLimit {
  const b = body as Record<string, number>;
  return {
    callsUsed: b.calls_used as number,
    callsRemaining: b.calls_remaining as number,
    callsLimit: b.calls_limit as number,
    minutesUsed: b.minutes_used as number,
    minutesRemaining: b.minutes_remaining as number,
    minutesLimit: b.minutes_limit as number,
  };
}

function toTranscriptSegment(body: unknown): TranscriptSegment {
  const b = body as Record<string, unknown>;
  return { seq: b.seq as number, party: b.party as TranscriptSegment["party"], text: b.text as string, tsMs: b.ts_ms as number };
}

function toCreatedApiKey(body: unknown): CreatedApiKey {
  const b = body as { id: string; key: string; key_prefix: string };
  return { id: b.id, key: b.key, keyPrefix: b.key_prefix };
}

function toWebhookEndpoint(body: unknown): WebhookEndpoint {
  const b = body as {
    id: string;
    identity_id: string | null;
    url: string;
    event_types: string[];
    status: string;
    created_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    url: b.url,
    eventTypes: b.event_types,
    status: b.status,
    createdAt: b.created_at,
  };
}

function toCreatedWebhookEndpoint(body: unknown): CreatedWebhookEndpoint {
  const b = body as {
    id: string;
    identity_id: string | null;
    url: string;
    secret: string;
    event_types: string[];
    created_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    url: b.url,
    secret: b.secret,
    eventTypes: b.event_types,
    createdAt: b.created_at,
  };
}

function toWebhookDelivery(body: unknown): WebhookDelivery {
  const b = body as {
    id: string;
    webhook_endpoint_id: string;
    endpoint_url: string;
    event_id: string;
    event_type: string;
    attempt_count: number;
    status: string;
    next_attempt_at: string | null;
    last_error: string | null;
    delivered_at: string | null;
    event_created_at: string;
  };
  return {
    id: b.id,
    webhookEndpointId: b.webhook_endpoint_id,
    endpointUrl: b.endpoint_url,
    eventId: b.event_id,
    eventType: b.event_type,
    attemptCount: b.attempt_count,
    status: b.status,
    nextAttemptAt: b.next_attempt_at,
    lastError: b.last_error,
    deliveredAt: b.delivered_at,
    eventCreatedAt: b.event_created_at,
  };
}

function toVaultSecretSummary(body: unknown): VaultSecretSummary {
  const b = body as {
    id: string;
    identity_id: string;
    name: string;
    version: number;
    status: string;
    created_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    name: b.name,
    version: b.version,
    status: b.status,
    createdAt: b.created_at,
  };
}

function toVaultEnvelope(body: unknown): VaultCiphertext {
  const b = body as { ciphertext: string; ephemeral_public_key: string };
  return { ciphertext: b.ciphertext, ephemeralPublicKey: b.ephemeral_public_key };
}

function toCreatedLease(body: unknown): CreatedLease {
  const b = body as { lease_id: string; operation: string; expires_at: string };
  return { leaseId: b.lease_id, operation: b.operation, expiresAt: b.expires_at };
}

interface WireContactAddress {
  label: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

function toContact(body: unknown): Contact {
  const b = body as {
    id: string;
    prefix: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    suffix: string | null;
    display_name: string | null;
    company: string | null;
    job_title: string | null;
    emails: ContactEmail[];
    phones: ContactPhone[];
    websites: ContactWebsite[];
    addresses: WireContactAddress[];
    dates: ContactDate[];
    custom_fields: ContactCustomField[];
    notes: string | null;
    status: string;
    source_identity_id: string | null;
    created_at: string;
    updated_at: string;
  };
  return {
    id: b.id,
    prefix: b.prefix,
    firstName: b.first_name,
    middleName: b.middle_name,
    lastName: b.last_name,
    suffix: b.suffix,
    displayName: b.display_name,
    company: b.company,
    jobTitle: b.job_title,
    emails: b.emails,
    phones: b.phones,
    websites: b.websites,
    addresses: b.addresses.map((a) => ({
      label: a.label,
      street: a.street,
      city: a.city,
      state: a.state,
      postalCode: a.postal_code,
      country: a.country,
    })),
    dates: b.dates,
    customFields: b.custom_fields,
    notes: b.notes,
    status: b.status as "suggested" | "saved",
    sourceIdentityId: b.source_identity_id,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function fromContactInput(input: ContactWriteInput) {
  return {
    ...(input.prefix !== undefined ? { prefix: input.prefix } : {}),
    ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
    ...(input.middleName !== undefined ? { middle_name: input.middleName } : {}),
    ...(input.lastName !== undefined ? { last_name: input.lastName } : {}),
    ...(input.suffix !== undefined ? { suffix: input.suffix } : {}),
    ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
    ...(input.company !== undefined ? { company: input.company } : {}),
    ...(input.jobTitle !== undefined ? { job_title: input.jobTitle } : {}),
    ...(input.emails !== undefined ? { emails: input.emails } : {}),
    ...(input.phones !== undefined ? { phones: input.phones } : {}),
    ...(input.websites !== undefined ? { websites: input.websites } : {}),
    ...(input.addresses !== undefined
      ? {
          addresses: input.addresses.map((a) => ({
            label: a.label,
            street: a.street,
            city: a.city,
            state: a.state,
            postal_code: a.postalCode,
            country: a.country,
          })),
        }
      : {}),
    ...(input.dates !== undefined ? { dates: input.dates } : {}),
    ...(input.customFields !== undefined ? { custom_fields: input.customFields } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

function toContactRule(body: unknown): ContactRule {
  const b = body as {
    id: string;
    identity_id: string | null;
    channel: string;
    match_address: string;
    action: string;
    created_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    channel: b.channel,
    matchAddress: b.match_address,
    action: b.action as "allow" | "block",
    createdAt: b.created_at,
  };
}

function toA2ATrustRule(body: unknown): A2ATrustRule {
  const b = body as { id: string; identity_id: string; peer_identity_id: string; created_at: string };
  return { id: b.id, identityId: b.identity_id, peerIdentityId: b.peer_identity_id, createdAt: b.created_at };
}

/** A query string from the parameters that are set. */
function listQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined);
  return entries.length === 0 ? "" : `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}`;
}

/** Walks a paged listing to its end, one item at a time, asking for each next page only when it is needed. */
async function* pages<T>(fetchPage: (cursor?: string) => Promise<A2APage<T>>): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}

function toA2ATaskListing(body: unknown): A2ATaskListing {
  const b = body as { caller_handle: string; target_handle: string };
  return { ...toA2ATask(body), callerHandle: b.caller_handle, targetHandle: b.target_handle };
}

function toA2AMessageListing(body: unknown): A2AMessageListing {
  const b = body as {
    id: string;
    message_id: string | null;
    role: "caller" | "agent";
    parts: A2APart[];
    created_at: string;
    task_id: string;
    context_id: string;
    task_state: A2ATaskState;
    caller_handle: string;
    target_handle: string;
  };
  return {
    id: b.id,
    messageId: b.message_id,
    role: b.role,
    parts: b.parts,
    createdAt: b.created_at,
    taskId: b.task_id,
    contextId: b.context_id,
    taskState: b.task_state,
    callerHandle: b.caller_handle,
    targetHandle: b.target_handle,
  };
}

function toA2ADirectoryAgent(body: unknown): A2ADirectoryAgent {
  const b = body as {
    handle: string;
    display_name: string;
    skills: A2ASkill[];
    card_url: string;
    visibility: "public" | "organization";
    identity_id?: string;
  };
  return {
    handle: b.handle,
    displayName: b.display_name,
    skills: b.skills,
    cardUrl: b.card_url,
    visibility: b.visibility,
    ...(b.identity_id !== undefined ? { identityId: b.identity_id } : {}),
  };
}

function toA2AContext(body: unknown): A2AContext {
  const b = body as {
    id: string;
    name: string;
    opened_by_identity_id: string;
    peer_identity_id: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: b.id,
    name: b.name,
    openedByIdentityId: b.opened_by_identity_id,
    peerIdentityId: b.peer_identity_id,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function toA2ATask(body: unknown): A2ATask {
  const b = body as {
    id: string;
    context_id: string;
    target_identity_id: string;
    caller_identity_id: string;
    state: string;
    message: string;
    result: string | null;
    created_at: string;
    updated_at: string;
    messages?: Array<{ id: string; message_id: string | null; role: "caller" | "agent"; parts: A2APart[]; created_at: string }>;
  };
  return {
    id: b.id,
    contextId: b.context_id,
    targetIdentityId: b.target_identity_id,
    callerIdentityId: b.caller_identity_id,
    state: b.state as A2ATaskState,
    message: b.message,
    result: b.result,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    ...(b.messages !== undefined
      ? {
          messages: b.messages.map((m) => ({
            id: m.id,
            messageId: m.message_id,
            role: m.role,
            parts: m.parts,
            createdAt: m.created_at,
          })),
        }
      : {}),
  };
}

function toAgentCard(body: unknown): AgentCard {
  return body as AgentCard;
}

function toA2AContactRule(body: unknown): A2AContactRule {
  const b = body as {
    id: string;
    identity_id: string;
    handle: string;
    action: A2ARuleAction;
    direction: A2ARuleDirection;
    created_at: string;
    updated_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    handle: b.handle,
    action: b.action,
    direction: b.direction,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

function toA2ASettings(body: unknown): A2ASettings {
  const b = body as {
    identity_id: string;
    enabled: boolean;
    publicly_discoverable: boolean;
    allow_public_egress: boolean;
    filter_mode: A2AFilterMode;
    skills: A2ASkill[];
  };
  return {
    identityId: b.identity_id,
    enabled: b.enabled,
    publiclyDiscoverable: b.publicly_discoverable,
    allowPublicEgress: b.allow_public_egress,
    filterMode: b.filter_mode,
    skills: b.skills,
  };
}

function toA2AAgentOverview(body: unknown): A2AAgentOverview {
  const b = body as {
    identity_id: string;
    handle: string;
    enabled: boolean;
    skills: string[];
    listed: boolean;
    allow_public_egress: boolean;
    filter_mode: A2AFilterMode;
    inbound_tasks: number;
    outbound_tasks: number;
  };
  return {
    identityId: b.identity_id,
    handle: b.handle,
    enabled: b.enabled,
    skills: b.skills,
    listed: b.listed,
    allowPublicEgress: b.allow_public_egress,
    filterMode: b.filter_mode,
    inboundTasks: b.inbound_tasks,
    outboundTasks: b.outbound_tasks,
  };
}

function toA2ADirectoryEntry(body: unknown): A2ADirectoryEntry {
  const b = body as { identity_id: string; handle: string; org_name: string; skills: string[] };
  return { identityId: b.identity_id, handle: b.handle, orgName: b.org_name, skills: b.skills };
}

/** The header that lets an org admin key act as one of its agents. */
function actingHeader(actingAs: string | undefined): { headers?: Record<string, string> } {
  return actingAs !== undefined ? { headers: { "x-act-as-identity": actingAs } } : {};
}

function toA2AInvitationPeer(p: { identity_id: string; handle: string }): A2AInvitationPeer {
  return { identityId: p.identity_id, handle: p.handle };
}

function toA2AInvitation(body: unknown): A2AInvitation {
  const b = body as {
    id: string;
    from_identity_id: string;
    to_identity_id: string | null;
    accepted_by_identity_id: string | null;
    status: A2AInvitationStatus;
    message: string | null;
    recipient_email: string | null;
    expires_at: string;
    created_at: string;
    responded_at: string | null;
  };
  return {
    id: b.id,
    fromIdentityId: b.from_identity_id,
    toIdentityId: b.to_identity_id,
    acceptedByIdentityId: b.accepted_by_identity_id,
    status: b.status,
    message: b.message,
    recipientEmail: b.recipient_email,
    expiresAt: b.expires_at,
    createdAt: b.created_at,
    respondedAt: b.responded_at,
  };
}

function toA2AInvitationWithContext(body: unknown): A2AInvitationWithContext {
  const b = body as {
    from_handle: string;
    to_handle: string | null;
    direction: "sent" | "received";
    peers: Array<{ identity_id: string; handle: string }>;
  };
  return {
    ...toA2AInvitation(body),
    fromHandle: b.from_handle,
    toHandle: b.to_handle,
    direction: b.direction,
    peers: b.peers.map(toA2AInvitationPeer),
  };
}

function toDomain(body: unknown): Domain {
  const b = body as {
    id: string;
    domain: string;
    status: string;
    verification: { record_type: "TXT"; record_name: string; record_value: string };
    verified_at: string | null;
    created_at: string;
  };
  return {
    id: b.id,
    domain: b.domain,
    status: b.status as "pending" | "verified",
    verification: {
      recordType: b.verification.record_type,
      recordName: b.verification.record_name,
      recordValue: b.verification.record_value,
    },
    verifiedAt: b.verified_at,
    createdAt: b.created_at,
  };
}

function toDeliverabilityGuidance(body: unknown): DeliverabilityGuidance {
  const b = body as {
    provider_kind: string;
    records: {
      purpose: "spf" | "dkim" | "dmarc";
      record_type: "TXT";
      record_name: string;
      record_value: string | null;
      note: string;
    }[];
  };
  return {
    providerKind: b.provider_kind,
    records: b.records.map((r) => ({
      purpose: r.purpose,
      recordType: r.record_type,
      recordName: r.record_name,
      recordValue: r.record_value,
      note: r.note,
    })),
  };
}

function toProviderAccount(body: unknown): ProviderAccount {
  const b = body as { id: string; kind: string; status: string; created_at: string };
  return { id: b.id, kind: b.kind, status: b.status as "active" | "disabled", createdAt: b.created_at };
}

function toProviderHealth(body: unknown): ProviderHealth {
  const b = body as { healthy: boolean; detail: string | null; source: string };
  return { healthy: b.healthy, detail: b.detail, source: b.source as "custom" | "default" };
}

function toIdentitySuspension(body: unknown): IdentitySuspension {
  const b = body as {
    id: string;
    identity_id: string;
    reason: string;
    suspended_by: string;
    suspended_at: string;
    reinstated_at: string | null;
    reinstated_by: string | null;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    reason: b.reason,
    suspendedBy: b.suspended_by,
    suspendedAt: b.suspended_at,
    reinstatedAt: b.reinstated_at,
    reinstatedBy: b.reinstated_by,
  };
}

function toVaultLease(body: unknown): VaultLease {
  const b = body as {
    id: string;
    secret_id: string;
    secret_name: string;
    identity_id: string;
    identity_handle: string;
    operation: string;
    expires_at: string;
    consumed_at: string | null;
    created_at: string;
  };
  return {
    id: b.id,
    secretId: b.secret_id,
    secretName: b.secret_name,
    identityId: b.identity_id,
    identityHandle: b.identity_handle,
    operation: b.operation,
    expiresAt: b.expires_at,
    consumedAt: b.consumed_at,
    createdAt: b.created_at,
  };
}

function toTunnel(body: unknown): Tunnel {
  const b = body as {
    id: string;
    identity_id: string;
    hostname: string;
    status: string;
    connected: boolean;
    edge_url: string;
    last_connected_at: string | null;
    last_disconnected_at: string | null;
    created_at: string;
  };
  return {
    id: b.id,
    identityId: b.identity_id,
    hostname: b.hostname,
    status: b.status,
    connected: b.connected,
    edgeUrl: b.edge_url,
    lastConnectedAt: b.last_connected_at,
    lastDisconnectedAt: b.last_disconnected_at,
    createdAt: b.created_at,
  };
}

function toEvent(raw: unknown): AidEvent {
  const b = raw as {
    id: string;
    type: string;
    identity_id: string | null;
    aggregate_type: string | null;
    aggregate_id: string | null;
    payload: Record<string, unknown>;
    created_at: string;
  };
  return {
    id: b.id,
    type: b.type,
    identityId: b.identity_id,
    aggregateType: b.aggregate_type,
    aggregateId: b.aggregate_id,
    payload: b.payload,
    createdAt: b.created_at,
  };
}

function toWaitForEventResult(body: unknown): WaitForEventResult {
  const b = body as { event: unknown | null; timed_out: boolean };
  return { event: b.event ? toEvent(b.event) : null, timedOut: b.timed_out };
}
