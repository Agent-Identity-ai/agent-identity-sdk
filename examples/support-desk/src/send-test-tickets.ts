import { AgentClient } from "@agentidentity/sdk";
import { config } from "./config.js";
import { loadState, saveState } from "./state.js";


const state = await loadState();
const admin = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: config.adminApiKey });

const identity = await admin.identities.create({
  handle: `test-customer-${Date.now()}`,
  displayName: "Test Customer",
});
const { key: customerKey } = await admin.apiKeys.create({ name: "test-customer-key", identityId: identity.id });
const customerId = identity.id;
await saveState({ ...state, testCustomerIdentityId: customerId, testCustomerApiKey: customerKey });
console.log(`created test-customer identity @${identity.handle} (${identity.id})`);

const customer = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: customerKey });

const tickets = [
  {
    subject: "Charged twice this month",
    text: "Hi, I noticed two charges of $49 on my card this month instead of one. Can you refund the duplicate charge? Thanks, Jamie",
  },
  {
    subject: "CSV export button does nothing",
    text: "The 'Export to CSV' button on my dashboard just spins forever and never downloads anything. I've tried Chrome and Safari. Can you help? — Priya",
  },
  {
    subject: "Upgraded to Pro but still on old plan features",
    text: "I upgraded to the Pro plan yesterday and was charged $99, but my account still shows the old plan's limits and I can't access the API endpoints Pro is supposed to unlock. Please help sort this out. — Marcus",
  },
  {
    subject: "What are your support hours?",
    text: "Just wondering what hours your support team is available in case I need to call in. Thanks!",
  },
  {
    subject: "Renewal charge but premium features locked",
    text: "My annual subscription just renewed (charge went through fine) but none of the premium features unlocked in my account like last year. Is there a delay or did something break? — Sofia",
  },
];

const frontdeskAddress = `${config.frontdeskHandle}@${config.mailDomain}`;

async function sendWithRetry(ticket: { subject: string; text: string }, attempts = 30): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const sent = await customer.mail.send({
        identityId: customerId,
        to: frontdeskAddress,
        subject: ticket.subject,
        text: ticket.text,
      });
      console.log(`sent: "${ticket.subject}" (${sent.id})`);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`  send failed (attempt ${i}/${attempts}), retrying in 30s: ${(err as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }
}

for (const ticket of tickets) {
  await sendWithRetry(ticket);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

console.log("\nall test tickets sent — watch the frontdesk/billing/tech terminals.");
