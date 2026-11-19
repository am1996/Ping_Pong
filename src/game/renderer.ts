import { BALL_RADIUS, NET_X, TABLE_HEIGHT, TABLE_WIDTH } from './engine';
import type { MatchEvent, PaddleState, PlayerSide, TableMatchState } from './types';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Ripple {
  active: boolean;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  maxRadius: number;
  color: string;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  isSmash: boolean;
}

export interface TableTransform {
  isPortrait: boolean;
  mirrorSides: boolean;
  offsetX: number;
  offsetY: number;
  scale: number;
  drawWidth: number;
  drawHeight: number;
  viewportW: number;
  viewportH: number;
}

const MAX_PARTICLES = 96;
const MAX_RIPPLES = 16;
const MAX_TRAIL = 12;

export class TableRenderer {
  private particles: Particle[] = [];
  private particleCursor = 0;
  private ripples: Ripple[] = [];
  private rippleCursor = 0;
  private trail: TrailPoint[] = [];
  private trauma = 0;
  private scoreBannerText = '';
  private scoreBannerTimer = 0;
  private scoreBannerColor = '#F8FAFC';

  // Offscreen static arena cache so 60Hz loop stays sub-millisecond on Android & headless Chromium
  private bgCache: HTMLCanvasElement | null = null;
  private bgCacheKey = '';

  public transform: TableTransform = {
    isPortrait: false,
    mirrorSides: false,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    drawWidth: TABLE_WIDTH,
    drawHeight: TABLE_HEIGHT,
    viewportW: 1280,
    viewportH: 720,
  };

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.35,
        size: 3,
        color: '#FFFFFF',
      });
    }
    for (let i = 0; i < MAX_RIPPLES; i++) {
      this.ripples.push({
        active: false,
        x: 0,
        y: 0,
        life: 0,
        maxLife: 0.4,
        maxRadius: 28,
        color: '#FFFFFF',
      });
    }
  }

  public resetEffects(): void {
    this.trail.length = 0;
    this.trauma = 0;
    this.scoreBannerTimer = 0;
    for (const p of this.particles) p.active = false;
    for (const r of this.ripples) r.active = false;
  }

  private spawnParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    speedMin: number,
    speedMax: number,
    dirBiasX = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed + dirBiasX;
      p.vy = Math.sin(angle) * speed;
      p.life = 0;
      p.maxLife = 0.22 + Math.random() * 0.24;
      p.size = 2 + Math.random() * 3.5;
      p.color = color;
    }
  }

  private spawnRipple(x: number, y: number, maxRadius: number, color: string): void {
    const r = this.ripples[this.rippleCursor];
    this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES;
    r.active = true;
    r.x = x;
    r.y = y;
    r.life = 0;
    r.maxLife = 0.38;
    r.maxRadius = maxRadius;
    r.color = color;
  }

  public triggerEvents(events: MatchEvent[], localSide: PlayerSide): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'paddle_hit': {
          const dir = ev.side === 'left' ? 140 : -140;
          const color = ev.side === localSide ? '#FCA5A5' : '#FDE68A';
          this.spawnParticles(ev.x, ev.y, 7, color, 60, 190, dir);
          this.trauma = Math.min(1, this.trauma + 0.14);
          break;
        }
        case 'smash_hit': {
          const dir = ev.side === 'left' ? 240 : -240;
          this.spawnParticles(ev.x, ev.y, 18, '#F59E0B', 110, 340, dir);
          this.spawnParticles(ev.x, ev.y, 8, '#FFFFFF', 90, 260, dir);
          this.spawnRipple(ev.x, ev.y, 44, '#F59E0B');
          this.trauma = Math.min(1, this.trauma + 0.55);
          break;
        }
        case 'table_bounce': {
          this.spawnRipple(ev.x, ev.y, 24, 'rgba(255,255,255,0.65)');
          break;
        }
        case 'wall_bounce': {
          this.spawnParticles(ev.x, ev.y, 5, '#E2E8F0', 40, 130);
          break;
        }
        case 'net_clip': {
          this.spawnParticles(ev.x, ev.y, 6, '#FFFFFF', 35, 110);
          break;
        }
        case 'point_scored': {
          const playerScored = ev.scorer === localSide;
          const burstColor = playerScored ? '#34D399' : '#F87171';
          this.spawnParticles(
            Math.max(20, Math.min(TABLE_WIDTH - 20, ev.x)),
            Math.max(20, Math.min(TABLE_HEIGHT - 20, ev.y)),
            24,
            burstColor,
            80,
            290,
          );
          this.trauma = Math.min(1, this.trauma + 0.42);
          this.scoreBannerText = playerScored ? 'POINT!' : 'OPPONENT POINT';
          this.scoreBannerColor = playerScored ? '#34D399' : '#F87171';
          this.scoreBannerTimer = 0.95;
          this.trail.length = 0;
          break;
        }
      }
    }
  }

  public updateLayout(viewportW: number, viewportH: number, mirrorSides: boolean): TableTransform {
    const isPortrait = viewportH > viewportW * 1.05;
    const topSafe = isPortrait ? 86 : 74;
    const bottomSafe = isPortrait ? 44 : 42;
    const sideSafe = isPortrait ? 18 : 34;

    const availW = Math.max(200, viewportW - sideSafe * 2);
    const availH = Math.max(200, viewportH - topSafe - bottomSafe);

    const logicalW = isPortrait ? TABLE_HEIGHT : TABLE_WIDTH;
    const logicalH = isPortrait ? TABLE_WIDTH : TABLE_HEIGHT;

    const scale = Math.min(availW / logicalW, availH / logicalH);
    const drawWidth = logicalW * scale;
    const drawHeight = logicalH * scale;
    const offsetX = (viewportW - drawWidth) / 2;
    const offsetY = topSafe + (availH - drawHeight) / 2;

    this.transform = {
      isPortrait,
      mirrorSides,
      offsetX,
      offsetY,
      scale,
      drawWidth,
      drawHeight,
      viewportW,
      viewportH,
    };
    this.ensureBackgroundCache();
    return this.transform;
  }

  private ensureBackgroundCache(): void {
    if (typeof document === 'undefined') return;
    const t = this.transform;
    const w = Math.max(1, Math.round(t.viewportW));
    const h = Math.max(1, Math.round(t.viewportH));
    const key = `${w}x${h}:${t.isPortrait ? 'P' : 'L'}`;
    if (this.bgCache && this.bgCacheKey === key) return;

    const offscreen = this.bgCache ?? document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    // 1. Gymnasium Floor Background
    const floorGrad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      50,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.78,
    );
    floorGrad.addColorStop(0, '#162238');
    floorGrad.addColorStop(0.65, '#0D1524');
    floorGrad.addColorStop(1, '#080D18');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle court floor lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const spacing = 42;
    for (let x = t.offsetX % spacing; x < w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // 2. Static Table Surface & Crisp Lines (no expensive shadowBlur!)
    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);

    const surfaceW = t.isPortrait ? TABLE_HEIGHT : TABLE_WIDTH;
    const surfaceH = t.isPortrait ? TABLE_WIDTH : TABLE_HEIGHT;

    // Layered soft elevation shadow (zero blur cost)
    ctx.fillStyle = 'rgba(2, 6, 15, 0.36)';
    this.roundRect(ctx, -20, -10, surfaceW + 40, surfaceH + 38, 22);
    ctx.fill();
    ctx.fillStyle = 'rgba(2, 6, 15, 0.48)';
    this.roundRect(ctx, -14, -10, surfaceW + 28, surfaceH + 28, 17);
    ctx.fill();

    // Dark beveled steel frame
    ctx.fillStyle = '#091A30';
    this.roundRect(ctx, -10, -10, surfaceW + 20, surfaceH + 20, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, -10, -10, surfaceW + 20, surfaceH + 20, 14);
    ctx.stroke();

    // Tournament Matte Blue Table Top
    const tableGrad = ctx.createLinearGradient(0, 0, surfaceW, surfaceH);
    tableGrad.addColorStop(0, '#12497F');
    tableGrad.addColorStop(0.5, '#0F3C6B');
    tableGrad.addColorStop(1, '#0C3157');
    ctx.fillStyle = tableGrad;
    this.roundRect(ctx, 0, 0, surfaceW, surfaceH, 8);
    ctx.fill();

    // Subtle overhead arena spotlight sheen
    const sheen = ctx.createRadialGradient(
      surfaceW * 0.5,
      surfaceH * 0.45,
      20,
      surfaceW * 0.5,
      surfaceH * 0.5,
      Math.max(surfaceW, surfaceH) * 0.62,
    );
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    this.roundRect(ctx, 0, 0, surfaceW, surfaceH, 8);
    ctx.fill();

    // Crisp ITTF White Chalk Lines
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, surfaceW - 8, surfaceH - 8);

    // Center longitudinal service line
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.34)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (t.isPortrait) {
      ctx.moveTo(surfaceW / 2, 6);
      ctx.lineTo(surfaceW / 2, surfaceH - 6);
    } else {
      ctx.moveTo(6, surfaceH / 2);
      ctx.lineTo(surfaceW - 6, surfaceH / 2);
    }
    ctx.stroke();

    // Woven Center Net
    this.drawNet(ctx, surfaceW, surfaceH, t.isPortrait);

    ctx.restore();

    this.bgCache = offscreen;
    this.bgCacheKey = key;
  }

  public screenToTableY(canvasX: number, canvasY: number): number {
    const t = this.transform;
    if (t.isPortrait) {
      const norm = (canvasX - t.offsetX) / t.drawWidth;
      const logicalY = t.mirrorSides ? (1 - norm) * TABLE_HEIGHT : norm * TABLE_HEIGHT;
      return Math.max(0, Math.min(TABLE_HEIGHT, logicalY));
    }
    const norm = (canvasY - t.offsetY) / t.drawHeight;
    return Math.max(0, Math.min(TABLE_HEIGHT, norm * TABLE_HEIGHT));
  }

  private toViewCoords(lx: number, ly: number): { x: number; y: number } {
    const t = this.transform;
    const mx = t.mirrorSides ? TABLE_WIDTH - lx : lx;
    const my = t.mirrorSides && t.isPortrait ? TABLE_HEIGHT - ly : ly;

    if (t.isPortrait) {
      return {
        x: my,
        y: TABLE_WIDTH - mx,
      };
    }
    return { x: mx, y: my };
  }

  public tickEffects(dt: number, state: TableMatchState): void {
    const safeDt = Math.min(dt, 0.05);
    this.trauma = Math.max(0, this.trauma - safeDt * 1.9);
    if (this.scoreBannerTimer > 0) {
      this.scoreBannerTimer = Math.max(0, this.scoreBannerTimer - safeDt);
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += safeDt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.vx *= Math.pow(0.15, safeDt);
      p.vy *= Math.pow(0.15, safeDt);
    }

    for (const r of this.ripples) {
      if (!r.active) continue;
      r.life += safeDt;
      if (r.life >= r.maxLife) {
        r.active = false;
      }
    }

    if (state.phase === 'rally') {
      this.trail.unshift({
        x: state.ball.x,
        y: state.ball.y,
        z: state.ball.z,
        isSmash: state.ball.isSmash,
      });
      if (this.trail.length > MAX_TRAIL) {
        this.trail.pop();
      }
    } else if (this.trail.length > 0) {
      this.trail.pop();
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    state: TableMatchState,
    localSide: PlayerSide,
    isAttractMode: boolean,
  ): void {
    const t = this.transform;
    const { viewportW, viewportH, offsetX, offsetY, scale, isPortrait } = t;

    ctx.save();

    // Apply decaying trauma^2 camera shake
    const shakeMag = this.trauma * this.trauma * 8;
    const shakeX = shakeMag > 0.15 ? (Math.random() - 0.5) * 2 * shakeMag : 0;
    const shakeY = shakeMag > 0.15 ? (Math.random() - 0.5) * 2 * shakeMag : 0;

    // 1. Blit pre-rendered static gymnasium floor + tournament table + net (<0.2ms)
    if (this.bgCache) {
      if (shakeX !== 0 || shakeY !== 0) {
        ctx.fillStyle = '#080D18';
        ctx.fillRect(0, 0, viewportW, viewportH);
      }
      ctx.drawImage(this.bgCache, shakeX, shakeY, viewportW, viewportH);
    } else {
      ctx.fillStyle = '#0B1220';
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    ctx.translate(offsetX + shakeX, offsetY + shakeY);
    ctx.scale(scale, scale);

    const surfaceW = isPortrait ? TABLE_HEIGHT : TABLE_WIDTH;
    const surfaceH = isPortrait ? TABLE_WIDTH : TABLE_HEIGHT;

    // 2. Table Bounce Ripples
    for (const r of this.ripples) {
      if (!r.active) continue;
      const progress = r.life / r.maxLife;
      const pt = this.toViewCoords(r.x, r.y);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - progress) * 0.65;
      ctx.lineWidth = 2.5 * (1 - progress * 0.5);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 + progress * r.maxRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 3. Paddles (Crimson Rubber = Local Player, Amber-Gold Rubber = Opponent)
    const leftIsLocal = localSide === 'left';
    this.drawPaddle(ctx, state.leftPaddle, 'left', leftIsLocal ? '#D93829' : '#E89B17', isPortrait);
    this.drawPaddle(ctx, state.rightPaddle, 'right', leftIsLocal ? '#E89B17' : '#D93829', isPortrait);

    // 4. Ball Velocity Trail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const tp = this.trail[i];
      const frac = 1 - i / this.trail.length;
      const pt = this.toViewCoords(tp.x, tp.y);
      const lift = tp.z * 0.22;
      const radius = BALL_RADIUS * (0.45 + frac * 0.45);
      ctx.fillStyle = tp.isSmash ? '#F59E0B' : '#F8FAFC';
      ctx.globalAlpha = frac * (tp.isSmash ? 0.36 : 0.2);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - lift, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 5. Ball Dynamic Shadow + Elevated Ball
    this.drawBall(ctx, state);

    // 6. Pooled Impact Particles
    for (const p of this.particles) {
      if (!p.active) continue;
      const frac = 1 - p.life / p.maxLife;
      const pt = this.toViewCoords(p.x, p.y);
      ctx.globalAlpha = frac;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.size * frac, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 7. Diegetic On-Table Serve Cue or Point Flash
    if (!isAttractMode) {
      if (state.phase === 'serve_wait') {
        const isYourServe = state.servingSide === localSide;
        ctx.font = '700 20px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isYourServe ? 'rgba(248, 250, 252, 0.92)' : 'rgba(203, 213, 225, 0.72)';
        const cueText = isYourServe ? 'TAP OR PRESS SPACE TO SERVE' : 'OPPONENT SERVING...';
        const cueY = isPortrait ? surfaceH * 0.72 : surfaceH * 0.86;
        ctx.fillText(cueText, surfaceW / 2, cueY);
      } else if (this.scoreBannerTimer > 0) {
        const alpha = Math.min(1, this.scoreBannerTimer * 2.2);
        ctx.globalAlpha = alpha;
        ctx.font = '800 44px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(8, 13, 24, 0.85)';
        ctx.strokeText(this.scoreBannerText, surfaceW / 2, surfaceH * 0.42);
        ctx.fillStyle = this.scoreBannerColor;
        ctx.fillText(this.scoreBannerText, surfaceW / 2, surfaceH * 0.42);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  private drawNet(
    ctx: CanvasRenderingContext2D,
    surfaceW: number,
    surfaceH: number,
    isPortrait: boolean,
  ): void {
    ctx.save();
    if (isPortrait) {
      const ny = surfaceH / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(0, ny + 4, surfaceW, 10);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
      ctx.fillRect(-10, ny - 4, surfaceW + 20, 8);

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= surfaceW; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, ny - 4);
        ctx.lineTo(x, ny + 4);
        ctx.stroke();
      }

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(-10, ny - 2, surfaceW + 20, 4);

      ctx.fillStyle = '#334155';
      ctx.fillRect(-16, ny - 8, 12, 16);
      ctx.fillRect(surfaceW + 4, ny - 8, 12, 16);
    } else {
      const nx = NET_X;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(nx + 4, 0, 10, surfaceH);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
      ctx.fillRect(nx - 4, -10, 8, surfaceH + 20);

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.lineWidth = 1;
      for (let y = 0; y <= surfaceH; y += 10) {
        ctx.beginPath();
        ctx.moveTo(nx - 4, y);
        ctx.lineTo(nx + 4, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(nx - 2, -10, 4, surfaceH + 20);

      ctx.fillStyle = '#334155';
      ctx.fillRect(nx - 8, -16, 16, 12);
      ctx.fillRect(nx - 8, surfaceH + 4, 16, 12);
    }
    ctx.restore();
  }

  private drawPaddle(
    ctx: CanvasRenderingContext2D,
    paddle: PaddleState,
    side: PlayerSide,
    rubberColor: string,
    isPortrait: boolean,
  ): void {
    const recoilShift = paddle.recoil * 7;
    const pt = this.toViewCoords(paddle.x + recoilShift, paddle.y);
    const w = isPortrait ? paddle.height : paddle.width;
    const h = isPortrait ? paddle.width : paddle.height;

    ctx.save();
    ctx.translate(pt.x, pt.y);

    const stretch = 1 + paddle.hitFlash * 0.12;
    const squash = 1 - paddle.hitFlash * 0.08;
    if (isPortrait) {
      ctx.scale(stretch, squash);
    } else {
      ctx.scale(squash, stretch);
    }

    // Cast shadow on table
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    this.roundRect(ctx, -w / 2 + 4, -h / 2 + 6, w, h, 8);
    ctx.fill();

    // Wooden blade core rim
    ctx.fillStyle = '#D4A373';
    this.roundRect(ctx, -w / 2, -h / 2, w, h, 8);
    ctx.fill();

    // High-grip rubber face
    ctx.fillStyle = paddle.hitFlash > 0.35 ? '#FFFFFF' : rubberColor;
    this.roundRect(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 6);
    ctx.fill();

    // Specular edge highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, 7);
    ctx.stroke();

    // Handle stub pointing off-table
    const isMirror = this.transform.mirrorSides;
    const visuallyLeft = isMirror ? side === 'right' : side === 'left';
    ctx.fillStyle = '#92400E';
    if (isPortrait) {
      const hy = visuallyLeft ? h / 2 : -h / 2 - 12;
      this.roundRect(ctx, -6, hy, 12, 12, 3);
      ctx.fill();
    } else {
      const hx = visuallyLeft ? -w / 2 - 12 : w / 2;
      this.roundRect(ctx, hx, -6, 12, 12, 3);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D, state: TableMatchState): void {
    const ball = state.ball;
    const pt = this.toViewCoords(ball.x, ball.y);
    const heightScale = 1 + Math.min(ball.z, 90) * 0.0042;
    const liftOffset = ball.z * 0.22;

    // Grounded elliptical shadow on table
    const shadowAlpha = Math.max(0.14, 0.42 - ball.z * 0.0028);
    const shadowRx = BALL_RADIUS * (0.9 + ball.z * 0.004);
    const shadowRy = BALL_RADIUS * (0.68 + ball.z * 0.003);
    ctx.fillStyle = `rgba(4, 10, 22, ${shadowAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(
      pt.x + 3 + ball.z * 0.08,
      pt.y + 4 + ball.z * 0.1,
      shadowRx,
      shadowRy,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Elevated 40mm ITTF ball
    const bx = pt.x;
    const by = pt.y - liftOffset;
    const r = BALL_RADIUS * heightScale;

    if (ball.isSmash) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
      ctx.beginPath();
      ctx.arc(bx, by, r * 1.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = ball.isSmash ? '#FDE047' : '#F8FAFC';
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(bx - r * 0.3, by - r * 0.32, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Rim shading
    ctx.strokeStyle = ball.isSmash ? '#EA580C' : '#94A3B8';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.stroke();

    // Spin seam indicator
    if (Math.abs(ball.spin) > 120) {
      ctx.strokeStyle = ball.isSmash ? 'rgba(180, 83, 9, 0.55)' : 'rgba(217, 56, 41, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(bx, by, r * 0.62, 0, Math.PI * 1.1);
      ctx.stroke();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
