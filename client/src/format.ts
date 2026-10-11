import type { MoveRequest, RequestEvent } from './api'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// "2026-10-17" -> "Sat, 17 Oct 2026". Parsed and formatted in UTC so the day never shifts.
export function formatMoveDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`))
}

export function formatRupees(amount: number): string {
  return rupees.format(amount)
}

// "members_count" -> "Members Count"
export function titleCase(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export const TYPE_LABELS = { move_in: 'Move-in', move_out: 'Move-out' } as const
export const RESIDENT_TYPE_LABELS = { owner: 'Owner', tenant: 'Tenant' } as const

export const RECOMMENDATION_LABELS = { approve: 'Approve', reject: 'Reject', request_info: 'Request info' } as const

export function requestTitle(request: MoveRequest): string {
  return request.type ? TYPE_LABELS[request.type] : 'New request'
}

const FIELD_LABELS: Record<string, string> = {
  type: 'request type',
  residentType: 'owner/tenant',
  flatNo: 'flat',
  moveDate: 'move date',
  slot: 'time slot',
}

export function eventLabel(event: RequestEvent): string {
  switch (event.event) {
    case 'created':
      return 'Request started'
    case 'fields_updated': {
      const fields = (event.payload.fields ?? {}) as Record<string, unknown>
      const names = Object.keys(fields).flatMap((key) =>
        key === 'data'
          ? Object.keys((fields.data ?? {}) as object).map((k) => titleCase(k).toLowerCase())
          : [FIELD_LABELS[key] ?? key],
      )
      return names.length ? `Assistant saved ${names.join(', ')}` : 'Assistant saved details'
    }
    case 'document_uploaded':
      return `Uploaded ${formatValue(event.payload.filename)}`
    case 'submitted':
      return 'Submitted for review'
    case 'assessment_failed':
      return 'Agent assessment failed'
    case 'decision':
      switch (event.payload.action) {
        case 'approve':
          return 'Admin approved the request'
        case 'reject':
          return 'Admin rejected the request'
        default:
          return 'Admin asked for more information'
      }
    default:
      return titleCase(event.event)
  }
}
