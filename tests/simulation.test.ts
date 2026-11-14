import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/data/catalog.ts';
import { selectUpgradeAndResume, stepSimulation, triggerActiveSkill } from '../src/game/simulation.ts';
import { createInitialGameState } from '../src/game/state.ts';

describe('simulation', () => {
  it('moves player, spawns enemies, kills with weapons, levels up, and spawns scheduled boss', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, { might: 0.5 }, 999);

    const dt = 1 / 60;
    // Simulate 18 seconds of circling/weaving so dropped XP gems are collected
    for (let step = 0; step < 60 * 18; step++) {
      if (state.phase === 'levelup') {
        selectUpgradeAndResume(state, state.levelUpChoices[0]!, CATALOG);
      } else if (state.phase === 'chest' && state.pendingChest) {
        selectUpgradeAndResume(state, state.pendingChest.choices[0]!, CATALOG);
      }
      const angle = step * 0.025;
      stepSimulation(state, { x: Math.cos(angle), y: Math.sin(angle) }, stage, CATALOG, dt);
    }

    expect(Math.hypot(state.player.x, state.player.y)).toBeGreaterThan(20);
    expect(state.kills).toBeGreaterThan(0);
    expect(state.player.level).toBeGreaterThanOrEqual(2);

    // Fast-forward near 180s to verify elite boss spawn event
    state.elapsedSec = 179.9;
    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, dt * 10);
    expect(state.triggeredEvents.has('ev-alps-180')).toBe(true);
    expect(state.enemies.some((e) => e.defId === 'boss-alps')).toBe(true);
  });

  it('consumes revival once before triggering gameover', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, { revivals: 1 }, 55);

    state.enemies.push({
      uid: state.nextUid++,
      defId: 'enm-angry',
      spriteId: 'emote-angry',
      isMedallion: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      speed: 0,
      radius: 24,
      damage: 500,
      xpValue: 2,
      goldChance: 0,
      isElite: false,
      isBoss: false,
      hitFlashTimer: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      bossShootTimer: 0,
      wobbleSeed: 0,
    });

    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    expect(state.phase).toBe('playing');
    expect(state.player.revivalsLeft).toBe(0);
    expect(state.player.hp).toBeGreaterThan(0);

    // Expire invulnerability and verify second lethal hit causes gameover
    state.player.invulnTimer = 0;
    state.enemies[0]!.x = state.player.x;
    state.enemies[0]!.y = state.player.y;
    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    expect(state.phase).toBe('gameover');
  });

  it('gives all characters the same universal starting weapon and distinct stats + active skills', () => {
    const stage = CATALOG.stages['stage-sanctuary']!;
    const chars = Object.values(CATALOG.characters);
    expect(chars.length).toBe(5);

    const skillIds = new Set<string>();
    for (const ch of chars) {
      expect(ch.weaponId).toBe('wpn-belly-wave');
      expect(ch.activeSkill).toBeDefined();
      skillIds.add(ch.activeSkill.id);

      const state = createInitialGameState(ch, stage, {}, 101);
      expect(state.weapons.map((w) => w.weaponId)).toEqual(['wpn-belly-wave']);
      expect(state.player.skillCooldownTimer).toBe(0);

      state.enemies.push({
        uid: state.nextUid++,
        defId: 'enm-angry',
        spriteId: 'emote-angry',
        isMedallion: false,
        x: 60,
        y: 0,
        vx: 0,
        vy: 0,
        hp: 500,
        maxHp: 500,
        speed: 50,
        radius: 20,
        damage: 10,
        xpValue: 2,
        goldChance: 0,
        isElite: false,
        isBoss: false,
        hitFlashTimer: 0,
        knockbackVx: 0,
        knockbackVy: 0,
        bossShootTimer: 0,
        wobbleSeed: 0,
      });

      expect(triggerActiveSkill(state, CATALOG)).toBe(true);
      expect(state.player.skillCooldownTimer).toBeGreaterThan(3);
      expect(state.events.some((ev) => ev.type === 'skill_cast')).toBe(true);
      expect(triggerActiveSkill(state, CATALOG)).toBe(false);
    }
    expect(skillIds.size).toBe(5);
  });

  it('fires new offensive weapons (lobbed, shotgun, boomerang, beam) and damages enemies', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const newWeaponIds = [
      'wpn-leap-slam',
      'evo-meteor-cataclysm',
      'wpn-blush-burst',
      'evo-crimson-barrage',
      'wpn-cheek-spinner',
      'wpn-calm-prism',
    ];

    for (const wid of newWeaponIds) {
      const state = createInitialGameState(char, stage, {}, 303);
      state.weapons = [{ weaponId: wid, level: 3, cooldownTimer: 0.01, totalDamage: 0 }];
      state.enemies.push({
        uid: state.nextUid++,
        defId: 'enm-angry',
        spriteId: 'emote-angry',
        isMedallion: false,
        x: 75,
        y: 0,
        vx: 0,
        vy: 0,
        hp: 800,
        maxHp: 800,
        speed: 0,
        radius: 36,
        damage: 5,
        xpValue: 2,
        goldChance: 0,
        isElite: false,
        isBoss: false,
        hitFlashTimer: 0,
        knockbackVx: 0,
        knockbackVy: 0,
        bossShootTimer: 0,
        wobbleSeed: 0,
      });

      for (let step = 0; step < 45; step++) {
        stepSimulation(state, { x: 1, y: 0 }, stage, CATALOG, 1 / 60);
      }
      expect(state.enemies[0]!.hp).toBeLessThan(800);
    }
  });

  it('applies new monster drops (gold_bag, frenzy_elixir, ice_hourglass, holy_bell) on collection', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, {}, 404);
    state.player.skillCooldownTimer = 10;
    state.player.skillMaxCooldown = 10;

    state.enemies.push({
      uid: state.nextUid++,
      defId: 'enm-angry',
      spriteId: 'emote-angry',
      isMedallion: false,
      x: 120,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 500,
      maxHp: 500,
      speed: 80,
      radius: 20,
      damage: 10,
      xpValue: 2,
      goldChance: 0,
      isElite: false,
      isBoss: false,
      hitFlashTimer: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      bossShootTimer: 0,
      wobbleSeed: 0,
    });

    state.pickups.push(
      { uid: state.nextUid++, kind: 'gold_bag', x: 0, y: 0, value: 25, magnetized: true, bobSeed: 0 },
      { uid: state.nextUid++, kind: 'frenzy_elixir', x: 0, y: 0, value: 1, magnetized: true, bobSeed: 0 },
      { uid: state.nextUid++, kind: 'ice_hourglass', x: 0, y: 0, value: 1, magnetized: true, bobSeed: 0 },
      { uid: state.nextUid++, kind: 'holy_bell', x: 0, y: 0, value: 1, magnetized: true, bobSeed: 0 }
    );

    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);

    expect(state.goldEarned).toBeGreaterThanOrEqual(25);
    expect(state.player.frenzyTimer).toBeGreaterThan(6);
    expect(state.freezeTimer).toBeGreaterThan(3.5);
    expect(state.player.skillCooldownTimer).toBeLessThan(6.5);
    expect(state.enemies[0]!.hp).toBeLessThan(500);
  });
});
