import { config as loadDotenv } from "dotenv";

loadDotenv({ path: new URL("../.env", import.meta.url).pathname });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name} — see examples/meeting-scheduler/.env.example`);
  return value;
}

export const config = {
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://localhost:8080",
  get openaiApiKey() {
    return requireEnv("OPENAI_API_KEY");
  },
  // An organization can only send tasks to another organization once a human has proved they own it,
  // so each org here is created with this address and verified with the code emailed to it.
  get ownerEmail() {
    return requireEnv("OWNER_EMAIL");
  },
};
