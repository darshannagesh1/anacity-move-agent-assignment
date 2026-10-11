import type OpenAI from "openai";
import { z } from "zod";
import { todayIST } from "../lib/time";
import {
  addEvent,
  findUnitByFlatNo,
  getCommunity,
  getRequest,
  getSlotOccupancy,
  updateRequestFields,
  type RequestFieldUpdate,
} from "../repo";
import { addDays, computeFees, getRulesFor, isValidDate, weekdayOf, type RuleResult } from "../rules/engine";
import { evaluate } from "../services/evaluation";
import type { CommunityConfig, ExtraField, RequestType, ResidentType } from "../types";

export interface ToolContext { requestId: number; communityId: string }
export interface ToolOutcome { result: unknown; requestChanged: boolean }

// message is safe to show the model
class ToolError extends Error {}

export const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_policy",
      description:
        "Get this community's move rules for the current request: notice period, allowed days, slots, required documents, fees, extra fields and policy notes. Call this before explaining any rule.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "update_request",
      description:
        "Save details the resident has given. Send only the fields you are changing. Returns the rules that are still pending or failing.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["move_in", "move_out"] },
          residentType: { type: "string", enum: ["owner", "tenant"] },
          flatNo: { type: "string", description: "Flat number as the resident gave it, e.g. A-101" },
          moveDate: { type: "string", description: "Move date as YYYY-MM-DD" },
          slot: { type: "string", description: "One of the slots from get_policy, e.g. 09:00-12:00" },
          data: {
            type: "object",
            description: "Extra field values keyed by the field keys from get_policy, e.g. { \"members_count\": 3 }",
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_slot_availability",
      description:
        "Check which slots are free on a date, and whether that date is an allowed day and meets the notice period. Needs the request type to be saved first.",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "Date to check as YYYY-MM-DD" } },
        required: ["date"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_request_status",
      description:
        "Get the current request fields, the rules that are pending or failing, whether it can be submitted, and the fees.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

const dateSchema = z.string().trim().refine(isValidDate, "must be a real date in YYYY-MM-DD format");

const updateSchema = z.strictObject({
  type: z.enum(["move_in", "move_out"]).optional(),
  residentType: z.enum(["owner", "tenant"]).optional(),
  flatNo: z.string().trim().min(1).optional(),
  moveDate: dateSchema.optional(),
  slot: z.string().trim().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const slotCheckSchema = z.strictObject({ date: dateSchema });

// The model often sends "3" or "true"; coerce so the rule engine only sees clean values.
const fieldSchemas: Record<ExtraField["type"], z.ZodType> = {
  text: z.string().trim(),
  number: z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number("must be a number")),
  boolean: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]),
};

function coerceData(config: CommunityConfig, data: Record<string, unknown>): Record<string, unknown> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of [...config.moveIn.extraFields, ...config.moveOut.extraFields]) {
    shape[field.key] = fieldSchemas[field.type];
  }
  const validKeys = Object.keys(shape);
  const unknownKeys = Object.keys(data).filter((key) => !validKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new ToolError(`Unknown data field(s): ${unknownKeys.join(", ")}. Valid fields: ${validKeys.join(", ")}`);
  }
  return z.object(shape).partial().parse(data);
}

function brief(results: RuleResult[], status: RuleResult["status"]) {
  return results.filter((r) => r.status === status).map((r) => ({ label: r.label, detail: r.detail }));
}

// "2026-10-17 (Sat)", for the model only; the DB keeps the plain date.
function withWeekday(date: string | null): string | null {
  return date ? `${date} (${weekdayOf(date)})` : null;
}

async function loadRequest(ctx: ToolContext) {
  const [request, community] = await Promise.all([getRequest(ctx.requestId), getCommunity(ctx.communityId)]);
  if (!request || !community || request.communityId !== community.id) throw new ToolError("Request not found");
  return { request, config: community.config };
}

async function getPolicy(ctx: ToolContext) {
  const { request, config } = await loadRequest(ctx);
  const { type, residentType } = request;
  const { policyNotes } = config;

  if (!type) {
    return {
      note: "Request type is not set yet, so both rule sets are shown.",
      moveIn: getRulesFor(config, "move_in", residentType),
      moveOut: getRulesFor(config, "move_out", residentType),
      policyNotes,
    };
  }
  const rules = getRulesFor(config, type, residentType);
  return {
    type,
    residentType,
    rules,
    // Without a resident type, fees keep their appliesTo list so the model can explain who pays.
    fees: residentType ? computeFees(config, type, residentType) : rules.fees,
    policyNotes,
  };
}

async function updateRequest(ctx: ToolContext, args: unknown) {
  const input = updateSchema.parse(args);
  const { request, config } = await loadRequest(ctx);

  if (request.status !== "draft" && request.status !== "info_requested") {
    throw new ToolError(`This request is ${request.status} and can no longer be changed`);
  }

  const update: RequestFieldUpdate = {
    type: input.type,
    residentType: input.residentType,
    moveDate: input.moveDate,
    slot: input.slot,
  };
  if (input.flatNo) {
    const unit = await findUnitByFlatNo(ctx.communityId, input.flatNo);
    if (!unit) throw new ToolError(`No flat "${input.flatNo}" found in this community. Ask the resident to check the flat number.`);
    update.unitId = unit.id;
  }
  if (input.data && Object.keys(input.data).length > 0) {
    update.data = coerceData(config, input.data);
  }
  if (Object.values(update).every((value) => value === undefined)) {
    throw new ToolError("No fields were provided to update");
  }

  // a full slot is never saved: the model has to offer what's free and let the resident pick
  const rejection = await rejectFullSlot(ctx, config, {
    type: input.type ?? request.type,
    residentType: input.residentType ?? request.residentType,
    moveDate: input.moveDate ?? request.moveDate,
    slot: input.slot,
  });
  if (rejection) update.slot = undefined;

  const hasChanges = Object.values(update).some((value) => value !== undefined);
  if (hasChanges) {
    await updateRequestFields(ctx.requestId, update);
    await addEvent(ctx.requestId, "agent", "fields_updated", {
      fields: { ...input, slot: update.slot, data: update.data },
    });
  }

  const [saved, evaluation] = await Promise.all([getRequest(ctx.requestId), evaluate(ctx.requestId)]);
  return {
    saved: hasChanges,
    ...rejection,
    moveDate: withWeekday(saved?.moveDate ?? null),
    pending: brief(evaluation.results, "pending"),
    failed: brief(evaluation.results, "fail"),
    canSubmit: evaluation.canSubmit,
  };
}

// Same occupancy count evaluate() uses, excluding this request. Null when the slot can be saved.
async function rejectFullSlot(
  ctx: ToolContext,
  config: CommunityConfig,
  wanted: { type: RequestType | null; residentType: ResidentType | null; moveDate: string | null; slot?: string },
): Promise<{ slotRejected: string; availableSlots: string[] } | null> {
  const { type, moveDate, slot } = wanted;
  if (!slot || !type || !moveDate) return null;
  const rules = getRulesFor(config, type, wanted.residentType);
  // an unknown slot is still saved, so the slot_valid rule can explain it
  if (!rules.slots.includes(slot)) return null;

  const booked = await Promise.all(
    rules.slots.map((s) => getSlotOccupancy(ctx.communityId, moveDate, s, ctx.requestId)),
  );
  if (booked[rules.slots.indexOf(slot)] < rules.maxMovesPerSlot) return null;
  return {
    slotRejected: `${slot} is full on ${withWeekday(moveDate)}`,
    availableSlots: rules.slots.filter((_, i) => booked[i] < rules.maxMovesPerSlot),
  };
}

async function checkSlotAvailability(ctx: ToolContext, args: unknown) {
  const { date } = slotCheckSchema.parse(args);
  const { request, config } = await loadRequest(ctx);
  if (!request.type) {
    throw new ToolError("Request type is not set yet. Save move_in or move_out with update_request first.");
  }

  const rules = getRulesFor(config, request.type, request.residentType);
  const weekday = weekdayOf(date);
  const earliestDate = addDays(todayIST(), rules.noticeDays);
  const slots = await Promise.all(
    rules.slots.map(async (slot) => {
      const booked = await getSlotOccupancy(ctx.communityId, date, slot, ctx.requestId);
      return { slot, booked, capacity: rules.maxMovesPerSlot, available: booked < rules.maxMovesPerSlot };
    }),
  );

  return {
    date,
    weekday,
    allowedDay: rules.allowedDays.includes(weekday),
    allowedDays: rules.allowedDays,
    meetsNoticePeriod: date >= earliestDate,
    earliestDate,
    slots,
  };
}

async function getRequestStatus(ctx: ToolContext) {
  const { request } = await loadRequest(ctx);
  const evaluation = await evaluate(ctx.requestId);
  return {
    request: {
      status: request.status,
      type: request.type,
      residentType: request.residentType,
      flatNo: request.flatNo,
      moveDate: withWeekday(request.moveDate),
      slot: request.slot,
      data: request.data,
      documents: request.documents.map((d) => d.key),
      adminNote: request.adminNote,
    },
    pending: brief(evaluation.results, "pending"),
    failed: brief(evaluation.results, "fail"),
    info: brief(evaluation.results, "info"),
    canSubmit: evaluation.canSubmit,
    fees: evaluation.fees,
  };
}

function parseArgs(rawArgs: string): unknown {
  let parsed: unknown;
  try {
    parsed = rawArgs.trim() === "" ? {} : JSON.parse(rawArgs);
  } catch {
    throw new ToolError("Arguments were not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ToolError("Arguments must be a JSON object");
  }
  // Models sometimes send null for fields they are not setting.
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== null));
}

function errorMessage(name: string, err: unknown): string {
  if (err instanceof ToolError) return err.message;
  if (err instanceof z.ZodError) {
    return err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; ");
  }
  console.error(`Tool ${name} failed:`, err);
  return `Something went wrong running ${name}. Try again.`;
}

// Never throws: every failure comes back as { error } so the model can recover.
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    const args = parseArgs(rawArgs);
    switch (name) {
      case "get_policy":
        return { result: await getPolicy(ctx), requestChanged: false };
      case "update_request":
        return { result: await updateRequest(ctx, args), requestChanged: true };
      case "check_slot_availability":
        return { result: await checkSlotAvailability(ctx, args), requestChanged: false };
      case "get_request_status":
        return { result: await getRequestStatus(ctx), requestChanged: false };
      default:
        throw new ToolError(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { result: { error: errorMessage(name, err) }, requestChanged: false };
  }
}
