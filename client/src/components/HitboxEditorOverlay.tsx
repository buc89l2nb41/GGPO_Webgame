import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterState, GameState } from '../game/engine/GameState';
import { GAME_WIDTH, GAME_HEIGHT } from './AspectRatioViewport';
import {
  BoxData,
  getHitboxEditStates,
  getHurtboxEditStates,
  boxDataToWorldBox,
  exportOverrideSnippet,
  getResolvedHitboxData,
  getResolvedHurtboxData,
  getResolvedPushboxData,
  getPushboxEditStates,
  setHitboxOverride,
  setHurtboxOverride,
  setPushboxOverride,
  worldBoxToBoxData,
} from '../game/editor/hitboxOverrides';
import {
  HitboxEditorPreview,
  getDefaultPreviewFrame,
  getFramePhase,
  getStateFrameInfo,
  isHitboxActiveFrame,
} from '../game/editor/hitboxEditorPreview';
import {
  downloadHitboxDataFile,
  saveHitboxDataToProject,
} from '../game/editor/hitboxPersistence';
import './HitboxEditorOverlay.css';

type BoxKind = 'hurtbox' | 'hitbox' | 'pushbox';
type DragMode = 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';

interface HitboxEditorOverlayProps {
  enabled: boolean;
  gameState: GameState;
  cameraX: number;
  scaleX: number;
  scaleY: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onPreviewChange: (preview: HitboxEditorPreview) => void;
}

function gameToScreen(
  gameX: number,
  gameY: number,
  cameraX: number,
  scaleX: number,
  scaleY: number,
): { x: number; y: number } {
  return {
    x: (gameX - cameraX) * scaleX,
    y: gameY * scaleY,
  };
}

function screenToGame(
  screenX: number,
  screenY: number,
  cameraX: number,
  scaleX: number,
  scaleY: number,
): { x: number; y: number } {
  return {
    x: screenX / scaleX + cameraX,
    y: screenY / scaleY,
  };
}

const PHASE_LABELS: Record<string, string> = {
  startup: 'Startup (준비)',
  active: 'Active (판정)',
  recovery: 'Recovery (후딜)',
  loop: 'Loop',
};

export function HitboxEditorOverlay({
  enabled,
  gameState,
  cameraX,
  scaleX,
  scaleY,
  canvasRef,
  onPreviewChange,
}: HitboxEditorOverlayProps) {
  const [playerIndex, setPlayerIndex] = useState<0 | 1>(0);
  const [boxKind, setBoxKind] = useState<BoxKind>('hitbox');
  const [selectedState, setSelectedState] = useState<CharacterState>(
    CharacterState.STAND_LIGHT_PUNCH,
  );
  const [previewFrame, setPreviewFrame] = useState(0);
  const [facingRight, setFacingRight] = useState(true);
  const [boxData, setBoxData] = useState<BoxData | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const dragRef = useRef<{
    mode: DragMode;
    startMouse: { x: number; y: number };
    startBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const stateOptions = boxKind === 'hurtbox'
    ? getHurtboxEditStates()
    : boxKind === 'hitbox'
      ? getHitboxEditStates()
      : getPushboxEditStates();
  const frameInfo = useMemo(() => getStateFrameInfo(selectedState), [selectedState]);
  const framePhase = getFramePhase(selectedState, previewFrame);
  const hitboxActive = isHitboxActiveFrame(selectedState, previewFrame);

  const player = gameState.players[playerIndex];

  useEffect(() => {
    if (!enabled) return;
    const hurtboxStates = getHurtboxEditStates();
    const hitboxStates = getHitboxEditStates();
    const pushboxStates = getPushboxEditStates();
    if (boxKind === 'hurtbox' && !hurtboxStates.includes(selectedState)) {
      setSelectedState(hurtboxStates[0] ?? CharacterState.IDLE);
    }
    if (boxKind === 'hitbox' && !hitboxStates.includes(selectedState)) {
      setSelectedState(hitboxStates[0] ?? CharacterState.STAND_LIGHT_PUNCH);
    }
    if (boxKind === 'pushbox' && !pushboxStates.includes(selectedState)) {
      setSelectedState(pushboxStates[0] ?? CharacterState.IDLE);
    }
  }, [boxKind, enabled, selectedState]);

  useEffect(() => {
    if (!enabled) return;
    setPreviewFrame(getDefaultPreviewFrame(selectedState, boxKind === 'pushbox' ? 'hurtbox' : boxKind));
  }, [boxKind, enabled, selectedState]);

  useEffect(() => {
    if (!enabled) return;
    onPreviewChange({
      playerIndex,
      state: selectedState,
      frame: previewFrame,
      facingRight,
    });
  }, [enabled, facingRight, onPreviewChange, playerIndex, previewFrame, selectedState]);

  useEffect(() => {
    if (!enabled) return;
    const data = boxKind === 'hurtbox'
      ? getResolvedHurtboxData(selectedState)
      : boxKind === 'hitbox'
        ? getResolvedHitboxData(selectedState)
        : getResolvedPushboxData(selectedState);
    setBoxData(data);
  }, [enabled, boxKind, selectedState, playerIndex]);

  const worldBox = useMemo(() => {
    if (!boxData) return null;
    return boxDataToWorldBox(
      boxData,
      player.position,
      facingRight,
      boxKind === 'hitbox',
    );
  }, [boxData, boxKind, facingRight, player.position]);

  const screenBox = useMemo(() => {
    if (!worldBox) return null;
    const topLeft = gameToScreen(worldBox.x, worldBox.y, cameraX, scaleX, scaleY);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: worldBox.width * scaleX,
      height: worldBox.height * scaleY,
    };
  }, [cameraX, scaleX, scaleY, worldBox]);

  const applyBoxData = useCallback((data: BoxData) => {
    setBoxData(data);
    if (boxKind === 'hurtbox') {
      setHurtboxOverride(selectedState, data);
    } else if (boxKind === 'hitbox') {
      setHitboxOverride(selectedState, data);
    } else {
      setPushboxOverride(selectedState, data);
    }
  }, [boxKind, selectedState]);

  const getMouseOnCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }, [canvasRef]);

  const commitWorldBox = useCallback((box: { x: number; y: number; width: number; height: number }) => {
    const data = worldBoxToBoxData(
      box,
      player.position,
      facingRight,
      boxKind === 'hitbox',
    );
    applyBoxData(data);
  }, [applyBoxData, boxKind, facingRight, player.position]);

  const onPointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    if (!worldBox || !screenBox) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mouse = getMouseOnCanvas(e.clientX, e.clientY);
    if (!mouse) return;
    dragRef.current = { mode, startMouse: mouse, startBox: { ...worldBox } };
  }, [getMouseOnCanvas, screenBox, worldBox]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const mouse = getMouseOnCanvas(e.clientX, e.clientY);
    if (!mouse) return;

    const startGame = screenToGame(drag.startMouse.x, drag.startMouse.y, cameraX, scaleX, scaleY);
    const currentGame = screenToGame(mouse.x, mouse.y, cameraX, scaleX, scaleY);
    const dx = currentGame.x - startGame.x;
    const dy = currentGame.y - startGame.y;
    const box = { ...drag.startBox };

    if (drag.mode === 'move') {
      box.x += dx;
      box.y += dy;
    } else {
      if (drag.mode.includes('e')) box.width = Math.max(100, drag.startBox.width + dx);
      if (drag.mode.includes('w')) {
        box.width = Math.max(100, drag.startBox.width - dx);
        box.x = drag.startBox.x + dx;
      }
      if (drag.mode.includes('s')) box.height = Math.max(100, drag.startBox.height + dy);
      if (drag.mode.includes('n')) {
        box.height = Math.max(100, drag.startBox.height - dy);
        box.y = drag.startBox.y + dy;
      }
    }

    commitWorldBox(box);
  }, [cameraX, commitWorldBox, getMouseOnCanvas, scaleX, scaleY]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const updateField = (field: keyof BoxData | 'offsetX' | 'offsetY', value: number) => {
    if (!boxData) return;
    if (field === 'offsetX') {
      applyBoxData({ ...boxData, offset: { ...boxData.offset, x: value } });
    } else if (field === 'offsetY') {
      applyBoxData({ ...boxData, offset: { ...boxData.offset, y: value } });
    } else {
      applyBoxData({ ...boxData, [field]: value });
    }
  };

  const jumpToPhase = (phase: 'startup' | 'active' | 'recovery') => {
    if (!frameInfo.hasFrameData) return;
    if (phase === 'startup') {
      setPreviewFrame(Math.max(0, frameInfo.startup - 1));
    } else if (phase === 'active') {
      setPreviewFrame(frameInfo.startup);
    } else {
      setPreviewFrame(frameInfo.startup + frameInfo.active);
    }
  };

  const copySnippet = async () => {
    const snippet = exportOverrideSnippet(selectedState, boxKind);
    await navigator.clipboard.writeText(snippet);
    setCopyStatus('Copied!');
    setTimeout(() => setCopyStatus(''), 1500);
  };

  const saveToProject = async () => {
    const result = await saveHitboxDataToProject();
    setSaveStatus(result.message);
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const downloadJson = () => {
    downloadHitboxDataFile();
    setSaveStatus('Downloaded hitboxSavedData.json');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  if (!enabled || !screenBox || !boxData) return null;

  return (
    <div className="hitbox-editor">
      <div
        className="hitbox-editor-canvas-layer"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className={`hitbox-editor-box ${boxKind}`}
          style={{
            left: `${(screenBox.x / GAME_WIDTH) * 100}%`,
            top: `${(screenBox.y / GAME_HEIGHT) * 100}%`,
            width: `${(screenBox.width / GAME_WIDTH) * 100}%`,
            height: `${(screenBox.height / GAME_HEIGHT) * 100}%`,
          }}
          onPointerDown={(e) => onPointerDown(e, 'move')}
        >
          <span className="hitbox-editor-box-label">{selectedState}</span>
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <div
              key={corner}
              className={`hitbox-editor-handle hitbox-editor-handle-${corner}`}
              onPointerDown={(e) => onPointerDown(e, `resize-${corner}` as DragMode)}
            />
          ))}
        </div>
      </div>

      <div className="hitbox-editor-panel">
        <h3>Hitbox Editor</h3>
        <p className="hitbox-editor-hint">
          캐릭터가 선택한 모션 포즈로 표시됩니다. Save to Project로 JSON 파일에 저장됩니다.
        </p>

        <label>
          Player
          <select
            value={playerIndex}
            onChange={(e) => {
              setPlayerIndex(Number(e.target.value) as 0 | 1);
              setFacingRight(Number(e.target.value) === 0);
            }}
          >
            <option value={0}>P1</option>
            <option value={1}>P2</option>
          </select>
        </label>

        <label>
          Facing
          <select
            value={facingRight ? 'right' : 'left'}
            onChange={(e) => setFacingRight(e.target.value === 'right')}
          >
            <option value="right">Right →</option>
            <option value="left">Left ←</option>
          </select>
        </label>

        <label>
          Type
          <select value={boxKind} onChange={(e) => setBoxKind(e.target.value as BoxKind)}>
            <option value="hurtbox">Hurtbox (blue)</option>
            <option value="hitbox">Hitbox (red)</option>
            <option value="pushbox">Pushbox (green)</option>
          </select>
        </label>

        <label>
          State
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value as CharacterState)}
          >
            {stateOptions.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </label>

        {boxKind !== 'pushbox' && (
        <div className="hitbox-editor-frame-control">
          <label>
            Frame {previewFrame} / {frameInfo.maxFrame}
            <input
              type="range"
              min={0}
              max={frameInfo.maxFrame}
              value={previewFrame}
              onChange={(e) => setPreviewFrame(Number(e.target.value))}
            />
          </label>
          <div className={`hitbox-editor-phase hitbox-editor-phase-${framePhase}`}>
            {PHASE_LABELS[framePhase]}
            {boxKind === 'hitbox' && (
              <span className={hitboxActive ? 'hitbox-active' : 'hitbox-inactive'}>
                {hitboxActive ? ' · 판정 ON' : ' · 판정 OFF'}
              </span>
            )}
          </div>
          {frameInfo.hasFrameData && (
            <div className="hitbox-editor-phase-buttons">
              <button type="button" onClick={() => jumpToPhase('startup')}>Startup</button>
              <button type="button" onClick={() => jumpToPhase('active')}>Active</button>
              <button type="button" onClick={() => jumpToPhase('recovery')}>Recovery</button>
            </div>
          )}
        </div>
        )}

        <div className="hitbox-editor-fields">
          <label>offset.x<input type="number" value={boxData.offset.x} onChange={(e) => updateField('offsetX', Number(e.target.value))} /></label>
          <label>offset.y<input type="number" value={boxData.offset.y} onChange={(e) => updateField('offsetY', Number(e.target.value))} /></label>
          <label>width<input type="number" value={boxData.width} onChange={(e) => updateField('width', Number(e.target.value))} /></label>
          <label>height<input type="number" value={boxData.height} onChange={(e) => updateField('height', Number(e.target.value))} /></label>
        </div>

        <div className="hitbox-editor-save-row">
          <button type="button" className="hitbox-editor-save" onClick={saveToProject}>
            Save to Project
          </button>
          <button type="button" className="hitbox-editor-download" onClick={downloadJson}>
            Download JSON
          </button>
        </div>
        {saveStatus && <span className="hitbox-editor-save-status">{saveStatus}</span>}

        <button type="button" className="hitbox-editor-copy" onClick={copySnippet}>
          Copy Snippet
        </button>
        {copyStatus && <span className="hitbox-editor-copied">{copyStatus}</span>}

        <pre className="hitbox-editor-preview">{exportOverrideSnippet(selectedState, boxKind)}</pre>
      </div>
    </div>
  );
}
