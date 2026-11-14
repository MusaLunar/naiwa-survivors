import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/data/catalog.ts';
import { createInitialGameState } from '../src/game/state.ts';
import {
  applyUpgradeChoice,
  findAvailableEvolutions,
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  rollChestReward,
  rollLevelUpChoices,
} from '../src/game/upgradeSystem.ts';

describe('upgradeSystem', () => {
  it('respects weapon and passive slot caps', () => {
    const state = createInitialGameState(
      CATALOG.characters['char-classic']!,
      CATALOG.stages['stage-sanctuary']!,
      {},
      1234
    );

    const baseWeaponIds = Object.values(CATALOG.weapons)
      .filter((w) => !w.isEvolved)
      .map((w) => w.id);
    for (let i = 1; i < MAX_WEAPON_SLOTS; i++) {
      state.weapons.push({ weaponId: baseWeaponIds[i]!, level: 1, cooldownTimer: 0, totalDamage: 0 });
    }
    const passiveIds = Object.keys(CATALOG.passives);
    for (let i = 0; i < MAX_PASSIVE_SLOTS; i++) {
      state.passives.push({ passiveId: passiveIds[i]!, level: 1 });
    }

    const choices = rollLevelUpChoices(state, CATALOG, 3);
    for (const c of choices) {
      if (c.kind === 'weapon') {
        expect(state.weapons.some((w) => w.weaponId === c.id)).toBe(true);
      }
      if (c.kind === 'passive') {
        expect(state.passives.some((p) => p.passiveId === c.id)).toBe(true);
      }
    }
  });

  it('evolves maxed weapon when paired passive is owned and chest opens', () => {
    const state = createInitialGameState(
      CATALOG.characters['char-classic']!,
      CATALOG.stages['stage-sanctuary']!,
      {},
      42
    );
    const mainWpn = state.weapons[0]!;
    mainWpn.level = CATALOG.weapons[mainWpn.weaponId]!.levels.length;
    state.passives.push({ passiveId: 'pas-chalice', level: 1 });

    const available = findAvailableEvolutions(state, CATALOG);
    expect(available.length).toBe(1);
    expect(available[0]!.id).toBe('evo-laugh-tsunami');

    const chest = rollChestReward(state, CATALOG);
    expect(chest.choices[0]!.kind).toBe('evolve');
    applyUpgradeChoice(state, chest.choices[0]!, CATALOG);
    expect(state.weapons.some((w) => w.weaponId === 'evo-laugh-tsunami')).toBe(true);
    expect(state.weapons.some((w) => w.weaponId === 'wpn-belly-wave')).toBe(false);
  });

  it('provides fallback bonus cards when all slots are maxed', () => {
    const state = createInitialGameState(
      CATALOG.characters['char-classic']!,
      CATALOG.stages['stage-sanctuary']!,
      {},
      77
    );
    state.weapons = [];
    const baseWeapons = Object.values(CATALOG.weapons).filter((w) => !w.isEvolved).slice(0, MAX_WEAPON_SLOTS);
    for (const w of baseWeapons) {
      state.weapons.push({ weaponId: w.id, level: w.levels.length, cooldownTimer: 0, totalDamage: 0 });
    }
    const passives = Object.values(CATALOG.passives).slice(0, MAX_PASSIVE_SLOTS);
    for (const p of passives) {
      state.passives.push({ passiveId: p.id, level: p.maxLevel });
    }

    const choices = rollLevelUpChoices(state, CATALOG, 3);
    expect(choices.some((c) => c.kind === 'bonus_heal' || c.kind === 'bonus_gold')).toBe(true);
  });
});
