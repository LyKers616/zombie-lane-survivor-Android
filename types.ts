
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
  HEAL = 'HEAL'
}

export enum WeaponType {
  HANDGUN = 'HANDGUN',
  RIFLE = 'RIFLE',
  SHOTGUN = 'SHOTGUN',
  MINIGUN = 'MINIGUN'
}

export interface WeaponStats {
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  spread: number;
  burst: number;
  name: string;
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
}

export interface Boss {
  name: string;
  hp: number;
  maxHp: number;
  attacks: number;
}
