import { Router, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { assessRequest } from "../agent/assessment";
import { runResidentAgent } from "../agent/residentAgent";
import { initSse } from "../lib/sse";
import {
  addDocument,
  addEvent,
  appendMessage,
  createRequest,
  getCommunities,
  getCommunity,
  getEvents,
  getRequest,
  getTranscript,
  listRequestsForResident,
  submitRequest,
  type RequestRecord,
} from "../repo";
import { evaluate } from "../services/evaluation";

export const residentRouter = Router();

const idSchema = z.coerce.number().int().positive();
const createSchema = z.object({ communityId: z.string().min(1), residentId: idSchema });
const documentSchema = z.object({ key: z.string().trim().min(1), filename: z.string().trim().min(1).max(255) });
const chatSchema = z.object({ message: z.string().trim().min(1).max(4000) });

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages. Please wait a minute and try again." },
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

function isEditable(request: RequestRecord): boolean {
  return request.status === "draft" || request.status === "info_requested";
}

residentRouter.get("/communities", async (_req, res) => {
  res.json({ communities: await getCommunities() });
});

residentRouter.post("/requests", async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  const request = await createRequest(body.data.communityId, body.data.residentId);
  if (!request) return res.status(404).json({ error: "Resident not found in this community" });

  await addEvent(request.id, "resident", "created");
  res.status(201).json({ request });
});

residentRouter.get("/requests", async (req, res) => {
  const residentId = idSchema.safeParse(req.query.residentId);
  if (!residentId.success) return res.status(400).json({ error: "residentId is required" });
  res.json({ requests: await listRequestsForResident(residentId.data) });
});

residentRouter.get("/requests/:id", async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  const [evaluation, events] = await Promise.all([evaluate(request.id), getEvents(request.id)]);
  // system events (e.g. a failed background assessment) are for the admin only
  res.json({ request, evaluation, events: events.filter((e) => e.actor !== "system") });
});

residentRouter.get("/requests/:id/messages", async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  res.json({ messages: await getTranscript(request.id) });
});

residentRouter.post("/requests/:id/documents", async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  const body = documentSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  if (!isEditable(request)) {
    return res.status(409).json({ error: `This request is ${request.status} and can no longer be changed` });
  }

  const { key, filename } = body.data;
  const community = await getCommunity(request.communityId);
  const doc = [...(community?.config.moveIn.requiredDocs ?? []), ...(community?.config.moveOut.requiredDocs ?? [])].find(
    (d) => d.key === key,
  );
  if (!doc) return res.status(400).json({ error: `Unknown document type: ${key}` });

  await addDocument(request.id, key, filename);
  await addEvent(request.id, "resident", "document_uploaded", { key, filename });
  // so the agent sees the upload next time it reads the conversation
  await appendMessage(request.id, { role: "user", content: `[note] Uploaded: ${doc.label} (${filename})` });

  res.json({ request: await getRequest(request.id), evaluation: await evaluate(request.id) });
});

residentRouter.post("/requests/:id/submit", async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  if (!isEditable(request)) {
    return res.status(409).json({ error: `This request is already ${request.status}` });
  }

  // re-check here: the client's view may be stale (e.g. the slot filled up)
  const evaluation = await evaluate(request.id);
  if (!evaluation.canSubmit) {
    return res.status(400).json({
      error: "This request cannot be submitted yet",
      blocking: evaluation.results.filter((r) => r.blocking && (r.status === "fail" || r.status === "pending")),
    });
  }

  if (!(await submitRequest(request.id))) {
    return res.status(409).json({ error: "This request has already been submitted" });
  }
  await addEvent(request.id, "resident", "submitted");

  res.json({ request: await getRequest(request.id), evaluation: await evaluate(request.id) });

  // background: the resident already has their response
  assessRequest(request.id).catch((err) => {
    console.error(`Assessment failed for request ${request.id}:`, err);
    // so the admin sees "Assessment failed" instead of waiting forever
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    addEvent(request.id, "system", "assessment_failed", { message }).catch((e) =>
      console.error(`Could not record assessment failure for request ${request.id}:`, e),
    );
  });
});

residentRouter.post("/requests/:id/chat", chatLimiter, async (req, res) => {
  const request = await loadRequest(req.params.id, res);
  if (!request) return;
  const body = chatSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  const send = initSse(res);
  try {
    await runResidentAgent({
      requestId: request.id,
      communityId: request.communityId,
      userMessage: body.data.message,
      send,
    });
  } catch (err) {
    console.error(`Chat failed for request ${request.id}:`, err);
    send("error", { message: "Something went wrong. Please try again." });
  } finally {
    res.end();
  }
});
