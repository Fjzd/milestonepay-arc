/**
 * /pay/:id — shareable page for a client to fund an unfunded escrow.
 */
import React, { useEffect, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { MILESTONE_PAY, CHAIN_ID, USDC, ZERO_ADDRESS } from '../contract'
import { escrowStatusLabel } from '../contract'
import type { EscrowData } from '../contract'
import { Card, Button, SectionHead, EscrowBadge, Addr, Divider } from './ui'
import { useRouter } from './Router'
import { CrossChainPay } from './CrossChainPay'

export function PayLink({ id }: { id: string }) {
  const escrowId = BigInt(id)
  const [payTab, setPayTab] = useState<'arc' | 'crosschain'>('arc')
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { navigate } = useRouter()
  const isWrongChain = chainId !== CHAIN_ID

  const { data: rawEscrow, isLoading } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getEscrow',
    args: [escrowId],
    chainId: CHAIN_ID,
  }) as { data: EscrowData | undefined; isLoading: boolean }

  const totalAmount = rawEscrow
    ? rawEscrow.milestones.reduce((acc: bigint, m) => acc + m.amount, 0n)
    : 0n

  // USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', MILESTONE_PAY.address],
    chainId: CHAIN_ID,
  })

  const needsApproval = (allowance ?? 0n) < totalAmount

  // Approve
  const { writeContract: approve, data: approveHash, isPending: isApprovePending } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  useEffect(() => {
    if (isApproveSuccess) { void refetchAllowance(); toast.success('Approval confirmed') }
  }, [isApproveSuccess, refetchAllowance])

  // Fund
  const { writeContract: fund, data: fundHash, isPending: isFundPending } = useWriteContract()
  const { isLoading: isFundConfirming, isSuccess: isFundSuccess } = useWaitForTransactionReceipt({ hash: fundHash })

  useEffect(() => {
    if (isFundSuccess) {
      toast.success('Escrow funded!')
      navigate(`/escrow/${id}`)
    }
  }, [isFundSuccess, id, navigate])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading escrow…</span>
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

  const statusLabel = escrowStatusLabel(rawEscrow.status)
  const isUnfunded = rawEscrow.status === 0
  const isBuyer = address?.toLowerCase() === rawEscrow.buyer.toLowerCase()

  function handleApprove() {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    approve({
      address: USDC.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [MILESTONE_PAY.address, totalAmount],
    })
  }

  function handleFund() {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    fund({ ...MILESTONE_PAY, functionName: 'fundEscrow', args: [escrowId] })
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <SectionHead
        title={`Fund Escrow #${id}`}
        subtitle="Review the milestones below and send USDC to get started."
      />

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              Freelancer
            </span>
            <div className="mt-0.5">
              <Addr address={rawEscrow.seller} />
            </div>
          </div>
          <EscrowBadge label={statusLabel} />
        </div>

        {rawEscrow.arbiter !== ZERO_ADDRESS && (
          <div>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              Arbiter
            </span>
            <div className="mt-0.5">
              <Addr address={rawEscrow.arbiter} />
            </div>
          </div>
        )}

        <Divider />

        <div className="flex flex-col gap-2">
          {rawEscrow.milestones.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="flex-1 truncate pr-2" style={{ color: 'var(--ink-2)' }}>
                {i + 1}. {m.description || `Milestone ${i + 1}`}
              </span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                {formatUnits(m.amount, USDC.decimals)} USDC
              </span>
            </div>
          ))}
        </div>

        <Divider />

        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Total to lock</span>
          <span className="display font-700 text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUnits(totalAmount, USDC.decimals)} USDC
          </span>
        </div>

        {!address && (
          <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
            Connect your wallet to fund.
          </p>
        )}

        {address && !isUnfunded && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            This escrow is already <strong>{statusLabel}</strong>.{' '}
            <a
              href={`#/escrow/${id}`}
              style={{ color: 'var(--accent-hover)' }}
            >
              View details
            </a>
          </p>
        )}

        {address && isUnfunded && !isBuyer && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            Only the designated client (<Addr address={rawEscrow.buyer} />) can fund this escrow.
          </p>
        )}

        {address && isUnfunded && isBuyer && (
          <div className="flex flex-col gap-3">
            {/* ── Payment method tabs ── */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {(['arc', 'crosschain'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPayTab(tab)}
                  className="flex-1 py-2 text-xs font-semibold transition-colors"
                  style={{
                    background: payTab === tab ? 'var(--accent)' : 'transparent',
                    color: payTab === tab ? '#fff' : 'var(--muted)',
                  }}
                >
                  {tab === 'arc' ? 'Pay on Arc' : 'Pay from Base / ETH / Arb'}
                </button>
              ))}
            </div>

            {/* ── Arc direct payment ── */}
            {payTab === 'arc' && (
              <>
                {needsApproval ? (
                  <Button
                    onClick={handleApprove}
                    loading={isApprovePending || isApproveConfirming}
                    variant="ghost"
                  >
                    {isWrongChain ? 'Switch to Arc' : isApprovePending ? 'Confirm approval…' : isApproveConfirming ? 'Approving…' : `Approve ${formatUnits(totalAmount, USDC.decimals)} USDC`}
                  </Button>
                ) : null}
                <Button
                  onClick={handleFund}
                  loading={isFundPending || isFundConfirming}
                  disabled={needsApproval || isFundPending || isFundConfirming}
                >
                  {isWrongChain
                    ? 'Switch to Arc'
                    : isFundPending
                    ? 'Confirm in wallet…'
                    : isFundConfirming
                    ? 'Funding…'
                    : `Fund ${formatUnits(totalAmount, USDC.decimals)} USDC`}
                </Button>
              </>
            )}

            {/* ── Cross-chain payment (CCTP V2) ── */}
            {payTab === 'crosschain' && (
              <CrossChainPay
                escrowId={escrowId}
                totalAmount={totalAmount}
                onSuccess={() => navigate(`/escrow/${id}`)}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
