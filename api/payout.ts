import type { VercelRequest, VercelResponse } from '@vercel/node';
import { JSONRpcProvider, getContract, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { EcKeyPair, Address } from '@btc-vision/transaction';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';
const PILL_CONTRACT = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

// Singleton provider
let _provider: JSONRpcProvider | null = null;
function getProvider(): JSONRpcProvider {
    if (!_provider) {
        _provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    }
    return _provider;
}

/**
 * POST /api/payout
 * Body: { playerAddress: string, amount: string, blockHash: string, blockHeight: number, betChoice: string }
 *
 * Verifies the game result from the block hash, then sends PILL from house to player.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { playerAddress, amount, blockHash, blockHeight, betChoice } = req.body;

        // Validate inputs
        if (!playerAddress || !amount || !blockHash || !blockHeight || !betChoice) {
            return res.status(400).json({ error: 'Missing fields: playerAddress, amount, blockHash, blockHeight, betChoice' });
        }

        const betAmountBigInt = BigInt(amount);
        if (betAmountBigInt <= 0n) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        // Verify the game result: last hex digit of block hash
        const lastChar = blockHash.slice(-1).toLowerCase();
        const val = parseInt(lastChar, 16);
        const blockResult = val < 8 ? 'pill' : 'skull';

        // Player wins if their bet matches the result
        if (blockResult !== betChoice) {
            return res.status(400).json({ error: 'Player did not win this round', blockResult, betChoice });
        }

        // Verify block hash is real by fetching from chain
        const provider = getProvider();
        let realBlock;
        try {
            realBlock = await provider.getBlock(blockHeight);
        } catch (e) {
            return res.status(500).json({ error: 'Failed to fetch block from chain' });
        }

        if (!realBlock || realBlock.hash !== blockHash) {
            return res.status(400).json({ error: 'Block hash mismatch — possible tampering' });
        }

        // Get house WIF from environment
        const houseWIF = process.env.HOUSE_WIF;
        if (!houseWIF) {
            return res.status(500).json({ error: 'House wallet not configured' });
        }

        // Create signer from WIF
        const signer = EcKeyPair.fromWIF(houseWIF, NETWORK);
        const houseRefundAddress = EcKeyPair.getTaprootAddress(signer, NETWORK);
        const housePubKeyHex = '0x' + Buffer.from(signer.publicKey).toString('hex');
        const houseAddress = Address.fromString(housePubKeyHex);

        // Resolve player address → Address object
        let playerAddr: Address | undefined;
        try {
            playerAddr = await provider.getPublicKeyInfo(playerAddress, false);
        } catch {
            // ignore
        }

        if (!playerAddr) {
            return res.status(400).json({ error: 'Cannot resolve player public key from address. Player needs on-chain history.' });
        }

        // Create contract with house as sender
        const contract = getContract<IOP20Contract>(
            PILL_CONTRACT,
            OP_20_ABI,
            provider,
            NETWORK,
            houseAddress,
        );

        // Payout = 2x the bet (player sent 1x to house, house sends 2x back)
        const payoutAmount = betAmountBigInt * 2n;

        console.log(`[PAYOUT] Sending ${payoutAmount} PILL to ${playerAddress}`);

        // Simulate
        const simulation = await contract.transfer(playerAddr, payoutAmount);

        if (simulation.revert) {
            return res.status(500).json({ error: `Transfer simulation reverted: ${simulation.revert}` });
        }

        // Sign and broadcast
        const receipt = await simulation.sendTransaction({
            signer,
            mldsaSigner: null,
            refundTo: houseRefundAddress,
            maximumAllowedSatToSpend: 100000n,
            feeRate: 10,
            network: NETWORK,
        });

        console.log('[PAYOUT] Transaction sent:', receipt);

        return res.status(200).json({
            success: true,
            payout: payoutAmount.toString(),
            receipt: typeof receipt === 'object' ? JSON.stringify(receipt) : String(receipt),
        });
    } catch (err: any) {
        console.error('[PAYOUT] Error:', err);
        return res.status(500).json({
            error: err?.message || 'Internal server error',
        });
    }
}
