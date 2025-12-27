
import { WeaponType, WeaponStats } from './types';

export const LANE_COUNT = 5;
export const TRACK_LENGTH = 1000; // Total distance before boss
export const BASE_SPEED = 0.5;

export const WEAPON_MAP: Record<WeaponType, WeaponStats> = {
  [WeaponType.HANDGUN]: {
    name: 'Pistol',
    damage: 10,
    fireRate: 500,
    bulletSpeed: 2,
    spread: 0,
    burst: 1
  },
  [WeaponType.RIFLE]: {
    name: 'Assault Rifle',
    damage: 15,
    fireRate: 200,
    bulletSpeed: 3,
    spread: 2,
    burst: 1
  },
  [WeaponType.SHOTGUN]: {
    name: 'Shotgun',
    damage: 10,
    fireRate: 800,
    bulletSpeed: 2,
    spread: 15,
    burst: 5
  },
  [WeaponType.MINIGUN]: {
    name: 'Minigun',
    damage: 8,
    fireRate: 50,
    bulletSpeed: 4,
    spread: 5,
    burst: 1
  }
};

export const LEVEL_DIFFICULTY_MODIFIER = 1.2;
