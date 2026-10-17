/**
 * wagmi configuration — ConnectKit + WalletConnect QR + injected wallets
 * Built with Arc Studio — https://studio.arc.io
 *
 * WalletConnect project ID:
 *   Set VITE_WALLETCONNECT_PROJECT_ID in .env
 *   Get a free ID at https://cloud.reown.com (formerly WalletConnect Cloud)
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const ARC_MAINNET_CHAIN_ID = arc.id       // 5042
export const ARC_TESTNET_CHAIN_ID = arcTestnet.id // 5042002

// getDefaultConfig wires up:
//   - injected()       → browser extension wallets (MetaMask, Rabby, Uniswap desktop, etc.)
//   - walletConnect()  → QR-code modal for ANY mobile wallet (Uniswap mobile, Rainbow, etc.)
//   - coinbaseWallet() → Coinbase Wallet (both extension and mobile via WC QR)
// All three are enabled when walletConnectProjectId is provided.
// Without a project ID the build still works but the WalletConnect / QR option is hidden.
// import.meta.env values are typed `any` by Vite; cast explicitly so strict-mode
// lint passes. The value is always a string (or undefined → empty-string fallback).
const wcProjectId: string = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? ''

// getDefaultConfig returns CreateConfigParameters (not a live Config).
// Wrap with createConfig to produce the runtime Config object wagmi needs.
export const config = createConfig(
  getDefaultConfig({
    appName: 'MilestonePay',
    appDescription: 'Multi-milestone USDC escrow with on-chain reputation',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://milestonepay.app',
    walletConnectProjectId: wcProjectId,

    // Arc Mainnet first = default chain in ConnectKit modal.
    // Arc Testnet second so users can switch to it; mainnet for ENS only.
    chains: [arc, arcTestnet, mainnet],
    transports: {
      [arcTestnet.id]: http('https://rpc.testnet.arc.io'),
      [arc.id]:        http('https://rpc.mainnet.arc.io'),
      [mainnet.id]:    http(), // ENS only
    },
  }),
)
