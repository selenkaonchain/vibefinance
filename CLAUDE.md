# CLAUDE.md — PILL Flip Casino

## Project Description
PILL Flip Casino is a provably fair gambling game built on Bitcoin Layer 1 with OP_NET.
Users connect OP_WALLET, flip the pill, and results are verified via block hashes.
Built using BOB MCP (`claude mcp add opnet-bob --transport http https://ai.opnet.org/mcp`).

## BOB Integration
- Package versions and vite.config.ts from BOB's `opnet_opnet_dev` tool (setup section)
- Network configuration from BOB's frontend guidelines: `networks.opnetTestnet` (NOT `networks.testnet`)
- Provider pattern: singleton `JSONRpcProvider({ url, network })` per BOB's caching guidelines
- Contract interaction: `getContract<IOP20Contract>(addr, OP_20_ABI, provider, network, sender?)` per BOB

## Package Rules
### ALWAYS Use
- `opnet@rc` — OPNet SDK, JSONRpcProvider, getContract, ABIs
- `@btc-vision/bitcoin@rc` — Bitcoin library (OPNet fork, includes `networks.opnetTestnet`)
- `@btc-vision/transaction@rc` — Transaction types and ABI data types
- `@btc-vision/walletconnect@latest` — Wallet connection modal
- `react` — UI framework
- `vite` + `vite-plugin-node-polyfills` — Build tool with Node.js polyfills

### NEVER Use
- `bitcoinjs-lib`, `ethers`, `web3`, `@metamask/sdk`
- `window.ethereum`
- `express`
- `networks.testnet` — Use `networks.opnetTestnet` instead!

## Wallet Integration
- Use `@btc-vision/walletconnect` for the connection modal
- ALWAYS include the WalletConnect popup CSS fix (mandatory per BOB)
- signer and mldsaSigner are NULL on frontend — wallet extension signs
- Use `useWalletConnect()` hook for wallet state

## Contract Interaction
- Create SEPARATE `JSONRpcProvider({ url, network })` for read operations
- Testnet: `https://testnet.opnet.org` with `networks.opnetTestnet`
- ALWAYS check `'error' in result` before using contract call results
- NEVER put private keys in frontend code

## Provably Fair System
- Game outcome derived from OP_NET block hash last hex digit
- 0-7 = PILL (wins), 8-F = SKULL (loses)
- Block hash is fetched live from testnet — verifiable on OPScan

## Build and Dev
- `npm install` — install dependencies
- `npm run dev` — start dev server
- `npm run build` — production build to `dist/`
