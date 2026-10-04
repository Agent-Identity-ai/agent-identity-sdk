import { readFile, writeFile } from "node:fs/promises";

const STATE_PATH = new URL("../.state.json", import.meta.url).pathname;

export interface SchedulerIdentity {
  identityId: string;
  handle: string;
  mailboxAddress: string;
  apiKey: string;
  vaultPublicKey: string;
  vaultPrivateKey: string;
  openaiSecretId: string;
}

export interface HumanIdentity {
  identityId: string;
  handle: string;
  mailboxAddress: string;
  apiKey: string;
}

export interface OrgState {
  orgId: string;
  orgName: string;
  human: HumanIdentity;
  scheduler: SchedulerIdentity;
}

export interface MeetingSchedulerState {
  a: OrgState;
  b: OrgState;
}

export async function saveState(state: MeetingSchedulerState): Promise<void> {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function loadState(): Promise<MeetingSchedulerState> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as MeetingSchedulerState;
  } catch {
    throw new Error("no .state.json found — run `pnpm bootstrap` first");
  }
}
