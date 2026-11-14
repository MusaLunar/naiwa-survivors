import type { InputVector } from '../game/simulation.ts';

/**
 * Floating touch virtual joystick bound to pointer events over the game stage.
 * Uses touch-action: none on its container to prevent browser scroll/zoom interference.
 */
export class VirtualJoystick {
  private activePointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private currentX = 0;
  private currentY = 0;
  private readonly maxRadius = 56;
  private readonly baseEl: HTMLDivElement;
  private readonly knobEl: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.baseEl = document.createElement('div');
    this.baseEl.className = 'joystick-base';
    this.baseEl.hidden = true;

    this.knobEl = document.createElement('div');
    this.knobEl.className = 'joystick-knob';
    this.baseEl.appendChild(this.knobEl);
    host.appendChild(this.baseEl);

    host.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement)?.closest('button, dialog, a, input')) return;
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.originX = e.clientX;
    this.originY = e.clientY;
    this.currentX = e.clientX;
    this.currentY = e.clientY;
    this.baseEl.style.left = `${this.originX}px`;
    this.baseEl.style.top = `${this.originY}px`;
    this.knobEl.style.transform = 'translate(-50%, -50%)';
    this.baseEl.hidden = false;
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    const dx = e.clientX - this.originX;
    const dy = e.clientY - this.originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    this.currentX = this.originX + kx;
    this.currentY = this.originY + ky;
    this.knobEl.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    this.reset();
  };

  reset(): void {
    this.activePointerId = null;
    this.baseEl.hidden = true;
  }

  getVector(): InputVector {
    if (this.activePointerId === null) return { x: 0, y: 0 };
    const dx = this.currentX - this.originX;
    const dy = this.currentY - this.originY;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return { x: 0, y: 0 };
    return {
      x: dx / this.maxRadius,
      y: dy / this.maxRadius,
    };
  }
}
