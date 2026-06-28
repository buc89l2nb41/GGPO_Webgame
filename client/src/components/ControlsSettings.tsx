import { useCallback, useEffect, useState } from 'react';
import { KeyBindings } from '../game/systems/InputSystem';
import {
  ACTION_LABELS,
  assignBindingKey,
  BINDING_ACTIONS,
  BindingAction,
  formatKeyCode,
  isRemappableKey,
  loadKeyBindings,
  resetAllBindings,
  resetPlayerBindings,
  saveKeyBindings,
  StoredKeyBindings,
} from '../settings/keyBindings';
import './ControlsSettings.css';

interface ControlsSettingsProps {
  onBack: () => void;
}

type ListeningTarget = {
  player: 1 | 2;
  action: BindingAction;
} | null;

function PlayerBindingsPanel({
  player,
  bindings,
  listening,
  onStartListening,
}: {
  player: 1 | 2;
  bindings: KeyBindings;
  listening: ListeningTarget;
  onStartListening: (action: BindingAction) => void;
}) {
  const isPlayerListening = listening?.player === player;

  return (
    <section className={`bindings-panel player-${player}`}>
      <h3>Player {player}</h3>
      <div className="bindings-grid">
        {BINDING_ACTIONS.map((action) => {
          const isListening = isPlayerListening && listening?.action === action;
          const keyCode = bindings[action][0] ?? '';

          return (
            <button
              key={action}
              type="button"
              className={`binding-row ${isListening ? 'listening' : ''}`}
              onClick={() => onStartListening(action)}
            >
              <span className="binding-label">{ACTION_LABELS[action]}</span>
              <span className="binding-key">
                {isListening ? 'Press a key...' : formatKeyCode(keyCode)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ControlsSettings({ onBack }: ControlsSettingsProps) {
  const [bindings, setBindings] = useState<StoredKeyBindings>(() => loadKeyBindings());
  const [listening, setListening] = useState<ListeningTarget>(null);

  const updateBindings = useCallback((next: StoredKeyBindings) => {
    setBindings(next);
    saveKeyBindings(next);
  }, []);

  useEffect(() => {
    if (!listening) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        setListening(null);
        return;
      }

      if (!isRemappableKey(event.code)) {
        return;
      }

      const playerKey = listening.player === 1 ? 'player1' : 'player2';
      const nextPlayerBindings = assignBindingKey(
        bindings[playerKey],
        listening.action,
        event.code
      );

      updateBindings({
        ...bindings,
        [playerKey]: nextPlayerBindings,
      });
      setListening(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [bindings, listening, updateBindings]);

  const handleResetPlayer = (player: 1 | 2) => {
    setListening(null);
    updateBindings(resetPlayerBindings(player));
  };

  const handleResetAll = () => {
    setListening(null);
    updateBindings(resetAllBindings());
  };

  return (
    <div className="controls-settings-screen">
      <div className="controls-settings-content">
        <h1>CONTROLS</h1>
        <p className="controls-settings-subtitle">
          Click an action, then press the key you want to use. Press Esc to cancel.
        </p>

        <div className="bindings-panels">
          <PlayerBindingsPanel
            player={1}
            bindings={bindings.player1}
            listening={listening}
            onStartListening={(action) => setListening({ player: 1, action })}
          />
          <PlayerBindingsPanel
            player={2}
            bindings={bindings.player2}
            listening={listening}
            onStartListening={(action) => setListening({ player: 2, action })}
          />
        </div>

        <div className="controls-settings-actions">
          <button type="button" className="menu-btn secondary" onClick={() => handleResetPlayer(1)}>
            Reset Player 1
          </button>
          <button type="button" className="menu-btn secondary" onClick={() => handleResetPlayer(2)}>
            Reset Player 2
          </button>
          <button type="button" className="menu-btn secondary" onClick={handleResetAll}>
            Reset All
          </button>
          <button type="button" className="menu-btn primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function ControlsSummary({
  player,
  bindings,
}: {
  player: 1 | 2;
  bindings: KeyBindings;
}) {
  return (
    <div className="control-group">
      <h3>Player {player}</h3>
      <p>
        Move: {formatKeyCode(bindings.up[0])} {formatKeyCode(bindings.down[0])}{' '}
        {formatKeyCode(bindings.left[0])} {formatKeyCode(bindings.right[0])}
      </p>
      <p>
        Attacks: {formatKeyCode(bindings.lightPunch[0])} {formatKeyCode(bindings.heavyPunch[0])}{' '}
        {formatKeyCode(bindings.lightKick[0])} {formatKeyCode(bindings.heavyKick[0])}
      </p>
    </div>
  );
}
