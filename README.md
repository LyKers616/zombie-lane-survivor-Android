
# Zombie Lane Survivor

5-lane runner + auto-shooter in a zombie highway apocalypse. Upgrade weapons, dodge obstacles, and survive long enough to face a boss.

## Gameplay (Current Build)

- **Lanes:** 5
- **Core loop:** run forward -> spawn zombies/obstacles/loot -> reach the end -> boss fight -> victory -> next sector
- **Combat:** auto-fire; align by switching lanes

## Controls

- **Move left/right:** `A/D` or `←/→`
- **Mobile:** on-screen buttons (shown while playing)

## Implemented Features

- **Mission Intel screen** before each run (deterministic per level)
- **Weapons & upgrades**
  - Weapon upgrade pickups: `RIFLE`, `SHOTGUN`, `MINIGUN`
  - Bullet upgrade pickups: `RATE`, `DMG`, `FIRE`
  - Heal pickup
- **Combat feedback / VFX**
  - Bullet impact particles (zombies + boss)
  - Player hurt feedback (screen flash, camera shake, player jitter/glow)
- **Boss fight**
  - Boss appears after reaching the end of the track
  - Special attacks with lane telegraphs:
    - `SLAM` (single-lane strike)
    - `BARRAGE` (two-lane strike)
    - `SUMMON` (infestation / zombie summon)
  - Telegraph visuals are **distinguished**:
    - Lane strikes: red warning + label
    - Infestation: green warning + label

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Start dev server:
   `npm run dev`

## Scripts

- `npm run dev` - start Vite dev server
- `npm run build` - production build
- `npm run preview` - preview production build

## Tech Stack

- React + TypeScript
- Vite
- TailwindCSS via CDN
- Font Awesome via CDN

## Known Issues / Notes

- `index.html` references `/index.css`, but the file may be missing in the repository snapshot. If you rely on it, add it back or remove the reference.

## Design Notes

- Current implementation baseline document: `docs/当前版本现状描述.md`
