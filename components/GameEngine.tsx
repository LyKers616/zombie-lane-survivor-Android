
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GameStatus, 
  EntityType, 
  Entity, 
  Projectile, 
  WeaponType, 
  WeaponStats, 
  Boss,
  SkillId,
  SkillState,
  EnergyState,
  GameMode,
  GameSessionResult,
  MetaUpgrades
} from '../types';
import {
  LANE_COUNT,
  TRACK_LENGTH,
  BASE_SPEED,
  WEAPON_MAP,
  LEVEL_DIFFICULTY_MODIFIER,
  SKILL_DEFS,
  ENERGY_MAX,
  ENERGY_GAIN_PER_KILL,
  ENERGY_GAIN_PER_SECOND,
  AOE_DAMAGE_MULT,
  AOE_Z_RANGE,
  ENDLESS_SCORE_PER_SECOND,
  ENDLESS_DIFFICULTY_TIME_SCALE_SECONDS
} from '../constants';

interface GameEngineProps {
  level: number;
  mode?: GameMode;
  metaUpgrades?: MetaUpgrades;
  onSessionEnd: (result: GameSessionResult) => void;
  onMissionIntel?: (intel: any) => void;
}

const ENTITY_ICONS: Record<EntityType, string> = {
  [EntityType.ZOMBIE]: 'fa-solid fa-skull-crossbones',
  [EntityType.OBSTACLE]: 'fa-solid fa-road-barrier',
  [EntityType.WEAPON_UPGRADE]: 'fa-solid fa-gun',
  [EntityType.BULLET_UPGRADE]: 'fa-solid fa-bolt',
  [EntityType.HEAL]: 'fa-solid fa-briefcase-medical',
  [EntityType.SKILL_UNLOCK]: 'fa-solid fa-microchip',
  [EntityType.ENERGY]: 'fa-solid fa-battery-full'
};

const ENTITY_COLORS: Record<EntityType, string> = {
  [EntityType.ZOMBIE]: 'bg-green-900/60 border-green-500',
  [EntityType.OBSTACLE]: 'bg-gray-800 border-gray-400',
  [EntityType.WEAPON_UPGRADE]: 'bg-blue-900/60 border-blue-400',
  [EntityType.BULLET_UPGRADE]: 'bg-yellow-900/60 border-yellow-400',
  [EntityType.HEAL]: 'bg-red-900/60 border-red-500',
  [EntityType.SKILL_UNLOCK]: 'bg-purple-900/60 border-purple-400',
  [EntityType.ENERGY]: 'bg-cyan-900/60 border-cyan-400'
};

const WEAPON_TIER: WeaponType[] = [WeaponType.HANDGUN, WeaponType.SMG, WeaponType.RIFLE, WeaponType.MINIGUN];

const getEntitySubLabel = (e: Entity): string | undefined => {
  if (!e.subType) return undefined;

  if (e.type === EntityType.WEAPON_UPGRADE) {
    const w = e.subType as WeaponType;
    const stats = WEAPON_MAP[w];
    return stats?.name;
  }

  if (e.type === EntityType.BULLET_UPGRADE) {
    if (e.subType === 'RATE') return '射速';
    if (e.subType === 'DMG') return '伤害';
    if (e.subType === 'FIRE') return '灼烧';
    return undefined;
  }

  if (e.type === EntityType.ENERGY) {
    if (e.subType === 'BATTERY') return '电池';
    return undefined;
  }

  if (e.type === EntityType.SKILL_UNLOCK) {
    if (e.subType.includes('Rage')) return '狂怒核心';
    if (e.subType.includes('Shield')) return '护盾模块';
    return '脉冲发射器';
  }

  return undefined;
};

const getNextWeapon = (w: WeaponType): WeaponType | null => {
  const idx = WEAPON_TIER.indexOf(w);
  if (idx < 0 || idx >= WEAPON_TIER.length - 1) return null;
  return WEAPON_TIER[idx + 1];
};

type Aabb = { minX: number; maxX: number; minY: number; maxY: number };

const aabbIntersects = (a: Aabb, b: Aabb) => {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
};

const insetAabb = (r: Aabb, insetX: number, insetY: number): Aabb => {
  return {
    minX: r.minX + insetX,
    maxX: r.maxX - insetX,
    minY: r.minY + insetY,
    maxY: r.maxY - insetY
  };
};

const expandAabb = (r: Aabb, padX: number, padY: number): Aabb => {
  return {
    minX: r.minX - padX,
    maxX: r.maxX + padX,
    minY: r.minY - padY,
    maxY: r.maxY + padY
  };
};

type Particle = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type HitGlow = {
  id: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  colorRgb: string;
  radiusPx: number;
};

type BossAttackType = 'SLAM' | 'BARRAGE' | 'SUMMON';

type BossTelegraph = {
  type: BossAttackType;
  lanes: number[];
  remainingMs: number;
  durationMs: number;
};

type ModeRuntime = {
  speedBoost: number;
  enemyDifficultyFactor: number;
  spawnIntervalMs: number;
  timeScorePerSecond: number;
  allowBoss: boolean;
  mapProgressDistance: (distance: number) => number;
};

const getModeRuntime = (mode: GameMode, baseDifficulty: number, survivalTimeMs: number): ModeRuntime => {
  if (mode === 'CAMPAIGN') {
    return {
      speedBoost: 1,
      enemyDifficultyFactor: baseDifficulty,
      spawnIntervalMs: 1100 / baseDifficulty,
      timeScorePerSecond: 0,
      allowBoss: true,
      mapProgressDistance: (d: number) => d
    };
  }

  const D = (survivalTimeMs / 1000) / ENDLESS_DIFFICULTY_TIME_SCALE_SECONDS;
  const speedBoost = Math.min(2.2, 1 + 0.10 * D);
  const enemyDifficultyFactor = Math.min(5, 1 + 0.25 * D);
  const spawnIntervalMs = Math.max(260, 900 / (1 + 0.55 * D));

  return {
    speedBoost,
    enemyDifficultyFactor,
    spawnIntervalMs,
    timeScorePerSecond: ENDLESS_SCORE_PER_SECOND,
    allowBoss: false,
    mapProgressDistance: (d: number) => d % TRACK_LENGTH
  };
};

const GameEngine: React.FC<GameEngineProps> = ({ level, mode, metaUpgrades, onSessionEnd }) => {
  const resolvedMode: GameMode = mode ?? 'CAMPAIGN';
  const upgrades: MetaUpgrades = metaUpgrades ?? {
    playerMaxHpLevel: 0,
    playerDamageReductionLevel: 0,
    weaponDamageLevel: 0,
    weaponFireRateLevel: 0,
    startingWeaponLevel: 0
  };

  const playerMaxHp = 100 + upgrades.playerMaxHpLevel * 10;
  const damageReduction = Math.min(0.30, upgrades.playerDamageReductionLevel * 0.04);
  const weaponDamageMult = 1 + upgrades.weaponDamageLevel * 0.06;
  const weaponFireRateMult = 1 + upgrades.weaponFireRateLevel * 0.05;
  const startingWeapon: WeaponType = WEAPON_TIER[Math.max(0, Math.min(WEAPON_TIER.length - 1, upgrades.startingWeaponLevel))];

  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.PLAYING);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [playerLane, setPlayerLane] = useState(2);
  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  const [survivalTimeMs, setSurvivalTimeMs] = useState(0);
  const [kills, setKills] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [energy, setEnergy] = useState<EnergyState>({ current: 40, max: ENERGY_MAX, totalGained: 0 });
  const [skills, setSkills] = useState<Record<SkillId, SkillState>>({
    rage: {
      id: 'rage',
      unlocked: false,
      cooldownSeconds: SKILL_DEFS.rage.cooldownSeconds,
      cooldownRemaining: 0,
      durationSeconds: SKILL_DEFS.rage.durationSeconds,
      activeRemaining: 0,
      energyCost: SKILL_DEFS.rage.energyCost
    },
    shield: {
      id: 'shield',
      unlocked: false,
      cooldownSeconds: SKILL_DEFS.shield.cooldownSeconds,
      cooldownRemaining: 0,
      durationSeconds: SKILL_DEFS.shield.durationSeconds,
      activeRemaining: 0,
      energyCost: SKILL_DEFS.shield.energyCost,
      chargesRemaining: 0,
      chargeMax: 1
    },
    aoe: {
      id: 'aoe',
      unlocked: false,
      cooldownSeconds: SKILL_DEFS.aoe.cooldownSeconds,
      cooldownRemaining: 0,
      durationSeconds: SKILL_DEFS.aoe.durationSeconds,
      activeRemaining: 0,
      energyCost: SKILL_DEFS.aoe.energyCost
    }
  });
  const [entities, setEntities] = useState<Entity[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [weapon, setWeapon] = useState<WeaponType>(startingWeapon);
  const [boss, setBoss] = useState<Boss | null>(null);

  const [particles, setParticles] = useState<Particle[]>([]);
  const [hitGlows, setHitGlows] = useState<HitGlow[]>([]);
  const [shake, setShake] = useState(0);
  const [shakeOffset, setShakeOffset] = useState({ x: 0, y: 0 });
  const [playerHurt, setPlayerHurt] = useState(0);
  const [playerHurtOffset, setPlayerHurtOffset] = useState({ x: 0, y: 0, r: 0 });
  const [aoePulse, setAoePulse] = useState<{ remainingMs: number; durationMs: number; laneCenter: number } | null>(null);
  
  const [bulletBuffs, setBulletBuffs] = useState({
    fireRateMult: 1,
    damageMult: 1,
    burnStacks: 0,
    speedMult: 1
  });

  const BURN_DURATION_MS = 2400;
  const BURN_BASE_DPS = 6;
  const BURN_DPS_PER_PICKUP = 4;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastShotTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const distanceRef = useRef<number>(0);
  const energyRef = useRef<EnergyState>(energy);
  const skillsRef = useRef<Record<SkillId, SkillState>>(skills);
  const survivalTimeMsRef = useRef<number>(survivalTimeMs);
  const bossAttackTimerRef = useRef<number>(0);
  const bossAttackCooldownMsRef = useRef<number>(2200);
  const weaponRef = useRef<WeaponType>(weapon);
  const entitiesRef = useRef<Entity[]>(entities);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastCritSoundAtRef = useRef<number>(0);
  const lastHitSoundAtRef = useRef<number>(0);
  const lastHurtSoundAtRef = useRef<number>(0);
  const lastPickupSoundAtRef = useRef<number>(0);
  const lastKillSoundAtRef = useRef<number>(0);
  const lastSkillSoundAtRef = useRef<number>(0);
  const lastTelegraphSoundAtRef = useRef<number>(0);
  const aoePulseRef = useRef<{ remainingMs: number; durationMs: number; laneCenter: number } | null>(null);
  const bossKillAwardedRef = useRef(false);
  const endlessStageRef = useRef(0);
  const nextMiniBossAtMsRef = useRef(45000);

  // Use refs for values needed inside the animation frame but outside React state updates
  // to avoid closure issues and ensure "latest" values are used for simulation logic.
  const currentLaneRef = useRef(playerLane);
  const gameStatusRef = useRef(gameStatus);
  const difficulty = Math.pow(LEVEL_DIFFICULTY_MODIFIER, level - 1);

  const [bossTelegraph, setBossTelegraph] = useState<BossTelegraph | null>(null);
  const bossTelegraphRef = useRef<BossTelegraph | null>(null);

  useEffect(() => {
    currentLaneRef.current = playerLane;
  }, [playerLane]);

  useEffect(() => {
    gameStatusRef.current = gameStatus;
  }, [gameStatus]);

  useEffect(() => {
    bossTelegraphRef.current = bossTelegraph;
  }, [bossTelegraph]);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  useEffect(() => {
    energyRef.current = energy;
  }, [energy]);

  useEffect(() => {
    skillsRef.current = skills;
  }, [skills]);

  useEffect(() => {
    weaponRef.current = weapon;
  }, [weapon]);

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    aoePulseRef.current = aoePulse;
  }, [aoePulse]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const r = el.getBoundingClientRect();
      containerSizeRef.current = { width: r.width, height: r.height };
    };

    updateSize();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateSize());
      ro.observe(el);
    }

    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
  }, []);

  useEffect(() => {
    survivalTimeMsRef.current = survivalTimeMs;
  }, [survivalTimeMs]);

  const progressDistance = resolvedMode === 'ENDLESS' ? (distance % TRACK_LENGTH) : distance;

  const ensureAudioContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return null;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    return ctx;
  }, []);

  const unlockAudio = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
  }, [ensureAudioContext]);

  const playCritSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const nowMs = performance.now();
    if (nowMs - lastCritSoundAtRef.current < 90) return;
    lastCritSoundAtRef.current = nowMs;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(0.7, now);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.07);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.010);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }, [ensureAudioContext]);

  const playHitSound = useCallback((isCrit?: boolean) => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - lastHitSoundAtRef.current < 60) return;
    lastHitSoundAtRef.current = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = isCrit ? 'triangle' : 'square';
    const f0 = isCrit ? 640 : 520;
    const f1 = isCrit ? 260 : 240;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isCrit ? 1500 : 1700, now);
    filter.Q.setValueAtTime(0.7, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isCrit ? 0.06 : 0.06, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }, [ensureAudioContext]);

  const playHurtSound = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - lastHurtSoundAtRef.current < 160) return;
    lastHurtSoundAtRef.current = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.10);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(720, now);
    filter.Q.setValueAtTime(0.9, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }, [ensureAudioContext]);

  const playPickupSound = useCallback((variant?: 'good' | 'power') => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - lastPickupSoundAtRef.current < 90) return;
    lastPickupSoundAtRef.current = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const base = variant === 'power' ? 880 : 740;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.8, now + 0.07);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.10);
  }, [ensureAudioContext]);

  const playKillSound = useCallback((variant?: 'small' | 'big') => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - lastKillSoundAtRef.current < 110) return;
    lastKillSoundAtRef.current = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    const isBig = variant === 'big';
    oscA.type = 'triangle';
    oscB.type = 'sine';

    const f0 = isBig ? 520 : 680;
    const f1 = isBig ? 180 : 260;
    oscA.frequency.setValueAtTime(f0, now);
    oscA.frequency.exponentialRampToValueAtTime(f1, now + 0.11);
    oscB.frequency.setValueAtTime(f0 * 1.5, now);
    oscB.frequency.exponentialRampToValueAtTime(f1 * 1.2, now + 0.11);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isBig ? 1400 : 1900, now);
    filter.Q.setValueAtTime(0.8, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isBig ? 0.06 : 0.045, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + 0.17);
    oscB.stop(now + 0.17);
  }, [ensureAudioContext]);

  const playSkillSound = useCallback((skillId: SkillId) => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - lastSkillSoundAtRef.current < 200) return;
    lastSkillSoundAtRef.current = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    if (skillId === 'rage') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.12);
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(380, now);
      filter.Q.setValueAtTime(0.6, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.058, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(filter);
      filter.connect(gain);
    } else if (skillId === 'shield') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(390, now + 0.14);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.Q.setValueAtTime(0.7, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.type = 'square';
      osc.frequency.setValueAtTime(610, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.16);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, now);
      filter.Q.setValueAtTime(1.2, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(filter);
      filter.connect(gain);
    }

    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }, [ensureAudioContext]);

  const playTelegraphSound = useCallback((type: BossAttackType) => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - lastTelegraphSoundAtRef.current < 320) return;
    lastTelegraphSoundAtRef.current = nowMs;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(240, now);
    filter.Q.setValueAtTime(0.7, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
    filter.connect(gain);
    gain.connect(ctx.destination);

    const pulses = type === 'SUMMON' ? [0, 0.07, 0.14] : [0, 0.11];
    const base = type === 'SUMMON' ? 620 : 740;

    for (let i = 0; i < pulses.length; i++) {
      const t0 = now + pulses[i];
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base + i * 90, t0);
      osc.frequency.exponentialRampToValueAtTime((base + i * 90) * 0.92, t0 + 0.05);
      osc.connect(filter);
      osc.start(t0);
      osc.stop(t0 + 0.055);
    }
  }, [ensureAudioContext]);

  const addHitParticles = useCallback((x: number, y: number, isFire?: boolean, isCrit?: boolean) => {
    const baseColor = isCrit
      ? (isFire ? '#ffb3a1' : '#ffcf6a')
      : (isFire ? '#ff3300' : '#ffe35a');

    if (isCrit) {
      setShake(v => Math.max(v, 0.22));
      playCritSound();
    }

    setHitGlows(prev => {
      const maxLife = isCrit ? 180 : 140;
      const radiusPx = isCrit ? 120 : 95;
      const colorRgb = isCrit
        ? (isFire ? '255,120,90' : '255,184,74')
        : (isFire ? '255,70,40' : '255,227,90');

      const next = [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        x,
        y,
        life: maxLife,
        maxLife,
        colorRgb,
        radiusPx
      }];

      return next.length > 12 ? next.slice(next.length - 12) : next;
    });

    setParticles(prev => {
      const next = [...prev];
      const count = isCrit ? 14 : 10;
      for (let i = 0; i < count; i++) {
        const size = 2 + Math.random() * 5;
        const maxLife = (isCrit ? 150 : 140) + Math.random() * (isCrit ? 170 : 170);
        next.push({
          id: Math.random().toString(36).substr(2, 9),
          x: x + (Math.random() - 0.5) * 2,
          y: y + (Math.random() - 0.5) * 2,
          vx: (Math.random() - 0.5) * 1.6,
          vy: -Math.random() * 2.2,
          life: maxLife,
          maxLife,
          size,
          color: baseColor
        });
      }
      return next;
    });
  }, [playCritSound]);

  const damagePlayer = useCallback((amount: number) => {
    setPlayerHp(h => {
      const newHp = h - amount;
      if (newHp < h) {
        setShake(1);
        setPlayerHurt(1);
        setHitGlows(prev => {
          const maxLife = 170;
          const radiusPx = 120;
          const colorRgb = '255,70,70';
          const next = [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            x: (currentLaneRef.current * 20) + 10,
            y: 90,
            life: maxLife,
            maxLife,
            colorRgb,
            radiusPx
          }];
          return next.length > 12 ? next.slice(next.length - 12) : next;
        });
        playHurtSound();
      }
      if (newHp <= 0) setGameStatus(GameStatus.GAMEOVER);
      return Math.max(0, newHp);
    });
  }, [playHurtSound]);

  const gainEnergy = useCallback((amount: number) => {
    if (amount <= 0) return;
    setEnergy(e => {
      const nextCurrent = Math.min(e.max, e.current + amount);
      return { ...e, current: nextCurrent, totalGained: e.totalGained + amount };
    });
  }, []);

  const awardZombieKills = useCallback((count: number, variant?: 'small' | 'big', eliteTier: number = 0) => {
    if (count <= 0) return;

    const tier = Math.max(0, Math.floor(eliteTier));
    const scorePer = tier >= 3 ? 240 : tier === 2 ? 120 : tier === 1 ? 60 : 25;
    const coinsPer = tier >= 3 ? 30 : tier === 2 ? 14 : tier === 1 ? 6 : 2;
    const energyPer = tier >= 3 ? 14 : tier === 2 ? 10 : tier === 1 ? 6 : ENERGY_GAIN_PER_KILL;

    playKillSound(variant ?? 'small');
    setScore(s => s + count * scorePer);
    setKills(v => v + count);
    gainEnergy(count * energyPer);
    setCoinsEarned(c => c + count * coinsPer);
  }, [gainEnergy, playKillSound]);

  const awardBossKill = useCallback(() => {
    if (bossKillAwardedRef.current) return;
    bossKillAwardedRef.current = true;
    playKillSound('big');
    setScore(s => s + 400);
    setCoinsEarned(c => c + 40);
  }, [playKillSound]);

  const spendEnergy = useCallback((amount: number) => {
    if (amount <= 0) return true;
    const e = energyRef.current;
    if (e.current < amount) return false;
    setEnergy(prev => ({ ...prev, current: Math.max(0, prev.current - amount) }));
    return true;
  }, []);

  const tryDamagePlayer = useCallback((amount: number) => {
    const s = skillsRef.current;
    if (s.shield.activeRemaining > 0 && (s.shield.chargesRemaining ?? 0) > 0) {
      setSkills(prev => {
        const shield = prev.shield;
        if (shield.activeRemaining <= 0 || (shield.chargesRemaining ?? 0) <= 0) return prev;
        return {
          ...prev,
          shield: {
            ...shield,
            activeRemaining: 0,
            chargesRemaining: 0
          }
        };
      });
      setShake(1);
      addHitParticles((currentLaneRef.current * 20) + 10, 90, true);
      playHurtSound();
      return;
    }

    const reduced = amount * (1 - damageReduction);
    damagePlayer(reduced);
  }, [addHitParticles, damagePlayer, damageReduction, playHurtSound]);

  const startBossTelegraph = useCallback((type: BossAttackType, lanes: number[], durationMs: number) => {
    const tg: BossTelegraph = { type, lanes, remainingMs: durationMs, durationMs };
    bossTelegraphRef.current = tg;
    setBossTelegraph(tg);
    playTelegraphSound(type);
  }, [playTelegraphSound]);

  const executeBossAttack = useCallback((tg: BossTelegraph) => {
    if (tg.type === 'SLAM') {
      const lane = tg.lanes[0] ?? 0;
      if (currentLaneRef.current === lane) {
        tryDamagePlayer(18);
      }
      setShake(1);
      addHitParticles((lane * 20) + 10, 90, true);
      return;
    }

    if (tg.type === 'BARRAGE') {
      if (tg.lanes.includes(currentLaneRef.current)) {
        tryDamagePlayer(14);
      }
      for (const lane of tg.lanes) {
        addHitParticles((lane * 20) + 10, 90, true);
      }
      return;
    }

    if (tg.type === 'SUMMON') {
      setEntities(prev => {
        const next = [...prev];
        for (const lane of tg.lanes) {
          next.push({
            id: Math.random().toString(36).substr(2, 9),
            lane,
            z: -10,
            type: EntityType.ZOMBIE,
            hp: 35 * difficulty,
            maxHp: 35 * difficulty,
            width: 50,
            height: 50
          });
        }
        return next;
      });
      return;
    }
  }, [addHitParticles, difficulty, tryDamagePlayer]);

  const spawnEntity = useCallback(() => {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const id = Math.random().toString(36).substr(2, 9);
    const rand = Math.random();
    
    let newEntity: Entity;
    if (rand < 0.6) {
      newEntity = { id, lane, z: -10, type: EntityType.ZOMBIE, hp: 25 * difficulty, maxHp: 25 * difficulty, width: 50, height: 50 };
    } else if (rand < 0.78) {
      newEntity = { id, lane, z: -10, type: EntityType.OBSTACLE, hp: 99999, maxHp: 99999, width: 60, height: 40 };
    } else if (rand < 0.94) {
      newEntity = {
        id, lane, z: -10,
        type: EntityType.BULLET_UPGRADE,
        hp: 1, maxHp: 1, width: 45, height: 45,
        subType: ['RATE', 'DMG', 'FIRE'][Math.floor(Math.random() * 3)]
      };
    } else if (rand < 0.952) {
      const nextWeapon = getNextWeapon(weaponRef.current);
      if (nextWeapon) {
        newEntity = {
          id, lane, z: -10,
          type: EntityType.WEAPON_UPGRADE,
          hp: 1, maxHp: 1, width: 45, height: 45,
          subType: nextWeapon
        };
      } else {
        newEntity = {
          id, lane, z: -10,
          type: EntityType.BULLET_UPGRADE,
          hp: 1, maxHp: 1, width: 45, height: 45,
          subType: ['RATE', 'DMG', 'FIRE'][Math.floor(Math.random() * 3)]
        };
      }
    } else if (rand < 0.965) {
      newEntity = { id, lane, z: -10, type: EntityType.HEAL, hp: 1, maxHp: 1, width: 45, height: 45 };
    } else if (rand < 0.99) {
      newEntity = { id, lane, z: -10, type: EntityType.ENERGY, hp: 1, maxHp: 1, width: 45, height: 45, subType: 'BATTERY' };
    } else {
      const s: SkillId = (['rage', 'shield', 'aoe'] as SkillId[])[Math.floor(Math.random() * 3)];
      const label = s === 'rage' ? 'Rage Core' : s === 'shield' ? 'Shield Module' : 'Pulse Emitter';
      newEntity = { id, lane, z: -10, type: EntityType.SKILL_UNLOCK, hp: 1, maxHp: 1, width: 45, height: 45, subType: label };
    }
    
    setEntities(prev => [...prev, newEntity]);
  }, [difficulty]);

  const spawnEntityWithDifficulty = useCallback((difficultyFactor: number) => {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const id = Math.random().toString(36).substr(2, 9);
    const rand = Math.random();

    let newEntity: Entity;
    if (rand < 0.6) {
      const stage = endlessStageRef.current;
      const eliteChance = Math.min(0.35, 0.06 + stage * 0.03);
      let eliteTier = 0;
      if (Math.random() < eliteChance) {
        eliteTier = stage >= 7 && Math.random() < 0.25 ? 2 : 1;
      }

      const hpMult = eliteTier === 2 ? 4.2 : eliteTier === 1 ? 2.2 : 1;
      const size = eliteTier === 2 ? 74 : eliteTier === 1 ? 62 : 50;
      const label = eliteTier === 2 ? '精英+' : eliteTier === 1 ? '精英' : undefined;
      const hp = 25 * difficultyFactor * hpMult;

      newEntity = {
        id,
        lane,
        z: -10,
        type: EntityType.ZOMBIE,
        hp,
        maxHp: hp,
        width: size,
        height: size,
        subType: label,
        eliteTier
      };
    } else if (rand < 0.78) {
      newEntity = { id, lane, z: -10, type: EntityType.OBSTACLE, hp: 99999, maxHp: 99999, width: 60, height: 40 };
    } else if (rand < 0.94) {
      newEntity = {
        id, lane, z: -10,
        type: EntityType.BULLET_UPGRADE,
        hp: 1, maxHp: 1, width: 45, height: 45,
        subType: ['RATE', 'DMG', 'FIRE'][Math.floor(Math.random() * 3)]
      };
    } else if (rand < 0.952) {
      const nextWeapon = getNextWeapon(weaponRef.current);
      if (nextWeapon) {
        newEntity = {
          id, lane, z: -10,
          type: EntityType.WEAPON_UPGRADE,
          hp: 1, maxHp: 1, width: 45, height: 45,
          subType: nextWeapon
        };
      } else {
        newEntity = {
          id, lane, z: -10,
          type: EntityType.BULLET_UPGRADE,
          hp: 1, maxHp: 1, width: 45, height: 45,
          subType: ['RATE', 'DMG', 'FIRE'][Math.floor(Math.random() * 3)]
        };
      }
    } else if (rand < 0.965) {
      newEntity = { id, lane, z: -10, type: EntityType.HEAL, hp: 1, maxHp: 1, width: 45, height: 45 };
    } else if (rand < 0.99) {
      newEntity = { id, lane, z: -10, type: EntityType.ENERGY, hp: 1, maxHp: 1, width: 45, height: 45, subType: 'BATTERY' };
    } else {
      const s: SkillId = (['rage', 'shield', 'aoe'] as SkillId[])[Math.floor(Math.random() * 3)];
      const label = s === 'rage' ? 'Rage Core' : s === 'shield' ? 'Shield Module' : 'Pulse Emitter';
      newEntity = { id, lane, z: -10, type: EntityType.SKILL_UNLOCK, hp: 1, maxHp: 1, width: 45, height: 45, subType: label };
    }

    setEntities(prev => [...prev, newEntity]);
  }, []);

  const spawnMiniBossWithDifficulty = useCallback((difficultyFactor: number, stage: number) => {
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const id = Math.random().toString(36).substr(2, 9);
    const tier = 3;
    const hpMult = 7.5 + stage * 1.2;
    const hp = 25 * difficultyFactor * hpMult;

    const e: Entity = {
      id,
      lane,
      z: -10,
      type: EntityType.ZOMBIE,
      hp,
      maxHp: hp,
      width: 92,
      height: 92,
      subType: '巨兽',
      eliteTier: tier
    };
    setEntities(prev => [...prev, e]);
  }, []);

  const unlockSkill = useCallback((skillId: SkillId) => {
    setSkills(prev => {
      const next = { ...prev };
      next[skillId] = { ...next[skillId], unlocked: true };
      return next;
    });
  }, []);

  const tryUseSkill = useCallback((skillId: SkillId) => {
    if (gameStatusRef.current === GameStatus.GAMEOVER || gameStatusRef.current === GameStatus.VICTORY) return;

    const s = skillsRef.current[skillId];
    if (!s.unlocked) return;
    if (s.cooldownRemaining > 0) return;
    if (s.activeRemaining > 0) return;
    if (!spendEnergy(s.energyCost)) return;

    playSkillSound(skillId);

    if (skillId === 'aoe') {
      const stats = WEAPON_MAP[weapon];
      const baseDamage = stats.damage * bulletBuffs.damageMult * weaponDamageMult * AOE_DAMAGE_MULT;
      const laneCenter = currentLaneRef.current;
      let kills = 0;
      const tierKills: Record<number, number> = {};

      setAoePulse({ remainingMs: 320, durationMs: 320, laneCenter });

      setEntities(prev => {
        return prev.map(e => {
          if (e.type !== EntityType.ZOMBIE) return e;
          if (Math.abs(e.z - 90) > AOE_Z_RANGE) return e;
          if (Math.abs(e.lane - laneCenter) > 2) return e;
          const newHp = e.hp - baseDamage;
          if (newHp <= 0) {
            kills += 1;
            const tier = Math.max(0, Math.floor(e.eliteTier ?? 0));
            tierKills[tier] = (tierKills[tier] ?? 0) + 1;
          }
          addHitParticles((e.lane * 20) + 10, e.z, true);
          return { ...e, hp: newHp };
        }).filter(e => e.hp > 0);
      });

      if (gameStatusRef.current === GameStatus.BOSS_FIGHT) {
        setBoss(b => {
          if (!b) return b;
          const newHp = b.hp - baseDamage * 0.30;
          if (newHp <= 0) {
            awardBossKill();
            setGameStatus(GameStatus.VICTORY);
          }
          return { ...b, hp: newHp };
        });
      }

      if (kills > 0) {
        if (Object.keys(tierKills).length === 0) {
          awardZombieKills(kills, 'big');
        } else {
          for (const k of Object.keys(tierKills)) {
            const tier = Number(k);
            const count = tierKills[tier] ?? 0;
            if (count > 0) awardZombieKills(count, 'big', tier);
          }
        }
      }

      setShake(1);
    }

    setSkills(prev => {
      const next = { ...prev };
      const cur = next[skillId];

      if (skillId === 'shield') {
        next[skillId] = {
          ...cur,
          cooldownRemaining: cur.cooldownSeconds,
          activeRemaining: cur.durationSeconds,
          chargesRemaining: 1,
          chargeMax: 1
        };
      } else {
        next[skillId] = {
          ...cur,
          cooldownRemaining: cur.cooldownSeconds,
          activeRemaining: cur.durationSeconds
        };
      }
      return next;
    });
  }, [addHitParticles, awardBossKill, awardZombieKills, bulletBuffs.damageMult, playSkillSound, spendEnergy, weapon, weaponDamageMult]);

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

    const shouldTickSurvival = gameStatusRef.current !== GameStatus.GAMEOVER && gameStatusRef.current !== GameStatus.VICTORY;
    if (shouldTickSurvival) {
      setSurvivalTimeMs(v => v + deltaTime);
    }

    const dtSeconds = deltaTime / 1000;
    gainEnergy(ENERGY_GAIN_PER_SECOND * dtSeconds);

    const approxSurvivalMs = shouldTickSurvival ? (survivalTimeMsRef.current + deltaTime) : survivalTimeMsRef.current;
    const modeRuntime = getModeRuntime(resolvedMode, difficulty, approxSurvivalMs);

    if (resolvedMode === 'ENDLESS' && gameStatusRef.current === GameStatus.PLAYING) {
      const stage = Math.max(0, Math.floor((approxSurvivalMs / 1000) / 30));
      endlessStageRef.current = stage;

      if (approxSurvivalMs >= nextMiniBossAtMsRef.current) {
        spawnMiniBossWithDifficulty(modeRuntime.enemyDifficultyFactor, stage);
        const nextInterval = Math.max(28000, 55000 - stage * 3500);
        nextMiniBossAtMsRef.current = approxSurvivalMs + nextInterval;
      }
    }
    if (modeRuntime.timeScorePerSecond > 0) {
      setScore(s => s + modeRuntime.timeScorePerSecond * dtSeconds);
    }

    setSkills(prev => {
      const next: Record<SkillId, SkillState> = {
        rage: { ...prev.rage },
        shield: { ...prev.shield },
        aoe: { ...prev.aoe }
      };

      for (const id of ['rage', 'shield', 'aoe'] as SkillId[]) {
        const s = next[id];
        if (s.cooldownRemaining > 0) s.cooldownRemaining = Math.max(0, s.cooldownRemaining - dtSeconds);
        if (s.activeRemaining > 0) {
          s.activeRemaining = Math.max(0, s.activeRemaining - dtSeconds);
          if (id === 'shield' && s.activeRemaining === 0) {
            s.chargesRemaining = 0;
          }
        }
      }

      return next;
    });

    const progress = Math.max(0, Math.min(1, distanceRef.current / TRACK_LENGTH));
    const easedProgress = progress * progress;
    const entitySpeed = 0.18 + (0.55 - 0.18) * easedProgress;

    const speedMult = 1;

    if (gameStatusRef.current === GameStatus.GAMEOVER || gameStatusRef.current === GameStatus.VICTORY) return;

    setHitGlows(prev => {
      if (prev.length === 0) return prev;
      const next: HitGlow[] = [];
      for (const g of prev) {
        const life = g.life - deltaTime;
        if (life <= 0) continue;
        next.push({ ...g, life });
      }
      return next;
    });
    setAoePulse(p => {
      if (!p) return p;
      const next = p.remainingMs - deltaTime;
      if (next <= 0) return null;
      return { ...p, remainingMs: next };
    });

    setShake(v => {
      if (v <= 0) return v;
      const next = Math.max(0, v - deltaTime / 140);
      if (next > 0) {
        setShakeOffset({
          x: (Math.random() - 0.5) * 10 * next,
          y: (Math.random() - 0.5) * 10 * next
        });
      } else {
        setShakeOffset({ x: 0, y: 0 });
      }
      return next;
    });

    setPlayerHurt(v => {
      if (v <= 0) return v;
      const next = Math.max(0, v - deltaTime / 160);
      if (next > 0) {
        setPlayerHurtOffset({
          x: (Math.random() - 0.5) * 8 * next,
          y: (Math.random() - 0.5) * 6 * next,
          r: (Math.random() - 0.5) * 12 * next
        });
      } else {
        setPlayerHurtOffset({ x: 0, y: 0, r: 0 });
      }
      return next;
    });

    setParticles(prev => {
      if (prev.length === 0) return prev;
      const next: Particle[] = [];
      for (const p of prev) {
        const life = p.life - deltaTime;
        if (life <= 0) continue;
        next.push({
          ...p,
          life,
          x: p.x + p.vx * frameFactor,
          y: p.y + p.vy * frameFactor,
          vy: p.vy + 0.08 * frameFactor
        });
      }
      return next;
    });

    if (gameStatusRef.current === GameStatus.BOSS_FIGHT) {
      const tg = bossTelegraphRef.current;
      if (tg) {
        const nextRemaining = tg.remainingMs - deltaTime;
        if (nextRemaining <= 0) {
          bossTelegraphRef.current = null;
          setBossTelegraph(null);
          executeBossAttack(tg);
          setBoss(b => (b ? { ...b, attacks: (b.attacks ?? 0) + 1 } : b));
          bossAttackTimerRef.current = 0;
          bossAttackCooldownMsRef.current = 1800 + Math.random() * 900;
        } else {
          const nextTg = { ...tg, remainingMs: nextRemaining };
          bossTelegraphRef.current = nextTg;
          setBossTelegraph(nextTg);
        }
      } else {
        bossAttackTimerRef.current += deltaTime;
        if (bossAttackTimerRef.current >= bossAttackCooldownMsRef.current) {
          bossAttackTimerRef.current = 0;
          const r = Math.random();
          if (r < 0.45) {
            const lane = Math.floor(Math.random() * LANE_COUNT);
            startBossTelegraph('SLAM', [lane], 650);
          } else if (r < 0.8) {
            let laneA = Math.floor(Math.random() * LANE_COUNT);
            let laneB = Math.floor(Math.random() * LANE_COUNT);
            if (laneB === laneA) laneB = (laneA + 1) % LANE_COUNT;
            startBossTelegraph('BARRAGE', [laneA, laneB], 850);
          } else {
            const lanes = [
              Math.floor(Math.random() * LANE_COUNT),
              Math.floor(Math.random() * LANE_COUNT),
              Math.floor(Math.random() * LANE_COUNT)
            ].filter((v, idx, arr) => arr.indexOf(v) === idx);
            startBossTelegraph('SUMMON', lanes.length > 0 ? lanes : [2], 900);
          }
        }
      }
    }

    // 1. Progress & Distance
    if (gameStatusRef.current === GameStatus.PLAYING) {
      setDistance(prev => {
        const next = prev + BASE_SPEED * frameFactor * speedMult * modeRuntime.speedBoost;
        distanceRef.current = next;
        if (modeRuntime.allowBoss && next >= TRACK_LENGTH) {
          setGameStatus(GameStatus.BOSS_FIGHT);
          setBoss({ name: "变异指挥官", hp: 1500 * difficulty, maxHp: 1500 * difficulty, attacks: 0 });
          bossAttackTimerRef.current = 0;
          bossAttackCooldownMsRef.current = 1200;
          return TRACK_LENGTH;
        }
        return next;
      });

      spawnTimerRef.current += deltaTime;
      if (spawnTimerRef.current > modeRuntime.spawnIntervalMs) {
        if (modeRuntime.allowBoss) {
          spawnEntity();
        } else {
          spawnEntityWithDifficulty(modeRuntime.enemyDifficultyFactor);
        }
        spawnTimerRef.current = 0;
      }
    }

    // 2. Shooting Logic
    const stats = WEAPON_MAP[weapon];
    const shootInterval = stats.fireRate / (bulletBuffs.fireRateMult * weaponFireRateMult);
    if (time - lastShotTimeRef.current >= shootInterval) {
      const rageActive = skillsRef.current.rage.activeRemaining > 0;
      const newShots: Projectile[] = [];
      const createShot = (baseOffset: number, spreadJitter: number) => {
        const hasBurn = bulletBuffs.burnStacks > 0;
        const burnDps = hasBurn ? (BURN_BASE_DPS + (bulletBuffs.burnStacks - 1) * BURN_DPS_PER_PICKUP) : 0;
        newShots.push({
          id: Math.random().toString(36).substr(2, 9),
          lane: currentLaneRef.current,
          z: 85,
          damage: stats.damage * bulletBuffs.damageMult * weaponDamageMult,
          color: hasBurn ? '#ff4a2a' : '#ffff00',
          isFire: hasBurn,
          burnDps: hasBurn ? burnDps : undefined,
          burnDurationMs: hasBurn ? BURN_DURATION_MS : undefined,
          xOffset: baseOffset + spreadJitter,
          pierce: stats.pierce,
          critChance: stats.critChance,
          critMultiplier: stats.critMultiplier
        });
      };

      for (let i = 0; i < stats.burst; i++) {
        const baseSpread = stats.spread > 0 ? stats.spread : 0;
        if (rageActive) {
          const sep = 9;
          const jitter = baseSpread > 0 ? (Math.random() - 0.5) * 2 * (baseSpread * 0.45) : 0;
          createShot(-sep, jitter);
          createShot(sep, jitter);
        } else {
          const jitter = baseSpread > 0 ? (Math.random() - 0.5) * 2 * baseSpread : 0;
          createShot(0, jitter);
        }
      }
      setProjectiles(prev => [...prev, ...newShots]);
      lastShotTimeRef.current = time;
    }

    // 3. Entity Movement & Player Collision
    setEntities(prevEntities => {
      const nextEntities: Entity[] = [];

      const burnDt = dtSeconds;

      const { width: cw, height: ch } = containerSizeRef.current;
      const laneWidthPx = cw > 0 ? cw / LANE_COUNT : 0;
      const playerX = laneWidthPx > 0 ? (currentLaneRef.current + 0.5) * laneWidthPx : 0;
      const playerBottomY = ch > 0 ? ch * 0.9 : 0;
      const playerW = 80;
      const playerH = 96;
      const playerAabb: Aabb = {
        minX: playerX - playerW / 2,
        maxX: playerX + playerW / 2,
        minY: playerBottomY - playerH,
        maxY: playerBottomY
      };
      const damagePlayerAabb = insetAabb(playerAabb, playerW * 0.18, playerH * 0.12);
      const pickupPlayerAabb = expandAabb(playerAabb, 10, 8);
      const laneMinX = laneWidthPx > 0 ? currentLaneRef.current * laneWidthPx : 0;
      const laneMaxX = laneWidthPx > 0 ? (currentLaneRef.current + 1) * laneWidthPx : 0;
      const pickupLaneInsetX = 6;
      const pickupPlayerAabbClamped: Aabb = laneWidthPx > 0
        ? {
            ...pickupPlayerAabb,
            minX: Math.max(pickupPlayerAabb.minX, laneMinX + pickupLaneInsetX),
            maxX: Math.min(pickupPlayerAabb.maxX, laneMaxX - pickupLaneInsetX)
          }
        : pickupPlayerAabb;

      for (const e of prevEntities) {
        let cur: Entity = e;

        if (cur.type === EntityType.ZOMBIE && (cur.burnRemainingMs ?? 0) > 0 && (cur.burnDps ?? 0) > 0) {
          const burnDamage = (cur.burnDps ?? 0) * burnDt;
          const nextBurnRemainingMs = Math.max(0, (cur.burnRemainingMs ?? 0) - deltaTime);
          const nextHp = cur.hp - burnDamage;
          if (nextHp <= 0) {
            awardZombieKills(1, 'small', cur.eliteTier ?? 0);
            continue;
          }
          cur = {
            ...cur,
            hp: nextHp,
            burnRemainingMs: nextBurnRemainingMs,
            burnDps: nextBurnRemainingMs > 0 ? cur.burnDps : 0
          };
        }

        const nextZ = cur.z + entitySpeed * frameFactor * speedMult;

        let collided = false;
        if (cw > 0 && ch > 0) {
          const ex = (cur.lane + 0.5) * laneWidthPx;
          const ey = (nextZ / 100) * ch;
          const entityAabb: Aabb = {
            minX: ex - cur.width / 2,
            maxX: ex + cur.width / 2,
            minY: ey - cur.height / 2,
            maxY: ey + cur.height / 2
          };

          const harmful = cur.type === EntityType.ZOMBIE || cur.type === EntityType.OBSTACLE;
          if (harmful) {
            collided = cur.lane === currentLaneRef.current && aabbIntersects(damagePlayerAabb, insetAabb(entityAabb, cur.width * 0.12, cur.height * 0.12));
          } else {
            collided = cur.lane === currentLaneRef.current && aabbIntersects(pickupPlayerAabbClamped, expandAabb(entityAabb, 6, 6));
          }
        } else {
          collided = nextZ > 84 && nextZ < 94 && cur.lane === currentLaneRef.current;
        }

        if (collided) {
          if (cur.type === EntityType.ZOMBIE || cur.type === EntityType.OBSTACLE) {
            tryDamagePlayer(cur.type === EntityType.ZOMBIE ? 12 : 25);
          } else if (cur.type === EntityType.WEAPON_UPGRADE) {
            const nextWeapon = getNextWeapon(weapon);
            if (nextWeapon && cur.subType === nextWeapon) {
              setWeapon(nextWeapon);
              setScore(s => s + 100);
            }
            playPickupSound('power');
          } else if (cur.type === EntityType.BULLET_UPGRADE) {
            setBulletBuffs(b => ({
              ...b,
              fireRateMult: cur.subType === 'RATE' ? b.fireRateMult + 0.06 : b.fireRateMult,
              damageMult: cur.subType === 'DMG' ? b.damageMult + 0.08 : b.damageMult,
              burnStacks: cur.subType === 'FIRE' ? (b.burnStacks + 1) : b.burnStacks
            }));
            setScore(s => s + 50);
            playPickupSound('power');
          } else if (cur.type === EntityType.HEAL) {
            setPlayerHp(h => Math.min(playerMaxHp, h + 30));
            playPickupSound('good');
          } else if (cur.type === EntityType.ENERGY) {
            gainEnergy(25);
            setScore(s => s + 30);
            playPickupSound('good');
          } else if (cur.type === EntityType.SKILL_UNLOCK) {
            const label = cur.subType ?? '';
            const skillId: SkillId = label.includes('Rage') ? 'rage' : label.includes('Shield') ? 'shield' : 'aoe';
            unlockSkill(skillId);
            setScore(s => s + 75);
            playPickupSound('power');
          }
          // Remove entity on collision
          continue;
        }

        if (nextZ < 110) {
          nextEntities.push({ ...cur, z: nextZ });
        }
      }
      return nextEntities;
    });

    if (gameStatusRef.current === GameStatus.BOSS_FIGHT) {
      setBoss(b => {
        if (!b) return b;
        if ((b.burnRemainingMs ?? 0) <= 0 || (b.burnDps ?? 0) <= 0) return b;
        const nextBurnRemainingMs = Math.max(0, (b.burnRemainingMs ?? 0) - deltaTime);
        const burnDamage = (b.burnDps ?? 0) * dtSeconds;
        const nextHp = b.hp - burnDamage;
        if (nextHp <= 0) {
          awardBossKill();
          setGameStatus(GameStatus.VICTORY);
        }
        return {
          ...b,
          hp: nextHp,
          burnRemainingMs: nextBurnRemainingMs,
          burnDps: nextBurnRemainingMs > 0 ? b.burnDps : 0
        };
      });
    }

    // 4. Projectile Movement & Combat
    setProjectiles(prevProjs => {
      const nextProjs: Projectile[] = [];
      const pSpeed = stats.bulletSpeed * 3.5; // Fast bullet movement

      for (const p of prevProjs) {
        const nextZ = p.z - pSpeed * frameFactor;
        let hit = false;
        let hitEntityId: string | null = null;
        const pierce = p.pierce ?? false;
        const critChance = p.critChance ?? 0;
        const critMultiplier = p.critMultiplier ?? 2;
        const hitEntityIds = p.hitEntityIds ?? [];

        // Check hits against standard entities (sync detection, then apply damage)
        let hitTarget: Entity | null = null;
        for (const e of entitiesRef.current) {
          if (e.type !== EntityType.ZOMBIE) continue;
          if (e.lane !== p.lane) continue;
          if (hitEntityIds.includes(e.id)) continue;
          if (Math.abs(e.z - nextZ) >= 8) continue;
          hitTarget = e;
          break;
        }

        if (hitTarget) {
          hit = true;
          hitEntityId = hitTarget.id;
          const isCrit = Math.random() < critChance;
          const dmg = isCrit ? p.damage * critMultiplier : p.damage;
          addHitParticles((p.lane * 20) + 10, hitTarget.z, p.isFire, isCrit);
          playHitSound(isCrit);
          setEntities(prev => {
            return prev
              .map(e => {
                if (e.id !== hitTarget!.id) return e;
                const newHp = e.hp - dmg;
                if (p.burnDps && (p.burnDurationMs ?? 0) > 0) {
                  const nextBurnRemainingMs = Math.max(e.burnRemainingMs ?? 0, p.burnDurationMs ?? 0);
                  const nextBurnDps = Math.max(e.burnDps ?? 0, p.burnDps ?? 0);
                  return { ...e, hp: newHp, burnRemainingMs: nextBurnRemainingMs, burnDps: nextBurnDps };
                }
                return { ...e, hp: newHp };
              })
              .filter(e => e.hp > 0);
          });
          // If it was a kill, award after the hp update (approximate: use current hp snapshot)
          if (hitTarget.hp - dmg <= 0) {
            awardZombieKills(1, 'small', hitTarget.eliteTier ?? 0);
          }
        }

        // Check hit against Boss
        if (!hit && gameStatusRef.current === GameStatus.BOSS_FIGHT && nextZ < 25 && !(p.hitBoss ?? false)) {
          const isCrit = Math.random() < critChance;
          addHitParticles((p.lane * 20) + 10, 25, p.isFire, isCrit);
          playHitSound(isCrit);
          setBoss(b => {
            if (!b) return null;
            const dmg = isCrit ? p.damage * critMultiplier : p.damage;
            const newHp = b.hp - dmg;
            if (newHp <= 0) {
              awardBossKill();
              setGameStatus(GameStatus.VICTORY);
            }
            if (p.burnDps && (p.burnDurationMs ?? 0) > 0) {
              const nextBurnRemainingMs = Math.max(b.burnRemainingMs ?? 0, p.burnDurationMs ?? 0);
              const nextBurnDps = Math.max(b.burnDps ?? 0, p.burnDps ?? 0);
              return { ...b, hp: newHp, burnRemainingMs: nextBurnRemainingMs, burnDps: nextBurnDps };
            }
            return { ...b, hp: newHp };
          });
          hit = true;
        }

        if (nextZ > -10 && (!hit || pierce)) {
          const nextP: Projectile = { ...p, z: nextZ };
          if (pierce && hitEntityId) {
            nextP.hitEntityIds = [...hitEntityIds, hitEntityId];
          }
          if (pierce && gameStatusRef.current === GameStatus.BOSS_FIGHT && nextZ < 25) {
            nextP.hitBoss = true;
          }
          nextProjs.push(nextP);
        }
      }
      return nextProjs;
    });

    requestRef.current = requestAnimationFrame(update);
  }, [awardBossKill, awardZombieKills, difficulty, executeBossAttack, gainEnergy, playerMaxHp, resolvedMode, spawnEntity, spawnEntityWithDifficulty, spawnMiniBossWithDifficulty, startBossTelegraph, tryDamagePlayer, weapon, bulletBuffs, weaponDamageMult, weaponFireRateMult]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current);
  }, [update]);

  // Controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        setPlayerLane(l => Math.max(0, l - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setPlayerLane(l => Math.min(LANE_COUNT - 1, l + 1));
      } else if (e.key === '1' || e.key === 'q' || e.key === 'Q') {
        tryUseSkill('rage');
      } else if (e.key === '2' || e.key === 'e' || e.key === 'E') {
        tryUseSkill('shield');
      } else if (e.key === '3' || e.key === 'r' || e.key === 'R') {
        tryUseSkill('aoe');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [tryUseSkill, unlockAudio]);

  const skillSlots = [
    { id: 'rage' as const, icon: 'fa-solid fa-fire', key: '1/Q' },
    { id: 'shield' as const, icon: 'fa-solid fa-shield-halved', key: '2/E' },
    { id: 'aoe' as const, icon: 'fa-solid fa-burst', key: '3/R' }
  ];

  const playerHpPct = playerMaxHp > 0 ? Math.max(0, Math.min(1, playerHp / playerMaxHp)) : 0;

  return (
    <div
      ref={containerRef}
      onPointerDown={unlockAudio}
      className="relative w-full h-[85svh] md:h-[85vh] bg-[#0c0c0c] border-x-8 border-[#1a1a1a] overflow-hidden select-none shadow-inner"
    >
      <div
        className="absolute inset-0"
        style={{ transform: `translate3d(${Math.round(shakeOffset.x)}px, ${Math.round(shakeOffset.y)}px, 0)` }}
      >
      {/* Visual Lanes */}
      <div className="absolute inset-0 flex">
        {[...Array(LANE_COUNT)].map((_, i) => (
          <div key={i} className={`flex-1 border-r border-white/5 scrolling-lane ${i === 0 ? 'border-l border-white/5' : ''}`}></div>
        ))}
      </div>

      {bossTelegraph && (
        <div className="absolute inset-0 flex pointer-events-none z-[15]">
          {[...Array(LANE_COUNT)].map((_, i) => {
            const active = bossTelegraph.lanes.includes(i);
            if (!active) return <div key={i} className="flex-1"></div>;
            const t = 1 - Math.max(0, Math.min(1, bossTelegraph.remainingMs / bossTelegraph.durationMs));
            const alpha = 0.10 + 0.22 * Math.abs(Math.sin(t * Math.PI * 6));
            const isSummon = bossTelegraph.type === 'SUMMON';
            const color = isSummon ? '0,255,160' : '255,0,0';
            return (
              <div
                key={i}
                className="flex-1"
                style={{
                  background: `linear-gradient(180deg, rgba(${color},${alpha}) 0%, rgba(${color},${alpha * 0.35}) 55%, rgba(${color},0) 100%)`,
                  boxShadow: `inset 0 0 50px rgba(${color},${alpha * 0.65})`
                }}
              ></div>
            );
          })}

          {bossTelegraph.type === 'SUMMON' && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg border border-emerald-400/40 bg-emerald-900/20 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">尸潮将至</div>
            </div>
          )}

          {(bossTelegraph.type === 'SLAM' || bossTelegraph.type === 'BARRAGE') && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg border border-red-500/40 bg-red-950/20 backdrop-blur-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.35em] text-red-300">车道打击</div>
            </div>
          )}
        </div>
      )}

      {hitGlows.map(g => {
        const t = Math.max(0, Math.min(1, g.life / g.maxLife));
        const alpha = 0.55 * t * t;
        return (
          <div
            key={g.id}
            className="absolute pointer-events-none z-[25]"
            style={{
              left: `${g.x}%`,
              top: `${g.y}%`,
              width: `${g.radiusPx * 2}px`,
              height: `${g.radiusPx * 2}px`,
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, rgba(${g.colorRgb},${alpha}) 0%, rgba(${g.colorRgb},${alpha * 0.35}) 35%, rgba(${g.colorRgb},0) 72%)`,
              filter: 'blur(2px)',
              mixBlendMode: 'screen'
            }}
          ></div>
        );
      })}

      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none z-30"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            opacity: Math.max(0, Math.min(1, p.life / p.maxLife)),
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            mixBlendMode: 'screen'
          }}
        ></div>
      ))}

      {/* Projectiles */}
      {projectiles.map(p => (
        <div 
          key={p.id}
          className="absolute w-2 h-6 rounded-full z-10 animate-none md:animate-pulse"
          style={{ 
            left: `calc(${(p.lane * 20) + 10}% + ${(p.xOffset ?? 0)}px)`, 
            top: `${p.z}%`, 
            backgroundColor: p.color,
            boxShadow: `0 0 15px ${p.color}, 0 0 5px white`,
            transform: 'translateX(-50%)'
          }}
        ></div>
      ))}

      {aoePulse && (
        <div className="absolute inset-0 pointer-events-none z-[12]">
          {[...Array(LANE_COUNT)].map((_, lane) => {
            const active = Math.abs(lane - aoePulse.laneCenter) <= 2;
            if (!active) return null;
            const t = 1 - Math.max(0, Math.min(1, aoePulse.remainingMs / aoePulse.durationMs));
            const alpha = (0.06 + 0.18 * Math.sin(t * Math.PI)) * (aoePulse.remainingMs / aoePulse.durationMs);
            return (
              <div
                key={lane}
                className="absolute"
                style={{
                  left: `${lane * 20}%`,
                  width: '20%',
                  top: `${90 - AOE_Z_RANGE}%`,
                  height: `${AOE_Z_RANGE * 2}%`,
                  background: `radial-gradient(circle at 50% 50%, rgba(120,255,255,${alpha}) 0%, rgba(0,180,255,${alpha * 0.55}) 45%, rgba(0,0,0,0) 75%)`,
                  boxShadow: `inset 0 0 40px rgba(0,220,255,${alpha * 0.6}), 0 0 30px rgba(0,220,255,${alpha * 0.35})`,
                  borderTop: `1px solid rgba(140,255,255,${alpha * 0.65})`,
                  borderBottom: `1px solid rgba(140,255,255,${alpha * 0.65})`
                }}
              ></div>
            );
          })}
        </div>
      )}

      {/* Entities */}
      {entities.map(e => (
        <div 
          key={e.id}
          className={`absolute flex flex-col items-center justify-center rounded-xl border-2 z-20 ${e.type === EntityType.ZOMBIE && (e.eliteTier ?? 0) >= 3 ? 'bg-red-950/50 border-red-400' : e.type === EntityType.ZOMBIE && (e.eliteTier ?? 0) > 0 ? 'bg-amber-950/40 border-amber-300' : ENTITY_COLORS[e.type]}`}
          style={{ 
            left: `${(e.lane * 20) + 10}%`, 
            top: `${e.z}%`, 
            transform: `translate(-50%, -50%)`,
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
              {getEntitySubLabel(e) ?? e.subType}
            </span>
          )}
        </div>
      ))}

      {/* Boss UI */}
      {boss && gameStatus === GameStatus.BOSS_FIGHT && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-4/5 max-w-lg z-40">
          <div className="flex justify-between items-end mb-1">
            <span className="text-red-500 font-black text-xs tracking-widest uppercase italic">{boss.name}</span>
            <span className="text-white font-mono text-sm">{Math.ceil(boss.hp)} 血量</span>
          </div>
          <div className="w-full h-5 bg-black/60 rounded-full border-2 border-red-500/40 p-0.5 shadow-2xl">
            <div className="h-full bg-gradient-to-r from-red-700 to-red-500 rounded-full transition-all" style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }}></div>
          </div>
          <div className="flex justify-center mt-6 gap-12 text-6xl text-red-600 opacity-20">
            <i className="fa-solid fa-skull-crossbones animate-none md:animate-bounce"></i>
            <i className="fa-solid fa-biohazard animate-none md:animate-pulse scale-150"></i>
            <i className="fa-solid fa-skull-crossbones animate-none md:animate-bounce"></i>
          </div>
        </div>
      )}

      {/* Player Model */}
      <div 
        className="absolute w-20 h-24 flex flex-col items-center justify-end z-30 transition-all duration-100"
        style={{ left: `${(playerLane * 20) + 10}%`, top: '90%', transform: 'translate(-50%, -100%)' }}
      >
        <div
          className="relative"
          style={{
            transform: `translate(${playerHurtOffset.x}px, ${playerHurtOffset.y}px) rotate(${playerHurtOffset.r}deg)`,
            filter: playerHurt > 0 ? `drop-shadow(0 0 ${18 * playerHurt}px rgba(255,80,80,0.85))` : undefined
          }}
        >
          {/* Engine Aura */}
          <div className="absolute -inset-4 bg-blue-500/10 blur-xl rounded-full animate-none md:animate-pulse"></div>
          {skills.rage.activeRemaining > 0 && (
            <div className="absolute -inset-6 bg-red-500/15 blur-2xl rounded-full"></div>
          )}
          {skills.shield.activeRemaining > 0 && (skills.shield.chargesRemaining ?? 0) > 0 && (
            <div className="absolute -inset-6 bg-emerald-400/10 blur-2xl rounded-full"></div>
          )}
          <i className="fa-solid fa-person-running text-5xl text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]"></i>
          <div className="absolute top-0 -right-4 bg-zinc-800 border border-zinc-600 p-1.5 rounded-full shadow-lg">
             <i className="fa-solid fa-gun text-white text-[10px]"></i>
          </div>
        </div>
        <div className="mt-2 text-[10px] font-black text-blue-300 bg-black/80 px-3 py-1 rounded-full border border-blue-500/30 uppercase tracking-[0.2em]">
          {WEAPON_MAP[weapon].name}
        </div>
      </div>

      <div className="absolute bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-4 right-4 flex justify-start pointer-events-none z-40 md:hidden">
        <div className="flex gap-2">
          {skillSlots.map(slot => {
            const s = skills[slot.id];
            const ready = s.unlocked && s.cooldownRemaining <= 0 && energy.current >= s.energyCost;
            const cdPct = s.cooldownSeconds > 0 ? Math.max(0, Math.min(1, s.cooldownRemaining / s.cooldownSeconds)) : 0;
            const dim = !s.unlocked || !ready;
            return (
              <button
                key={slot.id}
                type="button"
                onPointerDown={() => {
                  unlockAudio();
                  tryUseSkill(slot.id);
                }}
                className={`relative w-12 h-12 rounded-xl border overflow-hidden pointer-events-auto active:scale-95 ${dim ? 'border-white/10 bg-black/40' : 'border-cyan-400/40 bg-cyan-950/20'}`}
                style={{ boxShadow: ready ? '0 0 18px rgba(34,211,238,0.25)' : undefined }}
              >
                <div className={`absolute inset-0 ${!s.unlocked ? 'bg-black/60' : ''}`}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <i className={`${slot.icon} text-white ${dim ? 'opacity-40' : 'opacity-90'}`}></i>
                </div>
                {s.cooldownRemaining > 0 && (
                  <div className="absolute inset-0 bg-black/60" style={{ clipPath: `inset(${(1 - cdPct) * 100}% 0 0 0)` }}></div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      </div>

      {/* Distance Progress */}
      <div className="absolute top-0 left-0 w-full h-3 bg-black/80 z-50">
        <div 
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.8)] transition-all duration-300" 
          style={{ width: `${(progressDistance / TRACK_LENGTH) * 100}%` }}
        ></div>
      </div>

      <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-3 right-3 z-[55] md:hidden pointer-events-none">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">血</span>
              <span className="text-[11px] font-black text-white">{Math.ceil(playerHp)}/{playerMaxHp}</span>
            </div>
            <div className="w-full h-2 bg-black/60 rounded-full border border-white/10 overflow-hidden shadow-inner p-0.5">
              <div
                className="h-full rounded-full bg-red-500"
                style={{ width: `${playerHpPct * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-cyan-300 uppercase tracking-widest">能</span>
              <span className="text-[11px] font-black text-white">{Math.floor(energy.current)}/{energy.max}</span>
            </div>
            <div className="w-full h-2 bg-black/60 rounded-full border border-white/10 overflow-hidden shadow-inner p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-emerald-400"
                style={{ width: `${(energy.current / energy.max) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-500">得分</div>
            <div className="text-lg font-black text-white font-mono tracking-tighter">{Math.floor(score).toLocaleString()}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-300/80 mt-1">金币 {Math.floor(coinsEarned).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* HUD Bottom */}
      <div className="absolute bottom-[calc(7rem+env(safe-area-inset-bottom))] md:bottom-6 left-4 md:left-8 right-4 md:right-8 hidden md:flex flex-col md:flex-row justify-between items-stretch md:items-end gap-3 md:gap-0 pointer-events-none z-40">
        <div className="w-full md:w-64">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">生命</span>
            <span className="text-lg font-black text-white">{Math.ceil(playerHp)}/{playerMaxHp}</span>
          </div>
          <div className="w-full h-4 bg-black/60 rounded-full border border-white/10 overflow-hidden shadow-inner p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${playerHpPct < 0.30 ? 'bg-red-600 animate-none md:animate-pulse' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`} 
              style={{ width: `${playerHpPct * 100}%` }}
            ></div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">能量</span>
              <span className="text-xs font-black text-white">{Math.floor(energy.current)}/{energy.max}</span>
            </div>
            <div className="w-full h-3 bg-black/60 rounded-full border border-white/10 overflow-hidden shadow-inner p-0.5">
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-cyan-600 to-emerald-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                style={{ width: `${(energy.current / energy.max) * 100}%` }}
              ></div>
            </div>

            <div className="mt-3 flex gap-2">
              {skillSlots.map(slot => {
                const s = skills[slot.id];
                const ready = s.unlocked && s.cooldownRemaining <= 0 && energy.current >= s.energyCost;
                const cdPct = s.cooldownSeconds > 0 ? Math.max(0, Math.min(1, s.cooldownRemaining / s.cooldownSeconds)) : 0;
                const dim = !s.unlocked || !ready;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onPointerDown={() => {
                      unlockAudio();
                      tryUseSkill(slot.id);
                    }}
                    className={`relative w-12 h-12 rounded-xl border overflow-hidden pointer-events-auto active:scale-95 ${dim ? 'border-white/10 bg-black/40' : 'border-cyan-400/40 bg-cyan-950/20'}`}
                    style={{ boxShadow: ready ? '0 0 18px rgba(34,211,238,0.25)' : undefined }}
                  >
                    <div className={`absolute inset-0 ${!s.unlocked ? 'bg-black/60' : ''}`}></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <i className={`${slot.icon} text-white ${dim ? 'opacity-40' : 'opacity-90'}`}></i>
                    </div>
                    {s.cooldownRemaining > 0 && (
                      <div className="absolute inset-0 bg-black/60" style={{ clipPath: `inset(${(1 - cdPct) * 100}% 0 0 0)` }}></div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 text-[9px] font-black text-white/70 bg-black/70 text-center hidden md:block">
                      {slot.key}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="md:text-right">
          <div className="text-neutral-500 text-[10px] font-black uppercase tracking-[0.3em]">得分</div>
          <div className="text-3xl md:text-5xl font-black text-white font-mono tracking-tighter">{Math.floor(score).toLocaleString()}</div>
          <div className="mt-2 text-xs font-black uppercase tracking-[0.3em] text-amber-300/80">金币 {Math.floor(coinsEarned).toLocaleString()}</div>
        </div>
      </div>

      {/* Modals */}
      {gameStatus === GameStatus.GAMEOVER && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-[100] animate-in fade-in duration-500">
          <i className="fa-solid fa-skull text-8xl text-red-600 mb-6 drop-shadow-[0_0_30px_rgba(220,38,38,0.6)]"></i>
          <h2 className="text-7xl font-black text-red-600 mb-2 italic tracking-tighter uppercase">阵亡</h2>
          <p className="text-xl text-neutral-500 mb-10 tracking-[0.3em]">尸群吞噬完成。</p>
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl text-center mb-10 w-64 shadow-2xl">
            <div className="text-neutral-500 text-xs uppercase mb-1">最终得分</div>
            <div className="text-4xl font-black text-white">{Math.floor(score).toLocaleString()}</div>
            <div className="mt-4 text-xs text-neutral-400 font-mono">
              <div>生存：{Math.floor(survivalTimeMs / 1000)}秒</div>
              <div>击杀：{kills}</div>
              <div>金币：{coinsEarned}</div>
            </div>
          </div>
          <button 
            onClick={() => onSessionEnd({
              mode: resolvedMode,
              outcome: 'GAMEOVER',
              score,
              survivalTimeMs,
              kills,
              coinsEarned,
              level: resolvedMode === 'CAMPAIGN' ? level : undefined
            })}
            className="px-12 py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg shadow-red-900/40"
          >
            再次出击
          </button>
        </div>
      )}

      {gameStatus === GameStatus.VICTORY && (
        <div className="absolute inset-0 bg-blue-900/20 backdrop-blur-md flex flex-col items-center justify-center z-[100] animate-in fade-in duration-500">
          <i className="fa-solid fa-medal text-8xl text-yellow-500 mb-6 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)] animate-bounce"></i>
          <h2 className="text-7xl font-black text-yellow-400 mb-2 tracking-tighter uppercase italic">道路已清</h2>
          <p className="text-xl text-blue-100 mb-10 tracking-[0.3em]">封锁周边。</p>
          <button 
            onClick={() => onSessionEnd({
              mode: resolvedMode,
              outcome: 'VICTORY',
              score,
              survivalTimeMs,
              kills,
              coinsEarned,
              level
            })}
            className="px-12 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl uppercase tracking-widest transition-transform active:scale-95 shadow-lg shadow-yellow-900/40"
          >
            下一关
          </button>
        </div>
      )}
    </div>
  );
};

export default GameEngine;
