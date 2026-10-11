import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, RotateCw, Send, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { getMessages, streamChat, type MoveRequest } from '../api'
import { Card } from './Shell'

const TOOL_LABELS: Record<string, string> = {
  update_request: 'Saving details…',
  check_slot_availability: 'Checking slot availability…',
  get_policy: 'Reading community rules…',
  get_request_status: "Checking what's left…",
}

const QUICK_REPLIES = ["I'm moving in", "I'm moving out"]
const NOTE_PREFIX = '[note]'

// the message being sent and the reply streaming back, until the server has saved both
interface Turn {
  userText: string
  historyCount: number // how many saved messages were on screen when this turn started
  reply: string
  activity: string | null
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-neutral-100 text-neutral-900'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'neutral' | 'amber' | 'green' | 'red'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-brand-soft text-brand',
    amber: 'bg-amber-50 text-amber-900',
    green: 'bg-green-50 text-green-800',
    red: 'bg-red-50 text-red-800',
  }
  return <div className={`border-b border-neutral-200 px-4 py-2.5 text-sm ${tones[tone]}`}>{children}</div>
}

function statusBanner(request: MoveRequest) {
  switch (request.status) {
    case 'submitted':
      return <Banner tone="neutral">Submitted, waiting for admin review</Banner>
    case 'approved':
      return <Banner tone="green">Approved</Banner>
    case 'rejected':
      return <Banner tone="red">Rejected{request.adminNote ? `: ${request.adminNote}` : ''}</Banner>
    case 'info_requested':
      return (
        <Banner tone="amber">
          <span className="font-medium">The admin asked for more information:</span>{' '}
          {request.adminNote ?? 'Please check with the assistant.'}
        </Banner>
      )
    default:
      return null
  }
}

export function Chat({ request, residentName }: { request: MoveRequest; residentName: string }) {
  const requestId = request.id
  const queryClient = useQueryClient()
  const messagesQuery = useQuery({ queryKey: ['messages', requestId], queryFn: () => getMessages(requestId) })
  const history = messagesQuery.data ?? []

  const [input, setInput] = useState('')
  const [turn, setTurn] = useState<Turn | null>(null)
  const [error, setError] = useState<{ message: string; text: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const streaming = turn !== null
  const closed = request.status === 'submitted' || request.status === 'approved' || request.status === 'rejected'

  // mid-turn, show only the messages that were there when it started: the server has already
  // saved the user's message, so a refetch (e.g. after an upload) would show it twice
  const shown = turn ? history.slice(0, turn.historyCount) : history

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [shown.length, turn?.userText, turn?.reply, turn?.activity, error])

  function send(raw: string) {
    const text = raw.trim()
    if (!text || streaming || closed) return

    setInput('')
    setError(null)
    setTurn({ userText: text, historyCount: history.length, reply: '', activity: null })

    void streamChat(requestId, text, {
      onToken: (token) => setTurn((t) => t && { ...t, reply: t.reply + token, activity: null }),
      onTool: (name) => setTurn((t) => t && { ...t, activity: TOOL_LABELS[name] ?? 'Working…' }),
      onRequestUpdated: () => void queryClient.invalidateQueries({ queryKey: ['request', requestId] }),
      onDone: async () => {
        // swap streamed text for the saved messages only once they've loaded, so the reply doesn't flicker
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['messages', requestId] }),
          queryClient.invalidateQueries({ queryKey: ['request', requestId] }),
        ])
        setTurn(null)
      },
      onError: async (message) => {
        await queryClient.invalidateQueries({ queryKey: ['messages', requestId] })
        setTurn(null)
        setError({ message, text })
      },
    })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  const showGreeting = messagesQuery.isSuccess && history.length === 0 && !turn

  return (
    <Card className="flex h-[70vh] min-h-96 flex-col overflow-hidden lg:h-[calc(100vh-9.5rem)]">
      {statusBanner(request)}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messagesQuery.isPending && <p className="text-center text-sm text-neutral-400">Loading conversation…</p>}
        {messagesQuery.isError && (
          <p className="text-center text-sm text-red-600">Could not load the conversation. Reload the page to retry.</p>
        )}

        {showGreeting && (
          <>
            <Bubble role="assistant">
              Hi {residentName}! I can help you with a move-in or move-out request. What are you planning?
            </Bubble>
            {!closed && (
              <div className="flex flex-wrap gap-2">
                {QUICK_REPLIES.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => send(reply)}
                    className="rounded-full border border-brand px-3.5 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {shown.map((message, i) =>
          message.content.startsWith(NOTE_PREFIX) ? (
            <p key={i} className="text-center text-xs text-neutral-400">
              {message.content.slice(NOTE_PREFIX.length).trim()}
            </p>
          ) : (
            <Bubble key={i} role={message.role}>
              {message.content}
            </Bubble>
          ),
        )}

        {turn && (
          <>
            <Bubble role="user">{turn.userText}</Bubble>
            {turn.reply && <Bubble role="assistant">{turn.reply}</Bubble>}
            <p className="flex items-center gap-2 text-xs text-neutral-500">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              {turn.activity ?? (turn.reply ? 'Typing…' : 'Thinking…')}
            </p>
          </>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{error.message}</span>
            <button
              type="button"
              onClick={() => send(error.text)}
              className="inline-flex items-center gap-1 font-medium hover:underline"
            >
              <RotateCw className="size-3.5" aria-hidden />
              Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-neutral-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming || closed}
          maxLength={4000}
          placeholder={closed ? 'This request can no longer be changed' : 'Type your message…'}
          aria-label="Message"
          className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3.5 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-neutral-100 disabled:text-neutral-400"
        />
        <button
          type="submit"
          disabled={streaming || closed || !input.trim()}
          aria-label="Send"
          className="inline-flex items-center justify-center rounded-xl bg-brand px-3.5 text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </form>
    </Card>
  )
}
