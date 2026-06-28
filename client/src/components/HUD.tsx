/**
 * HUD Component - In-game heads-up display overlay
 */

import { GameState, GAME_CONFIG, getMatchResult } from '../game/engine/GameState';
import './HUD.css';

interface HUDProps {
  gameState: GameState;
  ping?: number;
  showNetworkStats?: boolean;
  rollbackFrames?: number;
}

export function HUD({ gameState, ping, showNetworkStats, rollbackFrames }: HUDProps) {
  const [p1, p2] = gameState.players;
  const timer = Math.ceil(gameState.roundTimer / 60);
  const matchResult = getMatchResult(gameState);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="player-info p1">
          <div className="player-name">P1</div>
          <div className="health-bar-container">
            <div 
              className="health-bar" 
              style={{ width: `${(p1.health / p1.maxHealth) * 100}%` }}
            />
            <div className="health-bar-bg" />
          </div>
          <div className="round-wins">
            {Array.from({ length: GAME_CONFIG.ROUNDS_TO_WIN }).map((_, i) => (
              <div 
                key={i} 
                className={`round-dot ${i < gameState.roundWins[0] ? 'won' : ''}`} 
              />
            ))}
          </div>
        </div>

        <div className="timer-container">
          <div className="timer">{timer.toString().padStart(2, '0')}</div>
          <div className="round-number">ROUND {gameState.roundNumber}</div>
        </div>

        <div className="player-info p2">
          <div className="player-name">P2</div>
          <div className="health-bar-container">
            <div 
              className="health-bar" 
              style={{ width: `${(p2.health / p2.maxHealth) * 100}%` }}
            />
            <div className="health-bar-bg" />
          </div>
          <div className="round-wins">
            {Array.from({ length: GAME_CONFIG.ROUNDS_TO_WIN }).map((_, i) => (
              <div 
                key={i} 
                className={`round-dot ${i < gameState.roundWins[1] ? 'won' : ''}`} 
              />
            ))}
          </div>
        </div>
      </div>

      {showNetworkStats && (
        <div className="network-stats">
          {ping !== undefined && (
            <div className="stat">
              <span className="label">PING</span>
              <span className={`value ${ping > 100 ? 'warning' : ping > 200 ? 'danger' : ''}`}>
                {ping}ms
              </span>
            </div>
          )}
          {rollbackFrames !== undefined && rollbackFrames > 0 && (
            <div className="stat">
              <span className="label">ROLLBACK</span>
              <span className="value warning">{rollbackFrames}f</span>
            </div>
          )}
        </div>
      )}

      {gameState.isRoundOver && (
        <div className="round-result">
          <div className="result-overlay">
            <div className="result-text">
              {gameState.winner !== null 
                ? `PLAYER ${gameState.winner + 1} WINS!`
                : 'DRAW!'
              }
            </div>
            {matchResult && (
              <div className="match-result">
                {matchResult === 'draw' && 'MATCH DRAW!'}
                {matchResult === 'p1' && 'P1 WINS THE MATCH!'}
                {matchResult === 'p2' && 'P2 WINS THE MATCH!'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
