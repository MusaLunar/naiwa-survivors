import type { GameSettings } from '../data/types.ts';
import type { SimEvent } from '../game/state.ts';

const BATTLE_BGM_SRC = './assets/audio/battle-bgm.m4a';
const BGM_VOLUME_SCALE = 0.45;

/**
 * Web Audio sound effects synthesizer paired with streaming custom battle BGM playback.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmWanted = false;
  private readonly bgmSrc: string;
  private xpStreak = 0;
  private lastXpTime = 0;
  private lastHitTime = 0;
  private settings: GameSettings;

  constructor(settings: GameSettings, bgmSrc = BATTLE_BGM_SRC) {
    this.settings = { ...settings };
    this.bgmSrc = bgmSrc;
  }

  private getBgmVolume(): number {
    return Math.max(0, Math.min(1, this.settings.masterVolume * BGM_VOLUME_SCALE));
  }

  private ensureBgmAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.bgmAudio) {
      const audio = new Audio(this.bgmSrc);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = this.getBgmVolume();
      this.bgmAudio = audio;
    }
    return this.bgmAudio;
  }

  private tryPlayBgm(): void {
    if (!this.bgmWanted || !this.settings.bgmEnabled) return;
    const audio = this.ensureBgmAudio();
    if (!audio) return;
    audio.volume = this.getBgmVolume();
    if (!audio.paused) return;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      void playPromise.catch(() => {
        // Autoplay may wait until the next user gesture triggers unlock()
      });
    }
  }

  updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.settings.masterVolume,
        this.ctx.currentTime,
        0.03
      );
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.getBgmVolume();
    }
    if (!this.settings.bgmEnabled) {
      this.stopBgm();
    }
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.settings.masterVolume;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    }
    if (this.bgmWanted && this.settings.bgmEnabled) {
      this.tryPlayBgm();
    }
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.settings.sfxEnabled || !this.ctx || !this.masterGain) return;
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  processEvents(events: SimEvent[]): void {
    if (!this.ctx || this.ctx.state !== 'running') {
      events.length = 0;
      return;
    }
    const nowMs = performance.now();
    for (const ev of events) {
      switch (ev.type) {
        case 'hit':
          if (nowMs - this.lastHitTime > 52) {
            this.lastHitTime = nowMs;
            this.playTone(210, 120, 0.06, 'triangle', 0.07);
          }
          break;
        case 'kill':
          this.playTone(340, 190, 0.08, 'sine', 0.08);
          break;
        case 'pickup_xp':
          if (nowMs - this.lastXpTime < 450) {
            this.xpStreak = Math.min(12, this.xpStreak + 1);
          } else {
            this.xpStreak = 0;
          }
          this.lastXpTime = nowMs;
          this.playTone(480 + this.xpStreak * 42, 620 + this.xpStreak * 45, 0.07, 'sine', 0.09);
          break;
        case 'pickup_gold':
          this.playTone(880, 1320, 0.11, 'triangle', 0.11);
          break;
        case 'pickup_buff':
          this.playTone(587.33, 1174.66, 0.22, 'triangle', 0.14);
          break;
        case 'bomb_blast':
          this.playTone(190, 58, 0.42, 'sawtooth', 0.16);
          setTimeout(() => this.playTone(523.25, 1046.5, 0.25, 'triangle', 0.12), 60);
          break;
        case 'skill_cast':
          this.playTone(392, 987.77, 0.26, 'triangle', 0.16);
          setTimeout(() => this.playTone(659.25, 1318.5, 0.2, 'sine', 0.11), 55);
          break;
        case 'gadget_pickup':
          this.playTone(523.25, 783.99, 0.14, 'sine', 0.12);
          break;
        case 'gadget_use':
          this.playTone(330, 880, 0.22, 'triangle', 0.15);
          break;
        case 'shield_block':
          this.playTone(659.25, 440, 0.16, 'triangle', 0.15);
          break;
        case 'boss_merge':
          this.playTone(146.83, 293.66, 0.55, 'sawtooth', 0.16);
          setTimeout(() => this.playTone(220, 440, 0.4, 'triangle', 0.14), 120);
          break;
        case 'pickup_chest':
          this.playTone(523.25, 1046.5, 0.35, 'triangle', 0.16);
          break;
        case 'levelup':
          this.playTone(440, 660, 0.18, 'triangle', 0.14);
          setTimeout(() => this.playTone(659.25, 880, 0.24, 'triangle', 0.14), 90);
          break;
        case 'boss_spawn':
          this.playTone(130, 82, 0.55, 'sawtooth', 0.14);
          break;
        case 'player_hurt':
          this.playTone(150, 68, 0.16, 'sawtooth', 0.15);
          break;
        case 'revive':
          this.playTone(392, 784, 0.45, 'triangle', 0.18);
          break;
        case 'victory':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            setTimeout(() => this.playTone(f, f, 0.32, 'triangle', 0.15), i * 110);
          });
          break;
        case 'gameover':
          this.playTone(220, 85, 0.48, 'sawtooth', 0.16);
          break;
      }
    }
    events.length = 0;
  }

  startBgm(): void {
    if (!this.settings.bgmEnabled || typeof window === 'undefined') return;
    this.bgmWanted = true;
    this.tryPlayBgm();
  }

  stopBgm(): void {
    this.bgmWanted = false;
    if (!this.bgmAudio) return;
    this.bgmAudio.pause();
    try {
      this.bgmAudio.currentTime = 0;
    } catch {
      // Ignore seek errors before audio metadata loads
    }
  }
}
