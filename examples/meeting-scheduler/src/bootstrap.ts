import { createInterface } from "node:readline/promises";
import { AgentClient, createOrganization, verifyOwner } from "@agentidentity/sdk";
import { config } from "./config.js";
import { saveState, type HumanIdentity, type OrgState, type SchedulerIdentity } from "./state.js";

async function setupOrg(orgName: string, orgSlugPrefix: string, humanHandle: string, humanName: string, schedulerHandle: string, schedulerName: string) {
  const org = await createOrganization(config.publicApiUrl, {
    name: orgName,
    slug: `${orgSlugPrefix}-${Date.now()}`,
    ownerEmail: config.ownerEmail,
  });
  if (org.verificationRequired) {
    // A code was just emailed to the owner. Until it comes back, this org cannot reach the other one.
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = (await rl.question(`Enter the 6-digit code emailed to ${config.ownerEmail} for "${orgName}": `)).trim();
    rl.close();
    await verifyOwner(config.publicApiUrl, org.adminApiKey, code);
    console.log(`"${orgName}" verified`);
  }
  const admin = new AgentClient({ baseUrl: config.publicApiUrl, apiKey: org.adminApiKey });

  const humanIdentity = await admin.identities.create({ handle: humanHandle, displayName: humanName });
  const { key: humanApiKey } = await admin.apiKeys.create({ name: `${humanHandle}-key`, identityId: humanIdentity.id });
  const human: HumanIdentity = {
    identityId: humanIdentity.id,
    handle: humanIdentity.handle,
    mailboxAddress: humanIdentity.mailboxAddress,
    apiKey: humanApiKey,
  };

  const schedulerIdentity = await admin.identities.create({ handle: schedulerHandle, displayName: schedulerName });
  const { key: schedulerApiKey } = await admin.apiKeys.create({
    name: `${schedulerHandle}-key`,
    identityId: schedulerIdentity.id,
  });
  const keypair = await admin.vault.generateIdentityKey(schedulerIdentity.id);
  const secret = await admin.vault.createSecret({
    identityId: schedulerIdentity.id,
    name: "openai-api-key",
    plaintext: config.openaiApiKey,
  });
  await admin.a2a.updateSettings(schedulerIdentity.id, { enabled: true });

  const scheduler: SchedulerIdentity = {
    identityId: schedulerIdentity.id,
    handle: schedulerIdentity.handle,
    mailboxAddress: schedulerIdentity.mailboxAddress,
    apiKey: schedulerApiKey,
    vaultPublicKey: keypair.publicKey,
    vaultPrivateKey: keypair.privateKey,
    openaiSecretId: secret.id,
  };

  console.log(`org "${orgName}" (${org.id}): @${human.handle} (${human.mailboxAddress}), @${scheduler.handle}`);
  return { orgState: { orgId: org.id, orgName, human, scheduler } as OrgState, admin };
}

const { orgState: a, admin: adminA } = await setupOrg(
  "Acme Corp",
  "acme",
  "alex",
  "Alex Chen",
  "alex-scheduler",
  "Alex's Scheduling Assistant",
);
const { orgState: b, admin: adminB } = await setupOrg(
  "Globex Corp",
  "globex",
  "bailey",
  "Bailey Morgan",
  "bailey-scheduler",
  "Bailey's Scheduling Assistant",
);

// Real cross-org federation: B opts into the directory, A finds it there, A's admin sends a real
// invitation, B's admin accepts it — this is the actual trust-establishment path, not a shortcut.
// This is the one-time "the two companies' IT teams agreed to federate" step; the agents' own
// negotiation (scheduler.ts) only starts after this, using the mutual trust it creates.
await adminB.a2a.updateSettings(b.scheduler.identityId, { publiclyDiscoverable: true });

const found = await adminA.a2a.searchDirectory(b.scheduler.handle);
const foundEntry = found.find((entry) => entry.identityId === b.scheduler.identityId);
if (!foundEntry) throw new Error("bailey-scheduler not found in the directory after listing it — bootstrap bug");
console.log(`found @${foundEntry.handle} (${foundEntry.orgName}) in the directory`);

const invitation = await adminA.a2a.createInvitation({
  fromIdentityId: a.scheduler.identityId,
  toIdentityId: b.scheduler.identityId,
  message: "Proposing we federate our scheduling assistants for cross-company meeting booking.",
});
await adminB.a2a.acceptInvitation(invitation.id);
console.log(`federation established: @${a.scheduler.handle} <-> @${b.scheduler.handle}`);

await saveState({ a, b });
console.log(`\nbootstrap complete — state written to examples/meeting-scheduler/.state.json`);
console.log(`\nrun each scheduler in its own terminal:`);
console.log(`  pnpm --filter meeting-scheduler a`);
console.log(`  pnpm --filter meeting-scheduler b`);
console.log(`\nthen: pnpm --filter meeting-scheduler send-test-request`);
