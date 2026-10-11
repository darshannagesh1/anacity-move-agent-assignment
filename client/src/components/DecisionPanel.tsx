import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, decideRequest, type Assessment, type MoveRequest, type Recommendation } from '../api'
import { Section } from './RequestSections'
import { StatusBadge } from './StatusBadge'

type NoteAction = 'request_info' | 'reject'

const NOTE_ACTIONS: Record<NoteAction, { title: string; confirm: string }> = {
  request_info: { title: 'What should the resident provide?', confirm: 'Send request for info' },
  reject: { title: 'Why is this request rejected?', confirm: 'Reject request' },
}

const OUTCOMES: Partial<Record<MoveRequest['status'], string>> = {
  approved: 'This request was approved.',
  rejected: 'This request was rejected.',
  info_requested: 'Waiting for the resident to respond and resubmit.',
  draft: 'The resident has not submitted this request yet.',
}

const outlineButton =
  'rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400'

export function DecisionPanel({ request, assessment }: { request: MoveRequest; assessment: Assessment | null }) {
  const queryClient = useQueryClient()
  const [noteAction, setNoteAction] = useState<NoteAction | null>(null)
  const [note, setNote] = useState('')

  const decide = useMutation({
    mutationFn: ({ action, note }: { action: Recommendation; note?: string }) =>
      decideRequest(request.id, action, note),
    onSuccess: () => setNoteAction(null),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-request', request.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-queue'] }),
      ]),
  })

  function openNote(action: NoteAction) {
    decide.reset()
    // start from the agent's draft so the admin edits instead of writing from scratch
    setNote(assessment?.messageToResident ?? '')
    setNoteAction(action)
  }

  if (request.status !== 'submitted') {
    return (
      <Section title="Decision" action={<StatusBadge status={request.status} />}>
        <p className="text-sm">{OUTCOMES[request.status]}</p>
        {request.adminNote && (
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">
            {request.adminNote}
          </p>
        )}
      </Section>
    )
  }

  const blocking = decide.error instanceof ApiError ? decide.error.blocking : []

  return (
    <Section title="Decision">
      {noteAction ? (
        <div className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="decision-note">
            {NOTE_ACTIONS[noteAction].title}
          </label>
          <textarea
            id="decision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="This message is shown to the resident."
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={decide.isPending || !note.trim()}
              onClick={() => decide.mutate({ action: noteAction, note })}
              className={`rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300 ${
                noteAction === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-dark'
              }`}
            >
              {decide.isPending ? 'Sending…' : NOTE_ACTIONS[noteAction].confirm}
            </button>
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => setNoteAction(null)}
              className={`${outlineButton} border-neutral-300 text-neutral-700 hover:bg-neutral-50`}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ action: 'approve' })}
            className="rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {decide.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => openNote('request_info')}
            className={`${outlineButton} border-brand text-brand hover:bg-brand-soft`}
          >
            Request info
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => openNote('reject')}
            className={`${outlineButton} border-red-300 text-red-700 hover:bg-red-50`}
          >
            Reject
          </button>
        </div>
      )}

      {decide.isError && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{decide.error.message}</p>
          {blocking.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {blocking.map((rule) => (
                <li key={rule.id}>
                  {rule.label}: {rule.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}
