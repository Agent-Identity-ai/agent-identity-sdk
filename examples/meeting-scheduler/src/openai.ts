import OpenAI from "openai";

export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export async function extractTitle(client: OpenAI, subject: string, body: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "Extract a short (5 words max) meeting title from this request. Reply with only the title.",
      },
      { role: "user", content: `Subject: ${subject}\n\n${body}` },
    ],
  });
  return res.choices[0]?.message.content?.trim() ?? "Meeting";
}

// A short, natural sentence explaining a proposed or countered time — surfaced as the A2A task's
// human-readable note. The actual accept/reject decision is real calendar-overlap logic, never
// the model; this only phrases it.
export async function draftSchedulingNote(
  client: OpenAI,
  kind: "propose" | "counter" | "confirm",
  title: string,
  slotDescription: string,
  extra?: string,
): Promise<string> {
  const instruction =
    kind === "propose"
      ? `Write one short, friendly sentence proposing "${slotDescription}" for a meeting titled "${title}".`
      : kind === "counter"
        ? `Write one short, friendly sentence declining a proposed time (reason: ${extra}) and countering with "${slotDescription}" instead, for a meeting titled "${title}".`
        : `Write one short, friendly sentence confirming "${slotDescription}" is booked for a meeting titled "${title}".`;
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: "You are an executive assistant agent coordinating a meeting with another company's assistant agent. Be concise." },
      { role: "user", content: instruction },
    ],
  });
  return res.choices[0]?.message.content?.trim() ?? slotDescription;
}

export async function draftConfirmationEmail(
  client: OpenAI,
  humanName: string,
  counterpartOrgName: string,
  title: string,
  slotDescription: string,
): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are ${humanName}'s executive assistant. Write a short, friendly email to ${humanName} confirming a meeting is booked. Plain text, no subject line, no signature.`,
      },
      {
        role: "user",
        content: `Meeting "${title}" with ${counterpartOrgName} is confirmed for ${slotDescription}.`,
      },
    ],
  });
  return (
    res.choices[0]?.message.content?.trim() ??
    `Your meeting "${title}" with ${counterpartOrgName} is confirmed for ${slotDescription}.`
  );
}
