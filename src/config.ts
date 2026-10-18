/**
 * wagmi configuration — ConnectKit + WalletConnect QR + injected wallets
 * Built with Arc Studio — https://studio.arc.io
 *
 * WalletConnect project ID:
 *   Set VITE_WALLETCONNECT_PROJECT_ID in .env
 *   Get a free ID at https://cloud.reown.com (formerly WalletConnect Cloud)
 */

import { http, createConfig } from 'wagmi'
import { mainnet, base, baseSepolia, arbitrum, arbitrumSepolia, sepolia } from 'wagmi/chains'
import { arcTestnet, arc } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

export const ARC_MAINNET_CHAIN_ID = arc.id       // 5042
export const ARC_TESTNET_CHAIN_ID = arcTestnet.id // 5042002

// import.meta.env values are typed `any` by Vite; cast explicitly.
const wcProjectId: string = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? ''

// getDefaultConfig wires up injected + walletConnect QR + coinbaseWallet.
// WalletConnect/QR requires walletConnectProjectId to be set.
// Chains listed here are selectable in the ConnectKit modal and reachable via WC.
//   Arc Mainnet  — default (first), escrow contract
//   Arc Testnet  — for dev/testing
//   Base/Ethereum/Arbitrum — CCTP V2 source chains (mainnet)
//   Base Sepolia/Eth Sepolia/Arbitrum Sepolia — CCTP V2 source chains (testnet)
//   mainnet — ENS resolution only, not shown as an app chain
export const config = createConfig(
  getDefaultConfig({
    appName: 'MilestonePay',
    appDescription: 'Multi-milestone USDC escrow with on-chain reputation',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://milestonepay.app',
    walletConnectProjectId: wcProjectId,

    chains: [arc, arcTestnet, base, mainnet, arbitrum, baseSepolia, sepolia, arbitrumSepolia],
    transports: {
      [arc.id]:              http('https://rpc.mainnet.arc.io'),
      [arcTestnet.id]:       http('https://rpc.testnet.arc.io'),
      [base.id]:             http(),
      [mainnet.id]:          http(),
      [arbitrum.id]:         http(),
      [baseSepolia.id]:      http(),
      [sepolia.id]:          http(),
      [arbitrumSepolia.id]:  http(),
    },
  }),
)
