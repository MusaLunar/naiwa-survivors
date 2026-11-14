import type { GameCatalog, PassiveDef, StatKey } from '../data/types.ts';
import type { ChestReward, GameState, UpgradeChoice } from './state.ts';

export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;

/** Compute which evolutions are currently eligible (weapon at max level + paired passive owned). */
export function findAvailableEvolutions(state: GameState, catalog: GameCatalog): UpgradeChoice[] {
  const results: UpgradeChoice[] = [];
  for (const evo of catalog.evolutions) {
    const weaponSlot = state.weapons.find((w) => w.weaponId === evo.weaponId);
    const passiveSlot = state.passives.find((p) => p.passiveId === evo.passiveId);
    const baseWeapon = catalog.weapons[evo.weaponId];
    const evolvedWeapon = catalog.weapons[evo.evolvedWeaponId];
    const alreadyEvolved = state.weapons.some((w) => w.weaponId === evo.evolvedWeaponId);
    if (!weaponSlot || !passiveSlot || !baseWeapon || !evolvedWeapon || alreadyEvolved) {
      continue;
    }
    if (weaponSlot.level >= baseWeapon.levels.length) {
      results.push({
        kind: 'evolve',
        id: evolvedWeapon.id,
        title: `【超武进化】${evolvedWeapon.name}`,
        subtitle: `${baseWeapon.name} + ${catalog.passives[evo.passiveId]?.name ?? ''}`,
        description: evolvedWeapon.description,
        spriteId: evolvedWeapon.spriteId,
        currentLevel: baseWeapon.levels.length,
        nextLevel: 1,
        evolvedFromId: baseWeapon.id,
        passivePairId: evo.passiveId,
      });
    }
  }
  return results;
}

/** Generate up to `count` distinct upgrade cards for level-up selection. */
export function rollLevelUpChoices(
  state: GameState,
  catalog: GameCatalog,
  count = 3
): UpgradeChoice[] {
  const pool: UpgradeChoice[] = [];

  // 1. Existing weapons below max level
  for (const slot of state.weapons) {
    const def = catalog.weapons[slot.weaponId];
    if (!def || def.isEvolved) continue;
    if (slot.level < def.levels.length) {
      pool.push({
        kind: 'weapon',
        id: def.id,
        title: def.name,
        subtitle: `Lv.${slot.level} → Lv.${slot.level + 1}`,
        description: def.description,
        spriteId: def.spriteId,
        currentLevel: slot.level,
        nextLevel: slot.level + 1,
      });
    }
  }

  // 2. New base weapons if slot available
  if (state.weapons.length < MAX_WEAPON_SLOTS) {
    for (const def of Object.values(catalog.weapons)) {
      if (def.isEvolved) continue;
      if (state.weapons.some((w) => w.weaponId === def.id)) continue;
      // Don't re-offer base weapon if its evolved version is already held
      const evolvedVersion = catalog.evolutions.find((e) => e.weaponId === def.id)?.evolvedWeaponId;
      if (evolvedVersion && state.weapons.some((w) => w.weaponId === evolvedVersion)) continue;
      pool.push({
        kind: 'weapon',
        id: def.id,
        title: def.name,
        subtitle: '新武器 · Lv.1',
        description: def.description,
        spriteId: def.spriteId,
        currentLevel: 0,
        nextLevel: 1,
      });
    }
  }

  // 3. Existing passives below max level
  for (const slot of state.passives) {
    const def = catalog.passives[slot.passiveId];
    if (!def) continue;
    if (slot.level < def.maxLevel) {
      pool.push({
        kind: 'passive',
        id: def.id,
        title: def.name,
        subtitle: `Lv.${slot.level} → Lv.${slot.level + 1}`,
        description: def.description,
        spriteId: def.spriteId,
        currentLevel: slot.level,
        nextLevel: slot.level + 1,
      });
    }
  }

  // 4. New passives if slot available
  if (state.passives.length < MAX_PASSIVE_SLOTS) {
    for (const def of Object.values(catalog.passives)) {
      if (state.passives.some((p) => p.passiveId === def.id)) continue;
      pool.push({
        kind: 'passive',
        id: def.id,
        title: def.name,
        subtitle: '新圣物 · Lv.1',
        description: def.description,
        spriteId: def.spriteId,
        currentLevel: 0,
        nextLevel: 1,
      });
    }
  }

  // Shuffle deterministically with SeededRng (Fisher-Yates)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = state.rng.int(0, i);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  const chosen = pool.slice(0, count);

  // Fallback items if player maxed everything
  if (chosen.length === 0) {
    chosen.push(
      {
        kind: 'bonus_heal',
        id: 'bonus_heal',
        title: '圣殿香油大补鸡腿',
        subtitle: '立即恢复 40 点生命值',
        description: '所有装备已登峰造极，饮一口香油重振蛙威！',
        spriteId: 'emote-blush',
      },
      {
        kind: 'bonus_gold',
        id: 'bonus_gold',
        title: '香油功德金袋',
        subtitle: '立即获得 +35 功德金币',
        description: '笑意凝结成金箔，带回圣殿商店强化永久属性。',
        spriteId: 'laugh-double-v',
      }
    );
  }

  return chosen;
}

/** Generate chest opening reward: prioritizes weapon evolution, then existing upgrades, then gold. */
export function rollChestReward(state: GameState, catalog: GameCatalog): ChestReward {
  const bonusGold = Math.round((25 + state.rng.int(0, 20)) * state.player.greed);
  const evolutions = findAvailableEvolutions(state, catalog);
  if (evolutions.length > 0) {
    return {
      choices: [evolutions[0]!],
      bonusGold,
    };
  }

  const upgradeCandidates = rollLevelUpChoices(state, catalog, 3).filter(
    (c) => c.kind === 'weapon' || c.kind === 'passive'
  );
  if (upgradeCandidates.length > 0) {
    return {
      choices: [upgradeCandidates[0]!],
      bonusGold,
    };
  }

  return {
    choices: [
      {
        kind: 'bonus_gold',
        id: 'bonus_gold',
        title: '香油功德大宝箱',
        subtitle: `额外收获 +${bonusGold} 功德金币`,
        description: '全身圣物已臻完美，圣殿为你降下纯金嘉奖！',
        spriteId: 'laugh-double-v',
      },
    ],
    bonusGold: bonusGold + 30,
  };
}

function applyPassiveStatBonus(state: GameState, def: PassiveDef): void {
  const stat: StatKey = def.statKey;
  const bonus = def.perLevelBonus;
  switch (stat) {
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

/** Apply selected UpgradeChoice to `state`. */
export function applyUpgradeChoice(state: GameState, choice: UpgradeChoice, catalog: GameCatalog): void {
  if (choice.kind === 'evolve' && choice.evolvedFromId) {
    const idx = state.weapons.findIndex((w) => w.weaponId === choice.evolvedFromId);
    if (idx !== -1) {
      const prevDmg = state.weapons[idx]!.totalDamage;
      state.weapons[idx] = {
        weaponId: choice.id,
        level: 1,
        cooldownTimer: 0.05,
        totalDamage: prevDmg,
      };
    } else if (state.weapons.length < MAX_WEAPON_SLOTS) {
      state.weapons.push({ weaponId: choice.id, level: 1, cooldownTimer: 0.05, totalDamage: 0 });
    }
    return;
  }

  if (choice.kind === 'weapon') {
    const existing = state.weapons.find((w) => w.weaponId === choice.id);
    if (existing) {
      existing.level += 1;
    } else if (state.weapons.length < MAX_WEAPON_SLOTS) {
      state.weapons.push({ weaponId: choice.id, level: 1, cooldownTimer: 0.1, totalDamage: 0 });
    }
    return;
  }

  if (choice.kind === 'passive') {
    const def = catalog.passives[choice.id];
    if (!def) return;
    const existing = state.passives.find((p) => p.passiveId === choice.id);
    if (existing) {
      existing.level += 1;
    } else if (state.passives.length < MAX_PASSIVE_SLOTS) {
      state.passives.push({ passiveId: choice.id, level: 1 });
    }
    applyPassiveStatBonus(state, def);
    return;
  }

  if (choice.kind === 'bonus_heal') {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 40);
    return;
  }

  if (choice.kind === 'bonus_gold') {
    state.goldEarned += 35;
  }
}
