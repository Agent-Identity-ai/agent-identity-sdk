import { config as loadDotenv } from "dotenv";

loadDotenv({ path: new URL("../.env", import.meta.url).pathname });
loadDotenv({ path: new URL("../../../.env", import.meta.url).pathname });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name} — see examples/support-desk/.env.example`);
  return value;
}

export const config = {
  publicApiUrl: process.env.PUBLIC_API_URL ?? "http://localhost:8080",
  frontdeskHandle: process.env.FRONTDESK_HANDLE ?? "support",
  // Must match the domain verified with the mail provider (MAIL_PROVIDER_CONFIG.domain);
  // mailboxes are provisioned under it, so a mismatch means mail is addressed nowhere.
  get mailDomain() {
    return requireEnv("MAIL_DOMAIN");
  },
  get adminApiKey() {
    return requireEnv("ADMIN_API_KEY");
  },
  get openaiApiKey() {
    return requireEnv("OPENAI_API_KEY");
  },
};
