import React, { useState, useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { parseUnits, decodeEventLog } from 'viem'
import { toast } from 'sonner'
import { MILESTONE_PAY, CHAIN_ID, USDC, ZERO_ADDRESS } from '../contract'
import { Card, Button, Input, SectionHead, Divider } from './ui'
import { useRouter, Link } from './Router'

interface MilestoneInput {
  description: string
  amount: string
}

const DEFAULT_REVIEW_DAYS = 7
const DEFAULT_DEADLINE_DAYS = 30

export function CreateEscrow() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { navigate } = useRouter()
  const isWrongChain = chainId !== CHAIN_ID

  const [buyer, setBuyer] = useState('')
  const [arbiter, setArbiter] = useState('')
  const [reviewDays, setReviewDays] = useState(String(DEFAULT_REVIEW_DAYS))
  const [deadlineDays, setDeadlineDays] = useState(String(DEFAULT_DEADLINE_DAYS))
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { description: '', amount: '' },
    { description: '', amount: '' },
  ])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  // Derive new escrow ID directly from the receipt — no setState in effect needed.
  const createdId = useMemo<string | null>(() => {
    if (!isSuccess || !receipt) return null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MILESTONE_PAY.abi, ...log })
        if (decoded.eventName === 'EscrowCreated') {
          const args = decoded.args as unknown as { escrowId: bigint }
          return String(args.escrowId)
        }
      } catch {
        // other logs
      }
    }
    return null
  }, [isSuccess, receipt])

  // Fire toast when createdId first appears (toast = external system, not setState).
  React.useEffect(() => {
    if (createdId) toast.success(`Escrow #${createdId} created!`)
  }, [createdId])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!buyer.match(/^0x[0-9a-fA-F]{40}$/)) e.buyer = 'Valid address required'
    if (arbiter && !arbiter.match(/^0x[0-9a-fA-F]{40}$/)) e.arbiter = 'Valid address or leave blank'
    const rd = Number(reviewDays)
    if (!Number.isInteger(rd) || rd < 1 || rd > 365) e.reviewDays = '1–365 days'
    const dd = Number(deadlineDays)
    if (!Number.isInteger(dd) || dd < 1 || dd > 730) e.deadlineDays = '1–730 days'
    milestones.forEach((m, i) => {
      if (!m.description.trim()) e[`desc_${i}`] = 'Required'
      const amt = parseFloat(m.amount)
      if (isNaN(amt) || amt <= 0) e[`amt_${i}`] = 'Must be > 0'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function addMilestone() {
    if (milestones.length >= 20) {
      toast.error('Maximum 20 milestones')
      return
    }
    setMilestones([...milestones, { description: '', amount: '' }])
  }

  function removeMilestone(i: number) {
    if (milestones.length <= 1) return
    setMilestones(milestones.filter((_, idx) => idx !== i))
  }

  function updateMilestone(i: number, key: keyof MilestoneInput, value: string) {
    setMilestones(milestones.map((m, idx) => (idx === i ? { ...m, [key]: value } : m)))
  }

  function totalUsdc() {
    return milestones.reduce((acc, m) => acc + (parseFloat(m.amount) || 0), 0)
  }

  function handleCreate() {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!validate()) return

    const reviewWindowSeconds = BigInt(Math.floor(Number(reviewDays)) * 86400)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86400)
    const descs = milestones.map((m) => m.description.trim())
    const amounts = milestones.map((m) => parseUnits(m.amount, USDC.decimals))
    const arbiterAddr = (arbiter.trim() as `0x${string}`) || ZERO_ADDRESS

    writeContract({
      ...MILESTONE_PAY,
      functionName: 'createEscrow',
      args: [buyer as `0x${string}`, arbiterAddr, reviewWindowSeconds, deadline, descs, amounts],
    })
  }

  function buildPayLink(id: string) {
    return `${window.location.origin}${window.location.pathname}#/pay/${id}`
  }

  function handleCopyLink(id: string) {
    navigator.clipboard.writeText(buildPayLink(id)).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
      () => toast.error('Copy failed — copy the URL manually'),
    )
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (createdId) {
    const link = buildPayLink(createdId)
    return (
      <div className="max-w-lg mx-auto px-4 py-16 flex flex-col items-center gap-6">
        {/* Checkmark */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(26,128,71,0.12)' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="text-center">
          <p className="display font-700 text-xl" style={{ color: 'var(--ink)' }}>
            Escrow #{createdId} created
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Share this link with your client so they can fund the escrow.
          </p>
        </div>

        {/* Pay link box */}
        <Card className="w-full flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            Payment link
          </p>
          <div
            className="rounded-lg px-3 py-2 text-xs font-mono break-all select-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          >
            {link}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="ghost"
              onClick={() => handleCopyLink(createdId)}
            >
              {copied ? '✓ Copied!' : 'Copy link'}
            </Button>
            <a href={`#/pay/${createdId}`} target="_blank" rel="noopener noreferrer" className="flex-1">
              <Button className="w-full">Open payment page</Button>
            </a>
          </div>
        </Card>

        {/* Navigation shortcuts */}
        <div className="flex gap-3 text-sm">
          <button
            onClick={() => navigate(`/escrow/${createdId}`)}
            style={{ color: 'var(--accent-hover)' }}
          >
            View escrow detail →
          </button>
          <span style={{ color: 'var(--border)' }}>|</span>
          <Link href="/" style={{ color: 'var(--muted)' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to create an escrow.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <SectionHead
        title="New Escrow"
        subtitle="You (the freelancer) create the deal — your client funds it."
      />

      <Card className="flex flex-col gap-5">
        <Input
          label="Client wallet address"
          placeholder="0x..."
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
          error={errors.buyer}
        />
        <Input
          label="Arbiter address (optional)"
          placeholder="0x... or leave blank"
          value={arbiter}
          onChange={(e) => setArbiter(e.target.value)}
          helper="A neutral third party who can split disputed milestones."
          error={errors.arbiter}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Review window (days)"
            type="number"
            min="1"
            max="365"
            value={reviewDays}
            onChange={(e) => setReviewDays(e.target.value)}
            helper="Auto-release if client doesn't act"
            error={errors.reviewDays}
          />
          <Input
            label="Deadline (days from now)"
            type="number"
            min="1"
            max="730"
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(e.target.value)}
            error={errors.deadlineDays}
          />
        </div>

        <Divider />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
              Milestones
            </span>
            <Button variant="ghost" size="sm" onClick={addMilestone} disabled={milestones.length >= 20}>
              + Add
            </Button>
          </div>

          {milestones.map((m, i) => (
            <div
              key={i}
              className="rounded-xl p-3 flex flex-col gap-2"
              style={{ background: 'var(--surface-muted)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  #{i + 1}
                </span>
                {milestones.length > 1 && (
                  <button
                    onClick={() => removeMilestone(i)}
                    className="text-xs"
                    style={{ color: 'var(--danger)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <Input
                placeholder="Description"
                value={m.description}
                onChange={(e) => updateMilestone(i, 'description', e.target.value)}
                error={errors[`desc_${i}`]}
              />
              <Input
                placeholder="USDC amount"
                type="number"
                min="0"
                step="0.01"
                value={m.amount}
                onChange={(e) => updateMilestone(i, 'amount', e.target.value)}
                error={errors[`amt_${i}`]}
              />
            </div>
          ))}
        </div>

        <Divider />

        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--muted)' }}>Total</span>
          <span className="display font-600 text-lg" style={{ color: 'var(--ink)' }}>
            {totalUsdc().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
          </span>
        </div>

        <Button
          onClick={handleCreate}
          loading={isPending || isConfirming}
          disabled={isPending || isConfirming || isSuccess}
        >
          {isWrongChain
            ? 'Switch to Arc Mainnet'
            : isPending
            ? 'Confirm in wallet…'
            : isConfirming
            ? 'Creating…'
            : isSuccess
            ? 'Created!'
            : 'Create Escrow'}
        </Button>
      </Card>
    </div>
  )
}
