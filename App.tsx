
import React, { useState, useEffect } from 'react';
import GameEngine from './components/GameEngine';
import { getMissionIntel } from './services/geminiService';

const App: React.FC = () => {
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<'MENU' | 'INTEL' | 'PLAYING'>('MENU');
  const [totalScore, setTotalScore] = useState(0);
  const [intel, setIntel] = useState<any>(null);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);

  const startLevel = async () => {
    setIsLoadingIntel(true);
    setGameState('INTEL');
    const missionIntel = await getMissionIntel(level);
    setIntel(missionIntel);
    setIsLoadingIntel(false);
  };

  const handleGameOver = (sessionScore: number) => {
    setTotalScore(prev => prev + sessionScore);
    setGameState('MENU');
    setLevel(1); // Reset level on complete loss
  };

  const handleVictory = (sessionScore: number) => {
    setTotalScore(prev => prev + sessionScore);
    setLevel(prev => prev + 1);
    setGameState('MENU');
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
              
              <div className="bg-neutral-800 rounded-lg p-4 text-left border border-neutral-700">
                <div className="text-neutral-400 text-xs uppercase font-bold mb-1">Survivor Intel</div>
                <div className="text-white flex justify-between items-center">
                  <span>Current Sector:</span>
                  <span className="font-mono text-red-500">{level}</span>
                </div>
                <div className="text-white flex justify-between items-center">
                  <span>Total Killpoints:</span>
                  <span className="font-mono text-blue-500">{totalScore}</span>
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

        {gameState === 'PLAYING' && (
          <GameEngine 
            level={level} 
            onGameOver={handleGameOver} 
            onVictory={handleVictory}
          />
        )}
      </div>
      
      {/* Mobile Controls Overlay (only if playing) */}
      {gameState === 'PLAYING' && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-between px-8 md:hidden pointer-events-none">
          <button 
            onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))}
            className="w-20 h-20 bg-white/10 rounded-full border border-white/20 backdrop-blur-sm pointer-events-auto active:scale-90 flex items-center justify-center"
          >
            <i className="fa-solid fa-arrow-left text-white text-3xl"></i>
          </button>
          <button 
            onPointerDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))}
            className="w-20 h-20 bg-white/10 rounded-full border border-white/20 backdrop-blur-sm pointer-events-auto active:scale-90 flex items-center justify-center"
          >
            <i className="fa-solid fa-arrow-right text-white text-3xl"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
