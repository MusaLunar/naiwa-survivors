export type WeaponBehavior =
  | 'aura_pulse'
  | 'boomerang'
  | 'orbit'
  | 'homing'
  | 'beam'
  | 'lightning'
  | 'shotgun'
  | 'zone'
  | 'lobbed';

export type GameDifficulty = 'normal' | 'hard';

export type EnemyBehavior =
  | 'chaser'
  | 'ranged'
  | 'charger'
  | 'skirmisher'
  | 'splitter'
  | 'bomber'
  | 'boss_alps_charge'
  | 'boss_twin_merge'
  | 'boss_blink'
  | 'boss_blackhole'
  | 'boss_archangel';

export type GadgetId =
  | 'gadget-magnet'
  | 'gadget-shield'
  | 'gadget-decoy'
  | 'gadget-turret';

export interface GadgetDef {
  id: GadgetId;
  name: string;
  spriteId: string;
  description: string;
  color: string;
  accentColor: string;
}

export type ActiveSkillId =
  | 'skill-roar-nova'
  | 'skill-blazing-dash'
  | 'skill-golden-feast'
  | 'skill-fox-illusion'
  | 'skill-starfall-judgment';

export interface ActiveSkillDef {
  id: ActiveSkillId;
  name: string;
  cooldownSec: number;
  description: string;
  spriteId: string;
  color: string;
  accentColor: string;
}

export type StatKey =
  | 'maxHp'
  | 'moveSpeed'
  | 'might'
  | 'area'
  | 'cooldown'
  | 'amount'
  | 'magnet'
  | 'greed'
  | 'regen'
  | 'armor'
  | 'duration'
  | 'revivals';

export interface CharacterDef {
  id: string;
  name: string;
  subtitle: string;
  spriteId: string;
  lore: string;
  weaponId: string;
  activeSkill: ActiveSkillDef;
  unlockCost: number;
  unlockedByDefault: boolean;
  stats: {
    maxHp: number;
    moveSpeed: number;
    armor: number;
    might: number;
    area: number;
    cooldown: number;
    amount: number;
    magnet: number;
    greed: number;
    regen: number;
  };
}

export interface WeaponLevelSpec {
  damage: number;
  cooldown: number;
  area: number;
  speed: number;
  amount: number;
  duration: number;
  pierce: number;
  knockback: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  spriteId: string;
  behavior: WeaponBehavior;
  isEvolved: boolean;
  description: string;
  lore: string;
  color: string;
  accentColor: string;
  levels: WeaponLevelSpec[];
}

export interface PassiveDef {
  id: string;
  name: string;
  spriteId: string;
  description: string;
  lore: string;
  maxLevel: number;
  statKey: StatKey;
  perLevelBonus: number;
}

export interface EvolutionDef {
  weaponId: string;
  passiveId: string;
  evolvedWeaponId: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  spriteId: string;
  isMedallion?: boolean;
  aiBehavior?: EnemyBehavior;
  lore: string;
  baseHp: number;
  speed: number;
  radius: number;
  damage: number;
  xpValue: number;
  goldChance: number;
  isElite?: boolean;
  isBoss?: boolean;
  codexGalleryId?: string;
}

export interface WavePoolEntry {
  enemyId: string;
  weight: number;
}

export interface WavePhase {
  startSec: number;
  endSec: number;
  spawnInterval: number;
  maxCount: number;
  pool: WavePoolEntry[];
  hpScale: number;
  speedScale: number;
}

export interface BossSpawnEvent {
  id: string;
  atSec: number;
  enemyId: string;
  count: number;
  announcement: string;
  galleryBannerUrl?: string;
}

export interface StageDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  theme: 'sanctuary' | 'nightwatch';
  bannerUrl: string;
  spawnRateMult: number;
  dropMult: number;
  durationSec: number;
  waves: WavePhase[];
  bossEvents: BossSpawnEvent[];
}

export interface MetaUpgradeDef {
  id: string;
  name: string;
  description: string;
  spriteId: string;
  maxRank: number;
  baseCost: number;
  costStep: number;
  statKey: StatKey;
  perRankBonus: number;
}

export interface GalleryItem {
  id: string;
  category: string;
  title: string;
  lore: string;
  sourcePath: string;
  url: string;
}

export interface GameSettings {
  masterVolume: number;
  sfxEnabled: boolean;
  bgmEnabled: boolean;
  screenShake: boolean;
  damageNumbers: boolean;
  codexPreviewAll: boolean;
}

export interface SaveData {
  version: number;
  gold: number;
  metaRanks: Record<string, number>;
  unlockedCharacters: string[];
  unlockedCodexIds: string[];
  clearedStages: string[];
  clearedHardStages?: string[];
  bestKills: number;
  bestSurvivalSec: number;
  totalRuns: number;
  settings: GameSettings;
}

export interface GameCatalog {
  characters: Record<string, CharacterDef>;
  weapons: Record<string, WeaponDef>;
  passives: Record<string, PassiveDef>;
  evolutions: EvolutionDef[];
  enemies: Record<string, EnemyDef>;
  stages: Record<string, StageDef>;
  metaUpgrades: MetaUpgradeDef[];
  gadgets: Record<GadgetId, GadgetDef>;
}

