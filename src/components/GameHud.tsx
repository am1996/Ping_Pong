import type { GameMode, PlayerSide } from '../game/types';

export interface HudSnapshot {
  leftScore: number;
  rightScore: number;
  targetScore: number;
  servingSide: PlayerSide;
  isDeuce: boolean;
  currentRally: number;
  fastestShotKmh: number;
  ballSpeedKmh: number;
}

interface GameHudProps {
  mode: GameMode;
  localSide: PlayerSide;
  localName: string;
  opponentName: string;
  hud: HudSnapshot;
  muted: boolean;
  roomCode: string | null;
  pingMs: number | null;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export function GameHud({
  mode,
  localSide,
  localName,
  opponentName,
  hud,
  muted,
  roomCode,
  pingMs,
  onToggleMute,
  onPause,
  onRestart,
}: GameHudProps) {
  const youScore = localSide === 'left' ? hud.leftScore : hud.rightScore;
  const oppScore = localSide === 'left' ? hud.rightScore : hud.leftScore;
  const youServing = hud.servingSide === localSide;

  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-4"
      data-testid="game-hud"
    >
      {/* Top Perimeter Bar */}
      <div className="flex items-start justify-between gap-2">
        {/* Left: Compact Match Context */}
        <div
          className="hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-lg border border-white/12 text-xs text-slate-200"
          style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
        >
          <span className="font-semibold text-slate-100">
            {mode === 'solo' ? 'Solo Match' : `Wi-Fi Room ${roomCode ?? ''}`}
          </span>
          <span aria-hidden="true" className="text-slate-500">
            ·
          </span>
          <span className="font-mono-code text-slate-300">First to {hud.targetScore}</span>
          {mode === 'multiplayer' && pingMs !== null && (
            <>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="font-mono-code text-emerald-300">{pingMs} ms</span>
            </>
          )}
        </div>

        {/* Center: Tournament Scoreboard */}
        <div
          className="mx-auto flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-1.5 sm:py-2 rounded-xl border border-white/15 shadow-lg"
          style={{ backgroundColor: 'rgba(11, 18, 32, 0.92)' }}
          aria-label={`Score: ${localName} ${youScore}, ${opponentName} ${oppScore}`}
          data-testid="scoreboard"
        >
          <div className="flex items-center gap-2.5 min-w-[78px] sm:min-w-[116px] justify-end">
            <div className="text-right">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-300 truncate max-w-[76px] sm:max-w-[110px]">
                {localName}
              </div>
              <div className="text-[10px] font-medium text-red-400 leading-tight">
                {youServing ? 'SERVING' : 'YOU'}
              </div>
            </div>
            <span
              className="tabular-score text-3xl sm:text-4xl font-extrabold text-white leading-none"
              data-testid="score-you"
            >
              {youScore}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-1">
            <span className="text-slate-500 font-display text-xl font-bold leading-none">:</span>
            {hud.isDeuce ? (
              <span className="text-[10px] font-bold tracking-wider text-amber-400 mt-0.5">
                DEUCE
              </span>
            ) : hud.currentRally >= 3 ? (
              <span className="text-[10px] font-mono-code text-sky-300 mt-0.5">
                {hud.currentRally}x
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2.5 min-w-[78px] sm:min-w-[116px]">
            <span
              className="tabular-score text-3xl sm:text-4xl font-extrabold text-amber-300 leading-none"
              data-testid="score-opponent"
            >
              {oppScore}
            </span>
            <div className="text-left">
              <div className="text-[11px] sm:text-xs font-semibold text-slate-300 truncate max-w-[76px] sm:max-w-[110px]">
                {opponentName}
              </div>
              <div className="text-[10px] font-medium text-amber-400/90 leading-tight">
                {!youServing ? 'SERVING' : mode === 'solo' ? 'AI' : 'RIVAL'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Utility Square Icon Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            title="Mute (M)"
            className="w-11 h-11 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.9)' }}
          >
            {muted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>

          {mode === 'solo' && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              aria-label="Restart match (R)"
              title="Restart (R)"
              className="w-11 h-11 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:bg-slate-800 active:scale-95 transition cursor-pointer"
              style={{ backgroundColor: 'rgba(11, 18, 32, 0.9)' }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause match (P)"
            title="Pause (P)"
            className="w-11 h-11 rounded-lg border border-white/15 flex items-center justify-center text-slate-200 hover:bg-slate-800 active:scale-95 transition cursor-pointer"
            style={{ backgroundColor: 'rgba(11, 18, 32, 0.9)' }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Subtle bottom telemetry only for live speed when rallying */}
      <div className="flex items-end justify-between text-[11px] text-slate-400 px-1">
        <span className="sm:hidden font-mono-code">
          {mode === 'multiplayer' && roomCode ? `Room ${roomCode}${pingMs ? ` · ${pingMs}ms` : ''}` : `First to ${hud.targetScore}`}
        </span>
        {hud.ballSpeedKmh > 0 && (
          <span className="ml-auto font-mono-code text-slate-300/80">
            {hud.ballSpeedKmh} km/h
          </span>
        )}
      </div>
    </div>
  );
}
