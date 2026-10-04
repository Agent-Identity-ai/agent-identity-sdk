# meeting-scheduler

Two separate orgs, each with its own scheduling-assistant agent, negotiating a meeting time with
each other over real cross-org A2A — the actual federation path (directory + invitation + accept),
not the same-org access `support-desk` relies on. Built to stress-test that specifically.

## How it works

- **Acme Corp** (`alex-scheduler`) and **Globex Corp** (`bailey-scheduler`) are bootstrapped as two
  independent orgs. Bailey opts into the A2A directory; Alex's org finds them there, sends a real
  invitation, and Bailey's org accepts it — establishing mutual trust the same way two companies'
  IT teams would in real life, once, ahead of time.
- Each scheduler holds a small, fixed, genuinely independent calendar of busy slots
  (`calendar.ts`) — this is real data, not scripted dialogue.
- When Alex emails `alex-scheduler` asking to set up a meeting, it proposes its own first free slot
  to `bailey-scheduler` via a real A2A task. Bailey's scheduler checks that slot against its *own*
  calendar: if free, it accepts; if not, it counters with a slot that *is* free for it. Alex's
  scheduler checks the counter against its own calendar in turn, and so on — real back-and-forth
  driven entirely by comparing two independent, real data sets, not a scripted number of rounds.
  It's capped at 8 rounds as a safety bound in case no slot ever overlaps.
- Once both sides agree, each scheduler emails its own human confirming the booking.
- An LLM (via each scheduler's own vault-leased OpenAI key) only phrases the natural-language notes
  and confirmation emails — the actual accept/reject/counter decision is deterministic, based on
  the real calendar data.

## Setup

1. `cp .env.example .env` and fill in `OPENAI_API_KEY` (stored into each scheduler's vault at
   bootstrap, not read directly afterward) and `OWNER_EMAIL`, an inbox you can read.
2. `pnpm bootstrap` — creates both orgs (asks you for the 6-digit code emailed to `OWNER_EMAIL` for each — cross-organization tasks need a verified owner), both humans, both schedulers, their vault keypairs, and
   runs the real invitation/accept flow between them. Writes everything to `.state.json`.
3. In two separate terminals:
   ```
   pnpm --filter meeting-scheduler a
   pnpm --filter meeting-scheduler b
   ```
4. `pnpm --filter meeting-scheduler send-test-request` — sends a real email from Alex asking to
   schedule with Bailey, and watch the two terminals negotiate.

## Re-running

`bootstrap` isn't idempotent — it always creates two fresh orgs. Delete `.state.json` and re-run to
start over.
