/**

 * GameCanvas Component - Main game rendering component (player build)

 */



import { type RefObject } from 'react';

import { GameLoopStats } from '../game/engine/GameLoop';

import { useGameCanvas } from '../hooks/useGameCanvas';

import { useOnlineGameCanvas } from '../hooks/useOnlineGameCanvas';

import { PeerConnection } from '../network/webrtc/PeerConnection';

import { GGPOStats } from '../network/ggpo/GGPOSession';

import { StoredKeyBindings } from '../settings/keyBindings';

import { GAME_WIDTH, GAME_HEIGHT } from './AspectRatioViewport';

import { GameState } from '../game/engine/GameState';
import { SyncHealthStatus } from '../network/sync/SyncHealthMonitor';
import { SyncStatusOverlay } from './SyncStatusOverlay';



interface GameCanvasProps {

  showDebug?: boolean;

  onGameStateChange?: (state: GameState) => void;

  keyBindings: StoredKeyBindings;

  peerConnection?: PeerConnection | null;

  localPlayerIndex?: number;

  onSyncStatusChange?: (status: SyncHealthStatus, message: string) => void;

  onSyncFailed?: (reason: string) => void;

  onReturnToMenu?: () => void;

}



export function GameCanvas({

  showDebug = false,

  onGameStateChange,

  keyBindings,

  peerConnection = null,

  localPlayerIndex = 0,

  onSyncStatusChange,

  onSyncFailed,

  onReturnToMenu,

}: GameCanvasProps) {

  if (peerConnection) {

    return (

      <OnlineGameCanvas

        showDebug={showDebug}

        keyBindings={keyBindings}

        onGameStateChange={onGameStateChange}

        peerConnection={peerConnection}

        localPlayerIndex={localPlayerIndex}

        onSyncStatusChange={onSyncStatusChange}

        onSyncFailed={onSyncFailed}

        onReturnToMenu={onReturnToMenu}

      />

    );

  }



  return (

    <LocalGameCanvas

      showDebug={showDebug}

      keyBindings={keyBindings}

      onGameStateChange={onGameStateChange}

    />

  );

}



interface LocalGameCanvasProps {

  showDebug?: boolean;

  onGameStateChange?: (state: GameState) => void;

  keyBindings: StoredKeyBindings;

}



function LocalGameCanvas({

  showDebug = false,

  onGameStateChange,

  keyBindings,

}: LocalGameCanvasProps) {

  const game = useGameCanvas({

    showDebug,

    showHitboxes: showDebug,

    keyBindings,

    onGameStateChange,

    pauseOnStart: false,

  });



  return (

    <GameCanvasShell

      showDebug={showDebug}

      canvasRef={game.canvasRef}

      stats={game.stats}

      ggpoStats={null}

      isLoading={game.isLoading}

      isPaused={game.isPaused}

      onPauseToggle={game.handlePauseToggle}

      onRestart={game.handleRestart}

    />

  );

}



interface OnlineGameCanvasProps {

  showDebug?: boolean;

  onGameStateChange?: (state: GameState) => void;

  keyBindings: StoredKeyBindings;

  peerConnection: PeerConnection;

  localPlayerIndex: number;

  onSyncStatusChange?: (status: SyncHealthStatus, message: string) => void;

  onSyncFailed?: (reason: string) => void;

  onReturnToMenu?: () => void;

}



function OnlineGameCanvas({

  showDebug = false,

  onGameStateChange,

  keyBindings,

  peerConnection,

  localPlayerIndex,

  onSyncStatusChange,

  onSyncFailed,

  onReturnToMenu,

}: OnlineGameCanvasProps) {

  const game = useOnlineGameCanvas({

    peerConnection,

    localPlayerIndex,

    showDebug,

    showHitboxes: showDebug,

    keyBindings,

    onGameStateChange,

    onSyncStatusChange,

    onSyncFailed,

  });



  return (

    <GameCanvasShell

      showDebug={showDebug}

      canvasRef={game.canvasRef}

      stats={game.stats}

      ggpoStats={game.ggpoStats}

      isLoading={game.isLoading}

      isPaused={game.isPaused}

      onPauseToggle={game.handlePauseToggle}

      onRestart={game.handleRestart}

      syncStatus={game.syncStatus}

      syncMessage={game.syncMessage}

      onReturnToMenu={onReturnToMenu}

    />

  );

}



interface GameCanvasShellProps {

  showDebug: boolean;

  canvasRef: RefObject<HTMLCanvasElement | null>;

  stats: GameLoopStats | null;

  ggpoStats: GGPOStats | null;

  isLoading: boolean;

  isPaused: boolean;

  onPauseToggle: () => void;

  onRestart: () => void;

  syncStatus?: SyncHealthStatus;

  syncMessage?: string;

  onReturnToMenu?: () => void;

}



function GameCanvasShell({

  showDebug,

  canvasRef,

  stats,

  ggpoStats,

  isLoading,

  isPaused,

  onPauseToggle,

  onRestart,

  syncStatus,

  syncMessage,

  onReturnToMenu,

}: GameCanvasShellProps) {

  return (

    <div className="game-container">

      <div className="game-stage">

        <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} />



        {isLoading && (

          <div className="loading-overlay">

            <div className="loading-text">Loading sprites...</div>

          </div>

        )}



        {isPaused && (

          <div className="pause-overlay">

            <div className="pause-menu">

              <h2>PAUSED</h2>

              <button onClick={onPauseToggle}>Resume</button>

              <button onClick={onRestart}>Restart</button>

            </div>

          </div>

        )}



        {showDebug && stats && <DebugStats stats={stats} ggpoStats={ggpoStats} />}

        {syncStatus && syncMessage && (
          <SyncStatusOverlay
            status={syncStatus}
            message={syncMessage}
            onReturnToMenu={onReturnToMenu}
          />
        )}

      </div>

    </div>

  );

}



function DebugStats({ stats, ggpoStats }: { stats: GameLoopStats; ggpoStats: GGPOStats | null }) {

  return (

    <div className="debug-stats">

      <div>FPS: {stats.fps}</div>

      <div>Frame Time: {stats.frameTime.toFixed(2)}ms</div>

      <div>Sim Time: {stats.simulationTime.toFixed(2)}ms</div>

      <div>Render Time: {stats.renderTime.toFixed(2)}ms</div>

      {stats.framesSkipped > 0 && (

        <div style={{ color: 'orange' }}>Frames Skipped: {stats.framesSkipped}</div>

      )}

      {ggpoStats && (

        <>

          <div style={{ marginTop: 8, color: '#8cf' }}>GGPO Frame: {ggpoStats.currentFrame}</div>

          <div>Confirmed: {ggpoStats.lastConfirmedFrame}</div>

          <div>Rollbacks: {ggpoStats.rollbackCount}</div>

          <div>Ping: {ggpoStats.ping}ms</div>

          <div>Input Delay: {ggpoStats.inputDelay}</div>

        </>

      )}

    </div>

  );

}


