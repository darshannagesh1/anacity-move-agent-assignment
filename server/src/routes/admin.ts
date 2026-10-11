import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { askAboutRequest } from "../agent/adminAsk";
import { assessRequest } from "../agent/assessment";
import {
  addEvent,
  appendMessage,
  decideRequest,
  getCommunity,
  getEvents,
  getLatestAssessment,
  getRequest,
  getResident,
  getTranscript,
  getUnit,
  listRequestsForAdmin,
  type RequestRecord,
} from "../repo";
import { todayIST } from "../lib/time";
import { evaluate, submissionDate } from "../services/evaluation";

export const adminRouter = Router();

const idSchema = z.coerce.number().int().positive();
const statusSchema = z.enum(["submitted", "info_requested", "approved", "rejected"]).optional();
const decisionSchema = z.object({
  action: z.enum(["approve", "reject", "request_info"]),
  note: z.string().trim().max(2000).optional(),
});
const askSchema = z.object({ question: z.string().trim().min(1).max(1000) });

const STATUS_FOR_ACTION = { approve: "approved", reject: "rejected", request_info: "info_requested" } as const;

// Both of these call OpenAI, so they share the chat route's limit.
const llmLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." },
});

function badRequest(res: Response, error: z.ZodError) {
  const message = error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; ");
  res.status(400).json({ error: message });
}

// sends the 400/404 itself and returns null
async function loadRequest(rawId: unknown, res: Response): Promise<RequestRecord | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) {
    res.status(400).json({ error: "Invalid request id" });
    return null;
  }
  const request = await getRequest(id.data);
  if (!request) res.status(404).json({ error: "Request not found" });
  return request;
}

adminRouter.get("/requests/:id", async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  const [evaluation, events, assessment, resident, unit, transcript] = await Promise.all([
    // same date basis as approve below, so the checklist matches what approve will do
    evaluate(request.id, { asOf: submissionDate(request) }),
    getEvents(request.id),
    getLatestAssessment(request.id),
    getResident(request.residentId),
    request.unitId !== null ? getUnit(request.unitId) : null,
    getTranscript(request.id),
  ]);

  // last attempt failed and nothing newer replaced it
  const lastFailure = events.filter((e) => e.event === "assessment_failed").at(-1);
  const assessmentFailed = !!lastFailure && (!assessment || assessment.createdAt < lastFailure.createdAt);

  // written before the last (re)submit, so it describes an older version of the request
  const assessmentStale = !!assessment && !!request.submittedAt && assessment.createdAt < request.submittedAt;

  res.json({ request, evaluation, events, assessment, assessmentFailed, assessmentStale, resident, unit, transcript });
});

adminRouter.post("/requests/:id/assess", llmLimiter, async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  try {
    res.json({ assessment: await assessRequest(request.id) });
  } catch (err) {
    console.error(`Assessment failed for request ${request.id}:`, err);
    res.status(502).json({ error: "The assessment could not be completed. Please try again." });
  }
});

adminRouter.post("/requests/:id/decision", async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  const body = decisionSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  const { action } = body.data;
  const note = body.data.note || null;

  if (request.status !== "submitted") {
    return res.status(409).json({ error: `This request is ${request.status}, so it cannot be decided` });
  }
  if (action !== "approve" && !note) {
    return res.status(400).json({ error: "A note for the resident is required" });
  }
  if (action === "approve") {
    if (request.moveDate && request.moveDate < todayIST()) {
      return res.status(409).json({ error: "Move date has already passed" });
    }
    // re-run everything (slot may have filled, dues added) but judge notice from the submission
    // date: review delay shouldn't fail a resident who gave enough notice
    const evaluation = await evaluate(request.id, { asOf: submissionDate(request) });
    if (!evaluation.canSubmit) {
      return res.status(409).json({
        error: "This request no longer passes all checks, so it cannot be approved",
        blocking: evaluation.results.filter((r) => r.blocking && r.status !== "pass"),
      });
    }
  }

  // recorded so admin/agent agreement can be measured later
  const assessment = await getLatestAssessment(request.id);
  const agentRecommendation = assessment?.recommendation ?? null;
  const agreedWithAgent = agentRecommendation === null ? null : agentRecommendation === action;

  if (!(await decideRequest(request.id, STATUS_FOR_ACTION[action], note))) {
    return res.status(409).json({ error: "This request has already been decided" });
  }
  await addEvent(request.id, "admin", "decision", { action, note, agentRecommendation, agreedWithAgent });
  if (action !== "approve") {
    // shows up in the resident's chat, and the agent sees it on its next turn
    await appendMessage(request.id, { role: "user", content: `[note] Admin: ${note}` });
  }

  res.json({ request: await getRequest(request.id) });
});

adminRouter.post("/requests/:id/ask", llmLimiter, async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  const body = askSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  try {
    res.json({ answer: await askAboutRequest(request.id, body.data.question) });
  } catch (err) {
    console.error(`Ask failed for request ${request.id}:`, err);
    res.status(502).json({ error: "The agent could not answer. Please try again." });
  }
});

adminRouter.get("/:communityId/requests", async (req, res) => {
  const status = statusSchema.safeParse(req.query.status);
  if (!status.success) return res.status(400).json({ error: "Invalid status filter" });
  const community = await getCommunity(req.params.communityId);
  if (!community) return res.status(404).json({ error: "Community not found" });
  res.json({
    community: { id: community.id, name: community.name },
    requests: await listRequestsForAdmin(community.id, status.data),
  });
});
