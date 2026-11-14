import { describe, expect, it } from 'vitest';
import { SoundEngine } from '../src/audio/soundEngine.ts';
import type { GameSettings } from '../src/data/types.ts';

class MockAudioElement {
  src: string;
  loop = false;
  preload = '';
  volume = 1;
  paused = true;
  currentTime = 0;
  playCalls = 0;
  pauseCalls = 0;
  shouldRejectPlay = false;

  constructor(src: string) {
    this.src = src;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.shouldRejectPlay) {
      return Promise.reject(new Error('NotAllowedError'));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }
}

function makeSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    masterVolume: 0.8,
    sfxEnabled: true,
    bgmEnabled: true,
    screenShake: true,
    damageNumbers: true,
    codexPreviewAll: false,
    clearProjectiles: true,
    ...overrides,
  };
}

function withMockAudioGlobals(
  run: (instances: MockAudioElement[]) => void
): void {
  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevAudio = (globalThis as Record<string, unknown>).Audio;
  const instances: MockAudioElement[] = [];

  (globalThis as Record<string, unknown>).window = {};
  (globalThis as Record<string, unknown>).Audio = class {
    constructor(src: string) {
      const mock = new MockAudioElement(src);
      instances.push(mock);
      return mock as unknown as HTMLAudioElement;
    }
  };

  try {
    run(instances);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWindow;
    }
    if (prevAudio === undefined) {
      delete (globalThis as Record<string, unknown>).Audio;
    } else {
      (globalThis as Record<string, unknown>).Audio = prevAudio;
    }
  }
}

describe('SoundEngine custom battle BGM', () => {
  it('streams looping battle-bgm.m4a and resets on stopBgm', () => {
    withMockAudioGlobals((instances) => {
      const engine = new SoundEngine(makeSettings({ masterVolume: 0.8, bgmEnabled: true }));
      engine.startBgm();

      expect(instances).toHaveLength(1);
      const audio = instances[0]!;
      expect(audio.src).toBe('./assets/audio/battle-bgm.m4a');
      expect(audio.loop).toBe(true);
      expect(audio.preload).toBe('auto');
      expect(audio.volume).toBeCloseTo(0.36, 4);
      expect(audio.playCalls).toBe(1);
      expect(audio.paused).toBe(false);

      audio.currentTime = 42.5;
      engine.updateSettings(makeSettings({ masterVolume: 1.0, bgmEnabled: true }));
      expect(audio.volume).toBeCloseTo(0.45, 4);

      engine.stopBgm();
      expect(audio.pauseCalls).toBe(1);
      expect(audio.paused).toBe(true);
      expect(audio.currentTime).toBe(0);
    });
  });

  it('does not play BGM when disabled and retries deferred play on unlock', () => {
    withMockAudioGlobals((instances) => {
      const engine = new SoundEngine(makeSettings({ bgmEnabled: false }));
      engine.startBgm();
      expect(instances).toHaveLength(0);

      engine.updateSettings(makeSettings({ bgmEnabled: true }));
      engine.startBgm();
      expect(instances).toHaveLength(1);
      const audio = instances[0]!;
      audio.pause();
      audio.shouldRejectPlay = true;
      engine.startBgm();
      expect(audio.playCalls).toBe(2);
      expect(audio.paused).toBe(true);

      audio.shouldRejectPlay = false;
      engine.unlock();
      expect(audio.playCalls).toBe(3);
      expect(audio.paused).toBe(false);

      engine.updateSettings(makeSettings({ bgmEnabled: false }));
      expect(audio.paused).toBe(true);
    });
  });
});
