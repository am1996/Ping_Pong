import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROFILES,
  checkMatchWinner,
  computeAiTargetY,
  computeServingSide,
  createInitialMatchState,
  launchServe,
  stepMatch,
  TABLE_HEIGHT,
  TABLE_WIDTH,
} from './engine';
import { RoomManager } from './rooms';
import { buildApiBaseUrl, buildWebSocketUrl } from './network';
import type { MatchEvent } from './types';

test('official 11-point scoring rules handle standard win and deuce win-by-2', () => {
  assert.equal(checkMatchWinner(10, 8, 11), null);
  assert.equal(checkMatchWinner(11, 9, 11), 'left');
  assert.equal(checkMatchWinner(11, 10, 11), null); // Deuce requires 2-point lead
  assert.equal(checkMatchWinner(12, 10, 11), 'left');
  assert.equal(checkMatchWinner(11, 13, 11), 'right');
  assert.equal(checkMatchWinner(5, 3, 5), 'left');
  assert.equal(checkMatchWinner(5, 4, 5), null);
});

test('serve rotation switches every 2 points normally and every 1 point at deuce', () => {
  assert.equal(computeServingSide(0, 0, 11, 'left'), 'left');
  assert.equal(computeServingSide(1, 0, 11, 'left'), 'left');
  assert.equal(computeServingSide(1, 1, 11, 'left'), 'right');
  assert.equal(computeServingSide(2, 1, 11, 'left'), 'right');
  assert.equal(computeServingSide(2, 2, 11, 'left'), 'left');
  // Deuce at 10-10 switches every single point
  assert.equal(computeServingSide(10, 10, 11, 'left'), 'left');
  assert.equal(computeServingSide(11, 10, 11, 'left'), 'right');
  assert.equal(computeServingSide(11, 11, 11, 'left'), 'left');
});

test('serve launch enters rally and ball bounces on table surface with gravity', () => {
  const state = createInitialMatchState(11, 'left');
  const events: MatchEvent[] = [];
  const launched = launchServe(state, events, 0.5);
  assert.equal(launched, true);
  assert.equal(state.phase, 'rally');
  assert.ok(state.ball.vx > 300);

  let sawTableBounce = false;
  for (let i = 0; i < 60; i++) {
    const stepEvents = stepMatch(state, { dt: 1 / 60 });
    if (stepEvents.some((e) => e.type === 'table_bounce')) {
      sawTableBounce = true;
    }
  }
  assert.equal(sawTableBounce, true);
});

test('paddle hit with high swing speed triggers smash, spin, and hitstop', () => {
  const state = createInitialMatchState(11, 'left');
  state.phase = 'rally';
  state.ball.x = state.leftPaddle.x + state.leftPaddle.width / 2 + 8;
  state.ball.y = state.leftPaddle.y;
  state.ball.vx = -560;
  state.ball.vy = 0;
  state.ball.z = 18;
  // Move target strongly downward to create high paddle.vy during step
  state.leftPaddle.targetY = TABLE_HEIGHT - 20;

  const events = stepMatch(state, { dt: 1 / 60, leftMaxSpeed: 1400 });
  const hitEvent = events.find((e) => e.type === 'smash_hit' || e.type === 'paddle_hit');
  assert.ok(hitEvent, 'expected paddle collision event');
  assert.equal(hitEvent?.type, 'smash_hit');
  assert.ok(state.ball.vx > 0, 'ball should rebound rightward');
  assert.ok(Math.abs(state.ball.spin) > 50, 'smash swing should apply spin');
  assert.ok(state.hitstopTimer > 0, 'smash should trigger hitstop');
  assert.equal(state.stats.leftSmashes, 1);
});

test('ball passing right baseline awards point to left player and respects match target', () => {
  const state = createInitialMatchState(5, 'left');
  state.stats.leftScore = 4;
  state.stats.rightScore = 2;
  state.phase = 'rally';
  state.ball.x = TABLE_WIDTH + 30;
  state.ball.y = TABLE_HEIGHT / 2;
  state.ball.vx = 500;

  const events = stepMatch(state, { dt: 1 / 60 });
  assert.equal(state.stats.leftScore, 5);
  assert.equal(state.winner, 'left');
  assert.equal(state.phase, 'match_over');
  assert.ok(events.some((e) => e.type === 'match_won'));
});

test('all three AI opponent policies return valid bounded targets', () => {
  const state = createInitialMatchState(11, 'left');
  state.phase = 'rally';
  state.ball.x = TABLE_WIDTH * 0.65;
  state.ball.y = 140;
  state.ball.vx = 620;
  state.ball.vy = 90;
  state.ball.spin = 180;

  for (const difficulty of Object.keys(AI_PROFILES) as Array<keyof typeof AI_PROFILES>) {
    const target = computeAiTargetY(state, 'right', difficulty, 1.5);
    assert.ok(Number.isFinite(target), `${difficulty} returned non-finite target`);
    assert.ok(target > 0 && target < TABLE_HEIGHT, `${difficulty} target out of table bounds`);
  }
});

test('RoomManager manages host, guest join, capacity guard, rematch, and disconnect cleanup', () => {
  const mgr = new RoomManager();
  const room = mgr.createRoom('host-1', 'Alice', 7, 'WIFI');
  assert.equal(room.code, 'WIFI');
  assert.equal(room.status, 'waiting');

  const joinRes = mgr.joinRoom('guest-2', 'wifi', 'Bob');
  assert.equal(joinRes.ok, true);
  if (joinRes.ok) {
    assert.equal(joinRes.side, 'right');
    assert.equal(joinRes.room.status, 'playing');
  }

  // Third player must be rejected
  const fullRes = mgr.joinRoom('guest-3', 'WIFI', 'Charlie');
  assert.equal(fullRes.ok, false);

  // Rematch requires both players to agree
  const vote1 = mgr.requestRematch('host-1');
  assert.equal(vote1.restarted, false);
  const vote2 = mgr.requestRematch('guest-2');
  assert.equal(vote2.restarted, true);
  assert.equal(room.status, 'playing');

  // Guest leaving returns host to waiting
  const leaveGuest = mgr.leaveRoom('guest-2');
  assert.equal(leaveGuest.remainingClientId, 'host-1');
  assert.equal(room.status, 'waiting');
  assert.equal(room.guestId, null);

  // Host leaving closes the room
  mgr.leaveRoom('host-1');
  assert.equal(mgr.getRoomSummaries().length, 0);
});

test('LAN URL builders normalize raw IP:port addresses for Android APK Wi-Fi multiplayer', () => {
  assert.equal(buildWebSocketUrl('192.168.1.42:3000'), 'ws://192.168.1.42:3000/ws');
  assert.equal(buildWebSocketUrl('https://arena.example.com'), 'wss://arena.example.com/ws');
  assert.equal(buildApiBaseUrl('192.168.1.42:3000'), 'http://192.168.1.42:3000');
});
