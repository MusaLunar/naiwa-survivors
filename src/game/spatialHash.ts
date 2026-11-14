interface SpatialEntry {
  index: number;
  x: number;
  y: number;
  radius: number;
}

/**
 * Uniform 2D spatial hash grid for fast O(1) amortized circle neighborhood queries.
 * Reuses internal bucket arrays across frames to minimize GC pressure.
 */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, SpatialEntry[]>();
  private readonly activeKeys: number[] = [];

  constructor(cellSize = 96) {
    this.cellSize = cellSize;
  }

  private hashCell(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    for (let i = 0; i < this.activeKeys.length; i++) {
      const bucket = this.buckets.get(this.activeKeys[i]!);
      if (bucket) bucket.length = 0;
    }
    this.activeKeys.length = 0;
  }

  insert(index: number, x: number, y: number, radius: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const key = this.hashCell(cx, cy);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    if (bucket.length === 0) {
      this.activeKeys.push(key);
    }
    bucket.push({ index, x, y, radius });
  }

  /**
   * Append indices of entries overlapping circle (x, y, radius + entry.radius) into `out`.
   */
  queryCircle(x: number, y: number, radius: number, out: number[], maxEntityRadius = 64): number[] {
    out.length = 0;
    const reach = radius + maxEntityRadius;
    const minCx = Math.floor((x - reach) / this.cellSize);
    const maxCx = Math.floor((x + reach) / this.cellSize);
    const minCy = Math.floor((y - reach) / this.cellSize);
    const maxCy = Math.floor((y + reach) / this.cellSize);

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.buckets.get(this.hashCell(cx, cy));
        if (!bucket || bucket.length === 0) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i]!;
          const dx = e.x - x;
          const dy = e.y - y;
          const rSum = radius + e.radius;
          if (dx * dx + dy * dy <= rSum * rSum) {
            out.push(e.index);
          }
        }
      }
    }
    return out;
  }
}
