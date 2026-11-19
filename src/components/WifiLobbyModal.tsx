import { useState } from 'react';
import type { ConnectionStatus } from '../game/network';
import type { LanNetworkInfo, MatchTarget, NetworkRoomSummary } from '../game/types';

interface WifiLobbyModalProps {
  connectionStatus: ConnectionStatus;
  connectionDetail: string;
  customServerUrl: string;
  lanInfo: LanNetworkInfo | null;
  rooms: NetworkRoomSummary[];
  activeRoomCode: string | null;
  activeHostName: string;
  activeGuestName: string | null;
  playerName: string;
  targetScore: MatchTarget;
  errorMessage: string | null;
  onChangePlayerName: (name: string) => void;
  onChangeTargetScore: (target: MatchTarget) => void;
  onChangeCustomServer: (url: string) => void;
  onReconnectServer: (url: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onClose: () => void;
}

export function WifiLobbyModal({
  connectionStatus,
  connectionDetail,
  customServerUrl,
  lanInfo,
  rooms,
  activeRoomCode,
  activeHostName,
  activeGuestName,
  playerName,
  targetScore,
  errorMessage,
  onChangePlayerName,
  onChangeTargetScore,
  onChangeCustomServer,
  onReconnectServer,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onClose,
}: WifiLobbyModalProps) {
  const [joinCode, setJoinCode] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showAdvancedServer, setShowAdvancedServer] = useState(false);

  const primaryLanUrl =
    lanInfo && lanInfo.addresses.length > 0
      ? `http://${lanInfo.addresses[0]}:${lanInfo.port}`
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';

  const shareInviteUrl =
    activeRoomCode && typeof window !== 'undefined'
      ? `${window.location.origin}/?room=${activeRoomCode}`
      : primaryLanUrl;

  const copyValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedText(label);
      window.setTimeout(() => setCopiedText(null), 2000);
    } catch {
      setCopiedText(null);
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase());
  };

  const openRooms = rooms.filter((r) => r.code !== activeRoomCode);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 10, 19, 0.84)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wifi-lobby-title"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 shadow-2xl p-5 sm:p-6"
        style={{ backgroundColor: '#0E1729' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h2 id="wifi-lobby-title" className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Wi-Fi Multiplayer
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Play head-to-head over local Wi-Fi or shared network link
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Wi-Fi lobby"
            className="w-11 h-11 rounded-lg border border-white/12 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Connection status row (real WebSocket telemetry) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400'
                  : connectionStatus === 'connecting'
                    ? 'bg-amber-400'
                    : 'bg-red-400'
              }`}
              aria-hidden="true"
            />
            <span>
              {connectionStatus === 'connected'
                ? 'Connected to Wi-Fi Match Server'
                : connectionStatus === 'connecting'
                  ? 'Connecting to server...'
                  : connectionDetail || 'Disconnected'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedServer((v) => !v)}
            className="text-sky-400 hover:text-sky-300 font-medium underline underline-offset-2 cursor-pointer py-1"
          >
            {showAdvancedServer ? 'Hide LAN Server' : 'Custom LAN Server'}
          </button>
        </div>

        {/* Optional Android APK Custom LAN Host input */}
        {showAdvancedServer && (
          <div className="mt-3 p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-2.5">
            <label htmlFor="lan-server-input" className="block text-xs font-medium text-slate-300">
              Wi-Fi Host Address (for Android APK on same Wi-Fi)
            </label>
            <div className="flex gap-2">
              <input
                id="lan-server-input"
                type="text"
                value={customServerUrl}
                onChange={(e) => onChangeCustomServer(e.target.value)}
                placeholder="e.g. 192.168.1.42:3000 (blank = current host)"
                className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-[#09101E] border border-white/15 text-sm text-white font-mono-code placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />
              <button
                type="button"
                onClick={() => onReconnectServer(customServerUrl)}
                className="h-11 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
              >
                Connect
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 px-3.5 py-2.5 rounded-lg bg-red-950/80 border border-red-500/40 text-xs sm:text-sm text-red-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Active Room Waiting View */}
        {activeRoomCode ? (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-xl bg-[#091120] border border-white/12 text-center space-y-2">
              <div className="text-xs font-medium text-slate-400">Share this Room Code over Wi-Fi</div>
              <div
                className="font-mono-code text-4xl font-bold tracking-[0.22em] text-white"
                data-testid="active-room-code"
              >
                {activeRoomCode}
              </div>
              <div className="text-xs text-slate-300 pt-1">
                Host: <span className="font-semibold text-white">{activeHostName}</span>
                <span aria-hidden="true" className="mx-2 text-slate-500">·</span>
                {activeGuestName ? (
                  <span className="text-emerald-300 font-semibold">{activeGuestName} joined!</span>
                ) : (
                  <span className="text-amber-300">Waiting for Player 2 to join...</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Local Wi-Fi Address</span>
                <button
                  type="button"
                  onClick={() => copyValue('lan', primaryLanUrl)}
                  className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                >
                  {copiedText === 'lan' ? 'Copied' : 'Copy IP'}
                </button>
              </div>
              <div className="font-mono-code text-slate-200 truncate">{primaryLanUrl}</div>
              <div className="pt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => copyValue('invite', shareInviteUrl)}
                  className="flex-1 h-11 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/12 text-xs font-semibold text-white cursor-pointer"
                >
                  {copiedText === 'invite' ? 'Invite Link Copied' : 'Copy Invite Link'}
                </button>
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="h-11 px-4 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-500/30 text-xs font-semibold text-red-200 cursor-pointer"
                >
                  Cancel Room
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Player Name + Match Target */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="player-name-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Your Name
                </label>
                <input
                  id="player-name-input"
                  type="text"
                  maxLength={18}
                  value={playerName}
                  onChange={(e) => onChangePlayerName(e.target.value)}
                  placeholder="Player 1"
                  className="w-full h-11 px-3 rounded-lg bg-[#09101E] border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1.5">Match Points</span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#09101E] border border-white/12 h-11">
                  {([5, 7, 11] as MatchTarget[]).map((pts) => (
                    <button
                      key={pts}
                      type="button"
                      onClick={() => onChangeTargetScore(pts)}
                      className={`rounded-md text-xs font-semibold transition cursor-pointer ${
                        targetScore === pts
                          ? 'bg-[#D93829] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {pts} pts
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Host or Join Split */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={connectionStatus !== 'connected'}
                onClick={onCreateRoom}
                className="h-12 px-4 rounded-xl bg-[#D93829] hover:bg-[#E04536] disabled:opacity-45 text-white font-semibold text-sm transition cursor-pointer"
              >
                Host Wi-Fi Room
              </button>

              <form onSubmit={handleJoinSubmit} className="flex gap-2">
                <input
                  type="text"
                  aria-label="Room Code"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Room code"
                  className="flex-1 min-w-0 h-12 px-3 rounded-xl bg-[#09101E] border border-white/15 text-sm font-mono-code tracking-widest uppercase text-white placeholder:text-slate-500 placeholder:tracking-normal focus:outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={connectionStatus !== 'connected' || joinCode.trim().length < 3}
                  className="h-12 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-45 border border-white/15 text-sm font-semibold text-white whitespace-nowrap cursor-pointer"
                >
                  Join
                </button>
              </form>
            </div>

            {/* Nearby Wi-Fi Rooms List */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold text-slate-300">
                  Active Rooms on This Wi-Fi Network
                </h3>
                <span className="font-mono-code text-xs text-slate-400">
                  {openRooms.length} {openRooms.length === 1 ? 'room' : 'rooms'}
                </span>
              </div>

              {openRooms.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#09101E] border border-white/8 text-center text-xs text-slate-400">
                  No open rooms yet. Tap <strong className="text-slate-200">Host Wi-Fi Room</strong> on one device and join from a second phone or browser on the same Wi-Fi.
                </div>
              ) : (
                <ul className="space-y-2">
                  {openRooms.map((room) => (
                    <li
                      key={room.code}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#09101E] border border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-code text-sm font-bold text-white">
                            {room.code}
                          </span>
                          <span className="text-xs text-slate-300 truncate">{room.hostName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          First to {room.targetScore} · {room.playerCount}/{room.maxPlayers} players · {room.status === 'waiting' ? 'Open' : 'In Match'}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={room.status !== 'waiting' || connectionStatus !== 'connected'}
                        onClick={() => onJoinRoom(room.code)}
                        className="h-10 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                      >
                        {room.status === 'waiting' ? 'Join Room' : 'Full'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Host LAN Info Footer */}
            {lanInfo && lanInfo.addresses.length > 0 && (
              <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="truncate">
                  Wi-Fi LAN: <span className="font-mono-code text-slate-200">{primaryLanUrl}</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyValue('footer-lan', primaryLanUrl)}
                  className="text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap cursor-pointer"
                >
                  {copiedText === 'footer-lan' ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
