import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/game/spatialHash.ts';

describe('SpatialHash', () => {
  it('finds entries within circle across cell boundaries and clears cleanly', () => {
    const grid = new SpatialHash(64);
    grid.insert(0, 62, 62, 16);
    grid.insert(1, 70, 66, 16);
    grid.insert(2, 420, 420, 16);

    const out: number[] = [];
    grid.queryCircle(64, 64, 24, out, 32);
    expect(out.sort((a, b) => a - b)).toEqual([0, 1]);

    grid.clear();
    grid.queryCircle(64, 64, 100, out, 32);
    expect(out).toEqual([]);
  });
});
