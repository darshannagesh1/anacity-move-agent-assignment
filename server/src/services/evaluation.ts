import { todayIST, toISTDate } from "../lib/time";
import { getCommunity, getRequest, getSlotOccupancy, getUnit } from "../repo";
import { canSubmit, computeFees, evaluateRequest, getRulesFor, type RuleResult } from "../rules/engine";
import type { MoveRules } from "../types";

export interface Evaluation {
  results: RuleResult[];
  canSubmit: boolean;
  fees: { label: string; amount: number }[];
  rules: MoveRules | null; // null until the request type is known
}

// "today" for admin review: the resident met the notice period when they submitted,
// so review delay shouldn't fail it
export function submissionDate(request: { submittedAt: Date | null }): string | undefined {
  return request.submittedAt ? toISTDate(request.submittedAt) : undefined;
}

// asOf stands in for today; resident-side callers leave it out
export async function evaluate(requestId: number, { asOf }: { asOf?: string } = {}): Promise<Evaluation> {
  const request = await getRequest(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);
  const community = await getCommunity(request.communityId);
  if (!community) throw new Error(`Community ${request.communityId} not found`);

  const [unit, slotOccupancy] = await Promise.all([
    request.unitId !== null ? getUnit(request.unitId) : null,
    request.moveDate && request.slot
      ? getSlotOccupancy(request.communityId, request.moveDate, request.slot, request.id)
      : 0,
  ]);

  const { config } = community;
  const results = evaluateRequest({ config, request, unit, slotOccupancy, today: asOf ?? todayIST() });

  return {
    results,
    canSubmit: canSubmit(results),
    fees: request.type && request.residentType ? computeFees(config, request.type, request.residentType) : [],
    rules: request.type ? getRulesFor(config, request.type, request.residentType) : null,
  };
}
