# 💊 PILL Flip Casino — Provably Fair Gambling on Bitcoin L1

> Flip the pill. Win or die. Every result verified on-chain via OP_NET block hashes.

![Bitcoin](https://img.shields.io/badge/Bitcoin-L1-orange?style=flat-square&logo=bitcoin&logoColor=white)
![OP_NET](https://img.shields.io/badge/OP__NET-Powered-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-React-blue?style=flat-square&logo=typescript)
![BOB](https://img.shields.io/badge/Built_with-BOB_MCP-purple?style=flat-square)

## What is PILL Flip Casino?

PILL Flip Casino is a **provably fair** coin-flip gambling game built on Bitcoin Layer 1 using OP_NET. Connect your OP_WALLET, flip the pill, and see if fate favors you — every outcome is derived from real block hashes on the OP_NET testnet, fully verifiable on [OPScan](https://testnet.opscan.org).

### How It Works

1. **Connect** your OP_WALLET
2. **Flip** the pill 💊
3. **Win** (PILL 💊) or **Lose** (SKULL 💀)
4. **Verify** — the result comes from the latest block hash

### Provably Fair System

The game outcome is determined by the **last hex digit** of the latest OP_NET block hash:

| Hex Digit | Result |
|-----------|--------|
| `0–7` | 💊 **PILL** (You win!) |
| `8–F` | 💀 **SKULL** (You lose!) |

This gives a true **50/50** probability. Every block hash is publicly visible on the OP_NET testnet explorer — no hidden RNG, no server-side manipulation.

Built for the **OP_NET Vibecode Challenge — Week 2: The DeFi Signal**.

## Features

- **Provably Fair** — Outcomes derived from on-chain block hashes, verifiable on OPScan
- **Wallet Integration** — OP_WALLET connection via `@btc-vision/walletconnect`
- **Live Block Data** — Real-time block height and hash from OP_NET testnet
- **Token Balance Loader** — Paste any OP-20 token address to check your balance
- **Stats Tracking** — Wins, losses, current streak, best streak (persisted in localStorage)
- **Game History** — Scrollable log of every flip with block hash proof
- **Casino Theme** — Dark neon UI with flip animations and glowing effects
- **Responsive** — Works on desktop and mobile
- **Built with BOB** — Developed using the official OP_NET BOB MCP agent for correct SDK usage

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 7 + `vite-plugin-node-polyfills` |
| Blockchain | OP_NET (Bitcoin L1) |
| Network | `networks.opnetTestnet` via `@btc-vision/bitcoin@rc` |
| SDK | `opnet@rc`, `@btc-vision/transaction@rc` |
| Wallet | OP_WALLET via `@btc-vision/walletconnect@latest` |
| AI Agent | BOB MCP (`https://ai.opnet.org/mcp`) |

## Getting Started

### Prerequisites
- Node.js >= 18
- [OP_WALLET browser extension](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb)

### Install & Run
```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production
```bash
npm run build
```

Output goes to `dist/` — deploy to Vercel, IPFS, or any static host.

## BOB MCP Integration

This project was built using **BOB** — the official OP_NET AI coding agent. BOB provided:

- Correct `rc` package versions for all OP_NET dependencies
- Production-ready `vite.config.ts` with Node.js polyfills and aliases
- Network configuration guidance (`networks.opnetTestnet`, NOT `networks.testnet`)
- Provider singleton pattern with `JSONRpcProvider({ url, network })`
- Contract interaction patterns with proper error checking

BOB MCP endpoint: `https://ai.opnet.org/mcp`

## Competition

**OP_NET Vibecode Challenge — Week 2: The DeFi Signal**

- Theme: Build DeFi tools on Bitcoin L1
- Prize Pool: 9 Motocats + 45M $PILL
- All verified builders receive 250,000 $PILL

**#opnetvibecode** · [@opnetbtc](https://x.com/opnetbtc)

## License

MIT
