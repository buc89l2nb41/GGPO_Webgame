import { useMemo } from 'react';
import { AspectRatioViewport } from '../components/AspectRatioViewport';
import { loadKeyBindings } from '../settings/keyBindings';
import { HitboxEditorGameCanvas } from './HitboxEditorGameCanvas';
import '../App.css';

export function HitboxEditorApp() {
  const keyBindings = useMemo(() => loadKeyBindings(), []);

  return (
    <AspectRatioViewport layout="game">
      <div className="app hitbox-editor-app">
        <HitboxEditorGameCanvas keyBindings={keyBindings} />
        <div className="hitbox-editor-app-banner">
          <span>DEV TOOL — Hitbox Editor</span>
          <a href="/">← Back to Game</a>
        </div>
      </div>
    </AspectRatioViewport>
  );
}
