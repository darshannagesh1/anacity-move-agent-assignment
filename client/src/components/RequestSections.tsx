import { Check, Circle, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { MoveRequest, RequestEvent, RuleStatus } from '../api'
import { eventLabel, formatMoveDate, formatValue, RESIDENT_TYPE_LABELS, timeAgo, titleCase, TYPE_LABELS } from '../format'
import { Card } from './Shell'

// shared by the resident panel and the admin detail page

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

export function StatusIcon({ status }: { status: RuleStatus }) {
  const base = 'mt-0.5 size-4 shrink-0'
  switch (status) {
    case 'pass':
      return <Check className={`${base} text-green-600`} aria-label="Done" />
    case 'fail':
      return <X className={`${base} text-red-600`} aria-label="Problem" />
    case 'info':
      return <Info className={`${base} text-blue-600`} aria-label="Note" />
    default:
      return <Circle className={`${base} text-neutral-300`} aria-label="To do" />
  }
}

export function DetailsList({ request, extra = [] }: { request: MoveRequest; extra?: [string, string][] }) {
  const rows: [string, string][] = [
    ...extra,
    ['Request type', request.type ? TYPE_LABELS[request.type] : '-'],
    ['Owner / tenant', request.residentType ? RESIDENT_TYPE_LABELS[request.residentType] : '-'],
    ['Flat', formatValue(request.flatNo)],
    ['Move date', request.moveDate ? formatMoveDate(request.moveDate) : '-'],
    ['Time slot', formatValue(request.slot)],
    ...Object.entries(request.data).map(([key, value]): [string, string] => [titleCase(key), formatValue(value)]),
  ]
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-neutral-500">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Timeline({ events }: { events: RequestEvent[] }) {
  return (
    <ol className="space-y-2.5">
      {[...events].reverse().map((event) => (
        <li key={event.id} className="flex justify-between gap-4 text-sm">
          <span>{eventLabel(event)}</span>
          <span className="shrink-0 text-xs text-neutral-400">{timeAgo(event.createdAt)}</span>
        </li>
      ))}
    </ol>
  )
}
