
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
    '死亡公路',
    '残骸里程',
    '雾线高架',
    '黑路炼狱',
    '立交墓场',
    '霓虹车祸带',
    '盐风高速',
    '油膜疾行'
  ] as const;

  const hazards = [
    '废弃货车',
    '燃烧残骸',
    '坍塌护栏',
    '油污路面',
    '连环追尾',
    '龟裂沥青',
    '浓雾团',
    '熄灭车灯'
  ] as const;

  const directives = [
    '保持移动。',
    '清理车道。',
    '等尸群聚拢再清场。',
    '高速注意障碍。',
    '留血量打首领。',
    '别为补给冲错车道。'
  ] as const;

  const bossTitles = [
    '巨躯者',
    '海妖',
    '看守者',
    '公路之王',
    '裂颚',
    '深坑奔袭者',
    '血猎犬',
    '狂暴者'
  ] as const;

  const bossTraits = [
    '披着扭曲钢板护甲',
    '快到一眨眼就能换道',
    '身后拖着一串残骸',
    '嘶吼足以召来整片尸潮',
    '体内涌动着不稳定变异热',
    '满身玻璃碎片与钢筋尖刺',
    '在雾里靠声音狩猎',
    '愤怒到不肯死'
  ] as const;

  const tier = Math.floor((lvl - 1) / 5) + 1;
  const theme = pick(rng, sectorThemes);
  const hazard = pick(rng, hazards);
  const directive = pick(rng, directives);
  const bossName = pick(rng, bossTitles);
  const trait = pick(rng, bossTraits);

  const title = `第${lvl}区：${theme}`;
  const intel = `第${tier}级路段。警惕${hazard}，密集奔袭者会挤压车道。${directive}`;
  const bossDescription = `高速首领感染体，${trait}。它封锁前路，犹豫必付代价。`;

  return { title, intel, bossName, bossDescription };
}
