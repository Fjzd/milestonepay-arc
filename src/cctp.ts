/**
 * CCTP V2 constants, ABIs, fee helpers, and hookData encoding.
 *
 * All contract addresses are from user-provided specs.
 * Iris API calls are proxied through the browser (no CORS issues — Circle
 * allows browser requests to iris-api.circle.com).
 *
 * Forwarding Service: Circle's off-chain relayer submits the mint on Arc so
 * the buyer needs NO Arc USDC/gas to complete the mint step.
 *
 * hookData = 0x636374702d666f72776172640000000000000000000000000000000000000000
 * This is the 32-byte UTF-8 encoding of "cctp-forward" left-padded to 32 bytes.
 */

// ─── CCTP V2 hook data ────────────────────────────────────────────────────────

/**
 * Circle Forwarding Service hook data (32 bytes).
 * "cctp-forward" as bytes32: ascii string padded with 0x00 on the right to 32 bytes.
 * 0x636374702d666f72776172640000000000000000000000000000000000000000
 */
export const FORWARDING_HOOK_DATA =
  '0x636374702d666f72776172640000000000000000000000000000000000000000' as const

// ─── CCTP V2 domains ─────────────────────────────────────────────────────────

export const CCTP_DOMAIN = {
  Ethereum: 0,
  Arbitrum: 3,
  Base: 6,
  Arc: 26,
} as const

export type SrcChainKey = 'Base' | 'Ethereum' | 'Arbitrum'
export const SRC_CHAIN_KEYS: SrcChainKey[] = ['Base', 'Ethereum', 'Arbitrum']

// ─── Source chain config (mainnet) ───────────────────────────────────────────

export interface SrcChainConfig {
  key: SrcChainKey
  label: string
  chainId: number
  domain: number
  usdc: `0x${string}`
  tokenMessengerV2: `0x${string}`
  explorerBase: string
}

// TokenMessengerV2 is the same address on all EVM chains (mainnet and testnet).
const TOKEN_MESSENGER_V2_MAINNET = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as `0x${string}`
const TOKEN_MESSENGER_V2_TESTNET = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as `0x${string}`

export const SRC_CHAINS_MAINNET: Record<SrcChainKey, SrcChainConfig> = {
  Base: {
    key: 'Base',
    label: 'Base',
    chainId: 8453,
    domain: CCTP_DOMAIN.Base,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenMessengerV2: TOKEN_MESSENGER_V2_MAINNET,
    explorerBase: 'https://basescan.org',
  },
  Ethereum: {
    key: 'Ethereum',
    label: 'Ethereum',
    chainId: 1,
    domain: CCTP_DOMAIN.Ethereum,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenMessengerV2: TOKEN_MESSENGER_V2_MAINNET,
    explorerBase: 'https://etherscan.io',
  },
  Arbitrum: {
    key: 'Arbitrum',
    label: 'Arbitrum',
    chainId: 42161,
    domain: CCTP_DOMAIN.Arbitrum,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    tokenMessengerV2: TOKEN_MESSENGER_V2_MAINNET,
    explorerBase: 'https://arbiscan.io',
  },
}

export const SRC_CHAINS_TESTNET: Record<SrcChainKey, SrcChainConfig> = {
  Base: {
    key: 'Base',
    label: 'Base Sepolia',
    chainId: 84532,
    domain: CCTP_DOMAIN.Base,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenMessengerV2: TOKEN_MESSENGER_V2_TESTNET,
    explorerBase: 'https://sepolia.basescan.org',
  },
  Ethereum: {
    key: 'Ethereum',
    label: 'Ethereum Sepolia',
    chainId: 11155111,
    domain: CCTP_DOMAIN.Ethereum,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    tokenMessengerV2: TOKEN_MESSENGER_V2_TESTNET,
    explorerBase: 'https://sepolia.etherscan.io',
  },
  Arbitrum: {
    key: 'Arbitrum',
    label: 'Arbitrum Sepolia',
    chainId: 421614,
    domain: CCTP_DOMAIN.Arbitrum,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    tokenMessengerV2: TOKEN_MESSENGER_V2_TESTNET,
    explorerBase: 'https://sepolia.arbiscan.io',
  },
}

// ─── Arc destination config ───────────────────────────────────────────────────

export interface ArcConfig {
  chainId: number
  domain: number
  messageTransmitterV2: `0x${string}`
  tokenMessengerV2: `0x${string}`
  irisApi: string
  explorerBase: string
}

export const ARC_MAINNET_CCTP: ArcConfig = {
  chainId: 5042,
  domain: CCTP_DOMAIN.Arc,
  messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  tokenMessengerV2: TOKEN_MESSENGER_V2_MAINNET,
  irisApi: 'https://iris-api.circle.com',
  explorerBase: 'https://explorer.arc.io',
}

export const ARC_TESTNET_CCTP: ArcConfig = {
  chainId: 5042002,
  domain: CCTP_DOMAIN.Arc,
  messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  tokenMessengerV2: TOKEN_MESSENGER_V2_TESTNET,
  irisApi: 'https://iris-api-sandbox.circle.com',
  explorerBase: 'https://explorer.testnet.arc.io',
}

// ─── CCTP V2 ABIs ─────────────────────────────────────────────────────────────

// depositForBurnWithHook (8-arg CCTP V2)
export const TOKEN_MESSENGER_V2_ABI = [
  {
    name: 'depositForBurnWithHook',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount',           type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient',    type: 'bytes32' },
      { name: 'burnToken',        type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee',           type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
      { name: 'hookData',         type: 'bytes'   },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
  },
  // 7-arg depositForBurn (no hook) for fallback reference
  {
    name: 'depositForBurn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount',           type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient',    type: 'bytes32' },
      { name: 'burnToken',        type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee',           type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
  },
] as const

// ─── Iris API types ───────────────────────────────────────────────────────────

/**
 * One entry in the Iris /v2/burn/USDC/fees array response.
 *
 * Real example (Base→Arc, forward=true):
 * [
 *   { "finalityThreshold": 1000, "minimumFee": 0.325,
 *     "forwardFee": { "low": 16340, "med": 16822, "high": 17048 } },
 *   { "finalityThreshold": 2000, "minimumFee": 0,
 *     "forwardFee": { "low": 16340, "med": 16822, "high": 17048 } }
 * ]
 *
 * minimumFee — basis-point rate (fractional, e.g. 0.325 bp).
 *   fast fee = ceil(burnAmount * minimumFee / 10000)
 * forwardFee — USDC base units (6 decimals).
 */
export interface IrisFeeEntry {
  finalityThreshold: number
  minimumFee: number          // fractional basis points, NOT directly convertible to BigInt
  forwardFee: {
    low: number
    med: number
    high: number              // 6-decimal USDC base units (safe to pass to BigInt)
  }
}

export interface IrisMessageResponse {
  messages?: Array<{
    status: string          // "pending" | "complete"
    sourceDomain: number
    destinationDomain: number
    attestation: string
    messageHash: string
    transactionHash: string   // destination (mint) tx hash on Arc
  }>
}

// ─── Fee helpers ──────────────────────────────────────────────────────────────

/** Buffer added on top of fees so the tx doesn't fail on tiny price spikes. */
const BUFFER_6DEC = 20_000n   // 0.02 USDC in 6 decimals

/** maxFee multiplier: 1.2× the total fee (as a bigint fraction). */
const MAX_FEE_NUMERATOR = 12n
const MAX_FEE_DENOMINATOR = 10n

/**
 * Parse and validate a raw Iris fee-array response.
 * Picks the entry with finalityThreshold === 1000 (fast transfer).
 * Throws a descriptive error if the shape is wrong or the entry is absent.
 */
export function parseIrisFeeResponse(raw: unknown): IrisFeeEntry {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Iris fee response is not an array. Got: ${JSON.stringify(raw).slice(0, 200)}`,
    )
  }
  const entry = (raw as IrisFeeEntry[]).find((e) => e.finalityThreshold === 1000)
  if (!entry) {
    throw new Error(
      `Iris fee response has no entry with finalityThreshold=1000. Got thresholds: ${
        (raw as IrisFeeEntry[]).map((e) => e.finalityThreshold).join(', ')
      }`,
    )
  }
  if (typeof entry.minimumFee !== 'number') {
    throw new Error(`Iris fee entry missing numeric minimumFee. Got: ${JSON.stringify(entry)}`)
  }
  if (!entry.forwardFee || typeof entry.forwardFee.high !== 'number') {
    throw new Error(`Iris fee entry missing forwardFee.high. Got: ${JSON.stringify(entry)}`)
  }
  return entry
}

/**
 * Compute the fast protocol fee from a fractional basis-point rate and a burn
 * amount.  Uses integer-only arithmetic to avoid floating-point precision loss.
 *
 * minimumFee is a fractional bp value (e.g. 0.325).  We scale by 1,000 to get
 * an integer multiplier (325), perform the multiplication in BigInt, then
 * divide by 10_000_000 (= 10_000 bp × 1_000 scale factor), rounding up.
 *
 * Result is in USDC 6-decimal base units.
 */
export function computeFastFee(burnAmount6dec: bigint, minimumFeeBp: number): bigint {
  // Scale minimumFeeBp by 1000 and round to nearest integer to avoid float→BigInt.
  const scaledBp = BigInt(Math.round(minimumFeeBp * 1000))
  const SCALE = 10_000_000n  // 10_000 bp × 1_000 scale factor
  // ceil(burnAmount * scaledBp / SCALE)
  const numerator = burnAmount6dec * scaledBp
  return numerator / SCALE + (numerator % SCALE > 0n ? 1n : 0n)
}

/**
 * Fetch fees from Iris for a source domain → Arc (domain 26) forward.
 *
 * The response is an array of fee tiers; we pick finalityThreshold=1000 (fast).
 *   forwardingFee = forwardFee.high (already 6-dec USDC base units)
 *   fastFee       = ceil(burnAmount * minimumFee / 10_000)   [bp rate]
 *
 * Because fastFee depends on burnAmount and burnAmount depends on fastFee, we
 * solve with one iteration: first compute fastFee with burnAmount=escrowTotal
 * (underestimate), then recompute with the true burnAmount.  The result
 * guarantees the minted amount on Arc is at least escrowTotal.
 *
 * Returns both fees as 6-decimal bigints, plus the raw IrisFeeEntry.
 */
export async function fetchCctpFees(
  irisApi: string,
  srcDomain: number,
  escrowTotal6dec: bigint,
): Promise<{ fastFee: bigint; forwardingFee: bigint; entry: IrisFeeEntry }> {
  const url = `${irisApi}/v2/burn/USDC/fees/${srcDomain}/26?forward=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Iris fee fetch failed: ${res.status} ${res.statusText}`)
  const raw: unknown = await res.json()
  const entry = parseIrisFeeResponse(raw)

  const forwardingFee = BigInt(entry.forwardFee.high)
  const minimumFeeBp = entry.minimumFee

  // Iteration 1: estimate fastFee using escrowTotal as the burn amount proxy.
  const fastFee1 = computeFastFee(escrowTotal6dec + forwardingFee + BUFFER_6DEC, minimumFeeBp)
  // Iteration 2: recompute with the fuller burn amount to converge.
  const burnEst = escrowTotal6dec + forwardingFee + fastFee1 + BUFFER_6DEC
  const fastFee = computeFastFee(burnEst, minimumFeeBp)

  return { fastFee, forwardingFee, entry }
}

/**
 * Compute burn amount and maxFee from escrow total + fetched fees.
 *
 * burnAmount = escrowTotal + fastFee + forwardingFee + BUFFER_6DEC
 * maxFee     = ceil((fastFee + forwardingFee) * 1.2)
 *
 * Both values are in USDC 6-decimal units.
 */
export function computeBurnParams(
  escrowTotal6dec: bigint,
  fastFee: bigint,
  forwardingFee: bigint,
): { burnAmount: bigint; maxFee: bigint } {
  const totalFee = fastFee + forwardingFee
  const burnAmount = escrowTotal6dec + totalFee + BUFFER_6DEC
  const maxFee = (totalFee * MAX_FEE_NUMERATOR) / MAX_FEE_DENOMINATOR +
    ((totalFee * MAX_FEE_NUMERATOR) % MAX_FEE_DENOMINATOR > 0n ? 1n : 0n)
  return { burnAmount, maxFee }
}

/**
 * Encode a 20-byte Ethereum address as a left-zero-padded bytes32.
 * Used for mintRecipient and destinationCaller.
 */
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  // Remove 0x, left-pad to 64 hex chars (32 bytes)
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as `0x${string}`
}

/** Minfinality threshold for fast transfers (1000 = fast mode). */
export const MIN_FINALITY_FAST = 1000

/** destinationCaller = bytes32(0) means anyone can call receiveMessage (Forwarding Service handles it). */
export const DESTINATION_CALLER_ANY = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

// ─── Iris polling ─────────────────────────────────────────────────────────────

/**
 * Poll Iris /v2/messages until the message for burnTxHash is "complete".
 * Returns the destination (mint) tx hash on Arc.
 * Throws after maxAttempts (each attempt waits intervalMs).
 */
export async function pollIrisUntilComplete(
  irisApi: string,
  srcDomain: number,
  burnTxHash: string,
  onStatus: (status: string) => void,
  intervalMs = 3000,
  maxAttempts = 200,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>((r) => setTimeout(r, intervalMs))
    try {
      const url = `${irisApi}/v2/messages/${srcDomain}?transactionHash=${burnTxHash}`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json() as IrisMessageResponse
      const msg = data.messages?.[0]
      if (!msg) continue
      onStatus(msg.status)
      if (msg.status === 'complete') {
        return msg.transactionHash ?? ''
      }
    } catch { /* network blip — keep polling */ }
  }
  throw new Error('Iris polling timed out after 10 minutes')
}
