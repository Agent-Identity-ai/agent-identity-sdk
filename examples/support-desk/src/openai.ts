import OpenAI from "openai";

export type Category = "billing" | "tech" | "general";
const CATEGORIES: Category[] = ["billing", "tech", "general"];

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export async function classify(client: OpenAI, subject: string, body: string): Promise<Category> {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Classify a customer support email into exactly one word: billing, tech, or general. " +
          "Reply with only that word, nothing else.",
      },
      { role: "user", content: `Subject: ${subject}\n\n${body}` },
    ],
  });
  const word = res.choices[0]?.message.content?.trim().toLowerCase();
  return CATEGORIES.includes(word as Category) ? (word as Category) : "general";
}

export async function draftReply(
  client: OpenAI,
  role: string,
  subject: string,
  body: string,
  extraContext?: string,
): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are a helpful ${role} for a software product's support desk. Write a short, friendly, concrete reply to the customer's email below. Plain text only, no subject line, no signature.${
          extraContext ? ` Use the following internal note from a colleague to inform your answer — don't quote it verbatim, just use the facts in it:\n\n${extraContext}` : ""
        }`,
      },
      { role: "user", content: `Subject: ${subject}\n\n${body}` },
    ],
  });
  return res.choices[0]?.message.content?.trim() ?? "Thanks for reaching out — we'll follow up shortly.";
}

export type Decision = { type: "answer"; text: string } | { type: "consult"; question: string };

// A genuine judgment call, not a scripted branch — most tickets should come back as "answer";
// "consult" only when the model itself decides it's missing a fact only the other specialist
// would have. This is what lets a real A2A back-and-forth happen without forcing it.
export async function decide(
  client: OpenAI,
  role: "billing" | "tech",
  otherRole: "billing" | "tech",
  subject: string,
  body: string,
): Promise<Decision> {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          `You are the ${role} specialist on a software product's support desk. You'll receive a customer ` +
          `ticket. Company policy: never guess or promise something you haven't actually confirmed — if the ` +
          `ticket touches on anything the ${otherRole} specialist would have first-hand knowledge of (their ` +
          `account status, a known bug, a feature's current behavior, billing state, etc.), check with them ` +
          `first rather than assuming. If you already have everything you need to answer confidently without ` +
          `checking anything, respond with "ANSWER:" followed by a short, friendly, concrete reply to the ` +
          `customer. Otherwise respond with "CONSULT:" followed by one specific, direct question for the ` +
          `${otherRole} specialist.`,
      },
      { role: "user", content: `Subject: ${subject}\n\n${body}` },
    ],
  });
  const text = res.choices[0]?.message.content?.trim() ?? "";
  if (text.toUpperCase().startsWith("CONSULT:")) {
    return { type: "consult", question: text.slice(text.indexOf(":") + 1).trim() };
  }
  const answer = text.toUpperCase().startsWith("ANSWER:") ? text.slice(text.indexOf(":") + 1).trim() : text;
  return { type: "answer", text: answer || "Thanks for reaching out — we'll follow up shortly." };
}

// Answering a colleague's consult question directly — internal, not customer-facing.
export async function answerConsult(
  client: OpenAI,
  role: "billing" | "tech",
  question: string,
  subject: string,
  body: string,
): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are the ${role} specialist on a software product's support desk. A colleague handling a customer ticket is asking you a direct question. Answer it concisely and factually, as an internal note — not customer-facing.`,
      },
      {
        role: "user",
        content: `Original ticket — Subject: ${subject}\n\n${body}\n\nColleague's question: ${question}`,
      },
    ],
  });
  return res.choices[0]?.message.content?.trim() ?? "No additional information available.";
}
