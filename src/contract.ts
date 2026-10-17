import artifact from '../contracts/out/MilestonePay.sol/MilestonePay.json'
import { getUsdc, requireChain } from '@/onchain-facts'
import { arcTestnet, arc } from 'viem/chains'
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from './config'

// ─── Testnet ──────────────────────────────────────────────────────────────────
export const TESTNET_CHAIN_ID = ARC_TESTNET_CHAIN_ID
export const TESTNET_USDC = getUsdc(TESTNET_CHAIN_ID)!
export const TESTNET_CHAIN = arcTestnet

export const MILESTONE_PAY_TESTNET = {
  address: '0x019342cba4562c03ac36ba2d6c2652d65f99d545' as `0x${string}`,
  abi: artifact.abi,
} as const

// ─── Mainnet ─────────────────────────────────────────────────────────────────
// Deployed by 0x9421b89ffd0453304c7dc3eb2829e300d26a52d8
// Tx: 0x2cbc9cf896d6c2235537ee6c766e866b1b447929445802879435f60b180b01d7
export const MAINNET_CHAIN_ID = ARC_MAINNET_CHAIN_ID
export const MAINNET_USDC = getUsdc(MAINNET_CHAIN_ID)!
export const MAINNET_CHAIN = arc
export const MAINNET_USDC_ADDRESS = requireChain(MAINNET_CHAIN_ID).usdc!.address as `0x${string}`

export const MILESTONE_PAY_MAINNET = {
  address: '0x396ba33d1f7ed6fd1f92d9037e470807d5d23ada' as `0x${string}`,
  abi: artifact.abi,
} as const

// saveMainnetAddress / getMainnetAddress kept for Deploy page back-compat only.
// The app no longer reads localStorage for the active contract — mainnet address
// is hardcoded above.
const MAINNET_ADDR_KEY = 'milestonepay_mainnet_address'
export function getMainnetAddress(): `0x${string}` | null {
  try {
    const v = localStorage.getItem(MAINNET_ADDR_KEY)
    if (v && /^0x[0-9a-fA-F]{40}$/.test(v)) return v as `0x${string}`
  } catch { /* SSR / private browsing */ }
  return null
}
export function saveMainnetAddress(addr: `0x${string}`) {
  try { localStorage.setItem(MAINNET_ADDR_KEY, addr) } catch { /* ignore */ }
}

// ─── Active config — defaults to MAINNET ─────────────────────────────────────
// All components import CHAIN_ID, USDC, MILESTONE_PAY from here.
// Testnet constants are exported separately for components that need both.
export const CHAIN_ID = MAINNET_CHAIN_ID
export const USDC = MAINNET_USDC
export const MILESTONE_PAY = MILESTONE_PAY_MAINNET

// Enum mirrors
export const ESCROW_STATUS = ['Unfunded', 'Active', 'Completed', 'Cancelled'] as const
export const MILESTONE_STATUS = ['Pending', 'Delivered', 'Released', 'Disputed', 'Resolved', 'Refunded'] as const

export type EscrowStatusStr = typeof ESCROW_STATUS[number]
export type MilestoneStatusStr = typeof MILESTONE_STATUS[number]

export interface MilestoneData {
  description: string
  amount: bigint
  status: number
  deliveredAt: bigint
  disputedAt: bigint
  mutualSellerBps: bigint
  mutualProposed: boolean
}

export interface EscrowData {
  seller: `0x${string}`
  buyer: `0x${string}`
  arbiter: `0x${string}`
  deadline: bigint
  reviewWindowSeconds: bigint
  status: number
  milestones: MilestoneData[]
}

export function escrowStatusLabel(s: number): EscrowStatusStr {
  return ESCROW_STATUS[s] ?? 'Unknown'
}

export function milestoneStatusLabel(s: number): MilestoneStatusStr {
  return MILESTONE_STATUS[s] ?? 'Unknown'
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
