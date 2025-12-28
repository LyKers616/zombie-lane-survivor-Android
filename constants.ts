
import { SkillId, WeaponType, WeaponStats } from './types';

export const LANE_COUNT = 5;
export const TRACK_LENGTH = 1000; // Total distance before boss
export const BASE_SPEED = 0.5;

export const WEAPON_MAP: Record<WeaponType, WeaponStats> = {
  [WeaponType.HANDGUN]: {
    name: 'Pistol',
    damage: 10,
    fireRate: 600,
    bulletSpeed: 2,
    spread: 0,
    burst: 1,
    pierce: false,
    critChance: 0,
    critMultiplier: 2
  },
  [WeaponType.SMG]: {
    name: 'SMG',
    damage: 10,
    fireRate: 220,
    bulletSpeed: 3,
    spread: 0.6,
    burst: 1,
    pierce: false,
    critChance: 0,
    critMultiplier: 2
  },
  [WeaponType.RIFLE]: {
    name: 'Assault Rifle',
    damage: 13,
    fireRate: 250,
    bulletSpeed: 3,
    spread: 1.2,
    burst: 1,
    pierce: true,
    critChance: 0.08,
    critMultiplier: 2
  },
  [WeaponType.MINIGUN]: {
    name: 'Minigun',
    damage: 13,
    fireRate: 80,
    bulletSpeed: 4,
    spread: 4,
    burst: 1,
    pierce: true,
    critChance: 0.18,
    critMultiplier: 2
  }
};

export const LEVEL_DIFFICULTY_MODIFIER = 1.2;

export const ENERGY_MAX = 100;
export const ENERGY_GAIN_PER_KILL = 3;
export const ENERGY_GAIN_PER_SECOND = 1.2;

export const SKILL_DEFS: Record<SkillId, {
  cooldownSeconds: number;
  durationSeconds: number;
  energyCost: number;
}> = {
  rage: {
    cooldownSeconds: 10,
    durationSeconds: 1.2,
    energyCost: 32
  },
  shield: {
    cooldownSeconds: 12,
    durationSeconds: 4,
    energyCost: 28
  },
  aoe: {
    cooldownSeconds: 12,
    durationSeconds: 0,
    energyCost: 45
  }
};

export const AOE_DAMAGE_MULT = 3.0;
export const AOE_Z_RANGE = 38;

export const ENDLESS_SCORE_PER_SECOND = 2;
export const ENDLESS_DIFFICULTY_TIME_SCALE_SECONDS = 30;
