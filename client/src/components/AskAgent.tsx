import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { askAgent } from '../api'
import { Section } from './RequestSections'

export function AskAgent({ requestId }: { requestId: number }) {
  const [question, setQuestion] = useState('')
  const ask = useMutation({ mutationFn: (q: string) => askAgent(requestId, q) })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (q && !ask.isPending) ask.mutate(q)
  }

  return (
    <Section title="Ask the agent">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          placeholder="e.g. Did the resident mention a vehicle?"
          aria-label="Question about this request"
          className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3.5 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="submit"
          disabled={ask.isPending || !question.trim()}
          aria-label="Ask"
          className="inline-flex items-center justify-center rounded-xl bg-brand px-3.5 text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </form>

      {ask.isPending && <p className="mt-3 text-sm text-neutral-500">Thinking…</p>}
      {ask.isError && <p className="mt-3 text-sm text-red-600">{ask.error.message}</p>}
      {ask.isSuccess && (
        <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm">
          <p className="text-xs text-neutral-400">{ask.variables}</p>
          <p className="mt-1 whitespace-pre-wrap">{ask.data}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-400">Answers come only from this request's details and chat.</p>
    </Section>
  )
}
