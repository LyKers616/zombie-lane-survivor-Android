
import React, { useState, useEffect } from 'react';
import GameEngine from './components/GameEngine';
import { getMissionIntel } from './services/missionIntelService';
import { GameMode, GameSessionResult, LeaderboardEntry, MetaUpgrades } from './types';

const App: React.FC = () => {
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<'MENU' | 'INTEL' | 'PLAYING' | 'LEADERBOARD' | 'UPGRADES'>('MENU');
  const [mode, setMode] = useState<GameMode>('CAMPAIGN');
  const [totalScore, setTotalScore] = useState(0);
  const [intel, setIntel] = useState<any>(null);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);
  const [endlessLeaderboard, setEndlessLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [highlightEntryAt, setHighlightEntryAt] = useState<number | null>(null);

  const [walletCoins, setWalletCoins] = useState(0);
  const [metaUpgrades, setMetaUpgrades] = useState<MetaUpgrades>({
    playerMaxHpLevel: 0,
    playerDamageReductionLevel: 0,
    weaponDamageLevel: 0,
    weaponFireRateLevel: 0,
    startingWeaponLevel: 0
  });
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);

  const ENDLESS_LB_KEY = 'zls_leaderboard_endless_v1';
  const WALLET_COINS_KEY = 'zls_wallet_coins_v1';
  const META_UPGRADES_KEY = 'zls_meta_upgrades_v1';

  const loadWalletCoins = () => {
    try {
      const raw = localStorage.getItem(WALLET_COINS_KEY);
      if (!raw) return 0;
      const v = JSON.parse(raw);
      return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    } catch {
      return 0;
    }
  };

  const loadMetaUpgrades = (): MetaUpgrades => {
    try {
      const raw = localStorage.getItem(META_UPGRADES_KEY);
      if (!raw) return {
        playerMaxHpLevel: 0,
        playerDamageReductionLevel: 0,
        weaponDamageLevel: 0,
        weaponFireRateLevel: 0,
        startingWeaponLevel: 0
      };
      const v = JSON.parse(raw) as Partial<MetaUpgrades>;
      return {
        playerMaxHpLevel: typeof v.playerMaxHpLevel === 'number' ? Math.max(0, Math.floor(v.playerMaxHpLevel)) : 0,
        playerDamageReductionLevel: typeof v.playerDamageReductionLevel === 'number' ? Math.max(0, Math.floor(v.playerDamageReductionLevel)) : 0,
        weaponDamageLevel: typeof v.weaponDamageLevel === 'number' ? Math.max(0, Math.floor(v.weaponDamageLevel)) : 0,
        weaponFireRateLevel: typeof v.weaponFireRateLevel === 'number' ? Math.max(0, Math.floor(v.weaponFireRateLevel)) : 0,
        startingWeaponLevel: typeof v.startingWeaponLevel === 'number' ? Math.max(0, Math.floor(v.startingWeaponLevel)) : 0
      };
    } catch {
      return {
        playerMaxHpLevel: 0,
        playerDamageReductionLevel: 0,
        weaponDamageLevel: 0,
        weaponFireRateLevel: 0,
        startingWeaponLevel: 0
      };
    }
  };

  const loadEndlessLeaderboard = () => {
    try {
      const raw = localStorage.getItem(ENDLESS_LB_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as LeaderboardEntry[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(e => e && typeof e.score === 'number' && typeof e.survivalTimeMs === 'number' && typeof e.kills === 'number' && typeof e.createdAt === 'number')
        .map(e => ({
          playerName: typeof e.playerName === 'string' ? e.playerName : '玩家',
          score: e.score,
          survivalTimeMs: e.survivalTimeMs,
          kills: e.kills,
          createdAt: e.createdAt
        }));
    } catch {
      return [];
    }
  };

  const saveEndlessLeaderboard = (entries: LeaderboardEntry[]) => {
    localStorage.setItem(ENDLESS_LB_KEY, JSON.stringify(entries));
    setEndlessLeaderboard(entries);
  };

  useEffect(() => {
    setEndlessLeaderboard(loadEndlessLeaderboard());
    setWalletCoins(loadWalletCoins());
    setMetaUpgrades(loadMetaUpgrades());
    setIsStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!isStorageHydrated) return;
    localStorage.setItem(WALLET_COINS_KEY, JSON.stringify(walletCoins));
  }, [isStorageHydrated, walletCoins]);

  useEffect(() => {
    if (!isStorageHydrated) return;
    localStorage.setItem(META_UPGRADES_KEY, JSON.stringify(metaUpgrades));
  }, [isStorageHydrated, metaUpgrades]);

  const startLevel = async () => {
    setIsLoadingIntel(true);
    setMode('CAMPAIGN');
    setGameState('INTEL');
    const missionIntel = await getMissionIntel(level);
    setIntel(missionIntel);
    setIsLoadingIntel(false);
  };

  const startEndless = () => {
    setMode('ENDLESS');
    setGameState('PLAYING');
  };

  const handleSessionEnd = (result: GameSessionResult) => {
    setTotalScore(prev => prev + result.score);
    setWalletCoins(prev => prev + result.coinsEarned);

    if (result.mode === 'ENDLESS') {
      const entry: LeaderboardEntry = {
        playerName: `玩家${Math.floor(100 + Math.random() * 900)}`,
        score: result.score,
        survivalTimeMs: result.survivalTimeMs,
        kills: result.kills,
        createdAt: Date.now()
      };

      const next = [...loadEndlessLeaderboard(), entry]
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.survivalTimeMs !== a.survivalTimeMs) return b.survivalTimeMs - a.survivalTimeMs;
          return a.createdAt - b.createdAt;
        })
        .slice(0, 20);

      saveEndlessLeaderboard(next);
      setHighlightEntryAt(entry.createdAt);
      setGameState('MENU');
      return;
    }

    if (result.outcome === 'VICTORY') {
      setLevel(prev => prev + 1);
      setGameState('MENU');
      return;
    }

    setGameState('MENU');
    setLevel(1);
  };

  const formatDuration = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-800 overflow-hidden">
        
        {gameState === 'MENU' && (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="mb-8 relative">
              <i className="fa-solid fa-biohazard text-8xl text-red-600 animate-pulse"></i>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <i className="fa-solid fa-skull text-4xl text-white"></i>
              </div>
            </div>
            <h1 className="text-6xl font-black text-white mb-2 tracking-tighter italic">
              LANE <span className="text-red-600">SURVIVOR</span>
            </h1>
            <p className="text-neutral-500 mb-8 uppercase tracking-[0.3em] font-bold">僵尸公路末日</p>
            
            <div className="flex flex-col gap-4 w-64">
              <button 
                onClick={startLevel}
                className="group relative px-8 py-4 bg-red-600 text-white font-black rounded-xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/50"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-play"></i>
                  {level > 1 ? `继续第${level}区` : '开始任务'}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>

              <button 
                onClick={startEndless}
                className="group relative px-8 py-4 bg-cyan-600 text-white font-black rounded-xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-900/40"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-infinity"></i>
                  无尽模式
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>

              <button 
                onClick={() => {
                  setEndlessLeaderboard(loadEndlessLeaderboard());
                  setGameState('LEADERBOARD');
                }}
                className="group relative px-8 py-4 bg-neutral-800 text-white font-black rounded-xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/40 border border-neutral-700"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-trophy"></i>
                  排行榜
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-neutral-700 to-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>

              <button
                onClick={() => setGameState('UPGRADES')}
                className="group relative px-8 py-4 bg-emerald-700 text-white font-black rounded-xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/40"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-screwdriver-wrench"></i>
                  升级
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-lime-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>
              
              <div className="bg-neutral-800 rounded-lg p-4 text-left border border-neutral-700">
                <div className="text-neutral-400 text-xs uppercase font-bold mb-1">幸存者情报</div>
                <div className="text-white flex justify-between items-center">
                  <span>当前区段：</span>
                  <span className="font-mono text-red-500">{level}</span>
                </div>
                <div className="text-white flex justify-between items-center mt-2">
                  <span>金币：</span>
                  <span className="font-mono text-amber-300">{Math.floor(walletCoins).toLocaleString()}</span>
                </div>
                <div className="text-white flex justify-between items-center">
                  <span>总得分：</span>
                  <span className="font-mono text-blue-500">{Math.floor(totalScore).toLocaleString()}</span>
                </div>
                <div className="text-white flex justify-between items-center mt-2">
                  <span>无尽最高：</span>
                  <span className="font-mono text-cyan-400">
                    {endlessLeaderboard.length > 0 ? Math.floor(endlessLeaderboard[0].score).toLocaleString() : '--'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-8 text-neutral-400">
              <div className="flex flex-col items-center">
                <i className="fa-solid fa-keyboard text-2xl mb-2"></i>
                <span className="text-xs uppercase font-bold">A/D 移动</span>
              </div>
              <div className="flex flex-col items-center">
                <i className="fa-solid fa-crosshairs text-2xl mb-2"></i>
                <span className="text-xs uppercase font-bold">自动射击</span>
              </div>
              <div className="flex flex-col items-center">
                <i className="fa-solid fa-shield-halved text-2xl mb-2"></i>
                <span className="text-xs uppercase font-bold">躲避障碍</span>
              </div>
            </div>
          </div>
        )}

        {gameState === 'UPGRADES' && (
          <div className="p-10 min-h-[600px]">
            <div className="flex items-center justify-between mb-8">
              <div className="text-left">
                <div className="text-neutral-500 text-xs uppercase tracking-[0.3em] font-black">军械库</div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter">升级商店</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const ok = window.confirm('重置金币与升级？');
                    if (!ok) return;
                    setWalletCoins(0);
                    setMetaUpgrades({
                      playerMaxHpLevel: 0,
                      playerDamageReductionLevel: 0,
                      weaponDamageLevel: 0,
                      weaponFireRateLevel: 0,
                      startingWeaponLevel: 0
                    });
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-black rounded-lg border border-neutral-700"
                >
                  重置
                </button>
                <button
                  onClick={() => setGameState('MENU')}
                  className="px-4 py-2 bg-white hover:bg-neutral-200 text-black font-black rounded-lg"
                >
                  返回
                </button>
              </div>
            </div>

            <div className="bg-neutral-950/40 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                <div className="text-neutral-500 text-xs uppercase tracking-[0.25em] font-black">钱包</div>
                <div className="text-amber-300 font-black font-mono text-lg">{Math.floor(walletCoins).toLocaleString()} 金币</div>
              </div>

              {(() => {
                const cost = (base: number, level: number) => Math.floor(base * Math.pow(level + 1, 1.35));
                const items = [
                  {
                    id: 'playerMaxHpLevel' as const,
                    title: '装甲强化',
                    desc: '+10 最大生命 / 级',
                    baseCost: 60,
                    max: 10
                  },
                  {
                    id: 'playerDamageReductionLevel' as const,
                    title: '减伤模块',
                    desc: '受到伤害 -4% / 级（上限 30%）',
                    baseCost: 90,
                    max: 10
                  },
                  {
                    id: 'weaponDamageLevel' as const,
                    title: '弹药增压',
                    desc: '武器伤害 +6% / 级',
                    baseCost: 80,
                    max: 12
                  },
                  {
                    id: 'weaponFireRateLevel' as const,
                    title: '供弹系统',
                    desc: '射速 +5% / 级',
                    baseCost: 80,
                    max: 12
                  },
                  {
                    id: 'startingWeaponLevel' as const,
                    title: '起始武器',
                    desc: '开局武器提升 1 档（手枪→冲锋枪→步枪→加特林）',
                    baseCost: 220,
                    max: 3
                  }
                ];

                return (
                  <div className="divide-y divide-neutral-800">
                    {items.map(it => {
                      const level = metaUpgrades[it.id];
                      const atMax = level >= it.max;
                      const price = atMax ? 0 : cost(it.baseCost, level);
                      const canBuy = !atMax && walletCoins >= price;
                      return (
                        <div key={it.id} className="px-6 py-5 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-white font-black">{it.title}</div>
                            <div className="text-neutral-500 text-xs font-mono">{it.desc}</div>
                            <div className="mt-2 text-neutral-300 text-xs font-mono">等级：{level}/{it.max}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {!atMax && (
                              <div className="text-amber-300 font-black font-mono">{price.toLocaleString()}</div>
                            )}
                            <button
                              disabled={!canBuy}
                              onClick={() => {
                                if (!canBuy) return;
                                setWalletCoins(c => c - price);
                                setMetaUpgrades(prev => ({ ...prev, [it.id]: prev[it.id] + 1 }));
                              }}
                              className={`px-4 py-2 rounded-lg font-black border ${canBuy ? 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500/40' : 'bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed'}`}
                            >
                              {atMax ? '已满级' : '购买'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {gameState === 'INTEL' && (
          <div className="p-12 min-h-[600px] flex flex-col items-center justify-center text-center">
            {isLoadingIntel ? (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-red-500 font-mono animate-pulse uppercase tracking-widest">正在截获任务情报...</p>
              </div>
            ) : (
              <div className="max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-4xl font-black text-white mb-2 uppercase italic">{intel?.title}</h2>
                <div className="h-1 w-24 bg-red-600 mx-auto mb-6"></div>
                <p className="text-neutral-400 mb-8 leading-relaxed font-mono">"{intel?.intel}"</p>
                
                <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700 mb-8">
                  <div className="text-red-500 text-xs font-bold uppercase tracking-widest mb-2">目标已锁定</div>
                  <h3 className="text-2xl font-bold text-white mb-2">{intel?.bossName}</h3>
                  <p className="text-neutral-500 text-sm italic">{intel?.bossDescription}</p>
                </div>

                <button 
                  onClick={() => setGameState('PLAYING')}
                  className="px-10 py-4 bg-white text-black font-black rounded-lg hover:bg-neutral-200 transition-colors uppercase tracking-widest"
                >
                  立即出击
                </button>
              </div>
            )}
          </div>
        )}

        {gameState === 'LEADERBOARD' && (
          <div className="p-10 min-h-[600px]">
            <div className="flex items-center justify-between mb-8">
              <div className="text-left">
                <div className="text-neutral-500 text-xs uppercase tracking-[0.3em] font-black">顶尖幸存者</div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter">无尽排行榜</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const ok = window.confirm('清空排行榜？');
                    if (!ok) return;
                    setHighlightEntryAt(null);
                    saveEndlessLeaderboard([]);
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-black rounded-lg border border-neutral-700"
                >
                  清空
                </button>
                <button
                  onClick={() => setGameState('MENU')}
                  className="px-4 py-2 bg-white hover:bg-neutral-200 text-black font-black rounded-lg"
                >
                  返回
                </button>
              </div>
            </div>

            <div className="bg-neutral-950/40 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-6 py-3 text-[10px] uppercase tracking-[0.25em] font-black text-neutral-500 border-b border-neutral-800">
                <div className="col-span-1">#</div>
                <div className="col-span-4">玩家</div>
                <div className="col-span-3 text-right">得分</div>
                <div className="col-span-2 text-right">生存</div>
                <div className="col-span-2 text-right">击杀</div>
              </div>

              {endlessLeaderboard.length === 0 && (
                <div className="px-6 py-10 text-center text-neutral-500 font-mono">暂无记录，去玩无尽模式。</div>
              )}

              {endlessLeaderboard.map((e, idx) => {
                const highlight = highlightEntryAt != null && e.createdAt === highlightEntryAt;
                return (
                  <div
                    key={e.createdAt}
                    className={`grid grid-cols-12 gap-2 px-6 py-3 border-b border-neutral-900/60 ${highlight ? 'bg-emerald-900/10' : ''}`}
                  >
                    <div className="col-span-1 text-neutral-500 font-mono">{idx + 1}</div>
                    <div className="col-span-4 text-white font-black">{e.playerName}</div>
                    <div className="col-span-3 text-right text-white font-mono">{Math.floor(e.score).toLocaleString()}</div>
                    <div className="col-span-2 text-right text-cyan-300 font-mono">{formatDuration(e.survivalTimeMs)}</div>
                    <div className="col-span-2 text-right text-neutral-300 font-mono">{e.kills}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {gameState === 'PLAYING' && (
          <GameEngine 
            level={level} 
            mode={mode}
            metaUpgrades={metaUpgrades}
            onSessionEnd={handleSessionEnd}
          />
        )}
      </div>
      
      {/* Mobile Controls Overlay (only if playing) */}
      {gameState === 'PLAYING' && (
        <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-between px-5 md:hidden pointer-events-none">
          <button 
            onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))}
            className="w-[72px] h-[72px] bg-white/10 rounded-full border border-white/20 backdrop-blur-sm pointer-events-auto active:scale-90 flex items-center justify-center touch-manipulation"
          >
            <i className="fa-solid fa-arrow-left text-white text-3xl"></i>
          </button>
          <button 
            onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))}
            className="w-[72px] h-[72px] bg-white/10 rounded-full border border-white/20 backdrop-blur-sm pointer-events-auto active:scale-90 flex items-center justify-center touch-manipulation"
          >
            <i className="fa-solid fa-arrow-right text-white text-3xl"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
