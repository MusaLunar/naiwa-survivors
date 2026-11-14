import { CATALOG, MANIFEST } from '../data/catalog.ts';
import type { EnemyDef, GadgetDef, GalleryItem, PassiveDef, SaveData, WeaponDef } from '../data/types.ts';
import type { AssetStore } from '../engine/assetLoader.ts';

type CodexSection = 'enemies' | 'bosses' | 'armory' | 'gallery';

const SECTION_LABELS: Record<CodexSection, string> = {
  enemies: '怪物图鉴',
  bosses: 'Boss 图鉴',
  armory: '武器圣物图鉴',
  gallery: '艺术原画',
};

const GALLERY_CATEGORY_LABELS: Record<string, string> = {
  all: '全部馆藏',
  classic: '圣典名画',
  'laugh-gallery': '大笑藏馆',
  emotes: '表情收藏',
  '4k': '4K 精选',
};

const ENEMY_FILTER_LABELS: Record<string, string> = {
  all: '全部怪物',
  rush: '追击 / 分裂',
  ranged: '远程射手',
  charge_bomb: '冲锋 / 爆破',
  skirmish_elite: '游击 / 精英',
};

const ARMORY_FILTER_LABELS: Record<string, string> = {
  all: '全部武装',
  weapon: '基础武器',
  evolved: '超武进化',
  passive: '圣物被动',
  gadget: '主动战术道具',
};

const BEHAVIOR_BADGES: Record<string, string> = {
  chaser: '近战追击',
  skirmisher: '侧翼蛇形游击',
  ranged: '中距弹幕射手',
  charger: '红线蓄力冲锋',
  splitter: '亡语双生分裂',
  bomber: '延迟爆环炸弹',
  boss_alps_charge: 'Boss · 战马冲锋 + 弹扇',
  boss_blink: 'Boss · 暗影瞬闪 + 齐射',
  boss_twin_merge: 'Boss · 双子合体暴走',
  boss_blackhole: 'Boss · 星渊黑洞引潮',
  boss_archangel: '终极 Boss · 全能审判',
};

const WEAPON_BEHAVIOR_LABELS: Record<string, string> = {
  aura_pulse: '周身范围震波',
  boomerang: '穿刺回旋飞镖',
  orbit: '环绕守卫弹体',
  homing: '自动追踪飞星',
  beam: '穿透聚焦光棱',
  lightning: '随机落雷天罚',
  shotgun: '面向散射连珠',
  zone: '持续燃烧领域',
  lobbed: '抛射爆破飞锤',
};

function findWeaponEvolutionRecipe(id: string): string | null {
  for (const evo of CATALOG.evolutions) {
    if (evo.weaponId === id || evo.evolvedWeaponId === id || evo.passiveId === id) {
      const base = CATALOG.weapons[evo.weaponId]?.name ?? evo.weaponId;
      const pas = CATALOG.passives[evo.passiveId]?.name ?? evo.passiveId;
      const res = CATALOG.weapons[evo.evolvedWeaponId]?.name ?? evo.evolvedWeaponId;
      return `${base} (Lv.5) + ${pas} ➔ ★ ${res}`;
    }
  }
  return null;
}

export function renderCodexDialog(
  dialog: HTMLDialogElement,
  save: SaveData,
  assets: AssetStore,
  onTogglePreviewAll: (enabled: boolean) => void
): void {
  const sectionTabs = dialog.querySelector<HTMLElement>('#codex-section-tabs');
  const grid = dialog.querySelector<HTMLElement>('#codex-grid');
  const tabs = dialog.querySelector<HTMLElement>('#codex-tabs');
  const detail = dialog.querySelector<HTMLElement>('#codex-detail');
  const countEl = dialog.querySelector<HTMLElement>('#codex-count');
  const previewCheck = dialog.querySelector<HTMLInputElement>('#codex-preview-toggle');
  if (!grid || !tabs || !detail) return;

  let activeSection: CodexSection = 'enemies';
  let activeSubFilter = 'all';

  const unlockedArtSet = new Set(save.unlockedCodexIds);
  const discoveredEnemies = new Set(save.discoveredEnemyIds ?? []);
  const discoveredWeapons = new Set(save.discoveredWeaponIds ?? []);

  const allEnemies = Object.values(CATALOG.enemies).filter((e) => !e.isBoss);
  const allBosses = Object.values(CATALOG.enemies).filter((e) => e.isBoss);
  const allGallery = MANIFEST.gallery as GalleryItem[];

  type ArmoryEntry =
    | { kind: 'weapon' | 'evolved'; id: string; name: string; spriteId: string; weapon: WeaponDef }
    | { kind: 'passive'; id: string; name: string; spriteId: string; passive: PassiveDef }
    | { kind: 'gadget'; id: string; name: string; spriteId: string; gadget: GadgetDef };

  const allArmory: ArmoryEntry[] = [
    ...Object.values(CATALOG.weapons).map((w) => ({
      kind: (w.isEvolved ? 'evolved' : 'weapon') as 'weapon' | 'evolved',
      id: w.id,
      name: w.name,
      spriteId: w.spriteId,
      weapon: w,
    })),
    ...Object.values(CATALOG.passives).map((p) => ({
      kind: 'passive' as const,
      id: p.id,
      name: p.name,
      spriteId: p.spriteId,
      passive: p,
    })),
    ...Object.values(CATALOG.gadgets).map((g) => ({
      kind: 'gadget' as const,
      id: g.id,
      name: g.name,
      spriteId: g.spriteId,
      gadget: g,
    })),
  ];

  if (previewCheck) {
    previewCheck.checked = save.settings.codexPreviewAll;
    previewCheck.onchange = () => {
      onTogglePreviewAll(previewCheck.checked);
      renderSectionTabs();
      renderSubTabs();
      renderGrid();
    };
  }

  function showEnemyDetail(enemy: EnemyDef, unlocked: boolean): void {
    if (!detail) return;
    if (!unlocked) {
      detail.innerHTML = `
        <div class="codex-locked-box">
          <strong>${enemy.isBoss ? '未遭遇的名画 Boss' : '未遭遇的圣殿怪物'}</strong>
          <p>在战斗中初次遭遇该${enemy.isBoss ? 'Boss' : '怪物'}（或开启右上角「馆长全览模式」），即可解锁完整属性、技能机制与弱点情报。</p>
        </div>
      `;
      return;
    }
    const artItem = enemy.codexGalleryId
      ? allGallery.find((g) => g.id === enemy.codexGalleryId)
      : undefined;
    const behaviorLabel =
      enemy.behaviorSummary ?? BEHAVIOR_BADGES[enemy.aiBehavior ?? 'chaser'] ?? '普通追击';
    const skillsList = (enemy.skillsSummary ?? [])
      .map((s) => `<li>${s}</li>`)
      .join('');

    detail.innerHTML = `
      <figure class="codex-figure">
        <div class="codex-visual-row">
          <img class="codex-sprite-hero" src="${assets.getUrl(enemy.spriteId)}" alt="${enemy.name}" loading="lazy" />
          ${
            artItem && enemy.isBoss
              ? `<img class="codex-art-mini" src="${artItem.url}" alt="${artItem.title}" loading="lazy" />`
              : ''
          }
        </div>
        <figcaption>
          <span class="codex-cat-pill">${enemy.isBoss ? '名画 Boss' : enemy.isElite ? '圣殿精英' : '常规魔物'} · ${behaviorLabel}</span>
          <h3>${enemy.name}</h3>
          <div class="codex-stats-pills">
            <div><span>基础生命</span><strong>${enemy.baseHp}</strong></div>
            <div><span>移动速度</span><strong>${enemy.speed}</strong></div>
            <div><span>接触伤害</span><strong>${enemy.damage}</strong></div>
            <div><span>经验价值</span><strong>${enemy.xpValue} XP</strong></div>
            <div><span>掉金率</span><strong>${Math.round(enemy.goldChance * 100)}%</strong></div>
          </div>
          ${
            skillsList
              ? `<div class="codex-skill-section"><h4>技能机制情报</h4><ul>${skillsList}</ul></div>`
              : ''
          }
          <p class="codex-lore">${enemy.lore}</p>
        </figcaption>
      </figure>
    `;
  }

  function showArmoryDetail(entry: ArmoryEntry, unlocked: boolean): void {
    if (!detail) return;
    if (!unlocked) {
      detail.innerHTML = `
        <div class="codex-locked-box">
          <strong>未收集武装</strong>
          <p>在战斗中选中或拾取过一次该武器/圣物/战术道具（或开启「馆长全览模式」），即可解锁数值曲线与进化配方。</p>
        </div>
      `;
      return;
    }
    if (entry.kind === 'weapon' || entry.kind === 'evolved') {
      const w = entry.weapon;
      const lv1 = w.levels[0]!;
      const lvMax = w.levels[w.levels.length - 1]!;
      const recipe = findWeaponEvolutionRecipe(w.id);
      detail.innerHTML = `
        <figure class="codex-figure">
          <img class="codex-sprite-hero" src="${assets.getUrl(w.spriteId)}" alt="${w.name}" loading="lazy" />
          <figcaption>
            <span class="codex-cat-pill">${w.isEvolved ? '★ 超武进化' : '圣殿武器'} · ${WEAPON_BEHAVIOR_LABELS[w.behavior] ?? w.behavior}</span>
            <h3>${w.name}</h3>
            <div class="codex-stats-pills">
              <div><span>Lv.1 ➔ Max 伤害</span><strong>${lv1.damage} ➔ ${lvMax.damage}</strong></div>
              <div><span>冷却节拍</span><strong>${lv1.cooldown}s ➔ ${lvMax.cooldown}s</strong></div>
              <div><span>弹体数量</span><strong>${lv1.amount} ➔ ${lvMax.amount}</strong></div>
              <div><span>穿透能力</span><strong>${lvMax.pierce >= 50 ? '无限' : lvMax.pierce}</strong></div>
              <div><span>冲击击退</span><strong>${lvMax.knockback}</strong></div>
            </div>
            ${recipe ? `<div class="codex-recipe-box"><strong>超武配方：</strong>${recipe}</div>` : ''}
            <p class="codex-lore">${w.description}<br /><br />${w.lore}</p>
          </figcaption>
        </figure>
      `;
      return;
    }

    if (entry.kind === 'passive') {
      const p = entry.passive;
      const recipe = findWeaponEvolutionRecipe(p.id);
      detail.innerHTML = `
        <figure class="codex-figure">
          <img class="codex-sprite-hero" src="${assets.getUrl(p.spriteId)}" alt="${p.name}" loading="lazy" />
          <figcaption>
            <span class="codex-cat-pill">圣物被动 · 上限 Lv.${p.maxLevel}</span>
            <h3>${p.name}</h3>
            ${recipe ? `<div class="codex-recipe-box"><strong>进化搭配：</strong>${recipe}</div>` : ''}
            <p class="codex-lore">${p.description}<br /><br />${p.lore}</p>
          </figcaption>
        </figure>
      `;
      return;
    }

    if (entry.kind !== 'gadget') return;
    const g = entry.gadget;
    detail.innerHTML = `
      <figure class="codex-figure">
        <img class="codex-sprite-hero" src="${assets.getUrl(g.spriteId)}" alt="${g.name}" loading="lazy" />
        <figcaption>
          <span class="codex-cat-pill">战场主动战术道具（Q / F 释放）</span>
          <h3>${g.name}</h3>
          <p class="codex-lore">${g.description}</p>
          <p class="codex-source">可在战斗空投补给、精英/Boss 掉落或部分角色技能树开局解锁获得。</p>
        </figcaption>
      </figure>
    `;
  }

  function showGalleryDetail(item: GalleryItem, unlocked: boolean): void {
    if (!detail) return;
    if (!unlocked) {
      detail.innerHTML = `
        <div class="codex-locked-box">
          <strong>未解锁馆藏</strong>
          <p>在战斗中遭遇对应奶蛙或开启馆长预览开关，即可阅读《Orliss/nailong》原版叙事档案。</p>
        </div>
      `;
      return;
    }
    detail.innerHTML = `
      <figure class="codex-figure">
        <img src="${item.url}" alt="${item.title}" loading="lazy" />
        <figcaption>
          <span class="codex-cat-pill">${GALLERY_CATEGORY_LABELS[item.category] ?? item.category}</span>
          <h3>${item.title}</h3>
          <p class="codex-lore">${item.lore.replaceAll('\n', '<br />')}</p>
          <p class="codex-source">原仓路径：<code>${item.sourcePath}</code></p>
        </figcaption>
      </figure>
    `;
  }

  function renderSectionTabs(): void {
    if (!sectionTabs) return;
    sectionTabs.innerHTML = '';
    const counts: Record<CodexSection, [number, number]> = {
      enemies: [
        allEnemies.filter((e) => discoveredEnemies.has(e.id)).length,
        allEnemies.length,
      ],
      bosses: [
        allBosses.filter((b) => discoveredEnemies.has(b.id)).length,
        allBosses.length,
      ],
      armory: [
        allArmory.filter((a) => discoveredWeapons.has(a.id)).length,
        allArmory.length,
      ],
      gallery: [unlockedArtSet.size, allGallery.length],
    };

    (Object.entries(SECTION_LABELS) as [CodexSection, string][]).forEach(([sec, label]) => {
      const [cur, total] = counts[sec];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab-btn section-tab-btn ${activeSection === sec ? 'is-active' : ''}`;
      btn.textContent = `${label} (${cur}/${total})`;
      btn.addEventListener('click', () => {
        activeSection = sec;
        activeSubFilter = 'all';
        renderSectionTabs();
        renderSubTabs();
        renderGrid();
      });
      sectionTabs.appendChild(btn);
    });
  }

  function renderSubTabs(): void {
    if (!tabs) return;
    tabs.innerHTML = '';
    let filterMap: Record<string, string> | null = null;
    if (activeSection === 'enemies') filterMap = ENEMY_FILTER_LABELS;
    else if (activeSection === 'armory') filterMap = ARMORY_FILTER_LABELS;
    else if (activeSection === 'gallery') filterMap = GALLERY_CATEGORY_LABELS;

    if (!filterMap) {
      tabs.hidden = true;
      return;
    }
    tabs.hidden = false;
    for (const [key, label] of Object.entries(filterMap)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab-btn ${activeSubFilter === key ? 'is-active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        activeSubFilter = key;
        renderSubTabs();
        renderGrid();
      });
      tabs.appendChild(btn);
    }
  }

  function renderGrid(): void {
    if (!grid) return;
    const previewAll = save.settings.codexPreviewAll;
    grid.innerHTML = '';

    if (activeSection === 'enemies' || activeSection === 'bosses') {
      const source = activeSection === 'bosses' ? allBosses : allEnemies;
      const filtered = source.filter((e) => {
        if (activeSubFilter === 'all' || activeSection === 'bosses') return true;
        if (activeSubFilter === 'rush') return e.aiBehavior === 'chaser' || e.aiBehavior === 'splitter';
        if (activeSubFilter === 'ranged') return e.aiBehavior === 'ranged';
        if (activeSubFilter === 'charge_bomb') return e.aiBehavior === 'charger' || e.aiBehavior === 'bomber';
        return e.aiBehavior === 'skirmisher' || Boolean(e.isElite);
      });
      const unlockedCount = source.filter((e) => discoveredEnemies.has(e.id)).length;
      if (countEl) {
        countEl.textContent = `${SECTION_LABELS[activeSection]} · 已遭遇 ${unlockedCount} / ${source.length}`;
      }
      let firstShown = false;
      for (const e of filtered) {
        const unlocked = previewAll || discoveredEnemies.has(e.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `codex-tile ${unlocked ? '' : 'is-locked'}`;
        card.innerHTML = unlocked
          ? `<img src="${assets.getUrl(e.spriteId)}" alt="${e.name}" loading="lazy" /><span>${e.name}</span>`
          : `<div class="codex-mystery">?</div><span>未遭遇</span>`;
        card.addEventListener('click', () => showEnemyDetail(e, unlocked));
        grid.appendChild(card);
        if (!firstShown && unlocked) {
          firstShown = true;
          showEnemyDetail(e, true);
        }
      }
      if (!firstShown && filtered[0]) {
        showEnemyDetail(filtered[0], previewAll || discoveredEnemies.has(filtered[0].id));
      }
      return;
    }

    if (activeSection === 'armory') {
      const filtered = allArmory.filter((a) => activeSubFilter === 'all' || a.kind === activeSubFilter);
      const unlockedCount = allArmory.filter((a) => discoveredWeapons.has(a.id)).length;
      if (countEl) {
        countEl.textContent = `武器与圣物图鉴 · 已收集 ${unlockedCount} / ${allArmory.length}`;
      }
      let firstShown = false;
      for (const entry of filtered) {
        const unlocked = previewAll || discoveredWeapons.has(entry.id);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `codex-tile ${unlocked ? '' : 'is-locked'}`;
        card.innerHTML = unlocked
          ? `<img src="${assets.getUrl(entry.spriteId)}" alt="${entry.name}" loading="lazy" /><span>${entry.name}</span>`
          : `<div class="codex-mystery">?</div><span>未收集</span>`;
        card.addEventListener('click', () => showArmoryDetail(entry, unlocked));
        grid.appendChild(card);
        if (!firstShown && unlocked) {
          firstShown = true;
          showArmoryDetail(entry, true);
        }
      }
      if (!firstShown && filtered[0]) {
        showArmoryDetail(filtered[0], previewAll || discoveredWeapons.has(filtered[0].id));
      }
      return;
    }

    // Gallery section
    const filtered =
      activeSubFilter === 'all'
        ? allGallery
        : allGallery.filter((item) => item.category === activeSubFilter);
    if (countEl) {
      countEl.textContent = `艺术原画馆藏 · 已收录 ${unlockedArtSet.size} / ${allGallery.length}`;
    }
    let firstShown = false;
    for (const item of filtered) {
      const unlocked = previewAll || unlockedArtSet.has(item.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `codex-tile ${unlocked ? '' : 'is-locked'}`;
      card.innerHTML = unlocked
        ? `<img src="${item.url}" alt="${item.title}" loading="lazy" /><span>${item.title}</span>`
        : `<div class="codex-mystery">?</div><span>未鉴赏</span>`;
      card.addEventListener('click', () => showGalleryDetail(item, unlocked));
      grid.appendChild(card);
      if (!firstShown && unlocked) {
        firstShown = true;
        showGalleryDetail(item, true);
      }
    }
    if (!firstShown && filtered[0]) {
      showGalleryDetail(filtered[0], false);
    }
  }

  renderSectionTabs();
  renderSubTabs();
  renderGrid();

  dialog.onclose = () => {
    dialog.returnValue = '';
  };

  if (!dialog.open) {
    dialog.showModal();
  }
}
