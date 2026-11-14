import { CATALOG, MANIFEST } from '../data/catalog.ts';
import type { GameDifficulty, SaveData } from '../data/types.ts';
import type { AssetStore } from '../engine/assetLoader.ts';
import {
  getMetaUpgradeCost,
  purchaseCharacterUnlock,
  purchaseMetaUpgrade,
} from '../storage/saveStore.ts';

export interface LobbySelection {
  characterId: string;
  stageId: string;
  difficulty: GameDifficulty;
}

export class LobbyView {
  private readonly root: HTMLElement;
  private readonly assets: AssetStore;
  private selectedCharId = 'char-classic';
  private selectedStageId = 'stage-sanctuary';
  private selectedDifficulty: GameDifficulty = 'normal';
  private activePanel: 'characters' | 'stages' | 'shop' = 'characters';

  constructor(root: HTMLElement, assets: AssetStore) {
    this.root = root;
    this.assets = assets;
  }

  render(
    save: SaveData,
    handlers: {
      onSaveUpdated: () => void;
      onStartRun: (sel: LobbySelection) => void;
      onOpenCodex: () => void;
    }
  ): void {
    const mins = Math.floor(save.bestSurvivalSec / 60);
    const secs = Math.floor(save.bestSurvivalSec % 60);
    const selectedChar = CATALOG.characters[this.selectedCharId] ?? Object.values(CATALOG.characters)[0]!;
    const selectedStage = CATALOG.stages[this.selectedStageId] ?? Object.values(CATALOG.stages)[0]!;

    this.root.innerHTML = `
      <header class="lobby-header">
        <div class="brand-lockup">
          <img class="brand-logo" src="${MANIFEST.logoUrl}" alt="奶蛙艺术圣殿" width="56" height="56" />
          <div>
            <h1>奶蛙幸存者</h1>
            <p class="subtitle">NAIWA SURVIVORS · 奶蛙艺术圣殿外传</p>
          </div>
        </div>
        <div class="lobby-metrics">
          <div class="metric-pill"><span>香油功德</span><strong>${save.gold}</strong></div>
          <div class="metric-pill"><span>最高击退</span><strong>${save.bestKills}</strong></div>
          <div class="metric-pill"><span>最长存活</span><strong>${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}</strong></div>
          <button id="open-codex-btn" type="button" class="btn-secondary">圣殿图鉴 (${save.unlockedCodexIds.length}/${MANIFEST.gallery.length})</button>
        </div>
      </header>

      <nav class="lobby-nav" aria-label="圣殿功能切换">
        <button type="button" data-tab="characters" class="nav-pill ${this.activePanel === 'characters' ? 'is-active' : ''}">1. 选择奶蛙</button>
        <button type="button" data-tab="stages" class="nav-pill ${this.activePanel === 'stages' ? 'is-active' : ''}">2. 选择展厅地图</button>
        <button type="button" data-tab="shop" class="nav-pill ${this.activePanel === 'shop' ? 'is-active' : ''}">3. 香油功德强化</button>
      </nav>

      <main class="lobby-main">
        <section class="lobby-content" id="lobby-panel-content"></section>
        <aside class="lobby-summary">
          <div class="summary-card">
            <img class="summary-avatar" src="${this.assets.getUrl(selectedChar.spriteId)}" alt="${selectedChar.name}" width="120" height="120" />
            <h2>${selectedChar.name}</h2>
            <p class="summary-sub">${selectedChar.subtitle}</p>
            <p class="summary-lore">${selectedChar.lore}</p>
            <div class="summary-skill-box">
              <div class="summary-row">
                <span>主动技能</span>
                <strong>${selectedChar.activeSkill.name} (${selectedChar.activeSkill.cooldownSec}s)</strong>
              </div>
              <p class="summary-skill-desc">${selectedChar.activeSkill.description}</p>
            </div>
            <div class="summary-stats-grid" aria-label="角色基础属性">
              <div><span>生命</span><strong>${selectedChar.stats.maxHp}</strong></div>
              <div><span>攻击</span><strong>${Math.round(selectedChar.stats.might * 100)}%</strong></div>
              <div><span>移速</span><strong>${selectedChar.stats.moveSpeed}</strong></div>
              <div><span>护甲</span><strong>${selectedChar.stats.armor}</strong></div>
              <div><span>冷却</span><strong>${Math.round(selectedChar.stats.cooldown * 100)}%</strong></div>
              <div><span>拾取</span><strong>${Math.round(selectedChar.stats.magnet * 100)}%</strong></div>
            </div>
            <div class="summary-row">
              <span>出战展厅</span>
              <strong>${selectedStage.name}</strong>
            </div>
            <div class="summary-difficulty-box">
              <div class="summary-row">
                <span>挑战难度</span>
                <strong>${this.selectedDifficulty === 'hard' ? '炼狱高难 (+60% 功德)' : '标准模式'}</strong>
              </div>
              <div class="difficulty-toggle-group" role="group" aria-label="选择游戏难度">
                <button type="button" data-difficulty="normal" class="diff-btn ${this.selectedDifficulty === 'normal' ? 'is-active' : ''}">
                  标准模式
                </button>
                <button type="button" data-difficulty="hard" class="diff-btn is-hard ${this.selectedDifficulty === 'hard' ? 'is-active' : ''}">
                  炼狱高难 🔥
                </button>
              </div>
              ${
                this.selectedDifficulty === 'hard'
                  ? '<p class="diff-warning">高难修正：敌生命 +78% · 伤害 +65% · 移速 +24% · 刷怪 +55% · Boss 技能冷却加速</p>'
                  : ''
              }
            </div>
            <button id="start-run-btn" type="button" class="btn-primary">
              ${this.selectedDifficulty === 'hard' ? '挑战炼狱高难 · 进入圣殿' : '踏入圣殿开始生存'}
            </button>
          </div>
        </aside>
      </main>

      <footer class="lobby-footer">
        <p>${MANIFEST.attribution.notice} · <a href="${MANIFEST.attribution.url}" target="_blank" rel="noopener noreferrer">Orliss/nailong (MIT)</a></p>
      </footer>
    `;

    this.root.querySelector('#open-codex-btn')?.addEventListener('click', handlers.onOpenCodex);
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activePanel = btn.dataset.tab as 'characters' | 'stages' | 'shop';
        this.render(save, handlers);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedDifficulty = btn.dataset.difficulty === 'hard' ? 'hard' : 'normal';
        this.render(save, handlers);
      });
    });
    this.root.querySelector('#start-run-btn')?.addEventListener('click', () => {
      handlers.onStartRun({
        characterId: this.selectedCharId,
        stageId: this.selectedStageId,
        difficulty: this.selectedDifficulty,
      });
    });

    const contentEl = this.root.querySelector<HTMLElement>('#lobby-panel-content');
    if (!contentEl) return;

    if (this.activePanel === 'characters') {
      this.renderCharacters(contentEl, save, handlers);
    } else if (this.activePanel === 'stages') {
      this.renderStages(contentEl, save, handlers);
    } else {
      this.renderShop(contentEl, save, handlers);
    }
  }

  private renderCharacters(
    container: HTMLElement,
    save: SaveData,
    handlers: { onSaveUpdated: () => void; onStartRun: (sel: LobbySelection) => void; onOpenCodex: () => void }
  ): void {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    for (const ch of Object.values(CATALOG.characters)) {
      const unlocked = save.unlockedCharacters.includes(ch.id);
      const selected = this.selectedCharId === ch.id;
      const card = document.createElement('article');
      card.className = `select-card ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`;
      card.innerHTML = `
        <img src="${this.assets.getUrl(ch.spriteId)}" alt="${ch.name}" width="96" height="96" />
        <div class="card-info">
          <h3>${ch.name}</h3>
          <p class="card-sub">${ch.subtitle}</p>
          <div class="card-skill-badge">
            <strong>主动技 · ${ch.activeSkill.name}</strong>
            <span>${ch.activeSkill.cooldownSec}s</span>
          </div>
          <p class="card-skill-desc">${ch.activeSkill.description}</p>
          <div class="card-stat-row">
            <span>生命 ${ch.stats.maxHp}</span>
            <span>攻击 ${Math.round(ch.stats.might * 100)}%</span>
            <span>移速 ${ch.stats.moveSpeed}</span>
            <span>护甲 ${ch.stats.armor}</span>
            <span>冷却 ${Math.round(ch.stats.cooldown * 100)}%</span>
          </div>
          <div class="card-actions">
            ${
              unlocked
                ? `<button type="button" class="${selected ? 'btn-primary' : 'btn-secondary'}">${selected ? '已出战选择' : '选择该奶蛙'}</button>`
                : `<button type="button" class="btn-secondary" ${save.gold < ch.unlockCost ? 'disabled' : ''}>解锁 (${ch.unlockCost} 功德)</button>`
            }
          </div>
        </div>
      `;
      card.querySelector('button')?.addEventListener('click', () => {
        if (unlocked) {
          this.selectedCharId = ch.id;
          this.render(save, handlers);
        } else if (purchaseCharacterUnlock(save, ch.id)) {
          this.selectedCharId = ch.id;
          handlers.onSaveUpdated();
          this.render(save, handlers);
        }
      });
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  private renderStages(
    container: HTMLElement,
    save: SaveData,
    handlers: { onSaveUpdated: () => void; onStartRun: (sel: LobbySelection) => void; onOpenCodex: () => void }
  ): void {
    const grid = document.createElement('div');
    grid.className = 'stages-grid';
    for (const st of Object.values(CATALOG.stages)) {
      const selected = this.selectedStageId === st.id;
      const cleared = save.clearedStages.includes(st.id);
      const clearedHard = (save.clearedHardStages ?? []).includes(st.id);
      const card = document.createElement('article');
      card.className = `stage-card ${selected ? 'is-selected' : ''}`;
      card.innerHTML = `
        <img src="${st.bannerUrl}" alt="${st.name}" />
        <div class="stage-body">
          <div class="stage-head">
            <h3>${st.name}</h3>
            <div class="stage-badges">
              ${cleared ? '<span class="cleared-badge">已加冕</span>' : ''}
              ${clearedHard ? '<span class="cleared-hard-badge">炼狱制霸</span>' : ''}
            </div>
          </div>
          <p class="card-sub">${st.subtitle}</p>
          <p>${st.description}</p>
          <button type="button" class="${selected ? 'btn-primary' : 'btn-secondary'}">
            ${selected ? '当前选定展厅' : '切换至此展厅'}
          </button>
        </div>
      `;
      card.querySelector('button')?.addEventListener('click', () => {
        this.selectedStageId = st.id;
        this.render(save, handlers);
      });
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  private renderShop(
    container: HTMLElement,
    save: SaveData,
    handlers: { onSaveUpdated: () => void; onStartRun: (sel: LobbySelection) => void; onOpenCodex: () => void }
  ): void {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';
    for (const upg of CATALOG.metaUpgrades) {
      const rank = save.metaRanks[upg.id] ?? 0;
      const maxed = rank >= upg.maxRank;
      const cost = getMetaUpgradeCost(upg, rank);
      const card = document.createElement('article');
      card.className = 'select-card';
      card.innerHTML = `
        <img src="${this.assets.getUrl(upg.spriteId)}" alt="${upg.name}" width="72" height="72" />
        <div class="card-info">
          <h3>${upg.name} <span class="rank-pill">${rank}/${upg.maxRank}</span></h3>
          <p>${upg.description}</p>
          <div class="card-actions">
            <button type="button" class="btn-secondary" ${maxed || save.gold < cost ? 'disabled' : ''}>
              ${maxed ? '已臻圆满' : `供奉强化 (${cost} 功德)`}
            </button>
          </div>
        </div>
      `;
      card.querySelector('button')?.addEventListener('click', () => {
        if (purchaseMetaUpgrade(save, upg.id)) {
          handlers.onSaveUpdated();
          this.render(save, handlers);
        }
      });
      grid.appendChild(card);
    }
    container.appendChild(grid);
  }
}
