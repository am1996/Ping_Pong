import type { GameMode, MatchStats, PlayerSide } from '../game/types';

interface StatusModalProps {
  variant: 'paused' | 'gameover';
  mode: GameMode;
  localSide: PlayerSide;
  winner: PlayerSide | null;
  localName: string;
  opponentName: string;
  stats: MatchStats;
  rematchPending: boolean;
  opponentWantsRematch: boolean;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export function StatusModal({
  variant,
  mode,
  localSide,
  winner,
  localName,
  opponentName,
  stats,
  rematchPending,
  opponentWantsRematch,
  onResume,
  onRestart,
  onTitle,
}: StatusModalProps) {
  const youScore = localSide === 'left' ? stats.leftScore : stats.rightScore;
  const oppScore = localSide === 'left' ? stats.rightScore : stats.leftScore;
  const youSmashes = localSide === 'left' ? stats.leftSmashes : stats.rightSmashes;
  const didWin = winner === localSide;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 19, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/15 shadow-2xl p-6 text-center"
        style={{ backgroundColor: '#0E1729' }}
      >
        {variant === 'paused' ? (
          <>
            <h2 id="status-modal-title" className="font-display text-3xl font-extrabold text-white tracking-tight">
              Match Paused
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {localName} {youScore} — {oppScore} {opponentName}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="w-full h-12 rounded-xl bg-[#D93829] hover:bg-[#E04536] text-white font-semibold text-sm cursor-pointer"
              >
                Resume Match
              </button>
              {mode === 'solo' && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/12 text-slate-100 font-semibold text-sm cursor-pointer"
                >
                  Restart Match
                </button>
              )}
              <button
                type="button"
                onClick={onTitle}
                className="w-full h-11 rounded-xl bg-transparent hover:bg-slate-800/70 border border-white/12 text-slate-300 font-medium text-sm cursor-pointer"
              >
                {mode === 'multiplayer' ? 'Leave Wi-Fi Match' : 'Exit to Title'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              id="status-modal-title"
              className={`font-display text-4xl font-extrabold tracking-tight ${
                didWin ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {didWin ? 'VICTORY' : 'MATCH OVER'}
            </h2>
            <p className="text-sm text-slate-300 mt-1">
              {didWin
                ? `${localName} defeats ${opponentName}`
                : `${opponentName} takes the match`}
            </p>

            {/* Frozen End-of-Run Stat Tiles */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-[#09101E] border border-white/10">
                <div className="tabular-score text-2xl font-bold text-white">
                  {youScore}-{oppScore}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Score</div>
              </div>
              <div className="p-3 rounded-xl bg-[#09101E] border border-white/10">
                <div className="tabular-score text-2xl font-bold text-sky-300">
                  {stats.longestRally}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Best Rally</div>
              </div>
              <div className="p-3 rounded-xl bg-[#09101E] border border-white/10">
                <div className="tabular-score text-2xl font-bold text-amber-300">
                  {stats.fastestShotKmh}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Top km/h</div>
              </div>
            </div>

            <div className="mt-2.5 text-xs text-slate-400">
              Power Smashes Landed: <span className="font-mono-code text-slate-200">{youSmashes}</span>
            </div>

            {mode === 'multiplayer' && opponentWantsRematch && !rematchPending && (
              <p className="mt-3 text-xs font-medium text-emerald-300">
                {opponentName} requested a rematch!
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                disabled={rematchPending}
                onClick={onRestart}
                className="w-full h-12 rounded-xl bg-[#D93829] hover:bg-[#E04536] disabled:opacity-60 text-white font-semibold text-sm cursor-pointer"
              >
                {mode === 'multiplayer'
                  ? rematchPending
                    ? 'Waiting for Opponent...'
                    : 'Request Rematch'
                  : 'Play Again'}
              </button>
              <button
                type="button"
                onClick={onTitle}
                className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/12 text-slate-200 font-medium text-sm cursor-pointer"
              >
                Back to Title
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
