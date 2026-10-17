# MilestonePay — USDC Milestone Escrow on Arc

MilestonePay is a USDC milestone escrow live on **Arc mainnet**, built end to end in **Arc Studio**.

A buyer funds a job in USDC, split into milestones. The seller marks each milestone delivered, the buyer approves, and the seller withdraws. If the buyer goes silent, funds auto-release after a review window. Disputes go to a pre-agreed arbiter who can split the payout. Sellers can share a pay link (`#/pay/<id>`), and completed work builds on-chain reputation.

- **Live app:** https://illustrious-taffy-b35677.netlify.app
- **Arc Studio project:** https://studio.arc.io/app/934f1823-1290-4f23-a6ef-11b86cbc57f7
- **Mainnet contract:** [`0x396ba33d1f7ed6fd1f92d9037e470807d5d23ada`](https://explorer.arc.io/address/0x396ba33d1f7ed6fd1f92d9037e470807d5d23ada)

## Mainnet demo (real USDC, escrow #0, 0.5 USDC)

| Step | Tx |
|---|---|
| Deploy | [0x2cbc9c…01d7](https://explorer.arc.io/tx/0x2cbc9cf896d6c2235537ee6c766e866b1b447929445802879435f60b180b01d7) |
| Create escrow | [0x9b440f…8e0f](https://explorer.arc.io/tx/0x9b440fbac085dde01853bd9c41e1ba7760d646426bdc08b41e491c4fed128e0f) |
| Fund 0.5 USDC | [0x12ccb3…6390](https://explorer.arc.io/tx/0x12ccb3fc42e327ea9064a337b2365edcc98648ee2ba63613e5656a7961b16390) |
| Deliver | [0xb28ea4…2f70](https://explorer.arc.io/tx/0xb28ea40e3c9934747ea4819bcc6444c575f84a21c3e8a08d1477ab18ae112f70) |
| Approve | [0x4dcb05…e22f](https://explorer.arc.io/tx/0x4dcb05f11cdaebd452f4165d256c992ea468c8f9bdf0b4ee90d16b76cf24e22f) |
| Seller withdraw 0.5 USDC | [0x3a4f96…3547](https://explorer.arc.io/tx/0x3a4f965def0ed1b76b6dfb1e37c8959b26c79c9ec8d7454f2c6a8288930e3547) |

## Stack

- Solidity contracts in `contracts/` (Foundry, 87 tests)
- React + Vite front end in `src/` with wagmi/viem and ConnectKit (WalletConnect, works with mobile wallets)
- `scripts/e2e-sim.ts`: end-to-end testnet scenarios (fund, deliver, approve, auto-release, dispute, arbiter resolve, pay link)

## Run locally

```bash
bun install
bun run dev            # front end
cd contracts && forge test
```

Copy `.env.example` (if present) to `.env` and set `VITE_WALLETCONNECT_PROJECT_ID`. Never commit `.env`.
