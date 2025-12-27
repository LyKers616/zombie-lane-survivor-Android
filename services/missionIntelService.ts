
function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function makeRng(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]) {
  return arr[Math.floor(rng() * arr.length)];
}

export async function getMissionIntel(level: number) {
  const lvl = clampInt(level, 1, 9999);
  const rng = makeRng(lvl * 2654435761);

  const sectorThemes = [
    'Dead Road',
    'Wreckage Mile',
    'Fogline Expressway',
    'Blacktop Inferno',
    'Overpass Graveyard',
    'Neon Crashway',
    'Saltwind Highway',
    'Oil-Slick Run'
  ] as const;

  const hazards = [
    'abandoned semis',
    'burning wrecks',
    'collapsed guardrails',
    'oil slicks',
    'chain-reaction pileups',
    'cracked asphalt',
    'fog pockets',
    'dead headlights'
  ] as const;

  const directives = [
    'Stay in motion.',
    'Keep your lanes clean.',
    'Let the horde bunch up, then shred it.',
    'Watch for obstacles at high speed.',
    'Save your health for the boss push.',
    'Don’t chase loot into the wrong lane.'
  ] as const;

  const bossTitles = [
    'The Behemoth',
    'The Siren',
    'The Warden',
    'The Highway King',
    'The Split-Jaw',
    'The Pit Runner',
    'The Bloodhound',
    'The Rampager'
  ] as const;

  const bossTraits = [
    'armored with twisted steel plating',
    'fast enough to cross lanes in a blink',
    'dragging a chain of wreckage behind it',
    'screaming loud enough to draw the entire horde',
    'pulsing with unstable mutation heat',
    'covered in glass shards and rebar spines',
    'hunting by sound through the fog',
    'too angry to die'
  ] as const;

  const tier = Math.floor((lvl - 1) / 5) + 1;
  const theme = pick(rng, sectorThemes);
  const hazard = pick(rng, hazards);
  const directive = pick(rng, directives);
  const bossName = pick(rng, bossTitles);
  const trait = pick(rng, bossTraits);

  const title = `Sector ${lvl}: ${theme}`;
  const intel = `Tier ${tier} corridor. Expect ${hazard} and lane pressure from dense runners. ${directive}`;
  const bossDescription = `A high-speed apex infected, ${trait}. It blocks the route ahead and punishes hesitation.`;

  return { title, intel, bossName, bossDescription };
}
