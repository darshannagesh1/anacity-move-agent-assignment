import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getCommunities, getRequest } from '../api'
import { Chat } from '../components/Chat'
import { RequestPanel } from '../components/RequestPanel'
import { PageMessage, Shell } from '../components/Shell'
import { requestTitle } from '../format'

export function RequestPage() {
  const { communityId = '', residentId: residentParam = '', requestId: requestParam = '' } = useParams()
  const residentId = Number(residentParam)
  const requestId = Number(requestParam)
  const validId = Number.isInteger(requestId) && requestId > 0

  const communitiesQuery = useQuery({ queryKey: ['communities'], queryFn: getCommunities })
  const requestQuery = useQuery({
    queryKey: ['request', requestId],
    queryFn: () => getRequest(requestId),
    enabled: validId,
  })

  const community = communitiesQuery.data?.find((c) => c.id === communityId)
  const resident = community?.residents.find((r) => r.id === residentId)
  const detail = requestQuery.data

  if (validId && (requestQuery.isPending || communitiesQuery.isPending)) {
    return (
      <Shell wide>
        <p className="text-sm text-neutral-400">Loading…</p>
      </Shell>
    )
  }
  // the URL's resident must own the request, otherwise treat it as not found
  if (!detail || !resident || detail.request.residentId !== resident.id) {
    return (
      <Shell wide>
        <PageMessage title="Request not found" detail={requestQuery.error?.message} />
      </Shell>
    )
  }

  return (
    <Shell wide subtitle={`${resident.name} · ${community?.name}`}>
      <div className="mb-4 flex items-center gap-3">
        <Link
          to={`/resident/${communityId}/${residentParam}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          My requests
        </Link>
        <h1 className="text-lg font-semibold">{requestTitle(detail.request)}</h1>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Chat request={detail.request} residentName={resident.name} />
        <RequestPanel detail={detail} />
      </div>
    </Shell>
  )
}
