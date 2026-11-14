import { CATALOG } from '../data/catalog.ts';
import type { GameSettings } from '../data/types.ts';
import type { AssetStore } from '../engine/assetLoader.ts';
import type { ChestReward, GameState, UpgradeChoice } from '../game/state.ts';

/**
 * Progressive enhancement fallback for `dialog[closedby="any"]` in browsers
 * (e.g. Safari) that do not yet implement `HTMLDialogElement.prototype.closedBy`.
 */
export function installDialogClosedByFallback(): void {
  if ('closedBy' in HTMLDialogElement.prototype) return;

  const isOutside = (e: PointerEvent, dialog: HTMLDialogElement): boolean => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = isOutside(e, dialog);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && isOutside(e, dialog)) {
        dialog.close();
      }
      pressedOutside = false;
    });
  }
}

export function lockNonDismissibleDialog(dialog: HTMLDialogElement): void {
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
  });
}

export function renderUpgradeChoicesDialog(
  dialog: HTMLDialogElement,
  choices: UpgradeChoice[],
  pendingCount: number,
  assets: AssetStore,
  onSelect: (choice: UpgradeChoice) => void
): void {
  const badge = dialog.querySelector<HTMLElement>('#levelup-queue-badge');
  if (badge) {
    badge.textContent = pendingCount > 1 ? `剩余升级 ×${pendingCount}` : '择一纳福';
  }
  const list = dialog.querySelector<HTMLElement>('#levelup-cards');
  if (!list) return;
  list.innerHTML = '';

  choices.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `choice-card ${choice.kind === 'evolve' ? 'choice-evolve' : ''}`;
    if (index === 0) btn.autofocus = true;

    const imgUrl = assets.getUrl(choice.spriteId);
    btn.innerHTML = `
      <span class="choice-hotkey">[${index + 1}]</span>
      <img class="choice-icon" src="${imgUrl}" alt="" width="72" height="72" />
      <div class="choice-body">
        <div class="choice-header">
          <strong>${choice.title}</strong>
          <span class="choice-tag">${choice.subtitle}</span>
        </div>
        <p>${choice.description}</p>
      </div>
    `;
    btn.addEventListener('click', () => {
      dialog.close();
      onSelect(choice);
    });
    list.appendChild(btn);
  });

  if (!dialog.open) {
    dialog.showModal();
  }
}

export function renderChestDialog(
  dialog: HTMLDialogElement,
  reward: ChestReward,
  assets: AssetStore,
  onClaim: (choice: UpgradeChoice) => void
): void {
  const container = dialog.querySelector<HTMLElement>('#chest-reward-body');
  if (!container) return;
  const choice = reward.choices[0]!;
  const imgUrl = assets.getUrl(choice.spriteId);

  container.innerHTML = `
    <div class="chest-showcase">
      <img class="chest-icon" src="${imgUrl}" alt="${choice.title}" width="112" height="112" />
      <h3>${choice.title}</h3>
      <p class="choice-tag">${choice.subtitle}</p>
      <p>${choice.description}</p>
      <div class="gold-pill">额外香油功德：+${reward.bonusGold} 金币</div>
    </div>
  `;

  const claimBtn = dialog.querySelector<HTMLButtonElement>('#chest-claim-btn');
  if (claimBtn) {
    const clone = claimBtn.cloneNode(true) as HTMLButtonElement;
    claimBtn.replaceWith(clone);
    clone.addEventListener('click', () => {
      dialog.close();
      onClaim(choice);
    });
  }

  if (!dialog.open) {
    dialog.showModal();
  }
}

export function renderPauseDialog(
  dialog: HTMLDialogElement,
  state: GameState,
  settings: GameSettings,
  callbacks: {
    onResume: () => void;
    onQuit: () => void;
    onSettingsChange: (next: GameSettings) => void;
  }
): void {
  const statsEl = dialog.querySelector<HTMLElement>('#pause-build-summary');
  if (statsEl) {
    const weaponLines = state.weapons
      .map((w) => {
        const def = CATALOG.weapons[w.weaponId];
        return `<li><span>${def?.name ?? w.weaponId}</span><strong>${def?.isEvolved ? '超武' : `Lv.${w.level}`} · ${w.totalDamage} 伤害</strong></li>`;
      })
      .join('');
    const passiveLines = state.passives
      .map((p) => {
        const def = CATALOG.passives[p.passiveId];
        return `<li><span>${def?.name ?? p.passiveId}</span><strong>Lv.${p.level}</strong></li>`;
      })
      .join('');
    statsEl.innerHTML = `
      <div><h4>当前武器</h4><ul>${weaponLines || '<li>无</li>'}</ul></div>
      <div><h4>圣物加成</h4><ul>${passiveLines || '<li>暂无圣物</li>'}</ul></div>
    `;
  }

  const sfxCheck = dialog.querySelector<HTMLInputElement>('#pause-sfx-toggle');
  const bgmCheck = dialog.querySelector<HTMLInputElement>('#pause-bgm-toggle');
  const shakeCheck = dialog.querySelector<HTMLInputElement>('#pause-shake-toggle');
  const dmgCheck = dialog.querySelector<HTMLInputElement>('#pause-dmg-toggle');

  if (sfxCheck) {
    sfxCheck.checked = settings.sfxEnabled;
    sfxCheck.onchange = () =>
      callbacks.onSettingsChange({ ...settings, sfxEnabled: sfxCheck.checked });
  }
  if (bgmCheck) {
    bgmCheck.checked = settings.bgmEnabled;
    bgmCheck.onchange = () =>
      callbacks.onSettingsChange({ ...settings, bgmEnabled: bgmCheck.checked });
  }
  if (shakeCheck) {
    shakeCheck.checked = settings.screenShake;
    shakeCheck.onchange = () =>
      callbacks.onSettingsChange({ ...settings, screenShake: shakeCheck.checked });
  }
  if (dmgCheck) {
    dmgCheck.checked = settings.damageNumbers;
    dmgCheck.onchange = () =>
      callbacks.onSettingsChange({ ...settings, damageNumbers: dmgCheck.checked });
  }

  const resumeBtn = dialog.querySelector<HTMLButtonElement>('#pause-resume-btn');
  const quitBtn = dialog.querySelector<HTMLButtonElement>('#pause-quit-btn');
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      dialog.close('resume');
    };
  }
  if (quitBtn) {
    quitBtn.onclick = () => {
      dialog.close('quit');
    };
  }

  dialog.onclose = () => {
    const val = dialog.returnValue;
    dialog.returnValue = '';
    if (val === 'quit') {
      callbacks.onQuit();
    } else {
      callbacks.onResume();
    }
  };

  if (!dialog.open) {
    dialog.showModal();
  }
}

export function renderResultDialog(
  dialog: HTMLDialogElement,
  victory: boolean,
  state: GameState,
  onContinueEndless: () => void,
  onReturnLobby: () => void
): void {
  const titleEl = dialog.querySelector<HTMLElement>('#result-title');
  const subEl = dialog.querySelector<HTMLElement>('#result-subtitle');
  const statsEl = dialog.querySelector<HTMLElement>('#result-stats');
  const endlessBtn = dialog.querySelector<HTMLButtonElement>('#result-endless-btn');
  const lobbyBtn = dialog.querySelector<HTMLButtonElement>('#result-lobby-btn');

  if (titleEl) {
    titleEl.textContent = victory ? '圣殿加冕 · 胜利通关' : '香油耗尽 · 暂退圣殿';
  }
  if (subEl) {
    subEl.textContent = victory
      ? '你通过了大天使长奶蛙的最终审判——全圣殿公认你足够快乐！'
      : '奶蛙们还在狂笑追击，带走这批功德金币去强化自己吧。';
  }

  const mins = String(Math.floor(state.elapsedSec / 60)).padStart(2, '0');
  const secs = String(Math.floor(state.elapsedSec % 60)).padStart(2, '0');

  if (statsEl) {
    const breakdown = state.weapons
      .map((w) => {
        const def = CATALOG.weapons[w.weaponId];
        return `<li><span>${def?.name ?? w.weaponId}</span><strong>${w.totalDamage.toLocaleString()}</strong></li>`;
      })
      .join('');
    statsEl.innerHTML = `
      <div class="result-kpis">
        <div><span>挑战模式</span><strong>${state.difficulty === 'hard' ? '炼狱高难' : '标准模式'}</strong></div>
        <div><span>存活时间</span><strong>${mins}:${secs}</strong></div>
        <div><span>击退奶蛙</span><strong>${state.kills}</strong></div>
        <div><span>达成等级</span><strong>Lv.${state.player.level}</strong></div>
        <div><span>收获功德</span><strong>+${state.goldEarned}</strong></div>
      </div>
      <div class="result-weapons">
        <h4>武器伤害贡献</h4>
        <ul>${breakdown}</ul>
      </div>
    `;
  }

  if (endlessBtn) {
    endlessBtn.hidden = !victory;
    endlessBtn.onclick = () => {
      dialog.close();
      onContinueEndless();
    };
  }
  if (lobbyBtn) {
    lobbyBtn.onclick = () => {
      dialog.close();
      onReturnLobby();
    };
  }

  if (!dialog.open) {
    dialog.showModal();
  }
}
