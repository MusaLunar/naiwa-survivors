import { MANIFEST } from '../data/catalog.ts';

export class AssetStore {
  private readonly images = new Map<string, HTMLImageElement>();
  private loaded = false;

  async preloadAll(onProgress?: (ratio: number) => void): Promise<void> {
    if (this.loaded) {
      onProgress?.(1);
      return;
    }

    const entries: Array<[string, string]> = [];
    for (const [id, item] of Object.entries(MANIFEST.sprites)) {
      entries.push([id, item.url]);
    }
    for (const [id, item] of Object.entries(MANIFEST.medallions)) {
      entries.push([id, item.url]);
    }
    const tiles = (MANIFEST as { tiles?: Record<string, { url: string }> }).tiles ?? {};
    for (const [id, item] of Object.entries(tiles)) {
      entries.push([id, item.url]);
    }

    let done = 0;
    const total = Math.max(1, entries.length);

    await Promise.all(
      entries.map(
        ([id, url]) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
              this.images.set(id, img);
              done += 1;
              onProgress?.(done / total);
              resolve();
            };
            img.onerror = () => {
              done += 1;
              onProgress?.(done / total);
              resolve();
            };
            img.src = url;
          })
      )
    );

    this.loaded = true;
  }

  getSprite(id: string): HTMLImageElement | undefined {
    return this.images.get(id);
  }

  getUrl(id: string): string {
    const sprites = MANIFEST.sprites as Record<string, { url?: string }>;
    const medallions = MANIFEST.medallions as Record<string, { url?: string }>;
    const tiles = (MANIFEST as { tiles?: Record<string, { url?: string }> }).tiles ?? {};
    return sprites[id]?.url ?? medallions[id]?.url ?? tiles[id]?.url ?? MANIFEST.logoUrl;
  }
}
