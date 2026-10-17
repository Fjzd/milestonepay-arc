/**
 * /escrow/:id — detailed view with per-milestone actions.
 */
import React, { useState } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useReadContract,
} from 'wagmi'
import { formatUnits } from 'viem'
import { toast } from 'sonner'
import { MILESTONE_PAY, CHAIN_ID, USDC, ZERO_ADDRESS } from '../contract'
import {
  escrowStatusLabel,
  milestoneStatusLabel,
} from '../contract'
import type { EscrowData, MilestoneData } from '../contract'
import { Card, Button, Input, SectionHead, EscrowBadge, MilestoneBadge, Addr } from './ui'

export function EscrowDetail({ id }: { id: string }) {
  const escrowId = BigInt(id)
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const isWrongChain = chainId !== CHAIN_ID

  const { data: rawEscrow, isLoading, refetch } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getEscrow',
    args: [escrowId],
    chainId: CHAIN_ID,
  }) as { data: EscrowData | undefined; isLoading: boolean; refetch: () => void }

  const { data: claimableBalance, refetch: refetchClaimable } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'claimable',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: CHAIN_ID,
  }) as { data: bigint | undefined; refetch: () => void }

  const [disputeSellerBps, setDisputeSellerBps] = useState<Record<number, string>>({})
  const [arbiterBps, setArbiterBps] = useState<Record<number, string>>({})
  // Captured once at mount — stable for the lifetime of this detail view
  const [now] = useState(() => Math.floor(Date.now() / 1000))

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  React.useEffect(() => {
    if (isSuccess) {
      refetch()
      refetchClaimable()
      toast.success('Transaction confirmed')
    }
  }, [isSuccess, refetch, refetchClaimable])

  function tx(fn: () => void) {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    fn()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading…</span>
      </div>
    )
  }
  if (!rawEscrow) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm" style={{ color: 'var(--danger)' }}>Escrow #{id} not found.</span>
      </div>
    )
  }

  const isSeller = address?.toLowerCase() === rawEscrow.seller.toLowerCase()
  const isBuyer = address?.toLowerCase() === rawEscrow.buyer.toLowerCase()
  const isArbiter = rawEscrow.arbiter !== ZERO_ADDRESS && address?.toLowerCase() === rawEscrow.arbiter.toLowerCase()
  const statusLabel = escrowStatusLabel(rawEscrow.status)
  const hasArbiter = rawEscrow.arbiter !== ZERO_ADDRESS
  const reviewWindow = Number(rawEscrow.reviewWindowSeconds)

  const totalAmount = rawEscrow.milestones.reduce((acc: bigint, m) => acc + m.amount, 0n)

  const payLink = `${window.location.origin}${window.location.pathname}#/pay/${id}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <SectionHead title={`Escrow #${id}`} />
          <div className="flex flex-wrap items-center gap-3 -mt-3">
            <EscrowBadge label={statusLabel} />
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Seller: <Addr address={rawEscrow.seller} />
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Buyer: <Addr address={rawEscrow.buyer} />
            </div>
            {hasArbiter && (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Arbiter: <Addr address={rawEscrow.arbiter} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="display font-700 text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUnits(totalAmount, USDC.decimals)} USDC
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Review window: {Math.floor(reviewWindow / 86400)} days
          </span>
        </div>
      </div>

      {/* Payment link (unfunded) */}
      {rawEscrow.status === 0 && isSeller && (
        <Card>
          <p className="text-sm font-medium mb-2" style={{ color: 'var(--ink-2)' }}>
            Share this payment link with your client:
          </p>
          <div
            className="mono text-xs break-all rounded-lg px-3 py-2 select-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            {payLink}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => { void navigator.clipboard.writeText(payLink).then(() => toast.success('Link copied!')) }}
          >
            Copy Link
          </Button>
        </Card>
      )}

      {/* Claimable balance */}
      {address && (claimableBalance ?? 0n) > 0n && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Claimable Balance
              </p>
              <p className="display font-700 text-xl tabular-nums mt-1" style={{ color: 'var(--success)' }}>
                {formatUnits(claimableBalance!, USDC.decimals)} USDC
              </p>
            </div>
            <Button
              variant="success"
              loading={isPending || isConfirming}
              onClick={() => tx(() => writeContract({ ...MILESTONE_PAY, functionName: 'withdraw', args: [] }))}
            >
              Withdraw
            </Button>
          </div>
        </Card>
      )}

      {/* Cancel unfunded */}
      {rawEscrow.status === 0 && isSeller && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => tx(() => writeContract({ ...MILESTONE_PAY, functionName: 'cancelUnfundedEscrow', args: [escrowId] }))}
          loading={isPending || isConfirming}
        >
          Cancel Escrow
        </Button>
      )}

      {/* Cancel active (no milestones released) */}
      {rawEscrow.status === 1 && isSeller && !rawEscrow.milestones.some((m) => m.status === 2 || m.status === 4) && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => tx(() => writeContract({ ...MILESTONE_PAY, functionName: 'cancelActiveEscrow', args: [escrowId] }))}
          loading={isPending || isConfirming}
        >
          Cancel Escrow (refund all)
        </Button>
      )}

      {/* Milestones */}
      <div className="flex flex-col gap-3">
        <h3 className="display font-600 text-base" style={{ color: 'var(--ink)' }}>
          Milestones
        </h3>
        {rawEscrow.milestones.map((m, i) => (
          <MilestoneCard
            key={i}
            escrowId={escrowId}
            milestoneIndex={i}
            milestone={m}
            isSeller={isSeller}
            isBuyer={isBuyer}
            isArbiter={isArbiter}
            hasArbiter={hasArbiter}
            reviewWindowSeconds={reviewWindow}
            escrowDeadline={Number(rawEscrow.deadline)}
            now={now}
            escrowActive={rawEscrow.status === 1}
            isPending={isPending || isConfirming}
            arbiterBps={arbiterBps[i] ?? ''}
            setArbiterBps={(v) => setArbiterBps((prev) => ({ ...prev, [i]: v }))}
            disputeSellerBps={disputeSellerBps[i] ?? ''}
            setDisputeSellerBps={(v) => setDisputeSellerBps((prev) => ({ ...prev, [i]: v }))}
            writeContract={writeContract}
            isWrongChain={isWrongChain}
            switchChain={() => switchChain({ chainId: CHAIN_ID })}
          />
        ))}
      </div>
    </div>
  )
}

// ── Per-milestone card ────────────────────────────────────────────────────────
function MilestoneCard({
  escrowId,
  milestoneIndex,
  milestone,
  isSeller,
  isBuyer,
  isArbiter,
  hasArbiter,
  reviewWindowSeconds,
  escrowDeadline,
  now,
  escrowActive,
  isPending,
  arbiterBps,
  setArbiterBps,
  disputeSellerBps,
  setDisputeSellerBps,
  writeContract,
  isWrongChain,
  switchChain,
}: {
  escrowId: bigint
  milestoneIndex: number
  milestone: MilestoneData
  isSeller: boolean
  isBuyer: boolean
  isArbiter: boolean
  hasArbiter: boolean
  reviewWindowSeconds: number
  escrowDeadline: number
  now: number
  escrowActive: boolean
  isPending: boolean
  arbiterBps: string
  setArbiterBps: (v: string) => void
  disputeSellerBps: string
  setDisputeSellerBps: (v: string) => void
  writeContract: ReturnType<typeof useWriteContract>['writeContract']
  isWrongChain: boolean
  switchChain: () => void
}) {
  const idx = BigInt(milestoneIndex)
  const statusLabel = milestoneStatusLabel(milestone.status)
  const amt = formatUnits(milestone.amount, USDC.decimals)

  // Auto-release available?
  const autoReleasePassed = milestone.status === 1 && now > Number(milestone.deliveredAt) + reviewWindowSeconds
  // Dispute window open?
  const disputeOpen = milestone.status === 1 && now <= Number(milestone.deliveredAt) + reviewWindowSeconds
  // Dispute timeout
  const disputeTimeoutPassed = milestone.status === 3 && now >= Number(milestone.disputedAt) + reviewWindowSeconds * 4
  // Refund conditions
  const canRefundPending = isBuyer && milestone.status === 0 && escrowActive
  const canRefundDelivered = isBuyer && milestone.status === 1 && escrowActive && now > escrowDeadline

  function act(fn: () => void) {
    if (isWrongChain) { switchChain(); return }
    fn()
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {milestoneIndex + 1}. {milestone.description || `Milestone ${milestoneIndex + 1}`}
          </p>
          <p className="display font-600 text-lg tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>
            {amt} USDC
          </p>
        </div>
        <MilestoneBadge label={statusLabel} />
      </div>

      {milestone.status === 1 && (
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          Delivered · review window closes {new Date((Number(milestone.deliveredAt) + reviewWindowSeconds) * 1000).toLocaleDateString()}
        </p>
      )}

      {milestone.status === 3 && !hasArbiter && (
        <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
          Disputed · timeout at {new Date((Number(milestone.disputedAt) + reviewWindowSeconds * 4) * 1000).toLocaleDateString()}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Seller: deliver */}
        {isSeller && milestone.status === 0 && escrowActive && (
          <Button
            size="sm"
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'deliverMilestone', args: [escrowId, idx] }))}
          >
            Mark Delivered
          </Button>
        )}

        {/* Buyer: approve */}
        {isBuyer && milestone.status === 1 && escrowActive && (
          <Button
            size="sm"
            variant="success"
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'approveMilestone', args: [escrowId, idx] }))}
          >
            Approve
          </Button>
        )}

        {/* Buyer: dispute (within window) */}
        {isBuyer && disputeOpen && escrowActive && (
          <Button
            size="sm"
            variant="danger"
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'disputeMilestone', args: [escrowId, idx] }))}
          >
            Dispute
          </Button>
        )}

        {/* Seller: auto-release */}
        {isSeller && autoReleasePassed && escrowActive && (
          <Button
            size="sm"
            variant="success"
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'claimAutoRelease', args: [escrowId, idx] }))}
          >
            Auto-release
          </Button>
        )}

        {/* Arbiter: resolve with bps input */}
        {isArbiter && milestone.status === 3 && escrowActive && (
          <div className="flex items-center gap-2 w-full mt-1">
            <Input
              placeholder="Seller % (0–100)"
              type="number"
              min="0"
              max="100"
              value={arbiterBps}
              onChange={(e) => setArbiterBps(e.target.value)}
              className="w-32"
            />
            <Button
              size="sm"
              loading={isPending}
              onClick={() => {
                const bps = Math.round(parseFloat(arbiterBps) * 100)
                if (isNaN(bps) || bps < 0 || bps > 10000) { toast.error('Enter 0–100'); return }
                act(() => writeContract({ ...MILESTONE_PAY, functionName: 'resolveDispute', args: [escrowId, idx, BigInt(bps)] }))
              }}
            >
              Resolve
            </Button>
          </div>
        )}

        {/* Buyer: propose mutual resolution (no arbiter) */}
        {isBuyer && !hasArbiter && milestone.status === 3 && escrowActive && !milestone.mutualProposed && (
          <div className="flex items-center gap-2 w-full mt-1">
            <Input
              placeholder="Seller % (0–100)"
              type="number"
              min="0"
              max="100"
              value={disputeSellerBps}
              onChange={(e) => setDisputeSellerBps(e.target.value)}
              className="w-32"
            />
            <Button
              size="sm"
              variant="ghost"
              loading={isPending}
              onClick={() => {
                const bps = Math.round(parseFloat(disputeSellerBps) * 100)
                if (isNaN(bps) || bps < 0 || bps > 10000) { toast.error('Enter 0–100'); return }
                act(() => writeContract({ ...MILESTONE_PAY, functionName: 'proposeMutualResolution', args: [escrowId, idx, BigInt(bps)] }))
              }}
            >
              Propose split
            </Button>
          </div>
        )}

        {/* Buyer: proposed, waiting for seller */}
        {isBuyer && !hasArbiter && milestone.mutualProposed && milestone.status === 3 && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Split proposed ({Number(milestone.mutualSellerBps) / 100}% seller) — waiting for freelancer
          </p>
        )}

        {/* Seller: accept mutual resolution */}
        {isSeller && !hasArbiter && milestone.mutualProposed && milestone.status === 3 && escrowActive && (
          <Button
            size="sm"
            variant="success"
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'acceptMutualResolution', args: [escrowId, idx] }))}
          >
            Accept split ({Number(milestone.mutualSellerBps) / 100}% to you)
          </Button>
        )}

        {/* Either party: timeout claim */}
        {(isSeller || isBuyer) && !hasArbiter && disputeTimeoutPassed && escrowActive && (
          <Button
            size="sm"
            variant={isSeller ? 'success' : 'danger'}
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'resolveDisputeTimeout', args: [escrowId, idx] }))}
          >
            {isSeller ? 'Claim (timeout, seller wins)' : 'Claim (timeout, buyer wins)'}
          </Button>
        )}

        {/* Buyer: refund */}
        {(canRefundPending || canRefundDelivered) && (
          <Button
            size="sm"
            variant="danger"
            loading={isPending}
            onClick={() => act(() => writeContract({ ...MILESTONE_PAY, functionName: 'refundMilestone', args: [escrowId, idx] }))}
          >
            Refund
          </Button>
        )}
      </div>
    </Card>
  )
}
