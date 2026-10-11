// Types mirror the server's JSON (see server/src/repo.ts and server/src/rules/engine.ts).

export type RequestStatus = 'draft' | 'submitted' | 'info_requested' | 'approved' | 'rejected'
export type RuleStatus = 'pass' | 'fail' | 'pending' | 'info'

export interface Resident {
  id: number
  name: string
  phone: string | null
}

export interface Community {
  id: string
  name: string
  residents: Resident[]
  units: { id: number; flatNo: string }[]
}

export interface RequestDocument {
  key: string
  filename: string
  uploadedAt: string
}

export interface MoveRequest {
  id: number
  communityId: string
  residentId: number
  unitId: number | null
  flatNo: string | null
  type: 'move_in' | 'move_out' | null
  residentType: 'owner' | 'tenant' | null
  status: RequestStatus
  moveDate: string | null // "YYYY-MM-DD"
  slot: string | null
  data: Record<string, unknown>
  documents: RequestDocument[]
  adminNote: string | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
}

export interface RuleResult {
  id: string
  label: string
  status: RuleStatus
  detail: string
  blocking: boolean
}

export interface Evaluation {
  results: RuleResult[]
  canSubmit: boolean
  fees: { label: string; amount: number }[]
}

export interface RequestEvent {
  id: number
  actor: 'resident' | 'admin' | 'agent' | 'system'
  event: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface RequestDetail {
  request: MoveRequest
  evaluation: Evaluation
  events: RequestEvent[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export class ApiError extends Error {
  status: number
  blocking: RuleResult[] // the checks that stopped a submit or an approval, if any

  constructor(status: number, message: string, blocking: RuleResult[] = []) {
    super(message)
    this.status = status
    this.blocking = blocking
  }
}

// The server sends errors as { error: "...", blocking?: [...] }.
async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    if (typeof body?.error === 'string') {
      return new ApiError(res.status, body.error, Array.isArray(body.blocking) ? body.blocking : [])
    }
  } catch {
    // not JSON; fall through
  }
  return new ApiError(res.status, `Request failed (${res.status})`)
}

async function errorMessage(res: Response): Promise<string> {
  return (await toApiError(res)).message
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) throw await toApiError(res)
  return res.json()
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function getCommunities(): Promise<Community[]> {
  return (await api<{ communities: Community[] }>('/communities')).communities
}

export async function listRequests(residentId: number): Promise<MoveRequest[]> {
  return (await api<{ requests: MoveRequest[] }>(`/requests?residentId=${residentId}`)).requests
}

export async function createRequest(communityId: string, residentId: number): Promise<MoveRequest> {
  return (await post<{ request: MoveRequest }>('/requests', { communityId, residentId })).request
}

export function getRequest(requestId: number): Promise<RequestDetail> {
  return api<RequestDetail>(`/requests/${requestId}`)
}

export async function getMessages(requestId: number): Promise<ChatMessage[]> {
  return (await api<{ messages: ChatMessage[] }>(`/requests/${requestId}/messages`)).messages
}

// Mock upload: only the document key and the file's name are sent, never its contents.
export function uploadDocument(requestId: number, key: string, filename: string): Promise<unknown> {
  return post(`/requests/${requestId}/documents`, { key, filename })
}

export function submitRequest(requestId: number): Promise<unknown> {
  return post(`/requests/${requestId}/submit`)
}

export type RiskLevel = 'low' | 'medium' | 'high'
export type Recommendation = 'approve' | 'reject' | 'request_info'
export type AdminStatus = Exclude<RequestStatus, 'draft'>

export interface AdminRequestRow extends MoveRequest {
  residentName: string
  riskLevel: RiskLevel | null // from the latest assessment; null if there is none yet
  recommendation: Recommendation | null
  assessmentFailed: boolean // the last attempt failed and no newer assessment exists
  assessmentStale: boolean // the latest assessment predates the latest submission
}

export interface AdminQueue {
  community: { id: string; name: string }
  requests: AdminRequestRow[]
}

export interface Assessment {
  id: number
  summary: string
  riskLevel: RiskLevel
  risks: { title: string; detail: string; severity: RiskLevel }[]
  recommendation: Recommendation
  reasoning: string
  messageToResident: string
  model: string
  createdAt: string
}

export interface AdminRequestDetail extends RequestDetail {
  assessment: Assessment | null
  assessmentFailed: boolean
  assessmentStale: boolean
  resident: Resident | null
  unit: { id: number; flatNo: string; pendingDues: number } | null
  transcript: ChatMessage[]
}

export function getAdminQueue(communityId: string): Promise<AdminQueue> {
  return api<AdminQueue>(`/admin/${encodeURIComponent(communityId)}/requests`)
}

export function getAdminRequest(requestId: number): Promise<AdminRequestDetail> {
  return api<AdminRequestDetail>(`/admin/requests/${requestId}`)
}

export function runAssessment(requestId: number): Promise<unknown> {
  return post(`/admin/requests/${requestId}/assess`)
}

export function decideRequest(requestId: number, action: Recommendation, note?: string): Promise<unknown> {
  return post(`/admin/requests/${requestId}/decision`, { action, note })
}

export async function askAgent(requestId: number, question: string): Promise<string> {
  return (await post<{ answer: string }>(`/admin/requests/${requestId}/ask`, { question })).answer
}

export interface StreamHandlers {
  onToken: (text: string) => void
  onTool: (name: string) => void
  onRequestUpdated: () => void
  onDone: () => void
  onError: (message: string) => void
}

// EventSource can only GET and this endpoint is a POST, so we read the SSE stream by hand.
// Events are "event: x" + "data: {...}" lines, separated by a blank line.
// Calls exactly one of onDone / onError, once, and never throws.
export async function streamChat(requestId: number, message: string, handlers: StreamHandlers): Promise<void> {
  // so we never report an ending twice
  let finished = false

  const dispatch = (block: string) => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      // anything else (":" comments, id:, retry:) is ignored
    }
    if (dataLines.length === 0) return

    let data: { text?: string; name?: string; message?: string }
    try {
      data = JSON.parse(dataLines.join('\n'))
    } catch {
      return // a malformed event should not kill the whole stream
    }

    switch (event) {
      case 'token':
        if (data.text) handlers.onToken(data.text)
        break
      case 'tool':
        if (data.name) handlers.onTool(data.name)
        break
      case 'request_updated':
        handlers.onRequestUpdated()
        break
      case 'done':
        finished = true
        handlers.onDone()
        break
      case 'error':
        finished = true
        handlers.onError(data.message ?? 'Something went wrong. Please try again.')
        break
    }
  }

  try {
    const res = await fetch(`/api/requests/${requestId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })

    // validation, 404 and rate-limit errors come back as plain JSON, before streaming starts
    if (!res.ok || !res.body) {
      handlers.onError(await errorMessage(res))
      return
    }

    const reader = res.body.getReader()
    // one decoder for the whole stream, so a multi-byte char split across chunks (like "₹") survives
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // chunks don't line up with events: handle the complete blocks, keep the rest for the next chunk
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        dispatch(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
      }
    }

    // server always ends with done or error, so anything else means the connection dropped
    if (!finished) handlers.onError('The connection closed before the reply finished. Please try again.')
  } catch {
    if (!finished) handlers.onError('Could not reach the server. Check your connection and try again.')
  }
}
