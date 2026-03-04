import { useState, useEffect, useCallback, useRef } from 'react';
import { JSONRpcProvider, getContract, IOP20Contract, OP_20_ABI } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';

/*
  RULES (from vibecode.finance/bible CLAUDE.md):
  - Create a SEPARATE JSONRpcProvider for ALL read operations
  - NEVER use the WalletConnect provider for reads — only for signing
  - Always simulate before sending
  - signer and mldsaSigner are NULL on frontend — wallet extension signs
*/

/* ---- Network RPC endpoints ---- */
const RPC: Record<string, string> = {
  testnet: 'https://testnet.opnet.org',
  mainnet: 'https://mainnet.opnet.org',
  regtest: 'https://regtest.opnet.org',
};

function getNetworkName(network: Network | null): string {
  if (!network) return 'testnet';
  const n = network as unknown as Record<string, unknown>;
  if (typeof n.network === 'string') return n.network;
  if (network.bech32 === 'bc') return 'mainnet';
  if (network.bech32 === 'tb') return 'testnet';
  if (network.bech32 === 'bcrt') return 'regtest';
  return 'testnet';
}

function getBitcoinNetwork(name: string): Network {
  if (name === 'mainnet') return networks.bitcoin;
  if (name === 'regtest') return networks.regtest;
  return networks.testnet;
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  userBalance: bigint;
}

export interface TxRecord {
  id: string;
  type: 'query' | 'transfer' | 'error';
  description: string;
  timestamp: number;
}

export function useBlockchain() {
  const wallet = useWalletConnect();

  const walletAddress = wallet.walletAddress ?? null;
  const walletNetwork = wallet.network ?? null;
  const walletInstance = wallet.walletInstance ?? null;
  // Bridge Address type mismatch between walletconnect's bundled @btc-vision/transaction
  // and our direct install — both are structurally identical at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletAddr: any = wallet.address ?? null;
  const connecting = wallet.connecting;
  const openConnectModal = wallet.openConnectModal;
  const disconnectWallet = wallet.disconnect;
  const walletBalance = wallet.walletBalance ?? null;

  /* ---- derived ---- */
  const networkName = getNetworkName(walletNetwork);
  const btcNetwork: Network = walletNetwork ?? getBitcoinNetwork(networkName);
  const isConnected = Boolean(walletAddress);

  /* ---- state ---- */
  const [blockHeight, setBlockHeight] = useState<bigint | null>(null);
  const [loadingBlock, setLoadingBlock] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [txLog, setTxLog] = useState<TxRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const providerRef = useRef<JSONRpcProvider | null>(null);

  /* ---- helpers ---- */
  const log = useCallback((type: TxRecord['type'], description: string) => {
    setTxLog((prev) => [
      { id: crypto.randomUUID(), type, description, timestamp: Date.now() },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Create a SEPARATE read-only JSONRpcProvider (per docs: NEVER use wallet provider for reads)
   */
  const getReadProvider = useCallback((): JSONRpcProvider | null => {
    if (providerRef.current) return providerRef.current;
    const rpc = RPC[networkName] || RPC.testnet;
    try {
      providerRef.current = new JSONRpcProvider(rpc, btcNetwork);
      return providerRef.current;
    } catch (e) {
      console.error('Failed to create read provider:', e);
      return null;
    }
  }, [networkName, btcNetwork]);

  /* Reset provider when network changes */
  useEffect(() => {
    providerRef.current = null;
  }, [networkName]);

  /* ---- Fetch latest block height ---- */
  const fetchBlockHeight = useCallback(async () => {
    const p = getReadProvider();
    if (!p) return;
    setLoadingBlock(true);
    try {
      const height = await p.getBlockNumber();
      setBlockHeight(height);
    } catch (e: unknown) {
      console.error('getBlockNumber error:', e);
    } finally {
      setLoadingBlock(false);
    }
  }, [getReadProvider]);

  useEffect(() => {
    fetchBlockHeight();
    const iv = setInterval(fetchBlockHeight, 30_000);
    return () => clearInterval(iv);
  }, [fetchBlockHeight]);

  /* ---- Query OP20 token ---- */
  const queryToken = useCallback(
    async (contractAddress: string) => {
      const p = getReadProvider();
      if (!p) {
        setError('No RPC provider — check network connection');
        return;
      }
      setLoadingToken(true);
      setError(null);
      setTokenInfo(null);

      try {
        // Step 1: Create the contract instance
        // getContract validates the address — if it's not P2OP/P2PK it throws
        let contract: ReturnType<typeof getContract<IOP20Contract>>;
        try {
          contract = getContract<IOP20Contract>(
            contractAddress,
            OP_20_ABI,
            p,
            btcNetwork,
            walletAddr ?? undefined,
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Invalid contract address: ${msg}`);
        }

        let name = 'Unknown';
        let symbol = '???';
        let decimals = 8;
        let totalSupply = 0n;

        // Step 2: Try metadata() — single call, most efficient
        // SDK's callFunction THROWS on revert/error — it does NOT return .revert
        let metadataWorked = false;
        try {
          const meta = await contract.metadata();
          name = meta.properties.name || name;
          symbol = meta.properties.symbol || symbol;
          decimals = meta.properties.decimals ?? decimals;
          totalSupply = meta.properties.totalSupply ?? totalSupply;
          metadataWorked = true;
        } catch (metaErr: unknown) {
          // metadata() not implemented by this contract — fall through to individual calls
          const msg = metaErr instanceof Error ? metaErr.message : String(metaErr);
          console.warn('metadata() failed:', msg);
        }

        // Step 3: If metadata() failed, try individual calls — show each error
        if (!metadataWorked) {
          const errors: string[] = [];

          try {
            const r = await contract.name();
            name = r.properties.name || name;
          } catch (e: unknown) {
            errors.push(`name(): ${e instanceof Error ? e.message : e}`);
          }

          try {
            const r = await contract.symbol();
            symbol = r.properties.symbol || symbol;
          } catch (e: unknown) {
            errors.push(`symbol(): ${e instanceof Error ? e.message : e}`);
          }

          try {
            const r = await contract.decimals();
            decimals = r.properties.decimals ?? decimals;
          } catch (e: unknown) {
            errors.push(`decimals(): ${e instanceof Error ? e.message : e}`);
          }

          try {
            const r = await contract.totalSupply();
            totalSupply = r.properties.totalSupply ?? totalSupply;
          } catch (e: unknown) {
            errors.push(`totalSupply(): ${e instanceof Error ? e.message : e}`);
          }

          // If ALL individual calls also failed, surface it
          if (errors.length === 4) {
            throw new Error(`All contract calls failed. First error: ${errors[0]}`);
          }
          if (errors.length > 0) {
            console.warn('Some token queries failed:', errors);
          }
        }

        // Step 4: Fetch user balance if connected
        let userBalance = 0n;
        if (walletAddr) {
          try {
            const balRes = await contract.balanceOf(walletAddr);
            userBalance = balRes.properties.balance ?? 0n;
          } catch (e: unknown) {
            console.warn('balanceOf() failed:', e instanceof Error ? e.message : e);
          }
        }

        const info: TokenInfo = {
          address: contractAddress,
          name,
          symbol,
          decimals,
          totalSupply,
          userBalance,
        };
        setTokenInfo(info);
        log('query', `Queried ${symbol} (${name}) at ${contractAddress.slice(0, 12)}...`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        log('error', msg.slice(0, 80));
      } finally {
        setLoadingToken(false);
      }
    },
    [getReadProvider, btcNetwork, walletAddr, log],
  );

  /* ---- Transfer OP20 tokens ---- */
  const transferToken = useCallback(
    async (contractAddress: string, recipientAddress: string, amount: bigint) => {
      if (!walletInstance?.web3) {
        setError('Wallet not connected or web3 provider unavailable');
        return;
      }
      // Use SEPARATE read provider for simulation (per docs)
      const p = getReadProvider();
      if (!p) {
        setError('No RPC provider available');
        return;
      }

      setTransferring(true);
      setError(null);
      try {
        const contract = getContract<IOP20Contract>(
          contractAddress,
          OP_20_ABI,
          p,
          btcNetwork,
          walletAddr ?? undefined,
        );

        // 1) Simulate transfer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const simResult = await (contract as any).transfer(recipientAddress, amount);
        if (!simResult?.calldata) {
          throw new Error('Transaction simulation failed — no calldata returned');
        }

        // 2) Wallet extension signs and broadcasts
        const web3 = walletInstance.web3;
        const result = await web3.signAndBroadcastInteraction({
          calldata: simResult.calldata,
          to: contractAddress,
          network: btcNetwork,
          feeRate: 10,
          priorityFee: 1000n,
          gasSatFee: simResult.estimatedSatGas ?? 10000n,
          utxos: [],
        } as any);

        const txId = result?.[3] ?? 'submitted';
        log('transfer', `Sent tokens → tx: ${String(txId).slice(0, 16)}...`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Transfer failed: ${msg}`);
        log('error', `Transfer failed: ${msg.slice(0, 60)}`);
      } finally {
        setTransferring(false);
      }
    },
    [walletInstance, getReadProvider, btcNetwork, walletAddr, log],
  );

  return {
    isConnected,
    walletAddress,
    walletBalance,
    networkName,
    connecting,
    connect: openConnectModal,
    disconnect: disconnectWallet,
    blockHeight,
    loadingBlock,
    fetchBlockHeight,
    tokenInfo,
    loadingToken,
    queryToken,
    transferring,
    transferToken,
    txLog,
    error,
    clearError,
  };
}
