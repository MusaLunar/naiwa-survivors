import { MANIFEST } from '../data/catalog.ts';
import type { GalleryItem, SaveData } from '../data/types.ts';

const CATEGORY_LABELS: Record<string, string> = {
  all: '全部馆藏',
  classic: '圣典名画',
  'laugh-gallery': '大笑藏馆',
  emotes: '表情收藏',
  '4k': '4K 精选',
};

export function renderCodexDialog(
  dialog: HTMLDialogElement,
  save: SaveData,
  onTogglePreviewAll: (enabled: boolean) => void
): void {
  const grid = dialog.querySelector<HTMLElement>('#codex-grid');
  const tabs = dialog.querySelector<HTMLElement>('#codex-tabs');
  const detail = dialog.querySelector<HTMLElement>('#codex-detail');
  const countEl = dialog.querySelector<HTMLElement>('#codex-count');
  const previewCheck = dialog.querySelector<HTMLInputElement>('#codex-preview-toggle');
  if (!grid || !tabs || !detail) return;

  let activeCategory = 'all';
  const unlockedSet = new Set(save.unlockedCodexIds);
  const allItems = MANIFEST.gallery as GalleryItem[];

  if (previewCheck) {
    previewCheck.checked = save.settings.codexPreviewAll;
    previewCheck.onchange = () => {
      onTogglePreviewAll(previewCheck.checked);
      renderGrid();
    };
  }

  function showDetail(item: GalleryItem, unlocked: boolean): void {
    if (!detail) return;
    if (!unlocked) {
      detail.innerHTML = `
        <div class="codex-locked-box">
          <strong>未解锁馆藏</strong>
          <p>在战斗中遭遇对应奶蛙或开启圣殿预览开关，即可阅读《Orliss/nailong》原版叙事档案。</p>
        </div>
      `;
      return;
    }
    detail.innerHTML = `
      <figure class="codex-figure">
        <img src="${item.url}" alt="${item.title}" loading="lazy" />
        <figcaption>
          <span class="codex-cat-pill">${CATEGORY_LABELS[item.category] ?? item.category}</span>
          <h3>${item.title}</h3>
          <p class="codex-lore">${item.lore.replaceAll('\n', '<br />')}</p>
          <p class="codex-source">原仓路径：<code>${item.sourcePath}</code></p>
        </figcaption>
      </figure>
    `;
  }

  function renderTabs(): void {
    if (!tabs) return;
    tabs.innerHTML = '';
    for (const [cat, label] of Object.entries(CATEGORY_LABELS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab-btn ${activeCategory === cat ? 'is-active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        activeCategory = cat;
        renderTabs();
        renderGrid();
      });
      tabs.appendChild(btn);
    }
  }

  function renderGrid(): void {
    if (!grid) return;
    const previewAll = save.settings.codexPreviewAll;
    const filtered =
      activeCategory === 'all'
        ? allItems
        : allItems.filter((item) => item.category === activeCategory);

    if (countEl) {
      countEl.textContent = `已收录 ${unlockedSet.size} / ${allItems.length} 件圣殿馆藏`;
    }

    grid.innerHTML = '';
    let firstShown = false;
    for (const item of filtered) {
      const unlocked = previewAll || unlockedSet.has(item.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `codex-tile ${unlocked ? '' : 'is-locked'}`;
      card.innerHTML = unlocked
        ? `<img src="${item.url}" alt="${item.title}" loading="lazy" /><span>${item.title}</span>`
        : `<div class="codex-mystery">?</div><span>未鉴赏</span>`;
      card.addEventListener('click', () => showDetail(item, unlocked));
      grid.appendChild(card);

      if (!firstShown && unlocked) {
        firstShown = true;
        showDetail(item, true);
      }
    }
    if (!firstShown && filtered[0]) {
      showDetail(filtered[0], false);
    }
  }

  renderTabs();
  renderGrid();

  dialog.onclose = () => {
    dialog.returnValue = '';
  };

  if (!dialog.open) {
    dialog.showModal();
  }
}
