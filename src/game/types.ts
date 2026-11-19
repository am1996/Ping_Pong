export type GameMode = 'solo' | 'multiplayer';
export type Difficulty = 'rookie' | 'tactician' | 'grandmaster';
export type AppScreenState = 'title' | 'lobby' | 'playing' | 'paused' | 'gameover';
export type PlayerSide = 'left' | 'right';
export type MatchTarget = 5 | 7 | 11;

export interface BallState {
  x: number;
  y: number;
  z: number; // height above table in logical units (0 = touching table)
  vx: number;
  vy: number;
  vz: number;
  spin: number; // lateral curve acceleration (rad/s equivalent)
  lastHitBy: PlayerSide | null;
  bouncesOnSide: number;
  speedKmh: number;
  isSmash: boolean;
}

export interface PaddleState {
  x: number;
  y: number;
  targetY: number;
  vy: number;
  width: number;
  height: number;
  hitFlash: number; // 0..1 visual recoil/flash timer
  recoil: number; // -1..1 horizontal kick
}

export interface MatchEvent {
  type:
    | 'paddle_hit'
    | 'smash_hit'
    | 'table_bounce'
    | 'wall_bounce'
    | 'net_clip'
    | 'point_scored'
    | 'match_won';
  x: number;
  y: number;
  side?: PlayerSide;
  intensity?: number;
  scorer?: PlayerSide;
}

export interface MatchStats {
  leftScore: number;
  rightScore: number;
  currentRally: number;
  longestRally: number;
  fastestShotKmh: number;
  leftSmashes: number;
  rightSmashes: number;
  totalHits: number;
}

export interface TableMatchState {
  phase: 'serve_wait' | 'rally' | 'point_pause' | 'match_over';
  servingSide: PlayerSide;
  winner: PlayerSide | null;
  targetScore: MatchTarget;
  phaseTimer: number;
  hitstopTimer: number;
  isDeuce: boolean;
  ball: BallState;
  leftPaddle: PaddleState;
  rightPaddle: PaddleState;
  stats: MatchStats;
  lastPointReason: string;
}

export interface NetworkRoomSummary {
  code: string;
  hostName: string;
  targetScore: MatchTarget;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

export interface LanNetworkInfo {
  port: number;
  addresses: string[];
  hostname: string;
}

export type ClientToServerMessage =
  | { type: 'room:list' }
  | { type: 'room:create'; playerName: string; targetScore: MatchTarget }
  | { type: 'room:join'; code: string; playerName: string }
  | { type: 'room:leave' }
  | { type: 'input:paddle'; targetY: number }
  | { type: 'input:serve' }
  | { type: 'match:rematch' }
  | { type: 'ping'; ts: number };

export type ServerToClientMessage =
  | { type: 'rooms:update'; rooms: NetworkRoomSummary[] }
  | {
      type: 'room:joined';
      code: string;
      side: PlayerSide;
      hostName: string;
      guestName: string | null;
      targetScore: MatchTarget;
      status: 'waiting' | 'playing' | 'finished';
    }
  | {
      type: 'room:players';
      hostName: string;
      guestName: string | null;
      status: 'waiting' | 'playing' | 'finished';
    }
  | {
      type: 'game:state';
      state: TableMatchState;
      events: MatchEvent[];
      serverTime: number;
    }
  | { type: 'room:rematch_vote'; side: PlayerSide }
  | { type: 'room:opponent_left'; message: string }
  | { type: 'room:error'; message: string }
  | { type: 'pong'; ts: number };
