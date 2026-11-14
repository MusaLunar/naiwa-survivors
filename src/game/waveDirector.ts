import type { EnemyDef, GameCatalog, StageDef, WavePhase } from '../data/types.ts';
import type { EnemyEntity, GameState } from './state.ts';

export function getActiveWavePhase(stage: StageDef, elapsedSec: number): WavePhase {
  for (let i = 0; i < stage.waves.length; i++) {
    const w = stage.waves[i]!;
    if (elapsedSec >= w.startSec && elapsedSec < w.endSec) {
      return w;
    }
  }
  return stage.waves[stage.waves.length - 1]!;
}

export function spawnEnemyInstance(
  state: GameState,
  def: EnemyDef,
  x: number,
  y: number,
  hpScale: number,
  speedScale: number
): EnemyEntity {
  const maxHp = Math.max(1, Math.round(def.baseHp * hpScale));
  const entity: EnemyEntity = {
    uid: state.nextUid++,
    defId: def.id,
    spriteId: def.spriteId,
    isMedallion: Boolean(def.isMedallion),
    x,
    y,
    vx: 0,
    vy: 0,
    hp: maxHp,
    maxHp,
    speed: def.speed * speedScale,
    radius: def.radius,
    damage: def.damage,
    xpValue: def.xpValue,
    goldChance: def.goldChance,
    isElite: Boolean(def.isElite),
    isBoss: Boolean(def.isBoss),
    hitFlashTimer: 0,
    knockbackVx: 0,
    knockbackVy: 0,
    bossShootTimer: def.isBoss ? 2.4 : 0,
    wobbleSeed: state.rng.range(0, Math.PI * 2),
  };
  state.enemies.push(entity);
  if (def.codexGalleryId) {
    state.discoveredCodexIds.add(def.codexGalleryId);
  }
  return entity;
}

function pickWeightedEnemy(state: GameState, phase: WavePhase): string {
  let total = 0;
  for (let i = 0; i < phase.pool.length; i++) {
    total += phase.pool[i]!.weight;
  }
  let roll = state.rng.next() * total;
  for (let i = 0; i < phase.pool.length; i++) {
    const entry = phase.pool[i]!;
    roll -= entry.weight;
    if (roll <= 0) return entry.enemyId;
  }
  return phase.pool[0]!.enemyId;
}

/** Advance spawn timer & scheduled boss events around player viewport perimeter. */
export function updateWaveDirector(
  state: GameState,
  stage: StageDef,
  catalog: GameCatalog,
  dt: number,
  viewRadius = 560
): void {
  const phase = getActiveWavePhase(stage, state.elapsedSec);
  const endlessExtraScale = state.elapsedSec > stage.durationSec
    ? 1 + (state.elapsedSec - stage.durationSec) / 90
    : 1;

  // Immediate opening pack so the player engages action within 2 seconds
  if (!state.triggeredEvents.has('init-opening-pack')) {
    state.triggeredEvents.add('init-opening-pack');
    const firstEnemyId = phase.pool[0]?.enemyId;
    const starterDef = firstEnemyId ? catalog.enemies[firstEnemyId] : undefined;
    if (starterDef) {
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 + state.rng.range(-0.2, 0.2);
        const dist = state.rng.range(240, 310);
        spawnEnemyInstance(
          state,
          starterDef,
          state.player.x + Math.cos(angle) * dist,
          state.player.y + Math.sin(angle) * dist,
          phase.hpScale,
          phase.speedScale
        );
      }
    }
  }

  // Scheduled elite & boss events
  for (const ev of stage.bossEvents) {
    if (state.elapsedSec >= ev.atSec && !state.triggeredEvents.has(ev.id)) {
      state.triggeredEvents.add(ev.id);
      const bossDef = catalog.enemies[ev.enemyId];
      if (bossDef) {
        for (let i = 0; i < ev.count; i++) {
          const angle = (Math.PI * 2 * i) / Math.max(1, ev.count) + state.rng.range(-0.25, 0.25);
          const dist = viewRadius * 0.88;
          spawnEnemyInstance(
            state,
            bossDef,
            state.player.x + Math.cos(angle) * dist,
            state.player.y + Math.sin(angle) * dist,
            phase.hpScale * endlessExtraScale,
            1
          );
        }
        state.bannerAlert = {
          title: bossDef.name,
          subtitle: ev.announcement,
          imageUrl: ev.galleryBannerUrl,
          timer: 4.5,
          maxTimer: 4.5,
        };
        state.events.push({ type: 'boss_spawn', intensity: bossDef.isBoss ? 1 : 0.6 });
      }
    }
  }

  // Regular wave spawning
  const cap = Math.min(280, Math.round(phase.maxCount * stage.spawnRateMult));
  if (state.enemies.length >= cap) {
    return;
  }

  const interval = phase.spawnInterval / stage.spawnRateMult;
  state.spawnAccumulator += dt;
  let spawnsThisTick = 0;
  while (state.spawnAccumulator >= interval && state.enemies.length < cap && spawnsThisTick < 5) {
    state.spawnAccumulator -= interval;
    spawnsThisTick += 1;

    const enemyId = pickWeightedEnemy(state, phase);
    const def = catalog.enemies[enemyId];
    if (!def) continue;

    const angle = state.rng.range(0, Math.PI * 2);
    const dist = viewRadius + state.rng.range(30, 120);
    spawnEnemyInstance(
      state,
      def,
      state.player.x + Math.cos(angle) * dist,
      state.player.y + Math.sin(angle) * dist,
      phase.hpScale * endlessExtraScale,
      phase.speedScale
    );
  }
}
