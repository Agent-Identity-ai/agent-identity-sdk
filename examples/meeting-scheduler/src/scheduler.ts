import { AgentClient } from "@agentidentity/sdk";
import { config } from "./config.js";
import { loadState, type OrgState } from "./state.js";
import { candidateSlots, formatSlot, isFree, slotKey, type Slot } from "./calendar.js";
import { createOpenAIClient, draftConfirmationEmail, draftSchedulingNote, extractTitle } from "./openai.js";

type Org = "a" | "b";
const org = process.argv[2] as Org;
if (org !== "a" && org !== "b") throw new Error("usage: scheduler.ts <a|b>");
const otherOrg: Org = org === "a" ? "b" : "a";

interface ProposeMessage {
  type: "propose";
  meetingId: string;
  title: string;
  slot: Slot;
  note: string;
}
interface ConfirmMessage {
  type: "confirm";
  meetingId: string;
  title: string;
  slot: Slot;
  note: string;
}
type RequestMessage = ProposeMessage | ConfirmMessage;

interface AcceptResult {
  type: "accept";
  slot: Slot;
  note: string;
}
interface CounterResult {
  type: "counter";
  slot: Slot;
  reason: string;
  note: string;
}
interface NoAvailabilityResult {
  type: "no-availability";
}
type ResponseResult = AcceptResult | CounterResult | NoAvailabilityResult;

const MAX_ROUNDS = 8;

interface Negotiation {
  meetingId: string;
  title: string;
  triedSlotKeys: Set<string>;
  rounds: number;
  humanFrom: string;
  humanSubject: string;
  humanMessageId: string;
}

const state = await loadState();
const self: OrgState = state[org];
const other: OrgState = state[otherOrg];
const client = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: self.scheduler.apiKey });
const negotiations = new Map<string, Negotiation>();

console.log(`${self.orgName}'s scheduler (@${self.scheduler.handle}) watching for meeting requests...`);

async function watchHumanRequests(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "mail.received",
        identityId: self.scheduler.identityId,
        since,
        timeoutMs: 25_000,
      });
    } catch (err) {
      console.error("wait_for_event (mail.received) failed, retrying in 5s:", (err as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    since = new Date();
    if (result.timedOut || !result.event) continue;

    const payload = result.event.payload as { messageId: string; threadId: string; from: string; subject: string };
    try {
      await handleHumanRequest(payload);
    } catch (err) {
      console.error(`failed to handle request ${payload.messageId}:`, err);
    }
  }
}

async function handleHumanRequest(payload: { messageId: string; threadId: string; from: string; subject: string }) {
  const thread = await client.mail.getThread(self.scheduler.identityId, payload.threadId);
  const message = thread.messages.find((m) => m.id === payload.messageId);
  const body = message?.textBody ?? "";

  const openai = await openaiForSelf();
  const title = await extractTitle(openai, payload.subject, body);
  const meetingId = `${self.scheduler.identityId}-${Date.now()}`;

  const negotiation: Negotiation = {
    meetingId,
    title,
    triedSlotKeys: new Set(),
    rounds: 0,
    humanFrom: payload.from,
    humanSubject: payload.subject,
    humanMessageId: payload.messageId,
  };
  negotiations.set(meetingId, negotiation);

  console.log(`${payload.from} requested a meeting — "${title}" — proposing to @${other.scheduler.handle}`);
  await proposeNextSlot(negotiation, openai);
}

async function proposeNextSlot(negotiation: Negotiation, openai: Awaited<ReturnType<typeof openaiForSelf>>) {
  negotiation.rounds += 1;
  if (negotiation.rounds > MAX_ROUNDS) {
    console.log(`meeting ${negotiation.meetingId} — no mutually free slot found after ${MAX_ROUNDS} rounds, giving up`);
    negotiations.delete(negotiation.meetingId);
    return;
  }

  const candidate = candidateSlots().find(
    (slot) => !negotiation.triedSlotKeys.has(slotKey(slot)) && isFree(org, slot),
  );
  if (!candidate) {
    console.log(`meeting ${negotiation.meetingId} — no more of our own free slots to propose`);
    negotiations.delete(negotiation.meetingId);
    return;
  }
  negotiation.triedSlotKeys.add(slotKey(candidate));

  const note = await draftSchedulingNote(openai, "propose", negotiation.title, formatSlot(candidate));
  const task = await client.a2a.sendTask({
    targetIdentityId: other.scheduler.identityId,
    message: JSON.stringify({
      type: "propose",
      meetingId: negotiation.meetingId,
      title: negotiation.title,
      slot: candidate,
      note,
    } satisfies ProposeMessage),
  });
  console.log(`proposed ${formatSlot(candidate)} for "${negotiation.title}" (task ${task.id})`);
}

async function watchIncomingRequests(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "a2a.task.created",
        identityId: self.scheduler.identityId,
        since,
        timeoutMs: 25_000,
      });
    } catch (err) {
      console.error("wait_for_event (task.created) failed, retrying in 5s:", (err as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    since = new Date();
    if (result.timedOut || !result.event) continue;

    const payload = result.event.payload as { taskId: string };
    try {
      await handleIncomingRequest(payload.taskId);
    } catch (err) {
      console.error(`failed to handle task ${payload.taskId}:`, err);
    }
  }
}

async function handleIncomingRequest(taskId: string) {
  const task = await client.a2a.getTask(taskId);
  const message = JSON.parse(task.message) as RequestMessage;
  await client.a2a.replyToTask(taskId, { intent: "progress", message: "picked up" });
  const openai = await openaiForSelf();

  if (message.type === "confirm") {
    // Trust, but verify once more — our own calendar is the only thing that can actually say yes.
    if (!isFree(org, message.slot)) {
      await client.a2a.replyToTask(taskId, {
        intent: "complete",
        message: JSON.stringify({ type: "no-availability" } satisfies NoAvailabilityResult),
      });
      console.log(`meeting "${message.title}" — confirm rejected, slot no longer free on our side`);
      return;
    }
    await client.a2a.replyToTask(taskId, {
      intent: "complete",
      message: JSON.stringify({ type: "accept", slot: message.slot, note: message.note } satisfies AcceptResult),
    });
    console.log(`confirmed "${message.title}" at ${formatSlot(message.slot)}`);
    await notifyHumanOfBooking(message.meetingId, message.title, message.slot, openai);
    return;
  }

  // message.type === "propose"
  if (isFree(org, message.slot)) {
    await client.a2a.replyToTask(taskId, {
      intent: "complete",
      message: JSON.stringify({ type: "accept", slot: message.slot, note: message.note } satisfies AcceptResult),
    });
    console.log(`accepted "${message.title}" at ${formatSlot(message.slot)}`);
    await notifyHumanOfBooking(message.meetingId, message.title, message.slot, openai);
    return;
  }

  const alt = candidateSlots().find((slot) => slotKey(slot) !== slotKey(message.slot) && isFree(org, slot));
  if (!alt) {
    await client.a2a.replyToTask(taskId, {
      intent: "complete",
      message: JSON.stringify({ type: "no-availability" } satisfies NoAvailabilityResult),
    });
    console.log(`no free slot to counter "${message.title}" with`);
    return;
  }
  const note = await draftSchedulingNote(openai, "counter", message.title, formatSlot(alt), "that time doesn't work");
  await client.a2a.replyToTask(taskId, {
    intent: "complete",
    message: JSON.stringify({ type: "counter", slot: alt, reason: "not free", note } satisfies CounterResult),
  });
  console.log(`countered "${message.title}" — proposed ${formatSlot(alt)} instead`);
}

// We are not necessarily tracking every meetingId we're a counterparty to (we only ever create a
// Negotiation entry when WE initiate) — but we still need the human's original request context to
// notify them. For the counterparty side, that context lives with the *other* org's process, so
// we only notify our own human here for meetings *we* initiated or *we* are the target of via our
// own human's request. Since this demo has exactly one human per org, we simply email that human.
async function notifyHumanOfBooking(
  meetingId: string,
  title: string,
  slot: Slot,
  openai: Awaited<ReturnType<typeof openaiForSelf>>,
) {
  const email = await draftConfirmationEmail(openai, self.human.handle, other.orgName, title, formatSlot(slot));
  await client.mail.send({
    identityId: self.scheduler.identityId,
    to: self.human.mailboxAddress,
    subject: `Meeting confirmed: ${title}`,
    text: email,
  });
  negotiations.delete(meetingId);
  console.log(`emailed ${self.human.mailboxAddress} about the confirmed meeting`);
}

async function watchOurProposalReplies(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "a2a.task.updated",
        identityId: self.scheduler.identityId,
        since,
        timeoutMs: 25_000,
      });
    } catch (err) {
      console.error("wait_for_event (task.updated) failed, retrying in 5s:", (err as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    since = new Date();
    if (result.timedOut || !result.event) continue;

    const payload = result.event.payload as { taskId: string; state: string; result: string | null };
    if (payload.state !== "completed" || !payload.result) continue;
    try {
      await handleProposalReply(payload.taskId, JSON.parse(payload.result) as ResponseResult);
    } catch (err) {
      console.error(`failed to handle reply for task ${payload.taskId}:`, err);
    }
  }
}

async function handleProposalReply(taskId: string, response: ResponseResult) {
  const task = await client.a2a.getTask(taskId);
  const request = JSON.parse(task.message) as RequestMessage;
  const negotiation = negotiations.get(request.meetingId);
  if (!negotiation) return; // not one of ours (or already resolved)

  const openai = await openaiForSelf();

  if (response.type === "accept") {
    console.log(`meeting "${negotiation.title}" accepted at ${formatSlot(response.slot)}`);
    await notifyHumanOfBooking(negotiation.meetingId, negotiation.title, response.slot, openai);
    return;
  }

  if (response.type === "no-availability") {
    console.log(`meeting "${negotiation.title}" — other side has no availability, giving up`);
    negotiations.delete(negotiation.meetingId);
    return;
  }

  // response.type === "counter"
  negotiation.triedSlotKeys.add(slotKey(response.slot));
  if (isFree(org, response.slot)) {
    const note = await draftSchedulingNote(openai, "confirm", negotiation.title, formatSlot(response.slot));
    const confirmTask = await client.a2a.sendTask({
      targetIdentityId: other.scheduler.identityId,
      message: JSON.stringify({
        type: "confirm",
        meetingId: negotiation.meetingId,
        title: negotiation.title,
        slot: response.slot,
        note,
      } satisfies ConfirmMessage),
    });
    console.log(`their counter ${formatSlot(response.slot)} works for us — confirming (task ${confirmTask.id})`);
    return;
  }

  console.log(`their counter ${formatSlot(response.slot)} doesn't work for us either — proposing another`);
  await proposeNextSlot(negotiation, openai);
}

async function openaiForSelf() {
  const lease = await client.vault.createLease(self.scheduler.openaiSecretId, { operation: "openai.chat.completions" });
  const redeemed = await client.vault.redeemLease(lease.leaseId, {
    publicKey: self.scheduler.vaultPublicKey,
    privateKey: self.scheduler.vaultPrivateKey,
  });
  return createOpenAIClient(redeemed.secret);
}

await Promise.all([watchHumanRequests(), watchIncomingRequests(), watchOurProposalReplies()]);
