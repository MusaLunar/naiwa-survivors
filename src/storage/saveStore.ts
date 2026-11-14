import { CATALOG } from '../data/catalog.ts';
import type { GameSettings, MetaUpgradeDef, SaveData } from '../data/types.ts';

export const SAVE_STORAGE_KEY = 'naiwa_survivors_save_v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.65,
  sfxEnabled: true,
  bgmEnabled: true,
  screenShake: true,
  damageNumbers: true,
  codexPreviewAll: false,
};

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    gold: 0,
    metaRanks: {},
    unlockedCharacters: ['char-classic'],
    unlockedCodexIds: [],
    clearedStages: [],
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
    return {
      version: 1,
      gold: typeof parsed.gold === 'number' && parsed.gold >= 0 ? Math.floor(parsed.gold) : 0,
      metaRanks:
        parsed.metaRanks && typeof parsed.metaRanks === 'object' ? { ...parsed.metaRanks } : {},
      unlockedCharacters: Array.isArray(parsed.unlockedCharacters)
        ? Array.from(new Set(['char-classic', ...parsed.unlockedCharacters]))
        : def.unlockedCharacters,
      unlockedCodexIds: Array.isArray(parsed.unlockedCodexIds)
        ? Array.from(new Set(parsed.unlockedCodexIds))
        : [],
      clearedStages: Array.isArray(parsed.clearedStages)
        ? Array.from(new Set(parsed.clearedStages))
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
