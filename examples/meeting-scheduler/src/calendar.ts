// Real, fixed data — not scripted dialogue. Each org's calendar is genuinely independent, and
// nothing here decides how the negotiation plays out; that's left entirely to the scheduler
// agents comparing this data against each other's proposals in real time.

export interface Slot {
  dayOffset: number; // 1 = tomorrow, 2 = day after, etc. (never "today" — keeps it simple)
  startHour: number; // 24h, local
}

const CANDIDATE_HOURS = [9, 10, 11, 14, 15];
const CANDIDATE_DAYS = [1, 2, 3, 4];

export function candidateSlots(): Slot[] {
  const slots: Slot[] = [];
  for (const dayOffset of CANDIDATE_DAYS) {
    for (const startHour of CANDIDATE_HOURS) slots.push({ dayOffset, startHour });
  }
  return slots;
}

const BUSY: Record<"a" | "b", Slot[]> = {
  a: [
    { dayOffset: 1, startHour: 9 },
    { dayOffset: 1, startHour: 10 },
    { dayOffset: 1, startHour: 11 },
    { dayOffset: 2, startHour: 14 },
    { dayOffset: 2, startHour: 15 },
    { dayOffset: 3, startHour: 9 },
    { dayOffset: 3, startHour: 10 },
  ],
  b: [
    { dayOffset: 1, startHour: 9 },
    { dayOffset: 1, startHour: 10 },
    { dayOffset: 1, startHour: 14 },
    { dayOffset: 1, startHour: 15 },
    { dayOffset: 2, startHour: 9 },
    { dayOffset: 2, startHour: 10 },
    { dayOffset: 2, startHour: 11 },
    { dayOffset: 3, startHour: 14 },
  ],
};

export function isFree(org: "a" | "b", slot: Slot): boolean {
  return !BUSY[org].some((b) => b.dayOffset === slot.dayOffset && b.startHour === slot.startHour);
}

export function slotToDate(slot: Slot): Date {
  const date = new Date();
  date.setDate(date.getDate() + slot.dayOffset);
  date.setHours(slot.startHour, 0, 0, 0);
  return date;
}

export function formatSlot(slot: Slot): string {
  return slotToDate(slot).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function slotKey(slot: Slot): string {
  return `${slot.dayOffset}:${slot.startHour}`;
}
