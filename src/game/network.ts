import type { ClientToServerMessage, ServerToClientMessage } from './types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function buildWebSocketUrl(customServerInput?: string): string {
  const trimmed = (customServerInput || '').trim();
  if (trimmed) {
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized) && !/^wss?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    try {
      const parsed = new URL(normalized);
      const wsProtocol = parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${parsed.host}/ws`;
    } catch {
      // Fall back to current origin below
    }
  }
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function buildApiBaseUrl(customServerInput?: string): string {
  const trimmed = (customServerInput || '').trim();
  if (trimmed) {
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized) && !/^wss?:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }
    try {
      const parsed = new URL(normalized);
      const httpProtocol = parsed.protocol === 'wss:' || parsed.protocol === 'https:' ? 'https:' : 'http:';
      return `${httpProtocol}//${parsed.host}`;
    } catch {
      // ignore invalid
    }
  }
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export interface NetworkClientCallbacks {
  onStatus: (status: ConnectionStatus, detail?: string) => void;
  onMessage: (msg: ServerToClientMessage) => void;
  onPing: (rttMs: number) => void;
}

export class WifiMultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: NetworkClientCallbacks;
  private serverUrl = '';
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private manualClose = false;
  private lastPaddleSend = 0;

  constructor(callbacks: NetworkClientCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(customServer?: string): void {
    this.disconnect();
    this.manualClose = false;
    this.serverUrl = buildWebSocketUrl(customServer);
    this.openSocket();
  }

  private openSocket(): void {
    this.callbacks.onStatus('connecting');
    try {
      const ws = new WebSocket(this.serverUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.callbacks.onStatus('connected');
        this.send({ type: 'room:list' });
        this.startPingLoop();
      };

      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          const msg = JSON.parse(String(event.data)) as ServerToClientMessage;
          if (msg.type === 'pong') {
            const rtt = Math.max(1, Math.round(performance.now() - msg.ts));
            this.callbacks.onPing(rtt);
            return;
          }
          this.callbacks.onMessage(msg);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        this.callbacks.onStatus('error', 'Could not reach Wi-Fi game server.');
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.stopPingLoop();
        if (!this.manualClose) {
          this.callbacks.onStatus('disconnected', 'Connection dropped. Reconnecting...');
          this.reconnectTimer = window.setTimeout(() => {
            if (!this.manualClose) this.openSocket();
          }, 1800);
        } else {
          this.callbacks.onStatus('disconnected');
        }
      };
    } catch {
      this.callbacks.onStatus('error', 'Invalid Wi-Fi server address.');
    }
  }

  public disconnect(): void {
    this.manualClose = true;
    this.stopPingLoop();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  public send(msg: ClientToServerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  public sendPaddleTarget(targetY: number): void {
    const now = performance.now();
    if (now - this.lastPaddleSend < 15) return; // cap at ~66Hz
    this.lastPaddleSend = now;
    this.send({ type: 'input:paddle', targetY: Math.round(targetY) });
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.send({ type: 'ping', ts: performance.now() });
    this.pingTimer = window.setInterval(() => {
      this.send({ type: 'ping', ts: performance.now() });
    }, 2200);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
