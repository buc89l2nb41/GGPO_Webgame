import './SyncStatusOverlay.css';
import { SyncHealthStatus } from '../network/sync/SyncHealthMonitor';

interface SyncStatusOverlayProps {
  status: SyncHealthStatus;
  message: string;
  onReturnToMenu?: () => void;
}

export function SyncStatusOverlay({
  status,
  message,
  onReturnToMenu,
}: SyncStatusOverlayProps) {
  if (status === 'synced') return null;

  if (status === 'failed') {
    return (
      <div className="sync-overlay sync-overlay-failed">
        <div className="sync-overlay-panel">
          <h2>Connection Ended</h2>
          <p>{message}</p>
          <p className="sync-overlay-hint">Sync could not be restored. The match was stopped.</p>
          {onReturnToMenu && (
            <button type="button" className="sync-overlay-btn" onClick={onReturnToMenu}>
              Return to Menu
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`sync-banner sync-banner-${status}`}>
      <span className="sync-banner-dot" />
      <span className="sync-banner-text">
        {status === 'recovering' ? 'Resyncing' : 'Sync Warning'}: {message}
      </span>
    </div>
  );
}
