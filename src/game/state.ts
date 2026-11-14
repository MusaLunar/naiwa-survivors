import type {
  CharacterDef,
  EnemyBehavior,
  GadgetId,
  GameDifficulty,
  StageDef,
} from '../data/types.ts';
import { SeededRng } from './rng.ts';
import { SpatialHash } from './spatialHash.ts';

export type GamePhase = 'playing' | 'levelup' | 'chest' | 'paused' | 'victory' | 'gameover';

export interface DifficultyProfile {
  hpMult: number;
  speedMult: number;
  damageMult: number;
  spawnRateMult: number;
  capMult: number;
  bossCooldownMult: number;
  goldMult: number;
  label: string;
}

export function getDifficultyProfile(difficulty: GameDifficulty): DifficultyProfile {
  if (difficulty === 'hard') {
    return {
      hpMult: 1.78,
      speedMult: 1.24,
      damageMult: 1.65,
      spawnRateMult: 1.55,
      capMult: 1.48,
      bossCooldownMult: 0.72,
      goldMult: 1.6,
      label: '炼狱高难',
    };
  }
  return {
    hpMult: 1,
    speedMult: 1,
    damageMult: 1,
    spawnRateMult: 1,
    capMult: 1,
    bossCooldownMult: 1,
    goldMult: 1,
    label: '标准模式',
  };
}

export interface WeaponSlot {
  weaponId: string;
  level: number;
  cooldownTimer: number;
  totalDamage: number;
}

export interface PassiveSlot {
  passiveId: string;
  level: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  radius: number;
  hp: number;
  maxHp: number;
  xp: number;
  nextXp: number;
  level: number;
  invulnTimer: number;
  revivalsLeft: number;
  moveSpeed: number;
  armor: number;
  might: number;
  area: number;
  cooldown: number;
  amountBonus: number;
  duration: number;
  magnetRadius: number;
  greed: number;
  regen: number;
  walkPhase: number;
  skillCooldownTimer: number;
  skillMaxCooldown: number;
  skillBuffTimer: number;
  frenzyTimer: number;
  heldGadgets: GadgetId[];
  activeMagnetTimer: number;
  shieldCharges: number;
  shieldTimer: number;
}

export interface EnemyEntity {
  uid: number;
  defId: string;
  spriteId: string;
  isMedallion: boolean;
  aiBehavior: EnemyBehavior;
  aiTimer: number;
  aiState: 'move' | 'windup' | 'dash' | 'channel';
  chargeDirX: number;
  chargeDirY: number;
  isMerged: boolean;
  scaleMult: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  xpValue: number;
  goldChance: number;
  isElite: boolean;
  isBoss: boolean;
  hitFlashTimer: number;
  knockbackVx: number;
  knockbackVy: number;
  bossShootTimer: number;
  wobbleSeed: number;
}

export interface ProjectileEntity {
  uid: number;
  weaponId: string;
  behavior: 'boomerang' | 'homing' | 'shotgun' | 'lobbed' | 'enemy_orb';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  blastRadius?: number;
  damage: number;
  pierce: number;
  knockback: number;
  life: number;
  maxLife: number;
  color: string;
  accentColor: string;
  spriteId?: string;
  returnPhase?: boolean;
  spinAngle: number;
  hitIds: Set<number>;
  splitOnHit?: boolean;
}

export interface ZoneEffect {
  uid: number;
  weaponId: string;
  kind: 'aura' | 'beam' | 'lightning' | 'zone' | 'enemy_blast' | 'blackhole';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  damage: number;
  knockback: number;
  life: number;
  maxLife: number;
  tickInterval: number;
  tickTimer: number;
  color: string;
  accentColor: string;
  hitOnce?: boolean;
  applied?: boolean;
}

export interface TacticalDeployable {
  uid: number;
  kind: 'decoy' | 'turret';
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  actionTimer: number;
  spriteId: string;
  color: string;
}

export interface PickupEntity {
  uid: number;
  kind:
    | 'xp_small'
    | 'xp_medium'
    | 'xp_large'
    | 'gold'
    | 'gold_bag'
    | 'meat'
    | 'magnet'
    | 'frenzy_elixir'
    | 'ice_hourglass'
    | 'holy_bell'
    | 'gadget_magnet'
    | 'gadget_shield'
    | 'gadget_decoy'
    | 'gadget_turret'
    | 'chest';
  x: number;
  y: number;
  value: number;
  magnetized: boolean;
  bobSeed: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface UpgradeChoice {
  kind: 'weapon' | 'passive' | 'evolve' | 'bonus_gold' | 'bonus_heal';
  id: string;
  title: string;
  subtitle: string;
  description: string;
  spriteId: string;
  currentLevel?: number;
  nextLevel?: number;
  evolvedFromId?: string;
  passivePairId?: string;
}

export interface ChestReward {
  choices: UpgradeChoice[];
  bonusGold: number;
}

export interface BannerAlert {
  title: string;
  subtitle: string;
  imageUrl?: string;
  timer: number;
  maxTimer: number;
}

export interface SimEvent {
  type:
    | 'hit'
    | 'kill'
    | 'pickup_xp'
    | 'pickup_gold'
    | 'pickup_chest'
    | 'pickup_buff'
    | 'gadget_pickup'
    | 'gadget_use'
    | 'shield_block'
    | 'boss_merge'
    | 'bomb_blast'
    | 'skill_cast'
    | 'levelup'
    | 'boss_spawn'
    | 'player_hurt'
    | 'revive'
    | 'victory'
    | 'gameover';
  intensity?: number;
}

export interface GameState {
  phase: GamePhase;
  stageId: string;
  characterId: string;
  difficulty: GameDifficulty;
  elapsedSec: number;
  endlessMode: boolean;
  kills: number;
  goldEarned: number;
  pendingLevelUps: number;
  spawnAccumulator: number;
  gadgetSpawnTimer: number;
  nextUid: number;
  shakeTimer: number;
  shakeIntensity: number;
  freezeTimer: number;
  player: PlayerState;
  weapons: WeaponSlot[];
  passives: PassiveSlot[];
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  zones: ZoneEffect[];
  deployables: TacticalDeployable[];
  pickups: PickupEntity[];
  floatingTexts: FloatingText[];
  particles: Particle[];
  levelUpChoices: UpgradeChoice[];
  pendingChest: ChestReward | null;
  triggeredEvents: Set<string>;
  discoveredCodexIds: Set<string>;
  bannerAlert: BannerAlert | null;
  events: SimEvent[];
  orbitAngle: number;
  orbitHitCooldowns: Map<number, number>;
  rng: SeededRng;
  spatialHash: SpatialHash;
}

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 6;
  if (level <= 12) return 6 + (level - 1) * 7;
  if (level <= 25) return 83 + (level - 12) * 14;
  return 265 + (level - 25) * 24;
}

export function createInitialGameState(
  character: CharacterDef,
  stage: StageDef,
  metaBonuses: Partial<Record<string, number>> = {},
  seed = Date.now(),
  difficulty: GameDifficulty = 'normal'
): GameState {
  const diff = getDifficultyProfile(difficulty);
  const maxHp = Math.round(character.stats.maxHp + (metaBonuses.maxHp ?? 0));
  const state: GameState = {
    phase: 'playing',
    stageId: stage.id,
    characterId: character.id,
    difficulty,
    elapsedSec: 0,
    endlessMode: false,
    kills: 0,
    goldEarned: 0,
    pendingLevelUps: 0,
    spawnAccumulator: 0,
    gadgetSpawnTimer: 16,
    nextUid: 1,
    shakeTimer: 0,
    shakeIntensity: 0,
    freezeTimer: 0,
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facingX: 1,
      facingY: 0,
      radius: 18,
      hp: maxHp,
      maxHp,
      xp: 0,
      nextXp: xpRequiredForLevel(1),
      level: 1,
      invulnTimer: 0,
      revivalsLeft: Math.floor(metaBonuses.revivals ?? 0),
      moveSpeed: character.stats.moveSpeed * (1 + (metaBonuses.moveSpeed ?? 0)),
      armor: character.stats.armor + (metaBonuses.armor ?? 0),
      might: character.stats.might + (metaBonuses.might ?? 0),
      area: character.stats.area + (metaBonuses.area ?? 0),
      cooldown: Math.max(0.45, character.stats.cooldown - (metaBonuses.cooldown ?? 0)),
      amountBonus: character.stats.amount + Math.floor(metaBonuses.amount ?? 0),
      duration: 1 + (metaBonuses.duration ?? 0),
      magnetRadius: 96 * (character.stats.magnet + (metaBonuses.magnet ?? 0)),
      greed: (character.stats.greed + (metaBonuses.greed ?? 0)) * diff.goldMult,
      regen: character.stats.regen + (metaBonuses.regen ?? 0),
      walkPhase: 0,
      skillCooldownTimer: 0,
      skillMaxCooldown: character.activeSkill.cooldownSec,
      skillBuffTimer: 0,
      frenzyTimer: 0,
      heldGadgets: [],
      activeMagnetTimer: 0,
      shieldCharges: 0,
      shieldTimer: 0,
    },
    weapons: [
      {
        weaponId: character.weaponId,
        level: 1,
        cooldownTimer: 0.15,
        totalDamage: 0,
      },
    ],
    passives: [],
    enemies: [],
    projectiles: [],
    zones: [],
    deployables: [],
    pickups: [],
    floatingTexts: [],
    particles: [],
    levelUpChoices: [],
    pendingChest: null,
    triggeredEvents: new Set<string>(),
    discoveredCodexIds: new Set<string>(),
    bannerAlert: null,
    events: [],
    orbitAngle: 0,
    orbitHitCooldowns: new Map<number, number>(),
    rng: new SeededRng(seed),
    spatialHash: new SpatialHash(96),
  };
  return state;
}
