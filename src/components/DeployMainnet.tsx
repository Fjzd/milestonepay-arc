/**
 * DeployMainnet — lets the connected injected wallet deploy MilestonePay
 * to Arc Mainnet (chain ID 5042) using the compiled bytecode from the
 * local Foundry artifact. No private key is ever read or stored.
 *
 * Flow:
 *   1. Connect wallet (ConnectKitButton)
 *   2. Prompt to switch to Arc Mainnet if on wrong chain
 *   3. User reviews constructor arg (USDC address) and estimated cost
 *   4. User clicks Deploy — wallet prompts for signature
 *   5. Wait for receipt → show deployed address + tx hash
 *   6. Save address to localStorage so the app can switch to mainnet
 */

import React, { useState, useCallback } from 'react'
import { useAccount, useSwitchChain, usePublicClient, useWalletClient } from 'wagmi'
import { type WalletClient } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { CheckCircle, AlertTriangle, ExternalLink, Copy, Rocket } from 'lucide-react'
import { Card, Button } from './ui'
import {
  MAINNET_CHAIN_ID,
  MAINNET_USDC_ADDRESS,
  MILESTONE_PAY_TESTNET,
  saveMainnetAddress,
  getMainnetAddress,
} from '../contract'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import artifact from '../../contracts/out/MilestonePay.sol/MilestonePay.json'

// ─── Constants ────────────────────────────────────────────────────────────────

const ARC_MAINNET_PARAMS = {
  chainId: `0x${MAINNET_CHAIN_ID.toString(16)}`,
  chainName: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.arc.io'],
  blockExplorerUrls: ['https://explorer.arc.io'],
}

type DeployState =
  | { phase: 'idle' }
  | { phase: 'confirming' }           // waiting for wallet sig
  | { phase: 'mining'; txHash: `0x${string}` }
  | { phase: 'done'; txHash: `0x${string}`; address: `0x${string}` }
  | { phase: 'error'; message: string }

// ─── Component ────────────────────────────────────────────────────────────────

export function DeployMainnet() {
  const { address: walletAddr, chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: MAINNET_CHAIN_ID })
  // No chainId param — returns a generic WalletClient for the wallet's active chain.
  // We guard with onRightChain before calling deploy, so the chain is correct.
  const { data: walletClientRaw } = useWalletClient()
  const walletClient = walletClientRaw as WalletClient | undefined

  const [deployState, setDeployState] = useState<DeployState>({ phase: 'idle' })
  const [copied, setCopied] = useState<'addr' | 'tx' | null>(null)

  // If a mainnet address was previously saved, load it so the user can see it
  // Read once on mount from localStorage — initializer runs only client-side
  const [savedAddress, setSavedAddress] = useState<`0x${string}` | null>(() => getMainnetAddress())

  const onRightChain = chainId === MAINNET_CHAIN_ID

  // ── Add Arc Mainnet to wallet if not known ──────────────────────────────────
  // Uses the wagmi walletClient so it works over WalletConnect (mobile wallets)
  // as well as injected extensions — no direct window.ethereum access needed.
  async function addArcMainnet() {
    if (!walletClient) return
    try {
      await walletClient.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_MAINNET_PARAMS],
      } as Parameters<typeof walletClient.request>[0])
    } catch { /* user rejected */ }
  }

  // ── Copy helper ─────────────────────────────────────────────────────────────
  function copy(text: string, kind: 'addr' | 'tx') {
    void navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 2000)
  }

  // ── Deploy ──────────────────────────────────────────────────────────────────
  const deploy = useCallback(async () => {
    if (!walletClient || !publicClient || !walletAddr) return
    setDeployState({ phase: 'confirming' })
    try {
      // deployContract is the correct viem method for contract deployment.
      // It encodes bytecode + constructor args and submits the create tx.
      const txHash = await walletClient.deployContract({
        abi: MILESTONE_PAY_TESTNET.abi,
        bytecode: artifact.bytecode.object as `0x${string}`,
        args: [MAINNET_USDC_ADDRESS],
        account: walletAddr,
        chain: null,  // null = use wallet's current chain (Arc Mainnet, guarded above)
      })

      setDeployState({ phase: 'mining', txHash })

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000,
      })

      if (!receipt.contractAddress) {
        setDeployState({ phase: 'error', message: 'Transaction succeeded but no contract address returned. Check the explorer.' })
        return
      }

      saveMainnetAddress(receipt.contractAddress)
      setSavedAddress(receipt.contractAddress)
      setDeployState({ phase: 'done', txHash, address: receipt.contractAddress })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // User rejected — reset to idle cleanly
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        setDeployState({ phase: 'idle' })
      } else {
        setDeployState({ phase: 'error', message: msg.slice(0, 300) })
      }
    }
  }, [walletClient, publicClient, walletAddr])

  // ─── Render ─────────────────────────────────────────────────────────────────

  const doneState = deployState.phase === 'done' ? deployState : null
  const errorState = deployState.phase === 'error' ? deployState : null

  return (
    <div className="min-h-dvh py-12 px-4" style={{ background: 'var(--bg-gradient)' }}>
      <div className="max-w-lg mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            Arc Mainnet
          </p>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--ink-1)', letterSpacing: '-0.02em' }}
          >
            Deploy MilestonePay
          </h1>
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Your wallet signs the deploy transaction. No private key ever leaves your browser.
          </p>
        </div>

        {/* ── Mainnet warning ── */}
        <Card>
          <div className="flex gap-3 items-start">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} style={{ color: 'var(--warning, #d97706)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              <strong style={{ color: 'var(--ink-1)' }}>Mainnet — real USDC.</strong>{' '}
              Transactions are irreversible. Review the contract source and audit findings before
              proceeding. Deploy cost is approximately <strong>0.015 – 0.025 USDC</strong> in gas
              (Arc gas fees are paid in USDC).
            </p>
          </div>
        </Card>

        {/* ── Constructor args ── */}
        <Card>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
            Constructor arguments
          </p>
          <div className="rounded-xl p-3 space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>usdc_ (Arc Mainnet USDC)</p>
            <p className="font-mono text-xs break-all" style={{ color: 'var(--ink-1)' }}>
              {MAINNET_USDC_ADDRESS}
            </p>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            This is the fixed USDC predeploy address on Arc — identical on mainnet and testnet.
          </p>
        </Card>

        {/* ── Network / connect ── */}
        <Card>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
            Wallet
          </p>
          {!isConnected ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>Connect your wallet to deploy.</p>
              <ConnectKitButton />
            </div>
          ) : !onRightChain ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                Switch to <strong style={{ color: 'var(--ink-1)' }}>Arc Mainnet</strong> (chain ID 5042).
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  loading={isSwitching}
                  onClick={() => switchChain({ chainId: MAINNET_CHAIN_ID })}
                >
                  Switch network
                </Button>
                <Button variant="ghost" onClick={() => void addArcMainnet()}>
                  Add Arc Mainnet to wallet
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
              <p className="text-sm font-mono truncate" style={{ color: 'var(--ink-1)' }}>
                {walletAddr}
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--success-bg, #dcfce7)', color: 'var(--success)' }}>
                Arc Mainnet
              </span>
            </div>
          )}
        </Card>

        {/* ── Previously deployed ── */}
        {savedAddress && deployState.phase !== 'done' && (
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} style={{ color: 'var(--success)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--ink-1)' }}>Previously deployed</p>
            </div>
            <p className="text-xs font-mono break-all" style={{ color: 'var(--ink-2)' }}>{savedAddress}</p>
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              This address is saved in your browser and used by the app on Arc Mainnet.
              Deploying again creates a new contract — only do this if needed.
            </p>
          </Card>
        )}

        {/* ── Deploy button + states ── */}
        {deployState.phase === 'idle' && isConnected && onRightChain && (
          <Button className="w-full" onClick={() => void deploy()}>
            <Rocket size={16} />
            Deploy to Arc Mainnet
          </Button>
        )}

        {deployState.phase === 'confirming' && (
          <Card>
            <div className="flex items-center gap-3">
              <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-1)' }}>Waiting for wallet signature…</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Check your wallet to approve the deploy transaction.</p>
              </div>
            </div>
          </Card>
        )}

        {deployState.phase === 'mining' && (
          <Card>
            <div className="flex items-center gap-3">
              <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-1)' }}>Transaction submitted — waiting for confirmation…</p>
                <a
                  href={buildTxExplorerUrl(MAINNET_CHAIN_ID, deployState.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs flex items-center gap-1 mt-1"
                  style={{ color: 'var(--accent)' }}
                >
                  View on explorer <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </Card>
        )}

        {doneState && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              <p className="text-base font-semibold" style={{ color: 'var(--ink-1)' }}>Contract deployed!</p>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Contract address</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-sm break-all flex-1" style={{ color: 'var(--ink-1)' }}>{doneState.address}</p>
                  <button
                    onClick={() => copy(doneState.address, 'addr')}
                    className="shrink-0 p-1 rounded-lg transition-colors"
                    style={{ color: copied === 'addr' ? 'var(--success)' : 'var(--muted)' }}
                    title="Copy address"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <a
                  href={buildAddressExplorerUrl(MAINNET_CHAIN_ID, doneState.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs flex items-center gap-1 mt-1"
                  style={{ color: 'var(--accent)' }}
                >
                  View contract on explorer <ExternalLink size={12} />
                </a>
              </div>

              <div className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Transaction hash</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs break-all flex-1" style={{ color: 'var(--ink-2)' }}>{doneState.txHash}</p>
                  <button
                    onClick={() => copy(doneState.txHash, 'tx')}
                    className="shrink-0 p-1 rounded-lg"
                    style={{ color: copied === 'tx' ? 'var(--success)' : 'var(--muted)' }}
                    title="Copy tx hash"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <a
                  href={buildTxExplorerUrl(MAINNET_CHAIN_ID, doneState.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs flex items-center gap-1 mt-1"
                  style={{ color: 'var(--accent)' }}
                >
                  View transaction on explorer <ExternalLink size={12} />
                </a>
              </div>

              <div className="rounded-xl p-3" style={{ background: 'var(--success-bg, #dcfce7)', border: '1px solid var(--success)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
                  Address saved to browser storage. The app will use this contract when connected to Arc Mainnet.
                </p>
              </div>
            </div>
          </Card>
        )}

        {errorState && (
          <Card>
            <div className="flex gap-3 items-start">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Deploy failed</p>
                <p className="text-xs mt-1 font-mono break-all" style={{ color: 'var(--ink-2)' }}>{errorState.message}</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={() => setDeployState({ phase: 'idle' })}>
                  Try again
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Next steps ── */}
        {doneState && (
          <Card>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>Next steps</p>
            <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: 'var(--ink-2)' }}>
              <li>Verify the source on the Arc explorer (optional but recommended).</li>
              <li>Connect your wallet to Arc Mainnet in the main app to create escrows.</li>
              <li>Fund the contract by having buyers call <span className="font-mono text-xs">fundEscrow</span> via the pay-link.</li>
            </ol>
          </Card>
        )}

      </div>
    </div>
  )
}
