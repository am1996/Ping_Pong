import { useCallback, useEffect, useRef, useState } from 'react';
import { AndroidApkModal } from './components/AndroidApkModal';
import { GameHud, type HudSnapshot } from './components/GameHud';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { WifiLobbyModal } from './components/WifiLobbyModal';
import { soundEngine } from './game/audio';
import {
  AI_PROFILES,
  computeAiTargetY,
  createInitialMatchState,
  launchServe,
  stepMatch,
  TABLE_HEIGHT,
} from './game/engine';
import { buildApiBaseUrl, type ConnectionStatus, WifiMultiplayerClient } from './game/network';
import { TableRenderer } from './game/renderer';
import type {
  AppScreenState,
  Difficulty,
  GameMode,
  LanNetworkInfo,
  MatchStats,
  MatchTarget,
  NetworkRoomSummary,
  PlayerSide,
  TableMatchState,
} from './game/types';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';

const EMPTY_HUD: HudSnapshot = {
  leftScore: 0,
  rightScore: 0,
  targetScore: 11,
  servingSide: 'left',
  isDeuce: false,
  currentRally: 0,
  fastestShotKmh: 0,
  ballSpeedKmh: 0,
};

function snapshotFromState(state: TableMatchState): HudSnapshot {
  return {
    leftScore: state.stats.leftScore,
    rightScore: state.stats.rightScore,
    targetScore: state.targetScore,
    servingSide: state.servingSide,
    isDeuce: state.isDeuce,
    currentRally: state.stats.currentRally,
    fastestShotKmh: state.stats.fastestShotKmh,
    ballSpeedKmh: state.ball.speedKmh,
  };
}

export default function App() {
  const [screen, setScreen] = useState<AppScreenState>('title');
  const [mode, setMode] = useState<GameMode>('solo');
  const [difficulty, setDifficulty] = useState<Difficulty>('tactician');
  const [targetScore, setTargetScore] = useState<MatchTarget>(11);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [showApkModal, setShowApkModal] = useState(false);

  // Player & HUD state (updated only on discrete integer/phase changes, never at 60Hz)
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return window.localStorage.getItem('spincourt_player_name') || 'Player 1';
    } catch {
      return 'Player 1';
    }
  });
  const [localSide, setLocalSide] = useState<PlayerSide>('left');
  const [opponentName, setOpponentName] = useState<string>('Spin Tactician');
  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD);
  const [endSnapshot, setEndSnapshot] = useState<{
    winner: PlayerSide | null;
    stats: MatchStats;
  } | null>(null);

  // Wi-Fi Multiplayer State
  const [customServerUrl, setCustomServerUrl] = useState<string>(() => {
    try {
      return window.localStorage.getItem('spincourt_lan_server') || '';
    } catch {
      return '';
    }
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionDetail, setConnectionDetail] = useState('');
  const [lanInfo, setLanInfo] = useState<LanNetworkInfo | null>(null);
  const [rooms, setRooms] = useState<NetworkRoomSummary[]>([]);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [activeHostName, setActiveHostName] = useState<string>('');
  const [activeGuestName, setActiveGuestName] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Imperative simulation & canvas refs (mounted once, decoupled from React state)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<TableRenderer>(new TableRenderer());
  const matchStateRef = useRef<TableMatchState>(createInitialMatchState(11, 'left'));
  const screenRef = useRef<AppScreenState>(screen);
  const modeRef = useRef<GameMode>(mode);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const localSideRef = useRef<PlayerSide>(localSide);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const pointerDraggingRef = useRef<boolean>(false);
  const lastHudSyncRef = useRef<string>('');
  const networkRef = useRef<WifiMultiplayerClient | null>(null);
  const pendingRoomJoinRef = useRef<string | null>(null);

  // Sync refs with latest state
  screenRef.current = screen;
  modeRef.current = mode;
  difficultyRef.current = difficulty;
  localSideRef.current = localSide;

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screen;
  }, [screen]);

  const showToast = useCallback((message: string) => {
    setBannerNotice(message);
    window.setTimeout(() => {
      setBannerNotice((prev) => (prev === message ? null : prev));
    }, 3600);
  }, []);

  const syncHudIfChanged = useCallback((state: TableMatchState) => {
    const speedRounded = Math.round(state.ball.speedKmh / 5) * 5;
    const key = `${state.stats.leftScore}:${state.stats.rightScore}:${state.servingSide}:${state.isDeuce}:${state.stats.currentRally}:${state.targetScore}:${speedRounded}`;
    if (key !== lastHudSyncRef.current) {
      lastHudSyncRef.current = key;
      setHud(snapshotFromState(state));
    }
  }, []);

  const fetchLanInfo = useCallback(async (serverOverride?: string) => {
    try {
      const base = buildApiBaseUrl(serverOverride);
      const res = await fetch(`${base}/api/network-info`);
      if (res.ok) {
        const data = (await res.json()) as LanNetworkInfo;
        setLanInfo(data);
      }
    } catch {
      // Offline or unreachable LAN server
    }
  }, []);

  const ensureWifiConnected = useCallback(
    (serverOverride?: string) => {
      const urlToUse = serverOverride !== undefined ? serverOverride : customServerUrl;
      if (!networkRef.current) {
        networkRef.current = new WifiMultiplayerClient({
          onStatus: (status, detail) => {
            setConnectionStatus(status);
            setConnectionDetail(detail || '');
            if (status === 'connected' && pendingRoomJoinRef.current) {
              const code = pendingRoomJoinRef.current;
              pendingRoomJoinRef.current = null;
              networkRef.current?.send({
                type: 'room:join',
                code,
                playerName: playerName || 'Player 2',
              });
            }
          },
          onPing: (rtt) => {
            setPingMs(rtt);
          },
          onMessage: (msg) => {
            switch (msg.type) {
              case 'rooms:update':
                setRooms(msg.rooms);
                break;
              case 'room:joined':
                setLobbyError(null);
                setActiveRoomCode(msg.code);
                setLocalSide(msg.side);
                localSideRef.current = msg.side;
                setActiveHostName(msg.hostName);
                setActiveGuestName(msg.guestName);
                setTargetScore(msg.targetScore);
                setOpponentName(msg.side === 'left' ? msg.guestName || 'Waiting...' : msg.hostName);
                setRematchPending(false);
                setOpponentWantsRematch(false);
                if (msg.status === 'playing') {
                  setMode('multiplayer');
                  modeRef.current = 'multiplayer';
                  setEndSnapshot(null);
                  setScreen('playing');
                  screenRef.current = 'playing';
                  rendererRef.current.resetEffects();
                }
                break;
              case 'room:players':
                setActiveHostName(msg.hostName);
                setActiveGuestName(msg.guestName);
                setOpponentName(
                  localSideRef.current === 'left'
                    ? msg.guestName || 'Waiting...'
                    : msg.hostName,
                );
                if (msg.status === 'playing') {
                  setMode('multiplayer');
                  modeRef.current = 'multiplayer';
                  setEndSnapshot(null);
                  setRematchPending(false);
                  setOpponentWantsRematch(false);
                  setScreen('playing');
                  screenRef.current = 'playing';
                  rendererRef.current.resetEffects();
                } else if (msg.status === 'waiting' && screenRef.current === 'playing') {
                  setScreen('lobby');
                  screenRef.current = 'lobby';
                }
                break;
              case 'game:state': {
                matchStateRef.current = msg.state;
                if (msg.events.length > 0) {
                  rendererRef.current.triggerEvents(msg.events, localSideRef.current);
                  soundEngine.playEvents(msg.events, localSideRef.current);
                }
                syncHudIfChanged(msg.state);
                if (msg.state.phase === 'match_over' && screenRef.current === 'playing') {
                  setEndSnapshot({
                    winner: msg.state.winner,
                    stats: { ...msg.state.stats },
                  });
                  setScreen('gameover');
                  screenRef.current = 'gameover';
                }
                break;
              }
              case 'room:rematch_vote':
                if (msg.side !== localSideRef.current) {
                  setOpponentWantsRematch(true);
                }
                break;
              case 'room:opponent_left':
                showToast(msg.message);
                setRematchPending(false);
                setOpponentWantsRematch(false);
                if (localSideRef.current === 'right') {
                  setActiveRoomCode(null);
                  setActiveGuestName(null);
                }
                setScreen('lobby');
                screenRef.current = 'lobby';
                break;
              case 'room:error':
                setLobbyError(msg.message);
                break;
            }
          },
        });
      }
      networkRef.current.connect(urlToUse);
      fetchLanInfo(urlToUse);
    },
    [customServerUrl, fetchLanInfo, playerName, showToast, syncHudIfChanged],
  );

  const startSoloMatch = useCallback(
    (overrideDifficulty?: Difficulty, overrideTarget?: MatchTarget) => {
      soundEngine.unlock();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      keysPressedRef.current.clear();
      const d = overrideDifficulty ?? difficultyRef.current;
      const t = overrideTarget ?? targetScore;

      const fresh = createInitialMatchState(t, 'left');
      matchStateRef.current = fresh;
      rendererRef.current.resetEffects();

      setMode('solo');
      modeRef.current = 'solo';
      setLocalSide('left');
      localSideRef.current = 'left';
      setOpponentName(AI_PROFILES[d].label);
      setEndSnapshot(null);
      setHud(snapshotFromState(fresh));
      lastHudSyncRef.current = '';
      setScreen('playing');
      screenRef.current = 'playing';
      document.body.dataset.state = 'playing';
      canvasRef.current?.focus();
    },
    [targetScore],
  );

  const openWifiLobby = useCallback(() => {
    soundEngine.unlock();
    setLobbyError(null);
    setShowApkModal(false);
    setScreen('lobby');
    screenRef.current = 'lobby';
    ensureWifiConnected();
  }, [ensureWifiConnected]);

  const leaveToTitle = useCallback(() => {
    if (modeRef.current === 'multiplayer' || activeRoomCode) {
      networkRef.current?.send({ type: 'room:leave' });
      setActiveRoomCode(null);
      setActiveGuestName(null);
      setRematchPending(false);
      setOpponentWantsRematch(false);
    }
    keysPressedRef.current.clear();
    const attract = createInitialMatchState(11, 'left');
    matchStateRef.current = attract;
    rendererRef.current.resetEffects();
    setMode('solo');
    modeRef.current = 'solo';
    setLocalSide('left');
    localSideRef.current = 'left';
    setEndSnapshot(null);
    setScreen('title');
    screenRef.current = 'title';
  }, [activeRoomCode]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleServeInput = useCallback(() => {
    if (screenRef.current !== 'playing') return;
    soundEngine.unlock();
    if (modeRef.current === 'multiplayer') {
      networkRef.current?.send({ type: 'input:serve' });
      return;
    }
    const state = matchStateRef.current;
    if (state.phase === 'serve_wait' && state.servingSide === 'left') {
      const events = [] as Parameters<typeof launchServe>[1];
      if (launchServe(state, events)) {
        rendererRef.current.triggerEvents(events, 'left');
        soundEngine.playEvents(events, 'left');
      }
    }
  }, []);

  const handleRestartOrRematch = useCallback(() => {
    if (modeRef.current === 'multiplayer') {
      setRematchPending(true);
      networkRef.current?.send({ type: 'match:rematch' });
      return;
    }
    startSoloMatch();
  }, [startSoloMatch]);

  // Handle initial query parameters (?autostart=1 or ?room=XXXX) & LAN info
  useEffect(() => {
    fetchLanInfo();
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');
    const roomParam = params.get('room');
    if (roomParam) {
      pendingRoomJoinRef.current = roomParam.trim().toUpperCase();
      setScreen('lobby');
      screenRef.current = 'lobby';
      ensureWifiConnected();
    } else if (autostart === '1') {
      startSoloMatch();
    }
    return () => {
      networkRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main isolated 60Hz Canvas Simulation & Render Loop (mounts once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let elapsedTime = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rendererRef.current.updateLayout(w, h, localSideRef.current === 'right');
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      elapsedTime += dt;

      const currentScreen = screenRef.current;
      const currentMode = modeRef.current;
      const state = matchStateRef.current;
      const renderer = rendererRef.current;

      // Ensure layout mirror stays synced with side
      if (renderer.transform.mirrorSides !== (localSideRef.current === 'right')) {
        const rect = canvas.getBoundingClientRect();
        renderer.updateLayout(rect.width, rect.height, localSideRef.current === 'right');
      }

      // Apply keyboard paddle steering
      if (currentScreen === 'playing') {
        const keys = keysPressedRef.current;
        const isPortrait = renderer.transform.isPortrait;
        const moveNeg = isPortrait
          ? keys.has('ArrowLeft') || keys.has('KeyA')
          : keys.has('ArrowUp') || keys.has('KeyW');
        const movePos = isPortrait
          ? keys.has('ArrowRight') || keys.has('KeyD')
          : keys.has('ArrowDown') || keys.has('KeyS');

        const keySpeed = 680;
        const activePaddle =
          localSideRef.current === 'left' ? state.leftPaddle : state.rightPaddle;

        let dir = 0;
        if (moveNeg) dir -= 1;
        if (movePos) dir += 1;
        if (isPortrait && renderer.transform.mirrorSides) {
          dir *= -1;
        }

        if (dir !== 0) {
          const nextY = Math.max(
            0,
            Math.min(TABLE_HEIGHT, activePaddle.targetY + dir * keySpeed * dt),
          );
          activePaddle.targetY = nextY;
          if (currentMode === 'multiplayer') {
            networkRef.current?.sendPaddleTarget(nextY);
          }
        }
      }

      if (currentScreen === 'title' || currentScreen === 'lobby') {
        // Live AI-vs-AI tournament attract rally behind title screen
        state.leftPaddle.targetY = computeAiTargetY(state, 'left', 'tactician', elapsedTime);
        state.rightPaddle.targetY = computeAiTargetY(state, 'right', 'tactician', elapsedTime + 1.3);
        const events = stepMatch(state, {
          dt,
          leftMaxSpeed: 540,
          rightMaxSpeed: 540,
          autoServe: true,
        });
        if (state.phase === 'match_over') {
          matchStateRef.current = createInitialMatchState(11, 'left');
        } else if (events.length > 0) {
          renderer.triggerEvents(events, 'left');
        }
        renderer.tickEffects(dt, matchStateRef.current);
        renderer.render(ctx, matchStateRef.current, 'left', true);
      } else if (currentScreen === 'playing') {
        if (currentMode === 'solo') {
          const aiProfile = AI_PROFILES[difficultyRef.current];
          state.rightPaddle.targetY = computeAiTargetY(
            state,
            'right',
            difficultyRef.current,
            elapsedTime,
          );
          const events = stepMatch(state, {
            dt,
            leftMaxSpeed: 1320,
            rightMaxSpeed: aiProfile.maxSpeed,
            autoServe: true,
          });
          if (events.length > 0) {
            renderer.triggerEvents(events, 'left');
            soundEngine.playEvents(events, 'left');
          }
          syncHudIfChanged(state);

          if (state.phase === 'match_over') {
            setEndSnapshot({
              winner: state.winner,
              stats: { ...state.stats },
            });
            setScreen('gameover');
            screenRef.current = 'gameover';
          }
        }
        renderer.tickEffects(dt, state);
        renderer.render(ctx, state, localSideRef.current, false);
      } else {
        // Paused or GameOver: keep rendering frozen table cleanly
        renderer.render(ctx, state, localSideRef.current, false);
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [syncHudIfChanged]);

  // Unified Keyboard & Focus-Loss Hygiene Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts when typing inside lobby text inputs
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyM' && !e.repeat) {
        handleToggleMute();
        return;
      }

      if (screenRef.current === 'title' && !showApkModal) {
        if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
          e.preventDefault();
          startSoloMatch();
        }
        return;
      }

      if (screenRef.current === 'playing') {
        if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
          e.preventDefault();
          keysPressedRef.current.clear();
          setScreen('paused');
          screenRef.current = 'paused';
          return;
        }
        if (e.code === 'KeyR' && !e.repeat && modeRef.current === 'solo') {
          e.preventDefault();
          startSoloMatch();
          return;
        }
        if (e.code === 'Space' && !e.repeat) {
          e.preventDefault();
          handleServeInput();
          return;
        }
        if (
          e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight' ||
          e.code === 'KeyW' ||
          e.code === 'KeyS' ||
          e.code === 'KeyA' ||
          e.code === 'KeyD'
        ) {
          e.preventDefault();
          keysPressedRef.current.add(e.code);
        }
      } else if (screenRef.current === 'paused') {
        if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
          e.preventDefault();
          setScreen('playing');
          screenRef.current = 'playing';
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.code);
    };

    const clearHeldInputs = () => {
      keysPressedRef.current.clear();
      pointerDraggingRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeldInputs);
    document.addEventListener('visibilitychange', clearHeldInputs);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldInputs);
      document.removeEventListener('visibilitychange', clearHeldInputs);
    };
  }, [handleServeInput, handleToggleMute, showApkModal, startSoloMatch]);

  // Unified Pointer & Touch Paddle Control (Desktop mouse + Android touch drag)
  const updatePaddleFromPointer = useCallback((clientX: number, clientY: number) => {
    if (screenRef.current !== 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const targetY = rendererRef.current.screenToTableY(clientX - rect.left, clientY - rect.top);

    const state = matchStateRef.current;
    if (localSideRef.current === 'left') {
      state.leftPaddle.targetY = targetY;
    } else {
      state.rightPaddle.targetY = targetY;
    }

    if (modeRef.current === 'multiplayer') {
      networkRef.current?.sendPaddleTarget(targetY);
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screenRef.current !== 'playing') return;
    soundEngine.unlock();
    pointerDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePaddleFromPointer(e.clientX, e.clientY);
    handleServeInput();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (screenRef.current !== 'playing') return;
    // On desktop mouse, allow smooth direct tracking without holding click; on touch, track while finger is down
    if (e.pointerType === 'mouse' || pointerDraggingRef.current) {
      updatePaddleFromPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = () => {
    pointerDraggingRef.current = false;
  };

  const handleChangePlayerName = (nextName: string) => {
    setPlayerName(nextName);
    try {
      window.localStorage.setItem('spincourt_player_name', nextName);
    } catch {
      // ignore
    }
  };

  const handleChangeCustomServer = (nextUrl: string) => {
    setCustomServerUrl(nextUrl);
    try {
      window.localStorage.setItem('spincourt_lan_server', nextUrl);
    } catch {
      // ignore
    }
  };

  const localDisplayName =
    mode === 'multiplayer'
      ? localSide === 'left'
        ? activeHostName || playerName
        : activeGuestName || playerName
      : 'You';

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0B1220]">
      {/* Isolated Full-Viewport Game Canvas */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-testid="pong-canvas"
        aria-label="SpinCourt Ping Pong Arena"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="block w-full h-full touch-none outline-none cursor-none data-[cursor=default]:cursor-default"
        data-cursor={screen === 'playing' ? 'none' : 'default'}
      />

      {/* Title Screen Overlay */}
      {screen === 'title' && (
        <TitleOverlay
          difficulty={difficulty}
          targetScore={targetScore}
          muted={muted}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isOnline={isOnline}
          onSelectDifficulty={setDifficulty}
          onSelectTarget={setTargetScore}
          onStartSolo={() => startSoloMatch()}
          onOpenWifiLobby={openWifiLobby}
          onOpenAndroidApk={() => {
            fetchLanInfo();
            setShowApkModal(true);
          }}
          onInstallPWA={install}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Active Gameplay Perimeter HUD */}
      {(screen === 'playing' || screen === 'paused') && (
        <GameHud
          mode={mode}
          localSide={localSide}
          localName={localDisplayName}
          opponentName={opponentName}
          hud={hud}
          muted={muted}
          roomCode={activeRoomCode}
          pingMs={pingMs}
          onToggleMute={handleToggleMute}
          onPause={() => {
            keysPressedRef.current.clear();
            setScreen((prev) => (prev === 'paused' ? 'playing' : 'paused'));
          }}
          onRestart={() => startSoloMatch()}
        />
      )}

      {/* Wi-Fi Multiplayer Lobby Modal */}
      {screen === 'lobby' && (
        <WifiLobbyModal
          connectionStatus={connectionStatus}
          connectionDetail={connectionDetail}
          customServerUrl={customServerUrl}
          lanInfo={lanInfo}
          rooms={rooms}
          activeRoomCode={activeRoomCode}
          activeHostName={activeHostName}
          activeGuestName={activeGuestName}
          playerName={playerName}
          targetScore={targetScore}
          errorMessage={lobbyError}
          onChangePlayerName={handleChangePlayerName}
          onChangeTargetScore={setTargetScore}
          onChangeCustomServer={handleChangeCustomServer}
          onReconnectServer={(url) => ensureWifiConnected(url)}
          onCreateRoom={() => {
            setLobbyError(null);
            networkRef.current?.send({
              type: 'room:create',
              playerName: playerName || 'Player 1',
              targetScore,
            });
          }}
          onJoinRoom={(code) => {
            setLobbyError(null);
            networkRef.current?.send({
              type: 'room:join',
              code,
              playerName: playerName || 'Player 2',
            });
          }}
          onLeaveRoom={() => {
            networkRef.current?.send({ type: 'room:leave' });
            setActiveRoomCode(null);
            setActiveGuestName(null);
          }}
          onClose={leaveToTitle}
        />
      )}

      {/* Android APK & PWA Install Modal */}
      {showApkModal && (
        <AndroidApkModal
          lanInfo={lanInfo}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          onInstallPWA={install}
          onClose={() => setShowApkModal(false)}
        />
      )}

      {/* Pause & Match Over Status Modal */}
      {(screen === 'paused' || (screen === 'gameover' && endSnapshot)) && (
        <StatusModal
          variant={screen === 'paused' ? 'paused' : 'gameover'}
          mode={mode}
          localSide={localSide}
          winner={endSnapshot?.winner ?? null}
          localName={localDisplayName}
          opponentName={opponentName}
          stats={endSnapshot?.stats ?? matchStateRef.current.stats}
          rematchPending={rematchPending}
          opponentWantsRematch={opponentWantsRematch}
          onResume={() => {
            setScreen('playing');
            screenRef.current = 'playing';
            canvasRef.current?.focus();
          }}
          onRestart={handleRestartOrRematch}
          onTitle={leaveToTitle}
        />
      )}

      {/* Transient Connection / Room Notice */}
      {bannerNotice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-amber-400/40 text-xs sm:text-sm font-medium text-amber-200 shadow-xl"
        >
          {bannerNotice}
        </div>
      )}
    </main>
  );
}
