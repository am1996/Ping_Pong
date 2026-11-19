import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { launchServe, stepMatch, TABLE_HEIGHT } from './src/game/engine.ts';
import { RoomManager } from './src/game/rooms.ts';
import type {
  ClientToServerMessage,
  LanNetworkInfo,
  MatchEvent,
  ServerToClientMessage,
} from './src/game/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function getLanAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Allow Android APK (capacitor://localhost / http://localhost) to query LAN APIs over Wi-Fi
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const roomManager = new RoomManager();
  const socketsById = new Map<string, WebSocket>();
  let nextClientSeq = 1;

  function send(ws: WebSocket | undefined, payload: ServerToClientMessage): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  function broadcastRoomList(): void {
    const payload: ServerToClientMessage = {
      type: 'rooms:update',
      rooms: roomManager.getRoomSummaries(),
    };
    const encoded = JSON.stringify(payload);
    for (const ws of socketsById.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: roomManager.getRoomSummaries().length });
  });

  app.get('/api/network-info', (_req, res) => {
    const info: LanNetworkInfo = {
      port: PORT,
      addresses: getLanAddresses(),
      hostname: os.hostname(),
    };
    res.json(info);
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: roomManager.getRoomSummaries() });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    const clientId = `c_${nextClientSeq++}`;
    socketsById.set(clientId, ws);

    send(ws, { type: 'rooms:update', rooms: roomManager.getRoomSummaries() });

    ws.on('message', (raw) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientToServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ping': {
          send(ws, { type: 'pong', ts: msg.ts });
          break;
        }
        case 'room:list': {
          send(ws, { type: 'rooms:update', rooms: roomManager.getRoomSummaries() });
          break;
        }
        case 'room:create': {
          const target = msg.targetScore === 5 || msg.targetScore === 7 || msg.targetScore === 11
            ? msg.targetScore
            : 11;
          const room = roomManager.createRoom(clientId, msg.playerName, target);
          send(ws, {
            type: 'room:joined',
            code: room.code,
            side: 'left',
            hostName: room.hostName,
            guestName: room.guestName,
            targetScore: room.targetScore,
            status: room.status,
          });
          broadcastRoomList();
          break;
        }
        case 'room:join': {
          const result = roomManager.joinRoom(clientId, msg.code, msg.playerName);
          if (!result.ok) {
            send(ws, { type: 'room:error', message: result.error });
            return;
          }
          const { room, side } = result;
          send(ws, {
            type: 'room:joined',
            code: room.code,
            side,
            hostName: room.hostName,
            guestName: room.guestName,
            targetScore: room.targetScore,
            status: room.status,
          });

          const hostSocket = socketsById.get(room.hostId);
          const guestSocket = room.guestId ? socketsById.get(room.guestId) : undefined;
          const playersPayload: ServerToClientMessage = {
            type: 'room:players',
            hostName: room.hostName,
            guestName: room.guestName,
            status: room.status,
          };
          send(hostSocket, playersPayload);
          send(guestSocket, playersPayload);

          const initialSync: ServerToClientMessage = {
            type: 'game:state',
            state: room.state,
            events: [],
            serverTime: Date.now(),
          };
          send(hostSocket, initialSync);
          send(guestSocket, initialSync);
          broadcastRoomList();
          break;
        }
        case 'room:leave': {
          handleDisconnect(clientId);
          break;
        }
        case 'input:paddle': {
          const membership = roomManager.getMembership(clientId);
          if (!membership) return;
          const clampedY = Math.max(0, Math.min(TABLE_HEIGHT, Number(msg.targetY) || TABLE_HEIGHT / 2));
          if (membership.side === 'left') {
            membership.room.state.leftPaddle.targetY = clampedY;
          } else {
            membership.room.state.rightPaddle.targetY = clampedY;
          }
          break;
        }
        case 'input:serve': {
          const membership = roomManager.getMembership(clientId);
          if (!membership || membership.room.status !== 'playing') return;
          if (membership.room.state.servingSide === membership.side) {
            const events: MatchEvent[] = [];
            if (launchServe(membership.room.state, events)) {
              const payload: ServerToClientMessage = {
                type: 'game:state',
                state: membership.room.state,
                events,
                serverTime: Date.now(),
              };
              send(socketsById.get(membership.room.hostId), payload);
              if (membership.room.guestId) {
                send(socketsById.get(membership.room.guestId), payload);
              }
            }
          }
          break;
        }
        case 'match:rematch': {
          const res = roomManager.requestRematch(clientId);
          if (!res.room || !res.side) return;
          const hostSocket = socketsById.get(res.room.hostId);
          const guestSocket = res.room.guestId ? socketsById.get(res.room.guestId) : undefined;
          if (res.restarted) {
            const playersMsg: ServerToClientMessage = {
              type: 'room:players',
              hostName: res.room.hostName,
              guestName: res.room.guestName,
              status: res.room.status,
            };
            const stateMsg: ServerToClientMessage = {
              type: 'game:state',
              state: res.room.state,
              events: [],
              serverTime: Date.now(),
            };
            send(hostSocket, playersMsg);
            send(guestSocket, playersMsg);
            send(hostSocket, stateMsg);
            send(guestSocket, stateMsg);
            broadcastRoomList();
          } else {
            const voteMsg: ServerToClientMessage = {
              type: 'room:rematch_vote',
              side: res.side,
            };
            send(hostSocket, voteMsg);
            send(guestSocket, voteMsg);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      socketsById.delete(clientId);
      handleDisconnect(clientId);
    });

    ws.on('error', () => {
      socketsById.delete(clientId);
      handleDisconnect(clientId);
    });
  });

  function handleDisconnect(clientId: string): void {
    const { room, remainingClientId, leftSide } = roomManager.leaveRoom(clientId);
    if (!room) return;
    if (remainingClientId) {
      const targetSocket = socketsById.get(remainingClientId);
      if (leftSide === 'left') {
        send(targetSocket, {
          type: 'room:opponent_left',
          message: 'Host closed the Wi-Fi match room.',
        });
      } else {
        send(targetSocket, {
          type: 'room:opponent_left',
          message: 'Opponent disconnected. Waiting for a new challenger.',
        });
        send(targetSocket, {
          type: 'room:players',
          hostName: room.hostName,
          guestName: null,
          status: 'waiting',
        });
      }
    }
    broadcastRoomList();
  }

  // Authoritative 60Hz simulation loop for active multiplayer rooms
  let lastTick = performance.now();
  const TICK_MS = 1000 / 60;
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;

    const rooms = roomManager.getAllRooms();
    let statusChanged = false;

    for (const room of rooms) {
      if (room.status !== 'playing' || !room.guestId) continue;

      const events = stepMatch(room.state, {
        dt,
        leftMaxSpeed: 1350,
        rightMaxSpeed: 1350,
        autoServe: true,
      });

      if (room.state.phase === 'match_over') {
        room.status = 'finished';
        statusChanged = true;
      }

      const payload: ServerToClientMessage = {
        type: 'game:state',
        state: room.state,
        events,
        serverTime: Date.now(),
      };
      const encoded = JSON.stringify(payload);
      const hostWs = socketsById.get(room.hostId);
      const guestWs = socketsById.get(room.guestId);
      if (hostWs && hostWs.readyState === WebSocket.OPEN) hostWs.send(encoded);
      if (guestWs && guestWs.readyState === WebSocket.OPEN) guestWs.send(encoded);
    }

    if (statusChanged) {
      broadcastRoomList();
    }
  }, TICK_MS);

  httpServer.listen(PORT, '0.0.0.0', () => {
    const ips = getLanAddresses();
    console.log(`SpinCourt server running on http://localhost:${PORT}`);
    if (ips.length > 0) {
      console.log(`Local Wi-Fi LAN: http://${ips[0]}:${PORT}`);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start SpinCourt server:', err);
  process.exit(1);
});
