import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { runAssessment, type Assessment } from '../api'
import { RECOMMENDATION_LABELS, timeAgo } from '../format'
import { Section } from './RequestSections'
import { RiskBadge } from './RiskBadge'

export function AssessmentCard({
  requestId,
  assessment,
  assessing,
  failed,
}: {
  requestId: number
  assessment: Assessment | null
  assessing: boolean // a fresh automatic assessment is on its way (none yet, or the old one is stale)
  failed: boolean // the last attempt failed and nothing newer has replaced it
}) {
  const queryClient = useQueryClient()
  const rerun = useMutation({
    mutationFn: () => runAssessment(requestId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-request', requestId] }),
        queryClient.invalidateQueries({ queryKey: ['admin-queue'] }),
      ]),
  })

  return (
    <Section
      title="Agent assessment"
      action={
        failed ? (
          <RiskBadge level={null} empty="Assessment failed" />
        ) : assessing ? (
          <RiskBadge level={null} empty="Assessing…" />
        ) : (
          assessment && <RiskBadge level={assessment.riskLevel} empty="" />
        )
      }
    >
      {failed && (
        <p className="mb-3 text-sm text-neutral-500">
          The last assessment attempt failed.{assessment ? ' Showing the previous one.' : ''} Run it again below.
        </p>
      )}
      {assessing && assessment && (
        <p className="mb-3 text-sm text-neutral-500">Re-assessing after resubmission…</p>
      )}
      {assessment ? (
        <div className={`space-y-4 text-sm ${assessing ? 'opacity-50' : ''}`}>
          <p>{assessment.summary}</p>

          {assessment.risks.length > 0 && (
            <ul className="space-y-2">
              {assessment.risks.map((risk, i) => (
                <li key={i} className="rounded-xl bg-neutral-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{risk.title}</p>
                    <RiskBadge level={risk.severity} empty="" />
                  </div>
                  <p className="mt-1 text-neutral-600">{risk.detail}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl bg-brand-soft p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">Recommendation</p>
            <p className="mt-1 font-semibold">{RECOMMENDATION_LABELS[assessment.recommendation]}</p>
            <p className="mt-1 text-neutral-700">{assessment.reasoning}</p>
          </div>

          <p className="text-xs text-neutral-400">
            {assessment.model} · {timeAgo(assessment.createdAt)}
          </p>
        </div>
      ) : (
        !failed && (
          <p className="text-sm text-neutral-500">
            {assessing ? 'The agent is assessing this request…' : 'No assessment yet.'}
          </p>
        )
      )}

      <button
        type="button"
        disabled={rerun.isPending}
        onClick={() => rerun.mutate()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
      >
        <RotateCw className={`size-3.5 ${rerun.isPending ? 'animate-spin' : ''}`} aria-hidden />
        {rerun.isPending ? 'Assessing…' : assessment ? 'Re-run assessment' : 'Run assessment'}
      </button>
      {rerun.isError && <p className="mt-2 text-xs text-red-600">{rerun.error.message}</p>}

      <p className="mt-3 text-xs text-neutral-400">AI recommendation. The admin makes the final decision.</p>
    </Section>
  )
}
