import type { GameCatalog, WeaponDef, WeaponLevelSpec } from '../data/types.ts';
import { getHeroFormModifiers, type EnemyEntity, type GameState, type WeaponSlot } from './state.ts';

const queryBuf: number[] = [];

function findNearestEnemy(state: GameState, x: number, y: number, maxRange: number): EnemyEntity | null {
  state.spatialHash.queryCircle(x, y, maxRange, queryBuf, 72);
  let best: EnemyEntity | null = null;
  let bestDistSq = maxRange * maxRange;
  for (let i = 0; i < queryBuf.length; i++) {
    const enemy = state.enemies[queryBuf[i]!];
    if (!enemy || enemy.hp <= 0) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      best = enemy;
    }
  }
  return best;
}

export function applyDamageToEnemy(
  state: GameState,
  enemy: EnemyEntity,
  rawDamage: number,
  knockback: number,
  fromX: number,
  fromY: number,
  weaponSlot?: WeaponSlot
): boolean {
  if (enemy.hp <= 0) return false;
  const isCrit = state.rng.next() < 0.1;
  const dmg = Math.max(1, Math.round(rawDamage * (isCrit ? 1.65 : 1)));
  enemy.hp -= dmg;
  enemy.hitFlashTimer = 0.11;
  if (weaponSlot) {
    weaponSlot.totalDamage += dmg;
  }

  if (knockback > 0) {
    const dx = enemy.x - fromX;
    const dy = enemy.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const resist = enemy.isBoss ? 0.12 : enemy.isElite ? 0.45 : 1;
    enemy.knockbackVx += (dx / len) * knockback * resist;
    enemy.knockbackVy += (dy / len) * knockback * resist;
  }

  if (state.floatingTexts.length < (isCrit ? 75 : 44)) {
    state.floatingTexts.push({
      x: enemy.x + state.rng.range(-10, 10),
      y: enemy.y - enemy.radius * 0.8,
      vy: -36,
      text: isCrit ? `${dmg}!` : `${dmg}`,
      color: isCrit ? '#ffd84d' : '#fff7e0',
      life: 0.55,
      maxLife: 0.55,
      scale: isCrit ? 1.25 : 1,
    });
  }

  state.events.push({ type: 'hit' });
  return enemy.hp <= 0;
}

function fireWeapon(state: GameState, _slot: WeaponSlot, def: WeaponDef, spec: WeaponLevelSpec): void {
  const formMod = getHeroFormModifiers(state);
  const frenzyMight = state.player.frenzyTimer > 0 ? 1.4 : 1;
  const dmg = spec.damage * (state.player.might + formMod.mightAdd) * frenzyMight;
  const area = spec.area * (state.player.area + formMod.areaAdd);
  const amount = Math.max(1, spec.amount + state.player.amountBonus + formMod.amountAdd);
  const duration = spec.duration * state.player.duration;
  const px = state.player.x;
  const py = state.player.y;

  switch (def.behavior) {
    case 'aura_pulse': {
      state.zones.push({
        uid: state.nextUid++,
        weaponId: def.id,
        kind: 'aura',
        x: px,
        y: py,
        radius: area,
        damage: dmg,
        knockback: spec.knockback,
        life: 0.34,
        maxLife: 0.34,
        tickInterval: 0.35,
        tickTimer: 0,
        color: def.color,
        accentColor: def.accentColor,
        hitOnce: true,
        applied: false,
      });
      break;
    }

    case 'boomerang': {
      for (let i = 0; i < amount; i++) {
        const target = findNearestEnemy(state, px, py, 520);
        let angle = target
          ? Math.atan2(target.y - py, target.x - px)
          : Math.atan2(state.player.facingY, state.player.facingX);
        angle += (i - (amount - 1) / 2) * 0.32;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: def.id,
          behavior: 'boomerang',
          x: px,
          y: py,
          vx: Math.cos(angle) * spec.speed,
          vy: Math.sin(angle) * spec.speed,
          radius: area,
          damage: dmg,
          pierce: spec.pierce,
          knockback: spec.knockback,
          life: duration,
          maxLife: duration,
          color: def.color,
          accentColor: def.accentColor,
          spriteId: def.spriteId,
          returnPhase: false,
          spinAngle: 0,
          hitIds: new Set<number>(),
        });
      }
      break;
    }

    case 'homing': {
      for (let i = 0; i < amount; i++) {
        const target = findNearestEnemy(state, px, py, 560);
        const baseAngle = target
          ? Math.atan2(target.y - py, target.x - px)
          : state.rng.range(0, Math.PI * 2);
        const angle = baseAngle + (i - (amount - 1) / 2) * 0.24;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: def.id,
          behavior: 'homing',
          x: px,
          y: py,
          vx: Math.cos(angle) * spec.speed,
          vy: Math.sin(angle) * spec.speed,
          radius: area,
          damage: dmg,
          pierce: spec.pierce,
          knockback: spec.knockback,
          life: duration,
          maxLife: duration,
          color: def.color,
          accentColor: def.accentColor,
          spriteId: def.spriteId,
          spinAngle: 0,
          hitIds: new Set<number>(),
          splitOnHit: def.isEvolved,
        });
      }
      break;
    }

    case 'beam': {
      const fx = state.player.facingX || 1;
      const fy = state.player.facingY || 0;
      const baseAngle = Math.atan2(fy, fx);
      for (let i = 0; i < amount; i++) {
        const angle = baseAngle + (i % 2 === 0 ? 0 : Math.PI) + (Math.floor(i / 2) * 0.22);
        const reach = 420 * state.player.area;
        state.zones.push({
          uid: state.nextUid++,
          weaponId: def.id,
          kind: 'beam',
          x: px,
          y: py,
          x2: px + Math.cos(angle) * reach,
          y2: py + Math.sin(angle) * reach,
          radius: area,
          damage: dmg,
          knockback: spec.knockback,
          life: 0.26,
          maxLife: 0.26,
          tickInterval: 0.3,
          tickTimer: 0,
          color: def.color,
          accentColor: def.accentColor,
          hitOnce: true,
          applied: false,
        });
      }
      break;
    }

    case 'lightning': {
      state.spatialHash.queryCircle(px, py, 460, queryBuf, 72);
      for (let i = 0; i < amount; i++) {
        let tx = px + state.rng.range(-280, 280);
        let ty = py + state.rng.range(-200, 200);
        if (queryBuf.length > 0) {
          const picked = state.enemies[queryBuf[state.rng.int(0, queryBuf.length - 1)]!];
          if (picked && picked.hp > 0) {
            tx = picked.x;
            ty = picked.y;
          }
        }
        state.zones.push({
          uid: state.nextUid++,
          weaponId: def.id,
          kind: 'lightning',
          x: tx,
          y: ty,
          radius: area,
          damage: dmg,
          knockback: spec.knockback,
          life: 0.36,
          maxLife: 0.36,
          tickInterval: 0.4,
          tickTimer: 0,
          color: def.color,
          accentColor: def.accentColor,
          hitOnce: true,
          applied: false,
        });
      }
      break;
    }

    case 'shotgun': {
      const fx = state.player.facingX || 1;
      const fy = state.player.facingY || 0;
      const baseAngle = Math.atan2(fy, fx);
      const totalPellets = amount + 2;
      const spread = 0.55;
      for (let i = 0; i < totalPellets; i++) {
        const angle = baseAngle + ((i / Math.max(1, totalPellets - 1)) - 0.5) * spread;
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: def.id,
          behavior: 'shotgun',
          x: px,
          y: py,
          vx: Math.cos(angle) * spec.speed,
          vy: Math.sin(angle) * spec.speed,
          radius: area,
          damage: dmg,
          pierce: spec.pierce,
          knockback: spec.knockback,
          life: duration,
          maxLife: duration,
          color: def.color,
          accentColor: def.accentColor,
          spinAngle: angle,
          hitIds: new Set<number>(),
        });
      }
      break;
    }

    case 'zone': {
      for (let i = 0; i < amount; i++) {
        const angle = state.rng.range(0, Math.PI * 2);
        const dist = state.rng.range(45, 220);
        state.zones.push({
          uid: state.nextUid++,
          weaponId: def.id,
          kind: 'zone',
          x: px + Math.cos(angle) * dist,
          y: py + Math.sin(angle) * dist,
          radius: area,
          damage: dmg,
          knockback: spec.knockback,
          life: duration,
          maxLife: duration,
          tickInterval: 0.42,
          tickTimer: 0,
          color: def.color,
          accentColor: def.accentColor,
          hitOnce: false,
        });
      }
      break;
    }

    case 'lobbed': {
      state.spatialHash.queryCircle(px, py, 360, queryBuf, 72);
      const flightTime = Math.max(0.32, Math.min(0.75, spec.duration));
      for (let i = 0; i < amount; i++) {
        let tx = px + Math.cos(state.rng.range(0, Math.PI * 2)) * state.rng.range(90, 260);
        let ty = py + Math.sin(state.rng.range(0, Math.PI * 2)) * state.rng.range(90, 260);
        if (queryBuf.length > 0) {
          const picked = state.enemies[queryBuf[state.rng.int(0, queryBuf.length - 1)]!];
          if (picked && picked.hp > 0) {
            tx = picked.x + state.rng.range(-18, 18);
            ty = picked.y + state.rng.range(-18, 18);
          }
        }
        state.projectiles.push({
          uid: state.nextUid++,
          weaponId: def.id,
          behavior: 'lobbed',
          x: px,
          y: py,
          vx: (tx - px) / flightTime,
          vy: (ty - py) / flightTime,
          radius: 16,
          blastRadius: area,
          damage: dmg,
          pierce: 1,
          knockback: spec.knockback,
          life: flightTime,
          maxLife: flightTime,
          color: def.color,
          accentColor: def.accentColor,
          spriteId: def.spriteId,
          spinAngle: 0,
          hitIds: new Set<number>(),
        });
      }
      break;
    }

    case 'orbit':
      // Orbit weapons are handled continuously in updateOrbitWeapons()
      break;
  }
}

export function updateWeapons(state: GameState, catalog: GameCatalog, dt: number): void {
  const formMod = getHeroFormModifiers(state);
  const hasteMult =
    (state.player.skillBuffTimer > 0 ? 1.85 : 1) *
    (state.player.frenzyTimer > 0 ? 1.65 : 1) *
    formMod.hasteMult;
  const frenzyMight = state.player.frenzyTimer > 0 ? 1.4 : 1;

  // 1. Cooldown-driven active weapons
  for (let i = 0; i < state.weapons.length; i++) {
    const slot = state.weapons[i]!;
    const def = catalog.weapons[slot.weaponId];
    if (!def) continue;
    const spec = def.levels[Math.min(slot.level - 1, def.levels.length - 1)]!;

    if (def.behavior === 'orbit') {
      continue;
    }

    slot.cooldownTimer -= dt * hasteMult;
    if (slot.cooldownTimer <= 0) {
      fireWeapon(state, slot, def, spec);
      slot.cooldownTimer = Math.max(0.18, spec.cooldown * state.player.cooldown);
    }
  }

  // 2. Continuous orbiting weapons
  state.orbitAngle += dt * 2.9 * (state.player.frenzyTimer > 0 ? 1.35 : 1);
  for (const [eid, timer] of state.orbitHitCooldowns.entries()) {
    const next = timer - dt;
    if (next <= 0) {
      state.orbitHitCooldowns.delete(eid);
    } else {
      state.orbitHitCooldowns.set(eid, next);
    }
  }

  for (let i = 0; i < state.weapons.length; i++) {
    const slot = state.weapons[i]!;
    const def = catalog.weapons[slot.weaponId];
    if (!def || def.behavior !== 'orbit') continue;
    const spec = def.levels[Math.min(slot.level - 1, def.levels.length - 1)]!;
    const count = Math.max(1, spec.amount + state.player.amountBonus + formMod.amountAdd);
    const orbitRadius = spec.area * (state.player.area + formMod.areaAdd);
    const orbHitRadius = def.isEvolved ? 24 : 18;
    const dmg = spec.damage * (state.player.might + formMod.mightAdd) * frenzyMight;

    for (let k = 0; k < count; k++) {
      const a = state.orbitAngle + (Math.PI * 2 * k) / count;
      const ox = state.player.x + Math.cos(a) * orbitRadius;
      const oy = state.player.y + Math.sin(a) * orbitRadius;
      state.spatialHash.queryCircle(ox, oy, orbHitRadius, queryBuf, 72);
      for (let q = 0; q < queryBuf.length; q++) {
        const enemy = state.enemies[queryBuf[q]!];
        if (!enemy || enemy.hp <= 0) continue;
        if (state.orbitHitCooldowns.has(enemy.uid)) continue;
        state.orbitHitCooldowns.set(enemy.uid, Math.max(0.14, (spec.cooldown * state.player.cooldown) / hasteMult));
        applyDamageToEnemy(state, enemy, dmg, spec.knockback, state.player.x, state.player.y, slot);
      }
    }
  }
}

export function getOrbitVisualNodes(
  state: GameState,
  catalog: GameCatalog
): Array<{ x: number; y: number; radius: number; spriteId: string; color: string; isEvolved: boolean }> {
  const nodes: Array<{
    x: number;
    y: number;
    radius: number;
    spriteId: string;
    color: string;
    isEvolved: boolean;
  }> = [];
  for (const slot of state.weapons) {
    const def = catalog.weapons[slot.weaponId];
    if (!def || def.behavior !== 'orbit') continue;
    const spec = def.levels[Math.min(slot.level - 1, def.levels.length - 1)]!;
    const count = Math.max(1, spec.amount + state.player.amountBonus);
    const orbitRadius = spec.area * state.player.area;
    const orbHitRadius = def.isEvolved ? 24 : 18;
    for (let k = 0; k < count; k++) {
      const a = state.orbitAngle + (Math.PI * 2 * k) / count;
      nodes.push({
        x: state.player.x + Math.cos(a) * orbitRadius,
        y: state.player.y + Math.sin(a) * orbitRadius,
        radius: orbHitRadius,
        spriteId: def.spriteId,
        color: def.color,
        isEvolved: def.isEvolved,
      });
    }
  }
  return nodes;
}
