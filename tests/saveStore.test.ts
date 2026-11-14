import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/data/catalog.ts';
import {
  computeCharacterTreeEffects,
  computeMetaBonuses,
  createDefaultSave,
  getSkillNodeRank,
  loadSaveData,
  persistSaveData,
  purchaseCharacterUnlock,
  purchaseMetaUpgrade,
  purchaseSkillNode,
  recordRunDiscoveries,
  resetCharacterSkillTree,
  SAVE_STORAGE_KEY,
} from '../src/storage/saveStore.ts';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null;
    },
    removeItem(k: string) {
      map.delete(k);
    },
    setItem(k: string, v: string) {
      map.set(k, v);
    },
  };
}

describe('saveStore', () => {
  it('recovers gracefully from malformed JSON and persists valid saves', () => {
    const store = createMemoryStorage();
    store.setItem(SAVE_STORAGE_KEY, '{broken-json');
    const recovered = loadSaveData(store);
    expect(recovered.unlockedCharacters).toContain('char-classic');
    expect(recovered.gold).toBe(0);

    recovered.gold = 220;
    expect(purchaseMetaUpgrade(recovered, 'meta-might')).toBe(true);
    expect(recovered.metaRanks['meta-might']).toBe(1);
    expect(purchaseCharacterUnlock(recovered, 'char-nezha')).toBe(true);
    expect(recovered.unlockedCharacters).toContain('char-nezha');

    persistSaveData(recovered, store);
    const reloaded = loadSaveData(store);
    expect(reloaded.gold).toBe(30);
    expect(computeMetaBonuses(reloaded).might).toBeCloseTo(0.08);
  });

  it('prevents purchase with insufficient funds', () => {
    const save = createDefaultSave();
    save.gold = 10;
    expect(purchaseMetaUpgrade(save, 'meta-might')).toBe(false);
    expect(purchaseCharacterUnlock(save, 'char-galaxy')).toBe(false);
  });

  it('enforces character skill tree prerequisites, covers all 6 categories, computes effects, and refunds on reset', () => {
    const requiredCategories = [
      'stat',
      'skill_upgrade',
      'mechanic',
      'passive',
      'active_skill',
      'starting_item',
    ];
    for (const charId of Object.keys(CATALOG.characters)) {
      const tree = CATALOG.skillTrees[charId];
      expect(tree).toBeDefined();
      const cats = new Set(tree!.map((n) => n.category));
      for (const req of requiredCategories) {
        expect(cats.has(req as any)).toBe(true);
      }
    }

    const store = createMemoryStorage();
    const save = createDefaultSave();
    save.gold = 600;

    // Cannot buy Tier 2 before Tier 1 root is unlocked
    expect(purchaseSkillNode(save, 'char-classic', 'tree-classic-shield-kit', CATALOG)).toBe(false);
    expect(purchaseSkillNode(save, 'char-classic', 'tree-classic-vitality', CATALOG)).toBe(true);
    expect(getSkillNodeRank(save, 'char-classic', 'tree-classic-vitality')).toBe(1);

    // Unlock Tier 2 starting gadget & Tier 3 starting passive + Tier 2 skill upgrade
    expect(purchaseSkillNode(save, 'char-classic', 'tree-classic-shield-kit', CATALOG)).toBe(true);
    expect(purchaseSkillNode(save, 'char-classic', 'tree-classic-chalice', CATALOG)).toBe(true);
    expect(purchaseSkillNode(save, 'char-classic', 'tree-classic-roar', CATALOG)).toBe(true);
    expect(purchaseSkillNode(save, 'char-classic', 'tree-classic-tremor', CATALOG)).toBe(true);

    const effects = computeCharacterTreeEffects(save, 'char-classic', CATALOG);
    expect(effects.statBonuses.maxHp).toBeGreaterThanOrEqual(22);
    expect(effects.skillCdMult).toBeLessThan(1);
    expect(effects.skillPowerMult).toBeGreaterThan(1);
    expect(effects.startingGadgets).toEqual(['gadget-shield']);
    expect(effects.startingPassives).toEqual(['pas-chalice']);
    expect(effects.unlockedMechanics).toContain('classic-tremor-step');
    expect(effects.startGoldBonus).toBeGreaterThanOrEqual(25);

    const refunded = resetCharacterSkillTree(save, 'char-classic', CATALOG);
    expect(refunded).toBeGreaterThan(0);
    expect(save.gold).toBe(600);
    expect(getSkillNodeRank(save, 'char-classic', 'tree-classic-vitality')).toBe(0);

    recordRunDiscoveries(save, ['enm-angry', 'boss-alps'], ['wpn-belly-wave', 'gadget-shield']);
    persistSaveData(save, store);
    const reloaded = loadSaveData(store);
    expect(reloaded.discoveredEnemyIds).toEqual(['enm-angry', 'boss-alps']);
    expect(reloaded.discoveredWeaponIds).toEqual(['wpn-belly-wave', 'gadget-shield']);
  });
});
