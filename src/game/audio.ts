import type { MatchEvent, PlayerSide } from './types';

class PingPongAudio {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.muted = window.localStorage.getItem('spincourt_muted') === '1';
      } catch {
        this.muted = false;
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(value: boolean): void {
    this.muted = value;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('spincourt_muted', value ? '1' : '0');
      } catch {
        // ignore storage errors
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gainLevel: number,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const pitchJitter = 0.94 + Math.random() * 0.12;
    osc.type = type;
    osc.frequency.setValueAtTime(freq * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq * pitchJitter), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainLevel, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public playEvents(events: MatchEvent[], localSide: PlayerSide = 'left'): void {
    if (this.muted || events.length === 0) return;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;

    for (const ev of events) {
      const intensity = ev.intensity ?? 0.7;
      switch (ev.type) {
        case 'paddle_hit':
          // Crisp hollow celluloid ping
          this.playTone(620 + intensity * 180, 420, 0.065, 'triangle', 0.18 * intensity);
          this.playTone(1480, 920, 0.032, 'sine', 0.09 * intensity);
          break;
        case 'smash_hit':
          // Heavy punch + high snap
          this.playTone(880, 260, 0.11, 'sawtooth', 0.16);
          this.playTone(1860, 1020, 0.055, 'triangle', 0.18);
          this.playTone(165, 68, 0.12, 'sine', 0.24);
          break;
        case 'table_bounce':
          // Short wooden table tock
          this.playTone(460, 280, 0.042, 'sine', 0.11 * intensity);
          break;
        case 'wall_bounce':
          this.playTone(320, 210, 0.045, 'triangle', 0.09);
          break;
        case 'net_clip':
          this.playTone(280, 190, 0.06, 'square', 0.06);
          break;
        case 'point_scored': {
          const isPlayerPoint = ev.scorer === localSide;
          if (isPlayerPoint) {
            this.playTone(523.25, 523.25, 0.11, 'triangle', 0.14, 0);
            this.playTone(659.25, 659.25, 0.15, 'triangle', 0.14, 0.08);
          } else {
            this.playTone(349.23, 311.13, 0.14, 'triangle', 0.12, 0);
            this.playTone(261.63, 246.94, 0.18, 'triangle', 0.12, 0.09);
          }
          break;
        }
        case 'match_won': {
          const won = ev.scorer === localSide;
          const notes = won
            ? [523.25, 659.25, 783.99, 1046.5]
            : [392.0, 349.23, 311.13, 261.63];
          notes.forEach((n, idx) => {
            this.playTone(n, n, 0.22, 'triangle', 0.15, idx * 0.095);
          });
          break;
        }
      }
    }
  }
}

export const soundEngine = new PingPongAudio();
