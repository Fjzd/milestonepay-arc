# MilestonePay — USDC Milestone Escrow on Arc

MilestonePay is a USDC milestone escrow live on **Arc mainnet**, built end to end in **Arc Studio**.

A buyer funds a job in USDC, split into milestones. The seller marks each milestone delivered, the buyer approves, and the seller withdraws. If the buyer goes silent, funds auto-release after a review window. Disputes go to a pre-agreed arbiter who can split the payout. Sellers can share a pay link (`#/pay/<id>`), buyers can pay from Base, Ethereum or Arbitrum via Circle CCTP V2, and completed work builds on-chain reputation.

- **Live app:** https://illustrious-taffy-b35677.netlify.app
- **Arc Studio project:** https://studio.arc.io/app/934f1823-1290-4f23-a6ef-11b86cbc57f7
- **Demo video:** [docs/milestonepay-demo.mp4](docs/milestonepay-demo.mp4) ([download](https://github.com/Fjzd/milestonepay-arc/releases/download/v1.0/milestonepay-demo.mp4))
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

## Escrow #1 — cross-chain mainnet demo (0.5 USDC paid from Base)

The buyer held no USDC on Arc. They paid from **Base** with the in-app "Pay from Base / ETH / Arb" tab: USDC was burned on Base with CCTP V2, Circle's Forwarding Service minted it on Arc to the buyer's own wallet, and the buyer funded the escrow. Times are UTC+8.

| Step | Tx |
|---|---|
| Create escrow (Arc, 2026-10-18 21:37) | [0x24041d…40e8](https://explorer.arc.io/tx/0x24041d39cf82cf183d85807185de2d372fdc74c4b4b6e0226e6ec0367d1f40e8) |
| Burn on Base via CCTP V2 (2026-10-19 01:17, 0.536744 USDC) | [0x1a0d6c…6439](https://basescan.org/tx/0x1a0d6c3e2ab4a3575538bf9bcc155f36a7cfc7e6b6e00bdcfc01d218b4716439) |
| Mint on Arc via CCTP forwarding (01:17, 0.516651 USDC to buyer) | [0xa11f27…52c2](https://explorer.arc.io/tx/0xa11f276b420e7badc9e52945a5c23632229fc3aa1f157776150033f58bb952c2) |
| Fund escrow 0.5 USDC (01:28, buyer) | [0x627b94…d1d7](https://explorer.arc.io/tx/0x627b9479790ba70490b23a387ccaf7c876cb474c7bcb918ac8c0de6e77dcd1d7) |
| Deliver milestone (01:29, seller) | [0x183418…02d6](https://explorer.arc.io/tx/0x1834182c0660361073eb5203f593c73e5d7e280edcbd816465e171a2934802d6) |
| Approve milestone (01:30, buyer) | [0xab081c…20da](https://explorer.arc.io/tx/0xab081c47cec69a36b5ef57977f99f10da83d1d9b0be1edf8156e3980a5bd20da) |
| Seller withdraw 0.5 USDC (01:31, seller) | [0x5bfa68…5ec7](https://explorer.arc.io/tx/0x5bfa6815cb39d06f2632bd563c625a81b055a474f4e7f381af1e2a1511135ec7) |

Base burn 0.536744 USDC → Arc mint 0.516651 USDC (≈0.02 USDC CCTP fast fee + forwarding fee) → 0.5 USDC escrowed and released to the seller.

## Cross-chain pay (Circle CCTP V2)

Buyers can fund an Arc escrow with USDC held on **Base, Ethereum or Arbitrum**. No contract change or redeploy was needed.

1. **Fees.** The app calls Circle Iris `GET /v2/burn/USDC/fees/{srcDomain}/26?forward=true` (Arc = CCTP domain **26**) and reads the fast-transfer fee (`minimumFee`, in bps) plus the forwarding fee (`forwardFee`).
2. **Approve + burn on the source chain.** The buyer approves `TokenMessengerV2` (`0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`) and calls `depositForBurnWithHook(amount, 26, mintRecipient = buyer, usdc, 0x0, maxFee, 1000, hookData)`. `hookData` is the CCTP forwarding hook (`"cctp-forward"`, `0x636374702d666f7277617264…`).
3. **Mint on Arc.** Circle's Forwarding Service attests the burn and calls `receiveMessage` on Arc's `MessageTransmitterV2`, minting USDC to the **buyer's own wallet** on Arc. The buyer doesn't have to relay anything. A fast transfer settles in seconds.
4. **Fund.** The app polls Iris `/v2/messages/{srcDomain}?transactionHash=…` until it's complete, switches the wallet to Arc, and the buyer approves and calls `fundEscrow(id)` as usual. `fundEscrow` requires `msg.sender == buyer`, so USDC goes to the buyer first and the contract stays unchanged.

The code is in `src/cctp.ts` (constants, integer-only fee math, Iris polling) and `src/components/CrossChainPay.tsx` (UI flow). Tests: `bun test cctp.test.ts`. If the fast-transfer allowance runs out, the app falls back to a standard transfer (about 15–19 min).

## Buyer payment entry

- **Top-nav "Pay"** (`#/pay`): enter an order ID and open `#/pay/<id>`.
- **Dashboard → "Awaiting your payment"**: unfunded escrows where the connected wallet is the buyer, each with a **Pay now** button.
- **Seller "Copy pay link"**: the Dashboard lists the seller's unfunded escrows with a copy button.
- **After create**: the success screen shows the full pay link with Copy and Open buttons.
- The pay page (`#/pay/<id>`) has two tabs: **Pay on Arc** and **Pay from Base / ETH / Arb**.

## Stack

- Solidity contracts in `contracts/` (Foundry; 87 MilestonePay tests + 46 legacy escrow tests)
- Cross-chain pay: `src/cctp.ts`, `src/components/CrossChainPay.tsx` (CCTP V2 + Circle Forwarding Service), 38 Bun unit tests in `cctp.test.ts`
- React + Vite front end in `src/` with wagmi/viem and ConnectKit (WalletConnect, works with mobile wallets)
- `scripts/e2e-sim.ts`: end-to-end testnet scenarios (fund, deliver, approve, auto-release, dispute, arbiter resolve, pay link)

## Run locally

```bash
bun install
bun run dev            # front end
cd contracts && forge test
bun test cctp.test.ts  # CCTP fee math + encoding
```

Copy `.env.example` (if present) to `.env` and set `VITE_WALLETCONNECT_PROJECT_ID`. Never commit `.env`.
