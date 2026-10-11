import OpenAI from "openai";
import { z } from "zod";
import { getRequest, getCommunity, getUnit, getMessages, getEvents,
         getOtherActiveRequestsForUnit, saveAssessment } from "../repo";
import { evaluate, submissionDate } from "../services/evaluation";

const client = new OpenAI();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// Zod validates what comes back; JSON schema tells OpenAI the exact shape to produce
const AssessmentSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  risks: z.array(z.object({
    title: z.string(), detail: z.string(), severity: z.enum(["low", "medium", "high"]),
  })),
  recommendation: z.enum(["approve", "reject", "request_info"]),
  reasoning: z.string(),
  messageToResident: z.string(),
});

const level = { type: "string", enum: ["low", "medium", "high"] };
const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "riskLevel", "risks", "recommendation", "reasoning", "messageToResident"],
  properties: {
    summary: { type: "string" },
    riskLevel: level,
    risks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "detail", "severity"],
        properties: { title: { type: "string" }, detail: { type: "string" }, severity: level },
      },
    },
    recommendation: { type: "string", enum: ["approve", "reject", "request_info"] },
    reasoning: { type: "string" },
    messageToResident: { type: "string" },
  },
};

const SYSTEM = `You help community admins review move-in and move-out requests.
You do not decide. You summarize, flag risks, and recommend; the admin decides.
Rule check results are computed by the system and are authoritative. Never contradict them.
Use the chat transcript and history only to spot extra context: concerns, promises, unusual details.
Recommend "approve" only if no blocking rule is failing or pending.
Recommend "request_info" if something is missing or unclear that the resident can fix.
Recommend "reject" only for clear violations the resident cannot fix.
messageToResident: a short, polite message for request_info or reject. Empty string for approve.
Plain text only, no markdown.`;

// also used by the admin ask endpoint
export async function buildAssessmentContext(requestId: number) {
  const request = await getRequest(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);
  const community = await getCommunity(request.communityId);
  if (!community) throw new Error(`Community ${request.communityId} not found`);
  const unit = request.unitId ? await getUnit(request.unitId) : null;
  // notice is judged from the submission date, not the day this runs
  const evaluation = await evaluate(requestId, { asOf: submissionDate(request) });
  const events = await getEvents(requestId);
  const otherRequests = request.unitId
    ? await getOtherActiveRequestsForUnit(request.unitId, requestId) : [];
  const transcript = (await getMessages(requestId))
    .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
    .slice(-20)
    .map((m: any) => `${m.role}: ${m.content}`);

  const context = {
    request, unit, fees: evaluation.fees,
    ruleResults: evaluation.results.map(({ label, status, detail, blocking }) => ({ label, status, detail, blocking })),
    otherActiveRequestsForUnit: otherRequests,
    policyNotes: community.config.policyNotes,
    history: events.map((e: any) => `${e.actor}: ${e.event}`),
    transcript,
  };
  return { context, evaluation };
}

export async function assessRequest(requestId: number) {
  const { context, evaluation } = await buildAssessmentContext(requestId);

  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(context) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "assessment", strict: true, schema: jsonSchema },
    },
  });
  const parsed = AssessmentSchema.parse(JSON.parse(res.choices[0].message.content ?? "{}"));

  // guardrail in code: the LLM can't recommend approving what the rules block
  const blocking = evaluation.results.filter((r) => r.blocking && r.status !== "pass");
  if (blocking.length && parsed.recommendation === "approve") {
    parsed.recommendation = "request_info";
    parsed.reasoning = `System override: blocking checks not passing (${blocking.map((b) => b.label).join(", ")}). ${parsed.reasoning}`;
  }
  if (blocking.length && parsed.riskLevel === "low") parsed.riskLevel = "medium";

  return saveAssessment(requestId, {
    ruleResults: evaluation.results, ...parsed, model: MODEL,
  });
}
