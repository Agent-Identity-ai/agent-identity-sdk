import { AgentClient } from "@agentidentity/sdk";
import { config } from "./config.js";
import { saveState, type AgentState } from "./state.js";

const admin = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: config.adminApiKey });

async function setupAgent(handle: string, displayName: string): Promise<AgentState> {
  const identity = await admin.identities.create({ handle, displayName });
  const { key } = await admin.apiKeys.create({ name: `${handle}-key`, identityId: identity.id });
  const keypair = await admin.vault.generateIdentityKey(identity.id);
  const secret = await admin.vault.createSecret({
    identityId: identity.id,
    name: "openai-api-key",
    plaintext: config.openaiApiKey,
  });
  await admin.a2a.updateSettings(identity.id, { enabled: true });

  console.log(`created @${identity.handle} (${identity.id}), mailbox ${identity.mailboxAddress}`);
  return {
    identityId: identity.id,
    handle: identity.handle,
    apiKey: key,
    vaultPublicKey: keypair.publicKey,
    vaultPrivateKey: keypair.privateKey,
    openaiSecretId: secret.id,
  };
}

const frontdesk = await setupAgent(config.frontdeskHandle, "Support Frontdesk");
const billing = await setupAgent("billing-specialist", "Billing Specialist");
const tech = await setupAgent("tech-specialist", "Tech Specialist");


// No trust rules: the three agents share an organization, so once each has A2A enabled (setupAgent
// does that) they can send each other tasks. Rules are only for reaching across organizations.

const me = await admin.whoami();
await saveState({ orgId: me.orgId, frontdesk, billing, tech });

console.log(`\nbootstrap complete — state written to examples/support-desk/.state.json`);
console.log(`org: ${me.orgName} (${me.orgId})`);
console.log(`\nrun each process in its own terminal:`);
console.log(`  pnpm --filter support-desk frontdesk`);
console.log(`  pnpm --filter support-desk billing`);
console.log(`  pnpm --filter support-desk tech`);
