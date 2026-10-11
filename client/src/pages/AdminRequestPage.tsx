import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getAdminRequest, type AdminRequestDetail } from '../api'
import { AskAgent } from '../components/AskAgent'
import { AssessmentCard } from '../components/AssessmentCard'
import { DecisionPanel } from '../components/DecisionPanel'
import { DetailsList, Section, StatusIcon, Timeline } from '../components/RequestSections'
import { PageMessage, Shell } from '../components/Shell'
import { StatusBadge } from '../components/StatusBadge'
import { formatRupees, requestTitle } from '../format'

// same rule as the queue: none yet or stale, and not failed
const awaitingAssessment = (d: AdminRequestDetail) =>
  d.request.status === 'submitted' && !d.assessmentFailed && (!d.assessment || d.assessmentStale)

const NOTE_PREFIX = '[note]'
const DOC_PREFIX = 'doc:'

export function AdminRequestPage() {
  const { communityId = '', id = '' } = useParams()
  const requestId = Number(id)
  const validId = Number.isInteger(requestId) && requestId > 0

  const query = useQuery({
    queryKey: ['admin-request', requestId],
    queryFn: () => getAdminRequest(requestId),
    enabled: validId,
    refetchInterval: (q) => {
      const d = q.state.data
      return d && awaitingAssessment(d) ? 5000 : false
    },
  })

  if (validId && query.isPending) {
    return (
      <Shell wide>
        <p className="text-sm text-neutral-400">Loading…</p>
      </Shell>
    )
  }
  const detail = query.data
  // a request from another community is treated as not found
  if (!detail || detail.request.communityId !== communityId) {
    return (
      <Shell wide>
        <PageMessage title="Request not found" detail={query.error?.message} />
      </Shell>
    )
  }

  const { request, evaluation, events, assessment, resident, unit, transcript } = detail
  const extra: [string, string][] = [
    ['Resident', resident?.name ?? '-'],
    ['Phone', resident?.phone ?? '-'],
  ]
  if (unit) extra.push(['Pending dues on flat', formatRupees(unit.pendingDues)])

  return (
    <Shell wide subtitle="Admin">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to={`/admin/${communityId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All requests
        </Link>
        <h1 className="text-lg font-semibold">
          {requestTitle(request)} · {resident?.name}
        </h1>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title={`Request #${request.id}`} action={<StatusBadge status={request.status} />}>
            <DetailsList request={request} extra={extra} />
          </Section>

          <Section title="Checklist">
            <ul className="space-y-2.5">
              {evaluation.results.map((result) => {
                const doc = result.id.startsWith(DOC_PREFIX)
                  ? request.documents.find((d) => d.key === result.id.slice(DOC_PREFIX.length))
                  : undefined
                return (
                  <li key={result.id} className="flex gap-2.5 text-sm">
                    <StatusIcon status={result.status} />
                    <div className="min-w-0">
                      <p>{result.label}</p>
                      <p className={`break-words text-xs ${result.status === 'fail' ? 'text-red-600' : 'text-neutral-500'}`}>
                        {doc ? `Uploaded: ${doc.filename}` : result.detail}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Section>

          {evaluation.fees.length > 0 && (
            <Section title="Fees">
              <ul className="space-y-2 text-sm">
                {evaluation.fees.map((fee) => (
                  <li key={fee.label} className="flex justify-between gap-4">
                    <span className="text-neutral-500">{fee.label}</span>
                    <span className="font-medium">{formatRupees(fee.amount)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Chat transcript">
            {transcript.length === 0 ? (
              <p className="text-sm text-neutral-500">No messages.</p>
            ) : (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand">
                  Show {transcript.length} messages
                </summary>
                <ul className="mt-3 space-y-3 text-sm">
                  {transcript.map((message, i) =>
                    message.content.startsWith(NOTE_PREFIX) ? (
                      <li key={i} className="text-xs text-neutral-400">
                        {message.content.slice(NOTE_PREFIX.length).trim()}
                      </li>
                    ) : (
                      <li key={i}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                          {message.role === 'user' ? (resident?.name ?? 'Resident') : 'Assistant'}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      </li>
                    ),
                  )}
                </ul>
              </details>
            )}
          </Section>

          <Section title="Timeline">
            <Timeline events={events} />
          </Section>
        </div>

        <div className="space-y-4">
          <AssessmentCard
            requestId={request.id}
            assessment={assessment}
            failed={detail.assessmentFailed}
            assessing={awaitingAssessment(detail)}
          />
          <DecisionPanel request={request} assessment={assessment} />
          <AskAgent requestId={request.id} />
        </div>
      </div>
    </Shell>
  )
}
