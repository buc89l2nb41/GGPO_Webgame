import { CharacterState, GAME_CONFIG, GameState, cloneGameState } from '../engine/GameState';
import { BASE_CHARACTER } from '../data/characters/BaseCharacter';

export interface HitboxEditorPreview {
  playerIndex: 0 | 1;
  state: CharacterState;
  frame: number;
  facingRight: boolean;
}

const AIRBORNE_STATES = new Set<CharacterState>([
  CharacterState.JUMP_START,
  CharacterState.JUMP_UP,
  CharacterState.JUMP_FORWARD,
  CharacterState.JUMP_BACKWARD,
  CharacterState.JUMP_FALL,
  CharacterState.JUMP_LIGHT_PUNCH,
  CharacterState.JUMP_HEAVY_PUNCH,
  CharacterState.JUMP_LIGHT_KICK,
  CharacterState.JUMP_HEAVY_KICK,
  CharacterState.LANDING,
]);

export type FramePhase = 'startup' | 'active' | 'recovery' | 'loop';

export interface StateFrameInfo {
  maxFrame: number;
  startup: number;
  active: number;
  recovery: number;
  totalFrames: number;
  hasFrameData: boolean;
  isAirborne: boolean;
}

export function getStateFrameInfo(state: CharacterState): StateFrameInfo {
  const stateData = BASE_CHARACTER.states[state];
  const frameData = stateData?.frameData;
  const isAirborne = AIRBORNE_STATES.has(state);

  if (frameData) {
    const totalFrames = Math.max(1, frameData.startup + frameData.active + frameData.recovery);
    return {
      maxFrame: totalFrames - 1,
      startup: frameData.startup,
      active: frameData.active,
      recovery: frameData.recovery,
      totalFrames,
      hasFrameData: true,
      isAirborne,
    };
  }

  const duration = stateData?.duration ?? 0;
  const totalFrames = duration > 0 ? duration : 30;
  return {
    maxFrame: totalFrames - 1,
    startup: 0,
    active: 0,
    recovery: totalFrames,
    totalFrames,
    hasFrameData: false,
    isAirborne,
  };
}

export function getDefaultPreviewFrame(
  state: CharacterState,
  boxKind: 'hurtbox' | 'hitbox',
): number {
  const info = getStateFrameInfo(state);
  if (boxKind === 'hitbox' && info.hasFrameData && info.active > 0) {
    return info.startup;
  }
  if (info.hasFrameData) {
    return Math.min(info.startup, info.maxFrame);
  }
  return 0;
}

export function getFramePhase(state: CharacterState, frame: number): FramePhase {
  const info = getStateFrameInfo(state);
  if (!info.hasFrameData) return 'loop';
  if (frame < info.startup) return 'startup';
  if (frame < info.startup + info.active) return 'active';
  return 'recovery';
}

export function isHitboxActiveFrame(state: CharacterState, frame: number): boolean {
  const info = getStateFrameInfo(state);
  if (!info.hasFrameData || info.active <= 0) return false;
  return frame >= info.startup && frame < info.startup + info.active;
}

function getPreviewJumpVelocity(state: CharacterState): number {
  switch (state) {
    case CharacterState.JUMP_START:
    case CharacterState.JUMP_UP:
    case CharacterState.JUMP_FORWARD:
    case CharacterState.JUMP_BACKWARD:
      return GAME_CONFIG.JUMP_FORCE_FULL;
    case CharacterState.JUMP_FALL:
    case CharacterState.LANDING:
      return GAME_CONFIG.GRAVITY_FALL * 8;
    default:
      return -GAME_CONFIG.GRAVITY_FALL * 4;
  }
}

export function applyEditorPreview(
  state: GameState,
  preview: HitboxEditorPreview,
): GameState {
  const result = cloneGameState(state);
  result.roundIntroTimer =
    GAME_CONFIG.ROUND_ANNOUNCE_FRAMES + GAME_CONFIG.ROUND_FIGHT_FRAMES;
  result.isPaused = true;

  const player = result.players[preview.playerIndex];
  player.state = preview.state;
  player.stateFrame = preview.frame;
  player.facingRight = preview.facingRight;
  player.velocity.x = 0;
  player.idleFidgetActive = false;

  if (AIRBORNE_STATES.has(preview.state)) {
    player.isGrounded = false;
    player.position.y = GAME_CONFIG.GROUND_Y - 14000;
    player.velocity.y = getPreviewJumpVelocity(preview.state);
  } else {
    player.isGrounded = true;
    player.position.y = GAME_CONFIG.GROUND_Y;
    player.velocity.y = 0;
  }

  const otherIndex = preview.playerIndex === 0 ? 1 : 0;
  const other = result.players[otherIndex as 0 | 1];
  other.state = CharacterState.IDLE;
  other.stateFrame = 0;
  other.facingRight = preview.playerIndex === 0;
  other.isGrounded = true;
  other.position.y = GAME_CONFIG.GROUND_Y;
  other.velocity.x = 0;
  other.velocity.y = 0;

  return result;
}
