
export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  BOSS_FIGHT = 'BOSS_FIGHT',
  VICTORY = 'VICTORY',
  GAMEOVER = 'GAMEOVER',
  LEVEL_START = 'LEVEL_START'
}

export enum EntityType {
  ZOMBIE = 'ZOMBIE',
  OBSTACLE = 'OBSTACLE',
  WEAPON_UPGRADE = 'WEAPON_UPGRADE',
  BULLET_UPGRADE = 'BULLET_UPGRADE',
  HEAL = 'HEAL',
  SKILL_UNLOCK = 'SKILL_UNLOCK',
  ENERGY = 'ENERGY'
}

export enum WeaponType {
  HANDGUN = 'HANDGUN',
  SMG = 'SMG',
  RIFLE = 'RIFLE',
  MINIGUN = 'MINIGUN'
}

export interface WeaponStats {
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  spread: number;
  burst: number;
  name: string;
  pierce: boolean;
  critChance: number;
  critMultiplier: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  lane: number;
  z: number; // 0 (top) to 100 (bottom)
  hp: number;
  maxHp: number;
  width: number;
  height: number;
  subType?: string;
}

export interface Projectile {
  id: string;
  lane: number;
  z: number;
  damage: number;
  color: string;
  isFire?: boolean;
  xOffset?: number;
  pierce?: boolean;
  critChance?: number;
  critMultiplier?: number;
  hitEntityIds?: string[];
  hitBoss?: boolean;
}

export interface Boss {
  name: string;
  hp: number;
  maxHp: number;
  attacks: number;
}

export type SkillId = 'rage' | 'shield' | 'aoe';

export interface SkillState {
  id: SkillId;
  unlocked: boolean;
  cooldownSeconds: number;
  cooldownRemaining: number;
  durationSeconds: number;
  activeRemaining: number;
  energyCost: number;
  level?: number;
  chargesRemaining?: number;
  chargeMax?: number;
}

export interface EnergyState {
  current: number;
  max: number;
  totalGained: number;
}

export type GameMode = 'CAMPAIGN' | 'ENDLESS';

export interface GameSessionResult {
  mode: GameMode;
  outcome: 'VICTORY' | 'GAMEOVER';
  score: number;
  survivalTimeMs: number;
  kills: number;
  level?: number;
}

export interface LeaderboardEntry {
  playerName: string;
  score: number;
  survivalTimeMs: number;
  kills: number;
  createdAt: number;
}
