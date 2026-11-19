import { createInitialMatchState } from './engine';
import type { MatchTarget, NetworkRoomSummary, PlayerSide, TableMatchState } from './types';

export interface ServerRoom {
  code: string;
  hostId: string;
  hostName: string;
  guestId: string | null;
  guestName: string | null;
  targetScore: MatchTarget;
  status: 'waiting' | 'playing' | 'finished';
  state: TableMatchState;
  rematchVotes: Set<PlayerSide>;
  createdAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private rooms = new Map<string, ServerRoom>();
  private clientToRoom = new Map<string, { code: string; side: PlayerSide }>();

  public generateCode(existing = this.rooms): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!existing.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-3).toUpperCase()}`;
  }

  public createRoom(
    clientId: string,
    playerName: string,
    targetScore: MatchTarget,
    forcedCode?: string,
  ): ServerRoom {
    this.leaveRoom(clientId);
    const code = (forcedCode ?? this.generateCode()).toUpperCase();
    const safeName = playerName.trim().slice(0, 18) || 'Player 1';
    const room: ServerRoom = {
      code,
      hostId: clientId,
      hostName: safeName,
      guestId: null,
      guestName: null,
      targetScore,
      status: 'waiting',
      state: createInitialMatchState(targetScore, 'left'),
      rematchVotes: new Set(),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.clientToRoom.set(clientId, { code, side: 'left' });
    return room;
  }

  public joinRoom(
    clientId: string,
    rawCode: string,
    playerName: string,
  ): { ok: true; room: ServerRoom; side: PlayerSide } | { ok: false; error: string } {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: `Room "${code}" was not found on this Wi-Fi server.` };
    }
    if (room.hostId === clientId) {
      return { ok: true, room, side: 'left' };
    }
    if (room.guestId === clientId) {
      return { ok: true, room, side: 'right' };
    }
    if (room.guestId !== null) {
      return { ok: false, error: `Room "${code}" already has 2 players.` };
    }

    this.leaveRoom(clientId);
    const safeName = playerName.trim().slice(0, 18) || 'Player 2';
    room.guestId = clientId;
    room.guestName = safeName;
    room.status = 'playing';
    room.state = createInitialMatchState(room.targetScore, 'left');
    room.rematchVotes.clear();
    this.clientToRoom.set(clientId, { code, side: 'right' });

    return { ok: true, room, side: 'right' };
  }

  public leaveRoom(clientId: string): {
    room: ServerRoom | null;
    remainingClientId: string | null;
    leftSide: PlayerSide | null;
  } {
    const membership = this.clientToRoom.get(clientId);
    if (!membership) {
      return { room: null, remainingClientId: null, leftSide: null };
    }
    this.clientToRoom.delete(clientId);
    const room = this.rooms.get(membership.code);
    if (!room) {
      return { room: null, remainingClientId: null, leftSide: membership.side };
    }

    if (membership.side === 'left') {
      const remaining = room.guestId;
      if (remaining) {
        this.clientToRoom.delete(remaining);
      }
      this.rooms.delete(room.code);
      return { room, remainingClientId: remaining, leftSide: 'left' };
    } else {
      room.guestId = null;
      room.guestName = null;
      room.status = 'waiting';
      room.rematchVotes.clear();
      room.state = createInitialMatchState(room.targetScore, 'left');
      return { room, remainingClientId: room.hostId, leftSide: 'right' };
    }
  }

  public getMembership(clientId: string): { room: ServerRoom; side: PlayerSide } | null {
    const m = this.clientToRoom.get(clientId);
    if (!m) return null;
    const room = this.rooms.get(m.code);
    if (!room) return null;
    return { room, side: m.side };
  }

  public requestRematch(clientId: string): {
    room: ServerRoom | null;
    side: PlayerSide | null;
    restarted: boolean;
  } {
    const m = this.getMembership(clientId);
    if (!m || !m.room.guestId) {
      return { room: null, side: null, restarted: false };
    }
    m.room.rematchVotes.add(m.side);
    if (m.room.rematchVotes.has('left') && m.room.rematchVotes.has('right')) {
      m.room.rematchVotes.clear();
      m.room.status = 'playing';
      const nextStarter: PlayerSide = m.room.state.winner === 'left' ? 'right' : 'left';
      m.room.state = createInitialMatchState(m.room.targetScore, nextStarter);
      return { room: m.room, side: m.side, restarted: true };
    }
    return { room: m.room, side: m.side, restarted: false };
  }

  public getAllRooms(): ServerRoom[] {
    return Array.from(this.rooms.values());
  }

  public getRoomSummaries(): NetworkRoomSummary[] {
    return Array.from(this.rooms.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((room) => ({
        code: room.code,
        hostName: room.hostName,
        targetScore: room.targetScore,
        playerCount: room.guestId ? 2 : 1,
        maxPlayers: 2,
        status: room.status,
        createdAt: room.createdAt,
      }));
  }
}
