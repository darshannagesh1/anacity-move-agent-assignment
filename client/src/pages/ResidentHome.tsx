import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createRequest, getCommunities, listRequests } from '../api'
import { Card, PageMessage, Shell } from '../components/Shell'
import { StatusBadge } from '../components/StatusBadge'
import { formatMoveDate, requestTitle } from '../format'

export function ResidentHome() {
  const { communityId = '', residentId: residentParam = '' } = useParams()
  const residentId = Number(residentParam)
  const navigate = useNavigate()
  const base = `/resident/${communityId}/${residentParam}`

  const communitiesQuery = useQuery({ queryKey: ['communities'], queryFn: getCommunities })
  const requestsQuery = useQuery({
    queryKey: ['requests', residentId],
    queryFn: () => listRequests(residentId),
    enabled: Number.isInteger(residentId) && residentId > 0,
  })
  const create = useMutation({
    mutationFn: () => createRequest(communityId, residentId),
    onSuccess: (request) => navigate(`${base}/requests/${request.id}`),
  })

  const community = communitiesQuery.data?.find((c) => c.id === communityId)
  const resident = community?.residents.find((r) => r.id === residentId)

  if (communitiesQuery.isPending) {
    return (
      <Shell>
        <p className="text-sm text-neutral-400">Loading…</p>
      </Shell>
    )
  }
  if (!community || !resident) {
    return (
      <Shell>
        <PageMessage
          title={communitiesQuery.isError ? 'Could not reach the server' : 'Resident not found'}
          detail={communitiesQuery.isError ? 'Check that the server is running, then reload.' : undefined}
        />
      </Shell>
    )
  }

  const requests = requestsQuery.data ?? []

  return (
    <Shell subtitle={community.name}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hi, {resident.name}</h1>
          <p className="text-sm text-neutral-500">Your move requests at {community.name}</p>
        </div>
        <button
          type="button"
          disabled={create.isPending}
          onClick={() => create.mutate()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:bg-neutral-300"
        >
          <Plus className="size-4" aria-hidden />
          {create.isPending ? 'Creating…' : 'New request'}
        </button>
      </div>

      {create.isError && <p className="mb-4 text-sm text-red-600">{create.error.message}</p>}

      {requestsQuery.isPending && <p className="text-sm text-neutral-400">Loading requests…</p>}
      {requestsQuery.isError && <p className="text-sm text-red-600">Could not load your requests.</p>}

      {requestsQuery.isSuccess && requests.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-medium">No requests yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            Start a new request and the assistant will walk you through it.
          </p>
        </Card>
      )}

      <ul className="space-y-3">
        {requests.map((request) => (
          <li key={request.id}>
            <Link to={`${base}/requests/${request.id}`}>
              <Card className="flex items-center justify-between gap-4 p-4 transition hover:border-brand">
                <div className="min-w-0">
                  <p className="font-medium">{requestTitle(request)}</p>
                  <p className="truncate text-sm text-neutral-500">
                    Flat {request.flatNo ?? '-'} · {request.moveDate ? formatMoveDate(request.moveDate) : 'No date yet'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={request.status} />
                  <ChevronRight className="size-4 text-neutral-400" aria-hidden />
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  )
}
