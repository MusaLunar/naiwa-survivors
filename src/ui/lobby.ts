import { CATALOG, MANIFEST } from '../data/catalog.ts';
import type { GameDifficulty, SaveData, SkillNodeCategory, SkillTreeNodeDef } from '../data/types.ts';
import type { AssetStore } from '../engine/assetLoader.ts';
import {
  computeCharacterTreeEffects,
  getCharacterTreeSpentGold,
  getSkillNodeCost,
  getSkillNodeRank,
  isSkillNodeUnlocked,
  purchaseCharacterUnlock,
  purchaseSkillNode,
  refundLegacyMetaUpgrades,
  resetCharacterSkillTree,
} from '../storage/saveStore.ts';

const SKILL_CAT_META: Record<SkillNodeCategory, { label: string; cls: string }> = {
  stat: { label: '数值提升', cls: 'cat-stat' },
  skill_upgrade: { label: '技能升级', cls: 'cat-skill' },
  mechanic: { label: '新机制', cls: 'cat-mechanic' },
  passive: { label: '被动技能', cls: 'cat-passive' },
  active_skill: { label: '主动技能', cls: 'cat-active' },
  starting_item: { label: '开局道具', cls: 'cat-starter' },
};

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
    const effects = computeCharacterTreeEffects(save, selectedChar.id, CATALOG);
    const sb = effects.statBonuses;
    const effHp = Math.round(selectedChar.stats.maxHp + (sb.maxHp ?? 0));
    const effMight = Math.round((selectedChar.stats.might + (sb.might ?? 0)) * 100);
    const effSpeed = Math.round(selectedChar.stats.moveSpeed * (1 + (sb.moveSpeed ?? 0)));
    const effArmor = (selectedChar.stats.armor + (sb.armor ?? 0)).toFixed(1).replace(/\.0$/, '');
    const effCd = Math.round(Math.max(0.45, selectedChar.stats.cooldown - (sb.cooldown ?? 0)) * 100);
    const effMagnet = Math.round((selectedChar.stats.magnet + (sb.magnet ?? 0)) * 100);

    const enemyCount = (save.discoveredEnemyIds ?? []).length;
    const enemyTotal = Object.keys(CATALOG.enemies).length;
    const weaponCount = (save.discoveredWeaponIds ?? []).length;
    const weaponTotal =
      Object.keys(CATALOG.weapons).length +
      Object.keys(CATALOG.passives).length +
      Object.keys(CATALOG.gadgets).length;

    const startingSummary = [
      ...effects.startingGadgets.map((gid) => CATALOG.gadgets[gid]?.name ?? gid),
      ...effects.startingPassives.map((pid) => `${CATALOG.passives[pid]?.name ?? pid} Lv.1`),
    ];

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
          <button id="open-codex-btn" type="button" class="btn-secondary">圣殿图鉴 · 怪 ${enemyCount}/${enemyTotal} · 器 ${weaponCount}/${weaponTotal}</button>
        </div>
      </header>

      <nav class="lobby-nav" aria-label="圣殿功能切换">
        <button type="button" data-tab="characters" class="nav-pill ${this.activePanel === 'characters' ? 'is-active' : ''}">1. 选择奶蛙</button>
        <button type="button" data-tab="stages" class="nav-pill ${this.activePanel === 'stages' ? 'is-active' : ''}">2. 选择展厅地图</button>
        <button type="button" data-tab="shop" class="nav-pill ${this.activePanel === 'shop' ? 'is-active' : ''}">3. 角色技能树</button>
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
                <span>主动切态</span>
                <strong>${selectedChar.activeSkill.name} (${(selectedChar.activeSkill.cooldownSec * effects.skillCdMult).toFixed(1).replace(/\.0$/, '')}s)</strong>
              </div>
              <p class="summary-skill-desc">${selectedChar.activeSkill.description}</p>
              <div class="form-preview-pair">
                <div class="form-chip is-primary"><b>主态 · ${selectedChar.activeSkill.primaryFormName}</b><span>${selectedChar.activeSkill.primaryFormDesc}</span></div>
                <div class="form-chip is-awakened"><b>觉态 · ${selectedChar.activeSkill.awakenedFormName}</b><span>${selectedChar.activeSkill.awakenedFormDesc}</span></div>
              </div>
            </div>
            ${
              startingSummary.length > 0
                ? `<div class="summary-starters"><span>技能树开局自带</span><strong>${startingSummary.join(' · ')}</strong></div>`
                : ''
            }
            <div class="summary-stats-grid" aria-label="角色当前属性（含技能树加成）">
              <div><span>生命</span><strong>${effHp}</strong></div>
              <div><span>攻击</span><strong>${effMight}%</strong></div>
              <div><span>移速</span><strong>${effSpeed}</strong></div>
              <div><span>护甲</span><strong>${effArmor}</strong></div>
              <div><span>冷却</span><strong>${effCd}%</strong></div>
              <div><span>拾取</span><strong>${effMagnet}%</strong></div>
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
            <strong>主动双态 · ${ch.activeSkill.name}</strong>
            <span>${ch.activeSkill.cooldownSec}s</span>
          </div>
          <p class="card-skill-desc">${ch.activeSkill.primaryFormName} ⇄ ${ch.activeSkill.awakenedFormName} · ${ch.activeSkill.description}</p>
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
    const charList = Object.values(CATALOG.characters);
    const activeChar = CATALOG.characters[this.selectedCharId] ?? charList[0]!;
    const charUnlocked = save.unlockedCharacters.includes(activeChar.id);
    const tree: SkillTreeNodeDef[] = CATALOG.skillTrees[activeChar.id] ?? [];
    const spentGold = getCharacterTreeSpentGold(save, activeChar.id, CATALOG);
    const hasLegacyMeta = Object.values(save.metaRanks).some((r) => r > 0);

    // Build header hero switcher + reset + legacy refund notice
    const wrap = document.createElement('div');
    wrap.className = 'skill-tree-panel';

    const selectorHtml = charList
      .map((ch) => {
        const isSel = ch.id === activeChar.id;
        const isUnk = save.unlockedCharacters.includes(ch.id);
        return `<button type="button" data-tree-char="${ch.id}" class="tree-hero-pill ${isSel ? 'is-active' : ''} ${isUnk ? '' : 'is-locked'}">
          <img src="${this.assets.getUrl(ch.spriteId)}" alt="" width="24" height="24" />
          <span>${ch.name}${isUnk ? '' : ' 🔒'}</span>
        </button>`;
      })
      .join('');

    wrap.innerHTML = `
      <div class="tree-hero-bar" role="tablist" aria-label="切换角色技能树">${selectorHtml}</div>
      ${
        hasLegacyMeta
          ? `<div class="legacy-refund-banner">
              <span>检测到旧版「香油功德强化」存档：可一键无损退还全部金币，自由投入各角色专属技能树！</span>
              <button type="button" id="refund-legacy-btn" class="btn-secondary">退还旧功德金币</button>
            </div>`
          : ''
      }
      <div class="tree-toolbar">
        <div>
          <h3>${activeChar.name} · 专属分支技能树</h3>
          <p class="tree-toolbar-sub">含数值提升、技能升级、专属新机制、被动特质、双态奥义与开局自带道具</p>
        </div>
        <div class="tree-toolbar-actions">
          <span class="tree-spent-pill">已投入 ${spentGold} 功德</span>
          <button type="button" id="tree-reset-btn" class="btn-secondary" ${spentGold <= 0 ? 'disabled' : ''}>洗点重置返还</button>
        </div>
      </div>
    `;

    // Build 4-tier x 3-col visual branching tree stage with SVG connectors
    const stage = document.createElement('div');
    stage.className = 'skill-tree-stage';

    const colCenters = [150, 450, 750];
    const rowCenters = [68, 206, 344, 482];
    const svgLines: string[] = [];
    for (const node of tree) {
      if (!node.requires || node.requires.length === 0) continue;
      const x2 = colCenters[node.col - 1] ?? 450;
      const y2 = rowCenters[node.tier - 1] ?? 206;
      const unlocked = isSkillNodeUnlocked(save, activeChar.id, node);
      const owned = getSkillNodeRank(save, activeChar.id, node.id) > 0;
      for (const reqId of node.requires) {
        const parent = tree.find((n) => n.id === reqId);
        if (!parent) continue;
        const x1 = colCenters[parent.col - 1] ?? 450;
        const y1 = rowCenters[parent.tier - 1] ?? 68;
        const midY = (y1 + y2) / 2;
        const cls = owned ? 'edge-owned' : unlocked ? 'edge-ready' : 'edge-locked';
        svgLines.push(
          `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" class="tree-edge ${cls}" />`
        );
      }
    }

    const svgEl = `<svg class="skill-tree-svg" viewBox="0 0 900 550" preserveAspectRatio="none" aria-hidden="true">${svgLines.join('')}</svg>`;
    const grid = document.createElement('div');
    grid.className = 'skill-tree-grid';

    for (const node of tree) {
      const rank = getSkillNodeRank(save, activeChar.id, node.id);
      const maxed = rank >= node.maxRank;
      const prereqOk = isSkillNodeUnlocked(save, activeChar.id, node);
      const cost = getSkillNodeCost(node, rank);
      const canBuy = charUnlocked && prereqOk && !maxed && save.gold >= cost;
      const catMeta = SKILL_CAT_META[node.category];

      const card = document.createElement('article');
      card.className = `tree-node ${rank > 0 ? 'is-owned' : prereqOk ? 'is-available' : 'is-locked'} ${maxed ? 'is-maxed' : ''}`;
      card.style.gridRow = String(node.tier);
      card.style.gridColumn = String(node.col);
      card.innerHTML = `
        <div class="tree-node-top">
          <span class="tree-cat-badge ${catMeta.cls}">${catMeta.label}</span>
          <span class="rank-pill">${rank}/${node.maxRank}</span>
        </div>
        <div class="tree-node-body">
          <img src="${this.assets.getUrl(node.spriteId)}" alt="${node.name}" width="44" height="44" />
          <div>
            <h4>${node.name}</h4>
            <p>${node.description}</p>
          </div>
        </div>
        <button type="button" class="tree-node-btn ${canBuy ? 'btn-primary' : 'btn-secondary'}" ${canBuy ? '' : 'disabled'}>
          ${
            !charUnlocked
              ? '需先解锁该角色'
              : maxed
                ? '已点满'
                : !prereqOk
                  ? '前置未解锁'
                  : `点亮 / 升级 (${cost} 功德)`
          }
        </button>
      `;

      card.querySelector('button')?.addEventListener('click', () => {
        if (!charUnlocked) return;
        if (purchaseSkillNode(save, activeChar.id, node.id, CATALOG)) {
          handlers.onSaveUpdated();
          this.render(save, handlers);
        }
      });

      grid.appendChild(card);
    }

    stage.innerHTML = svgEl;
    stage.appendChild(grid);
    wrap.appendChild(stage);
    container.appendChild(wrap);

    wrap.querySelectorAll<HTMLButtonElement>('[data-tree-char]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCharId = btn.dataset.treeChar!;
        this.render(save, handlers);
      });
    });

    wrap.querySelector('#tree-reset-btn')?.addEventListener('click', () => {
      const refunded = resetCharacterSkillTree(save, activeChar.id, CATALOG);
      if (refunded > 0) {
        handlers.onSaveUpdated();
        this.render(save, handlers);
      }
    });

    wrap.querySelector('#refund-legacy-btn')?.addEventListener('click', () => {
      refundLegacyMetaUpgrades(save, CATALOG);
      handlers.onSaveUpdated();
      this.render(save, handlers);
    });
  }
}
