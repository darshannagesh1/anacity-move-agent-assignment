import type { RequestStatus } from '../api'

const STYLES: Record<RequestStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-700' },
  submitted: { label: 'Submitted', className: 'bg-brand-soft text-brand' },
  info_requested: { label: 'Info requested', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, className } = STYLES[status]
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}
