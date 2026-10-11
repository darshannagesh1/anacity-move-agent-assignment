import type { RiskLevel } from '../api'

const STYLES: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: 'Low risk', className: 'bg-green-100 text-green-800' },
  medium: { label: 'Medium risk', className: 'bg-amber-100 text-amber-800' },
  high: { label: 'High risk', className: 'bg-red-100 text-red-800' },
}

// `empty` is what to show when there is no assessment yet, e.g. "Assessing…".
export function RiskBadge({ level, empty }: { level: RiskLevel | null; empty: string }) {
  const { label, className } = level ? STYLES[level] : { label: empty, className: 'bg-neutral-100 text-neutral-500' }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}
