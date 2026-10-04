import { AgentClient } from "@agentidentity/sdk";
import { config } from "./config.js";
import { loadState, type AgentState } from "./state.js";
import { answerConsult, createOpenAIClient, decide, draftReply } from "./openai.js";

type Role = "billing" | "tech";

const role = process.argv[2] as Role;
if (role !== "billing" && role !== "tech") {
  throw new Error("usage: specialist.ts <billing|tech>");
}
const otherRole: Role = role === "billing" ? "tech" : "billing";

interface TicketMessage {
  kind: "ticket";
  subject: string;
  body: string;
}
interface ConsultMessage {
  kind: "consult";
  question: string;
  subject: string;
  body: string;
}
type TaskMessage = TicketMessage | ConsultMessage;

interface PendingConsult {
  originalTaskId: string;
  subject: string;
  body: string;
}

const state = await loadState();
const self: AgentState = state[role];
const other: AgentState = state[otherRole];
const client = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: self.apiKey });
const pendingConsults = new Map<string, PendingConsult>();

console.log(`${role} specialist (@${self.handle}) watching for routed tickets and consults...`);

async function watchIncomingTasks(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "a2a.task.created",
        identityId: self.identityId,
        since,
        timeoutMs: 25_000,
      });
    } catch (err) {
      console.error(`wait_for_event (task.created) failed, retrying in 5s:`, (err as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    since = new Date();
    if (result.timedOut || !result.event) continue;

    const payload = result.event.payload as { taskId: string };
    try {
      await handleIncomingTask(payload.taskId);
    } catch (err) {
      console.error(`failed to handle task ${payload.taskId}:`, err);
    }
  }
}

async function watchConsultReplies(): Promise<never> {
  let since = new Date();
  for (;;) {
    let result;
    try {
      result = await client.events.wait({
        type: "a2a.task.updated",
        identityId: self.identityId,
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
    const consult = pendingConsults.get(payload.taskId);
    if (!consult) continue;
    pendingConsults.delete(payload.taskId);

    try {
      await finalizeAfterConsult(consult, payload.result);
    } catch (err) {
      console.error(`failed to finalize ticket ${consult.originalTaskId} after consult:`, err);
    }
  }
}

async function handleIncomingTask(taskId: string) {
  const task = await client.a2a.getTask(taskId);
  const message = JSON.parse(task.message) as TaskMessage;

  await client.a2a.replyToTask(taskId, { intent: "progress", message: "picked up" });
  const openai = await openaiForSelf();

  if (message.kind === "consult") {
    console.log(`answering consult from @${other.handle} — "${message.question}"`);
    const answer = await answerConsult(openai, role, message.question, message.subject, message.body);
    await client.a2a.replyToTask(taskId, { intent: "complete", message: answer });
    return;
  }

  console.log(`picked up ticket ${taskId} — "${message.subject}"`);
  const decision = await decide(openai, role, otherRole, message.subject, message.body);

  if (decision.type === "answer") {
    await client.a2a.replyToTask(taskId, { intent: "complete", message: decision.text });
    console.log(`answered ticket ${taskId} directly`);
    return;
  }

  console.log(`ticket ${taskId} needs input from @${other.handle} — asking: "${decision.question}"`);
  const consultTask = await client.a2a.sendTask({
    targetIdentityId: other.identityId,
    message: JSON.stringify({
      kind: "consult",
      question: decision.question,
      subject: message.subject,
      body: message.body,
    } satisfies ConsultMessage),
  });
  pendingConsults.set(consultTask.id, { originalTaskId: taskId, subject: message.subject, body: message.body });
}

async function finalizeAfterConsult(consult: PendingConsult, consultAnswer: string) {
  console.log(`got consult answer for ticket ${consult.originalTaskId}, drafting final reply`);
  const openai = await openaiForSelf();
  const finalReply = await draftReply(openai, `${role} specialist`, consult.subject, consult.body, consultAnswer);
  await client.a2a.replyToTask(consult.originalTaskId, { intent: "complete", message: finalReply });
  console.log(`completed ticket ${consult.originalTaskId}`);
}

// Every call leases and redeems its own copy of the OpenAI key rather than caching it in memory
// — the point of the vault here is that this process never holds the plaintext key any longer
// than a single call needs it.
async function openaiForSelf() {
  const lease = await client.vault.createLease(self.openaiSecretId, { operation: "openai.chat.completions" });
  const redeemed = await client.vault.redeemLease(lease.leaseId, {
    publicKey: self.vaultPublicKey,
    privateKey: self.vaultPrivateKey,
  });
  return createOpenAIClient(redeemed.secret);
}

await Promise.all([watchIncomingTasks(), watchConsultReplies()]);
