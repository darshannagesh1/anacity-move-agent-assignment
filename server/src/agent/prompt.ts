import { todayIST } from "../lib/time";
import { addDays, earliestAllowedDate, getRulesFor, weekdayOf } from "../rules/engine";
import { getCommunity, getRequest, getResident, getSlotOccupancy, type RequestRecord } from "../repo";
import type { CommunityConfig } from "../types";

const TYPE_LABELS = { move_in: "move-in", move_out: "move-out" } as const;

// "Sun 2026-10-11, Mon 2026-10-12, ..." starting from today.
// Given to the model so it looks weekdays up instead of calculating them.
function upcomingCalendar(today: string, days = 21): string {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return `${weekdayOf(date)} ${date}`;
  }).join(", ");
}

// "Wed 2026-10-14", same format as the calendar
function withWeekday(date: string): string {
  return `${weekdayOf(date)} ${date}`;
}

// Only once there is a type and a date to count against. Same occupancy count evaluate() uses,
// excluding this request, so the model reads availability instead of having to ask for it.
async function slotAvailabilityLine(request: RequestRecord, config: CommunityConfig): Promise<string[]> {
  const { type, moveDate } = request;
  if (!type || !moveDate) return [];
  const rules = getRulesFor(config, type, request.residentType);
  const slots = await Promise.all(
    rules.slots.map(async (slot) => {
      const booked = await getSlotOccupancy(request.communityId, moveDate, slot, request.id);
      const full = booked >= rules.maxMovesPerSlot;
      return `${slot} ${full ? "FULL" : "available"} (${booked} of ${rules.maxMovesPerSlot} booked)`;
    }),
  );
  return [`Slot availability on ${withWeekday(moveDate)}: ${slots.join(", ")}`];
}

export async function buildSystemPrompt(requestId: number): Promise<string> {
  const request = await getRequest(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);
  const [community, resident] = await Promise.all([
    getCommunity(request.communityId),
    getResident(request.residentId),
  ]);
  if (!community || !resident) throw new Error(`Request ${requestId} has no community or resident`);

  const today = todayIST();
  const fields = JSON.stringify({
    status: request.status,
    type: request.type,
    residentType: request.residentType,
    flatNo: request.flatNo,
    moveDate: request.moveDate,
    slot: request.slot,
    data: request.data,
    documents: request.documents.map((d) => d.key),
  });

  const lines = [
    `You are the move-in/move-out assistant for ${community.name} on ANACITY.`,
    `You are helping ${resident.name}. Today is ${weekdayOf(today)}, ${today} (IST).`,
    `Calendar for the next 3 weeks: ${upcomingCalendar(today)}`,
    `Earliest allowed move-in date: ${withWeekday(earliestAllowedDate(today, community.config.moveIn))}`,
    `Earliest allowed move-out date: ${withWeekday(earliestAllowedDate(today, community.config.moveOut))}`,
    ...(await slotAvailabilityLine(request, community.config)),
    "",
    `Your job: help the resident complete a ${request.type ? TYPE_LABELS[request.type] : "move-in or move-out"} request.`,
    `Current request: ${fields}`,
  ];
  if (request.status === "info_requested" && request.adminNote) {
    lines.push(
      `The admin asked for more information: ${request.adminNote}. Help the resident resolve this first.`,
    );
  }
  lines.push(
    "",
    "How to work:",
    "- Call get_policy before explaining any rule. Never guess rules, fees, slots, or documents.",
    "- Save every detail the resident gives with update_request as soon as you have it.",
    "- After each update, look at the pending and failed rules and ask for the next missing item.",
    "  Ask one or two things at a time, not a long form.",
    "- If a date or slot fails, explain why in one line and suggest valid alternatives",
    "  (use check_slot_availability).",
    "- For documents, ask the resident to upload them using the upload buttons in the side panel.",
    "- When get_request_status shows canSubmit is true, summarize the request and fees, and ask",
    "  the resident to review and press Submit. You cannot submit or approve anything.",
    "- Be brief and friendly. Plain language, no jargon.",
    "- If asked something outside move-in/move-out, say you can only help with that.",
    '- To convert relative dates ("next Saturday", "this weekend"), look them up in the calendar above. Never calculate weekdays yourself.',
    '- After saving a date, always confirm it back with the weekday, e.g. "Sat, 17 Oct". If the resident\'s phrase could mean two dates, ask which one.',
    "- Use plain text. Never use markdown symbols like ** or #. Simple numbered lines are fine.",
    "- Before offering time slots, call check_slot_availability for that date and only offer slots with space.",
    "- Never change a detail the resident already chose (date, slot, flat, etc.) without their explicit agreement. If their choice is unavailable, explain why, offer alternatives, and wait for them to pick one.",
    "- Never say you have saved or noted something unless update_request succeeded in this same turn.",
    "- Never calculate notice periods or earliest dates yourself. Use the earliest allowed dates above or the tool results.",
    "- If the resident asks for a slot that is FULL, tell them it is full and offer the available ones. Never offer a FULL slot.",
  );
  return lines.join("\n");
}
