/**
 * /profile and /profile/:address — on-chain reputation view.
 */
import React, { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { MILESTONE_PAY, CHAIN_ID } from '../contract'
import { Card, Button, Input, SectionHead, Addr } from './ui'
import { useRouter } from './Router'

export function Profile({ targetAddress }: { targetAddress?: string }) {
  const { address } = useAccount()
  const { navigate } = useRouter()
  const [lookup, setLookup] = useState('')
  const displayAddress = targetAddress ?? address ?? ''

  const { data: rep } = useReadContract({
    ...MILESTONE_PAY,
    functionName: 'getReputation',
    args: [displayAddress as `0x${string}`],
    chainId: CHAIN_ID,
    query: { enabled: displayAddress.length === 42 },
  }) as { data: [bigint, bigint] | undefined }

  const completed = rep ? Number(rep[0]) : 0
  const disputed = rep ? Number(rep[1]) : 0
  const total = completed + disputed
  const rate = total > 0 ? Math.round((completed / total) * 100) : null

  return (
    <div className="max-w-md mx-auto px-4 py-8 flex flex-col gap-6">
      <SectionHead title="Profile" subtitle="On-chain reputation from completed escrows." />

      {/* Address lookup */}
      <Card className="flex flex-col gap-3">
        <Input
          label="Look up any address"
          placeholder="0x..."
          value={lookup}
          onChange={(e) => setLookup(e.target.value)}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={!lookup.match(/^0x[0-9a-fA-F]{40}$/)}
          onClick={() => navigate(`/profile/${lookup.trim()}`)}
        >
          View Profile
        </Button>
      </Card>

      {displayAddress.length === 42 && (
        <Card className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
              Address
            </p>
            <Addr address={displayAddress} />
            {displayAddress.toLowerCase() === address?.toLowerCase() && (
              <span className="ml-2 text-xs" style={{ color: 'var(--accent-hover)' }}>
                (you)
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Completed" value={completed} color="var(--success)" />
            <StatBox label="Disputed" value={disputed} color="var(--danger)" />
            <StatBox
              label="Success rate"
              value={rate !== null ? `${rate}%` : '—'}
              color="var(--ink)"
            />
          </div>

          {total === 0 && (
            <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
              No on-chain escrow history yet.
            </p>
          )}

          {total > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                Track record
              </p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${rate ?? 0}%`, background: 'var(--success)' }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--muted)' }}>
                <span>{completed} completed</span>
                <span>{disputed} disputed</span>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col items-center gap-1"
      style={{ background: 'var(--surface-muted)' }}
    >
      <span className="display font-700 text-2xl tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-xs font-medium text-center" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
    </div>
  )
}
