import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/data/catalog.ts';
import {
  selectUpgradeAndResume,
  stepSimulation,
  triggerActiveGadget,
  triggerActiveSkill,
} from '../src/game/simulation.ts';
import { createInitialGameState, type EnemyEntity, type GameState } from '../src/game/state.ts';
import { spawnEnemyInstance } from '../src/game/waveDirector.ts';

function makeDummyEnemy(state: GameState, overrides: Partial<EnemyEntity> = {}): EnemyEntity {
  return {
    uid: state.nextUid++,
    defId: 'enm-angry',
    spriteId: 'emote-angry',
    isMedallion: false,
    aiBehavior: 'chaser',
    aiTimer: 1.5,
    aiState: 'move',
    chargeDirX: 0,
    chargeDirY: 0,
    isMerged: false,
    scaleMult: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    maxHp: 100,
    speed: 0,
    radius: 24,
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
    ...overrides,
  };
}

describe('simulation', () => {
  it('moves player, spawns enemies, kills with weapons, levels up, and spawns 2-minute cadence bosses', () => {
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

    // Fast-forward near 120s to verify 2-minute boss cadence
    state.elapsedSec = 119.9;
    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, dt * 10);
    expect(state.triggeredEvents.has('ev-alps-120')).toBe(true);
    expect(state.enemies.some((e) => e.defId === 'boss-alps')).toBe(true);

    // Verify all 5 two-minute intervals (2m, 4m, 6m, 8m, 10m) exist in both stages
    for (const st of Object.values(CATALOG.stages)) {
      expect(st.bossEvents.map((ev) => ev.atSec)).toEqual([120, 240, 360, 480, 600]);
    }
  });

  it('consumes revival once before triggering gameover', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, { revivals: 1 }, 55);

    state.enemies.push(makeDummyEnemy(state, { damage: 500 }));

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

      state.enemies.push(makeDummyEnemy(state, { x: 60, hp: 500, maxHp: 500, speed: 50, radius: 20 }));

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
      state.triggeredEvents.add('init-opening-pack');
      state.weapons = [{ weaponId: wid, level: 3, cooldownTimer: 0.01, totalDamage: 0 }];
      state.enemies.push(makeDummyEnemy(state, { x: 75, hp: 800, maxHp: 800, radius: 36, damage: 5 }));

      for (let step = 0; step < 45; step++) {
        stepSimulation(state, { x: 1, y: 0 }, stage, CATALOG, 1 / 60);
      }
      expect(state.enemies[0]!.hp).toBeLessThan(800);
      expect(state.weapons[0]!.totalDamage).toBeGreaterThan(0);
    }
  });

  it('applies new monster drops (gold_bag, frenzy_elixir, ice_hourglass, holy_bell) on collection', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, {}, 404);
    state.player.skillCooldownTimer = 10;
    state.player.skillMaxCooldown = 10;

    state.enemies.push(makeDummyEnemy(state, { x: 120, hp: 500, maxHp: 500, speed: 80, radius: 20 }));

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

  it('executes diverse regular enemy mechanics (ranged projectiles, charger dash, splitter spawn)', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, {}, 505);
    state.weapons = []; // disable player attacks for clean behavior observation

    const ranged = spawnEnemyInstance(state, CATALOG.enemies['enm-squint']!, 220, 0, 1, 1);
    ranged.aiTimer = 0.05;
    const charger = spawnEnemyInstance(state, CATALOG.enemies['enm-pout']!, 180, 40, 1, 1);
    charger.aiTimer = 0.05;
    const splitter = spawnEnemyInstance(state, CATALOG.enemies['enm-baby']!, 400, 400, 1, 1);
    splitter.hp = 0; // dies on cleanup pass inside updateEnemies

    for (let s = 0; s < 50; s++) {
      stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    }

    expect(state.projectiles.some((p) => p.behavior === 'enemy_orb')).toBe(true);
    expect(charger.aiState === 'windup' || charger.aiState === 'dash').toBe(true);
    expect(state.enemies.filter((e) => e.defId === 'enm-tiny').length).toBe(2);
  });

  it('executes unique Boss mechanics (blink ambush, blackhole gravity pull, twin boss merge)', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, {}, 606);
    state.weapons = [];

    // 1. Twin Merge
    const b1 = spawnEnemyInstance(state, CATALOG.enemies['boss-horsemen']!, 300, 0, 1, 1);
    const b2 = spawnEnemyInstance(state, CATALOG.enemies['boss-horsemen']!, 325, 0, 1, 1);
    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    expect(b1.isMerged || b2.isMerged).toBe(true);
    expect(state.events.some((ev) => ev.type === 'boss_merge')).toBe(true);

    // 2. Blackhole gravity vortex pulls player
    const bhBoss = spawnEnemyInstance(state, CATALOG.enemies['boss-creation']!, 240, 0, 1, 1);
    bhBoss.aiTimer = 0.01;
    const prevX = state.player.x;
    for (let s = 0; s < 15; s++) {
      stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    }
    expect(state.zones.some((z) => z.kind === 'blackhole')).toBe(true);
    expect(Math.abs(state.player.x - prevX)).toBeGreaterThan(2);

    // 3. Blink ambush teleports
    const blinkBoss = spawnEnemyInstance(state, CATALOG.enemies['boss-thunder']!, 2000, 2000, 1, 1);
    blinkBoss.aiTimer = 0.01;
    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    expect(Math.hypot(blinkBoss.x - state.player.x, blinkBoss.y - state.player.y)).toBeLessThan(350);
  });

  it('stores pickable tactical gadgets cleanly and triggers magnet/shield/decoy/turret', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const state = createInitialGameState(char, stage, {}, 707);
    state.weapons = [];

    state.pickups.push(
      { uid: state.nextUid++, kind: 'gadget_decoy', x: 0, y: 0, value: 1, magnetized: true, bobSeed: 0 },
      { uid: state.nextUid++, kind: 'gadget_shield', x: 0, y: 0, value: 1, magnetized: true, bobSeed: 0 },
      { uid: state.nextUid++, kind: 'gadget_magnet', x: 0, y: 0, value: 1, magnetized: true, bobSeed: 0 },
      { uid: state.nextUid++, kind: 'xp_large', x: 600, y: 0, value: 10, magnetized: false, bobSeed: 0 }
    );

    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    expect(state.player.heldGadgets).toEqual(['gadget-magnet', 'gadget-shield', 'gadget-decoy']);

    // 1. Trigger Magnet: magnetizes far xp_large at x=600
    expect(triggerActiveGadget(state, CATALOG)).toBe(true);
    expect(state.player.activeMagnetTimer).toBeGreaterThan(7);
    expect(state.pickups.find((p) => p.kind === 'xp_large')?.magnetized).toBe(true);

    // 2. Trigger Shield: absorbs contact damage cleanly
    expect(triggerActiveGadget(state, CATALOG)).toBe(true);
    expect(state.player.shieldCharges).toBe(3);
    const hpBefore = state.player.hp;
    state.enemies.push(makeDummyEnemy(state, { damage: 45 }));
    stepSimulation(state, { x: 0, y: 0 }, stage, CATALOG, 1 / 60);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.shieldCharges).toBe(2);

    // 3. Trigger Decoy & collect/trigger Turret
    expect(triggerActiveGadget(state, CATALOG)).toBe(true);
    expect(state.deployables.some((d) => d.kind === 'decoy')).toBe(true);
    state.player.heldGadgets.push('gadget-turret');
    expect(triggerActiveGadget(state, CATALOG)).toBe(true);
    expect(state.deployables.some((d) => d.kind === 'turret')).toBe(true);
  });

  it('scales enemy stats, boss cooldowns, and gold greed in Hard Mode', () => {
    const char = CATALOG.characters['char-classic']!;
    const stage = CATALOG.stages['stage-sanctuary']!;
    const normalState = createInitialGameState(char, stage, {}, 808, 'normal');
    const hardState = createInitialGameState(char, stage, {}, 808, 'hard');

    expect(hardState.difficulty).toBe('hard');
    expect(hardState.player.greed).toBeGreaterThan(normalState.player.greed);

    const nBoss = spawnEnemyInstance(normalState, CATALOG.enemies['boss-alps']!, 300, 0, 1, 1);
    const hBoss = spawnEnemyInstance(hardState, CATALOG.enemies['boss-alps']!, 300, 0, 1, 1);

    expect(hBoss.maxHp).toBeGreaterThan(nBoss.maxHp);
    expect(hBoss.speed).toBeGreaterThan(nBoss.speed);
    expect(hBoss.damage).toBeGreaterThan(nBoss.damage);
    expect(hBoss.bossShootTimer).toBeLessThan(nBoss.bossShootTimer);
  });
});
