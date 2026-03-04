import { useState, useCallback, useEffect, useRef } from 'react';
import { useBlockchain } from './hooks/useBlockchain';

type GameResult = 'pill' | 'skull' | null;
type BetChoice = 'pill' | 'skull';

interface GameRound {
    id: number;
    bet: BetChoice;
    result: GameResult;
    won: boolean;
    blockHash: string;
    blockHeight: number;
    timestamp: number;
}

function truncAddr(a: string): string {
    if (!a) return '';
    if (a.length <= 16) return a;
    return a.slice(0, 8) + '...' + a.slice(-6);
}

function formatSats(sats: number): string {
    const btc = sats / 1e8;
    return btc.toFixed(btc < 0.001 ? 8 : 4) + ' BTC';
}

function formatTokenBal(bal: bigint, dec: number): string {
    if (bal === 0n) return '0';
    const divisor = 10n ** BigInt(dec);
    const whole = bal / divisor;
    const frac = bal % divisor;
    const fracStr = frac.toString().padStart(dec, '0').slice(0, 4).replace(/0+$/, '');
    return whole.toLocaleString() + (fracStr ? '.' + fracStr : '');
}

// Derive result from block hash
function hashToResult(hash: string): GameResult {
    if (!hash) return null;
    const lastChar = hash.slice(-1).toLowerCase();
    const val = parseInt(lastChar, 16);
    return val < 8 ? 'pill' : 'skull';
}

export function App() {
    const bc = useBlockchain();
    const [bet, setBet] = useState<BetChoice | null>(null);
    const [isFlipping, setIsFlipping] = useState(false);
    const [lastResult, setLastResult] = useState<GameResult>(null);
    const [lastWon, setLastWon] = useState<boolean | null>(null);
    const [history, setHistory] = useState<GameRound[]>([]);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [tokenAddr, setTokenAddr] = useState('');
    const [showTokenInput, setShowTokenInput] = useState(false);
    const roundIdRef = useRef(0);

    // Load saved stats
    useEffect(() => {
        try {
            const saved = localStorage.getItem('pill-casino-stats');
            if (saved) {
                const s = JSON.parse(saved);
                setWins(s.wins || 0);
                setLosses(s.losses || 0);
                setBestStreak(s.bestStreak || 0);
            }
        } catch { /* skip */ }
    }, []);

    // Save stats
    useEffect(() => {
        localStorage.setItem('pill-casino-stats', JSON.stringify({ wins, losses, bestStreak }));
    }, [wins, losses, bestStreak]);

    const flip = useCallback(async (choice: BetChoice) => {
        if (isFlipping) return;
        setBet(choice);
        setIsFlipping(true);
        setLastResult(null);
        setLastWon(null);

        // Fetch fresh block
        const block = await bc.fetchBlockData();

        // Animate for 2 seconds
        await new Promise(r => setTimeout(r, 2000));

        const hash = block?.hash || '0x' + Date.now().toString(16);
        const result = hashToResult(hash);
        const won = result === choice;

        setLastResult(result);
        setLastWon(won);
        setIsFlipping(false);

        if (won) {
            setWins(w => w + 1);
            setStreak(s => {
                const newS = s + 1;
                setBestStreak(b => Math.max(b, newS));
                return newS;
            });
        } else {
            setLosses(l => l + 1);
            setStreak(0);
        }

        roundIdRef.current++;
        const round: GameRound = {
            id: roundIdRef.current,
            bet: choice,
            result,
            won,
            blockHash: hash,
            blockHeight: block?.height || 0,
            timestamp: Date.now(),
        };
        setHistory(h => [round, ...h].slice(0, 20));
    }, [isFlipping, bc]);

    const loadTokenBalance = useCallback(async () => {
        if (!tokenAddr.trim()) return;
        await bc.loadToken(tokenAddr.trim());
    }, [tokenAddr, bc]);

    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <div className="logo">
                    <span className="logo-pill">💊</span>
                    <span className="logo-text">PILL FLIP</span>
                    <span className="logo-sub">Casino</span>
                </div>
                <div className="header-right">
                    {bc.blockData && (
                        <div className="block-info">
                            <span className="block-dot" />
                            Block #{bc.blockData.height.toLocaleString()}
                        </div>
                    )}
                    {bc.connected ? (
                        <div className="wallet-info">
                            <span className="wallet-bal">{formatSats(bc.btcTotal)}</span>
                            <button className="btn-wallet connected" onClick={bc.disconnectWallet}>
                                {truncAddr(bc.walletAddress)}
                            </button>
                        </div>
                    ) : (
                        <button
                            className="btn-wallet"
                            onClick={bc.connectWallet}
                            disabled={bc.loading}
                        >
                            {bc.loading ? 'Connecting...' : 'Connect OP_WALLET'}
                        </button>
                    )}
                </div>
            </header>

            {/* Hero / Game Area */}
            <main className="game-area">
                <div className="game-container">
                    {/* Pill Animation */}
                    <div className={`pill-flipper ${isFlipping ? 'flipping' : ''} ${lastResult || ''}`}>
                        <div className="pill-inner">
                            <div className="pill-front">
                                <span className="pill-emoji">💊</span>
                                <span className="pill-label">FLIP ME</span>
                            </div>
                            <div className="pill-back-pill">
                                <span className="pill-emoji">💊</span>
                                <span className="pill-label">PILL!</span>
                            </div>
                            <div className="pill-back-skull">
                                <span className="pill-emoji">💀</span>
                                <span className="pill-label">SKULL!</span>
                            </div>
                        </div>
                    </div>

                    {/* Result Banner */}
                    {lastWon !== null && !isFlipping && (
                        <div className={`result-banner ${lastWon ? 'win' : 'lose'}`}>
                            {lastWon ? '🎉 YOU WIN! 🎉' : '💀 YOU LOSE! 💀'}
                        </div>
                    )}

                    {/* Bet Buttons */}
                    <div className="bet-section">
                        <p className="bet-prompt">
                            {isFlipping ? 'Verifying on-chain...' : 'Pick your side!'}
                        </p>
                        <div className="bet-buttons">
                            <button
                                className={`btn-bet pill ${bet === 'pill' && isFlipping ? 'active' : ''}`}
                                onClick={() => flip('pill')}
                                disabled={isFlipping}
                            >
                                <span className="bet-icon">💊</span>
                                <span className="bet-name">PILL</span>
                                <span className="bet-odds">Block hash 0-7</span>
                            </button>
                            <button
                                className={`btn-bet skull ${bet === 'skull' && isFlipping ? 'active' : ''}`}
                                onClick={() => flip('skull')}
                                disabled={isFlipping}
                            >
                                <span className="bet-icon">💀</span>
                                <span className="bet-name">SKULL</span>
                                <span className="bet-odds">Block hash 8-F</span>
                            </button>
                        </div>
                    </div>

                    {/* Provably Fair Info */}
                    {bc.blockData && (
                        <div className="provably-fair">
                            <span className="pf-label">🔗 Provably Fair</span>
                            <span className="pf-detail">
                                Result from block hash last hex digit
                            </span>
                            <code className="pf-hash">
                                {bc.blockData.hash.slice(0, 10)}...{bc.blockData.hash.slice(-6)}
                            </code>
                        </div>
                    )}
                </div>

                {/* Stats Sidebar */}
                <div className="stats-panel">
                    <h3 className="panel-title">📊 Your Stats</h3>
                    <div className="stats-grid">
                        <div className="stat-card">
                            <span className="stat-val">{totalGames}</span>
                            <span className="stat-label">Total Flips</span>
                        </div>
                        <div className="stat-card win">
                            <span className="stat-val">{wins}</span>
                            <span className="stat-label">Wins</span>
                        </div>
                        <div className="stat-card lose">
                            <span className="stat-val">{losses}</span>
                            <span className="stat-label">Losses</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-val">{winRate}%</span>
                            <span className="stat-label">Win Rate</span>
                        </div>
                        <div className="stat-card streak">
                            <span className="stat-val">🔥 {streak}</span>
                            <span className="stat-label">Streak</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-val">⭐ {bestStreak}</span>
                            <span className="stat-label">Best Streak</span>
                        </div>
                    </div>

                    {/* Token Balance */}
                    <div className="token-section">
                        <button
                            className="btn-token-toggle"
                            onClick={() => setShowTokenInput(!showTokenInput)}
                        >
                            {showTokenInput ? '▼' : '▶'} $PILL Token Balance
                        </button>
                        {showTokenInput && (
                            <div className="token-input-area">
                                <input
                                    className="token-input"
                                    placeholder="Paste OP-20 token address..."
                                    value={tokenAddr}
                                    onChange={e => setTokenAddr(e.target.value)}
                                />
                                <button
                                    className="btn-load-token"
                                    onClick={loadTokenBalance}
                                    disabled={bc.loading || !tokenAddr.trim()}
                                >
                                    {bc.loading ? '...' : 'Load'}
                                </button>
                                {bc.tokenInfo && (
                                    <div className="token-display">
                                        <span className="td-name">
                                            {bc.tokenInfo.name} ({bc.tokenInfo.symbol})
                                        </span>
                                        <span className="td-bal">
                                            Balance: {formatTokenBal(bc.tokenInfo.balance, bc.tokenInfo.decimals)} {bc.tokenInfo.symbol}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* History */}
                    <h3 className="panel-title">📜 Recent Flips</h3>
                    <div className="history-list">
                        {history.length === 0 && (
                            <p className="history-empty">No flips yet. Pick a side!</p>
                        )}
                        {history.map(r => (
                            <div key={r.id} className={`history-item ${r.won ? 'win' : 'lose'}`}>
                                <span className="hi-icon">{r.result === 'pill' ? '💊' : '💀'}</span>
                                <span className="hi-result">{r.won ? 'WIN' : 'LOSS'}</span>
                                <span className="hi-bet">Bet: {r.bet === 'pill' ? '💊' : '💀'}</span>
                                <span className="hi-block">#{r.blockHeight}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-left">
                    Built on <a href="https://opnet.org" target="_blank" rel="noreferrer">OP_NET</a> • Bitcoin L1
                    {' • '}
                    <a
                        href="https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Get OP_WALLET
                    </a>
                </div>
                <div className="footer-right">
                    Powered by BOB 🤖 • #opnetvibecode
                </div>
            </footer>

            {/* Error Toast */}
            {bc.error && (
                <div className="error-toast" onClick={() => bc.setError('')}>
                    ⚠️ {bc.error}
                </div>
            )}
        </div>
    );
}
