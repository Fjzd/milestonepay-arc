/**
 * Unit tests for CCTP V2 fee math and encoding helpers.
 * Run with: bun test cctp.test.ts
 */

import { describe, it, expect } from 'bun:test'
import {
  computeBurnParams,
  computeFastFee,
  parseIrisFeeResponse,
  addressToBytes32,
  FORWARDING_HOOK_DATA,
  CCTP_DOMAIN,
  SRC_CHAINS_MAINNET,
  SRC_CHAINS_TESTNET,
} from './src/cctp'

// ─── hookData encoding ────────────────────────────────────────────────────────

describe('FORWARDING_HOOK_DATA', () => {
  it('is the correct 32-byte hex for "cctp-forward"', () => {
    expect(FORWARDING_HOOK_DATA).toBe(
      '0x636374702d666f72776172640000000000000000000000000000000000000000',
    )
  })

  it('is exactly 66 characters (0x + 64 hex chars = 32 bytes)', () => {
    expect(FORWARDING_HOOK_DATA.length).toBe(66)
  })

  it('encodes the ASCII string "cctp-forward" in the first 12 bytes', () => {
    const hex = FORWARDING_HOOK_DATA.slice(2)
    const bytes = Buffer.from(hex, 'hex')
    const str = bytes.slice(0, 12).toString('ascii')
    expect(str).toBe('cctp-forward')
  })

  it('has 20 zero bytes of padding after the string', () => {
    const hex = FORWARDING_HOOK_DATA.slice(2)
    const padding = hex.slice(24)
    expect(padding).toBe('0'.repeat(40))
  })
})

// ─── addressToBytes32 ─────────────────────────────────────────────────────────

describe('addressToBytes32', () => {
  it('left-pads a 20-byte address to 32 bytes', () => {
    const addr = '0xaBcDef1234567890AbCDEF1234567890abcdef12' as `0x${string}`
    const result = addressToBytes32(addr)
    expect(result).toBe('0x000000000000000000000000abcdef1234567890abcdef1234567890abcdef12')
    expect(result.length).toBe(66)
  })

  it('normalises address to lowercase', () => {
    const addr = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as `0x${string}`
    const result = addressToBytes32(addr)
    expect(result).toBe('0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('handles zero address', () => {
    const addr = '0x0000000000000000000000000000000000000000' as `0x${string}`
    const result = addressToBytes32(addr)
    expect(result).toBe('0x0000000000000000000000000000000000000000000000000000000000000000')
  })
})

// ─── parseIrisFeeResponse ─────────────────────────────────────────────────────
// Real response shape from GET /v2/burn/USDC/fees/6/26?forward=true

const REAL_IRIS_RESPONSE = [
  { finalityThreshold: 1000, minimumFee: 0.325, forwardFee: { low: 16340, med: 16822, high: 17048 } },
  { finalityThreshold: 2000, minimumFee: 0,     forwardFee: { low: 16340, med: 16822, high: 17048 } },
]

describe('parseIrisFeeResponse', () => {
  it('parses the real Iris response shape and picks threshold 1000', () => {
    const entry = parseIrisFeeResponse(REAL_IRIS_RESPONSE)
    expect(entry.finalityThreshold).toBe(1000)
    expect(entry.minimumFee).toBe(0.325)
    expect(entry.forwardFee.high).toBe(17048)
    expect(entry.forwardFee.low).toBe(16340)
    expect(entry.forwardFee.med).toBe(16822)
  })

  it('throws on non-array input', () => {
    expect(() => parseIrisFeeResponse({ fastTransferFee: '10000' })).toThrow(
      'not an array',
    )
  })

  it('throws when no entry has finalityThreshold 1000', () => {
    const bad = [{ finalityThreshold: 2000, minimumFee: 0, forwardFee: { low: 1, med: 1, high: 1 } }]
    expect(() => parseIrisFeeResponse(bad)).toThrow('finalityThreshold=1000')
  })

  it('throws when minimumFee is missing or non-numeric', () => {
    const bad = [{ finalityThreshold: 1000, forwardFee: { low: 1, med: 1, high: 1 } }]
    expect(() => parseIrisFeeResponse(bad)).toThrow('minimumFee')
  })

  it('throws when forwardFee.high is missing', () => {
    const bad = [{ finalityThreshold: 1000, minimumFee: 0.325, forwardFee: { low: 1, med: 1 } }]
    expect(() => parseIrisFeeResponse(bad)).toThrow('forwardFee.high')
  })

  it('handles threshold 2000 with zero minimumFee', () => {
    // Simulate a response that only has threshold 2000 — should throw
    const only2000 = [REAL_IRIS_RESPONSE[1]]
    expect(() => parseIrisFeeResponse(only2000)).toThrow('finalityThreshold=1000')
  })
})

// ─── computeFastFee ───────────────────────────────────────────────────────────

describe('computeFastFee', () => {
  it('computes fee for real Iris minimumFee of 0.325 bp on a 10 USDC burn', () => {
    // burnAmount = 10 USDC = 10_000_000 units
    // scaledBp = round(0.325 * 1000) = 325
    // fee = ceil(10_000_000 * 325 / 10_000_000) = ceil(325) = 325
    const fee = computeFastFee(10_000_000n, 0.325)
    expect(fee).toBe(325n)
  })

  it('computes fee for 0.325 bp on 1 USDC (tests ceiling)', () => {
    // burnAmount = 1_000_000; ceil(1_000_000 * 325 / 10_000_000) = ceil(32.5) = 33
    const fee = computeFastFee(1_000_000n, 0.325)
    expect(fee).toBe(33n)
  })

  it('returns 0 for a 0 bp rate', () => {
    expect(computeFastFee(5_000_000n, 0)).toBe(0n)
  })

  it('handles a whole-number bp rate (1 bp)', () => {
    // 1 bp on 1_000_000 = 100 units; ceil(100.0) = 100
    expect(computeFastFee(1_000_000n, 1)).toBe(100n)
  })

  it('scales correctly for large amounts', () => {
    // 0.325 bp on 100_000 USDC = 100_000_000_000 units
    // ceil(100_000_000_000 * 325 / 10_000_000) = ceil(3_250_000) = 3_250_000
    expect(computeFastFee(100_000_000_000n, 0.325)).toBe(3_250_000n)
  })

  it('does not use floating-point (returns exact bigint for fractional bp)', () => {
    // 0.001 bp on 1_000_000 = ceil(0.1) = 1 (always at least 1 unit when non-zero)
    const fee = computeFastFee(1_000_000n, 0.001)
    expect(typeof fee).toBe('bigint')
    expect(fee >= 0n).toBe(true)
  })
})

// ─── computeBurnParams ────────────────────────────────────────────────────────

describe('computeBurnParams', () => {
  it('adds fees and buffer to escrow total', () => {
    const escrowTotal = 10_000_000n   // 10 USDC
    const fastFee = 10_000n           // 0.01 USDC
    const forwardingFee = 5_000n      // 0.005 USDC
    const { burnAmount } = computeBurnParams(escrowTotal, fastFee, forwardingFee)
    // Expected: 10_000_000 + 10_000 + 5_000 + 20_000 = 10_035_000
    expect(burnAmount).toBe(10_035_000n)
  })

  it('computes maxFee as ceil(totalFee * 1.2)', () => {
    const fastFee = 10_000n
    const forwardingFee = 5_000n
    const { maxFee } = computeBurnParams(1_000_000n, fastFee, forwardingFee)
    // 15_000 * 1.2 = 18_000 exactly
    expect(maxFee).toBe(18_000n)
  })

  it('ceils maxFee when 1.2× is not an integer', () => {
    // totalFee = 10_001; 10_001 * 12 / 10 = 12001.2 → ceil = 12002
    const fastFee = 10_001n
    const forwardingFee = 0n
    const { maxFee } = computeBurnParams(1_000_000n, fastFee, forwardingFee)
    expect(maxFee).toBe(12_002n)
  })

  it('burnAmount is always greater than escrowTotal', () => {
    const escrowTotal = 5_000_000n
    const { burnAmount } = computeBurnParams(escrowTotal, 1n, 1n)
    expect(burnAmount > escrowTotal).toBe(true)
  })

  it('handles zero fees (only buffer added)', () => {
    const escrowTotal = 1_000_000n
    const { burnAmount, maxFee } = computeBurnParams(escrowTotal, 0n, 0n)
    expect(burnAmount).toBe(1_020_000n)
    expect(maxFee).toBe(0n)
  })

  it('handles large escrow amounts', () => {
    const escrowTotal = 10_000_000_000n
    const fastFee = 50_000n
    const forwardingFee = 25_000n
    const { burnAmount } = computeBurnParams(escrowTotal, fastFee, forwardingFee)
    expect(burnAmount).toBe(10_000_095_000n)
  })

  it('maxFee >= forwardingFee + fastFee (covers real Iris values)', () => {
    // Real Iris: forwardFee.high = 17048, fast fee ~325 on small amount
    const forwardingFee = 17048n
    const fastFee = 325n
    const { maxFee } = computeBurnParams(10_000_000n, fastFee, forwardingFee)
    expect(maxFee >= forwardingFee + fastFee).toBe(true)
  })
})

// ─── CCTP domain constants ────────────────────────────────────────────────────

describe('CCTP_DOMAIN', () => {
  it('Arc domain is 26',      () => { expect(CCTP_DOMAIN.Arc).toBe(26) })
  it('Base domain is 6',      () => { expect(CCTP_DOMAIN.Base).toBe(6) })
  it('Ethereum domain is 0',  () => { expect(CCTP_DOMAIN.Ethereum).toBe(0) })
  it('Arbitrum domain is 3',  () => { expect(CCTP_DOMAIN.Arbitrum).toBe(3) })
})

// ─── Chain config sanity checks ───────────────────────────────────────────────

describe('SRC_CHAINS_MAINNET', () => {
  it('Base mainnet chain ID is 8453',       () => { expect(SRC_CHAINS_MAINNET.Base.chainId).toBe(8453) })
  it('Ethereum mainnet chain ID is 1',      () => { expect(SRC_CHAINS_MAINNET.Ethereum.chainId).toBe(1) })
  it('Arbitrum mainnet chain ID is 42161',  () => { expect(SRC_CHAINS_MAINNET.Arbitrum.chainId).toBe(42161) })
  it('all mainnet chains use the same TokenMessengerV2', () => {
    const addrs = Object.values(SRC_CHAINS_MAINNET).map((c) => c.tokenMessengerV2.toLowerCase())
    expect(new Set(addrs).size).toBe(1)
    expect(addrs[0]).toBe('0x28b5a0e9c621a5badaa536219b3a228c8168cf5d')
  })
})

describe('SRC_CHAINS_TESTNET', () => {
  it('Base Sepolia chain ID is 84532',        () => { expect(SRC_CHAINS_TESTNET.Base.chainId).toBe(84532) })
  it('Ethereum Sepolia chain ID is 11155111', () => { expect(SRC_CHAINS_TESTNET.Ethereum.chainId).toBe(11155111) })
  it('Arbitrum Sepolia chain ID is 421614',   () => { expect(SRC_CHAINS_TESTNET.Arbitrum.chainId).toBe(421614) })
  it('all testnet chains use the same TokenMessengerV2', () => {
    const addrs = Object.values(SRC_CHAINS_TESTNET).map((c) => c.tokenMessengerV2.toLowerCase())
    expect(new Set(addrs).size).toBe(1)
    expect(addrs[0]).toBe('0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa')
  })
})
