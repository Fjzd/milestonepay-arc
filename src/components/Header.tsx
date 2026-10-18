import { ConnectKitButton } from 'connectkit'
import { Link } from './Router'

export function Header({ page }: { page: string }) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-5 py-3"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link href="/">
        <span className="display font-600 text-base tracking-tight cursor-pointer" style={{ color: 'var(--ink)' }}>
          Milestone<span style={{ color: 'var(--accent-hover)' }}>Pay</span>
        </span>
      </Link>
      <nav className="hidden sm:flex items-center gap-1 text-sm">
        {[
          { label: 'Dashboard', href: '/' },
          { label: 'Create', href: '/create' },
          { label: 'Pay', href: '/pay' },
          { label: 'Profile', href: '/profile' },
          { label: 'Deploy', href: '/deploy' },
        ].map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{
              color: page === href ? 'var(--ink)' : 'var(--muted)',
              background: page === href ? 'var(--surface-muted)' : 'transparent',
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* ConnectKit handles injected, WalletConnect QR, and Coinbase Wallet
          — no custom fallback needed; it shows a QR option when no extension
          is present as long as walletConnectProjectId is set in config. */}
      <ConnectKitButton />
    </header>
  )
}
