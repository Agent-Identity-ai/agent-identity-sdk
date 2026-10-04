import { AgentClient } from "@agentidentity/sdk";
import { config } from "./config.js";
import { loadState } from "./state.js";

const state = await loadState();
const alex = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: state.a.human.apiKey });

async function sendWithRetry(attempts = 30): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const sent = await alex.mail.send({
        identityId: state.a.human.identityId,
        to: state.a.scheduler.mailboxAddress,
        subject: "Quick sync with Globex",
        text: "Hey, can you set up a 30-minute call with Bailey over at Globex sometime this week to discuss the Q3 partnership? Whatever time works for both of us.",
      });
      console.log(`sent request (${sent.id}) — watch the "a" and "b" scheduler terminals.`);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`  send failed (attempt ${i}/${attempts}), retrying in 30s: ${(err as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }
}

await sendWithRetry();
