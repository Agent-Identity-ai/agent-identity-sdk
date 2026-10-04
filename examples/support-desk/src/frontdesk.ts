import { AgentClient } from "@agentidentity/sdk";
import { config } from "./config.js";
import { loadState } from "./state.js";
import { classify, createOpenAIClient, draftReply } from "./openai.js";

interface PendingTicket {
  threadId: string;
  messageId: string;
  from: string;
  subject: string;
}

const state = await loadState();
const client = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: state.frontdesk.apiKey });
const openai = createOpenAIClient(config.openaiApiKey);
const pending = new Map<string, PendingTicket>();

console.log(`frontdesk (@${state.frontdesk.handle}) watching for inbound mail and specialist replies...`);

async function watchInboundMail(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "mail.received",
        identityId: state.frontdesk.identityId,
        since,
        timeoutMs: 25_000,
      });
    } catch (err) {
      console.error(`wait_for_event (mail.received) failed, retrying in 5s:`, (err as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    since = new Date();
    if (result.timedOut || !result.event) continue;

    const payload = result.event.payload as { messageId: string; threadId: string; from: string; subject: string };
    try {
      await handleInboundMail(payload);
    } catch (err) {
      console.error(`failed to handle message ${payload.messageId}:`, err);
    }
  }
}

async function handleInboundMail(payload: { messageId: string; threadId: string; from: string; subject: string }) {
  const thread = await client.mail.getThread(state.frontdesk.identityId, payload.threadId);
  const message = thread.messages.find((m) => m.id === payload.messageId);
  const body = message?.textBody ?? "";
  const subject = payload.subject || "(no subject)";

  const category = await classify(openai, subject, body);
  console.log(`ticket from ${payload.from} — "${subject}" classified as ${category}`);

  if (category === "general") {
    const reply = await draftReply(openai, "frontdesk", subject, body);
    await sendReply(payload.from, subject, payload.messageId, reply);
    return;
  }

  const target = category === "billing" ? state.billing : state.tech;
  const task = await client.a2a.sendTask({
    targetIdentityId: target.identityId,
    message: JSON.stringify({ kind: "ticket", subject, body }),
  });
  pending.set(task.id, { threadId: payload.threadId, messageId: payload.messageId, from: payload.from, subject });
  console.log(`routed to @${target.handle} as a2a task ${task.id}`);
}

async function watchSpecialistReplies(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "a2a.task.updated",
        identityId: state.frontdesk.identityId,
        since,
        timeoutMs: 25_000,
      });
    } catch (err) {
      console.error(`wait_for_event (task.updated) failed, retrying in 5s:`, (err as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    since = new Date();
    if (result.timedOut || !result.event) continue;

    const payload = result.event.payload as { taskId: string; state: string; result: string | null };
    if (payload.state !== "completed" || !payload.result) continue;
    const ticket = pending.get(payload.taskId);
    if (!ticket) continue;
    pending.delete(payload.taskId);

    try {
      await sendReply(ticket.from, ticket.subject, ticket.messageId, payload.result);
      console.log(`replied to ${ticket.from} for task ${payload.taskId}`);
    } catch (err) {
      console.error(`failed to send reply for task ${payload.taskId}:`, err);
    }
  }
}

async function sendReply(to: string, subject: string, inReplyToMessageId: string, text: string) {
  await client.mail.send({
    identityId: state.frontdesk.identityId,
    to,
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    text,
    inReplyToMessageId,
  });
}

await Promise.all([watchInboundMail(), watchSpecialistReplies()]);
