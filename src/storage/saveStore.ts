import { CATALOG } from '../data/catalog.ts';
import type {
  GadgetId,
  GameCatalog,
  GameSettings,
  MetaUpgradeDef,
  SaveData,
  SkillTreeNodeDef,
  StatKey,
} from '../data/types.ts';

export const SAVE_STORAGE_KEY = 'naiwa_survivors_save_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.65,
  sfxEnabled: true,
  bgmEnabled: true,
  screenShake: true,
  damageNumbers: true,
  codexPreviewAll: false,
  clearProjectiles: true,
};

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    gold: 0,
    metaRanks: {},
    skillTreeRanks: {},
    unlockedCharacters: ['char-classic'],
    unlockedCodexIds: [],
    discoveredEnemyIds: [],
    discoveredWeaponIds: [],
    clearedStages: [],
    clearedHardStages: [],
    bestKills: 0,
    bestSurvivalSec: 0,
    totalRuns: 0,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function loadSaveData(storage?: Pick<Storage, 'getItem'>): SaveData {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return createDefaultSave();
  try {
    const raw = store.getItem(SAVE_STORAGE_KEY);
    if (!raw) return createDefaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || typeof parsed !== 'object') return createDefaultSave();
    const def = createDefaultSave();
    const parsedSkillTrees: Record<string, Record<string, number>> = {};
    if (parsed.skillTreeRanks && typeof parsed.skillTreeRanks === 'object') {
      for (const [charId, nodes] of Object.entries(parsed.skillTreeRanks)) {
        if (nodes && typeof nodes === 'object') {
          parsedSkillTrees[charId] = { ...nodes };
        }
      }
    }
    return {
      version: 1,
      gold: typeof parsed.gold === 'number' && parsed.gold >= 0 ? Math.floor(parsed.gold) : 0,
      metaRanks:
        parsed.metaRanks && typeof parsed.metaRanks === 'object' ? { ...parsed.metaRanks } : {},
      skillTreeRanks: parsedSkillTrees,
      unlockedCharacters: Array.isArray(parsed.unlockedCharacters)
        ? Array.from(new Set(['char-classic', ...parsed.unlockedCharacters]))
        : def.unlockedCharacters,
      unlockedCodexIds: Array.isArray(parsed.unlockedCodexIds)
        ? Array.from(new Set(parsed.unlockedCodexIds))
        : [],
      discoveredEnemyIds: Array.isArray(parsed.discoveredEnemyIds)
        ? Array.from(new Set(parsed.discoveredEnemyIds))
        : [],
      discoveredWeaponIds: Array.isArray(parsed.discoveredWeaponIds)
        ? Array.from(new Set(parsed.discoveredWeaponIds))
        : [],
      clearedStages: Array.isArray(parsed.clearedStages)
        ? Array.from(new Set(parsed.clearedStages))
        : [],
      clearedHardStages: Array.isArray(parsed.clearedHardStages)
        ? Array.from(new Set(parsed.clearedHardStages))
        : [],
      bestKills: typeof parsed.bestKills === 'number' ? parsed.bestKills : 0,
      bestSurvivalSec: typeof parsed.bestSurvivalSec === 'number' ? parsed.bestSurvivalSec : 0,
      totalRuns: typeof parsed.totalRuns === 'number' ? parsed.totalRuns : 0,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}),
      },
    };
  } catch {
    return createDefaultSave();
  }
}

export function persistSaveData(
  data: SaveData,
  storage?: Pick<Storage, 'setItem'>
): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return;
  try {
    store.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota / private browsing write errors gracefully
  }
}

export function getMetaUpgradeCost(def: MetaUpgradeDef, currentRank: number): number {
  return def.baseCost + currentRank * def.costStep;
}

export function purchaseMetaUpgrade(save: SaveData, upgradeId: string): boolean {
  const def = CATALOG.metaUpgrades.find((m) => m.id === upgradeId);
  if (!def) return false;
  const rank = save.metaRanks[upgradeId] ?? 0;
  if (rank >= def.maxRank) return false;
  const cost = getMetaUpgradeCost(def, rank);
  if (save.gold < cost) return false;
  save.gold -= cost;
  save.metaRanks[upgradeId] = rank + 1;
  return true;
}

export function purchaseCharacterUnlock(save: SaveData, characterId: string): boolean {
  const def = CATALOG.characters[characterId];
  if (!def) return false;
  if (save.unlockedCharacters.includes(characterId)) return true;
  if (save.gold < def.unlockCost) return false;
  save.gold -= def.unlockCost;
  save.unlockedCharacters.push(characterId);
  return true;
}

export function computeMetaBonuses(save: SaveData): Partial<Record<string, number>> {
  const bonuses: Record<string, number> = {};
  for (const def of CATALOG.metaUpgrades) {
    const rank = save.metaRanks[def.id] ?? 0;
    if (rank > 0) {
      bonuses[def.statKey] = (bonuses[def.statKey] ?? 0) + rank * def.perRankBonus;
    }
  }
  return bonuses;
}

export interface CharacterTreeEffects {
  statBonuses: Partial<Record<StatKey, number>>;
  skillCdMult: number;
  skillPowerMult: number;
  skillRadiusMult: number;
  unlockedMechanics: string[];
  startingGadgets: GadgetId[];
  startingPassives: string[];
  xpMultBonus: number;
  thornsBonus: number;
  startGoldBonus: number;
}

export function getSkillNodeRank(save: SaveData, characterId: string, nodeId: string): number {
  return save.skillTreeRanks?.[characterId]?.[nodeId] ?? 0;
}

export function getSkillNodeCost(node: SkillTreeNodeDef, currentRank: number): number {
  return node.baseCost + currentRank * node.costStep;
}

export function isSkillNodeUnlocked(
  save: SaveData,
  characterId: string,
  node: SkillTreeNodeDef
): boolean {
  if (!node.requires || node.requires.length === 0) return true;
  return node.requires.every((reqId) => getSkillNodeRank(save, characterId, reqId) >= 1);
}

export function purchaseSkillNode(
  save: SaveData,
  characterId: string,
  nodeId: string,
  catalog: GameCatalog = CATALOG
): boolean {
  const tree = catalog.skillTrees[characterId];
  if (!tree) return false;
  const node = tree.find((n) => n.id === nodeId);
  if (!node) return false;
  if (!isSkillNodeUnlocked(save, characterId, node)) return false;
  const rank = getSkillNodeRank(save, characterId, nodeId);
  if (rank >= node.maxRank) return false;
  const cost = getSkillNodeCost(node, rank);
  if (save.gold < cost) return false;
  save.gold -= cost;
  if (!save.skillTreeRanks) save.skillTreeRanks = {};
  if (!save.skillTreeRanks[characterId]) save.skillTreeRanks[characterId] = {};
  save.skillTreeRanks[characterId][nodeId] = rank + 1;
  return true;
}

export function getCharacterTreeSpentGold(
  save: SaveData,
  characterId: string,
  catalog: GameCatalog = CATALOG
): number {
  const tree = catalog.skillTrees[characterId] ?? [];
  let spent = 0;
  for (const node of tree) {
    const rank = getSkillNodeRank(save, characterId, node.id);
    for (let r = 0; r < rank; r++) {
      spent += getSkillNodeCost(node, r);
    }
  }
  return spent;
}

export function resetCharacterSkillTree(
  save: SaveData,
  characterId: string,
  catalog: GameCatalog = CATALOG
): number {
  const refund = getCharacterTreeSpentGold(save, characterId, catalog);
  if (refund <= 0) return 0;
  save.gold += refund;
  if (save.skillTreeRanks) {
    save.skillTreeRanks[characterId] = {};
  }
  return refund;
}

export function refundLegacyMetaUpgrades(
  save: SaveData,
  catalog: GameCatalog = CATALOG
): number {
  let refund = 0;
  for (const def of catalog.metaUpgrades) {
    const rank = save.metaRanks[def.id] ?? 0;
    for (let r = 0; r < rank; r++) {
      refund += getMetaUpgradeCost(def, r);
    }
    if (rank > 0) {
      save.metaRanks[def.id] = 0;
    }
  }
  save.gold += refund;
  return refund;
}

export function computeCharacterTreeEffects(
  save: SaveData,
  characterId: string,
  catalog: GameCatalog = CATALOG
): CharacterTreeEffects {
  const legacy = computeMetaBonuses(save);
  const statBonuses: Partial<Record<StatKey, number>> = { ...(legacy as Partial<Record<StatKey, number>>) };
  let skillCdReduction = 0;
  let skillPowerBonus = 0;
  let skillRadiusBonus = 0;
  const unlockedMechanics: string[] = [];
  const startingGadgets: GadgetId[] = [];
  const startingPassives: string[] = [];
  let xpMultBonus = 0;
  let thornsBonus = 0;
  let startGoldBonus = 0;

  const tree = catalog.skillTrees[characterId] ?? [];
  for (const node of tree) {
    const rank = getSkillNodeRank(save, characterId, node.id);
    if (rank <= 0) continue;
    if (node.statBonus) {
      for (const [key, val] of Object.entries(node.statBonus) as [StatKey, number][]) {
        statBonuses[key] = (statBonuses[key] ?? 0) + val * rank;
      }
    }
    if (node.skillCdReduction) skillCdReduction += node.skillCdReduction * rank;
    if (node.skillPowerBonus) skillPowerBonus += node.skillPowerBonus * rank;
    if (node.skillRadiusBonus) skillRadiusBonus += node.skillRadiusBonus * rank;
    if (node.xpMultBonus) xpMultBonus += node.xpMultBonus * rank;
    if (node.thornsBonus) thornsBonus += node.thornsBonus * rank;
    if (node.startGoldBonus) startGoldBonus += node.startGoldBonus * rank;
    if (node.mechanicId && !unlockedMechanics.includes(node.mechanicId)) {
      unlockedMechanics.push(node.mechanicId);
    }
    if (node.startingGadgetId && !startingGadgets.includes(node.startingGadgetId)) {
      startingGadgets.push(node.startingGadgetId);
    }
    if (node.startingPassiveId && !startingPassives.includes(node.startingPassiveId)) {
      startingPassives.push(node.startingPassiveId);
    }
  }

  return {
    statBonuses,
    skillCdMult: Math.max(0.45, 1 - skillCdReduction),
    skillPowerMult: 1 + skillPowerBonus,
    skillRadiusMult: 1 + skillRadiusBonus,
    unlockedMechanics,
    startingGadgets,
    startingPassives,
    xpMultBonus,
    thornsBonus,
    startGoldBonus,
  };
}

export function recordRunDiscoveries(
  save: SaveData,
  enemyIds: Iterable<string>,
  weaponIds: Iterable<string>
): void {
  save.discoveredEnemyIds = Array.from(
    new Set([...(save.discoveredEnemyIds ?? []), ...enemyIds])
  );
  save.discoveredWeaponIds = Array.from(
    new Set([...(save.discoveredWeaponIds ?? []), ...weaponIds])
  );
}
