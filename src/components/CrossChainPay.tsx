/**
 * CrossChainPay — CCTP V2 "pay from another chain" flow.
 *
 * Single async runner holds all state transitions. No useCallback chains,
 * no setState in effects — all state mutation happens inside the runner ref.
 *
 * Steps:
 *   1. Buyer picks source chain (Base / Ethereum / Arbitrum)
 *   2. Switch wallet to source chain; show source USDC balance
 *   3. Fetch Iris fees, compute burnAmount + maxFee
 *   4. Approve TokenMessengerV2 to spend burnAmount
 *   5. depositForBurnWithHook → burn USDC on source chain
 *   6. Poll Iris /v2/messages until status = "complete"
 *      (Circle Forwarding Service submits the mint on Arc — buyer needs no Arc gas)
 *   7. Switch wallet to Arc, approve + fundEscrow(id)
 */

import React, { useState, useRef } from 'react'
import {
  useAccount,
  useSwitchChain,
  useReadContract,
  usePublicClient,
} from 'wagmi'
import { erc20Abi, formatUnits, type WalletClient } from 'viem'
import { ExternalLink, CheckCircle, Clock, AlertTriangle, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Card, Button, Badge, Divider } from './ui'
import {
  SRC_CHAIN_KEYS,
  SRC_CHAINS_MAINNET,
  SRC_CHAINS_TESTNET,
  ARC_MAINNET_CCTP,
  ARC_TESTNET_CCTP,
  FORWARDING_HOOK_DATA,
  TOKEN_MESSENGER_V2_ABI,
  MIN_FINALITY_FAST,
  DESTINATION_CALLER_ANY,
  fetchCctpFees,
  computeBurnParams,
  addressToBytes32,
  pollIrisUntilComplete,
} from '../cctp'
import type { SrcChainKey, SrcChainConfig } from '../cctp'
import { CHAIN_ID, MILESTONE_PAY, USDC } from '../contract'
import { useWalletClient } from 'wagmi'

// ─── Types ────────────────────────────────────────────────────────────────────

type BridgePhase =
  | 'idle'
  | 'running'   // async runner is active
  | 'polling'   // waiting for Iris
  | 'minted'    // mint confirmed, waiting to fund
  | 'done'
  | 'error'

interface DisplayState {
  phase: BridgePhase
  stepLabel: string
  irisStatus?: string
  approveTxHash?: string
  burnTxHash?: string
  mintTxHash?: string
  fundTxHash?: string
  errorMsg?: string
  standardFallback?: boolean
  srcExplorerBase?: string
  arcExplorerBase?: string
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

const STEPS = ['Burn on source', 'Attested', 'Minted on Arc', 'Fund escrow'] as const

function stepIndex(label: string): number {
  if (label.startsWith('Burn') || label.startsWith('Approv') || label.startsWith('Fetch')) return 0
  if (label.startsWith('Waiting') || label.startsWith('Pollin') || label.startsWith('Iris')) return 1
  if (label.startsWith('Minted') || label.startsWith('Switch') || label.startsWith('Fund escrow')) return 3
  return 2
}

function StepBar({ phase, stepLabel, irisStatus }: { phase: BridgePhase; stepLabel: string; irisStatus?: string }) {
  const active = phase === 'done' ? 4 : stepIndex(stepLabel)
  return (
    <div className="flex items-center gap-1 mt-2">
      {STEPS.map((s, i) => {
        const done = active > i || phase === 'done'
        const current = active === i && phase !== 'idle'
        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1 flex-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done ? 'var(--success)' : current ? 'var(--accent)' : 'var(--surface)',
                  color: done || current ? '#fff' : 'var(--muted)',
                  border: `2px solid ${done ? 'var(--success)' : current ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {done ? <CheckCircle size={12} /> : i + 1}
              </div>
              <span className="text-xs text-center leading-tight" style={{ color: done ? 'var(--success)' : current ? 'var(--ink-1)' : 'var(--muted)' }}>
                {s}
                {i === 1 && irisStatus && current && (
                  <span className="block" style={{ color: 'var(--muted)' }}>{irisStatus}</span>
                )}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-px flex-1 mb-5" style={{ background: done ? 'var(--success)' : 'var(--border)' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CrossChainPayProps {
  escrowId: bigint
  totalAmount: bigint   // 6-decimal USDC
  onSuccess: () => void
}

export function CrossChainPay({ escrowId, totalAmount, onSuccess }: CrossChainPayProps) {
  const isMainnet = CHAIN_ID === 5042
  const srcChainsMap = isMainnet ? SRC_CHAINS_MAINNET : SRC_CHAINS_TESTNET
  const arcCctp = isMainnet ? ARC_MAINNET_CCTP : ARC_TESTNET_CCTP

  const [selectedKey, setSelectedKey] = useState<SrcChainKey>('Base')
  const [dropOpen, setDropOpen] = useState(false)
  const [display, setDisplay] = useState<DisplayState>({ phase: 'idle', stepLabel: '' })

  const src: SrcChainConfig = srcChainsMap[selectedKey]

  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { data: walletClientData } = useWalletClient()
  const walletClient = walletClientData as WalletClient | undefined

  // Public client for the source chain (to wait for receipts)
  const srcPublicClient = usePublicClient({ chainId: src.chainId })
  const arcPublicClient = usePublicClient({ chainId: CHAIN_ID })

  // Source USDC balance
  const { data: srcBalance } = useReadContract({
    address: src.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: src.chainId,
  })

  // ── Async step runner (no hooks inside) ───────────────────────────────────
  const runningRef = useRef(false)

  async function run() {
    if (runningRef.current || !address || !walletClient || !srcPublicClient || !arcPublicClient) return
    runningRef.current = true

    function upd(patch: Partial<DisplayState>) {
      setDisplay((prev) => ({ ...prev, ...patch }))
    }

    try {
      // 1. Fetch Iris fees
      upd({ phase: 'running', stepLabel: 'Fetching fees…' })
      const { fastFee, forwardingFee } = await fetchCctpFees(arcCctp.irisApi, src.domain, totalAmount)
      const { burnAmount, maxFee } = computeBurnParams(totalAmount, fastFee, forwardingFee)

      // 2. Check source balance
      if ((srcBalance ?? 0n) < burnAmount) {
        const needed = formatUnits(burnAmount, 6)
        const have = formatUnits(srcBalance ?? 0n, 6)
        upd({ phase: 'error', errorMsg: `Insufficient ${src.label} USDC. Need ${needed} USDC, have ${have} USDC (includes fees + 0.02 buffer).` })
        return
      }

      // 3. Switch to source chain
      if (chainId !== src.chainId) {
        upd({ stepLabel: `Switching to ${src.label}…` })
        await switchChainAsync({ chainId: src.chainId })
      }

      // 4. Check / set allowance
      const tokenAddr = src.usdc
      const messengerAddr = src.tokenMessengerV2

      upd({ stepLabel: `Checking ${src.label} USDC allowance…` })
      const allowanceResult = await srcPublicClient.readContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, messengerAddr],
      })

      if ((allowanceResult) < burnAmount) {
        upd({ stepLabel: `Approving USDC on ${src.label}…` })
        const approveHash = await walletClient.writeContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'approve',
          args: [messengerAddr, burnAmount],
          account: address,
          chain: null,
        })
        upd({ approveTxHash: approveHash, srcExplorerBase: src.explorerBase, stepLabel: 'Waiting for approval…' })
        await srcPublicClient.waitForTransactionReceipt({ hash: approveHash })
        toast.success('Approval confirmed')
      }

      // 5. Burn (depositForBurnWithHook)
      upd({ stepLabel: `Burning USDC on ${src.label}…` })
      const mintRecipient = addressToBytes32(address)

      let burnHash: `0x${string}`
      let usedStandard = false
      try {
        burnHash = await walletClient.writeContract({
          address: messengerAddr,
          abi: TOKEN_MESSENGER_V2_ABI,
          functionName: 'depositForBurnWithHook',
          args: [burnAmount, 26, mintRecipient, tokenAddr, DESTINATION_CALLER_ANY, maxFee, MIN_FINALITY_FAST, FORWARDING_HOOK_DATA],
          account: address,
          chain: null,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.toLowerCase().includes('fast allowance')) {
          toast.warning('Fast transfer allowance exhausted — using standard mode (~15-19 min)')
          usedStandard = true
          upd({ standardFallback: true })
          burnHash = await walletClient.writeContract({
            address: messengerAddr,
            abi: TOKEN_MESSENGER_V2_ABI,
            functionName: 'depositForBurnWithHook',
            args: [burnAmount, 26, mintRecipient, tokenAddr, DESTINATION_CALLER_ANY, 0n, 0, FORWARDING_HOOK_DATA],
            account: address,
            chain: null,
          })
        } else {
          throw e
        }
      }

      upd({ burnTxHash: burnHash, srcExplorerBase: src.explorerBase, arcExplorerBase: arcCctp.explorerBase, stepLabel: 'Waiting for burn confirmation…' })
      await srcPublicClient.waitForTransactionReceipt({ hash: burnHash })

      // 6. Poll Iris
      upd({ phase: 'polling', stepLabel: 'Waiting for Circle attestation…' })
      const mintTxHash = await pollIrisUntilComplete(
        arcCctp.irisApi,
        src.domain,
        burnHash,
        (status) => upd({ irisStatus: status, stepLabel: usedStandard ? `Iris: ${status} (standard, ~15-19 min)` : `Iris: ${status}` }),
      )
      upd({ mintTxHash, stepLabel: 'Minted on Arc!' })
      toast.success('USDC minted on Arc! Switching to fund escrow…')

      // 7. Switch to Arc
      upd({ phase: 'running', stepLabel: 'Switching to Arc…' })
      if (chainId !== CHAIN_ID) {
        await switchChainAsync({ chainId: CHAIN_ID })
      }

      // 8. Check/set Arc USDC allowance
      upd({ stepLabel: 'Checking Arc USDC allowance…' })
      const arcAllowance = await arcPublicClient.readContract({
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, MILESTONE_PAY.address],
      })

      if ((arcAllowance) < totalAmount) {
        upd({ stepLabel: 'Approving USDC on Arc…' })
        const arcApproveHash = await walletClient.writeContract({
          address: USDC.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [MILESTONE_PAY.address, totalAmount],
          account: address,
          chain: null,
        })
        upd({ approveTxHash: arcApproveHash, stepLabel: 'Waiting for Arc approval…' })
        await arcPublicClient.waitForTransactionReceipt({ hash: arcApproveHash })
        toast.success('Arc approval confirmed')
      }

      // 9. Fund escrow
      upd({ stepLabel: 'Fund escrow' })
      const fundHash = await walletClient.writeContract({
        ...MILESTONE_PAY,
        functionName: 'fundEscrow',
        args: [escrowId],
        account: address,
        chain: null,
      })
      upd({ fundTxHash: fundHash, stepLabel: 'Waiting for fund confirmation…' })
      await arcPublicClient.waitForTransactionReceipt({ hash: fundHash })

      upd({ phase: 'done', stepLabel: 'Done!' })
      toast.success('Escrow funded via cross-chain payment!')
      onSuccess()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled') || msg.includes('User rejected')) {
        upd({ phase: 'idle', stepLabel: '' })
      } else {
        upd({ phase: 'error', errorMsg: msg.slice(0, 400) })
      }
    } finally {
      runningRef.current = false
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const { phase, stepLabel, irisStatus, burnTxHash, mintTxHash, fundTxHash, errorMsg, standardFallback, srcExplorerBase, arcExplorerBase } = display

  const isActive = phase === 'running' || phase === 'polling'
  const showProgress = isActive || phase === 'minted' || phase === 'done'

  function txUrl(hash: string, explorerBase: string) { return `${explorerBase}/tx/${hash}` }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <Divider />
      <div className="flex items-center gap-2">
        <Badge color="purple">Cross-chain</Badge>
        <span className="text-sm font-semibold" style={{ color: 'var(--ink-1)' }}>Pay from another chain via CCTP V2</span>
      </div>

      {/* Chain selector + launch button */}
      {!isActive && phase !== 'done' && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <button
              onClick={() => setDropOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink-1)' }}
            >
              <span>Pay from {src.label}</span>
              <ChevronDown size={16} style={{ color: 'var(--muted)' }} />
            </button>
            {dropOpen && (
              <div
                className="absolute z-20 w-full mt-1 rounded-xl overflow-hidden shadow-xl"
                style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
              >
                {SRC_CHAIN_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => { setSelectedKey(k); setDropOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:opacity-80"
                    style={{ background: k === selectedKey ? 'var(--surface-muted)' : 'transparent', color: 'var(--ink-1)' }}
                  >
                    {srcChainsMap[k].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {address && (
            <div className="flex items-center justify-between text-sm px-1">
              <span style={{ color: 'var(--muted)' }}>{src.label} USDC balance</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-1)' }}>
                {srcBalance !== undefined ? formatUnits(srcBalance, 6) : '—'} USDC
              </span>
            </div>
          )}

          <p className="text-xs px-1" style={{ color: 'var(--muted)' }}>
            Fees: ~0.01–0.05 USDC fast transfer + 0.02 USDC buffer.
            Arc gas not needed — Circle Forwarding Service mints on your behalf.
            {standardFallback && (
              <span className="block mt-0.5" style={{ color: 'var(--warning, #d97706)' }}>
                Fast allowance exhausted — standard mode (~15-19 min).
              </span>
            )}
          </p>

          {!address ? (
            <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to pay cross-chain.</p>
          ) : (
            <Button onClick={() => void run()}>
              Pay {formatUnits(totalAmount, USDC.decimals)} USDC from {src.label}
            </Button>
          )}
        </div>
      )}

      {/* Progress card */}
      {showProgress && (
        <Card>
          <StepBar phase={phase} stepLabel={stepLabel} irisStatus={irisStatus} />

          {/* Current step label */}
          {(isActive) && (
            <div className="flex items-center gap-2 mt-3">
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>{stepLabel}</span>
            </div>
          )}

          {/* Polling */}
          {phase === 'polling' && (
            <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
              <Clock size={12} />
              {standardFallback ? 'Standard mode — ~15-19 minutes' : 'Fast mode — typically complete in 8-20 seconds'}
            </div>
          )}

          {/* Tx links */}
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            {burnTxHash && srcExplorerBase && (
              <a href={txUrl(burnTxHash, srcExplorerBase)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={12} /> Burn tx on {src.label}
              </a>
            )}
            {mintTxHash && mintTxHash !== '' && arcExplorerBase && (
              <a href={txUrl(mintTxHash, arcExplorerBase)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={12} /> Mint tx on Arc
              </a>
            )}
            {fundTxHash && arcExplorerBase && (
              <a href={txUrl(fundTxHash, arcExplorerBase)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <ExternalLink size={12} /> Fund escrow tx on Arc
              </a>
            )}
          </div>

          {/* Done */}
          {phase === 'done' && (
            <div className="flex items-center gap-2 mt-3">
              <CheckCircle size={16} style={{ color: 'var(--success)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Escrow funded!</span>
            </div>
          )}
        </Card>
      )}

      {/* Error */}
      {phase === 'error' && errorMsg && (
        <Card>
          <div className="flex gap-3 items-start">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Cross-chain payment failed</p>
              <p className="text-xs mt-1 font-mono break-all" style={{ color: 'var(--ink-2)' }}>{errorMsg}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDisplay({ phase: 'idle', stepLabel: '' })}>
                Try again
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
