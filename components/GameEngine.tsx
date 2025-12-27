
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GameStatus, 
  EntityType, 
  Entity, 
  Projectile, 
  WeaponType, 
  WeaponStats, 
  Boss 
} from '../types';
import { LANE_COUNT, TRACK_LENGTH, BASE_SPEED, WEAPON_MAP, LEVEL_DIFFICULTY_MODIFIER } from '../constants';

interface GameEngineProps {
  level: number;
  onGameOver: (score: number) => void;
  onVictory: (score: number) => void;
  onMissionIntel?: (intel: any) => void;
}

const ENTITY_ICONS: Record<EntityType, string> = {
  [EntityType.ZOMBIE]: 'fa-solid fa-skull-crossbones',
  [EntityType.OBSTACLE]: 'fa-solid fa-road-barrier',
  [EntityType.WEAPON_UPGRADE]: 'fa-solid fa-gun',
  [EntityType.BULLET_UPGRADE]: 'fa-solid fa-bolt',
  [EntityType.HEAL]: 'fa-solid fa-briefcase-medical'
};

const ENTITY_COLORS: Record<EntityType, string> = {
  [EntityType.ZOMBIE]: 'bg-green-900/60 border-green-500',
  [EntityType.OBSTACLE]: 'bg-gray-800 border-gray-400',
  [EntityType.WEAPON_UPGRADE]: 'bg-blue-900/60 border-blue-400',
  [EntityType.BULLET_UPGRADE]: 'bg-yellow-900/60 border-yellow-400',
  [EntityType.HEAL]: 'bg-red-900/60 border-red-500'
};

const GameEngine: React.FC<GameEngineProps> = ({ level, onGameOver, onVictory }) => {
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.PLAYING);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [playerLane, setPlayerLane] = useState(2);
  const [playerHp, setPlayerHp] = useState(100);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [weapon, setWeapon] = useState<WeaponType>(WeaponType.HANDGUN);
  const [boss, setBoss] = useState<Boss | null>(null);
  
  const [bulletBuffs, setBulletBuffs] = useState({
    fireRateMult: 1,
    damageMult: 1,
    isFire: false,
    speedMult: 1
  });

  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const distanceRef = useRef<number>(0);

  // Use refs for values needed inside the animation frame but outside React state updates
  // to avoid closure issues and ensure "latest" values are used for simulation logic.
  const currentLaneRef = useRef(playerLane);
  const gameStatusRef = useRef(gameStatus);
  const difficulty = Math.pow(LEVEL_DIFFICULTY_MODIFIER, level - 1);

  useEffect(() => {
    currentLaneRef.current = playerLane;
  }, [playerLane]);

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  const spawnEntity = useCallback(() => {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const id = Math.random().toString(36).substr(2, 9);
    const rand = Math.random();
    
    let newEntity: Entity;
    if (rand < 0.6) {
      newEntity = { id, lane, z: -10, type: EntityType.ZOMBIE, hp: 25 * difficulty, maxHp: 25 * difficulty, width: 50, height: 50 };
    } else if (rand < 0.75) {
      newEntity = { id, lane, z: -10, type: EntityType.OBSTACLE, hp: 99999, maxHp: 99999, width: 60, height: 40 };
    } else if (rand < 0.9) {
      const isWeapon = Math.random() > 0.4;
      newEntity = {
        id, lane, z: -10, 
        type: isWeapon ? EntityType.WEAPON_UPGRADE : EntityType.BULLET_UPGRADE, 
        hp: 1, maxHp: 1, width: 45, height: 45,
        subType: isWeapon ? ['RIFLE', 'SHOTGUN', 'MINIGUN'][Math.floor(Math.random() * 3)] : ['RATE', 'DMG', 'FIRE'][Math.floor(Math.random() * 3)]
      };
    } else {
      newEntity = { id, lane, z: -10, type: EntityType.HEAL, hp: 1, maxHp: 1, width: 45, height: 45 };
    }
    
    setEntities(prev => [...prev, newEntity]);
  }, [difficulty]);

  const update = useCallback((time: number) => {
    // Correct initialization to prevent delta time explosion
    if (!lastTimeRef.current) {
      lastTimeRef.current = time;
      lastShotTimeRef.current = time;
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    const frameFactor = Math.min(deltaTime / 16, 3); // Cap frame factor to prevent huge teleports

    const progress = Math.max(0, Math.min(1, distanceRef.current / TRACK_LENGTH));
    const easedProgress = progress * progress;
    const entitySpeed = 0.18 + (0.55 - 0.18) * easedProgress;

    if (gameStatusRef.current === GameStatus.GAMEOVER || gameStatusRef.current === GameStatus.VICTORY) return;

    // 1. Progress & Distance
    if (gameStatusRef.current === GameStatus.PLAYING) {
      setDistance(prev => {
        const next = prev + BASE_SPEED * frameFactor;
        distanceRef.current = next;
        if (next >= TRACK_LENGTH) {
          setGameStatus(GameStatus.BOSS_FIGHT);
          setBoss({ name: "COMMANDER MUTANT", hp: 1500 * difficulty, maxHp: 1500 * difficulty, attacks: 0 });
          return TRACK_LENGTH;
        }
        return next;
      });

      spawnTimerRef.current += deltaTime;
      if (spawnTimerRef.current > 1100 / difficulty) {
        spawnEntity();
        spawnTimerRef.current = 0;
      }
    }

    // 2. Shooting Logic
    const stats = WEAPON_MAP[weapon];
    const shootInterval = stats.fireRate / bulletBuffs.fireRateMult;
    if (time - lastShotTimeRef.current >= shootInterval) {
      const newShots: Projectile[] = [];
      for (let i = 0; i < stats.burst; i++) {
        newShots.push({
          id: Math.random().toString(36).substr(2, 9),
          lane: currentLaneRef.current,
          z: 85,
          damage: stats.damage * bulletBuffs.damageMult,
          color: bulletBuffs.isFire ? '#ff3300' : '#ffff00',
          isFire: bulletBuffs.isFire
        });
      }
      setProjectiles(prev => [...prev, ...newShots]);
      lastShotTimeRef.current = time;
    }

    // 3. Entity Movement & Player Collision
    setEntities(prevEntities => {
      const nextEntities: Entity[] = [];
      for (const e of prevEntities) {
        const nextZ = e.z + entitySpeed * frameFactor;
        
        // Player is roughly at z=90
        if (nextZ > 84 && nextZ < 94 && e.lane === currentLaneRef.current) {
          if (e.type === EntityType.ZOMBIE || e.type === EntityType.OBSTACLE) {
            setPlayerHp(h => {
                const newHp = h - (e.type === EntityType.ZOMBIE ? 12 : 25);
                if (newHp <= 0) setGameStatus(GameStatus.GAMEOVER);
                return Math.max(0, newHp);
            });
          } else if (e.type === EntityType.WEAPON_UPGRADE) {
            setWeapon(e.subType as WeaponType);
            setScore(s => s + 100);
          } else if (e.type === EntityType.BULLET_UPGRADE) {
            setBulletBuffs(b => ({
              ...b,
              fireRateMult: e.subType === 'RATE' ? b.fireRateMult + 0.15 : b.fireRateMult,
              damageMult: e.subType === 'DMG' ? b.damageMult + 0.2 : b.damageMult,
              isFire: e.subType === 'FIRE' ? true : b.isFire
            }));
            setScore(s => s + 50);
          } else if (e.type === EntityType.HEAL) {
            setPlayerHp(h => Math.min(100, h + 30));
          }
          // Remove entity on collision
          continue;
        }

        if (nextZ < 110) {
          nextEntities.push({ ...e, z: nextZ });
        }
      }
      return nextEntities;
    });

    // 4. Projectile Movement & Combat
    setProjectiles(prevProjs => {
      const nextProjs: Projectile[] = [];
      const pSpeed = stats.bulletSpeed * 3.5; // Fast bullet movement

      for (const p of prevProjs) {
        const nextZ = p.z - pSpeed * frameFactor;
        let hit = false;

        // Check hits against standard entities
        setEntities(currentEntities => {
          return currentEntities.map(e => {
            if (!hit && e.type === EntityType.ZOMBIE && e.lane === p.lane && Math.abs(e.z - nextZ) < 8) {
              hit = true;
              const newHp = e.hp - p.damage;
              if (newHp <= 0) setScore(s => s + 25);
              return { ...e, hp: newHp };
            }
            return e;
          }).filter(e => e.hp > 0);
        });

        // Check hit against Boss
        if (!hit && gameStatusRef.current === GameStatus.BOSS_FIGHT && nextZ < 25) {
          setBoss(b => {
            if (!b) return null;
            const newHp = b.hp - p.damage;
            if (newHp <= 0) setGameStatus(GameStatus.VICTORY);
            return { ...b, hp: newHp };
          });
          hit = true;
        }

        if (!hit && nextZ > -10) {
          nextProjs.push({ ...p, z: nextZ });
        }
      }
      return nextProjs;
    });

    requestRef.current = requestAnimationFrame(update);
  }, [difficulty, spawnEntity, weapon, bulletBuffs]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  // Controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setPlayerLane(l => Math.max(0, l - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setPlayerLane(l => Math.min(LANE_COUNT - 1, l + 1));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="relative w-full h-[85vh] bg-[#0c0c0c] border-x-8 border-[#1a1a1a] overflow-hidden select-none shadow-inner">
      {/* Visual Lanes */}
      <div className="absolute inset-0 flex">
        {[...Array(LANE_COUNT)].map((_, i) => (
          <div key={i} className={`flex-1 border-r border-white/5 scrolling-lane ${i === 0 ? 'border-l border-white/5' : ''}`}></div>
        ))}
      </div>

      {/* Distance Progress */}
      <div className="absolute top-0 left-0 w-full h-3 bg-black/80 z-50">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.8)] transition-all duration-300" 
          style={{ width: `${(distance / TRACK_LENGTH) * 100}%` }}
        ></div>
      </div>

      {/* Projectiles */}
      {projectiles.map(p => (
        <div 
          key={p.id}
          className="absolute w-2 h-6 rounded-full z-10 animate-pulse"
          style={{ 
            left: `${(p.lane * 20) + 10}%`, 
            top: `${p.z}%`, 
            backgroundColor: p.color,
            boxShadow: `0 0 15px ${p.color}, 0 0 5px white`,
            transform: 'translateX(-50%)'
          }}
        ></div>
      ))}

      {/* Entities */}
      {entities.map(e => (
        <div 
          key={e.id}
          className={`absolute flex flex-col items-center justify-center rounded-xl border-2 z-20 transition-transform ${ENTITY_COLORS[e.type]}`}
          style={{ 
            left: `${(e.lane * 20) + 10}%`, 
            top: `${e.z}%`, 
            transform: `translate(-50%, -50%) scale(${0.8 + (e.z / 200)})`,
            width: `${e.width}px`,
            height: `${e.height}px`
          }}
        >
          {e.type === EntityType.ZOMBIE && (
            <div className="w-full h-1.5 bg-gray-900 absolute -top-5 rounded-full overflow-hidden border border-black/50">
              <div className="h-full bg-red-500" style={{ width: `${(e.hp / e.maxHp) * 100}%` }}></div>
            </div>
          )}
          <i className={`${ENTITY_ICONS[e.type]} text-2xl text-white drop-shadow-md`}></i>
          {e.subType && (
            <span className="absolute -bottom-4 text-[9px] font-black text-white bg-black/80 px-1.5 py-0.5 rounded border border-white/10 uppercase tracking-tighter">
              {e.subType}
            </span>
          )}
        </div>
      ))}

      {/* Boss UI */}
      {boss && gameStatus === GameStatus.BOSS_FIGHT && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-4/5 max-w-lg z-40">
          <div className="flex justify-between items-end mb-1">
            <span className="text-red-500 font-black text-xs tracking-widest uppercase italic">{boss.name}</span>
            <span className="text-white font-mono text-sm">{Math.ceil(boss.hp)} HP</span>
          </div>
          <div className="w-full h-5 bg-black/60 rounded-full border-2 border-red-500/40 p-0.5 shadow-2xl">
            <div className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded-full transition-all" style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }}></div>
          </div>
          <div className="flex justify-center mt-6 gap-12 text-6xl text-red-600 opacity-20">
            <i className="fa-solid fa-skull-crossbones animate-bounce"></i>
            <i className="fa-solid fa-biohazard animate-pulse scale-150"></i>
            <i className="fa-solid fa-skull-crossbones animate-bounce"></i>
          </div>
        </div>
      )}

      {/* Player Model */}
      <div 
        className="absolute w-20 h-24 flex flex-col items-center justify-end z-30 transition-all duration-100"
        style={{ left: `${(playerLane * 20) + 10}%`, top: '90%', transform: 'translate(-50%, -100%)' }}
      >
        <div className="relative">
          {/* Engine Aura */}
          <div className="absolute -inset-4 bg-blue-500/10 blur-xl rounded-full animate-pulse"></div>
          <i className="fa-solid fa-person-running text-5xl text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]"></i>
          <div className="absolute top-0 -right-4 bg-zinc-800 border border-zinc-600 p-1.5 rounded-full shadow-lg">
             <i className="fa-solid fa-gun text-white text-[10px]"></i>
          </div>
        </div>
        <div className="mt-2 text-[10px] font-black text-blue-300 bg-black/80 px-3 py-1 rounded-full border border-blue-500/30 uppercase tracking-[0.2em]">
          {WEAPON_MAP[weapon].name}
        </div>
      </div>

      {/* HUD Bottom */}
      <div className="absolute bottom-6 left-8 right-8 flex justify-between items-end pointer-events-none z-40">
        <div className="w-64">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Life Signal</span>
            <span className="text-lg font-black text-white">{Math.ceil(playerHp)}%</span>
          </div>
          <div className="w-full h-4 bg-black/60 rounded-full border border-white/10 overflow-hidden shadow-inner p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${playerHp < 30 ? 'bg-red-600 animate-pulse' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} 
              style={{ width: `${playerHp}%` }}
            ></div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em]">Credits</div>
          <div className="text-5xl font-black text-white font-mono tracking-tighter">{score.toLocaleString()}</div>
        </div>
      </div>

      {/* Modals */}
      {gameStatus === GameStatus.GAMEOVER && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-[100] animate-in fade-in duration-500">
          <i className="fa-solid fa-skull text-8xl text-red-600 mb-6 drop-shadow-[0_0_30px_rgba(220,38,38,0.6)]"></i>
          <h2 className="text-7xl font-black text-red-600 mb-2 italic tracking-tighter uppercase">Terminated</h2>
          <p className="text-xl text-neutral-500 mb-10 tracking-[0.3em]">Horde consumption complete.</p>
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl text-center mb-10 w-64 shadow-2xl">
            <div className="text-neutral-500 text-xs uppercase mb-1">Final Score</div>
            <div className="text-4xl font-black text-white">{score.toLocaleString()}</div>
          </div>
          <button 
            onClick={() => onGameOver(score)}
            className="px-12 py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg shadow-red-900/40"
          >
            Deploy Again
          </button>
        </div>
      )}

      {gameStatus === GameStatus.VICTORY && (
        <div className="absolute inset-0 bg-blue-900/20 backdrop-blur-md flex flex-col items-center justify-center z-[100] animate-in fade-in duration-500">
          <i className="fa-solid fa-medal text-8xl text-yellow-500 mb-6 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)] animate-bounce"></i>
          <h2 className="text-7xl font-black text-yellow-400 mb-2 tracking-tighter uppercase italic">Road Clear</h2>
          <p className="text-xl text-blue-100 mb-10 tracking-[0.3em]">Secure the perimeter.</p>
          <button 
            onClick={() => onVictory(score)}
            className="px-12 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg shadow-yellow-900/40"
          >
            Next Sector
          </button>
        </div>
      )}
    </div>
  );
};

export default GameEngine;
