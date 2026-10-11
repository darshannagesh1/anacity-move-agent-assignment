import type OpenAI from "openai";
import { pool } from "./db";
import type { RuleResult } from "./rules/engine";
import type { CommunityConfig, RequestType, ResidentType } from "./types";

// All DB access lives here.

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type RequestStatus = "draft" | "submitted" | "info_requested" | "approved" | "rejected";
export type EventActor = "resident" | "admin" | "agent" | "system";

export interface Community {
  id: string;
  name: string;
  config: CommunityConfig;
}

export interface CommunitySummary {
  id: string;
  name: string;
  residents: { id: number; name: string; phone: string | null }[];
  units: { id: number; flatNo: string }[];
}

export interface Resident {
  id: number;
  communityId: string;
  name: string;
  phone: string | null;
}

export interface Unit {
  id: number;
  flatNo: string;
  pendingDues: number;
}

export interface RequestDocument {
  key: string;
  filename: string;
  uploadedAt: string;
}

export interface RequestRecord {
  id: number;
  communityId: string;
  residentId: number;
  unitId: number | null;
  flatNo: string | null;
  type: RequestType | null;
  residentType: ResidentType | null;
  status: RequestStatus;
  moveDate: string | null; // "YYYY-MM-DD"
  slot: string | null;
  data: Record<string, unknown>;
  documents: RequestDocument[];
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
}

export interface RequestEvent {
  id: number;
  actor: EventActor;
  event: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface RequestFieldUpdate {
  type?: RequestType | null;
  residentType?: ResidentType | null;
  unitId?: number | null;
  moveDate?: string | null;
  slot?: string | null;
  data?: Record<string, unknown>; // merged into the existing data
}

const REQUEST_SELECT = `
  SELECT r.*, u.flat_no
  FROM requests r
  LEFT JOIN units u ON u.id = r.unit_id`;

function toRequest(row: any): RequestRecord {
  return {
    id: row.id,
    communityId: row.community_id,
    residentId: row.resident_id,
    unitId: row.unit_id,
    flatNo: row.flat_no,
    type: row.type,
    residentType: row.resident_type,
    status: row.status,
    moveDate: row.move_date,
    slot: row.slot,
    data: row.data,
    documents: row.documents,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

export async function getCommunities(): Promise<CommunitySummary[]> {
  const [communities, residents, units] = await Promise.all([
    pool.query("SELECT id, name FROM communities ORDER BY name"),
    pool.query("SELECT id, community_id, name, phone FROM residents ORDER BY id"),
    pool.query("SELECT id, community_id, flat_no FROM units ORDER BY flat_no"),
  ]);
  return communities.rows.map((c) => ({
    id: c.id,
    name: c.name,
    residents: residents.rows
      .filter((r) => r.community_id === c.id)
      .map((r) => ({ id: r.id, name: r.name, phone: r.phone })),
    units: units.rows.filter((u) => u.community_id === c.id).map((u) => ({ id: u.id, flatNo: u.flat_no })),
  }));
}

export async function getCommunity(id: string): Promise<Community | null> {
  const { rows } = await pool.query("SELECT id, name, config FROM communities WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function getResident(id: number): Promise<Resident | null> {
  const { rows } = await pool.query("SELECT id, community_id, name, phone FROM residents WHERE id = $1", [id]);
  const row = rows[0];
  return row ? { id: row.id, communityId: row.community_id, name: row.name, phone: row.phone } : null;
}

export async function getUnit(id: number): Promise<Unit | null> {
  const { rows } = await pool.query("SELECT id, flat_no, pending_dues FROM units WHERE id = $1", [id]);
  const row = rows[0];
  return row ? { id: row.id, flatNo: row.flat_no, pendingDues: Number(row.pending_dues) } : null;
}

export async function findUnitByFlatNo(communityId: string, flatNo: string): Promise<Unit | null> {
  const { rows } = await pool.query(
    "SELECT id, flat_no, pending_dues FROM units WHERE community_id = $1 AND lower(flat_no) = lower($2)",
    [communityId, flatNo.trim()],
  );
  const row = rows[0];
  return row ? { id: row.id, flatNo: row.flat_no, pendingDues: Number(row.pending_dues) } : null;
}

// Returns null when the resident does not belong to the community.
export async function createRequest(communityId: string, residentId: number): Promise<RequestRecord | null> {
  const { rows } = await pool.query(
    `INSERT INTO requests (community_id, resident_id)
     SELECT community_id, id FROM residents WHERE id = $2 AND community_id = $1
     RETURNING id`,
    [communityId, residentId],
  );
  return rows[0] ? getRequest(rows[0].id) : null;
}

export async function getRequest(id: number): Promise<RequestRecord | null> {
  const { rows } = await pool.query(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function listRequestsForResident(residentId: number): Promise<RequestRecord[]> {
  const { rows } = await pool.query(`${REQUEST_SELECT} WHERE r.resident_id = $1 ORDER BY r.created_at DESC, r.id DESC`, [
    residentId,
  ]);
  return rows.map(toRequest);
}

const UPDATABLE_COLUMNS = {
  type: "type",
  residentType: "resident_type",
  unitId: "unit_id",
  moveDate: "move_date",
  slot: "slot",
} as const;

export async function updateRequestFields(id: number, fields: RequestFieldUpdate): Promise<void> {
  const sets = ["updated_at = now()"];
  const values: unknown[] = [id];
  for (const [key, column] of Object.entries(UPDATABLE_COLUMNS) as [keyof typeof UPDATABLE_COLUMNS, string][]) {
    if (fields[key] === undefined) continue;
    values.push(fields[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (fields.data) {
    // || merges top-level keys, so keys not in this update are kept.
    values.push(JSON.stringify(fields.data));
    sets.push(`data = data || $${values.length}::jsonb`);
  }
  await pool.query(`UPDATE requests SET ${sets.join(", ")} WHERE id = $1`, values);
}

// Returns false if the request was not in a submittable status (e.g. submitted twice).
export async function submitRequest(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE requests
     SET status = 'submitted', submitted_at = now(), admin_note = NULL, updated_at = now()
     WHERE id = $1 AND status IN ('draft', 'info_requested')`,
    [id],
  );
  return rowCount === 1;
}

// Counts other active requests in that date+slot; drafts do not hold a slot.
export async function getSlotOccupancy(
  communityId: string,
  date: string,
  slot: string,
  excludeRequestId: number,
): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS count
     FROM requests
     WHERE community_id = $1 AND move_date = $2 AND slot = $3
       AND status IN ('submitted', 'info_requested', 'approved')
       AND id <> $4`,
    [communityId, date, slot, excludeRequestId],
  );
  return rows[0].count;
}

// Replaces any existing document with the same key.
export async function addDocument(requestId: number, key: string, filename: string): Promise<void> {
  const doc: RequestDocument = { key, filename, uploadedAt: new Date().toISOString() };
  await pool.query(
    `UPDATE requests
     SET documents = (
           SELECT coalesce(jsonb_agg(d), '[]'::jsonb)
           FROM jsonb_array_elements(documents) AS d
           WHERE d->>'key' <> $2
         ) || $3::jsonb,
         updated_at = now()
     WHERE id = $1`,
    [requestId, key, JSON.stringify([doc])],
  );
}

export async function getMessages(requestId: number): Promise<ChatMessage[]> {
  const { rows } = await pool.query("SELECT payload FROM messages WHERE request_id = $1 ORDER BY id", [requestId]);
  return rows.map((r) => r.payload);
}

export async function appendMessage(requestId: number, payload: ChatMessage): Promise<void> {
  await pool.query("INSERT INTO messages (request_id, payload) VALUES ($1, $2::jsonb)", [
    requestId,
    JSON.stringify(payload),
  ]);
}

// All or nothing, so an assistant tool_calls message is never stored without its tool results.
export async function appendMessages(requestId: number, payloads: unknown[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const payload of payloads) {
      await client.query("INSERT INTO messages (request_id, payload) VALUES ($1, $2::jsonb)", [
        requestId,
        JSON.stringify(payload),
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function addEvent(
  requestId: number,
  actor: EventActor,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await pool.query("INSERT INTO request_events (request_id, actor, event, payload) VALUES ($1, $2, $3, $4::jsonb)", [
    requestId,
    actor,
    event,
    JSON.stringify(payload),
  ]);
}

export async function getEvents(requestId: number): Promise<RequestEvent[]> {
  const { rows } = await pool.query(
    "SELECT id, actor, event, payload, created_at FROM request_events WHERE request_id = $1 ORDER BY id",
    [requestId],
  );
  return rows.map((r) => ({ id: r.id, actor: r.actor, event: r.event, payload: r.payload, createdAt: r.created_at }));
}

// What a person sees in the chat: user and assistant text, not tool traffic.
export async function getTranscript(requestId: number): Promise<{ role: "user" | "assistant"; content: string }[]> {
  return (await getMessages(requestId)).flatMap((m) =>
    (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== ""
      ? [{ role: m.role, content: m.content }]
      : [],
  );
}

export type RiskLevel = "low" | "medium" | "high";
export type Recommendation = "approve" | "reject" | "request_info";

export interface AssessmentInput {
  ruleResults: RuleResult[];
  summary: string;
  riskLevel: RiskLevel;
  risks: { title: string; detail: string; severity: RiskLevel }[];
  recommendation: Recommendation;
  reasoning: string;
  messageToResident: string;
  model: string;
}

export interface AssessmentRecord extends AssessmentInput {
  id: number;
  requestId: number;
  createdAt: Date;
}

export interface AdminRequestRow extends RequestRecord {
  residentName: string;
  riskLevel: RiskLevel | null; // from the latest assessment, null if none yet
  recommendation: Recommendation | null;
  assessmentFailed: boolean; // the last attempt failed and no newer assessment exists
  assessmentStale: boolean; // the latest assessment predates the latest submission
}

function toAssessment(row: any): AssessmentRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    ruleResults: row.rule_results,
    summary: row.summary,
    riskLevel: row.risk_level,
    risks: row.risks,
    recommendation: row.recommendation,
    reasoning: row.reasoning,
    messageToResident: row.message_to_resident ?? "",
    model: row.model,
    createdAt: row.created_at,
  };
}

// Other requests holding the same flat, e.g. a move-out that has not finished yet.
export async function getOtherActiveRequestsForUnit(
  unitId: number,
  excludeRequestId: number,
): Promise<{ id: number; type: RequestType | null; status: RequestStatus; moveDate: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT id, type, status, move_date
     FROM requests
     WHERE unit_id = $1 AND id <> $2 AND status IN ('submitted', 'info_requested', 'approved')
     ORDER BY id`,
    [unitId, excludeRequestId],
  );
  return rows.map((r) => ({ id: r.id, type: r.type, status: r.status, moveDate: r.move_date }));
}

export async function saveAssessment(requestId: number, a: AssessmentInput): Promise<AssessmentRecord> {
  const { rows } = await pool.query(
    `INSERT INTO assessments
       (request_id, rule_results, summary, risk_level, risks, recommendation, reasoning, message_to_resident, model)
     VALUES ($1, $2::jsonb, $3, $4, $5::jsonb, $6, $7, $8, $9)
     RETURNING *`,
    [
      requestId,
      JSON.stringify(a.ruleResults),
      a.summary,
      a.riskLevel,
      JSON.stringify(a.risks),
      a.recommendation,
      a.reasoning,
      a.messageToResident,
      a.model,
    ],
  );
  return toAssessment(rows[0]);
}

export async function getLatestAssessment(requestId: number): Promise<AssessmentRecord | null> {
  const { rows } = await pool.query("SELECT * FROM assessments WHERE request_id = $1 ORDER BY id DESC LIMIT 1", [
    requestId,
  ]);
  return rows[0] ? toAssessment(rows[0]) : null;
}

// Drafts are the resident's business; the admin sees a request once it has been submitted.
export async function listRequestsForAdmin(communityId: string, status?: RequestStatus): Promise<AdminRequestRow[]> {
  const { rows } = await pool.query(
    `SELECT r.*, u.flat_no, res.name AS resident_name, a.risk_level, a.recommendation,
            (f.created_at IS NOT NULL AND (a.created_at IS NULL OR a.created_at < f.created_at)) AS assessment_failed,
            (a.created_at IS NOT NULL AND r.submitted_at IS NOT NULL AND a.created_at < r.submitted_at) AS assessment_stale
     FROM requests r
     JOIN residents res ON res.id = r.resident_id
     LEFT JOIN units u ON u.id = r.unit_id
     LEFT JOIN LATERAL (
       SELECT risk_level, recommendation, created_at FROM assessments
       WHERE request_id = r.id ORDER BY id DESC LIMIT 1
     ) a ON true
     LEFT JOIN LATERAL (
       SELECT created_at FROM request_events
       WHERE request_id = r.id AND event = 'assessment_failed' ORDER BY id DESC LIMIT 1
     ) f ON true
     WHERE r.community_id = $1 AND r.status <> 'draft' AND ($2::text IS NULL OR r.status = $2)
     ORDER BY (r.status = 'submitted') DESC, r.move_date ASC NULLS LAST, r.id`,
    [communityId, status ?? null],
  );
  return rows.map((row) => ({
    ...toRequest(row),
    residentName: row.resident_name,
    riskLevel: row.risk_level,
    recommendation: row.recommendation,
    assessmentFailed: row.assessment_failed,
    assessmentStale: row.assessment_stale,
  }));
}

// Returns false if the request was no longer awaiting a decision (e.g. decided twice).
export async function decideRequest(
  id: number,
  status: "approved" | "rejected" | "info_requested",
  adminNote: string | null,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE requests SET status = $2, admin_note = $3, updated_at = now()
     WHERE id = $1 AND status = 'submitted'`,
    [id, status, adminNote],
  );
  return rowCount === 1;
}
