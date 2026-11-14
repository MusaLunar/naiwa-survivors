import type { GameCatalog, GameSettings, StageDef } from '../data/types.ts';
import type { GameState } from '../game/state.ts';
import { getOrbitVisualNodes } from '../game/weapons.ts';
import type { AssetStore } from './assetLoader.ts';

export class SanctuaryRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: AssetStore;
  private readonly flashCanvas: HTMLCanvasElement;
  private readonly flashCtx: CanvasRenderingContext2D;
  private viewW = 1280;
  private viewH = 720;

  constructor(canvas: HTMLCanvasElement, assets: AssetStore) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Unable to acquire 2D context');
    this.ctx = ctx;
    this.assets = assets;

    this.flashCanvas = document.createElement('canvas');
    this.flashCanvas.width = 160;
    this.flashCanvas.height = 160;
    const fCtx = this.flashCanvas.getContext('2d');
    if (!fCtx) throw new Error('Unable to acquire flash 2D context');
    this.flashCtx = fCtx;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(320, Math.round(rect.width || window.innerWidth));
    this.viewH = Math.max(240, Math.round(rect.height || window.innerHeight));
    const targetW = Math.floor(this.viewW * dpr);
    const targetH = Math.floor(this.viewH * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private drawFloor(camX: number, camY: number, theme: StageDef['theme']): void {
    const ctx = this.ctx;
    const isNight = theme === 'nightwatch';
    ctx.fillStyle = isNight ? '#0a0e1a' : '#0f0c14';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const tileImg = this.assets.getSprite(isNight ? 'tile-nightwatch' : 'tile-sanctuary');
    if (tileImg) {
      const tile = 256;
      const startX = Math.floor(camX / tile) * tile - camX;
      const startY = Math.floor(camY / tile) * tile - camY;
      for (let y = startY - tile; y < this.viewH + tile; y += tile) {
        const worldRow = Math.round((y + camY) / tile);
        for (let x = startX - tile; x < this.viewW + tile; x += tile) {
          const worldCol = Math.round((x + camX) / tile);
          ctx.drawImage(tileImg, x, y, tile, tile);
          if (((worldCol * 7 + worldRow * 13) & 3) === 0) {
            ctx.strokeStyle = isNight ? 'rgba(244, 197, 66, 0.12)' : 'rgba(244, 197, 66, 0.16)';
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            const cx = x + tile * 0.5;
            const cy = y + tile * 0.5;
            ctx.moveTo(cx, cy - 18);
            ctx.lineTo(cx + 18, cy);
            ctx.lineTo(cx, cy + 18);
            ctx.lineTo(cx - 18, cy);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      return;
    }

    const tile = 128;
    const startX = Math.floor(camX / tile) * tile - camX;
    const startY = Math.floor(camY / tile) * tile - camY;

    ctx.lineWidth = 1;
    for (let y = startY - tile; y < this.viewH + tile; y += tile) {
      const worldRow = Math.round((y + camY) / tile);
      for (let x = startX - tile; x < this.viewW + tile; x += tile) {
        const worldCol = Math.round((x + camX) / tile);
        const checker = (worldCol + worldRow) & 1;

        ctx.fillStyle = isNight
          ? checker
            ? '#0f1628'
            : '#0b101e'
          : checker
            ? '#15111c'
            : '#100d15';
        ctx.fillRect(x, y, tile - 1, tile - 1);

        // Subtle gilded sanctuary rosette at alternating tile centers
        if (((worldCol * 7 + worldRow * 13) & 3) === 0) {
          ctx.strokeStyle = isNight ? 'rgba(244, 197, 66, 0.10)' : 'rgba(244, 197, 66, 0.14)';
          ctx.beginPath();
          const cx = x + tile * 0.5;
          const cy = y + tile * 0.5;
          ctx.moveTo(cx, cy - 14);
          ctx.lineTo(cx + 14, cy);
          ctx.lineTo(cx, cy + 14);
          ctx.lineTo(cx - 14, cy);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // Sanctuary border frame lines every 128px
    ctx.strokeStyle = isNight ? 'rgba(84, 118, 178, 0.12)' : 'rgba(212, 168, 67, 0.10)';
    ctx.beginPath();
    for (let x = startX; x < this.viewW + tile; x += tile) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.viewH);
    }
    for (let y = startY; y < this.viewH + tile; y += tile) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.viewW, y);
    }
    ctx.stroke();
  }

  private drawSpriteFitted(
    img: HTMLImageElement,
    dx: number,
    dy: number,
    targetH: number,
    flipX = false,
    flash = false
  ): void {
    const aspect = img.width / Math.max(1, img.height);
    const drawH = targetH;
    const drawW = targetH * aspect;
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(dx, dy);
    if (flipX) ctx.scale(-1, 1);

    if (flash) {
      const f = this.flashCtx;
      const fw = Math.min(160, Math.max(16, Math.round(drawW)));
      const fh = Math.min(160, Math.max(16, Math.round(drawH)));
      f.clearRect(0, 0, 160, 160);
      f.globalCompositeOperation = 'source-over';
      f.drawImage(img, 0, 0, fw, fh);
      f.globalCompositeOperation = 'source-atop';
      f.fillStyle = 'rgba(255, 255, 255, 0.85)';
      f.fillRect(0, 0, fw, fh);
      ctx.drawImage(this.flashCanvas, 0, 0, fw, fh, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    ctx.restore();
  }

  render(state: GameState, stage: StageDef, catalog: GameCatalog, settings: GameSettings): void {
    const ctx = this.ctx;
    let shakeX = 0;
    let shakeY = 0;
    if (settings.screenShake && state.shakeTimer > 0) {
      const mag = state.shakeIntensity * (state.shakeTimer / 0.18);
      shakeX = (Math.random() - 0.5) * 2 * mag;
      shakeY = (Math.random() - 0.5) * 2 * mag;
    }

    const camX = state.player.x - this.viewW * 0.5 + shakeX;
    const camY = state.player.y - this.viewH * 0.5 + shakeY;

    this.drawFloor(camX, camY, stage.theme);

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. Floor Zones (aura, sanctuary banner zones, lightning circles)
    for (const z of state.zones) {
      const ratio = Math.max(0, z.life / z.maxLife);
      if (z.kind === 'aura') {
        ctx.save();
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 3 + ratio * 3;
        ctx.globalAlpha = 0.25 + ratio * 0.55;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * (1 - ratio * 0.22), 0, Math.PI * 2);
        ctx.stroke();

        const grad = ctx.createRadialGradient(z.x, z.y, z.radius * 0.2, z.x, z.y, z.radius);
        grad.addColorStop(0, 'rgba(244, 197, 66, 0)');
        grad.addColorStop(1, 'rgba(244, 197, 66, 0.22)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      } else if (z.kind === 'zone') {
        ctx.save();
        const pulse = 0.85 + Math.sin(state.elapsedSec * 7) * 0.15;
        ctx.globalAlpha = Math.min(1, z.life * 2) * 0.35;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.min(1, z.life * 2) * 0.78;
        ctx.strokeStyle = z.accentColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * pulse, 0, Math.PI * 2);
        ctx.stroke();

        const crest = this.assets.getSprite('zone-liberty-crest');
        if (crest) {
          ctx.translate(z.x, z.y);
          ctx.rotate(state.elapsedSec * 0.6);
          ctx.globalAlpha = Math.min(1, z.life * 2) * 0.45;
          this.drawSpriteFitted(crest, 0, 0, z.radius * 1.65, false, false);
        }
        ctx.restore();
      }
    }

    // 2. Pickups (XP gems, gold, meat, magnet, chest)
    for (const p of state.pickups) {
      if (
        p.x < camX - 60 ||
        p.x > camX + this.viewW + 60 ||
        p.y < camY - 60 ||
        p.y > camY + this.viewH + 60
      ) {
        continue;
      }
      const bob = Math.sin(state.elapsedSec * 4.5 + p.bobSeed) * 2.5;
      const py = p.y + bob;

      if (p.kind === 'chest') {
        const chestSpr = this.assets.getSprite('pickup-chest');
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 15, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        if (chestSpr) {
          ctx.strokeStyle = 'rgba(244, 197, 66, 0.35)';
          ctx.lineWidth = 2;
          ctx.stroke();
          this.drawSpriteFitted(chestSpr, p.x, py, 40, false, false);
        } else {
          ctx.fillStyle = '#8b4513';
          ctx.strokeStyle = '#f4c542';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(p.x - 16, py - 12, 32, 24, 5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f4c542';
          ctx.fillRect(p.x - 16, py - 2, 32, 4);
          ctx.fillRect(p.x - 4, py - 5, 8, 10);
        }
        ctx.restore();
      } else if (p.kind === 'gold') {
        const goldSpr = this.assets.getSprite('pickup-gold');
        if (goldSpr) {
          this.drawSpriteFitted(goldSpr, p.x, py, 22, false, false);
        } else {
          ctx.fillStyle = '#ffd84d';
          ctx.strokeStyle = '#9c6b12';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, py, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (p.kind === 'gold_bag') {
        const goldSpr = this.assets.getSprite('pickup-gold');
        ctx.save();
        ctx.fillStyle = 'rgba(255, 200, 45, 0.28)';
        ctx.strokeStyle = '#ffd84d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, py, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (goldSpr) {
          this.drawSpriteFitted(goldSpr, p.x, py, 30, false, false);
        }
        ctx.restore();
      } else if (p.kind === 'frenzy_elixir') {
        const frenzySpr = this.assets.getSprite('item-sachet') ?? this.assets.getSprite('item-scroll');
        ctx.save();
        ctx.fillStyle = 'rgba(255, 71, 87, 0.30)';
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(p.x, py, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (frenzySpr) {
          this.drawSpriteFitted(frenzySpr, p.x, py, 28, false, false);
        }
        ctx.restore();
      } else if (p.kind === 'ice_hourglass') {
        const iceSpr = this.assets.getSprite('item-hourglass');
        ctx.save();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.30)';
        ctx.strokeStyle = '#70a1ff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(p.x, py, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (iceSpr) {
          this.drawSpriteFitted(iceSpr, p.x, py, 28, false, false);
        }
        ctx.restore();
      } else if (p.kind === 'holy_bell') {
        const bellSpr = this.assets.getSprite('wpn-icon-tsunami-bell') ?? this.assets.getSprite('item-chalice');
        ctx.save();
        ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, py, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (bellSpr) {
          this.drawSpriteFitted(bellSpr, p.x, py, 30, false, false);
        }
        ctx.restore();
      } else if (p.kind === 'meat') {
        const meatSpr = this.assets.getSprite('pickup-meat');
        if (meatSpr) {
          this.drawSpriteFitted(meatSpr, p.x, py, 28, false, false);
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, py, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('+', p.x, py + 4);
        }
      } else if (p.kind === 'magnet') {
        const magSpr = this.assets.getSprite('pickup-magnet');
        if (magSpr) {
          this.drawSpriteFitted(magSpr, p.x, py, 26, false, false);
        } else {
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(p.x, py, 8, Math.PI, 0);
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(p.x - 10, py, 4, 6);
          ctx.fillRect(p.x + 6, py, 4, 6);
        }
      } else {
        // XP Gem sprite with tier-colored aura (blue/emerald/amber)
        const color =
          p.kind === 'xp_large' ? '#f59e0b' : p.kind === 'xp_medium' ? '#34d399' : '#38bdf8';
        const xpSpr = this.assets.getSprite('pickup-xp-gem');
        if (xpSpr) {
          const targetH = p.kind === 'xp_large' ? 26 : p.kind === 'xp_medium' ? 21 : 17;
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, py, targetH * 0.48, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          this.drawSpriteFitted(xpSpr, p.x, py, targetH, false, false);
          ctx.restore();
        } else {
          const r = p.kind === 'xp_large' ? 8 : p.kind === 'xp_medium' ? 6.5 : 5;
          ctx.fillStyle = color;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, py - r);
          ctx.lineTo(p.x + r * 0.75, py);
          ctx.lineTo(p.x, py + r);
          ctx.lineTo(p.x - r * 0.75, py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // 3. Enemies & Bosses
    for (const e of state.enemies) {
      if (
        e.x < camX - 100 ||
        e.x > camX + this.viewW + 100 ||
        e.y < camY - 100 ||
        e.y > camY + this.viewH + 100
      ) {
        continue;
      }

      const wobble = Math.sin(state.elapsedSec * 9 + e.wobbleSeed) * 0.06;
      const targetH = e.radius * (e.isMedallion ? 2.15 : 2.55);

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.85, e.radius * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // Freeze halo when enemies are time-frozen
      if (state.freezeTimer > 0) {
        ctx.save();
        ctx.strokeStyle = '#7dd3fc';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Elite / Boss warning ring
      if (e.isBoss || e.isElite) {
        ctx.save();
        ctx.strokeStyle = e.isBoss ? '#ff3b30' : '#f4c542';
        ctx.lineWidth = e.isBoss ? 3.5 : 2.2;
        ctx.beginPath();
        ctx.ellipse(
          e.x,
          e.y + e.radius * 0.85,
          e.radius * 1.15,
          e.radius * 0.48,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
      }

      const img = this.assets.getSprite(e.spriteId);
      const flip = e.vx < -4;
      if (img) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(1 + wobble, 1 - wobble);
        this.drawSpriteFitted(img, 0, 0, targetH, flip, e.hitFlashTimer > 0);
        ctx.restore();
      } else {
        ctx.fillStyle = e.hitFlashTimer > 0 ? '#ffffff' : '#f4c542';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if ((e.isBoss || e.isElite) && e.hp < e.maxHp) {
        const bw = e.radius * 2.1;
        const bx = e.x - bw / 2;
        const by = e.y - targetH * 0.56;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(bx, by, bw, 6);
        ctx.fillStyle = e.isBoss ? '#ef4444' : '#f4c542';
        ctx.fillRect(bx + 1, by + 1, Math.max(0, (bw - 2) * (e.hp / e.maxHp)), 4);
      }
    }

    // 4. Player Hero
    const charDef = catalog.characters[state.characterId];
    const heroImg = charDef ? this.assets.getSprite(charDef.spriteId) : undefined;
    const px = state.player.x;
    const py = state.player.y;

    // Locator golden halo & active frenzy/haste aura beneath player
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 197, 66, 0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(px, py + 20, 22, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244, 197, 66, 0.14)';
    ctx.fill();
    if (state.player.skillBuffTimer > 0 || state.player.frenzyTimer > 0) {
      const auraR = 34 + Math.sin(state.elapsedSec * 10) * 3;
      ctx.strokeStyle = state.player.frenzyTimer > 0 ? '#ff6b6b' : '#f472b6';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(px, py, auraR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const walkSquash =
      Math.hypot(state.player.vx, state.player.vy) > 5
        ? Math.sin(state.player.walkPhase) * 0.08
        : Math.sin(state.elapsedSec * 3) * 0.025;
    const blinkHide = state.player.invulnTimer > 0 && Math.floor(state.elapsedSec * 20) % 2 === 0;

    if (!blinkHide) {
      if (heroImg) {
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1 - walkSquash, 1 + walkSquash);
        this.drawSpriteFitted(heroImg, 0, 0, 58, state.player.facingX < -0.1, false);
        ctx.restore();
      } else {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(px, py, 20, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // World-space player HP bar
    const hpW = 54;
    const hpX = px - hpW / 2;
    const hpY = py + 31;
    ctx.fillStyle = 'rgba(10, 10, 14, 0.85)';
    ctx.fillRect(hpX, hpY, hpW, 7);
    const hpFrac = Math.max(0, state.player.hp / Math.max(1, state.player.maxHp));
    ctx.fillStyle = hpFrac > 0.35 ? '#22c55e' : '#ef4444';
    ctx.fillRect(hpX + 1, hpY + 1, (hpW - 2) * hpFrac, 5);

    // 5. Orbit Weapons
    for (const node of getOrbitVisualNodes(state, catalog)) {
      const orbImg = this.assets.getSprite(node.spriteId);
      ctx.save();
      ctx.shadowColor = node.color;
      ctx.shadowBlur = node.isEvolved ? 14 : 8;
      if (orbImg) {
        this.drawSpriteFitted(orbImg, node.x, node.y, node.radius * 1.9, false, false);
      } else {
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 6. Projectiles
    for (const pr of state.projectiles) {
      if (pr.behavior === 'enemy_orb') {
        ctx.save();
        ctx.fillStyle = pr.color;
        ctx.strokeStyle = pr.accentColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (pr.behavior === 'homing') {
        const spr = pr.spriteId ? this.assets.getSprite(pr.spriteId) : undefined;
        ctx.save();
        if (spr) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = pr.color;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, pr.radius * 0.95, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          this.drawSpriteFitted(spr, pr.x, pr.y, pr.radius * 2.0, false, false);
        } else {
          ctx.translate(pr.x, pr.y);
          ctx.fillStyle = pr.color;
          ctx.strokeStyle = pr.accentColor;
          ctx.lineWidth = 1.8;
          const r = pr.radius * 0.72;
          ctx.beginPath();
          ctx.moveTo(0, r * 0.65);
          ctx.bezierCurveTo(-r * 1.3, -r * 0.35, -r * 0.7, -r * 1.35, 0, -r * 0.45);
          ctx.bezierCurveTo(r * 0.7, -r * 1.35, r * 1.3, -r * 0.35, 0, r * 0.65);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }

      if (pr.behavior === 'lobbed') {
        const progress = 1 - Math.max(0, pr.life / Math.max(0.01, pr.maxLife));
        const arcOffset = Math.sin(progress * Math.PI) * 62;
        const spr = pr.spriteId ? this.assets.getSprite(pr.spriteId) : undefined;
        ctx.save();
        // Ground target shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(pr.x, pr.y + 8, 12 + progress * 6, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (pr.blastRadius) {
          ctx.strokeStyle = pr.color;
          ctx.globalAlpha = 0.25 + progress * 0.3;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, pr.blastRadius * (0.4 + 0.6 * progress), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.translate(pr.x, pr.y - arcOffset);
        ctx.rotate(pr.spinAngle * 0.8);
        if (spr) {
          this.drawSpriteFitted(spr, 0, 0, 34, false, false);
        } else {
          ctx.fillStyle = pr.color;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      const spr = pr.spriteId ? this.assets.getSprite(pr.spriteId) : undefined;
      if (spr && pr.behavior === 'boomerang') {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(pr.spinAngle);
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, pr.radius, 0, Math.PI * 2);
        ctx.stroke();
        this.drawSpriteFitted(spr, 0, 0, pr.radius * 1.75, false, false);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = pr.color;
        ctx.strokeStyle = pr.accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 7. Beams & Lightning Strikes
    for (const z of state.zones) {
      const alpha = Math.max(0, z.life / z.maxLife);
      if (z.kind === 'beam' && z.x2 !== undefined && z.y2 !== undefined) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha * 0.45;
        ctx.strokeStyle = z.color;
        ctx.lineWidth = z.radius * 1.4;
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x2, z.y2);
        ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = z.accentColor;
        ctx.lineWidth = z.radius * 0.55;
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x2, z.y2);
        ctx.stroke();
        ctx.restore();
      } else if (z.kind === 'lightning') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius * (1.05 - alpha * 0.2), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = z.accentColor;
        ctx.lineWidth = 5 * alpha + 1;
        ctx.beginPath();
        ctx.moveTo(z.x - 18, z.y - 260);
        ctx.lineTo(z.x + 12, z.y - 140);
        ctx.lineTo(z.x - 10, z.y - 60);
        ctx.lineTo(z.x, z.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 8. Particles
    for (const pt of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 9. Floating Damage Numbers
    if (settings.damageNumbers) {
      ctx.save();
      ctx.textAlign = 'center';
      for (const ft of state.floatingTexts) {
        ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        ctx.font = `700 ${Math.round(14 * ft.scale)}px system-ui, sans-serif`;
        ctx.strokeStyle = '#09090d';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
