import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Shell({ subtitle, wide, children }: { subtitle?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-3 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
          <Link to="/" className="font-semibold tracking-tight text-brand">
            ANACITY Move Assistant
          </Link>
          {subtitle && <span className="truncate text-sm text-neutral-500">{subtitle}</span>}
        </div>
      </header>
      <main className={`mx-auto px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-neutral-200 bg-white ${className}`}>{children}</div>
}

export function PageMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="font-medium">{title}</p>
      {detail && <p className="mt-1 text-sm text-neutral-500">{detail}</p>}
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Back to start
      </Link>
    </Card>
  )
}
