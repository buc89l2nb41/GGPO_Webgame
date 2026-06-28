import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { Lobby } from './components/Lobby';
import { ControlsSettings, ControlsSummary } from './components/ControlsSettings';
import { AspectRatioViewport } from './components/AspectRatioViewport';
import { PeerConnection } from './network/webrtc/PeerConnection';
import { SyncHealthStatus } from './network/sync/SyncHealthMonitor';
import { loadKeyBindings } from './settings/keyBindings';
import './App.css';

type AppScreen = 'title' | 'local' | 'lobby' | 'online' | 'controls';

function App() {
  const [screen, setScreen] = useState<AppScreen>('title');
  const [showDebug, setShowDebug] = useState(false);
  const [onlineConnection, setOnlineConnection] = useState<PeerConnection | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncHealthStatus>('synced');
  const [syncMessage, setSyncMessage] = useState('Synced');
  const keyBindings = useMemo(() => loadKeyBindings(), [screen]);

  const handleLocalPlay = useCallback(() => {
    setScreen('local');
  }, []);

  const handleOnlinePlay = useCallback(() => {
    setScreen('lobby');
  }, []);

  const handleGameStart = useCallback((connection: PeerConnection, host: boolean) => {
    setOnlineConnection(connection);
    setIsHost(host);
    setSyncStatus('synced');
    setSyncMessage('Synced');
    setScreen('online');
  }, []);

  const clearOnlineSession = useCallback(() => {
    if (onlineConnection) {
      onlineConnection.setLifecycleCallbacks(null);
      onlineConnection.disconnect();
      setOnlineConnection(null);
    }
    setSyncStatus('synced');
    setSyncMessage('Synced');
  }, [onlineConnection]);

  const handleBack = useCallback(() => {
    clearOnlineSession();
    setScreen('title');
  }, [clearOnlineSession]);

  const handleSyncStatusChange = useCallback((status: SyncHealthStatus, message: string) => {
    setSyncStatus(status);
    setSyncMessage(message);
  }, []);

  const handleSyncFailed = useCallback((reason: string) => {
    setSyncStatus('failed');
    setSyncMessage(reason);
    onlineConnection?.disconnect();
  }, [onlineConnection]);

  const handleControls = useCallback(() => {
    setScreen('controls');
  }, []);

  useEffect(() => {
    if (!onlineConnection || screen !== 'online') return;

    onlineConnection.setLifecycleCallbacks({
      onDisconnected: () => {
        setSyncStatus('failed');
        setSyncMessage('Connection lost');
      },
      onError: (error) => {
        setSyncStatus('failed');
        setSyncMessage(error.message);
      },
    });

    return () => {
      onlineConnection.setLifecycleCallbacks(null);
    };
  }, [onlineConnection, screen]);

  const connectionBadgeClass =
    syncStatus === 'failed'
      ? 'disconnected'
      : syncStatus === 'recovering'
        ? 'recovering'
        : syncStatus === 'unstable'
          ? 'unstable'
          : onlineConnection?.getState() === 'connected'
            ? 'connected'
            : 'disconnected';

  const connectionBadgeLabel =
    syncStatus === 'failed'
      ? 'Disconnected'
      : syncStatus === 'recovering'
        ? 'Resyncing'
        : syncStatus === 'unstable'
          ? 'Unstable'
          : onlineConnection?.getState() === 'connected'
            ? 'Connected'
            : 'Connecting';

  let content: ReactNode;

  if (screen === 'controls') {
    content = <ControlsSettings onBack={() => setScreen('title')} />;
  } else if (screen === 'title') {
    content = (
      <div className="title-screen">
        <div className="title-content">
          <h1 className="game-title">GGPO FIGHTER</h1>
          <p className="subtitle">Rollback Netcode Fighting Game</p>
          
          <div className="menu-buttons">
            <button className="menu-btn primary" onClick={handleLocalPlay}>
              LOCAL PLAY
            </button>
            <button className="menu-btn" onClick={handleOnlinePlay}>
              ONLINE PLAY
            </button>
            <button className="menu-btn" onClick={handleControls}>
              CONTROLS
            </button>
            <button className="menu-btn secondary" onClick={() => setShowDebug(!showDebug)}>
              DEBUG: {showDebug ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="controls-preview">
            <ControlsSummary player={1} bindings={keyBindings.player1} />
            <ControlsSummary player={2} bindings={keyBindings.player2} />
          </div>

          <p className="hint">Press ESC to pause | F5 to restart</p>
          
          <div className="version-info">
            <span className="feature-badge">Rollback Netcode</span>
            <span className="feature-badge">WebRTC P2P</span>
            <span className="feature-badge">60 FPS</span>
          </div>
        </div>
      </div>
    );
  } else if (screen === 'lobby') {
    content = (
      <Lobby 
        onGameStart={handleGameStart}
        onBack={handleBack}
      />
    );
  } else if (screen === 'local' || screen === 'online') {
    content = (
      <div className="app">
        <GameCanvas 
          showDebug={showDebug}
          keyBindings={keyBindings}
          peerConnection={screen === 'online' ? onlineConnection : null}
          localPlayerIndex={isHost ? 0 : 1}
          onSyncStatusChange={screen === 'online' ? handleSyncStatusChange : undefined}
          onSyncFailed={screen === 'online' ? handleSyncFailed : undefined}
          onReturnToMenu={screen === 'online' ? handleBack : undefined}
        />
        <button 
          className="back-btn"
          onClick={handleBack}
        >
          ← Back to Menu
        </button>
        {screen === 'online' && onlineConnection && (
          <div className="connection-info">
            <span className={`connection-status ${connectionBadgeClass}`}>
              {connectionBadgeLabel}
            </span>
            <span className="player-role">{isHost ? 'Host' : 'Guest'}</span>
            {syncStatus !== 'synced' && syncStatus !== 'failed' && (
              <span className="sync-detail">{syncMessage}</span>
            )}
          </div>
        )}
      </div>
    );
  } else {
    content = null;
  }

  return (
    <AspectRatioViewport layout={screen === 'local' || screen === 'online' ? 'game' : 'menu'}>
      {content}
    </AspectRatioViewport>
  );
}

export default App;
