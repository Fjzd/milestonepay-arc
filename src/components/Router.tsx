/**
 * Minimal hash-based router (no external dep needed).
 * Routes: /, /create, /escrow/:id, /pay/:id, /profile, /profile/:address
 */
import React, { createContext, useContext, useEffect, useState } from 'react'

interface RouterCtx {
  path: string
  params: Record<string, string>
  navigate: (href: string) => void
}

const Ctx = createContext<RouterCtx>({ path: '/', params: {}, navigate: () => {} })

function parsePath(hash: string): { path: string; params: Record<string, string> } {
  const raw = hash.replace(/^#/, '') || '/'
  // Match /pay/:id
  let m = raw.match(/^\/pay\/([^/]+)$/)
  if (m) return { path: '/pay/:id', params: { id: m[1] } }
  // Match /escrow/:id
  m = raw.match(/^\/escrow\/([^/]+)$/)
  if (m) return { path: '/escrow/:id', params: { id: m[1] } }
  // Match /profile/:address
  m = raw.match(/^\/profile\/(0x[0-9a-fA-F]{40})$/)
  if (m) return { path: '/profile/:address', params: { address: m[1] } }
  // Match /deploy
  if (raw === '/deploy') return { path: '/deploy', params: {} }
  return { path: raw, params: {} }
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  // Initialise synchronously — window.location.hash is reliable at parse time.
  // A second read after a tick catches any hash set before React hydrates.
  const [state, setState] = useState(() => parsePath(window.location.hash))

  useEffect(() => {
    const handler = () => setState(parsePath(window.location.hash))
    // hashchange fires on <a href="#/..."> clicks and window.location.hash writes
    window.addEventListener('hashchange', handler)
    // popstate fires on back/forward navigation in some browsers
    window.addEventListener('popstate', handler)
    return () => {
      window.removeEventListener('hashchange', handler)
      window.removeEventListener('popstate', handler)
    }
  }, [])

  function navigate(href: string) {
    window.location.hash = href
  }

  return <Ctx.Provider value={{ ...state, navigate }}>{children}</Ctx.Provider>
}

export function useRouter() {
  return useContext(Ctx)
}

export function Link({
  href,
  children,
  className,
  style,
}: {
  href: string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <a
      href={`#${href}`}
      className={className}
      style={style}
      onClick={(e) => {
        e.preventDefault()
        window.location.hash = href
      }}
    >
      {children}
    </a>
  )
}
