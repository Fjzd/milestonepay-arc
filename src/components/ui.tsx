/**
 * Shared UI primitives for MilestonePay
 */
import React from 'react'

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border backdrop-blur-sm p-5 ${className}`}
      style={{
        background: 'var(--surface-strong)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 16px rgba(18,45,69,0.06)',
      }}
    >
      {children}
    </div>
  )
}

// ── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'success'
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
}
export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none'
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm' }
  const variants: Record<ButtonVariant, string> = {
    primary: 'text-white',
    ghost: 'border',
    danger: 'text-white',
    success: 'text-white',
  }
  const styles: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#fff' },
    ghost: { background: 'transparent', borderColor: 'var(--border)', color: 'var(--ink-2)' },
    danger: { background: 'var(--danger)', color: '#fff' },
    success: { background: 'var(--success)', color: '#fff' },
  }
  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      style={styles[variant]}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  )
}

// ── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  helper?: string
  error?: string
}
export function Input({ label, helper, error, className = '', ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          {label}
        </label>
      )}
      <input
        className={`rounded-xl px-3 py-2.5 text-sm outline-none border transition-colors ${className}`}
        style={{
          background: 'var(--surface-muted)',
          borderColor: error ? 'var(--danger)' : 'var(--border)',
          color: 'var(--ink)',
        }}
        {...rest}
      />
      {(helper || error) && (
        <span className="text-xs" style={{ color: error ? 'var(--danger)' : 'var(--subtle)' }}>
          {error ?? helper}
        </span>
      )}
    </div>
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────
type BadgeColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'muted'
const badgeStyles: Record<BadgeColor, { bg: string; color: string }> = {
  blue: { bg: 'rgba(16,97,166,0.10)', color: '#1061a6' },
  green: { bg: 'rgba(26,128,71,0.10)', color: 'var(--success)' },
  amber: { bg: 'rgba(180,120,10,0.10)', color: '#b4780a' },
  red: { bg: 'rgba(186,43,76,0.12)', color: 'var(--danger)' },
  purple: { bg: 'rgba(120,60,180,0.10)', color: '#783cb4' },
  muted: { bg: 'rgba(18,45,69,0.06)', color: 'var(--muted)' },
}
export function Badge({ color = 'blue', children }: { color?: BadgeColor; children: React.ReactNode }) {
  const s = badgeStyles[color]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {children}
    </span>
  )
}

// ── Divider ──────────────────────────────────────────────────────────────────
export function Divider() {
  return <div className="h-px my-4" style={{ background: 'var(--border)' }} />
}

// ── Milestone status badge ───────────────────────────────────────────────────
const MS_COLORS: Record<string, BadgeColor> = {
  Pending: 'muted',
  Delivered: 'blue',
  Released: 'green',
  Disputed: 'red',
  Resolved: 'purple',
  Refunded: 'amber',
}
export function MilestoneBadge({ label }: { label: string }) {
  return <Badge color={MS_COLORS[label] ?? 'muted'}>{label}</Badge>
}

// ── Escrow status badge ──────────────────────────────────────────────────────
const ES_COLORS: Record<string, BadgeColor> = {
  Unfunded: 'amber',
  Active: 'blue',
  Completed: 'green',
  Cancelled: 'muted',
}
export function EscrowBadge({ label }: { label: string }) {
  return <Badge color={ES_COLORS[label] ?? 'muted'}>{label}</Badge>
}

// ── Section heading ──────────────────────────────────────────────────────────
export function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="display text-xl font-700 tracking-tight" style={{ color: 'var(--ink)' }}>
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

// ── Address chip ─────────────────────────────────────────────────────────────
export function Addr({ address }: { address: string }) {
  return (
    <span className="mono text-xs" style={{ color: 'var(--muted)' }}>
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  )
}
