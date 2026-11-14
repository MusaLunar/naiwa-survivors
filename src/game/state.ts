import { CATALOG } from '../data/catalog.ts';
import type {
  CharacterDef,
  EnemyBehavior,
  GadgetId,
  GameDifficulty,
  HeroFormId,
  StageDef,
  StatKey,
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
  skillCdMult: number;
  skillBuffTimer: number;
  frenzyTimer: number;
  heldGadgets: GadgetId[];
  activeMagnetTimer: number;
  shieldCharges: number;
  shieldTimer: number;
  heroForm: HeroFormId;
  formMeter: number;
  formTimer: number;
  moveDistAccum: number;
  skillPowerMult: number;
  skillRadiusMult: number;
  unlockedMechanics: string[];
  xpMult: number;
  thorns: number;
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
  discoveredEnemyIds: Set<string>;
  discoveredWeaponIds: Set<string>;
  bannerAlert: BannerAlert | null;
  events: SimEvent[];
  orbitAngle: number;
  orbitHitCooldowns: Map<number, number>;
  rng: SeededRng;
  spatialHash: SpatialHash;
}

export interface RunTreeConfig {
  statBonuses?: Partial<Record<StatKey, number>>;
  skillCdMult?: number;
  skillPowerMult?: number;
  skillRadiusMult?: number;
  unlockedMechanics?: string[];
  startingGadgets?: GadgetId[];
  startingPassives?: string[];
  xpMultBonus?: number;
  thornsBonus?: number;
  startGoldBonus?: number;
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
  difficulty: GameDifficulty = 'normal',
  treeConfig?: RunTreeConfig
): GameState {
  const diff = getDifficultyProfile(difficulty);
  const combined: Partial<Record<string, number>> = { ...metaBonuses };
  if (treeConfig?.statBonuses) {
    for (const [k, v] of Object.entries(treeConfig.statBonuses)) {
      combined[k] = (combined[k] ?? 0) + (v ?? 0);
    }
  }
  const maxHp = Math.round(character.stats.maxHp + (combined.maxHp ?? 0));
  const skillCdMult = treeConfig?.skillCdMult ?? 1;
  const startingGadgets = treeConfig?.startingGadgets ? [...treeConfig.startingGadgets] : [];
  const startingPassives = treeConfig?.startingPassives ?? [];
  const discoveredWeaponIds = new Set<string>([character.weaponId]);
  for (const g of startingGadgets) {
    discoveredWeaponIds.add(g);
  }
  const state: GameState = {
    phase: 'playing',
    stageId: stage.id,
    characterId: character.id,
    difficulty,
    elapsedSec: 0,
    endlessMode: false,
    kills: 0,
    goldEarned: treeConfig?.startGoldBonus ?? 0,
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
      revivalsLeft: Math.floor(combined.revivals ?? 0),
      moveSpeed: character.stats.moveSpeed * (1 + (combined.moveSpeed ?? 0)),
      armor: character.stats.armor + (combined.armor ?? 0),
      might: character.stats.might + (combined.might ?? 0),
      area: character.stats.area + (combined.area ?? 0),
      cooldown: Math.max(0.45, character.stats.cooldown - (combined.cooldown ?? 0)),
      amountBonus: character.stats.amount + Math.floor(combined.amount ?? 0),
      duration: 1 + (combined.duration ?? 0),
      magnetRadius: 96 * (character.stats.magnet + (combined.magnet ?? 0)),
      greed: (character.stats.greed + (combined.greed ?? 0)) * diff.goldMult,
      regen: character.stats.regen + (combined.regen ?? 0),
      walkPhase: 0,
      skillCooldownTimer: 0,
      skillMaxCooldown: character.activeSkill.cooldownSec * skillCdMult,
      skillCdMult,
      skillBuffTimer: 0,
      frenzyTimer: 0,
      heldGadgets: startingGadgets,
      activeMagnetTimer: 0,
      shieldCharges: 0,
      shieldTimer: 0,
      heroForm: 'primary',
      formMeter: 0,
      formTimer: 0,
      moveDistAccum: 0,
      skillPowerMult: treeConfig?.skillPowerMult ?? 1,
      skillRadiusMult: treeConfig?.skillRadiusMult ?? 1,
      unlockedMechanics: treeConfig?.unlockedMechanics ? [...treeConfig.unlockedMechanics] : [],
      xpMult: 1 + (treeConfig?.xpMultBonus ?? 0),
      thorns: treeConfig?.thornsBonus ?? 0,
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
    discoveredEnemyIds: new Set<string>(),
    discoveredWeaponIds,
    bannerAlert: null,
    events: [],
    orbitAngle: 0,
    orbitHitCooldowns: new Map<number, number>(),
    rng: new SeededRng(seed),
    spatialHash: new SpatialHash(96),
  };

  // Equip starting Lv.1 passive relics unlocked via character skill tree
  for (const pasId of startingPassives) {
    const def = CATALOG.passives[pasId];
    if (!def) continue;
    state.passives.push({ passiveId: pasId, level: 1 });
    state.discoveredWeaponIds.add(pasId);
    const bonus = def.perLevelBonus;
    switch (def.statKey) {
      case 'maxHp':
        state.player.maxHp += bonus;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + bonus);
        break;
      case 'moveSpeed':
        state.player.moveSpeed *= 1 + bonus;
        break;
      case 'might':
        state.player.might += bonus;
        break;
      case 'area':
        state.player.area += bonus;
        break;
      case 'cooldown':
        state.player.cooldown = Math.max(0.35, state.player.cooldown - bonus);
        break;
      case 'amount':
        state.player.amountBonus += bonus;
        break;
      case 'magnet':
        state.player.magnetRadius *= 1 + bonus;
        break;
      case 'greed':
        state.player.greed += bonus;
        break;
      case 'regen':
        state.player.regen += bonus;
        break;
      case 'armor':
        state.player.armor += bonus;
        break;
      case 'duration':
        state.player.duration += bonus;
        break;
      case 'revivals':
        state.player.revivalsLeft += bonus;
        break;
    }
  }
  return state;
}

export interface HeroFormModifiers {
  mightAdd: number;
  areaAdd: number;
  hasteMult: number;
  speedMult: number;
  armorAdd: number;
  regenAdd: number;
  amountAdd: number;
  magnetMult: number;
  greedAdd: number;
  skillRechargeMult: number;
}

export function getHeroFormModifiers(state: GameState): HeroFormModifiers {
  const mod: HeroFormModifiers = {
    mightAdd: 0,
    areaAdd: 0,
    hasteMult: 1,
    speedMult: 1,
    armorAdd: 0,
    regenAdd: 0,
    amountAdd: 0,
    magnetMult: 1,
    greedAdd: 0,
    skillRechargeMult: 1,
  };
  const awakened = state.player.heroForm === 'awakened';
  switch (state.characterId) {
    case 'char-classic':
      if (awakened) {
        mod.mightAdd = 0.18;
        mod.hasteMult = 1.15;
      } else {
        mod.armorAdd = 3;
        mod.regenAdd = 1.0;
      }
      break;
    case 'char-nezha':
      if (awakened) {
        mod.amountAdd = state.player.unlockedMechanics.includes('nezha-ashura-fury') ? 3 : 2;
        mod.speedMult = 1.22;
      } else {
        mod.skillRechargeMult = 1.2;
      }
      break;
    case 'char-santa':
      if (awakened) {
        mod.areaAdd = 0.2;
      } else {
        mod.magnetMult = 1.5;
        mod.greedAdd = 0.3;
      }
      break;
    case 'char-kitsune':
      if (!awakened) {
        mod.hasteMult = 1.14;
      }
      break;
    case 'char-galaxy':
      if (awakened) {
        mod.mightAdd = 0.32;
      } else {
        mod.areaAdd = 0.2;
      }
      break;
  }
  return mod;
}
