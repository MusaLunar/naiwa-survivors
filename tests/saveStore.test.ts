import { describe, expect, it } from 'vitest';
import {
  computeMetaBonuses,
  createDefaultSave,
  loadSaveData,
  persistSaveData,
  purchaseCharacterUnlock,
  purchaseMetaUpgrade,
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
});
