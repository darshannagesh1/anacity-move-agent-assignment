import type { CommunityConfig, ExtraField, RequestType, ResidentType, MoveRules, Weekday } from "../types";

export type RuleStatus = "pass" | "fail" | "pending" | "info";
// pending = not provided yet (intake in progress)
// fail    = provided but breaks a rule
// info    = non-blocking note (e.g. inspection will be scheduled)

export interface RuleResult {
  id: string;          // "notice_period", "doc:owner_noc", "dues_clear"...
  label: string;       // human readable, shown in UI and given to the LLM
  status: RuleStatus;
  detail: string;      // why, e.g. "Move date needs 3 days notice; earliest is 2026-10-14"
  blocking: boolean;
}

export interface RuleInput {
  config: CommunityConfig;
  request: {
    type: RequestType | null;
    residentType: ResidentType | null;
    unitId: number | null;
    moveDate: string | null;          // "YYYY-MM-DD"
    slot: string | null;
    data: Record<string, unknown>;
    documents: { key: string; filename: string }[];
  };
  unit: { pendingDues: number } | null;
  slotOccupancy: number;              // other active requests in that date+slot
  today: string;                      // passed in, so tests are deterministic
}

const WEEKDAYS: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_LABELS: Record<RequestType, string> = { move_in: "move-in", move_out: "move-out" };

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[new Date(date + "T00:00:00Z").getUTCDay()];
}

function result(id: string, label: string, status: RuleStatus, detail: string, blocking = true): RuleResult {
  return { id, label, status, detail, blocking };
}

function checkExtraField(field: ExtraField, value: unknown): RuleResult {
  const id = `field:${field.key}`;
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return result(id, field.label, "pending", `${field.label} is required`);
  }
  const valid =
    field.type === "text" ? typeof value === "string"
    : field.type === "number" ? typeof value === "number" && Number.isFinite(value)
    : typeof value === "boolean";
  if (!valid) {
    return result(id, field.label, "fail", `${field.label} must be a ${field.type} value`);
  }
  return result(id, field.label, "pass", `${field.label} provided`);
}

// docs, fees and extraFields filtered by residentType (unfiltered while it's unknown)
export function getRulesFor(config: CommunityConfig, type: RequestType, residentType: ResidentType | null): MoveRules {
  const rules: MoveRules = type === "move_in" ? config.moveIn : config.moveOut;
  if (!residentType) return rules;
  return {
    ...rules,
    requiredDocs: rules.requiredDocs.filter((d) => d.appliesTo.includes(residentType)),
    fees: rules.fees.filter((f) => f.appliesTo.includes(residentType)),
    extraFields: rules.extraFields.filter((f) => f.appliesTo.includes(residentType)),
  };
}

export function evaluateRequest(input: RuleInput): RuleResult[] {
  const { config, request, unit, slotOccupancy, today } = input;
  const { type, residentType, moveDate, slot } = request;
  const results: RuleResult[] = [];

  results.push(
    type
      ? result("request_type", "Request type", "pass", `This is a ${TYPE_LABELS[type]} request`)
      : result("request_type", "Request type", "pending", "Choose move-in or move-out"),
  );
  results.push(
    residentType
      ? result("resident_type", "Resident type", "pass", `Resident is the ${residentType}`)
      : result("resident_type", "Resident type", "pending", "Choose owner or tenant"),
  );
  results.push(
    request.unitId !== null
      ? result("unit", "Unit", "pass", "Unit selected")
      : result("unit", "Unit", "pending", "Select the flat for this move"),
  );

  const dateOk = moveDate !== null && isValidDate(moveDate);
  results.push(
    moveDate === null
      ? result("move_date", "Move date", "pending", "Choose a move date")
      : dateOk
        ? result("move_date", "Move date", "pass", `Move date is ${moveDate}`)
        : result("move_date", "Move date", "fail", `"${moveDate}" is not a valid date (expected YYYY-MM-DD)`),
  );

  // Every remaining rule depends on which rule set applies.
  if (!type) return results;

  const rules = getRulesFor(config, type, residentType);

  if (!dateOk) {
    results.push(result("notice_period", "Notice period", "pending", `Needs a move date; ${rules.noticeDays} days notice is required`));
    results.push(result("allowed_day", "Allowed day", "pending", `Needs a move date; allowed days are ${rules.allowedDays.join(", ")}`));
  } else {
    const earliest = addDays(today, rules.noticeDays);
    results.push(
      moveDate >= earliest
        ? result("notice_period", "Notice period", "pass", `Meets the ${rules.noticeDays} days notice requirement`)
        : result("notice_period", "Notice period", "fail", `Move date needs ${rules.noticeDays} days notice; earliest is ${earliest}`),
    );
    const day = weekdayOf(moveDate);
    results.push(
      rules.allowedDays.includes(day)
        ? result("allowed_day", "Allowed day", "pass", `${day} is an allowed day`)
        : result("allowed_day", "Allowed day", "fail", `Moves are not allowed on ${day}; allowed days are ${rules.allowedDays.join(", ")}`),
    );
  }

  const slotOk = slot !== null && rules.slots.includes(slot);
  results.push(
    slot === null
      ? result("slot_valid", "Time slot", "pending", `Choose a slot: ${rules.slots.join(", ")}`)
      : slotOk
        ? result("slot_valid", "Time slot", "pass", `Slot ${slot} is offered`)
        : result("slot_valid", "Time slot", "fail", `"${slot}" is not an offered slot; choose from ${rules.slots.join(", ")}`),
  );
  results.push(
    !dateOk || !slotOk
      ? result("slot_capacity", "Slot availability", "pending", "Needs a valid move date and slot")
      : slotOccupancy < rules.maxMovesPerSlot
        ? result("slot_capacity", "Slot availability", "pass", `${slotOccupancy} of ${rules.maxMovesPerSlot} moves booked for ${slot} on ${moveDate}`)
        : result("slot_capacity", "Slot availability", "fail", `Slot ${slot} on ${moveDate} is full (${slotOccupancy} of ${rules.maxMovesPerSlot} booked)`),
  );

  // Which docs and fields apply depends on the resident type, so wait for it.
  if (residentType) {
    const uploaded = new Set(request.documents.map((d) => d.key));
    for (const doc of rules.requiredDocs) {
      results.push(
        uploaded.has(doc.key)
          ? result(`doc:${doc.key}`, doc.label, "pass", `${doc.label} uploaded`)
          : result(`doc:${doc.key}`, doc.label, "pending", `${doc.label} has not been uploaded`),
      );
    }
    for (const field of rules.extraFields) {
      if (field.required) results.push(checkExtraField(field, request.data[field.key]));
    }
  }

  if (type === "move_out") {
    if (config.moveOut.duesClearanceRequired) {
      results.push(
        !unit
          ? result("dues_clear", "Dues clearance", "pending", "Needs a unit to check pending dues")
          : unit.pendingDues > 0
            ? result("dues_clear", "Dues clearance", "fail", `Pending dues of ${unit.pendingDues} must be cleared before move-out`)
            : result("dues_clear", "Dues clearance", "pass", "No pending dues"),
      );
    }
    if (config.moveOut.inspectionRequired) {
      results.push(result("inspection", "Flat inspection", "info", "A flat inspection will be scheduled before move-out", false));
    }
  }

  return results;
}

export function canSubmit(results: RuleResult[]): boolean {
  return !results.some((r) => r.blocking && (r.status === "fail" || r.status === "pending"));
}

export function computeFees(config: CommunityConfig, type: RequestType, residentType: ResidentType): { label: string; amount: number }[] {
  return getRulesFor(config, type, residentType).fees.map(({ label, amount }) => ({ label, amount }));
}
