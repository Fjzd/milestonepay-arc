/**
 * MilestonePay end-to-end simulation on Arc Testnet.
 *
 * Scenarios covered:
 *   1. Seller creates escrow (seller=Alice, buyer=Bob, arbiter=Carol, 3 milestones)
 *   2. Bob funds via the pay-link flow (fundEscrow)
 *   3. Alice delivers milestone 0 → Bob approves → Alice withdraws
 *   4. Alice delivers milestone 1 → review window elapses → Alice auto-releases → Alice withdraws
 *   5. Alice delivers milestone 2 → Bob disputes → Carol (arbiter) resolves 60/40 → both withdraw
 *   6. Seller2 creates a second escrow (Unfunded) — simulates pay-link; Bob2 funds it
 *
 * Run: bun run scripts/e2e-sim.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  type Hash,
  type Address,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

// ─── contract details ────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = '0x019342cba4562c03ac36ba2d6c2652d65f99d545' as Address
const USDC_ADDRESS     = '0x3600000000000000000000000000000000000000' as Address
const USDC_DECIMALS    = 6

// ─── ABI (minimal — only the functions we call) ──────────────────────────────

const MP_ABI = [
  // write
  { name: 'createEscrow',           type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer',                   type: 'address' },
      { name: 'arbiter',                 type: 'address' },
      { name: 'reviewWindowSeconds',     type: 'uint256' },
      { name: 'deadline',                type: 'uint256' },
      { name: 'milestoneDescriptions',   type: 'string[]' },
      { name: 'milestoneAmounts',        type: 'uint256[]' },
    ],
    outputs: [{ name: 'escrowId', type: 'uint256' }] },
  { name: 'fundEscrow',             type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }], outputs: [] },
  { name: 'deliverMilestone',       type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'milestoneIndex', type: 'uint256' }], outputs: [] },
  { name: 'approveMilestone',       type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'milestoneIndex', type: 'uint256' }], outputs: [] },
  { name: 'claimAutoRelease',       type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'milestoneIndex', type: 'uint256' }], outputs: [] },
  { name: 'disputeMilestone',       type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'milestoneIndex', type: 'uint256' }], outputs: [] },
  { name: 'resolveDispute',         type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'milestoneIndex', type: 'uint256' }, { name: 'sellerBps', type: 'uint256' }], outputs: [] },
  { name: 'withdraw',               type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  // read
  { name: 'claimable',              type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'escrowCount',            type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getReputation',          type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: 'completed', type: 'uint256' }, { name: 'disputed', type: 'uint256' }] },
] as const

const ERC20_ABI = [
  { name: 'approve',    type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf',  type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer',   type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

// ─── helpers ─────────────────────────────────────────────────────────────────

const RPC_URL = 'https://rpc.testnet.arc.io'

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })

function walletFor(pk: `0x${string}`) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: arcTestnet, transport: http(RPC_URL) })
}

function usdc(amount: string) {
  return parseUnits(amount, USDC_DECIMALS)
}

function fmt(raw: bigint) {
  return formatUnits(raw, USDC_DECIMALS) + ' USDC'
}

async function waitTx(label: string, hash: Hash): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  const ok = receipt.status === 'success'
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  console.log(`    tx: ${hash}`)
  console.log(`    explorer: https://explorer.testnet.arc.io/tx/${hash}`)
  if (!ok) throw new Error(`Transaction reverted: ${label}`)
}

// Arc: native gas IS USDC (18-dec view). Send some native USDC to cover gas.
async function fundNative(funder: ReturnType<typeof walletFor>, to: Address, amount: string) {
  // Convert 6-dec USDC string to 18-dec native (multiply by 10^12)
  const raw = parseUnits(amount, 18)
  const hash = await funder.sendTransaction({ to, value: raw })
  await waitTx(`Fund native gas → ${to.slice(0, 8)}…`, hash)
}

// Approve + fund USDC (ERC-20) to a wallet so it can approve the contract.
// On Arc native == ERC-20, so we use a native transfer then approve.
async function approveUsdc(w: ReturnType<typeof walletFor>, amount: bigint) {
  // Approve a generous allowance so gas deductions (Arc native = USDC) don't trip the limit
  const MAX = (2n ** 256n) - 1n
  const hash = await w.writeContract({
    address: USDC_ADDRESS, abi: ERC20_ABI,
    functionName: 'approve', args: [CONTRACT_ADDRESS, MAX],
  })
  await waitTx(`Approve USDC (unlimited — needs ≥ ${fmt(amount)})`, hash)
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  MilestonePay  –  Arc Testnet E2E Sim')
  console.log('══════════════════════════════════════════\n')

  // ── Roles ──────────────────────────────────────────────────────────────────
  const ALICE_PK   = generatePrivateKey()   // seller / freelancer
  const BOB_PK     = generatePrivateKey()   // buyer / client
  const CAROL_PK   = generatePrivateKey()   // arbiter
  const SELLER2_PK = generatePrivateKey()   // second seller (pay-link scenario)
  const BOB2_PK    = generatePrivateKey()   // second buyer

  const alice   = walletFor(ALICE_PK);  const aliceAddr   = alice.account.address
  const bob     = walletFor(BOB_PK);    const bobAddr     = bob.account.address
  const carol   = walletFor(CAROL_PK);  const carolAddr   = carol.account.address
  const seller2 = walletFor(SELLER2_PK);const seller2Addr = seller2.account.address
  const bob2    = walletFor(BOB2_PK);   const bob2Addr    = bob2.account.address

  console.log('Actors:')
  console.log(`  Alice   (seller)  ${aliceAddr}`)
  console.log(`  Bob     (buyer)   ${bobAddr}`)
  console.log(`  Carol   (arbiter) ${carolAddr}`)
  console.log(`  Seller2           ${seller2Addr}`)
  console.log(`  Bob2              ${bob2Addr}`)

  // ── Fund wallets from deployer wallet ──────────────────────────────────────
  // We need a seeded wallet; use FUNDER_PK from env (set by faucet_drip step).
  // FUNDER_PK is written to .env by the setup step; bun reads it automatically at startup.
  const funderPk = process.env.FUNDER_PK as `0x${string}` | undefined
  if (!funderPk) {
    console.error('\n✗ FUNDER_PK not set in .env. Run: printf \'FUNDER_PK=<pk>\\n\' >> .env\n')
    process.exit(1)
  }
  const funder = walletFor(funderPk)
  const funderAddr = funder.account.address
  console.log(`\nFunder: ${funderAddr}`)

  const funderBal = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [funderAddr] })
  console.log(`Funder USDC balance: ${fmt(funderBal)}`)
  if (funderBal < usdc('6')) {
    console.error(`✗ Funder has < 6 USDC (balance: ${fmt(funderBal)}).`)
    console.error(`  Fund ${funderAddr} with at least 6 USDC on Arc Testnet, then re-run.`)
    process.exit(1)
  }

  console.log('\n── Funding actor wallets ──')
  // Native gas (Arc native = USDC 18-dec) — 0.1 USDC-native per actor for gas
  for (const [addr, name] of [[aliceAddr,'Alice'],[bobAddr,'Bob'],[carolAddr,'Carol'],[seller2Addr,'Seller2'],[bob2Addr,'Bob2']] as [Address, string][]) {
    await fundNative(funder, addr, '0.05')
    console.log(`    gas funded: ${name}`)
  }
  // ERC-20 USDC for Bob (needs to fund escrow: 15 USDC) and Bob2 (5 USDC)
  // +1 USDC buffer each to cover gas costs (Arc native = USDC)
  const transferBob = await funder.writeContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'transfer', args: [bobAddr, usdc('4')] })
  await waitTx('Transfer 4 USDC → Bob', transferBob)
  const transferBob2 = await funder.writeContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'transfer', args: [bob2Addr, usdc('2')] })
  await waitTx('Transfer 2 USDC → Bob2', transferBob2)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1 — Alice creates escrow (3 milestones: 10, 10, 10 USDC)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario 1: Create escrow ──')
  const reviewWindowSec = 60n    // 60 seconds so auto-release is testable; dispute window is same
  const deadlineSec     = BigInt(Math.floor(Date.now() / 1000) + 86400)

  const createHash = await alice.writeContract({
    address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'createEscrow',
    args: [
      bobAddr, carolAddr, reviewWindowSec, deadlineSec,
      ['Design mockups', 'Frontend build', 'Final delivery'],
      [usdc('1'), usdc('1'), usdc('1')],
    ],
  })
  await waitTx('createEscrow (Alice, 3×10 USDC)', createHash)

  const escrowId = (await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'escrowCount' })) - 1n
  console.log(`  Escrow ID: ${escrowId}`)
  console.log(`  Pay-link:  #/pay/${escrowId}`)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2 — Bob funds (pay-link flow: approve then fundEscrow)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario 2: Bob funds (pay-link) ──')
  await approveUsdc(bob, usdc('3'))
  const fundHash = await bob.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'fundEscrow', args: [escrowId] })
  await waitTx('fundEscrow (Bob)', fundHash)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3 — Milestone 0: deliver → approve → withdraw
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario 3: Milestone 0 – deliver + buyer approve ──')
  const deliver0 = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'deliverMilestone', args: [escrowId, 0n] })
  await waitTx('deliverMilestone(0) – Alice', deliver0)

  const approve0 = await bob.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'approveMilestone', args: [escrowId, 0n] })
  await waitTx('approveMilestone(0) – Bob', approve0)

  const claimable0 = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'claimable', args: [aliceAddr] })
  console.log(`  Alice claimable: ${fmt(claimable0)}`)

  const withdraw0 = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'withdraw', args: [] })
  await waitTx('withdraw – Alice (milestone 0)', withdraw0)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4 (part A) — Deliver milestone 1 NOW so its deliveredAt timestamp
  // is set BEFORE the dispute scenario runs.  We do NOT wait for auto-release
  // yet — that comes after the dispute scenario so the 60s window is still live
  // when we call disputeMilestone(2).
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario 4a: Milestone 1 – deliver (auto-release pending) ──')
  const deliver1 = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'deliverMilestone', args: [escrowId, 1n] })
  await waitTx('deliverMilestone(1) – Alice', deliver1)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 5 — Milestone 2: deliver → dispute (within review window)
  //              → arbiter resolves 60/40
  //
  // Key ordering rule: dispute MUST be raised before the review window
  // expires.  Since we just delivered m1 and m2 immediately after, both
  // deliveredAt timestamps are fresh — the 60s window is wide open.
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario 5: Milestone 2 – dispute + arbiter split 60/40 ──')
  const deliver2 = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'deliverMilestone', args: [escrowId, 2n] })
  await waitTx('deliverMilestone(2) – Alice', deliver2)

  const dispute2 = await bob.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'disputeMilestone', args: [escrowId, 2n] })
  await waitTx('disputeMilestone(2) – Bob', dispute2)

  // Arbiter resolves: 6000 bps = 60% to seller
  const resolve2 = await carol.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'resolveDispute', args: [escrowId, 2n, 6000n] })
  await waitTx('resolveDispute(2, 6000 bps) – Carol', resolve2)

  const aliceClaim = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'claimable', args: [aliceAddr] })
  const bobClaim   = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'claimable', args: [bobAddr] })
  console.log(`  Alice claimable: ${fmt(aliceClaim)} (expect 0.6 USDC — 60% of 1 USDC)`)
  console.log(`  Bob   claimable: ${fmt(bobClaim)}   (expect 0.4 USDC — 40% of 1 USDC)`)

  const wAlice = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'withdraw', args: [] })
  await waitTx('withdraw – Alice (milestone 2 split)', wAlice)
  const wBob = await bob.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'withdraw', args: [] })
  await waitTx('withdraw – Bob (milestone 2 refund portion)', wBob)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4b — NOW wait for the review window (milestone 1 was delivered
  // before scenario 5, so its 60s clock started then).  The dispute for m2 was
  // raised before this wait, so there's no conflict with the dispute window.
  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n── Scenario 4b: Milestone 1 – auto-release after review window ──`)
  console.log(`  Waiting ${Number(reviewWindowSec) + 2}s for review window…`)
  await new Promise(r => setTimeout(r, (Number(reviewWindowSec) + 2) * 1000))

  const autoRelease1 = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'claimAutoRelease', args: [escrowId, 1n] })
  await waitTx('claimAutoRelease(1) – Alice', autoRelease1)

  const claimableAfter1 = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'claimable', args: [aliceAddr] })
  console.log(`  Alice claimable: ${fmt(claimableAfter1)}`)
  const withdrawAfter1 = await alice.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'withdraw', args: [] })
  await waitTx('withdraw – Alice (milestone 1)', withdrawAfter1)

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 6 — Pay-link flow: Seller2 creates unfunded; Bob2 funds it
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Scenario 6: Pay-link – Seller2 creates, Bob2 funds ──')
  const createHash2 = await seller2.writeContract({
    address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'createEscrow',
    args: [
      bob2Addr,
      '0x0000000000000000000000000000000000000000',  // no arbiter
      86400n,  // 1 day review window
      BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
      ['Logo design'],
      [usdc('1')],
    ],
  })
  await waitTx('createEscrow – Seller2 (Unfunded)', createHash2)

  const escrowId2 = (await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'escrowCount' })) - 1n
  console.log(`  Escrow ID: ${escrowId2}  (Unfunded – shareable as #/pay/${escrowId2})`)

  await approveUsdc(bob2, usdc('1'))
  const fundHash2 = await bob2.writeContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'fundEscrow', args: [escrowId2] })
  await waitTx('fundEscrow – Bob2 (pay-link)', fundHash2)
  console.log(`  Escrow ${escrowId2} is now Active`)

  // ─────────────────────────────────────────────────────────────────────────
  // Final reputation check
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n── Reputation ──')
  const [aliceComplete, aliceDisputed] = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'getReputation', args: [aliceAddr] })
  const [bobComplete,   bobDisputed  ] = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: MP_ABI, functionName: 'getReputation', args: [bobAddr] })
  console.log(`  Alice  — completed: ${aliceComplete},  disputed: ${aliceDisputed}`)
  console.log(`  Bob    — completed: ${bobComplete},    disputed: ${bobDisputed}`)

  console.log('\n══════════════════════════════════════════')
  console.log('  All scenarios completed successfully!')
  console.log('══════════════════════════════════════════\n')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('\n✗ Simulation failed:', msg)
  process.exit(1)
})
