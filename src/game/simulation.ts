import type { GadgetId, GameCatalog, StageDef } from '../data/types.ts';
import {
  getDifficultyProfile,
  xpRequiredForLevel,
  type EnemyEntity,
  type GameState,
  type PickupEntity,
  type UpgradeChoice,
} from './state.ts';
import { applyUpgradeChoice, rollChestReward, rollLevelUpChoices } from './upgradeSystem.ts';
import { spawnEnemyInstance, updateWaveDirector } from './waveDirector.ts';
import { applyDamageToEnemy, updateWeapons } from './weapons.ts';

export interface InputVector {
  x: number;
  y: number;
}

const sepBuf: number[] = [];
const hitBuf: number[] = [];

const GADGET_PICKUP_KINDS = [
  'gadget_magnet',
  'gadget_shield',
  'gadget_decoy',
  'gadget_turret',
] as const;

function pickupKindToGadgetId(kind: PickupEntity['kind']): GadgetId | null {
  switch (kind) {
    case 'gadget_magnet':
      return 'gadget-magnet';
    case 'gadget_shield':
      return 'gadget-shield';
    case 'gadget_decoy':
      return 'gadget-decoy';
    case 'gadget_turret':
      return 'gadget-turret';
    default:
      return null;
  }
}

function rollRandomGadgetPickup(state: GameState): PickupEntity['kind'] {
  return GADGET_PICKUP_KINDS[state.rng.int(0, GADGET_PICKUP_KINDS.length - 1)]!;
}

function spawnEnemyOrb(
  state: GameState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  radius = 9,
  color = '#ff5252',
  accentColor = '#ffd84d',
  life = 3.2
): void {
  if (state.projectiles.length >= 290) return;
  state.projectiles.push({
    uid: state.nextUid++,
    weaponId: 'boss_orb',
    behavior: 'enemy_orb',
    x,
    y,
    vx,
    vy,
    radius,
    damage: Math.max(4, Math.round(damage)),
    pierce: 1,
    knockback: 0,
    life,
    maxLife: life,
    color,
    accentColor,
    spinAngle: Math.atan2(vy, vx),
    hitIds: new Set<number>(),
  });
}

function spawnEnemyBlastZone(
  state: GameState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  delay = 0.85,
  color = '#fb923c'
): void {
  state.zones.push({
    uid: state.nextUid++,
    weaponId: 'enemy_blast',
    kind: 'enemy_blast',
    x,
    y,
    radius,
    damage: Math.max(6, Math.round(damage)),
    knockback: 0,
    life: delay,
    maxLife: delay,
    tickInterval: delay + 1,
    tickTimer: delay + 1,
    color,
    accentColor: '#fef08a',
    hitOnce: true,
    applied: false,
  });
}

function damagePlayer(state: GameState, rawDamage: number): boolean {
  if (state.player.invulnTimer > 0) {
    return false;
  }
  if (state.player.shieldCharges > 0 && state.player.shieldTimer > 0) {
    state.player.shieldCharges -= 1;
    if (state.player.shieldCharges <= 0) {
      state.player.shieldTimer = 0;
    }
    state.player.invulnTimer = 0.65;
    state.events.push({ type: 'shield_block' });
    spawnParticles(state, state.player.x, state.player.y, '#fde047', 16, 190);
    state.floatingTexts.push({
      x: state.player.x,
      y: state.player.y - 34,
      vy: -42,
      text: state.player.shieldCharges > 0 ? `圣盾格挡 (${state.player.shieldCharges})` : '圣盾破防反震!',
      color: '#fef08a',
      life: 0.9,
      maxLife: 0.9,
      scale: 1.15,
    });
    const r2 = 175 * 175;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const dx = enemy.x - state.player.x;
      const dy = enemy.y - state.player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 <= r2) {
        const d = Math.sqrt(d2);
        enemy.knockbackVx += (dx / d) * 260;
        enemy.knockbackVy += (dy / d) * 260;
      }
    }
    return false;
  }

  const dmg = Math.max(1, Math.round(rawDamage - state.player.armor));
  state.player.hp -= dmg;
  state.player.invulnTimer = 0.42;
  state.shakeTimer = 0.18;
  state.shakeIntensity = 6;
  state.events.push({ type: 'player_hurt' });
  return true;
}

function spawnParticles(
  state: GameState,
  x: number,
  y: number,
  color: string,
  count: number,
  speed = 110
): void {
  for (let i = 0; i < count; i++) {
    if (state.particles.length >= 260) break;
    const a = state.rng.range(0, Math.PI * 2);
    const s = state.rng.range(speed * 0.4, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      radius: state.rng.range(2.2, 4.8),
      color,
      life: 0.35,
      maxLife: 0.35,
    });
  }
}

function distToSegmentSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0.0001) {
    return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

function handleEnemyKilled(
  state: GameState,
  enemy: EnemyEntity,
  stage: StageDef,
  catalog: GameCatalog
): void {
  state.kills += 1;
  state.events.push({ type: 'kill', intensity: enemy.isBoss ? 1 : 0.3 });
  spawnParticles(state, enemy.x, enemy.y, enemy.isBoss ? '#ffd84d' : '#f7d354', enemy.isBoss ? 22 : 6);

  if (enemy.aiBehavior === 'splitter' && state.enemies.length < 360) {
    const tinyDef = catalog.enemies['enm-tiny'];
    if (tinyDef) {
      const childScale = Math.max(1, enemy.maxHp / 95);
      for (let s = 0; s < 2; s++) {
        const angle = (Math.PI * 2 * s) / 2 + state.rng.range(-0.4, 0.4);
        const child = spawnEnemyInstance(
          state,
          tinyDef,
          enemy.x + Math.cos(angle) * 22,
          enemy.y + Math.sin(angle) * 22,
          childScale,
          1
        );
        child.hitFlashTimer = 0.08;
      }
      spawnParticles(state, enemy.x, enemy.y, '#93c5fd', 10, 140);
    }
  } else if (enemy.aiBehavior === 'bomber') {
    spawnEnemyBlastZone(state, enemy.x, enemy.y, 78, enemy.damage * 1.15, 0.72, '#fb923c');
  }

  if (enemy.isBoss) {
    // Boss always drops a treasure chest, a tactical gadget, a gold bag, and bonus gold
    state.pickups.push({
      uid: state.nextUid++,
      kind: 'chest',
      x: enemy.x,
      y: enemy.y,
      value: 1,
      magnetized: false,
      bobSeed: state.rng.range(0, Math.PI * 2),
    });
    state.pickups.push({
      uid: state.nextUid++,
      kind: rollRandomGadgetPickup(state),
      x: enemy.x - 24,
      y: enemy.y + 18,
      value: 1,
      magnetized: false,
      bobSeed: state.rng.range(0, Math.PI * 2),
    });
    state.pickups.push({
      uid: state.nextUid++,
      kind: 'gold_bag',
      x: enemy.x + 18,
      y: enemy.y - 12,
      value: Math.round(45 * stage.dropMult),
      magnetized: false,
      bobSeed: state.rng.range(0, Math.PI * 2),
    });
    for (let i = 0; i < 6; i++) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'gold',
        x: enemy.x + state.rng.range(-28, 28),
        y: enemy.y + state.rng.range(-28, 28),
        value: Math.round(10 * stage.dropMult),
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    }
    if (!state.endlessMode && state.elapsedSec >= stage.durationSec - 15) {
      state.phase = 'victory';
      state.events.push({ type: 'victory' });
    }
    return;
  }

  if (enemy.isElite) {
    state.pickups.push({
      uid: state.nextUid++,
      kind: 'chest',
      x: enemy.x,
      y: enemy.y,
      value: 1,
      magnetized: false,
      bobSeed: state.rng.range(0, Math.PI * 2),
    });
    state.pickups.push({
      uid: state.nextUid++,
      kind: 'gold_bag',
      x: enemy.x + state.rng.range(-20, 20),
      y: enemy.y + state.rng.range(-20, 20),
      value: Math.round(25 * stage.dropMult),
      magnetized: false,
      bobSeed: state.rng.range(0, Math.PI * 2),
    });
    if (state.rng.next() < 0.45) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: rollRandomGadgetPickup(state),
        x: enemy.x + state.rng.range(-24, 24),
        y: enemy.y + state.rng.range(-24, 24),
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (state.rng.next() < 0.35) {
      const bonusKinds = ['frenzy_elixir', 'ice_hourglass', 'holy_bell'] as const;
      const pickedKind = bonusKinds[state.rng.int(0, bonusKinds.length - 1)]!;
      state.pickups.push({
        uid: state.nextUid++,
        kind: pickedKind,
        x: enemy.x + state.rng.range(-26, 26),
        y: enemy.y + state.rng.range(-26, 26),
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    }
    return;
  }

  // Regular drops
  if (state.pickups.length < 360) {
    const roll = state.rng.next();
    if (roll < 0.008) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: rollRandomGadgetPickup(state),
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.012) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'magnet',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.018) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'meat',
        x: enemy.x,
        y: enemy.y,
        value: 25,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0235) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'frenzy_elixir',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0285) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'ice_hourglass',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0325) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'holy_bell',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0485) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'gold_bag',
        x: enemy.x,
        y: enemy.y,
        value: Math.round(18 * stage.dropMult),
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0485 + enemy.goldChance * stage.dropMult) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'gold',
        x: enemy.x,
        y: enemy.y,
        value: Math.round(3 * stage.dropMult),
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else {
      const xpKind =
        enemy.xpValue >= 10 ? 'xp_large' : enemy.xpValue >= 4 ? 'xp_medium' : 'xp_small';
      state.pickups.push({
        uid: state.nextUid++,
        kind: xpKind,
        x: enemy.x,
        y: enemy.y,
        value: enemy.xpValue,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    }
  }
}

function updateProjectiles(state: GameState, catalog: GameCatalog, dt: number): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i]!;
    p.life -= dt;
    p.spinAngle += dt * 11;

    if (p.behavior === 'enemy_orb') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dx = p.x - state.player.x;
      const dy = p.y - state.player.y;
      const rSum = p.radius + state.player.radius * 0.82;
      if (dx * dx + dy * dy <= rSum * rSum && state.player.invulnTimer <= 0) {
        damagePlayer(state, p.damage);
        state.projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0) {
        state.projectiles.splice(i, 1);
      }
      continue;
    }

    if (p.behavior === 'boomerang') {
      if (!p.returnPhase && p.life <= p.maxLife * 0.55) {
        p.returnPhase = true;
        p.hitIds.clear();
      }
      if (p.returnPhase) {
        const dx = state.player.x - p.x;
        const dy = state.player.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = Math.max(260, Math.hypot(p.vx, p.vy));
        p.vx += ((dx / len) * speed - p.vx) * Math.min(1, dt * 6);
        p.vy += ((dy / len) * speed - p.vy) * Math.min(1, dt * 6);
      }
    } else if (p.behavior === 'homing') {
      state.spatialHash.queryCircle(p.x, p.y, 260, hitBuf, 72);
      let target: EnemyEntity | null = null;
      let bestD2 = Infinity;
      for (let k = 0; k < hitBuf.length; k++) {
        const cand = state.enemies[hitBuf[k]!];
        if (!cand || cand.hp <= 0 || p.hitIds.has(cand.uid)) continue;
        const dx = cand.x - p.x;
        const dy = cand.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          target = cand;
        }
      }
      if (target) {
        const speed = Math.hypot(p.vx, p.vy) || 300;
        const desiredX = ((target.x - p.x) / (Math.sqrt(bestD2) || 1)) * speed;
        const desiredY = ((target.y - p.y) / (Math.sqrt(bestD2) || 1)) * speed;
        p.vx += (desiredX - p.vx) * Math.min(1, dt * 7);
        p.vy += (desiredY - p.vy) * Math.min(1, dt * 7);
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.behavior === 'lobbed') {
      state.spatialHash.queryCircle(p.x, p.y, 20, hitBuf, 16);
      const hitEnemy = hitBuf.some((idx) => {
        const cand = state.enemies[idx];
        return Boolean(cand && cand.hp > 0);
      });
      if (p.life <= 0 || hitEnemy) {
        const blastR = p.blastRadius ?? 72;
        state.zones.push({
          uid: state.nextUid++,
          weaponId: p.weaponId,
          kind: 'zone',
          x: p.x,
          y: p.y,
          radius: blastR,
          damage: p.damage,
          knockback: p.knockback,
          life: 0.34,
          maxLife: 0.34,
          tickInterval: 0.4,
          tickTimer: 0,
          color: p.color,
          accentColor: p.accentColor,
          hitOnce: true,
          applied: false,
        });
        spawnParticles(state, p.x, p.y, p.color, 12, 160);
        state.projectiles.splice(i, 1);
      }
      continue;
    }

    // Collision check via spatial hash
    const slot = state.weapons.find((w) => w.weaponId === p.weaponId);
    state.spatialHash.queryCircle(p.x, p.y, p.radius, hitBuf, 72);
    for (let k = 0; k < hitBuf.length; k++) {
      const enemy = state.enemies[hitBuf[k]!];
      if (!enemy || enemy.hp <= 0 || p.hitIds.has(enemy.uid)) continue;
      p.hitIds.add(enemy.uid);
      applyDamageToEnemy(state, enemy, p.damage, p.knockback, p.x, p.y, slot);
      p.pierce -= 1;

      if (p.splitOnHit && state.projectiles.length < 220) {
        p.splitOnHit = false;
        const baseA = Math.atan2(p.vy, p.vx);
        for (const offset of [-0.5, 0.5]) {
          const a = baseA + offset;
          state.projectiles.push({
            uid: state.nextUid++,
            weaponId: p.weaponId,
            behavior: 'shotgun',
            x: p.x,
            y: p.y,
            vx: Math.cos(a) * 320,
            vy: Math.sin(a) * 320,
            radius: Math.max(10, p.radius * 0.72),
            damage: p.damage * 0.6,
            pierce: 1,
            knockback: 20,
            life: 0.65,
            maxLife: 0.65,
            color: p.color,
            accentColor: p.accentColor,
            spinAngle: a,
            hitIds: new Set([enemy.uid]),
          });
        }
      }

      if (p.pierce <= 0) {
        break;
      }
    }

    // Also remove if far outside screen or expired
    if (p.life <= 0 || p.pierce <= 0) {
      state.projectiles.splice(i, 1);
    } else if (catalog.weapons[p.weaponId]?.behavior === 'boomerang' && p.returnPhase) {
      const d2 = (p.x - state.player.x) ** 2 + (p.y - state.player.y) ** 2;
      if (d2 < 24 * 24) {
        state.projectiles.splice(i, 1);
      }
    }
  }
}

function updateZones(state: GameState, dt: number): void {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i]!;
    z.life -= dt;

    if (z.kind === 'enemy_blast') {
      if (z.life <= 0) {
        const dx = state.player.x - z.x;
        const dy = state.player.y - z.y;
        const rSum = z.radius + state.player.radius * 0.7;
        if (dx * dx + dy * dy <= rSum * rSum) {
          damagePlayer(state, z.damage);
        }
        spawnParticles(state, z.x, z.y, z.color, 14, 190);
        state.zones.splice(i, 1);
      }
      continue;
    }

    if (z.kind === 'blackhole') {
      const dx = state.player.x - z.x;
      const dy = state.player.y - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      const outerPullR = z.radius * 1.35;
      if (dist <= outerPullR && dist > 20) {
        const pull = 92 + (1 - Math.min(1, dist / outerPullR)) * 58;
        state.player.x -= (dx / dist) * pull * dt;
        state.player.y -= (dy / dist) * pull * dt;
      }
      z.tickTimer -= dt;
      if (z.tickTimer <= 0) {
        z.tickTimer = z.tickInterval;
        spawnParticles(state, z.x, z.y, z.color, 6, 90);
        if (dist <= 64 + state.player.radius) {
          damagePlayer(state, z.damage);
        }
      }
      if (z.life <= 0) {
        state.zones.splice(i, 1);
      }
      continue;
    }

    if (z.kind === 'aura') {
      z.x = state.player.x;
      z.y = state.player.y;
    }

    const slot = state.weapons.find((w) => w.weaponId === z.weaponId);
    let shouldTick = false;
    if (z.hitOnce) {
      if (!z.applied) {
        z.applied = true;
        shouldTick = true;
      }
    } else {
      z.tickTimer -= dt;
      if (z.tickTimer <= 0) {
        z.tickTimer = z.tickInterval;
        shouldTick = true;
      }
    }

    if (shouldTick) {
      if (z.kind === 'beam' && z.x2 !== undefined && z.y2 !== undefined) {
        const minX = Math.min(z.x, z.x2);
        const maxX = Math.max(z.x, z.x2);
        const minY = Math.min(z.y, z.y2);
        const maxY = Math.max(z.y, z.y2);
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const halfDiag = Math.hypot(maxX - minX, maxY - minY) * 0.5 + z.radius;
        state.spatialHash.queryCircle(cx, cy, halfDiag, hitBuf, 72);
        for (let k = 0; k < hitBuf.length; k++) {
          const enemy = state.enemies[hitBuf[k]!];
          if (!enemy || enemy.hp <= 0) continue;
          const rSum = z.radius + enemy.radius;
          if (distToSegmentSq(enemy.x, enemy.y, z.x, z.y, z.x2, z.y2) <= rSum * rSum) {
            applyDamageToEnemy(state, enemy, z.damage, z.knockback, state.player.x, state.player.y, slot);
          }
        }
      } else {
        state.spatialHash.queryCircle(z.x, z.y, z.radius, hitBuf, 72);
        for (let k = 0; k < hitBuf.length; k++) {
          const enemy = state.enemies[hitBuf[k]!];
          if (!enemy || enemy.hp <= 0) continue;
          applyDamageToEnemy(state, enemy, z.damage, z.knockback, z.x, z.y, slot);
        }
      }
    }

    if (z.life <= 0) {
      state.zones.splice(i, 1);
    }
  }
}

function resolveTauntTarget(
  state: GameState,
  enemy: EnemyEntity
): { tx: number; ty: number; decoyActive: boolean } {
  if (!enemy.isBoss && state.deployables.length > 0) {
    let bestD2 = 390 * 390;
    let bestX = state.player.x;
    let bestY = state.player.y;
    let found = false;
    for (let i = 0; i < state.deployables.length; i++) {
      const d = state.deployables[i]!;
      if (d.kind !== 'decoy') continue;
      const dx = d.x - enemy.x;
      const dy = d.y - enemy.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestX = d.x;
        bestY = d.y;
        found = true;
      }
    }
    if (found) {
      return { tx: bestX, ty: bestY, decoyActive: true };
    }
  }
  return { tx: state.player.x, ty: state.player.y, decoyActive: false };
}

function updateEnemies(
  state: GameState,
  stage: StageDef,
  catalog: GameCatalog,
  dt: number
): void {
  const px = state.player.x;
  const py = state.player.y;
  const diff = getDifficultyProfile(state.difficulty);
  const bossCdMult = diff.bossCooldownMult;

  // Rebuild spatial hash
  state.spatialHash.clear();
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i]!;
    if (enemy.hp <= 0) {
      handleEnemyKilled(state, enemy, stage, catalog);
      state.enemies.splice(i, 1);
      continue;
    }
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    state.spatialHash.insert(i, e.x, e.y, e.radius);
  }

  const freezeFactor = state.freezeTimer > 0 ? 0.15 : 1;

  // Movement, behavior AI, soft separation, boss abilities, and contact damage
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.hitFlashTimer > 0) {
      e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
    }

    const { tx, ty } = resolveTauntTarget(state, e);
    const dx = tx - e.x;
    const dy = ty - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;
    const perpX = -dirY;
    const perpY = dirX;
    const playerDist = Math.hypot(px - e.x, py - e.y) || 1;

    let vx = dirX * e.speed * freezeFactor;
    let vy = dirY * e.speed * freezeFactor;

    if (e.isBoss) {
      e.bossShootTimer -= dt * freezeFactor;
      e.aiTimer -= dt * freezeFactor;

      if (e.aiBehavior === 'boss_alps_charge') {
        if (e.aiState === 'windup') {
          vx = 0;
          vy = 0;
          if (e.aiTimer <= 0) {
            e.aiState = 'dash';
            e.aiTimer = 0.65;
          }
        } else if (e.aiState === 'dash') {
          vx = e.chargeDirX * e.speed * 3.35 * freezeFactor;
          vy = e.chargeDirY * e.speed * 3.35 * freezeFactor;
          if (e.aiTimer <= 0) {
            e.aiState = 'move';
            e.aiTimer = 4.2 * bossCdMult;
            const aim = Math.atan2(py - e.y, px - e.x);
            for (let k = -2; k <= 2; k++) {
              const a = aim + k * 0.22;
              spawnEnemyOrb(
                state,
                e.x,
                e.y,
                Math.cos(a) * 235,
                Math.sin(a) * 235,
                e.damage * 0.72,
                9,
                '#38bdf8',
                '#e0f2fe'
              );
            }
          }
        } else {
          if (e.aiTimer <= 0 && playerDist < 430 && state.freezeTimer <= 0) {
            e.chargeDirX = (px - e.x) / playerDist;
            e.chargeDirY = (py - e.y) / playerDist;
            e.aiState = 'windup';
            e.aiTimer = 0.72;
          }
          if (e.bossShootTimer <= 0 && playerDist < 540 && state.freezeTimer <= 0) {
            e.bossShootTimer = 2.9 * bossCdMult;
            const baseA = Math.atan2(py - e.y, px - e.x);
            for (let b = 0; b < 8; b++) {
              const a = baseA + (Math.PI * 2 * b) / 8;
              spawnEnemyOrb(state, e.x, e.y, Math.cos(a) * 195, Math.sin(a) * 195, e.damage * 0.72, 10);
            }
          }
        }
      } else if (e.aiBehavior === 'boss_twin_merge') {
        if (!e.isMerged) {
          let nearestMate: EnemyEntity | null = null;
          let bestMateDist = 760;
          for (let j = 0; j < state.enemies.length; j++) {
            if (j === i) continue;
            const other = state.enemies[j]!;
            if (!other.isBoss || other.hp <= 0 || other.isMerged) continue;
            const md = Math.hypot(other.x - e.x, other.y - e.y);
            if (md < bestMateDist) {
              bestMateDist = md;
              nearestMate = other;
            }
          }
          if (nearestMate && bestMateDist > 1) {
            const mateBlend = e.hp < e.maxHp * 0.75 || bestMateDist < 320 ? 0.72 : 0.38;
            const mx = (nearestMate.x - e.x) / bestMateDist;
            const my = (nearestMate.y - e.y) / bestMateDist;
            const moveFactor = e.speed * freezeFactor;
            vx = (dirX * (1 - mateBlend) + mx * mateBlend) * moveFactor * 1.15;
            vy = (dirY * (1 - mateBlend) + my * mateBlend) * moveFactor * 1.15;
          }
        }
        if (e.bossShootTimer <= 0 && playerDist < 560 && state.freezeTimer <= 0) {
          e.bossShootTimer = (e.isMerged ? 2.15 : 2.9) * bossCdMult;
          const orbCount = e.isMerged ? 12 : 6;
          const baseA = Math.atan2(py - e.y, px - e.x) + (e.isMerged ? state.elapsedSec * 0.45 : 0);
          const spd = e.isMerged ? 235 : 195;
          for (let b = 0; b < orbCount; b++) {
            const a = baseA + (Math.PI * 2 * b) / orbCount;
            spawnEnemyOrb(
              state,
              e.x,
              e.y,
              Math.cos(a) * spd,
              Math.sin(a) * spd,
              e.damage * (e.isMerged ? 0.8 : 0.68),
              e.isMerged ? 11 : 9,
              e.isMerged ? '#fb923c' : '#ff5252',
              '#fef08a'
            );
          }
        }
      } else if (e.aiBehavior === 'boss_blink') {
        vx = (dirX * 0.8 + perpX * Math.sin(state.elapsedSec * 2 + e.wobbleSeed) * 0.5) * e.speed * freezeFactor;
        vy = (dirY * 0.8 + perpY * Math.sin(state.elapsedSec * 2 + e.wobbleSeed) * 0.5) * e.speed * freezeFactor;
        if (e.aiTimer <= 0 && state.freezeTimer <= 0) {
          spawnParticles(state, e.x, e.y, '#60a5fa', 16, 180);
          spawnEnemyBlastZone(state, e.x, e.y, 74, e.damage * 0.8, 0.8, '#60a5fa');
          const blinkAngle = state.rng.range(0, Math.PI * 2);
          const blinkDist = state.rng.range(185, 255);
          e.x = px + Math.cos(blinkAngle) * blinkDist;
          e.y = py + Math.sin(blinkAngle) * blinkDist;
          spawnParticles(state, e.x, e.y, '#93c5fd', 18, 210);
          state.floatingTexts.push({
            x: e.x,
            y: e.y - 36,
            vy: -34,
            text: '瞬移奇袭!',
            color: '#93c5fd',
            life: 0.9,
            maxLife: 0.9,
            scale: 1.15,
          });
          const aim = Math.atan2(py - e.y, px - e.x);
          for (let b = 0; b < 10; b++) {
            const a = aim + (Math.PI * 2 * b) / 10;
            spawnEnemyOrb(state, e.x, e.y, Math.cos(a) * 215, Math.sin(a) * 215, e.damage * 0.72, 9, '#60a5fa', '#e0f2fe');
          }
          e.aiTimer = 3.7 * bossCdMult;
        }
        if (e.bossShootTimer <= 0 && playerDist < 540 && state.freezeTimer <= 0) {
          e.bossShootTimer = 2.6 * bossCdMult;
          const aim = Math.atan2(py - e.y, px - e.x);
          for (let k = -1; k <= 1; k++) {
            const a = aim + k * 0.18;
            spawnEnemyOrb(state, e.x, e.y, Math.cos(a) * 265, Math.sin(a) * 265, e.damage * 0.75, 9, '#60a5fa', '#ffffff');
          }
        }
      } else if (e.aiBehavior === 'boss_blackhole') {
        if (playerDist < 195) {
          vx = -dirX * e.speed * 0.45 * freezeFactor + perpX * e.speed * 0.65 * freezeFactor;
          vy = -dirY * e.speed * 0.45 * freezeFactor + perpY * e.speed * 0.65 * freezeFactor;
        }
        if (e.aiTimer <= 0 && state.freezeTimer <= 0) {
          const bhX = px + (e.x - px) * 0.35 + state.rng.range(-40, 40);
          const bhY = py + (e.y - py) * 0.35 + state.rng.range(-40, 40);
          state.zones.push({
            uid: state.nextUid++,
            weaponId: 'boss_blackhole',
            kind: 'blackhole',
            x: bhX,
            y: bhY,
            radius: 255,
            damage: Math.max(8, Math.round(e.damage * 0.58)),
            knockback: 0,
            life: 4.3,
            maxLife: 4.3,
            tickInterval: 0.68,
            tickTimer: 0.35,
            color: '#a855f7',
            accentColor: '#e9d5ff',
          });
          state.floatingTexts.push({
            x: bhX,
            y: bhY - 26,
            vy: -28,
            text: '黑洞引力降临!',
            color: '#d8b4fe',
            life: 1.0,
            maxLife: 1.0,
            scale: 1.2,
          });
          e.aiTimer = 5.4 * bossCdMult;
        }
        if (e.bossShootTimer <= 0 && playerDist < 580 && state.freezeTimer <= 0) {
          e.bossShootTimer = 2.5 * bossCdMult;
          const baseA = Math.atan2(py - e.y, px - e.x) + state.elapsedSec * 0.6;
          for (let b = 0; b < 8; b++) {
            const a = baseA + (Math.PI * 2 * b) / 8;
            spawnEnemyOrb(state, e.x, e.y, Math.cos(a) * 195, Math.sin(a) * 195, e.damage * 0.72, 10, '#c084fc', '#faf5ff');
          }
        }
      } else {
        // boss_archangel & fallback bosses: cycles blackhole + blink + multi-ring judgment
        if (e.aiTimer <= 0 && state.freezeTimer <= 0) {
          if (e.aiState !== 'channel') {
            e.aiState = 'channel';
            state.zones.push({
              uid: state.nextUid++,
              weaponId: 'boss_archangel_bh',
              kind: 'blackhole',
              x: (px + e.x) * 0.5,
              y: (py + e.y) * 0.5,
              radius: 265,
              damage: Math.max(10, Math.round(e.damage * 0.62)),
              knockback: 0,
              life: 4.2,
              maxLife: 4.2,
              tickInterval: 0.65,
              tickTimer: 0.35,
              color: '#a855f7',
              accentColor: '#fde047',
            });
            state.floatingTexts.push({
              x: e.x,
              y: e.y - 44,
              vy: -30,
              text: '审判黑洞!',
              color: '#fde047',
              life: 1.05,
              maxLife: 1.05,
              scale: 1.25,
            });
          } else {
            e.aiState = 'move';
            const blinkAngle = state.rng.range(0, Math.PI * 2);
            const blinkDist = state.rng.range(195, 270);
            e.x = px + Math.cos(blinkAngle) * blinkDist;
            e.y = py + Math.sin(blinkAngle) * blinkDist;
            spawnParticles(state, e.x, e.y, '#fde047', 22, 230);
            for (let k = 0; k < 2; k++) {
              const offsetA = state.rng.range(0, Math.PI * 2);
              spawnEnemyBlastZone(
                state,
                px + Math.cos(offsetA) * 65,
                py + Math.sin(offsetA) * 65,
                80,
                e.damage * 0.85,
                0.85,
                '#facc15'
              );
            }
          }
          e.aiTimer = 4.3 * bossCdMult;
        }
        if (e.bossShootTimer <= 0 && playerDist < 620 && state.freezeTimer <= 0) {
          e.bossShootTimer = 2.4 * bossCdMult;
          const orbCount = 10;
          const baseA = Math.atan2(py - e.y, px - e.x);
          for (let b = 0; b < orbCount; b++) {
            const a = baseA + (Math.PI * 2 * b) / orbCount;
            spawnEnemyOrb(state, e.x, e.y, Math.cos(a) * 215, Math.sin(a) * 215, e.damage * 0.76, 10);
          }
        }
      }
    } else {
      // Regular enemy distinct behaviors (only move dynamically when not deeply frozen)
      if (e.aiBehavior === 'skirmisher') {
        const weave = Math.sin(state.elapsedSec * 2.6 + e.wobbleSeed) * 0.78;
        vx = (dirX * 0.68 + perpX * weave) * e.speed * freezeFactor;
        vy = (dirY * 0.68 + perpY * weave) * e.speed * freezeFactor;
      } else if (e.aiBehavior === 'ranged') {
        const kiteDir = dist > 280 ? 0.86 : dist < 180 ? -0.68 : 0.12;
        const strafeDir = Math.sin(state.elapsedSec * 1.7 + e.wobbleSeed) * 0.62;
        vx = (dirX * kiteDir + perpX * strafeDir) * e.speed * freezeFactor;
        vy = (dirY * kiteDir + perpY * strafeDir) * e.speed * freezeFactor;
        e.aiTimer -= dt * freezeFactor;
        if (e.aiTimer <= 0 && playerDist < 480 && state.freezeTimer <= 0) {
          e.aiTimer = (e.isElite ? 1.85 : 2.5) / Math.max(1, diff.speedMult * 0.9);
          const aim = Math.atan2(py - e.y, px - e.x);
          if (e.isElite) {
            for (let k = -1; k <= 1; k++) {
              const a = aim + k * 0.24;
              spawnEnemyOrb(state, e.x, e.y, Math.cos(a) * 225, Math.sin(a) * 225, e.damage * 0.75, 8, '#f43f5e', '#fef08a', 2.8);
            }
          } else {
            spawnEnemyOrb(state, e.x, e.y, Math.cos(aim) * 215, Math.sin(aim) * 215, e.damage * 0.72, 7, '#fb923c', '#fef3c7', 2.7);
          }
        }
      } else if (e.aiBehavior === 'charger') {
        e.aiTimer -= dt * freezeFactor;
        if (e.aiState === 'windup') {
          vx = 0;
          vy = 0;
          if (e.aiTimer <= 0) {
            e.aiState = 'dash';
            e.aiTimer = 0.56;
          }
        } else if (e.aiState === 'dash') {
          vx = e.chargeDirX * e.speed * 3.1 * freezeFactor;
          vy = e.chargeDirY * e.speed * 3.1 * freezeFactor;
          if (e.aiTimer <= 0) {
            e.aiState = 'move';
            e.aiTimer = 2.6;
          }
        } else if (dist < 260 && e.aiTimer <= 0 && state.freezeTimer <= 0) {
          e.chargeDirX = dirX;
          e.chargeDirY = dirY;
          e.aiState = 'windup';
          e.aiTimer = 0.62;
          vx = 0;
          vy = 0;
        }
      } else if (e.aiBehavior === 'bomber') {
        vx = dirX * e.speed * 1.12 * freezeFactor;
        vy = dirY * e.speed * 1.12 * freezeFactor;
        e.aiTimer -= dt * freezeFactor;
        if (playerDist <= 82 && e.aiTimer <= 0 && state.freezeTimer <= 0) {
          spawnEnemyBlastZone(state, px, py, 82, e.damage * 1.15, 0.85, '#fb923c');
          e.aiTimer = 3.2;
        }
      }
    }

    // Soft enemy-to-enemy separation so hordes don't stack on 1 pixel
    state.spatialHash.queryCircle(e.x, e.y, e.radius * 0.9, sepBuf, 48);
    let pushX = 0;
    let pushY = 0;
    for (let k = 0; k < sepBuf.length; k++) {
      const otherIdx = sepBuf[k]!;
      if (otherIdx === i) continue;
      const other = state.enemies[otherIdx]!;
      const sx = e.x - other.x;
      const sy = e.y - other.y;
      const d2 = sx * sx + sy * sy;
      const minD = (e.radius + other.radius) * 0.85;
      if (d2 > 0.001 && d2 < minD * minD) {
        const d = Math.sqrt(d2);
        const force = (minD - d) / minD;
        pushX += (sx / d) * force * 85;
        pushY += (sy / d) * force * 85;
      }
    }

    vx += pushX + e.knockbackVx;
    vy += pushY + e.knockbackVy;
    e.knockbackVx *= Math.max(0, 1 - dt * 10);
    e.knockbackVy *= Math.max(0, 1 - dt * 10);

    e.vx = vx;
    e.vy = vy;
    e.x += vx * dt;
    e.y += vy * dt;

    // Despawn very distant regular enemies & recycle near perimeter so waves stay dense
    if (!e.isBoss && !e.isElite && playerDist > 1100) {
      const angle = state.rng.range(0, Math.PI * 2);
      e.x = px + Math.cos(angle) * 580;
      e.y = py + Math.sin(angle) * 580;
      continue;
    }

    // Player contact damage
    const hitDist = e.radius + state.player.radius * 0.78;
    if (playerDist <= hitDist && state.player.invulnTimer <= 0) {
      damagePlayer(state, e.damage);
    }
  }

  // Boss twin-merge resolution pass (runs cleanly outside movement loop)
  if (state.freezeTimer <= 0) {
    for (let i = 0; i < state.enemies.length; i++) {
      const a = state.enemies[i]!;
      if (!a.isBoss || a.hp <= 0 || a.isMerged || a.aiBehavior !== 'boss_twin_merge') continue;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        if (j === i) continue;
        const b = state.enemies[j]!;
        if (!b.isBoss || b.hp <= 0 || b.isMerged) continue;
        const mergeDist = a.radius + b.radius + 54;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy <= mergeDist * mergeDist) {
          a.isMerged = true;
          a.scaleMult = 1.48;
          a.radius = Math.round(a.radius * 1.38);
          a.maxHp = Math.round((a.maxHp + b.maxHp) * 0.9);
          a.hp = Math.min(a.maxHp, Math.round(a.hp + b.hp * 0.8 + a.maxHp * 0.22));
          a.damage = Math.round(a.damage * 1.32);
          a.speed = Math.round(a.speed * 1.15);
          a.xpValue += b.xpValue;
          a.bossShootTimer = 0.6;
          spawnParticles(state, a.x, a.y, '#ffd84d', 30, 260);
          state.floatingTexts.push({
            x: a.x,
            y: a.y - 48,
            vy: -32,
            text: '合体进化! 双星狂化!',
            color: '#ffd84d',
            life: 1.5,
            maxLife: 1.5,
            scale: 1.35,
          });
          state.events.push({ type: 'boss_merge', intensity: 1 });
          state.enemies.splice(j, 1);
          if (j < i) i -= 1;
          break;
        }
      }
    }
  }

  // Re-index spatial hash after movement for accurate weapon/projectile queries
  state.spatialHash.clear();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    state.spatialHash.insert(i, e.x, e.y, e.radius);
  }
}

function updateDeployables(state: GameState, dt: number): void {
  for (let i = state.deployables.length - 1; i >= 0; i--) {
    const d = state.deployables[i]!;
    d.life -= dt;
    d.actionTimer -= dt;

    if (d.kind === 'turret' && d.actionTimer <= 0) {
      d.actionTimer = 0.32;
      let target: EnemyEntity | null = null;
      let bestD2 = 460 * 460;
      for (let k = 0; k < state.enemies.length; k++) {
        const e = state.enemies[k]!;
        if (e.hp <= 0) continue;
        const edx = e.x - d.x;
        const edy = e.y - d.y;
        const d2 = edx * edx + edy * edy;
        if (d2 < bestD2) {
          bestD2 = d2;
          target = e;
        }
      }
      if (target) {
        const len = Math.sqrt(bestD2) || 1;
        const speed = 580;
        const vx = ((target.x - d.x) / len) * speed;
        const vy = ((target.y - d.y) / len) * speed;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: 'gadget-turret',
          behavior: 'shotgun',
          x: d.x,
          y: d.y,
          vx,
          vy,
          radius: 11,
          damage: 52 * state.player.might,
          pierce: 3,
          knockback: 85,
          life: 1.0,
          maxLife: 1.0,
          color: '#34d399',
          accentColor: '#fef3c7',
          spriteId: 'wpn-icon-heart-star',
          spinAngle: Math.atan2(vy, vx),
          hitIds: new Set<number>(),
        });
      }
    } else if (d.kind === 'decoy' && d.actionTimer <= 0) {
      d.actionTimer = 0.8;
      spawnParticles(state, d.x, d.y, '#f472b6', 6, 85);
    }

    if (d.life <= 0) {
      if (d.kind === 'decoy') {
        const radius = 190 * state.player.area;
        const r2 = radius * radius;
        const primarySlot = state.weapons[0];
        for (const e of state.enemies) {
          if (e.hp <= 0) continue;
          const dx = e.x - d.x;
          const dy = e.y - d.y;
          if (dx * dx + dy * dy <= (radius + e.radius) ** 2 && dx * dx + dy * dy <= r2 * 1.3) {
            applyDamageToEnemy(state, e, 185 * state.player.might, 260, d.x, d.y, primarySlot);
          }
        }
        state.zones.push({
          uid: state.nextUid++,
          weaponId: 'gadget-decoy',
          kind: 'aura',
          x: d.x,
          y: d.y,
          radius,
          damage: 0,
          knockback: 0,
          life: 0.42,
          maxLife: 0.42,
          tickInterval: 0.5,
          tickTimer: 0,
          color: '#f472b6',
          accentColor: '#fef3c7',
          hitOnce: true,
          applied: true,
        });
        spawnParticles(state, d.x, d.y, '#f472b6', 20, 220);
        state.floatingTexts.push({
          x: d.x,
          y: d.y - 26,
          vy: -36,
          text: '傀儡圣爆!',
          color: '#f472b6',
          life: 0.9,
          maxLife: 0.9,
          scale: 1.15,
        });
      }
      state.deployables.splice(i, 1);
    }
  }
}

function updatePickups(state: GameState, catalog: GameCatalog, dt: number): void {
  const px = state.player.x;
  const py = state.player.y;
  const magnetR2 = state.player.magnetRadius * state.player.magnetRadius;
  const superMagnet = state.player.activeMagnetTimer > 0;

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i]!;
    const dx = px - p.x;
    const dy = py - p.y;
    const d2 = dx * dx + dy * dy;

    if ((superMagnet || d2 <= magnetR2) && (superMagnet || p.kind !== 'chest')) {
      p.magnetized = true;
    }

    if (p.magnetized) {
      const d = Math.sqrt(d2) || 1;
      const pullSpeed = superMagnet ? 640 : 420;
      p.x += (dx / d) * pullSpeed * dt;
      p.y += (dy / d) * pullSpeed * dt;
    }

    if (d2 <= 26 * 26) {
      state.pickups.splice(i, 1);
      const gadgetId = pickupKindToGadgetId(p.kind);
      if (gadgetId) {
        if (state.player.heldGadgets.length >= 3) {
          state.player.heldGadgets.shift();
        }
        state.player.heldGadgets.push(gadgetId);
        const def = catalog.gadgets[gadgetId];
        spawnParticles(state, px, py, def?.color ?? '#60a5fa', 12, 150);
        state.floatingTexts.push({
          x: px,
          y: py - 34,
          vy: -38,
          text: `拾取主动道具: ${def?.name ?? gadgetId}`,
          color: def?.accentColor ?? '#e0f2fe',
          life: 1.1,
          maxLife: 1.1,
          scale: 1.15,
        });
        state.events.push({ type: 'gadget_pickup' });
        continue;
      }

      switch (p.kind) {
        case 'xp_small':
        case 'xp_medium':
        case 'xp_large':
          state.player.xp += p.value;
          state.events.push({ type: 'pickup_xp' });
          break;
        case 'gold': {
          const gained = Math.max(1, Math.round(p.value * state.player.greed));
          state.goldEarned += gained;
          state.events.push({ type: 'pickup_gold' });
          break;
        }
        case 'gold_bag': {
          const gained = Math.max(5, Math.round(p.value * state.player.greed));
          state.goldEarned += gained;
          state.floatingTexts.push({
            x: px,
            y: py - 32,
            vy: -42,
            text: `+${gained} 金袋`,
            color: '#ffd84d',
            life: 0.95,
            maxLife: 0.95,
            scale: 1.15,
          });
          state.events.push({ type: 'pickup_gold' });
          break;
        }
        case 'meat':
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + p.value);
          state.events.push({ type: 'pickup_xp' });
          break;
        case 'magnet':
          for (const other of state.pickups) {
            if (other.kind !== 'chest') {
              other.magnetized = true;
            }
          }
          state.events.push({ type: 'pickup_xp' });
          break;
        case 'frenzy_elixir':
          state.player.frenzyTimer = Math.max(state.player.frenzyTimer, 6.5);
          spawnParticles(state, px, py, '#ff6b6b', 16, 170);
          state.floatingTexts.push({
            x: px,
            y: py - 34,
            vy: -40,
            text: '狂欢圣油：火力全开!',
            color: '#ff6b6b',
            life: 1.1,
            maxLife: 1.1,
            scale: 1.2,
          });
          state.events.push({ type: 'pickup_buff' });
          break;
        case 'ice_hourglass':
          state.freezeTimer = Math.max(state.freezeTimer, 4.0);
          state.player.skillCooldownTimer = Math.max(
            0,
            state.player.skillCooldownTimer - state.player.skillMaxCooldown * 0.4
          );
          spawnParticles(state, px, py, '#70a1ff', 18, 180);
          state.floatingTexts.push({
            x: px,
            y: py - 34,
            vy: -40,
            text: '凝时沙漏：冰封全场!',
            color: '#70a1ff',
            life: 1.1,
            maxLife: 1.1,
            scale: 1.2,
          });
          state.events.push({ type: 'pickup_buff' });
          break;
        case 'holy_bell': {
          const blastDmg = 220 * state.player.might;
          const r2 = 640 * 640;
          const primarySlot = state.weapons[0];
          for (const enemy of state.enemies) {
            if (enemy.hp <= 0) continue;
            const edx = enemy.x - px;
            const edy = enemy.y - py;
            if (edx * edx + edy * edy <= r2) {
              applyDamageToEnemy(state, enemy, blastDmg, 240, px, py, primarySlot);
            }
          }
          state.projectiles = state.projectiles.filter((pr) => pr.behavior !== 'enemy_orb');
          state.zones.push({
            uid: state.nextUid++,
            weaponId: 'pickup_holy_bell',
            kind: 'aura',
            x: px,
            y: py,
            radius: 520,
            damage: 0,
            knockback: 0,
            life: 0.48,
            maxLife: 0.48,
            tickInterval: 0.5,
            tickTimer: 0,
            color: '#fde047',
            accentColor: '#ffffff',
            hitOnce: true,
            applied: true,
          });
          spawnParticles(state, px, py, '#fde047', 28, 260);
          state.shakeTimer = 0.35;
          state.shakeIntensity = 9;
          state.floatingTexts.push({
            x: px,
            y: py - 36,
            vy: -44,
            text: '净世金钟：万邪俱灭!',
            color: '#fde047',
            life: 1.15,
            maxLife: 1.15,
            scale: 1.3,
          });
          state.events.push({ type: 'bomb_blast' });
          break;
        }
        case 'chest': {
          const reward = rollChestReward(state, catalog);
          state.goldEarned += reward.bonusGold;
          state.pendingChest = reward;
          state.phase = 'chest';
          state.events.push({ type: 'pickup_chest' });
          return;
        }
      }
    }
  }

  // Check level-up thresholds
  while (state.player.xp >= state.player.nextXp) {
    state.player.xp -= state.player.nextXp;
    state.player.level += 1;
    state.player.nextXp = xpRequiredForLevel(state.player.level);
    state.pendingLevelUps += 1;
  }

  if (state.pendingLevelUps > 0 && state.phase === 'playing') {
    state.levelUpChoices = rollLevelUpChoices(state, catalog, 3);
    state.phase = 'levelup';
    state.events.push({ type: 'levelup' });
  }
}

function updateVisualFX(state: GameState, dt: number): void {
  if (state.bannerAlert) {
    state.bannerAlert.timer -= dt;
    if (state.bannerAlert.timer <= 0) {
      state.bannerAlert = null;
    }
  }
  if (state.shakeTimer > 0) {
    state.shakeTimer = Math.max(0, state.shakeTimer - dt);
  }
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i]!;
    ft.life -= dt;
    ft.y += ft.vy * dt;
    if (ft.life <= 0) state.floatingTexts.splice(i, 1);
  }
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i]!;
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

/** Trigger the equipped character's Active Skill if off cooldown. Returns true if cast. */
export function triggerActiveSkill(state: GameState, catalog: GameCatalog): boolean {
  if (state.phase !== 'playing' || state.player.skillCooldownTimer > 0) {
    return false;
  }
  const char = catalog.characters[state.characterId];
  if (!char) return false;
  const skill = char.activeSkill;
  const maxCd = Math.max(3.5, skill.cooldownSec * state.player.cooldown);
  state.player.skillMaxCooldown = maxCd;
  state.player.skillCooldownTimer = maxCd;

  const px = state.player.x;
  const py = state.player.y;
  const might = state.player.might;
  const area = state.player.area;
  const primarySlot = state.weapons[0];

  switch (skill.id) {
    case 'skill-roar-nova': {
      const radius = 260 * area;
      const r2 = radius * radius;
      state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.2);
      state.projectiles = state.projectiles.filter((pr) => {
        if (pr.behavior !== 'enemy_orb') return true;
        const dx = pr.x - px;
        const dy = pr.y - py;
        return dx * dx + dy * dy > r2 * 1.3;
      });
      const dmg = 140 * might;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        const dx = enemy.x - px;
        const dy = enemy.y - py;
        if (dx * dx + dy * dy <= (radius + enemy.radius) ** 2) {
          applyDamageToEnemy(state, enemy, dmg, 360, px, py, primarySlot);
        }
      }
      state.zones.push({
        uid: state.nextUid++,
        weaponId: skill.id,
        kind: 'aura',
        x: px,
        y: py,
        radius,
        damage: 0,
        knockback: 0,
        life: 0.45,
        maxLife: 0.45,
        tickInterval: 0.5,
        tickTimer: 0,
        color: skill.color,
        accentColor: skill.accentColor,
        hitOnce: true,
        applied: true,
      });
      spawnParticles(state, px, py, skill.color, 28, 250);
      state.shakeTimer = 0.35;
      state.shakeIntensity = 9;
      break;
    }

    case 'skill-blazing-dash': {
      const fx = state.player.facingX || 1;
      const fy = state.player.facingY || 0;
      const norm = Math.hypot(fx, fy) || 1;
      const nx = fx / norm;
      const ny = fy / norm;
      const dashDist = 210;

      for (let step = 0; step < 3; step++) {
        const zx = px + nx * (dashDist * (step / 2));
        const zy = py + ny * (dashDist * (step / 2));
        state.zones.push({
          uid: state.nextUid++,
          weaponId: skill.id,
          kind: 'zone',
          x: zx,
          y: zy,
          radius: 76 * area,
          damage: 34 * might,
          knockback: 45,
          life: 3.2,
          maxLife: 3.2,
          tickInterval: 0.36,
          tickTimer: 0,
          color: skill.color,
          accentColor: skill.accentColor,
          hitOnce: false,
        });
      }

      state.player.x += nx * dashDist;
      state.player.y += ny * dashDist;
      state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.0);
      state.player.skillBuffTimer = Math.max(state.player.skillBuffTimer, 3.5);

      const landX = state.player.x;
      const landY = state.player.y;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: skill.id,
          behavior: 'shotgun',
          x: landX,
          y: landY,
          vx: Math.cos(a) * 500,
          vy: Math.sin(a) * 500,
          radius: 20,
          damage: 78 * might,
          pierce: 6,
          knockback: 140,
          life: 0.85,
          maxLife: 0.85,
          color: skill.color,
          accentColor: skill.accentColor,
          spriteId: 'emote-double-v',
          spinAngle: a,
          hitIds: new Set<number>(),
        });
      }
      spawnParticles(state, landX, landY, skill.color, 26, 220);
      state.shakeTimer = 0.24;
      state.shakeIntensity = 6;
      break;
    }

    case 'skill-golden-feast': {
      const heal = Math.max(12, Math.round(state.player.maxHp * 0.3));
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
      for (const p of state.pickups) {
        if (p.kind !== 'chest') {
          p.magnetized = true;
        }
      }
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        const tx = px + Math.cos(a) * 165;
        const ty = py + Math.sin(a) * 165;
        const flightTime = 0.38;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: skill.id,
          behavior: 'lobbed',
          x: px,
          y: py,
          vx: (tx - px) / flightTime,
          vy: (ty - py) / flightTime,
          radius: 18,
          blastRadius: 115 * area,
          damage: 115 * might,
          pierce: 1,
          knockback: 210,
          life: flightTime,
          maxLife: flightTime,
          color: skill.color,
          accentColor: skill.accentColor,
          spriteId: 'pickup-chest',
          spinAngle: 0,
          hitIds: new Set<number>(),
        });
      }
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'gold_bag',
        x: px + 26,
        y: py - 18,
        value: 15,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
      spawnParticles(state, px, py, '#ffd86b', 24, 210);
      break;
    }

    case 'skill-fox-illusion': {
      state.player.skillBuffTimer = Math.max(state.player.skillBuffTimer, 4.5);
      state.player.invulnTimer = Math.max(state.player.invulnTimer, 1.2);
      for (const slot of state.weapons) {
        slot.cooldownTimer = Math.min(slot.cooldownTimer, 0.08);
      }
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: skill.id,
          behavior: 'homing',
          x: px,
          y: py,
          vx: Math.cos(a) * 420,
          vy: Math.sin(a) * 420,
          radius: 18,
          damage: 65 * might,
          pierce: 2,
          knockback: 75,
          life: 2.2,
          maxLife: 2.2,
          color: skill.color,
          accentColor: skill.accentColor,
          spriteId: 'wpn-icon-heart-star',
          spinAngle: 0,
          hitIds: new Set<number>(),
          splitOnHit: true,
        });
      }
      spawnParticles(state, px, py, skill.color, 26, 220);
      break;
    }

    case 'skill-starfall-judgment': {
      state.freezeTimer = Math.max(state.freezeTimer, 3.0);
      const candidates = state.enemies
        .filter((e) => e.hp > 0 && Math.hypot(e.x - px, e.y - py) <= 640)
        .sort((a, b) => b.hp - a.hp)
        .slice(0, 10);

      const strikeTargets: Array<{ x: number; y: number }> =
        candidates.length > 0
          ? candidates.map((e) => ({ x: e.x, y: e.y }))
          : Array.from({ length: 6 }, (_, i) => {
              const a = (Math.PI * 2 * i) / 6;
              return { x: px + Math.cos(a) * 165, y: py + Math.sin(a) * 165 };
            });

      const pillarRadius = 82 * area;
      const dmg = 180 * might;
      for (const pt of strikeTargets) {
        for (const enemy of state.enemies) {
          if (enemy.hp <= 0) continue;
          const dx = enemy.x - pt.x;
          const dy = enemy.y - pt.y;
          if (dx * dx + dy * dy <= (pillarRadius + enemy.radius) ** 2) {
            applyDamageToEnemy(state, enemy, dmg, 180, pt.x, pt.y, primarySlot);
          }
        }
        state.zones.push({
          uid: state.nextUid++,
          weaponId: skill.id,
          kind: 'lightning',
          x: pt.x,
          y: pt.y,
          radius: pillarRadius,
          damage: 0,
          knockback: 0,
          life: 0.45,
          maxLife: 0.45,
          tickInterval: 0.5,
          tickTimer: 0,
          color: skill.color,
          accentColor: skill.accentColor,
          hitOnce: true,
          applied: true,
        });
      }
      spawnParticles(state, px, py, skill.color, 28, 240);
      state.shakeTimer = 0.3;
      state.shakeIntensity = 8;
      break;
    }
  }

  state.floatingTexts.push({
    x: state.player.x,
    y: state.player.y - 42,
    vy: -38,
    text: `${skill.name}!`,
    color: skill.accentColor,
    life: 1.05,
    maxLife: 1.05,
    scale: 1.28,
  });
  state.events.push({ type: 'skill_cast' });
  return true;
}

/** Activate the next queued pickable Tactical Gadget in the player's belt. */
export function triggerActiveGadget(state: GameState, catalog: GameCatalog): boolean {
  if (state.phase !== 'playing' || state.player.heldGadgets.length === 0) {
    return false;
  }
  const gadgetId = state.player.heldGadgets.shift()!;
  const def = catalog.gadgets[gadgetId];
  const px = state.player.x;
  const py = state.player.y;

  switch (gadgetId) {
    case 'gadget-magnet': {
      state.player.activeMagnetTimer = 8.0;
      for (const other of state.pickups) {
        other.magnetized = true;
      }
      state.zones.push({
        uid: state.nextUid++,
        weaponId: gadgetId,
        kind: 'aura',
        x: px,
        y: py,
        radius: 170,
        damage: 0,
        knockback: 0,
        life: 0.45,
        maxLife: 0.45,
        tickInterval: 0.5,
        tickTimer: 0,
        color: def.color,
        accentColor: def.accentColor,
        hitOnce: true,
        applied: true,
      });
      spawnParticles(state, px, py, def.color, 22, 220);
      break;
    }
    case 'gadget-shield': {
      state.player.shieldCharges = 3;
      state.player.shieldTimer = 8.0;
      spawnParticles(state, px, py, def.color, 20, 190);
      break;
    }
    case 'gadget-decoy': {
      state.deployables.push({
        uid: state.nextUid++,
        kind: 'decoy',
        x: px,
        y: py,
        radius: 26,
        life: 7.0,
        maxLife: 7.0,
        actionTimer: 0.45,
        spriteId: def.spriteId,
        color: def.color,
      });
      spawnParticles(state, px, py, def.color, 18, 170);
      break;
    }
    case 'gadget-turret': {
      state.deployables.push({
        uid: state.nextUid++,
        kind: 'turret',
        x: px + (state.player.facingX || 1) * 32,
        y: py + (state.player.facingY || 0) * 32,
        radius: 22,
        life: 9.0,
        maxLife: 9.0,
        actionTimer: 0.08,
        spriteId: def.spriteId,
        color: def.color,
      });
      spawnParticles(state, px, py, def.color, 18, 170);
      break;
    }
  }

  state.floatingTexts.push({
    x: px,
    y: py - 42,
    vy: -40,
    text: `${def.name} 激活!`,
    color: def.accentColor,
    life: 1.05,
    maxLife: 1.05,
    scale: 1.24,
  });
  state.events.push({ type: 'gadget_use' });
  return true;
}

/** Advance fixed-timestep simulation by `dt` seconds. */
export function stepSimulation(
  state: GameState,
  input: InputVector,
  stage: StageDef,
  catalog: GameCatalog,
  dt: number
): void {
  if (state.phase !== 'playing') {
    return;
  }

  state.elapsedSec += dt;

  // Player regeneration, invulnerability, active skill, gadget & buff timers
  if (state.player.invulnTimer > 0) {
    state.player.invulnTimer = Math.max(0, state.player.invulnTimer - dt);
  }
  if (state.player.skillCooldownTimer > 0) {
    state.player.skillCooldownTimer = Math.max(0, state.player.skillCooldownTimer - dt);
  }
  if (state.player.skillBuffTimer > 0) {
    state.player.skillBuffTimer = Math.max(0, state.player.skillBuffTimer - dt);
  }
  if (state.player.frenzyTimer > 0) {
    state.player.frenzyTimer = Math.max(0, state.player.frenzyTimer - dt);
  }
  if (state.player.activeMagnetTimer > 0) {
    state.player.activeMagnetTimer = Math.max(0, state.player.activeMagnetTimer - dt);
  }
  if (state.player.shieldTimer > 0) {
    state.player.shieldTimer = Math.max(0, state.player.shieldTimer - dt);
    if (state.player.shieldTimer <= 0) {
      state.player.shieldCharges = 0;
    }
  }
  if (state.freezeTimer > 0) {
    state.freezeTimer = Math.max(0, state.freezeTimer - dt);
  }
  if (state.player.regen > 0 && state.player.hp < state.player.maxHp) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.regen * dt);
  }

  // Periodic tactical supply gadget spawn nearby so players encounter active items regularly
  state.gadgetSpawnTimer -= dt;
  if (state.gadgetSpawnTimer <= 0 && state.pickups.length < 380) {
    state.gadgetSpawnTimer = state.rng.range(26, 36);
    const angle = state.rng.range(0, Math.PI * 2);
    const dist = state.rng.range(135, 210);
    state.pickups.push({
      uid: state.nextUid++,
      kind: rollRandomGadgetPickup(state),
      x: state.player.x + Math.cos(angle) * dist,
      y: state.player.y + Math.sin(angle) * dist,
      value: 1,
      magnetized: false,
      bobSeed: state.rng.range(0, Math.PI * 2),
    });
  }

  // Player movement
  const speedBoost =
    (state.player.skillBuffTimer > 0 ? 1.32 : 1) * (state.player.frenzyTimer > 0 ? 1.2 : 1);
  const effectiveSpeed = state.player.moveSpeed * speedBoost;
  const mag = Math.hypot(input.x, input.y);
  if (mag > 0.01) {
    const nx = input.x / Math.max(1, mag);
    const ny = input.y / Math.max(1, mag);
    state.player.vx = nx * effectiveSpeed;
    state.player.vy = ny * effectiveSpeed;
    state.player.facingX = nx;
    state.player.facingY = ny;
    state.player.walkPhase += dt * 11;
  } else {
    state.player.vx = 0;
    state.player.vy = 0;
  }
  state.player.x += state.player.vx * dt;
  state.player.y += state.player.vy * dt;

  // Enemies, spatial hash, wave director, weapons, projectiles, zones, deployables, pickups
  updateWaveDirector(state, stage, catalog, dt);
  updateEnemies(state, stage, catalog, dt);

  if (state.player.hp <= 0) {
    if (state.player.revivalsLeft > 0) {
      state.player.revivalsLeft -= 1;
      state.player.hp = Math.round(state.player.maxHp * 0.65);
      state.player.invulnTimer = 2.0;
      state.events.push({ type: 'revive' });
      spawnParticles(state, state.player.x, state.player.y, '#f4c542', 26, 220);
    } else {
      state.player.hp = 0;
      state.phase = 'gameover';
      state.events.push({ type: 'gameover' });
      return;
    }
  }

  updateWeapons(state, catalog, dt);
  updateDeployables(state, dt);
  updateProjectiles(state, catalog, dt);
  updateZones(state, dt);

  // Sweep enemies killed by weapons/zones/deployables this frame immediately
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i]!;
    if (enemy.hp <= 0) {
      handleEnemyKilled(state, enemy, stage, catalog);
      state.enemies.splice(i, 1);
    }
  }

  if (state.phase === 'playing') {
    updatePickups(state, catalog, dt);
  }

  updateVisualFX(state, dt);
}

/** Resolve user choice from level-up or chest modal and resume play if queue is empty. */
export function selectUpgradeAndResume(
  state: GameState,
  choice: UpgradeChoice,
  catalog: GameCatalog
): void {
  applyUpgradeChoice(state, choice, catalog);

  if (state.phase === 'chest') {
    state.pendingChest = null;
    if (state.pendingLevelUps > 0) {
      state.levelUpChoices = rollLevelUpChoices(state, catalog, 3);
      state.phase = 'levelup';
    } else {
      state.phase = 'playing';
    }
    return;
  }

  if (state.phase === 'levelup') {
    state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
    if (state.pendingLevelUps > 0) {
      state.levelUpChoices = rollLevelUpChoices(state, catalog, 3);
    } else {
      state.levelUpChoices = [];
      state.phase = 'playing';
    }
  }
}
