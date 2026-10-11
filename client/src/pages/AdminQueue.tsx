import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAdminQueue, type AdminRequestRow, type AdminStatus } from '../api'
import { RiskBadge } from '../components/RiskBadge'
import { Card, PageMessage, Shell } from '../components/Shell'
import { StatusBadge } from '../components/StatusBadge'
import { formatMoveDate, RECOMMENDATION_LABELS, requestTitle } from '../format'

const TABS: { status: AdminStatus; label: string }[] = [
  { status: 'submitted', label: 'Needs review' },
  { status: 'info_requested', label: 'Info requested' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Rejected' },
]

// a fresh assessment is on its way: none yet, or the one we have predates a resubmission.
// a failed attempt doesn't count: nothing arrives until the admin re-runs it
const awaitingAssessment = (r: AdminRequestRow) =>
  r.status === 'submitted' && !r.assessmentFailed && (r.riskLevel === null || r.assessmentStale)

function riskBadge(r: AdminRequestRow) {
  if (r.assessmentFailed) return <RiskBadge level={null} empty="Assessment failed" />
  if (awaitingAssessment(r)) return <RiskBadge level={null} empty="Assessing…" />
  return <RiskBadge level={r.riskLevel} empty="Not assessed" />
}

function RequestCard({ communityId, request }: { communityId: string; request: AdminRequestRow }) {
  return (
    <Link to={`/admin/${communityId}/requests/${request.id}`}>
      <Card className="flex items-center justify-between gap-4 p-4 transition hover:border-brand">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {request.residentName} <span className="font-normal text-neutral-400">·</span> Flat {request.flatNo ?? '-'}
          </p>
          <p className="text-sm text-neutral-500">
            {requestTitle(request)} · {request.moveDate ? formatMoveDate(request.moveDate) : 'No date'} ·{' '}
            {request.slot ?? 'No slot'}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge status={request.status} />
            {riskBadge(request)}
            {request.recommendation && !request.assessmentFailed && !awaitingAssessment(request) && (
              <span className="text-xs text-neutral-500">
                Agent suggests: {RECOMMENDATION_LABELS[request.recommendation]}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-neutral-400" aria-hidden />
      </Card>
    </Link>
  )
}

export function AdminQueue() {
  const { communityId = '' } = useParams()
  const [tab, setTab] = useState<AdminStatus>('submitted')

  const queue = useQuery({
    queryKey: ['admin-queue', communityId],
    queryFn: () => getAdminQueue(communityId),
    refetchInterval: (query) => (query.state.data?.requests.some(awaitingAssessment) ? 5000 : false),
  })

  if (queue.isPending) {
    return (
      <Shell>
        <p className="text-sm text-neutral-400">Loading…</p>
      </Shell>
    )
  }
  if (queue.isError) {
    return (
      <Shell>
        <PageMessage title="Could not load requests" detail={queue.error.message} />
      </Shell>
    )
  }

  const { community, requests } = queue.data
  const shown = requests.filter((r) => r.status === tab)

  return (
    <Shell subtitle="Admin">
      <h1 className="text-2xl font-bold tracking-tight">{community.name}</h1>
      <p className="text-sm text-neutral-500">Move requests</p>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist">
        {TABS.map(({ status, label }) => {
          const count = requests.filter((r) => r.status === status).length
          const active = status === tab
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(status)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
                active ? 'border-brand text-brand' : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                  active ? 'bg-brand-soft text-brand' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <Card className="mt-4 p-8 text-center text-sm text-neutral-500">Nothing here right now.</Card>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((request) => (
            <li key={request.id}>
              <RequestCard communityId={communityId} request={request} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
