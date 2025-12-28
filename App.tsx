
import React, { useState, useEffect } from 'react';
import GameEngine from './components/GameEngine';
import { getMissionIntel } from './services/missionIntelService';
import { GameMode, GameSessionResult, LeaderboardEntry } from './types';

const App: React.FC = () => {
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<'MENU' | 'INTEL' | 'PLAYING' | 'LEADERBOARD'>('MENU');
  const [mode, setMode] = useState<GameMode>('CAMPAIGN');
  const [totalScore, setTotalScore] = useState(0);
  const [intel, setIntel] = useState<any>(null);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);
  const [endlessLeaderboard, setEndlessLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [highlightEntryAt, setHighlightEntryAt] = useState<number | null>(null);

  const ENDLESS_LB_KEY = 'zls_leaderboard_endless_v1';

  const loadEndlessLeaderboard = () => {
    try {
      const raw = localStorage.getItem(ENDLESS_LB_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as LeaderboardEntry[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(e => e && typeof e.score === 'number' && typeof e.survivalTimeMs === 'number' && typeof e.kills === 'number' && typeof e.createdAt === 'number')
        .map(e => ({
          playerName: typeof e.playerName === 'string' ? e.playerName : 'Player',
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
  }, []);

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

    if (result.mode === 'ENDLESS') {
      const entry: LeaderboardEntry = {
        playerName: `Player${Math.floor(100 + Math.random() * 900)}`,
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
            <p className="text-neutral-500 mb-8 uppercase tracking-[0.3em] font-bold">Zombie Highway Apocalypse</p>
            
            <div className="flex flex-col gap-4 w-64">
              <button 
                onClick={startLevel}
                className="group relative px-8 py-4 bg-red-600 text-white font-black rounded-xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/50"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-play"></i>
                  {level > 1 ? `CONTINUE SECTOR ${level}` : 'START MISSION'}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </button>

              <button 
                onClick={startEndless}
                className="group relative px-8 py-4 bg-cyan-600 text-white font-black rounded-xl overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-900/40"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-infinity"></i>
                  ENDLESS MODE
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
                  LEADERBOARD
                </div>
              </button>
              
              <div className="bg-neutral-800 rounded-lg p-4 text-left border border-neutral-700">
                <div className="text-neutral-400 text-xs uppercase font-bold mb-1">Survivor Intel</div>
                <div className="text-white flex justify-between items-center">
                  <span>Current Sector:</span>
                  <span className="font-mono text-red-500">{level}</span>
                </div>
                <div className="text-white flex justify-between items-center">
                  <span>Total Killpoints:</span>
                  <span className="font-mono text-blue-500">{Math.floor(totalScore).toLocaleString()}</span>
                </div>
                <div className="text-white flex justify-between items-center mt-2">
                  <span>Endless Best:</span>
                  <span className="font-mono text-cyan-400">
                    {endlessLeaderboard.length > 0 ? Math.floor(endlessLeaderboard[0].score).toLocaleString() : '--'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-3 gap-8 text-neutral-400">
              <div className="flex flex-col items-center">
                <i className="fa-solid fa-keyboard text-2xl mb-2"></i>
                <span className="text-xs uppercase font-bold">A / D to move</span>
              </div>
              <div className="flex flex-col items-center">
                <i className="fa-solid fa-crosshairs text-2xl mb-2"></i>
                <span className="text-xs uppercase font-bold">Auto Fire</span>
              </div>
              <div className="flex flex-col items-center">
                <i className="fa-solid fa-shield-halved text-2xl mb-2"></i>
                <span className="text-xs uppercase font-bold">Dodge Obstacles</span>
              </div>
            </div>
          </div>
        )}

        {gameState === 'INTEL' && (
          <div className="p-12 min-h-[600px] flex flex-col items-center justify-center text-center">
            {isLoadingIntel ? (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-red-500 font-mono animate-pulse uppercase tracking-widest">Intercepting Mission Intel...</p>
              </div>
            ) : (
              <div className="max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <h2 className="text-4xl font-black text-white mb-2 uppercase italic">{intel?.title}</h2>
                <div className="h-1 w-24 bg-red-600 mx-auto mb-6"></div>
                <p className="text-neutral-400 mb-8 leading-relaxed font-mono">"{intel?.intel}"</p>
                
                <div className="bg-neutral-800/50 p-6 rounded-xl border border-neutral-700 mb-8">
                  <div className="text-red-500 text-xs font-bold uppercase tracking-widest mb-2">Target identified</div>
                  <h3 className="text-2xl font-bold text-white mb-2">{intel?.bossName}</h3>
                  <p className="text-neutral-500 text-sm italic">{intel?.bossDescription}</p>
                </div>

                <button 
                  onClick={() => setGameState('PLAYING')}
                  className="px-10 py-4 bg-white text-black font-black rounded-lg hover:bg-neutral-200 transition-colors uppercase tracking-widest"
                >
                  Deploy Now
                </button>
              </div>
            )}
          </div>
        )}

        {gameState === 'LEADERBOARD' && (
          <div className="p-10 min-h-[600px]">
            <div className="flex items-center justify-between mb-8">
              <div className="text-left">
                <div className="text-neutral-500 text-xs uppercase tracking-[0.3em] font-black">Top Survivors</div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter">ENDLESS LEADERBOARD</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const ok = window.confirm('Clear leaderboard?');
                    if (!ok) return;
                    setHighlightEntryAt(null);
                    saveEndlessLeaderboard([]);
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-black rounded-lg border border-neutral-700"
                >
                  Clear
                </button>
                <button
                  onClick={() => setGameState('MENU')}
                  className="px-4 py-2 bg-white hover:bg-neutral-200 text-black font-black rounded-lg"
                >
                  Back
                </button>
              </div>
            </div>

            <div className="bg-neutral-950/40 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-6 py-3 text-[10px] uppercase tracking-[0.25em] font-black text-neutral-500 border-b border-neutral-800">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-3 text-right">Score</div>
                <div className="col-span-2 text-right">Survival</div>
                <div className="col-span-2 text-right">Kills</div>
              </div>

              {endlessLeaderboard.length === 0 && (
                <div className="px-6 py-10 text-center text-neutral-500 font-mono">No records yet. Run endless mode.</div>
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
