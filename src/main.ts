import './styles/main.css';
import { SoundEngine } from './audio/soundEngine.ts';
import { CATALOG } from './data/catalog.ts';
import { AssetStore } from './engine/assetLoader.ts';
import { SanctuaryRenderer } from './engine/renderer.ts';
import {
  selectUpgradeAndResume,
  stepSimulation,
  triggerActiveGadget,
  triggerActiveSkill,
} from './game/simulation.ts';
import { createInitialGameState, type GameState } from './game/state.ts';
import {
  computeCharacterTreeEffects,
  loadSaveData,
  persistSaveData,
  recordRunDiscoveries,
} from './storage/saveStore.ts';
import { renderCodexDialog } from './ui/codex.ts';
import {
  installDialogClosedByFallback,
  lockNonDismissibleDialog,
  renderChestDialog,
  renderPauseDialog,
  renderResultDialog,
  renderUpgradeChoicesDialog,
} from './ui/dialogs.ts';
import { LobbyView, type LobbySelection } from './ui/lobby.ts';
import { VirtualJoystick } from './ui/virtualJoystick.ts';

const loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;
const loadingBar = document.getElementById('loading-bar') as HTMLElement;
const loadingText = document.getElementById('loading-text') as HTMLElement;
const lobbyRoot = document.getElementById('lobby-view') as HTMLElement;
const stageLayer = document.getElementById('stage-layer') as HTMLElement;
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

const levelUpDialog = document.getElementById('levelup-dialog') as HTMLDialogElement;
const chestDialog = document.getElementById('chest-dialog') as HTMLDialogElement;
const pauseDialog = document.getElementById('pause-dialog') as HTMLDialogElement;
const codexDialog = document.getElementById('codex-dialog') as HTMLDialogElement;
const resultDialog = document.getElementById('result-dialog') as HTMLDialogElement;

const hudXpFill = document.getElementById('hud-xp-fill') as HTMLElement;
const hudLevel = document.getElementById('hud-level') as HTMLElement;
const hudTimer = document.getElementById('hud-timer') as HTMLElement;
const hudDiffBadge = document.getElementById('hud-diff-badge') as HTMLElement;
const hudFormBadge = document.getElementById('hud-form-badge') as HTMLElement;
const hudKills = document.getElementById('hud-kills') as HTMLElement;
const hudGold = document.getElementById('hud-gold') as HTMLElement;
const hudWeaponSlots = document.getElementById('hud-weapon-slots') as HTMLElement;
const hudPassiveSlots = document.getElementById('hud-passive-slots') as HTMLElement;
const hudPauseBtn = document.getElementById('hud-pause-btn') as HTMLButtonElement;

const bossBanner = document.getElementById('boss-banner') as HTMLElement;
const bossBannerImg = document.getElementById('boss-banner-img') as HTMLImageElement;
const bossBannerTitle = document.getElementById('boss-banner-title') as HTMLElement;
const bossBannerSub = document.getElementById('boss-banner-sub') as HTMLElement;

const touchSkillBtn = document.getElementById('touch-skill-btn') as HTMLButtonElement;
const touchSkillImg = document.getElementById('touch-skill-img') as HTMLImageElement;
const touchSkillCd = document.getElementById('touch-skill-cd') as HTMLElement;
const touchSkillName = document.getElementById('touch-skill-name') as HTMLElement;

const touchGadgetBtn = document.getElementById('touch-gadget-btn') as HTMLButtonElement;
const touchGadgetImg = document.getElementById('touch-gadget-img') as HTMLImageElement;
const touchGadgetEmpty = document.getElementById('touch-gadget-empty') as HTMLElement;
const touchGadgetCount = document.getElementById('touch-gadget-count') as HTMLElement;
const touchGadgetName = document.getElementById('touch-gadget-name') as HTMLElement;

installDialogClosedByFallback();
lockNonDismissibleDialog(levelUpDialog);
lockNonDismissibleDialog(chestDialog);
lockNonDismissibleDialog(resultDialog);

let save = loadSaveData();
const assets = new AssetStore();
const sound = new SoundEngine(save.settings);
const renderer = new SanctuaryRenderer(canvas, assets);
const joystick = new VirtualJoystick(stageLayer);
const lobby = new LobbyView(lobbyRoot, assets);

const pressedKeys = new Set<string>();
let activeRun: GameState | null = null;
let rafId: number | null = null;
let lastFrameMs = 0;
let accumulator = 0;
let modalActive = false;
let runSettled = false;
let lastSlotsSignature = '';

function formatClock(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function getKeyboardVector(): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) x -= 1;
  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) x += 1;
  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) y -= 1;
  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) y += 1;
  return { x, y };
}

function renderHud(state: GameState): void {
  const xpRatio = Math.min(100, Math.round((state.player.xp / Math.max(1, state.player.nextXp)) * 100));
  hudXpFill.style.width = `${xpRatio}%`;
  hudLevel.textContent = `Lv.${state.player.level}`;
  hudTimer.textContent = formatClock(state.elapsedSec);
  hudDiffBadge.hidden = state.difficulty !== 'hard';
  hudKills.textContent = String(state.kills);
  hudGold.textContent = String(state.goldEarned);

  const slotsSignature =
    state.weapons.map((w) => `${w.weaponId}:${w.level}`).join(',') +
    '|' +
    state.passives.map((p) => `${p.passiveId}:${p.level}`).join(',');

  if (slotsSignature !== lastSlotsSignature) {
    lastSlotsSignature = slotsSignature;
    hudWeaponSlots.innerHTML = state.weapons
      .map((w) => {
        const def = CATALOG.weapons[w.weaponId];
        const url = def ? assets.getUrl(def.spriteId) : '';
        return `<div class="hud-slot-chip" title="${def?.name ?? ''}"><img src="${url}" alt="" /><span>${def?.isEvolved ? '★' : w.level}</span></div>`;
      })
      .join('');

    hudPassiveSlots.innerHTML = state.passives
      .map((p) => {
        const def = CATALOG.passives[p.passiveId];
        const url = def ? assets.getUrl(def.spriteId) : '';
        return `<div class="hud-slot-chip" title="${def?.name ?? ''}"><img src="${url}" alt="" /><span>${p.level}</span></div>`;
      })
      .join('');
  }

  if (state.bannerAlert) {
    bossBanner.hidden = false;
    bossBannerTitle.textContent = state.bannerAlert.title;
    bossBannerSub.textContent = state.bannerAlert.subtitle;
    if (state.bannerAlert.imageUrl) {
      bossBannerImg.src = state.bannerAlert.imageUrl;
      bossBannerImg.hidden = false;
    } else {
      bossBannerImg.hidden = true;
    }
  } else {
    bossBanner.hidden = true;
  }

  const charDef = CATALOG.characters[state.characterId];
  if (charDef) {
    const skill = charDef.activeSkill;
    const isAwakened = state.player.heroForm === 'awakened';
    const formName = isAwakened ? skill.awakenedFormName : skill.primaryFormName;
    const formColor = isAwakened ? skill.awakenedColor : skill.color;

    hudFormBadge.textContent = formName;
    hudFormBadge.classList.toggle('is-awakened', isAwakened);
    touchSkillBtn.classList.toggle('is-awakened', isAwakened);
    touchSkillBtn.style.setProperty('--skill-color', formColor);

    const iconUrl = assets.getUrl(skill.spriteId);
    if (touchSkillImg.getAttribute('src') !== iconUrl) {
      touchSkillImg.src = iconUrl;
    }
    touchSkillName.textContent = isAwakened ? `${skill.name} · 觉` : `${skill.name} · 主`;
    if (state.player.skillCooldownTimer > 0) {
      touchSkillBtn.classList.remove('is-ready');
      touchSkillBtn.classList.add('is-cooldown');
      const rem = state.player.skillCooldownTimer;
      touchSkillCd.hidden = false;
      touchSkillCd.textContent = rem >= 1 ? `${rem.toFixed(1)}s` : `${rem.toFixed(1)}`;
      const fracReady = 1 - Math.min(1, rem / Math.max(0.1, state.player.skillMaxCooldown));
      touchSkillBtn.style.setProperty('--cd-deg', `${Math.round(fracReady * 360)}deg`);
    } else {
      touchSkillBtn.classList.add('is-ready');
      touchSkillBtn.classList.remove('is-cooldown');
      touchSkillCd.hidden = true;
      touchSkillBtn.style.setProperty('--cd-deg', '360deg');
    }
  }

  const held = state.player.heldGadgets;
  if (held.length > 0) {
    const nextGadgetId = held[0]!;
    const gDef = CATALOG.gadgets[nextGadgetId];
    const gUrl = gDef ? assets.getUrl(gDef.spriteId) : '';
    touchGadgetBtn.classList.remove('is-empty');
    touchGadgetBtn.classList.add('has-gadget');
    touchGadgetBtn.disabled = false;
    touchGadgetBtn.style.setProperty('--gadget-color', gDef?.color ?? '#60a5fa');
    if (touchGadgetImg.getAttribute('src') !== gUrl) {
      touchGadgetImg.src = gUrl;
    }
    touchGadgetImg.hidden = false;
    touchGadgetEmpty.hidden = true;
    touchGadgetCount.hidden = false;
    touchGadgetCount.textContent = `×${held.length}`;
    touchGadgetName.textContent = gDef?.name ?? '主动道具';
  } else {
    touchGadgetBtn.classList.add('is-empty');
    touchGadgetBtn.classList.remove('has-gadget');
    touchGadgetBtn.disabled = true;
    touchGadgetImg.hidden = true;
    touchGadgetEmpty.hidden = false;
    touchGadgetCount.hidden = true;
    touchGadgetName.textContent = '道具 (空)';
  }
}

function settleRunProgress(state: GameState, victory: boolean): void {
  if (runSettled) return;
  runSettled = true;
  save.gold += state.goldEarned;
  save.totalRuns += 1;
  save.bestKills = Math.max(save.bestKills, state.kills);
  save.bestSurvivalSec = Math.max(save.bestSurvivalSec, Math.floor(state.elapsedSec));
  if (victory && !save.clearedStages.includes(state.stageId)) {
    save.clearedStages.push(state.stageId);
  }
  if (victory && state.difficulty === 'hard') {
    if (!save.clearedHardStages) save.clearedHardStages = [];
    if (!save.clearedHardStages.includes(state.stageId)) {
      save.clearedHardStages.push(state.stageId);
    }
  }
  for (const cid of state.discoveredCodexIds) {
    if (!save.unlockedCodexIds.includes(cid)) {
      save.unlockedCodexIds.push(cid);
    }
  }
  recordRunDiscoveries(save, state.discoveredEnemyIds, state.discoveredWeaponIds);
  persistSaveData(save);
}

function exitToLobby(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  sound.stopBgm();
  if (activeRun) {
    settleRunProgress(activeRun, activeRun.phase === 'victory');
  }
  activeRun = null;
  modalActive = false;
  pressedKeys.clear();
  joystick.reset();
  stageLayer.hidden = true;
  lobbyRoot.hidden = false;
  renderLobby();
}

function openPauseModal(): void {
  if (!activeRun || modalActive || activeRun.phase !== 'playing') return;
  activeRun.phase = 'paused';
  modalActive = true;
  pressedKeys.clear();
  joystick.reset();
  renderPauseDialog(pauseDialog, activeRun, save.settings, {
    onResume: () => {
      modalActive = false;
      if (activeRun && activeRun.phase === 'paused') {
        activeRun.phase = 'playing';
      }
      lastFrameMs = performance.now();
    },
    onQuit: () => {
      exitToLobby();
    },
    onSettingsChange: (next) => {
      save.settings = next;
      sound.updateSettings(next);
      if (next.bgmEnabled && activeRun) sound.startBgm();
      persistSaveData(save);
    },
  });
}

function syncPhaseModals(state: GameState): void {
  if (modalActive) return;

  if (state.phase === 'levelup') {
    modalActive = true;
    pressedKeys.clear();
    joystick.reset();
    renderUpgradeChoicesDialog(
      levelUpDialog,
      state.levelUpChoices,
      state.pendingLevelUps,
      assets,
      (choice) => {
        modalActive = false;
        selectUpgradeAndResume(state, choice, CATALOG);
        lastFrameMs = performance.now();
      }
    );
    return;
  }

  if (state.phase === 'chest' && state.pendingChest) {
    modalActive = true;
    pressedKeys.clear();
    joystick.reset();
    renderChestDialog(chestDialog, state.pendingChest, assets, (choice) => {
      modalActive = false;
      selectUpgradeAndResume(state, choice, CATALOG);
      lastFrameMs = performance.now();
    });
    return;
  }

  if (state.phase === 'victory' || state.phase === 'gameover') {
    modalActive = true;
    pressedKeys.clear();
    joystick.reset();
    const isVictory = state.phase === 'victory';
    settleRunProgress(state, isVictory);
    renderResultDialog(
      resultDialog,
      isVictory,
      state,
      () => {
        modalActive = false;
        state.endlessMode = true;
        state.phase = 'playing';
        lastFrameMs = performance.now();
      },
      () => {
        exitToLobby();
      }
    );
  }
}

function gameLoop(nowMs: number): void {
  if (!activeRun) return;
  const rawDt = Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;

  if (activeRun.phase === 'playing') {
    const stage = CATALOG.stages[activeRun.stageId]!;
    accumulator += rawDt;
    const fixedDt = 1 / 60;
    let subSteps = 0;
    while (accumulator >= fixedDt && subSteps < 4 && activeRun.phase === 'playing') {
      const kb = getKeyboardVector();
      const joy = joystick.getVector();
      const input = Math.hypot(joy.x, joy.y) > 0.05 ? joy : kb;
      stepSimulation(activeRun, input, stage, CATALOG, fixedDt);
      accumulator -= fixedDt;
      subSteps += 1;
    }

    sound.processEvents(activeRun.events);
    renderer.render(activeRun, stage, CATALOG, save.settings);
    renderHud(activeRun);
    syncPhaseModals(activeRun);
  }

  rafId = requestAnimationFrame(gameLoop);
}

function startRun(sel: LobbySelection): void {
  sound.unlock();
  sound.startBgm();
  const char = CATALOG.characters[sel.characterId] ?? Object.values(CATALOG.characters)[0]!;
  const stage = CATALOG.stages[sel.stageId] ?? Object.values(CATALOG.stages)[0]!;
  const treeEffects = computeCharacterTreeEffects(save, char.id, CATALOG);

  activeRun = createInitialGameState(
    char,
    stage,
    {},
    Date.now(),
    sel.difficulty,
    treeEffects
  );
  recordRunDiscoveries(save, [], activeRun.discoveredWeaponIds);
  persistSaveData(save);
  // Unlock starting character portrait entry if matched in gallery
  runSettled = false;
  modalActive = false;
  lastSlotsSignature = '';
  accumulator = 0;

  lobbyRoot.hidden = true;
  stageLayer.hidden = false;
  renderer.resize();
  renderer.render(activeRun, stage, CATALOG, save.settings);
  renderHud(activeRun);
  lastFrameMs = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function renderLobby(): void {
  lobby.render(save, {
    onSaveUpdated: () => persistSaveData(save),
    onStartRun: startRun,
    onOpenCodex: () => {
      renderCodexDialog(codexDialog, save, assets, (previewAll) => {
        save.settings.codexPreviewAll = previewAll;
        persistSaveData(save);
      });
    },
  });
}

window.addEventListener('resize', () => {
  if (activeRun) renderer.resize();
});

window.addEventListener('keydown', (e) => {
  sound.unlock();
  pressedKeys.add(e.code);

  if (activeRun && (e.code === 'Escape' || e.code === 'KeyP') && activeRun.phase === 'playing') {
    e.preventDefault();
    openPauseModal();
    return;
  }

  if (activeRun && activeRun.phase === 'playing' && (e.code === 'Space' || e.code === 'KeyE')) {
    e.preventDefault();
    if (triggerActiveSkill(activeRun, CATALOG)) {
      sound.processEvents(activeRun.events);
      renderHud(activeRun);
    }
    return;
  }

  if (activeRun && activeRun.phase === 'playing' && (e.code === 'KeyQ' || e.code === 'KeyF')) {
    e.preventDefault();
    handleGadgetTrigger();
    return;
  }

  if (activeRun && activeRun.phase === 'levelup' && levelUpDialog.open) {
    const idx = e.key === '1' ? 0 : e.key === '2' ? 1 : e.key === '3' ? 2 : -1;
    if (idx >= 0) {
      const btns = levelUpDialog.querySelectorAll<HTMLButtonElement>('.choice-card');
      btns[idx]?.click();
    }
  }
});

window.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.code);
});

window.addEventListener('blur', () => {
  pressedKeys.clear();
  if (activeRun && activeRun.phase === 'playing') {
    openPauseModal();
  }
});

hudPauseBtn.addEventListener('click', () => {
  openPauseModal();
});

function handleSkillTrigger(): void {
  if (!activeRun || activeRun.phase !== 'playing') return;
  sound.unlock();
  if (triggerActiveSkill(activeRun, CATALOG)) {
    sound.processEvents(activeRun.events);
    renderHud(activeRun);
  }
}

let lastGadgetTriggerMs = 0;
function handleGadgetTrigger(): void {
  if (!activeRun || activeRun.phase !== 'playing') return;
  const now = performance.now();
  if (now - lastGadgetTriggerMs < 140) return;
  sound.unlock();
  if (triggerActiveGadget(activeRun, CATALOG)) {
    lastGadgetTriggerMs = now;
    sound.processEvents(activeRun.events);
    renderHud(activeRun);
  }
}

touchGadgetBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  handleGadgetTrigger();
});

touchGadgetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  handleGadgetTrigger();
});

touchSkillBtn.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  handleSkillTrigger();
});

touchSkillBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  handleSkillTrigger();
});

async function bootstrap(): Promise<void> {
  await assets.preloadAll((ratio) => {
    const pct = Math.round(ratio * 100);
    loadingBar.style.width = `${pct}%`;
    loadingText.textContent = `加载圣殿馆藏精灵 ${pct}%`;
  });
  loadingOverlay.hidden = true;
  renderLobby();
}

void bootstrap();
