import { useEffect, useRef, useCallback, useState } from 'react';
import { FRAME_TIME_MS, MAX_FRAME_SKIP, GameLoopStats } from '../game/engine/GameLoop';
import { Renderer } from '../game/engine/Renderer';
import {
  createSyncedOnlineGameState,
  cloneGameState,
  GameState,
  hashRoomIdToSeed,
  computeGameStateChecksum,
} from '../game/engine/GameState';
import { InputSystem } from '../game/systems/InputSystem';
import { gameUpdate } from '../game/engine/GameUpdate';
import { globalSpriteLoader } from '../game/engine/SpriteSystem';
import { StoredKeyBindings } from '../settings/keyBindings';
import { GAME_WIDTH, GAME_HEIGHT } from '../components/AspectRatioViewport';
import { GGPOSession, GGPOStats } from '../network/ggpo/GGPOSession';
import { PeerConnection } from '../network/webrtc/PeerConnection';
import { SyncHealthMonitor, SyncHealthStatus } from '../network/sync/SyncHealthMonitor';

export interface UseOnlineGameCanvasOptions {
  peerConnection: PeerConnection;
  localPlayerIndex: number;
  showDebug?: boolean;
  showHitboxes?: boolean;
  keyBindings: StoredKeyBindings;
  onGameStateChange?: (state: GameState) => void;
  onSyncStatusChange?: (status: SyncHealthStatus, message: string) => void;
  onSyncFailed?: (reason: string) => void;
}

export function useOnlineGameCanvas({
  peerConnection,
  localPlayerIndex,
  showDebug = false,
  showHitboxes = false,
  keyBindings,
  onGameStateChange,
  onSyncStatusChange,
  onSyncFailed,
}: UseOnlineGameCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputSystemRef = useRef<InputSystem | null>(null);
  const ggpoRef = useRef<GGPOSession | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const syncMonitorRef = useRef<SyncHealthMonitor | null>(null);
  const runningRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastSyncStatusRef = useRef<SyncHealthStatus>('synced');
  const lastSyncMessageRef = useRef('Synced');

  const [stats, setStats] = useState<GameLoopStats | null>(null);
  const [ggpoStats, setGgpoStats] = useState<GGPOStats | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncHealthStatus>('synced');
  const [syncMessage, setSyncMessage] = useState('Synced');

  const isPausedRef = useRef(false);
  const onSyncStatusChangeRef = useRef(onSyncStatusChange);
  const onSyncFailedRef = useRef(onSyncFailed);

  useEffect(() => {
    onSyncStatusChangeRef.current = onSyncStatusChange;
    onSyncFailedRef.current = onSyncFailed;
  }, [onSyncStatusChange, onSyncFailed]);

  const publishSyncStatus = useCallback((status: SyncHealthStatus, message: string) => {
    setSyncStatus(status);
    setSyncMessage(message);
    const statusChanged = lastSyncStatusRef.current !== status;
    const messageChanged = lastSyncMessageRef.current !== message;
    if (statusChanged || messageChanged) {
      lastSyncStatusRef.current = status;
      lastSyncMessageRef.current = message;
      onSyncStatusChangeRef.current?.(status, message);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    let statsInterval: ReturnType<typeof setInterval> | null = null;
    let inputSystem: InputSystem | null = null;
    let ggpo: GGPOSession | null = null;
    let renderer: Renderer | null = null;
    const syncMonitor = new SyncHealthMonitor();
    syncMonitorRef.current = syncMonitor;

    const roomId = peerConnection.getRoomId() ?? `fallback-${localPlayerIndex}`;
    const initialState = createSyncedOnlineGameState(roomId);

    const getChecksum = () => {
      const state = ggpo?.getState();
      return state ? computeGameStateChecksum(state) : 0;
    };

    const sendSyncCheck = (message: Parameters<PeerConnection['sendSyncMessage']>[0]) => {
      peerConnection.sendSyncMessage(message);
    };

    const applySyncPause = (status: SyncHealthStatus) => {
      if (status === 'recovering' || status === 'failed') {
        ggpo?.pause();
      } else if (status === 'synced' && !isPausedRef.current) {
        ggpo?.resume();
      }
    };

    const handleSyncFailure = (reason: string) => {
      runningRef.current = false;
      publishSyncStatus('failed', reason);
      onSyncFailedRef.current?.(reason);
    };

    const startGame = async () => {
      setIsLoading(true);
      runningRef.current = false;
      syncMonitor.reset();
      publishSyncStatus('synced', 'Synced');

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      inputSystem = new InputSystem(keyBindings.player1, keyBindings.player1);
      inputSystemRef.current = inputSystem;
      inputSystem.start();

      renderer = new Renderer(canvas, {
        canvasWidth: GAME_WIDTH,
        canvasHeight: GAME_HEIGHT,
        showDebugInfo: showDebug,
        showHitboxes,
      });
      rendererRef.current = renderer;

      try {
        const spriteData = await globalSpriteLoader.loadAll();
        if (mounted) {
          renderer.setSpriteData(spriteData);
        }
      } catch (error) {
        console.warn('Failed to load sprites, using fallback rendering:', error);
      }

      if (!mounted) return;

      ggpo = new GGPOSession({
        onAdvanceFrame: gameUpdate,
        onSaveState: () => {},
        onLoadState: () => {},
        onRollback: (from, to) => {
          if (showDebug) {
            console.log(`Rollback: ${from} -> ${to}`);
          }
        },
      });

      ggpo.initialize(initialState, localPlayerIndex);
      ggpoRef.current = ggpo;
      gameStateRef.current = cloneGameState(initialState);
      setGameState(cloneGameState(initialState));
      onGameStateChange?.(initialState);

      peerConnection.setInputListener((frame, encodedInput) => {
        syncMonitor.notifyRemoteInput();
        ggpo?.addRemoteInput(frame, encodedInput);
      });

      peerConnection.setSyncListener((message) => {
        if (!ggpo) return;

        if (message.type === 'sync-check') {
          const ack = syncMonitor.handleSyncCheck(
            message,
            getChecksum,
            () => ggpo!.getCurrentFrame(),
          );
          peerConnection.sendSyncMessage(ack);
          return;
        }

        syncMonitor.handleSyncAck(message, {
          localFrame: ggpo.getCurrentFrame(),
          localChecksum: getChecksum(),
          now: performance.now(),
          lastConfirmedFrame: ggpo.getStats().lastConfirmedFrame,
          frameAdvantage: ggpo.getFrameAdvantage(),
          peerConnected: peerConnection.getState() === 'connected',
          getChecksum,
          sendSyncCheck,
        });

        const status = syncMonitor.getStatus();
        publishSyncStatus(status, syncMonitor.getMessage());
        applySyncPause(status);
      });

      setIsLoading(false);
      isPausedRef.current = false;
      setIsPaused(false);
      runningRef.current = true;

      let lastTime = performance.now();
      let accumulator = 0;
      let fpsFrames = 0;
      let fpsLastTime = lastTime;
      const loopStats: GameLoopStats = {
        fps: 0,
        frameTime: 0,
        simulationTime: 0,
        renderTime: 0,
        framesSkipped: 0,
      };

      const loop = (currentTime: number) => {
        if (!mounted || !runningRef.current || !ggpo || !renderer) return;

        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;
        loopStats.frameTime = deltaTime;

        fpsFrames++;
        if (currentTime - fpsLastTime >= 1000) {
          loopStats.fps = Math.round((fpsFrames * 1000) / (currentTime - fpsLastTime));
          fpsFrames = 0;
          fpsLastTime = currentTime;
        }

        const monitorStatus = syncMonitor.getStatus();
        if (monitorStatus === 'failed') {
          const failure = syncMonitor.consumeFailure();
          if (failure) {
            handleSyncFailure(failure);
          }
          return;
        }

        const canSimulate =
          !isPausedRef.current &&
          !syncMonitor.shouldPauseSimulation();

        if (canSimulate) {
          const simStart = performance.now();
          accumulator += deltaTime;

          let framesSimulated = 0;
          while (accumulator >= FRAME_TIME_MS && framesSimulated < MAX_FRAME_SKIP) {
            const localInput = inputSystem!.getInput(0);
            ggpo.addLocalInput(localInput);

            const state = ggpo.advanceFrame();
            if (state) {
              gameStateRef.current = state;
              setGameState(cloneGameState(state));
              onGameStateChange?.(state);
            }

            const pending = ggpo.getPendingInputs();
            for (const { frame, encodedInput } of pending) {
              peerConnection.sendInput(frame, encodedInput);
            }

            ggpo.setPing(peerConnection.getPing());

            accumulator -= FRAME_TIME_MS;
            framesSimulated++;
          }

          loopStats.simulationTime = performance.now() - simStart;
          loopStats.framesSkipped = Math.max(0, framesSimulated - 1);

          if (accumulator > FRAME_TIME_MS * MAX_FRAME_SKIP) {
            accumulator = 0;
          }
        }

        const ggpoStatsNow = ggpo.getStats();
        const previousStatus = syncMonitor.getStatus();
        syncMonitor.tick({
          now: currentTime,
          currentFrame: ggpoStatsNow.currentFrame,
          lastConfirmedFrame: ggpoStatsNow.lastConfirmedFrame,
          frameAdvantage: ggpo.getFrameAdvantage(),
          peerConnected: peerConnection.getState() === 'connected',
          getChecksum,
          sendSyncCheck,
        });

        const nextStatus = syncMonitor.getStatus();
        const nextMessage = syncMonitor.getMessage();
        if (
          previousStatus !== nextStatus ||
          lastSyncMessageRef.current !== nextMessage
        ) {
          publishSyncStatus(nextStatus, nextMessage);
          applySyncPause(nextStatus);
        }

        if (nextStatus === 'failed') {
          const failure = syncMonitor.consumeFailure();
          if (failure) {
            handleSyncFailure(failure);
          }
          return;
        }

        const renderStart = performance.now();
        const renderState = gameStateRef.current ?? initialState;
        renderer.render(renderState);
        loopStats.renderTime = performance.now() - renderStart;

        setStats({ ...loopStats });
        setGgpoStats(ggpoStatsNow);

        animationFrameRef.current = requestAnimationFrame(loop);
      };

      animationFrameRef.current = requestAnimationFrame(loop);

      statsInterval = setInterval(() => {
        if (ggpo) {
          setGgpoStats(ggpo.getStats());
        }
      }, 100);
    };

    startGame();

    return () => {
      mounted = false;
      runningRef.current = false;
      if (statsInterval) clearInterval(statsInterval);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      peerConnection.setInputListener(null);
      peerConnection.setSyncListener(null);
      ggpo?.disconnect();
      inputSystem?.stop();
      ggpoRef.current = null;
      inputSystemRef.current = null;
      syncMonitorRef.current = null;
    };
  }, [
    peerConnection,
    localPlayerIndex,
    showDebug,
    showHitboxes,
    keyBindings,
    onGameStateChange,
    publishSyncStatus,
  ]);

  useEffect(() => {
    inputSystemRef.current?.setBindings(keyBindings.player1, keyBindings.player1);
  }, [keyBindings]);

  const handlePauseToggle = useCallback(() => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused(isPausedRef.current);
    if (isPausedRef.current) {
      ggpoRef.current?.pause();
    } else if (syncMonitorRef.current?.getStatus() === 'synced') {
      ggpoRef.current?.resume();
    }
  }, []);

  const handleRestart = useCallback(() => {
    const roomId = peerConnection.getRoomId() ?? `fallback-${localPlayerIndex}`;
    const newState = createSyncedOnlineGameState(roomId);
    ggpoRef.current?.initialize(newState, localPlayerIndex);
    gameStateRef.current = cloneGameState(newState);
    setGameState(cloneGameState(newState));
    isPausedRef.current = false;
    setIsPaused(false);
    syncMonitorRef.current?.reset();
    publishSyncStatus('synced', 'Synced');
    if (syncMonitorRef.current?.getStatus() === 'synced') {
      ggpoRef.current?.resume();
    }
  }, [peerConnection, localPlayerIndex, publishSyncStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        handlePauseToggle();
      }
      if (e.code === 'F5') {
        e.preventDefault();
        handleRestart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePauseToggle, handleRestart]);

  return {
    canvasRef,
    stats,
    ggpoStats,
    isPaused,
    isLoading,
    gameState,
    syncStatus,
    syncMessage,
    roomSeed: hashRoomIdToSeed(peerConnection.getRoomId() ?? ''),
    handlePauseToggle,
    handleRestart,
  };
}
