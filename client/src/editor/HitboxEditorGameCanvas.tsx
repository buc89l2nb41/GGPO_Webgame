/**
 * Hitbox editor canvas — only loaded from the /editor entry (dev tool).
 */

import { useCallback, useEffect, useRef } from 'react';
import { cloneGameState } from '../game/engine/GameState';
import { useGameCanvas } from '../hooks/useGameCanvas';
import { StoredKeyBindings } from '../settings/keyBindings';
import { GAME_WIDTH, GAME_HEIGHT } from '../components/AspectRatioViewport';
import { HitboxEditorOverlay } from '../components/HitboxEditorOverlay';
import {
  applyEditorPreview,
  HitboxEditorPreview,
} from '../game/editor/hitboxEditorPreview';

interface HitboxEditorGameCanvasProps {
  keyBindings: StoredKeyBindings;
}

export function HitboxEditorGameCanvas({ keyBindings }: HitboxEditorGameCanvasProps) {
  const editorPreviewRef = useRef<HitboxEditorPreview | null>(null);

  const {
    canvasRef,
    gameLoopRef,
    rendererRef,
    stats,
    isLoading,
    gameState,
    setGameState,
    renderMeta,
    refreshRenderMeta,
  } = useGameCanvas({
    showDebug: true,
    showHitboxes: true,
    pauseOnStart: true,
    keyBindings,
  });

  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      const preview = editorPreviewRef.current;
      if (rendererRef.current) {
        rendererRef.current.setEditorPreview(preview);
        refreshRenderMeta();
      }
      if (gameLoopRef.current) {
        const raw = gameLoopRef.current.getState();
        const displayState = preview
          ? applyEditorPreview(raw, preview)
          : raw;
        setGameState(cloneGameState(displayState));
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      rendererRef.current?.setEditorPreview(null);
    };
  }, [gameLoopRef, refreshRenderMeta, rendererRef, setGameState]);

  const handleEditorPreviewChange = useCallback((preview: HitboxEditorPreview) => {
    editorPreviewRef.current = preview;
    rendererRef.current?.setEditorPreview(preview);
  }, [rendererRef]);

  return (
    <div className="game-container">
      <div className="game-stage">
        <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} />

        {gameState && (
          <HitboxEditorOverlay
            enabled
            gameState={gameState}
            cameraX={renderMeta.cameraX}
            scaleX={renderMeta.scaleX}
            scaleY={renderMeta.scaleY}
            canvasRef={canvasRef}
            onPreviewChange={handleEditorPreviewChange}
          />
        )}

        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-text">Loading sprites...</div>
          </div>
        )}

        {stats && (
          <div className="debug-stats">
            <div>FPS: {stats.fps}</div>
            <div>Frame Time: {stats.frameTime.toFixed(2)}ms</div>
            <div>Sim Time: {stats.simulationTime.toFixed(2)}ms</div>
            <div>Render Time: {stats.renderTime.toFixed(2)}ms</div>
          </div>
        )}
      </div>
    </div>
  );
}
