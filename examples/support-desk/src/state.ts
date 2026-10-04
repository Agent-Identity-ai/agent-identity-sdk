import { readFile, writeFile } from "node:fs/promises";

// Persists what `bootstrap.ts` creates — identity ids, each identity's own agent-scoped API key,
// and each identity's vault keypair (the private half never leaves this file or the process that
// holds it; the API server only ever saw the public half). Contains real secrets — gitignored.

const STATE_PATH = new URL("../.state.json", import.meta.url).pathname;

export interface AgentState {
  identityId: string;
  handle: string;
  apiKey: string;
  vaultPublicKey: string;
  vaultPrivateKey: string;
  openaiSecretId: string;
}

export interface SupportDeskState {
  orgId: string;
  frontdesk: AgentState;
  billing: AgentState;
  tech: AgentState;

  testCustomerIdentityId?: string;
  testCustomerApiKey?: string;
}

export async function saveState(state: SupportDeskState): Promise<void> {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function loadState(): Promise<SupportDeskState> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as SupportDeskState;
  } catch {
    throw new Error("no .state.json found — run `pnpm bootstrap` first");
  }
}
