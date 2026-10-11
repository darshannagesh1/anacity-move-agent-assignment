import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, User } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCommunities } from '../api'
import { Card, Shell } from '../components/Shell'

const selectClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-neutral-100 disabled:text-neutral-400'
const buttonClass =
  'w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  )
}

export function Landing() {
  const navigate = useNavigate()
  const { data: communities = [], isPending, isError } = useQuery({
    queryKey: ['communities'],
    queryFn: getCommunities,
  })

  const [residentCommunity, setResidentCommunity] = useState('')
  const [residentId, setResidentId] = useState('')
  const [adminCommunity, setAdminCommunity] = useState('')

  const residents = communities.find((c) => c.id === residentCommunity)?.residents ?? []

  const communityOptions = (
    <>
      <option value="">{isPending ? 'Loading…' : 'Select a community'}</option>
      {communities.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  )

  return (
    <Shell>
      <div className="py-6 text-center sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight">ANACITY Move Assistant</h1>
        <p className="mt-2 text-neutral-500">Plan a move-in or move-out for your community by chatting.</p>
      </div>

      {isError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load communities. Check that the server is running, then reload.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-soft p-2 text-brand">
              <User className="size-5" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">Resident</h2>
          </div>
          <Field label="Community">
            <select
              className={selectClass}
              value={residentCommunity}
              onChange={(e) => {
                setResidentCommunity(e.target.value)
                setResidentId('')
              }}
            >
              {communityOptions}
            </select>
          </Field>
          <Field label="Resident">
            <select
              className={selectClass}
              value={residentId}
              disabled={!residentCommunity}
              onChange={(e) => setResidentId(e.target.value)}
            >
              <option value="">Select a resident</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className={buttonClass}
            disabled={!residentId}
            onClick={() => navigate(`/resident/${residentCommunity}/${residentId}`)}
          >
            Continue as resident
          </button>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-soft p-2 text-brand">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">Admin</h2>
          </div>
          <Field label="Community">
            <select className={selectClass} value={adminCommunity} onChange={(e) => setAdminCommunity(e.target.value)}>
              {communityOptions}
            </select>
          </Field>
          <button
            type="button"
            className={`${buttonClass} sm:mt-auto`}
            disabled={!adminCommunity}
            onClick={() => navigate(`/admin/${adminCommunity}`)}
          >
            Continue as admin
          </button>
        </Card>
      </div>

      <p className="mt-6 text-center text-sm text-neutral-400">Demo personas, no login</p>
    </Shell>
  )
}
