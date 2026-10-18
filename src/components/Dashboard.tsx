/**
 * / — list of escrows for the connected wallet.
 */
import React from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { MILESTONE_PAY, CHAIN_ID, USDC } from '../contract'
import { escrowStatusLabel } from '../contract'
import type { EscrowData } from '../contract'
import { Card, Button, SectionHead, EscrowBadge, Addr, Divider } from './ui'
import { Link } from './Router'
import { toast } from 'sonner'

// ─── helpers ──────────────────────────────────────────────────────────────────

function payLink(id: string): string {
  return `${window.location.origin}${window.location.pathname}#/pay/${id}`
}

function copyPayLink(id: string) {
  navigator.clipboard.writeText(payLink(id)).then(
    () => toast.success('Pay link copied!'),
    () => toast.error('Could not copy — try manually'),
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function Dashboard() {
  const { address } = useAccount()

  const { data: sellerIds } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getSellerEscrows',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint[] | undefined }

  const { data: buyerIds } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getBuyerEscrows',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint[] | undefined }

  if (!address) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <p className="display font-700 text-2xl text-center" style={{ color: 'var(--ink)' }}>
          Connect your wallet to view escrows
        </p>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
          MilestonePay lets freelancers create escrows with per-milestone USDC releases.
        </p>
      </div>
    )
  }

  const sellerIdStrs = (sellerIds ?? []).map(String)
  const buyerIdStrs = (buyerIds ?? []).map(String)
  const allIds = [...new Set([...sellerIdStrs, ...buyerIdStrs])].sort(
    (a, b) => Number(BigInt(b) - BigInt(a)),
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
      {/* Awaiting payment — buyer rows (unfunded, I am buyer) */}
      {buyerIdStrs.length > 0 && (
        <AwaitingPaymentSection buyerIds={buyerIdStrs} address={address} />
      )}

      {/* Share pay link — seller rows (unfunded, I am seller) */}
      {sellerIdStrs.length > 0 && (
        <SharePayLinkSection sellerIds={sellerIdStrs} address={address} />
      )}

      {/* All escrows */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionHead title="My Escrows" />
          <Link href="/create">
            <Button size="sm">+ New Escrow</Button>
          </Link>
        </div>

        {allIds.length === 0 ? (
          <Card className="text-center py-10">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No escrows yet.{' '}
              <Link href="/create" style={{ color: 'var(--accent-hover)' }}>
                Create one
              </Link>{' '}
              to get started.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {allIds.map((id) => (
              <EscrowRow key={id} id={id} address={address} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── "Awaiting your payment" section ─────────────────────────────────────────

function AwaitingPaymentSection({ buyerIds, address }: { buyerIds: string[]; address: string }) {
  return (
    <PendingSection
      title="Awaiting your payment"
      subtitle="You are the client — these escrows need funding before work can begin."
      ids={buyerIds}
      address={address}
      role="buyer"
    />
  )
}

// ─── "Share pay link" section ─────────────────────────────────────────────────

function SharePayLinkSection({ sellerIds, address }: { sellerIds: string[]; address: string }) {
  return (
    <PendingSection
      title="Share pay link"
      subtitle="You are the freelancer — share a link so your client can fund these."
      ids={sellerIds}
      address={address}
      role="seller"
    />
  )
}

// ─── generic pending section (renders only unfunded rows) ────────────────────

function PendingSection({
  title,
  subtitle,
  ids,
  address,
  role,
}: {
  title: string
  subtitle: string
  ids: string[]
  address: string
  role: 'buyer' | 'seller'
}) {
  // We render all IDs but each PendingRow hides itself if not unfunded.
  // We need at least one visible row — track via a sibling pattern using a
  // container that shows an empty state only when all rows are hidden.
  return (
    <div>
      <div className="mb-3">
        <h2 className="display font-600 text-base" style={{ color: 'var(--ink)' }}>{title}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>
      </div>
      <div className="flex flex-col gap-2">
        {ids.map((id) => (
          <PendingRow key={id} id={id} address={address} role={role} />
        ))}
      </div>
    </div>
  )
}

// ─── pending row — hides itself if escrow is already funded ──────────────────

function PendingRow({
  id,
  address,
  role,
}: {
  id: string
  address: string
  role: 'buyer' | 'seller'
}) {
  const { data: rawEscrow } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getEscrow',
    args: [BigInt(id)],
    chainId: CHAIN_ID,
  }) as { data: EscrowData | undefined }

  // Only show while loading or when status === 0 (Unfunded/Created)
  if (!rawEscrow) {
    return (
      <Card>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Loading…</p>
      </Card>
    )
  }

  // status 0 = Unfunded
  if (rawEscrow.status !== 0) return null

  // Verify the connected address matches the expected role
  const isBuyer = address.toLowerCase() === rawEscrow.buyer.toLowerCase()
  const isSeller = address.toLowerCase() === rawEscrow.seller.toLowerCase()
  if (role === 'buyer' && !isBuyer) return null
  if (role === 'seller' && !isSeller) return null

  const total = rawEscrow.milestones.reduce((acc: bigint, m) => acc + m.amount, 0n)
  const counterpartyLabel = role === 'buyer' ? 'Freelancer' : 'Client'
  const counterpartyAddr = role === 'buyer' ? rawEscrow.seller : rawEscrow.buyer

  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="display font-600 text-sm" style={{ color: 'var(--ink)' }}>
            Escrow #{id}
          </span>
          <EscrowBadge label="Unfunded" />
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
          {counterpartyLabel}: <Addr address={counterpartyAddr} />
        </div>
        <div className="text-xs tabular-nums font-medium" style={{ color: 'var(--ink)' }}>
          {formatUnits(total, USDC.decimals)} USDC total
        </div>
      </div>

      <div className="shrink-0">
        {role === 'buyer' ? (
          <Link href={`/pay/${id}`}>
            <Button size="sm">Pay now</Button>
          </Link>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              copyPayLink(id)
            }}
          >
            Copy pay link
          </Button>
        )}
      </div>
    </Card>
  )
}

// ─── full escrow row (all escrows list) ───────────────────────────────────────

function EscrowRow({ id, address }: { id: string; address: string }) {
  const { data: rawEscrow } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getEscrow',
    args: [BigInt(id)],
    chainId: CHAIN_ID,
  }) as { data: EscrowData | undefined }

  if (!rawEscrow) {
    return (
      <Card>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</p>
      </Card>
    )
  }

  const total = rawEscrow.milestones.reduce((acc: bigint, m) => acc + m.amount, 0n)
  const released = rawEscrow.milestones
    .filter((m) => m.status === 2 || m.status === 4)
    .reduce((acc: bigint, m) => acc + m.amount, 0n)
  const isSeller = address.toLowerCase() === rawEscrow.seller.toLowerCase()
  const role = isSeller ? 'Freelancer' : 'Client'

  return (
    <Link href={`/escrow/${id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="display font-600 text-base" style={{ color: 'var(--ink)' }}>
                Escrow #{id}
              </span>
              <EscrowBadge label={escrowStatusLabel(rawEscrow.status)} />
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
              >
                {role}
              </span>
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
              {isSeller ? 'Client: ' : 'Freelancer: '}
              <Addr address={isSeller ? rawEscrow.buyer : rawEscrow.seller} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="display font-700 text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
              {formatUnits(total, USDC.decimals)} USDC
            </p>
            <p className="text-xs tabular-nums" style={{ color: 'var(--success)' }}>
              {formatUnits(released, USDC.decimals)} released
            </p>
          </div>
        </div>
        <Divider />
        <div className="flex gap-1.5 flex-wrap">
          {rawEscrow.milestones.map((m, i) => {
            const bg = [
              'var(--surface-muted)',
              'rgba(16,97,166,0.10)',
              'rgba(26,128,71,0.10)',
              'rgba(186,43,76,0.12)',
              'rgba(120,60,180,0.10)',
              'rgba(180,120,10,0.10)',
            ]
            const cl = ['var(--muted)', '#1061a6', 'var(--success)', 'var(--danger)', '#783cb4', '#b4780a']
            return (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: bg[m.status] ?? bg[0], color: cl[m.status] ?? cl[0] }}
              >
                M{i + 1}
              </span>
            )
          })}
        </div>
      </Card>
    </Link>
  )
}
