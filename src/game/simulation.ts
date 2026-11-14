import type { GameCatalog, StageDef } from '../data/types.ts';
import { xpRequiredForLevel, type EnemyEntity, type GameState, type UpgradeChoice } from './state.ts';
import { applyUpgradeChoice, rollChestReward, rollLevelUpChoices } from './upgradeSystem.ts';
import { updateWaveDirector } from './waveDirector.ts';
import { applyDamageToEnemy, updateWeapons } from './weapons.ts';

export interface InputVector {
  x: number;
  y: number;
}

const sepBuf: number[] = [];
const hitBuf: number[] = [];

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

function handleEnemyKilled(state: GameState, enemy: EnemyEntity, stage: StageDef): void {
  state.kills += 1;
  state.events.push({ type: 'kill', intensity: enemy.isBoss ? 1 : 0.3 });
  spawnParticles(state, enemy.x, enemy.y, enemy.isBoss ? '#ffd84d' : '#f7d354', enemy.isBoss ? 22 : 6);

  if (enemy.isBoss) {
    // Boss always drops a treasure chest, a gold bag, and bonus gold
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
    if (state.rng.next() < 0.35) {
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
    if (roll < 0.004) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'magnet',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.010) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'meat',
        x: enemy.x,
        y: enemy.y,
        value: 25,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0155) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'frenzy_elixir',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0205) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'ice_hourglass',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0245) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'holy_bell',
        x: enemy.x,
        y: enemy.y,
        value: 1,
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0405) {
      state.pickups.push({
        uid: state.nextUid++,
        kind: 'gold_bag',
        x: enemy.x,
        y: enemy.y,
        value: Math.round(18 * stage.dropMult),
        magnetized: false,
        bobSeed: state.rng.range(0, Math.PI * 2),
      });
    } else if (roll < 0.0405 + enemy.goldChance * stage.dropMult) {
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
        const dmg = Math.max(1, Math.round(p.damage - state.player.armor));
        state.player.hp -= dmg;
        state.player.invulnTimer = 0.45;
        state.events.push({ type: 'player_hurt' });
        state.shakeTimer = 0.16;
        state.shakeIntensity = 6;
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

function updateEnemies(state: GameState, stage: StageDef, dt: number): void {
  const px = state.player.x;
  const py = state.player.y;

  // Rebuild spatial hash
  state.spatialHash.clear();
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i]!;
    if (enemy.hp <= 0) {
      handleEnemyKilled(state, enemy, stage);
      state.enemies.splice(i, 1);
      continue;
    }
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    state.spatialHash.insert(i, e.x, e.y, e.radius);
  }

  const freezeFactor = state.freezeTimer > 0 ? 0.15 : 1;

  // Movement, soft separation, boss projectile attacks, and player contact damage
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    if (e.hitFlashTimer > 0) {
      e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
    }

    const dx = px - e.x;
    const dy = py - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    let vx = (dx / dist) * e.speed * freezeFactor;
    let vy = (dy / dist) * e.speed * freezeFactor;

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

    // Boss ring-orb attack
    if (e.isBoss && dist < 540 && state.freezeTimer <= 0) {
      e.bossShootTimer -= dt;
      if (e.bossShootTimer <= 0) {
        e.bossShootTimer = 3.1;
        const orbCount = 8;
        const baseA = Math.atan2(dy, dx);
        for (let b = 0; b < orbCount; b++) {
          const a = baseA + (Math.PI * 2 * b) / orbCount;
          state.projectiles.push({
            uid: state.nextUid++,
            weaponId: 'boss_orb',
            behavior: 'enemy_orb',
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * 195,
            vy: Math.sin(a) * 195,
            radius: 10,
            damage: Math.max(8, Math.round(e.damage * 0.75)),
            pierce: 1,
            knockback: 0,
            life: 3.4,
            maxLife: 3.4,
            color: '#ff5252',
            accentColor: '#ffd84d',
            spinAngle: a,
            hitIds: new Set<number>(),
          });
        }
      }
    }

    // Despawn very distant regular enemies & recycle near perimeter so waves stay dense
    if (!e.isBoss && !e.isElite && dist > 1100) {
      const angle = state.rng.range(0, Math.PI * 2);
      e.x = px + Math.cos(angle) * 580;
      e.y = py + Math.sin(angle) * 580;
      continue;
    }

    // Player contact damage
    const hitDist = e.radius + state.player.radius * 0.78;
    if (dist <= hitDist && state.player.invulnTimer <= 0) {
      const dmg = Math.max(1, Math.round(e.damage - state.player.armor));
      state.player.hp -= dmg;
      state.player.invulnTimer = 0.42;
      state.shakeTimer = 0.18;
      state.shakeIntensity = 6;
      state.events.push({ type: 'player_hurt' });
    }
  }

  // Re-index spatial hash after movement for accurate weapon/projectile queries
  state.spatialHash.clear();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i]!;
    state.spatialHash.insert(i, e.x, e.y, e.radius);
  }
}

function updatePickups(state: GameState, catalog: GameCatalog, dt: number): void {
  const px = state.player.x;
  const py = state.player.y;
  const magnetR2 = state.player.magnetRadius * state.player.magnetRadius;

  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i]!;
    const dx = px - p.x;
    const dy = py - p.y;
    const d2 = dx * dx + dy * dy;

    if (p.kind !== 'chest' && d2 <= magnetR2) {
      p.magnetized = true;
    }

    if (p.magnetized) {
      const d = Math.sqrt(d2) || 1;
      const pullSpeed = 420;
      p.x += (dx / d) * pullSpeed * dt;
      p.y += (dy / d) * pullSpeed * dt;
    }

    if (d2 <= 26 * 26) {
      state.pickups.splice(i, 1);
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

  // Player regeneration, invulnerability & active skill / buff timers
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
  if (state.freezeTimer > 0) {
    state.freezeTimer = Math.max(0, state.freezeTimer - dt);
  }
  if (state.player.regen > 0 && state.player.hp < state.player.maxHp) {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.regen * dt);
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

  // Enemies, spatial hash, wave director, weapons, projectiles, zones, pickups
  updateWaveDirector(state, stage, catalog, dt);
  updateEnemies(state, stage, dt);

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
  updateProjectiles(state, catalog, dt);
  updateZones(state, dt);

  // Sweep enemies killed by weapons/zones this frame immediately so pickups spawn smoothly
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i]!;
    if (enemy.hp <= 0) {
      handleEnemyKilled(state, enemy, stage);
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
