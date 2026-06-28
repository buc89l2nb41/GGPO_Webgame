import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { initHitboxSavedData } from '../game/editor/hitboxPersistence';
import { HitboxEditorApp } from './HitboxEditorApp';

initHitboxSavedData();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HitboxEditorApp />
  </StrictMode>,
);
