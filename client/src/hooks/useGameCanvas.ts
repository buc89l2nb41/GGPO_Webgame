import { useEffect, useRef, useCallback, useState } from 'react';
import { GameLoop, GameLoopStats } from '../game/engine/GameLoop';
import { Renderer } from '../game/engine/Renderer';
import { createInitialGameState, cloneGameState, GameState } from '../game/engine/GameState';
import { InputSystem } from '../game/systems/InputSystem';
import { gameUpdate } from '../game/engine/GameUpdate';
import { globalSpriteLoader } from '../game/engine/SpriteSystem';
import { StoredKeyBindings } from '../settings/keyBindings';
import { GAME_WIDTH, GAME_HEIGHT } from '../components/AspectRatioViewport';

export interface UseGameCanvasOptions {
  showDebug?: boolean;
  showHitboxes?: boolean;
  pauseOnStart?: boolean;
  keyBindings: StoredKeyBindings;
  onGameStateChange?: (state: GameState) => void;
}

export function useGameCanvas({
  showDebug = false,
  showHitboxes = false,
  pauseOnStart = false,
  keyBindings,
  onGameStateChange,
}: UseGameCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<GameLoop | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputSystemRef = useRef<InputSystem | null>(null);
  const [stats, setStats] = useState<GameLoopStats | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [renderMeta, setRenderMeta] = useState({ cameraX: 0, scaleX: 1, scaleY: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    let gameLoop: GameLoop | null = null;
    let inputSystem: InputSystem | null = null;
    let statsInterval: ReturnType<typeof setInterval> | null = null;

    const startGame = async () => {
      if (gameLoopRef.current) {
        gameLoopRef.current.stop();
      }
      if (inputSystemRef.current) {
        inputSystemRef.current.stop();
      }

      setIsLoading(true);

      inputSystem = new InputSystem(keyBindings.player1, keyBindings.player2);
      inputSystemRef.current = inputSystem;
      inputSystem.start();

      const renderer = new Renderer(canvas, {
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

      setIsLoading(false);

      const initialState = createInitialGameState();

      gameLoop = new GameLoop(
        initialState,
        renderer,
        gameUpdate,
        (playerIndex) => inputSystem!.getInput(playerIndex),
      );

      gameLoopRef.current = gameLoop;

      gameLoop.setOnStateChange((state) => {
        setGameState(cloneGameState(state));
        onGameStateChange?.(state);
      });

      if (pauseOnStart) {
        gameLoop.pause();
      }

      gameLoop.start();

      statsInterval = setInterval(() => {
        if (gameLoopRef.current) {
          setStats(gameLoopRef.current.getStats());
        }
      }, 100);
    };

    startGame();

    return () => {
      mounted = false;
      if (statsInterval) clearInterval(statsInterval);
      if (gameLoop) gameLoop.stop();
      if (inputSystem) inputSystem.stop();
    };
  }, [showDebug, showHitboxes, pauseOnStart, onGameStateChange, keyBindings]);

  useEffect(() => {
    if (!pauseOnStart || !gameLoopRef.current) return;
    gameLoopRef.current.pause();
    return () => {
      gameLoopRef.current?.resume();
    };
  }, [pauseOnStart]);

  useEffect(() => {
    inputSystemRef.current?.setBindings(keyBindings.player1, keyBindings.player2);
  }, [keyBindings]);

  const handlePauseToggle = useCallback(() => {
    if (!gameLoopRef.current) return;

    if (gameLoopRef.current.isPaused()) {
      gameLoopRef.current.resume();
      setIsPaused(false);
    } else {
      gameLoopRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const handleRestart = useCallback(() => {
    if (!gameLoopRef.current) return;

    const newState = createInitialGameState();
    gameLoopRef.current.setState(newState);
    gameLoopRef.current.resume();
    setIsPaused(false);
  }, []);

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

  const refreshRenderMeta = useCallback(() => {
    if (!rendererRef.current) return;
    setRenderMeta({
      cameraX: rendererRef.current.getCameraX(),
      ...rendererRef.current.getRenderScale(),
    });
  }, []);

  return {
    canvasRef,
    gameLoopRef,
    rendererRef,
    stats,
    isPaused,
    isLoading,
    gameState,
    setGameState,
    renderMeta,
    refreshRenderMeta,
    handlePauseToggle,
    handleRestart,
  };
}