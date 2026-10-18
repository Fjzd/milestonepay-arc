# MilestonePay

> Built with Arc Studio - money-powered apps in minutes

Freelance escrow with per-milestone USDC releases, auto-release, optional arbiter, shareable payment links, and on-chain reputation.

---

## What This App Does

MilestonePay lets freelancers create multi-milestone USDC escrows on Arc. Each milestone can be individually released, auto-released after a configurable review window, disputed, and resolved by an optional neutral arbiter or by mutual consent. Buyers fund escrows via a shareable payment link. On-chain reputation (completed vs disputed escrows per address) is exposed on profile pages.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, Arc Light design system
- Web3: wagmi v2, viem v2, ConnectKit + WalletConnect QR
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`.
- Wallet: injected + WalletConnect QR (mobile wallets)
- Default chain: Arc Mainnet (Chain ID: 5042); Arc Testnet (5042002) selectable
- Token: USDC (6 decimals, 0x3600000000000000000000000000000000000000, same on both chains)
- Cross-chain pay: CCTP V2 `depositForBurnWithHook` (Base/Ethereum/Arbitrum → Arc) via Circle Forwarding Service
- Iris polling: `https://iris-api.circle.com/v2/messages/{srcDomain}?transactionHash={burnTx}` until `status=complete`
- Routing: hash-based (src/components/Router.tsx)
- Toasts: Sonner

## Deployed Contracts

| Contract | Address | Network | Explorer | Deploy Tx |
|---|---|---|---|---|
| MilestonePay | `0x396ba33d1f7ed6fd1f92d9037e470807d5d23ada` | Arc Mainnet (5042) | [explorer.arc.io](https://explorer.arc.io/address/0x396ba33d1f7ed6fd1f92d9037e470807d5d23ada) | [0x2cbc9c…](https://explorer.arc.io/tx/0x2cbc9cf896d6c2235537ee6c766e866b1b447929445802879435f60b180b01d7) |
| MilestonePay | `0x019342cba4562c03ac36ba2d6c2652d65f99d545` | Arc Testnet (5042002) | [explorer.testnet.arc.io](https://explorer.testnet.arc.io/address/0x019342cba4562c03ac36ba2d6c2652d65f99d545) | — |

Constructor arg: USDC address `0x3600000000000000000000000000000000000000` (same on both chains)

Deployed by: `0x9421b89ffd0453304c7dc3eb2829e300d26a52d8`

## Key Files

- `src/App.tsx` — router root
- `src/contract.ts` — ABI import + contract address + type helpers
- `src/components/Router.tsx` — hash-based router (no external dep)
- `src/components/Header.tsx` — nav header
- `src/components/Dashboard.tsx` — / — escrow list for connected wallet
- `src/components/CreateEscrow.tsx` — /create — seller creates escrow
- `src/components/EscrowDetail.tsx` — /escrow/:id — full milestone management
- `src/components/PayLink.tsx` — /pay/:id — buyer-facing funding page with Arc + cross-chain tabs
- `src/components/CrossChainPay.tsx` — CCTP V2 bridge+fund flow (Base/ETH/Arb → Arc)
- `src/components/Profile.tsx` — /profile, /profile/:address — on-chain reputation
- `src/components/ui.tsx` — shared UI primitives (Card, Button, Input, Badge, etc.)
- `src/cctp.ts` — CCTP V2 constants, ABIs, fee math, hookData, Iris polling
- `src/config.ts` — wagmi config (Arc Mainnet default + Arc Testnet, Base, Ethereum, Arbitrum)
- `cctp.test.ts` — 25 Bun unit tests for fee math, hookData, address encoding, chain config
- `contracts/MilestonePay.sol` — main contract
- `contracts/test/MilestonePayTest.t.sol` — 87 Foundry unit tests (all pass)

## Contract Surface

- `createEscrow(buyer, arbiter, reviewWindowSeconds, deadline, descriptions[], amounts[])` — seller creates unfunded escrow
- `fundEscrow(id)` — buyer funds
- `deliverMilestone(id, i)` — seller marks delivered
- `approveMilestone(id, i)` — buyer approves (USDC to claimable)
- `disputeMilestone(id, i)` — buyer disputes within review window
- `claimAutoRelease(id, i)` — seller claims after review window passes
- `resolveDispute(id, i, sellerBps)` — arbiter splits disputed milestone
- `proposeMutualResolution(id, i, sellerBps)` / `acceptMutualResolution(id, i)` — no-arbiter mutual split
- `resolveDisputeTimeout(id, i)` — either party claims 100% after 4x review window
- `refundMilestone(id, i)` — buyer refunds pending/delivered milestones
- `cancelActiveEscrow(id)` / `cancelUnfundedEscrow(id)` — seller cancels
- `withdraw()` / `withdrawTo(addr)` — pull USDC from claimable balance
- `getReputation(addr)` — (completed, disputed) counts per address

## To Run

```bash
bun install
bun run dev
```

## Old Contract

The original `MilestoneEscrow.sol` (single-milestone) is still in `contracts/` for reference.
