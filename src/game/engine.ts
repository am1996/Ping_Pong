import type {
  Difficulty,
  MatchEvent,
  MatchTarget,
  PaddleState,
  PlayerSide,
  TableMatchState,
} from './types';

export const TABLE_WIDTH = 900;
export const TABLE_HEIGHT = 540;
export const NET_X = TABLE_WIDTH / 2;
export const PADDLE_MARGIN_X = 48;
export const PADDLE_WIDTH = 16;
export const PADDLE_HEIGHT = 96;
export const BALL_RADIUS = 10;

const GRAVITY = 1580;
const BASE_BALL_SPEED = 520;
const MAX_BALL_SPEED = 1080;
const SMASH_THRESHOLD_VY = 380;
const SERVE_AUTO_DELAY = 1.6;
const POINT_PAUSE_DELAY = 1.15;

export interface AiProfile {
  label: string;
  tagline: string;
  maxSpeed: number;
  reactionBias: number; // how early it tracks (0..1)
  errorMargin: number; // vertical aim jitter in logical px
  spinReturnFactor: number;
  smashAggression: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  rookie: {
    label: 'Club Rookie',
    tagline: 'Steady rallies, forgiving pace',
    maxSpeed: 390,
    reactionBias: 0.42,
    errorMargin: 28,
    spinReturnFactor: 0.2,
    smashAggression: 0.12,
  },
  tactician: {
    label: 'Spin Tactician',
    tagline: 'Curved returns & sharp corners',
    maxSpeed: 560,
    reactionBias: 0.68,
    errorMargin: 14,
    spinReturnFactor: 0.65,
    smashAggression: 0.42,
  },
  grandmaster: {
    label: 'Grandmaster',
    tagline: 'Fast footwork & heavy smashes',
    maxSpeed: 760,
    reactionBias: 0.9,
    errorMargin: 5,
    spinReturnFactor: 0.95,
    smashAggression: 0.78,
  },
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createPaddle(side: PlayerSide): PaddleState {
  return {
    x: side === 'left' ? PADDLE_MARGIN_X : TABLE_WIDTH - PADDLE_MARGIN_X,
    y: TABLE_HEIGHT / 2,
    targetY: TABLE_HEIGHT / 2,
    vy: 0,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    hitFlash: 0,
    recoil: 0,
  };
}

export function createInitialMatchState(
  targetScore: MatchTarget = 11,
  initialServer: PlayerSide = 'left',
): TableMatchState {
  const state: TableMatchState = {
    phase: 'serve_wait',
    servingSide: initialServer,
    winner: null,
    targetScore,
    phaseTimer: SERVE_AUTO_DELAY,
    hitstopTimer: 0,
    isDeuce: false,
    ball: {
      x: initialServer === 'left' ? PADDLE_MARGIN_X + 34 : TABLE_WIDTH - PADDLE_MARGIN_X - 34,
      y: TABLE_HEIGHT / 2,
      z: 22,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      lastHitBy: null,
      bouncesOnSide: 0,
      speedKmh: 0,
      isSmash: false,
    },
    leftPaddle: createPaddle('left'),
    rightPaddle: createPaddle('right'),
    stats: {
      leftScore: 0,
      rightScore: 0,
      currentRally: 0,
      longestRally: 0,
      fastestShotKmh: 0,
      leftSmashes: 0,
      rightSmashes: 0,
      totalHits: 0,
    },
    lastPointReason: '',
  };
  positionBallForServe(state);
  return state;
}

export function computeServingSide(
  leftScore: number,
  rightScore: number,
  targetScore: MatchTarget,
  firstServer: PlayerSide = 'left',
): PlayerSide {
  const total = leftScore + rightScore;
  const deuceThreshold = targetScore - 1;
  const inDeuce = leftScore >= deuceThreshold && rightScore >= deuceThreshold;
  const flips = inDeuce
    ? Math.floor((deuceThreshold * 2) / 2) + (total - deuceThreshold * 2)
    : Math.floor(total / 2);
  const flipOdd = flips % 2 === 1;
  if (firstServer === 'left') {
    return flipOdd ? 'right' : 'left';
  }
  return flipOdd ? 'left' : 'right';
}

export function checkMatchWinner(
  leftScore: number,
  rightScore: number,
  targetScore: MatchTarget,
): PlayerSide | null {
  if (leftScore >= targetScore && leftScore - rightScore >= 2) {
    return 'left';
  }
  if (rightScore >= targetScore && rightScore - leftScore >= 2) {
    return 'right';
  }
  return null;
}

export function speedToKmh(vx: number, vy: number): number {
  const mag = Math.hypot(vx, vy);
  return Math.round(mag * 0.135);
}

export function positionBallForServe(state: TableMatchState): void {
  const paddle = state.servingSide === 'left' ? state.leftPaddle : state.rightPaddle;
  const offset = state.servingSide === 'left' ? 30 : -30;
  state.ball.x = paddle.x + offset;
  state.ball.y = paddle.y;
  state.ball.z = 24;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.vz = 0;
  state.ball.spin = 0;
  state.ball.lastHitBy = null;
  state.ball.bouncesOnSide = 0;
  state.ball.speedKmh = 0;
  state.ball.isSmash = false;
}

export function launchServe(
  state: TableMatchState,
  events: MatchEvent[],
  randomSeed = Math.random(),
): boolean {
  if (state.phase !== 'serve_wait') {
    return false;
  }
  const dir = state.servingSide === 'left' ? 1 : -1;
  const paddle = state.servingSide === 'left' ? state.leftPaddle : state.rightPaddle;
  const angleSpread = (randomSeed - 0.5) * 0.42;
  const paddleBias = clamp(paddle.vy / 900, -0.35, 0.35);
  const vyAngle = clamp(angleSpread + paddleBias, -0.5, 0.5);

  state.ball.vx = dir * BASE_BALL_SPEED * Math.cos(vyAngle);
  state.ball.vy = BASE_BALL_SPEED * Math.sin(vyAngle);
  state.ball.vz = 265;
  state.ball.z = 26;
  state.ball.spin = clamp(paddle.vy * 0.32, -260, 260);
  state.ball.lastHitBy = state.servingSide;
  state.ball.bouncesOnSide = 0;
  state.ball.isSmash = false;
  state.ball.speedKmh = speedToKmh(state.ball.vx, state.ball.vy);
  state.stats.fastestShotKmh = Math.max(state.stats.fastestShotKmh, state.ball.speedKmh);

  paddle.hitFlash = 1;
  paddle.recoil = dir * -0.7;
  state.phase = 'rally';
  state.phaseTimer = 0;

  events.push({
    type: 'paddle_hit',
    x: state.ball.x,
    y: state.ball.y,
    side: state.servingSide,
    intensity: 0.65,
  });
  return true;
}

function updatePaddleKinematics(paddle: PaddleState, dt: number, maxSpeed: number): void {
  const halfH = paddle.height / 2;
  const clampedTarget = clamp(paddle.targetY, halfH + 8, TABLE_HEIGHT - halfH - 8);
  const diff = clampedTarget - paddle.y;
  const maxStep = maxSpeed * dt;
  const step = clamp(diff, -maxStep, maxStep);
  paddle.vy = dt > 0 ? step / dt : 0;
  paddle.y = clamp(paddle.y + step, halfH + 8, TABLE_HEIGHT - halfH - 8);
  paddle.hitFlash = Math.max(0, paddle.hitFlash - dt * 5.5);
  paddle.recoil *= Math.pow(0.001, dt);
}

export function computeAiTargetY(
  state: TableMatchState,
  side: PlayerSide,
  difficulty: Difficulty,
  timeSec: number,
): number {
  const profile = AI_PROFILES[difficulty];
  const ball = state.ball;
  const movingTowardAi = side === 'right' ? ball.vx > 0 : ball.vx < 0;
  const paddleX = side === 'right' ? state.rightPaddle.x : state.leftPaddle.x;

  if (state.phase === 'serve_wait') {
    const idleOffset = Math.sin(timeSec * 2.1 + (side === 'left' ? 0 : 1.7)) * 55;
    return TABLE_HEIGHT / 2 + idleOffset;
  }

  if (!movingTowardAi) {
    // Return gently toward center-ready position with slight tactical drift
    const tacticalDrift = Math.sin(timeSec * 1.4 + (side === 'left' ? 0.5 : 2.3)) * 42;
    return TABLE_HEIGHT / 2 + tacticalDrift * (1 - profile.reactionBias * 0.4);
  }

  const distanceX = Math.abs(paddleX - ball.x);
  const progress = 1 - clamp(distanceX / TABLE_WIDTH, 0, 1);

  // Predict intercept point including spin curve for higher difficulties
  const timeToReach = Math.abs(ball.vx) > 20 ? distanceX / Math.abs(ball.vx) : 0;
  const spinContribution =
    0.5 * ball.spin * timeToReach * timeToReach * profile.spinReturnFactor;
  let predictedY = ball.y + ball.vy * timeToReach + spinContribution;

  // Reflect off top/bottom walls up to twice for prediction accuracy
  for (let i = 0; i < 2; i++) {
    if (predictedY < BALL_RADIUS) {
      predictedY = BALL_RADIUS + (BALL_RADIUS - predictedY);
    } else if (predictedY > TABLE_HEIGHT - BALL_RADIUS) {
      predictedY = TABLE_HEIGHT - BALL_RADIUS - (predictedY - (TABLE_HEIGHT - BALL_RADIUS));
    }
  }

  // Smoothly blend from live ball Y to predicted intercept based on difficulty reactionBias
  const blend = clamp(progress * 0.5 + profile.reactionBias * 0.65, 0.25, 1);
  const baseTarget = ball.y * (1 - blend) + predictedY * blend;

  // Deterministic subtle wave error so AI is beatable and feels human
  const jitter =
    Math.sin(timeSec * 3.7 + state.stats.totalHits * 1.9 + (side === 'left' ? 1 : 0)) *
    profile.errorMargin;

  // Aggressive angle offset for higher difficulties to aim for corners
  const aimOffset =
    Math.cos(state.stats.totalHits * 2.3) * 22 * profile.smashAggression;

  return clamp(baseTarget + jitter + aimOffset, PADDLE_HEIGHT / 2 + 10, TABLE_HEIGHT - PADDLE_HEIGHT / 2 - 10);
}

function awardPoint(
  state: TableMatchState,
  scorer: PlayerSide,
  reason: string,
  events: MatchEvent[],
): void {
  if (scorer === 'left') {
    state.stats.leftScore += 1;
  } else {
    state.stats.rightScore += 1;
  }
  state.stats.longestRally = Math.max(state.stats.longestRally, state.stats.currentRally);
  state.stats.currentRally = 0;
  state.lastPointReason = reason;

  const deuceThreshold = state.targetScore - 1;
  state.isDeuce =
    state.stats.leftScore >= deuceThreshold && state.stats.rightScore >= deuceThreshold;

  const winner = checkMatchWinner(
    state.stats.leftScore,
    state.stats.rightScore,
    state.targetScore,
  );

  events.push({
    type: 'point_scored',
    x: state.ball.x,
    y: state.ball.y,
    scorer,
    intensity: 1,
  });

  if (winner) {
    state.winner = winner;
    state.phase = 'match_over';
    state.phaseTimer = 0;
    events.push({
      type: 'match_won',
      x: NET_X,
      y: TABLE_HEIGHT / 2,
      scorer: winner,
      intensity: 1,
    });
  } else {
    state.servingSide = computeServingSide(
      state.stats.leftScore,
      state.stats.rightScore,
      state.targetScore,
      'left',
    );
    state.phase = 'point_pause';
    state.phaseTimer = POINT_PAUSE_DELAY;
  }
}

export interface StepMatchOptions {
  dt: number;
  leftMaxSpeed?: number;
  rightMaxSpeed?: number;
  autoServe?: boolean;
  serveRandom?: number;
}

export function stepMatch(
  state: TableMatchState,
  options: StepMatchOptions,
): MatchEvent[] {
  const dt = Math.min(Math.max(options.dt, 0), 0.05);
  const events: MatchEvent[] = [];

  if (state.phase === 'match_over') {
    updatePaddleKinematics(state.leftPaddle, dt, options.leftMaxSpeed ?? 950);
    updatePaddleKinematics(state.rightPaddle, dt, options.rightMaxSpeed ?? 950);
    return events;
  }

  // Update paddles even during hitstop/pause so input never feels dead
  updatePaddleKinematics(state.leftPaddle, dt, options.leftMaxSpeed ?? 1250);
  updatePaddleKinematics(state.rightPaddle, dt, options.rightMaxSpeed ?? 1250);

  // Hitstop freezes ball physics briefly for heavy smash weight
  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return events;
  }

  if (state.phase === 'point_pause') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phase = 'serve_wait';
      state.phaseTimer = SERVE_AUTO_DELAY;
      positionBallForServe(state);
    }
    return events;
  }

  if (state.phase === 'serve_wait') {
    positionBallForServe(state);
    if (options.autoServe !== false) {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        launchServe(state, events, options.serveRandom ?? Math.random());
      }
    }
    return events;
  }

  // Active rally simulation (sub-stepped twice to prevent tunneling at high smash speeds)
  const subSteps = 2;
  const subDt = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    if (state.phase !== 'rally') break;
    const ball = state.ball;

    // Magnus spin lateral acceleration
    ball.vy += ball.spin * subDt;
    ball.spin *= Math.pow(0.72, subDt);

    const prevX = ball.x;
    ball.x += ball.vx * subDt;
    ball.y += ball.vy * subDt;

    // Vertical arc & bounce physics
    ball.vz -= GRAVITY * subDt;
    ball.z += ball.vz * subDt;
    if (ball.z <= 0) {
      ball.z = 0;
      ball.vz = Math.max(210, Math.abs(ball.vz) * 0.82);
      ball.bouncesOnSide += 1;
      events.push({
        type: 'table_bounce',
        x: ball.x,
        y: ball.y,
        intensity: clamp(Math.hypot(ball.vx, ball.vy) / MAX_BALL_SPEED, 0.25, 1),
      });
    }

    // Net clip sensation when passing center line low
    if ((prevX < NET_X && ball.x >= NET_X) || (prevX > NET_X && ball.x <= NET_X)) {
      ball.bouncesOnSide = 0;
      if (ball.z < 12) {
        ball.z = 14;
        ball.vz = Math.max(ball.vz, 175);
        ball.vx *= 0.94;
        events.push({
          type: 'net_clip',
          x: NET_X,
          y: ball.y,
          intensity: 0.5,
        });
      }
    }

    // Side cushions (top & bottom table walls)
    if (ball.y - BALL_RADIUS < 0) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * 0.96;
      ball.spin *= -0.55;
      events.push({
        type: 'wall_bounce',
        x: ball.x,
        y: BALL_RADIUS,
        intensity: 0.4,
      });
    } else if (ball.y + BALL_RADIUS > TABLE_HEIGHT) {
      ball.y = TABLE_HEIGHT - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * 0.96;
      ball.spin *= -0.55;
      events.push({
        type: 'wall_bounce',
        x: ball.x,
        y: TABLE_HEIGHT - BALL_RADIUS,
        intensity: 0.4,
      });
    }

    // Paddle collision checks
    if (ball.vx < 0) {
      handlePaddleHit(state, state.leftPaddle, 'left', events);
    } else if (ball.vx > 0) {
      handlePaddleHit(state, state.rightPaddle, 'right', events);
    }

    // Out-of-bounds scoring checks
    if (ball.x < -BALL_RADIUS * 2) {
      awardPoint(state, 'right', 'Winner past left baseline', events);
      break;
    } else if (ball.x > TABLE_WIDTH + BALL_RADIUS * 2) {
      awardPoint(state, 'left', 'Winner past right baseline', events);
      break;
    }
  }

  return events;
}

function handlePaddleHit(
  state: TableMatchState,
  paddle: PaddleState,
  side: PlayerSide,
  events: MatchEvent[],
): void {
  const ball = state.ball;
  const paddleFrontX = side === 'left' ? paddle.x + paddle.width / 2 : paddle.x - paddle.width / 2;
  const paddleBackX = side === 'left' ? paddle.x - paddle.width / 2 : paddle.x + paddle.width / 2;

  const withinX =
    side === 'left'
      ? ball.x - BALL_RADIUS <= paddleFrontX && ball.x + BALL_RADIUS >= paddleBackX - 10
      : ball.x + BALL_RADIUS >= paddleFrontX && ball.x - BALL_RADIUS <= paddleBackX + 10;

  if (!withinX) return;

  const halfH = paddle.height / 2 + BALL_RADIUS * 0.75;
  const relY = ball.y - paddle.y;
  if (Math.abs(relY) > halfH) return;

  // Compute rebound angle & speed
  const normalizedHit = clamp(relY / (paddle.height / 2), -1, 1);
  const currentSpeed = Math.hypot(ball.vx, ball.vy);
  const swingPower = Math.abs(paddle.vy);
  const isSmash = swingPower >= SMASH_THRESHOLD_VY && Math.abs(normalizedHit) < 0.78;

  const speedBoost = isSmash ? 1.18 : 1.055;
  const nextSpeed = clamp(
    Math.max(currentSpeed * speedBoost, BASE_BALL_SPEED + (isSmash ? 150 : 25)),
    BASE_BALL_SPEED,
    MAX_BALL_SPEED,
  );

  const maxAngle = 0.86; // ~49 degrees
  const bounceAngle = clamp(normalizedHit * maxAngle + clamp(paddle.vy / 1800, -0.22, 0.22), -0.95, 0.95);
  const dir = side === 'left' ? 1 : -1;

  ball.x = side === 'left' ? paddleFrontX + BALL_RADIUS + 1 : paddleFrontX - BALL_RADIUS - 1;
  ball.vx = dir * nextSpeed * Math.cos(bounceAngle);
  ball.vy = nextSpeed * Math.sin(bounceAngle);
  ball.vz = isSmash ? 245 : 300;
  ball.z = Math.max(ball.z, 20);
  ball.spin = clamp(paddle.vy * 0.55 + normalizedHit * 130, -420, 420);
  ball.lastHitBy = side;
  ball.bouncesOnSide = 0;
  ball.isSmash = isSmash;
  ball.speedKmh = speedToKmh(ball.vx, ball.vy);

  state.stats.currentRally += 1;
  state.stats.totalHits += 1;
  state.stats.longestRally = Math.max(state.stats.longestRally, state.stats.currentRally);
  state.stats.fastestShotKmh = Math.max(state.stats.fastestShotKmh, ball.speedKmh);

  if (isSmash) {
    if (side === 'left') state.stats.leftSmashes += 1;
    else state.stats.rightSmashes += 1;
    state.hitstopTimer = 0.036;
  }

  paddle.hitFlash = 1;
  paddle.recoil = dir * (isSmash ? -1.0 : -0.55);

  events.push({
    type: isSmash ? 'smash_hit' : 'paddle_hit',
    x: ball.x,
    y: ball.y,
    side,
    intensity: isSmash ? 1 : clamp(nextSpeed / MAX_BALL_SPEED, 0.4, 0.85),
  });
}
