import { describe, expect, it } from "vitest";
import type { CommunityConfig } from "../types";
import { canSubmit, computeFees, earliestAllowedDate, evaluateRequest, type RuleInput, type RuleResult } from "./engine";
import { greenMeadows, lakeview } from "./fixtures";

// 2026-10-12 is a Monday.
const today = "2026-10-12";
const TOMORROW = "2026-10-13"; // Tue, 1 day ahead
const THURSDAY = "2026-10-15"; // 3 days ahead
const SUNDAY = "2026-10-18"; // 6 days ahead
const NEXT_TUESDAY = "2026-10-20"; // 8 days ahead

type Request = RuleInput["request"];

const emptyRequest: Request = {
  type: null,
  residentType: null,
  unitId: null,
  moveDate: null,
  slot: null,
  data: {},
  documents: [],
};

function docs(...keys: string[]) {
  return keys.map((key) => ({ key, filename: `${key}.pdf` }));
}

function evaluate(
  config: CommunityConfig,
  request: Partial<Request>,
  rest: Partial<Pick<RuleInput, "unit" | "slotOccupancy">> = {},
): RuleResult[] {
  return evaluateRequest({
    config,
    request: { ...emptyRequest, ...request },
    unit: { pendingDues: 0 },
    slotOccupancy: 0,
    today,
    ...rest,
  });
}

// A complete, valid tenant move-in for each community; tests override single values.
const gmTenantMoveIn: Partial<Request> = {
  type: "move_in",
  residentType: "tenant",
  unitId: 1,
  moveDate: THURSDAY,
  slot: "09:00-12:00",
  data: { members_count: 3 },
  documents: docs("id_proof", "rental_agreement", "owner_noc", "police_verification"),
};

const lvTenantMoveIn: Partial<Request> = {
  type: "move_in",
  residentType: "tenant",
  unitId: 7,
  moveDate: THURSDAY,
  slot: "08:00-11:00",
  data: { members_count: 2, has_pets: false },
  documents: docs("id_proof", "rental_agreement"),
};

function statusOf(results: RuleResult[], id: string) {
  return results.find((r) => r.id === id)?.status;
}

describe("intake progress", () => {
  it("marks everything pending for an empty request", () => {
    const results = evaluate(greenMeadows, {});
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.status === "pending")).toBe(true);
    expect(canSubmit(results)).toBe(false);
  });

  it("allows a fully complete Green Meadows tenant move-in to be submitted", () => {
    const results = evaluate(greenMeadows, gmTenantMoveIn);
    expect(results.every((r) => r.status === "pass")).toBe(true);
    expect(canSubmit(results)).toBe(true);
  });
});

describe("required documents", () => {
  it("leaves missing owner_noc and police_verification pending for a Green Meadows tenant", () => {
    const results = evaluate(greenMeadows, { ...gmTenantMoveIn, documents: docs("id_proof", "rental_agreement") });
    expect(statusOf(results, "doc:id_proof")).toBe("pass");
    expect(statusOf(results, "doc:rental_agreement")).toBe("pass");
    expect(statusOf(results, "doc:owner_noc")).toBe("pending");
    expect(statusOf(results, "doc:police_verification")).toBe("pending");
    expect(canSubmit(results)).toBe(false);
  });

  it("does not apply tenant-only docs or the move-in fee to a Green Meadows owner", () => {
    const results = evaluate(greenMeadows, { ...gmTenantMoveIn, residentType: "owner", documents: docs("id_proof") });
    const docRules = results.filter((r) => r.id.startsWith("doc:")).map((r) => r.id);
    expect(docRules).toEqual(["doc:id_proof"]);
    expect(canSubmit(results)).toBe(true);
    expect(computeFees(greenMeadows, "move_in", "owner")).toEqual([]);
  });
});

describe("move date", () => {
  it("fails a date 1 day ahead in Green Meadows but passes it in Lakeview", () => {
    const gm = evaluate(greenMeadows, { ...gmTenantMoveIn, moveDate: TOMORROW });
    expect(statusOf(gm, "notice_period")).toBe("fail");
    expect(gm.find((r) => r.id === "notice_period")?.detail).toContain(THURSDAY);
    expect(canSubmit(gm)).toBe(false);

    const lv = evaluate(lakeview, { ...lvTenantMoveIn, moveDate: TOMORROW });
    expect(statusOf(lv, "notice_period")).toBe("pass");
    expect(canSubmit(lv)).toBe(true);
  });

  it("fails a Sunday in Green Meadows but passes it in Lakeview", () => {
    const gm = evaluate(greenMeadows, { ...gmTenantMoveIn, moveDate: SUNDAY });
    expect(statusOf(gm, "allowed_day")).toBe("fail");
    expect(statusOf(gm, "notice_period")).toBe("pass");
    expect(canSubmit(gm)).toBe(false);

    const lv = evaluate(lakeview, { ...lvTenantMoveIn, moveDate: SUNDAY });
    expect(statusOf(lv, "allowed_day")).toBe("pass");
    expect(canSubmit(lv)).toBe(true);
  });
});

describe("slots", () => {
  it("fails a slot that is not in the community config", () => {
    // A Lakeview slot, not offered at Green Meadows.
    const results = evaluate(greenMeadows, { ...gmTenantMoveIn, slot: "08:00-11:00" });
    expect(statusOf(results, "slot_valid")).toBe("fail");
    expect(canSubmit(results)).toBe(false);
  });

  it("fails a slot that is at capacity", () => {
    const gm = evaluate(greenMeadows, gmTenantMoveIn, { slotOccupancy: 1 });
    expect(statusOf(gm, "slot_valid")).toBe("pass");
    expect(statusOf(gm, "slot_capacity")).toBe("fail");
    expect(canSubmit(gm)).toBe(false);

    // Lakeview allows 2 moves per slot.
    expect(statusOf(evaluate(lakeview, lvTenantMoveIn, { slotOccupancy: 1 }), "slot_capacity")).toBe("pass");
    expect(statusOf(evaluate(lakeview, lvTenantMoveIn, { slotOccupancy: 2 }), "slot_capacity")).toBe("fail");
  });
});

describe("extra fields", () => {
  it("requires has_pets for a Lakeview move-in", () => {
    const missing = evaluate(lakeview, { ...lvTenantMoveIn, data: { members_count: 2 } });
    expect(statusOf(missing, "field:has_pets")).toBe("pending");
    expect(canSubmit(missing)).toBe(false);

    // false is an answer, not a missing value.
    const answered = evaluate(lakeview, lvTenantMoveIn);
    expect(statusOf(answered, "field:has_pets")).toBe("pass");
    expect(statusOf(answered, "field:pet_details")).toBeUndefined(); // optional
    expect(canSubmit(answered)).toBe(true);
  });
});

describe("move-out", () => {
  const gmTenantMoveOut: Partial<Request> = {
    type: "move_out",
    residentType: "tenant",
    unitId: 3,
    moveDate: NEXT_TUESDAY,
    slot: "14:00-17:00",
    documents: docs("owner_noc"),
  };

  const lvTenantMoveOut: Partial<Request> = {
    type: "move_out",
    residentType: "tenant",
    unitId: 10,
    moveDate: NEXT_TUESDAY,
    slot: "15:00-18:00",
  };

  it("fails dues_clear when the unit has pending dues", () => {
    const results = evaluate(greenMeadows, gmTenantMoveOut, { unit: { pendingDues: 4500 } });
    expect(statusOf(results, "dues_clear")).toBe("fail");
    expect(canSubmit(results)).toBe(false);
  });

  it("passes dues_clear when the unit has no dues", () => {
    const results = evaluate(greenMeadows, gmTenantMoveOut, { unit: { pendingDues: 0 } });
    expect(statusOf(results, "dues_clear")).toBe("pass");
    expect(canSubmit(results)).toBe(true);
  });

  it("adds a non-blocking inspection note in Green Meadows only", () => {
    const gm = evaluate(greenMeadows, gmTenantMoveOut);
    expect(gm.find((r) => r.id === "inspection")).toMatchObject({ status: "info", blocking: false });
    expect(canSubmit(gm)).toBe(true);

    const lv = evaluate(lakeview, lvTenantMoveOut);
    expect(lv.find((r) => r.id === "inspection")).toBeUndefined();
    expect(canSubmit(lv)).toBe(true);
  });
});

describe("computeFees", () => {
  it("charges the move-in fee to tenants and nothing to owners", () => {
    expect(computeFees(greenMeadows, "move_in", "tenant")).toEqual([{ label: "Move-in fee", amount: 2000 }]);
    expect(computeFees(lakeview, "move_in", "tenant")).toEqual([{ label: "Move-in fee", amount: 1000 }]);
    expect(computeFees(greenMeadows, "move_in", "owner")).toEqual([]);
    expect(computeFees(lakeview, "move_in", "owner")).toEqual([]);
  });

  it("charges nothing on move-out", () => {
    expect(computeFees(greenMeadows, "move_out", "tenant")).toEqual([]);
    expect(computeFees(lakeview, "move_out", "owner")).toEqual([]);
  });
});

describe("earliestAllowedDate", () => {
  it("is today plus the notice period when that day is allowed", () => {
    expect(earliestAllowedDate(today, greenMeadows.moveIn)).toBe(THURSDAY); // Mon + 3
    expect(earliestAllowedDate(today, lakeview.moveIn)).toBe(TOMORROW); // Mon + 1
  });

  it("moves forward to the next allowed day when today plus notice is not allowed", () => {
    // Sun 2026-10-11 + 7 is Sun 2026-10-18; Green Meadows has no Sunday moves
    expect(earliestAllowedDate("2026-10-11", greenMeadows.moveOut)).toBe("2026-10-19");
    // Lakeview allows every day, so the same input stays on the Sunday
    expect(earliestAllowedDate("2026-10-15", lakeview.moveOut)).toBe(SUNDAY);
  });
});
