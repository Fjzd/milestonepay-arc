import { ExternalLink } from 'lucide-react'
import { MILESTONE_PAY_MAINNET, MILESTONE_PAY_TESTNET } from '../contract'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from '../config'

const DEPLOY_TX = '0x2cbc9cf896d6c2235537ee6c766e866b1b447929445802879435f60b180b01d7'

export function Footer() {
  return (
    <footer
      className="mt-12 border-t px-5 py-8"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
    >
      <div className="max-w-2xl mx-auto space-y-5">

        {/* App name + tagline */}
        <div>
          <span className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk, sans-serif', color: 'var(--ink-1)' }}>
            Milestone<span style={{ color: 'var(--accent-hover)' }}>Pay</span>
          </span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Multi-milestone USDC escrow with on-chain reputation — built on Arc.
          </p>
        </div>

        {/* Contract addresses */}
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            Deployed Contracts
          </p>

          {/* Mainnet */}
          <div
            className="rounded-xl px-3 py-2.5 flex items-start justify-between gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'var(--success-bg, #dcfce7)', color: 'var(--success)' }}
                >
                  Mainnet
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Arc · Chain 5042</span>
              </div>
              <p className="font-mono text-xs break-all" style={{ color: 'var(--ink-1)' }}>
                {MILESTONE_PAY_MAINNET.address}
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0 items-end">
              <a
                href={buildAddressExplorerUrl(ARC_MAINNET_CHAIN_ID, MILESTONE_PAY_MAINNET.address)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--accent)' }}
              >
                explorer.arc.io <ExternalLink size={11} />
              </a>
              <a
                href={`https://explorer.arc.io/tx/${DEPLOY_TX}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--subtle, var(--muted))' }}
              >
                deploy tx <ExternalLink size={11} />
              </a>
            </div>
          </div>

          {/* Testnet */}
          <div
            className="rounded-xl px-3 py-2.5 flex items-start justify-between gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--muted)' }}
                >
                  Testnet
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Arc Testnet · Chain 5042002</span>
              </div>
              <p className="font-mono text-xs break-all" style={{ color: 'var(--ink-2)' }}>
                {MILESTONE_PAY_TESTNET.address}
              </p>
            </div>
            <a
              href={buildAddressExplorerUrl(ARC_TESTNET_CHAIN_ID, MILESTONE_PAY_TESTNET.address)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs shrink-0"
              style={{ color: 'var(--accent)' }}
            >
              explorer <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* USDC note */}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Gas token on Arc is USDC — no ETH needed.
          USDC: <span className="font-mono">0x3600000000000000000000000000000000000000</span> (same address on mainnet and testnet).
        </p>

      </div>
    </footer>
  )
}
