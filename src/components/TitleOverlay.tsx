import { AI_PROFILES } from '../game/engine';
import type { Difficulty, MatchTarget } from '../game/types';
import { TitleEmblem } from './TitleEmblem';

interface TitleOverlayProps {
  difficulty: Difficulty;
  targetScore: MatchTarget;
  muted: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  onSelectDifficulty: (d: Difficulty) => void;
  onSelectTarget: (t: MatchTarget) => void;
  onStartSolo: () => void;
  onOpenWifiLobby: () => void;
  onOpenAndroidApk: () => void;
  onInstallPWA: () => Promise<boolean>;
  onToggleMute: () => void;
}

const DIFFICULTIES: Difficulty[] = ['rookie', 'tactician', 'grandmaster'];
const TARGETS: MatchTarget[] = [5, 7, 11];

export function TitleOverlay({
  difficulty,
  targetScore,
  muted,
  isInstallable,
  isInstalled,
  isOnline,
  onSelectDifficulty,
  onSelectTarget,
  onStartSolo,
  onOpenWifiLobby,
  onOpenAndroidApk,
  onInstallPWA,
  onToggleMute,
}: TitleOverlayProps) {
  const activeProfile = AI_PROFILES[difficulty];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between px-4 pt-4 pb-2.5 sm:px-8 sm:pt-8 sm:pb-3">
      {/* Main Title Card anchored to left third on desktop, centered on mobile */}
      <div className="flex-1 flex items-center justify-center lg:justify-start">
        <div
          className="pointer-events-auto w-full max-w-[400px] rounded-2xl border border-white/14 shadow-2xl p-5 sm:p-6 space-y-5"
          style={{ backgroundColor: 'rgba(10, 17, 30, 0.92)' }}
        >
          <TitleEmblem />

          {/* Solo Opponent Difficulty */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Solo Opponent</span>
              <span className="text-slate-400">{activeProfile.tagline}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#070D19] border border-white/10">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelectDifficulty(d)}
                  className={`h-10 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    difficulty === d
                      ? 'bg-slate-100 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d === 'rookie' ? 'Rookie' : d === 'tactician' ? 'Tactician' : 'Master'}
                </button>
              ))}
            </div>
          </div>

          {/* Match Target Points */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-300">Match Length</span>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#070D19] border border-white/10 w-48">
              {TARGETS.map((pts) => (
                <button
                  key={pts}
                  type="button"
                  onClick={() => onSelectTarget(pts)}
                  className={`h-9 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    targetScore === pts
                      ? 'bg-[#0F3B68] text-white border border-sky-400/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {pts} pts
                </button>
              ))}
            </div>
          </div>

          {/* Primary & Secondary Mode Actions (<= 3 menu actions) */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={onStartSolo}
              className="w-full h-13 rounded-xl bg-[#D93829] hover:bg-[#E24536] active:scale-[0.99] text-white font-display text-xl font-bold tracking-wide transition shadow-lg cursor-pointer"
            >
              PLAY SOLO (1 PLAYER)
            </button>

            <button
              type="button"
              onClick={onOpenWifiLobby}
              className="w-full h-12 rounded-xl bg-[#0F3B68] hover:bg-[#144B82] active:scale-[0.99] border border-sky-300/25 text-white font-semibold text-sm transition cursor-pointer flex items-center justify-center gap-2"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
              <span>Wi-Fi Multiplayer</span>
            </button>
          </div>

          {/* Utility Footer Row inside Title Card */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenAndroidApk}
              className="h-11 px-3.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <span>Android APK</span>
            </button>

            <div className="flex items-center gap-2">
              {isInstallable && !isInstalled && (
                <button
                  type="button"
                  onClick={() => {
                    onInstallPWA().catch(() => undefined);
                  }}
                  className="h-11 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                >
                  Install App
                </button>
              )}

              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Unmute sound' : 'Mute sound'}
                className="h-11 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 text-xs font-medium text-slate-300 whitespace-nowrap cursor-pointer"
              >
                {muted ? 'Sound Off' : 'Sound On'}
              </button>
            </div>
          </div>

          {!isOnline && (
            <div className="text-xs text-amber-300 text-center">
              Offline Mode — 1-Player Solo AI is ready without Wi-Fi.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Safe-Margin Flat Control Hint */}
      <div className="text-center text-xs text-slate-300/80 tracking-wide">
        Drag / Move Mouse · W/S or Arrow Keys · Space Serve · P Pause · M Mute
      </div>
    </div>
  );
}
