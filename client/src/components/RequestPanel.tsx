import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Upload } from 'lucide-react'
import { useRef } from 'react'
import { submitRequest, uploadDocument, type RequestDetail, type RuleResult } from '../api'
import { formatRupees } from '../format'
import { DetailsList, Section, StatusIcon, Timeline } from './RequestSections'
import { StatusBadge } from './StatusBadge'

// shown in the details card instead, so the checklist stays short
const BASIC_RULES = ['request_type', 'resident_type', 'unit', 'move_date']
const DOC_PREFIX = 'doc:'

function ChecklistItem({ result }: { result: RuleResult }) {
  // pending items already say what's needed in their label
  const showDetail = result.status === 'fail' || result.status === 'info'
  return (
    <li className="flex gap-2.5 text-sm">
      <StatusIcon status={result.status} />
      <div>
        <p className={result.status === 'pass' ? 'text-neutral-500' : 'text-neutral-900'}>{result.label}</p>
        {showDetail && (
          <p className={`text-xs ${result.status === 'fail' ? 'text-red-600' : 'text-blue-700'}`}>{result.detail}</p>
        )}
      </div>
    </li>
  )
}

function UploadButton({ disabled, onPick }: { disabled: boolean; onPick: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = '' // so picking the same file again still fires onChange
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
      >
        <Upload className="size-3.5" aria-hidden />
        Upload
      </button>
    </>
  )
}

export function RequestPanel({ detail }: { detail: RequestDetail }) {
  const { request, evaluation, events } = detail
  const queryClient = useQueryClient()
  const editable = request.status === 'draft' || request.status === 'info_requested'

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['request', request.id] }),
      queryClient.invalidateQueries({ queryKey: ['messages', request.id] }),
    ])

  const upload = useMutation({
    mutationFn: ({ key, filename }: { key: string; filename: string }) => uploadDocument(request.id, key, filename),
    onSettled: refresh,
  })
  const submit = useMutation({ mutationFn: () => submitRequest(request.id), onSettled: refresh })

  const docResults = evaluation.results.filter((r) => r.id.startsWith(DOC_PREFIX))
  const checklist = evaluation.results.filter((r) => !BASIC_RULES.includes(r.id) && !r.id.startsWith(DOC_PREFIX))

  return (
    <div className="space-y-4">
      <Section title={`Request #${request.id}`} action={<StatusBadge status={request.status} />}>
        <DetailsList request={request} />
      </Section>

      <Section title="Checklist">
        {checklist.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Tell the assistant whether you are moving in or out to see what is needed.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {checklist.map((result) => (
              <ChecklistItem key={result.id} result={result} />
            ))}
          </ul>
        )}
      </Section>

      {docResults.length > 0 && (
        <Section title="Documents">
          <ul className="space-y-3">
            {docResults.map((result) => {
              const key = result.id.slice(DOC_PREFIX.length)
              const uploaded = request.documents.find((d) => d.key === key)
              return (
                <li key={result.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 gap-2.5">
                    <StatusIcon status={result.status} />
                    <div className="min-w-0">
                      <p>{result.label}</p>
                      {uploaded && (
                        <p className="flex items-center gap-1 text-xs text-neutral-500">
                          <FileText className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">Uploaded: {uploaded.filename}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {!uploaded && (
                    <UploadButton
                      disabled={!editable || upload.isPending}
                      onPick={(file) => upload.mutate({ key, filename: file.name })}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          {upload.isError && <p className="mt-2 text-xs text-red-600">{upload.error.message}</p>}
          <p className="mt-3 text-xs text-neutral-400">Demo upload: only the file name is recorded.</p>
        </Section>
      )}

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

      {editable && (
        <div>
          <button
            type="button"
            disabled={!evaluation.canSubmit || submit.isPending}
            onClick={() => submit.mutate()}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {submit.isPending ? 'Submitting…' : 'Submit request'}
          </button>
          {!evaluation.canSubmit && (
            <p className="mt-2 text-center text-xs text-neutral-500">Complete the checklist to submit</p>
          )}
          {submit.isError && <p className="mt-2 text-center text-xs text-red-600">{submit.error.message}</p>}
        </div>
      )}

      <Section title="Timeline">
        <Timeline events={events} />
      </Section>
    </div>
  )
}
